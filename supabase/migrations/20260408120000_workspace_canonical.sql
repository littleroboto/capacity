-- Canonical workspace storage for Capacity (Supabase Postgres).
--
-- Auth: Clerk session JWT is verified on Vercel serverless (same as api/_sharedDslImpl.ts).
-- This database is not exposed to the browser; use the service role (or a restricted DB role)
-- only from trusted server code. RLS is enabled with no policies for anon/authenticated so
-- direct PostgREST access stays closed unless you add Supabase Auth later.
--
-- ACL (LIOM / IOM / per-market): enforced in application code by intersecting session claims
-- cap_segs, cap_mkts, cap_admin, cap_ed with segment_markets — not in RLS, to keep Clerk as
-- the single sign-in source of truth.

-- Extensions (Supabase usually enables pgcrypto; gen_random_uuid lives there)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Static segment → market map (keep in sync with public/data/segments.json
-- and api/_capacityWorkspaceAcl.data.ts; scripts can diff in CI).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.segment_markets (
  segment_code TEXT NOT NULL,
  market_id TEXT NOT NULL,
  PRIMARY KEY (segment_code, market_id)
);

INSERT INTO public.segment_markets (segment_code, market_id) VALUES
  ('LIOM', 'AU'), ('LIOM', 'UK'), ('LIOM', 'DE'), ('LIOM', 'CA'), ('LIOM', 'FR'),
  ('LIOM', 'IT'), ('LIOM', 'ES'), ('LIOM', 'PL'),
  ('IOM', 'CH'), ('IOM', 'AT'), ('IOM', 'NL'), ('IOM', 'BE'), ('IOM', 'PT'),
  ('IOM', 'CZ'), ('IOM', 'SK'), ('IOM', 'SL'), ('IOM', 'UA')
ON CONFLICT (segment_code, market_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- One row per Clerk Organization = one isolated workspace (team scenario data).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_organization_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  -- Monotonic counter: increment whenever any market_document row changes (trigger below).
  -- Use in Redis cache keys so one bump invalidates bundle caches without SCAN/DEL.
  revision BIGINT NOT NULL DEFAULT 0,
  -- Optional team-wide UI defaults (heatmap tuning, etc.) — future use.
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_clerk_org_idx ON public.workspaces (clerk_organization_id);

-- ---------------------------------------------------------------------------
-- Per-market YAML documents (replaces a single monolithic blob for concurrency).
-- Optimistic concurrency: compare-and-swap on version.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  yaml_body TEXT NOT NULL,
  -- Increments on each successful save; client sends expected version (If-Match style).
  version BIGINT NOT NULL DEFAULT 1,
  content_sha256 TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_clerk_user_id TEXT,
  UNIQUE (workspace_id, market_id)
);

CREATE INDEX IF NOT EXISTS market_documents_workspace_idx
  ON public.market_documents (workspace_id);

CREATE INDEX IF NOT EXISTS market_documents_workspace_market_idx
  ON public.market_documents (workspace_id, market_id);

-- ---------------------------------------------------------------------------
-- Bump workspace.revision after any insert/update/delete on market_documents.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_workspace_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.workspaces
    SET revision = revision + 1, updated_at = now()
    WHERE id = OLD.workspace_id;
    RETURN OLD;
  END IF;
  UPDATE public.workspaces
  SET revision = revision + 1, updated_at = now()
  WHERE id = NEW.workspace_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_market_documents_bump_revision ON public.market_documents;
CREATE TRIGGER tr_market_documents_bump_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.market_documents
  FOR EACH ROW
  EXECUTE PROCEDURE public.bump_workspace_revision();

-- Keep updated_at on row-level edits
CREATE OR REPLACE FUNCTION public.touch_market_document()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_market_documents_touch ON public.market_documents;
CREATE TRIGGER tr_market_documents_touch
  BEFORE UPDATE ON public.market_documents
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_market_document();

-- ---------------------------------------------------------------------------
-- Optional append-only history (lightweight audit; full diff storage is future).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_document_revisions (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  version BIGINT NOT NULL,
  yaml_body TEXT NOT NULL,
  clerk_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_document_revisions_ws_market_idx
  ON public.market_document_revisions (workspace_id, market_id, version DESC);

-- ---------------------------------------------------------------------------
-- RLS: deny anonymous/authenticated PostgREST by default; service_role bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_document_revisions ENABLE ROW LEVEL SECURITY;

-- Optional: grant usage to service_role only (Supabase dashboard may add grants)
COMMENT ON TABLE public.workspaces IS 'Clerk org 1:1 workspace; server writes via service role; ACL in Vercel using cap_* claims.';
COMMENT ON TABLE public.market_documents IS 'Per-market YAML; optimistic locking on version; merge on server for scoped editors.';
COMMENT ON TABLE public.segment_markets IS 'Reference for CI alignment with segments.json; ACL resolved in app using Clerk JWT.';
