# UI Design (A4)

> Status: **Approved v0.3**. Visual direction approved; small polish happens during implementation (§8 lists the final review changes).

## 1. Files

| File | What it is |
|------|-----------|
| [`styles/tokens.css`](../../styles/tokens.css) | **The real design tokens** (light default + dark). The web app imports this file unchanged. |
| [`scripts/check-contrast.py`](../../scripts/check-contrast.py) | WCAG contrast check of key token pairs; both themes pass. |
| [`prototype/`](prototype/) | Clickable HTML prototype: plain HTML/CSS/JS, sample data, no API. Not production code. |
| [CONVENTIONS.md §5](../CONVENTIONS.md) | The design rules (tokens, node shapes, wires, layout) the app must follow. |

**Open the prototype:** serve the repo root, then open the prototype folder:

```bash
python -m http.server 8089
```

Then go to http://localhost:8089/docs/design/prototype/. The dark pill near the bottom is a prototype control (not product UI): screens, view as owner / editor / viewer, light / dark.

## 2. What changed in v0.2 (review feedback)

| Feedback | Now |
|----------|-----|
| Colors | Dify-like: soft gray canvas, white floating panels, blue accent, light theme by default |
| Node design | Full **card** with text inside: `[icon] title / type` + description. No text under nodes |
| "Pinned" feel | Everything **floats** over a full-screen canvas; no fixed header, rail or footer |
| Navbar in the header | Moved to a floating icon group at the **top right** |
| Switching canvases | In the **left panel**, foldable, with area canvases nested |
| Status footer | Removed; replaced by the **Monitor** section in the left panel |
| Search box | Removed; **Ctrl/Cmd+K** opens a command palette |
| Text overlapping wires | Text is inside cards; wires attach to card **edges** as smooth curves |
| Node shapes | Rounded box, square box, cloud; borders solid / double / dashed |
| Node colors | All nodes the same **gray**; only shape and border differ (status adds an icon, and red border when down) |

## 3. Layout

```
┌───────────────┐                                        ┌──────────────────┐ ┌────────┐
│ Home lab ▾  ▣ │                                        │ ☰  👥  ⚡  🧩  ⚙ │ │ Share  │ (AL)
│ ▾ CANVASES    │                                        └──────────────────┘ └────────┘
│   Physical    │                                                ┌──────────────────────┐
│     Remote    │             full-screen CANVAS                 │  Detail panel        │
│   Services    │                                                │  (when something     │
│ ▾ MONITOR     │                                                │   is selected)       │
│  1 down 1 deg │                                                │                      │
│  Game VM 2 …  │                                                │                      │
│ ● Live        │      ┌ tools │ undo redo │ legend │ − 100% + ⤢ ┐                      │
└───────────────┘      └──────────────────────────────────────────┘└──────────────────────┘
```

