# Netopology: Idea Document

> Status: **Draft v0.5**. Decisions from rounds 1-4 are folded in. Items marked 🟡 are proposals awaiting confirmation.

## 1. Problem

A real homelab / small-infra network is spread across many separate tools: Nginx Proxy Manager,
Cloudflare Tunnel + DNS, Dokploy + Traefik, TrueNAS, SMB, router, remote L2TP networks, local DNS,
Pterodactyl, many VMs. Each has its own UI and login. Common tasks are **cross-tool**
(e.g. "add a domain" = Cloudflare DNS + local DNS + reverse proxy), and nobody has one picture of how it all connects.

## 2. Vision

**Netopology is one place to draw, understand, and operate your whole infrastructure.**
It links the tools you already run. It does not replace them.

Positioning (the gap):

| Tool | What it does well | What's missing for us |
|------|-------------------|-----------------------|
| NetBird | Nice network view | Network only, no infrastructure/services |
| n8n / Dify | Services + workflow nodes | No network/topology notion |
| NetBox | Network inventory & modeling | Not visual-first, no automation |
| Cisco Packet Tracer | Drag devices, wire them, zones | Simulation only, can't manage real machines |

**Netopology = Packet Tracer-style map (real devices and services) + n8n-style workflow nodes + NetBox-style inventory, one UI.**

## 3. Decisions so far

