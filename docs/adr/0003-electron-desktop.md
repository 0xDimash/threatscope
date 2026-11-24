# ADR 0003 — Electron desktop build for the game jam

- **Status:** accepted (additive; jam-only distribution path)
- **Date:** 2026-11-24

## Context

The 3 December submission must be a Windows `.exe` that runs on a clean Windows 10 with no
installs. A throwaway spike (`0xDimash/packaging-spike`, branch `spike/electron-packaging`) proved
that electron-builder cross-builds a Vite + Three.js app into a Windows zip from Linux, and that
the WebGL cube renders inside Electron.

## Decision

Add an Electron shell around the **existing** frontend build:

- `frontend/electron/main.cjs` opens a 1280×720 window with `autoHideMenuBar: true`,
  `contextIsolation: true` and `nodeIntegration: false`.
- It serves `frontend/dist/` from a tiny local HTTP server on `http://localhost:5173`, then loads
  that URL. This keeps the backend's existing `CORS_ORIGINS=http://localhost:5173` unchanged and
  lets the frontend's REST/WebSocket URL resolution work without build-time overrides.
- `frontend/vite.config.ts` sets `base: './'` so packaged assets resolve in every target.
- electron-builder produces `--linux AppImage` and `--win zip` artefacts from the same source.

The Python backend is **not** bundled. The desktop app is a client: the FastAPI backend must still
run (locally on port 8000, or at a configured `VITE_API_BASE`/`VITE_WS_URL`). Bundling Python into
a Windows exe would need a Windows host and PyInstaller, which we do not have before the jam.

## Consequences

- Docker Compose remains the development stack from ADR 0001; Electron is an extra distribution
  path, not a replacement.
- The zip is unsigned, so Windows SmartScreen shows "unknown publisher" — expected path is
  More info → Run anyway.
- Port 5173 must be free when the desktop app launches (`npm run dev` uses the same port).
- New dependencies: `electron@45.4.1`, `electron-builder@26.18.0` (dev-only, packaging tooling).

## Revisit if

- The jam requires a truly standalone exe with no separate backend — then build the backend with
  PyInstaller on a Windows machine and launch it from the Electron main process.
- The team deploys the backend publicly — then set `VITE_API_BASE`/`VITE_WS_URL` at build time and
  drop the local server.
