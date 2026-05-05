import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  BAU_INTENSITY_DAY_KEYS,
  BAU_WEEKDAY_CODES,
} from '@/pages/admin/fragmentSectionEditorUtils';
import { buildDraft, FRAGMENT_FULL_EDITOR_TABLES, patchFromDraft, type SectionDraft } from '@/pages/admin/fragmentSectionEditorDraft';

const YAML_HINT: Record<string, string> = {
  bau_configs: 'Maps to YAML block `bau` — days_in_use, weekly_cycle, market_it_weekly_load.',
  resource_configs: 'Maps to `resources` and `testing_capacity`.',
  trading_configs: 'Maps to `trading` — patterns, boosts, seasonal curve.',
  campaign_configs: 'Maps to one row under `campaigns`.',
  tech_programme_configs: 'Maps to one row under `tech_programmes`.',
  national_leave_band_configs: 'Maps to one row under `national_leave_bands`.',
  deployment_risk_configs: 'Maps to deployment_risk_week_weight, month curves, events, blackouts.',
  operating_window_configs: 'Maps to one row under `operating_windows`.',
};

export function FragmentSectionEditorSheet({
  open,
  onOpenChange,
  table,
  fragment,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  table: string;
  fragment: Record<string, unknown> | null;
  saving: boolean;
  onSave: (row: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SectionDraft | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !fragment || !FRAGMENT_FULL_EDITOR_TABLES.has(table)) {
      setDraft(null);
      return;
    }
    const d = buildDraft(table, fragment);
    setDraft(d);
    setLocalError(null);
  }, [open, fragment, table]);

  const handleSubmit = useCallback(async () => {
    if (!fragment || !draft) return;
    setLocalError(null);
    const result = patchFromDraft(draft);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    try {
      await onSave(fragment, result.patch);
      onOpenChange(false);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }, [draft, fragment, onOpenChange, onSave]);

  const titleRow =
    typeof fragment?.name === 'string' && fragment.name.trim()
      ? fragment.name.trim()
      : typeof fragment?.label === 'string' && fragment.label.trim()
        ? fragment.label.trim()
        : (fragment?.id as string) ?? 'Record';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit YAML fields — {titleRow}</DialogTitle>
          <DialogDescription>
            {YAML_HINT[table] ?? 'Edits persist to this fragment; build & publish to refresh the market YAML artifact.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {!draft ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing to edit.</p>
          ) : (
            <div className="space-y-6 pb-2">{renderDraftBody(draft, setDraft)}</div>
          )}
          {localError ? (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {localError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !draft}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function renderDraftBody(draft: SectionDraft, setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>) {
  switch (draft.kind) {
    case 'bau_configs':
      return <BauBody draft={draft} setDraft={setDraft} />;
    case 'resource_configs':
      return <ResourceBody draft={draft} setDraft={setDraft} />;
    case 'trading_configs':
      return <TradingBody draft={draft} setDraft={setDraft} />;
    case 'campaign_configs':
      return <CampaignBody draft={draft} setDraft={setDraft} />;
    case 'tech_programme_configs':
      return <TechBody draft={draft} setDraft={setDraft} />;
    case 'national_leave_band_configs':
      return <LeaveBody draft={draft} setDraft={setDraft} />;
    case 'deployment_risk_configs':
      return <RiskBody draft={draft} setDraft={setDraft} />;
    case 'operating_window_configs':
      return <WindowBody draft={draft} setDraft={setDraft} />;
    default:
      return null;
  }
}

function fieldClass() {
  return 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
}

function BauBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'bau_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  const toggleDay = (code: string) => {
    setDraft((prev) => {
      if (!prev || prev.kind !== 'bau_configs') return prev;
      const has = prev.days.includes(code);
      const days = has ? prev.days.filter((d) => d !== code) : [...prev.days, code];
      return { ...prev, days };
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">days_in_use (weekday codes)</p>
        <div className="flex flex-wrap gap-2">
          {BAU_WEEKDAY_CODES.map((code) => (
            <label key={code} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={draft.days.includes(code)}
                onChange={() => toggleDay(code)}
              />
              {code}
            </label>
          ))}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="bau-labs-req">weekly_cycle.labs_required</Label>
          <input
            id="bau-labs-req"
            className={fieldClass()}
            value={draft.weeklyLabs}
            onChange={(e) => setDraft((p) => (p?.kind === 'bau_configs' ? { ...p, weeklyLabs: e.target.value } : p))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bau-staff-req">weekly_cycle.staff_required</Label>
          <input
            id="bau-staff-req"
            className={fieldClass()}
            value={draft.weeklyStaff}
            onChange={(e) => setDraft((p) => (p?.kind === 'bau_configs' ? { ...p, weeklyStaff: e.target.value } : p))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bau-support">weekly_cycle.support_days</Label>
          <input
            id="bau-support"
            className={fieldClass()}
            value={draft.weeklySupport}
            onChange={(e) => setDraft((p) => (p?.kind === 'bau_configs' ? { ...p, weeklySupport: e.target.value } : p))}
          />
        </div>
      </section>
      <section className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">market_it_weekly_load.weekday_intensity (0–1 typical)</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {BAU_INTENSITY_DAY_KEYS.map((day) => (
            <div key={day} className="space-y-1">
              <Label htmlFor={`bau-int-${day}`}>{day}</Label>
              <input
                id={`bau-int-${day}`}
                className={fieldClass()}
                value={draft.intensity[day] ?? ''}
                onChange={(e) =>
                  setDraft((p) => {
                    if (p?.kind !== 'bau_configs') return p;
                    return { ...p, intensity: { ...p.intensity, [day]: e.target.value } };
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResourceBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'resource_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="res-labs_capacity">labs_capacity</Label>
          <input
            id="res-labs_capacity"
            className={fieldClass()}
            value={draft.labs}
            onChange={(e) => setDraft((p) => (p?.kind === 'resource_configs' ? { ...p, labs: e.target.value } : p))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="res-staff_capacity">staff_capacity</Label>
          <input
            id="res-staff_capacity"
            className={fieldClass()}
            value={draft.staff}
            onChange={(e) => setDraft((p) => (p?.kind === 'resource_configs' ? { ...p, staff: e.target.value } : p))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="res-testing_capacity">testing_capacity</Label>
          <input
            id="res-testing_capacity"
            className={fieldClass()}
            value={draft.testing}
            onChange={(e) => setDraft((p) => (p?.kind === 'resource_configs' ? { ...p, testing: e.target.value } : p))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="res-basis">staff_monthly_pattern_basis</Label>
        <select
          id="res-basis"
          className={fieldClass()}
          value={draft.basis}
          onChange={(e) => setDraft((p) => (p?.kind === 'resource_configs' ? { ...p, basis: e.target.value } : p))}
        >
          <option value="">(none)</option>
          <option value="absolute">absolute</option>
          <option value="multiplier">multiplier</option>
        </select>
      </div>
      {(
        [
          ['staff_monthly_pattern', draft.staffMonthlyJson, 'staffMonthlyJson'],
          ['labs_monthly_pattern', draft.labsMonthlyJson, 'labsMonthlyJson'],
          ['tech_available_capacity_pattern', draft.techPatternJson, 'techPatternJson'],
        ] as const
      ).map(([label, json, key]) => (
        <div key={label} className="space-y-1">
          <Label htmlFor={`res-${key}`}>{label} (JSON object)</Label>
          <textarea
            id={`res-${key}`}
            rows={6}
            className={`${fieldClass()} min-h-[120px] font-mono text-xs`}
            value={json}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'resource_configs' ? { ...p, [key]: e.target.value } : p))
            }
          />
        </div>
      ))}
    </div>
  );
}

function TradingBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'trading_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['campaign_store_boost_prep', draft.boostPrep, 'boostPrep'],
            ['campaign_store_boost_live', draft.boostLive, 'boostLive'],
            ['campaign_effect_scale', draft.effectScale, 'effectScale'],
            ['payday_month_peak_multiplier', draft.paydayPeak, 'paydayPeak'],
          ] as const
        ).map(([label, val, key]) => (
          <div key={label} className="space-y-1">
            <Label htmlFor={`tr-${key}`}>{label}</Label>
            <input
              id={`tr-${key}`}
              className={fieldClass()}
              value={val}
              onChange={(e) => setDraft((p) => (p?.kind === 'trading_configs' ? { ...p, [key]: e.target.value } : p))}
            />
          </div>
        ))}
      </div>
      {(
        [
          ['weekly_pattern', draft.weeklyJson, 'weeklyJson'],
          ['monthly_pattern', draft.monthlyJson, 'monthlyJson'],
          ['seasonal', draft.seasonalJson, 'seasonalJson'],
          ['payday_month_knot_multipliers', draft.paydayKnotsJson, 'paydayKnotsJson'],
        ] as const
      ).map(([label, json, key]) => (
        <div key={label} className="space-y-1">
          <Label htmlFor={`tr-${key}`}>{label}</Label>
          <textarea
            id={`tr-${key}`}
            rows={label === 'seasonal' ? 4 : 8}
            className={`${fieldClass()} min-h-[100px] font-mono text-xs`}
            value={json}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'trading_configs' ? { ...p, [key]: e.target.value } : p))
            }
          />
        </div>
      ))}
    </div>
  );
}

function CampaignBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'campaign_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="camp-name">name</Label>
          <input
            id="camp-name"
            className={fieldClass()}
            value={draft.name}
            onChange={(e) => setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, name: e.target.value } : p))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="camp-start">start_date</Label>
          <input
            id="camp-start"
            className={fieldClass()}
            value={draft.startDate}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, startDate: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="camp-dur">duration_days</Label>
          <input
            id="camp-dur"
            className={fieldClass()}
            value={draft.durationDays}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, durationDays: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="camp-prep">testing_prep_duration</Label>
          <input
            id="camp-prep"
            className={fieldClass()}
            value={draft.testingPrep}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, testingPrep: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="camp-impact">impact</Label>
          <select
            id="camp-impact"
            className={fieldClass()}
            value={draft.impact}
            onChange={(e) => setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, impact: e.target.value } : p))}
          >
            <option value="">(none)</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="very_high">very_high</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="camp-pw">promo_weight</Label>
          <input
            id="camp-pw"
            className={fieldClass()}
            value={draft.promoWeight}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, promoWeight: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="camp-lt">live_tech_load_scale</Label>
          <input
            id="camp-lt"
            className={fieldClass()}
            value={draft.liveTechScale}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, liveTechScale: e.target.value } : p))
            }
          />
        </div>
      </div>
      {(
        [
          ['campaign_support', draft.campaignSupportJson, 'campaignSupportJson'],
          ['live_campaign_support', draft.liveCampaignSupportJson, 'liveCampaignSupportJson'],
          ['stagger_settings', draft.staggerSettingsJson, 'staggerSettingsJson'],
        ] as const
      ).map(([label, json, key]) => (
        <div key={label} className="space-y-1">
          <Label>{label} (JSON)</Label>
          <textarea
            rows={5}
            className={`${fieldClass()} font-mono text-xs`}
            value={json}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, [key]: e.target.value } : p))
            }
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-4">
        {(
          [
            ['replaces_bau_tech', draft.replacesBau, 'replacesBau'],
            ['presence_only', draft.presenceOnly, 'presenceOnly'],
            ['stagger_functional_loads', draft.staggerLoads, 'staggerLoads'],
          ] as const
        ).map(([label, checked, key]) => (
          <label key={label} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={checked}
              onChange={(e) =>
                setDraft((p) => (p?.kind === 'campaign_configs' ? { ...p, [key]: e.target.checked } : p))
              }
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function TechBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'tech_programme_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="tp-name">name</Label>
          <input
            id="tp-name"
            className={fieldClass()}
            value={draft.name}
            onChange={(e) => setDraft((p) => (p?.kind === 'tech_programme_configs' ? { ...p, name: e.target.value } : p))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tp-start">start_date</Label>
          <input
            id="tp-start"
            className={fieldClass()}
            value={draft.startDate}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'tech_programme_configs' ? { ...p, startDate: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tp-dur">duration_days</Label>
          <input
            id="tp-dur"
            className={fieldClass()}
            value={draft.durationDays}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'tech_programme_configs' ? { ...p, durationDays: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tp-prep">testing_prep_duration</Label>
          <input
            id="tp-prep"
            className={fieldClass()}
            value={draft.testingPrep}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'tech_programme_configs' ? { ...p, testingPrep: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tp-lt">live_tech_load_scale</Label>
          <input
            id="tp-lt"
            className={fieldClass()}
            value={draft.liveTechScale}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'tech_programme_configs' ? { ...p, liveTechScale: e.target.value } : p))
            }
          />
        </div>
      </div>
      {(
        [
          ['programme_support', draft.programmeSupportJson, 'programmeSupportJson'],
          ['live_programme_support', draft.liveProgrammeSupportJson, 'liveProgrammeSupportJson'],
        ] as const
      ).map(([label, json, key]) => (
        <div key={label} className="space-y-1">
          <Label>{label} (JSON)</Label>
          <textarea
            rows={5}
            className={`${fieldClass()} font-mono text-xs`}
            value={json}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'tech_programme_configs' ? { ...p, [key]: e.target.value } : p))
            }
          />
        </div>
      ))}
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="rounded border-border"
          checked={draft.replacesBau}
          onChange={(e) =>
            setDraft((p) => (p?.kind === 'tech_programme_configs' ? { ...p, replacesBau: e.target.checked } : p))
          }
        />
        replaces_bau_tech
      </label>
    </div>
  );
}

function LeaveBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'national_leave_band_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="lb-label">label</Label>
        <input
          id="lb-label"
          className={fieldClass()}
          value={draft.label}
          onChange={(e) =>
            setDraft((p) => (p?.kind === 'national_leave_band_configs' ? { ...p, label: e.target.value } : p))
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="lb-from">from_date</Label>
          <input
            id="lb-from"
            className={fieldClass()}
            value={draft.fromDate}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'national_leave_band_configs' ? { ...p, fromDate: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lb-to">to_date</Label>
          <input
            id="lb-to"
            className={fieldClass()}
            value={draft.toDate}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'national_leave_band_configs' ? { ...p, toDate: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lb-mult">capacity_multiplier</Label>
          <input
            id="lb-mult"
            className={fieldClass()}
            value={draft.multiplier}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'national_leave_band_configs' ? { ...p, multiplier: e.target.value } : p))
            }
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="lb-weeks">weeks (JSON array, optional)</Label>
        <textarea
          id="lb-weeks"
          rows={6}
          className={`${fieldClass()} font-mono text-xs`}
          value={draft.weeksJson}
          onChange={(e) =>
            setDraft((p) => (p?.kind === 'national_leave_band_configs' ? { ...p, weeksJson: e.target.value } : p))
          }
        />
      </div>
    </div>
  );
}

function RiskBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'deployment_risk_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rk-ww">deployment_risk_week_weight</Label>
          <input
            id="rk-ww"
            className={fieldClass()}
            value={draft.weekWeight}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'deployment_risk_configs' ? { ...p, weekWeight: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rk-sw">deployment_resourcing_strain_weight</Label>
          <input
            id="rk-sw"
            className={fieldClass()}
            value={draft.strainWeight}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'deployment_risk_configs' ? { ...p, strainWeight: e.target.value } : p))
            }
          />
        </div>
      </div>
      {(
        [
          ['deployment_risk_month_curve', draft.monthCurveJson, 'monthCurveJson'],
          ['deployment_risk_context_month_curve', draft.contextMonthCurveJson, 'contextMonthCurveJson'],
          ['events → deployment_risk_events', draft.eventsJson, 'eventsJson'],
          ['blackouts → deployment_risk_blackouts', draft.blackoutsJson, 'blackoutsJson'],
        ] as const
      ).map(([label, json, key]) => (
        <div key={label} className="space-y-1">
          <Label>{label} (JSON)</Label>
          <textarea
            rows={label.includes('events') || label.includes('blackouts') ? 12 : 6}
            className={`${fieldClass()} font-mono text-xs`}
            value={json}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'deployment_risk_configs' ? { ...p, [key]: e.target.value } : p))
            }
          />
        </div>
      ))}
    </div>
  );
}

function WindowBody({
  draft,
  setDraft,
}: {
  draft: Extract<SectionDraft, { kind: 'operating_window_configs' }>;
  setDraft: React.Dispatch<React.SetStateAction<SectionDraft | null>>;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="ow-name">name</Label>
        <input
          id="ow-name"
          className={fieldClass()}
          value={draft.name}
          onChange={(e) =>
            setDraft((p) => (p?.kind === 'operating_window_configs' ? { ...p, name: e.target.value } : p))
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ow-s">start_date</Label>
          <input
            id="ow-s"
            className={fieldClass()}
            value={draft.startDate}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'operating_window_configs' ? { ...p, startDate: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ow-e">end_date</Label>
          <input
            id="ow-e"
            className={fieldClass()}
            value={draft.endDate}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'operating_window_configs' ? { ...p, endDate: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ow-ri">ramp_in_days</Label>
          <input
            id="ow-ri"
            className={fieldClass()}
            value={draft.rampIn}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'operating_window_configs' ? { ...p, rampIn: e.target.value } : p))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ow-ro">ramp_out_days</Label>
          <input
            id="ow-ro"
            className={fieldClass()}
            value={draft.rampOut}
            onChange={(e) =>
              setDraft((p) => (p?.kind === 'operating_window_configs' ? { ...p, rampOut: e.target.value } : p))
            }
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ow-env">envelope</Label>
        <select
          id="ow-env"
          className={fieldClass()}
          value={draft.envelope}
          onChange={(e) =>
            setDraft((p) => (p?.kind === 'operating_window_configs' ? { ...p, envelope: e.target.value } : p))
          }
        >
          <option value="">(none)</option>
          <option value="smoothstep">smoothstep</option>
          <option value="linear">linear</option>
          <option value="step">step</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label>multipliers (JSON — store_pressure_mult, lab_load_mult, …)</Label>
        <textarea
          rows={8}
          className={`${fieldClass()} font-mono text-xs`}
          value={draft.multipliersJson}
          onChange={(e) =>
            setDraft((p) => (p?.kind === 'operating_window_configs' ? { ...p, multipliersJson: e.target.value } : p))
          }
        />
      </div>
    </div>
  );
}
