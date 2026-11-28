/**
 * Space catalogue: the built-in `room` plus the spaces the user creates.
 *
 * The backend is the source of truth (`/api/spaces`). localStorage is only an offline cache:
 * on load we read it first so the app opens without a backend, then the API list replaces it
 * (the backend wins on id conflicts). Layouts that never reached the backend are POSTed once,
 * because the backend does not migrate localStorage itself.
 */
import {
  ApiError,
  createSpace as apiCreateSpace,
  deleteSpace as apiDeleteSpace,
  getSpace as apiGetSpace,
  listSpaces as apiListSpaces,
  updateSpace as apiUpdateSpace,
  type Space as ApiSpace,
} from '../data/api';
import { mockSpaces } from '../data/mock';
import type { RoomComponent } from '../scene/room';
import { showNotice } from './notice';

export type SpaceTemplate = 'room';

export interface SpaceDef {
  id: string;
  title: string;
  tagline: string;
  meta: string;
  badge: string;
  accent: string;
  available: boolean;
  template: SpaceTemplate;
  custom?: boolean;
  /** Present for custom rooms and the seeded room: the devices to render. */
  components?: RoomComponent[];
}

export const SPACES: readonly SpaceDef[] = [
  {
    id: 'room',
    title: 'Minimal Room',
    tagline: '3D room with stacked devices',
    meta: '8 devices · vertical tracking',
    badge: 'New',
    accent: '#ffffff',
    available: true,
    template: 'room',
  },
];

const STORAGE_KEY = 'ts.spaces.v1';
const PUSHED_KEY = 'ts.spaces.pushed.v1';
const SYNCED_KEY = 'ts.spaces.synced.v1';
const MAX_SPACES = 12;
export const MAX_TITLE = 40;

const KINDS = new Set<RoomComponent['kind']>(['rack', 'switch', 'pc', 'monitor', 'nas', 'cam', 'iot']);

let memory: SpaceDef[] = [];
/** Last list from the backend; null until the first load (or when it failed). */
let remote: SpaceDef[] | null = null;
/** Offline cache: every custom space this browser has seen. */
let local: SpaceDef[] = [];
/** Ids the backend has confirmed. A synced id missing from a fresh list was deleted elsewhere. */
let synced: Set<string> | null = null;
let loading: Promise<void> | null = null;

function canStore(): boolean {
  try {
    window.localStorage.setItem('ts.probe', '1');
    window.localStorage.removeItem('ts.probe');
    return true;
  } catch {
    return false;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value.toFixed(2))));
}

function normaliseComponents(raw: unknown, spaceId: string): RoomComponent[] {
  if (!Array.isArray(raw)) return [];
  const components: RoomComponent[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const source = item as Partial<RoomComponent>;
    if (typeof source.kind !== 'string' || !KINDS.has(source.kind as RoomComponent['kind'])) return;
    if (typeof source.x !== 'number' || typeof source.z !== 'number') return;
    components.push({
      id: typeof source.id === 'string' && source.id ? source.id : `legacy-${spaceId}-${index}`,
      kind: source.kind as RoomComponent['kind'],
      x: clamp(source.x, -6, 6),
      z: clamp(source.z, -5, 5),
      asset_id: typeof source.asset_id === 'string' ? source.asset_id : null,
    });
  });
  return components;
}

function readLocal(): SpaceDef[] {
  if (!canStore()) return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((space): space is SpaceDef => Boolean(space) && typeof space === 'object')
      .filter((space) => typeof space.id === 'string')
      .map((space) => ({
        ...space,
        custom: space.id !== 'room',
        components: normaliseComponents(space.components, space.id),
      }));
  } catch {
    return [];
  }
}

function writeLocal(spaces: SpaceDef[]): void {
  memory = spaces;
  if (!canStore()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces.filter((space) => space.custom)));
  } catch {
    /* quota / private mode: the in-memory copy still works for this session */
  }
}

function readPushed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(PUSHED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writePushed(ids: Set<string>): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(PUSHED_KEY, JSON.stringify([...ids]));
  } catch {
    /* best effort */
  }
}

function syncedIds(): Set<string> {
  if (synced) return synced;
  try {
    const raw = window.localStorage.getItem(SYNCED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    synced = new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    synced = new Set();
  }
  return synced;
}

function writeSynced(): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(SYNCED_KEY, JSON.stringify([...(synced ?? [])]));
  } catch {
    /* best effort */
  }
}

