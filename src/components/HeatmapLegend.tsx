import { useMemo } from 'react';
import type { ViewModeId } from '@/lib/constants';
import {
  HEATMAP_TEMPERATURE_STEP_COUNT,
  heatmapLegendSwatchAtBand,
  heatmapSpectrumLegendGradientCss,
  type HeatmapColorOpts,
} from '@/lib/riskHeatmapColors';
import { cn } from '@/lib/utils';

/** Match `HeatCell` non-motion box rounding. */
const LEGEND_CELL_ROUNDED = 'rounded-[3px]';

function LegendSquare({ color, cellSizePx }: { color: string; cellSizePx: number }) {
  return (
    <div
      className={`shrink-0 cursor-default ${LEGEND_CELL_ROUNDED}`}
      style={{ width: cellSizePx, height: cellSizePx, backgroundColor: color }}
    />
  );
}

export type HeatmapLegendProps = {
  viewMode: ViewModeId;
  /** Runway heatmap cell edge length (px) — matches rendered heatmap. */
  cellSizePx: number;
  /** Gap between heat cells (px) — matches runway heatmap spacing. */
  cellGapPx: number;
  className?: string;
  /** Swatches use the same band colours / mono-alpha steps as the runway when set. */
  heatmapOpts?: HeatmapColorOpts;
};

export function HeatmapLegend({
  viewMode,
  cellSizePx,
  cellGapPx,
  className,
  heatmapOpts,
}: HeatmapLegendProps) {
  const stackStyle = { gap: cellGapPx } as const;
  const legendSteps = HEATMAP_TEMPERATURE_STEP_COUNT;
  const monoLegend = heatmapOpts?.renderStyle === 'mono';
  const continuousSpectrum =
    !monoLegend && heatmapOpts?.heatmapSpectrumMode === 'continuous';

  const swatchesHighToLow = Array.from({ length: legendSteps }, (_, i) => {
    const bandFromLow = legendSteps - 1 - i;
    const color = heatmapOpts
      ? heatmapLegendSwatchAtBand(bandFromLow, heatmapOpts)
      : heatmapLegendSwatchAtBand(bandFromLow);
    return { color, bandFromLow };
  });

  const gradientCss =
    heatmapOpts && continuousSpectrum ? heatmapSpectrumLegendGradientCss(heatmapOpts) : null;

  /** Transformed-metric positions of discrete band edges (0–1, high at top of legend) — guides the eye vs 10-band mode. */
  const discreteBandEdgeTicks01 = useMemo(
    () =>
      Array.from({ length: HEATMAP_TEMPERATURE_STEP_COUNT - 1 }, (_, i) => (i + 1) / HEATMAP_TEMPERATURE_STEP_COUNT),
    []
  );

  const topLabel = 'High';
  const bottomLabel = 'Low';
  const ariaLabel = monoLegend
    ? `Heat map legend: higher at top, lower at bottom, ${legendSteps} opacity steps (single colour).`
    : continuousSpectrum
      ? 'Heat map legend: higher at top, lower at bottom, smooth colour ramp with faint lines at the ten-band boundaries.'
      : `Heat map legend: higher at top, lower at bottom, ${legendSteps} colour steps from cool to warm.`;

  return (
    <div
      className={cn('flex w-fit max-w-full min-w-0 flex-col items-start', className)}
      data-view-mode={viewMode}
    >
      <div
        className="flex shrink-0 flex-col items-start"
        style={stackStyle}
        role="img"
        aria-label={ariaLabel}
      >
        <span className="text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {topLabel}
        </span>
        {gradientCss ? (
          <div
            className={cn('relative shrink-0 cursor-default overflow-hidden', LEGEND_CELL_ROUNDED)}
            style={{
              width: cellSizePx,
              height: cellSizePx * legendSteps + cellGapPx * (legendSteps - 1),
            }}
          >
            <div className="absolute inset-0" style={{ backgroundImage: gradientCss }} />
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {discreteBandEdgeTicks01.map((t) => (
                <div
                  key={t}
                  className="absolute right-0 left-0 h-px bg-foreground/14 dark:bg-foreground/20"
                  style={{ top: `${(1 - t) * 100}%`, transform: 'translateY(-50%)' }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col" style={{ width: cellSizePx, ...stackStyle }}>
            {swatchesHighToLow.map(({ color, bandFromLow }, i) => (
              <LegendSquare key={`${bandFromLow}-${i}`} color={color} cellSizePx={cellSizePx} />
            ))}
          </div>
        )}
        <span className="text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {bottomLabel}
        </span>
      </div>
    </div>
  );
}
