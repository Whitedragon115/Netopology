# Netopology

**One place to draw, understand, and operate your whole infrastructure.**

Netopology links the tools you already run into a single visual map, so you can see how everything connects, see where it breaks, and automate the jobs that cut across several tools.

> **Status: early design phase.** Nothing is released yet. This page describes the concept and the thinking behind it. See [IDEA.md](IDEA.md) for the full design discussion and [docs/CONVENTIONS.md](docs/CONVENTIONS.md) for the engineering rules.

---

## The problem

A real network is rarely one product. A typical home lab or small business runs a reverse proxy, a tunnel, a DNS server, a router, a NAS, a container platform, a game panel, remote sites joined by VPN, and a pile of virtual machines.

Each of those has its own interface, its own login, and its own way of thinking. That causes two problems:

1. **Nobody has the whole picture.** The real architecture lives in someone's head, or in a stale diagram.
2. **Everyday tasks cross tools.** Adding one domain can mean editing Cloudflare, then the local DNS, then the reverse proxy, in three different places, in the right order, without forgetting one.

Existing tools each solve part of this:

| Tool | Good at | Missing |
|------|---------|---------|
| Network visualizers | Showing connections | They stop at the network; they don't know about services and infrastructure |
| Workflow tools (n8n, Dify) | Chaining services and functions | They have no idea what your network looks like |
| Inventory tools (NetBox) | Recording what exists | Not visual-first, and they don't act on anything |
| Diagram tools (Packet Tracer, Excalidraw) | Drawing | The drawing isn't connected to anything real |

## The idea

Netopology combines these into one tool:

- **A drawn map of your real infrastructure**, in the spirit of Cisco Packet Tracer, but for real machines and services instead of a simulation.
- **Nodes you can actually control**, through plugins, instead of just pictures.
- **Workflows you write once** and run across many tools.

It does not replace the tools you use. Nginx Proxy Manager is still Nginx Proxy Manager. Netopology sits above them, shows how they relate, and gives you one place to operate them from.

## How it is organized

### Workspaces: one network, one environment

A **workspace** is a self-contained environment, usually one network (for example "Home lab" or "Client A"). Everything inside a workspace belongs to it alone: its devices, plugins, credentials, workflows, and members. Nothing leaks between workspaces, so you can run several without them affecting one another.

### Inventory: the single source of truth

Inside a workspace there is one shared **inventory**:

- **Nodes**: anything that exists in your network (a router, a VM, a reverse proxy, a NAS, a cloud service).
- **Links**: how nodes relate (a physical cable, a VPN tunnel, a proxy route, a DNS dependency, a storage mount).
- **Areas**: places that group nodes (a site, a LAN, a VLAN). Areas can contain other areas.
- **Notes**: written knowledge attached to anything, so documentation lives next to what it describes.

A node exists once. Rename it, change its health, or connect a plugin to it, and that is true everywhere it appears.

### Canvases: many views of the same network

A **canvas** is a drawn view of the inventory. You can create as many as you like, each showing the network the way you want to read it:

- a physical view: devices, cables, sites
- a service view: which service sits behind which proxy
- a traffic view: the path a request takes from the internet to an app

Because the inventory is shared, the same router can appear on all three canvases, in different positions and styles, and always stay the same router. Removing something from a canvas only removes it from that picture; deleting it from the inventory removes it everywhere (and tells you what it affects).

Shapes carry meaning: a storage node looks like storage, an external service looks like a cloud, and different link styles mean different relationships. Health is shown with color and an icon, so you can see at a glance where something is wrong, and areas roll up the health of what is inside them.

### Plugins: making nodes controllable

Netopology does not hard-code support for every tool. Instead, **plugins** teach it how to talk to one.

A plugin can provide:

- **Node types** (what a Cloudflare zone or a Pterodactyl panel is)
- **Actions** (add a DNS record, create a proxy host)
- **Health checks** (is this thing up?)
- **Panels** (a small dashboard for that node)

