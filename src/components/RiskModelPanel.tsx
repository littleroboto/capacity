import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
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
import { Palette } from 'lucide-react';

/** Slider step in γ (0.1 = coarser than the old 0.05 centi-step). */
const GAMMA_UI_MIN = 0.35;
const GAMMA_UI_MAX = 3;
const GAMMA_UI_STEP = 0.1;

const CAMPAIGN_UI_MIN = 0;
const CAMPAIGN_UI_MAX = 2.5;
const CAMPAIGN_UI_STEP = 0.05;

function snapCampaignUiMultiplier(n: number): number {
  const s = Math.round(n / CAMPAIGN_UI_STEP) * CAMPAIGN_UI_STEP;
  return Math.min(CAMPAIGN_UI_MAX, Math.max(CAMPAIGN_UI_MIN, Math.round(s * 100) / 100));
}

function snapGammaUi(gamma: number): number {
  const s = Math.round(gamma / GAMMA_UI_STEP) * GAMMA_UI_STEP;
  return Math.min(GAMMA_UI_MAX, Math.max(GAMMA_UI_MIN, Math.round(s * 100) / 100));
}

/** Tab ids for Heatmap adjustments (stable for UI state). */
const HEATMAP_TAB = {
  powerCurves: 'power-curves',
  yamlPatterns: 'yaml-patterns',
  cellAppearance: 'cell-appearance',
} as const;
type HeatmapTabId = (typeof HEATMAP_TAB)[keyof typeof HEATMAP_TAB];

/** Tuning rows: fixed label column, flexible slider track, fixed readout (γ + Campaign Boost aligned). */
const TUNING_CONTROL_GRID =
  'grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] sm:items-end sm:gap-x-3';
const TUNING_VALUE_HDR = 'text-xs font-normal text-muted-foreground';
const TUNING_VALUE_BOX =
  'flex h-9 w-[4.5rem] shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 px-2 dark:bg-background/50';
const TUNING_VALUE_TEXT = 'text-lg font-bold tabular-nums leading-none text-foreground';
const TUNING_RANGE = 'h-3 w-full min-w-0 cursor-pointer accent-primary';

const HEATMAP_TAB_CONFIG: readonly { id: HeatmapTabId; label: string; title: string }[] = [
  {
    id: HEATMAP_TAB.powerCurves,
    label: 'Tuning',
    title: 'Transfer curve, γ, campaign overlay',
  },
  {
    id: HEATMAP_TAB.yamlPatterns,
    label: 'Trading Patterns',
    title: 'Tech weekly, monthly trading weightings, early-month store boost (Apply DSL to write YAML)',
  },
  { id: HEATMAP_TAB.cellAppearance, label: 'Colours', title: 'Heatmap colours — spectrum vs mono' },
];

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

