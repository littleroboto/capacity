import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/** Slightly longer so staggered iso cells + colour walk read clearly after the clip reveal. */
const DURATION_SEC = 0.92;
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export type IsoRunwayGrowOpts = {
  /** Seconds to wait before column grow starts (e.g. match runway surface emergence pause). */
  delaySec?: number;
};

/**
 * 0→1 factor for isometric runway intro: columns interpolate from “all metrics at 0” height to target.
 * Re-runs when {@link growResetKey} changes (e.g. market / view / surface size).
 */
export function useIsoRunwayGrowFactor(growResetKey: string, opts?: IsoRunwayGrowOpts): number {
  const delaySec = opts?.delaySec ?? 0;
  const reduceMotion = useReducedMotion();
  const [g, setG] = useState(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      setG(1);
      return;
    }
    setG(0);
    const c = animate(0, 1, {
      delay: delaySec,
      duration: DURATION_SEC,
      ease: EASE,
      onUpdate: setG,
    });
    return () => c.stop();
  }, [growResetKey, reduceMotion, delaySec]);

  return g;
}
