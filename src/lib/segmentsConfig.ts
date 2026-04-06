/**
 * Canonical segment → ordered market ids from `public/data/segments.json`.
 * Compare-strip order and ACL segment expansion both use this module (no duplicated arrays).
 */
import rawSegments from '../../public/data/segments.json';

export type SegmentRegistry = Readonly<Record<string, readonly string[]>>;

function normalizeRegistry(input: unknown): SegmentRegistry {
  if (input == null || typeof input !== 'object') return {};
  const o = input as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(o)) {
    const code = k.trim().toUpperCase();
    if (!code) continue;
    if (!Array.isArray(v)) continue;
    out[code] = v.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  }
  return out;
}

export const SEGMENTS_REGISTRY: SegmentRegistry = normalizeRegistry(rawSegments);

/** Clerk / product segment code (e.g. LIOM, IOM); must exist as a key in `segments.json`. */
export type SegmentCode = string;

export function getSegmentMarkets(segmentCode: string): readonly string[] | undefined {
  const k = segmentCode.trim().toUpperCase();
  return SEGMENTS_REGISTRY[k];
}
