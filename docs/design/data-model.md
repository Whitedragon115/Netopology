# Data Model (A1)

> Status: **Draft v0.2**, migration tested on PostgreSQL 18.6. Review decisions recorded in §7.

## 1. Where things are

| File | What it is |
|------|-----------|
| [`schema.dbml`](schema.dbml) | **Visual design** of the schema. Paste into [dbdiagram.io](https://dbdiagram.io) for an interactive ER diagram, or publish with [dbdocs.io](https://dbdocs.io). VS Code has DBML preview extensions too. |
| [`apps/core/db/migrations/`](../../apps/core/db/migrations/) | **Source of truth.** goose SQL migrations that create the real database (triggers, checks, RLS). |
| [`apps/core/db/tests/scenarios.sql`](../../apps/core/db/tests/scenarios.sql) | Executable checks for the rules below. Run as the non-superuser app role. |

Rule: **change the migration first, then update `schema.dbml`.** Later (phase B) CI will regenerate the DBML from a migrated database (`db2dbml` from the DBML CLI) so the diagram can never drift.

## 2. The model in one picture

```
users ──< workspace_members >── workspaces
                │                    │
          canvas_grants              ├──< areas (nested) ──< nodes ──< links (node → node)
                │                    │                        │
                └──────────────── canvases ──< placements >───┴── (node | area | note | link)
                                     │
                                     ├──< canvas_shapes   (free drawing, not inventory)
                                     └──< share_links     (guest access)

notes attach to at most one of: node, link, area, canvas (none = workspace note)
audit_log records every change
```

- **Inventory** (`areas`, `nodes`, `links`, `notes`): what exists. Shared by every canvas in the workspace.
- **Views** (`canvases`, `placements`, `canvas_shapes`): how it is drawn. A placement says "this item appears on this canvas, here, looking like this".
- **Access** (`workspace_members`, `canvas_grants`, `share_links`): who sees what.

## 3. Key design decisions

1. **Workspace isolation is enforced by the database, three times.**
   - Every workspace-owned row has `workspace_id`.
   - **Composite foreign keys** `(workspace_id, x_id) → x(workspace_id, id)` make it *impossible* for a row to reference another workspace's row, even with a bug in the API.
   - **Row-Level Security** (migration 00002) hides other workspaces' rows from the app role, as a backstop to the API's own `workspace_id` filtering.
2. **A node exists once; canvases only place it.** Renaming a node, changing its health or its properties is visible on every canvas. "Remove from canvas" deletes a placement; "delete from inventory" deletes the node and, by cascade, its links, notes and placements everywhere.
3. **Links are shared and appear automatically.** A link exists once in the inventory and shows on **every canvas where both of its nodes are placed**, like Packet Tracer. A canvas can still hide things: one link at a time (an override placement with `hidden = true`), or a whole kind through the canvas setting `hiddenLinkKinds` (e.g. hide `physical` cables on a "Services" view). Override placements can also restyle or route a link. The view `canvas_visible_links` computes what to draw, and it obeys RLS.
4. **Flexible properties with a fixed shape.** `properties` on nodes, links and areas is a JSON list of fields:
   ```json
   [{ "key": "ip", "label": "IP address", "value": "192.168.1.1", "sensitive": true }]
   ```
   Users can add any field, and each field can be marked **sensitive**. The API strips sensitive values for members without permission and drops them entirely for guests ([permissions.md](permissions.md) §4). Core relationships (area, endpoints, canvas) are real columns, never JSON.
5. **Stable handles for scripts.** Every node has a `slug` (unique per workspace, e.g. `npm-main`). Workflow scripts use it (`ctx.node("npm-main")`), so renaming the display name never breaks automation.
6. **Optimistic concurrency.** Editable records have `version`, incremented by trigger on every update. The API uses it for `ETag` / `If-Match`, so two editors can't silently overwrite each other.
7. **Areas are colored boxes you can open (Dify-style).** An area groups nodes and has a box `color`. On a canvas it is drawn as:
   - **expanded**: a colored box with its nodes drawn inside it (`placements.parent_placement_id`, coordinates relative to the box, so moving the box moves its contents);
   - **collapsed**: a single block showing name, node count and rolled-up health. **Double-click to enter it**: this opens the area's own **inner canvas** (`canvases.area_id`), where its nodes are laid out, with a breadcrumb back (Home › Main LAN). Areas inside areas work the same way, recursively.
   The drawing always matches the inventory: an item can only be drawn inside the box of the area it belongs to, and moving a node to another area moves its drawings into that area's box (triggers). Areas nest without cycles (trigger). Deleting an area moves its children and nodes to the top level; its inner canvas is deleted.
8. **A node belongs to at most one area**, which makes "enter the area" unambiguous. A router joining two networks sits in one area and links to the other.
9. **Notes have at most one target** (node, link, area or canvas; none = workspace note), enforced by a CHECK, with real foreign keys instead of a polymorphic `target_id`. Notes can also be placed on canvases like sticky notes. `kind = 'rule'` marks a note as a rule (documentation only in v1).
10. **Free drawing is separate from inventory.** Text, arrows and boxes drawn on a canvas live in `canvas_shapes`; they never pollute the inventory.
11. **Guests are share links, not accounts.** A share link points at one canvas, stores only a hash of its token, and can have a password, expiry and revocation.
12. **Audit log is append-only.** UPDATE is blocked by trigger; DELETE is allowed only for retention and workspace deletion.
13. **Conventions:** UUID v7 ids (`uuidv7()`, built into PostgreSQL 18, time-ordered so indexes stay fast), `timestamptz`, `snake_case`, `text + CHECK` instead of PostgreSQL enums (adding a value is a one-line migration).

## 4. Tables

| Group | Table | Purpose |
|-------|-------|---------|
| Accounts | `users` | Login accounts: username, optional email, optional argon2id hash, server role (`owner` / `admin` / `member`), active/disabled |
| | `user_identities` | Linked Google / Discord sign-ins (no self-signup) |
| | `sessions` | Server-side sessions; only a SHA-256 of the cookie token is stored |
| | `instance_settings` | Key/value server settings |
| Access | `workspaces` | Isolated environments |
| | `workspace_members` | User × workspace × role, plus `can_view_sensitive` |
| | `canvas_grants` | Which canvases an editor may use |
| | `share_links` | Guest access to one canvas |
| | `audit_log` | Who did what |
| Inventory | `areas` | Nestable sites/networks/VLANs (optional CIDR, VLAN id) |
| | `nodes` | Anything in the network; category drives the shape |
| | `links` | Node-to-node relationship with a kind and optional ports |
| | `notes` | Markdown notes and rules |
| Views | `canvases` | Named views (tabs) and areas' inner canvases; viewport, lock, protection |
| | `placements` | Item × canvas × position/style; area boxes (expanded/collapsed); link overrides |
| | view `canvas_visible_links` | Which links to draw on each canvas |
| | `canvas_shapes` | Free drawing |

Field-level detail lives in [`schema.dbml`](schema.dbml) (with notes on every non-obvious column).

## 5. Verified behavior

`scenarios.sql` passes on PostgreSQL 18.6 as a non-superuser role (27 checks). It covers:

- exactly one server owner; an external identity links to exactly one account
- area cycles rejected; self-links rejected
- same node on two canvases; renamed once, seen on both; version bumped
- **links appear automatically** where both nodes are placed; a canvas can hide one link or a whole kind
- a node appears at most once per canvas; link overrides need both nodes on the canvas
- **area boxes**: a node can be drawn only inside its own area's box; moving it between areas moves its drawings; only area boxes collapse; one inner canvas per area
- remove-from-canvas keeps the inventory and drops the dependent link override
- delete-from-inventory cascades links and placements on every canvas
- deleting a parent area keeps its children
- notes have at most one target; canvas grants require membership
- **RLS hides other workspaces and blocks writes into them; no workspace selected = no rows**
- **cross-workspace references impossible (composite FKs)**
- a guest-style query can exclude sensitive fields
- audit log rejects updates
- down migrations remove everything

## 6. Runtime requirements (for phase B)

- The API and worker **must connect as a normal role** (e.g. `netopology_app`), never as a superuser or a role with `BYPASSRLS`. Superusers ignore RLS. Migrations run as a separate owner role.
- Each request/job runs in a transaction that first calls `set_config('app.workspace_id', <id>, true)`.
- Tables without RLS (`users`, `sessions`, `workspaces`, `workspace_members`, `share_links`, `audit_log`, `instance_settings`) are the access-control layer itself and are protected by the service layer.
- Docker image: **`postgres:18`** (needed for `uuidv7()`).

## 7. Decisions (confirmed in review)

1. Links are shared and appear automatically; canvases can hide them (decision 3).
2. Areas are colored boxes that collapse into blocks you can enter, Dify-style (decision 7). A node belongs to at most one area.
3. Sign in with **username + password, Google, or Discord**. Email is optional.
4. **No self-signup.** Only the server owner/admin create accounts. A Google/Discord sign-in works only after it is linked to an existing account (see [permissions.md](permissions.md) §2.10).
5. Server roles: **owner** (the first account, exactly one), **admin**, **member**. Only owner/admin create accounts and workspaces.

## 8. Added in later phases (not in migration 00001)

| Phase | Tables / columns |
|-------|------------------|
| C2 | `health_events` (history), retention job |
| C3 | `plugin_installations`, `credentials` (encrypted, write-only), `nodes.plugin_installation_id`, `nodes.config` |
| C4 | `workflows`, `workflow_triggers`, `runs`, `run_steps` |
| C5 | `panels`, `side_panel_layouts` |
