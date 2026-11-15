/**
 * Reconnecting WebSocket client for `/ws/events` (see `docs/api-contract.md`).
 *
 * Frames are `{kind, data}` and server -> client only. Unknown kinds are ignored, so adding a
 * frame type on the backend never breaks an older frontend. Consumers receive typed frames:
 *
 * ```ts
 * const stop = connectFeed({
 *   onFrame(frame) {
 *     if (frame.kind === 'event') scene.spawnArc?.(frame.data);
 *   },
 * });
 * ```
 *
 * The socket reconnects with capped exponential backoff and the returned function closes it
 * for good (including any pending reconnect).
 */
import type { SecurityEvent } from '../types/contract';
import { apiBase, type AggregateState, type RiskState } from './api';

export type FeedFrame =
  | { kind: 'event'; data: SecurityEvent }
  | { kind: 'state'; data: AggregateState }
  | { kind: 'risk'; data: RiskState };

export type FeedStatus = 'connecting' | 'open' | 'closed';

export interface FeedHandlers {
  onFrame?: (frame: FeedFrame) => void;
  onStatus?: (status: FeedStatus, detail?: string) => void;
}

const WS_URL = resolveWebSocketUrl();
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;
const FRAME_KINDS = new Set<FeedFrame['kind']>(['event', 'state', 'risk']);

/** Resolved WebSocket URL, e.g. `ws://localhost:8000/ws/events`. */
export function feedUrl(): string {
  return WS_URL;
}

/** Open the live feed and keep it open. Returns a disposer. */
export function connectFeed(handlers: FeedHandlers = {}): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: number | undefined;

  const notify = (status: FeedStatus, detail?: string): void => {
    handlers.onStatus?.(status, detail);
  };

  function scheduleReconnect(): void {
    if (closed) {
      return;
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
    attempt += 1;
    reconnectTimer = window.setTimeout(open, delay);
  }

  function open(): void {
    if (closed) {
      return;
    }
    notify('connecting');
    let next: WebSocket;
    try {
      next = new WebSocket(WS_URL);
    } catch (error) {
      notify('closed', error instanceof Error ? error.message : 'cannot open socket');
      scheduleReconnect();
      return;
    }
    socket = next;

    socket.addEventListener('open', () => {
      attempt = 0;
      notify('open');
    });
    socket.addEventListener('message', (event) => {
      const frame = parseFrame(event.data);
      if (frame) {
        handlers.onFrame?.(frame);
      }
    });
    socket.addEventListener('close', () => {
      if (closed) {
        return;
      }
      notify('closed');
      scheduleReconnect();
    });
    socket.addEventListener('error', () => notify('closed', 'socket error'));
  }

  open();

  return () => {
    closed = true;
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
    }
    socket?.close();
  };
}

function resolveWebSocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }
  const url = new URL('/ws/events', apiBase());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function parseFrame(raw: unknown): FeedFrame | null {
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    const value = JSON.parse(raw) as { kind?: unknown; data?: unknown };
    if (typeof value.kind !== 'string' || !FRAME_KINDS.has(value.kind as FeedFrame['kind'])) {
      return null;
    }
    if (typeof value.data !== 'object' || value.data === null) {
      return null;
    }
    return value as FeedFrame;
  } catch {
    return null;
  }
}
