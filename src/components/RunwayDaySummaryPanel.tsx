import type { LegacyRef, Ref } from 'react';
import { X } from 'lucide-react';
import { RunwayDayDetailsPayloadBody } from '@/components/RunwayDayDetailsBody';
import type { RunwayTipState } from '@/lib/runwayTooltipBreakdown';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

type RunwayDaySummaryPanelProps = {
  tip: RunwayTipState | null;
  onClear: () => void;
  panelRef: Ref<HTMLDivElement | null>;
};

export function RunwayDaySummaryPanel({
  tip,
  onClear,
  panelRef,
}: RunwayDaySummaryPanelProps) {
  const clearLedgerExclusions = useAtcStore((s) => s.clearRunwayLedgerExclusions);
  const ledgerExcludedCount = useAtcStore((s) => s.runwayLedgerExcludedEntryIds.length);

  return (
    <div
      role="complementary"
      ref={panelRef as LegacyRef<HTMLDivElement>}
      className={cn('w-full min-w-0 shrink-0 bg-transparent lg:px-0 lg:pt-0')}
      aria-label="Calculation summary for the selected runway day"
    >
      <article className="overflow-visible bg-transparent">
        <header className="flex items-center justify-between gap-3 pb-4 sm:pb-5">
          <h2 className="min-w-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Calculation Summary
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {ledgerExcludedCount > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearLedgerExclusions();
                }}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Include all ledger events
              </button>
            ) : null}
            {tip ? (
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
            ) : null}
          </div>
        </header>

        {tip ? (
          <div className="overflow-visible py-4 sm:py-5">
            <div
              className={cn(
                'max-w-none text-base leading-[1.65] text-foreground sm:text-[17px] sm:leading-[1.7]',
                'space-y-4 [&_strong]:font-semibold [&_p]:mb-3 [&_p:last-child]:mb-0',
                '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1',
              )}
            >
              {'simple' in tip ? (
                <p>{tip.simple}</p>
              ) : (
                <RunwayDayDetailsPayloadBody p={tip.payload} presentation="markdown" />
              )}
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
