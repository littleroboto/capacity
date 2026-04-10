# North star

**Market Capacity Surface becomes the place strategy and planning teams open first when they ask: *where is pressure building, why, and what are we willing to trade?*** Not another siloed planner — the **shared, defensible picture** that executives, portfolio owners, and delivery leads align on before they commit dates, scope, or capacity.

**Much of the organisation operates as a black box** across functions and markets: **who is loaded, with what, and when** stays **invisible** outside local teams. This product **reduces that gap** with an **inspectable** model and visuals everyone can read.

Strategically we **join the dots** of **how the business runs** and **where it draws down on capacity**, then surface an **overall risk map** that **connects the points that matter** into **one cohesive story**. The bar is **enterprise-grade**: credible for **global leadership** to **use regularly**, not a disposable chart — on a **cross-cutting** gap **silos** rarely close together without **multi-million**-class **external** programmes. [EXEC_NARRATIVE.md](EXEC_NARRATIVE.md) carries the **exec pitch**, **internal origin** (personal time, self-funded build), and **leadership / S&P / Global Tech** offer.

The experience should be **beautiful**: calm, legible, and fast to trust. **Visual and interaction design are first-class product work** — not lipstick on a grid. Portfolio tools often **lose the room**; this product **earns attention** with heatmaps, runway, and motion that are **engaging and self-explanatory**, so a new stakeholder can follow a town hall or steering committee **without a separate training deck**. Under the hood we continue to **generate project plans from code** — first **define capacity** for each market, then add **workstreams** with explicit definitions of **how much** capacity they consume and **when** they consume it. The UI makes that model legible; the scenario remains the source of truth.

---

## Domain model (three layers)

We think in three separable ideas, configured **per country / market** where the real world differs. The **DSL** (scenario language: YAML and successors) should stay **flexible and tunable per market** — **shared semantics** for fields and pipeline meaning, **local parameters** for capacity, campaigns, calendars, and workstreams so we never force every country into one rigid template.

1. **Capacity** — How much tech and operations capacity exists (and how holidays and school breaks **reduce** what is available or change the operating context). For **technology**, treat **headcount** and **lab envelope** as **separate** dimensions: people time is not the same as **parallel lab lanes** or **configuration-switch** overhead (see below).
2. **Consumers of capacity** — Everything that **loads** those teams and store operations: recurring BAU, campaigns, technology change, training and admin, and ops-led programmes that behave like projects.
3. **Risk (hybrid)** — A view that **layers** capacity pressure with the **trading and cultural environment**: how busy stores are, flagship moments, corporate calendar peaks, resourcing quirks, and deployment-window norms. Risk **informs** choices; it does not pretend to be a second copy of the same signal unless we name that overlap.

### What consumes capacity

| Kind | Role in the model |
|------|-------------------|
| **BAU / operational loads** | Steady weekly work tech and operations always carry. |
| **Campaigns** | Promotional pressure on stores **plus** the follow-on load in testing, tech support, and troubleshooting. Each campaign has an **admin-set weight** (intensity vs a baseline) so **big** and **small** promos are not treated the same — see below. |
| **Tech projects** | Short, bounded efforts (patching bursts, cutover weekends, cloud deployments) **or** long-running / continuous work (hardware refresh, network upgrades, programmes that span years or never “finish”). |
| **Training & admin** | Structured time away from delivery and, where relevant, pull on restaurant crews or support. |

Ops-led **estate-wide training or process-change programmes** are modeled as **projects** (owned by operations) when they change how restaurants run or absorb managerial attention — not as a vague overlay.

### Campaign weighting (not every promo is “full size”)

**Campaigns differ in real impact** — estate stretch, marketing noise, digital load, crew attention — even when they all sit on the calendar. Each campaign should carry a **scalar weight** (e.g. **`1.0`** = baseline **full-scale** flagship, **`0.7`** = a **lighter** programme) so admins can **differentiate** without inventing fake dates or duplicate entries. Illustrative names only: **Monopoly**-scale might be **`x1.0`**; **Cardz**-scale might be **`x0.7`** — actual values are **market judgment**, encoded explicitly.

That weight **scales** how the campaign **feeds** the model wherever campaigns matter: **store-pressure**, **tech / test follow-on**, **planning blend**, **deployment-risk** overlays — **consistently**, so the heatmap reflects **“how big is this promo?”** not binary on/off. **Attribution** stays clear: the campaign is **one object**; the weight is **its intensity knob**.

