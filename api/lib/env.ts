/**
 * Typed server-side environment validation.
 * Fails fast with clear errors if required vars are missing or malformed.
 *
 * Usage:
 *   import { serverEnv } from './env';
 *   const url = serverEnv.supabaseUrl;
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * `vercel dev` often does not inject `VITE_*` into Node serverless `process.env`, while Vite
 * still exposes them to the browser from repo-root `.env.local`. Merge those files once so
 * API routes see the same keys when `process.cwd()` is the project root (typical for `vercel dev`).
 */
let _repoDotenvLoaded = false;

function loadRepoDotEnvOnce(): void {
  if (_repoDotenvLoaded) return;
  _repoDotenvLoaded = true;
  const root = process.cwd();
  for (const name of ['.env', '.env.local'] as const) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;
    let text = fs.readFileSync(full, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (!val) {
        if (!process.env[key]?.trim()) process.env[key] = '';
        continue;
      }
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      } else {
        const comment = val.search(/\s+#/);
        if (comment !== -1) val = val.slice(0, comment).trimEnd();
      }
      if (!process.env[key]?.trim()) process.env[key] = val;
    }
  }
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requiredWithFallback(primary: string, fallback: string): string {
  const v = process.env[primary]?.trim() || process.env[fallback]?.trim();
  if (!v) throw new Error(`Missing required env var: ${primary} (or fallback ${fallback})`);
  return v;
}

/** First defined wins — use when Vite client and server use different names for the same value. */
function requiredFirst(names: readonly string[]): string {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  throw new Error(`Missing required env var: one of ${names.join(', ')}`);
}

/** First defined wins; otherwise `undefined` (no throw). */
function optionalFirst(names: readonly string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Vercel sometimes exposes `POSTGRES_*` / `DATABASE_URL` from the Supabase integration
 * without `SUPABASE_URL`. The REST API base is `https://<project-ref>.supabase.co`.
 * Only runs when the DSN clearly targets Supabase infrastructure.
 */
function supabaseUrlFromPostgresEnv(): string | undefined {
  const keys = ['POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DATABASE_URL'] as const;
  for (const key of keys) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    const derived = tryDeriveSupabaseRestUrl(raw);
    if (derived) return derived;
  }
  return undefined;
}

