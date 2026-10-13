# Netopology: Architecture & Conventions

> Status: **Draft v0.2**. 🟡 = proposal awaiting confirmation. Once confirmed, this file is the rulebook; a PR that breaks a rule must either fix the code or change this file.

**Confirmed so far:** default theme **dark** (light supported); accent **teal/cyan**; look **dense and technical** (Grafana/Portainer-like); **glossary approved** (Canvas, Link, Area, Node, Workflow...). The stack, folder layout and code rules below are still 🟡 until you say otherwise.

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

## 2. Repository layout (monorepo)

```
apps/
  web/            Next.js UI (own container)
  core/           Go module: `api` and `worker` modes, one binary
  sandbox/        Node + Python plugin hosts (own container)
packages/
  schema/         JSON Schemas: plugin manifest, RPC messages, export format  <- source of truth
  api-client/     TS client generated from the Go OpenAPI spec (never hand-edited)
  sdk-ts/         @netopology/plugin-sdk
  sdk-py/         netopology-sdk
plugins/          first-party plugins
deploy/           compose files, nginx.conf, .env.example
docs/             this file, ADRs (docs/adr/), plugin authoring guide
```

- **TypeScript side:** pnpm workspaces. **Go side:** its own `go.mod` in `apps/core`.
- **One entry point for commands:** a root `Taskfile.yml` (`task dev`, `task test`, `task lint`, `task gen`, `task up`). No one has to remember per-language commands.
- **Generated code is committed or reproducible by `task gen` and never edited by hand** (`api-client`, sqlc output).

## 3. Backend (Go) rules

### 3.1 Structure: feature packages, strict layers
```
apps/core/
  cmd/netopology/        main(): `api` | `worker` | `migrate` | `export`
  internal/
    workspace/ inventory/ canvas/ workflow/ plugin/ member/ auth/ audit/ share/
      handler.go         HTTP layer (Huma): parse, call service, map errors
      service.go         business rules + AUTHORIZATION
      store.go           wraps sqlc queries; no business logic
      model.go           domain types
    platform/            db, config, logging, crypto, queue, sandbox client
  db/
    migrations/          goose, numbered, never edit an applied one
    queries/             .sql files for sqlc
```

**Layer rules (reviewers enforce these):**
1. `handler → service → store`. A handler never touches the DB. A store never calls a service.
2. **Authorization lives in the service layer**, never in the UI or handler only. Every service method receives an `Actor` (user + role in workspace) and checks it first.
3. **Every query is scoped by `workspace_id`.** No query on workspace-owned tables may omit it; Postgres RLS is the backstop, not the plan.
4. **Redaction (sensitive info) is applied in the service layer** based on the actor's role. Never return sensitive fields and rely on the UI to hide them.
5. Feature packages don't import each other's internals; they depend on small interfaces.

### 3.2 Style
- `context.Context` is the first parameter of anything doing I/O.
- Errors: wrap with `fmt.Errorf("...: %w", err)`; define sentinel/typed errors in the feature (`ErrNotFound`, `ErrForbidden`); map to HTTP status **only in handlers**.
- Logging: `log/slog`, structured, with `workspace_id` and `request_id`. **Never log credentials, tokens, or request bodies of credential endpoints.**
- Config: environment variables only, parsed once at start into a typed struct. No globals.
- Tests: table-driven unit tests; integration tests against a real Postgres via testcontainers (no mocking the DB).
- Lint: `golangci-lint` (config committed), `gofmt`/`goimports`.

