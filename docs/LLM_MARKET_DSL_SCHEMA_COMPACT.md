# CPM market YAML — compact schema (LLM system prompt)

Dense reference; full prose + examples live in `docs/LLM_MARKET_DSL_PROMPT.md`. **Quote every date** as `'YYYY-MM-DD'`. **Spaces only**, 2-space indent, no tabs. **Multi-market:** documents separated by a line containing only `---`; each doc has `market:` (or legacy `country:`).

## Top-level

| Key | Role |
| --- | --- |
| `market` | Id (`DE`, `UK`, …); required for real files |
| `title`, `description` | Optional strings |
| `resources` | Caps: `labs.capacity`, `staff.capacity`, optional `testing_capacity` (≤50); legacy `teams` map sums `size` |
| `bau` | `days_in_use`, `weekly_cycle`, optional `integration_tests`, optional **`market_it_weekly_load`** (same inner keys as legacy `tech`); legacy `weekly_promo*` |
| `campaigns` | Marketing / store programmes: list or map |
| `tech_programmes` | Non-marketing tech load; **not** under `tech:`, **not** `releases` |
| `public_holidays`, `school_holidays` | `auto`, `dates[]`, optional `ranges[]` (`from` / `to` ISO, merged with `dates`), multipliers; school may add `load_effects` |
| `holidays` | Cross: `capacity_taper_days`, `lab_capacity_scale` |
| `stress_correlations` | Legacy; prefer `school_holidays.load_effects` |
| `trading` | Store demand: `weekly_pattern`, optional `monthly_pattern`, `seasonal`, payday, campaign boosts |
| `tech` | **Legacy** top-level BAU IT rhythm (prefer **`bau.market_it_weekly_load`**). Canonical keys: **`weekday_intensity`**, **`labs_multiplier`**, **`extra_support_*`**, **`monthly_runway_availability`** (legacy `weekly_pattern`, `labs_scale`, `support_*`, `available_capacity_pattern` still parse). If nested + `tech:` exist, top-level wins per key. |
| `operating_windows` | Named `[start,end]` bands with load / pressure mults + ramps |
| `releases` | **Deploy** grid: `deploy_date`, `systems`, `phases[]`, `load` — different from `tech_programmes` |
## `campaigns` row (list item or map value)

**Core:** `name`, `start_date`, `duration` (days live, ≥0).

**Prep (lead model):** `testing_prep_duration` (aliases `prep_before_live_days`, …) = calendar prep days ending day before go-live. **Do not** mix with `readiness_duration` unless you intend the interval model.

**Loads:** `campaign_support` → prep `load`: keys **`labs_required`**→labs, **`tech_staff`**→teams; optional `backend`,`ops`,`supply`,`commercial`,`marketing`. `live_campaign_support` → live segment (aliases `live_support`, …). Expert: top-level `load`, `live_support_load` merge with those.

**Common optional:** `impact` (`low|medium|high|very_high`), `business_uplift`, `live_support_scale` (~0.45 default when live empty), `live_tech_load_scale` (~0.55 on labs/teams/backend in live), `presence_only`, `replaces_bau_tech`, `stagger_functional_loads` + `*_prep_days_before_live` tuning keys.

**Minimal pattern:**

```yaml
- name: example
  start_date: '2026-06-01'
  duration: 30
  testing_prep_duration: 14
  impact: medium
  business_uplift: 1
  campaign_support:
    labs_required: 1
    tech_staff: 1
  live_campaign_support:
    labs_required: 0.5
    tech_staff: 0.5
```

## `tech_programmes` row

Same **timing** as campaigns (`name`, `start_date`, `duration`, optional `testing_prep_duration` or `readiness_duration`). **Loads:** `programme_support` / `live_programme_support` (aliases **`campaign_support`** / **`live_campaign_support`** allowed). Optional `live_tech_load_scale` (default **1**), `replaces_bau_tech`. **Forbidden:** `impact`, `business_uplift`, `presence_only`.

