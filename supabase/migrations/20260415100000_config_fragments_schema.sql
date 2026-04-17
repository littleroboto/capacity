-- ============================================================================
-- Config Fragment Schema: Postgres-driven capacity planning configuration
--
-- This migration creates the full fragment-based schema for managing capacity
-- planning configuration as structured objects rather than monolithic YAML.
--
-- Extends the existing workspace_canonical migration with:
--   - Operating model / segment / market hierarchy
--   - Scoped config fragment tables (resources, BAU, campaigns, etc.)
--   - Revision tracking per fragment
--   - Build / artifact / publish pipeline tables
--   - Internal user access scope model
--   - Audit event log
--   - RLS policies
--
-- All important scoped tables carry operating_model_id, segment_id, market_id
-- directly for simple RLS, filtering, and audit.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 1: Organisational Hierarchy
-- ============================================================================

-- Two first-class operating contexts: operated_markets, licensed_markets
CREATE TABLE IF NOT EXISTS public.operating_models (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.operating_models (id, label, description) VALUES
  ('operated_markets', 'Operated Markets', 'Markets under direct operational control'),
  ('licensed_markets', 'Licensed Markets', 'Markets under licensing/franchise model (future)')
ON CONFLICT (id) DO NOTHING;

-- Segments within operating models
CREATE TABLE IF NOT EXISTS public.segments (
  id TEXT PRIMARY KEY,
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  label TEXT NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.segments (id, operating_model_id, label, display_order) VALUES
  ('LIOM', 'operated_markets', 'Large International Operated Markets', 1),
  ('IOM', 'operated_markets', 'International Operated Markets', 2)
ON CONFLICT (id) DO NOTHING;

-- Markets within segments
CREATE TABLE IF NOT EXISTS public.markets (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  label TEXT NOT NULL,
  country_code TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.markets (id, segment_id, operating_model_id, label, country_code, display_order) VALUES
  ('AU', 'LIOM', 'operated_markets', 'Australia', 'AU', 1),
  ('UK', 'LIOM', 'operated_markets', 'United Kingdom', 'GB', 2),
  ('DE', 'LIOM', 'operated_markets', 'Germany', 'DE', 3),
  ('CA', 'LIOM', 'operated_markets', 'Canada', 'CA', 4),
  ('FR', 'LIOM', 'operated_markets', 'France', 'FR', 5),
  ('IT', 'LIOM', 'operated_markets', 'Italy', 'IT', 6),
  ('ES', 'LIOM', 'operated_markets', 'Spain', 'ES', 7),
  ('PL', 'LIOM', 'operated_markets', 'Poland', 'PL', 8),
  ('CH', 'IOM', 'operated_markets', 'Switzerland', 'CH', 9),
  ('AT', 'IOM', 'operated_markets', 'Austria', 'AT', 10),
  ('NL', 'IOM', 'operated_markets', 'Netherlands', 'NL', 11),
  ('BE', 'IOM', 'operated_markets', 'Belgium', 'BE', 12),
  ('PT', 'IOM', 'operated_markets', 'Portugal', 'PT', 13),
  ('CZ', 'IOM', 'operated_markets', 'Czech Republic', 'CZ', 14),
  ('SK', 'IOM', 'operated_markets', 'Slovakia', 'SK', 15),
  ('SL', 'IOM', 'operated_markets', 'Slovenia', 'SI', 16),
  ('UA', 'IOM', 'operated_markets', 'Ukraine', 'UA', 17)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SECTION 2: User Access Scopes (Internal Authorization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_access_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'segment_editor', 'market_editor', 'viewer')),
  operating_model_id TEXT REFERENCES public.operating_models(id),
  segment_id TEXT REFERENCES public.segments(id),
  market_id TEXT REFERENCES public.markets(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT valid_scope_for_role CHECK (
    (role = 'admin')
    OR (role = 'segment_editor' AND operating_model_id IS NOT NULL AND segment_id IS NOT NULL)
    OR (role = 'market_editor' AND operating_model_id IS NOT NULL AND segment_id IS NOT NULL AND market_id IS NOT NULL)
    OR (role = 'viewer')
  )
);

CREATE INDEX IF NOT EXISTS user_access_scopes_clerk_idx
  ON public.user_access_scopes (clerk_user_id, is_active);


-- ============================================================================
-- SECTION 3: Config Fragment Tables
-- ============================================================================

-- Generic fragment status enum concept
-- Statuses: draft, active, archived, superseded

-- 3a. Resource configurations (labs, staff, testing_capacity, monthly patterns)
CREATE TABLE IF NOT EXISTS public.resource_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  labs_capacity INT,
  staff_capacity INT,
  testing_capacity INT,
  staff_monthly_pattern_basis TEXT CHECK (staff_monthly_pattern_basis IN ('absolute', 'multiplier')),
  staff_monthly_pattern JSONB,
  labs_monthly_pattern JSONB,
  tech_available_capacity_pattern JSONB,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE (market_id, version_number)
);

-- 3b. BAU configurations
CREATE TABLE IF NOT EXISTS public.bau_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  days_in_use JSONB,
  weekly_cycle JSONB,
  market_it_weekly_load JSONB,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE (market_id, version_number)
);

