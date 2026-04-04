import { useCallback } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OPEN_WORKSPACE_EVENT } from '@/lib/sharedDslSync';

type Props = {
  message: string;
  onDismiss: () => void;
};

/** Shown when team cloud GET fails (e.g. 401) so users know they may be on bundled YAML only. */
export function SharedCloudLoadWarningBanner({ message, onDismiss }: Props) {
  const openWorkspace = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      className="flex shrink-0 flex-wrap items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive-foreground dark:border-destructive/40 dark:bg-destructive/15"
      role="alert"
    >
      <p className="min-w-0 flex-1 leading-snug text-destructive dark:text-red-100">{message}</p>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 border-destructive/40 bg-background/80 px-2 text-[11px] text-destructive hover:bg-destructive/10 dark:text-red-100"
          onClick={openWorkspace}
        >
          Open Workspace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-destructive hover:bg-destructive/15 dark:text-red-100"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
