import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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

  const [dslPanelCollapsed, setDslPanelCollapsed] = useState(false);
  const lgUp = useMediaMinWidth(1024);
  const dslPanelLayoutCollapsed = dslPanelCollapsed && lgUp;
  const mainGridRef = useRef<HTMLDivElement>(null);
  const [cloudLoadWarning, setCloudLoadWarning] = useState<string | null>(null);
  const [mobileCodeFullscreen, setMobileCodeFullscreen] = useState(false);

  const [dslRightWidthPx, setDslRightWidthPx] = useState(DEFAULT_DSL_PANEL_PX);

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
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.title = 'Segment Workbench';
  }, []);

  useEffect(() => {
    if (isRunwayMultiMarketStrip(country) && viewMode === 'code') {
      setViewMode('combined');
    }
  }, [country, viewMode, setViewMode]);

  useEffect(() => {
    if (viewMode !== 'code') setMobileCodeFullscreen(false);
  }, [viewMode]);

  const showMobileCodeFs = !lgUp && viewMode === 'code' && mobileCodeFullscreen;

  useEffect(() => {
    if (!showMobileCodeFs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileCodeFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [showMobileCodeFs]);

  useEffect(() => {
    let cancelled = false;
    let stopOutboundSync: (() => void) | undefined;
    const { setDslByMarket, setRunwayMarketOrder, hydrateFromStorage } = useAtcStore.getState();

    (async () => {
      const order = await fetchRunwayMarketOrder();
      const orderEffective =
        access.legacyFullAccess || access.admin
          ? order
          : filterManifestOrderForAccess(order, access);
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
        } else if (detail.reason === 'forbidden' && !cancelled) {
          setCloudLoadWarning(
            'The team cloud workspace rejected this account (HTTP 403). You may not be on the deployment email allowlist, or the session JWT is missing your email claim. Check VITE_ALLOWED_USER_EMAILS / CAPACITY_ALLOWED_USER_EMAILS and Clerk session token customization — or open Workspace for a connection check.'
          );
        }
      }

      setRunwayMarketOrder(orderEffective);
      setDslByMarket(dslByMarket);
      hydrateFromStorage(multiDocFallback);
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
      {showMobileCodeFs ? (
        <div
          className="fixed inset-0 z-[100] flex min-h-[100dvh] w-full flex-col bg-background"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-code-fs-title"
        >
          <div
            className="flex shrink-0 items-center gap-2 border-b border-border/80 bg-background/95 px-3 py-2 backdrop-blur-sm"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => setMobileCodeFullscreen(false)}
              aria-label="Close full screen YAML editor"
            >
              Done
            </Button>
            <h2 id="mobile-code-fs-title" className="truncate text-sm font-semibold text-foreground">
              YAML editor
            </h2>
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col px-1 pb-[env(safe-area-inset-bottom)] pt-1"
          >
            <MainDslWorkspace fillViewport />
          </div>
        </div>
      ) : (
        <>
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
                    <MainDslWorkspace
                      onRequestMobileFullscreen={
                        !lgUp ? () => setMobileCodeFullscreen(true) : undefined
                      }
                    />
                  </div>
                ) : (
                  <>
                    {parseError ? (
                      <p className="shrink-0 text-sm text-red-600 dark:text-red-400">{parseError}</p>
                    ) : null}
                    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
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
                  containerRef={mainGridRef}
                  minRightPx={MIN_DSL_PANEL_PX}
                />
              ) : null}
              <DSLPanel collapsed={dslPanelLayoutCollapsed} onCollapsedChange={setDslPanelCollapsed} />
            </div>
          </main>
        </>
      )}
    </div>
  );
}
