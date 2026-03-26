import { useId, useMemo } from 'react';
import { curveMonotoneX } from '@visx/curve';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { AreaClosed, LinePath } from '@visx/shape';

const MARGIN = { top: 4, right: 4, bottom: 4, left: 4 };

type Point = { x: number; y: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function buildPoints(values: readonly number[]): Point[] {
  return values.map((v, i) => ({ x: i, y: clamp01(v) }));
}

function WeightingLineSvg({
  width,
  height,
  values,
  ariaLabel,
}: {
  width: number;
  height: number;
  values: readonly number[];
  ariaLabel: string;
}) {
  const gradId = useId().replace(/:/g, '');
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const points = useMemo(() => buildPoints(values), [values]);

  const { xScale, yScale } = useMemo(() => {
    const n = Math.max(1, points.length);
    const xMax = n - 1;
    const xScale = scaleLinear<number>({
      domain: xMax > 0 ? [0, xMax] : [0, 1],
      range: [0, innerW],
      clamp: true,
    });
    const yScale = scaleLinear<number>({
      domain: [0, 1],
      range: [innerH, 0],
      clamp: true,
    });
    return { xScale, yScale };
  }, [points.length, innerW, innerH]);

  if (width < 24 || innerH < 8 || points.length === 0) {
    return null;
  }

  const gridYs = [0, 0.5, 1];

  return (
    <svg
      width={width}
      height={height}
      className="text-primary"
      role="img"
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
            strokeWidth={gy === 0.5 ? 1 : 0.75}
            strokeDasharray={gy === 0.5 ? '3 3' : undefined}
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
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.x)}
            cy={yScale(p.y)}
            r={3}
            className="fill-background stroke-primary"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </Group>
    </svg>
  );
}

/** Visx mini chart: monotone-smoothed 0–1 series (weekday or month weightings). */
export function WeightingLineMiniChart({
  values,
  ariaLabel,
  height = 54,
}: {
  values: readonly number[];
  ariaLabel: string;
  height?: number;
}) {
  return (
    <div
      className="relative mt-2 w-full min-w-0 border-t border-border/50 pt-2"
      style={{ height }}
    >
      <ParentSize className="absolute inset-0 h-full w-full" debounceTime={32}>
        {({ width, height: h }) =>
          width > 0 && h > 0 ? (
            <WeightingLineSvg width={width} height={h} values={values} ariaLabel={ariaLabel} />
          ) : null
        }
      </ParentSize>
    </div>
  );
}
