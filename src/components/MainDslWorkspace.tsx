import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DslAssistantPanel } from '@/components/DslAssistantPanel';
import { DslEditorCore } from '@/components/DslEditorCore';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';
import { applyCodeTabDocumentEdit, getCodeTabDocumentText } from '@/lib/codeViewMarketTabs';
import { isRunwayMultiMarketStrip } from '@/lib/markets';
import { marketIdToCircleFlagCode } from '@/lib/marketCircleFlag';
import { cn } from '@/lib/utils';
import { useAtcStore } from '@/store/useAtcStore';
import { GripHorizontal, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DOCK_H_KEY = 'capacity:dsl-dock-px';
const DEFAULT_DOCK_PX = 300;
const MIN_DOCK_PX = 160;
/** Keep at least this much vertical space for the code editor when dragging the assistant up. */
const MIN_EDITOR_RESIZE_PX = 140;
const SEPARATOR_HIT_PX = 12;

/** True when the URL query includes `llm` (e.g. `?llm` or `?foo=1&llm`). */
function subscribeToLocationSearch(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
}

function readLlmQueryEnabled(): boolean {
  return new URLSearchParams(window.location.search).has('llm');
}

function useLlmAssistantFromQuery(): boolean {
  return useSyncExternalStore(subscribeToLocationSearch, readLlmQueryEnabled, () => false);
}

function readDockHeight(): number {
  try {
    const n = Number.parseInt(sessionStorage.getItem(DOCK_H_KEY) ?? '', 10);
    if (Number.isFinite(n) && n >= MIN_DOCK_PX) return Math.min(n, 560);
  } catch {
    /* ignore */
  }
  return DEFAULT_DOCK_PX;
}

type MainDslWorkspaceProps = {
  /** Mobile full-screen shell: editor + assistant share viewport height without a floor min-height. */
  fillViewport?: boolean;
  /** Opens the mobile full-screen YAML layout (shown only below `lg`; button uses `lg:hidden`). */
  onRequestMobileFullscreen?: () => void;
};

/** Full-width IDE layout: Monaco + resizable assistant dock (single main column). */
export function MainDslWorkspace({
  fillViewport = false,
  onRequestMobileFullscreen,
}: MainDslWorkspaceProps = {}) {
  const llmFromQuery = useLlmAssistantFromQuery();
  const llmFromToybox = useAtcStore((s) => s.dslLlmAssistantEnabled);
  const showLlmAssistant = llmFromQuery || llmFromToybox;
  const country = useAtcStore((s) => s.country);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const dslText = useAtcStore((s) => s.dslText);
  const dslByMarket = useAtcStore((s) => s.dslByMarket);
  const showMarketTabs = runwayMarketOrder.length > 1;
  const [codeMarketTab, setCodeMarketTab] = useState<string>(() => runwayMarketOrder[0] ?? 'DE');

  useEffect(() => {
    if (!runwayMarketOrder.length) return;
    if (!runwayMarketOrder.includes(codeMarketTab)) {
      setCodeMarketTab(runwayMarketOrder[0]!);
    }
  }, [runwayMarketOrder, codeMarketTab]);

  useEffect(() => {
    if (!isRunwayMultiMarketStrip(country) && runwayMarketOrder.includes(country)) {
      setCodeMarketTab(country);
    }
  }, [country, runwayMarketOrder]);

  const tabSliceText = useMemo(
    () => (showMarketTabs ? getCodeTabDocumentText(codeMarketTab) : ''),
    [showMarketTabs, codeMarketTab, dslText, dslByMarket, country, runwayMarketOrder]
  );

  const codeMarketTabRef = useRef(codeMarketTab);
  codeMarketTabRef.current = codeMarketTab;

  const onMarketTabSliceChange = useCallback((v: string) => {
    applyCodeTabDocumentEdit(codeMarketTabRef.current, v);
  }, []);

  const marketTabDocument = useMemo(() => {
    if (!showMarketTabs) return null;
    return {
      marketId: codeMarketTab,
      text: tabSliceText,
      onTextChange: onMarketTabSliceChange,
    };
  }, [showMarketTabs, codeMarketTab, tabSliceText, onMarketTabSliceChange]);

  const [dockHeight, setDockHeight] = useState(readDockHeight);
  const [maxDockPx, setMaxDockPx] = useState(560);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number; maxH: number } | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = workspaceRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      const max = Math.floor(h - SEPARATOR_HIT_PX - MIN_EDITOR_RESIZE_PX);
      setMaxDockPx(Math.max(MIN_DOCK_PX, Math.min(max, 720)));
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setDockHeight((prev) => Math.min(prev, maxDockPx));
  }, [maxDockPx]);

  useEffect(() => {
    if (!showLlmAssistant) return;
    try {
      sessionStorage.setItem(DOCK_H_KEY, String(Math.round(dockHeight)));
    } catch {
      /* ignore */
    }
  }, [dockHeight, showLlmAssistant]);

  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [dragging]);

  const clampDock = useCallback((h: number) => Math.min(maxDockPx, Math.max(MIN_DOCK_PX, h)), [maxDockPx]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const onPointerDownSeparator = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const maxH = maxDockPx;
      dragRef.current = { startY: e.clientY, startH: dockHeight, maxH };
      setDragging(true);
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const delta = d.startY - ev.clientY;
        setDockHeight(Math.min(d.maxH, Math.max(MIN_DOCK_PX, d.startH + delta)));
      };
      const cleanup = (ev: PointerEvent) => {
        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        endDrag();
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', cleanup);
        el.removeEventListener('pointercancel', cleanup);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', cleanup);
      el.addEventListener('pointercancel', cleanup);
    },
    [dockHeight, endDrag, maxDockPx]
  );

  const onSeparatorDoubleClick = useCallback(() => {
    setDockHeight(clampDock(DEFAULT_DOCK_PX));
  }, [clampDock]);

  const editorShellClass = fillViewport
    ? 'min-h-0 min-w-0 flex-1 border-0 pt-0 shadow-none'
    : showMarketTabs
      ? 'min-h-[min(11rem,32dvh)] min-w-0 flex-1 border-0 pt-0 shadow-none'
      : 'min-h-[min(12rem,35dvh)] min-w-0 flex-1';

  return (
    <div
      ref={workspaceRef}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-1 flex-col gap-0',
        fillViewport && 'h-full min-h-0'
      )}
    >
      {onRequestMobileFullscreen ? (
        <div className="flex shrink-0 items-center justify-end px-2 py-1.5 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onRequestMobileFullscreen}
            aria-label="Open YAML editor full screen"
          >
            <Maximize2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            Full screen
          </Button>
        </div>
      ) : null}
      {showMarketTabs ? (
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 px-2 pt-1.5"
          role="tablist"
          aria-label="Market YAML documents"
        >
          <div className="flex min-h-8 shrink-0 items-end justify-between gap-2 pb-1.5">
            <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {runwayMarketOrder.map((id) => {
              const selected = id === codeMarketTab;
              const label = id.slice(0, 2).toUpperCase();
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`${label} market YAML`}
                  id={`code-tab-${id}`}
                  tabIndex={selected ? 0 : -1}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors',
                    selected
                      ? 'border-violet-500/45 bg-violet-500/12 text-foreground shadow-sm dark:border-violet-400/35 dark:bg-violet-950/50 dark:text-violet-100'
                      : 'border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/50 hover:text-foreground'
                  )}
                  onClick={() => setCodeMarketTab(id)}
                >
                  {marketIdToCircleFlagCode(id) ? (
                    <MarketCircleFlag marketId={id} size={18} className="ring-border/40" />
                  ) : (
                    <span
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-dashed border-border/45 bg-muted/30 text-[9px] font-bold text-muted-foreground"
                      aria-hidden
                    >
                      {label.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-[1.25rem] tabular-nums">{label}</span>
                </button>
              );
            })}
            </div>
          </div>
          <DslEditorCore
            className={cn('min-w-0', editorShellClass)}
            initialFontSize={16}
            editorChrome="studio"
            marketTabDocument={marketTabDocument}
            fillVerticalSpace={fillViewport}
          />
        </div>
      ) : (
        <DslEditorCore
          className={cn('min-w-0', editorShellClass)}
          initialFontSize={16}
          editorChrome="studio"
          fillVerticalSpace={fillViewport}
        />
      )}

      {showLlmAssistant ? (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize code editor and assistant"
            aria-valuemin={MIN_DOCK_PX}
            aria-valuemax={maxDockPx}
            aria-valuenow={Math.round(dockHeight)}
            title="Drag to resize · double-click to reset assistant height"
            className={cn(
              'group relative z-10 flex shrink-0 cursor-row-resize items-center justify-center bg-transparent',
              'min-h-[12px] py-1 transition-[background-color] duration-150',
              'hover:bg-muted/25',
              dragging && 'bg-muted/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            )}
            style={{ minHeight: SEPARATOR_HIT_PX }}
            tabIndex={0}
            onPointerDown={onPointerDownSeparator}
            onDoubleClick={onSeparatorDoubleClick}
            onKeyDown={(e) => {
              const step = 24;
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                setDockHeight((h) =>
                  e.key === 'ArrowUp'
                    ? clampDock(h + step)
                    : clampDock(h - step)
                );
              }
              if (e.key === 'Home') {
                e.preventDefault();
                setDockHeight(MIN_DOCK_PX);
              }
              if (e.key === 'End') {
                e.preventDefault();
                setDockHeight(maxDockPx);
              }
            }}
          >
            <span className="pointer-events-none flex flex-col items-center gap-0.5 text-muted-foreground">
              <GripHorizontal className="h-4 w-9 shrink-0 opacity-50 group-hover:opacity-90" strokeWidth={2} aria-hidden />
              <span className="select-none text-[10px] font-medium uppercase tracking-wider opacity-0 transition-opacity group-hover:opacity-70">
                Drag
              </span>
            </span>
          </div>

          <div
            className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden px-3 pb-3 pt-2.5"
            style={{ height: dockHeight }}
          >
            <DslAssistantPanel layout="dock" />
          </div>
        </>
      ) : null}
    </div>
  );
}
