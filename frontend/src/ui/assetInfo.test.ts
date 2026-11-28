/**
 * Tests for the HUD formatting helpers. No test framework in the repo yet, so this is a plain
 * script that throws on failure. Run from `frontend/`:
 *   node_modules/.bin/esbuild src/ui/assetInfo.test.ts --bundle --platform=node --format=esm | node --input-type=module
 */
import type { Asset, Endpoint } from '../types/contract';
import { MISSING, assetFields, dstLabel, indexAssets, textOrDash } from './assetInfo';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}\n     got      ${a}\n     expected ${e}`);
  }
}

const scada: Asset = {
  id: 'asset-water-scada', name: 'Water SCADA', kind: 'scada', criticality: 5,
  district: 'Almaly', position: { x: 0, y: 0, z: 0 }, ip: '10.20.0.5', tags: ['ics', 'critical'],
};
const bare = { ...scada, id: 'asset-bare', name: '  ', district: null, ip: undefined, tags: [] } as Asset;
const index = indexAssets([scada, bare]);
const dst = (p: Partial<Endpoint>): Endpoint => ({ ip: null, host: null, asset_id: null, ...p });

check('textOrDash null', textOrDash(null), MISSING);
check('textOrDash undefined', textOrDash(undefined), MISSING);
check('textOrDash blank', textOrDash('   '), MISSING);
check('textOrDash value', textOrDash(' Almaly '), 'Almaly');
check('textOrDash zero is a value', textOrDash(0), '0');

check('dst mapped asset uses name', dstLabel(dst({ asset_id: scada.id, host: 'h', ip: '1.1.1.1' }), index), 'Water SCADA');
check('dst unmapped id falls back to host', dstLabel(dst({ asset_id: 'asset-nope', host: 'egov', ip: '1.1.1.1' }), index), 'egov');
check('dst no asset, host missing, uses ip', dstLabel(dst({ ip: '10.0.0.1' }), index), '10.0.0.1');
check('dst nothing at all', dstLabel(dst({}), index), MISSING);
check('dst blank mapped name falls through', dstLabel(dst({ asset_id: 'asset-bare', ip: '10.0.0.2' }), index), '10.0.0.2');
check('dst with empty inventory', dstLabel(dst({ asset_id: scada.id, host: 'h' }), indexAssets([])), 'h');
check('dst with missing inventory', dstLabel(dst({ asset_id: scada.id }), indexAssets(undefined)), MISSING);

check('fields full', assetFields(scada).map((f) => f.value), ['Water SCADA', 'scada', '5 / 5', 'Almaly', '10.20.0.5', 'ics, critical']);
check('fields tags array', assetFields(scada)[5].tags, ['ics', 'critical']);
check('fields sparse', assetFields(bare).map((f) => f.value), [MISSING, 'scada', '5 / 5', MISSING, MISSING, MISSING]);
check('fields unknown asset', assetFields(undefined).map((f) => f.value), [MISSING, MISSING, MISSING, MISSING, MISSING, MISSING]);

if (failures > 0) throw new Error(`${failures} check(s) failed`);
console.log('all checks passed');
