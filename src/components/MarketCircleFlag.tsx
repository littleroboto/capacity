import type { ComponentType, SVGProps } from 'react';
import { useId, useLayoutEffect, useRef } from 'react';
import {
  DynamicFlag,
  FlagAu,
  FlagCa,
  FlagDe,
  FlagEs,
  FlagFr,
  FlagGb,
  FlagIt,
  FlagPl,
  isFlagCode,
} from '@sankyu/react-circle-flags';
import { cn } from '@/lib/utils';
import { marketIdToCircleFlagCode } from '@/lib/marketCircleFlag';

type FlagSvg = ComponentType<
  SVGProps<SVGSVGElement> & { width?: number; height?: number; className?: string; title?: string }
>;

/**
 * `@sankyu/react-circle-flags` ships every circle flag with `mask id="a"` and `mask="url(#a)"`.
 * In one document that duplicates IDs — only the first mask wins, so LIOM columns look like empty rings.
 */
function fixDuplicateMaskIds(svg: SVGSVGElement, uid: string) {
  const masks = svg.querySelectorAll('mask[id]');
  masks.forEach((maskEl, i) => {
    const oldId = maskEl.getAttribute('id');
    if (!oldId || oldId.startsWith('cf-')) return;
    const newId = `cf-${uid}-m${i}`;
    maskEl.setAttribute('id', newId);
    svg.querySelectorAll(`[mask="url(#${oldId})"]`).forEach((el) => {
      el.setAttribute('mask', `url(#${newId})`);
    });
  });
}

const FLAG_BY_ISO: Record<string, FlagSvg> = {
  au: FlagAu,
  ca: FlagCa,
  de: FlagDe,
  es: FlagEs,
  fr: FlagFr,
  it: FlagIt,
  pl: FlagPl,
  gb: FlagGb,
};

type MarketCircleFlagProps = {
  marketId: string;
  size?: number;
  className?: string;
};

const svgClass = (className?: string) =>
  cn('relative z-20 block shrink-0 rounded-full shadow-sm ring-1 ring-border/35', className);

export function MarketCircleFlag({ marketId, size = 22, className }: MarketCircleFlagProps) {
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLSpanElement>(null);
  const code = marketIdToCircleFlagCode(marketId);

  useLayoutEffect(() => {
    const svg = wrapRef.current?.querySelector('svg');
    if (svg) fixDuplicateMaskIds(svg, uid);
  }, [uid, code, size, marketId]);

  if (!code) return null;

  const title = `${marketId} (${code.toUpperCase()})`;
  const Named = FLAG_BY_ISO[code];

  const inner = Named ? (
    <Named
      width={size}
      height={size}
      className={svgClass(className)}
      title={title}
      aria-hidden
    />
  ) : isFlagCode(code) ? (
    <DynamicFlag
      code={code}
      strict
      width={size}
      height={size}
      className={svgClass(className)}
      title={title}
      aria-hidden
    />
  ) : null;

  if (!inner) return null;

  return (
    <span
      ref={wrapRef}
      className="relative z-20 inline-flex shrink-0 leading-none [transform:translateZ(0)]"
    >
      {inner}
    </span>
  );
}
