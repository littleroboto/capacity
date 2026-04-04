/**
 * Optional Clerk sign-in gate. When active, the workbench renders only for signed-in users.
 *
 * - Set `VITE_CLERK_PUBLISHABLE_KEY` (pk_live_… / pk_test_…) from the Clerk dashboard.
 * - Set `VITE_AUTH_DISABLED=1` to force the gate off even if the key is present (e.g. internal preview).
 */
export function clerkPublishableKey(): string | null {
  const k = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  return k || null;
}

export function isClerkAuthDisabled(): boolean {
  const v = import.meta.env.VITE_AUTH_DISABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** True when ClerkProvider should wrap the app and the sign-in gate may run. */
export function isClerkConfigured(): boolean {
  return !!clerkPublishableKey() && !isClerkAuthDisabled();
}
