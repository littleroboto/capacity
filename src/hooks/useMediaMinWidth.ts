import { useEffect, useState } from 'react';

export function useMediaMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width:${px}px)`).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width:${px}px)`);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [px]);

  return matches;
}
