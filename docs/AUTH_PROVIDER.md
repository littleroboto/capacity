# Authentication provider — Capacity workbench

**Provider:** [Clerk](https://clerk.com) (`@clerk/react` in the SPA, `@clerk/backend` `verifyToken` on Vercel serverless).

**Why Clerk here:** Vite SPA + Vercel Functions without a separate BFF; organizations and roles map to viewer / editor / admin; SAML is available on Clerk enterprise plans when customers need it.

## End-to-end flow

1. User signs in via Clerk (optional gate when `VITE_CLERK_PUBLISHABLE_KEY` is set; bypass with `VITE_AUTH_DISABLED=1`).
2. The client registers `useAuth().getToken()` for `/api/shared-dsl` (`ClerkSharedDslBridge`, `sharedDslSync.ts`).
3. When `CLERK_SECRET_KEY` is set on the server, **GET/HEAD** require a valid session JWT; **PUT** requires JWT (and passes role / ACL checks) or, unless disabled, the legacy `CAPACITY_SHARED_DSL_SECRET`.

## Environment variables (short matrix)

| Variable | Build / server | Role |
|----------|----------------|------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Vite build | Clerk frontend |
| `CLERK_SECRET_KEY` | Vercel server only | JWT verification |
| `CAPACITY_CLERK_AUTHORIZED_PARTIES` | Server | Optional comma-separated origins for `verifyToken` |
| `VITE_SHARED_DSL` | Vite | `1` enables cloud workspace client |
| `CAPACITY_CLERK_DSL_WRITE_ROLES` / `VITE_CLERK_DSL_WRITE_ROLES` | Server / Vite | Optional allow list for which **org membership roles** may PUT |
| `CAPACITY_ORG_ADMIN_ROLES` / `VITE_CAPACITY_ORG_ADMIN_ROLES` | Server / Vite | Org roles treated as workspace admin |
| `CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE` | Server | When `1` and Clerk is on, PUT rejects legacy shared secret |
| `CAPACITY_SHARED_DSL_SECRET` | Server | Legacy write secret (reads never use this when Clerk protects GET) |
| `VITE_ALLOWED_USER_EMAILS` / `CAPACITY_ALLOWED_USER_EMAILS` | Build / server / PartyKit | Optional comma-separated allowlist of **primary** sign-in emails. When unset, any signed-in Clerk user is allowed (subject to other rules). |

**Clerk production vs development:** Use **`pk_live_…`** and **`sk_live_…`** from your Clerk **production** application in Vercel (not `pk_test_…`). The hosted build shows an amber banner while `pk_test_…` is baked in.

**Email allowlist:** Set the same comma-separated addresses in **`VITE_ALLOWED_USER_EMAILS`** (client gate), **`CAPACITY_ALLOWED_USER_EMAILS`** (Vercel `/api/shared-dsl`), and **`CAPACITY_ALLOWED_USER_EMAILS`** on **PartyKit** if you use collab. The session JWT must include the user’s email, for example in Clerk → **Sessions** → **Customize session token** add to the JSON claims:

```json
"email": "{{user.primary_email_address}}"
```

Without that claim, the server cannot verify the allowlist and will return **403**.

Details and migration notes: [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md).

## Session token claims (workspace ACL)

Configure under Clerk → **Sessions** → **Customize session token**. When **none** of the `cap_*` claims below are present, behaviour matches older deployments: full manifest, edits allowed (subject to org write-role list if configured).

| Claim | Type | Meaning |
|-------|------|---------|
| `cap_admin` | boolean | Full markets + edit |
| `cap_segs` | string | Comma segment codes (`LIOM`, `IOM`, …) from `public/data/segments.json` |
| `cap_mkts` | string | Optional comma manifest market ids; **narrows** `cap_segs` when both are set; alone, defines allowed markets |
| `cap_ed` | boolean | May edit YAML for allowed markets (PUT merges scoped docs into the team blob) |

**Ops pattern:** store source fields in Clerk **user or org `public_metadata`**, map them into claims with templates (same as comments in `src/lib/capacityAccess.ts`).

**LIOM / IOM org hierarchy (segment vs market teams):** step-by-step metadata + JWT examples in [CLERK_CAPACITY_ORG_SETUP.md](./CLERK_CAPACITY_ORG_SETUP.md).

## Code map

| Piece | Location |
|-------|----------|
| Sign-in gate | `src/components/SignInGate.tsx`, `src/main.tsx` |
| Token + ACL bridge | `src/components/ClerkSharedDslBridge.tsx` |
| Client ACL helpers | `src/lib/capacityAccess.ts`, `src/lib/capacityAccessContext.tsx` |
| Cloud sync | `src/lib/sharedDslSync.ts` |
| API + Blob | `api/shared-dsl.ts` |
| Server JWT + legacy bearer | `api/lib/clerkAuthSharedDsl.ts` |
| Server YAML filter / merge | `api/lib/capacityWorkspaceAcl.ts` |

## Still open (backlog)

Per-org Blob paths, SSO/SCIM runbooks for customers, automated role × market test matrix — see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) (`epic-auth-org`, `epic-market-acl`).
