import { cn } from '@/lib/utils';

type SegmentWorkbenchMarkProps = {
  className?: string;
};

/**
 * Heavier than Lucide-at-24 defaults so strokes stay legible when the SVG is drawn at ~1.1–1.3em
 * beside extrabold wordmark (hairline strokes were reading much lighter than the type).
 */
const SW = 3;

/**
 * Product mark: **structured doc** (`[` YAML/code margin) + **planning lanes** (Gantt-style strokes)
 * + **time baseline** (runway). Rounded caps / joins sit with Outfit-style wordmark; `currentColor` for chrome.
 *
 * **Sizing:** Prefer `h-[1.15em] w-[1.15em]`–`1.25em` next to the wordmark so art scales with type; on the
 * marketing header use one step larger type (`text-xl` / `sm:text-2xl`) so the lockup holds weight vs primary CTAs.
 */
export function SegmentWorkbenchMark({ className }: SegmentWorkbenchMarkProps) {
  return (
    <svg
      className={cn('shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <g
        stroke="currentColor"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Code / YAML block margin */}
        <path d="M 5.25 6.25 V 25.75 M 5.25 6.25 H 9 M 5.25 25.75 H 9" />
        {/* Planning horizon */}
        <path d="M 11.5 27.25 H 28.25" opacity={0.38} />
        {/* Programme-style rows — lengths suggest uneven load / capacity draw */}
        <path d="M 11.5 10.25 H 23.75" opacity={0.52} />
        <path d="M 11.5 15.5 H 18.75" opacity={0.72} />
        <path d="M 11.5 20.75 H 28" opacity={0.96} />
      </g>
    </svg>
  );
}
