# Frontend — ThreatScope 3D

Vite + TypeScript + Three.js.

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run build
```

## Module rules

| Dir | May import | Must NOT |
|---|---|---|
| `scene/` | three, `types/` | `data/`, `ui/`, `viz/` |
| `viz/` | three, `types/`, `scene/` | `data/`, `ui/` |
| `ui/` | DOM, `types/` | `data/` directly (use a store passed in) |
| `data/` | `types/`, fetch/WebSocket | three, `ui/`, `scene/` |

`data/mock.ts` implements the same contract as the backend, so the whole 3D layer is
developable without a server. Switch to real data with `VITE_API_BASE`.
