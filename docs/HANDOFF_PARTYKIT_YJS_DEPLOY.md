# Handoff: PartyKit + Yjs + y-monaco (for humans and LLM agents)

This file is the **deployment and mental-model map** for real-time DSL collab. Read it before debugging “connection check” or websocket errors.

## 1. Do not merge two different backends

| Piece | What it is | How it ships |
|--------|------------|----------------|
| **`GET /api/shared-dsl`** | HTTP workspace YAML (Vercel Blob, Clerk JWT) | **Vercel** only — Git push / dashboard deploy |
| **PartyKit room** (`party/collab.ts`) | WebSocket sync for **Yjs** via **`y-partykit`** | **PartyKit** only — **`pnpm party:deploy`** (or `npx partykit deploy`). **Not** deployed when you push to GitHub for Vercel. |
| **`y-monaco`** | npm package: binds **Monaco** ↔ **`Y.Text`** in the browser | **No separate host**. It ships inside the Vite bundle when collab is enabled at build time. |

If **Connection check** reports **`shared_dsl_*` or HTTP 500 on GET**, that is **Vercel `/api/shared-dsl`**, not PartyKit. Fix Vercel function logs, env, and redeploy there.

If the **editor shows collab UI** but **websocket closes** (e.g. `4401`, `4403`), that is **PartyKit** auth or room rules — fix PartyKit env and redeploy the PartyKit project.

## 2. Two deploy commands (both matter for full collab)

1. **App + HTTP API (Vercel)**  
   - Connect repo → production deploy on push (or manual `vercel deploy --prod`).  
   - See root [README.md](../README.md) for Blob, Clerk, and `VITE_SHARED_DSL`.

2. **Collab server (PartyKit)**  
   - From repo root (where `partykit.json` lives):

   ```bash
   pnpm party:deploy
   ```

   - First-time / new machine: log in with PartyKit CLI as their docs describe.

PartyKit project name in this repo defaults to **`capacity-collab`** ([`partykit.json`](../partykit.json)); production host shape is typically **`capacity-collab.<account>.partykit.dev`** (no `https://` in `VITE_PARTYKIT_HOST`).

## 3. Environment variables: three surfaces

**Vite (`VITE_*`)** — must be set on **Vercel** for the right environment (**Production**), then **redeploy**. Vite inlines them at build time; `.env.local` on a laptop does not affect the live site.

| Variable | Where | Role |
|----------|--------|------|
| `VITE_COLLAB_ENABLED` | Vercel (build) | Turn on collab UI + `y-monaco` path |
| `VITE_PARTYKIT_HOST` | Vercel (build) | Host **only** (e.g. `capacity-collab.user.partykit.dev`) — **no** scheme |
| `VITE_COLLAB_WORKSPACE_KEY` | Vercel (build) | Room namespace; must match for users sharing a room |
| `VITE_SHARED_DSL`, `VITE_CLERK_*`, … | Vercel (build) | Shared workspace + auth (see README / [AUTH_PROVIDER.md](./AUTH_PROVIDER.md)) |

**Vercel server (non-`VITE_*`)** — `CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `CAPACITY_*` for `/api/shared-dsl`. These **do not** automatically exist on PartyKit.

**PartyKit server** — `party/collab.ts` reads **`process.env`**, especially:

- **`CLERK_SECRET_KEY`** — **required**; without it the server closes connections (`4401` / `server_misconfigured`).
- **`CAPACITY_CLERK_AUTHORIZED_PARTIES`** — optional but recommended in production (comma-separated origins); align with Vercel.
- **`CAPACITY_ALLOWED_USER_EMAILS`** — optional; align with Vercel + client `VITE_ALLOWED_USER_EMAILS`.
- **`CAPACITY_ORG_ADMIN_ROLES`** — optional; align with Vercel if you use org admin semantics.

Set PartyKit secrets using their CLI (persistent) or per-deploy flow; see official guide: [Managing environment variables](https://docs.partykit.io/guides/managing-environment-variables). Typical pattern:

```bash
npx partykit env add CLERK_SECRET_KEY
# repeat for other keys as needed
pnpm party:deploy
```

Use the **same Clerk application** (e.g. production `sk_live_…` on PartyKit when the SPA uses production `pk_live_…`) so session JWTs verify on both Vercel and PartyKit.

## 4. Order of operations (recommended first-time)

1. Vercel: Blob + Clerk + `VITE_SHARED_DSL=1`; confirm **GET `/api/shared-dsl`** works (Connection check).
2. PartyKit: `pnpm party:deploy`; note the **`*.partykit.dev`** host.
3. PartyKit: add **`CLERK_SECRET_KEY`** (and optional `CAPACITY_*` parity); **`pnpm party:deploy`** again so vars apply.
4. Vercel: set **`VITE_COLLAB_ENABLED=1`** and **`VITE_PARTYKIT_HOST=<host-only>`**; **redeploy** the frontend.

## 5. Code map (for agents changing behaviour)

| Area | Path |
|------|------|
| PartyKit server entry | [`party/collab.ts`](../party/collab.ts) |
| Room id parsing (must stay in sync) | [`party/collabRoomId.ts`](../party/collabRoomId.ts), [`src/lib/collab/roomId.ts`](../src/lib/collab/roomId.ts) |
| Client provider + Y.Doc / rooms | [`src/lib/collab/collabSessionContext.tsx`](../src/lib/collab/collabSessionContext.tsx) |
| Monaco ↔ Yjs | [`src/components/DslEditorCore.tsx`](../src/components/DslEditorCore.tsx) (`y-monaco`) |
| Feature flags | [`src/lib/collab/collabBuildFlags.ts`](../src/lib/collab/collabBuildFlags.ts) |
| Product / ACL design | [`docs/superpowers/specs/2026-04-06-partykit-yjs-collaborative-dsl-design.md`](./superpowers/specs/2026-04-06-partykit-yjs-collaborative-dsl-design.md) |
| Epic index | [`docs/BACKLOG_EPICS.md`](./BACKLOG_EPICS.md) (`epic-partykit-yjs`) |

## 6. If “deploy fixed nothing” on shared-dsl

- Confirm **prebuild** runs `bundle-shared-dsl` on Vercel and `api/_shared-dsl.runtime.cjs` exists in the build output (see [`api/shared-dsl.js`](../api/shared-dsl.js)).
- In Vercel: **Redeploy** with **clear build cache** if the function still throws module errors.
- Read **Vercel → Functions → `/api/shared-dsl` → logs** for the exact stack line.

## 7. Official references (Yjs stack)

- PartyKit: [Deploy your PartyKit server](https://docs.partykit.io/guides/deploying-your-partykit-server), [Managing environment variables](https://docs.partykit.io/guides/managing-environment-variables), [partykit.json](https://docs.partykit.io/reference/partykit-configuration).
- Packages in this repo: `partykit`, `y-partykit`, `yjs`, `y-monaco` — versions in [`package.json`](../package.json).
