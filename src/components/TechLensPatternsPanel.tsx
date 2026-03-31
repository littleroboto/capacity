import { TechCapacityPlanningPanel } from '@/components/TechCapacityPlanningPanel';
import { TechDailyBusinessPanel } from '@/components/TechDailyBusinessPanel';

/**
 * Technology Teams → Business Patterns: Support Week Shape (`tech.weekly_pattern`) first, then supply/holidays.
 * Extra Market IT–only support patterns remain YAML-only (same weekly shape would double-count if edited twice).
 */
export function TechLensPatternsPanel() {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <TechDailyBusinessPanel />
      <div className="border-t border-border/60 pt-2">
        <TechCapacityPlanningPanel />
      </div>
    </div>
  );
}
