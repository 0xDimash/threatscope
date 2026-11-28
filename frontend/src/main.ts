import './styles/scene.css';
import './styles/menu.css';
import { createRoomScene, type RoomComponent } from './scene/room';
import { deviceForAsset, setRoomSpace } from './scene/roomMap';
import {
  ApiError,
  connectFeed,
  fetchAssetRisk,
  fetchState,
  getSpaceRisk,
  type AggregateState,
  type SpaceRiskComponent,
} from './data';
import type { CityScene } from './scene/types';
import type { RiskState, SecurityEvent } from './types/contract';
import type { FeedStatus } from './data';
import { createHud, type HudApi } from './ui/hud';
import { mountFeedControl } from './ui/feedControl';
import { renderMenu } from './ui/menu';
import { openSpaceEditor } from './ui/newSpace';
import { showNotice } from './ui/notice';
import { findSpace, loadSpaces, type SpaceDef, type SpaceTemplate } from './ui/spaces';
import { openSettings, readSetting } from './ui/settings';
import { createFigureTools } from './ui/figures';

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

type SceneFactory = (
  canvas: HTMLCanvasElement,
  options: { bloom: boolean; labels: boolean; layout?: RoomComponent[] },
) => CityScene;

const FACTORIES: Record<SpaceTemplate, SceneFactory> = {
  room: (target, options) => createRoomScene(target, options),
};

let active: CityScene | null = null;
let activeHud: HudApi | null = null;
let activeSpaceId: string | null = null;
let activeSpace: SpaceDef | null = null;
let activeRisk = new Map<string, SpaceRiskComponent>();

/** One component's entry from `/api/spaces/{id}/risk` as the detail card's RiskState. */
function riskStateFor(entry: SpaceRiskComponent | undefined): RiskState | null {
  if (!entry || entry.risk === null || entry.state === null || entry.events_24h === null) return null;
  return {
    asset_id: entry.asset_id ?? '',
    risk: entry.risk,
    state: entry.state,
    events_24h: entry.events_24h,
    last_event_ts: null,
    top_types: [],
  };
}

/** The backend is the only source of risk; no locally invented numbers. */
async function refreshActiveRisk(): Promise<void> {
  const spaceId = activeSpaceId;
  if (!spaceId) return;
  try {
    const response = await getSpaceRisk(spaceId);
    if (activeSpaceId !== spaceId) return;
    activeRisk = new Map(response.components.map((component) => [component.id, component]));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      showNotice('This space no longer exists on the server. It may have been deleted elsewhere.');
    }
  }
}

// Thesis figure export. Figure mode belongs to the room view and is re-applied whenever a scene is built.
const figures = createFigureTools({
  getScene: () => active,
  getSpaceId: () => activeSpaceId,
  getHudHost: () => document.querySelector<HTMLElement>('#hud'),
  getSelectedAssetId: () => activeHud?.selectedId() ?? null,
});

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
  activeSpace = null;
  activeRisk = new Map();
}

function showMenu(): void {
  disposeActive();
  figures.setFigureMode(false);
  menuRoot.hidden = false;
  topbar.hidden = true;
  renderMenu(menuRoot, {
    onOpen(spaceId: string): void {
      window.location.hash = `#/space/${spaceId}`;
    },
    onNewSpace(): void {
      openSpaceEditor(modalRoot, {
        onSaved(spaceId: string): void {
          window.location.hash = `#/space/${spaceId}`;
        },
      });
    },
    onEditSpace(spaceId: string): void {
      const space = findSpace(spaceId);
      if (!space) return;
      openSpaceEditor(modalRoot, {
        space,
        onSaved(): void {
          // stay on the landing; re-render so the new name and device count show
          showMenu();
        },
      });
    },
    onSettings(): void {
      openSettingsModal();
    },
  });
}

function openSpace(spaceId: string): void {
  const space = findSpace(spaceId);
  const factory = space ? FACTORIES[space.template] : null;
  if (!factory || !space || !space.available) {
    window.location.hash = '#/';
    return;
  }
  disposeActive();
  menuRoot.hidden = true;
  topbar.hidden = false;
  spaceTitle.textContent = space.title;
  activeSpace = space;
  activeSpaceId = spaceId;
  // Bindings drive both the arcs and the HUD focus; set them before the scene is built.
  setRoomSpace(space);
  const scene = factory(canvas, { ...settingsOptions(), layout: space.components });
  scene.start();
  active = scene;
  figures.setFigureMode(figures.isFigureMode());
  (window as Window & { __threatscope?: CityScene }).__threatscope = scene;

  if (space.template === 'room') {
    const hudHost = document.querySelector<HTMLElement>('#hud');
    if (hudHost) {
      const hud = createHud(hudHost);
      activeHud = hud;
      mountFeedControl(hudHost);
      const deviceCounts = new Map<string, number>();

      // Initial state from the backend.
      fetchState().then((st) => hud.setState(st)).catch(() => {});
      void refreshActiveRisk();

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
            hud.updateRisk(frame.data.asset_id, frame.data);
          }
        },
      });
      (active as any).__stopFeed = stopFeed;

      // Bound devices read risk from `/api/spaces/{id}/risk`; unbound ones say so.
      hudHost.addEventListener('hud:select', (e: any) => {
        const assetId = e.detail as string;
        const component = activeSpace?.components?.find((candidate) => candidate.asset_id === assetId);
        scene.focusAsset(deviceForAsset(assetId) ?? assetId);
        if (component) {
          hud.selectAsset(assetId, riskStateFor(activeRisk.get(component.id)), true);
          void refreshActiveRisk().then(() =>
            hud.selectAsset(assetId, riskStateFor(activeRisk.get(component.id)), true),
          );
          return;
        }
        fetchAssetRisk(assetId)
          .then((risk) => hud.selectAsset(assetId, risk, true))
          .catch(() => hud.selectAsset(assetId, null, true));
      });
      hudHost.addEventListener('hud:hover', (e: any) => {
        scene.highlight?.(deviceForAsset(e.detail) ?? e.detail);
      });
    }
  }
}

function openSettingsModal(): void {
  openSettings(
    modalRoot,
    {
      onChange(): void {
        // Rebuild the live space so the new look applies immediately.
        if (activeSpaceId) {
          openSpace(activeSpaceId);
        }
      },
      onClose(): void {
        /* nothing — modal is removed by itself */
      },
    },
    // Figures only make sense with a room on screen, not from the landing page.
    active ? figures : undefined,
  );
}

async function route(): Promise<void> {
  // The backend list decides what exists; await it so a space from another browser opens.
  await loadSpaces();
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
  if (!id) return;
  const spaceId = activeSpaceId;
  const component = activeSpace?.components?.find((candidate) => candidate.id === id);
  active.focusAsset(id);
  if (!component) {
    activeHud?.selectAsset(id, null, null);
    return;
  }
  if (component.asset_id === null) {
    activeHud?.selectAsset(id, null, false);
    return;
  }
  const assetId = component.asset_id;
  const show = (): void => {
    if (activeSpaceId !== spaceId) return;
    activeHud?.selectAsset(assetId, riskStateFor(activeRisk.get(component.id)), true);
  };
  show();
  void refreshActiveRisk().then(show);
});
settingsBtn.addEventListener('click', openSettingsModal);
window.addEventListener('hashchange', () => void route());
void route();

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
