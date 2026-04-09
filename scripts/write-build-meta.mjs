#!/usr/bin/env node
/**
 * Writes src/lib/buildMeta.generated.ts for each install/build so the header shows
 * the deployment commit on Vercel (VERCEL_GIT_COMMIT_SHA) and local git otherwise.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'src', 'lib', 'buildMeta.generated.ts');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

function isHexSha(s) {
  return /^[a-f0-9]{7,40}$/i.test(s);
}

function commitFullSha() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (vercelSha && isHexSha(vercelSha)) return vercelSha.toLowerCase();

  const gh = process.env.GITHUB_SHA?.trim();
  if (gh && isHexSha(gh)) return gh.toLowerCase();

  try {
    const line = execSync('git rev-parse HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    return isHexSha(line) ? line.toLowerCase() : '';
  } catch {
    return '';
  }
}

function commitShort() {
  const full = commitFullSha();
  if (full.length >= 7) return full.slice(0, 7);

  const dpl = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  if (dpl) {
    const raw = dpl.startsWith('dpl_') ? dpl.slice(4) : dpl;
    if (raw.length >= 7) return raw.slice(0, 7);
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'local';
  }
}

const shaFull = commitFullSha();
const sha = commitShort();
const builtAt = new Date().toISOString();

/** Single-line subject for footer / build stamp (Vercel exposes the deploy commit message). */
function commitSubject() {
  const vercelMsg = process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim();
  if (vercelMsg) return normalizeCommitSubject(vercelMsg);

  try {
    const line = execSync('git log -1 --pretty=%s', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    return normalizeCommitSubject(line);
  } catch {
    return '—';
  }
}

function normalizeCommitSubject(raw) {
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '—';
  return oneLine.length > 280 ? `${oneLine.slice(0, 277)}…` : oneLine;
}

const commitMsg = commitSubject();

function gitRepoUrlFromOrigin() {
  try {
    const raw = execSync('git remote get-url origin', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    if (!raw) return '';
    if (raw.startsWith('https://')) {
      const u = raw.replace(/^https:\/\//, '').replace(/\.git$/, '');
      const at = u.indexOf('@');
      if (at !== -1) {
        const rest = u.slice(at + 1);
        return rest.startsWith('github.com:')
          ? `https://github.com/${rest.slice('github.com:'.length)}`
          : `https://${rest.replace(':', '/')}`;
      }
      return `https://${u}`;
    }
    if (raw.startsWith('git@')) {
      const m = raw.match(/^git@([^:]+):(.+?)(\.git)?$/);
      if (m) return `https://${m[1]}/${m[2]}`;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function gitRepoUrl() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim();
  const slug = process.env.VERCEL_GIT_REPO_SLUG?.trim();
  if (owner && slug) return `https://github.com/${owner}/${slug}`;

  return gitRepoUrlFromOrigin();
}

const GIT_REPO_URL = gitRepoUrl();

function readLockVersions() {
  /** @type {Record<string, string>} */
  const out = {};
  try {
    const lockPath = path.join(root, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const packages = lock.packages;
    if (!packages || typeof packages !== 'object') return out;
    for (const key of Object.keys(packages)) {
      if (key === '' || !key.startsWith('node_modules/')) continue;
      const name = key.slice('node_modules/'.length);
      const ent = packages[key];
      const v = ent && typeof ent.version === 'string' ? ent.version : '';
      if (v && !(name in out)) out[name] = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

const LOCK_VERSIONS = readLockVersions();

function installedVersion(pkgKey) {
  return LOCK_VERSIONS[pkgKey] ?? '—';
}

function depRange(pkgKey) {
  const r = pkg.dependencies?.[pkgKey] ?? pkg.devDependencies?.[pkgKey];
  return typeof r === 'string' ? r : '—';
}

function bomRow(label, pkgKey) {
  return {
    label,
    range: depRange(pkgKey),
    installed: installedVersion(pkgKey),
    pkg: pkgKey,
  };
}

/** Kept in sync with the landing footer BOM — labels are display names; `pkg` is the package.json key. */
const LANDING_BOM_CLIENT_SPEC = [
  { label: 'React', pkg: 'react' },
  { label: 'react-dom', pkg: 'react-dom' },
  { label: 'TypeScript', pkg: 'typescript' },
  { label: 'Vite', pkg: 'vite' },
  { label: 'Tailwind CSS', pkg: 'tailwindcss' },
  { label: 'clsx', pkg: 'clsx' },
  { label: 'tailwind-merge', pkg: 'tailwind-merge' },
  { label: 'class-variance-authority', pkg: 'class-variance-authority' },
  { label: 'React Router', pkg: 'react-router-dom' },
  { label: 'Zustand', pkg: 'zustand' },
  { label: 'Radix UI (dialog)', pkg: '@radix-ui/react-dialog' },
  { label: 'Lucide', pkg: 'lucide-react' },
  { label: 'Motion', pkg: 'motion' },
  { label: '@use-gesture/react', pkg: '@use-gesture/react' },
  { label: 'Visx (curve)', pkg: '@visx/curve' },
  { label: 'html2canvas', pkg: 'html2canvas' },
  { label: 'Monaco Editor', pkg: '@monaco-editor/react' },
  { label: 'js-yaml', pkg: 'js-yaml' },
];

const LANDING_BOM_HOSTING_SPEC = [{ label: 'Vercel Blob', pkg: '@vercel/blob' }];

const LANDING_BOM_AUTH_SPEC = [
  { label: 'Clerk React', pkg: '@clerk/react' },
  { label: 'Clerk Backend', pkg: '@clerk/backend' },
];

const LANDING_BOM_FLAGS_SPEC = [
  { label: 'country-flag-icons', pkg: 'country-flag-icons' },
  { label: '@sankyu/react-circle-flags', pkg: '@sankyu/react-circle-flags' },
];

const LANDING_BOM_ROWS = [
  ...LANDING_BOM_CLIENT_SPEC.map(({ label, pkg: pkgKey }) => bomRow(label, pkgKey)),
  ...LANDING_BOM_HOSTING_SPEC.map(({ label, pkg: pkgKey }) => bomRow(label, pkgKey)),
  ...LANDING_BOM_AUTH_SPEC.map(({ label, pkg: pkgKey }) => bomRow(label, pkgKey)),
  ...LANDING_BOM_FLAGS_SPEC.map(({ label, pkg: pkgKey }) => bomRow(label, pkgKey)),
];

const body = `/* eslint-disable */
// Generated by scripts/write-build-meta.mjs — do not edit.
export const APP_VERSION = ${JSON.stringify(version)};
export const GIT_REPO_URL = ${JSON.stringify(GIT_REPO_URL)};
export const GIT_COMMIT_SHA = ${JSON.stringify(shaFull)};
export const GIT_COMMIT_SHORT = ${JSON.stringify(sha)};
export const GIT_COMMIT_MESSAGE = ${JSON.stringify(commitMsg)};
export const BUILD_TIME_ISO = ${JSON.stringify(builtAt)};
export const LANDING_BOM_ROWS = ${JSON.stringify(LANDING_BOM_ROWS, null, 2)} as const;
`;

writeFileSync(outFile, body, 'utf8');
process.stdout.write(`build-meta: ${version} · ${sha} · ${commitMsg} · ${builtAt}\n`);
