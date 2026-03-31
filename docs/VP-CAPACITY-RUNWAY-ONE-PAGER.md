# Capacity runway: from operating reality to demand signal

**Context:** This document describes a **concept prototype** intended for conversation with **Segment PMO**—teams who continually judge **which markets suit tech pilots**, early rollout (**market 0**), or similar gated entry. The idea is to bring **operational thinking** (how a market actually runs week to week) into **planning and portfolio decisions**, **at scale across global markets**, instead of relying only on qualitative opinion or single-market detail.

We are **always looking for new ways to understand activities across the enterprise**—what is actually happening, where it stacks up in time, and how it competes for the same capacity. A tool like this **could** help **break away from slideware**: fewer static decks that assert load or “busy periods,” more **inspectable models** you can open, change, and reconcile to real calendars and rhythms.

**Audience:** PMO, segment leadership, and architecture stakeholders who need suitability arguments to be **grounded in calendars, rhythm, and capacity**, not only slide narratives.

---

## The idea in one breath

Planning conversations often anchor on **campaigns**—the windows everyone knows as “busy.” That is only part of the picture. **Non-production tech work** also consumes labs, teams, and engineering attention: recurring weekly cadence (promos, tests, BAU), build-up before go-live, and ongoing support after launch. This concept **puts that tech-side load on the same calendar** as the **store and campaign story**, so you can see **when both kinds of pressure stack** instead of optimising for one and discovering the other later.

**Markets are not the same shape.** Headcount, lab capacity, team size, and local calendars differ. The model uses **per-market parameters** so each country can be described **on its own terms** while still sitting in a **comparable** runway view next to others.

---

## What the app does (without the maths)

For each market you describe, in structured form: **how much capacity you have**, **what repeats every week** (tech and store rhythm), **when campaigns run** and how heavy they are, plus **holidays and special periods** where capacity or load shifts. The engine rolls that forward onto a **day-by-day timeline** and shows a **heatmap runway** (weeks as Mon–Sun, months stacked).

You can switch lenses—for example **technology** (how hard you are pushing lab / Market IT / backend capacity) versus **business** (trading rhythm and campaign-related intensity)—so the same dates can be read from **delivery** and **commercial** angles without pretending they are the same thing.

Nothing here is a magic forecast of the future. It is a **transparent “if we believe these assumptions, where does it feel tight?”** view.

---

## Why Segment PMO might care

| Use | Value |
|-----|--------|
| **Pilot / market-0 suitability** | See **when** non-prod tech load and **campaign-style busy periods** overlap, and where there is **headroom**. |
| **Same idea, many markets** | One approach, **parameters per market**—compare without forcing every country into the same template. |
| **Beyond “the campaign deck”** | **Tech BAU and change work** sit **alongside** the periods traditionally associated with campaigns, not in a separate conversation. |
| **Traceability** | Stress on a given week traces back to **what was declared** for that market (resources, patterns, campaigns). |
| **Light what-if** | Change capacity or dates and **see the runway move** before committing a pilot slot. |
| **Beyond slideware** | Assumptions become something you **run and inspect**, not only **present**. |

---

## Closing frame

Segment PMO lives in **suitability and sequencing**: which market can absorb **new** tech change, and **when**. This concept tries to make that conversation **honest about non-prod tech work**, **aligned with how campaigns actually show up on a calendar**, and **fair across markets** that are **resourced and run differently**.

For formulas, DSL fields, and implementation limits, see [`CAPACITY-RUNWAY.md`](./CAPACITY-RUNWAY.md). **Heatmap cells** use **Technology** vs **Business lens metrics** (e.g. tech utilisation vs trading/campaign blend), not the same number as the combined **`risk_score`** shown in tooltips. **Auto holidays** in the prototype are **stub lists** for runway coverage, not statutory truth.

For how YAML maps through the engine (including non-YAML December / AU store seasoning), see [`MARKET_DSL_AND_PIPELINE.md`](./MARKET_DSL_AND_PIPELINE.md).
