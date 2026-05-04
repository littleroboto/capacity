import { Component, StrictMode, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';
import { ClerkOAuthCallbackPage } from '@/components/ClerkOAuthCallbackPage';
import { ClerkSharedDslBridge } from '@/components/ClerkSharedDslBridge';
import { SignInGate } from '@/components/SignInGate';
import { FullCapacityAccessProvider } from '@/lib/capacityAccessContext';
import { clerkPublishableKey, isClerkConfigured } from '@/lib/clerkConfig';
import { ClerkUkWaitlistPage } from '@/pages/ClerkUkWaitlistPage';
import { LandingPage } from '@/pages/LandingPage';
import { AdminClerkBridge } from '@/components/AdminClerkBridge';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminMarketLegacyRedirect } from '@/pages/admin/AdminMarketLegacyRedirect';
import { AdminMarketOverview } from '@/pages/admin/AdminMarketOverview';
import { AdminMarketDetail } from '@/pages/admin/AdminMarketDetail';
import { LaptopOnlyGate } from '@/components/LaptopOnlyGate';
import { applyPersistedWorkbenchThemeClass } from '@/lib/syncPersistedWorkbenchTheme';
import './index.css';

const App = lazy(() => import('./App'));

const clerkKey = clerkPublishableKey();
const gate = isClerkConfigured();

function workbenchBasename(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  if (base === './' || base === '.') return '/';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/** Public path to the UK waitlist (includes Vite `base` when not `/`). */
function clerkWaitlistUrlPath(): string {
  const b = workbenchBasename();
  const path = '/uk/waitlist';
  return b === '/' ? path : `${b}${path}`;
}

applyPersistedWorkbenchThemeClass();

function BootFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
      Loading app…
    </div>
  );
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[capacity] root render failed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message;
      return (
        <div className="min-h-screen bg-background px-6 py-10 text-foreground">
          <h1 className="text-lg font-semibold text-destructive">Something went wrong</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            The app hit an error while rendering. Check the browser console for details, then try a hard refresh.
            If you use an ad blocker or privacy extension, try disabling it for this origin.
          </p>
          <pre className="mt-4 max-h-[40vh] overflow-auto rounded-md border border-border bg-muted/50 p-3 text-xs">{msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function WorkbenchLoading() {
  return (
    <div
      className="workbench-studio flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span>Loading workbench…</span>
    </div>
  );
}

function WorkbenchRoutes() {
  return (
    <LaptopOnlyGate>
      <SignInGate enabled={gate}>
        {clerkKey ? (
          <ClerkSharedDslBridge>
            <Suspense fallback={<WorkbenchLoading />}>
              <App />
            </Suspense>
          </ClerkSharedDslBridge>
        ) : (
          <FullCapacityAccessProvider>
            <Suspense fallback={<WorkbenchLoading />}>
              <App />
            </Suspense>
          </FullCapacityAccessProvider>
        )}
      </SignInGate>
    </LaptopOnlyGate>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/uk/waitlist" element={<ClerkUkWaitlistPage />} />
      <Route path="/sso-callback" element={<ClerkOAuthCallbackPage />} />
      {/* Some Clerk setups use this path for the OAuth return URL */}
      <Route path="/sign-in/sso-callback" element={<ClerkOAuthCallbackPage />} />
      <Route path="/app" element={<WorkbenchRoutes />} />
      <Route
        path="/admin"
        element={
          <LaptopOnlyGate>
            <SignInGate enabled={gate}>
              <AdminClerkBridge>
                <AdminLayout />
              </AdminClerkBridge>
            </SignInGate>
          </LaptopOnlyGate>
        }
      >
        <Route index element={<AdminMarketOverview />} />
        <Route path="market/:id/:entity" element={<AdminMarketDetail />} />
        <Route path="market/:id" element={<AdminMarketLegacyRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const clerkAppearance = {
  elements: {
    footerAction: { display: 'none' as const },
  },
};

/**
 * Clerk must use React Router’s navigate for post-auth redirects. If it only
 * mutates `history` directly, the SPA can stay on “Loading sign-in…” until a
 * full refresh (stale router location / no re-render).
 */
function ClerkBrowserRoot() {
  const navigate = useNavigate();

  if (!clerkKey) {
    return <AppRoutes />;
  }

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      appearance={clerkAppearance}
      signInFallbackRedirectUrl="/app"
      waitlistUrl={clerkWaitlistUrlPath()}
      routerPush={(to) => {
        navigate(to);
      }}
      routerReplace={(to) => {
        navigate(to, { replace: true });
      }}
    >
      <AppRoutes />
    </ClerkProvider>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element — index.html must define <div id="root"></div>.');
}

try {
  createRoot(rootEl).render(
    <StrictMode>
      <RootErrorBoundary>
        <BrowserRouter basename={workbenchBasename()}>
          <Suspense fallback={<BootFallback />}>
            <ClerkBrowserRoot />
          </Suspense>
        </BrowserRouter>
      </RootErrorBoundary>
    </StrictMode>
  );
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[capacity] createRoot failed', e);
  rootEl.innerHTML = `<div style="padding:24px;font-family:system-ui,sans-serif;max-width:42rem">
    <h1 style="font-size:1.125rem;margin:0 0 12px">App failed to start</h1>
    <p style="margin:0 0 12px;color:#444;font-size:14px">Check the browser console. Common causes: blocked script (extension), or a stale dev server — restart <code>pnpm dev:vercel</code>.</p>
    <pre style="font-size:12px;overflow:auto;background:#f4f4f5;padding:12px;border-radius:8px">${msg.replace(/</g, '&lt;')}</pre>
  </div>`;
}
