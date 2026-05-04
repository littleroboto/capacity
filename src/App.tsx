import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Header } from '@/components/Header';
import { WorkbenchSidebar } from '@/components/WorkbenchSidebar';
import { ProductionAuthHintBanner } from '@/components/ProductionAuthHintBanner';
import { SharedCloudLoadWarningBanner } from '@/components/SharedCloudLoadWarningBanner';
import { SharedDslConflictBanner } from '@/components/SharedDslConflictBanner';
import { DSLPanel } from '@/components/DSLPanel';
import { WORKBENCH_SPLIT_HANDLE_PX, WorkbenchSplitHandle } from '@/components/WorkbenchSplitHandle';
import { useMediaMinWidth } from '@/hooks/useMediaMinWidth';
import { MainDslWorkspace } from '@/components/MainDslWorkspace';
import { RunwayGrid, type SlotSelection } from '@/components/RunwayGrid';
import { RunwayHeatmapSkeleton } from '@/components/RunwayHeatmapSkeleton';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { publicAsset } from '@/lib/publicUrl';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { deferTwoAnimationFrames } from '@/lib/deferPaint';
import { fetchRunwayMarketOrder } from '@/lib/runwayManifest';
import { isRunwayMultiMarketStrip } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import { filterManifestOrderForAccess } from '@/lib/capacityAccess';
import { useCapacityAccess } from '@/lib/capacityAccessContext';
import { useWorkbenchUrlViewState } from '@/hooks/useWorkbenchUrlViewState';
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
/** Initial width for the controls column (Focus, year, shortcuts). Drag the split handle to resize. */
const DEFAULT_DSL_PANEL_PX = 392;

type RunwayBootstrapUi = { message: string; progressLabel?: string };

