import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  getSharedDslRemoteVsLocal,
  getSharedDslStaleCheckEpoch,
  isSharedDslEditingGraceActive,
  isSharedDslEnabled,
  isSharedDslLocallyEdited,
  isSharedDslRemoteStaleMuted,
  onSharedDslConflict,
  onSharedDslLocalAligned,
  pullTeamWorkspaceWithUserConfirm,
  requestOpenWorkspaceDialog,
} from '@/lib/sharedDslSync';
import { cn } from '@/lib/utils';
import { CloudDownload } from 'lucide-react';

const POLL_MS = 45_000;
/** Avoid tight visibilitychange loops (focus / tab switches) re-firing HEAD back-to-back. */
const VIS_REFRESH_DEBOUNCE_MS = 900;

/**
 * Shows when the team blob ETag is ahead of our last successful save, or right after a save conflict.
 */
export function SharedDslStaleBanner() {
  const [stale, setStale] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [pullNote, setPullNote] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshStale = useCallback(async () => {
    if (!isSharedDslEnabled() || document.visibilityState !== 'visible') return;
    const epochAtStart = getSharedDslStaleCheckEpoch();
    try {
      const vs = await getSharedDslRemoteVsLocal();
      if (!mounted.current) return;
      /** Drop superseded results (pull/save updated etag while this HEAD was in flight). */
      if (getSharedDslStaleCheckEpoch() !== epochAtStart) return;
      if (vs.status !== 'cloud_newer') {
        setStale(false);
        return;
      }
      /** This window just saved/pulled; ignore transient HEAD races. Other windows stay unmuted and still see stale. */
      if (isSharedDslRemoteStaleMuted()) {
        setStale(false);
        return;
      }
      /**
       * While the user is actively editing (dirty + recent keystrokes), ignore “server newer” from
       * etag drift or in-flight saves so the toast does not fight autosave.
       */
      if (isSharedDslLocallyEdited() && isSharedDslEditingGraceActive()) {
        setStale(false);
        return;
      }
      setStale(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isSharedDslEnabled()) return undefined;

    const offConflict = onSharedDslConflict(() => {
      setStale(true);
      void refreshStale();
    });

    const offLocalAligned = onSharedDslLocalAligned(() => {
      setStale(false);
    });

    void refreshStale();
    const t = window.setInterval(() => void refreshStale(), POLL_MS);
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (visTimer) clearTimeout(visTimer);
      visTimer = setTimeout(() => {
        visTimer = null;
        void refreshStale();
      }, VIS_REFRESH_DEBOUNCE_MS);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      offConflict();
      offLocalAligned();
      window.clearInterval(t);
      if (visTimer) clearTimeout(visTimer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshStale]);

  const runPull = async () => {
    setPullNote(null);
    setPullBusy(true);
    try {
      const r = await pullTeamWorkspaceWithUserConfirm();
      if (!mounted.current) return;
      if (r === 'ok') {
        setStale(false);
        setPullNote('Loaded the latest team workspace.');
        window.setTimeout(() => {
          if (mounted.current) setPullNote(null);
        }, 4000);
      } else if (r === 'no_remote') {
        setPullNote('Nothing on the server yet.');
      } else if (r === 'failed') {
        setPullNote('Could not load from the server. Try again.');
      }
    } finally {
      if (mounted.current) setPullBusy(false);
    }
  };

  if (!isSharedDslEnabled() || !stale) return null;

  /** Fixed toast: neutral, compact — out of document flow so layout does not jump. */
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto fixed z-[85] flex w-[min(100%-1.5rem,19rem)] flex-col gap-2 rounded-md border border-border/70 bg-card/95 p-2.5 text-xs text-muted-foreground shadow-md backdrop-blur-sm',
        'bottom-3 left-1/2 -translate-x-1/2 sm:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0',
        'dark:border-border/60 dark:bg-zinc-950/90'
      )}
    >
      <div className="flex gap-1.5">
        <CloudDownload className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
        <p className="min-w-0 leading-relaxed">
          <span className="font-medium text-foreground/90">Newer copy on server</span>
          {' · '}
          Pull or open Workspace (write secret).
        </p>
      </div>
      {pullNote ? <p className="pl-5 text-[11px] leading-snug text-muted-foreground/90">{pullNote}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-1.5 pl-5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 border border-border/80 bg-background/90 px-2 text-[11px]"
          disabled={pullBusy}
          onClick={() => void runPull()}
        >
          {pullBusy ? 'Pulling…' : 'Pull latest'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => requestOpenWorkspaceDialog()}
        >
          Workspace
        </Button>
      </div>
    </div>
  );
}
