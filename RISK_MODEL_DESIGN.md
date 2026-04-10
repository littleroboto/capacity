# How the risk model works — store trading, campaigns, and calendar context

**Audience:** Technology leadership, Strategy & Planning, and anyone who wants to know *why the heatmap says what it says* — not just what it shows. This document explains **how the store-trading pressure signal is constructed**, **what data underpins it**, and **why the design avoids the double-counting problems** that plague most planning models.

**Related:** [EXEC_NARRATIVE.md](./EXEC_NARRATIVE.md) (pitch), [NORTHSTAR.md](./NORTHSTAR.md) (strategy), [docs/MARKET_DSL_AND_PIPELINE.md](./docs/MARKET_DSL_AND_PIPELINE.md) (technical DSL reference).

---

## The problem with most planning models

Most capacity and risk models treat the business environment as a **single number** — "how busy are we?" — or ignore it entirely. This leads to two failure modes:

1. **Under-specified:** The model has no sense of trading intensity, so it treats a quiet January Monday the same as a peak-campaign Saturday in December. Leadership cannot see *why* a week is risky.
2. **Over-specified and double-counted:** The model tries to capture everything but stacks effects naively — holidays boost a "risk score" that already includes holiday-driven trading, campaigns add on top of a monthly curve that already assumed campaigns were running, seasonal patterns fight with explicit monthly values. The number looks precise but is actually **inflated and unauditable**.

We solve this by decomposing store pressure into **explicit, separable layers** with clear attribution. Each layer has one job, and they compose multiplicatively with documented stacking order.

---

## The composed signal

Store trading pressure — the signal that feeds the **Restaurant Activity** lens and contributes to **Deployment Risk** — is not a single authored number. It is assembled from **six layers**, applied in a fixed order:

```
store_pressure =

    weekly_pattern[day_of_week]                          ① Base rhythm
  × monthly_pattern[month]                               ② Seasonal envelope
  × seasonalTradingFactor(peak_month, amplitude)         ③ Gentle annual cosine
  × applyDecemberRestaurantSeasoning(date)               ④ Engine: Christmas retail
  × paydayMonthMultiplier(day_of_month)                  ⑤ Early-month pay cycle
  × (1 + campaign_store_boost × campaign_effect_scale)   ⑥ Live campaign uplift
```

Each layer is intentionally narrow. When a cell on the runway looks "hot," a stakeholder can trace **which layers contributed** and whether the heat comes from the natural trading environment, a specific campaign, or both.

### ① Weekly pattern — the shape of each week

Every market has a day-of-week trading rhythm. This is **the most granular** layer and the foundation everything else multiplies.

**What it captures:** The relative busyness of each weekday. Saturday is typically the peak QSR day globally; Monday is the quietest.

**Why it varies by market:** Sunday trading laws and cultural norms create **large** differences. Germany, Switzerland, and Poland have strict Sunday rest laws (*Sonntagsruhe*) — most retail closes, QSR footfall drops sharply (Sunday at **55%** of Saturday). The Netherlands and UK are relaxed (Sunday at **75%**). Australia's weekend brunch culture keeps Sunday strong (**82%**). France has a unique Wednesday boost because schools are traditionally off Wednesday afternoons — families eat out with children.

**Data basis:** ONS UK consumer card spending data (Jan 2019 – Jun 2024) confirms QSR sectors have higher average weekend spend vs weekdays. Meaningful Vision daypart analysis shows Saturday is universally the peak volume day for fast food across UK, France, Germany, and Ireland. Google Maps "Popular Times" aggregates corroborate per-country patterns.

### ② Monthly pattern — the annual envelope

Twelve explicit values (Jan–Dec) describe the **natural footfall shape** of the year — the curve you would observe if no campaign were running and no special engine adjustments applied.

**What it captures:** The underlying demand cycle driven by weather, school holidays, disposable income rhythms, and cultural eating patterns.

**Critical design choice:** December is set **below the peak** (typically 0.82 in northern hemisphere markets) even though December feels busy. This is because the engine adds a separate December retail boost (layer ④) and campaigns (layer ⑥) contribute independently. If December were set to 1.0 *and* the engine added +22% *and* a festive campaign added +34%, the model would triple-count the Christmas effect.

**Data basis:** McDonald's global quarterly SEC filings (2023) show Q3 revenue ($6.69B) exceeds Q4 ($6.41B) — **summer is the QSR peak, not Christmas**. Meaningful Vision UK footfall data confirms January is the deepest trough (~15% below December), April-May are the strongest months, and September is the weakest after February. The monthly values approximate these observed ratios while accounting for the fact that other layers (④, ⑥) will lift December and campaign periods separately.

### ③ Seasonal cosine — gentle smoothing

A simple cosine wave centered on `peak_month` with a small `amplitude` (typically 0.04) provides smooth modulation between the discrete monthly steps.

**Why it exists:** With only 12 monthly values, the transition between months is a hard step. A subtle cosine softens the weekly view without materially changing the monthly totals. The amplitude is kept very small (4%) specifically because the monthly pattern already captures the full annual shape — a larger amplitude would double-count.

