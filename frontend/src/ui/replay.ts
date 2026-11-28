/**
 * Replay and time controls: Live / Demo / History switch, play-pause, speed and a scrub bar.
 *
 * Replayed events leave through `host.applyEvent`, the same function the WebSocket feed calls, so
 * arcs, HUD rows and counters take one render path. All text is set with textContent.
 */
import './replay.css';
import type { SecurityEvent } from '../types/contract';
import type { AggregateState } from './hud';
import { fetchEvents } from '../data/api';
import { createReplay, type ReplaySnapshot } from './replayController';
import {
  SPEEDS, collectPages, fractionOf, formatClock, killChainOf, lastWindow, levelOf, positionFromFraction,
  tally, topTypes,
} from './replayMath';
import demoScenario from './demoScenario.json';

export type ReplayMode = 'live' | 'demo' | 'history';

export interface ReplayHost {
  /** Draw one event: arc (when `animate`) and HUD row. Must be the live feed's own handler. */
  applyEvent(event: SecurityEvent, animate: boolean): void;
  applyState(state: AggregateState): void;
  /** Remove arcs in flight and HUD rows. */
  clear(): void;
  /** Relative HUD times follow this clock while replaying; null returns to wall time. */
  setClock(clock: (() => number) | null): void;
  /** Back to live: refetch the aggregate counters. */
  restoreLive(): void;
}

export interface ReplayUi {
  /** True while the live feed should drive the screen. */
  isLive(): boolean;
  dispose(): void;
}

const WINDOWS: Array<{ label: string; minutes: number }> = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '24h', minutes: 1440 },
];
const PAGE_SIZE = 500;
const MAX_EVENTS = 3000;
const TICK_MS = 50;

