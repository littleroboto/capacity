import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo } from 'react';
import { useAuth, useOrganization } from '@clerk/react';
import { CapacityAccessBridgeProvider } from '@/lib/capacityAccessContext';
import {
  FULL_CAPACITY_ACCESS,
  parseCapacityAccess,
  parseViteCapacityOrgAdminRoles,
} from '@/lib/capacityAccess';
import { membershipAllowsSharedDslWrite, parseViteClerkDslWriteRoles } from '@/lib/clerkDslRoles';
import {
  setSharedDslClerkOrgWriteAllowed,
  setSharedDslClerkTokenGetter,
} from '@/lib/sharedDslSync';
import { useAtcStore } from '@/store/useAtcStore';

/**
 * Registers Clerk `getToken()` for `/api/shared-dsl`, applies org write allow list
 * (`VITE_CLERK_DSL_WRITE_ROLES` / `CAPACITY_CLERK_DSL_WRITE_ROLES`), segment/editor ACL
 * (`cap_*` session claims), and exposes {@link useCapacityAccess}.
 */
export function ClerkSharedDslBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, sessionClaims, orgRole } = useAuth();
  const { membership } = useOrganization();
  const writeAllowList = useMemo(() => parseViteClerkDslWriteRoles(), []);
  const orgAdminRoles = useMemo(() => parseViteCapacityOrgAdminRoles(), []);

  const access = useMemo(() => {
    if (!isLoaded || !isSignedIn) return FULL_CAPACITY_ACCESS;
    return parseCapacityAccess(
      sessionClaims as Record<string, unknown> | undefined,
      orgRole ?? undefined,
      orgAdminRoles
    );
  }, [isLoaded, isSignedIn, sessionClaims, orgRole, orgAdminRoles]);

  useLayoutEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setSharedDslClerkTokenGetter(null);
      setSharedDslClerkOrgWriteAllowed(true);
      useAtcStore.getState().setDslMutationLocked(false);
      return;
    }
    setSharedDslClerkTokenGetter(() => getToken());
    const orgOk = membershipAllowsSharedDslWrite(membership?.role, writeAllowList);
    const canPut =
      access.legacyFullAccess || access.admin ? orgOk : orgOk && access.canEditYaml;
    setSharedDslClerkOrgWriteAllowed(canPut);
    const locked = !access.legacyFullAccess && !access.canEditYaml;
    useAtcStore.getState().setDslMutationLocked(locked);
    return () => {
      setSharedDslClerkTokenGetter(null);
      setSharedDslClerkOrgWriteAllowed(true);
      useAtcStore.getState().setDslMutationLocked(false);
    };
  }, [
    isLoaded,
    isSignedIn,
    getToken,
    membership?.role,
    writeAllowList,
    access.legacyFullAccess,
    access.admin,
    access.canEditYaml,
  ]);

  return <CapacityAccessBridgeProvider value={access}>{children}</CapacityAccessBridgeProvider>;
}
