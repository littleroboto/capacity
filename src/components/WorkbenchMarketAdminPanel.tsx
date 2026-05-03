import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RightPanelSection } from '@/components/RightPanelSection';
import { Button } from '@/components/ui/button';
import { useCapacityAccess } from '@/lib/capacityAccessContext';
import {
  FALLBACK_RUNWAY_MARKET_IDS,
  gammaFocusMarket,
  isRunwayMultiMarketStrip,
  runwayFocusStripLabel,
} from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';

/**
 * Replaces legacy “Business Patterns” YAML sliders: fragment-backed config is edited under /admin.
 * Shown only for workspace admins (same capability as the markets admin UI).
 */
export function WorkbenchMarketAdminPanel() {
  const access = useCapacityAccess();
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const viewMode = useAtcStore((s) => s.viewMode);

  const [expanded, setExpanded] = useState(false);

  if (!(access.admin || access.legacyFullAccess) || viewMode === 'code') {
    return null;
  }

  const order = runwayMarketOrder.length ? runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];
  const marketId = gammaFocusMarket(country, configs, order);
  const compareStrip = isRunwayMultiMarketStrip(country);
  const adminMarketPath = `/admin/market/${encodeURIComponent(marketId)}`;

  return (
    <div className="flex min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border/55 bg-muted/15 dark:border-border/45 dark:bg-muted/10">
      <RightPanelSection
        className="min-h-0 shrink-0 border-b-0"
        expanded={expanded}
        onExpandedChange={setExpanded}
        title="Market admin"
        fillHeight={false}
        collapsedSummary={
          <>
            <span className="font-medium text-foreground/90">{marketId}</span>
            <span> · Open in admin</span>
          </>
        }
      >
        <div className="space-y-2 border-t border-border/40 px-2.5 pb-2.5 pt-2">
          {compareStrip ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Strip <span className="font-medium text-foreground/85">{runwayFocusStripLabel(country)}</span> — admin
              opens for pipeline focus <span className="font-medium text-foreground/85">{marketId}</span> (first column
              with config). Pick a single market in Focus to target another.
            </p>
          ) : (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Campaigns, trading, holidays, deploy risk, and tech programmes are fragment-backed in admin; build and
              publish feeds this workbench.
            </p>
          )}
          <Button asChild variant="default" size="sm" className="h-8 w-full text-xs">
            <Link to={adminMarketPath}>Open {marketId} in admin</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 w-full text-xs">
            <Link to="/admin">All markets</Link>
          </Button>
        </div>
      </RightPanelSection>
    </div>
  );
}