/** Seconds from `?at=`, or null when absent or not a number. */
function startAt(): number | null {
  const raw = new URLSearchParams(window.location.search).get('at');
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string, text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(className: string, text: string, label?: string): HTMLButtonElement {
  const b = node('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

export function mountReplay(hudHost: HTMLElement, host: ReplayHost): ReplayUi {
  hudHost.querySelector('.replay')?.remove();

  const root = node('section', 'replay');
  root.setAttribute('aria-label', 'Replay controls');

  const modeRow = node('div', 'replay-row replay-modes');
  const modeButtons: Record<ReplayMode, HTMLButtonElement> = {
    live: button('replay-mode', 'Live'),
    demo: button('replay-mode', 'Demo'),
    history: button('replay-mode', 'History'),
  };
  const badge = node('span', 'replay-badge', 'LIVE');
  badge.setAttribute('role', 'status');
  modeRow.append(modeButtons.live, modeButtons.demo, modeButtons.history, badge);

  const windowRow = node('div', 'replay-row replay-windows');
  const windowButtons = WINDOWS.map((w) => {
    const b = button('replay-win', w.label, `Last ${w.label}`);
    b.dataset.minutes = String(w.minutes);
    return b;
  });
  windowRow.append(node('span', 'replay-label', 'window'), ...windowButtons);

  const transport = node('div', 'replay-row replay-transport');
  const playBtn = button('replay-play', '▶', 'Play');
  const speedButtons = SPEEDS.map((s) => {
    const b = button('replay-speed', `${s}x`, `Speed ${s}x`);
    b.dataset.speed = String(s);
    return b;
  });
  const timeLabel = node('span', 'replay-time', '00:00 / 00:00');
  transport.append(playBtn, ...speedButtons, timeLabel);

  const scrub = node('input', 'replay-scrub');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = '1000';
  scrub.step = '1';
  scrub.value = '0';
  scrub.setAttribute('aria-label', 'Scrub through the replay');

  const note = node('div', 'replay-note');
  root.append(modeRow, windowRow, transport, scrub, note);
  hudHost.appendChild(root);

  let mode: ReplayMode = 'live';
  let minutes = 15;
  let loadToken = 0;
  let dragging = false;
  let lastSnapshot: ReplaySnapshot | null = null;

  const replay = createReplay({
    emit: (event, animate) => host.applyEvent(event, animate),
    clear: () => host.clear(),
    progress(played, snapshot) {
      lastSnapshot = snapshot;
      if (mode !== 'live') {
        const counts = tally(played);
        host.applyState({
          threat_level: levelOf(counts),
          counts,
          compromised_assets: 0,
          kill_chain: killChainOf(played),
          top_types: topTypes(played),
        });
      }
      paint();
    },
  });

  function modeLabel(): string {
    if (mode === 'live') return 'LIVE';
    if (mode === 'demo') return 'REPLAY · DEMO';
    return `REPLAY · LAST ${WINDOWS.find((w) => w.minutes === minutes)?.label.toUpperCase() ?? ''}`;
  }

  function paint(): void {
    const replaying = mode !== 'live';
    document.body.classList.toggle('replay-mode', replaying);
    root.classList.toggle('is-replay', replaying);
    badge.textContent = modeLabel();
    for (const key of Object.keys(modeButtons) as ReplayMode[]) {
      modeButtons[key].classList.toggle('active', key === mode);
      modeButtons[key].setAttribute('aria-pressed', String(key === mode));
    }
    windowRow.hidden = mode !== 'history';
    transport.hidden = !replaying;
    scrub.hidden = !replaying;
    windowButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.minutes) === minutes));

    const snap = lastSnapshot ?? replay.snapshot();
    const playing = snap.status === 'playing';
    playBtn.textContent = playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.disabled = snap.status === 'empty';
    scrub.disabled = snap.status === 'empty';
    speedButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === snap.speed));
    timeLabel.textContent = `${formatClock(snap.position)} / ${formatClock(snap.duration)}`;
    if (!dragging) scrub.value = String(Math.round(fractionOf(snap.position, snap.duration) * 1000));
    if (snap.status !== 'empty') note.textContent = `${snap.index} / ${snap.total} events`;
  }

  async function enter(next: ReplayMode): Promise<void> {
    loadToken += 1;
    const token = loadToken;
    mode = next;
    replay.unload(); // clears arcs in flight and HUD rows
    if (next === 'live') {
      host.setClock(null);
      note.textContent = 'Showing the live feed.';
      host.restoreLive();
      paint();
      return;
    }
    host.setClock(() => replay.snapshot().clock);
    if (next === 'demo') {
      note.textContent = '';
      replay.load(demoScenario.events as SecurityEvent[]);
      const at = startAt();
      if (at === null) {
        replay.play();
      } else {
        replay.seek(at * 1000); // `?replay=demo&at=32` opens paused at 32 s (screenshots, rehearsal)
      }
      return;
    }
    note.textContent = 'Loading events…';
    paint();
    const win = lastWindow(Date.now(), minutes);
    try {
      const result = await collectPages(
        (cursor) => fetchEvents({ from: win.from, to: win.to, limit: PAGE_SIZE, cursor }),
        MAX_EVENTS,
      );
      if (token !== loadToken) return; // the user switched away while loading
      if (result.events.length === 0) {
        note.textContent = 'No events in this window. Try a longer one, or Demo.';
        paint();
        return;
      }
      replay.load(result.events);
      replay.play();
      if (result.truncated) note.textContent = `Showing the newest ${result.events.length} events.`;
    } catch {
      if (token !== loadToken) return;
      note.textContent = 'Backend unreachable. Demo plays offline.';
      paint();
    }
  }

  modeButtons.live.addEventListener('click', () => void enter('live'));
  modeButtons.demo.addEventListener('click', () => void enter('demo'));
  modeButtons.history.addEventListener('click', () => void enter('history'));
  windowButtons.forEach((b) =>
    b.addEventListener('click', () => {
      minutes = Number(b.dataset.minutes);
      void enter('history');
    }),
  );
  playBtn.addEventListener('click', () => {
    replay.toggle();
  });
  speedButtons.forEach((b) => b.addEventListener('click', () => replay.setSpeed(Number(b.dataset.speed))));

  scrub.addEventListener('pointerdown', () => {
    dragging = true;
    replay.hold(true);
  });
  const endDrag = (): void => {
    dragging = false;
    replay.hold(false);
    paint();
  };
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);
  scrub.addEventListener('blur', endDrag);
  scrub.addEventListener('input', () => {
    const duration = replay.snapshot().duration;
    replay.seek(positionFromFraction(Number(scrub.value) / 1000, duration));
  });

  let last = performance.now();
  const timer = window.setInterval(() => {
    const now = performance.now();
    replay.advance(now - last);
    last = now;
  }, TICK_MS);

  paint();
  // `?replay=demo` opens the recorded scenario straight away: one URL for the defence.
  if (new URLSearchParams(window.location.search).get('replay') === 'demo') void enter('demo');

  return {
    isLive: () => mode === 'live',
    dispose(): void {
      window.clearInterval(timer);
      loadToken += 1;
      replay.unload();
      host.setClock(null);
      document.body.classList.remove('replay-mode');
      root.remove();
    },
  };
}
