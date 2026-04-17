/**
 * One-shot bootstrap: grant this Clerk user Postgres admin (`user_access_scopes`)
 * and print the only other steps needed for “see everything” (workbench + admin APIs).
 *
 * Usage: pnpm admin:bootstrap you@example.com
 *    or: pnpm admin:ensure-scope you@example.com
 *
 * Requires .env.local (repo root) with Clerk secret + Supabase service credentials
 * (same names as api/lib/env.ts — including VITE_PUBLIC_SUPABASE_URL fallback).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvLocal(): void {
  const envFile = path.join(root, '.env.local');
  if (!fs.existsSync(envFile)) {
    console.error('Missing .env.local at repo root');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function clerkSecret(): string {
  const v =
    process.env.CLERK_AUTHENTICATION_CLERK_SECRET_KEY?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim();
  if (!v) {
    console.error('Missing CLERK_AUTHENTICATION_CLERK_SECRET_KEY or CLERK_SECRET_KEY');
    process.exit(1);
  }
  return v;
}

function supabaseUrl(): string {
  const v =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_PUBLIC_SUPABASE_URL?.trim();
  if (!v) {
    console.error('Missing SUPABASE_URL or VITE_PUBLIC_SUPABASE_URL');
    process.exit(1);
  }
  return v;
}

function supabaseServiceKey(): string {
  const v =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!v) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY');
    process.exit(1);
  }
  return v;
}

async function clerkUserIdForEmail(email: string, secret: string): Promise<string | null> {
  const clerk = createClerkClient({ secretKey: secret });
  const { data } = await clerk.users.getUserList({
    emailAddress: [email],
    limit: 10,
  });
  if (!data?.length) return null;
  const lower = email.toLowerCase();
  const exact = data.find((u) =>
    u.emailAddresses.some((ea) => ea.emailAddress.toLowerCase() === lower)
  );
  return (exact ?? data[0]).id;
}

function allowlistBlocksEmail(email: string): string | null {
  const raw =
    process.env.CAPACITY_ALLOWED_USER_EMAILS?.trim() ||
    process.env.VITE_ALLOWED_USER_EMAILS?.trim();
  if (!raw) return null;
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes('@'))
  );
  if (set.size === 0) return null;
  if (set.has(email.toLowerCase())) return null;
  return `CAPACITY_ALLOWED_USER_EMAILS / VITE_ALLOWED_USER_EMAILS is set but does not include ${email}. Add that email (or unset the allowlist for local dev).`;
}

function printFullAdminReminder(email: string, clerkUserId: string, supabaseDone: boolean): void {
  const block = allowlistBlocksEmail(email);
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  FULL ADMIN (“see everything”) — checklist');
  console.log('══════════════════════════════════════════════════════════════');
  if (supabaseDone) {
    console.log(`  [✓] Supabase: user_access_scopes.role = admin for clerk_user_id=${clerkUserId}`);
  } else {
    console.log('  [ ] Supabase: run this script again if admin row is missing.');
  }
  console.log('');
  console.log('  [ ] Clerk session JWT (workbench + /api/shared-dsl):');
  console.log('      Dashboard → Configure → Sessions → Customize session token');
  console.log('      If that JSON is EMPTY — you already get full workbench markets (legacy mode).');
  console.log('      If you added ANY of cap_admin / cap_segs / cap_ed / cap_mkts — add this so');
  console.log('      this user is a global admin in the workbench:');
  console.log('');
  console.log('        "cap_admin": true,');
  console.log('        "email": "{{user.primary_email_address}}"');
  console.log('');
  console.log('      Save → sign out of the app → sign back in (JWT must refresh).');
  console.log('');
  if (block) {
    console.log(`  [!] ${block}`);
  } else {
    console.log('  [✓] Email allowlist: not blocking (unset or includes this user).');
  }
  console.log('');
  console.log('  [ ] Restart `pnpm dev:vercel` after changing .env.local.');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');
}

async function main(): Promise<void> {
  loadEnvLocal();
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Usage: pnpm admin:bootstrap <email>');
    process.exit(1);
  }

  const clerkUserId = await clerkUserIdForEmail(email, clerkSecret());
  if (!clerkUserId) {
    console.error(`No Clerk user found for ${email}`);
    process.exit(1);
  }

  const sb = createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await sb
    .from('user_access_scopes')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .eq('is_active', true)
    .eq('role', 'admin')
    .limit(1);

  let supabaseDone = false;
  if (existing && existing.length > 0) {
    console.log(`Admin scope already in Supabase for ${email} → ${clerkUserId}`);
    supabaseDone = true;
  } else {
    const { error } = await sb.from('user_access_scopes').insert({
      clerk_user_id: clerkUserId,
      email,
      role: 'admin',
      operating_model_id: null,
      segment_id: null,
      market_id: null,
      is_active: true,
      created_by: 'scripts/ensure-clerk-admin-scope',
      updated_by: 'scripts/ensure-clerk-admin-scope',
    });

    if (error) {
      console.error('Supabase insert failed:', error.message);
      process.exit(1);
    }
    console.log(`Inserted admin user_access_scopes for ${email} → ${clerkUserId}`);
    supabaseDone = true;
  }

  printFullAdminReminder(email, clerkUserId, supabaseDone);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
