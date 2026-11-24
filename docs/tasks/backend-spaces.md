# Task for the backend agent: persistent spaces + per-device risk

Paste everything below into the backend developer's agent as one message.

---

## Context

The frontend now lets a user build a room from scratch: pick a device kind (rack, switch,
workstation, NAS, camera, IoT hub), click a grid slot, name the space, and open it at
`#/space/<id>`. Shipped in PR #38 (`feat(ui): build a custom room from scratch`). Today:

- a space lives **only in `localStorage`** (`ts.spaces.v1`) — it dies with the browser profile
  and does not exist for anyone else;
- placed devices have **no identity beyond a position** (`{ kind, x, z }`), so they cannot
  receive events, cannot be mapped to inventory, and clicking one shows `no risk data`;
- the built-in room works only because `frontend/src/scene/roomMap.ts` hard-codes eight
  device → asset pairs.

We need the layout to be a backend resource so it can be shared, reproduced in a defence demo,
and scored.

## Your zone

`backend/app/models/`, `backend/app/schemas/`, `backend/app/api/`, `backend/app/services/`,
`backend/tests/`, and the contract file `docs/api-contract.md`.
Do not touch `frontend/`.

## Scope: a `spaces` resource

One new table, one new router (`prefix="/api"`), same style as `app/api/assets.py`.

### Model (`app/models/space.py`)

```python
class Space(Base):
    __tablename__ = "spaces"
    id: str            # slug, e.g. "room" (seeded) or "space-lab-a-7f3k"
    name: str          # 2..40 chars
    template: str      # "room" today; enum for future scenes
    components: JSON   # list of Component dicts, see contract
    created_at / updated_at
```

`Component`:

```jsonc
{
  "id": "c1",              // unique inside the space, client-generated, stable across edits
  "kind": "rack",           // rack | switch | pc | nas | cam | iot
  "x": -0.75,               // room coordinates, metres
  "z": -4.17,
  "asset_id": "asset-municipal-dc"   // nullable: unbound devices are legal
}
```

No foreign key on `asset_id` — a layout must survive an inventory reseed. Validate existence at
write time (422) and treat a missing asset as unbound at read time.

### Endpoints

| method | path | body / result |
|---|---|---|
| `GET` | `/api/spaces` | `{ spaces: [Space] }` |
| `POST` | `/api/spaces` | `{ name, template, components }` → `201 Space` |
| `GET` | `/api/spaces/{id}` | `Space` or 404 |
| `PUT` | `/api/spaces/{id}` | full replace of `name` + `components` → `Space` |
| `DELETE` | `/api/spaces/{id}` | `204` |
| `GET` | `/api/spaces/{id}/risk` | per-component risk, see below |

`GET /api/spaces/{id}/risk` — the reason this task exists:

```jsonc
{
  "space_id": "space-lab-a-7f3k",
  "components": [
    { "id": "c1", "asset_id": "asset-municipal-dc", "risk": 42.5, "state": "elevated",
      "events_24h": 12, "last_event_ts": "2026-11-24T14:01:29.185Z" },
    { "id": "c2", "asset_id": null, "risk": null, "state": null,
      "events_24h": 0, "last_event_ts": null }
  ]
}
```

Reuse `repository.get_risk()` per bound asset. Never re-implement scoring.

### Validation (422 with a readable `detail`)

- `name`: trimmed, 2..40 chars.
- `template`: must be a known template (`room`).
- `components`: 0..64 items; each `id` unique and non-empty; `kind` in the enum;
  `-6 <= x <= 6` and `-5 <= z <= 5` (the room is 12×10 m); `asset_id` present in `assets`
  when not null.
- Reject unknown fields rather than silently dropping them.

### Seed

Seed one space with `id="room"` matching the built-in room's eight devices (the same pairs as
`frontend/src/scene/roomMap.ts`). That way `#/space/room` reproduces from the API once the
frontend switches over, and a fresh DB still has something to show.

### Tests (`backend/tests/test_spaces.py`)

- create → read → list round-trip, including an unbound component;
- `PUT` replaces the layout and drops removed components;
- 422 cases: bad kind, out-of-bounds coordinate, duplicate component id, unknown asset;
- delete returns 204 and a later `GET` is 404;
- `/risk` returns `null` for an unbound component and a real score for a bound one after
  ingesting a couple of events;
- the seeded `room` space exists after startup.

## Contract changes

Add a `Space` section to `docs/api-contract.md` (same shape as the `Asset` section, JSONC
example plus field notes) in the same PR. Mark it v0.2.

## Definition of done

`ruff check .` and `pytest -q` clean, all endpoints in `/docs`, contract updated, PR opened
against `main` with the endpoints exercised by tests. Paste the seeded `room` JSON in the PR
description so the frontend can switch `roomMap.ts` over to it.

## Out of scope (do not do here)

- auth on these endpoints (separate task; they are unauthenticated like the rest of `/api`);
- WebSocket push of per-space risk (the frontend can poll `/risk` for now);
- migrating `localStorage` spaces on the server — the frontend will read the API and fall back
  to local storage if it is unreachable;
- inventing 3D coordinates. The frontend owns positions; the backend validates bounds and
  stores what it is sent.
