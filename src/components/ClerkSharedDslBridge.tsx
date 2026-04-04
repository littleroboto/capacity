import type { ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setSharedDslClerkTokenGetter } from '@/lib/sharedDslSync';

/**
 * Registers Clerk `getToken()` for `/api/shared-dsl` (see Clerk MCP: use-auth — Bearer session token).
 * Must render under `ClerkProvider`. Clears the getter when signed out or still loading.
 */
export function ClerkSharedDslBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useLayoutEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setSharedDslClerkTokenGetter(null);
      return;
    }
    setSharedDslClerkTokenGetter(() => getToken());
    return () => setSharedDslClerkTokenGetter(null);
  }, [isLoaded, isSignedIn, getToken]);

  return <>{children}</>;
}
