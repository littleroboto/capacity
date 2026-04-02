import { useMemo, useState } from 'react';
import { RightPanelSection } from '@/components/RightPanelSection';
import { RestaurantTradingPatternsPanel } from '@/components/RestaurantTradingPatternsPanel';
import { TechLensPatternsPanel } from '@/components/TechLensPatternsPanel';
import { isRunwayAllMarkets } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';

/** Lens-specific YAML pattern editors (no tabs). Heatmap controls live in the DSL panel footer → Settings. */
export function RiskModelPanel() {
  const [expanded, setExpanded] = useState(false);
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);

  const patternKind = useMemo(() => {
    if (viewMode === 'in_store' || viewMode === 'market_risk') return 'trading' as const;
    if (viewMode === 'combined') return 'tech_support' as const;
    return null;
  }, [viewMode]);

  if (isRunwayAllMarkets(country)) return null;
  if (patternKind == null) return null;

  const collapsedSummary =
    patternKind === 'trading' ? (
      <span className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/90">Trading</span>
        {' · '}
        weekly / monthly / early-month
        {viewMode === 'market_risk' ? ' · deploy. context' : ''}
      </span>
    ) : (
      <span className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/90">Tech</span>
        {' · '}
        supply & week shape
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
        <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-x-hidden overflow-y-hidden border-t border-border/50 bg-background/25 px-3 pb-3 pt-3 dark:bg-background/20">
          <div className="min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-lg border border-border/60 bg-card px-3 pb-3 pt-3 text-card-foreground shadow-sm ring-1 ring-border/50 dark:ring-border/40 [-webkit-overflow-scrolling:touch]">
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
