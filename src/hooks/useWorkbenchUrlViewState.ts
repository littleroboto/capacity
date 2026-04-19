import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import type { NavigateOptions, URLSearchParamsInit } from 'react-router-dom';
import {
  applyWorkbenchUrlViewPatch,
  mergeWorkbenchUrlSearchParams,
  workbenchUrlSliceSignature,
} from '@/lib/workbenchUrlViewState';
import { useAtcStore } from '@/store/useAtcStore';

type SetSearchParams = (
  nextInit: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit),
  navigateOpts?: NavigateOptions
) => void;

/**
 * After Zustand persist rehydrates: merge URL-backed query params into the store (URL wins only where
 * present), then keep the query string aligned with those fields using `replace` history entries.
 */
export function useWorkbenchUrlViewState(
  searchParams: URLSearchParams,
  setSearchParams: SetSearchParams
): boolean {
  const [persistReady, setPersistReady] = useState(() => useAtcStore.persist.hasHydrated());
  const mirrorEnabledRef = useRef(false);

  useEffect(() => {
    if (persistReady) return;
    const unsub = useAtcStore.persist.onFinishHydration(() => {
      setPersistReady(true);
    });
    if (useAtcStore.persist.hasHydrated()) {
      setPersistReady(true);
    }
    return unsub;
  }, [persistReady]);

  useLayoutEffect(() => {
    if (!persistReady) return;
    applyWorkbenchUrlViewPatch(searchParams);
    const next = mergeWorkbenchUrlSearchParams(searchParams, useAtcStore.getState());
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    mirrorEnabledRef.current = true;
  }, [persistReady, searchParams, setSearchParams]);

  useEffect(() => {
    if (!persistReady) return;
    return useAtcStore.subscribe((state, prevState) => {
      if (!mirrorEnabledRef.current) return;
      if (workbenchUrlSliceSignature(state) === workbenchUrlSliceSignature(prevState)) return;
      setSearchParams((prev) => mergeWorkbenchUrlSearchParams(prev, state), { replace: true });
    });
  }, [persistReady, setSearchParams]);

  return persistReady;
}