### What reduces or reshapes available capacity

- **National holidays** — Corporate closure patterns, restaurant trading shifts.
- **School holidays** — Staffing and demand effects that differ from national holidays.
- **National break windows (about four to six weeks)** — Some markets have a **recognisable national pause** when **much of the corporate and professional population** is on leave or running at **reduced intensity** — a **sustained band** on the calendar, not only single statutory days. **Examples:** **France** — **August**; **Scandinavia** — **June**-centred patterns (country-specific). **Authoring capability (per market):** admins must be able to define the effect **how the market actually behaves** — either **week-by-week** **percentage** capacity (or envelope) inside the range, **or** a **single contiguous block** with **one flat %** for the whole span. Same **calendar object family** as **public holidays** (named **from–to**), but **graded** impact on **effective** corporate/tech capacity instead of **binary** on/off only. **Store or trading** stays **separate** if already modeled. **Compare** markets without **flattening** different national shapes.
- **Holiday clustering and bridging (e.g. May)** — In **many European, Commonwealth, and similar** markets, **May** is often **thick with public holidays**. There is a **widely recognised** pattern: people **bridge** statutory days with **annual leave** — turning **one** public holiday into **several** consecutive days off, or using **a handful** of leave days to create **much longer** breaks (**four** days of leave → **nine or ten** calendar days away is a familiar shape). That **compresses effective corporate and tech availability** beyond what **holiday dates alone** imply, and makes **May** a **fragile** month for **delivery and approvals** in those countries. Model **effective** capacity and **risk** **per market**; if store-trading or other YAML already reflects some of this, **split attribution** so we **do not double-count**.

**Quiet calendar ≠ quiet capacity.** A month can **look** **sparse** on **official** holidays while **effective headroom** is **tight** because **bridging** and **overlapping** absences **empty** approval chains, labs, and programme offices. **Top-down** mandates to **force change** into a market **in that window** may still be **doable**, but leadership **must** **account for risk** in the model and in the conversation — not treat **green cells** on a **holiday-only** view as **all-clear**.

**Leave is constrained, so bridging is rational.** A **weak or impatient** leader may say *we pay people to do a job*; at the same time, organisations **restrict when** people can take time off. Packing leave around **statutory clusters** is **natural** and **efficient** — it is **not** the problem; **unmodeled absence** is. The product should make **effective availability** **visible** so judgment is **informed**, not **moralised**.

**Coordinated vs diffuse absence (predictability).** In **some European** markets, norms (and sometimes **policy**) **encourage many people off at once** — **highly predictable** spikes every year; **everyone knows** the shape of **thin** weeks; **risk is deliberately steered away** from those blocks; **efficient** in the sense of **shared expectations**. In **other** markets — much **US / UK** corporate pattern is a useful contrast — **thinning** is often **less synchronized**: over a **roughly six-to-eight-week** spring band, **who** is out **when** is **harder to read** from the calendar; **corporate** depth can **dip** **without** one obvious **national** block. **Per market**, capture **clustered** vs **diffuse** **absence risk** (parameters, not a universal May template).

These belong in the **capacity / calendar truth** for each market so we do not smuggle them twice into unrelated knobs.

### Lab and configuration envelope (headcount ≠ lab count)

**Technology capacity** must **separate**:

- **Headcount** — people available to run tests, analysis, cutovers, and support.
- **Lab count / lab envelope** — how many **physical or logical lab lanes** you have, how many **distinct store configurations** you can hold **at once**, and how much is **reserved for BAU**.

National programmes are often gated by **lab topology**: dummy stores, lanes, device / POS mixes, and slots **already consumed by BAU** even when no projects are “using” the lab for change.

**More test cycles than labs (sequencing and switching):** You can run **more** configuration types over time than you have **parallel** labs by **rebuilding or reconfiguring** a lane between cycles — but **each switch** (tear down, rebuild, re-image, re-cable, or equivalent) **consumes** capacity. In planning terms that **switching tax** is often on the order of **half a day per change of configuration** on a lane (tune per market); it must **bite from available tech capacity** so we do not pretend **parallel** throughput when work is actually **serialized** with **rebuild overhead**.

**Field example:** running a **national tech programme in Germany**, the constraint was often **not headcount** but **lab configuration count** — on the order of **five** dummy-store environments, **two** of which were effectively **standing capacity for BAU** (still needed if we shipped **no** projects and upgraded **nothing**). Of the remainder, **one** might be a **full digital setup** for mobile-heavy testing; others **partial** fidelity. **Throughput** tracks **parallel configurations**, **which workstreams need which lane**, and **how often** you must **switch** a lane — not the org chart alone.

