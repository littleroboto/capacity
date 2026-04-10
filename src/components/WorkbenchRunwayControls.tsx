import { Label } from '@/components/ui/label';
import { ViewModeRadios } from '@/components/ViewModeRadios';
import type { ViewModeId } from '@/lib/constants';
import { useAtcStore } from '@/store/useAtcStore';
import { useReducedMotion } from 'motion/react';

/** Compare strip: Technology Teams, Restaurant Activity, and Deployment Risk only (no Code in this control). */
const RUNWAY_LENS_MODE_IDS: readonly ViewModeId[] = ['combined', 'in_store', 'market_risk'];

type WorkbenchRunwayControlsProps = {
  /** When true, hide the Code option; lens toggles still apply to every compare column. */
  compareAllMarkets?: boolean;
};

/** Heatmap lens — right workbench panel. Focus and year/quarter live in the same scroll column above this block. */
export function WorkbenchRunwayControls({ compareAllMarkets = false }: WorkbenchRunwayControlsProps) {
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex shrink-0 flex-col gap-3 px-0 py-0">
      <p className="text-[11px] leading-snug text-muted-foreground">
        {compareAllMarkets ? (
          <>
            Lens applies to <span className="font-semibold text-foreground/90">every</span> column.{' '}
            <span className="font-semibold text-foreground/90">Business Patterns</span> uses the focus market; YAML
            follows the strip focus.
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground/90">Focus</span> and{' '}
            <span className="font-semibold text-foreground/90">Year / Quarter</span> above set one region or a compare
            strip (LIOM, IOM, …).
          </>
        )}
      </p>

      <div>
        <Label
          id="workbench-runway-lens-label"
          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Runway lens
        </Label>
        <div className="mt-1.5 p-0" role="group" aria-labelledby="workbench-runway-lens-label">
          <ViewModeRadios
            viewMode={viewMode}
            setViewMode={setViewMode}
            reduceMotion={!!reduceMotion}
            compact
            unstyled
            layoutGroupId="view-mode-panel"
            layoutBgId="view-mode-active-bg-panel"
            labelledBy="workbench-runway-lens-label"
            idSuffix="panel"
            allowedIds={compareAllMarkets ? RUNWAY_LENS_MODE_IDS : undefined}
            className="gap-x-0.5 gap-y-0.5"
          />
        </div>
      </div>
    </div>
  );
}
