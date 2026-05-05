import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { STAFF_MONTHLY_KEYS } from '@/pages/admin/AdminResourceConfigPanel';

/** Canonical YAML keys under `trading.weekly_pattern`. */
export const TRADING_WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type WeekdayKey = (typeof TRADING_WEEKDAY_KEYS)[number];
type MonthKey = (typeof STAFF_MONTHLY_KEYS)[number];

function fragmentVersion(f: Record<string, unknown>): number {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function readNumericObject(
  fragment: Record<string, unknown>,
  snake: string,
  camel: string,
  keys: readonly string[],
): Record<string, string> {
  const raw = fragment[snake] ?? fragment[camel];
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = '';
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of keys) {
      const v = o[k];
      if (v != null && v !== '') out[k] = String(v);
    }
  }
  return out;
}

function readSeasonal(fragment: Record<string, unknown>): { peakMonth: string; amplitude: string } {
  const raw = fragment.seasonal;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { peakMonth: '', amplitude: '' };
  }
  const o = raw as Record<string, unknown>;
  const peak = o.peak_month ?? o.peakMonth;
  const amp = o.amplitude;
  return {
    peakMonth: peak == null || peak === '' ? '' : String(peak),
    amplitude: amp == null || amp === '' ? '' : String(amp),
  };
}

function readScalar(fragment: Record<string, unknown>, snake: string, camel: string): string {
  const v = fragment[snake] ?? fragment[camel];
  if (v == null || v === '') return '';
  return String(v);
}

type Props = {
  fragments: Record<string, unknown>[];
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
};

/**
 * Primary editor for the singleton `trading_configs` row — matches YAML `trading` (boosts, monthly/weekly patterns, seasonal).
 */