| Region | Contents |
|--------|----------|
| **Left panel** (floating, collapsible to a small pill) | Workspace switcher · **Canvases** (foldable; an area's inner canvas is nested under the canvas that shows it) · **Monitor** (foldable; down/degraded/unknown/healthy counts and a "needs attention" list that jumps to the node) · live/saved status |
| **Top right** | Floating icon group: Inventory, Members, Workflows (C4), Plugins (C3), Settings · Share (owner/admin) · account avatar |
| **Bottom center** | Floating toolbar: select, pan, add node, add area, link, sticky, text · undo/redo · legend & link visibility · zoom and fit |
| **Right** | Detail panel, only while something is selected (× or Esc closes) |
| **Overlays** | Inventory and Members as large floating sheets over the canvas; Ctrl/Cmd+K command palette; dialogs |

## 4. Node card

```
┌─────────────────────────────────┐
│ [icon]  Nginx Proxy Manager   ✓ │   ✓ = health icon (✓ ! × ?)
│         Reverse proxy           │   type
│─────────────────────────────────│
│ Routes *.example.com            │   description (optional)
└─────────────────────────────────┘
```

- Width fits the text (176-260 px); long text ends with "…" (full text in the detail panel).
- All cards are the same gray. **Category = shape + border:**

| Category | Shape | Border | Example |
|----------|-------|--------|---------|
| network | **elongated hexagon** (pointed ends with small arrows: traffic both ways) | solid | Router, L2TP gateway |
| compute | square box | **double** | Docker host, VMs |
| service | rounded box | solid | Nginx Proxy Manager, DNS, Pterodactyl |
| storage | rounded box | **double** | TrueNAS, Backup NAS |
| external | **cloud** | solid | Internet, Cloudflare |
| generic | rounded box | **dashed** | anything else |

- **Health:** icon at the top right; a **down** node also gets a red border. Nothing else changes color.
- **Collapsed area** is a card too: colored side stripe, stacked edge (= "more inside"), `Area · 5 nodes`, `1 down · double-click to enter`.
- **IPs and other fields are not shown on the card** (they live in the detail panel, where redaction applies). The description is free text the user writes.

## 5. Wires

- Smooth curves from the side of one card to the facing side of the other (left/right when nodes are side by side, top/bottom when stacked), with small port dots; arrowheads for directed kinds.
- Style by kind: physical solid · VPN dashed · proxy route solid + arrow · DNS dependency dotted + arrow · storage mount double line · logical thin light. A down link turns red.
- Optional label as a small pill at the middle of the curve.
- Links appear by themselves when both nodes are on the canvas; the legend (bottom bar) hides whole kinds per canvas; the link panel hides one link here.

## 6. Interaction rules

| Action | Result |
|--------|--------|
| Click | Select node / area / link → detail panel floats in |
| Drag a card | Move it on **this canvas only** |
| **Drag a card into / out of an area box** | Changes the node's area **in the inventory** (moves on every canvas) |
| Drag an area box | Moves the box and its contents |
| **Double-click a collapsed area** | Enter its inner canvas; left panel highlights it; Esc goes back |
| Collapse / expand | Per canvas, from the area header or the detail panel |
| Drag empty space / scroll | Pan / zoom; ⤢ fits everything between the floating panels |
| **Ctrl/Cmd+K** | Command palette: jump to a node, switch canvas, open Inventory/Members, share, switch theme |
| Monitor item | Jumps to that node (entering an area if needed) and selects it |
| Esc | Close palette / dialog / sheet → close legend → clear selection → leave area |

## 7. Role states (prototype "view as")

| | Owner | Editor (granted: Physical, Services) | Viewer | Guest (share link) |
|---|---|---|---|---|
| Left panel | yes | only granted canvases | yes | none: a small "shared from Home lab" pill |
| Top-right icons, Share | all + Share | icons, no Share | icons, no Share | none |
| Toolbar | tools | tools | "View only" pill + legend + zoom | "Shared view" pill + legend + zoom |
| Sensitive fields / CIDR | values | `Hidden` chip | `Hidden` chip | omitted |
| Notes tab | full | sensitive notes redacted | sensitive notes redacted | absent |
| Enter areas | yes | yes | yes | no |
| Delete a node used on a canvas they can't see | yes | blocked, explained | n/a | n/a |

## 8. Final review decisions (implemented in the real app, not in the prototype)

1. Shape mapping approved, plus **network = elongated hexagon** with arrow tips (router idea: traffic both directions).
2. Health on the card: icon only, red border when down.
3. Collapsed area card with side stripe and stacked edge: approved.
4. Light theme is the default.
5. **Inventory and Members move into the left panel** as tabs. Opening one does not leave the map: a content section fills the map area and the map behind it is blurred.
6. **Toolbar flyouts:** hovering a tool shows a menu of what it can create (e.g. Add node → the six node categories with their shapes; Area → colors; Link → link kinds; Note → note colors; Text → text, rectangle, ellipse, arrow, freehand).
7. **Resizable left panel:** drag its right edge (min 220 px, max 440 px); the width is remembered per browser.
8. The striped/dark **prototype control bar is prototype-only** and does not exist in the product.
