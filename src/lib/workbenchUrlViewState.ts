import type { ViewModeId } from '@/lib/constants';
import { normalizeViewModeId } from '@/lib/constants';
import { RUNWAY_ALL_MARKETS_LABEL, RUNWAY_ALL_MARKETS_VALUE } from '@/lib/markets';
import type { RunwayQuarter } from '@/lib/runwayDateFilter';
import { useAtcStore } from '@/store/useAtcStore';

type AtcState = ReturnType<typeof useAtcStore.getState>;

/** Query keys we own when syncing workbench view state (unknown keys are preserved). */
export const WORKBENCH_URL_KEYS = {
  country: 'country',
  /** Legacy alias; read-only preference for `country` when writing. */
  market: 'market',
  viewMode: 'viewMode',
  runwayYear: 'runwayYear',
  runwayQuarter: 'runwayQuarter',
  runwayFollowQuarter: 'runwayFollowQuarter',
  runwayFrom: 'runwayFrom',
  runwayTo: 'runwayTo',
  runwayDay: 'runwayDay',
  llm: 'llm',
} as const;

function parseTruthyFlag(raw: string | null): boolean | null {
  if (raw == null) return null;
  const t = raw.trim().toLowerCase();
  if (t === '' || t === '1' || t === 'true' || t === 'yes' || t === 'on') return true;
  if (t === '0' || t === 'false' || t === 'no' || t === 'off') return false;
  return null;
}

function parseCountry(sp: URLSearchParams): string | null {
  const raw = sp.get(WORKBENCH_URL_KEYS.market) ?? sp.get(WORKBENCH_URL_KEYS.country);
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const u = t.toUpperCase();
  if (u === 'LIOM' || u === '__ALL__') return RUNWAY_ALL_MARKETS_VALUE;
  return t;
}

function parseViewMode(sp: URLSearchParams): ViewModeId | null {
  const raw = sp.get(WORKBENCH_URL_KEYS.viewMode);
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  return normalizeViewModeId(t);
}

function parseRunwayYear(sp: URLSearchParams): number | null | undefined {
  const raw = sp.get(WORKBENCH_URL_KEYS.runwayYear);
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t || t === 'all') return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1900 || n > 2200) return null;
  return n;
}

function parseRunwayQuarter(sp: URLSearchParams): RunwayQuarter | null | undefined {
  const raw = sp.get(WORKBENCH_URL_KEYS.runwayQuarter);
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t || t === 'all') return null;
  const n = Number.parseInt(t, 10);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n as RunwayQuarter;
  return null;
}

function parseRunwayFollowQuarter(sp: URLSearchParams): boolean | undefined {
  const raw = sp.get(WORKBENCH_URL_KEYS.runwayFollowQuarter);
  if (raw == null) return undefined;
  const b = parseTruthyFlag(raw);
  return b === null ? undefined : b;
}