function upsert(list: SpaceDef[], space: SpaceDef): SpaceDef[] {
  const index = list.findIndex((candidate) => candidate.id === space.id);
  if (index === -1) return [...list, space];
  const next = [...list];
  next[index] = space;
  return next;
}

function defFromSpace(space: ApiSpace): SpaceDef {
  const components = normaliseComponents(space.components, space.id);
  return {
    id: space.id,
    title: space.name,
    tagline: 'Room layout',
    meta: `${components.length} devices · shared`,
    badge: space.id === 'room' ? 'Built-in' : 'Shared',
    accent: '#ffffff',
    available: true,
    template: space.template,
    custom: space.id !== 'room',
    components,
  };
}

/** Built-ins first, then the backend list, then any local-only space the backend does not know. */
export function allSpaces(): SpaceDef[] {
  const base = remote ?? SPACES;
  const extras = local.filter(
    (space) => space.custom && !base.some((candidate) => candidate.id === space.id),
  );
  return [...base, ...extras];
}

export function findSpace(id: string): SpaceDef | null {
  return allSpaces().find((space) => space.id === id) ?? null;
}

/**
 * Loads the backend list once per session and pushes local-only layouts. Never throws: an
 * unreachable API leaves the offline cache and the seeded room in place, so the app still opens.
 */
export function loadSpaces(): Promise<void> {
  loading ??= runLoad();
  return loading;
}

async function runLoad(): Promise<void> {
  local = readLocal();
  const confirmed = syncedIds();
  try {
    const signal = AbortSignal.timeout(4000);
    const listed = await apiListSpaces(signal, { fallback: false });
    remote = listed.spaces.map(defFromSpace);
  } catch {
    remote = mockSpaces.map(defFromSpace);
    return;
  }

  // The backend wins: a space this browser once synced but the server no longer lists was
  // deleted elsewhere, so it must not come back from the offline cache.
  const remoteIds = new Set(remote.map((space) => space.id));
  local = local.filter((space) => !confirmed.has(space.id) || remoteIds.has(space.id));
  for (const id of remoteIds) confirmed.add(id);
  writeLocal(local);
  writeSynced();

  await pushLocalOnly();
}

async function pushLocalOnly(): Promise<void> {
  if (!remote) return;
  const pushed = readPushed();
  let changed = false;

  for (const space of [...local]) {
    if (!space.custom) continue;
    if (remote.some((candidate) => candidate.id === space.id) || pushed.has(space.id)) continue;
    try {
      const saved = await apiCreateSpace({
        id: space.id,
        name: space.title,
        template: space.template,
        components: space.components ?? [],
      });
      const def = defFromSpace(saved);
      remote = upsert(remote, def);
      local = upsert(local, def);
      pushed.add(space.id);
      syncedIds().add(space.id);
      changed = true;
    } catch (error) {
      if (!(error instanceof ApiError)) continue; // offline: retry on the next load
      if (error.status === 409) {
        pushed.add(space.id);
        syncedIds().add(space.id);
        changed = true;
        try {
          const existing = await apiGetSpace(space.id);
          remote = upsert(remote, defFromSpace(existing));
          local = upsert(local, defFromSpace(existing));
        } catch {
          /* keep the local copy until the next load */
        }
      } else if (error.status === 422) {
        pushed.add(space.id);
        changed = true;
        showNotice(`“${space.title}” stayed on this device: ${messageFor(error)}`);
      }
    }
  }

  if (changed) {
    writePushed(pushed);
    writeSynced();
    writeLocal(local);
  }
}

export interface CreateSpaceResult {
  ok: boolean;
  space?: SpaceDef;
  error?: string;
  /** Non-blocking note for a save that only reached the local cache. */
  notice?: string;
}

function normaliseTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

function titleError(clean: string): string | null {
  if (clean.length < 2) return 'Give the space a name (at least 2 characters).';
  if (clean.length > MAX_TITLE) return `Keep it under ${MAX_TITLE} characters.`;
  return null;
}

