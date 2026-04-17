/**
 * Typed client-side environment validation.
 * Client-exposed env: `VITE_*` and `NEXT_PUBLIC_*` (see `vite.config.ts` `envPrefix`).
 *
 * Usage:
 *   import { clientEnv } from '@/lib/clientEnv';
 *   const key = clientEnv.clerkPublishableKey;
 */

function viteVar(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name]?.trim();
  return v || undefined;
}

function viteBool(name: string): boolean {
  const v = viteVar(name)?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function viteList(name: string): string[] {
  const v = viteVar(name);
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export type ClientEnv = {
  /** Clerk publishable key (safe to expose). */
  clerkPublishableKey: string | null;

  /** When true, Clerk auth gate is disabled even if key is present. */
  authDisabled: boolean;

  /** Supabase public URL (anon access). */
  supabaseUrl: string | null;

  /** Supabase anon key (RLS-enforced). */
  supabaseAnonKey: string | null;

  /** Whether shared DSL sync is enabled. */
  sharedDslEnabled: boolean;

  /** Allowed user emails (client-side hint only; enforcement is server-side). */
  allowedUserEmails: string[];

  /** DSL write roles (client-side hint only; enforcement is server-side). */
  clerkDslWriteRoles: string[];

  /** Org admin roles (client-side hint). */
  orgAdminRoles: string[];

  /** Whether in production mode. */
  isProduction: boolean;
};

let _cached: ClientEnv | null = null;

export function clientEnv(): ClientEnv {
  if (_cached) return _cached;

  _cached = {
    clerkPublishableKey:
      viteVar('NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY') ??
      viteVar('VITE_CLERK_PUBLISHABLE_KEY') ??
      null,
    authDisabled: viteBool('VITE_AUTH_DISABLED'),
    supabaseUrl: viteVar('VITE_PUBLIC_SUPABASE_URL') ?? null,
    supabaseAnonKey: viteVar('VITE_PUBLIC_SUPABASE_ANON_KEY') ?? null,
    sharedDslEnabled: viteBool('VITE_SHARED_DSL'),
    allowedUserEmails: viteList('VITE_ALLOWED_USER_EMAILS'),
    clerkDslWriteRoles: viteList('VITE_CLERK_DSL_WRITE_ROLES'),
    orgAdminRoles: viteList('VITE_CAPACITY_ORG_ADMIN_ROLES').length
      ? viteList('VITE_CAPACITY_ORG_ADMIN_ROLES')
      : ['admin'],
    isProduction: import.meta.env.PROD,
  };

  return _cached;
}
