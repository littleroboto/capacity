-- If 20260424120000 ran before staff patterns were flattened, this corrects active rows only.
-- Flatter year (no 2–3 FTE troughs): tier A min month 6; tier B/C flat 5 / 4. Labs + testing_capacity unchanged here.

CREATE TEMP TABLE _resource_staff_patterns (
  market_id TEXT PRIMARY KEY,
  staff_capacity INT NOT NULL,
  staff_monthly_pattern JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO _resource_staff_patterns (market_id, staff_capacity, staff_monthly_pattern)
VALUES
  ('UK', 7, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('AU', 7, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('FR', 7, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('DE', 7, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('CA', 7, '{"Jan":7,"Feb":7,"Mar":7,"Apr":7,"May":7,"Jun":6,"Jul":6,"Aug":6,"Sep":6,"Oct":7,"Nov":7,"Dec":6}'::jsonb),
  ('IT', 5, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('PL', 5, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('ES', 5, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('CH', 5, '{"Jan":5,"Feb":5,"Mar":5,"Apr":5,"May":5,"Jun":5,"Jul":5,"Aug":5,"Sep":5,"Oct":5,"Nov":5,"Dec":5}'::jsonb),
  ('AT', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('NL', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('BE', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('PT', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('CZ', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('SK', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('SL', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb),
  ('UA', 4, '{"Jan":4,"Feb":4,"Mar":4,"Apr":4,"May":4,"Jun":4,"Jul":4,"Aug":4,"Sep":4,"Oct":4,"Nov":4,"Dec":4}'::jsonb);

UPDATE public.resource_configs rc
SET
  staff_capacity = p.staff_capacity,
  staff_monthly_pattern = p.staff_monthly_pattern,
  staff_monthly_pattern_basis = 'absolute',
  updated_at = now()
FROM _resource_staff_patterns p
WHERE rc.market_id = p.market_id
  AND rc.status = 'active';