function messageFor(error: ApiError): string {
  if (error.status === 404) return 'That space no longer exists on the server.';
  if (error.status === 409) return 'The server already has a space with that id.';
  if (error.status === 422) return `The server rejected this layout: ${error.message}`;
  return error.message;
}

function spaceIdFor(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'space';
  return `space-${slug}-${Date.now().toString(36)}`;
}

export async function createSpace(
  title: string,
  template: SpaceTemplate = 'room',
  components: RoomComponent[] = [],
): Promise<CreateSpaceResult> {
  const clean = normaliseTitle(title);
  const error = titleError(clean);
  if (error) return { ok: false, error };

  if (allSpaces().filter((space) => space.custom).length >= MAX_SPACES) {
    return { ok: false, error: `You already have ${MAX_SPACES} spaces. Delete one first.` };
  }

  const id = spaceIdFor(clean);
  const layout = normaliseComponents(components, id);
  try {
    const saved = await apiCreateSpace({ id, name: clean, template, components: layout });
    const def = defFromSpace(saved);
    if (remote) remote = upsert(remote, def);
    local = upsert(local, def);
    syncedIds().add(id);
    writeSynced();
    writeLocal(local);
    return { ok: true, space: def };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: messageFor(err) };
    const def: SpaceDef = {
      id,
      title: clean,
      tagline: 'Room layout',
      meta: `${layout.length} devices · local`,
      badge: 'Cached',
      accent: '#ffffff',
      available: true,
      template,
      custom: true,
      components: layout,
    };
    local = upsert(local, def);
    writeLocal(local);
    return {
      ok: true,
      space: def,
      notice: 'Backend offline — the space is cached on this device and will sync on the next load.',
    };
  }
}

export async function deleteSpace(id: string): Promise<CreateSpaceResult> {
  const space = findSpace(id);
  if (!space) return { ok: false, error: 'That space no longer exists.' };
  if (!space.custom) return { ok: false, error: 'The built-in room cannot be deleted.' };

  const drop = (): void => {
    if (remote) remote = remote.filter((candidate) => candidate.id !== id);
    local = local.filter((candidate) => candidate.id !== id);
    syncedIds().delete(id);
    writeSynced();
    writeLocal(local);
  };

  if (remote?.some((candidate) => candidate.id === id)) {
    try {
      await apiDeleteSpace(id);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status !== 404) return { ok: false, error: messageFor(err) };
        // 404: already gone on the server — drop the cache entry too.
        drop();
        return { ok: true, notice: 'That space had already been deleted on the server.' };
      }
      drop();
      return { ok: true, notice: 'Backend offline — the space was removed from this device.' };
    }
  }
  drop();
  return { ok: true };
}

/** Rename a space and/or replace its layout. Returns the stored space. */
export async function updateSpace(
  id: string,
  patch: { title?: string; components?: RoomComponent[] },
): Promise<CreateSpaceResult> {
  const current = findSpace(id);
  if (!current) return { ok: false, error: 'That space no longer exists.' };

  const clean = normaliseTitle(patch.title ?? current.title);
  const error = titleError(clean);
  if (error) return { ok: false, error };

  const components = normaliseComponents(patch.components ?? current.components ?? [], id);
  const onBackend = remote?.some((candidate) => candidate.id === id) ?? false;

  if (!onBackend) {
    // local-only space: keep editing the cache until a later load pushes it
    const next: SpaceDef = { ...current, title: clean, components };
    local = upsert(local, next);
    writeLocal(local);
    return { ok: true, space: next, notice: 'Saved on this device; it will sync when the backend is back.' };
  }

  try {
    const saved = await apiUpdateSpace(id, { name: clean, components });
    const def = defFromSpace(saved);
    remote = upsert(remote!, def);
    local = upsert(local, def);
    syncedIds().add(id);
    writeSynced();
    writeLocal(local);
    return { ok: true, space: def };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        if (remote) remote = remote.filter((candidate) => candidate.id !== id);
        local = local.filter((candidate) => candidate.id !== id);
        syncedIds().delete(id);
        writeSynced();
        writeLocal(local);
      }
      return { ok: false, error: messageFor(err) };
    }
    const next: SpaceDef = { ...current, title: clean, components };
    local = upsert(local, next);
    writeLocal(local);
    return { ok: true, space: next, notice: 'Backend offline — changes are cached on this device.' };
  }
}
