import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Header } from '@/components/Header';
import { ProductionAuthHintBanner } from '@/components/ProductionAuthHintBanner';
import { SharedCloudLoadWarningBanner } from '@/components/SharedCloudLoadWarningBanner';
import { SharedDslConflictBanner } from '@/components/SharedDslConflictBanner';
import { DSLPanel } from '@/components/DSLPanel';
import { WORKBENCH_SPLIT_HANDLE_PX, WorkbenchSplitHandle } from '@/components/WorkbenchSplitHandle';
import { useMediaMinWidth } from '@/hooks/useMediaMinWidth';
import { MainDslWorkspace } from '@/components/MainDslWorkspace';
import { RunwayGrid, type SlotSelection } from '@/components/RunwayGrid';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { publicAsset } from '@/lib/publicUrl';
import { setAtcDsl } from '@/lib/storage';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { fetchRunwayMarketOrder } from '@/lib/runwayManifest';
import { isRunwayMultiMarketStrip } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import { filterManifestOrderForAccess } from '@/lib/capacityAccess';
import { useCapacityAccess } from '@/lib/capacityAccessContext';
import { mergeStateToFullMultiDoc, splitToDslByMarket } from '@/lib/multiDocMarketYaml';
import {
  fetchSharedDslDetailed,
  initSharedDslOutboundSync,
  isSharedDslEnabled,
  markSharedDslBaseline,
  setSharedDslEtag,
  waitForSharedDslFetchAuth,
} from '@/lib/sharedDslSync';

const DSL_PANEL_COLLAPSED_STORAGE_KEY = 'capacity:dsl-panel-collapsed';
const DSL_SPLIT_RIGHT_PX_KEY = 'capacity:dsl-split-right-px';
const MIN_DSL_PANEL_PX = 280;
const DEFAULT_DSL_PANEL_PX = 520;

export default function App() {
  const access = useCapacityAccess();
  const accessBootstrapKey = useMemo(() => {
    if (access.legacyFullAccess || access.admin) return 'full';
    return `lim:${[...access.allowedMarketIds].sort().join(',')}`;
  }, [access.legacyFullAccess, access.admin, access.allowedMarketIds]);

  const onSlotSelection = useCallback((_s: SlotSelection | null) => {}, []);

  const riskSurface = useAtcStore((s) => s.riskSurface);
  const parseError = useAtcStore((s) => s.parseError);
  const viewMode = useAtcStore((s) => s.viewMode);
  const country = useAtcStore((s) => s.country);
  const setViewMode = useAtcStore((s) => s.setViewMode);
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
  const [cloudLoadWarning, setCloudLoadWarning] = useState<string | null>(null);

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
    document.title = 'Segment Capacity Workbench';
  }, []);

  useEffect(() => {
    if (isRunwayMultiMarketStrip(country) && viewMode === 'code') {
      setViewMode('combined');
    }
  }, [country, viewMode, setViewMode]);

  useEffect(() => {
    let cancelled = false;
    let stopOutboundSync: (() => void) | undefined;
    const { setDslByMarket, setRunwayMarketOrder, hydrateFromStorage } = useAtcStore.getState();

    (async () => {
      const order = await fetchRunwayMarketOrder();
      let orderEffective =
        access.legacyFullAccess || access.admin
          ? order
          : filterManifestOrderForAccess(order, access);
      if (!access.legacyFullAccess && !access.admin && orderEffective.length === 0) {
        orderEffective = order;
      }
      const dslByMarket: Record<string, string> = {};
      for (const id of orderEffective) {
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

      let multiDocFallback = mergeMarketsToMultiDocYaml(dslByMarket, orderEffective);

      if (isSharedDslEnabled()) {
        await waitForSharedDslFetchAuth();
        if (cancelled) return;
        const detail = await fetchSharedDslDetailed();
        if (cancelled) return;
        if (detail.ok) {
          setAtcDsl(null);
          setSharedDslEtag(detail.etag || null);
          multiDocFallback = detail.yaml;
          const split = splitToDslByMarket(detail.yaml);
          for (const [k, v] of Object.entries(split)) {
            dslByMarket[k] = v;
          }
        } else if (detail.reason === 'unauthorized' && !cancelled) {
          setCloudLoadWarning(
            'The team cloud workspace did not authorize this session (HTTP 401). You are viewing bundled market YAML only. Check sign-in, Vercel CLERK_SECRET_KEY, and CAPACITY_CLERK_AUTHORIZED_PARTIES, then reload — or open Workspace below for a connection check.'
          );
        }
      }

      setRunwayMarketOrder(orderEffective);
      setDslByMarket(dslByMarket);
      hydrateFromStorage(multiDocFallback);
      if (isSharedDslEnabled()) {
        setAtcDsl(mergeStateToFullMultiDoc(useAtcStore.getState()));
      }
      markSharedDslBaseline(mergeStateToFullMultiDoc(useAtcStore.getState()));

      if (!cancelled && isSharedDslEnabled()) {
        stopOutboundSync = initSharedDslOutboundSync();
      }
    })();

    return () => {
      cancelled = true;
      stopOutboundSync?.();
    };
    // Re-run when segment ACL changes (e.g. Clerk session claims loaded).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- access object identity is unstable; key is canonical
  }, [accessBootstrapKey]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <ProductionAuthHintBanner />
      {cloudLoadWarning ? (
        <SharedCloudLoadWarningBanner message={cloudLoadWarning} onDismiss={() => setCloudLoadWarning(null)} />
      ) : null}
      <SharedDslConflictBanner />
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