```yaml
tech_programmes:
  - name: platform_rollout
    start_date: '2026-05-01'
    duration: 20
    programme_support:
      labs_required: 1
      tech_staff: 1
```

## `releases` row

`deploy_date`, `systems: […]`, `phases: [{name, offset_days}]`, `load: {labs, teams, backend, ops, commercial}` (numeric; omitted = unset).

## `resources`

```yaml
resources:
  labs: { capacity: 5 }
  staff: { capacity: 4 }
  testing_capacity: 10
```

## `bau`

`days_in_use: [mo,tu,…]` or `Mon`…`Sun`; `weekly_cycle: {labs_required, staff_required, support_days?}`; optional `integration_tests: {day, labs}`; optional **`market_it_weekly_load:`** (or aliases `market_it_support`, `bau_technology_support`, `restaurant_it_rhythm`) with the same inner fields as §`tech`.

## `trading`

`weekly_pattern`: `default`, `weekdays`, `weekend`, `Mon`…`Sun` → `low|medium|high|very_high` or 0–1. Optional `monthly_pattern` (Jan…Dec), `seasonal: {peak_month, amplitude}`, `payday_month_peak_multiplier` (1–1.2, +20% max), `payday_month_knot_multipliers` (four values, same cap), `campaign_store_boost_prep`, `campaign_store_boost_live`, `campaign_effect_scale` (0–2.5).

## `tech` / `bau.market_it_weekly_load`

**`weekday_intensity`** (same day tokens as trading), optional **`labs_multiplier`**, **`teams_multiplier`**, **`backend_multiplier`**. Optional **`extra_support_weekdays`**, **`extra_support_months`** (Jan…Dec; omitted → 1), **`extra_support_teams_scale`**, **`monthly_runway_availability`**. Legacy: `weekly_pattern`, `labs_scale`, `support_*`, `available_capacity_pattern`. **Prefer** nesting under **`bau.market_it_weekly_load`**; top-level **`tech:`** = legacy override.

## `operating_windows` item

`name`, `start`, `end` (quoted dates), optional `store_pressure_mult`, `lab_load_mult`, `team_load_mult`, `backend_load_mult`, `ops_activity_mult`, `commercial_activity_mult`, `lab_team_capacity_mult`, `ramp_in_days`, `ramp_out_days`, `envelope`: `step|linear|smoothstep`.

## Holidays

`public_holidays` / `school_holidays`: `auto` bool, `dates: ['YYYY-MM-DD', …]`, optional `ranges: [{ from: '…', to: '…' }, …]` (inclusive calendar days, merged with `dates`), `staffing_multiplier`, optional `trading_multiplier`; `school_holidays.load_effects` optional mult map (`lab_load_mult`, `team_load_mult`, …).

## Heatmap (app only)

Pressure → colour transfer (curve, γ, etc.) is **not** market YAML — use the in-app Settings / Business Patterns controls. Legacy top-level `risk_heatmap_*` keys are ignored if present; **omit** them in new YAML.

## Parser defaults (when omitted)

| Item | Default |
| --- | --- |
| `resources.labs.capacity` | 5 |
| Team capacity | `staff.capacity` or sum `teams.*.size` or 4 |
| Campaign prep commercial | from `impact` or 0.5 |
| Empty live support | prep × `live_support_scale` (~0.45) |
| Campaign live tech dampening | `live_tech_load_scale` ~0.55 on labs/teams/backend |
| `tech` scales | labs 2, teams 1, backend 0 |
| `extra_support_*` (legacy `support_*`) | Load only if `extra_support_weekdays` present; monthly omitted → 1; `extra_support_teams_scale` default 1 |

## CamelCase aliases (often accepted)

`startDate`/`start`, `testingPrepDuration`, `prepBeforeLiveDays`, `campaignSupport`, `liveCampaignSupport`, `daysInUse`, `weeklyCycle`, `labsRequired`, `staffRequired`, `supportWeeklyPattern`, `supportMonthlyPattern`, `supportTeamsScale`, `publicHolidays`, `schoolHolidays`, `deployDate`, `offsetDays`, … — prefer **snake_case** in new output.
