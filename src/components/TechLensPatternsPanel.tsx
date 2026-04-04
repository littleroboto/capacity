import { HeatmapBusinessPressureOffsetControls } from '@/components/HeatmapBusinessPressureOffsetControls';
import { HeatmapTransferControls } from '@/components/HeatmapTransferControls';
import { TechCapacityPlanningPanel } from '@/components/TechCapacityPlanningPanel';
import { TechDailyBusinessPanel } from '@/components/TechDailyBusinessPanel';

/**
 * Technology Teams → Business Patterns: per-market YAML (support week, supply curves), then global heatmap transfer.
 * Extra Market IT–only support patterns remain YAML-only (same weekly shape would double-count if edited twice).
 */
export function TechLensPatternsPanel() {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/85">YAML</span> below follows the runway focus market — support week,
        lab/staff monthly shapes, and holiday staffing are <span className="font-medium text-foreground/80">per market</span>{' '}
        (that market&apos;s document only).{' '}
        <span className="font-medium text-foreground/85">Global heatmap</span> at the bottom: pressure offset (Δ), then
        curve, γ, and tail power — same persisted values for every lens and column (gear → Settings matches).
      </p>
      <TechDailyBusinessPanel />
      <div className="border-t border-border/60 pt-2">
        <TechCapacityPlanningPanel />
      </div>
      <div className="space-y-2 border-t border-border/50 pt-3">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Global heatmap — pressure offset, then curve, γ, and tail power
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Pipeline matches the engine: global Δ on heatmap input first, then transfer —{' '}
          <strong className="font-medium text-foreground/80">Technology stress</strong> (and every other lens) uses the same
          persisted controls for single- or multi-market runways.
        </p>
        <HeatmapBusinessPressureOffsetControls idPrefix="patterns-tech" />
        <HeatmapTransferControls idPrefix="patterns-tech" className="border-t border-border/40 pt-3" />
      </div>
    </div>
  );
}
