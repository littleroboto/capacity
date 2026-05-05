import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { createFragmentApi } from '@/lib/adminApi';
import { buildDraft, patchFromDraft } from '@/pages/admin/fragmentSectionEditorDraft';
import { parseJsonArray, parseOptionalFloat } from '@/pages/admin/fragmentSectionEditorUtils';
import type { AdminMarketRow } from '@/pages/admin/AdminMarketsDataTable';

function fragmentVersion(f: Record<string, unknown>): number {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function bandFromDate(b: Record<string, unknown>): string {
  return String(b.from_date ?? b.fromDate ?? '');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEXTAREA_CLASS =
  'min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const INPUT_CLASS = 'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm';

type RowProps = {
  row: Record<string, unknown>;
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
};

function LeaveBandRowEditor({ row, saving, onPersist }: RowProps) {
  const [label, setLabel] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [multiplier, setMultiplier] = useState('');
  const [weeksJson, setWeeksJson] = useState('[]');
  const [localError, setLocalError] = useState<string | null>(null);

  const rowHydrateKey = `${String(row.id)}:${String(row.version_number ?? row.versionNumber ?? '')}`;

  useEffect(() => {
    const d = buildDraft('national_leave_band_configs', row);
    if (d && d.kind === 'national_leave_band_configs') {
      setLabel(d.label);
      setFromDate(d.fromDate);
      setToDate(d.toDate);
      setMultiplier(d.multiplier);
      setWeeksJson(d.weeksJson);
    }
    setLocalError(null);
  }, [rowHydrateKey]);

  const handleSave = useCallback(async () => {
    const v = fragmentVersion(row);
    if (!Number.isFinite(v)) {
      setLocalError('This row has no version number; reload and try again.');
      return;
    }
    setLocalError(null);

    const result = patchFromDraft({
      kind: 'national_leave_band_configs',
      label,
      fromDate,
      toDate,
      multiplier,
      weeksJson,
    });

    if (!result.ok) {
      setLocalError(result.error);
      return;
    }

    const p = result.patch;
    const weeksArr = p.weeks;
    const hasWeeks = Array.isArray(weeksArr) && weeksArr.length > 0;
    if (p.capacity_multiplier == null && !hasWeeks) {
      setLocalError('Set a capacity multiplier and/or add per-week overrides (non-empty weeks array).');
      return;
    }

    try {
      await onPersist(row, result.patch);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }, [row, label, fromDate, toDate, multiplier, weeksJson, onPersist]);

  const rowSaving = saving === String(row.id);
  const status = String(row.status ?? '');

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {status ? `Status: ${status}` : null}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor={`leave-label-${row.id}`}>Label</Label>
          <input
            id={`leave-label-${row.id}`}
            type="text"
            value={label}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
            placeholder="e.g. Christmas/summer shutdown"
            className={INPUT_CLASS}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor={`leave-from-${row.id}`}>From</Label>
          <input
            id={`leave-from-${row.id}`}
            type="text"
            value={fromDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromDate(e.target.value)}
            placeholder="YYYY-MM-DD"
            className={`${INPUT_CLASS} font-mono`}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor={`leave-to-${row.id}`}>To</Label>
          <input
            id={`leave-to-${row.id}`}
            type="text"
            value={toDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToDate(e.target.value)}
            placeholder="YYYY-MM-DD"
            className={`${INPUT_CLASS} font-mono`}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor={`leave-mult-${row.id}`}>Capacity multiplier</Label>
          <input
            id={`leave-mult-${row.id}`}
            type="text"
            inputMode="decimal"
            value={multiplier}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMultiplier(e.target.value)}
            placeholder="0–1 (e.g. 0.35)"
            className={`${INPUT_CLASS} font-mono`}
            autoComplete="off"
          />
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">Optional per-week overrides (JSON)</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Array of <code className="rounded bg-muted px-1">week_start</code> +{' '}
          <code className="rounded bg-muted px-1">capacity_multiplier</code>. Leave as <code className="rounded bg-muted px-1">[]</code> to use
          the flat multiplier only.
        </p>
        <textarea
          id={`leave-weeks-${row.id}`}
          className={`${TEXTAREA_CLASS} mt-2`}
          value={weeksJson}
          onChange={(e) => setWeeksJson(e.target.value)}
          spellCheck={false}
        />
      </details>
      {localError ? <p className="mt-2 text-sm text-destructive">{localError}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={rowSaving}>
          {rowSaving ? 'Saving…' : 'Save band'}
        </Button>
      </div>
    </div>
  );
}

type PanelProps = {
  fragments: Record<string, unknown>[];
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
  market: AdminMarketRow;
  onCreated: () => void;
};

/**
 * Primary editor for `national_leave_band_configs` rows → assembled YAML `national_leave_bands`.
 */
export function AdminNationalLeaveBandsPanel({ fragments, saving, onPersist, market, onCreated }: PanelProps) {
  const bands = useMemo(() => {
    const active = fragments.filter((f) => String(f.status) !== 'archived');
    return [...active].sort((a, b) => bandFromDate(a).localeCompare(bandFromDate(b)));
  }, [fragments]);

  const defaultStart = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const [newLabel, setNewLabel] = useState('');
  const [newFrom, setNewFrom] = useState(defaultStart);
  const [newTo, setNewTo] = useState(defaultStart);
  const [newMult, setNewMult] = useState('0.35');
  const [newWeeksJson, setNewWeeksJson] = useState('[]');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const operatingModelId = market.operating_model_id?.trim() || null;

  const resetCreateMessages = useCallback(() => {
    setCreateError(null);
    setCreateSuccess(null);
  }, []);

  const onCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetCreateMessages();
    if (!operatingModelId) {
      setCreateError('This market has no operating model; set it on the market before adding leave bands.');
      return;
    }
    const from = newFrom.trim();
    const to = newTo.trim();
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      setCreateError('From and to must be YYYY-MM-DD.');
      return;
    }
    if (from > to) {
      setCreateError('From date must be on or before to date.');
      return;
    }
    const mult = parseOptionalFloat(newMult, 'capacity_multiplier');
    if (!mult.ok) {
      setCreateError(mult.error);
      return;
    }
    const weeks = parseJsonArray(newWeeksJson, 'weeks');
    if (!weeks.ok) {
      setCreateError(weeks.error);
      return;
    }
    if (mult.value == null && weeks.value.length === 0) {
      setCreateError('Set a capacity multiplier and/or a non-empty weeks array.');
      return;
    }

    setCreateSubmitting(true);
    try {
      await createFragmentApi('national_leave_band_configs', {
        market_id: market.id,
        segment_id: market.segment_id,
        operating_model_id: operatingModelId,
        status: 'draft',
        label: newLabel.trim() || null,
        from_date: from,
        to_date: to,
        capacity_multiplier: mult.value,
        weeks: weeks.value.length > 0 ? weeks.value : null,
        extra_settings: {},
      });
      setCreateSuccess('Leave band created as draft. Activate it in the table after review, then build.');
      setNewLabel('');
      setNewFrom(defaultStart);
      setNewTo(defaultStart);
      setNewMult('0.35');
      setNewWeeksJson('[]');
      onCreated();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        aria-labelledby="admin-leave-bands-title"
      >
        <h2 id="admin-leave-bands-title" className="text-lg font-semibold tracking-tight">
          National leave bands
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Collective leave density windows (YAML <code className="rounded bg-muted px-1">national_leave_bands</code>). Active rows are
          assembled into market config; overlapping bands multiply together.
        </p>

        {bands.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No leave bands yet for this market.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {bands.map((b) => (
              <LeaveBandRowEditor key={String(b.id)} row={b} saving={saving} onPersist={onPersist} />
            ))}
          </div>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        aria-labelledby="admin-leave-band-create-title"
      >
        <h2 id="admin-leave-band-create-title" className="text-lg font-semibold tracking-tight">
          Add leave band
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Creates a draft row. Use the table below to activate or archive.</p>
        <form onSubmit={onCreateSubmit} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="new-leave-label">Label</Label>
              <input
                id="new-leave-label"
                type="text"
                value={newLabel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabel(e.target.value)}
                placeholder="e.g. Easter leave cluster"
                className={INPUT_CLASS}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="new-leave-from">From</Label>
              <input
                id="new-leave-from"
                type="text"
                value={newFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFrom(e.target.value)}
                className={`${INPUT_CLASS} font-mono`}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="new-leave-to">To</Label>
              <input
                id="new-leave-to"
                type="text"
                value={newTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTo(e.target.value)}
                className={`${INPUT_CLASS} font-mono`}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="new-leave-mult">Capacity multiplier</Label>
              <input
                id="new-leave-mult"
                type="text"
                inputMode="decimal"
                value={newMult}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMult(e.target.value)}
                className={`${INPUT_CLASS} font-mono`}
                autoComplete="off"
              />
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">Optional per-week overrides (JSON)</summary>
            <textarea
              id="new-leave-weeks"
              className={`${TEXTAREA_CLASS} mt-2`}
              value={newWeeksJson}
              onChange={(e) => setNewWeeksJson(e.target.value)}
              spellCheck={false}
            />
          </details>
          {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
          {createSuccess ? <p className="text-sm text-green-700 dark:text-green-400">{createSuccess}</p> : null}
          <Button type="submit" disabled={createSubmitting || !operatingModelId}>
            {createSubmitting ? 'Creating…' : 'Create draft band'}
          </Button>
        </form>
      </section>
    </div>
  );
}
