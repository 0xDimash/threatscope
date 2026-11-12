/**
 * Registry of visualization spaces. A space is one environment you can open and
 * look into — a whole city, a single office room, or (later) the user's own
 * imported environment. The menu screen is generated from this list.
 */
export interface SpaceDef {
  id: string;
  title: string;
  tagline: string;
  meta: string;
  badge: string;
  accent: string;
  available: boolean;
}

export const SPACES: readonly SpaceDef[] = [
  {
    id: 'city',
    title: 'Almaty — City Grid',
    tagline: 'District-scale view of public infrastructure and services',
    meta: '26 assets · 33 links · demo feed',
    badge: 'Demo',
    accent: '#38e8d0',
    available: true,
  },
  {
    id: 'office',
    title: 'Small Office — Server Room',
    tagline: 'Room-scale view: rack, workstations, IoT and cameras',
    meta: '13 devices · star topology · example',
    badge: 'Example',
    accent: '#2f81f7',
    available: true,
  },
];
