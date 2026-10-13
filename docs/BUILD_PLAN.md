# Netopology: Build Plan

> Status: **Draft v0.1**. Order of work, what each step produces, and how we know it is done.

## Progress

| Step | State | Output |
|------|-------|--------|
| A1 Data model | ✅ drafted, tested on PostgreSQL 18.6 (awaiting review) | [data-model.md](design/data-model.md), [schema.dbml](design/schema.dbml), [migrations](../apps/core/db/migrations/), [scenarios.sql](../apps/core/db/tests/scenarios.sql) |
| A2 Permissions | ✅ drafted (awaiting review) | [permissions.md](design/permissions.md) |
| A3 API contract | ✅ drafted: 65 operations, all mapped to permission keys (awaiting review) | [openapi.yaml](api/openapi.yaml), view with Scalar via [index.html](api/index.html) |
| A4 UI design | ⏳ next | |

## How we build

1. **Design the foundation up front, design everything else just in time.** The data model, permissions and API shape touch every feature, so we design them first. The plugin protocol, workflow engine and marketplace are designed only when we reach them, because we will know much more by then.
2. **Spec before code, but small specs.** Each step produces a short document or schema in `docs/` that we agree on, then we build against it.
3. **Vertical slices after the foundation.** From Phase C onward, each feature is built end to end (DB → API → backend → UI → tests → docs) so there is always something that works and can be shown.
4. **Every step has a "done when".** No step is finished until its check passes.
5. **Useful at every milestone.** The map is valuable even before plugins exist, so users get value early.

## Overview

```
Phase A  Design        A1 Data model → A2 Permissions → A3 API contract → A4 UI design
Phase B  Foundation    B1 Scaffold & CI → B2 Backend core → B3 Frontend core
Phase C  Slices        C1 Map → C2 Health, sharing → C3 Plugins → C4 Workflows → C5 Custom UI → C6 Export → C7 Ecosystem
```

| Milestone | After | You can... |
|-----------|-------|------------|
| **M1: Alive** | B3 | Log in, create a workspace, invite members with roles |
| **M2: A useful map** | C2 | Draw your network with multiple canvases, notes, areas; share read-only links. No plugins needed. |
| **M3: Control** | C3 | A node talks to a real tool (Cloudflare): live health, run an action |
| **M4: Automation (the demo)** | C4 | Run "add domain" across Cloudflare + Nginx Proxy Manager from one workflow, with a full run log |
| **M5: Complete v1** | C6 | Custom panels, iframes, and workspace export/import |

---

## Phase A: Design

Mostly documents, schemas and mockups. Little or no application code. A4 can run in parallel with A1-A3.

### A1. Domain model & database schema
- **Produces:** `docs/design/data-model.md` (entity diagram + field list), the first PostgreSQL migration (`0001_init.sql`), RLS policies for `workspace_id`.
- **Covers:** users, workspaces, members, nodes, links, areas, notes, canvases, placements, share links, audit log, (stubs for plugins, workflows, runs).
- **Decide here:** how areas nest, how a node's "sensitive" fields are marked, how links reference nodes on different canvases, ID and timestamp rules.
- **Done when:** the migration applies cleanly to an empty Postgres, and we can hand-write the SQL for 5 real scenarios (create workspace, add node, place on two canvases, nest area, view as guest).

### A2. Permission model
- **Produces:** `docs/design/permissions.md`: a table of **role × action × resource**, plus the redaction rules per role.
- **Why separate:** security bugs come from vague permissions. A written table becomes the test matrix.
- **Done when:** every endpoint planned in A3 maps to exactly one row, and the cases "guest never sees sensitive info" and "cross-workspace access returns 404" are written as test cases.

### A3. API contract (first slice only)
- **Produces:** an OpenAPI draft (or Huma route definitions) for auth, workspaces, members, inventory, canvases, placements, notes, share links, and the SSE event stream. Conventions as in [CONVENTIONS.md](CONVENTIONS.md) §3.3.
- **Not yet:** plugins, workflows, export. Those come with their slices.
- **Done when:** the spec passes a linter, the TS client generates, and the UI team (you) can mock every screen's data from it.

