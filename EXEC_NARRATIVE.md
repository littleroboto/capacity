# Market Capacity Surface — executive pitch

**For executives:** read **§ The pitch** only (~90 seconds). Everything below the second `---` is **optional** — for product owners, PMO, and people building decks.

**Opportunity in one line:** An **enterprise-grade** surface **global leadership** could **use regularly** already exists — **invented internally**, on **personal time** and **self-funded**, on a **cross-cutting** problem the business would **typically only crack** with a **multi-million** programme, vendor build, or consulting engagement.

**Related:** [NORTHSTAR.md](./NORTHSTAR.md) (strategy), [RISK_MODEL_DESIGN.md](./RISK_MODEL_DESIGN.md) (how the risk model works — stacking, calibration, data sources), [docs/PRODUCT_BASELINE.md](./docs/PRODUCT_BASELINE.md) (what ships), [docs/VP-CAPACITY-RUNWAY-ONE-PAGER.md](./docs/VP-CAPACITY-RUNWAY-ONE-PAGER.md) (PMO depth).

---

## The pitch

**Core read** — **§ One line** through **§ Ask** (~90 seconds). **§ Dependencies & degree of difficulty** — optional (~45 seconds) if leadership wants **technology honesty** and **what was actually hard**.

### One line

**We join how the business runs with where capacity is used, and show one risk map everyone can read** — same calendar for global, centre, and markets; **local resourcing on the page**, not three decks reconciled after the meeting.

### Why it matters

- **Much of the org is a black box** — how tech, ops, and markets **really** spend capacity is **opaque** across silos. This **closes that gap**: **one inspectable surface** for **what’s running**, **what it costs in capacity**, and **how risk stacks** — not tribal knowledge or decks.
- Today, **roadmaps, campaigns, and “how busy are we?”** still sit in **different places**; portfolio tools often **lose the room**. We **optimise in slices** and **pay for it in meetings**.
- **Biggest market ≠ tightest capacity** (activity volume is not the same as **headroom** — people, **labs**, timing). Everyone sees **one picture** instead of **assumptions**.

### What it is

- A **visual layer**: per market, **what capacity exists**, **what draws it down**, and **how risk fits together** on the calendar — **built to be understood in the room**, AGM to offsite to weekly planning.
- **Global Tech** can use the same surface to show **how we model risk**, **how we understand the operating business** (not tech in isolation), and **what that means** for **transformation timing**, **programme load**, and **overall investment in the platform** — **inspectable**, not only architecture slides.
- **Not** your PPM or finance system of record — the **picture on top** that **executives and markets** can actually **use**.

### Dependencies & degree of difficulty (optional)

- **What it depends on:** **Per-market scenario data** (structured truth: capacity, what consumes it, campaigns, holidays, national breaks, projects), a **pipeline** that turns that into **day-by-day** signals, **lenses** (technology, restaurant ops, deployment risk), **compare runway** when several countries are on screen, plus **auth** and **shared workspace** when the team maintains **one** living scenario — see [docs/PRODUCT_BASELINE.md](./docs/PRODUCT_BASELINE.md) for what runs today.
- **Coding and visuals:** A **credible web app** — runway, heatmaps, **animations** and **per-lens filters** that **layer factors in** so the picture **explains itself** — is **real engineering**, but **well-trodden** technology. **Not** the hardest class of software problem.
- **What *is* hard:** **Stitching** all of that into a **manageable joined-up capacity view** — one **coherent** object that **markets** and **global** can **read the same way**, with **semantics** that survive **compare** and **don’t lie** when **local resourcing** differs. That is **product and modelling discipline**, not just **lines of code** — and it is **where much of the value** sits.
- **Market ↔ global:** That **single inspectable stitch** is what **addresses** a lot of **centre–market tension**: fewer **“you don’t understand how thin we are”** / **“head office is forcing dates”** collisions when **the same capacity story** is on the wall.

### Ask

- **Pilot** in **one** recurring forum; **name owners** for scenario inputs; **iterate**.

### Origin & offer (leadership / S&P / Global Tech)

The **opportunity** is unusual: something that **presents** as a **serious enterprise system** — the kind **global leadership** might **open every week** — is **already here**. It was **invented inside the company**, built in **someone’s own time**, **paid for out of pocket**, to tackle a **cross-cutting** gap (capacity, risk, calendar reality across markets) that **silos and tools don’t join**. Problems that **span** commercial, ops, and tech this way **normally** get addressed only after **large spend** — **multi-million**-class **programmes**, **vendor** platforms, or **consulting** — and still often **miss** the **inspectable, comparable** picture this provides.

Taking it to **leadership** is **“here is the working thing.”** If **Strategy & Planning (S&P)**, **Global Tech**, or another owner wants to **use it**, **pilot it**, or **co-develop** it, **discovery is not on the company tab** — you are **choosing adoption and scale**, not **paying to learn whether the idea is possible**. *(Running it as a **production capability** still needs **owners**, **data**, and **engineering** — the leverage is **no greenfield invention** or **seven-figure guess** to **get to a demo**.)*

**Closer:** *We don’t replace how we govern investments — we replace part of the black box with one honest map of capacity and risk so pilots, timing, and trade-offs aren’t argued from memory.*

---

