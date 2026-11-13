import { Color } from 'three';
import type { AssetKind } from '../types/contract';

export interface KindStyle {
  color: number;
  label: string;
  emissive: number;
  roughness: number;
  metalness: number;
}

const STYLES: Record<AssetKind, KindStyle> = {
  scada: { color: 0xffffff, label: '#ffffff', emissive: 0.45, roughness: 0.35, metalness: 0.6 },
  server: { color: 0xffffff, label: '#ffffff', emissive: 0.4, roughness: 0.35, metalness: 0.65 },
  gateway: { color: 0xffffff, label: '#ffffff', emissive: 0.45, roughness: 0.3, metalness: 0.7 },
  district: { color: 0xffffff, label: '#ffffff', emissive: 0.35, roughness: 0.4, metalness: 0.45 },
  db: { color: 0xffffff, label: '#ffffff', emissive: 0.4, roughness: 0.32, metalness: 0.65 },
  service: { color: 0xffffff, label: '#ffffff', emissive: 0.38, roughness: 0.4, metalness: 0.55 },
  cctv: { color: 0xffffff, label: '#ffffff', emissive: 0.4, roughness: 0.35, metalness: 0.6 },
  external: { color: 0xffffff, label: '#ffffff', emissive: 0.5, roughness: 0.25, metalness: 0.7 },
};

export const FALLBACK_KIND: AssetKind = 'service';

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === 'string' && value in STYLES;
}

export function kindStyle(kind: AssetKind): KindStyle {
  return STYLES[kind] ?? STYLES[FALLBACK_KIND];
}

export function kindColor(kind: AssetKind): Color {
  return new Color(kindStyle(kind).color);
}

export function kindLabelColor(kind: AssetKind): string {
  return kindStyle(kind).label;
}
