import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';
import { ClerkSharedDslBridge } from '@/components/ClerkSharedDslBridge';
import { SignInGate } from '@/components/SignInGate';
import { FullCapacityAccessProvider } from '@/lib/capacityAccessContext';
import { clerkPublishableKey, isClerkConfigured } from '@/lib/clerkConfig';
import { LandingPage } from '@/pages/LandingPage';
import './index.css';

const App = lazy(() => import('./App'));

const clerkKey = clerkPublishableKey();
const gate = isClerkConfigured();

function workbenchBasename(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  if (base === './' || base === '.') return '/';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function WorkbenchLoading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span>Loading workbench…</span>
    </div>
  );
}

function WorkbenchRoutes() {
  return (
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
  );
}

const router = (
  <BrowserRouter basename={workbenchBasename()}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<WorkbenchRoutes />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkKey ? <ClerkProvider publishableKey={clerkKey}>{router}</ClerkProvider> : router}
  </StrictMode>
);
