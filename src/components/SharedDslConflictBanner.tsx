import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isSharedDslEnabled,
  OPEN_WORKSPACE_EVENT,
  SHARED_DSL_CONFLICT_CLEARED_EVENT,
  SHARED_DSL_SAVE_CONFLICT_EVENT,
} from '@/lib/sharedDslSync';

/**
 * Shown when a cloud PUT returns 409 (optimistic lock / another session saved first).
 * Supplements Workspace inline copy so auto-save conflicts are visible without opening the dialog.
 */
export function SharedDslConflictBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isSharedDslEnabled()) return;

    const onConflict = () => setVisible(true);
    const onCleared = () => setVisible(false);

    window.addEventListener(SHARED_DSL_SAVE_CONFLICT_EVENT, onConflict);
    window.addEventListener(SHARED_DSL_CONFLICT_CLEARED_EVENT, onCleared);
    return () => {
      window.removeEventListener(SHARED_DSL_SAVE_CONFLICT_EVENT, onConflict);
      window.removeEventListener(SHARED_DSL_CONFLICT_CLEARED_EVENT, onCleared);
    };
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  const openWorkspace = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT));
    } catch {
      /* ignore */
    }
  }, []);

  if (!isSharedDslEnabled() || !visible) return null;

  return (
    <div
      className="flex shrink-0 flex-wrap items-start gap-2 border-b border-amber-500/35 bg-amber-500/10 px-4 py-2 text-xs text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-50"
      role="status"
    >
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold">Team workspace conflict.</span> Another session saved to the cloud first (HTTP
        409). Open Workspace and use <span className="font-medium">Pull from cloud</span> to load the latest copy, then
        re-apply your edits — or save again if you intend to overwrite after reviewing.
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 border-amber-600/40 bg-background/90 px-2 text-[11px] text-amber-950 hover:bg-amber-500/15 dark:border-amber-300/40 dark:text-amber-50"
          onClick={openWorkspace}
        >
          Open Workspace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-amber-950 hover:bg-amber-500/20 dark:text-amber-50"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
