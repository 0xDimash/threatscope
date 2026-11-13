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
  pixelMap.width = 240;
  pixelMap.height = 120;
  brand.append(pixelMap);
  startPixelMap(pixelMap);

  const status = document.createElement('div');
  status.className = 'menu-status';
  status.innerHTML = '<span class="menu-status-dot" aria-hidden="true"></span><span class="menu-status-text">Checking backend…</span>';
  brand.append(status);
  startConnectionStatus(status);

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

  const W = canvas.width;
  const H = canvas.height;

  // Distinct square pixels: a grid of cells, each drawn as a square with a gap.
  const CELL = 4; // pixels per cell (including gap)
  const GAP = 1;
  const SIZE = CELL - GAP; // square size
  const COLS = Math.floor(W / CELL);
  const ROWS = Math.floor(H / CELL);

  // Continent ellipses in a 120x60 reference space.
  interface Blob { cx: number; cy: number; rx: number; ry: number; }
  const BLOBS: Blob[] = [
    { cx: 28, cy: 22, rx: 17, ry: 12 },
    { cx: 35, cy: 33, rx: 5, ry: 6 },
    { cx: 40, cy: 10, rx: 6, ry: 5 },
    { cx: 41, cy: 43, rx: 8, ry: 13 },
    { cx: 61, cy: 18, rx: 8, ry: 7 },
    { cx: 63, cy: 35, rx: 11, ry: 14 },
    { cx: 88, cy: 20, rx: 24, ry: 12 },
    { cx: 83, cy: 31, rx: 6, ry: 7 },
    { cx: 95, cy: 33, rx: 7, ry: 5 },
    { cx: 101, cy: 45, rx: 10, ry: 6 },
    { cx: 60, cy: 58, rx: 30, ry: 2 },
  ];

  const inBlob = (gx: number, gy: number): boolean => {
    const rx = (gx / COLS) * 120;
    const ry = (gy / ROWS) * 60;
    for (const b of BLOBS) {
      const dx = (rx - b.cx) / b.rx;
      const dy = (ry - b.cy) / b.ry;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  };

  // Precompute land grid.
  const land: boolean[] = new Array(COLS * ROWS).fill(false);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      land[r * COLS + c] = inBlob(c + 0.5, r + 0.5);
    }
  }

  // Locations in 120x60 space -> cell coords.
  const CITIES: Array<{ c: number; r: number; phase: number }> = [
    { c: 86, r: 16, phase: 0.0 },
    { c: 60, r: 13, phase: 1.3 },
    { c: 35, r: 17, phase: 2.1 },
    { c: 45, r: 39, phase: 3.4 },
    { c: 95, r: 30, phase: 4.2 },
    { c: 107, r: 18, phase: 5.1 },
    { c: 111, r: 42, phase: 0.7 },
    { c: 79, r: 22, phase: 2.8 },
    { c: 66, r: 42, phase: 4.9 },
    { c: 19, r: 17, phase: 3.0 },
  ].map((city) => ({
    c: Math.round((city.c / 120) * (COLS - 1)),
    r: Math.round((city.r / 60) * (ROWS - 1)),
    phase: city.phase,
  }));

  interface Pulse { a: number; b: number; t: number; speed: number; }
  const pulses: Pulse[] = [];
  let nextSpawn = 0.6;
  let last = performance.now();
  let elapsed = 0;
  let handle = 0;

  // Bresenham line between two cells.
  const lineCells = (c0: number, r0: number, c1: number, r1: number): Array<{ c: number; r: number }> => {
    const cells: Array<{ c: number; r: number }> = [];
    let x = c0, y = r0;
    const dx = Math.abs(c1 - c0);
    const dy = Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1;
    const sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      cells.push({ c: x, r: y });
      if (x === c1 && y === r1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return cells;
  };

  function spawnPulse(): void {
    let a = Math.floor(Math.random() * CITIES.length);
    let b = Math.floor(Math.random() * CITIES.length);
    if (a === b) b = (b + 1) % CITIES.length;
    pulses.push({ a, b, t: 0, speed: 0.25 + Math.random() * 0.2 });
  }

  function frame(now: number): void {
    if (!canvas.isConnected) {
      cancelAnimationFrame(handle);
      return;
    }
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += delta;

    ctx!.fillStyle = '#000000';
    ctx!.fillRect(0, 0, W, H);

    // dimmed land pixels (distinct squares)
    ctx!.fillStyle = 'rgba(255,255,255,0.07)';
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (land[r * COLS + c]) {
          ctx!.fillRect(c * CELL, r * CELL, SIZE, SIZE);
        }
      }
    }

    // occasional connections
    nextSpawn -= delta;
    if (nextSpawn <= 0) {
      spawnPulse();
      nextSpawn = 2.4 + Math.random() * 2.8;
    }
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      pulse.t += pulse.speed * delta;
      if (pulse.t >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      const a = CITIES[pulse.a];
      const b = CITIES[pulse.b];
      const cells = lineCells(a.c, a.r, b.c, b.r);
      const headIndex = Math.floor(pulse.t * (cells.length - 1));
      // faint path
      ctx!.fillStyle = 'rgba(255,255,255,0.04)';
      for (const cell of cells) {
        ctx!.fillRect(cell.c * CELL, cell.r * CELL, SIZE, SIZE);
      }
      // bright head with fading trail
      for (let step = 0; step < 5; step += 1) {
        const idx = headIndex - step;
        if (idx < 0 || idx >= cells.length) continue;
        const cell = cells[idx];
        const alpha = 0.85 - step * 0.15;
        ctx!.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx!.fillRect(cell.c * CELL, cell.r * CELL, SIZE, SIZE);
      }
    }

    // location highlights
    for (const city of CITIES) {
      const breathe = 0.5 + Math.sin(elapsed * 1.6 + city.phase) * 0.5;
      const alpha = 0.35 + breathe * 0.5;
      ctx!.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      const size = breathe > 0.7 ? CELL : SIZE;
      ctx!.fillRect(city.c * CELL - (size - SIZE) / 2, city.r * CELL - (size - SIZE) / 2, size, size);
    }

    handle = requestAnimationFrame(frame);
  }
  handle = requestAnimationFrame(frame);
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';

function startConnectionStatus(root: HTMLElement): void {
  const text = root.querySelector<HTMLElement>('.menu-status-text');

  const setState = (connected: boolean, label: string): void => {
    root.classList.toggle('menu-status-ok', connected);
    root.classList.toggle('menu-status-bad', !connected);
    if (text) text.textContent = label;
  };

  const check = async (): Promise<void> => {
    if (!root.isConnected) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${API_BASE}/healthz`, { signal: controller.signal });
      if (response.ok) {
        setState(true, 'Backend connected');
      } else {
        setState(false, `Backend error ${response.status}`);
      }
    } catch {
      setState(false, 'Backend offline');
    } finally {
      clearTimeout(timeout);
    }
  };

  void check();
  const interval = window.setInterval(() => {
    if (!root.isConnected) {
      window.clearInterval(interval);
      return;
    }
    void check();
  }, 5000);
}