Anyone can write a plugin in TypeScript or Python, and every plugin exchanges plain JSON with Netopology, so the contract is simple and language-neutral. Plugins are installed and run on the server side, inside an isolated sandbox, never in the browser. The long-term aim is a shared plugin marketplace so the community can cover tools the core team never touches.

### Workflows: your own automation

A **workflow** is a script you write, plus the conditions that start it: run it by hand, on a schedule, from a webhook, or when a node changes state.

The problem from the start becomes one workflow: "add domain" calls Cloudflare, then local DNS, then the reverse proxy, in order. You decide what it does; Netopology provides the building blocks and keeps a detailed log of every step.

Workflows are honest about failure. Changes across several systems can't be made fully atomic, so Netopology does not pretend otherwise. It records what every step received and returned, lets plugins offer an optional rollback action, supports dry runs and step testing, and gives you the evidence to fix a half-finished run.

### A workspace that fits you

The side panels are yours to arrange. You can show built-in node details and plugin panels, or embed tools you already like (an uptime monitor, a metrics dashboard) in an iframe, so Netopology doesn't have to rebuild every dashboard that already exists.

### People and access

Netopology has accounts and per-workspace roles:

| Role | In short |
|------|----------|
| **Owner** | Everything in the workspace |
| **Admin** | Almost everything, but cannot delete protected core items |
| **Editor** | Edits the canvases they've been given access to |
| **Viewer** | Sees all canvases, read-only; sensitive details only if an admin allows it |
| **Guest** | Read-only view of specific canvases through a share link, optionally password-protected; never sees sensitive details |

Two kinds of private information are kept distinct. **Credentials** (API tokens, passwords) are write-only: once saved, nobody can read them back, and only the plugin that needs one receives it. **Sensitive information** (IP addresses, hostnames, certain notes) can be shown or hidden depending on who is looking, and the server removes it before sending, so it never reaches the browser of someone who shouldn't see it.

## Design principles

1. **Link, don't replace.** Netopology works with the tools you already have.
2. **A model, not just a drawing.** The map is a typed graph, so health checks and workflows can reason about it ("what breaks if this router goes down?").
3. **Netopology doesn't touch your network plumbing.** It doesn't create VPNs or tunnels. You connect your networks; Netopology models and manages them.
4. **Self-hosted and local-first.** Your infrastructure map is sensitive, so it runs on your own hardware, under your control.
5. **Extensible by design.** Plugins and workflows are the way to grow, not a bigger core.
6. **Honest about failure.** Log everything, make rollbacks optional but possible, and never pretend cross-system changes are atomic.
7. **Secure by default.** Server-side permission checks, write-only credentials, isolated workspaces, and a sandboxed plugin runtime.
8. **Status at a glance.** Health is always visible, and never conveyed by color alone.

## How it is built (in brief)

Netopology is designed as a small set of cooperating containers: a web interface, a Go backend (an API and a background worker), a sandbox where plugins and workflow scripts run, and a PostgreSQL database, optionally behind an nginx gateway. Splitting it this way keeps responsibilities separate and keeps untrusted plugin code away from the database. The details are in [IDEA.md](IDEA.md).

## Roadmap

1. **Foundation**: accounts, workspaces, roles, and the project skeleton
2. **The map**: inventory, canvases, notes, and health display
3. **Plugins**: the sandbox, the plugin SDK, and first plugins (Cloudflare, Nginx Proxy Manager, DNS)
4. **Workflows**: scripts, triggers, run logs, and rollback
5. **Customization**: side panels, iframe embeds, and workspace export/import
6. **Ecosystem**: Python plugins and a community plugin marketplace
7. **Later**: automatic discovery of devices, a rules engine, single sign-on

## Contributing & license

The project is intended to be open source under a permissive license. Contribution guidelines and the final license will be added as the project takes shape. For now, ideas and feedback on the design are the most useful contribution.
