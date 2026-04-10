import { HeatmapBusinessPressureOffsetControls } from '@/components/HeatmapBusinessPressureOffsetControls';
import { HeatmapTransferControls } from '@/components/HeatmapTransferControls';
import { TechCapacityPlanningPanel } from '@/components/TechCapacityPlanningPanel';
import { TechDailyBusinessPanel } from '@/components/TechDailyBusinessPanel';

/**
 * Technology Teams → Business Patterns: per-market YAML (support week, supply curves), then Technology lens heatmap transfer.
 * Extra Market IT–only support patterns remain YAML-only (same weekly shape would double-count if edited twice).
 */
export function TechLensPatternsPanel() {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/85">YAML</span> below follows the runway focus market — support week,
        lab/staff monthly shapes, and holiday staffing are <span className="font-medium text-foreground/80">per market</span>{' '}
        (that market&apos;s document only).{' '}
        <span className="font-medium text-foreground/85">Technology Teams heatmap</span> at the bottom: pressure offset (Δ),
        then curve, γ, and tail — <strong className="font-medium text-foreground/80">same for every column</strong>; other
        lenses are tuned separately (gear → Settings).
      </p>
      <TechDailyBusinessPanel />
      <div className="border-t border-border/60 pt-2">
        <TechCapacityPlanningPanel />
      </div>
      <div className="space-y-2 border-t border-border/50 pt-3">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Technology Teams heatmap — pressure offset, then curve, γ, and tail
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Pipeline matches the engine: Δ on Technology heatmap input first, then transfer —{' '}
          <strong className="font-medium text-foreground/80">only this lens</strong>; Restaurant Activity and Deployment Risk
          have their own controls.
        </p>
        <HeatmapBusinessPressureOffsetControls idPrefix="patterns-tech" lens="combined" />
        <HeatmapTransferControls idPrefix="patterns-tech" lens="combined" className="border-t border-border/40 pt-3" />
      </div>
    </div>
  );
}
