import { useEffect, useState } from 'react';
import type YPartyKitProvider from 'y-partykit/provider';

function countRemoteAwarenessPeers(provider: YPartyKitProvider): number {
  const { awareness } = provider;
  let n = 0;
  for (const id of awareness.getStates().keys()) {
    if (id !== awareness.clientID) n += 1;
  }
  return n;
}

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

/**
 * How many other browser sessions are in the same Yjs room (via awareness). Updates on connect/disconnect.
 */
export function useCollabRemotePeerCount(
  provider: YPartyKitProvider | null | undefined
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!provider) {
      setCount(0);
      return;
    }

    const awareness = provider.awareness;
    const tick = () => setCount(countRemoteAwarenessPeers(provider));

    const onChange = () => tick();
    awareness.on('change', onChange);
    tick();

    return () => {
      awareness.off('change', onChange);
    };
  }, [provider]);

  return count;
}
