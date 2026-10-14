# Netopology: Architecture & Conventions

> Status: **Draft v0.2**. 🟡 = proposal awaiting confirmation. Once confirmed, this file is the rulebook; a PR that breaks a rule must either fix the code or change this file.

**Confirmed so far:** **Dify-like look**: light default (dark available), soft gray canvas, white floating panels, **blue accent**, gray card nodes whose category is shown by shape and border; **floating layout** (no fixed header or footer); **glossary approved** (Canvas, Link, Area, Node, Workflow...). The stack, folder layout and code rules below are still 🟡 until you say otherwise. (An earlier dark/teal/dense direction was replaced after review.)

## 1. Glossary (one word per concept)

Most confusion comes from two names for one thing. **Use these words in code, DB, API, UI and docs. Do not use the "avoid" words.**

| Use | Avoid | Meaning |
|-----|-------|---------|
| **Workspace** | project, network, environment | Top-level isolated environment (one network). |
| **Inventory** | database, registry | The shared set of records in a workspace. |
| **Node** | device, machine, host, block | Any thing in the inventory (router, VM, service, NAS, cloud). |
| **Link** | wire, connection, edge, cable | Relationship between two nodes. |
| **Area** | zone, group, region | Nestable container of nodes (site, LAN, VLAN). |
| **Note** | comment, memo | Markdown attached to a node/link/area/canvas. |
| **Canvas** | map, diagram, board, view | A drawn view over the inventory. |
| **Placement** | position, instance | A record saying "node X appears on canvas C at (x,y) with style S". |
| **Plugin** | extension, integration, addon | Installable package adding node types, actions, panels. |
| **Action** | function, command, tool | A callable operation exposed by a plugin (`dns.addRecord`). |
| **Panel** | widget, block, tab | A UI view for a node/workspace (declarative or iframe). |
| **Workflow** | automation, job, script (as a noun) | User-written script + triggers. |
| **Run** | execution, job | One execution of a workflow or action, with logs. |
| **Member / Role** | user (when meaning "in a workspace") | A user's role in one workspace. |
| **Sensitive** vs **Credential** | secret (ambiguous) | Hideable info vs. write-only stored secret (see IDEA §7.1). |

User-facing text may say "map" casually in marketing, but code says `canvas`.

## 2. Repository layout

The **frontend lives at the repository root** (a Next.js app). The **backend is a separate Git repository**, included as a submodule.

```
app/              Next.js App Router routes (thin: compose features)
components/ui/    primitives (Radix-based, restyled with tokens)
components/       app-wide shared components (StatusIcon, NodeIcon, ...)
features/         feature folders: canvas/, inventory/, members/, monitor/, command/, auth/, share/
lib/              api client (generated types), query client, utils
mocks/            MSW mock API (seed data) used until the backend is ready
styles/           tokens.css (design tokens), globals
scripts/          dev scripts (check-contrast.py, ...)
public/           static files (incl. MSW worker)
backend/          git submodule: Go api + worker + db migrations + the API contract (Netopology-Backend repo)
deploy/           nginx gateway config for the full stack
docs/             IDEA, CONVENTIONS, design/, api/index.html (Scalar viewer for the contract)
compose.yaml      the full stack: gateway, web, api, worker, db
```

- Package manager: **pnpm**. Commands: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm gen:api`.
- `lib/api/schema.d.ts` is **generated** from `backend/api/contract.yaml` (`pnpm gen:api`) and never edited by hand.
- The backend repo owns the API contract (`backend/api/contract.yaml`) and the database migrations (`backend/db/`).

## 3. Backend (Go) rules

### 3.1 Structure: feature packages, strict layers

The full, current layout and the reasons behind it are in `backend/docs/ARCHITECTURE.md`. In short:
```
backend/
  cmd/netopology/        main(): `api` | `worker` | `migrate` | `openapi` (`export` in C6)
  api/contract.yaml      the API contract (hand-written; the Go code must match it)
  internal/
    setup/ auth/ account/ workspace/ member/ inventory/ canvas/ share/ events/ audit/
      handler.go         HTTP layer (Huma): declare the operation, call one service method
      service.go         business rules + AUTHORIZATION
      model.go           wire types, named like the contract schemas
    authz/               permission keys, roles, Actor
    platform/            pg (+ sqlc dbgen), config, logging, crypto, httpx, events, auditlog, ...
  db/
    migrations/          goose, numbered, never edit an applied one
    queries/             .sql files for sqlc (the generated code is the store layer)
