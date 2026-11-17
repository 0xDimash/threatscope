import './styles/scene.css';
import './styles/menu.css';
import { createRoomScene } from './scene/room';
import { fixtureEvents } from './data/contract-fixtures';
import type { CityScene } from './scene/types';
import type { RiskState } from './types/contract';
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
      // feed fixture events + a mock aggregate state
      const counts = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
      const deviceCounts = new Map<string, number>();
      let idx = 0;
      const feed = window.setInterval(() => {
        const ev = fixtureEvents[idx % fixtureEvents.length];
        // remap dst to a room device so arcs/HUD line up
        const devIds = ['room-rack', 'room-pc1', 'room-pc2', 'room-nas', 'room-iot', 'room-cam'];
        const target = devIds[idx % devIds.length];
        const ev2 = { ...ev, id: `hud-${idx}`, dst: { ...ev.dst, asset_id: target } };
        counts[ev.severity] += 1;
        deviceCounts.set(target, (deviceCounts.get(target) ?? 0) + 1);
        hud.addEvent(ev2);
        const total = counts.info + counts.low + counts.medium + counts.high + counts.critical;
        const threatLevel =
          counts.critical > 0 ? 'severe' : counts.high > 0 ? 'high' : counts.medium > 0 ? 'elevated' : 'guarded';
        hud.setState({
          threat_level: threatLevel as any,
          counts: { ...counts },
          compromised_assets: counts.critical > 2 ? 1 : 0,
          kill_chain: { reconnaissance: Math.min(1, total / 20), initial_access: Math.min(1, total / 30), c2: 0.2, exploitation: 0.1, lateral_movement: 0, impact: 0 },
          top_types: [{ type: ev.type, count: 1 }],
        });
        idx += 1;
      }, 1500);
      // store timer on scene? store on window for cleanup
      (active as any).__hudTimer = feed;
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

      hudHost.addEventListener('hud:select', (e: any) => {
        scene.focusAsset(e.detail);
        hud.selectAsset(e.detail, buildRisk(e.detail));
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