-- 3c. Campaign configurations (one row per campaign per market)
CREATE TABLE IF NOT EXISTS public.campaign_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  duration_days INT NOT NULL,
  testing_prep_duration INT,
  impact TEXT CHECK (impact IN ('low', 'medium', 'high', 'very_high')),
  promo_weight NUMERIC(4,2) DEFAULT 1.0,
  live_tech_load_scale NUMERIC(4,2),
  campaign_support JSONB,
  live_campaign_support JSONB,
  replaces_bau_tech BOOLEAN DEFAULT false,
  presence_only BOOLEAN DEFAULT false,
  stagger_functional_loads BOOLEAN DEFAULT false,
  stagger_settings JSONB,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS campaign_configs_market_idx
  ON public.campaign_configs (market_id, status);

-- 3d. Tech programme configurations
CREATE TABLE IF NOT EXISTS public.tech_programme_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  duration_days INT NOT NULL,
  testing_prep_duration INT,
  programme_support JSONB,
  live_programme_support JSONB,
  live_tech_load_scale NUMERIC(4,2),
  replaces_bau_tech BOOLEAN DEFAULT false,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS tech_programme_configs_market_idx
  ON public.tech_programme_configs (market_id, status);

-- 3e. Holiday calendars and entries
CREATE TABLE IF NOT EXISTS public.holiday_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  calendar_type TEXT NOT NULL CHECK (calendar_type IN ('public', 'school')),
  auto_import BOOLEAN NOT NULL DEFAULT false,
  staffing_multiplier NUMERIC(4,3) DEFAULT 1.0,
  trading_multiplier NUMERIC(4,3) DEFAULT 1.0,
  load_effects JSONB,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE (market_id, calendar_type, version_number)
);

CREATE TABLE IF NOT EXISTS public.holiday_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID NOT NULL REFERENCES public.holiday_calendars(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS holiday_entries_calendar_idx
  ON public.holiday_entries (calendar_id);

-- 3f. National leave bands
CREATE TABLE IF NOT EXISTS public.national_leave_band_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  label TEXT,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  capacity_multiplier NUMERIC(4,3),
  weeks JSONB,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS national_leave_band_configs_market_idx
  ON public.national_leave_band_configs (market_id, status);

-- 3g. Trading configurations
CREATE TABLE IF NOT EXISTS public.trading_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  weekly_pattern JSONB,
  monthly_pattern JSONB,
  seasonal JSONB,
  campaign_store_boost_prep NUMERIC(4,3) DEFAULT 0,
  campaign_store_boost_live NUMERIC(4,3) DEFAULT 0.28,
  campaign_effect_scale NUMERIC(4,2) DEFAULT 1.0,
  payday_month_peak_multiplier NUMERIC(4,3) DEFAULT 1.12,
  payday_month_knot_multipliers JSONB,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE (market_id, version_number)
);

