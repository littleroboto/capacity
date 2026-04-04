import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import { ClerkSharedDslBridge } from '@/components/ClerkSharedDslBridge';
import { SignInGate } from '@/components/SignInGate';
import { FullCapacityAccessProvider } from '@/lib/capacityAccessContext';
import { clerkPublishableKey, isClerkConfigured } from '@/lib/clerkConfig';
import './index.css';

const clerkKey = clerkPublishableKey();
const gate = isClerkConfigured();

const appTree = (
  <SignInGate enabled={gate}>
    {clerkKey ? (
      <ClerkSharedDslBridge>
        <App />
      </ClerkSharedDslBridge>
    ) : (
      <FullCapacityAccessProvider>
        <App />
      </FullCapacityAccessProvider>
    )}
  </SignInGate>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkKey ? <ClerkProvider publishableKey={clerkKey}>{appTree}</ClerkProvider> : appTree}
  </StrictMode>
);
