import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo } from 'react';
import { useAuth, useOrganization } from '@clerk/react';
import { membershipAllowsSharedDslWrite, parseViteClerkDslWriteRoles } from '@/lib/clerkDslRoles';
import {
  setSharedDslClerkOrgWriteAllowed,
  setSharedDslClerkTokenGetter,
} from '@/lib/sharedDslSync';

/**
 * Registers Clerk `getToken()` for `/api/shared-dsl` and mirrors org write policy when
 * `VITE_CLERK_DSL_WRITE_ROLES` is set (must match server `CAPACITY_CLERK_DSL_WRITE_ROLES`).
 */
export function ClerkSharedDslBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { membership } = useOrganization();
  const writeAllowList = useMemo(() => parseViteClerkDslWriteRoles(), []);

  useLayoutEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setSharedDslClerkTokenGetter(null);
      setSharedDslClerkOrgWriteAllowed(true);
      return;
    }
    setSharedDslClerkTokenGetter(() => getToken());
    const orgOk = membershipAllowsSharedDslWrite(membership?.role, writeAllowList);
    setSharedDslClerkOrgWriteAllowed(orgOk);
    return () => {
      setSharedDslClerkTokenGetter(null);
      setSharedDslClerkOrgWriteAllowed(true);
    };
  }, [isLoaded, isSignedIn, getToken, membership?.role, writeAllowList]);

  return <>{children}</>;
}
