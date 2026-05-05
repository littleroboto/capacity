import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fetchFragments, updateFragmentApi } from '@/lib/adminApi';

function fragmentVersion(f: Record<string, unknown>): number {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

type Props = {
  marketId: string;
};

/**
 * Edits `market_configs.holiday_settings` → YAML top-level `holidays:` (capacity_taper_days, lab_capacity_scale).
 */
export function AdminMarketHolidaySettingsPanel({ marketId }: Props) {
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [taper, setTaper] = useState('');
  const [labScale, setLabScale] = useState('');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchFragments('market_configs', marketId);
      const active = rows.filter((f) => String(f.status) !== 'archived');
      const r = active[0] ?? rows[0] ?? null;
      setRow(r);
    } catch (e) {
      setRow(null);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowHydrateKey = row ? `${String(row.id)}:${String(row.version_number ?? row.versionNumber ?? '')}` : '';

  useEffect(() => {
    if (!row) {
      setTaper('');
      setLabScale('');
      setLocalError(null);
      return;
    }
    const hs = row.holiday_settings ?? row.holidaySettings;
    const h = hs && typeof hs === 'object' && !Array.isArray(hs) ? (hs as Record<string, unknown>) : {};
    const ctd = h.capacity_taper_days ?? h.capacityTaperDays;
    const lcs = h.lab_capacity_scale ?? h.labCapacityScale;
    setTaper(ctd == null || ctd === '' ? '' : String(ctd));
    setLabScale(lcs == null || lcs === '' ? '' : String(lcs));
    setLocalError(null);
  }, [rowHydrateKey]);

  const handleSave = useCallback(async () => {
    if (!row) return;
    const v = fragmentVersion(row);
    if (!Number.isFinite(v)) {
      setLocalError('This row has no version number; reload and try again.');
      return;
    }
    setLocalError(null);
    const taperT = taper.trim();
    const labT = labScale.trim();
    const taperN = taperT === '' ? 0 : Number.parseFloat(taperT);
    if (!Number.isFinite(taperN) || taperN < 0) {
      setLocalError('capacity_taper_days must be a non-negative number (empty = 0).');
      return;
    }
    const labN = labT === '' ? 1.0 : Number.parseFloat(labT);
    if (!Number.isFinite(labN) || labN <= 0) {
      setLocalError('lab_capacity_scale must be a positive number (empty = 1).');
      return;
    }
    const holiday_settings: Record<string, unknown> = {
      capacity_taper_days: taperN,
      lab_capacity_scale: labN,
    };

    setSaving(true);
    try {
      await updateFragmentApi('market_configs', String(row.id), {
        expectedVersion: v,
        holiday_settings,
      });
      await load();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [row, taper, labScale, load]);

  if (!marketId) return null;

  if (loading) {
    return (
      <section className="mb-6 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        Loading market holiday settings…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        Failed to load market config: {loadError}
      </section>
    );
  }

  if (!row) {
    return (
      <section className="mb-6 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No market_config row yet. Import market YAML or create a fragment, then refresh.
      </section>
    );
  }

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-market-holidays-title"
    >
      <div className="mb-4">
        <h2 id="admin-market-holidays-title" className="text-base font-semibold">
          Market holidays (YAML parity)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Maps to top-level <span className="font-mono text-xs">holidays:</span> —{' '}
          <span className="font-mono text-xs">capacity_taper_days</span>,{' '}
          <span className="font-mono text-xs">lab_capacity_scale</span>. Stored on{' '}
          <span className="font-mono text-xs">market_configs.holiday_settings</span>.
        </p>
      </div>

      {localError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="grid max-w-lg gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mhs-taper">capacity_taper_days</Label>
          <input
            id="mhs-taper"
            type="text"
            inputMode="numeric"
            value={taper}
            onChange={(e) => setTaper(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
            placeholder="0"
            disabled={saving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mhs-lab">lab_capacity_scale</Label>
          <input
            id="mhs-lab"
            type="text"
            inputMode="decimal"
            value={labScale}
            onChange={(e) => setLabScale(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
            placeholder="1.0"
            disabled={saving}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save market holidays'}
        </Button>
        <span className="text-xs text-muted-foreground">v{String(row.version_number ?? '')}</span>
      </div>
    </section>
  );
}
