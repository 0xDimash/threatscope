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
  scada: { color: 0xffb020, label: '#ffc95c', emissive: 0.16, roughness: 0.42, metalness: 0.5 },
  server: { color: 0x19b3ff, label: '#c8d8ec', emissive: 0.14, roughness: 0.42, metalness: 0.55 },
  gateway: { color: 0x2f81f7, label: '#9fc3e8', emissive: 0.16, roughness: 0.35, metalness: 0.6 },
  district: { color: 0x38e8d0, label: '#38e8d0', emissive: 0.12, roughness: 0.5, metalness: 0.35 },
  db: { color: 0x8a2be2, label: '#c9b4ff', emissive: 0.15, roughness: 0.38, metalness: 0.55 },
  service: { color: 0x4fd1ff, label: '#c8d8ec', emissive: 0.13, roughness: 0.46, metalness: 0.45 },
  cctv: { color: 0xff8c42, label: '#ffc95c', emissive: 0.15, roughness: 0.4, metalness: 0.5 },
  external: { color: 0xff2d55, label: '#ff6b81', emissive: 0.18, roughness: 0.3, metalness: 0.6 },
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