```

**Layer rules (reviewers enforce these):**
1. `handler → service → queries`. A handler never touches the DB (lint-enforced). Queries never decide access.
2. **Authorization lives in the service layer**, never in the UI or handler only. Every service method receives an `Actor` (user + role in workspace) and checks it first.
3. **Every query is scoped by `workspace_id`.** No query on workspace-owned tables may omit it; Postgres RLS is the backstop, not the plan.
4. **Redaction (sensitive info) is applied in the service layer** based on the actor's role. Never return sensitive fields and rely on the UI to hide them.
5. Feature packages don't import each other's internals; they depend on small interfaces.

### 3.2 Style
- `context.Context` is the first parameter of anything doing I/O.
- Errors: wrap with `fmt.Errorf("...: %w", err)`; expected failures are `*apperr.Error` (kind + stable code) returned by services; the HTTP status is chosen in one place (`platform/httpx`), never in services.
- Logging: `log/slog`, structured, with `workspace_id` and `request_id`. **Never log credentials, tokens, or request bodies of credential endpoints.**
- Config: environment variables only, parsed once at start into a typed struct. No globals.
- Tests: table-driven unit tests; integration tests through the real HTTP stack against a real Postgres (one throwaway database per test, cloned from a migrated template; no mocking the DB).
- Lint: `golangci-lint` (config committed), `gofmt`/`goimports`.

### 3.3 API conventions
- REST under `/api/v1`, workspace-scoped: `/api/v1/workspaces/{wsId}/canvases/{id}`.
- JSON field names **camelCase**. IDs are **UUIDv7** strings.
- Errors: **RFC 9457 problem+json** with a stable `code` string (`inventory.used_elsewhere`) the UI can switch on.
- Lists: cursor pagination (`?cursor=&limit=`). Never unbounded lists.
- Live updates (health, run logs): **SSE** at `/api/v1/workspaces/{wsId}/events`.
- **Contract first.** `backend/api/contract.yaml` is the source of truth; the Go code registers operations that must match it (a contract test checks paths, ids, permissions, statuses, parameters and schema shapes), and Huma's generated spec is written to `backend/api/openapi.gen.yaml`. The TS client is generated from the contract (`pnpm gen:api`). **Changing an endpoint = change the contract first (reviewed), then Go, then `pnpm gen:api` and fix TS errors.**

### 3.4 Database conventions
- `snake_case`, plural table names (`nodes`, `canvas_placements`), `id uuid` PK, `created_at`/`updated_at timestamptz`.
- Every workspace-owned table has `workspace_id uuid not null` with an index and an RLS policy.
- Use `jsonb` for flexible parts (style, plugin config) but validate against a JSON Schema in the service; **core relationships are real columns and foreign keys**, not JSON.
- Migrations are forward-only in practice; destructive changes need an ADR.

## 4. Frontend (Next.js) rules

### 4.1 Stack 🟡
Next.js App Router, **TypeScript `strict`**, **Tailwind CSS**, **shadcn/ui** (Radix primitives, code lives in our repo), **React Flow** (`@xyflow/react`) for canvases, **TanStack Query** for server state, **Zustand** for purely local UI state (canvas selection, tool mode), **react-hook-form + zod** for forms, `openapi-fetch` + generated types for the API, Monaco for the workflow script editor.

### 4.2 Structure: feature folders
```
(repo root)
  app/                    routes only: thin pages composing features
  features/
    canvas/ inventory/ workflows/ plugins/ members/ workspace/ ...
      components/  hooks/  api/  model/    (api = TanStack Query hooks over the generated client)
  components/ui/          Radix-based primitives (Button, Dialog, ...) restyled by tokens
  components/shared/      app-wide composites (StatusBadge, NodeIcon, ConfirmDialog)
  lib/                    utils, formatters, a11y helpers
  styles/                 tokens.css, globals.css
