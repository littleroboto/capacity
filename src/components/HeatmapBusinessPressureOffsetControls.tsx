import { Label } from '@/components/ui/label';
import type { HeatmapTuningLensId } from '@/lib/heatmapTuningPerLens';
import { labelForHeatmapTuningLens } from '@/lib/heatmapTuningPerLens';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

const OFFSET_MIN = -0.5;
const OFFSET_MAX = 0.5;
const OFFSET_STEP = 0.02;

function snapOffset(n: number): number {
  const s = Math.round(n / OFFSET_STEP) * OFFSET_STEP;
  return Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, Math.round(s * 100) / 100));
}

const TUNING_CONTROL_GRID =
  'grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] sm:items-end sm:gap-x-3';
const TUNING_VALUE_HDR = 'text-xs font-normal text-muted-foreground';
const TUNING_VALUE_BOX =
  'flex h-9 w-[4.5rem] shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 px-2 dark:bg-background/50';
const TUNING_VALUE_TEXT = 'text-lg font-bold tabular-nums leading-none text-foreground';
const TUNING_RANGE = 'h-3 w-full min-w-0 cursor-pointer accent-primary';

export type HeatmapBusinessPressureOffsetControlsProps = {
  className?: string;
  idPrefix: string;
  /** Which runway lens these controls edit (same tuning for every market column). */
  lens: HeatmapTuningLensId;
};

/**
 * Linear shift on the lens’s 0–1 heatmap input before transfer (single- and multi-market; not YAML).
 */
export function HeatmapBusinessPressureOffsetControls({
  className,
  idPrefix,
  lens,
}: HeatmapBusinessPressureOffsetControlsProps) {
  const v = useAtcStore((s) => s.riskHeatmapTuningByLens[lens].pressureOffset);
  const patch = useAtcStore((s) => s.patchRiskHeatmapTuningForLens);
  const id = `risk-heatmap-business-offset-${idPrefix}-${lens}`;
  const snapped = snapOffset(v);
  const lensLabel = labelForHeatmapTuningLens(lens);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">Pressure offset — {lensLabel}</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground/90">Same Δ for every market column</strong> in this lens (single
          market or compare strip). Add to the lens heatmap input (0–1) after any Technology headroom→stress flip, then
          clamp, then <strong className="font-medium text-foreground/90">Heatmap transfer</strong> (curve, γ, tail).{' '}
          <span className="font-medium text-foreground/85">Technology Teams / Code</span>: stress;{' '}
          <span className="font-medium text-foreground/85">Restaurant Activity</span>: store intensity;{' '}
          <span className="font-medium text-foreground/85">Deployment Risk</span>:{' '}
          <span className="font-mono text-foreground/85">deployment_risk_01</span>. Not in YAML.
        </p>
      </div>
      <div className={TUNING_CONTROL_GRID}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor={id} className="text-xs font-normal">
            Δ on heatmap input (0–1)
          </Label>
          <p className="text-[9px] leading-snug text-muted-foreground">
            <span className="font-mono text-foreground/80">input + Δ</span>, clamped, then transfer. Negative = cooler;
            positive = hotter. <span className="font-mono text-foreground/80">0</span> = off.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="h-4 shrink-0" aria-hidden />
          <div className="flex h-9 items-center">
            <input
              id={id}
              type="range"
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              step={OFFSET_STEP}
              value={snapped}
              onChange={(e) => patch(lens, { pressureOffset: Number(e.target.value) })}
              className={TUNING_RANGE}
              aria-label={`Pressure offset for ${lensLabel}, all columns`}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className={TUNING_VALUE_HDR}>Δ</span>
          <div role="status" aria-live="polite" className={TUNING_VALUE_BOX}>
            <span className={TUNING_VALUE_TEXT}>
              {snapped >= 0 ? '+' : ''}
              {snapped.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => patch(lens, { pressureOffset: 0 })}
      >
        Reset to 0
      </button>
    </div>
  );
}
