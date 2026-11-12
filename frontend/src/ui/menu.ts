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

  const pixelMap = document.createElement('canvas');
  pixelMap.className = 'menu-pixelmap';
  pixelMap.width = 120;
  pixelMap.height = 60;
  brand.append(pixelMap);
  startPixelMap(pixelMap);

  const side = document.createElement('aside');
  side.className = 'menu-side';

  const topbar = document.createElement('div');
  topbar.className = 'menu-side-top';

  const newButton = document.createElement('button');
  newButton.className = 'menu-new';
  newButton.type = 'button';
  newButton.textContent = '+ New space';
  newButton.addEventListener('click', callbacks.onNewSpace);

  topbar.append(newButton);

  const settingsButton = document.createElement('button');
  settingsButton.className = 'menu-settings-bottom';
  settingsButton.type = 'button';
  settingsButton.setAttribute('aria-label', 'Settings');
  settingsButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4Z"
        fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"
      />
    </svg>
    <span>Settings</span>
  `;
  settingsButton.addEventListener('click', callbacks.onSettings);

  const list = document.createElement('div');
  list.className = 'menu-list';
  for (const space of SPACES) {
    if (space.available) {
      list.append(spaceRow(space, callbacks.onOpen));
    }
  }

  side.append(topbar, list);
  layout.append(brand, side);
  root.append(layout, settingsButton);
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

function startPixelMap(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const COLS = 24;
  const ROWS = 12;
  const CELL = canvas.width / COLS;

  interface Dot { c: number; r: number; phase: number; hot: boolean; }
  const dots: Dot[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      dots.push({ c, r, phase: Math.random() * Math.PI * 2, hot: Math.random() < 0.06 });
    }
  }
  const indexOf = (c: number, r: number): number => r * COLS + c;

  interface Edge { a: number; b: number; }
  const edges: Edge[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (c + 1 < COLS) edges.push({ a: indexOf(c, r), b: indexOf(c + 1, r) });
      if (r + 1 < ROWS) edges.push({ a: indexOf(c, r), b: indexOf(c, r + 1) });
    }
  }
  for (let i = 0; i < 14; i += 1) {
    const c = Math.floor(Math.random() * (COLS - 1));
    const r = Math.floor(Math.random() * (ROWS - 1));
    edges.push({ a: indexOf(c, r), b: indexOf(c + 1, r + 1) });
  }

  interface Pulse { edge: Edge; t: number; speed: number; }
  const pulses: Pulse[] = edges.map((edge) => ({
    edge,
    t: Math.random(),
    speed: 0.25 + Math.random() * 0.5,
  }));

  let last = performance.now();
  let elapsed = 0;
  let handle = 0;

  const dotPos = (dot: Dot): { x: number; y: number } => ({
    x: dot.c * CELL + CELL / 2,
    y: dot.r * CELL + CELL / 2,
  });

  function frame(now: number): void {
    if (!canvas.isConnected) {
      cancelAnimationFrame(handle);
      return;
    }
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += delta;

    ctx!.fillStyle = '#000000';
    ctx!.fillRect(0, 0, canvas.width, canvas.height);

    ctx!.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx!.lineWidth = 1;
    for (const edge of edges) {
      const a = dotPos(dots[edge.a]);
      const b = dotPos(dots[edge.b]);
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(b.x, b.y);
      ctx!.stroke();
    }

    for (const pulse of pulses) {
      pulse.t += pulse.speed * delta;
      if (pulse.t > 1) {
        pulse.t -= 1;
        pulse.speed = 0.25 + Math.random() * 0.5;
      }
      const a = dotPos(dots[pulse.edge.a]);
      const b = dotPos(dots[pulse.edge.b]);
      const x = a.x + (b.x - a.x) * pulse.t;
      const y = a.y + (b.y - a.y) * pulse.t;
      ctx!.fillStyle = 'rgba(255,255,255,0.9)';
      ctx!.fillRect(Math.floor(x), Math.floor(y), 2, 2);
    }

    for (const dot of dots) {
      const p = dotPos(dot);
      const breathe = 0.5 + Math.sin(elapsed * 1.4 + dot.phase) * 0.5;
      const alpha = dot.hot ? 0.95 : 0.25 + breathe * 0.35;
      ctx!.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      const size = dot.hot ? 2 : 1;
      ctx!.fillRect(Math.floor(p.x), Math.floor(p.y), size, size);
    }

    handle = requestAnimationFrame(frame);
  }
  handle = requestAnimationFrame(frame);
}
