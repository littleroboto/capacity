import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { normalizedRiskWeights } from '@/engine/riskModelTuning';
import {
  RISK_HEATMAP_CURVE_OPTIONS,
  applyRiskHeatmapTransfer,
  riskHeatmapCurveUsesGamma,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';
import { HEATMAP_MONO_COLOR_PRESETS } from '@/lib/riskHeatmapColors';
import { RightPanelSection } from '@/components/RightPanelSection';
import { TechWeeklyRhythmPanel } from '@/components/TechWeeklyRhythmPanel';
import { isRunwayAllMarkets } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

/** Slider step in γ (0.1 = coarser than the old 0.05 centi-step). */
const GAMMA_UI_MIN = 0.35;
const GAMMA_UI_MAX = 3;
const GAMMA_UI_STEP = 0.1;

const CAMPAIGN_UI_MIN = 0;
const CAMPAIGN_UI_MAX = 2.5;
const CAMPAIGN_UI_STEP = 0.05;

/** Post-payday month-start lift on store pressure (engine clamps 1–2). */
const PAYDAY_UI_MIN = 1;
const PAYDAY_UI_MAX = 2;
const PAYDAY_UI_STEP = 0.01;

function snapCampaignUiMultiplier(n: number): number {
  const s = Math.round(n / CAMPAIGN_UI_STEP) * CAMPAIGN_UI_STEP;
  return Math.min(CAMPAIGN_UI_MAX, Math.max(CAMPAIGN_UI_MIN, Math.round(s * 100) / 100));
}

function snapGammaUi(gamma: number): number {
  const s = Math.round(gamma / GAMMA_UI_STEP) * GAMMA_UI_STEP;
  return Math.min(GAMMA_UI_MAX, Math.max(GAMMA_UI_MIN, Math.round(s * 100) / 100));
}

function snapPaydayPeakUi(n: number): number {
  const s = Math.round(n / PAYDAY_UI_STEP) * PAYDAY_UI_STEP;
  return Math.min(PAYDAY_UI_MAX, Math.max(PAYDAY_UI_MIN, Math.round(s * 1000) / 1000));
}

/** Dim opacity for cells below threshold on the transformed (curve + γ) scale; 0 = off. */
const STRESS_CUT_UI_MAX = 0.95;
const STRESS_CUT_UI_STEP = 0.05;

function snapStressCutUi(n: number): number {
  const s = Math.round(n / STRESS_CUT_UI_STEP) * STRESS_CUT_UI_STEP;
  return Math.min(STRESS_CUT_UI_MAX, Math.max(0, Math.round(s * 100) / 100));
}

/** Distinct segment colours for the blend bar (collapsed + expanded story). */
const BLEND_VIS: { key: keyof ReturnType<typeof normalizedRiskWeights>; label: string; className: string }[] = [
  { key: 'tech', label: 'Tech', className: 'bg-sky-600 dark:bg-sky-500' },
  { key: 'store', label: 'Restaurant', className: 'bg-amber-600 dark:bg-amber-500' },
  { key: 'campaign', label: 'Marketing', className: 'bg-violet-600 dark:bg-violet-500' },
  { key: 'holiday', label: 'Resources', className: 'bg-teal-600 dark:bg-teal-500' },
];

function BlendStackBar({
  weights,
  className,
}: {
  weights: ReturnType<typeof normalizedRiskWeights>;
  className?: string;
}) {
  const segs = BLEND_VIS.map((b) => ({ ...b, w: weights[b.key] }));
  const label = segs.map((s) => `${s.label} ${Math.round(s.w * 100)}%`).join(' · ');
  return (
    <div
      className={cn('w-full', className)}
      role="img"
      aria-label={`Combined pressure mix: ${label}`}
    >
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border/60 bg-muted/60 shadow-inner">
        {segs.map((s) => (
          <div
            key={s.key}
            title={`${s.label} ${Math.round(s.w * 100)}%`}
            className={cn(s.className, 'min-w-0 shrink-0 transition-[flex-grow] duration-200')}
            style={{
              flexGrow: Math.max(s.w, 0.001),
              flexBasis: s.w < 0.04 ? 4 : 0,
              maxWidth: s.w < 1e-6 ? 0 : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact curve vs linear reference for dropdown rows and trigger. */
function CurveTransferSparkline({
  curve,
  gamma,
  className,
}: {
  curve: RiskHeatmapCurveId;
  gamma: number;
  className?: string;
}) {
  const W = 52;
  const H = 20;
  const pad = 2;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const g = Math.min(3, Math.max(0.35, gamma));
  const steps = 20;
  const toX = (t: number) => pad + t * innerW;
  const toY = (out: number) => pad + innerH - out * innerH;
  const ptsCurve: string[] = [];
  const ptsLin: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ptsCurve.push(`${toX(t).toFixed(1)},${toY(applyRiskHeatmapTransfer(t, curve, g)).toFixed(1)}`);
    ptsLin.push(`${toX(t).toFixed(1)},${toY(t).toFixed(1)}`);
  }
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={cn('shrink-0 text-foreground', className)}
      aria-hidden
    >
      <polyline
        fill="none"
        points={ptsLin.join(' ')}
        className="stroke-muted-foreground/45"
        strokeWidth={1}
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        fill="none"
        points={ptsCurve.join(' ')}
        className="stroke-primary"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function AdvancedDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-border/50 bg-muted/10 open:border-border/60 open:bg-muted/[0.14]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted/25 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
          aria-hidden
        />
        {title}
      </summary>
      <div className="border-t border-border/45 px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}

export function RiskModelPanel() {
  const [expanded, setExpanded] = useState(true);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const riskHeatmapGamma = useAtcStore((s) => s.riskHeatmapGamma);
  const riskHeatmapCurve = useAtcStore((s) => s.riskHeatmapCurve);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);
  const resetRiskTuning = useAtcStore((s) => s.resetRiskTuning);
  const setRiskHeatmapGamma = useAtcStore((s) => s.setRiskHeatmapGamma);
  const setRiskHeatmapCurve = useAtcStore((s) => s.setRiskHeatmapCurve);
  const riskHeatmapStressCutoff = useAtcStore((s) => s.riskHeatmapStressCutoff);
  const setRiskHeatmapStressCutoff = useAtcStore((s) => s.setRiskHeatmapStressCutoff);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const setHeatmapRenderStyle = useAtcStore((s) => s.setHeatmapRenderStyle);
  const setHeatmapMonoColor = useAtcStore((s) => s.setHeatmapMonoColor);
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);

  const curveHint = RISK_HEATMAP_CURVE_OPTIONS.find((o) => o.id === riskHeatmapCurve)?.hint;

  const weights = useMemo(() => normalizedRiskWeights(riskTuning), [riskTuning]);

  const yamlCampaignScaleFocused = useMemo(() => {
    if (isRunwayAllMarkets(country)) return null;
    const c = configs.find((x) => x.market === country);
    const y = c?.tradingPressure?.campaign_effect_scale;
    const n = y != null && Number.isFinite(y) ? y : 1;
    return Math.min(2.5, Math.max(0, n));
  }, [country, configs]);

  const uiCampaignMult = snapCampaignUiMultiplier(riskTuning.campaignEffectUiMultiplier);
  const effectiveCampaignScale =
    yamlCampaignScaleFocused != null
      ? Math.min(2.5, Math.max(0, yamlCampaignScaleFocused * uiCampaignMult))
      : null;

  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const blendSummary = `Tech ${pct(weights.tech)} · Restaurant ${pct(weights.store)} · Marketing ${pct(weights.campaign)} · Resources ${pct(weights.holiday)}`;

  const curveLabel = RISK_HEATMAP_CURVE_OPTIONS.find((o) => o.id === riskHeatmapCurve)?.label ?? riskHeatmapCurve;

  const curveSelect = (
    <Select value={riskHeatmapCurve} onValueChange={(v) => setRiskHeatmapCurve(v as RiskHeatmapCurveId)}>
      <SelectTrigger
        id="risk-heatmap-curve"
        className="relative h-9 w-full justify-start px-3 pr-9 text-xs [&>svg:last-of-type]:pointer-events-none [&>svg:last-of-type]:absolute [&>svg:last-of-type]:right-2.5 [&>svg:last-of-type]:top-1/2 [&>svg:last-of-type]:-translate-y-1/2 [&>svg:last-of-type]:shrink-0"
      >
        <span className="flex min-w-0 w-full flex-1 justify-center">
          <SelectValue placeholder="Curve" />
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-[min(22rem,72vh)]">
        {RISK_HEATMAP_CURVE_OPTIONS.map((o) => (
          <SelectItem
            key={o.id}
            value={o.id}
            className="cursor-pointer py-2 pl-8 pr-8 text-xs"
            itemTextClassName="flex flex-1 justify-center"
          >
            <span className="flex items-center justify-center gap-2.5">
              <CurveTransferSparkline curve={o.id} gamma={riskHeatmapGamma} />
              <span className="min-w-0 shrink leading-snug">{o.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const collapsedSummary = (
    <span className="text-[11px] tabular-nums text-muted-foreground">
      <span className="font-medium text-foreground/90">{curveLabel}</span>
      {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
        <span>{' · '}γ {snapGammaUi(riskHeatmapGamma).toFixed(2)}</span>
      ) : null}
    </span>
  );

  return (
    <RightPanelSection
      expanded={expanded}
      onExpandedChange={setExpanded}
      title="Pressure heatmap"
      collapsedSummary={collapsedSummary}
      headerExtras={
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => resetRiskTuning()}>
          Reset
        </Button>
      }
    >
      <div className="flex min-h-0 flex-col gap-4 overflow-x-hidden border-t border-border/50 px-3 pb-4 pt-3">
        <section className="space-y-2">
          <BlendStackBar weights={weights} />
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="tabular-nums text-foreground/85">{blendSummary}</span>
            <span className="text-muted-foreground"> — combined lens for Tech &amp; Business views.</span>
          </p>
        </section>

        <section className="space-y-3 rounded-lg border border-primary/15 bg-primary/[0.04] p-3 dark:bg-primary/[0.06]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Colour mapping</h3>
            <p className="max-w-[16rem] text-right text-[10px] leading-snug text-muted-foreground">
              <span className="font-mono text-foreground/80">risk_heatmap_curve</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-mono text-foreground/80">risk_heatmap_gamma</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-mono text-foreground/80">risk_heatmap_gamma_tech</span>
              <span className="text-muted-foreground"> / </span>
              <span className="font-mono text-foreground/80">_business</span>
            </p>
          </div>
          {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-x-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="risk-heatmap-curve" className="text-xs font-normal">
                  Transfer curve
                </Label>
                {curveSelect}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="risk-heatmap-gamma" className="text-xs font-normal">
                  γ strength
                </Label>
                <div className="flex h-9 items-center">
                  <input
                    id="risk-heatmap-gamma"
                    type="range"
                    min={GAMMA_UI_MIN}
                    max={GAMMA_UI_MAX}
                    step={GAMMA_UI_STEP}
                    value={snapGammaUi(riskHeatmapGamma)}
                    onChange={(e) => setRiskHeatmapGamma(Number(e.target.value))}
                    className="h-3 w-full min-w-[7rem] cursor-pointer accent-primary"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-normal text-muted-foreground">γ</span>
                <div
                  role="status"
                  aria-live="polite"
                  className="flex h-9 min-w-[4rem] items-center justify-center rounded-md border border-border/60 bg-background/80 px-2 dark:bg-background/50"
                >
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {snapGammaUi(riskHeatmapGamma).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="risk-heatmap-curve" className="text-xs font-normal">
                Transfer curve
              </Label>
              {curveSelect}
            </div>
          )}
          {curveHint ? <p className="text-[10px] leading-snug text-muted-foreground">{curveHint}</p> : null}
          {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
            riskHeatmapCurve === 'power' ? (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Power: γ &gt; 1 favours cool at low values; γ &lt; 1 lifts mids warm. Apply DSL writes{' '}
                <span className="font-mono text-foreground/80">risk_heatmap_gamma</span>,{' '}
                <span className="font-mono text-foreground/80">risk_heatmap_gamma_tech</span>,{' '}
                <span className="font-mono text-foreground/80">risk_heatmap_gamma_business</span> when γ ≠ 1.
              </p>
            ) : (
              <p className="text-[10px] leading-snug text-muted-foreground">
                γ steers steepness (sigmoid) or compression (log). Omit{' '}
                <span className="font-mono text-foreground/80">risk_heatmap_gamma</span> in YAML when γ = 1.
              </p>
            )
          ) : null}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Same ramp for both lenses after each lens’s own metric (0–1). Per-lens γ in YAML; Apply DSL syncs keys.
          </p>
        </section>

        <AdvancedDisclosure title="Trading & campaign overlays">
          <div className="flex flex-col gap-4">
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-x-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium leading-none text-foreground">
                  Post-payday / month-start trading lift
                </span>
                <div className="flex h-9 items-center">
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    Peak on YAML <span className="font-mono text-foreground/75">store_pressure</span> rhythm
                  </span>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="payday-month-peak" className="text-xs font-normal">
                  Strength
                </Label>
                <div className="flex h-9 items-center">
                  <input
                    id="payday-month-peak"
                    type="range"
                    min={PAYDAY_UI_MIN}
                    max={PAYDAY_UI_MAX}
                    step={PAYDAY_UI_STEP}
                    value={snapPaydayPeakUi(riskTuning.storePaydayMonthPeakMultiplier)}
                    onChange={(e) =>
                      setRiskTuning({ storePaydayMonthPeakMultiplier: Number(e.target.value) })
                    }
                    className="h-3 w-full min-w-[7rem] cursor-pointer accent-primary"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-normal text-muted-foreground">×</span>
                <div
                  role="status"
                  aria-live="polite"
                  aria-label={`Post-payday month-start lift ${snapPaydayPeakUi(riskTuning.storePaydayMonthPeakMultiplier).toFixed(2)} times`}
                  className="flex h-9 min-w-[4.5rem] items-center justify-center rounded-lg border border-border/60 bg-muted/35 px-3 dark:bg-muted/20"
                >
                  <span className="text-2xl font-extrabold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.65rem]">
                    {snapPaydayPeakUi(riskTuning.storePaydayMonthPeakMultiplier).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Peak multiplier on YAML-derived restaurant / trading pressure in the{' '}
              <strong className="font-medium text-foreground">first week</strong> of each calendar month, tapering toward{' '}
              <strong className="font-medium text-foreground">month-end</strong>.{' '}
              <strong className="font-medium text-foreground">1.00×</strong> = off; default{' '}
              <strong className="font-medium text-foreground">1.15×</strong> (clamped 1–2) before capping{' '}
              <span className="font-mono text-foreground/80">store_pressure</span> at 1.
            </p>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-x-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="campaign-effect-ui-mult" className="text-xs font-normal">
                  Campaign scenario overlay
                </Label>
                <div className="flex min-h-9 flex-col justify-center gap-0.5">
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    Multiplier on each market’s YAML{' '}
                    <span className="font-mono text-foreground/75">campaign_effect_scale</span> (default{' '}
                    <strong className="font-medium text-foreground">1</strong>)
                  </span>
                  {effectiveCampaignScale != null && yamlCampaignScaleFocused != null ? (
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      <strong className="font-medium text-foreground">Effective</strong> for runway focus{' '}
                      <span className="font-mono text-foreground/80">{country}</span>:{' '}
                      <span className="tabular-nums text-foreground">{effectiveCampaignScale.toFixed(2)}×</span>
                      <span className="text-muted-foreground">
                        {' '}
                        (= {yamlCampaignScaleFocused.toFixed(2)} YAML × {uiCampaignMult.toFixed(2)} slider, clamped 0–2.5)
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      Pick a single market as runway focus to see the effective product for that file.
                    </span>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="campaign-effect-ui-mult" className="text-xs font-normal">
                  Slider
                </Label>
                <div className="flex h-9 items-center">
                  <input
                    id="campaign-effect-ui-mult"
                    type="range"
                    min={CAMPAIGN_UI_MIN}
                    max={CAMPAIGN_UI_MAX}
                    step={CAMPAIGN_UI_STEP}
                    value={uiCampaignMult}
                    onChange={(e) =>
                      setRiskTuning({ campaignEffectUiMultiplier: Number(e.target.value) })
                    }
                    className="h-3 w-full min-w-[7rem] cursor-pointer accent-primary"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-normal text-muted-foreground">×</span>
                <div
                  role="status"
                  aria-live="polite"
                  aria-label={`Campaign scenario multiplier ${uiCampaignMult.toFixed(2)} times`}
                  className="flex h-9 min-w-[4.5rem] items-center justify-center rounded-lg border border-border/60 bg-muted/35 px-3 dark:bg-muted/20"
                >
                  <span className="text-2xl font-extrabold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.65rem]">
                    {uiCampaignMult.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Slider × YAML <span className="font-mono text-foreground/80">campaign_effect_scale</span> for focused
              market. <strong className="font-medium text-foreground">1×</strong> = match DSL; <strong className="font-medium text-foreground">0×</strong> = off. UI-only — blend bar above is not persisted in YAML.
            </p>
          </div>
        </AdvancedDisclosure>

        <AdvancedDisclosure title="YAML weekly & monthly patterns">
          <p className="mb-3 text-[10px] leading-snug text-muted-foreground">
            Writes <span className="font-mono text-foreground/80">tech.weekly_pattern</span> and{' '}
            <span className="font-mono text-foreground/80">trading.monthly_pattern</span> for the runway focus market when you Apply DSL.
          </p>
          <TechWeeklyRhythmPanel />
        </AdvancedDisclosure>

        <AdvancedDisclosure title="Cell appearance">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-normal">Palette</Label>
              <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/20 p-1">
                <button
                  type="button"
                  onClick={() => setHeatmapRenderStyle('spectrum')}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    heatmapRenderStyle === 'spectrum'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Temperature bands
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapRenderStyle('mono')}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    heatmapRenderStyle === 'mono'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Single colour
                </button>
              </div>
              {heatmapRenderStyle === 'mono' ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Opacity follows intensity after curve + γ; dim-low-scores still applies.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {HEATMAP_MONO_COLOR_PRESETS.map((p) => {
                      const on = heatmapMonoColor.toLowerCase() === p.hex.toLowerCase();
                      return (
                        <button
                          key={p.hex}
                          type="button"
                          title={`${p.label} (${p.hex})`}
                          aria-label={`Use ${p.label} ${p.hex}`}
                          aria-pressed={on}
                          onClick={() => setHeatmapMonoColor(p.hex)}
                          className={cn(
                            'h-8 w-8 shrink-0 rounded-md border-2 transition-transform',
                            on ? 'border-primary ring-2 ring-primary/35' : 'border-border/80 hover:border-border'
                          )}
                          style={{ backgroundColor: p.hex }}
                        />
                      );
                    })}
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="sr-only">Custom colour</span>
                      <input
                        type="color"
                        value={heatmapMonoColor}
                        onChange={(e) => setHeatmapMonoColor(e.target.value)}
                        className="h-8 w-10 cursor-pointer overflow-hidden rounded border border-border bg-background p-0"
                      />
                      Custom
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Multi-band ramp. Switch to single colour for print-friendly export.
                </p>
              )}
            </div>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-x-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium leading-none text-foreground">Dim low scores</span>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Fades cells below threshold (after curve + γ). UI-only.
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="risk-heatmap-stress-cutoff" className="text-xs font-normal">
                  Threshold
                </Label>
                <div className="flex h-9 items-center">
                  <input
                    id="risk-heatmap-stress-cutoff"
                    type="range"
                    min={0}
                    max={STRESS_CUT_UI_MAX}
                    step={STRESS_CUT_UI_STEP}
                    value={snapStressCutUi(riskHeatmapStressCutoff)}
                    onChange={(e) => setRiskHeatmapStressCutoff(Number(e.target.value))}
                    className="h-3 w-full min-w-[7rem] cursor-pointer accent-primary"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-normal text-muted-foreground">Below</span>
                <div
                  role="status"
                  aria-live="polite"
                  className="flex h-9 min-w-[4.5rem] items-center justify-center rounded-lg border border-border/60 bg-muted/35 px-3 dark:bg-muted/20"
                >
                  {snapStressCutUi(riskHeatmapStressCutoff) <= 0 ? (
                    <span className="text-sm font-bold tabular-nums text-muted-foreground">Off</span>
                  ) : (
                    <span className="text-xl font-extrabold tabular-nums leading-none text-foreground">
                      {Math.round(snapStressCutUi(riskHeatmapStressCutoff) * 100)}
                      <span className="text-base font-bold">%</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </AdvancedDisclosure>
      </div>
    </RightPanelSection>
  );
}