function parseRunwayDay(sp: URLSearchParams): string | null | undefined {
  const raw = sp.get(WORKBENCH_URL_KEYS.runwayDay);
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function parseRunwayIsoDateParam(sp: URLSearchParams, key: string): string | null | undefined {
  if (!sp.has(key)) return undefined;
  const raw = sp.get(key);
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function parseLlmPresent(sp: URLSearchParams): boolean | undefined {
  if (!sp.has(WORKBENCH_URL_KEYS.llm)) return undefined;
  const v = sp.get(WORKBENCH_URL_KEYS.llm);
  if (v === null || v.trim() === '') return true;
  const b = parseTruthyFlag(v);
  return b === false ? false : true;
}

/**
 * Read URL-backed view fields from the query string. `undefined` = absent (do not change store);
 * `null` = explicit empty / clear where applicable.
 */
export function readWorkbenchUrlViewPatch(sp: URLSearchParams): {
  country?: string;
  viewMode?: ViewModeId;
  runwayFilterYear?: number | null;
  runwayFilterQuarter?: RunwayQuarter | null;
  runwayIncludeFollowingQuarter?: boolean;
  runwayCustomRangeStartYmd?: string | null;
  runwayCustomRangeEndYmd?: string | null;
  runwaySelectedDayYmd?: string | null;
  dslLlmAssistantEnabled?: boolean;
} {
  const out: {
    country?: string;
    viewMode?: ViewModeId;
    runwayFilterYear?: number | null;
    runwayFilterQuarter?: RunwayQuarter | null;
    runwayIncludeFollowingQuarter?: boolean;
    runwayCustomRangeStartYmd?: string | null;
    runwayCustomRangeEndYmd?: string | null;
    runwaySelectedDayYmd?: string | null;
    dslLlmAssistantEnabled?: boolean;
  } = {};

  const c = parseCountry(sp);
  if (c !== null) out.country = c;

  const vm = parseViewMode(sp);
  if (vm !== null) out.viewMode = vm;

  const isoFrom = parseRunwayIsoDateParam(sp, WORKBENCH_URL_KEYS.runwayFrom);
  const isoTo = parseRunwayIsoDateParam(sp, WORKBENCH_URL_KEYS.runwayTo);
  const customFromUrl =
    typeof isoFrom === 'string' && typeof isoTo === 'string' && isoFrom.length > 0 && isoTo.length > 0 && isoFrom <= isoTo;

  if (customFromUrl) {
    out.runwayCustomRangeStartYmd = isoFrom;
    out.runwayCustomRangeEndYmd = isoTo;
    out.runwayFilterYear = null;
    out.runwayFilterQuarter = null;
  } else {
    const y = parseRunwayYear(sp);
    if (y !== undefined) out.runwayFilterYear = y;

    const q = parseRunwayQuarter(sp);
    /** Ignore quarter without an explicit year in the URL (tolerant parse). */
    if (q !== undefined && y !== undefined) out.runwayFilterQuarter = q;
  }

  const fq = parseRunwayFollowQuarter(sp);
  if (fq !== undefined) out.runwayIncludeFollowingQuarter = fq;

  const d = parseRunwayDay(sp);
  if (d !== undefined) out.runwaySelectedDayYmd = d;

  const llm = parseLlmPresent(sp);
  if (llm !== undefined) out.dslLlmAssistantEnabled = llm;

  return out;
}

/** Apply URL layer onto the store (call only after persist rehydration). Skips writes that match current state. */
export function applyWorkbenchUrlViewPatch(sp: URLSearchParams): void {
  const patch = readWorkbenchUrlViewPatch(sp);

  if (patch.country !== undefined && patch.country !== useAtcStore.getState().country) {
    useAtcStore.getState().setCountry(patch.country, {});
  }
  const customFromUrl =
    patch.runwayCustomRangeStartYmd != null &&
    patch.runwayCustomRangeEndYmd != null &&
    patch.runwayCustomRangeStartYmd <= patch.runwayCustomRangeEndYmd;

  if (
    customFromUrl &&
    (patch.runwayCustomRangeStartYmd !== useAtcStore.getState().runwayCustomRangeStartYmd ||
      patch.runwayCustomRangeEndYmd !== useAtcStore.getState().runwayCustomRangeEndYmd)
  ) {
    useAtcStore.getState().setRunwayCustomRangeFields({
      startYmd: patch.runwayCustomRangeStartYmd,
      endYmd: patch.runwayCustomRangeEndYmd,
    });
  } else if (!customFromUrl) {
    if (
      patch.runwayFilterYear !== undefined &&
      patch.runwayFilterYear !== useAtcStore.getState().runwayFilterYear
    ) {
      useAtcStore.getState().setRunwayFilterYear(patch.runwayFilterYear);
    }
    if (
      patch.runwayFilterQuarter !== undefined &&
      patch.runwayFilterQuarter !== useAtcStore.getState().runwayFilterQuarter
    ) {
      useAtcStore.getState().setRunwayFilterQuarter(patch.runwayFilterQuarter);
    }
  }
  if (
    patch.runwayIncludeFollowingQuarter !== undefined &&
    patch.runwayIncludeFollowingQuarter !== useAtcStore.getState().runwayIncludeFollowingQuarter
  ) {
    useAtcStore.getState().setRunwayIncludeFollowingQuarter(patch.runwayIncludeFollowingQuarter);
  }
  if (
    patch.runwaySelectedDayYmd !== undefined &&
    patch.runwaySelectedDayYmd !== useAtcStore.getState().runwaySelectedDayYmd
  ) {
    useAtcStore.getState().setRunwaySelectedDayYmd(patch.runwaySelectedDayYmd);
  }
  if (patch.viewMode !== undefined && patch.viewMode !== useAtcStore.getState().viewMode) {
    useAtcStore.getState().setViewMode(patch.viewMode);
  }
  if (
    patch.dslLlmAssistantEnabled !== undefined &&
    patch.dslLlmAssistantEnabled !== useAtcStore.getState().dslLlmAssistantEnabled
  ) {
    useAtcStore.getState().setDslLlmAssistantEnabled(patch.dslLlmAssistantEnabled);
  }
}

function defaultViewMode(): ViewModeId {
  return 'in_store';
}

/**
 * Merge canonical URL-backed params into `base` (typically current location query). Drops legacy `market`
 * when `country` is written.
 */
export function mergeWorkbenchUrlSearchParams(base: URLSearchParams, state: AtcState): URLSearchParams {
  const out = new URLSearchParams(base);
  out.delete(WORKBENCH_URL_KEYS.market);

  const {
    country,
    viewMode,
    runwayFilterYear,
    runwayFilterQuarter,
    runwayIncludeFollowingQuarter,
    runwayCustomRangeStartYmd,
    runwayCustomRangeEndYmd,
  } = state;
  const { runwaySelectedDayYmd, dslLlmAssistantEnabled } = state;

  if (country === RUNWAY_ALL_MARKETS_VALUE) {
    out.set(WORKBENCH_URL_KEYS.country, RUNWAY_ALL_MARKETS_LABEL);
  } else if (country) {
    out.set(WORKBENCH_URL_KEYS.country, country);
  } else {
    out.delete(WORKBENCH_URL_KEYS.country);
  }

  if (viewMode && viewMode !== defaultViewMode()) {
    out.set(WORKBENCH_URL_KEYS.viewMode, viewMode);
  } else {
    out.delete(WORKBENCH_URL_KEYS.viewMode);
  }

  const customActive =
    runwayCustomRangeStartYmd != null &&
    runwayCustomRangeEndYmd != null &&
    runwayCustomRangeStartYmd <= runwayCustomRangeEndYmd;

  if (customActive) {
    out.set(WORKBENCH_URL_KEYS.runwayFrom, runwayCustomRangeStartYmd!);
    out.set(WORKBENCH_URL_KEYS.runwayTo, runwayCustomRangeEndYmd!);
    out.delete(WORKBENCH_URL_KEYS.runwayYear);
    out.delete(WORKBENCH_URL_KEYS.runwayQuarter);
  } else {
    out.delete(WORKBENCH_URL_KEYS.runwayFrom);
    out.delete(WORKBENCH_URL_KEYS.runwayTo);
    if (runwayFilterYear != null) {
      out.set(WORKBENCH_URL_KEYS.runwayYear, String(runwayFilterYear));
    } else {
      out.delete(WORKBENCH_URL_KEYS.runwayYear);
    }

    if (runwayFilterQuarter != null) {
      out.set(WORKBENCH_URL_KEYS.runwayQuarter, String(runwayFilterQuarter));
    } else {
      out.delete(WORKBENCH_URL_KEYS.runwayQuarter);
    }
  }

  if (runwayIncludeFollowingQuarter) {
    out.set(WORKBENCH_URL_KEYS.runwayFollowQuarter, '1');
  } else {
    out.delete(WORKBENCH_URL_KEYS.runwayFollowQuarter);
  }

  if (runwaySelectedDayYmd) {
    out.set(WORKBENCH_URL_KEYS.runwayDay, runwaySelectedDayYmd);
  } else {
    out.delete(WORKBENCH_URL_KEYS.runwayDay);
  }

  if (dslLlmAssistantEnabled) {
    out.set(WORKBENCH_URL_KEYS.llm, '');
  } else {
    out.delete(WORKBENCH_URL_KEYS.llm);
  }

  return out;
}

/** Stable signature for store fields mirrored into the URL. */
export function workbenchUrlSliceSignature(state: AtcState): string {
  return [
    state.country,
    state.viewMode,
    state.runwayFilterYear ?? '',
    state.runwayFilterQuarter ?? '',
    state.runwayIncludeFollowingQuarter ? '1' : '0',
    state.runwayCustomRangeStartYmd ?? '',
    state.runwayCustomRangeEndYmd ?? '',
    state.runwaySelectedDayYmd ?? '',
    state.dslLlmAssistantEnabled ? '1' : '0',
  ].join('\u0001');
}
