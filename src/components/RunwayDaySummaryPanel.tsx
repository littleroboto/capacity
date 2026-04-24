import type { LegacyRef, Ref } from 'react';
import { Filter, X } from 'lucide-react';
import type { RunwayTipState } from '@/lib/runwayTooltipBreakdown';
import { cn } from '@/lib/utils';

type RunwayDaySummaryPanelProps = {
  tip: RunwayTipState | null;
  onClear: () => void;
  /** Optional; parent may attach ref on a wrapper that includes sparklines / ledger. */
  panelRef?: Ref<HTMLDivElement | null>;
  /**
   * When set, shows a control to narrow heatmap footprint rows to activities that touch the selected day
   * (explicit action — opening the day alone no longer does this automatically).
   */
  onScopeHeatmapToThisDay?: () => void;
};

export function RunwayDaySummaryPanel({
  tip,
  onClear,
  panelRef,
  onScopeHeatmapToThisDay,
}: RunwayDaySummaryPanelProps) {
  return (
    <div
      role="complementary"
      ref={(panelRef ?? undefined) as LegacyRef<HTMLDivElement> | undefined}
      className={cn('w-full min-w-0 shrink-0 bg-transparent lg:px-0 lg:pt-0')}
      aria-label="Heatmap Details for the selected runway day"
    >
      <article className="overflow-visible bg-transparent">
        {tip ? (
          <header
            className={cn(
              'flex flex-wrap items-center gap-2 pb-2 sm:pb-2.5',
              onScopeHeatmapToThisDay && 'payload' in tip ? 'justify-between' : 'justify-end',
            )}
          >
            {onScopeHeatmapToThisDay && 'payload' in tip ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onScopeHeatmapToThisDay();
                }}
                className="inline-flex h-8 max-w-[min(100%,20rem)] shrink items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Keep only activities that touch this calendar day included in runway colours. Undo with “show all” in the activity table."
                aria-label="Scope runway heatmap colours to activities that touch this day"
              >
                <Filter className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 truncate">Scope colours to this day</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Clear day selection"
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          </header>
        ) : null}

        {tip && 'simple' in tip ? (
          <div className="overflow-visible pt-0 pb-3 sm:pb-4">
            <p className="text-base leading-relaxed text-foreground sm:text-[17px]">{tip.simple}</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}
