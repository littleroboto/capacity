import { type ReactNode, useLayoutEffect } from 'react';
import { SignIn, useAuth } from '@clerk/react';
import { setAdminTokenGetter } from '@/lib/adminApi';
import { cn } from '@/lib/utils';

/**
 * Registers the Clerk session's getToken() with the admin API client.
 * Admin APIs always require a Bearer token, even when the workbench gate is off
 * (`VITE_AUTH_DISABLED=1`): without a session we show Clerk sign-in here instead
 * of mounting pages that would throw "no Clerk session registered".
 *
 * Registration runs in useLayoutEffect so it completes before child useEffect
 * network calls. We do not clear the getter on unmount — React Strict Mode would
 * clear it between remounts and race async admin fetches.
 */
export function AdminClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useLayoutEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAdminTokenGetter(null);
      return;
    }
    setAdminTokenGetter(() => getToken());
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div
        className={cn(
          'flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10',
          '[&_.cl-card]:shadow-lg [&_.cl-rootBox]:mx-auto'
        )}
      >
        <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
          Sign in to open market configuration admin.
        </p>
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/admin"
          appearance={{
            elements: {
              footerAction: { display: 'none' },
            },
          }}
        />
      </div>
    );
  }

  return <>{children}</>;
}
