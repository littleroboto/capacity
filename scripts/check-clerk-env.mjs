#!/usr/bin/env node
/**
 * Sanity-check Clerk env for local dev: keys present, test/live mode aligned.
 * Does not print secret values.
 *
 * Usage: node scripts/check-clerk-env.mjs
 * Reads repo-root .env.local (same pattern as other scripts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env.local');

function loadEnvLocal() {
  if (!fs.existsSync(envFile)) {
    console.error('No .env.local — run `vercel env pull` from the linked project, or copy keys from Vercel → Project → Settings → Environment Variables.');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function modeFromKey(name, val) {
  if (!val) return { ok: false, hint: `missing ${name}` };
  if (val.startsWith('pk_test_') || val.startsWith('sk_test_')) return { ok: true, mode: 'test' };
  if (val.startsWith('pk_live_') || val.startsWith('sk_live_')) return { ok: true, mode: 'live' };
  return { ok: false, hint: `${name} does not look like a Clerk key (expected pk_/sk_ test or live)` };
}

function main() {
  loadEnvLocal();

  const pk =
    process.env.NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  const sk =
    process.env.CLERK_AUTHENTICATION_CLERK_SECRET_KEY?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim();

  const pkName = process.env.NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY
    ? 'NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY'
    : process.env.VITE_CLERK_PUBLISHABLE_KEY
      ? 'VITE_CLERK_PUBLISHABLE_KEY'
      : '(none)';

  const skName = process.env.CLERK_AUTHENTICATION_CLERK_SECRET_KEY
    ? 'CLERK_AUTHENTICATION_CLERK_SECRET_KEY'
    : process.env.CLERK_SECRET_KEY
      ? 'CLERK_SECRET_KEY'
      : '(none)';

  console.log('Clerk env check (.env.local)\n');
  console.log(`  Publishable: ${pkName} → ${pk ? `set (${pk.slice(0, 12)}…)` : 'MISSING'}`);
  console.log(`  Secret:      ${skName} → ${sk ? `set (${sk.slice(0, 12)}…)` : 'MISSING'}`);

  if (!pk || !sk) {
    console.log('\nFix: Vercel Dashboard → your project → linked Clerk integration exposes these names.');
    console.log('     Or run `vercel link` then `vercel env pull .env.local` so both land in one file.');
    process.exit(1);
  }

  const pm = modeFromKey('publishable', pk);
  const sm = modeFromKey('secret', sk);
  if (!pm.ok) {
    console.log(`\n${pm.hint}`);
    process.exit(1);
  }
  if (!sm.ok) {
    console.log(`\n${sm.hint}`);
    process.exit(1);
  }
  if (pm.mode !== sm.mode) {
    console.log(`\nMismatch: publishable is ${pm.mode} but secret is ${sm.mode} — they must be from the same Clerk app (same API keys page).`);
    process.exit(1);
  }

  console.log(`\nOK — both keys present and both are **${pm.mode}** (same mode).`);
  console.log('If APIs still 401: keys may be from two different Clerk *applications* (same mode but wrong app).');
  console.log('Copy both from Clerk → Configure → API keys in one browser tab.');
  console.log('Optional: CAPACITY_CLERK_AUTHORIZED_PARTIES must list your exact page origin (e.g. http://localhost:3000).');
  process.exit(0);
}

main();
