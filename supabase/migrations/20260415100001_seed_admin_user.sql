-- Seed the admin user for development (optional placeholder).
-- Prefer: from repo root, `pnpm admin:ensure-scope your@email.com` (uses Clerk API + Supabase service role from .env.local).
--
-- In production, user_access_scopes are managed through the admin UI.
-- Scopes are keyed by real Clerk `user_*` ids — see api/lib/scopeResolver.ts.
INSERT INTO public.user_access_scopes (
  clerk_user_id,
  email,
  role,
  operating_model_id,
  segment_id,
  market_id,
  is_active,
  created_by,
  updated_by
) VALUES (
  'dev_admin_dougbooth',
  'dougbooth@mac.com',
  'admin',
  NULL,
  NULL,
  NULL,
  true,
  'system_seed',
  'system_seed'
)
ON CONFLICT DO NOTHING;
