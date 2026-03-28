import {
  FALLBACK_RUNWAY_MARKET_IDS,
  RUNWAY_ALL_MARKETS_LABEL,
  RUNWAY_ALL_MARKETS_VALUE,
} from '@/lib/markets';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';

/** LIOM / single-market picker — lives at top-left of the main runway card (primary context control). */
export function RunwayFocusSelect({ className }: { className?: string }) {
  const country = useAtcStore((s) => s.country);
  const runwayReturnPicker = useAtcStore((s) => s.runwayReturnPicker);
  const configs = useAtcStore((s) => s.configs);
  const setCountry = useAtcStore((s) => s.setCountry);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const ids = runwayMarketOrder.length ? runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];

  const labelForMarket = (id: string) => {
    if (id === RUNWAY_ALL_MARKETS_VALUE) return RUNWAY_ALL_MARKETS_LABEL;
    const cfg = configs.find((c) => c.market === id);
    const t = cfg?.title?.trim();
    if (t && t !== id) return `${id} — ${t}`;
    return id;
  };

  return (
    <div className={cn('flex min-w-0 flex-wrap items-end gap-2 sm:gap-2.5', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Label
          htmlFor="runway-focus-select"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Focus
        </Label>
        <Select value={country} onValueChange={(v) => setCountry(v)}>
          <SelectTrigger
            id="runway-focus-select"
            className="h-8 w-[min(100%,12rem)] min-w-[7.5rem] text-xs font-medium sm:w-44"
          >
            <SelectValue placeholder="Market" />
          </SelectTrigger>
          <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))]">
            <SelectItem value={RUNWAY_ALL_MARKETS_VALUE}>{RUNWAY_ALL_MARKETS_LABEL}</SelectItem>
            {ids.map((id) => (
              <SelectItem key={id} value={id}>
                {labelForMarket(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {runwayReturnPicker ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 pb-0.5">
          <div className="hidden h-8 items-center gap-1.5 border-l border-border/60 pl-2.5 text-[11px] leading-tight text-muted-foreground sm:flex">
            <span className="font-medium">{labelForMarket(runwayReturnPicker)}</span>
            <span aria-hidden className="text-muted-foreground/70">
              /
            </span>
            <span className="font-semibold text-foreground">{labelForMarket(country)}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1 px-2.5 text-xs font-medium"
            onClick={() => setCountry(runwayReturnPicker)}
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            Back to {labelForMarket(runwayReturnPicker)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
