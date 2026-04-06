# Clerk org layout → workspace access (LIOM / IOM + market teams)

This repo scopes runway and `/api/shared-dsl` using **session JWT claims** (`cap_*`). Clerk’s org tree does **not** apply those rules by itself — you wire **organization `public_metadata`** (and optional **user `public_metadata`**) into the token in **Sessions → Customize session token**.

**Target policy**

| Persona | What they get |
|---------|----------------|
| **Global admin** (you) | All markets, full edit |
| **Segment team** (e.g. IOM org) | All markets in that **segment** (`LIOM` / `IOM` in `public/data/segments.json`) |
| **Market team** (e.g. UK under IOM) | **Only** that manifest market id |
| **Viewers** | Same market scope as above but **no** save (`cap_ed` false, not org admin) |

Constants for metadata keys live in `src/lib/clerkOrgCapacityMetadata.ts`.

---

## 1. Organization `public_metadata`

Use **Dashboard → Organizations → [org] → Public metadata** (JSON).

### Segment org (e.g. “IOM Segment”)

Members should see **every** market in the IOM segment.

```json
{
  "capacity_segment": "IOM",
  "capacity_editor": true
}
```

- Omit **`capacity_market`** (or leave it empty) so the session token does not set a narrowing `cap_mkts` claim.
- Set **`capacity_editor`** to `false` for segment-wide **viewers**.

### Market org (e.g. “UK” under IOM)

Members should see **only** that market. Set **both** segment (parent) and market so the JWT can emit `cap_segs` + `cap_mkts`; the app **intersects** them to a single market.

```json
{
  "capacity_segment": "IOM",
  "capacity_market": "UK",
  "capacity_editor": true
}
```

Use the **manifest** id (same as `public/data/markets/*.yaml` stem, e.g. `UK`, `DE`).

### LIOM

Same pattern with `"capacity_segment": "LIOM"`.

---

## 2. Global admins (user metadata)

For accounts that should **ignore** segment/market orgs and always have full workspace access, set **user** public metadata:

```json
{
  "capacity_admin": true
}
```

Map that to **`cap_admin`** in the session token (see below).

---

## 3. Customize session token (Claims editor)

**Dashboard → Sessions → Customize session token.**

Add claims that map metadata into the keys this app reads (`cap_admin`, `cap_segs`, `cap_mkts`, `cap_ed`). Clerk’s editor offers **shortcodes** for user/org fields; names can vary slightly by dashboard version — pick the tokens that correspond to **active organization public metadata** and **user public metadata**.

**Example shape** (adjust shortcodes to match what your Clerk UI lists):

```json
{
  "cap_admin": "{{user.public_metadata.capacity_admin}}",
  "cap_segs": "{{organization.public_metadata.capacity_segment}}",
  "cap_mkts": "{{organization.public_metadata.capacity_market}}",
  "cap_ed": "{{organization.public_metadata.capacity_editor}}"
}
```

Notes:

- If **`capacity_market`** is empty for a segment org, `cap_mkts` may be empty in the JWT — the app treats that as “no market narrowing,” so **segment-wide** access still works.
- Keep custom claims **small** ([cookie size limits](https://clerk.com/docs/guides/sessions/session-tokens#size-limitations)).
- Official guide: [Customize session token](https://clerk.com/docs/guides/sessions/customize-session-tokens).

---

## 4. Org roles vs `cap_ed`

**`cap_ed`** in the JWT controls **whether YAML for allowed markets may be edited** (and whether PUT is allowed for that user, together with `CAPACITY_CLERK_DSL_WRITE_ROLES`).

You can:

- Drive **`capacity_editor`** from org metadata (simplest), or  
- Use Clerk **roles** in the template if your plan/editor supports expressing role → boolean (then map to `cap_ed`).

---

## 5. Verify in the app

On **`/app`**, open **Workspace → Team scenario**. When Clerk is enabled, the **Workspace access** panel shows **effective** scope from the current session and the active org’s **metadata hints** so you can confirm segment vs market wiring.

---

## 6. TypeScript (optional)

You can extend Clerk’s `CustomJwtSessionClaims` with `cap_admin`, `cap_segs`, `cap_mkts`, `cap_ed` (see `src/vite-env.d.ts` in this repo).

---

## Related

- [AUTH_PROVIDER.md](./AUTH_PROVIDER.md) — env vars and code map  
- [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md) — deeper auth handoff
