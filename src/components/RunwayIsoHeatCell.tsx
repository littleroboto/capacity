import type { KeyboardEvent, MouseEvent } from 'react';

/**
 * Shared isometric column geometry (three skewed rects) for runway skyline / 3D cells.
 * Matches [create-3d-contrib.ts](https://github.com/yoshi389111/github-profile-3d-contrib/blob/main/src/create-3d-contrib.ts).
 */

type RunwayTipAnchor = { clientX: number; clientY: number };

const ANGLE = 30;

function atanDeg(value: number): number {
  return (Math.atan(value) * 360) / 2 / Math.PI;
}

function parseRgbHex6(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shadeRgbHex(hex: string, mult: number): string {
  const rgb = parseRgbHex6(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => Math.min(255, Math.max(0, Math.round(c * mult))));
  return `rgb(${r},${g},${b})`;
}

export function contribPanelFill(baseHex: string, panel: 'top' | 'left' | 'right'): string {
  switch (panel) {
    case 'top':
      return shadeRgbHex(baseHex, 1);
    case 'left':
      return shadeRgbHex(baseHex, 0.78);
    case 'right':
      return shadeRgbHex(baseHex, 0.55);
    default:
      return baseHex;
  }
}

export const EMPTY_TOP = 'rgb(58, 68, 86)';
export const EMPTY_LEFT = 'rgb(48, 58, 74)';
export const EMPTY_RIGHT = 'rgb(38, 46, 60)';

export type IsoLayoutCore = {
  canvasH: number;
  dxx: number;
  dyy: number;
  widthTop: number;
  skewXTop: number;
  scaleTopY: number;
  scaleSide: number;
  tx: number;
  bottomAnchor: number;
};

export function isoLayoutCore(cellPx: number, towerPx: number): IsoLayoutCore {
  const canvasH = cellPx + Math.max(0, towerPx);
  const dxx = Math.max(5.5, cellPx * 0.38);
  const dyy = dxx * Math.tan((ANGLE * Math.PI) / 180);
  const widthTop = dxx;
  const skewXTop = atanDeg(dxx / 2 / dyy);
  const scaleTopY = (2 * dyy) / widthTop;
  const scaleSide = Math.sqrt(dxx * dxx + dyy * dyy) / dxx;
  const tx = (cellPx - 2 * dxx) / 2;
  const bottomAnchor = canvasH - 1.5;
  return {
    canvasH,
    dxx,
    dyy,
    widthTop,
    skewXTop,
    scaleTopY,
    scaleSide,
    tx,
    bottomAnchor,
  };
}

/** Three rects at origin; parent must `translate(tx, ty)`. */
export function IsoColumnAtOrigin({
  L,
  calH,
  topC,
  leftC,
  rightC,
  dot,
}: {
  L: IsoLayoutCore;
  calH: number;
  topC: string;
  leftC: string;
  rightC: string;
  dot?: { x: number; y: number } | null;
}) {
  const heightLeft = calH / L.scaleSide;
  const heightRight = calH / L.scaleSide;
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={L.widthTop}
        height={L.widthTop}
        stroke="none"
        fill={topC}
        transform={`skewY(${-ANGLE}) skewX(${L.skewXTop.toFixed(4)}) scale(1 ${L.scaleTopY.toFixed(4)})`}
      />
      <rect
        x={0}
        y={0}
        width={L.dxx}
        height={heightLeft}
        stroke="none"
        fill={leftC}
        transform={`skewY(${ANGLE}) scale(1 ${L.scaleSide.toFixed(4)})`}
      />
      <rect
        x={0}
        y={0}
        width={L.dxx}
        height={heightRight}
        stroke="none"
        fill={rightC}
        transform={`translate(${L.dxx.toFixed(2)} ${L.dyy.toFixed(2)}) skewY(${-ANGLE}) scale(1 ${L.scaleSide.toFixed(4)})`}
      />
      {dot ? <TodayDotSvg cx={dot.x} cy={dot.y} /> : null}
    </g>
  );
}

function TodayDotSvg({ cx, cy }: { cx: number; cy: number }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={Math.max(1.8, 2.6)}
      className="pointer-events-none"
      fill="white"
      stroke="rgba(15,23,42,0.45)"
      strokeWidth={0.55}
    />
  );
}

export function isoHandlers(
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void,
  dateStr: string | null,
  weekdayCol: number
) {
  return {
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      openDayDetailsFromCell({ clientX: e.clientX, clientY: e.clientY }, dateStr, weekdayCol);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      openDayDetailsFromCell(
        { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 },
        dateStr,
        weekdayCol
      );
    },
  };
}

export function calHeightFromMetric(height01: number, towerPx: number, isPad: boolean): number {
  if (isPad) return Math.max(3, towerPx * 0.08 + 2);
  const span = Math.max(8, towerPx * 0.96);
  return Math.max(3, 3 + height01 * span);
}
