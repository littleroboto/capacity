import { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { yearsFromRiskSurface, type RunwayQuarter } from '@/lib/runwayDateFilter';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

const QUARTERS: { value: RunwayQuarter; label: string }[] = [
  { value: 1, label: 'Q1 (Jan–Mar)' },
  { value: 2, label: 'Q2 (Apr–Jun)' },
  { value: 3, label: 'Q3 (Jul–Sep)' },
  { value: 4, label: 'Q4 (Oct–Dec)' },
];

/** Year + quarter filters for the runway heatmap (model dates only). */
export function RunwayRangeSelect({ className }: { className?: string }) {
  const riskSurface = useAtcStore((s) => s.riskSurface);
  const runwayFilterYear = useAtcStore((s) => s.runwayFilterYear);
  const runwayFilterQuarter = useAtcStore((s) => s.runwayFilterQuarter);
  const runwayIncludeFollowingQuarter = useAtcStore((s) => s.runwayIncludeFollowingQuarter);
  const setRunwayFilterYear = useAtcStore((s) => s.setRunwayFilterYear);
  const setRunwayFilterQuarter = useAtcStore((s) => s.setRunwayFilterQuarter);
  const setRunwayIncludeFollowingQuarter = useAtcStore((s) => s.setRunwayIncludeFollowingQuarter);

  const years = useMemo(() => yearsFromRiskSurface(riskSurface), [riskSurface]);

  useEffect(() => {
    if (runwayFilterYear == null || years.length === 0) return;
    if (!years.includes(runwayFilterYear)) {
      setRunwayFilterYear(null);
      setRunwayFilterQuarter(null);
    }
  }, [years, runwayFilterYear, setRunwayFilterYear, setRunwayFilterQuarter]);

  const yearValue = runwayFilterYear != null ? String(runwayFilterYear) : 'all';
  const quarterValue = runwayFilterQuarter != null ? String(runwayFilterQuarter) : 'all';
  const quarterDisabled = runwayFilterYear == null || years.length === 0;
  const showFollowingQuarter = !quarterDisabled;

  if (years.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex min-w-0 flex-wrap items-end gap-2 sm:gap-2.5', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Label
          htmlFor="runway-range-year"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Year
        </Label>
        <Select
          value={yearValue}
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
            title="Extend the calendar through the next calendar quarter after your selection (e.g. all of 2026 plus Jan–Mar 2027, or Q2 2026 plus Q3 2026)."
          />
          <Label
            htmlFor="runway-include-following-quarter"
            className="cursor-pointer text-xs font-normal leading-tight text-muted-foreground"
            title="Extend the calendar through the next calendar quarter after your selection (e.g. all of 2026 plus Jan–Mar 2027, or Q2 2026 plus Q3 2026)."
          >
            + following quarter
          </Label>
        </div>
      ) : null}
    </div>
  );
}
