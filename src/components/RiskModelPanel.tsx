import { useMemo, useState } from 'react';
import { RightPanelSection } from '@/components/RightPanelSection';
import { RestaurantTradingPatternsPanel } from '@/components/RestaurantTradingPatternsPanel';
import { TechLensPatternsPanel } from '@/components/TechLensPatternsPanel';
import { isRunwayMultiMarketStrip, runwayFocusStripLabel } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';

const PATTERNS_INNER_SCROLL =
  'min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2.5 pb-1 pt-2.5 text-foreground [-webkit-overflow-scrolling:touch]';

const PATTERNS_OUTER_WRAP =
  'flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-x-hidden overflow-y-hidden px-0 pb-0 pt-0';

/** Lens-specific YAML pattern editors (no tabs). Same structure for single-market and compare strips; focus market from {@link gammaFocusMarket}. */
export function RiskModelPanel() {
  /** Business Patterns: open by default so YAML / support editors are visible. */
  const [expanded, setExpanded] = useState(true);
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const compareAllMarkets = isRunwayMultiMarketStrip(country);

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
        {compareAllMarkets
          ? 'heatmap offset + transfer'
          : viewMode === 'market_risk'
            ? 'weekly / monthly / early-month · deploy. context · heatmap'
            : 'weekly / monthly / early-month · heatmap'}
      </span>
    ) : (
      <span className="text-[11px] text-muted-foreground">
        {stripPrefix}
        <span className="font-medium text-foreground/90">Tech</span>
        {' · '}
        support week & supply (YAML)
      </span>
    );

  return (
    <div className="mt-1.5 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/55 bg-muted/15 dark:border-border/45 dark:bg-muted/10">
      <RightPanelSection
        className="min-h-0 flex-1 border-b-0"
        expanded={expanded}
        onExpandedChange={setExpanded}
        title="Business Patterns"
        collapsedSummary={collapsedSummary}
      >
        <div className={PATTERNS_OUTER_WRAP}>
          <div className={PATTERNS_INNER_SCROLL}>
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
