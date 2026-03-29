import { Label } from '@/components/ui/label';
import { ViewModeRadios } from '@/components/ViewModeRadios';
import type { ViewModeId } from '@/lib/constants';
import { useAtcStore } from '@/store/useAtcStore';
import { useReducedMotion } from 'motion/react';

/** LIOM: Technology Teams and Restaurant Activity only (no Code in this control). */
const RUNWAY_LENS_MODE_IDS: readonly ViewModeId[] = ['combined', 'in_store'];

type WorkbenchRunwayControlsProps = {
  /** When true, hide the Code option; lens toggles still apply to every compare column. */
  compareAllMarkets?: boolean;
};

/** Heatmap lens — right workbench panel. Market / LIOM **Focus** is above the runway (main column). */
export function WorkbenchRunwayControls({ compareAllMarkets = false }: WorkbenchRunwayControlsProps) {
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
      <p className="text-[10px] leading-snug text-muted-foreground">
        {compareAllMarkets ? (
          <>
            Lens applies to <span className="font-semibold text-foreground/90">all</span> markets. Use{' '}
            <span className="font-semibold text-foreground/90">Focus</span> for YAML and heatmap controls on one market.
          </>
        ) : (
          <>
            Use <span className="font-semibold text-foreground/90">Focus</span> at the top of the runway to choose LIOM or
            a single market.
          </>
        )}
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
          allowedIds={compareAllMarkets ? RUNWAY_LENS_MODE_IDS : undefined}
        />
      </div>
    </div>
  );
}
