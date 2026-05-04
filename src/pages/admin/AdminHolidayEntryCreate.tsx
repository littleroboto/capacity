import { useCallback, useEffect, useState } from 'react';
import { createHolidayEntryApi, fetchFragments } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

function calendarTypeLabel(cal: Record<string, unknown>): string {
  const t = String(cal.calendar_type ?? cal.calendarType ?? '').replace(/_/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Calendar';
}

function calendarOptionLabel(cal: Record<string, unknown>): string {
  const type = calendarTypeLabel(cal);
  const status = String(cal.status ?? 'unknown');
  return `${type} · ${status}`;
}

function parseYmd(ymd: string): Date | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive range of calendar days as YYYY-MM-DD. */
function eachYmdInclusive(startYmd: string, endYmd: string): string[] {
  const a = parseYmd(startYmd);
  const b = parseYmd(endYmd);
  if (!a || !b || b < a) return [];
  const out: string[] = [];
  const d = new Date(a);
  while (d <= b) {
    out.push(formatYmd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function isDuplicateHolidayError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('already') || m.includes('409') || m.includes('23505');
}

type Props = {
  marketId: string;
  /** Called after holiday days are added successfully so parent can refresh calendar fragments. */
  onEntriesAdded?: () => void;
};

export function AdminHolidayEntryCreate({ marketId, onEntriesAdded }: Props) {
  const [calendars, setCalendars] = useState<Record<string, unknown>[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  useEffect(() => {
    if (!marketId) {
      setCalendars([]);
      return;
    }
    let cancelled = false;
    setCalLoading(true);
    setCalError(null);
    fetchFragments('holiday_calendars', marketId)
      .then((rows) => {
        if (!cancelled) setCalendars(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setCalendars([]);
          setCalError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  const [calendarId, setCalendarId] = useState('');
  useEffect(() => {
    if (calendars.length === 0) {
      setCalendarId('');
      return;
    }
    const activeFirst = [...calendars].sort((a, b) => {
      const sa = String(a.status) === 'active' ? 0 : 1;
      const sb = String(b.status) === 'active' ? 0 : 1;
      return sa - sb || String(a.id).localeCompare(String(b.id));
    });
    const first = activeFirst[0];
    const id = first ? String(first.id) : '';
    setCalendarId((prev) => {
      if (prev && calendars.some((c) => String(c.id) === prev)) return prev;
      return id;
    });
  }, [calendars]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [eventName, setEventName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const resetMessages = useCallback(() => {
    setFormError(null);
    setFormSuccess(null);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    const calId = calendarId.trim();
    if (!marketId.trim()) {
      setFormError('Missing market.');
      return;
    }
    if (!calId) {
      setFormError('No holiday calendar is available for this market yet. Add calendars via seed, import, or YAML.');
      return;
    }
    const start = startDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      setFormError('Start date must be a valid date (YYYY-MM-DD).');
      return;
    }
    const end = endDate.trim() || start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      setFormError('End date must be empty (single day) or a valid date (YYYY-MM-DD).');
      return;
    }
    const days = eachYmdInclusive(start, end);
    if (days.length === 0) {
      setFormError('End date must be on or after the start date.');
      return;
    }
    if (days.length > 366) {
      setFormError('Choose a range of at most 366 days.');
      return;
    }

    const label = eventName.trim() || undefined;
    setSubmitting(true);
    let added = 0;
    const skipped: string[] = [];
    let fatal: string | null = null;

    try {
      for (const holiday_date of days) {
        try {
          await createHolidayEntryApi({
            calendar_id: calId,
            holiday_date,
            label,
          });
          added += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isDuplicateHolidayError(msg)) skipped.push(holiday_date);
          else {
            fatal = msg;
            break;
          }
        }
      }

      if (fatal) {
        setFormError(
          added > 0
            ? `Stopped after ${added} day(s): ${fatal}`
            : fatal
        );
        return;
      }

      if (added === 0 && skipped.length > 0) {
        setFormError(`No new dates added (${skipped.length} already on this calendar).`);
        return;
      }

      const parts = [`Added ${added} day${added === 1 ? '' : 's'} to the calendar.`];
      if (skipped.length > 0) {
        parts.push(`${skipped.length} skipped (already present).`);
      }
      setFormSuccess(parts.join(' '));
      setEndDate('');
      setEventName('');
      onEntriesAdded?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-holiday-create-title"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="admin-holiday-create-title" className="text-lg font-semibold tracking-tight">
            Add holiday dates
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Add public or school holiday days by date range for this market. Pick a calendar below, then use the cards
            further down to edit multipliers, load effects, or remove individual dates.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="holiday-create-calendar">Holiday calendar</Label>
            {calLoading ? (
              <div
                className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
                aria-busy="true"
              >
                Loading calendars…
              </div>
            ) : calendars.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {calError ? (
                  <span className="text-destructive">{calError}</span>
                ) : (
                  <>
                    No holiday calendars for this market yet. Seed or import config (Expert YAML / database), or add
                    calendar rows so you can attach dates here.
                  </>
                )}
              </div>
            ) : (
              <select
                id="holiday-create-calendar"
                value={calendarId}
                onChange={(e) => {
                  resetMessages();
                  setCalendarId(e.target.value);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {calendars.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {calendarOptionLabel(c)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="holiday-create-start">Start date</Label>
            <input
              id="holiday-create-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                resetMessages();
                setStartDate(e.target.value);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="holiday-create-end">End date (optional)</Label>
            <input
              id="holiday-create-end"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => {
                resetMessages();
                setEndDate(e.target.value);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">Leave blank for a single day (start only).</p>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="holiday-create-name">Event name</Label>
            <input
              id="holiday-create-name"
              type="text"
              autoComplete="off"
              placeholder="e.g. Spring bank holiday"
              value={eventName}
              onChange={(e) => {
                resetMessages();
                setEventName(e.target.value);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>

        {formError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        ) : null}
        {formSuccess ? (
          <div className="rounded-md border border-green-600/25 bg-green-500/10 px-3 py-2 text-sm text-green-900 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-100">
            {formSuccess}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={
              submitting || calLoading || calendars.length === 0 || !startDate || !marketId.trim()
            }
          >
            {submitting ? 'Adding…' : 'Add to calendar'}
          </Button>
        </div>
      </form>
    </section>
  );
}
