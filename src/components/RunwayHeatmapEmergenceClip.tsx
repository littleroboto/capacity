import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useRunwayHeatmapEmergence } from '@/hooks/useRunwayHeatmapEmergence';

type RunwayHeatmapEmergenceClipProps = {
  /** Same identity as iso grow / data: remounts the emergence when the surface meaningfully changes. */
  resetKey: string;
  /** Extra delay before reveal (e.g. compare columns stagger). */
  staggerMs?: number;
  className?: string;
  children: ReactNode;
};

/**
 * Clips content from the top so the heatmap reveals upward after a short pause
 * (single-market / compare SVG / isometric runway).
 */
export function RunwayHeatmapEmergenceClip({
  resetKey,
  staggerMs = 0,
  className,
  children,
}: RunwayHeatmapEmergenceClipProps) {
  const insetTopPct = useRunwayHeatmapEmergence(resetKey, { staggerMs });
  const clip = `inset(${insetTopPct}% 0 0 0)`;

  return (
    <div
      className={cn(className)}
      style={{
        clipPath: clip,
        WebkitClipPath: clip,
        willChange: insetTopPct > 0.5 && insetTopPct < 99.5 ? 'clip-path' : undefined,
      }}
    >
      {children}
    </div>
  );
}