## Appendix — narrative detail, forums, town hall

*Skip this section in exec read-ins; use it when you need texture, examples, or slide copy.*

### Through-line (full)

We **join the dots** of **how the business actually runs** — campaigns, BAU, tech and ops change, trading rhythm, holidays, corporate moments — and show **where** that activity **draws down on capacity** (people, labs, time). That directly addresses a chronic gap: **large parts of the organisation are a black box** to each other; this makes **load, envelope, and calendar context legible** without everyone working inside the same tool. From the same underlying truth we build an **overall risk map**: a **cohesive picture** that **connects the points that matter** so **anyone in the room** can orient, ask sensible questions, and align on **what to do about a given week or market**.

### What this is (product description)

**Market Capacity Surface** is the **visual expression**: **DSL / scenario tunable per market** (same language, local parameters); explicit **capacity**, **consumers** (BAU, **campaigns** each with an **admin weight** — e.g. flagship **`1.0`** vs lighter promo **`0.7`** — change, training, lab/switch overhead where modeled), and **context for risk** (trading, holidays, deployment norms, key dates). **Colour mapping** (transfer curves, γ, bands) **per lens**, but **shared across markets** in **compare** view so **relative colour** is **comparable** country-to-country. **Runway and heatmaps**; lenses (e.g. technology headroom, restaurant intensity, deployment-risk guidance) **wire the dots** into **one story**, not a scattered dashboard. **Each lens gets its own filter palette** — the **layers** you might want on screen (e.g. **Restaurant Ops**: campaigns, holidays, **ops deployments** / simultaneous **ops pilots** — markets can run **many** at once, e.g. **UK ~50 concurrent** at a peak) — so you **animate in** what matters for **that** question, not one generic overlay for all.

**Visual quality is core** — engaging, self-explanatory; portfolio UIs are built for admins; this is built for **people in chairs**.

### Where it shows up

- **National tech / market** — **AGM-scale screen**: risk posture, **in flight**, inspectable model vs stale deck.
- **Global Leadership** — **Offsite**: **one** cross-market runway, same language vs regional slide tours.
- **Global Tech leadership** — Forums where **platform and transformation** are decided: show **risk modeling** (deployment lens, capacity context), **business understanding** encoded in the scenario (campaigns, trading, holidays, ops change), and the **implication** for **when and where** big tech bets land — **headroom**, **lab envelope**, **sequencing** — as inputs to **investment** and **roadmap** narrative.
- **Markets** — **Proximity to capacity** from **declared assumptions**, not a one-off consulting narrative reverse-engineered from interviews.

### Why planning changes (before / after)

**Before:** Fragmented tools; **PPM fatigue**; pilot calls from **anecdote**. **After:** One **named, inspectable** model per market; pressure **traces to inputs**; trade-offs **visible across markets**.

### Global markets and the centre

**Markets ↔ centre** with **structure**. **US** often has **disproportionate test/lab and programme support** vs other markets; **volume-first** stories **misread strain**. **Belgium-on-one-FTE**-style contrasts **belong on the page**. **Investment** (people, **lab lanes**, **switch/rebuild** overhead) can be **as important as dates**. **Germany national programme example:** **headcount ≠ lab count**; **parallel dummy-store configs**, **BAU-reserved lanes**, **~half a day** order of magnitude **per lab switch** when **rebuilding** between configuration types.

### What we are not replacing

**Not** enterprise PPM, financial planning, or official registers — those stay **authoritative**. We add **alignment and visualisation** for **when and where** pressure builds; **pilot** and **resourcing** arguments **grounded in the same view**.

### Pilot market identification

**Headroom** vs commercial intensity; **same semantics**, different **local parameters**; **under-resourced ≠ unpilotable**; **what-if** on dates/load; transparent **why this market / window**, not a magic score.

---

### Town hall — minimal deck (5 slides)

1. **Title — Join the dots** — One map: **how we run**, **where capacity goes**, **risk**; **anyone** can follow; global + local on one frame. Optional line: **Hackathon-built, working demo** — **S&P / leadership** can **pilot or co-develop** without **starting from a blank page**.
2. **Problem** — **Black box org**: capacity and work **opaque** across silos; sliced planning; **largest ≠ tightest**.
3. **What we’re introducing** — Runway: **capacity + consumers + calendar**; **readable in the room**.
4. **Not replacing PPM** — **Picture layer**; holds attention; faster **pilot / programme** conversations.
5. **Ask** — One forum, owners, feedback.

*Demo carries lenses (tech / restaurants / deployment risk) and drill-down — don’t over-bullet.*

### Town hall — extra slides (if needed)

**Optional — forums:** AGM / offsite / markets; **credibility** vs consulting-invented busy charts.

**Three lenses:** Technology Teams, Restaurant Ops, Deployment Risk — **one scenario**, honest labels.

**Leadership value:** Pilots, cross-market comparison, **resourcing** (including **labs + switching**); optional **Germany** lab story. **Global Tech angle:** **risk model** + **business read-through** → **transformation** and **platform investment** story.

**Good looks like:** Inspectable model, contributor drill-down, time on **trade-offs** not **reconciling decks**.

**Extended CTA:** Name markets, owners, one governance forum, ruthless prioritisation on feedback.
