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
    id: 'room',
    title: 'Minimal Room',
    tagline: '3D room with stacked devices',
    meta: '8 devices · vertical tracking',
    badge: 'New',
    accent: '#ffffff',
    available: true,
  },
];
