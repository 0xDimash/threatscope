/**
 * Packet-Tracer-style minimal network space.
 *
 * A 2D, pixel-art network diagram rendered on the shared <canvas> with the 2D
 * context. Black background, white pixels, no glow — matches the landing page.
 * Conforms to the CityScene interface so the app shell can drive it unchanged.
 */
import type { CityScene, SceneStats } from './types';
import type { SecurityEvent } from '../types/contract';

export interface NetworkSceneOptions {
  bloom?: boolean;
  labels?: boolean;
  pixelRatio?: number;
  events?: readonly SecurityEvent[];
  eventIntervalMs?: number;
}

interface NodeDef {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
}

interface EdgeDef {
  a: number;
  b: number;
}

interface Packet {
  edgeIndex: number;
  t: number;
  speed: number;
  life: number;
}

// A small office/SOC network laid out on a grid.
const NODES: NodeDef[] = [
  { id: 'net-internet', name: 'Internet', kind: 'external', x: 60, y: 220 },
  { id: 'net-firewall', name: 'Firewall', kind: 'gateway', x: 170, y: 220 },
  { id: 'net-router', name: 'Router', kind: 'gateway', x: 290, y: 220 },
  { id: 'net-switch', name: 'Switch', kind: 'gateway', x: 410, y: 220 },
  { id: 'net-server', name: 'Server', kind: 'server', x: 410, y: 110 },
  { id: 'net-nas', name: 'NAS', kind: 'db', x: 410, y: 330 },
  { id: 'net-pc1', name: 'PC-1', kind: 'service', x: 560, y: 120 },
  { id: 'net-pc2', name: 'PC-2', kind: 'service', x: 560, y: 220 },
  { id: 'net-pc3', name: 'PC-3', kind: 'service', x: 560, y: 320 },
  { id: 'net-cam', name: 'Camera', kind: 'cctv', x: 290, y: 330 },
  { id: 'net-iot', name: 'IoT', kind: 'service', x: 290, y: 110 },
];

const EDGES: EdgeDef[] = [
  { a: 0, b: 1 },
  { a: 1, b: 2 },
  { a: 2, b: 3 },
  { a: 3, b: 4 },
  { a: 3, b: 5 },
  { a: 3, b: 6 },
  { a: 3, b: 7 },
  { a: 3, b: 8 },
  { a: 2, b: 9 },
  { a: 2, b: 10 },
];

const ICON = 12; // icon grid size in world units

