import { useMemo, useState } from 'react';
import { HeatmapBusinessPressureOffsetControls } from '@/components/HeatmapBusinessPressureOffsetControls';
import { HeatmapTransferControls } from '@/components/HeatmapTransferControls';
import { RightPanelSection } from '@/components/RightPanelSection';
import { RestaurantTradingPatternsPanel } from '@/components/RestaurantTradingPatternsPanel';
import { TechLensPatternsPanel } from '@/components/TechLensPatternsPanel';
import { isRunwayAllMarkets } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';

const PATTERNS_INNER_SCROLL =
  'min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-lg border border-border/60 bg-card px-3 pb-3 pt-3 text-card-foreground shadow-sm ring-1 ring-border/50 dark:ring-border/40 [-webkit-overflow-scrolling:touch]';

const PATTERNS_OUTER_WRAP =
  'flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-x-hidden overflow-y-hidden border-t border-border/50 bg-background/25 px-3 pb-3 pt-3 dark:bg-background/20';

/** Lens-specific YAML pattern editors (no tabs). Market risk heatmap transfer + offset live here; palette in Settings. */
export function RiskModelPanel() {
  const [expanded, setExpanded] = useState(false);
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const compareAllMarkets = isRunwayAllMarkets(country);

  const patternKind = useMemo(() => {
    if (viewMode === 'in_store' || viewMode === 'market_risk') return 'trading' as const;
    if (viewMode === 'combined') return 'tech_support' as const;
    return null;
  }, [viewMode]);

  if (compareAllMarkets) {
    if (viewMode === 'code') return null;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <RightPanelSection
          expanded={expanded}
          onExpandedChange={setExpanded}
          title="Business Patterns"
          collapsedSummary={
            <span className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/90">All markets</span>
              {' · '}
              {viewMode === 'market_risk'
                ? 'heatmap curve · γ · pressure offset'
                : 'heatmap curve · γ'}
            </span>
          }
        >
          <div className={PATTERNS_OUTER_WRAP}>
            <div className={PATTERNS_INNER_SCROLL}>
              <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
                Store week, deployment curves, and tech rhythm stay under <span className="font-medium text-foreground/85">Focus</span>{' '}
                on one market. Here: heatmap transfer and (Market risk) offset for the whole compare runway.
              </p>
              {viewMode === 'market_risk' ? (
                <>
                  <HeatmapTransferControls idPrefix="compare-all" variant="market_risk" />
                  <HeatmapBusinessPressureOffsetControls
                    idPrefix="compare-all"
                    className="mt-3 border-t border-border/50 pt-3"
                  />
                </>
              ) : (
                <HeatmapTransferControls idPrefix="compare-all" variant="settings" />
              )}
            </div>
          </div>
        </RightPanelSection>
      </div>
    );
  }

  if (patternKind == null) return null;

  const collapsedSummary =
    patternKind === 'trading' ? (
        <span className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/90">Trading</span>
        {' · '}
        weekly / monthly / early-month
        {viewMode === 'market_risk'
          ? ' · market risk shape · heatmap · deploy. context'
          : ''}
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
