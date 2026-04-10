import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/** Quiet beat after mount / data swap before the surface rises into view. */
export const RUNWAY_EMERGE_PAUSE_MS = 340;

/** Bottom-to-top reveal duration (clip-path inset). */
export const RUNWAY_EMERGE_DURATION_SEC = 1.08;

/** Smooth “land from the sea” — slow in, gentle settle. */
export const RUNWAY_EMERGE_EASE: [number, number, number, number] = [0.18, 0.88, 0.22, 1];

/**
 * Percentage clipped from the top (100 = hidden, 0 = fully visible).
 * Re-runs when `resetKey` changes (e.g. market / lens / runway layout identity).
 */
export function useRunwayHeatmapEmergence(
  resetKey: string,
  opts?: { staggerMs?: number },
): number {
  const staggerMs = opts?.staggerMs ?? 0;
  const reduceMotion = useReducedMotion();
  const [insetTopPct, setInsetTopPct] = useState(reduceMotion ? 0 : 100);

  useEffect(() => {
    if (reduceMotion) {
      setInsetTopPct(0);
      return;
    }

    setInsetTopPct(100);
    const delaySec = (RUNWAY_EMERGE_PAUSE_MS + staggerMs) / 1000;

    const controls = animate(100, 0, {
      delay: delaySec,
      duration: RUNWAY_EMERGE_DURATION_SEC,
      ease: RUNWAY_EMERGE_EASE,
      onUpdate: setInsetTopPct,
    });

    return () => controls.stop();
  }, [resetKey, reduceMotion, staggerMs]);

  return insetTopPct;
}
