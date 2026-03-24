import { AU, CA, DE, ES, FR, IT, PL, GB } from 'country-flag-icons/react/3x2';
import { cn } from '@/lib/utils';

type FlagComp = typeof AU;

/** Runway `country:` codes → `country-flag-icons` components (`UK` uses `GB`). */
const FLAG_BY_MARKET: Record<string, FlagComp> = {
  AU,
  CA,
  DE,
  ES,
  FR,
  IT,
  PL,
  UK: GB,
};

export type MarketFlagIconProps = {
  marketId: string;
  className?: string;
  /** Native tooltip on a wrapper. */
  title?: string;
};

/**
 * Small vector flag for runway column headers (not emoji — consistent across OS/fonts).
 */
export function MarketFlagIcon({ marketId, className, title }: MarketFlagIconProps) {
  const Flag = FLAG_BY_MARKET[marketId];
  if (!Flag) return null;
  const svg = (
    <Flag
      aria-hidden
      className={cn(
        'shrink-0 overflow-hidden rounded-[2px] shadow-sm ring-1 ring-border/45 dark:ring-border/55',
        className
      )}
    />
  );
  if (title) {
    return (
      <span className="inline-flex shrink-0" title={title}>
        {svg}
      </span>
    );
  }
  return svg;
}
