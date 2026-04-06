export function isCollabBuildEnabled(): boolean {
  const v = import.meta.env.VITE_COLLAB_ENABLED;
  if (v === '1' || v === 'true') return true;
  return false;
}

export function partykitHost(): string | undefined {
  const h = import.meta.env.VITE_PARTYKIT_HOST?.trim();
  return h || undefined;
}
