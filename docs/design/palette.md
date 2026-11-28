# Palette

The product has **no design tokens**. There is no `:root` block and no CSS custom property in
either stylesheet; every colour is a literal repeated at the rule that uses it. The “tokens”
below are therefore named roles, with the literal value and its actual consumers. Values were
read from `frontend/src/styles/scene.css`, `frontend/src/styles/menu.css` and
`frontend/src/scene/palette.ts`.

The UI is grayscale. Red is used only for errors and destructive actions; the legacy city
textures (not mounted, see the end) are the only other hue in the repository.

## Source aliases

Both stylesheets mix short and long hex forms. These are the same colour:

| Short | Long | Where |
|---|---|---|
| `#000` | `#000000` | `menu.css` buttons, fields, builder cells |
| `#fff` | `#ffffff` | `menu.css` ghost/palette hovers |
| `#555` | `#555555` | `menu.css` ghost/palette hover borders |
| `#444` | not used long | `menu.css` edit-button and builder-cell hover borders |

## Text and emphasis

| Value | Role | Where it is used |
|---|---|---|
| `#ffffff` | Highest emphasis: headings, active state, primary fill | `.hud-banner-level`, `.hud-panel-title`, `.hud-event-type`, `.hud-filter.active`, `.hud-toggle`, `.menu-wordmark`, `.menu-row`, `.topbar-btn:hover`, `.btn-solid` (`scene.css` 48, 67, 103, 127–128, 166, 184, 231, 245, 266, 306–309, 320, 451, 455–456, 511; `menu.css` 53, 74, 95–98, 106, 119–122, 130, 154, 163, 212, 261, 308, 322, 369, 401, 449–450, 582, 619, 633, 689–690, 793) |
| `#e8eaed` | Default body text | `.hud-panel`, `.hud-event`, `.hud-detail`, `#menu`, `#topbar`, `.modal`, `.export-btn`, `.field-input`, `.option b` (`scene.css` 83, 146, 212; `menu.css` 9, 229, 292, 396, 440, 612, 640, 795) |
| `#b0b3b8` | Secondary text | `.hud-banner`, `.feed-control button`, `.menu-status-ok .menu-status-text`, `.menu-notice`, `.topbar-btn`, `.btn-ghost`, `.palette-item` (`scene.css` 41, 443; `menu.css` 58, 196, 251, 680, 731) |
| `#6b6f76` | Muted labels and metadata | `.hud-banner-counts`, `.hud-event-asset`, `.hud-detail-row span:first-child`, `.feed-control`, `.topbar-title`, `.modal-note`, `.modal-row-text span`, `.modal-section h3`, `.export-status`, `.field-label`, `.option small` (`scene.css` 55, 189, 262, 421; `menu.css` 269, 329, 375, 426, 463, 604, 646) |
| `#555555` | Tertiary text / disabled | `.hud-filter` idle, `.hud-event-time`, `.hud-detail-close`, `.menu-status`, `.menu-notice-close`, `.modal-close`; also `.topbar-btn:hover` and `.feed-control button:hover` borders (`scene.css` 117, 172, 198, 238, 450; `menu.css` 41, 204, 260, 314) |
| `#333333` | Lowest-emphasis mark | `.hud-event.hud-sev-info .hud-event-dot`, `.hud-tag` border, `.menu-status-dot` (`scene.css` 173, 286; `menu.css` 48) |
| `#c8cbd0` | Tag text | `.hud-tag` (`scene.css` 288) |
| `#ff3b30` | Destructive / form error | `.menu-row-delete:hover`, `.modal-error` (`menu.css` 587, 658) |
| `#ff8a8a` | Export error status | `.export-status.error` (`menu.css` 468) |

## Surfaces, borders and disabled states

