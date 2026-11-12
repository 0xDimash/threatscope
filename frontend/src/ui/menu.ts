import { SPACES, type SpaceDef } from './spaces';

export interface MenuCallbacks {
  onOpen(spaceId: string): void;
  onNewSpace(): void;
  onSettings(): void;
}

function spaceRow(space: SpaceDef, onOpen: (id: string) => void): HTMLElement {
  const row = document.createElement('button');
  row.className = 'menu-row';
  row.type = 'button';
  row.innerHTML = `
    <span class="menu-row-name"></span>
    <span class="menu-row-arrow" aria-hidden="true">→</span>
  `;
  const name = row.querySelector<HTMLElement>('.menu-row-name');
  if (name) name.textContent = space.title;
  row.addEventListener('click', () => onOpen(space.id));
  return row;
}

export function renderMenu(root: HTMLElement, callbacks: MenuCallbacks): void {
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'menu-layout';

  const brand = document.createElement('div');
  brand.className = 'menu-brand';
  brand.innerHTML = `<h1 class="menu-wordmark">ThreatScope</h1>`;

  const side = document.createElement('aside');
  side.className = 'menu-side';

  const topbar = document.createElement('div');
  topbar.className = 'menu-side-top';

  const newButton = document.createElement('button');
  newButton.className = 'menu-new';
  newButton.type = 'button';
  newButton.textContent = '+ New space';
  newButton.addEventListener('click', callbacks.onNewSpace);

  const settingsButton = document.createElement('button');
  settingsButton.className = 'menu-settings';
  settingsButton.type = 'button';
  settingsButton.setAttribute('aria-label', 'Settings');
  settingsButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4Z"
        fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"
      />
    </svg>
  `;
  settingsButton.addEventListener('click', callbacks.onSettings);

  topbar.append(newButton, settingsButton);

  const list = document.createElement('div');
  list.className = 'menu-list';
  for (const space of SPACES) {
    if (space.available) {
      list.append(spaceRow(space, callbacks.onOpen));
    }
  }

  side.append(topbar, list);
  layout.append(brand, side);
  root.append(layout);
}

export function showNewSpaceNotice(root: HTMLElement): void {
  const existing = root.querySelector<HTMLElement>('.menu-notice');
  if (existing) {
    existing.remove();
    return;
  }
  const notice = document.createElement('div');
  notice.className = 'menu-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = 'Custom spaces are on the roadmap — upload an asset inventory to add your own.';
  const close = document.createElement('button');
  close.className = 'menu-notice-close';
  close.type = 'button';
  close.textContent = '×';
  close.addEventListener('click', () => notice.remove());
  notice.append(close);
  root.append(notice);
}
