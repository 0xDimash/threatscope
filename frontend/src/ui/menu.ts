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
  pixelMap.width = 160;
  pixelMap.height = 80;
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

  const W = canvas.width;
  const H = canvas.height;

  // Build a dim, pixelated equirectangular world map once.
  const map = document.createElement('canvas');
  map.width = W;
  map.height = H;
  const mctx = map.getContext('2d');
  if (!mctx) return;
  mctx.fillStyle = '#000000';
  mctx.fillRect(0, 0, W, H);
  mctx.fillStyle = '#ffffff';

  const ellipse = (cx: number, cy: number, rx: number, ry: number): void => {
    mctx.beginPath();
    mctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    mctx.fill();
  };

  // Rough continents in a 120x60 space, scaled to the canvas.
  const sx = W / 120;
  const sy = H / 60;
  const blob = (cx: number, cy: number, rx: number, ry: number): void =>
    ellipse(cx * sx, cy * sy, rx * sx, ry * sy);

  blob(28, 22, 17, 12); // North America
  blob(35, 33, 5, 6); // Central America
  blob(40, 10, 6, 5); // Greenland
  blob(41, 43, 8, 13); // South America
  blob(61, 18, 8, 7); // Europe
  blob(63, 35, 11, 14); // Africa
  blob(88, 20, 24, 12); // Asia
  blob(83, 31, 6, 7); // India
  blob(95, 33, 7, 5); // South-East Asia
  blob(101, 45, 10, 6); // Australia
  blob(60, 58, 30, 2); // Antarctica hint

  // Locations highlighted on the map (120x60 space).
  const CITIES: Array<{ x: number; y: number; phase: number }> = [
    { x: 86, y: 16, phase: 0.0 }, // Almaty
    { x: 60, y: 13, phase: 1.3 }, // London
    { x: 35, y: 17, phase: 2.1 }, // New York
    { x: 45, y: 39, phase: 3.4 }, // São Paulo
    { x: 95, y: 30, phase: 4.2 }, // Singapore
    { x: 107, y: 18, phase: 5.1 }, // Tokyo
    { x: 111, y: 42, phase: 0.7 }, // Sydney
    { x: 79, y: 22, phase: 2.8 }, // Dubai
    { x: 66, y: 42, phase: 4.9 }, // Cape Town
    { x: 19, y: 17, phase: 3.0 }, // San Francisco
  ].map((city) => ({ ...city, x: city.x * sx, y: city.y * sy }));

  interface Pulse { a: number; b: number; t: number; speed: number; }
  const pulses: Pulse[] = [];
  const PULSE_SPEED = 0.22;
  let nextSpawn = 0.6;
  let last = performance.now();
  let elapsed = 0;
  let handle = 0;

  function spawnPulse(): void {
    let a = Math.floor(Math.random() * CITIES.length);
    let b = Math.floor(Math.random() * CITIES.length);
    if (a === b) b = (b + 1) % CITIES.length;
    pulses.push({ a, b, t: 0, speed: PULSE_SPEED + Math.random() * 0.12 });
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

    // dimmed land
    ctx!.globalAlpha = 0.09;
    ctx!.drawImage(map, 0, 0);
    ctx!.globalAlpha = 1;

    // occasional connections between locations
    nextSpawn -= delta;
    if (nextSpawn <= 0) {
      spawnPulse();
      nextSpawn = 2.2 + Math.random() * 2.6;
    }
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      pulse.t += pulse.speed * delta;
      const a = CITIES[pulse.a];
      const b = CITIES[pulse.b];
      if (pulse.t >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      // faint line while travelling
      ctx!.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(b.x, b.y);
      ctx!.stroke();

      // bright head with a short fading trail
      for (let step = 0; step < 6; step += 1) {
        const t = pulse.t - step * 0.012;
        if (t < 0) break;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const alpha = 0.75 - step * 0.12;
        ctx!.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx!.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      }
    }

    // location highlights
    for (const city of CITIES) {
      const breathe = 0.5 + Math.sin(elapsed * 1.6 + city.phase) * 0.5;
      ctx!.fillStyle = `rgba(255,255,255,${(0.3 + breathe * 0.45).toFixed(3)})`;
      const size = breathe > 0.75 ? 2 : 1;
      ctx!.fillRect(Math.floor(city.x) - (size - 1) / 2, Math.floor(city.y) - (size - 1) / 2, size, size);
    }

    handle = requestAnimationFrame(frame);
  }
  handle = requestAnimationFrame(frame);
}