export function createNetworkScene(canvas: HTMLCanvasElement, options: NetworkSceneOptions = {}): CityScene {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  let scale = 1;
  let tx = 0;
  let ty = 0;

  const packets: Packet[] = [];
  const frameTimes: number[] = [];
  let running = false;
  let raf = 0;
  let last = 0;
  let elapsed = 0;
  let eventTimer = 0;

  // drag state
  let dragging = false;
  let dragStart = { x: 0, y: 0, tx: 0, ty: 0 };

  const screenToWorld = (sx: number, sy: number): { x: number; y: number } => ({
    x: (sx - tx) / scale,
    y: (sy - ty) / scale,
  });

  function centerView(): void {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.width;
    const h = rect.height || canvas.height;
    const xs = NODES.map((n) => n.x);
    const ys = NODES.map((n) => n.y);
    const minX = Math.min(...xs) - 40;
    const maxX = Math.max(...xs) + 40;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 40;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    scale = Math.min(w / (maxX - minX), h / (maxY - minY)) * 0.9;
    scale = Math.max(0.6, Math.min(2.5, scale));
    tx = w / 2 - cx * scale;
    ty = h / 2 - cy * scale;
  }

  function drawIcon(node: NodeDef, x: number, y: number): void {
    const s = ICON;
    const half = s / 2;
    ctx!.fillStyle = '#ffffff';
    switch (node.kind) {
      case 'external': {
        // cloud: cluster of squares
        for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-1, 1], [0, 1], [1, 1]]) {
          ctx!.fillRect(x + dx * 2, y + dy * 2, 3, 3);
        }
        break;
      }
      case 'gateway': {
        // router: square with two antennas
        ctx!.fillRect(x - half, y - half + 2, s, s - 4);
        ctx!.fillRect(x - 2, y - half - 4, 1, 4);
        ctx!.fillRect(x + 1, y - half - 4, 1, 4);
        ctx!.fillRect(x - 3, y - half - 5, 3, 1);
        ctx!.fillRect(x + 0, y - half - 5, 3, 1);
        break;
      }
      case 'server': {
        ctx!.fillRect(x - half, y - half, s, s);
        // led strip
        ctx!.fillStyle = '#000000';
        for (let i = 0; i < 3; i += 1) ctx!.fillRect(x - half + 2 + i * 3, y - 2, 2, 2);
        ctx!.fillStyle = '#ffffff';
        break;
      }
      case 'db': {
        // cylinder-ish: stacked squares
        ctx!.fillRect(x - half + 1, y - half, s - 2, s);
        ctx!.fillStyle = '#000000';
        ctx!.fillRect(x - half + 3, y - 3, s - 6, 2);
        ctx!.fillStyle = '#ffffff';
        break;
      }
      case 'cctv': {
        ctx!.fillRect(x - 1, y - half, 2, s);
        ctx!.fillRect(x - 4, y - 2, 8, 3);
        break;
      }
      default: {
        // PC: monitor + base
        ctx!.fillRect(x - half, y - half, s, s - 4);
        ctx!.fillRect(x - 2, y + half - 3, 4, 2);
        ctx!.fillRect(x - 4, y + half - 1, 8, 1);
      }
    }
  }

  function draw(): void {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || canvas.width));
    const h = Math.max(1, Math.round(rect.height || canvas.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx!.fillStyle = '#000000';
    ctx!.fillRect(0, 0, w, h);

    ctx!.save();
    ctx!.translate(tx, ty);
    ctx!.scale(scale, scale);

    // edges
    ctx!.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx!.lineWidth = 1 / scale;
    for (const e of EDGES) {
      const a = NODES[e.a];
      const b = NODES[e.b];
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(b.x, b.y);
      ctx!.stroke();
    }

    // packets
    for (const p of packets) {
      const e = EDGES[p.edgeIndex];
      const a = NODES[e.a];
      const b = NODES[e.b];
      const x = a.x + (b.x - a.x) * p.t;
      const y = a.y + (b.y - a.y) * p.t;
      ctx!.fillStyle = '#ffffff';
      const size = 3 / scale;
      ctx!.fillRect(x - size / 2, y - size / 2, size, size);
    }

    // nodes
    for (const node of NODES) {
      drawIcon(node, node.x, node.y);
    }

    // labels
    if (options.labels ?? true) {
      ctx!.fillStyle = '#ffffff';
      ctx!.font = `${Math.max(8, 9)}px "SF Mono", Consolas, monospace`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'top';
      for (const node of NODES) {
        ctx!.fillText(node.name, node.x, node.y + ICON / 2 + 4);
      }
    }

    ctx!.restore();
  }

  function tick(now: number): void {
    if (!running) return;
    const delta = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    elapsed += delta;

    // advance packets
    for (let i = packets.length - 1; i >= 0; i -= 1) {
      const p = packets[i];
      p.t += p.speed * delta;
      p.life -= delta;
      if (p.t >= 1 || p.life <= 0) packets.splice(i, 1);
    }

    // ambient packets
    if (Math.random() < delta * 1.6) {
      packets.push({ edgeIndex: Math.floor(Math.random() * EDGES.length), t: 0, speed: 0.6 + Math.random() * 0.6, life: 2 });
    }

    draw();
    frameTimes.push(delta * 1000);
    if (frameTimes.length > 60) frameTimes.shift();
    raf = requestAnimationFrame(tick);
  }

  const onDown = (e: MouseEvent): void => {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onMove = (e: MouseEvent): void => {
    if (!dragging) return;
    tx = dragStart.tx + (e.clientX - dragStart.x);
    ty = dragStart.ty + (e.clientY - dragStart.y);
  };
  const onUp = (): void => { dragging = false; };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.4, Math.min(4, scale * factor));
    tx = mx - (mx - tx) * (newScale / scale);
    ty = my - (my - ty) * (newScale / scale);
    scale = newScale;
  };
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  centerView();

  const eventInterval = options.eventIntervalMs ?? 0;
  const demoEvents = options.events ?? [];
  if (demoEvents.length > 0 && eventInterval > 0) {
    eventTimer = window.setInterval(() => {
      // spawn a packet burst for the event
      packets.push({ edgeIndex: Math.floor(Math.random() * EDGES.length), t: 0, speed: 1.0, life: 1.6 });
    }, eventInterval);
  }

  const sceneApi: CityScene = {
    assetIds: NODES.map((n) => n.id),
    start(): void {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose(): void {
      sceneApi.stop();
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      if (eventTimer) window.clearInterval(eventTimer);
    },
    resize(): void {
      // canvas size handled in draw()
    },
    resetView(): void {
      centerView();
    },
    getStats(): SceneStats {
      const frameMs = frameTimes.length === 0 ? 0 : frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      return {
        fps: frameMs > 0 ? Math.round((1000 / frameMs) * 10) / 10 : 0,
        frameMs: Math.round(frameMs * 100) / 100,
        drawCalls: 0,
        triangles: 0,
        assets: NODES.length,
        labelCount: NODES.length,
      };
    },
    pick(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      const w = screenToWorld(clientX - rect.left, clientY - rect.top);
      for (const node of NODES) {
        const dx = Math.abs(node.x - w.x);
        const dy = Math.abs(node.y - w.y);
        if (dx <= ICON && dy <= ICON) return node.id;
      }
      return null;
    },
    focusAsset(id: string): void {
      const node = NODES.find((n) => n.id === id);
      if (!node) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || canvas.width;
      const h = rect.height || canvas.height;
      tx = w / 2 - node.x * scale;
      ty = h / 2 - node.y * scale;
    },
    spawnArc(): void {
      packets.push({ edgeIndex: Math.floor(Math.random() * EDGES.length), t: 0, speed: 1.2, life: 1.6 });
    },
  };

  return sceneApi;
}
