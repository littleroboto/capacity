import { useEffect, useMemo, useState } from 'react';
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
import { RightPanelSection } from '@/components/RightPanelSection';
import { TechWeeklyRhythmPanel } from '@/components/TechWeeklyRhythmPanel';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

/** Slider step in γ (0.1 = coarser than the old 0.05 centi-step). */
const GAMMA_UI_MIN = 0.35;
const GAMMA_UI_MAX = 3;
const GAMMA_UI_STEP = 0.1;

function snapGammaUi(gamma: number): number {
  const s = Math.round(gamma / GAMMA_UI_STEP) * GAMMA_UI_STEP;
  return Math.min(GAMMA_UI_MAX, Math.max(GAMMA_UI_MIN, Math.round(s * 100) / 100));
}

function formatPaydayPeakText(n: number): string {
  const r = Math.min(2, Math.max(1, Math.round(n * 1000) / 1000));
  const s = r.toFixed(3).replace(/\.?0+$/, '');
  return s === '' ? '1' : s;
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

export function RiskModelPanel() {
  const [expanded, setExpanded] = useState(false);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const paydayPeak = riskTuning.storePaydayMonthPeakMultiplier;
  const [paydayPeakText, setPaydayPeakText] = useState(() => formatPaydayPeakText(paydayPeak));

  useEffect(() => {
    setPaydayPeakText(formatPaydayPeakText(paydayPeak));
  }, [paydayPeak]);
  const riskHeatmapGamma = useAtcStore((s) => s.riskHeatmapGamma);
  const riskHeatmapCurve = useAtcStore((s) => s.riskHeatmapCurve);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);
  const resetRiskTuning = useAtcStore((s) => s.resetRiskTuning);
  const setRiskHeatmapGamma = useAtcStore((s) => s.setRiskHeatmapGamma);
  const setRiskHeatmapCurve = useAtcStore((s) => s.setRiskHeatmapCurve);

  const curveHint = RISK_HEATMAP_CURVE_OPTIONS.find((o) => o.id === riskHeatmapCurve)?.hint;

  const weights = useMemo(() => normalizedRiskWeights(riskTuning), [riskTuning]);

  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const blendSummary = `Tech ${pct(weights.tech)} · Restaurant ${pct(weights.store)} · Marketing ${pct(weights.campaign)} · Resources ${pct(weights.holiday)}`;

  const tuningHintFull = (
    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {expanded ? 'Hide tuning' : 'Show tuning'}
    </span>
  );

  return (
    <RightPanelSection
      expanded={expanded}
      onExpandedChange={setExpanded}
      title="Pressure heatmap"
      belowTitleMeta={tuningHintFull}
      headerExtras={
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => resetRiskTuning()}>
          Reset
        </Button>
      }
    >
      <div className="flex min-h-0 flex-col gap-3 overflow-x-hidden border-t border-border/60 px-3 pb-3 pt-3">
          <div className="flex flex-col gap-2">
            <BlendStackBar weights={weights} />
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="text-foreground/70">Mix</span>{' '}
              <span className="tabular-nums text-foreground/85">{blendSummary}</span>
            </p>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Combined pressure uses the fixed mix above for <strong className="font-medium text-foreground">Technology</strong>{' '}
            and <strong className="font-medium text-foreground">Business</strong> heatmaps. On{' '}
            <strong className="font-medium text-foreground">public or school</strong> holidays, lab/team capacity is scaled
            by <strong className="font-medium text-foreground">50%</strong> in the engine. Use{' '}
            <strong className="font-medium text-foreground">Reset</strong> to restore defaults. Heatmap colour tuning (below)
            sets γ / curve for both lenses after lens-specific scaling.
          </p>

          <TechWeeklyRhythmPanel />

          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="payday-month-peak" className="text-xs font-normal">
                Post-payday / month-start trading lift
              </Label>
              <input
                id="payday-month-peak"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                className="h-8 w-full max-w-[8rem] rounded border border-border/70 bg-background px-1.5 font-mono text-[11px] tabular-nums text-foreground shadow-sm"
                value={paydayPeakText}
                onChange={(e) => setPaydayPeakText(e.target.value)}
                onBlur={() => {
                  const trimmed = paydayPeakText.trim();
                  if (trimmed === '' || trimmed === '.' || trimmed === '-') {
                    setPaydayPeakText(formatPaydayPeakText(paydayPeak));
                    return;
                  }
                  const v = parseFloat(trimmed);
                  if (!Number.isFinite(v)) {
                    setPaydayPeakText(formatPaydayPeakText(paydayPeak));
                    return;
                  }
                  setRiskTuning({ storePaydayMonthPeakMultiplier: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              <p className="text-[10px] leading-snug text-muted-foreground">
                Peak multiplier on YAML-derived restaurant / trading pressure in the{' '}
                <strong className="font-medium text-foreground">first week</strong> of each calendar month, tapering
                toward <strong className="font-medium text-foreground">month-end</strong>.{' '}
                <strong className="font-medium text-foreground">1</strong> = off; default{' '}
                <strong className="font-medium text-foreground">1.15</strong> (clamped 1–2) before capping{' '}
                <span className="font-mono text-foreground/80">store_pressure</span> at 1.
              </p>
            </div>
          </div>

        <div className="min-w-0 flex flex-col gap-2 border-t border-border/60 pt-3">
          {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-x-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="risk-heatmap-curve" className="text-xs font-normal">
                  Heatmap Colour Tuning
                </Label>
                <Select
                  value={riskHeatmapCurve}
                  onValueChange={(v) => setRiskHeatmapCurve(v as RiskHeatmapCurveId)}
                >
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
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="risk-heatmap-gamma" className="text-xs font-normal">
                  Strength
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
                  aria-label={`Curve strength gamma ${riskHeatmapGamma.toFixed(2)}`}
                  className="flex h-9 min-w-[4.5rem] items-center justify-center rounded-lg border border-border/60 bg-muted/35 px-3 dark:bg-muted/20"
                >
                  <span className="text-2xl font-extrabold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.65rem]">
                    {riskHeatmapGamma.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="risk-heatmap-curve" className="text-xs font-normal">
                Heatmap Colour Tuning
              </Label>
              <Select
                value={riskHeatmapCurve}
                onValueChange={(v) => setRiskHeatmapCurve(v as RiskHeatmapCurveId)}
              >
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
            </div>
          )}
          {curveHint ? (
            <p className="text-[10px] leading-snug text-muted-foreground">{curveHint}</p>
          ) : null}
          {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
            riskHeatmapCurve === 'power' ? (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Power: γ &gt; 1 favours greens at low pressure values; γ &lt; 1 lifts mids toward amber/red. In YAML,{' '}
                <span className="font-mono text-foreground/80">risk_heatmap_gamma</span> is omitted when γ = 1.
              </p>
            ) : (
              <p className="text-[10px] leading-snug text-muted-foreground">
                γ steers steepness (sigmoid) or compression (log). In YAML,{' '}
                <span className="font-mono text-foreground/80">risk_heatmap_gamma</span> is omitted when γ = 1.
              </p>
            )
          ) : null}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Same mapping for Technology (blended pressure score) and Business (percentile-normalised blend). Updates YAML for
            the focused country: <span className="font-mono text-foreground/80">risk_heatmap_curve</span> when not Power
            (default), plus <span className="font-mono text-foreground/80">risk_heatmap_gamma</span> when γ ≠ 1.
          </p>
        </div>
        </div>
    </RightPanelSection>
  );
}
