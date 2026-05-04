import { Link, useNavigate } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { useCallback } from 'react';
import { Database, FileCode2, LayoutDashboard, LayoutGrid, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentWorkbenchMark } from '@/components/SegmentWorkbenchMark';
import { APP_VERSION, GIT_COMMIT_SHORT } from '@/lib/buildMeta';
import { useCapacityAccess } from '@/lib/capacityAccessContext';
import {
  FALLBACK_RUNWAY_MARKET_IDS,
  gammaFocusMarket,
  isRunwayMultiMarketStrip,
} from '@/lib/markets';
import {
  OPEN_WORKSPACE_EVENT,
  requestOpenWorkbenchSettingsDialog,
} from '@/lib/sharedDslSync';
import { useAtcStore } from '@/store/useAtcStore';
import { PRODUCT_NAME_SPOKEN, PRODUCT_WORDMARK } from '@/lib/productBranding';
import { adminMarketEntityPath, DEFAULT_ADMIN_MARKET_ENTITY } from '@/pages/admin/adminMarketTabs';
import { cn } from '@/lib/utils';

type WorkbenchSidebarProps = {
  parseError: string | null;
};

const railBtn = cn(
  'h-10 w-10 shrink-0 rounded-md p-0 text-muted-foreground transition-colors',
  'hover:bg-accent hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
);

const railBtnActive = 'bg-primary/12 text-primary hover:bg-primary/16 hover:text-primary';

/**
 * Primary navigation rail for large screens — Supabase-style icon column so the main canvas stays clean.
 */
export function WorkbenchSidebar({ parseError }: WorkbenchSidebarProps) {
  const navigate = useNavigate();
  const access = useCapacityAccess();
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const runwayLensBeforeCode = useAtcStore((s) => s.runwayLensBeforeCode);
  const compareAllMarkets = isRunwayMultiMarketStrip(country);
  const canAdmin = access.admin || access.legacyFullAccess;
  const order = runwayMarketOrder.length ? runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];
  const adminFocusMarketId = gammaFocusMarket(country, configs, order);
  const adminMarketPath = adminMarketEntityPath(adminFocusMarketId, DEFAULT_ADMIN_MARKET_ENTITY);

  const onLogoClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const st = useAtcStore.getState();
      if (isRunwayMultiMarketStrip(st.country)) {
        const order = st.runwayMarketOrder.length ? st.runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];
        st.setCountry(gammaFocusMarket(st.country, st.configs, order), {});
      }
      // Explicit empty search so we never carry `/app` query params onto marketing `/`
      // (some navigations were leaving a long query string on `/` then syncing back to `/app`).
      navigate({ pathname: '/', search: '' }, { replace: true });
    },
    [navigate]
  );

  const openWorkspace = useCallback(() => {
    window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT));
  }, []);

  return (
    <aside
      className={cn(
        'hidden h-full min-h-0 w-[52px] shrink-0 flex-col items-center border-r border-border/80 bg-card/90 py-2',
        'lg:flex'
      )}
      aria-label="Primary navigation"
    >
      <Link
        to="/"
        onClick={onLogoClick}
        className={cn(
          'mb-2 flex h-10 w-10 flex-col items-center justify-center rounded-md text-foreground no-underline',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
        )}
        title={`${PRODUCT_WORDMARK} — home`}
        aria-label={`${PRODUCT_NAME_SPOKEN}, go to marketing home`}
      >
        <SegmentWorkbenchMark className="h-6 w-6 shrink-0 text-primary" />
      </Link>

      <div className="mb-1.5 w-7 border-t border-border/60" aria-hidden />

      {!compareAllMarkets ? (
        <div className="flex flex-col items-center gap-1" role="group" aria-label="Editor">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(railBtn, viewMode !== 'code' ? railBtnActive : 'opacity-55')}
            onClick={() => setViewMode(runwayLensBeforeCode)}
            title="Runway heatmap"
            aria-label="Runway heatmap"
            aria-current={viewMode !== 'code' ? 'page' : undefined}
          >
            <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(railBtn, viewMode === 'code' ? railBtnActive : 'opacity-55')}
            onClick={() => setViewMode('code')}
            title="YAML editor"
            aria-label="Open YAML editor"
            aria-current={viewMode === 'code' ? 'page' : undefined}
          >
            <FileCode2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </Button>
          {canAdmin && viewMode !== 'code' ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={railBtn}
              title={`Fragments admin — ${adminFocusMarketId} (all markets: /admin)`}
              aria-label={`Open ${adminFocusMarketId} in admin`}
            >
              <Link to={adminMarketPath}>
                <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1" />

      <div className="flex flex-col items-center gap-1 pb-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={railBtn}
          onClick={openWorkspace}
          title="Workspace — cloud sync and local data"
          aria-label="Open workspace"
        >
          <Database className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={railBtn}
          onClick={() => requestOpenWorkbenchSettingsDialog()}
          title="Workbench settings — runway, programme plan, heatmap"
          aria-label="Open workbench settings"
        >
          <Settings2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </Button>
        {parseError ? (
          <span
            className="mt-0.5 h-2 w-2 rounded-full bg-destructive"
            title="YAML error — open Code view for the full message"
            aria-label="YAML error — open Code view for details"
          />
        ) : null}
      </div>

      <div className="mt-auto flex flex-col items-center gap-0.5 px-1 pt-1 text-center">
        <span className="font-mono text-[9px] font-medium tabular-nums text-muted-foreground/90">{country}</span>
        <span
          className="text-[8px] leading-tight text-muted-foreground/60"
          title={`${GIT_COMMIT_SHORT}`}
        >
          v{APP_VERSION}
        </span>
      </div>
    </aside>
  );
}
