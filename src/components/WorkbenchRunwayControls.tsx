import {
  FALLBACK_RUNWAY_MARKET_IDS,
  RUNWAY_ALL_MARKETS_LABEL,
  RUNWAY_ALL_MARKETS_VALUE,
  isRunwayAllMarkets,
} from '@/lib/markets';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ViewModeRadios } from '@/components/ViewModeRadios';
import { useAtcStore } from '@/store/useAtcStore';
import { useReducedMotion } from 'motion/react';

type WorkbenchRunwayControlsProps = {
  marketIds: string[];
};

/** Runway focus (market / LIOM) and heatmap lens — lives in the right workbench panel. */
export function WorkbenchRunwayControls({ marketIds }: WorkbenchRunwayControlsProps) {
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const viewMode = useAtcStore((s) => s.viewMode);
  const setCountry = useAtcStore((s) => s.setCountry);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const reduceMotion = useReducedMotion();

  const ids = marketIds.length ? marketIds : [...FALLBACK_RUNWAY_MARKET_IDS];

  const labelForMarket = (id: string) => {
    if (id === RUNWAY_ALL_MARKETS_VALUE) return RUNWAY_ALL_MARKETS_LABEL;
    const cfg = configs.find((c) => c.market === id);
    const t = cfg?.title?.trim();
    if (t && t !== id) return `${id} — ${t}`;
    return id;
  };

  return (
    <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
      <div className="flex flex-col gap-1">
        <Label
          htmlFor="workbench-runway-focus"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Runway focus
        </Label>
        <Select value={country} onValueChange={(v) => setCountry(v)}>
          <SelectTrigger id="workbench-runway-focus" className="h-9 w-full min-w-0 text-xs sm:text-sm">
            <SelectValue placeholder="Market" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RUNWAY_ALL_MARKETS_VALUE}>{RUNWAY_ALL_MARKETS_LABEL}</SelectItem>
            {ids.map((id) => (
              <SelectItem key={id} value={id}>
                {labelForMarket(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Single market edits YAML for that country; LIOM shows every market column on the runway.
          {!isRunwayAllMarkets(country) ? (
            <>
              {' '}
              Optional YAML <span className="font-mono text-foreground/80">title</span> /{' '}
              <span className="font-mono text-foreground/80">description</span> label the market in the picker and
              column tooltips.
            </>
          ) : null}
        </p>
      </div>

      <div className="border-t border-border/50 pt-3">
        <Label
          id="workbench-view-mode-label"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          View mode
        </Label>
        <ViewModeRadios
          viewMode={viewMode}
          setViewMode={setViewMode}
          reduceMotion={!!reduceMotion}
          compact={false}
          layoutGroupId="view-mode-panel"
          layoutBgId="view-mode-active-bg-panel"
          labelledBy="workbench-view-mode-label"
          idSuffix="panel"
        />
      </div>
    </div>
  );
}
