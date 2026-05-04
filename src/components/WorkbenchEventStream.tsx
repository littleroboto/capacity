import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useAtcStore } from '@/store/useAtcStore';

/** Right drawer: rolling YAML / pipeline / programme Gantt traces (see {@link useAtcStore.workbenchEventLog}). */
export function WorkbenchEventStream() {
  const log = useAtcStore((s) => s.workbenchEventLog);
  const clearWorkbenchEventLog = useAtcStore((s) => s.clearWorkbenchEventLog);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log.length, log[log.length - 1]?.id]);

  return (
    <div className="flex min-h-0 flex-col gap-1.5 rounded-lg border border-border/50 bg-zinc-950/[0.04] px-2.5 py-2 dark:border-border/40 dark:bg-zinc-950/25">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Event log</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => clearWorkbenchEventLog()}
          disabled={log.length === 0}
        >
          Clear
        </Button>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Pipeline runs, YAML apply, and staged programme Gantt builds append here (newest at bottom).
      </p>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="min-h-[7.5rem] max-h-52 overflow-y-auto rounded-md border border-emerald-700/25 bg-zinc-950/90 px-2 py-1.5 font-mono text-[10px] leading-snug text-emerald-400/95 shadow-inner dark:border-emerald-500/20 dark:bg-zinc-950/95 [scrollbar-width:thin]"
        style={{ scrollbarColor: 'rgba(16 185 129 / 0.35) transparent' }}
      >
        {log.length === 0 ? (
          <span className="text-emerald-700/70 dark:text-emerald-600/65">
            No events yet — apply YAML from the editor or switch runway view to run the model.
          </span>
        ) : (
          log.map((e) => (
            <div key={e.id} className="whitespace-pre-wrap break-words">
              {e.text}
            </div>
          ))
        )}
        {log.length > 0 ? (
          <span
            className="inline-block h-2 w-1 animate-pulse bg-emerald-400/90 align-middle"
            style={{ verticalAlign: '2px' }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}
