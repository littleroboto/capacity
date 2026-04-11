import { TechCapacityPlanningPanel } from '@/components/TechCapacityPlanningPanel';
import { TechDailyBusinessPanel } from '@/components/TechDailyBusinessPanel';

/**
 * Technology Teams → Business Patterns: per-market YAML (support week, supply curves).
 * Heatmap Δ + transfer lives in {@link TechLensHeatmapPatternsPanel} below this block in the controls column.
 */
export function TechLensPatternsPanel() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/85">YAML</span> follows the runway focus market: support week,
        lab/staff seasonality, and holiday staffing are{' '}
        <span className="font-medium text-foreground/80">only in that market&apos;s document</span>. Use the separate{' '}
        <span className="font-medium text-foreground/85">Technology Teams heatmap</span> section (under Business Patterns)
        for Δ, curve, γ, and tail; other lenses use Settings.
      </p>
      <TechDailyBusinessPanel />
      <div className="border-t border-border/60 pt-1">
        <TechCapacityPlanningPanel />
      </div>
    </div>
  );
}
