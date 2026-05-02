import { useState } from 'react';
import { RightPanelSection } from '@/components/RightPanelSection';
import { TechCapacityPlanningPanel } from '@/components/TechCapacityPlanningPanel';
import { TechDailyBusinessPanel } from '@/components/TechDailyBusinessPanel';

/**
 * Technology Teams → Business Patterns: per-market YAML (support week, supply curves).
 * Heatmap Δ + transfer lives in {@link TechLensHeatmapPatternsPanel} below this block in the controls column.
 */
export function TechLensPatternsPanel() {
  const [supportWeekExpanded, setSupportWeekExpanded] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/85">YAML</span> follows the runway focus market: support week,
        lab/staff seasonality, and holiday staffing are{' '}
        <span className="font-medium text-foreground/80">only in that market&apos;s document</span>. Use the separate{' '}
        <span className="font-medium text-foreground/85">Technology Teams heatmap</span> section (under Business Patterns)
        for Δ, curve, γ, and tail; other lenses use Settings.
      </p>
      <div className="overflow-hidden rounded-lg border border-border/55 bg-muted/[0.07] dark:border-border/45 dark:bg-muted/10">
        <RightPanelSection
          className="min-h-0 shrink-0 border-b-0"
          expanded={supportWeekExpanded}
          onExpandedChange={setSupportWeekExpanded}
          title="Support week shape"
          fillHeight={false}
          collapsedSummary={
            <span className="text-[11px] text-muted-foreground">
              Mon–Sun Market IT intensity (YAML) — expand to edit
            </span>
          }
        >
          <div className="border-t border-border/40 px-2.5 pb-2.5 pt-2">
            <TechDailyBusinessPanel embeddedInCollapsible />
          </div>
        </RightPanelSection>
      </div>
      <div className="border-t border-border/60 pt-1">
        <TechCapacityPlanningPanel />
      </div>
    </div>
  );
}
