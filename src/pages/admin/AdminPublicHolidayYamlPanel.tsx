import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { createHolidayEntryApi, deleteHolidayEntryApi } from '@/lib/adminApi';
import {
  datesCoveredByYamlRanges,
  expandIsoInclusiveRange,
} from '@/lib/holidayBlockDatesAndRanges';

export const YAML_PUBLIC_RANGES_KEY = 'yaml_public_ranges' as const;
export const YAML_PUBLIC_DATES_KEY = 'yaml_public_dates' as const;

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

function entryHolidayDate(e: Record<string, unknown>): string {
  return String(e.holiday_date ?? e.holidayDate ?? '').trim();
}

function readRangesFromCalendar(cal: Record<string, unknown>): RangeFormRow[] {
  const extra = cal.extra_settings ?? cal.extraSettings;
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return [];
  const raw = (extra as Record<string, unknown>)[YAML_PUBLIC_RANGES_KEY];
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

function readExplicitDatesText(cal: Record<string, unknown>): string {
  const extra = cal.extra_settings ?? cal.extraSettings;
  const e = extra && typeof extra === 'object' && !Array.isArray(extra) ? (extra as Record<string, unknown>) : {};
  const stored = e[YAML_PUBLIC_DATES_KEY];
  if (Array.isArray(stored) && stored.length > 0) {
    return [...new Set(stored.map((d) => String(d).trim()).filter((d) => ISO_DATE.test(d)))]
      .sort()
      .join('\n');
  }
  const rangeList = e[YAML_PUBLIC_RANGES_KEY];
  const entryDates = calendarEntries(cal)
    .map(entryHolidayDate)
    .filter((d) => ISO_DATE.test(d));
  if (!Array.isArray(rangeList) || rangeList.length === 0) {
    return [...new Set(entryDates)].sort().join('\n');
  }
  const inRange = datesCoveredByYamlRanges(rangeList as unknown[]);
  return [...new Set(entryDates)].filter((d) => !inRange.has(d)).sort().join('\n');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  publicCalendar: Record<string, unknown> | null;
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
  onRefresh: () => Promise<void>;
};

/**
 * Edits `public_holidays.ranges` + standalone `dates` via `extra_settings.yaml_public_ranges` /
 * `yaml_public_dates`, and rewrites `holiday_entries` to the union of expanded ranges + explicit dates.
 */
export function AdminPublicHolidayYamlPanel({
  publicCalendar: cal,
  saving,
  onPersist,
  onRefresh,
}: Props) {
  const [rows, setRows] = useState<RangeFormRow[]>([]);
  const [explicitText, setExplicitText] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const rowHydrateKey = cal ? `${String(cal.id)}:${String(cal.version_number ?? cal.versionNumber ?? '')}` : '';

  useEffect(() => {
    if (!cal) {
      setRows([]);
      setExplicitText('');
      setLocalError(null);
      return;
    }
    const loadedRanges = readRangesFromCalendar(cal);
    setRows(loadedRanges.length > 0 ? loadedRanges : []);
    setExplicitText(readExplicitDatesText(cal));
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

    const nonEmptyRanges = rows.filter((r) => r.label.trim() || r.from.trim() || r.to.trim());
    const validRanges: { label?: string; from: string; to: string }[] = [];
    for (let i = 0; i < nonEmptyRanges.length; i++) {
      const r = nonEmptyRanges[i];
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
      if (expandIsoInclusiveRange(from, to).length === 0) {
        setLocalError(`Range row ${i + 1}: invalid or inverted date range.`);
        return;
      }
      const entry: { label?: string; from: string; to: string } = { from, to };
      if (r.label.trim()) entry.label = r.label.trim();
      validRanges.push(entry);
    }

    const explicitLines = explicitText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const explicitDates: string[] = [];
    for (let i = 0; i < explicitLines.length; i++) {
      const d = explicitLines[i];
      if (!ISO_DATE.test(d)) {
        setLocalError(`Standalone date line ${i + 1}: "${d}" is not YYYY-MM-DD.`);
        return;
      }
      explicitDates.push(d);
    }
    const explicitUnique = [...new Set(explicitDates)].sort();

    const mergedExtra: Record<string, unknown> = { ...prevExtra };
    if (validRanges.length > 0) mergedExtra[YAML_PUBLIC_RANGES_KEY] = validRanges;
    else delete mergedExtra[YAML_PUBLIC_RANGES_KEY];
    if (explicitUnique.length > 0) mergedExtra[YAML_PUBLIC_DATES_KEY] = explicitUnique;
    else delete mergedExtra[YAML_PUBLIC_DATES_KEY];

    const calId = String(cal.id);
    const entryIds = calendarEntries(cal).map((e) => String(e.id));

    setLocalBusy(true);
    try {
      for (const id of entryIds) {
        await deleteHolidayEntryApi(id);
      }
      await onPersist(cal, { extra_settings: mergedExtra });

      const daySet = new Set<string>();
      for (const r of validRanges) {
        for (const d of expandIsoInclusiveRange(r.from, r.to)) daySet.add(d);
      }
      for (const d of explicitUnique) daySet.add(d);
      const sorted = [...daySet].sort();
      for (const d of sorted) {
        await createHolidayEntryApi({ calendar_id: calId, holiday_date: d });
      }

      await onRefresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  }, [cal, rows, explicitText, onPersist, onRefresh]);

  const busy = localBusy || (cal != null && saving === String(cal.id));

  if (!cal) {
    return (
      <section className="mb-6 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No active public holiday calendar. Import YAML or add a public calendar first.
      </section>
    );
  }

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-public-holiday-yaml-title"
    >
      <div className="mb-4">
        <h2 id="admin-public-holiday-yaml-title" className="text-base font-semibold">
          Public holidays — dates &amp; ranges (YAML parity)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Standalone days map to YAML <span className="font-mono text-xs">public_holidays.dates</span>; labelled windows
          map to <span className="font-mono text-xs">ranges</span>. Saving replaces all public holiday entries with the
          union of expanded ranges + standalone dates. Staffing / trading / auto stay in the calendar card below.
        </p>
      </div>

      {localError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="mb-6 space-y-2">
        <Label htmlFor="pub-explicit-dates">Standalone dates (one YYYY-MM-DD per line)</Label>
        <textarea
          id="pub-explicit-dates"
          value={explicitText}
          onChange={(e) => setExplicitText(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          spellCheck={false}
          disabled={busy}
        />
      </div>

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
                  No ranges — add rows for Easter-style windows, or leave empty if you only use standalone dates.
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
                      placeholder="optional"
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
          {busy ? 'Saving…' : 'Save dates, ranges & sync calendar'}
        </Button>
        <span className="text-xs text-muted-foreground">v{String(cal.version_number ?? '')}</span>
      </div>
    </section>
  );
}
