/**
 * Which inventory asset each room device stands for.
 *
 * The bindings come from the seeded `room` space on the backend (`GET /api/spaces`), not from a
 * table in this file, so a rebind with `PUT /api/spaces/{id}` also moves the arcs and the detail
 * card. `setRoomSpace` is called before a room scene is built; an empty table is harmless.
 */
interface BoundComponent {
  id: string;
  asset_id: string | null;
}

let byDevice = new Map<string, string>();
let byAsset = new Map<string, string>();

/** Replace the binding tables from the space currently on screen (or clear with null). */
export function setRoomSpace(space: { components?: BoundComponent[] } | null): void {
  byDevice = new Map();
  byAsset = new Map();
  for (const component of space?.components ?? []) {
    if (!component.asset_id) continue;
    byDevice.set(component.id, component.asset_id);
    if (!byAsset.has(component.asset_id)) byAsset.set(component.asset_id, component.id);
  }
}

/** Device id → inventory asset id, for every bound device. */
export function roomBindings(): Array<[string, string]> {
  return [...byDevice.entries()];
}

/** Room device id → inventory asset id. */
export function assetForDevice(deviceId: string | null): string | null {
  return deviceId ? byDevice.get(deviceId) ?? null : null;
}

/** Inventory asset id → room device id (null when the asset has no device). */
export function deviceForAsset(assetId: string | null): string | null {
  return assetId ? byAsset.get(assetId) ?? null : null;
}