function tryDeriveSupabaseRestUrl(postgresDsn: string): string | undefined {
  if (!/supabase\.(co|com)/i.test(postgresDsn)) return undefined;

  // postgresql://postgres:pwd@db.<project-ref>.supabase.co:5432/postgres
  const direct = postgresDsn.match(/@db\.([a-z0-9]+)\.supabase\.co(?::\d+)?\//i);
  if (direct?.[1]) return `https://${direct[1]}.supabase.co`;

  // Pooler: postgresql://postgres.<project-ref>:pwd@....pooler.supabase.com:6543/postgres
  if (/pooler\.supabase\.com/i.test(postgresDsn)) {
    const pool = postgresDsn.match(/\/\/postgres\.([a-z0-9]+):/i);
    if (pool?.[1]) return `https://${pool[1]}.supabase.co`;
  }

  return undefined;
}

function optionalBool(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function optionalList(name: string): string[] {
  const v = process.env[name]?.trim();
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Actionable hint when Supabase URL is missing (Vercel env scoping / local dev). */
function supabaseUrlMissingHint(_hasPostgresUrl: boolean): string {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  if (vercelEnv === 'preview') {
    return (
      ' Enable the same variables for the Preview environment in the Vercel project (or they only exist on Production).' +
      ' The browser can still read `VITE_*` from the build, but server routes use the Preview server env.'
    );
  }
  if (vercelEnv === 'development' || (process.env.VERCEL === '1' && !vercelEnv)) {
    return (
      ' `vercel dev` uses the Development environment by default, not Production.' +
      ' Run `pnpm vercel:env:pull-prod` to write Production values into `.env.local`, or duplicate `SUPABASE_URL` (and service key) under Development in the Vercel dashboard.'
    );
  }
  return '';
}

export type ServerEnv = {
  /** Clerk — canonical `CLERK_AUTHENTICATION_CLERK_SECRET_KEY`, legacy `CLERK_SECRET_KEY`. */
  clerkSecretKey: string;

  /** Supabase */
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string | undefined;

  /** Postgres (direct) — optional; no current API path reads this from serverEnv. */
  postgresUrl: string | undefined;
  postgresUrlNonPooling: string | undefined;

  /** Upstash Redis */
  upstashRedisRestUrl: string | undefined;
  upstashRedisRestToken: string | undefined;
  upstashRedisRestReadOnlyToken: string | undefined;

  /** Legacy Blob (compatibility) */
  blobReadWriteToken: string | undefined;
  capacityBlobAccess: 'public' | 'private';

  /** Legacy DSL */
  capacitySharedDslSecret: string | undefined;
  legacySharedDslWriteDisabled: boolean;

  /** ACL */
  allowedUserEmails: string[];
  clerkDslWriteRoles: string[];
  orgAdminRoles: string[];
  clerkAuthorizedParties: string[];

  /** Feature flags */
  configSource: 'blob' | 'postgres';
};

/**
 * Clerk JWT verification inputs from `process.env` only.
 * `/api/shared-dsl` auth must not call `serverEnv()` (which validates Postgres/Supabase too):
 * if those throw, we would skip `verifyToken` and falsely return 401.
 */
export function clerkAuthEnvFromProcess(): {
  secretKey: string | undefined;
  authorizedParties: string[];
} {
  loadRepoDotEnvOnce();
  const secretKey =
    process.env.CLERK_AUTHENTICATION_CLERK_SECRET_KEY?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    undefined;
  const raw = process.env.CAPACITY_CLERK_AUTHORIZED_PARTIES?.trim();
  const authorizedParties = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return { secretKey, authorizedParties };
}

let _cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  loadRepoDotEnvOnce();
  if (_cached) return _cached;

  const blobAccess = optional('CAPACITY_BLOB_ACCESS')?.toLowerCase();
  const configSource = optional('CAPACITY_CONFIG_SOURCE')?.toLowerCase();

  _cached = {
    clerkSecretKey: requiredWithFallback(
      'CLERK_AUTHENTICATION_CLERK_SECRET_KEY',
      'CLERK_SECRET_KEY'
    ),

    supabaseUrl: (() => {
      const direct = optionalFirst(
        ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_PUBLIC_SUPABASE_URL'] as const
      );
      if (direct) return direct;
      const derived = supabaseUrlFromPostgresEnv();
      if (derived) return derived;
      const hasPg = optionalFirst(['POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DATABASE_URL'] as const);
      throw new Error(
        `Missing required env var: one of SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, VITE_PUBLIC_SUPABASE_URL` +
          (hasPg
            ? ' (a Postgres URL is set but it is not a Supabase-hosted DSN we can map to a REST URL; set SUPABASE_URL explicitly.)'
            : ' — Vercel serverless only sees variables enabled for this deployment environment (Preview vs Production vs Development). `.env.local` is not deployed unless mirrored in the Vercel project or via `vercel env pull` / dashboard.') +
          supabaseUrlMissingHint(Boolean(hasPg))
      );
    })(),
    supabaseServiceRoleKey: requiredFirst(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'] as const),
    supabaseAnonKey:
      optional('VITE_PUBLIC_SUPABASE_ANON_KEY') ?? optional('NEXT_PUBLIC_SUPABASE_ANON_KEY'),

    postgresUrl: optionalFirst(['POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DATABASE_URL'] as const),
    postgresUrlNonPooling: optional('POSTGRES_URL_NON_POOLING'),

    upstashRedisRestUrl: optional('STORAGE_UPSTASH_KV_REST_API_URL'),
    upstashRedisRestToken: optional('STORAGE_UPSTASH_KV_REST_API_TOKEN'),
    upstashRedisRestReadOnlyToken: optional('STORAGE_UPSTASH_KV_REST_API_READ_ONLY_TOKEN'),

    blobReadWriteToken: optional('BLOB_READ_WRITE_TOKEN'),
    capacityBlobAccess: blobAccess === 'public' ? 'public' : 'private',

    capacitySharedDslSecret: optional('CAPACITY_SHARED_DSL_SECRET'),
    legacySharedDslWriteDisabled: optionalBool('CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE'),

    allowedUserEmails: optionalList('CAPACITY_ALLOWED_USER_EMAILS'),
    clerkDslWriteRoles: optionalList('CAPACITY_CLERK_DSL_WRITE_ROLES'),
    orgAdminRoles: optionalList('CAPACITY_ORG_ADMIN_ROLES').length
      ? optionalList('CAPACITY_ORG_ADMIN_ROLES')
      : ['admin'],
    clerkAuthorizedParties: optionalList('CAPACITY_CLERK_AUTHORIZED_PARTIES'),

    configSource: configSource === 'postgres' ? 'postgres' : 'blob',
  };

  return _cached;
}

/** Reset cached env (for testing). */
export function resetServerEnvCache(): void {
  _cached = null;
  _repoDotenvLoaded = false;
}
