/**
 * Space catalogue: the built-in scenes plus the ones the user creates.
 *
 * A user space is a named view over a scene template — it has its own title and id, but
 * renders the same 3D scene. Stored in localStorage so it survives a reload; if storage is
 * unavailable (private mode, quota) we fall back to memory for the session instead of failing.
 */
import type { RoomComponent } from '../scene/room';

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
  /** Present for custom rooms: the devices the user placed. */
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
const MAX_SPACES = 12;
export const MAX_TITLE = 40;

let memory: SpaceDef[] = [];

function canStore(): boolean {
  try {
    window.localStorage.setItem('ts.probe', '1');
    window.localStorage.removeItem('ts.probe');
    return true;
  } catch {
    return false;
  }
}

function readCustom(): SpaceDef[] {
  if (!canStore()) return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SpaceDef[];
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeCustom(spaces: SpaceDef[]): boolean {
  memory = spaces;
  if (!canStore()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces));
    return true;
  } catch {
    return false;
  }
}

/** Built-ins first, then the user's spaces in creation order. */
export function allSpaces(): SpaceDef[] {
  return [...SPACES, ...readCustom()];
}

export function findSpace(id: string): SpaceDef | null {
  return allSpaces().find((space) => space.id === id) ?? null;
}

export interface CreateSpaceResult {
  ok: boolean;
  space?: SpaceDef;
  error?: string;
}

export function createSpace(
  title: string,
  template: SpaceTemplate = 'room',
  components: RoomComponent[] = [],
): CreateSpaceResult {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (clean.length < 2) return { ok: false, error: 'Give the space a name (at least 2 characters).' };
  if (clean.length > MAX_TITLE) return { ok: false, error: `Keep it under ${MAX_TITLE} characters.` };

  const existing = readCustom();
  if (existing.length >= MAX_SPACES) {
    return { ok: false, error: `You already have ${MAX_SPACES} spaces. Delete one first.` };
  }

  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'space';
  const space: SpaceDef = {
    id: `custom-${slug}-${Date.now().toString(36)}`,
    title: clean,
    tagline: 'Custom view',
    meta: 'same scene · your name',
    badge: 'Yours',
    accent: '#ffffff',
    available: true,
    template,
    custom: true,
    components,
  };

  if (!writeCustom([...existing, space]) && !canStore()) {
    // memory fallback still worked, so the space exists for this session
  }
  return { ok: true, space };
}

export function deleteSpace(id: string): void {
  writeCustom(readCustom().filter((space) => space.id !== id));
}
