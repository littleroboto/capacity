import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  /** Short status line (e.g. “Computing runway…”). */
  message: string;
  /** Optional “12 / 17” style progress when parallel IO is in flight. */
  progressLabel?: string;
};

/**
 * Placeholder while market YAML is fetched and the pipeline builds `riskSurface`.
 * Keeps layout stable and signals work in progress without an empty runway.
 */
export function RunwayHeatmapSkeleton({ className, message, progressLabel }: Props) {
  const cells = Array.from({ length: 14 * 9 }, (_, i) => i);

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border/60 bg-muted/20 p-3',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {progressLabel ? (
          <p className="font-mono text-xs text-muted-foreground tabular-nums">{progressLabel}</p>
        ) : null}
      </div>
      <div className="grid min-h-[280px] flex-1 grid-cols-14 grid-rows-9 gap-1.5 sm:min-h-[320px]">
        {cells.map((i) => (
          <div
            key={i}
            className={cn(
              'min-h-[18px] rounded-sm bg-muted/50 sm:min-h-[22px]',
              'animate-pulse motion-reduce:animate-none',
              i % 5 === 0 && 'bg-muted/70',
              i % 7 === 3 && 'opacity-80',
            )}
            style={{ animationDelay: `${(i % 12) * 80}ms` }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Heatmaps appear after market data is loaded and the model has finished a first pass.
      </p>
    </div>
  );
}
