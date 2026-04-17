import { useCallback, useEffect, useMemo, useState } from 'react';
import { createHolidayEntryApi, deleteHolidayEntryApi } from '@/lib/adminApi';

function fragmentVersion(f: Record<string, unknown>) {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function calendarEntries(cal: Record<string, unknown>): Record<string, unknown>[] {
  const raw = cal.holiday_entries ?? cal.entries;
  if (!Array.isArray(raw)) return [];
  return raw as Record<string, unknown>[];
}

function entryDate(e: Record<string, unknown>) {
  return String(e.holiday_date ?? e.holidayDate ?? '').trim();
}

function entryLabel(e: Record<string, unknown>) {
  const v = e.label;
  return v == null ? '' : String(v);
}

type Props = {
  fragments: Record<string, unknown>[];
  loading: boolean;
  saving: string | null;
  onSave: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => void | Promise<void>;
  onArchive: (fragment: Record<string, unknown>) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
};

export function HolidayCalendarsEditor({
  fragments,
  loading,
  saving,
  onSave,
  onArchive,
  onRefresh,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const visible = useMemo(
    () => (showArchived ? fragments : fragments.filter((f) => String(f.status) !== 'archived')),
    [fragments, showArchived],
  );

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  if (fragments.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No holiday calendars for this market yet. Seed or import config, or add calendars in the database.
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-border"
          />
          Show archived calendars
        </label>
        <div className="py-8 text-center text-muted-foreground">
          No active or draft calendars. Enable &quot;Show archived&quot; to see archived rows.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="rounded border-border"
        />
        Show archived calendars
      </label>

      <p className="text-sm text-muted-foreground">
        Add specific public or school holiday dates for this market.{' '}
        <strong>Staff / trading multipliers</strong> apply on those days; optional{' '}
        <strong>load effects</strong> (JSON) tune school-holiday-style load bumps (same shape as YAML{' '}
        <code className="text-xs">school_holidays.load_effects</code>).
      </p>

      {visible.map((cal) => (
        <HolidayCalendarCard
          key={String(cal.id)}
          cal={cal}
          busy={saving === cal.id}
          onSave={onSave}
          onArchive={onArchive}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

function HolidayCalendarCard({
  cal,
  busy,
  onSave,
  onArchive,
  onRefresh,
}: {
  cal: Record<string, unknown>;
  busy: boolean;
  onSave: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => void | Promise<void>;
  onArchive: (fragment: Record<string, unknown>) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}) {
  const id = String(cal.id);
  const calType = String(cal.calendar_type ?? cal.calendarType ?? '');

  const [staffMult, setStaffMult] = useState(
    String(cal.staffing_multiplier ?? cal.staffingMultiplier ?? '1'),
  );
  const [tradeMult, setTradeMult] = useState(
    String(cal.trading_multiplier ?? cal.tradingMultiplier ?? '1'),
  );
  const [autoImport, setAutoImport] = useState(Boolean(cal.auto_import ?? cal.autoImport));
  const rawEffects = cal.load_effects ?? cal.loadEffects;
  const [loadEffectsJson, setLoadEffectsJson] = useState(() =>
    rawEffects && typeof rawEffects === 'object'
      ? JSON.stringify(rawEffects, null, 2)
      : '{}',
  );

  const [newDate, setNewDate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [entryBusy, setEntryBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setStaffMult(String(cal.staffing_multiplier ?? cal.staffingMultiplier ?? '1'));
    setTradeMult(String(cal.trading_multiplier ?? cal.tradingMultiplier ?? '1'));
    setAutoImport(Boolean(cal.auto_import ?? cal.autoImport));
    const le = cal.load_effects ?? cal.loadEffects;
    setLoadEffectsJson(le && typeof le === 'object' ? JSON.stringify(le, null, 2) : '{}');
  }, [cal]);

  const sortedEntries = useMemo(() => {
    const list = [...calendarEntries(cal)];
    list.sort((a, b) => entryDate(a).localeCompare(entryDate(b)));
    return list;
  }, [cal]);

  const saveCalendar = useCallback(async () => {
    setLocalError(null);
    let loadEffects: Record<string, unknown> | null = null;
    const trimmed = loadEffectsJson.trim();
    if (trimmed && trimmed !== '{}') {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setLocalError('Load effects must be a JSON object (e.g. {"labs": 1.05}).');
          return;
        }
        loadEffects = parsed as Record<string, unknown>;
      } catch {
        setLocalError('Load effects: invalid JSON.');
        return;
      }
    }

    const sn = Number(staffMult);
    const tn = Number(tradeMult);
    await onSave(cal, {
      staffing_multiplier: Number.isFinite(sn) ? sn : 1,
      trading_multiplier: Number.isFinite(tn) ? tn : 1,
      auto_import: autoImport,
      load_effects: loadEffects && Object.keys(loadEffects).length > 0 ? loadEffects : {},
    });
  }, [autoImport, cal, loadEffectsJson, onSave, staffMult, tradeMult]);

  const addEntry = async () => {
    setLocalError(null);
    const d = newDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setLocalError('Use ISO date format YYYY-MM-DD.');
      return;
    }
    setEntryBusy(true);
    try {
      await createHolidayEntryApi({
        calendar_id: id,
        holiday_date: d,
        label: newLabel.trim() || undefined,
      });
      setNewDate('');
      setNewLabel('');
      await onRefresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setEntryBusy(false);
    }
  };

  const removeEntry = async (entryId: string) => {
    if (!window.confirm('Remove this holiday date from the calendar?')) return;
    setEntryBusy(true);
    setLocalError(null);
    try {
      await deleteHolidayEntryApi(entryId);
      await onRefresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setEntryBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold capitalize">
          {calType.replace(/_/g, ' ')} calendar
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            cal.status === 'active'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {String(cal.status)}
        </span>
      </div>

      {localError && (
        <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {localError}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Staffing multiplier</span>
          <input
            type="text"
            inputMode="decimal"
            value={staffMult}
            onChange={(e) => setStaffMult(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Trading multiplier</span>
          <input
            type="text"
            inputMode="decimal"
            value={tradeMult}
            onChange={(e) => setTradeMult(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm pt-6">
          <input
            type="checkbox"
            checked={autoImport}
            onChange={(e) => setAutoImport(e.target.checked)}
            className="rounded border-border"
          />
          Auto-import regional stub dates
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button
            type="button"
            onClick={() => void saveCalendar()}
            disabled={busy}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save calendar'}
          </button>
          {String(cal.status) !== 'archived' && (
            <button
              type="button"
              onClick={() => void onArchive(cal)}
              disabled={busy}
              className="rounded border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      <label className="mb-4 flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Load effects (JSON object, optional)</span>
        <textarea
          value={loadEffectsJson}
          onChange={(e) => setLoadEffectsJson(e.target.value)}
          rows={4}
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          spellCheck={false}
        />
      </label>

      <div className="mb-2 text-sm font-medium">Holiday dates</div>
      <div className="mb-3 overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Label</th>
              <th className="px-3 py-2 text-right font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  No dates yet — add rows below.
                </td>
              </tr>
            ) : (
              sortedEntries.map((e) => (
                <tr key={String(e.id)} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs">{entryDate(e)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{entryLabel(e) || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void removeEntry(String(e.id))}
                      disabled={entryBusy || busy}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">New date (YYYY-MM-DD)</span>
          <input
            type="text"
            placeholder="2026-12-25"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Label (optional)</span>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void addEntry()}
          disabled={entryBusy || busy}
          className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {entryBusy ? 'Adding…' : 'Add date'}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Version v{String(fragmentVersion(cal))} — save the calendar after changing multipliers; dates save immediately.
      </p>
    </div>
  );
}
