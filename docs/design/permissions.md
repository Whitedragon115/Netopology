# Permission Model (A2)

> Status: **Draft v0.2**. Review decisions recorded in §6.
> Every API operation declares one **permission key** (`x-permission` in [openapi.yaml](../api/openapi.yaml)). The same key is used as the **audit log action**. This file is the single place that says who may use each key.

## 1. Actors

| Actor | How they authenticate | Scope |
|-------|----------------------|-------|
| **Anonymous** | nothing | setup status, login, share-link entry |
| **Account** | session cookie (from password, Google or Discord sign-in) | their own profile; workspaces they are a member of |
| **Server owner** | account with `instance_role = owner` (exactly one: the first account) | everything a server admin can do, plus managing server admins and transferring ownership |
| **Server admin** | account with `instance_role = admin` | create/disable accounts, create workspaces, server settings. **No access to workspace content** unless also a member. |
| **Owner / Admin / Editor / Viewer** | account + `workspace_members.role` | one workspace each; a user can hold different roles in different workspaces |
| **Guest** | share-link cookie (token + optional password) | one canvas, read-only |
| **System / Workflow** | internal | later phases (C3/C4) |

## 2. Core rules

1. **Server decides.** The UI may hide buttons, but every check below is enforced in the Go service layer.
2. **Not a member? 404.** If you are not a member of a workspace, everything in it returns **404**, so its existence isn't revealed. Members who lack a permission get **403**.
3. **Editor visibility set.** An editor sees:
   - the canvases granted to them (`canvas_grants`);
   - inventory items placed on those canvases;
   - areas referenced by those nodes (so the node's area name shows);
   - links whose two endpoints are both visible;
   - notes attached to visible items or placed on granted canvases, plus workspace-level notes.
   Anything outside the set is **404** for them.
4. **Editors create through their canvases.** When an editor creates a node, area or note, the request must include `placeOn` with a granted canvas; otherwise it would vanish from their view. Owner/admin may create unplaced items.
5. **Editors can't delete what others depend on.** An editor may delete an inventory item only if it is not placed on any canvas outside their grants (`409 inventory.used_elsewhere`).
6. **Protected items** (`is_protected` on workspace, canvas, node):
   - only the **owner** can delete them or clear the flag;
   - an **admin** can set the flag and edit the item, but can't delete it or unprotect it (`403 protected`);
   - an **editor** cannot change the flag.
7. **Owners are protected from admins.** An admin cannot add, change, or remove an owner, and cannot grant the owner role. A workspace must always keep **at least one owner** (`409 member.last_owner`).
8. **Locked canvas** = read-only for everyone until someone with edit rights on it unlocks it (`423 canvas.locked`). A lock is a safety catch against accidental edits, not a permission.
9. **Everyone can manage themselves**: read and update their own profile, change their password, link/unlink Google or Discord, leave a workspace (unless they are its last owner).
10. **No self-signup, including through Google/Discord.** A provider sign-in succeeds only if that identity is already linked to an existing account (`401 auth.identity_not_linked` otherwise). An identity gets linked in one of two ways:
    - the signed-in user links it from their profile (`me.identity_link`);
    - a server owner/admin creates the account **with an email address**; the first Google/Discord sign-in whose **provider-verified** email matches it is linked automatically (only if that account has no identity for that provider yet).
    An account must always keep at least one way to sign in (`409 auth.last_sign_in_method`).
11. **Area inner canvases** follow the area: visible to anyone who can see the area; editable by owner/admin, and by an editor when the area is placed on one of their granted canvases.
12. **Server roles and workspace roles are separate.** Being server owner/admin gives no access to a workspace's content; you must be a member. The workspace you create makes you its owner.

## 3. Permission table

Legend: **O** owner · **A** admin · **E** editor (within the visibility set / granted canvases) · **V** viewer · **G** guest (workspace roles) · **SO** server owner · **SA** server admin · **Acct** any signed-in account · **Anon** anyone.

### Setup, session, profile

| Key | Who | Notes |
|-----|-----|-------|
| `setup.status` | Anon | Says whether first-run setup is needed |
| `setup.complete` | Anon | **Only while no account exists.** Creates the first account (server owner) |
| `auth.providers` | Anon | Which sign-in methods are enabled (password, Google, Discord) |
| `auth.login` | Anon | Username + password. Rate-limited per IP and per username |
| `auth.oauth_start` / `auth.oauth_callback` | Anon | Google/Discord sign-in; succeeds only for linked identities (rule 10) |
| `auth.logout` | Acct | |
| `me.read` / `me.update` / `me.password` | Acct | Password change requires the current password; setting a first password on a provider-only account requires a recent provider sign-in |
| `me.identity_list` / `me.identity_link` / `me.identity_unlink` | Acct | Cannot unlink the last sign-in method |

### Instance (accounts and settings)

| Key | Who | Notes |
|-----|-----|-------|
| `user.list` / `user.read` | SO, SA | |
| `user.create` | SO, SA | Password, email (for Google/Discord auto-link), or both. Only SO can create server admins |
| `user.update` | SO, SA | Disable, edit, change server role. SA cannot modify the server owner or other server admins, and cannot grant `admin`/`owner`. SO can transfer ownership (becomes `admin`) |
| `user.password_reset` | SO, SA | Ends that user's sessions. SA cannot reset SO or other SAs |
| `user.lookup` | O, A of any workspace | Find a user by exact username to add as a member. Returns only id, username, display name |
| `instance.settings_read` / `instance.settings_update` | SO, SA | |

### Workspaces and members

| Key | O | A | E | V | Notes |
|-----|---|---|---|---|-------|
| `workspace.list` | ✔ | ✔ | ✔ | ✔ | Only workspaces you are a member of |
| `workspace.create` | SO, SA | | | | Only server owner/admin. The creator becomes the workspace owner |
| `workspace.read` | ✔ | ✔ | ✔ | ✔ | |
| `workspace.update` | ✔ | ✔ | | | Admin may set but not clear `isProtected` |
| `workspace.delete` | ✔ | | | | Not while protected |
| `member.list` | ✔ | ✔ | ✔ | ✔ | Editors/viewers see names and roles only |
| `member.add` | ✔ | ✔¹ | | | ¹ admin cannot add owners |
| `member.update` | ✔ | ✔¹ | | | role, `canViewSensitive`; ¹ not on owners, cannot grant owner |
| `member.remove` | ✔ | ✔¹ | self | self | ¹ not owners; last owner can't be removed |
| `member.grants_set` | ✔ | ✔ | | | Which canvases an editor may use |
| `audit.list` | ✔ | ✔ | | | |

### Inventory

| Key | O | A | E | V | Notes |
|-----|---|---|---|---|-------|
| `area.list` / `area.read` | ✔ | ✔ | ✔ vis | ✔ | |
| `area.create` | ✔ | ✔ | ✔ placeOn | | |
| `area.update` | ✔ | ✔ | ✔ vis | | |
| `area.delete` | ✔ | ✔ | ✔ rule 5 | | |
| `node.list` / `node.read` / `node.usage` | ✔ | ✔ | ✔ vis | ✔ | `usage` lists canvases using the node (for delete warnings); editors see inaccessible canvases only as a count |
| `node.create` | ✔ | ✔ | ✔ placeOn | | |
| `node.update` | ✔ | ✔ | ✔ vis | | `isProtected` per rule 6 |
| `node.delete` | ✔ | ✔² | ✔ rule 5² | | ² not protected |
| `node.health_set` | ✔ | ✔ | ✔ vis | | Manual health (phase C2); plugin health comes later |
| `link.list` / `link.read` | ✔ | ✔ | ✔ vis | ✔ | |
| `link.create` | ✔ | ✔ | ✔ both ends vis | | |
| `link.update` / `link.delete` | ✔ | ✔ | ✔ vis | | |
| `note.list` / `note.read` | ✔ | ✔ | ✔ vis | ✔ | Sensitive notes redacted (§4) |
| `note.create` / `note.update` / `note.delete` | ✔ | ✔ | ✔ vis³ | | ³ workspace-level notes: owner/admin only |

### Canvases and sharing

| Key | O | A | E | V | G | Notes |
|-----|---|---|---|---|---|-------|
| `canvas.list` / `canvas.read` / `canvas.view` | ✔ | ✔ | ✔ granted | ✔ | | `view` = everything needed to draw it. Area inner canvases per rule 11 |
| `area.canvas` | ✔ | ✔ | ✔ vis | ✔ | | Open an area's inner canvas (created on first open) |
| `canvas.create` | ✔ | ✔ | | | | 🟡 |
| `canvas.update` | ✔ | ✔ | | | | name, description, order, settings, default viewport |
| `canvas.delete` | ✔ | ✔² | | | | ² not protected |
| `canvas.edit` | ✔ | ✔ | ✔ granted | | | Place/move/remove items, shapes (canvas operations) |
| `canvas.lock` / `canvas.unlock` | ✔ | ✔ | ✔ granted | | | |
| `share_link.list` / `share_link.create` / `share_link.update` / `share_link.revoke` | ✔ | ✔ | | | | 🟡 |
| `share.info` / `share.unlock` / `share.view` | | | | | ✔ | Token (+ password if set); read-only canvas view |
| `events.stream` | ✔ | ✔ | ✔ | ✔ | | Events filtered by visibility set and redaction |

## 4. Redaction rules (applied by the server, per request)

| Data | Owner, Admin | Editor / Viewer **with** `canViewSensitive` | Editor / Viewer **without** | Guest |
|------|-------------|------------------------|------------------|-------|
| Sensitive field (`sensitive: true`) | value | value | `{key, label, sensitive: true, redacted: true}` (no value) | **omitted entirely** |
| Sensitive note | full | full | `{id, kind, isSensitive: true, redacted: true}` (empty title/body) | **omitted** |
| Area `cidr`, `vlanId` | shown | shown | redacted | omitted |
| Node/link `health.status` | shown | shown | shown | shown |
| Node/link `health.message` | shown | shown | shown | omitted |
| Created/updated by (user ids) | shown | shown | shown | omitted |
| Items not placed on the shared canvas | — | — | — | omitted |
| Notes not placed on the shared canvas | — | — | — | omitted |
| Credentials (phase C3) | **never returned to anyone**: write-only | | | |

The same rules apply to everything a user can read: list, single read, canvas view, SSE events, and (later) export.

## 5. Test matrix (written in B2, extended in C2)

Each row is an automated API test. Must pass in CI.

1. Non-member reads any workspace resource → **404** (workspace, node, canvas, share-link list, events).
2. Viewer: every write → **403**; reads succeed; sensitive values absent unless `canViewSensitive`.
3. Editor: canvas not granted → **404**; node only on an ungranted canvas → **404**; create without `placeOn` → **422**; delete node used on an ungranted canvas → **409**.
4. Admin: delete protected node/canvas/workspace → **403**; clear `isProtected` → **403**; change an owner's role → **403**; grant owner → **403**.
5. Owner: removing the last owner (including self) → **409**.
6. Guest: shared canvas view contains no sensitive field keys, no sensitive notes, no health messages, no user ids, no unplaced items; every non-share endpoint → **401**; expired or revoked link → **404**; wrong password → **401** and rate-limited.
7. Server admin who is not a member reads a workspace → **404**; server admin edits the server owner or grants `admin` → **403**; a member (not SO/SA) creates a workspace or account → **403**.
8. `setup.complete` after the first account exists → **409**.
11. Google/Discord sign-in with an unlinked identity → **401** `auth.identity_not_linked` (no account is created); with a matching **unverified** email → **401**; unlinking the last sign-in method → **409**.
9. Locked canvas: canvas operations by anyone → **423** until unlocked.
10. Stale `If-Match` version on update → **412**.

## 6. Decisions (confirmed in review)

1. Editors can't create or delete canvases; they edit the content of canvases granted to them.
2. Only workspace owners/admins create share links.
3. Only the **server owner/admin** create accounts and workspaces.
4. Guests see health status (colors) but not health messages, user names, or sensitive data.
5. Area CIDR and VLAN are treated as sensitive.
6. Sign-in with username/password, Google, or Discord; no self-signup (rule 10).
