import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { curveMonotoneX } from '@visx/curve';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { AreaClosed, LinePath } from '@visx/shape';
import { cn } from '@/lib/utils';

const MARGIN = { top: 4, right: 4, bottom: 4, left: 4 };

type Point = { x: number; y: number };

function buildPoints(values: readonly number[]): Point[] {
  return values.map((v, i) => ({
    x: i,
    y: Number.isFinite(v) ? v : 0,
  }));
}

/** Invert chart Y pixel (from top of inner plot) to data value; matches visx scaleLinear domain/range [innerH,0]. */
function innerPixelYToValue(innerY: number, innerH: number, yDomain: [number, number]): number {
  if (innerH <= 0) return yDomain[0];
  const [y0, y1] = yDomain;
  const span = y1 - y0;
  const frac = 1 - Math.min(innerH, Math.max(0, innerY)) / innerH;
  return y0 + frac * span;
}

function WeightingLineSvg({
  width,
  height,
  values,
  ariaLabel,
  yDomain,
  strokeWidth,
  onPointChange,
  pointLabels,
  draggableIndices,
}: {
  width: number;
  height: number;
  values: readonly number[];
  ariaLabel: string;
  yDomain: [number, number];
  strokeWidth: number;
  /** When set, each vertex can be dragged vertically to update that index (parent applies rounding). */
  onPointChange?: (index: number, value: number) => void;
  /** Optional short labels per point for a11y (e.g. Mon…Sun). */
  pointLabels?: readonly string[];
  /** If set with `onPointChange`, only these indices are draggable (others stay visual-only). */
  draggableIndices?: readonly number[];
}) {
  const gradId = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeDragIx, setActiveDragIx] = useState<number | null>(null);
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const points = useMemo(() => buildPoints(values), [values]);

  const { xScale, yScale, gridYs } = useMemo(() => {
    const n = Math.max(1, points.length);
    const xMax = n - 1;
    const xScale = scaleLinear<number>({
      domain: xMax > 0 ? [0, xMax] : [0, 1],
      range: [0, innerW],
      clamp: true,
    });
    const [y0, y1] = yDomain;
    const span = Math.max(1e-9, y1 - y0);
    const yScale = scaleLinear<number>({
      domain: [y0, y1],
      range: [innerH, 0],
      clamp: true,
    });
    const mid = y0 + span * 0.5;
    const gridYs = [y0, mid, y1];
    return { xScale, yScale, gridYs };
  }, [points.length, innerW, innerH, yDomain]);

  const applyPointerY = useCallback(
    (clientY: number, index: number) => {
      if (!onPointChange || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const innerY = clientY - rect.top - MARGIN.top;
      const v = innerPixelYToValue(innerY, innerH, yDomain);
      onPointChange(index, v);
    },
    [innerH, onPointChange, yDomain]
  );

  const handleKeyOnPoint = useCallback(
    (index: number, delta: number) => {
      if (!onPointChange) return;
      const cur = Number.isFinite(values[index]) ? values[index]! : 0;
      const step = Math.max(1e-4, (yDomain[1] - yDomain[0]) * 0.02);
      const next = Math.min(yDomain[1], Math.max(yDomain[0], cur + delta * step));
      onPointChange(index, next);
    },
    [onPointChange, values, yDomain]
  );

  if (width < 24 || innerH < 8 || points.length === 0) {
    return null;
  }

  const hasAnyDrag = Boolean(onPointChange);
  const isPointDraggable = (i: number) =>
    Boolean(onPointChange) && (!draggableIndices || draggableIndices.includes(i));

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={cn('text-primary', hasAnyDrag && 'touch-none select-none')}
      role={hasAnyDrag ? 'group' : 'img'}
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <Group left={MARGIN.left} top={MARGIN.top}>
        {gridYs.map((gy) => (
          <line
            key={gy}
            x1={0}
            x2={innerW}
            y1={yScale(gy)}
            y2={yScale(gy)}
            className="stroke-border/50"
            strokeWidth={gy === gridYs[1] ? 1 : 0.75}
            strokeDasharray={gy === gridYs[1] ? '3 3' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points.length > 1 ? (
          <AreaClosed<Point>
            data={points}
            x={(d) => xScale(d.x)}
            y={(d) => yScale(d.y)}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={`url(#${gradId})`}
            stroke="transparent"
          />
        ) : null}
        <LinePath<Point>
          data={points}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          curve={curveMonotoneX}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => {
          const label = pointLabels?.[i] ?? `Point ${i + 1}`;
          const valNow = Number.isFinite(values[i]) ? values[i]! : 0;
          const dragging = activeDragIx === i;
          const pointDrag = isPointDraggable(i);
          return (
            <circle
              key={i}
              cx={xScale(p.x)}
              cy={yScale(p.y)}
              r={pointDrag ? 5 : 3.5}
              className={cn(
                'fill-background stroke-primary',
                pointDrag && 'cursor-ns-resize outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0'
              )}
              strokeWidth={dragging ? 2.25 : 1.75}
              vectorEffect="non-scaling-stroke"
              tabIndex={pointDrag ? 0 : undefined}
              role={pointDrag ? 'slider' : undefined}
              aria-label={pointDrag ? `${label}, value ${valNow.toFixed(3)}` : undefined}
              aria-valuemin={pointDrag ? yDomain[0] : undefined}
              aria-valuemax={pointDrag ? yDomain[1] : undefined}
              aria-valuenow={pointDrag ? valNow : undefined}
              aria-orientation={pointDrag ? 'vertical' : undefined}
              onPointerDown={
                pointDrag
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveDragIx(i);
                      (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                      applyPointerY(e.clientY, i);
                    }
                  : undefined
              }
              onPointerMove={
                pointDrag
                  ? (e) => {
                      if (!(e.currentTarget as SVGCircleElement).hasPointerCapture(e.pointerId)) return;
                      applyPointerY(e.clientY, i);
                    }
                  : undefined
              }
              onPointerUp={
                pointDrag
                  ? (e) => {
                      const el = e.currentTarget as SVGCircleElement;
                      if (el.hasPointerCapture(e.pointerId)) {
                        el.releasePointerCapture(e.pointerId);
                      }
                      setActiveDragIx((ix) => (ix === i ? null : ix));
                    }
                  : undefined
              }
              onPointerCancel={
                pointDrag
                  ? (e) => {
                      const el = e.currentTarget as SVGCircleElement;
                      if (el.hasPointerCapture(e.pointerId)) {
                        el.releasePointerCapture(e.pointerId);
                      }
                      setActiveDragIx((ix) => (ix === i ? null : ix));
                    }
                  : undefined
              }
              onKeyDown={
                pointDrag
                  ? (e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        handleKeyOnPoint(i, 1);
                      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        handleKeyOnPoint(i, -1);
                      } else if (e.key === 'Home') {
                        e.preventDefault();
                        onPointChange?.(i, yDomain[0]);
                      } else if (e.key === 'End') {
                        e.preventDefault();
                        onPointChange?.(i, yDomain[1]);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
      </Group>
    </svg>
  );
}

/** Visx mini chart: monotone-smoothed series. Default Y domain [0, 1] for weightings; pass a tighter yDomain to amplify small ranges. */
export function WeightingLineMiniChart({
  values,
  ariaLabel,
  height = 54,
  yDomain = [0, 1],
  strokeWidth = 2,
  onPointChange,
  pointLabels,
  draggableIndices,
}: {
  values: readonly number[];
  ariaLabel: string;
  height?: number;
  yDomain?: [number, number];
  strokeWidth?: number;
  onPointChange?: (index: number, value: number) => void;
  pointLabels?: readonly string[];
  draggableIndices?: readonly number[];
}) {
  return (
    <div
      className="relative mt-2 w-full min-w-0 border-t border-border/50 pt-2"
      style={{ height }}
    >
      <ParentSize className="absolute inset-0 h-full w-full" debounceTime={32}>
        {({ width, height: h }) =>
          width > 0 && h > 0 ? (
            <WeightingLineSvg
              width={width}
              height={h}
              values={values}
              ariaLabel={ariaLabel}
              yDomain={yDomain}
              strokeWidth={strokeWidth}
              onPointChange={onPointChange}
              pointLabels={pointLabels}
              draggableIndices={draggableIndices}
            />
          ) : null
        }
      </ParentSize>
    </div>
  );
}