The product direction is to make **headcount, lab lanes, and switch overhead** **explicit** in the scenario so centres do not misread a **lab-saturated** or **switch-heavy** plan as **“just add headcount.”**

### Deployment risk: what we mean

Deployment risk is **guidance for sound planning**, not a hard block on the calendar. It should accumulate factors such as:

- Deploying into **heavy trading** or **flagship campaigns** (higher blast radius).
- **Financial year end** — tolerance for mishap shrinks as Q4 progresses; risk ramps accordingly.
- **High-stakes corporate calendar** — e.g. the week before a **national franchisee AGM**, where visible failure would embarrass execs on stage.
- **Weekly trading rhythm** — **Friday / Saturday** as peak trading days; mistakes hurt more. Each country needs a configurable **baseline rhythm** (week-on-week pattern, **payday shape** within the month, **month-to-month** seasonality such as weather). We treat **incremental** effects carefully: e.g. **December** in many Western markets combines campaigns, gifting, party season, and holiday mechanics — some of which are already captured elsewhere; the **residual** vs baseline must be **attributed once**, not double-counted.
- **Window norms** — e.g. **Sunday night → Monday** and **Friday → Saturday** often carry **resource-availability** risk; many programmes prefer **Monday night → Tuesday** and avoid Friday → Saturday for that reason.
- **Spring holiday clusters** — Especially where **May** stacks **public holidays** and **bridging leave** thins teams (see **capacity** section above), **cutovers and governance** can be **riskier** than a naive calendar suggests — including when the **official** diary **looks quiet** but **effective capacity** is not.
- **Multi-week national leave bands** — e.g. **August (France)**, **June (Scandinavia)** — **prolonged** **depression** of **effective** corporate/tech capacity; **per-market** definition as **weekly %** or **one block at a set %** (see **capacity** section); **deployment and programme** risk differs from **short** holiday spikes.
- **Diffuse corporate absence** — Where leave is **staggered** across **weeks** rather than **one national spike**, **risk** may be **lower per day** but **harder to see**; **deployment and support** still need **explicit** treatment **per market**.
- **Ops training / change programmes** — When the estate is learning new processes under directive, deployment and support risk rise even when the “project” is ops-owned.

**Attribution rule:** Every effect in the model should have **one primary home** (capacity load, store-pressure signal, or risk overlay). If two places touch the same real-world phenomenon, we **document the split** (e.g. campaign YAML vs seasonal residual) so heatmaps stay **auditable**.

---

## Global markets and the centre

The product is a **communication channel** between **local markets** and **global or segment leadership**: a shared, inspectable way to say *this is how much capacity we have, this is what is eating it, this is how the year feels* — without relying on email threads or implicit hierarchy.

Centres often **assume** how busy **global tech and ops** are, or treat the **largest market (commonly the US) as the default “busiest”** in every dimension. **Volume of work and capacity pressure are not the same thing.** One market may run the **most** of a given programme (e.g. **POS rollouts**) with a **large Restaurant Technology** or market-IT bench; another may run **fewer** events but with **one part-time** equivalent — and be **proportionally tighter** or **risk-saturated**. When the centre plans in **headline activity** or **“who has the most stores”** only, it can **misread** where the real constraint is.

A **common asymmetry** (to model explicitly, not hand-wave): the **US** is often **best resourced** for **test equipment** and **teams that support programmes needing test / lab coverage** — **proportional headcount** and **lab depth** typically **do not match** in **other markets**. The centre can **over-index** on “who runs the most change” and **under-index** on **who has the envelope to absorb it**. Declared **capacity** and **consumers** per market make that gap **visible** instead of implicit.

Per-market **capacity** plus **consumers** makes **supply and demand explicit** so global decisions (pilots, sequencing, expectations) **respect local resourcing**, not stereotypes.

There is also a **forward-looking argument** the model supports: some markets **could** take **more pilots**, **move faster**, or **absorb more change** **if** they were **better resourced** — **people**, **test equipment**, **more or richer lab configurations** (additional dummy-store lanes, full-stack vs partial tracks), **lower lab switch / rebuild overhead** (tooling, automation, spare lanes so you switch less often), and **programme support**. Tight heatmaps are not always “they are the wrong place to try things” — they can mean **“we have not given this market the envelope to run at the pace we ask.”** The centre can use the same picture for **investment and staffing trade-offs**, not only **calendar sequencing**.