-- 3h. Deployment risk configurations
CREATE TABLE IF NOT EXISTS public.deployment_risk_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  deployment_risk_week_weight NUMERIC(4,3),
  deployment_risk_month_curve JSONB,
  deployment_risk_context_month_curve JSONB,
  deployment_resourcing_strain_weight NUMERIC(4,3),
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  blackouts JSONB NOT NULL DEFAULT '[]'::jsonb,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE (market_id, version_number)
);

-- 3i. Operating window configurations
CREATE TABLE IF NOT EXISTS public.operating_window_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  multipliers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ramp_in_days INT,
  ramp_out_days INT,
  envelope TEXT CHECK (envelope IN ('smoothstep', 'linear', 'step')),
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS operating_window_configs_market_idx
  ON public.operating_window_configs (market_id, status);

-- 3j. Market-level config (title, description, holiday settings, stress correlations)
CREATE TABLE IF NOT EXISTS public.market_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  market_id TEXT NOT NULL REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  title TEXT,
  description TEXT,
  holiday_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  stress_correlations JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_heatmap_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE (market_id, version_number)
);

-- 3k. Scenario configurations and overrides
CREATE TABLE IF NOT EXISTS public.scenario_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT REFERENCES public.segments(id),
  market_id TEXT REFERENCES public.markets(id),
  version_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'superseded')),
  name TEXT NOT NULL,
  description TEXT,
  base_build_id UUID,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);


-- ============================================================================
-- SECTION 4: Revision Tracking
-- ============================================================================