| Value | Role | Where it is used |
|---|---|---|
| `#000000` | The void / base surface | `html, body` background, `.hud-filter`, `.hud-toggle`, `.menu-new`, `.menu-row`, `#topbar` gradient endpoint (alpha), modal switch knob (`scene.css` 6, 116, 308, 321, 442, 457; `menu.css` 8, 97, 107, 121, 131, 153, 164, 406) |
| `#0a0a0a` | Raised surface | `.hud-filter.active` background, `.menu-notice`, `.modal` (`scene.css` 129; `menu.css` 195, 291) |
| `#050505` | Inset row / button | `.modal-row`, `.export-btn` (`menu.css` 345, 439) |
| `#151515` | Disabled solid button | `.btn-solid:disabled` background (`menu.css` 696) |
| `#1a1a1a` | Standard border / divider | HUD banner, panel, detail, panel head, divider, feed control, `.menu-brand`, `.modal-row`, `.modal-section`, `.option`, `.builder-grid` (`scene.css` 37, 79, 96, 208, 274, 417; `menu.css` 31, 343, 414, 498, 570, 627, 771) |
| `#2a2a2a` | Control border / switch track | `.hud-filter`, `.feed-control button`, `.topbar-btn`, `.modal`, `.modal-switch`, `.export-btn`, `.field-input`, `.btn-ghost`, `.palette-item` (`scene.css` 114, 440; `menu.css` 193, 248, 289, 383, 437, 609, 678, 695, 728) |
| `#3a3a3a` | Hover border / footer text | `.modal-row:hover`, `.modal-foot` (`menu.css` 351, 474) |
| `#3a1a1a` | Destructive hover border | `.menu-row-delete:hover` (`menu.css` 588) |
| `#444444` | Neutral hover border | `.menu-row-edit:hover`, `.cell:hover` (`menu.css` 583, 789) |
| `#55555c` | Builder / disabled text | `.menu-row-edit`, `.menu-row-delete`, `.btn-solid:disabled`, `.builder-hint`, `.cell`, `.builder-count` (`menu.css` 573, 697, 757, 781, 802) |
| `#666666` | Menu status “bad” | `.menu-status-bad .menu-status-dot`, `.menu-status-bad .menu-status-text` (`menu.css` 62, 66) |
| `#050507` | Space-builder stage | `.builder-grid` background (`menu.css` 773) |
| `#0b0b0e` | Empty builder cell | `.cell` background (`menu.css` 780) |
| `#151519` | Filled builder cell | `.cell.filled` background (`menu.css` 794) |
| `#1e1e24` | Builder cell border | `.cell` (`menu.css` 778) |

## Alpha surfaces

All overlays are black at partial alpha, so the scene shows through. Figure mode replaces them
with a near-opaque white surface.

| Value | Role | Where it is used |
|---|---|---|
| `rgba(0, 0, 0, 0.72)` | Floating chrome | `.hud-banner`, `.feed-control` (`scene.css` 39, 419) |
| `rgba(0, 0, 0, 0.78)` | Event panel | `.hud-panel` (`scene.css` 81) |
| `rgba(0, 0, 0, 0.82)` | Detail card / modal backdrop | `.hud-detail`, `.modal-backdrop` (`scene.css` 210; `menu.css` 281) |
| `rgba(0, 0, 0, 0.8)` → `rgba(0, 0, 0, 0)` | Top-bar fade | `#topbar` `linear-gradient` (`menu.css` 228) |
| `rgba(10, 10, 10, 0.8)` | Top-bar button | `.topbar-btn` (`menu.css` 250) |
| `rgba(20, 20, 20, 0.9)` | Top-bar button hover | `.topbar-btn:hover` (`menu.css` 262) |
| `rgba(0, 0, 0, 0.6)` | Notice shadow | `.menu-notice` `box-shadow` (`menu.css` 198) |
| `rgba(0, 0, 0, 0.7)` | Modal shadow | `.modal` `box-shadow` (`menu.css` 293) |
| `rgba(255, 255, 255, 0.06)` | Event-row hover | `.hud-event:hover` (`scene.css` 155) |
| `rgba(255, 255, 255, 0.6)` | Connected-status glow | `.menu-status-ok .menu-status-dot` `box-shadow` (`menu.css` 54) |
| `rgba(255, 255, 255, 0.92)` | Figure-mode panel surface | `body.figure-mode .hud-banner/.hud-panel/.hud-detail` (`scene.css` 485) |
| `transparent` | Ghost backgrounds, hollow dots | `.hud-event`, `.hud-detail-close`, figure-mode medium/low dots, `.modal-close`, `.btn-ghost` (`scene.css` 145, 171–172, 237, 531, 541, 546; `menu.css` 203, 313, 679) |

## Figure-mode (print) palette

Figure mode is defined inside `body.figure-mode` in `scene.css` and swaps only the HUD; the 3D
scene is swapped in `room.ts` (next section).

| Value | Role | Where it is used |
|---|---|---|
| `#15171a` | Print primary text | Figure-mode panel text, event type, detail value (`scene.css` 487, 523) |
| `#5d6168` | Print secondary text | Counts, asset labels, detail labels (`scene.css` 503) |
| `#7a7d83` | Print timestamp | `.hud-event-time` (`scene.css` 527) |
| `#8a8d93` | Print idle filter text / low dot border | `.hud-filter`, low dot (`scene.css` 513, 547) |
| `#c4c4be` | Print filter border / info dot | `.hud-filter`, info dot (`scene.css` 512, 551) |
| `#c9c9c3` | Print panel border | Panels (`scene.css` 486) |
| `#d6d6d0` | Print panel-head divider | `.hud-panel-head` (`scene.css` 507) |
| `#f1f1ee` | Print active filter background | `.hud-filter.active` (`scene.css` 517) |
| `#000000` | Print headings and filled dots | Banner level, kill chips, title, event type, strong text, critical/high dots (`scene.css` 497, 518–519, 537, 542) |
| `#ffffff` | Print filter background | `.hud-filter` (`scene.css` 511) |

