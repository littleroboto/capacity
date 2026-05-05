import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { buildDraft, patchFromDraft } from '@/pages/admin/fragmentSectionEditorDraft';
import { BAU_INTENSITY_DAY_KEYS, BAU_WEEKDAY_CODES } from '@/pages/admin/fragmentSectionEditorUtils';

function fragmentVersion(f: Record<string, unknown>): number {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

type WeekCode = (typeof BAU_WEEKDAY_CODES)[number];

type Props = {
  fragments: Record<string, unknown>[];
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
};

/**
 * Primary editor for the singleton `bau_configs` row — matches YAML `bau` (days_in_use, weekly_cycle, market_it_weekly_load).
 */
export function AdminBauConfigPanel({ fragments, saving, onPersist }: Props) {
  const row = useMemo(() => {
    const active = fragments.filter((f) => String(f.status) !== 'archived');
    return active[0] ?? fragments[0] ?? null;
  }, [fragments]);

  const [days, setDays] = useState<WeekCode[]>([]);
  const [weeklyLabs, setWeeklyLabs] = useState('');
  const [weeklyStaff, setWeeklyStaff] = useState('');
  const [weeklySupport, setWeeklySupport] = useState('');
  const [intensity, setIntensity] = useState<Record<string, string>>(() => {
    const z: Record<string, string> = {};
    for (const k of BAU_INTENSITY_DAY_KEYS) z[k] = '';
    return z;
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const rowHydrateKey = row ? `${String(row.id)}:${String(row.version_number ?? row.versionNumber ?? '')}` : '';

  useEffect(() => {
    if (!row) {
      setDays([]);
      setWeeklyLabs('');
      setWeeklyStaff('');
      setWeeklySupport('');
      const empty: Record<string, string> = {};
      for (const k of BAU_INTENSITY_DAY_KEYS) empty[k] = '';
      setIntensity(empty);
      setLocalError(null);
      return;
    }
    const d = buildDraft('bau_configs', row);
    if (d && d.kind === 'bau_configs') {
      setDays((d.days.filter((x) => BAU_WEEKDAY_CODES.includes(x as WeekCode)) as WeekCode[]) ?? []);
      setWeeklyLabs(d.weeklyLabs);
      setWeeklyStaff(d.weeklyStaff);
      setWeeklySupport(d.weeklySupport);
      const next: Record<string, string> = {};
      for (const k of BAU_INTENSITY_DAY_KEYS) next[k] = d.intensity[k] ?? '';
      setIntensity(next);
    }
    setLocalError(null);
  }, [rowHydrateKey]);

  const toggleDay = useCallback((code: WeekCode) => {
    setDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code].sort((a, b) => dayOrder(a, b)),
    );
  }, []);

  const handleIntensity = useCallback((k: string, v: string) => {
    setIntensity((prev) => ({ ...prev, [k]: v }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!row) return;
    if (!Number.isFinite(fragmentVersion(row))) {
      setLocalError('This row has no version number; reload and try again.');
      return;
    }
    setLocalError(null);

    const result = patchFromDraft({
      kind: 'bau_configs',
      days: [...days],
      weeklyLabs,
      weeklyStaff,
      weeklySupport,
      intensity,
    });

    if (!result.ok) {
      setLocalError(result.error);
      return;
    }

    try {
      await onPersist(row, result.patch);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }, [row, days, weeklyLabs, weeklyStaff, weeklySupport, intensity, onPersist]);

  if (!row) {
    return (
      <section className="mb-6 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No BAU configuration row yet. Import market YAML or create a fragment, then refresh.
      </section>
    );
  }

  const rowSaving = saving === String(row.id);

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-bau-config-title"
    >
      <div className="mb-4">
        <h2 id="admin-bau-config-title" className="text-base font-semibold">
          BAU (YAML parity)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Routine workload: <span className="font-mono text-xs">days_in_use</span>,{' '}
          <span className="font-mono text-xs">weekly_cycle</span>,{' '}
          <span className="font-mono text-xs">market_it_weekly_load.weekday_intensity</span> (0–1 per day). Build and
          publish to refresh the artifact.
        </p>
      </div>

      {localError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">days_in_use</p>
          <p className="text-xs text-muted-foreground">YAML uses two-letter codes (mo–su).</p>
          <div className="flex flex-wrap gap-3">
            {BAU_WEEKDAY_CODES.map((code) => (
              <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={days.includes(code)}
                  onChange={() => toggleDay(code)}
                  disabled={rowSaving}
                  className="rounded border-border"
                />
                <span className="font-mono text-xs uppercase">{code}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="bau-labs">weekly_cycle.labs_required</Label>
            <input
              id="bau-labs"
              type="number"
              min={0}
              step={1}
              value={weeklyLabs}
              onChange={(e) => setWeeklyLabs(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={rowSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bau-staff">weekly_cycle.staff_required</Label>
            <input
              id="bau-staff"
              type="number"
              min={0}
              step={1}
              value={weeklyStaff}
              onChange={(e) => setWeeklyStaff(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={rowSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bau-support">weekly_cycle.support_days</Label>
            <input
              id="bau-support"
              type="number"
              min={0}
              step={1}
              value={weeklySupport}
              onChange={(e) => setWeeklySupport(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={rowSaving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">market_it_weekly_load.weekday_intensity</p>
          <p className="text-xs text-muted-foreground">Leave a day empty to omit it from the saved object.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {BAU_INTENSITY_DAY_KEYS.map((k) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`bau-int-${k}`} className="text-xs text-muted-foreground">
                  {k}
                </Label>
                <input
                  id={`bau-int-${k}`}
                  type="text"
                  inputMode="decimal"
                  value={intensity[k] ?? ''}
                  onChange={(e) => handleIntensity(k, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                  placeholder="—"
                  disabled={rowSaving}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={rowSaving}>
            {rowSaving ? 'Saving…' : 'Save BAU'}
          </Button>
          <span className="text-xs text-muted-foreground">v{String(row.version_number ?? '')}</span>
        </div>
      </div>
    </section>
  );
}

const DAY_ORDER: Record<WeekCode, number> = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };

function dayOrder(a: WeekCode, b: WeekCode): number {
  return DAY_ORDER[a] - DAY_ORDER[b];
}
