import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { clerkPublishableKey, isClerkAuthDisabled } from '@/lib/clerkConfig';
import { Button } from '@/components/ui/button';

const SESSION_DISMISS_KEY = 'capacity:dismiss_prod_auth_hint';

/**
 * In production, explains why Clerk sign-in is absent (missing build-time key or gate disabled).
 */
export function ProductionAuthHintBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  if (!import.meta.env.PROD || dismissed) return null;

  const pk = clerkPublishableKey();
  if (!pk) {
    return (
      <div
        className="flex shrink-0 items-start gap-2 border-b border-amber-500/35 bg-amber-500/12 px-4 py-2 text-xs text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100"
        role="status"
      >
        <p className="min-w-0 flex-1 leading-snug">
          Sign-in is off: this build has no{' '}
          <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.7rem] dark:bg-white/10">
            VITE_CLERK_PUBLISHABLE_KEY
          </code>
          . Add it under Vercel → Project → Environment Variables (Production), then redeploy so the key is baked into the bundle.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-amber-900 hover:bg-amber-500/20 dark:text-amber-50"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (isClerkAuthDisabled()) {
    return (
      <div
        className="flex shrink-0 items-start gap-2 border-b border-amber-500/35 bg-amber-500/12 px-4 py-2 text-xs text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100"
        role="status"
      >
        <p className="min-w-0 flex-1 leading-snug">
          Clerk key is present but the sign-in gate is disabled via{' '}
          <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.7rem] dark:bg-white/10">
            VITE_AUTH_DISABLED
          </code>
          . Remove or unset it in Vercel and redeploy to require sign-in.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-amber-900 hover:bg-amber-500/20 dark:text-amber-50"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return null;
}
