/**
 * Upstream repos for landing BOM links. Keys are npm package names. Values are `owner/repo` on GitHub unless
 * they start with `http`, in which case the full URL is used (e.g. GitLab). Unlisted packages fall back to npm.
 */
const UPSTREAM_BY_PKG: Record<string, string> = {
  react: 'facebook/react',
  'react-dom': 'facebook/react',
  typescript: 'microsoft/TypeScript',
  vite: 'vitejs/vite',
  tailwindcss: 'tailwindlabs/tailwindcss',
  'react-router-dom': 'remix-run/react-router',
  zustand: 'pmndrs/zustand',
  '@radix-ui/react-dialog': 'radix-ui/primitives',
  motion: 'motiondivision/motion',
  '@visx/curve': 'airbnb/visx',
  '@monaco-editor/react': 'suren-atoyan/monaco-react',
  'lucide-react': 'lucide-icons/lucide',
  'js-yaml': 'nodeca/js-yaml',
  html2canvas: 'niklasvh/html2canvas',
  'class-variance-authority': 'joe-bell/cva',
  clsx: 'lukeed/clsx',
  'tailwind-merge': 'dcastil/tailwind-merge',
  '@use-gesture/react': 'pmndrs/use-gesture',
  '@vercel/blob': 'vercel/storage',
  '@clerk/react': 'clerk/javascript',
  '@clerk/backend': 'clerk/javascript',
  /** Upstream is GitLab (npm `repository` points here). */
  'country-flag-icons': 'https://gitlab.com/catamphetamine/country-flag-icons',
  '@sankyu/react-circle-flags': 'SanKyu-Lab/circle-flags-ui',
};

export function landingBomSourceHref(pkg: string): string {
  const v = UPSTREAM_BY_PKG[pkg];
  if (!v) return `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  return `https://github.com/${v}`;
}
