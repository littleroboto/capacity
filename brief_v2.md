# Operational Change ATC — Proof of Concept Brief

---

## Purpose

Build a browser-based planning tool that visualises operational pressure across multiple QSR markets and identifies safe landing slots for initiatives.

The system models organisational capacity in a way similar to air traffic control, where change initiatives are treated as "flights" landing into operational environments with limited capacity.

The goal is to allow leadership to quickly answer:

- Where can we safely land a change initiative?
- When are markets overloaded?
- Where are good pilot opportunities?

Traditional programme plans answer *what* work is scheduled. This tool answers *whether* the system can absorb that work.

Capacity planning systems are typically used to compare resource supply and demand to avoid overload or under-utilisation.

---

## Conceptual Model

The system visualises three operational pressure surfaces:

### 1. Technical Pressure

Engineering capacity and testing constraints.

- lab capacity
- integration testing
- backend deployments
- SME availability
- infrastructure work

### 2. Commercial Exposure

Risk tolerance based on business activity.

- major campaigns
- national promotions
- holiday trading
- seasonal peaks

### 3. Organisational Coordination

Friction caused by cross-team dependencies.

- approvals
- budget dependencies
- vendor involvement
- multi-team alignment

---

## Core Idea

The system converts operational complexity into a calendar heatmap.

| Colour | Meaning |
|--------|---------|
| green  | safe operational headroom |
| yellow | moderate pressure |
| red    | unsafe / high risk |

Users can view different layers:

- Tech pressure
- Store trading pressure
- Campaigns
- Holidays
- Combined risk

---

## Primary Use Case

**Example scenario:**

- **Initiative:** Bring Your Own Packaging
- **Systems:** POS + Mobile App
- **Duration:** 3 weeks

The system scans the calendar across countries and identifies:

- Best landing slots
- Candidate pilot markets
- High-risk periods

---

## Key Features

### 1. Calendar Heatmap

Visualise operational pressure by country. Layout similar to GitHub contribution map.

```
Mo Tu We Th Fr Sa Su
🟢 🟡 🟡 🔴 🟢 ⚪ ⚪
🟢 🟡 🟢 🟡 🔴 ⚪ ⚪
🟢 🟢 🟡 🟡 🔴 ⚪ ⚪
```

Filters allow switching views:

- Tech Pressure
- Store Trading
- Campaigns
- Holidays
- Combined Risk

### 2. Slot Finder

Users define initiative parameters:

- initiative type
- systems touched
- duration
- lab requirements
- BAU compatibility

The system evaluates every calendar window and highlights **recommended landing slots**.

### 3. Manual Slot Testing

User can drag across the calendar (e.g. *June 10 – June 24*). The engine evaluates:

- technical pressure
- commercial exposure
- campaign overlap
- resource conflicts

**Result:** Landing Risk: Moderate

---

## DSL Input System

The tool uses a simple DSL to describe market conditions. Users paste DSL text into an editor.

**Example:**

```yaml
country: DE

resources:
  labs:
    capacity: 5

  teams:
    pos_team:
      size: 4
      sme_depth: 2

bau:
  weekly_promo_cycle:
    day: Tue
    labs: 2
    support_days: 2

  integration_tests:
    frequency: weekly
    day: Thu
    labs: 1

campaigns:
  - name: summer_menu
    start: 2026-06-10
    duration: 14
    impact: high

  - name: christmas_menu
    start: 2026-12-01
    duration: 21
    impact: very_high

holidays:
  auto_public: true
  auto_school: true

trading:
  weekly_pattern:
    Mon: medium
    Tue: medium
    Wed: medium
    Thu: high
    Fri: high
    Sat: very_high
    Sun: medium
```

The DSL must support:

- multiple BAU activities
- multiple campaigns
- lab resources
- staffing / SME depth
- holidays
- trading patterns

### DSL Design Principles

1. Human readable
2. Minimal syntax
3. 1 line = one real-world event
4. Engine derives risk internally

**Example edit:** Changing `start: 2026-06-12` should immediately update the calendar.

---

## Engine Behaviour

Engine generates a rolling calendar (≈ 5 quarters). For each date it calculates:

- `lab_pressure`
- `store_pressure`
- `campaign_flag`
- `holiday_flag`
- `risk_score`

**Example row:**

```yaml
date: 2026-06-14
tech_pressure: 0.6
store_pressure: 0.7
campaign_active: true
risk_score: 0.82
```

---

## Risk Calculation

**Example simplified formula:**

```
risk_score =
  (tech_pressure × 0.6)
  + (store_pressure × 0.3)
  + (campaign_risk × 0.1)
```

Where:

- `tech_pressure` = lab load + team load
- `store_pressure` = trading intensity
- `campaign_risk` = campaign impact

---

## Architecture

This should run entirely **client-side**.

- React + TypeScript
- Plotly heatmaps
- YAML DSL parser
- local storage persistence

No backend required.

---

## UI Layout

```
+------------------------------------+
| Country Selector                   |
| View Mode Radio Buttons            |
+------------------------------------+

+---------------+--------------------+
| DSL Editor    | Calendar Heatmap   |
|               |                    |
| paste config  | visual risk map    |
| apply changes |                    |
+---------------+--------------------+
```

---

## Local Storage

The system stores:

**DSL configuration**

- `localStorage["atc_dsl"]`

**UI state**

- selected country
- view mode
- filters
- scenarios

---

## Scenario System

Users can save multiple states. Examples:

- Baseline
- Germany Pilot June
- Germany Pilot July
- Christmas Stress Test

Stored locally as JSON.

---

## Key Design Principle

The tool is **not** a project manager. It is a **system capacity radar**.

It visualises:

- technical pressure
- commercial exposure
- organisational risk

and helps answer: **Where can change safely land?**

---

## Future Extensions

Potential enhancements:

- multi-country comparisons
- initiative templates
- automatic holiday imports
- scenario sharing
- AI-assisted DSL generation

---

## Expected Outcome

The tool should allow leadership to quickly see:

- which markets are overloaded
- which periods are risky
- which windows are safe for pilots

without reading complex project plans.

---

*Optional: A tight Cursor prompt (~100 lines) can be produced to generate the full React + DSL parser + heatmap engine scaffold automatically.*