| Topic | Decision |
|-------|----------|
| Audience | Everyone. Public open-source repo, **self-hosted, local-first**. |
| Cloud/hosted | Out of scope. Remote access is the user's job (their own VPN/tunnel). |
| Accounts | Built-in account system. Everything (map, secrets, workflows) is behind login. |
| Networking | Netopology does **not** create VPNs or connections. Users establish connectivity; Netopology only models and manages it. |
| Remote sites | Modeled logically as **Areas** (zones), e.g. "Home LAN", "Remote L2TP site". |
| Plugins | Installed and run **on the backend only**, never in the browser. |
| Plugin languages | **TypeScript/JavaScript and Python only**. Plugins run in a shared **sandbox container** (not one container per plugin). |
| Plugin I/O | Language-agnostic **JSON** in/out. |
| Workflow failure | No distributed transactions. Log everything, offer optional per-action rollback, user tests each step. |
| Health | Each node has a health check; failures are shown on the map. |
| Frontend/stack | **Next.js** (author's strongest stack). |
| Auto-discovery | Future work, low priority. |
| First demo | Draw 3 nodes, run "Add Domain" across Cloudflare + NPM, see result on the map. |
| Workspace | Top-level container. **One workspace = one network = one shared inventory.** Users can have several workspaces (e.g. "Home lab", "Client A"). |
| Canvases | Inside a workspace, users create **multiple canvases**. Each canvas is a *view* over the workspace's shared inventory (physical, logical, service architecture, ...). The same node can appear in many canvases and stays linked. |
| Guests | **View-only, no exceptions.** Cannot execute anything or drill deeper than what the canvas shows. |
| Viewer secrets | Whether a viewer can see sensitive info is an **admin decision per viewer** (default: hidden). |
| Database | **PostgreSQL** in its own container (see §13.2). SQLite dropped now that the DB is a separate container. |
| Deployment | **Multi-container, Docker Compose** (`docker compose up` and it works). Gateway, web, api, worker, sandbox, db (see §14). |
| Isolation | **Each workspace is a fully isolated environment**: own inventory, plugins, credentials, workflows, members, audit log. No cross-workspace references. |
| Role scope | **All roles are per workspace.** A user can be admin in one workspace and viewer in another. |
| Export | Workspaces can be exported/imported as a file (see §15). |
| Workflows | **Separate from the map.** A workflow is a user-written script with triggers (manual / schedule / webhook / event). Not drawn on the canvas. |
| Backend | 🟡 **Go** core service (see §5.6). Next.js remains the UI. |
| License | 🟡 **Apache-2.0** for core and SDKs (see §12). |
| Roles | `owner`, `admin`, `editor`, `viewer`, `guest` (see §7). |

## 4. Pillar 1: The Map (typed graph + drawing)

The map is a **typed graph rendered as a canvas**, not a free drawing. Types are what let workflows and health checks reason about it
("which proxy fronts this service?", "what breaks if this router is down?"). Free-form notes and shapes are layered on top.

### 4.0 Workspaces, inventory, canvases (decided)

```
Instance
 └─ Workspace  (one network)            e.g. "Home lab"
     ├─ Inventory  (shared)             Nodes, Links, Areas, Notes, plugin bindings, credentials
     ├─ Canvases   (views)              "Physical", "Service architecture", "Public traffic path"
     │    └─ Placements                 node X at (x,y) with style S, link L routed this way
     ├─ Workflows                       scripts + triggers, scoped to this workspace
     └─ Members & ACLs                  who may see/edit which canvases
```

- **Inventory is shared per workspace.** `Node`, `Link`, `Area` are workspace-level records. Renaming a node, changing its health, or rebinding its plugin changes it in every canvas.
- **A canvas is a view.** It stores *placements*: which inventory items are shown, where, and how they look (size, color, label), plus canvas-only things like layout and free-form annotations. A canvas may show a subset (e.g. only nodes in one Area).
- **Deleting is two-level.** "Remove from canvas" only deletes the placement. "Delete from inventory" deletes the record and every placement (with a warning listing the affected canvases and workflows).
- **Links across views.** A link exists once in the inventory; it draws on any canvas where both ends are placed.
- A **workspace is the boundary** for plugins' node bindings, credentials, workflows, health polling, and audit log. Nothing leaks across workspaces.
- Plugins are installed per *instance* (server), then enabled/bound per workspace.

### 4.1 Element types 🟡

- **Node**: has a `category` (decides default shape/color), a `type` (provided by a plugin or built in), interfaces/ports, optional plugin binding, health state.
  - Categories: `network` (router, switch, firewall, AP), `compute` (VM, bare metal, container host), `service` (proxy, DNS, panel, app), `storage` (NAS, share), `external` (internet, Cloudflare, SaaS), `generic`.
  - Shape per category (e.g. router = circle with arrows, service = rounded rect, storage = cylinder, external = cloud). Plugins can supply an icon but not arbitrary rendering code.
- **Wire** (link): `kind` = physical / vpn-tunnel / proxy-route / dns-dependency / storage-mount / logical. Directed or undirected. Carries notes and its own health ("link is down") when a plugin can measure it.
- **Area (zone)**: nestable container (Site → LAN → VLAN). Membership by drawing-inside or explicit assignment. **Health rolls up**: if the router node of an area is down, the area shows degraded, and "where it breaks" becomes visible.
- **Note**: attachable to a node, wire, area, or canvas. Supports markdown. A note may be promoted to a **Rule** (e.g. "node A must never talk to area B"), initially documentation only, later checkable.

### 4.2 Distinctions to keep clear
- *Physical/logical position* (areas) vs. *dependency* (wires) vs. *documentation* (notes) are three separate things in the data model.
- A node is a **record first, a shape second**. Deleting a shape never silently deletes workflow bindings.

### 4.3 Canvas tech 🟡
React Flow (`@xyflow/react`) for nodes/wires/areas (sub-flows). It is Next.js friendly. (Workflows are scripts, so they need a code editor such as Monaco, not a second canvas.)

## 5. Pillar 2: Automation

### 5.1 Plugin system (modeled after Dify's plugin daemon)

How Dify does it (reference): plugins are packaged archives with a `manifest.yaml`; a separate **plugin daemon** process
starts each plugin as a subprocess and talks to it over a defined protocol; plugins declare what they provide
(tools, models, endpoints) and what they need; a marketplace holds reviewed packages. Netopology borrows the shape of that, minus the heavy parts.

**Proposed runtime 🟡**

```
 api / worker (Go)  --- JSON-RPC 2.0 over WebSocket (internal network) --->  sandbox container
                                                                       ├─ Node host   (per-workspace processes)
                                                                       └─ Python host (per-workspace processes)
```

- **One sandbox container, not one container per plugin.** Inside it, plugins and workflow scripts run as **separate processes per workspace** (own working dir and OS user), started on demand.
- Wire protocol = **JSON-RPC 2.0** between the Go worker and the sandbox over an internal network connection (it was stdio when everything shared a process; separate containers need a network transport). Language-agnostic, fast, easy to debug. The SDK hides the plumbing from plugin authors.
- The sandbox has **no database access**. It receives only what a call needs (inputs + scoped credentials) and returns JSON.
- A plugin author never touches the protocol directly: they use `@netopology/plugin-sdk` (TS) or `netopology-sdk` (Python).

**Security note.** Moving plugins into a sandbox container means a bad plugin cannot reach the database or the API's memory, which is a big improvement. It is still not hard isolation *between plugins/workspaces inside the sandbox*. Layers, in order of cost:
1. Declarative **permission manifest** shown at install ("talks to: api.cloudflare.com; needs secret: CF_TOKEN").
2. **Scoped secrets**: a plugin only receives the credentials the user bound to its nodes, per call, never the whole vault.
3. TS plugins can run under **Deno** with real `--allow-net=<hosts>` flags; Python has no equivalent, so Python plugins rely on review + trust.
4. Marketplace review, signing, and a clear "unverified" badge for community plugins.
5. Sandbox container hardening (non-root, read-only rootfs, dropped capabilities, resource limits; see §14.3).
6. Optional later: multiple sandbox containers (e.g. one "trusted", one "community") for stronger separation between workspaces.

### 5.2 Plugin manifest (sketch) 🟡

```yaml
id: cloudflare-dns
version: 1.0.0
apiVersion: 1            # Netopology plugin API version (stability guarantee)
runtime: node            # node | python
entry: dist/index.js
permissions:
  network: [api.cloudflare.com]
  secrets: [CF_API_TOKEN]
nodeTypes:
  - id: cloudflare-zone
    category: external
    icon: cloudflare.svg
    config: { schema: schemas/config.json }   # JSON Schema -> auto-generated settings form
    health: { action: health }
actions:
  - id: dns.addRecord
    input:  schemas/addRecord.in.json          # JSON Schema
    output: schemas/addRecord.out.json
    rollback: dns.removeRecord                 # optional but encouraged
    idempotent: true
panels:
  - id: records
    kind: table                                # declarative panel, see 6.2
    dataAction: dns.listRecords
```

Everything user-facing (config forms, workflow step forms, validation) is generated from the **JSON Schemas**, which is also what keeps I/O format-uniform across runtimes.

### 5.3 Marketplace 🟡
Start cheap: a **Git-based registry** (a public GitHub repo with an index of plugin manifests/release URLs, like Homebrew taps). Publishing = PR; review = PR review. No server to run. Add a hosted marketplace site only if demand justifies it. Netopology's UI browses the index and installs by downloading a signed/hashed package.

### 5.4 Workflows (user scripts) 🟡
A workflow is a **script the user writes** (TypeScript or Python), plus **triggers**. It lives outside the canvases, in its own "Workflows" area. Each workflow is one self-contained, user-designed function.

```ts
// workflow: add-domain
export default async function run(ctx, input: { domain: string; target: string }) {
  await ctx.node("cloudflare-main").action("dns.addRecord", { name: input.domain, content: ctx.publicIp });
  await ctx.node("local-dns").action("dns.addRecord", { name: input.domain, content: input.target });
  await ctx.node("npm-main").action("proxy.addHost", { domain: input.domain, forward: input.target });
}
```

- The script gets a `ctx` object from the SDK: look up nodes in the inventory, call their plugin actions, read health, log, read secrets *it has been granted*. Plugins stay the only thing that talks to external tools.
- Inputs are declared with a JSON Schema, so the UI auto-generates a "Run" form.
- Triggers: manual (MVP), cron/schedule, webhook, node-state change (e.g. "when node goes down, run X"). Later: a visual step-builder that generates the same script.
- Because it is a plain script, the canvas is not required: a workflow can *reference* nodes, and the canvas can show a "run workflow" button on a node as a shortcut.
- ⚠️ **Scripts are arbitrary code on the server.** Creating/editing a workflow is effectively remote code execution, so it must be restricted to high roles (see §7). Running an existing workflow can be granted more widely.
- **Failure model** (per decision): no automatic distributed rollback. Instead:
  - Every step's **input, output, error, duration** is persisted in a run log (secrets redacted).
  - If an action declares a `rollback`, the UI offers "Roll back this run" (user-confirmed, reverse order).
  - **Dry-run / test-step** button on every step, and a "test workflow" mode.
  - Actions should be **idempotent** so a re-run after a half failure is safe.

### 5.6 Backend: Go core service 🟡
Recommendation: write the core in **Go**, keep **Next.js** as the UI.

Why Go fits this core:
- It is a long-running daemon: scheduler (cron triggers), health polling for many nodes, workflow runs, and managing child processes (the Node/Python plugin hosts). Goroutines/contexts handle this well.
- **One small static binary, two modes** (`netopology api`, `netopology worker`): the same image is reused for the API and worker containers, so there is only one Go codebase to build and ship.
- Good PostgreSQL support (`pgx`) and a Postgres-native job queue option (River), which avoids adding Redis.
- Low memory use, which matters on homelab boxes (Raspberry Pi, small VMs).
- Fast iteration with `air` (live reload), which you already have.

Costs to accept:
- Two languages (Go + TypeScript). Mitigate by generating TS types and API clients from one source of truth (OpenAPI + the JSON Schemas in `packages/schema`).
- Learning curve if Go is new to you. The core is mostly CRUD + a job scheduler + subprocess management, which is Go's easy ground.
- Plugin authors never see Go: they use the TS or Python SDK.

Alternative if you prefer one language: a TypeScript core (Node). Simpler for you, heavier to self-host, weaker at the subprocess/scheduler role. Not recommended, but valid.

The Next.js app runs in its own container and acts as a **pure client** of the Go API. Auth, sessions and authorization live only in Go, so the web container holds no secrets and no business logic. Avoid Next server-only features that would put logic or credentials in the web tier.

### 5.5 Health & drift
- `health` is part of the plugin contract. Core polls on an interval and sets node state: `healthy | degraded | down | unknown`.
- **Drift clarification:** the concern isn't someone editing *our* map (accounts/locks cover that). It's someone changing the *underlying tool* (e.g. adding a host directly in NPM) so Netopology's stored picture is stale. Mitigation: plugins read live state from the tool; the map shows live data in panels and doesn't cache it as truth.

## 6. Pillar 3: Customizable UI (side panels, embeds)

### 6.1 Custom side panels
User-defined panels/views per area or task (e.g. "Remote site", "DNS & domains"), composed from built-in and plugin-provided panels.

### 6.2 Plugin panels (the "custom block market") 🟡
Third-party **browser code is a bigger risk than backend plugins** (it runs with the user's session). So:
- **Declarative panels first**: the plugin's backend returns JSON; the UI renders it with built-in components (`stat`, `table`, `chart`, `log`, `form`, `status-list`). No third-party JS in the client. This is Dify-style and covers "basic monitor UI".
- Later, if needed, custom UI components run in a **sandboxed iframe** with a narrow `postMessage` data API.

### 6.3 Iframe embeds
- Embed Uptime Kuma, Grafana, etc. by URL.
- Known issue: many apps block framing (`X-Frame-Options`, CSP `frame-ancestors`) and break on cookies/mixed content. UI should detect failure, show a fix guide, and offer "open in new tab".

## 7. Security baseline (local-first)
- Accounts with hashed passwords; session auth; optional TOTP later.

### 7.1 Roles 🟡

| | Owner | Admin | Editor | Viewer | Guest |
|---|---|---|---|---|---|
| Sees | everything | everything | **selected** canvases | **all** canvases | **selected** canvases |
| Edit canvases | ✅ | ✅ | ✅ (selected) | ❌ | ❌ |
| Delete protected items (core canvas, etc.) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage users/roles | ✅ | ✅ (not owners) | ❌ | ❌ | ❌ |
| Workspace settings / console | ✅ | ✅ | ❌ | ❌ | ❌ |
| Install plugins (into this workspace) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create/edit workflow scripts | ✅ | ✅ | ❓ | ❌ | ❌ |
| Run workflows | ✅ | ✅ | ✅ (allowed ones) | ❌ | ❌ |
| See sensitive info | ✅ | ✅ | by policy | **only if admin enabled it for that viewer** (default off) | ❌ never |
| Access via | login | login | login | login | share link + optional password |

- **Protected items:** a flag on a canvas/node/plugin ("core"). Only the owner can delete or un-protect it. Admin can edit but not remove. Keeps "very few limitations" for admin while protecting the important stuff.
- **Per-canvas ACL:** editors and guests get access per canvas, not globally.
- **Guest = share link**, not an account: a per-canvas link with optional password, optional expiry, revocable. Guests never receive secrets.
- ⚠️ **Redaction must happen on the server.** If the Go API sends hidden fields to the browser and the UI just doesn't render them, a viewer can read them in dev tools. The API returns a redacted payload per role.
- **Two different things are called "secret". Let's separate them:**
  1. **Credentials** (API tokens, passwords, SSH keys): stored encrypted, **write-only**; after saving, no role, not even the owner, gets them back through the UI/API. Only plugins receive them at call time.
  2. **Sensitive info** (IP addresses, hostnames, internal domains, certain notes): a field/note can be marked sensitive; hidden from viewers by default; an owner/admin can enable it per viewer (viewer may then toggle show/hide on their own screen). Guests never see it.
- **Guests are strictly read-only**: no running workflows, no actions, no opening plugin panels, no drill-down beyond what the shared canvas displays. Redacted payloads are generated by the server.
- **Scope of roles (decided):** every role is **per workspace**. The user who creates a workspace is its `owner`. Editor and guest are further restricted per canvas.
- **Server level (decided):** user *accounts* are global (one login: username/password, Google or Discord). Server roles are `owner` (the first account, exactly one), `admin` and `member`. Only server owner/admin create accounts (no self-signup) and workspaces. Server roles grant **no access to workspace contents**. Details: [docs/design/permissions.md](docs/design/permissions.md).
- Audit log records who did what, including role changes and share-link use.
- Secrets encrypted at rest; master key from env/file; never returned to the client.
- **Audit log** of who ran which action on which node.
- Ship with safe defaults: bind to localhost, HTTPS guidance, no default password.

## 8. Risks (updated)

| # | Risk | Status |
|---|------|--------|
| 1 | Scope: 3 products in 1 | Mitigated by phasing + first-party plugins first |
| 2 | Plugin security | Sandbox container + hardening (§14.3); weaker separation *between* workspaces inside it (§5.1) |
| 3 | Credential storage = juicy target | Encrypted vault, scoped secrets, audit |
| 4 | Iframe blocking | Documented limits + fallback |
| 5 | Remote reachability | Out of scope: user provides connectivity; backend must be able to reach the target |
| 6 | Non-transactional workflows | Logging + optional rollback + dry-run |
| 7 | Stale map vs. reality | Live state from plugins, health checks |
| 8 | Plugin API stability | `apiVersion` in manifest from day 1 |
| 9 | Marketplace cold start | First-party plugins for the author's own stack |
| 10 | **Backend must reach the targets** | New: Netopology server needs network reachability to every managed device/API. Same-LAN sites work; remote LANs only work if the user routes between them. Panels should show "unreachable" clearly vs. "down". |
| 11 | **Exposing a tool that can change your whole network** | New: even local-first, a compromised Netopology = compromised infra. Lean on §7. |
| 12 | Competition | Different niche (see §2) |

## 9. Open Questions

**No blocking questions remain.** Resolved: roles per workspace, fully isolated workspaces, no cross-workspace nodes, Docker Compose multi-container deployment, export function (§15), server owner/admin roles (§7.1), PostgreSQL, plugins installed per workspace, **all plugins run in one sandbox container** (per-workspace processes inside), **nginx** as the gateway.

Defaults I will assume unless you object (small, easy to change later):
- First run: `docker compose up`, open the browser, create the first account (becomes server owner), then the first workspace.
- Sign-in: username/password, Google and Discord in v1 (accounts must already exist). Generic OIDC/SSO (Authelia, Authentik, etc.) is a future feature.
- Viewers and guests are read-only everywhere, including plugin panels.
- Health polling interval default 60 s per node, configurable per node.
- TLS: the user provides certificates to nginx, or runs Netopology behind their own proxy.

## 10. Phasing (revised)

1. **Phase 0: Skeleton.** Compose stack (gateway, web, api, worker, db), Go core + Next.js + auth + per-workspace roles skeleton + PostgreSQL migrations + monorepo layout.
2. **Phase 1: Map.** Shared inventory (nodes/links/areas), multiple canvases with placements, notes, save/load, manual health badge, per-canvas access + server-side redaction.
3. **Phase 2: Sandbox + plugin runtime + SDK + first-party plugins.** Sandbox container, Node host, JSON-RPC, manifest, health, actions; Cloudflare + NPM plugins. Declarative panels.
4. **Phase 3: Workflows.** Step chain, run logs, test/dry-run, rollback.
5. **Phase 4: Custom UI.** Custom side panels, iframe embeds, **workspace export/import**.
6. **Phase 5: Python host + git-based marketplace.**
7. **Future:** auto-discovery scripts, rules engine, TOTP, sandboxed custom UI.

## 11. Repo layout (as built; see CONVENTIONS.md §2)
```
/ (root)          Next.js UI (own container), compose.yaml, deploy/nginx, .env.example
backend/          git submodule: Go service (api + worker), db migrations, API contract
backend/sandbox   Node + Python plugin hosts (own container, phase C3)
packages/sdk-ts   @netopology/plugin-sdk
packages/sdk-py   netopology-sdk
packages/schema   shared JSON Schemas / types (manifest, protocol)
plugins/          first-party plugins (cloudflare, npm, ...)
docs/             plugin authoring guide
```

## 12. License 🟡

Goal: open source, maximum adoption, healthy plugin ecosystem.

| License | Adoption | Notes for Netopology |
|---------|----------|----------------------|
| **Apache-2.0** (recommended) | Very high | Permissive + **explicit patent grant** + trademark clause. Companies and homelabbers can use/modify freely. Standard for infra projects (Kubernetes, Traefik, Grafana's older code). |
| MIT | Highest | Simplest, but no patent grant. Fine too; Apache-2.0 is slightly safer for a project that will have outside contributors. |
| AGPL-3.0 | Lower | Forces anyone running a modified hosted version to publish their changes. Good protection against closed hosted forks, but many companies ban AGPL, which hurts contributions and plugin adoption. |

Recommendation:
- **Core + SDKs + docs: Apache-2.0.** Plugins run out-of-process, so plugin authors can pick any license (including proprietary).
- Since the project is self-hosted and local-first, the main AGPL argument (stopping closed SaaS forks) is weak here.
- Add a `CONTRIBUTING.md` and use **DCO sign-off** (`Signed-off-by`) instead of a CLA to keep contributing frictionless.
- Reserve the **Netopology name/logo** under trademark policy so forks can't pass as official.

## 13. Tech stack recommendations 🟡

### 13.1 Go backend

| Concern | Recommendation | Why |
|---------|----------------|-----|
| HTTP router | **chi** (on top of stdlib `net/http`) | Tiny, idiomatic, middleware-friendly, no lock-in. Go 1.22's built-in `ServeMux` is also good enough; chi adds route groups and middleware. |
| API definition | **Huma** (on chi) | Define handlers with typed Go structs and get **OpenAPI 3.1** generated automatically. That OpenAPI feeds a generated TypeScript client for Next.js, which solves the "two languages" worry. |
| Alternative | Echo or Gin | Fine and popular, but no automatic OpenAPI; more framework-specific code. Choose if you want the largest tutorial base. |
| DB access | **sqlc** + plain SQL migrations (**goose**) | Write SQL, get type-safe Go. No heavy ORM, no magic; works with SQLite, Postgres and MySQL. |
| Postgres driver | `pgx` | The standard high-performance Go driver for PostgreSQL. |
| Job queue | **River** (Postgres-native) or `SELECT ... FOR UPDATE SKIP LOCKED` | Reliable workflow/health jobs without adding Redis. |
| Scheduler | `robfig/cron` v3 or `go-co-op/gocron` | Cron triggers for workflows. |
| Realtime (live health, run logs) | **SSE** first; WebSocket (`coder/websocket`) if bidirectional is needed | SSE is simplest through reverse proxies. |
| Auth | Server-side sessions in secure HttpOnly cookies; **argon2id** (`x/crypto`); TOTP later (`pquerna/otp`) | Cookies avoid storing tokens in JS. |
| Authorization | Small hand-written policy layer (role x workspace x canvas) | Casbin is overkill for 5 fixed roles. |
| Secret encryption | AES-256-GCM (stdlib) with master key from env/file | Credentials are write-only (§7.1). |
| Plugin host IPC | JSON-RPC 2.0 over WebSocket to the sandbox container | See §5.1. |
| Logging | stdlib `log/slog` | Structured logs without a dependency. |
| Web UI | Next.js (`output: "standalone"`) in its own container | Matches the multi-container layout; talks only to the API. |
| Dev loop | `air` (installed) | Live reload for the Go service. |

Suggested shape: **chi + Huma + sqlc + PostgreSQL (pgx)**. Few dependencies, and the contributor-facing code stays plain Go.

### 13.2 Database: PostgreSQL vs MySQL (SQLite is out)

A separate database container means SQLite no longer fits (it is a file opened by one process; sharing it between api/worker containers over a volume is fragile). So the real choice is PostgreSQL vs MySQL.

| | PostgreSQL (recommended) | MySQL 8 |
|---|---|---|
| JSON data (canvas layouts, JSON Schemas, run inputs/outputs, plugin manifests) | `jsonb` with indexing, very strong | `JSON` type works, weaker indexing/ops |
| Workspace isolation | **Row-Level Security** can enforce `workspace_id` in the database itself as a second safety net | No equivalent |
| Job queue / events without Redis | River, `SKIP LOCKED`, `LISTEN/NOTIFY` | `SKIP LOCKED` ok; no LISTEN/NOTIFY |
| Go tooling | pgx, sqlc, goose: best-supported combo | Supported, slightly less polished |
| Your familiarity | New | Known |
| Self-host weight | One container | One container |

**Recommendation: PostgreSQL.** The workload (JSON-heavy, workspace-scoped data, background jobs) is exactly its strength, and RLS directly backs your "isolated workspaces" requirement. Choose MySQL only if familiarity outweighs that; it would work, just with fewer safety nets. Pick one, and keep the SQL simple so you aren't locked in.

Operational notes:
- Data lives in a named Docker volume; document `pg_dump` backups, and ship an example backup service in compose.
- Apply a **retention policy** to run logs and health history (e.g. 30 days / last N runs) so tables don't grow forever; partition by time if they get large.
- The sandbox container cannot reach the database network at all.

## 14. Deployment architecture (Docker Compose)

### 14.1 Containers

| Container | Tech | Role | Talks to |
|-----------|------|------|----------|
| `gateway` | **nginx** | Single public port, TLS termination (user-supplied certs), routes `/` to web and `/api` to api. Needs `proxy_buffering off` for SSE and `Upgrade` headers for WebSocket. Can be skipped (compose profile) by users who already have their own proxy. | web, api |
| `web` | Next.js | UI only, no secrets, no business logic | api (via browser) |
| `api` | Go (`netopology api`) | REST + SSE, auth, sessions, authorization, redaction, workspace data | db, worker (enqueue) |
| `worker` | Go (`netopology worker`) | Scheduler (cron), health polling, workflow dispatch, plugin install/verify | db, sandbox |
| `sandbox` | Node + Python hosts | Runs plugins and workflow scripts; reaches the outside world (internet, LAN devices) | worker (run-scoped callbacks) |
| `db` | PostgreSQL | Persistent data | api, worker |

Splitting `api` from `worker` means a slow or stuck workflow can never freeze the UI, and they can be restarted/scaled independently. No Redis, thanks to the Postgres queue.

### 14.2 Networks (this is where the isolation comes from)

```
edge     : gateway, web, api
core     : api, worker, db            <- the database lives only here
sandbox  : worker, sandbox            <- sandbox cannot see db or api
(sandbox also has outbound access to the internet and your LAN)
```

- `db` is on the `core` network only; no published port.
- The sandbox can reach the outside (it must, to manage Cloudflare, NPM, routers...) but **cannot reach the database or the API**. Calls back to Netopology go to the worker through a narrow, **per-run-token** internal endpoint.
- Only `gateway` (or `web` + `api` if there is no gateway) publishes ports.
- Reaching LAN devices: bridge networking works for normal IP traffic via NAT. Future discovery features (ARP/LLDP) will need `network_mode: host` or macvlan on the sandbox; that is a documented opt-in, not the default.

### 14.3 Sandbox hardening (defaults)
- Run as non-root; `read_only: true` root filesystem with a tmpfs for scratch; `cap_drop: [ALL]`; `no-new-privileges`.
- CPU, memory and PID limits; per-run time limit enforced by the worker.
- Plugin packages mounted **read-only** from a volume; each workspace gets its own writable scratch directory and OS user.
- **Never mount the Docker socket** into any container.
- Credentials are passed per call, kept in memory only, never written to disk or logs.

### 14.4 Compose sketch
```yaml
services:
  gateway: { image: nginx:stable, ports: ["80:80", "443:443"], volumes: ["./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro", "./certs:/etc/nginx/certs:ro"], networks: [edge] }
  web:     { build: ., networks: [edge] }
  api:     { build: ./backend, command: ["api"], env_file: .env, networks: [edge, core] }
  worker:  { build: ./backend, command: ["worker"], env_file: .env, networks: [core, sandbox] }
  sandbox: { build: ./backend/sandbox, read_only: true, cap_drop: [ALL],
             volumes: ["plugins:/plugins:ro"], networks: [sandbox] }
  db:      { image: postgres:18, volumes: ["pgdata:/var/lib/postgresql/data"], networks: [core] }
networks: { edge: {}, core: { internal: true }, sandbox: {} }
volumes:  { pgdata: {}, plugins: {} }
```
`core` is `internal: true` (no internet). The real file is [`compose.yaml`](compose.yaml); backend developers run only Postgres in Docker (`backend/compose.dev.yaml`) and the Go services natively under `air`.

### 14.5 Trade-offs of going multi-container
- More moving parts for users; mitigated by one `docker compose up`, one `.env.example`, health checks, and `depends_on: condition: service_healthy`.
- Startup ordering and migrations: the API runs migrations on boot behind a DB advisory lock so api/worker don't race.
- Needs Docker, which excludes bare-metal-only users. Acceptable: you chose "just make it work" via Compose.
- The sandbox needs LAN reachability. Docker Desktop on Windows/macOS puts containers behind a VM, which can complicate reaching LAN hosts; document it.

## 15. Workspace export / import 🟡

Because a workspace is a self-contained environment, it can be exported as one file.

**Format:** a zip (`.netopology`) of human-readable files, so it diffs well in Git:
```
manifest.json        formatVersion, appVersion, exportedAt, mode (backup | template)
inventory.json       nodes, links, areas, notes, plugin bindings (credential slots empty)
canvases/*.json      one file per canvas: placements, styles, annotations
workflows/<name>/    workflow.json (triggers, input schema) + script.ts or script.py
plugins.json         required plugins: id, version, content hash
panels.json          custom side panels, iframe embeds
```

**Never exported:** credentials, password hashes, session data, share-link tokens. A binding exports as "needs credential `CF_API_TOKEN`" and the importer fills it in.

**Two modes:**
- **Backup:** everything above plus the member list/roles (no secrets), audit log optional.
- **Template:** structure only, with an option to **redact sensitive info** (IPs, hostnames, notes marked sensitive) so a network design can be shared publicly.

**Import:**
- Validates against versioned JSON Schemas; refuses newer formats than it knows, migrates older ones.
- Creates a *new* workspace (never merges into an existing one in v1), remapping all IDs.
- Shows a **preview/dry run**: counts, required plugins to install (with hash check), workflow scripts to review. Scripts are code, so they are listed and must be confirmed.
- Importing needs permission to create workspaces; exporting needs `owner`/`admin` of that workspace.

Also expose it via CLI/API (`netopology export <workspace>`) so backups can be scripted. Full-instance disaster recovery is still a plain `pg_dump`; export is for workspaces, not a replacement.
