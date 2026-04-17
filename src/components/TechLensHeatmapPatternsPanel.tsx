import { useState } from 'react';
import { RightPanelSection } from '@/components/RightPanelSection';
import { HeatmapBusinessPressureOffsetControls } from '@/components/HeatmapBusinessPressureOffsetControls';
import { HeatmapTransferControls } from '@/components/HeatmapTransferControls';
import { useAtcStore } from '@/store/useAtcStore';

/**
 * Technology Teams lens only: heatmap pressure offset (Δ) and transfer (curve, γ, tail).
 * Sibling to Market configuration (admin shortcut) in the controls column. Collapsed by default.
 */
export function TechLensHeatmapPatternsPanel() {
  const viewMode = useAtcStore((s) => s.viewMode);
  const [expanded, setExpanded] = useState(false);

  if (viewMode !== 'combined') return null;

  return (
    <div className="flex min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border/55 bg-muted/15 dark:border-border/45 dark:bg-muted/10">
      <RightPanelSection
        className="min-h-0 shrink-0 border-b-0"
        expanded={expanded}
        onExpandedChange={setExpanded}
        title="Technology Teams heatmap"
        fillHeight={false}
        collapsedSummary={
          <span className="text-[11px] text-muted-foreground">
            Pressure Δ, transfer curve, γ, tail — expand to edit
          </span>
        }
      >
        <div className="space-y-2 border-t border-border/40 px-2.5 pb-2.5 pt-2">
          <HeatmapBusinessPressureOffsetControls idPrefix="patterns-tech" lens="combined" />
          <HeatmapTransferControls idPrefix="patterns-tech" lens="combined" className="border-t border-border/40 pt-3" />
        </div>
      </RightPanelSection>
    </div>
  );
}