export default function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const persistReady = useWorkbenchUrlViewState(searchParams, setSearchParams);
  const access = useCapacityAccess();
  const accessBootstrapKey = useMemo(() => {
    if (access.legacyFullAccess || access.admin) return 'full';
    return `lim:${[...access.allowedMarketIds].sort().join(',')}`;
  }, [access.legacyFullAccess, access.admin, access.allowedMarketIds]);

  const onSlotSelection = useCallback((_s: SlotSelection | null) => {}, []);

  const riskSurfaceLedgerView = useAtcStore((s) => s.riskSurfaceLedgerView);
  const riskSurfaceFull = useAtcStore((s) => s.riskSurface);
  /** Counterfactual daily rows when ledger exclusions apply; else full pipeline (see ledger counterfactual spec). */
  const riskSurface = riskSurfaceLedgerView !== null ? riskSurfaceLedgerView : riskSurfaceFull;
  const parseError = useAtcStore((s) => s.parseError);
  const viewMode = useAtcStore((s) => s.viewMode);
  const country = useAtcStore((s) => s.country);
  const setViewMode = useAtcStore((s) => s.setViewMode);

  const [dslPanelCollapsed, setDslPanelCollapsed] = useState(false);
  const lgUp = useMediaMinWidth(1024);
  const dslPanelLayoutCollapsed = dslPanelCollapsed && lgUp;
  const mainGridRef = useRef<HTMLDivElement>(null);
  const [cloudLoadWarning, setCloudLoadWarning] = useState<string | null>(null);
  const [mobileCodeFullscreen, setMobileCodeFullscreen] = useState(false);

  const [dslRightWidthPx, setDslRightWidthPx] = useState(DEFAULT_DSL_PANEL_PX);
  /** Non-null while initial market YAML + first pipeline run are in flight (heatmap area only). */
  const [runwayBootstrap, setRunwayBootstrap] = useState<RunwayBootstrapUi | null>({
    message: 'Preparing workbench…',
  });

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
    // Light mode is permanent; defensively strip any 'dark' class injected by
    // older persisted state, third-party scripts, or system colour-scheme heuristics.
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    document.title = 'Capacity Workbench';
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
    if (!persistReady) return;
    let cancelled = false;
    let stopOutboundSync: (() => void) | undefined;
    const { setDslByMarket, setRunwayMarketOrder, hydrateFromStorage } = useAtcStore.getState();
    setRunwayBootstrap({ message: 'Loading workspace…' });

    const loadOneMarketYaml = async (id: string): Promise<readonly [string, string] | null> => {
      try {
        try {
          const r = await fetch(publicAsset(`data/markets/${id}.yaml`));
          if (r.ok) {
            const text = await r.text();
            if (looksLikeYamlDsl(text)) return [id, text] as const;
          }
        } catch {
          /* ignore */
        }
        const seed = defaultDslForMarket(id);
        if (looksLikeYamlDsl(seed)) return [id, seed] as const;
        return null;
      } catch {
        return null;
      }
    };

    const loadYamlMap = async (
      ids: readonly string[],
      bump?: () => void
    ): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      const loaded = await Promise.all(
        ids.map(async (id) => {
          try {
            const row = await loadOneMarketYaml(id);
            return row;
          } finally {
            bump?.();
          }
        })
      );
      for (const row of loaded) {
        if (row) {
          const [id, text] = row;
          out[id] = text;
        }
      }
      return out;
    };

    (async () => {
      setRunwayBootstrap({ message: 'Fetching market directory…' });
      const order = await fetchRunwayMarketOrder();
      if (cancelled) return;
      const orderEffective =
        access.legacyFullAccess || access.admin
          ? order
          : filterManifestOrderForAccess(order, access);
      const focusCountry = useAtcStore.getState().country;
      const canStageYamlFirst =
        !isSharedDslEnabled() &&
        !isRunwayMultiMarketStrip(focusCountry) &&
        orderEffective.includes(focusCountry);

      let dslByMarket: Record<string, string> | undefined;
      let didStagedTwoPhaseHydrate = false;

      if (canStageYamlFirst) {
        setRunwayBootstrap({ message: `Loading ${focusCountry}…` });
        const partial = await loadYamlMap([focusCountry]);
        if (cancelled) return;
        if (partial[focusCountry]) {
          setRunwayMarketOrder(orderEffective);
          setDslByMarket(partial);
          setRunwayBootstrap({
            message: 'Computing runway and heatmaps…',
            progressLabel: undefined,
          });
          await deferTwoAnimationFrames();
          if (cancelled) return;
          await hydrateFromStorage(mergeMarketsToMultiDocYaml(partial, orderEffective));
          if (cancelled) return;
          setRunwayBootstrap(null);

          const restIds = orderEffective.filter((id) => id !== focusCountry);
          const more = await loadYamlMap(restIds);
          if (cancelled) return;
          dslByMarket = { ...partial, ...more };
          setRunwayMarketOrder(orderEffective);
          setDslByMarket(dslByMarket);
          await deferTwoAnimationFrames();
          if (cancelled) return;
          await hydrateFromStorage(mergeMarketsToMultiDocYaml(dslByMarket, orderEffective));
          didStagedTwoPhaseHydrate = true;
        }
      }

      if (dslByMarket == null) {
        const totalYaml = orderEffective.length;
        let yamlDone = 0;
        const bumpYamlProgress = () => {
          if (cancelled) return;
          yamlDone += 1;
          setRunwayBootstrap({
            message: 'Loading market YAML in parallel…',
            progressLabel: `${yamlDone} / ${totalYaml}`,
          });
        };
        setRunwayBootstrap({
          message: 'Loading market YAML in parallel…',
          progressLabel: `0 / ${totalYaml}`,
        });
        dslByMarket = await loadYamlMap(orderEffective, bumpYamlProgress);
        if (cancelled) return;
      }

      let multiDocFallback = mergeMarketsToMultiDocYaml(dslByMarket, orderEffective);

      if (isSharedDslEnabled()) {
        setRunwayBootstrap({ message: 'Preparing cloud workspace session…' });
        await waitForSharedDslFetchAuth();
        if (cancelled) return;
        setRunwayBootstrap({ message: 'Fetching shared YAML from team workspace…' });
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
          const fromApi = detail.serverDetail?.trim();
          setCloudLoadWarning(
            `The team cloud workspace did not authorize this session (HTTP 401). You are viewing bundled market YAML only.${
              fromApi ? ` Server: ${fromApi}` : ''
            } Open Workspace below for a connection check, or reload after fixing Clerk keys / sign-in.`
          );
        } else if (detail.reason === 'forbidden' && !cancelled) {
          setCloudLoadWarning(
            'The team cloud workspace rejected this account (HTTP 403). You may not be on the deployment email allowlist, or the session JWT is missing your email claim. Check VITE_ALLOWED_USER_EMAILS / CAPACITY_ALLOWED_USER_EMAILS and Clerk session token customization — or open Workspace for a connection check.'
          );
        }
      }

      const needsBundledHydrate = !didStagedTwoPhaseHydrate || isSharedDslEnabled();
      if (needsBundledHydrate) {
        setRunwayBootstrap({
          message: 'Computing runway and heatmaps…',
          progressLabel: undefined,
        });
        setRunwayMarketOrder(orderEffective);
        setDslByMarket(dslByMarket);
        await deferTwoAnimationFrames();
        if (cancelled) return;
        await hydrateFromStorage(multiDocFallback);
      }

      markSharedDslBaseline(mergeStateToFullMultiDoc(useAtcStore.getState()));

      if (!cancelled && isSharedDslEnabled()) {
        stopOutboundSync = initSharedDslOutboundSync();
      }
      if (!cancelled) {
        setRunwayBootstrap(null);
      }
    })();

    return () => {
      cancelled = true;
      stopOutboundSync?.();
    };
    // Re-run when segment ACL changes (e.g. Clerk session claims loaded).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- access object identity is unstable; key is canonical
  }, [accessBootstrapKey, persistReady]);

  return (
    <div className="workbench-studio flex h-screen min-h-0 flex-col bg-background text-foreground">
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
          <div className="flex min-h-0 flex-1 flex-row">
            <WorkbenchSidebar parseError={parseError} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Header layout="studio" />
              <main
                className={cn(
                  'flex min-h-0 flex-1 flex-col bg-transparent',
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
                      lgUp && 'bg-muted/20',
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
                      <p className="shrink-0 text-sm text-muted-foreground" role="status">
                        YAML error — open Code view for details.
                      </p>
                    ) : null}
                    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
                        {runwayBootstrap ? (
                          <RunwayHeatmapSkeleton
                            message={runwayBootstrap.message}
                            progressLabel={runwayBootstrap.progressLabel}
                          />
                        ) : (
                          <RunwayGrid
                            riskSurface={riskSurface}
                            viewMode={viewMode}
                            onSlotSelection={onSlotSelection}
                          />
                        )}
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
                  <DSLPanel
                    collapsed={dslPanelLayoutCollapsed}
                    onCollapsedChange={setDslPanelCollapsed}
                    primaryNavInSidebar={lgUp}
                  />
                </div>
              </main>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
