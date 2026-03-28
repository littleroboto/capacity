import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Header } from '@/components/Header';
import { SampleDataRibbon } from '@/components/SampleDataRibbon';
import { DSLPanel } from '@/components/DSLPanel';
import { WORKBENCH_SPLIT_HANDLE_PX, WorkbenchSplitHandle } from '@/components/WorkbenchSplitHandle';
import { useMediaMinWidth } from '@/hooks/useMediaMinWidth';
import { MainDslWorkspace } from '@/components/MainDslWorkspace';
import { RunwayGrid, type SlotSelection } from '@/components/RunwayGrid';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { publicAsset } from '@/lib/publicUrl';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { fetchRunwayMarketOrder } from '@/lib/runwayManifest';
import { useAtcStore } from '@/store/useAtcStore';

const DSL_PANEL_COLLAPSED_STORAGE_KEY = 'capacity:dsl-panel-collapsed';
const DSL_SPLIT_RIGHT_PX_KEY = 'capacity:dsl-split-right-px';
const MIN_DSL_PANEL_PX = 280;
const DEFAULT_DSL_PANEL_PX = 520;

export default function App() {
  const onSlotSelection = useCallback((_s: SlotSelection | null) => {}, []);

  const riskSurface = useAtcStore((s) => s.riskSurface);
  const parseError = useAtcStore((s) => s.parseError);
  const viewMode = useAtcStore((s) => s.viewMode);
  const setDslByMarket = useAtcStore((s) => s.setDslByMarket);
  const setRunwayMarketOrder = useAtcStore((s) => s.setRunwayMarketOrder);
  const hydrateFromStorage = useAtcStore((s) => s.hydrateFromStorage);
  const theme = useAtcStore((s) => s.theme);

  const [dslPanelCollapsed, setDslPanelCollapsed] = useState(() => {
    try {
      if (typeof localStorage === 'undefined') return true;
      const v = localStorage.getItem(DSL_PANEL_COLLAPSED_STORAGE_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
      return true;
    } catch {
      return true;
    }
  });
  const lgUp = useMediaMinWidth(1024);
  const dslPanelLayoutCollapsed = dslPanelCollapsed && lgUp;
  const mainGridRef = useRef<HTMLDivElement>(null);

  const [dslRightWidthPx, setDslRightWidthPx] = useState(() => {
    try {
      if (typeof localStorage === 'undefined') return DEFAULT_DSL_PANEL_PX;
      const v = localStorage.getItem(DSL_SPLIT_RIGHT_PX_KEY);
      const n = v ? Number.parseInt(v, 10) : NaN;
      if (Number.isFinite(n) && n >= MIN_DSL_PANEL_PX) return Math.min(n, 2400);
    } catch {
      /* ignore */
    }
    return DEFAULT_DSL_PANEL_PX;
  });

  const persistDslSplit = useCallback((w: number) => {
    try {
      localStorage.setItem(DSL_SPLIT_RIGHT_PX_KEY, String(Math.round(w)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!lgUp || dslPanelLayoutCollapsed || !mainGridRef.current) return;
    const el = mainGridRef.current;
    const fit = () => {
      const total = el.getBoundingClientRect().width;
      const rightEl = el.children[2] as HTMLElement | undefined;
      const measured = Math.round(rightEl?.getBoundingClientRect().width ?? 0);
      if (total < MIN_DSL_PANEL_PX + WORKBENCH_SPLIT_HANDLE_PX + 120) {
        if (measured >= MIN_DSL_PANEL_PX) {
          setDslRightWidthPx(measured);
        }
        return;
      }
      const maxRight = Math.max(
        MIN_DSL_PANEL_PX,
        Math.floor(total * 0.78) - WORKBENCH_SPLIT_HANDLE_PX
      );
      setDslRightWidthPx((prev) => {
        let next = Math.min(prev, maxRight);
        if (measured >= MIN_DSL_PANEL_PX) {
          next = Math.min(next, measured);
        }
        return Math.max(MIN_DSL_PANEL_PX, next);
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lgUp, dslPanelLayoutCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(DSL_PANEL_COLLAPSED_STORAGE_KEY, dslPanelCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [dslPanelCollapsed]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const order = await fetchRunwayMarketOrder();
      const dslByMarket: Record<string, string> = {};
      for (const id of order) {
        try {
          const r = await fetch(publicAsset(`data/markets/${id}.yaml`));
          if (r.ok) {
            const text = await r.text();
            if (looksLikeYamlDsl(text)) dslByMarket[id] = text;
          }
        } catch {
          /* ignore */
        }
        if (!dslByMarket[id]) {
          const seed = defaultDslForMarket(id);
          if (looksLikeYamlDsl(seed)) dslByMarket[id] = seed;
        }
      }
      if (cancelled) return;
      setRunwayMarketOrder(order);
      setDslByMarket(dslByMarket);
      const merged = mergeMarketsToMultiDocYaml(dslByMarket, order);
      hydrateFromStorage(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [setDslByMarket, setRunwayMarketOrder, hydrateFromStorage]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <SampleDataRibbon />
      <Header />
      <main
        className={cn(
          'flex min-h-0 flex-1 flex-col bg-transparent text-foreground',
          lgUp ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]'
        )}
      >
        <div
          ref={mainGridRef}
          className={cn(
            'grid grid-cols-1 gap-0',
            dslPanelLayoutCollapsed && 'lg:grid-cols-[minmax(0,1fr)_2.75rem]',
            lgUp && 'min-h-0 flex-1 grid-rows-1',
            !lgUp && 'w-full shrink-0'
          )}
          style={
            lgUp && !dslPanelLayoutCollapsed
              ? {
                  gridTemplateColumns: `minmax(0, 1fr) ${WORKBENCH_SPLIT_HANDLE_PX}px minmax(${MIN_DSL_PANEL_PX}px, ${dslRightWidthPx}px)`,
                }
              : undefined
          }
        >
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-col gap-2 p-4',
              viewMode === 'code'
                ? 'flex-1 overflow-hidden'
                : 'overflow-y-auto overflow-x-auto [scrollbar-gutter:stable]'
            )}
          >
            {viewMode === 'code' ? (
              <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
                <MainDslWorkspace />
              </div>
            ) : (
              <>
                {parseError ? (
                  <p className="shrink-0 text-sm text-red-600 dark:text-red-400">{parseError}</p>
                ) : null}
                <div className="flex min-h-0 w-full min-w-0 flex-col">
                  <div className="min-w-0 overflow-visible">
                    <RunwayGrid riskSurface={riskSurface} viewMode={viewMode} onSlotSelection={onSlotSelection} />
                  </div>
                </div>
              </>
            )}
          </div>
          {lgUp && !dslPanelLayoutCollapsed ? (
            <WorkbenchSplitHandle
              rightWidthPx={dslRightWidthPx}
              onWidthChange={setDslRightWidthPx}
              onDragEnd={persistDslSplit}
              containerRef={mainGridRef}
              minRightPx={MIN_DSL_PANEL_PX}
            />
          ) : null}
          <DSLPanel collapsed={dslPanelLayoutCollapsed} onCollapsedChange={setDslPanelCollapsed} />
        </div>
      </main>
    </div>
  );
}
