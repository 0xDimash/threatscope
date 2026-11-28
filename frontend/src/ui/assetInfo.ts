import type { Asset, Endpoint } from '../types/contract';

/** What the HUD shows for a missing or empty value. */
export const MISSING = '—';

export type AssetIndex = ReadonlyMap<string, Asset>;

/** Text for a possibly missing value: null, undefined and blank strings become `—`. */
export function textOrDash(value: unknown): string {
  if (value === null || value === undefined) return MISSING;
  const text = String(value).trim();
  return text === '' ? MISSING : text;
}

/** Id → asset lookup. Tolerates a missing inventory (mock / offline path). */
export function indexAssets(assets: readonly Asset[] | null | undefined): AssetIndex {
  const index = new Map<string, Asset>();
  for (const asset of assets ?? []) {
    if (asset && typeof asset.id === 'string') index.set(asset.id, asset);
  }
  return index;
}

/** Event-row target label: mapped asset name, else host, else ip, else `—`. */
export function dstLabel(dst: Endpoint, index: AssetIndex): string {
  const mapped = dst.asset_id ? index.get(dst.asset_id)?.name : null;
  for (const candidate of [mapped, dst.host, dst.ip]) {
    if (candidate && candidate.trim() !== '') return candidate;
  }
  return MISSING;
}

export interface DetailField {
  label: string;
  /** Plain text, already `—` when missing. Unused for `tags`. */
  value: string;
  /** Present only for the tags field; empty means "render —". */
  tags?: string[];
}

/** Inventory fields for the detail card, in display order. Asset may be unknown. */
export function assetFields(asset: Asset | null | undefined): DetailField[] {
  const tags = (asset?.tags ?? []).filter((t) => typeof t === 'string' && t.trim() !== '');
  const criticality = asset?.criticality;
  return [
    { label: 'name', value: textOrDash(asset?.name) },
    { label: 'kind', value: textOrDash(asset?.kind) },
    {
      label: 'criticality',
      value: typeof criticality === 'number' && Number.isFinite(criticality) ? `${criticality} / 5` : MISSING,
    },
    { label: 'district', value: textOrDash(asset?.district) },
    { label: 'ip', value: textOrDash(asset?.ip) },
    { label: 'tags', value: tags.length ? tags.join(', ') : MISSING, tags },
  ];
}