-- Generic revision table for all fragment types.
-- Each row is an immutable snapshot of a fragment at a point in time.
CREATE TABLE IF NOT EXISTS public.config_revisions (
  id BIGSERIAL PRIMARY KEY,
  fragment_type TEXT NOT NULL,
  fragment_id UUID NOT NULL,
  version_number BIGINT NOT NULL,
  operating_model_id TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  market_id TEXT,
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS config_revisions_fragment_idx
  ON public.config_revisions (fragment_type, fragment_id, version_number DESC);

CREATE INDEX IF NOT EXISTS config_revisions_market_idx
  ON public.config_revisions (market_id, fragment_type);


-- ============================================================================
-- SECTION 5: Build / Artifact / Publish Pipeline
-- ============================================================================

-- Build: one deterministic assembly event
CREATE TABLE IF NOT EXISTS public.config_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT REFERENCES public.segments(id),
  market_id TEXT REFERENCES public.markets(id),
  build_number BIGSERIAL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generated', 'validated', 'published', 'failed', 'superseded')),
  triggered_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS config_builds_status_idx
  ON public.config_builds (operating_model_id, status);

CREATE INDEX IF NOT EXISTS config_builds_market_idx
  ON public.config_builds (market_id, status);

-- Build components: which fragment revisions contributed to a build
CREATE TABLE IF NOT EXISTS public.config_build_components (
  id BIGSERIAL PRIMARY KEY,
  build_id UUID NOT NULL REFERENCES public.config_builds(id) ON DELETE CASCADE,
  fragment_type TEXT NOT NULL,
  fragment_id UUID NOT NULL,
  revision_id BIGINT NOT NULL REFERENCES public.config_revisions(id),
  version_number BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS config_build_components_build_idx
  ON public.config_build_components (build_id);

-- Artifacts: generated output from a build
CREATE TABLE IF NOT EXISTS public.config_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES public.config_builds(id) ON DELETE CASCADE,
  operating_model_id TEXT NOT NULL REFERENCES public.operating_models(id),
  segment_id TEXT REFERENCES public.segments(id),
  market_id TEXT REFERENCES public.markets(id),
  artifact_type TEXT NOT NULL DEFAULT 'market_yaml'
    CHECK (artifact_type IN ('market_yaml', 'segment_bundle', 'full_bundle')),
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  byte_size INT,
  published_at TIMESTAMPTZ,
  published_by TEXT,
  superseded_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES public.config_artifacts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS config_artifacts_build_idx
  ON public.config_artifacts (build_id);

CREATE INDEX IF NOT EXISTS config_artifacts_market_active_idx
  ON public.config_artifacts (market_id, artifact_type)
  WHERE published_at IS NOT NULL AND superseded_at IS NULL;


-- ============================================================================
-- SECTION 6: Governance
-- ============================================================================

-- Audit events: append-only log
CREATE TABLE IF NOT EXISTS public.audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  operating_model_id TEXT,
  segment_id TEXT,
  market_id TEXT,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_type_idx
  ON public.audit_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON public.audit_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_market_idx
  ON public.audit_events (market_id, created_at DESC);

-- Import jobs: track bulk imports
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_model_id TEXT REFERENCES public.operating_models(id),
  segment_id TEXT REFERENCES public.segments(id),
  market_id TEXT REFERENCES public.markets(id),
  import_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  source_format TEXT,
  source_content TEXT,
  result_summary JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by TEXT
);

-- Validation results: persisted validation outcomes
CREATE TABLE IF NOT EXISTS public.validation_results (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('fragment', 'cross_fragment', 'artifact')),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  build_id UUID REFERENCES public.config_builds(id),
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  rule_code TEXT NOT NULL,
  message TEXT NOT NULL,
  field_path TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS validation_results_target_idx
  ON public.validation_results (target_type, target_id);

CREATE INDEX IF NOT EXISTS validation_results_build_idx
  ON public.validation_results (build_id);


-- ============================================================================
-- SECTION 7: Triggers
-- ============================================================================

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'markets', 'user_access_scopes',
      'resource_configs', 'bau_configs', 'campaign_configs',
      'tech_programme_configs', 'holiday_calendars',
      'national_leave_band_configs', 'trading_configs',
      'deployment_risk_configs', 'operating_window_configs',
      'market_configs', 'scenario_configs'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS tr_%I_touch_updated ON public.%I;
       CREATE TRIGGER tr_%I_touch_updated
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;


-- ============================================================================
-- SECTION 8: RLS Policies
-- ============================================================================

-- Enable RLS on all important scoped tables
ALTER TABLE public.operating_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bau_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_programme_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.national_leave_band_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_risk_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_window_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_build_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;

-- Reference tables: allow read by all authenticated, write by service_role only
-- (service_role bypasses RLS automatically; these policies cover authenticated users)

-- Operating models, segments, markets: everyone can read
CREATE POLICY read_operating_models ON public.operating_models
  FOR SELECT TO authenticated USING (true);

CREATE POLICY read_segments ON public.segments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY read_markets ON public.markets
  FOR SELECT TO authenticated USING (true);

-- Config fragment tables: scoped access via session variables
-- Pattern: app.user_role is set by trusted server code before queries
--
-- Plain English:
--   admin: can read and write everything
--   segment_editor: can read/write rows matching their operating_model + segment
--   market_editor: can read/write rows matching their operating_model + segment + market
--   viewer: can read rows matching their scope

-- Macro-style policy creation for scoped tables
-- Each scoped config table gets the same four policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'resource_configs', 'bau_configs', 'campaign_configs',
      'tech_programme_configs', 'holiday_calendars',
      'national_leave_band_configs', 'trading_configs',
      'deployment_risk_configs', 'operating_window_configs',
      'market_configs'
    ])
  LOOP
    -- Admin: full access
    EXECUTE format(
      'CREATE POLICY admin_all_%I ON public.%I
        FOR ALL TO authenticated
        USING (current_setting(''app.user_role'', true) = ''admin'')
        WITH CHECK (current_setting(''app.user_role'', true) = ''admin'');',
      tbl, tbl
    );

    -- Segment editor: read/write within their segment
    EXECUTE format(
      'CREATE POLICY segment_editor_%I ON public.%I
        FOR ALL TO authenticated
        USING (
          current_setting(''app.user_role'', true) = ''segment_editor''
          AND operating_model_id = current_setting(''app.operating_model_id'', true)
          AND segment_id = current_setting(''app.segment_id'', true)
        )
        WITH CHECK (
          current_setting(''app.user_role'', true) = ''segment_editor''
          AND operating_model_id = current_setting(''app.operating_model_id'', true)
          AND segment_id = current_setting(''app.segment_id'', true)
        );',
      tbl, tbl
    );

    -- Market editor: read/write within their market
    EXECUTE format(
      'CREATE POLICY market_editor_%I ON public.%I
        FOR ALL TO authenticated
        USING (
          current_setting(''app.user_role'', true) = ''market_editor''
          AND operating_model_id = current_setting(''app.operating_model_id'', true)
          AND segment_id = current_setting(''app.segment_id'', true)
          AND market_id = current_setting(''app.market_id'', true)
        )
        WITH CHECK (
          current_setting(''app.user_role'', true) = ''market_editor''
          AND operating_model_id = current_setting(''app.operating_model_id'', true)
          AND segment_id = current_setting(''app.segment_id'', true)
          AND market_id = current_setting(''app.market_id'', true)
        );',
      tbl, tbl
    );

    -- Viewer: read-only within scope
    EXECUTE format(
      'CREATE POLICY viewer_read_%I ON public.%I
        FOR SELECT TO authenticated
        USING (
          current_setting(''app.user_role'', true) = ''viewer''
          AND (
            current_setting(''app.operating_model_id'', true) IS NULL
            OR operating_model_id = current_setting(''app.operating_model_id'', true)
          )
          AND (
            current_setting(''app.segment_id'', true) IS NULL
            OR segment_id = current_setting(''app.segment_id'', true)
          )
          AND (
            current_setting(''app.market_id'', true) IS NULL
            OR market_id = current_setting(''app.market_id'', true)
          )
        );',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- Audit events: admin can read all; others read their scope
CREATE POLICY admin_read_audit ON public.audit_events
  FOR SELECT TO authenticated
  USING (current_setting('app.user_role', true) = 'admin');

CREATE POLICY scoped_read_audit ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    current_setting('app.user_role', true) != 'admin'
    AND (
      market_id = current_setting('app.market_id', true)
      OR segment_id = current_setting('app.segment_id', true)
    )
  );

