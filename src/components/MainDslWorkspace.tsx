import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DslAssistantPanel } from '@/components/DslAssistantPanel';
import { DslEditorCore, DslSyntaxHelpBody } from '@/components/DslEditorCore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { GripHorizontal } from 'lucide-react';

const DOCK_H_KEY = 'capacity:dsl-dock-px';
const DEFAULT_DOCK_PX = 300;
const MIN_DOCK_PX = 160;
/** Keep at least this much vertical space for the code editor when dragging the assistant up. */
const MIN_EDITOR_RESIZE_PX = 140;
const SEPARATOR_HIT_PX = 12;

function readDockHeight(): number {
  try {
    const n = Number.parseInt(sessionStorage.getItem(DOCK_H_KEY) ?? '', 10);
    if (Number.isFinite(n) && n >= MIN_DOCK_PX) return Math.min(n, 560);
  } catch {
    /* ignore */
  }
  return DEFAULT_DOCK_PX;
}

/** Full-width IDE layout: Monaco + resizable assistant dock (single main column). */
export function MainDslWorkspace() {
  const [syntaxOpen, setSyntaxOpen] = useState(false);
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
    try {
      sessionStorage.setItem(DOCK_H_KEY, String(Math.round(dockHeight)));
    } catch {
      /* ignore */
    }
  }, [dockHeight]);

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

  return (
    <div
      ref={workspaceRef}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-0"
    >
      <DslEditorCore
        className="min-h-[min(12rem,35dvh)] min-w-0 flex-1"
        initialFontSize={16}
        showApplyButton={false}
        editorChrome="studio"
        onSyntaxReference={() => setSyntaxOpen(true)}
      />

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize code editor and assistant"
        aria-valuemin={MIN_DOCK_PX}
        aria-valuemax={maxDockPx}
        aria-valuenow={Math.round(dockHeight)}
        title="Drag to resize · double-click to reset assistant height"
        className={cn(
          'group relative z-10 flex shrink-0 cursor-row-resize items-center justify-center border-y border-border/30 bg-muted/20',
          'min-h-[12px] py-1 transition-[background-color,border-color] duration-150',
          'hover:border-border/60 hover:bg-muted/45',
          dragging && 'border-primary/40 bg-primary/10',
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
        className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-b-2xl border border-t-0 border-border/60 bg-card/40 px-3 pb-3 pt-2.5 shadow-sm dark:border-border/50 dark:bg-zinc-950/40"
        style={{ height: dockHeight }}
      >
        <DslAssistantPanel layout="dock" />
      </div>

      <Dialog open={syntaxOpen} onOpenChange={setSyntaxOpen}>
        <DialogContent className="max-h-[min(85dvh,720px)] gap-0 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>DSL syntax reference</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto py-2">
            <DslSyntaxHelpBody />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setSyntaxOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
