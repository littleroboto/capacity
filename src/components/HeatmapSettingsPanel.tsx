import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  RISK_HEATMAP_CURVE_OPTIONS,
  applyRiskHeatmapTransfer,
  riskHeatmapCurveUsesGamma,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';
import { HEATMAP_MONO_COLOR_PRESETS } from '@/lib/riskHeatmapColors';
import { isRunwayAllMarkets } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import {
  DEFAULT_MARKET_RISK_SCALES,
  type MarketRiskComponentScales,
} from '@/engine/riskModelTuning';
import { cn } from '@/lib/utils';
import { Palette } from 'lucide-react';

const GAMMA_UI_MIN = 0.35;
const GAMMA_UI_MAX = 3;
const GAMMA_UI_STEP = 0.1;

const CAMPAIGN_UI_MIN = 0;
const CAMPAIGN_UI_MAX = 2.5;
const CAMPAIGN_UI_STEP = 0.05;

const MR_SCALE_MAX = 4;
const MR_SCALE_STEP = 0.05;

const MARKET_RISK_SCALE_ROWS: {
  key: keyof MarketRiskComponentScales;
  label: string;
  hint?: string;
}[] = [
  { key: 'yearEndWeekRamp', label: 'Year-end weekly ramp', hint: '12 steps to 31 Dec (base weight in engine)' },
  { key: 'primaryMonthCurve', label: 'Primary deployment month curve', hint: 'deployment_risk_month_curve + defaults' },
  { key: 'contextMonthCurve', label: 'Context month curve', hint: 'deployment_risk_context_month_curve' },
  { key: 'holidays', label: 'Public + school holidays' },
  { key: 'storeConsequence', label: 'Store consequence' },
  { key: 'withinWeekLoad', label: 'Within-week load shape' },
  { key: 'storePeakInteraction', label: 'Busy week × store hot' },
  { key: 'campaignLinear', label: 'Campaign (linear term)', hint: 'Independent of Campaign Boost slider' },
  { key: 'campaignPeakInteraction', label: 'Campaign × busy week' },
  { key: 'events', label: 'Deployment events' },
  { key: 'blackouts', label: 'Blackouts' },
  { key: 'resourcingStrain', label: 'Tech / resourcing strain' },
];

function snapMarketRiskScale(n: number): number {
  const s = Math.round(n / MR_SCALE_STEP) * MR_SCALE_STEP;
  return Math.min(MR_SCALE_MAX, Math.max(0, Math.round(s * 100) / 100));
}

function snapCampaignUiMultiplier(n: number): number {
  const s = Math.round(n / CAMPAIGN_UI_STEP) * CAMPAIGN_UI_STEP;
  return Math.min(CAMPAIGN_UI_MAX, Math.max(CAMPAIGN_UI_MIN, Math.round(s * 100) / 100));
}

function snapGammaUi(gamma: number): number {
  const s = Math.round(gamma / GAMMA_UI_STEP) * GAMMA_UI_STEP;
  return Math.min(GAMMA_UI_MAX, Math.max(GAMMA_UI_MIN, Math.round(s * 100) / 100));
}

const TUNING_CONTROL_GRID =
  'grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] sm:items-end sm:gap-x-3';
const TUNING_VALUE_HDR = 'text-xs font-normal text-muted-foreground';
const TUNING_VALUE_BOX =
  'flex h-9 w-[4.5rem] shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 px-2 dark:bg-background/50';
const TUNING_VALUE_TEXT = 'text-lg font-bold tabular-nums leading-none text-foreground';
const TUNING_RANGE = 'h-3 w-full min-w-0 cursor-pointer accent-primary';

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

type HeatmapSettingsPanelProps = {
  /** When false, Campaign Boost row is omitted (Technology Teams lens). */
  showCampaignBoost: boolean;
  /** Market risk lens: per-component scalers for deployment_risk_01 only. */
  showMarketRiskScales?: boolean;
};

