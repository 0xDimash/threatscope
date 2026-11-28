/**
 * Pure helpers for replay: time-window math, speed scaling, scrub-to-index, tallies and paging.
 * No DOM, no clock, no network, so every function is covered by `replayMath.test.ts`.
 */
import type { SecurityEvent, Severity } from '../types/contract';

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
export const DEFAULT_SPEED: Speed = 1;

/** Longest real gap one tick may advance the playhead by (a hidden tab must not fast-forward). */
export const MAX_TICK_MS = 250;
/** Rows rebuilt in the HUD after a seek. Matches the HUD's own cap. */
export const BACKFILL_ROWS = 60;

export interface TimeWindow {
  /** epoch ms */
  start: number;
  end: number;
}

/** A speed from the allowed set; anything else falls back to 1x. */
export function clampSpeed(value: number): Speed {
  return (SPEEDS as readonly number[]).includes(value) ? (value as Speed) : DEFAULT_SPEED;
}

/** Real time elapsed -> timeline time advanced. Non-finite or negative input advances nothing. */
export function scaleDelta(realMs: number, speed: number): number {
  if (!Number.isFinite(realMs) || realMs <= 0) return 0;
  return Math.min(realMs, MAX_TICK_MS) * clampSpeed(speed);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** The last `minutes` minutes before `nowMs`, as epoch ms and as the ISO strings the API takes. */
export function lastWindow(nowMs: number, minutes: number): TimeWindow & { from: string; to: string } {
  const end = nowMs;
  const start = nowMs - Math.max(1, minutes) * 60_000;
  return { start, end, from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

function tsOf(event: SecurityEvent): number {
  const ms = Date.parse(event.ts);
  return Number.isFinite(ms) ? ms : 0;
}

/** Oldest first, ties broken by id, duplicate ids dropped. Does not mutate the input. */
export function sortEvents(events: readonly SecurityEvent[]): SecurityEvent[] {
  const seen = new Set<string>();
  const unique: SecurityEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    unique.push(event);
  }
  return unique.sort((a, b) => tsOf(a) - tsOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Timeline offsets (ms from `start`) for events already sorted oldest first. Never negative. */
export function offsetsOf(sorted: readonly SecurityEvent[], start: number): number[] {
  return sorted.map((event) => Math.max(0, tsOf(event) - start));
}

/** Window covering the events: first event to last event. Empty input gives a zero-length window. */
export function windowOf(sorted: readonly SecurityEvent[]): TimeWindow {
  if (sorted.length === 0) return { start: 0, end: 0 };
  return { start: tsOf(sorted[0]), end: tsOf(sorted[sorted.length - 1]) };
}

/**
 * Scrub-to-index: how many events have happened by `position` (offset <= position).
 * `offsets` must be ascending. Binary search, so scrubbing stays cheap on thousands of events.
 */
export function indexAt(offsets: readonly number[], position: number): number {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] <= position) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Scrub bar fraction (0..1) <-> timeline position. A zero-length timeline maps to 0. */
export function positionFromFraction(fraction: number, duration: number): number {
  return duration > 0 ? clamp(fraction, 0, 1) * duration : 0;
}
export function fractionOf(position: number, duration: number): number {
  return duration > 0 ? clamp(position / duration, 0, 1) : 0;
}

/** `mm:ss` for a timeline position; hours are folded into minutes (replay windows are short). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export type Counts = Record<Severity, number>;

export function tally(events: readonly SecurityEvent[]): Counts {
  const counts: Counts = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const event of events) {
    if (event.severity in counts) counts[event.severity] += 1;
  }
  return counts;
}

export function topTypes(events: readonly SecurityEvent[], limit = 5): Array<{ type: string; count: number }> {
  const byType = new Map<string, number>();
  for (const event of events) byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
  return [...byType.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1))
    .slice(0, limit);
}

const STAGE_OF_TACTIC: Record<string, string> = {
  reconnaissance: 'reconnaissance',
  discovery: 'reconnaissance',
  'initial-access': 'initial_access',
  'credential-access': 'initial_access',
  'command-and-control': 'c2',
  execution: 'exploitation',
  'lateral-movement': 'lateral_movement',
  exfiltration: 'impact',
  impact: 'impact',
};

/** Replay-only kill chain: a stage is 1 once an event of that stage has played, else 0. */
export function killChainOf(events: readonly SecurityEvent[]): Record<string, number> {
  const chain: Record<string, number> = {
    reconnaissance: 0, initial_access: 0, c2: 0, exploitation: 0, lateral_movement: 0, impact: 0,
  };
  for (const event of events) {
    const stage = event.mitre ? STAGE_OF_TACTIC[event.mitre.tactic] : undefined;
    if (stage) chain[stage] = 1;
  }
  return chain;
}

export type ThreatLevel = 'low' | 'guarded' | 'elevated' | 'high' | 'severe';

/** Replay-only banner level: the worst severity played so far. The backend scorer is not re-run. */
export function levelOf(counts: Counts): ThreatLevel {
  if (counts.critical > 0) return 'severe';
  if (counts.high > 0) return 'high';
  if (counts.medium > 0) return 'elevated';
  if (counts.low > 0) return 'guarded';
  return 'low';
}

export interface PageResult {
  events: SecurityEvent[];
  next_cursor: string | null;
}

/**
 * Follow `next_cursor` until the API says there is no more or `max` events are collected.
 * Returns oldest first. `truncated` is true when the cap stopped the walk (the oldest events of the
 * window are the ones missing, since the API is newest first).
 */
export async function collectPages(
  fetchPage: (cursor: string | undefined) => Promise<PageResult>,
  max: number,
): Promise<{ events: SecurityEvent[]; truncated: boolean }> {
  const all: SecurityEvent[] = [];
  let cursor: string | undefined;
  let truncated = false;
  for (let guard = 0; guard < 1000; guard += 1) {
    const page = await fetchPage(cursor);
    all.push(...page.events);
    if (!page.next_cursor || page.events.length === 0) break;
    if (all.length >= max) {
      truncated = true;
      break;
    }
    cursor = page.next_cursor;
  }
  const sorted = sortEvents(all);
  return truncated ? { events: sorted.slice(Math.max(0, sorted.length - max)), truncated } : { events: sorted, truncated };
}
