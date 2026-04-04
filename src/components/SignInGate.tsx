import type { ReactNode } from 'react';
import { SignIn, useAuth } from '@clerk/react';
import { cn } from '@/lib/utils';

type SignInGateProps = {
  /** When false, render children only (no Clerk UI). */
  enabled: boolean;
  children: ReactNode;
};

function AuthGateInner({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

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

  return <>{children}</>;
}

export function SignInGate({ enabled, children }: SignInGateProps) {
  if (!enabled) return <>{children}</>;
  return <AuthGateInner>{children}</AuthGateInner>;
}
