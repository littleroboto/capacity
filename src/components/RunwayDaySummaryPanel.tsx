import type { LegacyRef, Ref } from 'react';
import { X } from 'lucide-react';
import { RunwayDayDetailsPayloadBody } from '@/components/RunwayDayDetailsBody';
import type { RunwayTipState } from '@/lib/runwayTooltipBreakdown';
import { cn } from '@/lib/utils';

type RunwayDaySummaryPanelProps = {
  tip: RunwayTipState | null;
  onClear: () => void;
  panelRef: Ref<HTMLDivElement | null>;
};

export function RunwayDaySummaryPanel({ tip, onClear, panelRef }: RunwayDaySummaryPanelProps) {
  return (
    <div
      role="complementary"
      ref={panelRef as LegacyRef<HTMLDivElement>}
      className={cn(
        'mt-4 flex min-h-[min(12rem,40dvh)] w-full shrink-0 flex-col border-t border-border/50 bg-muted/5 lg:mt-0 lg:min-h-[min(52vh,520px)] lg:basis-0 lg:flex-1 lg:min-w-0 lg:flex-col lg:items-center lg:border-l lg:border-t-0 lg:border-border/50 lg:px-4 lg:pt-0'
      )}
      aria-label="Day summary"
    >
      <div className="flex min-h-0 w-full max-w-md flex-1 flex-col lg:mx-auto">
        <div className="flex w-full shrink-0 items-center justify-between gap-2 border-b border-border/40 py-2.5 lg:pt-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Day summary</h3>
        {tip ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Clear day selection"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
        </div>
        <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain py-3 pr-1 [scrollbar-gutter:stable]">
          {!tip ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Select a day on the heatmap to see a structured summary here.
            </p>
          ) : 'simple' in tip ? (
            <p className="text-sm leading-relaxed text-foreground">{tip.simple}</p>
          ) : (
            <RunwayDayDetailsPayloadBody p={tip.payload} presentation="markdown" />
          )}
        </div>
      </div>
    </div>
  );
}
