import { AuthenticateWithRedirectCallback } from '@clerk/react';

const APP_PATH = '/app';

/**
 * Clerk OAuth / SSO returns here to finalize the session in the browser. Without this route,
 * `/app` can stay on “Loading sign-in…” until a full refresh.
 *
 * In Clerk Dashboard → **Paths** (or **Authorized redirect URLs**), allow both:
 * `…/sso-callback` and `…/sign-in/sso-callback` on each origin you use (e.g. local dev + production).
 */
export function ClerkOAuthCallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-10">
      <p className="text-sm text-muted-foreground" role="status">
        Completing sign-in…
      </p>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={APP_PATH}
        signUpFallbackRedirectUrl={APP_PATH}
      />
    </div>
  );
}
