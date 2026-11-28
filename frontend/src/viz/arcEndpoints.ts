import { Vector3 } from 'three';
import type { Endpoint, SecurityEvent } from '../types/contract';

/** Where unmapped destinations end: a fixed spot near the room edge, never a device. */
export const UNKNOWN_TARGET = new Vector3(-5, 0.15, 4.2);
/** Where events with no known source start (outside the room). */
export const EXTERNAL_ORIGIN = new Vector3(0, 5.2, -6.0);

export interface ResolvedArc {
  start: Vector3;
  end: Vector3;
  /** True when dst.asset_id is not a device in this room; `end` is then UNKNOWN_TARGET. */
  unknownTarget: boolean;
}

function mapped(endpoint: Endpoint, positions: Map<string, Vector3>): Vector3 | null {
  const id = endpoint.asset_id;
  const p = id ? positions.get(id) : undefined;
  return p ? p.clone() : null;
}

/** Resolve arc endpoints without ever guessing a device: unmapped dst → UNKNOWN_TARGET. */
export function resolveArc(event: SecurityEvent, positions: Map<string, Vector3>): ResolvedArc {
  const end = mapped(event.dst, positions);
  return {
    start: mapped(event.src, positions) ?? EXTERNAL_ORIGIN.clone(),
    end: end ?? UNKNOWN_TARGET.clone(),
    unknownTarget: end === null,
  };
}
