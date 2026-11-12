import './styles/scene.css';
import './styles/menu.css';
import inventory from '../../data/assets.json';
import { createCityScene } from './scene';
import { createOfficeScene } from './scene/office';
import { parseInventory } from './scene/inventory';
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
  city: (target, options) => {
    const { assets, links } = parseInventory(inventory);
    return createCityScene(target, { assets, links, bloom: options.bloom, labels: options.labels });
  },
  office: (target, options) => createOfficeScene(target, options),
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
