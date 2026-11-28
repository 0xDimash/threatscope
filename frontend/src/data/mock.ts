import type { Asset, Link } from '../types/contract';
import type { Space, SpaceRiskResponse } from './api';

export const mockAssets: Asset[] = [
  { id: 'asset-egov-portal', name: 'Egov Portal', kind: 'service', criticality: 4, district: 'Bostandyk', position: { x: 0, y: 6, z: 0 }, tags: ['public'] },
  { id: 'asset-municipal-dc', name: 'Municipal DC', kind: 'server', criticality: 5, district: 'Almaly', position: { x: -10, y: 3, z: 6 }, tags: ['core'] },
  { id: 'asset-water-scada', name: 'Water SCADA', kind: 'scada', criticality: 5, district: 'Almaly', position: { x: 12, y: 3, z: -8 }, tags: ['ics'] },
];

export const mockLinks: Link[] = [
  { source: 'asset-egov-portal', target: 'asset-municipal-dc', kind: 'network' },
];

/**
 * Offline copy of the seeded `room` space (see `backend/app/core/seed.py`). Used only when the
 * API cannot be reached, so the app still opens its built-in scene from the cache.
 */
export const mockSpaces: Space[] = [
  {
    id: 'room',
    name: 'Room',
    template: 'room',
    components: [
      { id: 'room-rack', kind: 'rack', x: -4.0, z: -3.0, asset_id: 'asset-municipal-dc' },
      { id: 'room-switch', kind: 'switch', x: -4.0, z: -3.0, asset_id: 'asset-egov-gateway' },
      { id: 'room-pc1', kind: 'pc', x: 2.0, z: 2.0, asset_id: 'asset-egov-portal' },
      { id: 'room-pc2', kind: 'pc', x: 2.0, z: 2.0, asset_id: 'asset-akimat-portal' },
      { id: 'room-monitor', kind: 'monitor', x: 2.0, z: 1.6, asset_id: 'asset-open-data-portal' },
      { id: 'room-nas', kind: 'nas', x: 5.0, z: -2.0, asset_id: 'asset-citizen-registry-db' },
      { id: 'room-cam', kind: 'cam', x: 0.0, z: -4.5, asset_id: 'asset-cctv-network' },
      { id: 'room-iot', kind: 'iot', x: -1.0, z: 1.0, asset_id: 'asset-transit-onay' },
    ],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

/** Offline risk: the backend is the only source of scores, so every field stays null. */
export function mockSpaceRisk(spaceId: string): SpaceRiskResponse {
  const space = mockSpaces.find((candidate) => candidate.id === spaceId);
  return {
    id: spaceId,
    components: (space?.components ?? []).map((component) => ({
      id: component.id,
      asset_id: component.asset_id,
      risk: null,
      state: null,
      events_24h: null,
    })),
  };
}
