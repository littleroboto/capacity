import { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addMonthsToIsoYmd,
  yearsFromRiskSurface,
  type RunwayQuarter,
} from '@/lib/runwayDateFilter';
import { MAX_RUNWAY_PIPELINE_INCLUSIVE_DAYS, isRunwayCustomRangeActive } from '@/lib/runwayPipelineCalendarRange';
import { formatDateYmd } from '@/lib/weekRunway';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

const QUARTERS: { value: RunwayQuarter; label: string }[] = [
  { value: 1, label: 'Q1 (Jan–Mar)' },
  { value: 2, label: 'Q2 (Apr–Jun)' },
  { value: 3, label: 'Q3 (Jul–Sep)' },
  { value: 4, label: 'Q4 (Oct–Dec)' },
];

/** Year + quarter + optional inclusive ISO window for the runway (layout matches pipeline calendar). */
export function RunwayRangeSelect({ className }: { className?: string }) {
  const riskSurface = useAtcStore((s) => s.riskSurface);
  const runwayFilterYear = useAtcStore((s) => s.runwayFilterYear);
  const runwayFilterQuarter = useAtcStore((s) => s.runwayFilterQuarter);
  const runwayIncludeFollowingQuarter = useAtcStore((s) => s.runwayIncludeFollowingQuarter);
  const runwayCustomRangeStartYmd = useAtcStore((s) => s.runwayCustomRangeStartYmd);
  const runwayCustomRangeEndYmd = useAtcStore((s) => s.runwayCustomRangeEndYmd);
  const setRunwayFilterYear = useAtcStore((s) => s.setRunwayFilterYear);
  const setRunwayFilterQuarter = useAtcStore((s) => s.setRunwayFilterQuarter);
  const setRunwayIncludeFollowingQuarter = useAtcStore((s) => s.setRunwayIncludeFollowingQuarter);
  const setRunwayCustomRangeFields = useAtcStore((s) => s.setRunwayCustomRangeFields);

  const years = useMemo(() => yearsFromRiskSurface(riskSurface), [riskSurface]);

  const calendarSlice = useMemo(
    () => ({
      runwayCustomRangeStartYmd,
      runwayCustomRangeEndYmd,
      runwayFilterYear,
      runwayFilterQuarter,
      runwayIncludeFollowingQuarter,
    }),
    [
      runwayCustomRangeStartYmd,
      runwayCustomRangeEndYmd,
      runwayFilterYear,
      runwayFilterQuarter,
      runwayIncludeFollowingQuarter,
    ]
  );

  const customActive = isRunwayCustomRangeActive(calendarSlice);

  useEffect(() => {
    if (runwayFilterYear == null || years.length === 0) return;
    if (!years.includes(runwayFilterYear)) {
      setRunwayFilterYear(null);
      setRunwayFilterQuarter(null);
    }
  }, [years, runwayFilterYear, setRunwayFilterYear, setRunwayFilterQuarter]);

  const yearValue = runwayFilterYear != null ? String(runwayFilterYear) : 'all';
  const quarterValue = runwayFilterQuarter != null ? String(runwayFilterQuarter) : 'all';
  const quarterDisabled = runwayFilterYear == null || years.length === 0 || customActive;
  const showFollowingQuarter = years.length > 0;

  if (years.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex min-w-0 flex-wrap items-end gap-2 sm:gap-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor="runway-range-year"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Year
          </Label>
          <Select
            value={yearValue}
            disabled={customActive}
            onValueChange={(v) => {
              if (v === 'all') {
                setRunwayFilterYear(null);
                setRunwayFilterQuarter(null);
              } else {
                setRunwayFilterYear(Number.parseInt(v, 10));
              }
            }}
          >
            <SelectTrigger
              id="runway-range-year"
              className="h-8 w-[min(100%,9.5rem)] min-w-[6.5rem] text-xs font-medium"
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={cn('flex min-w-0 flex-col gap-1', quarterDisabled && 'opacity-50')}>
          <Label
            htmlFor="runway-range-quarter"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Quarter
          </Label>
          <Select
            value={quarterValue}
            disabled={quarterDisabled}
            onValueChange={(v) => {
              if (v === 'all') setRunwayFilterQuarter(null);
              else setRunwayFilterQuarter(Number.parseInt(v, 10) as RunwayQuarter);
            }}
          >
            <SelectTrigger
              id="runway-range-quarter"
              className="h-8 w-[min(100%,11rem)] min-w-[7rem] text-xs font-medium"
            >
              <SelectValue placeholder="Quarter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Full year</SelectItem>
              {QUARTERS.map((q) => (
                <SelectItem key={q.value} value={String(q.value)}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showFollowingQuarter ? (
          <div className="flex min-w-0 items-center gap-2 pb-0.5 sm:pb-0">
            <input
              id="runway-include-following-quarter"
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 rounded border border-input accent-primary"
              checked={runwayIncludeFollowingQuarter}
              onChange={(e) => setRunwayIncludeFollowingQuarter(e.target.checked)}
              title="Extend the visible and modelled calendar through the next calendar quarter after the selected span (applies to year/quarter and to the ISO window below)."
            />
            <Label
              htmlFor="runway-include-following-quarter"
              className="cursor-pointer text-xs font-normal leading-tight text-muted-foreground"
              title="Extend the visible and modelled calendar through the next calendar quarter after the selected span (applies to year/quarter and to the ISO window below)."
            >
              + following quarter
            </Label>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border/40 bg-background/40 px-2 py-1.5 dark:border-border/30 dark:bg-background/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Or ISO range
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                const start = formatDateYmd(new Date());
                const end = addMonthsToIsoYmd(start, 24);
                setRunwayCustomRangeFields({ startYmd: start, endYmd: end });
              }}
            >
              From today · 24 mo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setRunwayCustomRangeFields({ startYmd: null, endYmd: null })}
            >
              Clear window
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-end gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Label
              htmlFor="runway-custom-start"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Start
            </Label>
            <input
              id="runway-custom-start"
              type="date"
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm"
              value={runwayCustomRangeStartYmd ?? ''}
              onChange={(e) =>
                setRunwayCustomRangeFields({
                  startYmd: e.target.value ? e.target.value : null,
                })
              }
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label
              htmlFor="runway-custom-end"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              End
            </Label>
            <input
              id="runway-custom-end"
              type="date"
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm"
              value={runwayCustomRangeEndYmd ?? ''}
              onChange={(e) =>
                setRunwayCustomRangeFields({
                  endYmd: e.target.value ? e.target.value : null,
                })
              }
            />
          </div>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          When both dates are set, the grid and model use that inclusive span (same as choosing a reporting
          year). Very long spans are clipped at {MAX_RUNWAY_PIPELINE_INCLUSIVE_DAYS} days for compute; add a
          second pass if you need more.
        </p>
      </div>
    </div>
  );
}
