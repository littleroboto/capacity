import { useEffect, useState } from 'react';
import type YPartyKitProvider from 'y-partykit/provider';

export type CollabLinkPhase = 'connecting' | 'connected' | 'synced' | 'disconnected';

function derivePhase(provider: YPartyKitProvider): CollabLinkPhase {
  if (provider.synced) return 'synced';
  if (provider.wsconnected) return 'connected';
  if (provider.wsconnecting) return 'connecting';
  return 'disconnected';
}

/**
 * Subscribes to Yjs websocket provider state for UI (badge / tooltip).
 */
export function useCollabProviderStatus(provider: YPartyKitProvider | null | undefined): CollabLinkPhase {
  const [phase, setPhase] = useState<CollabLinkPhase>(() =>
    provider ? derivePhase(provider) : 'disconnected'
  );

  useEffect(() => {
    if (!provider) {
      setPhase('disconnected');
      return;
    }

    const tick = () => setPhase(derivePhase(provider));

    const onStatus = () => tick();
    const onSync = () => tick();

    provider.on('status', onStatus);
    provider.on('sync', onSync);
    tick();

    return () => {
      provider.off('status', onStatus);
      provider.off('sync', onSync);
    };
  }, [provider]);

  return phase;
}
