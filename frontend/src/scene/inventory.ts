import type { Asset, AssetKind, Link } from '../types/contract';
import { FALLBACK_KIND, isAssetKind } from './palette';
import type { Inventory } from './types';

const LINK_KINDS = new Set(['network', 'dependency', 'dataflow']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asPosition(value: unknown): { x: number; y: number; z: number } {
  const record = asRecord(value);
  if (!record) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: asNumber(record.x, 0),
    y: asNumber(record.y, 0),
    z: asNumber(record.z, 0),
  };
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function parseAsset(value: unknown): Asset | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id || !name) {
    return null;
  }
  const rawKind = record.kind;
  const kind: AssetKind = isAssetKind(rawKind) ? rawKind : FALLBACK_KIND;
  const criticality = Math.min(5, Math.max(1, Math.round(asNumber(record.criticality, 1))));
  const asset: Asset = {
    id,
    name,
    kind,
    criticality,
    district: asString(record.district),
    position: asPosition(record.position),
    tags: asTags(record.tags),
  };
  const ip = asString(record.ip);
  if (ip) {
    asset.ip = ip;
  }
  return asset;
}

function parseLink(value: unknown): Link | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const source = asString(record.source);
  const target = asString(record.target);
  if (!source || !target) {
    return null;
  }
  const rawKind = record.kind;
  const kind = typeof rawKind === 'string' && LINK_KINDS.has(rawKind) ? rawKind : 'network';
  return { source, target, kind: kind as Link['kind'] };
}

export function parseInventory(raw: unknown): Inventory {
  const record = asRecord(raw);
  if (!record) {
    return { assets: [], links: [] };
  }
  const rawAssets = Array.isArray(record.assets) ? record.assets : [];
  const rawLinks = Array.isArray(record.links) ? record.links : [];
  const assets = rawAssets
    .map(parseAsset)
    .filter((asset): asset is Asset => asset !== null);
  const links = rawLinks.map(parseLink).filter((link): link is Link => link !== null);
  return { assets, links };
}
