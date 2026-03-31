import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf-8')) as { version: string };

/** Shown in the header; Vercel has no `.git` in the build image, so prefer platform env. */
function resolveGitCommitShort(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha && sha.length >= 7) return sha.slice(0, 7);

  const dpl = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  if (dpl) {
    const raw = dpl.startsWith('dpl_') ? dpl.slice(4) : dpl;
    return raw.slice(0, 7) || dpl;
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'local';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT__: JSON.stringify(resolveGitCommitShort()),
  },
  plugins: [react()],
  // Relative base works on Vercel and static hosts without rewrite rules.
  base: './',
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
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
