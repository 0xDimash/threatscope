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
    id: 'network',
    title: 'Minimal Network',
    tagline: 'Packet-Tracer-style view of a small network',
    meta: '11 devices · 10 links · pixel grid',
    badge: 'New',
    accent: '#ffffff',
    available: true,
  },
];
