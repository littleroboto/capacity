import { StrictMode, lazy, Suspense } from 'react';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={workbenchBasename()}>
      <ClerkBrowserRoot />
    </BrowserRouter>
  </StrictMode>
);
