import { useState } from 'react';
import { RightPanelSection } from '@/components/RightPanelSection';
import { HeatmapBusinessPressureOffsetControls } from '@/components/HeatmapBusinessPressureOffsetControls';
import { HeatmapTransferControls } from '@/components/HeatmapTransferControls';
import { useAtcStore } from '@/store/useAtcStore';

/**
 * Technology Teams lens only: heatmap pressure offset (Δ) and transfer (curve, γ, tail).
 * Sibling to {@link RiskModelPanel} “Business Patterns”, not nested inside it. Collapsed by default.
 */
export function TechLensHeatmapPatternsPanel() {
  const viewMode = useAtcStore((s) => s.viewMode);
  const [expanded, setExpanded] = useState(false);

  if (viewMode !== 'combined') return null;

  return (
    <div className="mt-1.5 flex min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border/55 bg-muted/15 dark:border-border/45 dark:bg-muted/10">
      <RightPanelSection
        className="min-h-0 shrink-0 border-b-0"
        expanded={expanded}
        onExpandedChange={setExpanded}
        title="Technology Teams heatmap"
        fillHeight={false}
        collapsedSummary={
          <span>
            Pressure offset (Δ), transfer curve, γ, and tail — expand to edit (same pipeline as the engine).
          </span>
        }
      >
        <div className="space-y-2 border-t border-border/40 px-2.5 pb-2.5 pt-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Δ is applied to the Technology heatmap input first, then transfer —{' '}
            <strong className="font-medium text-foreground/80">this lens only</strong>. Restaurant Activity and
            Deployment Risk use their own controls (gear → Settings).
          </p>
          <HeatmapBusinessPressureOffsetControls idPrefix="patterns-tech" lens="combined" />
          <HeatmapTransferControls idPrefix="patterns-tech" lens="combined" className="border-t border-border/40 pt-3" />
        </div>
      </RightPanelSection>
    </div>
  );
}