### ④ December retail seasoning — engine-applied, not YAML

Every market receives a **hardcoded** Christmas retail ramp: +22% building from December 1 through Christmas Eve, with a floor of 0.78 through month-end. This is in `weighting.ts`, not in market YAML.

**Why it is separate from monthly_pattern:** The Christmas retail effect is a **universal QSR phenomenon** in all markets where the model operates — shopping footfall drives store visits. Making it engine-level ensures it is never accidentally omitted from a market file, and it compounds cleanly with market-specific monthly values rather than being baked into them.

**Why a floor:** Without the floor, low-YAML trading days in late December (e.g., Christmas Day, when stores are closed or reduced) would print "cool" tiles in the middle of what should visually read as a consistently pressured month. The floor keeps December a coherent visual band on the runway.

**Australia exception:** `applyAustraliaPostChristmasSummerLift` adds a small further bump through January for the southern hemisphere summer.

### ⑤ Payday month multiplier — the early-month pay cycle

A shape function (plateau then fade) adds up to +15–20% on store pressure in the first week of each month, decaying to 1× by day 21.

**What it captures:** The well-documented consumer spending spike after payday. In the UK, ~60% of employees are paid monthly (usually last working day of the month or the 28th), leading to an early-month QSR uplift. Similar patterns exist across European markets with monthly pay norms.

**Why it is capped:** The multiplier ceiling is +20% on the YAML-normalised store rhythm. This prevents the pay-cycle effect from dominating the signal — it should be a visible but modest ripple, not a distortion.

### ⑥ Campaign live uplift — the promotional layer

When a campaign is live, store pressure increases by `campaign_store_boost_live × campaign_effect_scale`. This is the mechanism that separates **natural trading** from **campaign-driven trading**.

**Why this matters for calibration:** McDonald's UK Q4 2025 reported 8.5% like-for-like sales growth, driven explicitly by campaign innovation (Grinch tie-in, festive menu). That uplift belongs in *this* layer — the campaign boost — not in the monthly pattern, which should represent the baseline without promotions. If December's monthly value already includes the festive campaign effect, and then a campaign is modeled on top, the model double-counts.

**campaign_effect_scale (1.2):** This per-market scalar amplifies campaign impact. At 1.2 with `campaign_store_boost_live: 0.28`, a live campaign adds +34% on base trading. This is consistent with observed promotional lifts. An earlier value of 2.5 produced +70% — almost certainly too aggressive for a typical promo.

---

## How the layers compose — a worked example

### France, mid-December Friday, festive campaign live

| Layer | Value | Running product | Source |
|-------|-------|-----------------|--------|
| ① weekly Fri | 0.95 | 0.95 | YAML: Sat is peak, Fri slightly below |
| ② monthly Dec | 0.82 | 0.779 | YAML: engine adds Dec seasoning separately |
| ③ seasonal (peak=Jul, amp=0.04) | 0.965 | 0.752 | Cosine: winter is off-peak |
| ④ Dec seasoning (day 15) | 1.127 | 0.847 | Engine: +22% Christmas ramp (smoothstep) |
| ⑤ payday (mid-month) | ~1.0 | 0.847 | No early-month boost |
| ⑥ campaign live (0.28 × 1.2) | +34% | **1.13** | Festive campaign adds on clean base |

Compare with **July Friday, no campaign:** layers ①–⑤ produce **1.0** (summer peak baseline). The model correctly shows December-with-campaign (1.13) above July baseline but not absurdly so — and the *source of the heat* is traceable: mostly campaign (⑥), with the underlying December trading (②+④) at roughly 85% of summer.

### France, January Monday, no campaign

| Layer | Value | Running product |
|-------|-------|-----------------|
| ① weekly Mon | 0.65 | 0.65 |
| ② monthly Jan | 0.72 | 0.468 |
| ③ seasonal | 0.96 | 0.449 |
| ④ Dec seasoning | 1.0 (not Dec) | 0.449 |
| ⑤ payday (early Jan) | ~1.15 | 0.516 |
| ⑥ no campaign | 1.0 | **0.52** |

January Monday is roughly half of summer peak — consistent with Meaningful Vision's observation that January is the deepest QSR trough.

---

## Country-specific tuning — not generic, not arbitrary

The model does not use one curve for all markets. Each market's parameters reflect its **actual operating environment**:

### Monthly trading shape

| Market group | Key difference | Data source |
|---|---|---|
| Northern hemisphere (UK, FR, DE, etc.) | Summer (Jul) peak, Dec ~0.82, Jan ~0.72 | MV footfall; MCD quarterly revenue |
| Southern hemisphere (AU) | Inverted: Jan peak, Jul trough, Dec 0.88 | Southern summer + engine Dec lift |
| Mediterranean (IT) | Aug deeply depressed (0.68) — Ferragosto | Italian factory shutdown culture |
| Iberian (ES) | Aug lower (0.82) but tourism partially compensates | Spanish summer holiday pattern |
| Germanic (DE) | Aug higher (0.90) — staggered Länder holidays | No single national shutdown week |

