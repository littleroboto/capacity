import { Link, useNavigate } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { useCallback } from 'react';
import { Database, FileCode2, LayoutGrid, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DslPanelClerkSignOut } from '@/components/DslPanelClerkSignOut';
import { SegmentWorkbenchMark } from '@/components/SegmentWorkbenchMark';
import { APP_VERSION, GIT_COMMIT_SHORT } from '@/lib/buildMeta';
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
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const runwayLensBeforeCode = useAtcStore((s) => s.runwayLensBeforeCode);
  const compareAllMarkets = isRunwayMultiMarketStrip(country);

  const onLogoClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const st = useAtcStore.getState();
      if (!isRunwayMultiMarketStrip(st.country)) return;
      e.preventDefault();
      const order = st.runwayMarketOrder.length ? st.runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];
      st.setCountry(gammaFocusMarket(st.country, st.configs, order), {});
      navigate('/');
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
        title="Capacity — home"
        aria-label="Go to marketing home"
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
            title="Market configuration (YAML)"
            aria-label="Market configuration YAML"
            aria-current={viewMode === 'code' ? 'page' : undefined}
          >
            <FileCode2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </Button>
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
          title="Display and heatmap settings"
          aria-label="Open settings"
        >
          <Settings2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </Button>
        <DslPanelClerkSignOut collapsed />
        {parseError ? (
          <span
            className="mt-0.5 h-2 w-2 rounded-full bg-destructive"
            title={parseError}
            aria-label="YAML parse error"
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
