-- Tiered capacity defaults for operated markets (labs, peak staff, parallel test slots).
-- Keep bundled `public/data/markets/*.yaml` in sync for offline seeds (`sync-bundled-market-seeds`).
--
-- Tier A (large LIOM): UK, AU, FR, DE, CA — 5 labs, 5 test cycles, ~7 peak staff (absolute monthly).
-- Tier B (mid):       IT, PL, ES, CH     — 4 labs, 4 test cycles, ~5 peak staff.
-- Tier C (smaller):   AT, NL, BE, PT, CZ, SK, SL, UA — 4 labs, 3 test cycles, ~4 peak staff.
--
-- Staff monthly shapes stay close to level year-round (no “2 FTE” months); small dips only for tier A.

CREATE TEMP TABLE _resource_capacity_tiers (
  market_id TEXT PRIMARY KEY,
  labs_capacity INT NOT NULL,
  staff_capacity INT NOT NULL,
  testing_capacity INT NOT NULL,
  staff_monthly_pattern JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO _resource_capacity_tiers (market_id, labs_capacity, staff_capacity, testing_capacity, staff_monthly_pattern)
VALUES
  ('UK', 5, 7, 5, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('AU', 5, 7, 5, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('FR', 5, 7, 5, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('DE', 5, 7, 5, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('CA', 5, 7, 5, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('IT', 4, 5, 4, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('PL', 4, 5, 4, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('ES', 4, 5, 4, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('CH', 4, 5, 4, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('AT', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('NL', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('BE', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('PT', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('CZ', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('SK', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('SL', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('UA', 4, 4, 3, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb);

UPDATE public.resource_configs rc
SET
  labs_capacity = t.labs_capacity,
  staff_capacity = t.staff_capacity,
  testing_capacity = t.testing_capacity,
  staff_monthly_pattern_basis = 'absolute',
  staff_monthly_pattern = t.staff_monthly_pattern,
  updated_at = now()
FROM _resource_capacity_tiers t
WHERE rc.market_id = t.market_id
  AND rc.status = 'active';

-- Fresh env: no resource_configs row for this market yet.
INSERT INTO public.resource_configs (
  operating_model_id,
  segment_id,
  market_id,
  version_number,
  status,
  labs_capacity,
  staff_capacity,
  testing_capacity,
  staff_monthly_pattern_basis,
  staff_monthly_pattern,
  extra_settings
)
SELECT
  m.operating_model_id,
  m.segment_id,
  m.id,
  1,
  'active',
  t.labs_capacity,
  t.staff_capacity,
  t.testing_capacity,
  'absolute',
  t.staff_monthly_pattern,
  '{}'::jsonb
FROM public.markets m
JOIN _resource_capacity_tiers t ON m.id = t.market_id
WHERE m.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.resource_configs rc
    WHERE rc.market_id = m.id
  );
