/**
 * Which inventory asset each room device stands for.
 *
 * The room is a stylised office; the inventory is the city. Without this table the arcs
 * hash asset ids onto random boxes and clicking a device shows no risk. One device per
 * asset keeps the mapping stable and explainable ("the rack is the municipal DC").
 */
export const ROOM_ASSET_MAP: Record<string, string> = {
  'room-rack': 'asset-municipal-dc',
  'room-switch': 'asset-egov-gateway',
  'room-pc1': 'asset-egov-portal',
  'room-pc2': 'asset-akimat-portal',
  'room-monitor': 'asset-open-data-portal',
  'room-nas': 'asset-citizen-registry-db',
  'room-cam': 'asset-cctv-network',
  'room-iot': 'asset-transit-onay',
};

const BY_ASSET: Record<string, string> = Object.fromEntries(
  Object.entries(ROOM_ASSET_MAP).map(([device, asset]) => [asset, device]),
);

/** Room device id → inventory asset id. */
export function assetForDevice(deviceId: string | null): string | null {
  return deviceId ? ROOM_ASSET_MAP[deviceId] ?? null : null;
}

/** Inventory asset id → room device id (null when the asset has no device). */
export function deviceForAsset(assetId: string | null): string | null {
  return assetId ? BY_ASSET[assetId] ?? null : null;
}
