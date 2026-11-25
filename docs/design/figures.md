# Thesis figures

How to regenerate every figure of the thesis from the running app, so the whole set can be
rebuilt after any UI change. Nothing here needs a screenshot tool: the app exports the files
itself (Settings → **Figures**, only visible while a room is open).

![Example: scene + HUD in figure mode](examples/threatscope-room-scene-hud-2400x1350-20261125-1754.png)

## Before you start

```bash
make reset-db        # otherwise figures show the old 300k-event "severe" demo state
make backend         # terminal 1
make frontend        # terminal 2   →  http://localhost:5173
make simulate        # terminal 3   →  streams the scenario into the backend
```

- Use a desktop window **at least 1280 px wide**. The fixed-size exports lay the HUD out as a
  1280×720 window, but the media queries read the real window, so a narrow one hides parts of it.
- Let the simulator run until the HUD shows the state you want (see the table), then pause it
  (`Ctrl+C`) so the figure and the state file describe the same moment.
- Arcs live 2.6 s. To get an arc in the picture, export while the simulator is running.

## Export options

| Option | File | Content |
|---|---|---|
| Scene PNG · window | `…-scene-<stamp>.png` | 3D view only, at window size × device pixel ratio (max 2) |
| Scene PNG · 2400×1350 | `…-scene-2400x1350-<stamp>.png` | 3D view only, 16:9, pixel ratio 1 |
| Scene + HUD PNG · window | `…-scene-hud-<stamp>.png` | scene with the HUD panels painted on top, window size |
| Scene + HUD PNG · 2400×1350 | `…-scene-hud-2400x1350-<stamp>.png` | same, HUD laid out for 1280×720 and scaled 1.875× |
| Timeline SVG | `…-timeline-<stamp>.svg` | vector timeline; **only shown once the timeline panel exists** |
| State JSON | `…-state-<stamp>.json` | `/api/state`, selected asset's `RiskState`, camera, settings, replay position |

File name: `threatscope-<space>-<view>-<YYYYMMDD-HHmm>.<ext>` (local time, `<space>` is the space id,
e.g. `room`).

**Figure mode** (switch above the buttons) gives the light print look and hides the cursor, hover
highlights, the demo feed control and the detail-card close button. Turn it on *before* exporting;
turning it off restores the live UI exactly. The 2400×1350 export keeps the camera angle but not
the framing: the camera aspect is changed to 16:9, so orbit with the target aspect in mind
(or export once and adjust).

## The figure set

Camera: orbit with the mouse, or click a device to fly to it. The pose is saved in the state file
(`camera.position`, `camera.target`), so a figure can be re-framed later.

| # | Figure | Space | Scenario / state | Selection | Replay position | Export |
|---|---|---|---|---|---|---|
| 1 | The 3D room, no UI | Minimal room | any, simulator paused | none | — | Scene PNG · 2400×1350, figure mode on |
| 2 | Room with live arcs | Minimal room | simulator at 2 threats/s | none | — | Scene PNG · 2400×1350, figure mode on, export while arcs are visible |
| 3 | Full product screen | Minimal room | simulator ran ≥ 1 min | none | — | Scene + HUD PNG · 2400×1350, figure mode on |
| 4 | Asset drill-down | Minimal room | as figure 3 | click `asset-open-data-portal` in the event list | — | Scene + HUD PNG · 2400×1350, figure mode on (detail card shows the risk) |
| 5 | Same figure, dark UI | Minimal room | as figure 3 | none | — | Scene + HUD PNG · 2400×1350, figure mode **off** |
| 6 | Timeline | Minimal room | recorded scenario | — | full window | Timeline SVG — *pending the timeline panel (`feat/ui-timeline`)* |
| — | Reproduction data | any | any | the asset shown | — (replay controls pending) | State JSON, next to every figure above |

Replay position and the timeline depend on the sprint-3 replay controls and the drill-down
timeline. Until they merge, the state file records `"replay": null` and the Timeline SVG button
is not shown. When they land, wire them in `main.ts` through `getReplay` and `getTimelineSvg`
of `createFigureTools` (`ui/figures.ts`); the export code does not change.

## Checking a figure

- PNG size: `file threatscope-*.png` must print exactly the stated size.
- Not black: the scene is copied out of the WebGL buffer in the same task as the render (the
  renderer has no `preserveDrawingBuffer`); an all-black PNG means that was broken.
- SVG: opens in a browser and in Inkscape. Text keeps `SF Mono`; convert text to outlines before
  sending to print if the font is not installed.

## How it works (for maintainers)

- `scene.captureFrame(w, h)` (`scene/room.ts`) renders one frame at pixel ratio 1, copies it into
  a 2D canvas, then restores the live size and camera aspect. `preserveDrawingBuffer` stays off.
- `ui/domPainter.ts` paints the HUD onto that canvas from the live DOM (backgrounds, borders,
  clipping, per-character text). It does not support shadows, gradients, images or backdrop blur;
  if the HUD starts using them, extend the painter or the exports will silently omit them.
- `ui/figures.ts` owns file names, downloads, the SVG serializer (inlines styles) and the state file.
- Figure mode = `body.figure-mode` (CSS in `styles/scene.css`) + `scene.setFigureMode()`.
