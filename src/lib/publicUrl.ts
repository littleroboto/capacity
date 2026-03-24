/**
 * Build a URL for static assets under `public/`.
 * When `BASE_URL` is `./`, use a root-absolute path so fetches don’t break off non-root page URLs.
 */
export function publicAsset(relativePath: string): string {
  const trimmed = relativePath.replace(/^\//, '');
  let base = import.meta.env.BASE_URL || '/';
  if (base === './') base = '/';
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  return `${withSlash}${trimmed}`;
}
