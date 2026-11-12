import { SPACES, type SpaceDef } from './spaces';

export interface MenuCallbacks {
  onOpen(spaceId: string): void;
  onNewSpace(): void;
  onSettings(): void;
}

function spaceCard(space: SpaceDef, onOpen: (id: string) => void): HTMLElement {
  const card = document.createElement('button');
  card.className = 'menu-card';
  card.type = 'button';
  card.style.setProperty('--accent', space.accent);
  card.innerHTML = `
    <span class="menu-card-badge">${space.badge}</span>
    <span class="menu-card-title"></span>
    <span class="menu-card-tagline"></span>
    <span class="menu-card-meta"></span>
    <span class="menu-card-cta">Open space →</span>
  `;
  const title = card.querySelector<HTMLElement>('.menu-card-title');
  const tagline = card.querySelector<HTMLElement>('.menu-card-tagline');
  const meta = card.querySelector<HTMLElement>('.menu-card-meta');
  if (title) title.textContent = space.title;
  if (tagline) tagline.textContent = space.tagline;
  if (meta) meta.textContent = space.meta;
  card.addEventListener('click', () => onOpen(space.id));
  return card;
}

function newSpaceCard(onNewSpace: () => void): HTMLElement {
  const card = document.createElement('button');
  card.className = 'menu-card menu-card-new';
  card.type = 'button';
  card.innerHTML = `
    <span class="menu-card-plus">+</span>
    <span class="menu-card-title">New environment</span>
    <span class="menu-card-tagline">Import your own network and visualize it</span>
    <span class="menu-card-meta">Coming in a later phase</span>
  `;
  card.addEventListener('click', onNewSpace);
  return card;
}

export function renderMenu(root: HTMLElement, callbacks: MenuCallbacks): void {
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'menu-layout';

  const header = document.createElement('header');
  header.className = 'menu-header';

  const brand = document.createElement('div');
  brand.className = 'menu-brand';
  brand.innerHTML = `
    <p class="menu-eyebrow">ThreatScope 3D</p>
    <h1 class="menu-title">Choose a space</h1>
    <p class="menu-subtitle">
      Every space is one environment you can look into — a whole city or a single
      office room. Pick one to open its live 3D network view.
    </p>
  `;

  const settingsButton = document.createElement('button');
  settingsButton.className = 'menu-settings';
  settingsButton.type = 'button';
  settingsButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4Z"
        fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"
      />
    </svg>
    <span>Settings</span>
  `;
  settingsButton.addEventListener('click', callbacks.onSettings);

  header.append(brand, settingsButton);

  const grid = document.createElement('div');
  grid.className = 'menu-grid';
  for (const space of SPACES) {
    if (space.available) {
      grid.append(spaceCard(space, callbacks.onOpen));
    }
  }
  grid.append(newSpaceCard(callbacks.onNewSpace));

  const footer = document.createElement('footer');
  footer.className = 'menu-footer';
  footer.textContent = 'Orbit to rotate · scroll to zoom · click a device for details';

  layout.append(header, grid, footer);
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
  notice.innerHTML = `
    <strong>Custom spaces are on the roadmap.</strong>
    <span>
      You will upload an asset inventory (name, kind, position, IP) and your
      environment will appear here next to the built-in ones.
    </span>
    <button type="button" class="menu-notice-close">Dismiss</button>
  `;
  notice.querySelector<HTMLButtonElement>('.menu-notice-close')?.addEventListener('click', () => notice.remove());
  root.append(notice);
}
