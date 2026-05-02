import { useMemo } from 'react';
import { HeatmapBusinessPressureOffsetControls } from '@/components/HeatmapBusinessPressureOffsetControls';
import { HeatmapTransferControls } from '@/components/HeatmapTransferControls';
import { Label } from '@/components/ui/label';
import { HEATMAP_TUNING_LENS_IDS, labelForHeatmapTuningLens } from '@/lib/heatmapTuningPerLens';
import { HEATMAP_MONO_COLOR_PRESETS } from '@/lib/riskHeatmapColors';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';
import { Palette } from 'lucide-react';

const CAMPAIGN_UI_MIN = 0;
const CAMPAIGN_UI_MAX = 2.5;
const CAMPAIGN_UI_STEP = 0.05;

function snapCampaignUiMultiplier(n: number): number {
  const s = Math.round(n / CAMPAIGN_UI_STEP) * CAMPAIGN_UI_STEP;
  return Math.min(CAMPAIGN_UI_MAX, Math.max(CAMPAIGN_UI_MIN, Math.round(s * 100) / 100));
}

const TUNING_CONTROL_GRID =
  'grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] sm:items-end sm:gap-x-3';
const TUNING_VALUE_HDR = 'text-xs font-normal text-muted-foreground';
const TUNING_VALUE_BOX =
  'flex h-9 w-[4.5rem] shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 px-2 dark:bg-background/50';
const TUNING_VALUE_TEXT = 'text-lg font-bold tabular-nums leading-none text-foreground';
const TUNING_RANGE = 'h-3 w-full min-w-0 cursor-pointer accent-primary';

type HeatmapSettingsPanelProps = {
  /** When false, Campaign Boost row is omitted (Technology Teams lens). */
  showCampaignBoost: boolean;
  /**
   * When false, heatmap transfer is omitted here — Restaurant Activity tuning may live in admin trading fragments (same global
   * store as Settings for other lenses).
   */
  showHeatmapTransferTuning: boolean;
};

/** Campaign overlay, optional heatmap transfer, heatmap palette — for Settings dialog. */
export function HeatmapSettingsPanel({ showCampaignBoost, showHeatmapTransferTuning }: HeatmapSettingsPanelProps) {
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const heatmapSpectrumContinuous = useAtcStore((s) => s.heatmapSpectrumContinuous);
  const setHeatmapRenderStyle = useAtcStore((s) => s.setHeatmapRenderStyle);
  const setHeatmapMonoColor = useAtcStore((s) => s.setHeatmapMonoColor);
  const setHeatmapSpectrumContinuous = useAtcStore((s) => s.setHeatmapSpectrumContinuous);
  const runwayHeatmapCellIntroPulse = useAtcStore((s) => s.runwayHeatmapCellIntroPulse);
  const setRunwayHeatmapCellIntroPulse = useAtcStore((s) => s.setRunwayHeatmapCellIntroPulse);
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);

  const campaignYamlMarket = useMemo(
    () =>
      isRunwayMultiMarketStrip(country)
        ? gammaFocusMarket(country, configs, runwayMarketOrder)
        : country,
    [country, configs, runwayMarketOrder]
  );

  const yamlCampaignScaleFocused = (() => {
    const c = configs.find((x) => x.market === campaignYamlMarket);
    const y = c?.tradingPressure?.campaign_effect_scale;
    const n = y != null && Number.isFinite(y) ? y : 1;
    return Math.min(2.5, Math.max(0, n));
  })();

  const uiCampaignMult = snapCampaignUiMultiplier(riskTuning.campaignEffectUiMultiplier);
  const effectiveCampaignScale =
    yamlCampaignScaleFocused != null
      ? Math.min(2.5, Math.max(0, yamlCampaignScaleFocused * uiCampaignMult))
      : null;

  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
          checked={runwayHeatmapCellIntroPulse}
          onChange={(e) => setRunwayHeatmapCellIntroPulse(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">Animate heatmap cells on load</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            SVG runway and triple-lens strips build colour by lens layers (e.g. tech: BAU → calendar load → change →
            campaigns → carryover) with per-day timing so cells do not sweep left-to-right. Respects reduced motion.
            Turn off if it feels busy.
          </span>
        </span>
      </label>
      <div className="space-y-4">
        {showHeatmapTransferTuning ? (
          <div className="space-y-6">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Heatmap tuning per lens — same values for every country column
            </p>
            {HEATMAP_TUNING_LENS_IDS.map((lens) => (
              <div
                key={lens}
                className="space-y-4 rounded-lg border border-border/40 bg-muted/10 p-3 dark:bg-muted/5"
              >
                <p className="text-[11px] font-semibold text-foreground">{labelForHeatmapTuningLens(lens)}</p>
                <HeatmapBusinessPressureOffsetControls idPrefix="settings" lens={lens} />
                <HeatmapTransferControls idPrefix="settings" lens={lens} className="border-t border-border/40 pt-3" />
              </div>
            ))}
          </div>
        ) : null}

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
                    ? `Campaign overlay ${uiCampaignMult.toFixed(2)}×, effective ${effectiveCampaignScale.toFixed(2)}× for ${campaignYamlMarket}`
                    : `Campaign overlay ${uiCampaignMult.toFixed(2)}×`
                }
                title={
                  effectiveCampaignScale != null && yamlCampaignScaleFocused != null
                    ? `Effective ${effectiveCampaignScale.toFixed(2)}× (${yamlCampaignScaleFocused.toFixed(2)} YAML × ${uiCampaignMult.toFixed(2)})${
                        isRunwayMultiMarketStrip(country)
                          ? ` — preview uses runway focus ${campaignYamlMarket}; overlay applies to every column`
                          : ''
                      }`
                    : undefined
                }
                className={TUNING_VALUE_BOX}
              >
                <span className={TUNING_VALUE_TEXT}>{uiCampaignMult.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

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
            <div className="mt-3 space-y-2">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Full spectrum ramp. Use single colour for print-friendly or brand-tinted exports.
              </p>
              <div className="inline-flex w-full max-w-full rounded-lg border border-border/60 bg-muted/25 p-1 dark:bg-muted/15">
                <button
                  type="button"
                  onClick={() => setHeatmapSpectrumContinuous(false)}
                  className={cn(
                    'min-h-9 flex-1 rounded-md px-2.5 py-2 text-[11px] font-semibold transition-all duration-150',
                    !heatmapSpectrumContinuous
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/80'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  )}
                >
                  10 bands
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapSpectrumContinuous(true)}
                  className={cn(
                    'min-h-9 flex-1 rounded-md px-2.5 py-2 text-[11px] font-semibold transition-all duration-150',
                    heatmapSpectrumContinuous
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/80'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  )}
                >
                  Smooth ramp
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Smooth ramp interpolates between palette anchors (same transfer curve and γ). Legend matches cells.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
