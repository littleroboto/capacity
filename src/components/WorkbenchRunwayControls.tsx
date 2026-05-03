import { Label } from '@/components/ui/label';
import { ViewModeRadios } from '@/components/ViewModeRadios';
import type { ViewModeId } from '@/lib/constants';
import { useAtcStore } from '@/store/useAtcStore';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Compare strip: Technology Teams, Restaurant Activity, and Deployment Risk only (no Code in this control). */
const RUNWAY_LENS_MODE_IDS: readonly ViewModeId[] = ['combined', 'in_store', 'market_risk'];

type WorkbenchRunwayControlsProps = {
  /** When true, hide the Code option; lens toggles still apply to every compare column. */
  compareAllMarkets?: boolean;
  /**
   * When true (large workbench with {@link WorkbenchSidebar}), omit Heatmap/YAML — same actions live on the
   * left rail so the inspector stays Focus + range + lens only.
   */
  hideMainAreaToggle?: boolean;
};

/** Runway lens (compare) or Heatmap / YAML toggle (single market) — below Focus and Year in the controls column. */
export function WorkbenchRunwayControls({
  compareAllMarkets = false,
  hideMainAreaToggle = false,
}: WorkbenchRunwayControlsProps) {
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const runwayLensBeforeCode = useAtcStore((s) => s.runwayLensBeforeCode);
  const reduceMotion = useReducedMotion();

  const isCode = viewMode === 'code';

  if (!compareAllMarkets && hideMainAreaToggle) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 px-0 py-0">
      {compareAllMarkets ? (
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
              allowedIds={RUNWAY_LENS_MODE_IDS}
              className="gap-x-0.5 gap-y-0.5"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label
            id="workbench-main-area-label"
            className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Main column
          </Label>
          <div
            role="group"
            aria-labelledby="workbench-main-area-label"
            className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-muted/20 p-1"
          >
            <button
              type="button"
              aria-pressed={!isCode}
              title={isCode ? 'Return to runway heatmap (applies YAML first)' : 'Heatmap is showing'}
              className={cn(
                'inline-flex h-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
                !isCode
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/55'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
              onClick={() => {
                if (isCode) setViewMode(runwayLensBeforeCode);
              }}
            >
              Heatmap
            </button>
            <button
              type="button"
              aria-pressed={isCode}
              title="Open YAML editor in the main column"
              aria-label="YAML editor in the main column"
              className={cn(
                'inline-flex h-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
                isCode
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/55'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
              onClick={() => setViewMode('code')}
            >
              YAML
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
