/**
 * Tests for the replay helpers and the replay state machine. Plain script that exits non-zero on
 * failure, same style as assetInfo.test.ts. Run from `frontend/`:
 *   node_modules/.bin/esbuild src/ui/replayMath.test.ts --bundle --platform=node --format=esm | node --input-type=module
 */
import type { SecurityEvent } from '../types/contract';
import demo from './demoScenario.json';
import {
  BACKFILL_ROWS, MAX_TICK_MS, clampSpeed, collectPages, fractionOf, formatClock, indexAt, killChainOf, lastWindow,
  levelOf, offsetsOf, positionFromFraction, scaleDelta, sortEvents, tally, topTypes, windowOf,
} from './replayMath';
import { createReplay } from './replayController';

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

function ev(id: string, ts: string, severity: SecurityEvent['severity'] = 'low', type = 'recon'): SecurityEvent {
  return {
    id, ts, type, severity, src: { ip: null, host: null, asset_id: null },
    dst: { ip: null, host: null, asset_id: 'asset-x' }, description: null, mitre: null,
    risk_delta: null, raw_source: 'test', meta: {},
  };
}

// ---- pure helpers
check('clampSpeed keeps allowed', [0.5, 1, 2, 4].map(clampSpeed), [0.5, 1, 2, 4]);
check('clampSpeed rejects others', [3, 0, -1, NaN].map(clampSpeed), [1, 1, 1, 1]);
check('scaleDelta 2x', scaleDelta(100, 2), 200);
check('scaleDelta 0.5x', scaleDelta(100, 0.5), 50);
check('scaleDelta caps a long tick', scaleDelta(60_000, 1), MAX_TICK_MS);
check('scaleDelta ignores negative/NaN', [scaleDelta(-5, 1), scaleDelta(NaN, 1)], [0, 0]);

const w = lastWindow(Date.parse('2026-03-12T10:00:00Z'), 15);
check('lastWindow', [w.from, w.to], ['2026-03-12T09:45:00.000Z', '2026-03-12T10:00:00.000Z']);

const unsorted = [ev('b', '2026-03-12T09:00:02Z'), ev('a', '2026-03-12T09:00:02Z'), ev('c', '2026-03-12T09:00:01Z'), ev('a', '2026-03-12T09:00:09Z')];
const sorted = sortEvents(unsorted);
check('sortEvents order + dedupe', sorted.map((e) => e.id), ['c', 'a', 'b']);
check('sortEvents does not mutate', unsorted.map((e) => e.id), ['b', 'a', 'c', 'a']);
const win = windowOf(sorted);
check('windowOf', win.end - win.start, 1000);
const offs = offsetsOf(sorted, win.start);
check('offsetsOf', offs, [0, 1000, 1000]);
check('windowOf empty', windowOf([]), { start: 0, end: 0 });

const o = [0, 1000, 1000, 5000];
check('indexAt before first', indexAt(o, -1), 0);
check('indexAt on first', indexAt(o, 0), 1);
check('indexAt ties included', indexAt(o, 1000), 3);
check('indexAt between', indexAt(o, 4999), 3);
check('indexAt end', indexAt(o, 5000), 4);
check('indexAt past end', indexAt(o, 99999), 4);
check('indexAt empty', indexAt([], 10), 0);

check('positionFromFraction', [positionFromFraction(0.5, 60000), positionFromFraction(2, 60000), positionFromFraction(0.5, 0)], [30000, 60000, 0]);
check('fractionOf', [fractionOf(15000, 60000), fractionOf(-1, 60000), fractionOf(5, 0)], [0.25, 0, 0]);
check('formatClock', [formatClock(0), formatClock(61_999), formatClock(-5)], ['00:00', '01:01', '00:00']);

const mix = [ev('1', '2026-03-12T09:00:00Z', 'low'), ev('2', '2026-03-12T09:00:01Z', 'critical', 'ransomware'), ev('3', '2026-03-12T09:00:02Z', 'low')];
check('tally', tally(mix), { info: 0, low: 2, medium: 0, high: 0, critical: 1 });
check('topTypes', topTypes(mix), [{ type: 'recon', count: 2 }, { type: 'ransomware', count: 1 }]);
check('levelOf', [levelOf(tally([])), levelOf(tally(mix.slice(0, 1))), levelOf(tally(mix))], ['low', 'guarded', 'severe']);
check('killChainOf unknown tactic ignored', killChainOf([{ ...mix[0], mitre: { tactic: 'nope', technique_id: 'x', technique: 'x' } }]).impact, 0);

