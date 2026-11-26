# Data contract

The single source of truth shared by frontend, backend and simulator.
**Status:** draft v0.2 — owned by Cyber A, path/shape owned by Cyber B, visible-fields owned by
the design owner. Change via PR, all three approve.

## SecurityEvent

The atom of the whole system. One record = one thing that happened.

```jsonc
{
  "id": "01J8Z6K3VQ9F3T0M9W2B7C4D1E",   // ULID, stable, sortable
  "ts": "2026-11-10T09:14:22.481Z",       // ISO-8601 UTC, event time
  "type": "port_scan",                     // machine category, see enum
  "severity": "medium",                    // info | low | medium | high | critical
  "src": {                                 // who acted
    "ip": "203.0.113.44",
    "host": null,                          // reverse-dns / agent name if known
    "asset_id": null                       // set if src is a known internal asset
  },
  "dst": {                                 // who was hit
    "ip": "10.10.4.21",
    "host": "egov-portal",
    "asset_id": "asset-egov-portal"        // null if unmapped
  },
  "description": "TCP SYN sweep across 1-1024 on egov-portal",
  "mitre": {                               // optional, from enrichment
    "tactic": "discovery",
    "technique_id": "T1046",
    "technique": "Network Service Discovery"
  },
  "risk_delta": 4.0,                       // contribution to dst risk, 0..100 scale
  "raw_source": "suricata",                // which adapter produced it
  "meta": {}                               // adapter-specific extras, free-form
}
```

### `type` enum (v0.1)

`recon`, `port_scan`, `phishing`, `credential_attack`, `c2_beacon`, `malware`,
`lateral_movement`, `ddos`, `web_attack`, `defacement`, `data_exfiltration`,
`ransomware`, `scada_intrusion`, `cctv_breach`, `policy_violation`, `anomaly`, `other`.

Unknown types must degrade gracefully: frontend renders `other` styling, never crashes.

## Asset

A node in the 3D city.

```jsonc
{
  "id": "asset-water-scada",
  "name": "Water SCADA",
  "kind": "scada",              // scada | server | gateway | district | db | service | cctv | external
  "criticality": 5,             // 1..5, used by risk engine for weighting
  "district": "Almaly",
  "position": { "x": 12.5, "y": 3.0, "z": -8.2 },  // frontend scene coordinates
  "ip": "10.20.0.5",            // optional
  "tags": ["critical-infrastructure", "ics"]
}
```

`kind` maps to a mesh style in `frontend/src/scene`. `position` is owned by the frontend —
backend stores it only so layouts are reproducible.

## Link

```jsonc
{ "source": "asset-egov-portal", "target": "asset-municipal-dc", "kind": "network" }
```

`kind`: `network` | `dependency` | `dataflow`.

## RiskState (per asset)

```jsonc
{
  "asset_id": "asset-water-scada",
  "risk": 72.5,                 // 0..100
  "state": "elevated",          // ok | elevated | critical | compromised
  "events_24h": 14,
  "last_event_ts": "2026-11-10T09:14:22.481Z",
  "top_types": ["scada_intrusion", "recon"]
}
```

## Aggregate state

```jsonc
{
  "threat_level": "elevated",   // low | guarded | elevated | high | severe
  "counts": { "info": 120, "low": 40, "medium": 18, "high": 6, "critical": 2 },
  "compromised_assets": 3,
  "kill_chain": {               // 0..1 progress per stage, from event types in the last 24 h
    "reconnaissance": 1.0, "initial_access": 0.8, "c2": 0.6,
    "exploitation": 0.4, "lateral_movement": 0.2, "impact": 0.1
  },
  "top_types": [ { "type": "port_scan", "count": 58 } ]
}
```

## Space

A persistent room layout. The frontend owns coordinates; the backend validates bounds and stores
what it is sent. `asset_id` has no foreign key: a write with an unknown asset is a **422**, but a
layout survives later inventory reseeds.

```jsonc
{
  "id": "room",                               // explicit on create, else generated
  "name": "Room",                             // trimmed, 2..40 chars
  "template": "room",                         // known template
  "components": [                             // 0..64 entries, unique component ids
    {
      "id": "room-rack",                      // stable id from frontend/src/scene/roomMap.ts
      "kind": "rack",                         // rack | switch | pc | monitor | nas | cam | iot
      "x": -4.0,                              // room metres, -6..6
      "z": -3.0,                              // room metres, -5..5
      "asset_id": "asset-municipal-dc"        // always present; null when unbound
    }
  ],
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z"
}
```

`POST /api/spaces` accepts an optional explicit `id` so clients can keep their own stable ids
(409 on duplicate); one is generated when omitted. Unknown spaces are 404 on read/update/delete.
The built-in `room` is seeded with the eight devices of the current room, with ids, kinds and
floor positions from `frontend/src/scene/room.ts` and asset bindings from `roomMap.ts`.
localStorage layouts are **not** migrated in this phase.

`GET /api/spaces/{id}/risk` returns one entry per component, in stored order. Bound assets reuse
`repository.get_risk()` — no new scoring — and mirror `GET /api/assets/{asset_id}/risk`. An
unbound component, or one whose asset is no longer in the inventory, returns **null** for all
three risk fields (never a zero score); the stored `asset_id` is preserved so a stale binding
remains visible.

```jsonc
{
  "id": "room",
  "components": [
    {
      "id": "room-rack",
      "asset_id": "asset-municipal-dc",
      "risk": 42.5,
      "state": "elevated",
      "events_24h": 12
    },
    {
      "id": "room-cam",
      "asset_id": null,
      "risk": null,
      "state": null,
      "events_24h": null
    }
  ]
}
```

**Consumers:** the frontend data wrappers (`frontend/src/data/api.ts`) and the room risk overlay
consume component ids, `asset_id` and the three risk fields; the backend reads `RiskSnapshot`
through `repository.get_risk()`. Cyber A's scoring does not write spaces.

## Endpoints (owned by Cyber B)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/assets` | `{ assets: Asset[], links: Link[] }` |
| GET | `/api/events` | query: `from,to,severity,type,asset_id,limit,cursor` → `{ events, next_cursor }` |
| GET | `/api/assets/{id}/risk` | `RiskState` |
| GET | `/api/state` | aggregate state |
| GET | `/api/spaces` | `{ spaces: Space[] }` |
| POST | `/api/spaces` | create from `Space` (optional `id`; 409 on duplicate) → `201 Space` |
| GET | `/api/spaces/{id}` | `Space` or 404 |
| PUT | `/api/spaces/{id}` | full replace of `name` + `components` → `Space`; 404 |
| DELETE | `/api/spaces/{id}` | `204`; 404 when unknown |
| GET | `/api/spaces/{id}/risk` | `SpaceRisk`; 404 when unknown |
| WS | `/ws/events` | live frames, see below |
| GET | `/healthz` | `{ "status": "ok" }` |

## WebSocket frames

Server → client only (v0.1). Every frame:

```jsonc
{ "kind": "event", "data": { /* SecurityEvent */ } }
{ "kind": "state", "data": { /* aggregate state */ } }   // throttled, ~1/s
{ "kind": "risk",  "data": { /* RiskState */ } }
```

Client → server (optional, phase 4+): `{ "kind": "filter", "data": { "severity": [...] } }`.

## Rules

1. Additive changes only within a phase; breaking changes bump `v0.x` in this doc and require
   all three owners to approve.
2. Missing/unknown values are `null`, never absent keys, never `""`.
3. Timestamps are ISO-8601 UTC strings.
4. IDs are stable strings; never reuse an `id`.
5. Any new field must say who consumes it (frontend / scoring / logging).