/** Transfer curve, γ, optional campaign overlay, heatmap palette — for Settings dialog. */
export function HeatmapSettingsPanel({ showCampaignBoost, showMarketRiskScales }: HeatmapSettingsPanelProps) {
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const riskHeatmapGamma = useAtcStore((s) => s.riskHeatmapGamma);
  const riskHeatmapCurve = useAtcStore((s) => s.riskHeatmapCurve);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);
  const setRiskHeatmapGamma = useAtcStore((s) => s.setRiskHeatmapGamma);
  const setRiskHeatmapCurve = useAtcStore((s) => s.setRiskHeatmapCurve);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const setHeatmapRenderStyle = useAtcStore((s) => s.setHeatmapRenderStyle);
  const setHeatmapMonoColor = useAtcStore((s) => s.setHeatmapMonoColor);
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);

  const yamlCampaignScaleFocused = (() => {
    if (isRunwayAllMarkets(country)) return null;
    const c = configs.find((x) => x.market === country);
    const y = c?.tradingPressure?.campaign_effect_scale;
    const n = y != null && Number.isFinite(y) ? y : 1;
    return Math.min(2.5, Math.max(0, n));
  })();

  const uiCampaignMult = snapCampaignUiMultiplier(riskTuning.campaignEffectUiMultiplier);
  const effectiveCampaignScale =
    yamlCampaignScaleFocused != null
      ? Math.min(2.5, Math.max(0, yamlCampaignScaleFocused * uiCampaignMult))
      : null;

  const curveLabel = RISK_HEATMAP_CURVE_OPTIONS.find((o) => o.id === riskHeatmapCurve)?.label ?? riskHeatmapCurve;

  const curveSelect = (
    <Select value={riskHeatmapCurve} onValueChange={(v) => setRiskHeatmapCurve(v as RiskHeatmapCurveId)}>
      <SelectTrigger
        id="risk-heatmap-curve-settings"
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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
          <div className={TUNING_CONTROL_GRID}>
            <div className="flex min-w-0 flex-col gap-1">{curveSelect}</div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="risk-heatmap-gamma-settings" className="text-xs font-normal">
                γ
              </Label>
              <div className="flex h-9 items-center">
                <input
                  id="risk-heatmap-gamma-settings"
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
                <span className={TUNING_VALUE_TEXT}>{snapGammaUi(riskHeatmapGamma).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col">{curveSelect}</div>
        )}

        {showCampaignBoost ? (
          <div className={TUNING_CONTROL_GRID}>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="campaign-effect-ui-mult-settings" className="text-xs font-normal">
                Campaign Boost
              </Label>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="h-4 shrink-0" aria-hidden />
              <div className="flex h-9 items-center">
                <input
                  id="campaign-effect-ui-mult-settings"
                  type="range"
                  min={CAMPAIGN_UI_MIN}
                  max={CAMPAIGN_UI_MAX}
                  step={CAMPAIGN_UI_STEP}
                  value={uiCampaignMult}
                  onChange={(e) => setRiskTuning({ campaignEffectUiMultiplier: Number(e.target.value) })}
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
        ) : null}
      </div>

      {showMarketRiskScales ? (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <div>
            <p className="text-xs font-semibold text-foreground">Market risk component scales</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Multiply each piece of the deployment-risk sum (0–4×). Does <strong className="font-medium text-foreground/90">not</strong>{' '}
              change the global <span className="font-mono text-foreground/80">Campaign Boost</span> slider above—use{' '}
              <span className="font-mono text-foreground/80">Campaign (linear)</span> /{' '}
              <span className="font-mono text-foreground/80">Campaign × busy week</span> here to tune Market risk only.
            </p>
            <button
              type="button"
              className="mt-2 text-[10px] font-medium text-primary underline-offset-2 hover:underline"
              onClick={() =>
                setRiskTuning({ marketRiskScales: { ...DEFAULT_MARKET_RISK_SCALES } })
              }
            >
              Reset all to 1×
            </button>
          </div>
          <div className="max-h-[min(22rem,50vh)] space-y-2.5 overflow-y-auto pr-1">
            {MARKET_RISK_SCALE_ROWS.map(({ key, label, hint }) => {
              const v = snapMarketRiskScale(riskTuning.marketRiskScales[key]);
              return (
                <div key={key} className={TUNING_CONTROL_GRID}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[11px] font-medium leading-tight text-foreground">{label}</span>
                    {hint ? (
                      <span className="text-[9px] leading-snug text-muted-foreground">{hint}</span>
                    ) : null}
                  </div>
                  <div className="flex h-9 items-center">
                    <input
                      type="range"
                      min={0}
                      max={MR_SCALE_MAX}
                      step={MR_SCALE_STEP}
                      value={v}
                      aria-label={`${label} scale`}
                      onChange={(e) =>
                        setRiskTuning({
                          marketRiskScales: {
                            ...riskTuning.marketRiskScales,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                      className={TUNING_RANGE}
                    />
                  </div>
                  <div className={TUNING_VALUE_BOX}>
                    <span className="text-sm font-bold tabular-nums text-foreground">{v.toFixed(2)}×</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="border-t border-border/60 pt-1">
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
      </div>
    </div>
  );
}
