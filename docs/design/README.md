# Design system — ThreatScope 3D

This directory is the citable description of the product's visual system. Every value here was
read from the code on **2026-11-28**; nothing is reconstructed from memory or from a design file.
Where the code contradicts an older document, the page records the contradiction instead of
smoothing it over.

## Pages

| Page | What it answers |
|---|---|
| [palette.md](palette.md) | Every colour literal in `frontend/src/styles` and `scene/palette.ts`, its value and where it is used. |
| [severity-encoding.md](severity-encoding.md) | Why the attack arcs are monochrome, and the real width / opacity / dash / packet-size mapping. |
| [typography-and-layout.md](typography-and-layout.md) | Font stacks, type sizes, HUD geometry, and every media query, including the 1440 and 390 captures. |
| [decisions.md](decisions.md) | Monochrome arcs, honest arcs for unmapped destinations (PR #48), HUD detail card (PR #47) — problem, options, choice, before/after. |
| [figures.md](figures.md) | Reproducing the thesis figures from the running app (figure mode / print look), with exact steps. |

## What was read

| Source | Used for |
|---|---|
| `frontend/src/styles/scene.css` (552 lines) | HUD, figure mode, phone sheet, severity dots. |
| `frontend/src/styles/menu.css` (816 lines) | Landing, top bar, settings, spaces, builder. |
| `frontend/src/scene/palette.ts` | Per-kind scene style record. |
| `frontend/src/scene/room.ts` | Room materials, live/print swap, camera, capture. |
| `frontend/src/viz/roomArcs.ts`, `frontend/src/viz/arcEndpoints.ts` | Attack-arc constants, endpoint rules, unknown-target marker. |
| `frontend/src/ui/hud.ts`, `frontend/src/ui/assetInfo.ts` | HUD structure, inventory fields, event-row fallback. |
| `frontend/src/ui/figures.ts`, `frontend/src/ui/domPainter.ts` | Export sizes, file names, HUD painting limits. |
| `docs/images/ui/*.png`, `docs/design/examples/*` | The screenshots reused on these pages. |

## State this was checked against

The task's three decisions include PR **#47** (`feat/ui-asset-detail`) and PR **#48**
(`fix/viz-unmapped-dst`). Both were **open** on 2026-11-28. The screenshots and the code for those
two decisions exist on those branches, so this documentation was written against their combined
state (the local merge of both branches) rather than against `main` at `3a659a3`, which does not
contain them yet. The pages say where a statement depends on an open PR. Once #47 and #48 merge,
the links in this directory resolve on `main` without changes.

The frontend was **not rebuilt or run** for this documentation. Values come from reading the
source, and screenshots come from the repository. This is noted again in [figures.md](figures.md).

## Conventions

- **Live look** — the dark UI used while the app runs: black background, white 3D devices.
- **Figure mode** — the light print variant toggled from Settings → Figures. It is a
  `body.figure-mode` class plus `scene.setFigureMode(true)`; removing both restores the live look.
- **Desktop / phone** — the screenshots are 1440×900 and 390×844 CSS-pixel captures. The CSS has
  no `1440` or `390` breakpoint; see [typography-and-layout.md](typography-and-layout.md).

## Known mismatches, in one place

These are checked facts, detailed on the linked pages:

1. **No design tokens exist.** Both stylesheets use literal hex and rgba values; there are no CSS
   custom properties and no `:root` block. The “tokens” in [palette.md](palette.md) are named roles
   assigned to repeated literals.
2. **`docs/scene.md` kind colours are stale.** Its table says `scada` is amber, `server` blue, and
   so on, but `frontend/src/scene/palette.ts` sets `color: 0xffffff` and `label: '#ffffff'` for
   all eight kinds. The room scene does not use `palette.ts` at all; it draws white boxes.
3. **The `speed` field in the arc styles is unused.** `roomArcs.ts` declares it per severity and
   nothing reads it, so packets take the same time at every severity. Severity is carried by
   width, opacity, dash pattern and packet size only.
4. **The Bloom setting does not affect the room.** `room.ts` creates its render context with
   `bloom: false`; the setting is still persisted and written into the figure state file.
5. **The “desktop 1440” detail screenshot is 800×500 px.** It was captured in a 1440×900 window
   but saved at 800 px wide (PR #47 notes this). Use [figures.md](figures.md) for print-resolution
   output, not that PNG.
6. **`main.ts` holds two live-feed subscriptions.** The room handler and the module-level
   `window.__threatscopeLive` handler both call `spawnArc`, each on its own socket. Reading the
   code, every event is drawn twice while a room is open; see
   [severity-encoding.md](severity-encoding.md#edge-cases-checked-in-code). This was not observed
   in a browser for this documentation.

## Adding to this directory

Write from the code, name the file and selector/constant, and state anything that could not be
checked. Do not add a diagram tool, a CSS variable layer, or a build step: the thesis cites plain
Markdown and the existing PNG exports.
