/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When `1` or `true`, load/save workspace YAML via `/api/shared-dsl` (Vercel Blob). */
  readonly VITE_SHARED_DSL?: string;
}

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

declare module '*.yaml?raw' {
  const src: string;
  export default src;
}

declare module '*.md?raw' {
  const src: string;
  export default src;
}
