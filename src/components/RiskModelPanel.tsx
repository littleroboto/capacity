import { useMemo, useState } from 'react';
import { RightPanelSection } from '@/components/RightPanelSection';
import { RestaurantTradingPatternsPanel } from '@/components/RestaurantTradingPatternsPanel';
import { TechLensPatternsPanel } from '@/components/TechLensPatternsPanel';
import { gammaFocusMarket, isRunwayMultiMarketStrip, runwayFocusStripLabel } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';

const PATTERNS_INNER_SCROLL =
  'min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-lg border border-border/60 bg-card px-3 pb-3 pt-3 text-card-foreground shadow-sm ring-1 ring-border/50 dark:ring-border/40 [-webkit-overflow-scrolling:touch]';

const PATTERNS_OUTER_WRAP =
  'flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-x-hidden overflow-y-hidden border-t border-border/50 bg-background/25 px-3 pb-3 pt-3 dark:bg-background/20';

/** Lens-specific YAML pattern editors (no tabs). Same structure for single-market and compare strips; focus market from {@link gammaFocusMarket}. */
export function RiskModelPanel() {
  const [expanded, setExpanded] = useState(false);
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const compareAllMarkets = isRunwayMultiMarketStrip(country);

  const focusMarket = useMemo(
    () => gammaFocusMarket(country, configs, runwayMarketOrder),
    [country, configs, runwayMarketOrder]
  );

  const patternKind = useMemo(() => {
    if (viewMode === 'in_store' || viewMode === 'market_risk') return 'trading' as const;
    if (viewMode === 'combined') return 'tech_support' as const;
    return null;
  }, [viewMode]);

  if (viewMode === 'code' || patternKind == null) return null;

  const stripPrefix = compareAllMarkets ? (
    <>
      <span className="font-medium text-foreground/90">{runwayFocusStripLabel(country)}</span>
      {' · '}
    </>
  ) : null;

  const collapsedSummary =
    patternKind === 'trading' ? (
      <span className="text-[11px] text-muted-foreground">
        {stripPrefix}
        <span className="font-medium text-foreground/90">Trading</span>
        {' · '}
        weekly / monthly / early-month
        {viewMode === 'market_risk'
          ? ' · market risk shape · heatmap · deploy. context'
          : ' · global heatmap + offset'}
      </span>
    ) : (
      <span className="text-[11px] text-muted-foreground">
        {stripPrefix}
        <span className="font-medium text-foreground/90">Tech</span>
        {' · '}
        supply & week shape · global heatmap + offset
      </span>
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <RightPanelSection
        expanded={expanded}
        onExpandedChange={setExpanded}
        title="Business Patterns"
        collapsedSummary={collapsedSummary}
      >
        <div className={PATTERNS_OUTER_WRAP}>
          <div className={PATTERNS_INNER_SCROLL}>
            {compareAllMarkets ? (
              <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground/85">{runwayFocusStripLabel(country)}</span>
                {' — '}
                same Business Patterns as single-market (2D or 3D). YAML follows runway focus{' '}
                <span className="font-mono text-foreground/80">{focusMarket}</span>; heatmap pressure offset, curve, γ,
                tail power, and market-risk mix are global across columns and lenses.
              </p>
            ) : null}
            {patternKind === 'trading' ? (
              <RestaurantTradingPatternsPanel />
            ) : (
              <TechLensPatternsPanel />
            )}
          </div>
        </div>
      </RightPanelSection>
    </div>
  );
}