// ---- paging
const pages: Record<string, { events: SecurityEvent[]; next_cursor: string | null }> = {
  start: { events: [ev('e5', '2026-03-12T09:00:05Z'), ev('e4', '2026-03-12T09:00:04Z')], next_cursor: 'c1' },
  c1: { events: [ev('e3', '2026-03-12T09:00:03Z'), ev('e2', '2026-03-12T09:00:02Z')], next_cursor: 'c2' },
  c2: { events: [ev('e1', '2026-03-12T09:00:01Z')], next_cursor: null },
};
const seen: string[] = [];
const fetchPage = async (cursor: string | undefined) => { seen.push(cursor ?? 'start'); return pages[cursor ?? 'start']; };
const all = await collectPages(fetchPage, 100);
check('collectPages follows cursors', [seen, all.events.map((e) => e.id), all.truncated], [['start', 'c1', 'c2'], ['e1', 'e2', 'e3', 'e4', 'e5'], false]);
const capped = await collectPages(async (c) => pages[c ?? 'start'], 3);
check('collectPages cap keeps the newest', [capped.events.map((e) => e.id), capped.truncated], [['e3', 'e4', 'e5'], true]);

// ---- state machine
const scenario = demo.events as SecurityEvent[];
type Log = string[];

function run(chunks: number[], speed = 1): { log: Log; screen: string[] } {
  const log: Log = [];
  const screen: string[] = []; // HUD rows currently shown, newest first
  const replay = createReplay({
    emit(e, animate): void { screen.unshift(e.id); if (animate) { log.push(`arc:${e.id}`); } },
    clear(): void { screen.length = 0; },
    progress(): void { /* counters are checked separately */ },
  });
  replay.load(scenario);
  replay.setSpeed(speed);
  replay.play();
  for (let i = 0; replay.snapshot().status === 'playing' && i < 100_000; i += 1) replay.advance(chunks[i % chunks.length]);
  return { log, screen };
}

const first = run([16]);
const second = run([16]);
check('scenario has events', first.log.length, scenario.length);
check('same scenario twice -> same arcs', first.log, second.log);
check('arc order does not depend on frame pacing', run([7, 33, 120]).log, first.log);
check('4x plays the same sequence', run([50], 4).log, first.log);
check('0.5x plays the same sequence', run([50], 0.5).log, first.log);

// scrubbing leaves no stale arcs and no duplicate rows
{
  const rows: string[] = [];
  let cleared = 0;
  let arcsOnScreen: string[] = [];
  const replay = createReplay({
    emit(e, animate): void { rows.unshift(e.id); if (animate) arcsOnScreen.push(e.id); },
    clear(): void { rows.length = 0; arcsOnScreen = []; cleared += 1; },
    progress(): void { /* unused */ },
  });
  replay.load(scenario);
  replay.play();
  for (let i = 0; i < 1200; i += 1) replay.advance(16); // ~19 s in
  const mid = replay.snapshot();
  check('played part way', mid.index > 5 && mid.index < scenario.length, true);

  replay.seek(0);
  check('seek 0: nothing on screen', [rows.length, arcsOnScreen.length, replay.snapshot().index], [0, 0, 0]);
  replay.seek(mid.duration);
  check('seek end: rows unique', new Set(rows).size === rows.length, true);
  check('seek end: no arcs spawned by a seek', arcsOnScreen.length, 0);
  check('seek end: HUD tail capped', rows.length, Math.min(BACKFILL_ROWS, scenario.length));
  replay.seek(mid.position);
  check('seek back: same rows as before', rows.length, mid.index);
  check('seek back: newest row is the last played', rows[0], scenario[mid.index - 1].id);
  check('seek back: ids unique', new Set(rows).size === rows.length, true);
  for (let i = 0; i < 10; i += 1) replay.seek((i % 2 === 0 ? 0.9 : 0.1) * mid.duration);
  check('many scrubs: ids unique', new Set(rows).size === rows.length, true);
  check('clear called once per seek', cleared >= 13, true);

  // continue playing after a seek: arcs only for events after the playhead
  replay.seek(mid.position);
  arcsOnScreen = [];
  for (let i = 0; i < 100; i += 1) replay.advance(16);
  const ids = arcsOnScreen;
  check('after seek only later events animate', ids.every((id) => scenario.findIndex((e) => e.id === id) >= mid.index), true);
  check('rows stay unique while playing on', new Set(rows).size === rows.length, true);

  replay.hold(true);
  const held = replay.snapshot().position;
  replay.advance(100);
  check('hold freezes the playhead', replay.snapshot().position, held);
  replay.hold(false);

  replay.seek(mid.duration);
  check('ended', replay.snapshot().status, 'ended');
  replay.play();
  check('play after the end restarts', [replay.snapshot().index, replay.snapshot().status], [0, 'playing']);
  replay.unload();
  check('unload clears the screen', [rows.length, replay.snapshot().status], [0, 'empty']);
}

if (failures > 0) {
  throw new Error(`${failures} replay test(s) failed`);
}
console.log('\nall replay tests passed');
