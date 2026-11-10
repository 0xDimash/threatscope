# Data contract

The single source of truth shared by frontend, backend and simulator.
**Status:** draft v0.1 — owned by Cyber A, path/shape owned by Cyber B, visible-fields owned by
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
  "kill_chain": {               // 0..1 progress per stage
    "reconnaissance": 1.0, "initial_access": 0.8, "c2": 0.6,
    "exploitation": 0.4, "lateral_movement": 0.2, "impact": 0.1
  },
  "top_types": [ { "type": "port_scan", "count": 58 } ]
}
```

## Endpoints (owned by Cyber B)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/assets` | `{ assets: Asset[], links: Link[] }` |
| GET | `/api/events` | query: `from,to,severity,type,asset_id,limit,cursor` → `{ events, next_cursor }` |
| GET | `/api/assets/{id}/risk` | `RiskState` |
| GET | `/api/state` | aggregate state |
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
