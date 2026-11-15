/**
 * One import for the live backend: REST wrappers + the WebSocket feed.
 *
 * Design and Threat intel consume this barrel, not `fetch`/`WebSocket` directly:
 *
 * ```ts
 * import { connectFeed, fetchInventory } from '../data';
 * ```
 *
 * Contract fixtures stay in `contract-fixtures.ts` and are intentionally not re-exported here,
 * so importing the live client never pulls the fixture JSON into the bundle.
 */
export * from './api';
export * from './socket';