export function RiskModelPanel() {
  const [expanded, setExpanded] = useState(false);
  const [heatmapTab, setHeatmapTab] = useState<HeatmapTabId>(HEATMAP_TAB.powerCurves);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const riskHeatmapGamma = useAtcStore((s) => s.riskHeatmapGamma);
  const riskHeatmapCurve = useAtcStore((s) => s.riskHeatmapCurve);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);
  const resetRiskTuning = useAtcStore((s) => s.resetRiskTuning);
  const setRiskHeatmapGamma = useAtcStore((s) => s.setRiskHeatmapGamma);
  const setRiskHeatmapCurve = useAtcStore((s) => s.setRiskHeatmapCurve);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const setHeatmapRenderStyle = useAtcStore((s) => s.setHeatmapRenderStyle);
  const setHeatmapMonoColor = useAtcStore((s) => s.setHeatmapMonoColor);
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);

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

  const curveLabel = RISK_HEATMAP_CURVE_OPTIONS.find((o) => o.id === riskHeatmapCurve)?.label ?? riskHeatmapCurve;

  const curveSelect = (
    <Select value={riskHeatmapCurve} onValueChange={(v) => setRiskHeatmapCurve(v as RiskHeatmapCurveId)}>
      <SelectTrigger
        id="risk-heatmap-curve"
        aria-label="Transfer curve"
        className="relative h-9 w-full justify-start gap-2 px-3 pr-9 text-xs [&>svg:last-of-type]:pointer-events-none [&>svg:last-of-type]:absolute [&>svg:last-of-type]:right-2.5 [&>svg:last-of-type]:top-1/2 [&>svg:last-of-type]:-translate-y-1/2 [&>svg:last-of-type]:shrink-0"
      >
        <CurveTransferSparkline
          curve={riskHeatmapCurve}
          gamma={riskHeatmapGamma}
          className="pointer-events-none shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-left font-medium text-foreground">{curveLabel}</span>
      </SelectTrigger>
      <SelectContent className="max-h-[min(22rem,72vh)]">
        {RISK_HEATMAP_CURVE_OPTIONS.map((o) => (
          <SelectItem
            key={o.id}
            value={o.id}
            className="cursor-pointer py-2 pl-8 pr-8 text-xs"
            itemTextClassName="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <CurveTransferSparkline curve={o.id} gamma={riskHeatmapGamma} className="shrink-0" />
            <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <RightPanelSection
        expanded={expanded}
        onExpandedChange={setExpanded}
        title="Heatmap adjustments"
        collapsedSummary={collapsedSummary}
        headerExtras={
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => resetRiskTuning()}>
            Reset
          </Button>
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-x-hidden overflow-y-hidden border-t border-border/50 bg-background/25 px-3 pb-3 pt-3 dark:bg-background/20">
          <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-card-foreground shadow-sm ring-1 ring-border/50 dark:ring-border/40">
            <div
              role="tablist"
              aria-label="Heatmap tuning sections"
              className="flex shrink-0 flex-wrap gap-1 border-b border-border bg-muted/40 p-1.5 dark:bg-muted/25"
            >
              {HEATMAP_TAB_CONFIG.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`heatmap-tab-${t.id}`}
                  aria-selected={heatmapTab === t.id}
                  aria-controls="heatmap-adjustments-panel"
                  title={t.title}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-left text-[11px] font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    heatmapTab === t.id
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                  onClick={() => setHeatmapTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div
              id="heatmap-adjustments-panel"
              role="tabpanel"
              aria-labelledby={`heatmap-tab-${heatmapTab}`}
              className="min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 pb-3 pt-3 [-webkit-overflow-scrolling:touch]"
            >
              {heatmapTab === HEATMAP_TAB.powerCurves ? (
                <div className="space-y-4">
                  {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
                    <div className={TUNING_CONTROL_GRID}>
                      <div className="flex min-w-0 flex-col gap-1">{curveSelect}</div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <Label htmlFor="risk-heatmap-gamma" className="text-xs font-normal">
                          γ
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
                            className={TUNING_RANGE}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className={TUNING_VALUE_HDR}>γ</span>
                        <div role="status" aria-live="polite" className={TUNING_VALUE_BOX}>
                          <span className={TUNING_VALUE_TEXT}>
                            {snapGammaUi(riskHeatmapGamma).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-col">{curveSelect}</div>
                  )}

                  <div className={TUNING_CONTROL_GRID}>
                    <div className="flex min-w-0 flex-col gap-1">
                      <Label htmlFor="campaign-effect-ui-mult" className="text-xs font-normal">
                        Campaign Boost
                      </Label>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="h-4 shrink-0" aria-hidden />
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
                          className={TUNING_RANGE}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={TUNING_VALUE_HDR}>×</span>
                      <div
                        role="status"
                        aria-live="polite"
                        aria-label={
                          effectiveCampaignScale != null
                            ? `Campaign overlay ${uiCampaignMult.toFixed(2)}×, effective ${effectiveCampaignScale.toFixed(2)}× for ${country}`
                            : `Campaign overlay ${uiCampaignMult.toFixed(2)}×`
                        }
                        title={
                          effectiveCampaignScale != null && yamlCampaignScaleFocused != null
                            ? `Effective ${effectiveCampaignScale.toFixed(2)}× (${yamlCampaignScaleFocused.toFixed(2)} YAML × ${uiCampaignMult.toFixed(2)})`
                            : 'Focus a single market to combine with YAML campaign_effect_scale'
                        }
                        className={TUNING_VALUE_BOX}
                      >
                        <span className={TUNING_VALUE_TEXT}>{uiCampaignMult.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : heatmapTab === HEATMAP_TAB.yamlPatterns ? (
                <TechWeeklyRhythmPanel />
              ) : (
            <div className="rounded-lg border border-border/50 bg-background/70 p-3.5 shadow-sm ring-1 ring-border/20 dark:bg-background/25">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/40 text-muted-foreground dark:bg-muted/25">
                    <Palette className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Palette</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                      Heatmap fill style for the runway cells.
                    </p>
                  </div>
                </div>
                {heatmapRenderStyle === 'spectrum' ? (
                  <div
                    className="mt-0.5 h-2.5 w-[5.5rem] shrink-0 rounded-full bg-gradient-to-r from-sky-600 via-amber-500 to-rose-600 shadow-inner ring-1 ring-border/40 dark:from-sky-500 dark:via-amber-400 dark:to-rose-500"
                    title="Temperature-style ramp preview"
                    aria-hidden
                  />
                ) : (
                  <div
                    className="mt-0.5 h-2.5 w-[5.5rem] shrink-0 rounded-full shadow-inner ring-1 ring-border/50"
                    style={{ backgroundColor: heatmapMonoColor }}
                    title="Current mono colour"
                    aria-hidden
                  />
                )}
              </div>

              <div className="inline-flex w-full max-w-full rounded-lg border border-border/60 bg-muted/25 p-1 dark:bg-muted/15">
                <button
                  type="button"
                  onClick={() => setHeatmapRenderStyle('spectrum')}
                  className={cn(
                    'min-h-9 flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all duration-150',
                    heatmapRenderStyle === 'spectrum'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/80'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  )}
                >
                  Temperature bands
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapRenderStyle('mono')}
                  className={cn(
                    'min-h-9 flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all duration-150',
                    heatmapRenderStyle === 'mono'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/80'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  )}
                >
                  Single colour
                </button>
              </div>

              {heatmapRenderStyle === 'mono' ? (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    Opacity tracks intensity after curve and γ.
                  </p>
                  <div>
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/90">
                      Colour
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                              'relative h-6 w-6 shrink-0 rounded-full transition-transform duration-150',
                              'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
                              on
                                ? 'z-[1] scale-105 ring-2 ring-foreground/90 ring-offset-1 ring-offset-background dark:ring-white/90'
                                : 'ring-1 ring-black/12 hover:scale-110 hover:brightness-110 dark:ring-white/20'
                            )}
                            style={{ backgroundColor: p.hex }}
                          />
                        );
                      })}
                      {(() => {
                        const customActive = !HEATMAP_MONO_COLOR_PRESETS.some(
                          (p) => heatmapMonoColor.toLowerCase() === p.hex.toLowerCase()
                        );
                        return (
                          <label
                            className={cn(
                              'relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full transition-transform duration-150',
                              'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                              customActive
                                ? 'z-[1] scale-105 ring-2 ring-foreground/90 ring-offset-1 ring-offset-background dark:ring-white/90'
                                : 'ring-1 ring-dashed ring-muted-foreground/45 hover:ring-muted-foreground/70'
                            )}
                            title={`Custom colour (${heatmapMonoColor})`}
                          >
                            <span className="sr-only">Custom colour</span>
                            <span
                              className="pointer-events-none absolute inset-0 rounded-full"
                              style={{ backgroundColor: heatmapMonoColor }}
                              aria-hidden
                            />
                            <input
                              type="color"
                              value={heatmapMonoColor}
                              onChange={(e) => setHeatmapMonoColor(e.target.value)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </label>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                  Full spectrum ramp. Use single colour for print-friendly or brand-tinted exports.
                </p>
              )}
            </div>
              )}
            </div>
          </div>
        </div>
      </RightPanelSection>
    </div>
  );
}
