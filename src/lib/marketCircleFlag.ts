/** Map app market ids (YAML `country`, runway column keys) to ISO 3166-1 alpha-2 for circle flags. */
export function marketIdToCircleFlagCode(marketId: string): string | null {
  const t = marketId.trim();
  if (!t) return null;
  const u = t.toUpperCase();
  if (u === 'UK') return 'gb';
  if (u.length === 2 && /^[A-Z]{2}$/.test(u)) return u.toLowerCase();
  return null;
}