-- Audit events: only service_role can insert (enforced by bypassing RLS)

-- Config revisions: read-only access matching fragment scope
CREATE POLICY admin_read_revisions ON public.config_revisions
  FOR SELECT TO authenticated
  USING (current_setting('app.user_role', true) = 'admin');

CREATE POLICY scoped_read_revisions ON public.config_revisions
  FOR SELECT TO authenticated
  USING (
    current_setting('app.user_role', true) IN ('segment_editor', 'market_editor', 'viewer')
    AND operating_model_id = current_setting('app.operating_model_id', true)
    AND (
      current_setting('app.segment_id', true) IS NULL
      OR segment_id = current_setting('app.segment_id', true)
    )
    AND (
      current_setting('app.market_id', true) IS NULL
      OR market_id IS NULL
      OR market_id = current_setting('app.market_id', true)
    )
  );

-- Build and artifact tables: read access follows scoping; writes via service_role
CREATE POLICY admin_read_builds ON public.config_builds
  FOR SELECT TO authenticated
  USING (current_setting('app.user_role', true) = 'admin');

CREATE POLICY scoped_read_builds ON public.config_builds
  FOR SELECT TO authenticated
  USING (
    operating_model_id = current_setting('app.operating_model_id', true)
    AND (
      market_id IS NULL
      OR market_id = current_setting('app.market_id', true)
    )
  );

