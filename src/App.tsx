import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { DSLPanel } from '@/components/DSLPanel';
import { useMediaMinWidth } from '@/hooks/useMediaMinWidth';
import { PlanningWorkbench } from '@/components/PlanningWorkbench';
import { RunwayGrid, type SlotSelection } from '@/components/RunwayGrid';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { publicAsset } from '@/lib/publicUrl';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { fetchRunwayMarketOrder } from '@/lib/runwayManifest';
import { useAtcStore } from '@/store/useAtcStore';

const DSL_PANEL_COLLAPSED_STORAGE_KEY = 'capacity:dsl-panel-collapsed';

export default function App() {
  const [marketIds, setMarketIds] = useState<string[]>([]);
  const onSlotSelection = useCallback((_s: SlotSelection | null) => {}, []);

  const riskSurface = useAtcStore((s) => s.riskSurface);
  const parseError = useAtcStore((s) => s.parseError);
  const viewMode = useAtcStore((s) => s.viewMode);
  const setDslByMarket = useAtcStore((s) => s.setDslByMarket);
  const setRunwayMarketOrder = useAtcStore((s) => s.setRunwayMarketOrder);
  const hydrateFromStorage = useAtcStore((s) => s.hydrateFromStorage);

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

  useEffect(() => {
    try {
      localStorage.setItem(DSL_PANEL_COLLAPSED_STORAGE_KEY, dslPanelCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [dslPanelCollapsed]);

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
      setMarketIds([...order]);
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
      <Header marketIds={marketIds} />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-foreground">
        <div
          className={
            dslPanelLayoutCollapsed
              ? 'grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-0 lg:grid-cols-[minmax(0,1fr)_2.75rem]'
              : 'grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,42%)]'
          }
        >
          <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto overflow-x-auto p-4">
            {parseError ? (
              <p className="shrink-0 text-sm text-red-600 dark:text-red-400">{parseError}</p>
            ) : null}
            <div className="flex min-h-0 w-full min-w-0 flex-col gap-3">
              <div className="min-w-0 overflow-x-auto overflow-y-visible">
                <RunwayGrid riskSurface={riskSurface} viewMode={viewMode} onSlotSelection={onSlotSelection} />
              </div>
              <footer className="shrink-0 border-t border-border/60 pt-3">
                <PlanningWorkbench variant="footer" />
              </footer>
            </div>
          </div>
          <DSLPanel collapsed={dslPanelLayoutCollapsed} onCollapsedChange={setDslPanelCollapsed} />
        </div>
      </main>
    </div>
  );
}
