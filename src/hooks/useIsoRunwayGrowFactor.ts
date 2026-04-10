import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const DURATION_SEC = 0.68;
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * 0→1 factor for isometric runway intro: columns interpolate from “all metrics at 0” height to target.
 * Re-runs when {@link growResetKey} changes (e.g. market / view / surface size).
 */
export function useIsoRunwayGrowFactor(growResetKey: string): number {
  const reduceMotion = useReducedMotion();
  const [g, setG] = useState(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      setG(1);
      return;
    }
    setG(0);
    const c = animate(0, 1, {
      duration: DURATION_SEC,
      ease: EASE,
      onUpdate: setG,
    });
    return () => c.stop();
  }, [growResetKey, reduceMotion]);

  return g;
}
