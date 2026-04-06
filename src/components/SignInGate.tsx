import type { ReactNode } from 'react';
import { SignIn, SignOutButton, useAuth, useUser } from '@clerk/react';
import {
  isEmailInAllowList,
  normalizeUserEmail,
  viteAllowedUserEmails,
} from '@/lib/allowedUserEmails';
import { cn } from '@/lib/utils';

type SignInGateProps = {
  /** When false, render children only (no Clerk UI). */
  enabled: boolean;
  children: ReactNode;
};

function AuthGateInner({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const allow = viteAllowedUserEmails();

  if (!isLoaded) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <span>Loading sign-in…</span>
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
          Sign in to open the Market Capacity workspace.
        </p>
        <SignIn routing="hash" />
      </div>
    );
  }

  if (allow.size > 0) {
    if (!userLoaded) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span>Loading account…</span>
        </div>
      );
    }
    const primary = user?.primaryEmailAddress?.emailAddress;
    const norm = primary ? normalizeUserEmail(primary) : '';
    if (!norm || !isEmailInAllowList(norm, allow)) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-10 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            This deployment only allows specific sign-ins. The account you used is not on the list. Sign out and try an
            authorized email, or ask the administrator to add you to{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">VITE_ALLOWED_USER_EMAILS</code> /{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">CAPACITY_ALLOWED_USER_EMAILS</code>.
          </p>
          <SignOutButton>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Sign out
            </button>
          </SignOutButton>
        </div>
      );
    }
  }

  return <>{children}</>;
}

export function SignInGate({ enabled, children }: SignInGateProps) {
  if (!enabled) return <>{children}</>;
  return <AuthGateInner>{children}</AuthGateInner>;
}
