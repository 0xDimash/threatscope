/**
 * Replay state machine: a playhead over a sorted list of events.
 *
 * It owns no timer and no DOM. The caller feeds it real elapsed time through `advance()`, so the
 * same events and the same chunking of time always give the same emission order. Events leave
 * through `emit`, which the app wires to the same handler the WebSocket feed uses.
 */
import type { SecurityEvent } from '../types/contract';
import {
  BACKFILL_ROWS, DEFAULT_SPEED, clamp, clampSpeed, indexAt, offsetsOf, scaleDelta, sortEvents, windowOf,
  type Speed,
} from './replayMath';

export type ReplayStatus = 'empty' | 'paused' | 'playing' | 'ended';

export interface ReplaySnapshot {
  status: ReplayStatus;
  speed: Speed;
  /** ms from the window start */
  position: number;
  duration: number;
  /** events played so far */
  index: number;
  total: number;
  /** epoch ms of the playhead, for relative HUD times */
  clock: number;
}

export interface ReplayHooks {
  /** One event at its time. `animate` is false for the HUD rows rebuilt after a seek (no arc). */
  emit(event: SecurityEvent, animate: boolean): void;
  /** Drop everything on screen that belongs to the previous position (arcs in flight, HUD rows). */
  clear(): void;
  /** Called after the visible position changed, with the events played so far, oldest first. */
  progress(played: readonly SecurityEvent[], snapshot: ReplaySnapshot): void;
}

export interface Replay {
  load(events: readonly SecurityEvent[]): void;
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(speed: number): void;
  /** Jump to a timeline position: clears, rebuilds the HUD tail, spawns no arcs. */
  seek(position: number): void;
  /** While true the playhead does not move (a drag on the scrub bar). */
  hold(on: boolean): void;
  /** Feed real elapsed milliseconds. */
  advance(realMs: number): void;
  /** Stop, clear the screen, forget the events. */
  unload(): void;
  snapshot(): ReplaySnapshot;
}

export function createReplay(hooks: ReplayHooks): Replay {
  let events: SecurityEvent[] = [];
  let offsets: number[] = [];
  let origin = 0;
  let duration = 0;
  let position = 0;
  let index = 0;
  let speed: Speed = DEFAULT_SPEED;
  let playing = false;
  let held = false;

  function status(): ReplayStatus {
    if (events.length === 0) return 'empty';
    if (index >= events.length && position >= duration) return 'ended';
    return playing ? 'playing' : 'paused';
  }

  function snapshot(): ReplaySnapshot {
    return { status: status(), speed, position, duration, index, total: events.length, clock: origin + position };
  }

  function notify(): void {
    hooks.progress(events.slice(0, index), snapshot());
  }

  function rebuildAt(target: number): void {
    hooks.clear();
    position = clamp(target, 0, duration);
    // position 0 means "before the first event", so pressing play still animates it
    index = position <= 0 ? 0 : indexAt(offsets, position);
    for (let i = Math.max(0, index - BACKFILL_ROWS); i < index; i += 1) hooks.emit(events[i], false);
    notify();
  }

  return {
    load(next): void {
      events = sortEvents(next);
      const window = windowOf(events);
      origin = window.start;
      duration = Math.max(0, window.end - window.start);
      offsets = offsetsOf(events, origin);
      playing = false;
      rebuildAt(0);
    },
    play(): void {
      if (events.length === 0) return;
      if (index >= events.length && position >= duration) rebuildAt(0);
      playing = true;
      notify();
    },
    pause(): void {
      playing = false;
      notify();
    },
    toggle(): void {
      if (playing && status() !== 'ended') this.pause();
      else this.play();
    },
    setSpeed(value): void {
      speed = clampSpeed(value);
      notify();
    },
    seek(target): void {
      if (events.length === 0) return;
      rebuildAt(target);
    },
    hold(on): void {
      held = on;
    },
    advance(realMs): void {
      if (!playing || held || events.length === 0) return;
      const previous = index;
      position = Math.min(duration, position + scaleDelta(realMs, speed));
      index = indexAt(offsets, position);
      for (let i = previous; i < index; i += 1) hooks.emit(events[i], true);
      if (index >= events.length && position >= duration) playing = false;
      notify();
    },
    unload(): void {
      events = [];
      offsets = [];
      origin = 0;
      duration = 0;
      position = 0;
      index = 0;
      playing = false;
      hooks.clear();
      notify();
    },
    snapshot,
  };
}
