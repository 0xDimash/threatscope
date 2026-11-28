/**
 * Tests for arc endpoint resolution. Plain script that throws on failure. Run from `frontend/`:
 *   node_modules/.bin/esbuild src/viz/arcEndpoints.test.ts --bundle --platform=node --format=esm | node --input-type=module
 */
import { Vector3 } from 'three';
import type { SecurityEvent } from '../types/contract';
import { EXTERNAL_ORIGIN, UNKNOWN_TARGET, resolveArc } from './arcEndpoints';

let failures = 0;
function check(name: string, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

const rack = new Vector3(-4, 1, -3);
const pc = new Vector3(2, 0, 2);
const positions = new Map<string, Vector3>([['asset-rack', rack], ['asset-pc', pc]]);
const ep = (asset_id: string | null) => ({ ip: '10.0.0.9', host: null, asset_id });
const ev = (src: string | null, dst: string | null): SecurityEvent =>
  ({ src: ep(src), dst: ep(dst), severity: 'high' }) as SecurityEvent;

const both = resolveArc(ev('asset-pc', 'asset-rack'), positions);
check('mapped dst hits its device', both.end.equals(rack) && !both.unknownTarget);
check('mapped src starts at its device', both.start.equals(pc));
check('returned positions are copies', both.end !== rack);

const unmappedDst = resolveArc(ev('asset-pc', 'asset-nope'), positions);
check('unmapped dst ends at marker', unmappedDst.end.equals(UNKNOWN_TARGET) && unmappedDst.unknownTarget);
check('mapped src + unmapped dst keeps src', unmappedDst.start.equals(pc));
check('marker is not any device', ![...positions.values()].some((p) => p.equals(UNKNOWN_TARGET)));

const unmappedSrc = resolveArc(ev('asset-nope', 'asset-rack'), positions);
check('unmapped src uses external origin, dst still hits', unmappedSrc.start.equals(EXTERNAL_ORIGIN) && unmappedSrc.end.equals(rack));

const none = resolveArc(ev(null, null), positions);
check('no asset ids: external origin to marker', none.start.equals(EXTERNAL_ORIGIN) && none.unknownTarget);

const empty = resolveArc(ev('asset-pc', 'asset-rack'), new Map());
check('empty devices: marker, never a guessed device', empty.unknownTarget && empty.end.equals(UNKNOWN_TARGET));

if (failures > 0) throw new Error(`${failures} check(s) failed`);
