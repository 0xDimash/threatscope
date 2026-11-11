/**
 * Compile-time check that the shared `contract/` fixtures still satisfy the frontend types.
 *
 * `tsconfig.json` includes all of `src`, so `npm run typecheck` type-checks this module on
 * every PR. A producer that adds, removes or renames a field in
 * `contract/assets.sample.json` or `contract/events.sample.json` now breaks the build until
 * `frontend/src/types/contract.ts` is updated in the same change.
 *
 * Nothing here is imported by the app; it is a contract test expressed as TypeScript.
 */
import assetsFixture from '../../../contract/assets.sample.json';
import eventsFixture from '../../../contract/events.sample.json';
import type { Asset, AssetKind, Link, SecurityEvent, Severity } from '../types/contract';

const ASSET_KINDS: readonly AssetKind[] = [
  'scada',
  'server',
  'gateway',
  'district',
  'db',
  'service',
  'cctv',
  'external',
];

const LINK_KINDS: readonly Link['kind'][] = ['network', 'dependency', 'dataflow'];

const SEVERITIES: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

function pick<T extends string>(allowed: readonly T[], value: string, field: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`contract fixture has an unknown ${field}: ${value}`);
  }
  return value as T;
}

/**
 * Widening the JSON string literals back to the contract unions. Every other field is checked
 * structurally by the assignment: a missing or mistyped property fails `tsc`.
 */
export const fixtureAssets: Asset[] = assetsFixture.assets.map((asset) => ({
  ...asset,
  kind: pick(ASSET_KINDS, asset.kind, 'asset kind'),
}));

export const fixtureLinks: Link[] = assetsFixture.links.map((link) => ({
  ...link,
  kind: pick(LINK_KINDS, link.kind, 'link kind'),
}));

export const fixtureEvents: SecurityEvent[] = eventsFixture.map((event) => ({
  ...event,
  severity: pick(SEVERITIES, event.severity, 'severity'),
}));
