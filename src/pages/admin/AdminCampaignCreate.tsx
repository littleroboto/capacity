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

export function AdminCampaignCreate({ market, onCreated }: Props) {
  const defaultStart = useMemo(() => formatYmd(new Date()), []);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [durationDays, setDurationDays] = useState('14');
  const [promoWeight, setPromoWeight] = useState('1');
  const [impact, setImpact] = useState<string>('');
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
      setFormError('This market has no operating model in the database; campaigns cannot be created until that is set.');
      return;
    }
    const n = name.trim();
    if (!n) {
      setFormError('Enter a campaign name.');
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
    const pw = Number.parseFloat(promoWeight);
    if (!Number.isFinite(pw) || pw < 0) {
      setFormError('Promo weight must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      await createFragmentApi('campaign_configs', {
        market_id: market.id,
        segment_id: market.segment_id,
        operating_model_id: operatingModelId,
        status: 'draft',
        name: n,
        start_date: start,
        duration_days: dur,
        promo_weight: pw,
        impact: impact || null,
        extra_settings: {},
      });
      setFormSuccess('Campaign created as draft. Activate it after review, then build.');
      setName('');
      setStartDate(defaultStart);
      setDurationDays('14');
      setPromoWeight('1');
      setImpact('');
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
      aria-labelledby="admin-campaign-create-title"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="admin-campaign-create-title" className="text-base font-semibold">
            New campaign
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Creates a <span className="font-medium text-foreground/90">draft</span> row in{' '}
            <span className="font-mono text-xs">campaign_configs</span>. Tune loads in Expert YAML or future editors,
            then build &amp; publish.
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

      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="campaign-name">Name</Label>
          <input
            id="campaign-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="e.g. Spring value meal"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-start">Go-live (start)</Label>
          <input
            id="campaign-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-duration">Live duration (days)</Label>
          <input
            id="campaign-duration"
            type="number"
            min={1}
            step={1}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-weight">Promo weight</Label>
          <input
            id="campaign-weight"
            type="number"
            min={0}
            step={0.01}
            value={promoWeight}
            onChange={(e) => setPromoWeight(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campaign-impact">Impact (optional)</Label>
          <select
            id="campaign-impact"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very high</option>
          </select>
        </div>
        <div className="flex items-end sm:col-span-2 lg:col-span-1">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create draft campaign'}
          </Button>
        </div>
      </form>
    </section>
  );
}
