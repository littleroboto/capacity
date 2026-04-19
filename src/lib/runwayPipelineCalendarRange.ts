import type { PipelineCalendarIsoRange } from '@/engine/pipeline';
import {
  endYmdAfterFollowingQuarter,
  enumerateIsoDatesInclusive,
  runwayPickerLayoutBounds,
  type RunwayQuarter,
} from '@/lib/runwayDateFilter';

/** Hard cap on inclusive runway span passed into the pipeline (multi-market × days). */
export const MAX_RUNWAY_PIPELINE_INCLUSIVE_DAYS = 1200;

export type RunwayCalendarWorkbenchSlice = {
  runwayCustomRangeStartYmd: string | null;
  runwayCustomRangeEndYmd: string | null;
  runwayFilterYear: number | null;
  runwayFilterQuarter: RunwayQuarter | null;
  runwayIncludeFollowingQuarter: boolean;
};

function isValidIsoYmd(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** User-set ISO window is complete and usable for layout + pipeline. */
export function isRunwayCustomRangeActive(slice: RunwayCalendarWorkbenchSlice): boolean {
  const a = slice.runwayCustomRangeStartYmd;
  const b = slice.runwayCustomRangeEndYmd;
  return isValidIsoYmd(a) && isValidIsoYmd(b) && a <= b;
}

export function clampPipelineInclusiveRange(
  startYmd: string,
  endYmd: string,
  maxDays: number = MAX_RUNWAY_PIPELINE_INCLUSIVE_DAYS
): PipelineCalendarIsoRange {
  const days = enumerateIsoDatesInclusive(startYmd, endYmd);
  if (days.length <= maxDays) return { startYmd, endYmd };
  return { startYmd, endYmd: days[maxDays - 1]! };
}

/**
 * Calendar span for {@link runPipeline} / {@link runPipelineFromDsl}.
 * Custom ISO range wins; else year/quarter layout; else rolling default (`undefined`).
 */
export function resolvePipelineCalendarRangeFromWorkbenchState(
  slice: RunwayCalendarWorkbenchSlice
): PipelineCalendarIsoRange | undefined {
  if (isRunwayCustomRangeActive(slice)) {
    let end = slice.runwayCustomRangeEndYmd!;
    if (slice.runwayIncludeFollowingQuarter) {
      end = endYmdAfterFollowingQuarter(end);
    }
    return clampPipelineInclusiveRange(slice.runwayCustomRangeStartYmd!, end);
  }
  if (slice.runwayFilterYear != null) {
    const { start, end } = runwayPickerLayoutBounds(
      slice.runwayFilterYear,
      slice.runwayFilterQuarter,
      slice.runwayIncludeFollowingQuarter
    );
    return clampPipelineInclusiveRange(start, end);
  }
  return undefined;
}
