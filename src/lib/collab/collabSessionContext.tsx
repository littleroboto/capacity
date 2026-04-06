import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth, useOrganization } from '@clerk/react';
import * as Y from 'yjs';
import YPartyKitProvider from 'y-partykit/provider';
import { useCapacityAccess } from '@/lib/capacityAccessContext';
import { collabMarketsForAccess } from '@/lib/collab/collabMarkets';
import { isCollabBuildEnabled, partykitHost } from '@/lib/collab/collabBuildFlags';
import { collabRoomId } from '@/lib/collab/roomId';
import { CAPACITY_COLLAB_Y_TEXT } from '@/lib/collab/yTextKey';
import { applyCodeTabDocumentEdit, getCodeTabDocumentText } from '@/lib/codeViewMarketTabs';
import { useAtcStore } from '@/store/useAtcStore';

export type CollabMarketSession = {
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: YPartyKitProvider;
};

type CollabSessionContextValue = {
  /** Incremented when sessions map is rebuilt (subscribe for re-renders). */
  version: number;
  getSession(marketId: string): CollabMarketSession | undefined;
};

const CollabSessionContext = createContext<CollabSessionContextValue | null>(null);

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  }) as T;
  (wrapped as { cancel?: () => void }).cancel = () => {
    if (t) clearTimeout(t);
  };
  return wrapped;
}

/**
 * Holds one Yjs + PartyKit provider per editable market. Must render under
 * {@link ClerkProvider}, {@link CapacityAccessBridgeProvider}, and Zustand store.
 */
export function ClerkCollabSessionRoot({ children }: { children: ReactNode }) {
  const access = useCapacityAccess();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { organization } = useOrganization();
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const [version, setVersion] = useState(0);

  const sessionsRef = useRef<Map<string, CollabMarketSession>>(new Map());
  const cleanupsRef = useRef<(() => void)[]>([]);

  const workspaceKey =
    organization?.id ?? import.meta.env.VITE_COLLAB_WORKSPACE_KEY?.trim() ?? 'default';
  const host = partykitHost();
  const collabOn = isCollabBuildEnabled() && Boolean(host);

  useEffect(() => {
    for (const c of cleanupsRef.current) c();
    cleanupsRef.current = [];
    for (const s of sessionsRef.current.values()) {
      try {
        s.provider.destroy();
      } catch {
        /* ignore */
      }
      try {
        s.ydoc.destroy();
      } catch {
        /* ignore */
      }
    }
    sessionsRef.current.clear();

    const bump = () => setVersion((v) => v + 1);

    if (!collabOn || !host || !isLoaded || !isSignedIn) {
      bump();
      return;
    }

    const markets = collabMarketsForAccess(access, runwayMarketOrder);
    if (!markets.length) {
      bump();
      return;
    }

    const protocol = import.meta.env.DEV ? ('ws' as const) : ('wss' as const);

    for (const marketId of markets) {
      const room = collabRoomId(workspaceKey, marketId);
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText(CAPACITY_COLLAB_Y_TEXT);
      const provider = new YPartyKitProvider(host, room, ydoc, {
        protocol,
        params: async () => {
          const token = await getToken();
          return { token: token ?? '' };
        },
      });

      let seeded = false;
      const trySeed = () => {
        if (seeded) return;
        if (ytext.length > 0) {
          seeded = true;
          return;
        }
        const local = getCodeTabDocumentText(marketId);
        if (!local.trim()) return;
        seeded = true;
        ydoc.transact(() => {
          if (ytext.length === 0) ytext.insert(0, local);
        });
      };

      const onSync = (synced: boolean) => {
        if (synced) trySeed();
      };
      provider.on('sync', onSync);

      const pushZu = debounce(() => {
        applyCodeTabDocumentEdit(marketId, ytext.toString());
      }, 150);

      ytext.observe(() => {
        pushZu();
      });

      sessionsRef.current.set(marketId, { ydoc, ytext, provider });
      cleanupsRef.current.push(() => {
        (pushZu as { cancel?: () => void }).cancel?.();
        try {
          provider.destroy();
        } catch {
          /* ignore */
        }
        try {
          ydoc.destroy();
        } catch {
          /* ignore */
        }
      });
    }

    bump();

    return () => {
      for (const c of cleanupsRef.current) c();
      cleanupsRef.current = [];
      sessionsRef.current.clear();
    };
  }, [collabOn, host, workspaceKey, isLoaded, isSignedIn, getToken, access, runwayMarketOrder.join()]);

  const getSession = useCallback((marketId: string) => sessionsRef.current.get(marketId), []);

  const value = useMemo(
    () => ({
      version,
      getSession,
    }),
    [version, getSession]
  );

  return <CollabSessionContext.Provider value={value}>{children}</CollabSessionContext.Provider>;
}

export function useCollabSession(): CollabSessionContextValue | null {
  return useContext(CollabSessionContext);
}
