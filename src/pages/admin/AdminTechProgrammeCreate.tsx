import { useCallback, useMemo, useState } from 'react';
import { createFragmentApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { AdminMarketRow } from '@/pages/admin/AdminMarketsDataTable';

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Props = {
  market: AdminMarketRow;
  onCreated: () => void;
};

export function AdminTechProgrammeCreate({ market, onCreated }: Props) {
  const defaultStart = useMemo(() => formatYmd(new Date()), []);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [durationDays, setDurationDays] = useState('60');
  const [prepDays, setPrepDays] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const operatingModelId = market.operating_model_id?.trim() || null;

  const resetMessages = useCallback(() => {
    setFormError(null);
    setFormSuccess(null);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!operatingModelId) {
      setFormError(
        'This market has no operating model in the database; tech programmes cannot be created until that is set.',
      );
      return;
    }
    const n = name.trim();
    if (!n) {
      setFormError('Enter a programme name.');
      return;
    }
    const start = startDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      setFormError('Start date must be YYYY-MM-DD.');
      return;
    }
    const dur = Number.parseInt(durationDays, 10);
    if (!Number.isFinite(dur) || dur < 1) {
      setFormError('Duration must be a whole number of days (at least 1).');
      return;
    }
    let testingPrep: number | null = null;
    const prepRaw = prepDays.trim();
    if (prepRaw) {
      const p = Number.parseInt(prepRaw, 10);
      if (!Number.isFinite(p) || p < 0) {
        setFormError('Prep before live must be empty or a non-negative whole number of days.');
        return;
      }
      testingPrep = p;
    }

    setSubmitting(true);
    try {
      await createFragmentApi('tech_programme_configs', {
        market_id: market.id,
        segment_id: market.segment_id,
        operating_model_id: operatingModelId,
        status: 'draft',
        name: n,
        start_date: start,
        duration_days: dur,
        testing_prep_duration: testingPrep,
        extra_settings: {},
      });
      setFormSuccess('Tech programme created as draft. Add programme_support in Expert YAML if needed, then build.');
      setName('');
      setStartDate(defaultStart);
      setDurationDays('60');
      setPrepDays('');
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-tech-programme-create-title"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="admin-tech-programme-create-title" className="text-base font-semibold">
            New tech programme
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Creates a <span className="font-medium text-foreground/90">draft</span> row in{' '}
            <span className="font-mono text-xs">tech_programme_configs</span> (IT / platform work, not marketing
            campaigns). Tune <span className="font-mono text-xs">programme_support</span> in Expert YAML, then build
            &amp; publish.
          </p>
        </div>
      </div>

      {formError && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      )}
      {formSuccess && (
        <div className="mb-3 rounded-md border border-green-600/20 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-400">
          {formSuccess}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="tech-prog-name">Name</Label>
          <input
            id="tech-prog-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="e.g. POS rollout — lab + Market IT"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tech-prog-start">Start</Label>
          <input
            id="tech-prog-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tech-prog-duration">Duration (days)</Label>
          <input
            id="tech-prog-duration"
            type="number"
            min={1}
            step={1}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tech-prog-prep">Prep before live (days, optional)</Label>
          <input
            id="tech-prog-prep"
            type="number"
            min={0}
            step={1}
            value={prepDays}
            onChange={(e) => setPrepDays(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="e.g. 30"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create draft programme'}
          </Button>
        </div>
      </form>
    </section>
  );
}
