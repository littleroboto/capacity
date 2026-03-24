import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type RightPanelSectionProps = {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  title: string;
  /** Shown under the title row (e.g. pressure heatmap “Show / Hide tuning”). */
  belowTitleMeta?: ReactNode;
  /** Shown under the title when collapsed. */
  collapsedSummary?: ReactNode;
  /** Extra controls in the header row (e.g. Reset, Syntax reference). */
  headerExtras?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Collapsible section for the right-hand controls panel: chevron disclosure + consistent chrome. */
export function RightPanelSection({
  expanded,
  onExpandedChange,
  title,
  belowTitleMeta,
  collapsedSummary,
  headerExtras,
  children,
  className,
}: RightPanelSectionProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/20 shadow-sm',
        className
      )}
    >
      <div className="border-b border-border/50 bg-card/40 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-stretch gap-1 rounded-md text-left outline-none ring-offset-background transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onExpandedChange(!expanded)}
            aria-expanded={expanded}
          >
            <span className="flex items-center gap-2">
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  expanded && 'rotate-180'
                )}
                aria-hidden
              />
              <span className="text-sm font-semibold tracking-tight text-foreground">{title}</span>
            </span>
            {belowTitleMeta ? <div className="pl-6">{belowTitleMeta}</div> : null}
            {!expanded && collapsedSummary ? (
              <p className="pl-6 text-xs leading-snug text-muted-foreground">{collapsedSummary}</p>
            ) : null}
          </button>
          {headerExtras ? <div className="flex shrink-0 items-center gap-1">{headerExtras}</div> : null}
        </div>
      </div>
      {expanded ? children : null}
    </div>
  );
}