## Severity dots

The event list repeats the severity encoding at 8×8 px. It is monochrome in both looks; the
difference is fill versus hollow, not hue.

| Severity | Live (`scene.css`) | Figure mode (`scene.css`) |
|---|---|---|
| `critical` | filled `#ffffff` (169) | filled `#000000` (537) |
| `high` | filled `#ffffff` at `opacity: 0.85` (170) | filled `#000000` (537) |
| `medium` | `transparent` + `1px solid #ffffff` (171) | `transparent` + `#000000` border (542) |
| `low` | `transparent` + `1px solid #555555` (172) | `transparent` + `#8a8d93` border (547) |
| `info` | `#333333` (173) | `#c4c4be` (551) |

The base `.hud-event-dot` rule is an 8×8 px `#ffffff` square (162–167). An unknown severity adds
`hud-sev-<value>` and therefore falls back to that base square; it is not given a separate style.

## 3D scene palette (`room.ts`)

`createRoomScene` builds its own materials. Every material that changes between looks is
registered with `themedMaterial(material, lightColour)`; `setFigureMode` walks that list.

| Element | Live | Figure mode | Source |
|---|---|---|---|
| Background | `0x000000` | `0xffffff` | `room.ts` 212, 499 |
| Floor | `0x1a1a1a` | `0xe6e6e2` | `room.ts` 250 |
| Walls (35 % opacity) | `0x0a0a0a` | `0xd4d4ce` | `room.ts` 255 |
| Floor grid | `0x333333` | `0xb8b8b2` | `room.ts` 268 |
| Devices | `0xffffff` | `0xdde1e7` | `room.ts` 297 |
| Device wireframe edges | `0x000000` | `0x000000` (not themed) | `room.ts` 312 |
| Uplink ring | `0xffffff` | `0x15171a` | `room.ts` 333 |
| Arcs, packets, unknown-target marker | `0xffffff` | `0x15171a` | `roomArcs.ts` 73; `room.ts` 501 |
| Device labels | `#000000` fill, `#ffffff` stroke | unchanged | `room.ts` 319; `textures.ts` 36–43 |

Figure mode also switches tone mapping from `ACESFilmicToneMapping` to `NoToneMapping`, so the
white page stays white (`room.ts` 503).

## Per-kind style record (`scene/palette.ts`)

The record is typed `Record<AssetKind, KindStyle>`. Every kind has the same colour:

| Kind | `color` | `label` | `emissive` | `roughness` | `metalness` |
|---|---|---|---|---|---|
| `scada` | `0xffffff` | `#ffffff` | 0.45 | 0.35 | 0.6 |
| `server` | `0xffffff` | `#ffffff` | 0.4 | 0.35 | 0.65 |
| `gateway` | `0xffffff` | `#ffffff` | 0.45 | 0.3 | 0.7 |
| `district` | `0xffffff` | `#ffffff` | 0.35 | 0.4 | 0.45 |
| `db` | `0xffffff` | `#ffffff` | 0.4 | 0.32 | 0.65 |
| `service` | `0xffffff` | `#ffffff` | 0.38 | 0.4 | 0.55 |
| `cctv` | `0xffffff` | `#ffffff` | 0.4 | 0.35 | 0.6 |
| `external` | `0xffffff` | `#ffffff` | 0.5 | 0.25 | 0.7 |

`FALLBACK_KIND = 'service'`; `kindStyle()` returns the service row for an unknown kind instead of
throwing (`palette.ts` 23–31). The room scene never calls these helpers: it builds one white box
per device, so **kind is not visually encoded in the room** at all.

## Contradiction: `docs/scene.md` kind colours

`docs/scene.md` (“Asset kinds”) still lists amber for `scada`, blue for `server`, teal for
`district`, violet for `db`, orange for `cctv` and red for `external`. The code does not do this:
`palette.ts` sets every kind to white, and the room does not use the record. Treat that colour
column as a description of an earlier city-model look, not the current room.

## Not copied into this palette

`frontend/src/scene/textures.ts` still contains blue/teal values for the unmounted city scene
(`rgba(47,129,247, …)` glow, `#04080f` ground, `ALMATY` watermark). `city.legacy.ts` and
`office.legacy.ts` import them, but neither scene is mounted (`main.ts` only registers `room`).
They are not part of the current product palette.
