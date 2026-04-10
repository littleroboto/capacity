import { cn } from '@/lib/utils';

type SegmentWorkbenchMarkProps = {
  className?: string;
};

/**
 * Wordless mark: four vertical segments (rising load / runway columns). Uses `currentColor` with opacity steps.
 */
export function SegmentWorkbenchMark({ className }: SegmentWorkbenchMarkProps) {
  return (
    <svg
      className={cn('shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <rect x="3" y="20" width="5.5" height="9" rx="1.75" opacity={0.52} />
      <rect x="10.5" y="14" width="5.5" height="15" rx="1.75" opacity={0.68} />
      <rect x="18" y="7" width="5.5" height="22" rx="1.75" opacity={0.95} />
      <rect x="25.5" y="16" width="5.5" height="13" rx="1.75" opacity={0.62} />
    </svg>
  );
}
