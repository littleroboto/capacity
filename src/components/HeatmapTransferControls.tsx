import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { HeatmapTuningLensId } from '@/lib/heatmapTuningPerLens';
import { labelForHeatmapTuningLens } from '@/lib/heatmapTuningPerLens';
import {
  RISK_HEATMAP_CURVE_OPTIONS,
  applyRiskHeatmapTransfer,
  riskHeatmapCurveUsesGamma,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

const GAMMA_UI_MIN = 0.35;
const GAMMA_UI_MAX = 3;
const GAMMA_UI_STEP = 0.1;

const TAIL_POWER_UI_MIN = 1;
const TAIL_POWER_UI_MAX = 2.75;
const TAIL_POWER_UI_STEP = 0.05;

function snapGammaUi(gamma: number): number {
  const s = Math.round(gamma / GAMMA_UI_STEP) * GAMMA_UI_STEP;
  return Math.min(GAMMA_UI_MAX, Math.max(GAMMA_UI_MIN, Math.round(s * 100) / 100));
}

function snapTailPowerUi(p: number): number {
  const s = Math.round(p / TAIL_POWER_UI_STEP) * TAIL_POWER_UI_STEP;
  return Math.min(TAIL_POWER_UI_MAX, Math.max(TAIL_POWER_UI_MIN, Math.round(s * 100) / 100));
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

export type HeatmapTransferControlsProps = {
  className?: string;
  /** Distinct prefix for form control ids (e.g. `settings` vs `patterns`). */
  idPrefix: string;
  lens: HeatmapTuningLensId;
};

/**
 * Heatmap pressure → colour transfer: curve, γ, and high-end power (t^p) for one lens.
 * Persisted per lens; same values for every market column; not YAML.
 */
export function HeatmapTransferControls({ className, idPrefix, lens }: HeatmapTransferControlsProps) {
  const t = useAtcStore((s) => s.riskHeatmapTuningByLens[lens]);
  const patch = useAtcStore((s) => s.patchRiskHeatmapTuningForLens);
  const riskHeatmapGamma = t.gamma;
  const riskHeatmapCurve = t.curve;
  const riskHeatmapTailPower = t.tailPower;
  const lensLabel = labelForHeatmapTuningLens(lens);

  const curveId = `risk-heatmap-curve-${idPrefix}-${lens}`;
  const gammaId = `risk-heatmap-gamma-${idPrefix}-${lens}`;
  const tailPowerId = `risk-heatmap-tail-power-${idPrefix}-${lens}`;

  const curveLabel = RISK_HEATMAP_CURVE_OPTIONS.find((o) => o.id === riskHeatmapCurve)?.label ?? riskHeatmapCurve;

  const curveSelect = (
    <Select
      value={riskHeatmapCurve}
      onValueChange={(v) => patch(lens, { curve: v as RiskHeatmapCurveId })}
    >
      <SelectTrigger
        id={curveId}
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
    <div className={cn('space-y-4', className)}>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">Heatmap transfer — {lensLabel}</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Maps this lens’s heatmap input (0–1) through curve + γ + tail, then into palette bands. Runs{' '}
          <strong className="font-medium text-foreground/90">after</strong> that lens’s pressure offset Δ.{' '}
          <strong className="font-medium text-foreground/90">Independent per lens</strong> (Technology Teams, Restaurant
          Activity, Deployment Risk); <strong className="font-medium text-foreground/90">same for all countries</strong> in
          compare mode. Browser only, not YAML.
        </p>
      </div>

      {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
        <div className={TUNING_CONTROL_GRID}>
          <div className="flex min-w-0 flex-col gap-1">{curveSelect}</div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor={gammaId} className="text-xs font-normal">
              γ
            </Label>
            <div className="flex h-9 items-center">
              <input
                id={gammaId}
                type="range"
                min={GAMMA_UI_MIN}
                max={GAMMA_UI_MAX}
                step={GAMMA_UI_STEP}
                value={snapGammaUi(riskHeatmapGamma)}
                onChange={(e) => patch(lens, { gamma: Number(e.target.value) })}
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

      <div className={TUNING_CONTROL_GRID}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor={tailPowerId} className="text-xs font-normal">
            High-end power
          </Label>
          <p className="text-[9px] leading-snug text-muted-foreground">
            After the transfer curve: map <span className="font-mono text-foreground/80">t → t<sup>p</sup></span> with{' '}
            <span className="font-mono text-foreground/80">p ≥ 1</span>. Raising <span className="font-mono text-foreground/80">p</span>{' '}
            pulls hot scores down so similar high-risk days use more colour bands.{' '}
            <span className="font-mono text-foreground/80">1</span> = off.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="h-4 shrink-0" aria-hidden />
          <div className="flex h-9 items-center">
            <input
              id={tailPowerId}
              type="range"
              min={TAIL_POWER_UI_MIN}
              max={TAIL_POWER_UI_MAX}
              step={TAIL_POWER_UI_STEP}
              value={snapTailPowerUi(riskHeatmapTailPower)}
              onChange={(e) => patch(lens, { tailPower: Number(e.target.value) })}
              className={TUNING_RANGE}
              aria-label="High-end power exponent"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className={TUNING_VALUE_HDR}>p</span>
          <div role="status" aria-live="polite" className={TUNING_VALUE_BOX}>
            <span className={TUNING_VALUE_TEXT}>{snapTailPowerUi(riskHeatmapTailPower).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