### Weekly trading shape — Sunday as the key differentiator

| Sunday factor | Markets | Why |
|---|---|---|
| **0.55** | DE, CH, PL | Strict Sunday rest laws. Most retail closed. |
| **0.58** | AT | Austrian Sunday, marginally more relaxed. |
| **0.60** | SL | Austrian-influenced. Sunday is family day. |
| **0.62** | IT | Sacred Sunday family lunch cooked at home. |
| **0.68** | SK, BE, UA | Moderate tradition. |
| **0.70** | PT | Slightly traditional. |
| **0.72** | FR, CZ, ES | Moderate — shops close, QSR stays open. |
| **0.75** | NL, UK | Sunday trading relaxed in practice. |
| **0.78** | CA | North American pattern. |
| **0.82** | AU | Weekend brunch culture. Sunday trading normal. |

**France Wednesday (0.80):** France is the only market with a mid-week boost. French schools are traditionally off Wednesday afternoons ("le mercredi des enfants"), driving family QSR visits.

---

## What this means for risk

The store-pressure signal feeds two of the three runway lenses:

- **Restaurant Activity** — The heatmap directly paints `store_pressure`. When a cell is hot, the stacking chain above is the explanation. Leaders can trace whether the heat comes from natural trading rhythm, a specific campaign, or compounding effects.
- **Deployment Risk** — Store pressure is one of several factors (alongside capacity utilisation, holidays, calendar fragility, and corporate moments). Deploying into a **peak trading** period raises risk because the blast radius of failure is higher and the reputational cost is greater. The deployment risk lens combines this with tech headroom to say: *this week is fragile because stores are busy AND the team is loaded*.

The **Technology Teams** lens is deliberately **not** driven by store pressure. It shows capacity headroom from phase loads, BAU, and lab utilisation — the tech supply side. Store trading does not directly consume tech capacity (unless a campaign's load includes tech dimensions); it creates *context for risk*.

---

## The attribution rule

Every effect in the model has **one primary home**. If a real-world phenomenon could be captured in two places — e.g., "December is busy" could live in both the monthly pattern and the campaign — we split attribution explicitly:

- **Monthly pattern (②)** captures the *natural footfall envelope* — the shape without any campaigns
- **December seasoning (④)** captures the *universal Christmas retail boost* — shopping footfall
- **Campaigns (⑥)** capture *specific promotional uplift* — festive menus, tie-ins, launches

When all three fire in the same week, the model shows *why* December is intense — and each contributor is independently inspectable in the tooltip. Remove the campaign and the heat drops; remove December seasoning and it drops further. **The layers do not lie to each other.**

---

## Calibration integrity

The parameters in this model are approximations, not precise forecasts. But they are **informed approximations**:

- **Meaningful Vision** — UK QSR footfall tracker covering 60,000+ outlets. Provides monthly, weekly, and daypart traffic patterns. Industry gold standard for QSR competitive intelligence in UK, France, Germany, and Ireland.
- **McDonald's Corporation SEC filings** — Quarterly revenue and comparable sales by segment (2023–2025). Confirms global seasonality: Q3 > Q4, summer beats Christmas.
- **McDonald's UK financial results** — Annual turnover and like-for-like sales by quarter. Q4 2025 reported 8.5% LFL growth attributed specifically to campaign innovation, not baseline traffic.
- **ONS consumer card spending** — UK face-to-face card spending by merchant category, day-of-week, and time-of-day (Jan 2019 – Jun 2024). Confirms weekend > weekday for QSR.
- **Meaningful Vision daypart analysis** — Cross-country comparison of UK, France, Germany, Ireland QSR traffic by time of day. Confirms France's evening-heavy pattern (20% of traffic 6-9pm vs 14% UK).
- **Legislative sources** — German Ladenschlussgesetz, Polish Sunday trading restrictions (progressive ban since 2018), French school calendar (Wednesday half-day tradition).

The model is designed so that **when better data arrives** — per-store POS data, loyalty programme analytics, proprietary footfall feeds — it **replaces** the relevant layer cleanly without restructuring the pipeline. The architecture separates *the shape of the question* from *the precision of the answer*.

---

## Summary

The store-trading risk model is not a single "busyness score." It is a **composed, layered signal** where each layer has a clear role, a documented data basis, and a deliberate design to avoid double-counting. The layers are:

1. **Weekly rhythm** — country-specific, driven by Sunday trading laws and cultural norms
2. **Monthly envelope** — the natural annual demand curve, calibrated against QSR footfall data
3. **Seasonal smoothing** — subtle cosine, kept small to avoid competing with explicit monthly values
4. **December retail seasoning** — engine-level Christmas boost, separate from monthly values and campaigns
5. **Pay-cycle lift** — early-month consumer spending spike
6. **Campaign uplift** — promotional effects, attributed to specific campaigns with author-set intensity weights

The system is designed so that **every cell on the runway can be decomposed** into its contributing factors, and **no effect is counted twice**. When leadership asks "why is this week red?" the answer traces to named layers with documented calibration — not a black box.
