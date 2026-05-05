import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Matches Vite's `importQueryRE` — `?import` must still be transformed as a module. */
const importQueryRE = /(\?|&)import=?(?:&|$)/;

/**
 * Vite's dev `transformMiddleware` treats `Sec-Fetch-Dest: script` as "this URL is JS"
 * (see vitejs/vite#9981). If anything requests the SPA shell `/index.html` with that
 * header (some proxies / dev orchestration do), Vite runs `vite:import-analysis` on raw
 * HTML and throws. Real module graph entries use `/src/*` or `/@vite/*`, not the HTML
 * shell — except `?html-proxy` virtual chunks, which must keep script semantics.
 */
function viteHtmlShellScriptDestFix(): Plugin {
  return {
    name: 'capacity-html-shell-sec-fetch-dest-fix',
    enforce: 'pre',
    configureServer(server) {
      const fix = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
        if (req.headers['sec-fetch-dest'] !== 'script') {
          next();
          return;
        }
        const url = req.url ?? '';
        if (url.includes('html-proxy')) {
          next();
          return;
        }
        if (importQueryRE.test(url)) {
          next();
          return;
        }
        const pathname = url.split('?')[0] ?? '';
        if (!pathname.endsWith('.html')) {
          next();
          return;
        }
        delete req.headers['sec-fetch-dest'];
        next();
      };
      const stack = server.middlewares.stack;
      if (Array.isArray(stack)) {
        stack.unshift({ route: '', handle: fix } as (typeof stack)[number]);
      } else {
        server.middlewares.use(fix);
      }
    },
  };
}

/**
 * Plain `vite` can incorrectly satisfy `GET /api/*` by transforming repo-root
 * `api/*.js` server entry files for the browser (body starts with `import …`),
 * which breaks `res.json()` in the admin client. Intercept first and return JSON.
 * `vercel dev` handles `/api/*` before Vite, so this middleware never runs there.
 */
function viteOnlyApiGuard(): Plugin {
  return {
    name: 'capacity-vite-only-api-guard',
    enforce: 'pre',
    configureServer(server) {
      const guard = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? '';
        const pathname = url.split('?')[0] ?? '';
        if (!pathname.startsWith('/api/')) {
          next();
          return;
        }
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: 'api_unavailable',
            detail:
              'This dev server is Vite only and does not run /api serverless routes. Run `pnpm dev:vercel` from the repo root (same .env.local), then open the app URL that command prints.',
          }),
        );
      };
      const stack = server.middlewares.stack;
      if (Array.isArray(stack)) {
        stack.unshift({ route: '', handle: guard } as (typeof stack)[number]);
      } else {
        server.middlewares.use(guard);
      }
    },
  };
}

export default defineConfig({
  plugins: [viteHtmlShellScriptDestFix(), react(), viteOnlyApiGuard()],
  /** Expose Vercel Marketplace Clerk keys (`NEXT_PUBLIC_CLERK_AUTHENTICATION_*`) alongside `VITE_*`. */
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // Relative base works on Vercel and static hosts without rewrite rules.
  base: './',
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
    /** Single Clerk module graph avoids duplicate `ClerkProvider` instance guards under Vite HMR. */
    dedupe: ['react', 'react-dom', '@clerk/react', '@clerk/shared'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