```

**Rules:**
1. `app/` has **no business logic**; it composes `features/*`.
2. A feature imports from `components/*` and `lib/*`, **never from another feature's internals** (use its `index.ts`).
3. **No fetch calls in components.** Use the feature's `api/` hooks.
4. **No server logic, secrets, or DB access in Next.** All auth and authorization is in Go. The web container is a pure client (server components may render shells only).
5. **Permissions in UI are for convenience only** (hide buttons). The server is the authority.
6. Server state in TanStack Query, **never copied into Zustand**.
7. Files `kebab-case.tsx`; components `PascalCase`; hooks `useThing`; one exported component per file; no default exports except Next route files.
8. No `any`; no `// @ts-ignore` without a linked reason.
9. Lint/format: ESLint (Next config) + Prettier; `tsc --noEmit` in CI.

## 5. UI & visual design system

### 5.1 Principles
1. **Status first.** The product is about "is it up, and where does it break?". Health must be readable at a glance on the canvas and in the Monitor panel.
2. **Calm and light (Dify-like).** Soft gray canvas, white floating panels, generous rounding, subtle shadows. The map is the hero; chrome floats above it.
3. **Never color alone.** Every status has a color **and** an icon.
4. **Nodes are neutral.** All nodes are the same gray card. Category is shown by **shape and border**, health by an icon (and a red border when down). Color is reserved for status, the accent, and area groups.
5. **Text never fights wires.** All node text lives inside the card; wires attach to card edges.
6. **Consistent over clever.** Few components, reused everywhere. Keyboard-accessible (Radix).

### 5.2 Tokens (the only way to use color)
**Rule: components never use raw colors (no hex, no `bg-red-500`). They use the semantic tokens** in [`styles/tokens.css`](../styles/tokens.css). Changing the look = editing that one file. `scripts/check-contrast.py` must pass (WCAG AA for key pairs, both themes).

```
Surfaces :  --bg (canvas)  --surface (panels, cards)  --surface-raised (hover)  --surface-sunken (inputs)  --overlay
Lines    :  --border  --border-strong  --grid-dot  --ring
Text     :  --text  --text-muted  --text-faint  --text-on-accent
Brand    :  --accent  --accent-hover  --accent-subtle          (blue)
Status   :  --status-{healthy,degraded,down,unknown}  (+ -subtle)
Nodes    :  --node-bg  --node-border  --node-border-hover  --node-icon-bg  --node-icon
Links    :  --link-line  --link-line-muted
Areas    :  --area-{yellow,teal,violet,rose,blue,green,gray}  --area-fill-alpha  --area-border-alpha
Notes    :  --note-{default,yellow,teal,violet,rose}  --note-text
Elevation:  --shadow-{xs,sm,lg,xl}
Layout   :  --float-gap  --left-panel-width  --detail-panel-width
```
- **Theme:** light is the default; dark is available; "system" is resolved in JS.
- **Status mapping** (color + icon): healthy = green check circle; degraded = amber triangle; down = red x circle (+ red card border); unknown = gray dashed circle.

### 5.3 Typography, spacing, shape
- Fonts: **Inter** (UI), **JetBrains Mono** (IPs, slugs, ports, code, logs).
- Scale: 11 / 12 / 13 / 14 (base) / 16 / 18 / 24 px. 4 px spacing grid.
- Radius: 8 px controls, 12 px cards, 16 px floating panels. Shadows: xs for cards, lg for floating panels, xl for dialogs.
- Icons: **Lucide**. Motion: 120-200 ms, respects `prefers-reduced-motion`.

### 5.4 Canvas visual language
- **Node card** (all the same gray), sized to its text:
  ```
  ┌─────────────────────────────────┐
  │ [icon]  Title                 ● │   ● = health icon
  │         type                    │
  │─────────────────────────────────│
  │ description                     │
  └─────────────────────────────────┘
  ```
- **Category = shape + border:**

  | Category | Shape | Border |
  |----------|-------|--------|
  | network | elongated hexagon (arrow tips) | solid |
  | compute | square box | double |
  | service | rounded box | solid |
  | storage | rounded box | double |
  | external | cloud | solid |
  | generic | rounded box | dashed |

- **Wires** are smooth curves from the side of one card to the facing side of the other, with small port dots; arrows for directed kinds. Style by kind: physical solid, VPN dashed, proxy route solid + arrow, DNS dependency dotted + arrow, storage mount double line, logical thin light. A down link turns red. Optional label as a small pill at the middle.
- **Area, expanded:** translucent colored box with a header (color dot, name, CIDR, health chip, collapse button). Its nodes sit inside.
- **Area, collapsed:** a card like a node with a colored side stripe and a stacked edge (= "more inside"); "double-click to enter".
- **Outside markers** (inside an area canvas): dashed pill naming the node outside the area; click to go back.
- **States:** hover (darker border + shadow), selected (accent border + soft ring), down (red border), sensitive hidden ("Hidden" chip; guests: omitted).

### 5.5 Layout (floating)
```
┌───────────────┐                                        ┌──────────────────┐ ┌────────┐
│ Home lab ▾  ▣ │                                        │ ☰  👥  ⚡  🧩  ⚙ │ │ Share  │ (AL)
│ ▾ CANVASES    │                                        └──────────────────┘ └────────┘
│   Physical    │                                                ┌──────────────────────┐
│     Remote… │             full-screen CANVAS                 │  Detail panel        │
│   Services    │                                                │  (only when          │
│ ▾ MONITOR     │                                                │   something is       │
│  1 down 1 deg │                                                │   selected)          │
│  Game VM 2 …  │                                                │                      │
│ ● Live        │      ┌ tools │ undo redo │ legend │ − 100% + ⤢ ┐                      │
└───────────────┘      └──────────────────────────────────────────┘└──────────────────────┘
```
- **No fixed header or footer.** Everything floats over a full-screen canvas.
- **Left panel** (foldable sections, whole panel can collapse to a small pill): workspace switcher, **Canvases** (with each area's inner canvas nested under the canvas that shows it), **Monitor** (health counts + "needs attention" list, click to jump; replaces the old status bar), live/saved status.
- **Top right:** floating icon group (Inventory, Members, Workflows, Plugins, Settings), Share button, account avatar. **No search box**: `Ctrl/Cmd+K` opens the command palette (nodes, canvases, actions).
- **Bottom center:** floating toolbar (tools, undo/redo, legend & link visibility, zoom).
- **Right:** detail panel floats in when something is selected; closes with × or Esc.
- **Inventory and Members** open as large floating sheets over the canvas, not as separate pages.

## 6. Workflow & quality rules

- **Git:** trunk-based; short-lived branches `feat/…`, `fix/…`, `docs/…`; **Conventional Commits**; **DCO sign-off** (`git commit -s`); squash-merge PRs.
- **CI must pass:** `task lint`, `task test`, `task gen` produces no diff, `tsc`, `go vet`, `golangci-lint`, migration check, token contrast check, `docker compose build`.
- **Tests:** Go unit + testcontainers integration; Vitest for pure TS logic; Playwright for 3-5 golden paths (login, create workspace, draw nodes, run workflow, role redaction).
- **Security tests are first-class:** a test matrix per role asserting redaction and denial (guest can't see sensitive fields; viewer can't edit; cross-workspace access is 404).
- **ADRs:** any decision that changes a rule here gets a short file in `docs/adr/NNNN-title.md` (context, decision, consequences).
- **Repo guide for AI/contributors:** a root `CLAUDE.md` / `CONTRIBUTING.md` that points to this file and lists the top 10 rules.

## 7. Top 10 rules (the cheat sheet)

1. One word per concept; use the glossary.
2. Handler → service → store. Authorization and redaction live in the service.
3. Every workspace-owned query is scoped by `workspace_id`.
4. UI permission checks are cosmetic; the server decides.
5. Colors only via semantic tokens, never raw palette values.
6. Status = color + icon, never color alone; nodes stay gray (shape and border show category).
7. No fetch in components; use feature `api/` hooks; server state stays in TanStack Query.
8. Generated code is never hand-edited; change the source and run `task gen`.
9. Never log or return credentials; credentials are write-only.
10. Decisions that change a rule get an ADR.
