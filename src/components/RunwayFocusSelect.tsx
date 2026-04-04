import { runwayFocusAllowed } from '@/lib/capacityAccess';
import { useCapacityAccess } from '@/lib/capacityAccessContext';
import {
  FALLBACK_RUNWAY_MARKET_IDS,
  RUNWAY_ALL_MARKETS_LABEL,
  RUNWAY_ALL_MARKETS_VALUE,
  RUNWAY_IOM_MARKETS_LABEL,
  RUNWAY_IOM_MARKETS_VALUE,
  RUNWAY_IOM_SEGMENT_MARKET_IDS,
  RUNWAY_LIOM_SEGMENT_MARKET_IDS,
  runwaySegmentMarketsOrdered,
} from '@/lib/markets';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';

/** LIOM / IOM / single-market picker — nested by segment under the main runway card. */
export function RunwayFocusSelect({ className }: { className?: string }) {
  const access = useCapacityAccess();
  const country = useAtcStore((s) => s.country);
  const runwayReturnPicker = useAtcStore((s) => s.runwayReturnPicker);
  const configs = useAtcStore((s) => s.configs);
  const setCountry = useAtcStore((s) => s.setCountry);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const ids = runwayMarketOrder.length ? runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];

  const liomMarketsRaw = runwaySegmentMarketsOrdered(RUNWAY_LIOM_SEGMENT_MARKET_IDS, ids);
  const iomMarketsRaw = runwaySegmentMarketsOrdered(RUNWAY_IOM_SEGMENT_MARKET_IDS, ids);
  const liomMarkets =
    access.legacyFullAccess || access.admin
      ? liomMarketsRaw
      : liomMarketsRaw.filter((id) => access.allowedMarketIds.includes(id));
  const iomMarkets =
    access.legacyFullAccess || access.admin
      ? iomMarketsRaw
      : iomMarketsRaw.filter((id) => access.allowedMarketIds.includes(id));
  const grouped = new Set([...liomMarkets, ...iomMarkets]);
  const otherMarketsAll = ids.filter((id) => !grouped.has(id));
  const otherMarkets =
    access.legacyFullAccess || access.admin
      ? otherMarketsAll
      : otherMarketsAll.filter((id) => access.allowedMarketIds.includes(id));

  const showLiomGroup =
    (access.legacyFullAccess || access.admin || access.segments.includes('LIOM')) && liomMarkets.length > 0;
  const showIomGroup =
    (access.legacyFullAccess || access.admin || access.segments.includes('IOM')) && iomMarkets.length > 0;

  useEffect(() => {
    if (access.legacyFullAccess || access.admin) return;
    if (runwayFocusAllowed(access, country, RUNWAY_ALL_MARKETS_VALUE, RUNWAY_IOM_MARKETS_VALUE)) return;
    const idList = runwayMarketOrder.length ? runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];
    const next = idList.find((id) => access.allowedMarketIds.includes(id));
    if (next && next !== country) setCountry(next);
  }, [
    access.legacyFullAccess,
    access.admin,
    access.allowedMarketIds,
    country,
    runwayMarketOrder,
    setCountry,
  ]);

  const labelForMarket = (id: string) => {
    if (id === RUNWAY_ALL_MARKETS_VALUE) return RUNWAY_ALL_MARKETS_LABEL;
    if (id === RUNWAY_IOM_MARKETS_VALUE) return RUNWAY_IOM_MARKETS_LABEL;
    const cfg = configs.find((c) => c.market === id);
    const t = cfg?.title?.trim();
    if (t && t !== id) return `${id} — ${t}`;
    return id;
  };

  const marketItemClass = 'pl-10 text-[13px]';

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
            {showLiomGroup ? (
              <SelectGroup>
                <SelectItem value={RUNWAY_ALL_MARKETS_VALUE}>
                  {RUNWAY_ALL_MARKETS_LABEL} (Segment)
                </SelectItem>
                {liomMarkets.map((id) => (
                  <SelectItem key={id} value={id} className={marketItemClass}>
                    {labelForMarket(id)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {showLiomGroup && showIomGroup ? <SelectSeparator /> : null}
            {showIomGroup ? (
              <SelectGroup>
                <SelectItem value={RUNWAY_IOM_MARKETS_VALUE}>
                  {RUNWAY_IOM_MARKETS_LABEL} (Segment)
                </SelectItem>
                {iomMarkets.map((id) => (
                  <SelectItem key={id} value={id} className={marketItemClass}>
                    {labelForMarket(id)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {otherMarkets.length > 0 ? (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  {otherMarkets.map((id) => (
                    <SelectItem key={id} value={id} className={marketItemClass}>
                      {labelForMarket(id)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            ) : null}
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
