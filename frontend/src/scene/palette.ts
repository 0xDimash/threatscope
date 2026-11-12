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
  scada: { color: 0xffb020, label: '#ffc95c', emissive: 0.45, roughness: 0.35, metalness: 0.6 },
  server: { color: 0x19b3ff, label: '#c8d8ec', emissive: 0.4, roughness: 0.35, metalness: 0.65 },
  gateway: { color: 0x2f81f7, label: '#9fc3e8', emissive: 0.45, roughness: 0.3, metalness: 0.7 },
  district: { color: 0x38e8d0, label: '#38e8d0', emissive: 0.35, roughness: 0.4, metalness: 0.45 },
  db: { color: 0x8a2be2, label: '#c9b4ff', emissive: 0.4, roughness: 0.32, metalness: 0.65 },
  service: { color: 0x4fd1ff, label: '#c8d8ec', emissive: 0.38, roughness: 0.4, metalness: 0.55 },
  cctv: { color: 0xff8c42, label: '#ffc95c', emissive: 0.4, roughness: 0.35, metalness: 0.6 },
  external: { color: 0xff2d55, label: '#ff6b81', emissive: 0.5, roughness: 0.25, metalness: 0.7 },
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
