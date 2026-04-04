# Planning workbench architecture

This document analyses the pre-existing **capacity-atc** app, describes how it evolved into a broader **national QSR planning workbench**, and points to extension seams for persistence, calibration, and optional in-app drafting.

## 1. What existed (strengths to preserve)

- **React + Vite + TypeScript** SPA, static-deploy friendly, Zustand + localStorage for preferences and scenario slots.
- **YAML multi-document DSL** (`public/data/markets/*.yaml`) describing markets: `resources`, `bau` (including optional **`market_it_weekly_load`** for routine IT rhythm), `campaigns`, `trading`, legacy top-level `tech` (overrides), `holidays`, `stress_correlations`, `operating_windows`, heatmap tuning.
- **Clear pipeline**: `yamlDslParser` → `MarketConfig[]` → `expandPhases` / `aggregateByDay` → operating windows & school stress → `computeCapacity` → `computeRisk` → heatmap (`RunwayGrid`).
- **Phased campaign model**: prep-before-live, readiness vs live/support loads, `presenceOnly` markers.
- **Explainable tooltips**: campaigns, BAU, operating windows, risk blend terms (`runwayTooltipBreakdown.ts`).

## 2. Limitations addressed

- Domain was implicit (labs/teams/backend/ops/commercial) rather than named **org functions** and **market profiles**.
- No first-class **scenario** object for export beyond raw YAML + saved browser scenarios.
- No explicit **pressure surfaces** or **carry-over** in the numeric model.
- Simulation, parsing, and UI were strong but not named as separate **layers** in the folder structure.

## 3. Target layering (implemented direction)

| Layer | Responsibility | Location |
| --- | --- | --- |
| **Domain model** | `MarketProfile`, `OrgFunction`, `CapacityRecipe`, `PressureEvent`, `Scenario`, `SimulationResult` | `src/domain/` |
| **Input / parsing** | YAML → `MarketConfig` (existing); scenario view for export | `src/engine/yamlDslParser.ts`, `src/planning/scenarioFromMarketConfig.ts` |
| **Simulation engine** | Calendar, phased loads, surfaces, carry-over, capacity, risk | `src/engine/phaseEngine.ts`, `src/engine/pipeline.ts`, `src/planning/carryover.ts`, `src/engine/capacityModel.ts`, `src/engine/riskModel.ts` |
| **Visualisation** | Runway heatmap, tooltips, legends | `src/components/RunwayGrid.tsx`, `RunwayCellTooltip.tsx`, `HeatmapLegend.tsx` |
| **Workbench** | Orchestration, metrics strip, JSON export | `src/components/PlanningWorkbench.tsx`, `src/store/useAtcStore.ts`, `src/App.tsx` |

## 4. DSL → planning domain mapping

| YAML / config | Planning concept |
| --- | --- |
| `country` | `MarketProfile.marketId` |
| `resources.labs.capacity`, `resources.teams.*.size` | `CapacityRecipe.baseUnits` for lab + delivery teams |
| `bau`, `weekday_intensity` (routine IT rhythm) | `PressureEvent` (`bau_rhythm`) + surface **bau** |
| `campaigns` (prep / live) | `PressureEvent` (`campaign`) + surfaces **change** (prep/readiness) and **campaign** (live/sustain) |
| `releases` | `PressureEvent` / surface **change** |
| `operating_windows`, `stress_correlations` | Multipliers on all surfaces (coordination layer reserved for future explicit split) |

## 5. Pressure surfaces

Event-sourced surfaces (tagged in `expandPhases`):

- **bau** — BAU spikes and tech weekly rhythm.
- **change** — Campaign prep, readiness phases, release phases.
- **campaign** — Campaign live / sustain segments.
- **coordination** — Reserved (0 today); operating windows still explained in tooltips and scale all surfaces uniformly when they apply load multipliers.
- **carryover** — Backlog spill from **intrinsic** overload vs nominal cap (`src/planning/carryover.ts`), applied **before** operating-window multipliers. Overload caused only by carry-in does **not** create more carry (avoids feedback runaway). Defaults are mild (12% capture, 0.92 decay, cap ≈1.25× nominal per bucket).

Per-day **tech pressure** per surface uses the same utilisation logic as combined tech (max of lab / Market IT / backend blend) so surfaces are **comparable** but not strictly additive to the headline score.

## 6. Migration from “old app” concepts

- **No breaking YAML change**: existing files load unchanged.
- **Heatmap contract** (`RiskRow`) is extended with `pressure_surfaces`, `headroom`; consumers that ignore these fields behave as before.
- **New exports**: `Planning workbench → Export planning JSON` produces `capacity.planningBundle.v1` with `Scenario` + `simulationSummary` + optional `dslText`.

## 7. Future extensions (without rework)

- **Persistence**: persist `PlanningExportBundle` or `Scenario[]` server-side; hydrate `dslText` and call `applyDsl`.
- **Collaboration**: store bundles with version ids; diff two `simulationSummary` or full `riskSurface` arrays.
- **Calibration**: fit `carryOverRate` / `carryDecayPerDay` / risk weights from historical incidents; keep formulas in `pipeline`, `carryover`, `riskModelTuning`.
- **In-app LLM**: generate JSON matching `Scenario` or YAML matching `MarketConfig`; validate with the same parser path before `runPipeline`.

## 8. Determinism

The combined risk score still uses a small deterministic jitter (`withOperationalNoise`) for visual texture. Core loads, surfaces, carry-over, and blend **weights** are deterministic given YAML and tuning. To remove jitter entirely for audits, gate `withOperationalNoise` behind tuning or a zero amplitude.
