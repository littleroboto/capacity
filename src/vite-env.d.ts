/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

declare module '*.yaml?raw' {
  const src: string;
  export default src;
}
