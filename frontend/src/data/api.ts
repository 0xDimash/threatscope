/**
 * Typed REST client for the backend contract (`docs/api-contract.md`).
 *
 * This is the only module that knows the API origin: everything else imports these wrappers
 * (or the barrel `./index`), so changing the host or adding auth happens in one place.
 * `VITE_API_BASE` overrides the default, which mirrors the page host on port 8000.
 */
import type { Asset, Link, SecurityEvent, Severity } from '../types/contract';
import { mockAssets, mockLinks, mockSpaces, mockSpaceRisk } from './mock';

export interface AggregateState {
  threat_level: 'low' | 'guarded' | 'elevated' | 'high' | 'severe';
  counts: { info: number; low: number; medium: number; high: number; critical: number };
  compromised_assets: number;
  kill_chain: Record<string, number>;
  top_types: { type: string; count: number }[];
}

export interface RiskState {
  asset_id: string;
  risk: number;
  state: 'ok' | 'elevated' | 'critical' | 'compromised';
  events_24h: number;
  last_event_ts: string | null;
  top_types: string[];
}

export interface Inventory {
  assets: Asset[];
  links: Link[];
}

export interface EventsPage {
  events: SecurityEvent[];
  next_cursor: string | null;
}

export interface EventQuery {
  limit?: number;
  severity?: Severity;
  type?: string;
  assetId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

export type SpaceTemplate = 'room';
export type SpaceComponentKind = 'rack' | 'switch' | 'pc' | 'monitor' | 'nas' | 'cam' | 'iot';

export interface SpaceComponent {
  id: string;
  kind: SpaceComponentKind;
  x: number;
  z: number;
  asset_id: string | null;
}

export interface Space {
  id: string;
  name: string;
  template: SpaceTemplate;
  components: SpaceComponent[];
  created_at: string;
  updated_at: string;
}

export interface SpacesResponse {
  spaces: Space[];
}

export interface SpaceCreateRequest {
  id?: string;
  name: string;
  template: SpaceTemplate;
  components: SpaceComponent[];
}

export interface SpaceUpdateRequest {
  name: string;
  components: SpaceComponent[];
}

/** Null risk fields mean the device is unbound (or its asset is no longer in the inventory). */
export interface SpaceRiskComponent {
  id: string;
  asset_id: string | null;
  risk: number | null;
  state: 'ok' | 'elevated' | 'critical' | 'compromised' | null;
  events_24h: number | null;
}

export interface SpaceRiskResponse {
  id: string;
  components: SpaceRiskComponent[];
}

/** Raised for non-2xx responses so callers can show a useful message instead of `undefined`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = resolveApiBase();

/** Resolved REST base (no trailing slash), e.g. `http://localhost:8000`. */
export function apiBase(): string {
  return API_BASE;
}

/** `GET /api/assets` — the seeded inventory the city is built from. */
export function fetchInventory(signal?: AbortSignal): Promise<Inventory> {
  return withFallback(
    () => getJson<Inventory>('/api/assets', signal),
    () => ({ assets: mockAssets, links: mockLinks }),
    signal,
  );
}

/** `GET /api/events` — newest first, cursor paginated. */
export function fetchEvents(query: EventQuery = {}, signal?: AbortSignal): Promise<EventsPage> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.severity) params.set('severity', query.severity);
  if (query.type) params.set('type', query.type);
  if (query.assetId) params.set('asset_id', query.assetId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.cursor) params.set('cursor', query.cursor);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return getJson<EventsPage>(`/api/events${suffix}`, signal);
}

/** `GET /api/state` — aggregate threat level, severity counts and kill-chain progress. */
export function fetchState(signal?: AbortSignal): Promise<AggregateState> {
  return getJson<AggregateState>('/api/state', signal);
}

/** `GET /api/assets/{id}/risk` — latest risk snapshot for one asset. */
export function fetchAssetRisk(assetId: string, signal?: AbortSignal): Promise<RiskState> {
  return getJson<RiskState>(`/api/assets/${encodeURIComponent(assetId)}/risk`, signal);
}

/** `GET /api/spaces` — list persisted room layouts. Falls back to the seeded room offline. */
export function listSpaces(
  signal?: AbortSignal,
  options: { fallback?: boolean } = {},
): Promise<SpacesResponse> {
  const live = (): Promise<SpacesResponse> => getJson<SpacesResponse>('/api/spaces', signal);
  if (options.fallback === false) return live();
  return withFallback(live, () => ({ spaces: mockSpaces }), signal);
}

/** `GET /api/spaces/{id}` — fetch one space. */
export function getSpace(spaceId: string, signal?: AbortSignal): Promise<Space> {
  return withFallback(
    () => getJson<Space>(`/api/spaces/${encodeURIComponent(spaceId)}`, signal),
    () => {
      const space = mockSpaces.find((candidate) => candidate.id === spaceId);
      if (!space) throw new ApiError(404, `space not found in the offline cache: ${spaceId}`);
      return space;
    },
    signal,
  );
}

/** `POST /api/spaces` — create a space. */
export function createSpace(
  payload: SpaceCreateRequest,
  signal?: AbortSignal,
): Promise<Space> {
  return requestJson<Space>('/api/spaces', 'POST', payload, signal);
}

/** `PUT /api/spaces/{id}` — replace a space name and components. */
export function updateSpace(
  spaceId: string,
  payload: SpaceUpdateRequest,
  signal?: AbortSignal,
): Promise<Space> {
  return requestJson<Space>(`/api/spaces/${encodeURIComponent(spaceId)}`, 'PUT', payload, signal);
}

/** `DELETE /api/spaces/{id}` — delete a space. */
export async function deleteSpace(spaceId: string, signal?: AbortSignal): Promise<void> {
  const path = `/api/spaces/${encodeURIComponent(spaceId)}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw await failure(response, 'DELETE', path);
  }
}

/** `GET /api/spaces/{id}/risk` — per-component risk for a space. Offline: all fields null. */
export function getSpaceRisk(spaceId: string, signal?: AbortSignal): Promise<SpaceRiskResponse> {
  return withFallback(
    () => getJson<SpaceRiskResponse>(`/api/spaces/${encodeURIComponent(spaceId)}/risk`, signal),
    () => mockSpaceRisk(spaceId),
    signal,
  );
}

/**
 * Reads only: on a network failure the mock stands in so the app still opens. Writes never fall
 * back — a fake `201` would hide data loss; `ui/spaces.ts` keeps those writes in its cache instead.
 */
async function withFallback<T>(
  action: () => Promise<T>,
  fallback: () => T,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (signal?.aborted || error instanceof ApiError) throw error;
    return fallback();
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw await failure(response, 'GET', path);
  }
  return (await response.json()) as T;
}

async function requestJson<T>(
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await failure(response, method, path);
  }
  return (await response.json()) as T;
}

/** Keeps the server's `detail` (e.g. `unknown asset_id: …`) in the message shown to the user. */
async function failure(response: Response, method: string, path: string): Promise<ApiError> {
  let detail = '';
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') detail = `: ${body.detail}`;
  } catch {
    /* non-JSON error body — the status is enough */
  }
  return new ApiError(response.status, `${method} ${path} failed with HTTP ${response.status}${detail}`);
}

function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE as string | undefined;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
}