### A4. UI design
- **Produces:** low-fidelity wireframes of the key screens (shell and navigation, canvas editor, inventory list, node detail panel, members and roles, share dialog, login/first run); the design tokens file; a component inventory (what is shadcn as-is vs custom: node shapes, link styles, status badge).
- **Tooling:** quick HTML prototypes or Figma; whichever is faster for you.
- **Done when:** the canvas screen, node panel and role-aware states (viewer, guest, hidden sensitive info) are drawn and you are happy with the look.

---

## Phase B: Foundation

### B1. Scaffold & CI
- **Produces:** monorepo layout, `Taskfile.yml`, `docker compose up` bringing up `db`, `api`, `web` (and nginx) with a hello-world path through all of them, linting, formatting, a CI pipeline, `LICENSE`, `CONTRIBUTING.md`, root `CLAUDE.md` pointing to the conventions.
- **Done when:** a fresh clone runs with one command, and CI is green on an empty change.

### B2. Backend core
- **Produces:** config, migrations runner, auth (accounts, sessions, argon2id), workspaces, members and roles, the authorization layer (service-level), audit log, the generated OpenAPI, and the permission-matrix tests from A2.
- **Done when:** the role matrix tests pass, including cross-workspace denial, and an API client can log in and manage a workspace.

### B3. Frontend core
- **Produces:** theme and tokens (dark default, light), app shell and navigation, generated API client, login and first-run, workspace switcher, members and roles screen, error and empty states.
- **Done when:** milestone **M1** works through the UI.

---

## Phase C: Vertical slices

Each slice follows the same recipe: **short design note → DB/API change → backend → UI → tests → docs**.

### C1. The map
- Inventory CRUD (nodes, links, areas), canvases and placements, the React Flow canvas with category shapes and link styles, notes, multiple canvases per workspace, protected items, "remove from canvas" vs "delete from inventory".
- **Done when:** you can model your real home network on three canvases and reload it unchanged.

### C2. Health display, sensitive info, sharing
- Manual health status, area roll-up, sensitive-field marking with per-role redaction, guest share links (password, expiry, revoke).
- **Done when:** the role test matrix passes for viewer and guest on a real canvas, and a share link works in a private browser window.
- **Milestone M2.**

### C3. Plugins
- **Design note first:** manifest spec, JSON-RPC protocol, credential handling, sandbox lifecycle.
- Sandbox container, Node plugin host, TS SDK, plugin install per workspace, health checks and actions, declarative panels, first plugin: **Cloudflare**; then **Nginx Proxy Manager** and a DNS plugin.
- **Done when:** a Cloudflare node on your canvas shows live health and can run an action; credentials are never readable back; a deliberately misbehaving plugin cannot reach the database.
- **Milestone M3.**

### C4. Workflows
- **Design note first:** `ctx` API, triggers, run log schema, rollback contract.
- Script editor, manual and cron triggers (webhook and state-change next), worker execution in the sandbox, run history with per-step input/output, test-step and dry run, optional rollback.
- **Done when:** your real "add domain" workflow runs across Cloudflare, DNS and NPM and a forced failure in step 2 leaves a readable log.
- **Milestone M4.**

### C5. Custom UI
- User-defined side panels, iframe embeds with a blocked-embedding fallback, node-attached panels.

### C6. Export / import
- `.netopology` bundle, backup and template modes, redaction option, import preview.
- **Milestone M5.**

### C7. Ecosystem
- Python plugin host and SDK, git-based plugin registry, signing and verification, plugin authoring guide.

---

## Out of scope for v1 (parked)
Automatic device discovery, rules engine, SSO/OIDC, TOTP, mobile layout, multi-sandbox pools, hosted/cloud version.

## Working rhythm
- One step at a time. For each: we agree on the short spec, you review, I implement in small commits, we check the "done when".
- Decisions that change a rule go in `docs/adr/`.
- If a step reveals the earlier design is wrong, we fix the doc first, then the code.

## Suggested next move
Start **A1: the data model**. Everything else depends on it, and it is cheap to change on paper but expensive once code exists. A4 (UI wireframes) can run beside it whenever you want to see the look sooner.