---

## Lenses (what each view must communicate)

### Per-lens filters (what to layer in)

**Each lens has its own filter palette** — the **broad factors** you can **toggle, layer, and animate** on the visualisation — because different audiences care about **different overlays** from the **same** underlying scenario. A filter that makes sense on **Restaurant Ops** may be **noise or misleading** as a default on **Technology Teams**, and vice versa. The UI should expose **only layers that honestly feed** that lens’s metric or narrative (and **label** what each layer is).

Illustrative filter families (exact sets evolve with the product):

- **Technology Teams** — e.g. **BAU / operational tech load**, **tech projects** (by type or programme), **campaign-driven** engineering and test load where modeled, **lab lane / switch** consumption, **holidays** that affect delivery windows — tuned to **who is consuming the tech envelope**, not store trading for its own sake unless it **pulls** tech.
- **Restaurant Ops** — e.g. **campaigns**, **national and school holidays**, **trading rhythm** (payday shape, peak days), and **operations-led change in the restaurants**: **ops deployments**, process pilots, crew-facing programmes — the kind of **simultaneous ops pilots** that can stack in one market (real-world example: **UK on the order of fifty concurrent ops pilots** at a heavy point). Those layers **belong** here so leaders can separate **commercial heat** from **ops change** eating attention in the estate.
- **Deployment Risk** — e.g. **capacity pressure**, **heavy trading**, **flagship campaigns**, **FY / corporate calendar**, **deployment window norms**, **ops training / change** when it raises cutover risk — whatever the model treats as **risk drivers** for that lens, **toggleable** so planners see **which assumptions dominate** the guidance.

### Lens intent (headline)

- **Technology Teams** — Make **consumption of capacity** obvious: how much of the tech/ops envelope is committed and to what kinds of work — including **people** vs **lab lanes** and, where modeled, **configuration-switch** cost.
- **Restaurant Ops** — Reflect **how busy stores are** and **operational change** that pulls crew, managers, or field attention — **campaigns and holidays** plus **ops-originated** programmes and deployments, **filterable** so the picture is not a single undifferentiated “red.”
- **Deployment Risk** — Combine **capacity constraints** with **trading environment**, cultural peaks, resourcing, campaigns, and key corporate dates. The lens **steers** planners toward safer windows; it does not replace human judgment with fake precision.

Planning blends and banding may still **summarise** multiple signals for copy and triage; they remain **labeled** as composites, not confused with the lens-specific paint (see [docs/PRODUCT_BASELINE.md](docs/PRODUCT_BASELINE.md)).

---

## Exploration: seeing *why* the heatmap feels that way

Users should be able to use **that lens’s filters** to **toggle and layer** the factors that **actually feed** it, **animate** them in smoothly, and **drill down** to the largest contributors to the current cell or week. The goal is forensic clarity: *this week reads “hot” mostly because of X, with Y and Z behind it* — without conflating unrelated drivers or **reusing one global filter bar** where the lenses mean different things.

---

## DSL flexibility vs colour mapping (compare semantics)

**Two layers** — **scenario** vs **how we paint it** — must not be confused:

- **Scenario (DSL)** — **Tunable by market**. Each market’s file encodes **its** capacity, consumers, holidays, rhythms, campaign weights, and projects with **the same structural language** but **different numbers and dates**. Flexibility lives here; comparability comes from **shared definitions**, not identical copies.

- **Colour mapping and adjustment functions** (transfer curves, γ, banded vs smooth spectrum, palette anchors, etc.) — **Independent per lens**. **Technology Teams**, **Restaurant Ops**, and **Deployment Risk** each read **different metrics** with **different meanings of “hot”**; their **visual tuning** should be **separate** so adjusting contrast for one lens does not **warp** another.

- **Global across markets for a given lens** — In **multi-market / compare runway** views, the **same lens** must use **one shared colour mapping** across **all market columns** on screen. **Relative colour** should **mean the same thing** in column A as column B (e.g. a given hue band = **similar relative position on that lens’s metric** across countries), so leaders are not misled by **per-market** display tweaks that break **side-by-side** reading. Single-market focus modes can still emphasise **detail** and **tooltips**; the **compare visual contract** is **global-per-lens**.