export function AdminTradingConfigPanel({ fragments, saving, onPersist }: Props) {
  const row = useMemo(() => {
    const active = fragments.filter((f) => String(f.status) !== 'archived');
    return active[0] ?? fragments[0] ?? null;
  }, [fragments]);

  const [boostPrep, setBoostPrep] = useState('');
  const [boostLive, setBoostLive] = useState('');
  const [effectScale, setEffectScale] = useState('');
  const [paydayPeak, setPaydayPeak] = useState('');
  const [months, setMonths] = useState<Record<MonthKey, string>>(() => {
    const z = {} as Record<MonthKey, string>;
    for (const m of STAFF_MONTHLY_KEYS) z[m] = '';
    return z;
  });
  const [weekdays, setWeekdays] = useState<Record<WeekdayKey, string>>(() => {
    const z = {} as Record<WeekdayKey, string>;
    for (const d of TRADING_WEEKDAY_KEYS) z[d] = '';
    return z;
  });
  const [peakMonth, setPeakMonth] = useState('');
  const [amplitude, setAmplitude] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const rowHydrateKey = row ? `${String(row.id)}:${String(row.version_number ?? row.versionNumber ?? '')}` : '';

  useEffect(() => {
    if (!row) {
      setBoostPrep('');
      setBoostLive('');
      setEffectScale('');
      setPaydayPeak('');
      const emptyM = {} as Record<MonthKey, string>;
      for (const m of STAFF_MONTHLY_KEYS) emptyM[m] = '';
      setMonths(emptyM);
      const emptyW = {} as Record<WeekdayKey, string>;
      for (const d of TRADING_WEEKDAY_KEYS) emptyW[d] = '';
      setWeekdays(emptyW);
      setPeakMonth('');
      setAmplitude('');
      setLocalError(null);
      return;
    }
    setBoostPrep(readScalar(row, 'campaign_store_boost_prep', 'campaignStoreBoostPrep'));
    setBoostLive(readScalar(row, 'campaign_store_boost_live', 'campaignStoreBoostLive'));
    setEffectScale(readScalar(row, 'campaign_effect_scale', 'campaignEffectScale'));
    setPaydayPeak(readScalar(row, 'payday_month_peak_multiplier', 'paydayMonthPeakMultiplier'));
    setMonths(readNumericObject(row, 'monthly_pattern', 'monthlyPattern', STAFF_MONTHLY_KEYS));
    setWeekdays(readNumericObject(row, 'weekly_pattern', 'weeklyPattern', TRADING_WEEKDAY_KEYS));
    const s = readSeasonal(row);
    setPeakMonth(s.peakMonth);
    setAmplitude(s.amplitude);
    setLocalError(null);
  }, [rowHydrateKey]);

  const handleMonth = useCallback((m: MonthKey, v: string) => {
    setMonths((prev) => ({ ...prev, [m]: v }));
  }, []);

  const handleWeekday = useCallback((d: WeekdayKey, v: string) => {
    setWeekdays((prev) => ({ ...prev, [d]: v }));
  }, []);

  const parseOptFloat = (s: string, label: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) throw new Error(`${label} must be a number`);
    return n;
  };

  const handleSave = useCallback(async () => {
    if (!row) return;
    const v = fragmentVersion(row);
    if (!Number.isFinite(v)) {
      setLocalError('This row has no version number; reload and try again.');
      return;
    }
    setLocalError(null);

    let prep: number | null;
    let live: number | null;
    let effect: number | null;
    let payday: number | null;
    try {
      prep = parseOptFloat(boostPrep, 'campaign_store_boost_prep');
      live = parseOptFloat(boostLive, 'campaign_store_boost_live');
      effect = parseOptFloat(effectScale, 'campaign_effect_scale');
      payday = parseOptFloat(paydayPeak, 'payday_month_peak_multiplier');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
      return;
    }

    const monthly: Record<string, number> = {};
    for (const m of STAFF_MONTHLY_KEYS) {
      const t = months[m].trim();
      if (t === '') continue;
      const n = Number.parseFloat(t);
      if (!Number.isFinite(n)) {
        setLocalError(`Monthly pattern ${m} must be a number`);
        return;
      }
      monthly[m] = n;
    }

    const weekly: Record<string, number> = {};
    for (const d of TRADING_WEEKDAY_KEYS) {
      const t = weekdays[d].trim();
      if (t === '') continue;
      const n = Number.parseFloat(t);
      if (!Number.isFinite(n)) {
        setLocalError(`Weekly pattern ${d} must be a number`);
        return;
      }
      weekly[d] = n;
    }

    const peakT = peakMonth.trim();
    const ampT = amplitude.trim();
    let seasonal: { peak_month: number; amplitude: number } | null = null;
    if (peakT !== '' || ampT !== '') {
      if (peakT === '' || ampT === '') {
        setLocalError('Seasonal: set both peak month and amplitude, or clear both.');
        return;
      }
      const pm = Number.parseInt(peakT, 10);
      if (!Number.isFinite(pm) || pm < 1 || pm > 12) {
        setLocalError('Seasonal peak month must be an integer 1–12');
        return;
      }
      const amp = Number.parseFloat(ampT);
      if (!Number.isFinite(amp)) {
        setLocalError('Seasonal amplitude must be a number');
        return;
      }
      seasonal = { peak_month: pm, amplitude: amp };
    }

    const updates: Record<string, unknown> = {
      campaign_store_boost_prep: prep,
      campaign_store_boost_live: live,
      campaign_effect_scale: effect,
      payday_month_peak_multiplier: payday,
      monthly_pattern: Object.keys(monthly).length > 0 ? monthly : null,
      weekly_pattern: Object.keys(weekly).length > 0 ? weekly : null,
      seasonal,
    };

    try {
      await onPersist(row, updates);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }, [row, boostPrep, boostLive, effectScale, paydayPeak, months, weekdays, peakMonth, amplitude, onPersist]);

  if (!row) {
    return (
      <section className="mb-6 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No trading configuration row yet. Import market YAML or create a fragment, then refresh.
      </section>
    );
  }

  const rowSaving = saving === String(row.id);

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-trading-config-title"
    >
      <div className="mb-4">
        <h2 id="admin-trading-config-title" className="text-base font-semibold">
          Trading (YAML parity)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edits <span className="font-mono text-xs">trading</span> — store/restaurant demand shape: campaign boosts,{' '}
          <span className="font-mono text-xs">monthly_pattern</span>, <span className="font-mono text-xs">weekly_pattern</span>,{' '}
          <span className="font-mono text-xs">seasonal</span>. Use &quot;Full YAML fields…&quot; on the row for{' '}
          <span className="font-mono text-xs">payday_month_knot_multipliers</span>. Build &amp; publish to refresh the artifact.
        </p>
      </div>

      {localError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="tr-boost-prep">campaign_store_boost_prep</Label>
            <input
              id="tr-boost-prep"
              type="text"
              inputMode="decimal"
              value={boostPrep}
              onChange={(e) => setBoostPrep(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
              disabled={rowSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tr-boost-live">campaign_store_boost_live</Label>
            <input
              id="tr-boost-live"
              type="text"
              inputMode="decimal"
              value={boostLive}
              onChange={(e) => setBoostLive(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
              disabled={rowSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tr-effect">campaign_effect_scale</Label>
            <input
              id="tr-effect"
              type="text"
              inputMode="decimal"
              value={effectScale}
              onChange={(e) => setEffectScale(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
              disabled={rowSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tr-payday">payday_month_peak_multiplier</Label>
            <input
              id="tr-payday"
              type="text"
              inputMode="decimal"
              value={paydayPeak}
              onChange={(e) => setPaydayPeak(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
              disabled={rowSaving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">monthly_pattern (Jan–Dec)</p>
          <p className="text-xs text-muted-foreground">Leave a month empty to omit it from the saved object.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {STAFF_MONTHLY_KEYS.map((m) => (
              <div key={m} className="space-y-1">
                <Label htmlFor={`tr-mo-${m}`} className="text-xs text-muted-foreground">
                  {m}
                </Label>
                <input
                  id={`tr-mo-${m}`}
                  type="text"
                  inputMode="decimal"
                  value={months[m]}
                  onChange={(e) => handleMonth(m, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                  placeholder="—"
                  disabled={rowSaving}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">weekly_pattern (Mon–Sun)</p>
          <p className="text-xs text-muted-foreground">Leave a weekday empty to omit it from the saved object.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {TRADING_WEEKDAY_KEYS.map((d) => (
              <div key={d} className="space-y-1">
                <Label htmlFor={`tr-wd-${d}`} className="text-xs text-muted-foreground">
                  {d}
                </Label>
                <input
                  id={`tr-wd-${d}`}
                  type="text"
                  inputMode="decimal"
                  value={weekdays[d]}
                  onChange={(e) => handleWeekday(d, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                  placeholder="—"
                  disabled={rowSaving}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">seasonal</p>
          <p className="text-xs text-muted-foreground">
            peak_month is 1–12 (January = 1). Clear both fields to remove seasonal from the fragment.
          </p>
          <div className="grid max-w-md gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr-peak">peak_month</Label>
              <input
                id="tr-peak"
                type="number"
                min={1}
                max={12}
                step={1}
                value={peakMonth}
                onChange={(e) => setPeakMonth(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                disabled={rowSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-amp">amplitude</Label>
              <input
                id="tr-amp"
                type="text"
                inputMode="decimal"
                value={amplitude}
                onChange={(e) => setAmplitude(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
                disabled={rowSaving}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={rowSaving}>
            {rowSaving ? 'Saving…' : 'Save trading'}
          </Button>
          <span className="text-xs text-muted-foreground">v{String(row.version_number ?? '')}</span>
        </div>
      </div>
    </section>
  );
}