CREATE POLICY admin_read_artifacts ON public.config_artifacts
  FOR SELECT TO authenticated
  USING (current_setting('app.user_role', true) = 'admin');

CREATE POLICY scoped_read_artifacts ON public.config_artifacts
  FOR SELECT TO authenticated
  USING (
    operating_model_id = current_setting('app.operating_model_id', true)
    AND (
      market_id IS NULL
      OR market_id = current_setting('app.market_id', true)
    )
  );


-- ============================================================================
-- SECTION 9: Comments for documentation
-- ============================================================================

COMMENT ON TABLE public.operating_models IS 'Top-level business contexts: operated_markets vs licensed_markets. First-class boundary for contract structure, validation, and access. Currently all markets are operated; licensed_markets is provisioned for future use.';
COMMENT ON TABLE public.segments IS 'Business segments within operating models. Currently LIOM (Large International Operated Markets) and IOM (International Operated Markets), both under operated_markets. Future segments (e.g. US) can be added under either operating model.';
COMMENT ON TABLE public.markets IS 'Individual country markets. Each belongs to exactly one segment and operating model.';
COMMENT ON TABLE public.user_access_scopes IS 'Internal authorization: maps Clerk user IDs to data scopes (role + operating_model + segment + market). Enforced server-side + RLS.';
COMMENT ON TABLE public.resource_configs IS 'Market resource capacity: labs, staff, testing slots, monthly patterns.';
COMMENT ON TABLE public.bau_configs IS 'Business-as-usual configuration: days in use, weekly cycle, market IT weekly load.';
COMMENT ON TABLE public.campaign_configs IS 'Individual campaign definitions with timing, support requirements, and promotional weight.';
COMMENT ON TABLE public.tech_programme_configs IS 'Technology programme definitions (non-campaign engineering work) with timing and support requirements.';
COMMENT ON TABLE public.holiday_calendars IS 'Holiday calendar headers (public or school) with staffing/trading multipliers.';
COMMENT ON TABLE public.holiday_entries IS 'Individual holiday dates belonging to a holiday calendar.';
COMMENT ON TABLE public.national_leave_band_configs IS 'Collective leave density bands that reduce effective lab+team capacity.';
COMMENT ON TABLE public.trading_configs IS 'Store/restaurant trading patterns: weekly, monthly, seasonal, campaign boosts, payday effects.';
COMMENT ON TABLE public.deployment_risk_configs IS 'Deployment risk events, blackouts, month curves, and week weights.';
COMMENT ON TABLE public.operating_window_configs IS 'Named calendar windows with load/capacity multipliers and optional ramps.';
COMMENT ON TABLE public.market_configs IS 'Market-level identity, holiday settings, stress correlations, and misc configuration.';
COMMENT ON TABLE public.scenario_configs IS 'What-if scenarios with overrides on top of a base build.';
COMMENT ON TABLE public.config_revisions IS 'Immutable revision snapshots of config fragments. Append-only.';
COMMENT ON TABLE public.config_builds IS 'Deterministic assembly events that combine fragment revisions into artifacts.';
COMMENT ON TABLE public.config_build_components IS 'Which fragment revisions contributed to a specific build.';
COMMENT ON TABLE public.config_artifacts IS 'Generated output (YAML) from a build. Published artifacts are immutable.';
COMMENT ON TABLE public.audit_events IS 'Append-only audit log for critical actions (creates, updates, publishes, imports, etc.).';
COMMENT ON TABLE public.import_jobs IS 'Bulk import job tracking with status and results.';
COMMENT ON TABLE public.validation_results IS 'Persisted validation outcomes at fragment, cross-fragment, and artifact levels.';
