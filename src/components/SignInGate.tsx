import type { ReactNode } from 'react';
import { SignIn, SignOutButton, useAuth, useUser } from '@clerk/react';
import { Loader2 } from 'lucide-react';
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

function emailFromSessionClaims(sessionClaims: unknown): string {
  if (!sessionClaims || typeof sessionClaims !== 'object') return '';
  const c = sessionClaims as Record<string, unknown>;
  const raw = c.email ?? c.primary_email_address;
  if (typeof raw !== 'string' || !raw.includes('@')) return '';
  return normalizeUserEmail(raw);
}

function AllowlistDenied() {
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

function AuthGateInner({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const allow = viteAllowedUserEmails();

  if (!isLoaded) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        <span className="animate-pulse">Loading sign-in…</span>
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
          Sign in to open Capacity Workbench.
        </p>
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/app"
          appearance={{
            elements: {
              footerAction: { display: 'none' },
            },
          }}
        />
      </div>
    );
  }

  if (allow.size > 0) {
    const fromClaim = emailFromSessionClaims(sessionClaims);
    if (fromClaim) {
      if (!isEmailInAllowList(fromClaim, allow)) return <AllowlistDenied />;
      return <>{children}</>;
    }

    if (!userLoaded) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          <span className="animate-pulse">Loading account…</span>
        </div>
      );
    }
    const primary = user?.primaryEmailAddress?.emailAddress;
    const norm = primary ? normalizeUserEmail(primary) : '';
    if (!norm || !isEmailInAllowList(norm, allow)) return <AllowlistDenied />;
  }

  return <>{children}</>;
}

export function SignInGate({ enabled, children }: SignInGateProps) {
  if (!enabled) return <>{children}</>;
  return <AuthGateInner>{children}</AuthGateInner>;
}
