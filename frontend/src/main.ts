import './styles/scene.css';
import './styles/menu.css';
import { createRoomScene } from './scene/room';
import { fixtureEvents } from './data/contract-fixtures';
import { connectFeed, type AggregateState, type FeedStatus } from './data';
import type { SecurityEvent } from './types/contract';
import type { CityScene } from './scene/types';
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
let activeSpaceId: string | null = null;

function settingsOptions(): { bloom: boolean; labels: boolean } {
  const bloom = readSetting('bloom', true) && !/[?&]nobloom/.test(window.location.search);
  return { bloom, labels: readSetting('labels', true) };
}

function disposeActive(): void {
  active?.dispose();
  active = null;
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
