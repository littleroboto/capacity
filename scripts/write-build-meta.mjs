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
const packageLock = readJsonIfExists(path.join(root, 'package-lock.json'));
const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isHexSha(s) {
  return /^[a-f0-9]{7,40}$/i.test(s);
}

function commitShort() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (vercelSha && isHexSha(vercelSha)) return vercelSha.slice(0, 7);

  const gh = process.env.GITHUB_SHA?.trim();
  if (gh && isHexSha(gh)) return gh.slice(0, 7);

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

function depDeclaredVersion(pkgKey) {
  const value = pkg.dependencies?.[pkgKey] ?? pkg.devDependencies?.[pkgKey];
  return typeof value === 'string' ? value : null;
}

function depResolvedVersion(pkgKey) {
  const lockVersion = packageLock?.packages?.[`node_modules/${pkgKey}`]?.version;
  return typeof lockVersion === 'string' ? lockVersion : null;
}

function depInstalledVersion(pkgKey) {
  const installedPkg = readJsonIfExists(path.join(root, 'node_modules', pkgKey, 'package.json'));
  const installedVersion = installedPkg?.version;
  return typeof installedVersion === 'string' ? installedVersion : null;
}

/** Prefer the lockfile's resolved version so the footer shows the build's actual package version. */
function depVersion(pkgKey) {
  return depResolvedVersion(pkgKey) ?? depInstalledVersion(pkgKey) ?? depDeclaredVersion(pkgKey) ?? '—';
}

function bomEntries(section, spec) {
  return spec.map(({ label, pkg }) => ({
    section,
    label,
    version: depVersion(pkg),
    pkg,
  }));
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

const LANDING_BOM_HOSTING_SPEC = [
  { label: 'Vercel Blob', pkg: '@vercel/blob' },
];

const LANDING_BOM_AUTH_SPEC = [
  { label: 'Clerk React', pkg: '@clerk/react' },
  { label: 'Clerk Backend', pkg: '@clerk/backend' },
];

const LANDING_BOM_FLAGS_SPEC = [
  { label: 'country-flag-icons', pkg: 'country-flag-icons' },
  { label: '@sankyu/react-circle-flags', pkg: '@sankyu/react-circle-flags' },
];

const LANDING_BOM_CLIENT = bomEntries('Client bundle', LANDING_BOM_CLIENT_SPEC);
const LANDING_BOM_HOSTING = bomEntries('Hosting & sync', LANDING_BOM_HOSTING_SPEC);
const LANDING_BOM_AUTH = bomEntries('Auth (optional)', LANDING_BOM_AUTH_SPEC);
const LANDING_BOM_FLAGS = bomEntries('Market chrome', LANDING_BOM_FLAGS_SPEC);

const body = `/* eslint-disable */
// Generated by scripts/write-build-meta.mjs — do not edit.
export const APP_VERSION = ${JSON.stringify(version)};
export const GIT_COMMIT_SHORT = ${JSON.stringify(sha)};
export const GIT_COMMIT_MESSAGE = ${JSON.stringify(commitMsg)};
export const BUILD_TIME_ISO = ${JSON.stringify(builtAt)};
export const LANDING_BOM_CLIENT = ${JSON.stringify(LANDING_BOM_CLIENT, null, 2)} as const;
export const LANDING_BOM_HOSTING = ${JSON.stringify(LANDING_BOM_HOSTING, null, 2)} as const;
export const LANDING_BOM_AUTH = ${JSON.stringify(LANDING_BOM_AUTH, null, 2)} as const;
export const LANDING_BOM_FLAGS = ${JSON.stringify(LANDING_BOM_FLAGS, null, 2)} as const;
`;

writeFileSync(outFile, body, 'utf8');
process.stdout.write(`build-meta: ${version} · ${sha} · ${commitMsg} · ${builtAt}\n`);
