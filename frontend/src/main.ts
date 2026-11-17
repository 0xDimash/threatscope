import './styles/scene.css';
import './styles/menu.css';
import { createRoomScene } from './scene/room';
import { fixtureEvents } from './data/contract-fixtures';
import { connectFeed, fetchState, fetchAssetRisk, type AggregateState } from './data';
import type { CityScene } from './scene/types';
import type { RiskState, SecurityEvent } from './types/contract';
import type { FeedStatus } from './data';
import { createHud, type HudApi } from './ui/hud';
import { renderMenu, showNewSpaceNotice } from './ui/menu';
import { SPACES } from './ui/spaces';
import { openSettings, readSetting } from './ui/settings';

function requireElement<T extends HTMLElement>(selector: string, name: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`${name} missing`);
  }
  return element;
}

const canvas = requireElement<HTMLCanvasElement>('#scene', '#scene canvas');
const menuRoot = requireElement<HTMLElement>('#menu', '#menu');
const topbar = requireElement<HTMLElement>('#topbar', '#topbar');
const spaceTitle = requireElement<HTMLElement>('#space-title', '#space-title');
const backBtn = requireElement<HTMLButtonElement>('#back-btn', '#back-btn');
const settingsBtn = requireElement<HTMLButtonElement>('#settings-btn', '#settings-btn');
const modalRoot = requireElement<HTMLElement>('#modal-root', '#modal-root');

type SceneFactory = (canvas: HTMLCanvasElement, options: { bloom: boolean; labels: boolean }) => CityScene;

const FACTORIES: Record<string, SceneFactory> = {
  room: (target, options) => createRoomScene(target, { ...options, events: fixtureEvents, eventIntervalMs: 1400 }),
};

let active: CityScene | null = null;
let activeHud: HudApi | null = null;
let activeSpaceId: string | null = null;

function settingsOptions(): { bloom: boolean; labels: boolean } {
  const bloom = readSetting('bloom', true) && !/[?&]nobloom/.test(window.location.search);
  return { bloom, labels: readSetting('labels', true) };
}

function disposeActive(): void {
  if (active && (active as any).__hudTimer) window.clearInterval((active as any).__hudTimer);
  if (active && (active as any).__stopFeed) (active as any).__stopFeed();
  active?.dispose();
  active = null;
  activeHud?.dispose();
  activeHud = null;
  activeSpaceId = null;
}

function showMenu(): void {
  disposeActive();
  menuRoot.hidden = false;
  topbar.hidden = true;
  renderMenu(menuRoot, {
    onOpen(spaceId: string): void {
      window.location.hash = `#/space/${spaceId}`;
    },
    onNewSpace(): void {
      showNewSpaceNotice(menuRoot);
    },
    onSettings(): void {
      openSettingsModal();
    },
  });
}

function openSpace(spaceId: string): void {
  const factory = FACTORIES[spaceId];
  const space = SPACES.find((entry) => entry.id === spaceId);
  if (!factory || !space || !space.available) {
    window.location.hash = '#/';
    return;
  }
  disposeActive();
  menuRoot.hidden = true;
  topbar.hidden = false;
  spaceTitle.textContent = space.title;
  const scene = factory(canvas, settingsOptions());
  scene.start();
  active = scene;
  activeSpaceId = spaceId;
  (window as Window & { __threatscope?: CityScene }).__threatscope = scene;

  if (spaceId === 'room') {
    const hudHost = document.querySelector<HTMLElement>('#hud');
    if (hudHost) {
      const hud = createHud(hudHost);
      activeHud = hud;
      const deviceCounts = new Map<string, number>();
      const buildRisk = (id: string): RiskState => {
        const n = deviceCounts.get(id) ?? 0;
        const risk = Math.min(100, n * 6 + (id.length % 5));
        const state: RiskState['state'] =
          risk >= 80 ? 'compromised' : risk >= 55 ? 'critical' : risk >= 30 ? 'elevated' : 'ok';
        return {
          asset_id: id,
          risk,
          state,
          events_24h: n,
          last_event_ts: new Date().toISOString(),
          top_types: ['anomaly'],
        };
      };

      // Initial state from the backend.
      fetchState().then((st) => hud.setState(st)).catch(() => {});

      // Live feed via the real WebSocket client.
      const stopFeed = connectFeed({
        onFrame(frame) {
          if (frame.kind === 'event') {
            const ev = frame.data;
            const target = ev.dst.asset_id;
            if (target) {
              deviceCounts.set(target, (deviceCounts.get(target) ?? 0) + 1);
              scene.spawnArc?.(ev);
            }
            hud.addEvent(ev);
          } else if (frame.kind === 'state') {
            hud.setState(frame.data);
          } else if (frame.kind === 'risk') {
            // Update detail card if the selected asset matches.
            // (No-op here; selectAsset is called on click.)
          }
        },
      });
      (active as any).__stopFeed = stopFeed;

      hudHost.addEventListener('hud:select', (e: any) => {
        scene.focusAsset(e.detail);
        hud.selectAsset(e.detail, buildRisk(e.detail));
        // try real risk from backend
        fetchAssetRisk(e.detail).then((r) => hud.selectAsset(e.detail, r)).catch(() => {});
      });
      hudHost.addEventListener('hud:hover', (e: any) => {
        scene.highlight?.(e.detail);
      });
    }
  }
}

function openSettingsModal(): void {
  openSettings(modalRoot, {
    onChange(): void {
      // Rebuild the live space so the new look applies immediately.
      if (activeSpaceId) {
        openSpace(activeSpaceId);
      }
    },
    onClose(): void {
      /* nothing — modal is removed by itself */
    },
  });
}

function route(): void {
  const match = /^#\/space\/([\w-]+)$/.exec(window.location.hash);
  if (match) {
    openSpace(match[1]);
  } else {
    showMenu();
  }
}

backBtn.addEventListener('click', () => {
  window.location.hash = '#/';
});
canvas.addEventListener('click', (event: MouseEvent) => {
  if (!active) return;
  const id = active.pick(event.clientX, event.clientY);
  if (id) {
    active.focusAsset(id);
    activeHud?.selectAsset(id, null);
  }
});
settingsBtn.addEventListener('click', openSettingsModal);
window.addEventListener('hashchange', route);
route();

/** Live snapshot exposed as `window.__threatscopeLive` for manual verification. */
const live = {
  feed: 'connecting' as FeedStatus,
  events: 0,
  state: null as AggregateState | null,
  lastEvent: null as SecurityEvent | null,
};

declare global {
  interface Window {
    __threatscopeLive?: typeof live;
  }
}

window.__threatscopeLive = live;

const stopFeed = connectFeed({
  onStatus(status: FeedStatus, detail?: string): void {
    live.feed = status;
    console.info(`[threatscope] live feed ${status}${detail ? ` (${detail})` : ''}`);
  },
  onFrame(frame): void {
    if (frame.kind === 'event') {
      live.events += 1;
      live.lastEvent = frame.data;
      active?.spawnArc?.(frame.data);
    } else if (frame.kind === 'state') {
      live.state = frame.data;
    }
  },
});

window.addEventListener('beforeunload', stopFeed, { once: true });