How much of this is **persisted in team workspace vs device** may evolve; what ships today for heatmap and view settings is summarised in [docs/PRODUCT_BASELINE.md](docs/PRODUCT_BASELINE.md). This section states **direction**: **per-market DSL**, **per-lens colour physics**, **cross-market consistency** when comparing.

---

## When work consumes capacity (scheduling truth)

Many initiatives **do not** consume capacity uniformly across the calendar. Example: a **POS rollout** may pull people **only on night windows** **Monday → Tuesday → Wednesday → Thursday**, and not on **Friday / Saturday / Sunday** trading peaks. The product needs a **quick, explicit way to declare consumption windows** (days of week, time bands, phases) so authors do not overstate load or imply false weekend work.

---

## The bar: first-class enterprise

**Indispensable** means teams would rather cancel a meeting than run it without this view. **Enterprise-grade** means the product earns that habit through:

- **Trust** — Numbers and labels mean one thing everywhere; changes are traceable; conflicts are explicit, not silent.
- **Governance** — Who can see what, who can change the scenario, and how org boundaries apply are first-class, not bolted on.
- **Longevity** — Scenarios survive people and laptops: durable workspace, sensible history, and recovery paths that fit how real planning cycles work.
- **Clarity at a glance** — The runway answers “how bad is this week for us?” without a training course; depth is available when specialists need it.
- **Visual craft** — Colour, layout, animation, and drill-down are tuned so the picture **reads immediately** and **explains itself** under scrutiny; we invest accordingly.

Technical detail of what ships today lives in [docs/PRODUCT_BASELINE.md](docs/PRODUCT_BASELINE.md). Epics and sequencing live in [docs/BACKLOG_EPICS.md](docs/BACKLOG_EPICS.md). **How the store-trading risk model works** — layer composition, calibration against real QSR footfall data, and the attribution design that prevents double-counting — lives in [RISK_MODEL_DESIGN.md](RISK_MODEL_DESIGN.md). A **short exec pitch** (read-first), optional appendix (detail, forums, town hall), and **leadership framing** (enterprise-credible surface, **internal self-funded** origin, **S&P / Global Tech** adopt or co-develop, vs **multi-million** external path) live in [EXEC_NARRATIVE.md](EXEC_NARRATIVE.md). This file is **intent and direction**, not a spec.

---

## What we will not dilute

- **One explicit model of reality** — Time-based truth stays in the scenario (YAML and successors); the UI interprets and compares, it does not fork hidden state.
- **Comparable markets** — Same semantics across regions so portfolio and central teams can reason in one language — while **preserving** different **team sizes** and **loads** so we never confuse **biggest programme** with **tightest capacity**. In **compare** views, **colour for each lens** stays **globally meaningful** across columns, not **per-market** display drift.
- **Honest separation of concerns** — Store rhythm, technology headroom, and deployment fragility stay distinguishable; blended “planning” views are labeled as such, not confused with the underlying signals.

---

## Outcomes that signal we are winning

Planning and strategy workflows **anchor** on this surface: roadmaps, cut lines, and “can we take this?” conversations reference the same runway and definitions. Teams **reuse** scenarios across quarters instead of rebuilding spreadsheets. New stakeholders **understand** the heatmap within minutes because the product explains itself in context. **Markets and the centre** stop arguing from **assumed busyness** and start from **declared capacity and work** — including cases where the **largest market is not the most constrained**. **National tech** and **global leadership** can **credibly show** risk and **in-flight** work on **plenary screens** (e.g. **AGM**, **offsite**) from the **same inspectable model**; **Global Tech** can anchor **how risk is modeled**, **how the business is understood** in the scenario, and **what that implies** for **transformations** and **platform investment**; **markets** see **proximity to capacity** without **one-off consulting narratives** invented from the outside. Procurement and security **clear** the product because identity, data handling, and audit expectations are met without heroic exceptions.

---

## How we steer day to day

Prioritize work that **reduces coordination tax** (fewer reconciliations, fewer “which file is truth?” moments) and **increases confidence** (clear authorship, versioning, org-scoped workspace). Treat **visual and interaction quality** as essential: clarity, intuitive lenses, smooth exploration of contributors — the things that keep **executives and operators oriented** where dense PPM UIs do not. Defer **decorative** flourishes that do not improve comprehension or trust. When trade-offs appear, choose the path that makes the product **harder to live without** for the people who own capacity, risk, and calendar — not merely nicer for a single power user.
