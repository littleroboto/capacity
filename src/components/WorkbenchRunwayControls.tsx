import { Label } from '@/components/ui/label';
import { ViewModeRadios } from '@/components/ViewModeRadios';
import { useAtcStore } from '@/store/useAtcStore';
import { useReducedMotion } from 'motion/react';

/** Heatmap lens — right workbench panel. Market / LIOM **Focus** is above the runway (main column). */
export function WorkbenchRunwayControls() {
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
      <p className="text-[10px] leading-snug text-muted-foreground">
        Use <span className="font-semibold text-foreground/90">Focus</span> at the top of the runway to choose LIOM or a
        single market.
      </p>

      <div className="border-t border-border/50 pt-3">
        <Label
          id="workbench-view-mode-label"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          View mode
        </Label>
        <ViewModeRadios
          viewMode={viewMode}
          setViewMode={setViewMode}
          reduceMotion={!!reduceMotion}
          compact={false}
          layoutGroupId="view-mode-panel"
          layoutBgId="view-mode-active-bg-panel"
          labelledBy="workbench-view-mode-label"
          idSuffix="panel"
        />
      </div>
    </div>
  );
}