### 3.3 API conventions
- REST under `/api/v1`, workspace-scoped: `/api/v1/workspaces/{wsId}/canvases/{id}`.
- JSON field names **camelCase**. IDs are **UUIDv7** strings.
- Errors: **RFC 9457 problem+json** (Huma's default) with a stable `code` string (`inventory.node_not_found`) the UI can switch on.
- Lists: cursor pagination (`?cursor=&limit=`). Never unbounded lists.
- Live updates (health, run logs): **SSE** at `/api/v1/workspaces/{wsId}/events`.
- OpenAPI is generated from Go; the TS client is generated from OpenAPI. **Changing an endpoint = change Go, run `task gen`, fix TS compile errors.**

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
apps/web/src/
  app/                    routes only: thin pages composing features
  features/
    canvas/ inventory/ workflows/ plugins/ members/ workspace/ ...
      components/  hooks/  api/  model/    (api = TanStack Query hooks over the generated client)
  components/ui/          shadcn primitives (Button, Dialog, ...) restyled by tokens
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
1. **Status first.** The product is about "is it up, and where does it break?". Health state must be readable at a glance from the canvas.
2. **Calm, dense, technical.** An operations tool, not a marketing site. Compact spacing, minimal chrome, content (the map) is the hero.
3. **Never color alone.** Every status has a color **and** an icon/shape, so it works for color-blind users and in screenshots.
4. **Consistent over clever.** Reuse a few components everywhere.
5. Keyboard-accessible and screen-reader-labelled controls (Radix gives most of this).

### 5.2 Tokens (the only way to use color) 🟡
**Rule: components never use raw hex/Tailwind palette colors (`bg-red-500`). They use semantic tokens** defined once in `styles/tokens.css` as CSS variables, with light and dark themes. Changing the brand later = editing one file.

```
Surfaces :  --bg   --surface   --surface-raised   --overlay
Lines    :  --border   --border-strong   --ring
Text     :  --text   --text-muted   --text-faint   --text-on-accent
Brand    :  --accent   --accent-hover   --accent-subtle
Status   :  --status-healthy  --status-degraded  --status-down  --status-unknown   (+ *-subtle backgrounds)
Feedback :  --success  --warning  --danger  --info
Category :  --cat-network  --cat-compute  --cat-service  --cat-storage  --cat-external  --cat-generic
```

- **Theme:** dark and light both supported from day one (token-based), plus "system". **Default: dark.**
- **Starting values** (OKLCH, to be tuned on screen; the rule is the token names, not these numbers):

```css
:root[data-theme="dark"] {
  --bg:               oklch(0.17 0.01 240);   /* near-black, slightly blue */
  --surface:          oklch(0.21 0.012 240);
  --surface-raised:   oklch(0.25 0.014 240);
  --border:           oklch(0.32 0.014 240);
  --text:             oklch(0.95 0.005 240);
  --text-muted:       oklch(0.72 0.01 240);
  --accent:           oklch(0.75 0.12 195);   /* teal / cyan */
  --accent-hover:     oklch(0.80 0.12 195);
  --text-on-accent:   oklch(0.18 0.02 195);
  --status-healthy:   oklch(0.76 0.17 150);   /* green */
  --status-degraded:  oklch(0.80 0.15 80);    /* amber */
  --status-down:      oklch(0.68 0.21 25);    /* red */
  --status-unknown:   oklch(0.62 0.01 240);   /* gray */
}
```
  The accent (hue 195) sits far from green (150), amber (80) and red (25), so brand color is never confused with a status.
- **Status mapping** (color + icon): healthy = green + check circle; degraded = amber + alert triangle; down = red + x circle (pulsing ring on canvas); unknown = gray + dashed circle.
- **Category colors** are low-saturation tints used for node icon backgrounds so shape + tint identify the category; they must stay clearly distinct from status colors (status is never conveyed by a category hue).
- Palette generated in OKLCH for even lightness; text/background pairs must meet WCAG AA contrast (checked in CI).

### 5.3 Typography, spacing, shape 🟡
- Fonts: **Inter** (UI), **JetBrains Mono** (IPs, hostnames, ports, code, logs). Anything machine-like is monospace.
- Scale: 12 / 13 / 14 (base) / 16 / 20 / 24 px. 4 px spacing grid (Tailwind default).
- Radius: small (6 px) for controls, 10 px for cards/panels. Shadows are rare; prefer borders.
- Icons: **Lucide** for UI; a custom SVG set for node shapes.
- Motion: short (120-200 ms), purposeful, respects `prefers-reduced-motion`.

### 5.4 Canvas visual language
- **Node shape by category** (also an icon in the center): network = rounded hexagon/circle with arrows motif, compute = rounded square, service = pill/rounded rect, storage = cylinder, external = cloud, generic = rectangle. A plugin may choose an icon, never custom render code.
- **Link style by kind:** physical = solid; VPN tunnel = dashed; proxy route = solid with arrowhead; DNS dependency = dotted with arrowhead; storage mount = double line; logical = thin gray. Link color follows health (healthy neutral, down red) when measurable.
- **Area:** translucent fill + labeled border, nestable; label shows rolled-up health.
- **States:** hover (outline), selected (accent ring), locked (small lock badge), protected (shield badge), sensitive-hidden (blurred/masked text with a "hidden" chip).
- Notes: yellow-tinted card is **not** reserved; note color comes from tokens (`--note-*`), 4 preset tints.

### 5.5 Layout
```
+--------+-----------------------------------------+-----------+
| Rail   |  Canvas tabs (this workspace's canvases) | Side panel|
| (work- |------------------------------------------|(user-     |
| spaces,|                                          | custom,   |
| nav)   |              CANVAS                      | tabs)     |
|        |                                          |           |
+--------+------------------------------------------+-----------+
| status bar: workspace health, running workflows, connection    |
+----------------------------------------------------------------+
```
- Left rail: workspace switcher, Canvases, Inventory, Workflows, Plugins, Members, Settings.
- Right side panel: user-configurable tabs (node details, notes, panels, iframes). Resizable, collapsible.
- Command palette (`Ctrl/Cmd+K`) for everything.

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
6. Status = color + icon, never color alone.
7. No fetch in components; use feature `api/` hooks; server state stays in TanStack Query.
8. Generated code is never hand-edited; change the source and run `task gen`.
9. Never log or return credentials; credentials are write-only.
10. Decisions that change a rule get an ADR.
