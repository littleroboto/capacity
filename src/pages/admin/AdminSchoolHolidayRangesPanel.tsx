import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createHolidayEntryApi, deleteHolidayEntryApi } from '@/lib/adminApi';
import { expandIsoInclusiveRange } from '@/lib/holidayBlockDatesAndRanges';

export const YAML_SCHOOL_RANGES_KEY = 'yaml_school_ranges' as const;

type RangeFormRow = { label: string; from: string; to: string };

function fragmentVersion(f: Record<string, unknown>): number {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function calendarEntries(cal: Record<string, unknown>): Record<string, unknown>[] {
  const raw = cal.holiday_entries ?? cal.entries;
  if (!Array.isArray(raw)) return [];
  return raw as Record<string, unknown>[];
}

function readRangesFromCalendar(cal: Record<string, unknown>): RangeFormRow[] {
  const extra = cal.extra_settings ?? cal.extraSettings;
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return [];
  const raw = (extra as Record<string, unknown>)[YAML_SCHOOL_RANGES_KEY];
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      label: r.label != null ? String(r.label) : '',
      from: r.from != null ? String(r.from) : '',
      to: r.to != null ? String(r.to) : '',
    };
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  schoolCalendar: Record<string, unknown> | null;
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
  onRefresh: () => Promise<void>;
};

/**
 * Edits `school_holidays.ranges` via `holiday_calendars.extra_settings.yaml_school_ranges`
 * and re-expands `holiday_entries` to match (engine still uses resolved days).
 */
export function AdminSchoolHolidayRangesPanel({
  schoolCalendar: cal,
  saving,
  onPersist,
  onRefresh,
}: Props) {
  const [rows, setRows] = useState<RangeFormRow[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const rowHydrateKey = cal ? `${String(cal.id)}:${String(cal.version_number ?? cal.versionNumber ?? '')}` : '';

  useEffect(() => {
    if (!cal) {
      setRows([]);
      setLocalError(null);
      return;
    }
    const loaded = readRangesFromCalendar(cal);
    setRows(loaded.length > 0 ? loaded : []);
    setLocalError(null);
  }, [rowHydrateKey]);

  const updateRow = useCallback((index: number, patch: Partial<RangeFormRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { label: '', from: '', to: '' }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!cal) return;
    const v = fragmentVersion(cal);
    if (!Number.isFinite(v)) {
      setLocalError('This calendar has no version number; reload and try again.');
      return;
    }
    setLocalError(null);

    const prevExtra =
      cal.extra_settings && typeof cal.extra_settings === 'object' && !Array.isArray(cal.extra_settings)
        ? { ...(cal.extra_settings as Record<string, unknown>) }
        : {};

    const nonEmpty = rows.filter((r) => r.label.trim() || r.from.trim() || r.to.trim());
    const validRanges: { label?: string; from: string; to: string }[] = [];

    for (let i = 0; i < nonEmpty.length; i++) {
      const r = nonEmpty[i];
      if (!r.from.trim() || !r.to.trim()) {
        setLocalError(`Range row ${i + 1}: from and to are required (YYYY-MM-DD).`);
        return;
      }
      if (!ISO_DATE.test(r.from.trim()) || !ISO_DATE.test(r.to.trim())) {
        setLocalError(`Range row ${i + 1}: use ISO dates YYYY-MM-DD.`);
        return;
      }
      const from = r.from.trim();
      const to = r.to.trim();
      const expanded = expandIsoInclusiveRange(from, to);
      if (expanded.length === 0) {
        setLocalError(`Range row ${i + 1}: invalid or inverted date range.`);
        return;
      }
      const entry: { label?: string; from: string; to: string } = { from, to };
      if (r.label.trim()) entry.label = r.label.trim();
      validRanges.push(entry);
    }

    const calId = String(cal.id);
    const entryIds = calendarEntries(cal).map((e) => String(e.id));

    setLocalBusy(true);
    try {
      if (validRanges.length > 0) {
        for (const id of entryIds) {
          await deleteHolidayEntryApi(id);
        }
        const mergedExtra = { ...prevExtra, [YAML_SCHOOL_RANGES_KEY]: validRanges };
        await onPersist(cal, { extra_settings: mergedExtra });

        const labelByDate = new Map<string, string | undefined>();
        for (const r of validRanges) {
          const days = expandIsoInclusiveRange(r.from, r.to);
          for (let i = 0; i < days.length; i++) {
            const d = days[i];
            if (!labelByDate.has(d)) {
              labelByDate.set(d, i === 0 && r.label ? r.label : undefined);
            }
          }
        }
        const sortedDates = [...labelByDate.keys()].sort();
        for (const d of sortedDates) {
          const label = labelByDate.get(d);
          await createHolidayEntryApi({
            calendar_id: calId,
            holiday_date: d,
            label: label || undefined,
          });
        }
      } else {
        const { [YAML_SCHOOL_RANGES_KEY]: _removed, ...rest } = prevExtra;
        await onPersist(cal, { extra_settings: rest });
      }

      await onRefresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  }, [cal, rows, onPersist, onRefresh]);

  const busy = localBusy || (cal != null && saving === String(cal.id));

  if (!cal) {
    return (
      <section className="mb-6 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No active school holiday calendar. Import YAML or add a school calendar first.
      </section>
    );
  }

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-school-ranges-title"
    >
      <div className="mb-4">
        <h2 id="admin-school-ranges-title" className="text-base font-semibold">
          School holidays — ranges (YAML parity)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edits <span className="font-mono text-xs">school_holidays.ranges</span> (label, from, to). Saving stores ranges in
          calendar <span className="font-mono text-xs">extra_settings</span>, replaces all school holiday dates with the
          expanded days, and assembled YAML prefers <span className="font-mono text-xs">ranges</span> over a flat{' '}
          <span className="font-mono text-xs">dates</span> list. Staffing / trading / load effects stay in the calendar
          card below.
        </p>
      </div>

      {localError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">label</th>
              <th className="px-3 py-2 font-medium">from</th>
              <th className="px-3 py-2 font-medium">to</th>
              <th className="px-3 py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No ranges in storage — add rows and save to author YAML-style ranges and sync holiday dates. Saving with
                  no rows only removes stored range metadata; it does not delete existing calendar dates.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="text"
                      value={r.label}
                      onChange={(e) => updateRow(i, { label: e.target.value })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                      placeholder="e.g. Summer 2025–26"
                      disabled={busy}
                      aria-label={`Range ${i + 1} label`}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="text"
                      value={r.from}
                      onChange={(e) => updateRow(i, { from: e.target.value })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums"
                      placeholder="YYYY-MM-DD"
                      disabled={busy}
                      aria-label={`Range ${i + 1} from`}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="text"
                      value={r.to}
                      onChange={(e) => updateRow(i, { to: e.target.value })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums"
                      placeholder="YYYY-MM-DD"
                      disabled={busy}
                      aria-label={`Range ${i + 1} to`}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeRow(i)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={addRow} disabled={busy}>
          Add range
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={busy}>
          {busy ? 'Saving…' : 'Save ranges & sync dates'}
        </Button>
        <span className="text-xs text-muted-foreground">v{String(cal.version_number ?? '')}</span>
      </div>
    </section>
  );
}
