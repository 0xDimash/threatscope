import {
  AmbientLight,
  BoxGeometry,
  Clock,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRenderContext, createRenderer, type RenderContext } from './renderer';
import { createRoomArcsLayer } from '../viz/roomArcs';
import { LabelFactory } from './labels';
import type { CityScene, SceneStats } from './types';
import type { SecurityEvent } from '../types/contract';

interface Device {
  id: string;
  name: string;
  pos: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

const DEVICES: Device[] = [
  { id: 'room-rack', name: 'Server Rack', pos: { x: -4, y: 0, z: -3 }, size: { x: 1.6, y: 3.2, z: 1.2 } },
  { id: 'room-switch', name: 'Switch', pos: { x: -4, y: 3.4, z: -3 }, size: { x: 1.6, y: 0.4, z: 1.2 } },
  { id: 'room-pc1', name: 'PC-1', pos: { x: 2, y: 0, z: 2 }, size: { x: 1.0, y: 0.6, z: 0.8 } },
  { id: 'room-pc2', name: 'PC-2', pos: { x: 2, y: 0.7, z: 2 }, size: { x: 1.0, y: 0.6, z: 0.8 } },
  { id: 'room-monitor', name: 'Monitor', pos: { x: 2, y: 1.4, z: 1.6 }, size: { x: 1.6, y: 1.0, z: 0.15 } },
  { id: 'room-nas', name: 'NAS', pos: { x: 5, y: 0, z: -2 }, size: { x: 1.2, y: 0.8, z: 1.0 } },
  { id: 'room-cam', name: 'Camera', pos: { x: 0, y: 3.6, z: -4.5 }, size: { x: 0.5, y: 0.5, z: 0.5 } },
  { id: 'room-iot', name: 'IoT Hub', pos: { x: -1, y: 0.3, z: 1 }, size: { x: 0.7, y: 0.4, z: 0.7 } },
];

const ROOM = { w: 12, d: 10, h: 5 };

function createWorldMap(): { canvas: HTMLCanvasElement; texture: CanvasTexture; update: (elapsed: number, delta: number) => void } {
  const W = 96;
  const H = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { canvas, texture, update: () => {} };
  }

  const blobs: Array<[number, number, number, number]> = [
    [28, 22, 17, 12], [35, 33, 5, 6], [40, 10, 6, 5],
    [41, 43, 8, 13], [61, 18, 8, 7], [63, 35, 11, 14],
    [88, 20, 24, 12], [83, 31, 6, 7], [95, 33, 7, 5],
    [101, 45, 10, 6], [60, 58, 30, 2],
  ];

  const CELL = 4;
  const SIZE = CELL - 1;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const landGrid: boolean[] = new Array(COLS * ROWS).fill(false);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const rx = (c + 0.5) / COLS * 120;
      const ry = (r + 0.5) / ROWS * 60;
      for (const [cx, cy, erx, ery] of blobs) {
        const dx = (rx - cx) / erx;
        const dy = (ry - cy) / ery;
        if (dx * dx + dy * dy <= 1) { landGrid[r * COLS + c] = true; break; }
      }
    }
  }

  // locations (120x60 space -> cell coords)
  const cities: Array<{ c: number; r: number; phase: number }> = [
    { c: 86, r: 16, phase: 0.0 }, { c: 60, r: 13, phase: 1.3 },
    { c: 35, r: 17, phase: 2.1 }, { c: 45, r: 39, phase: 3.4 },
    { c: 95, r: 30, phase: 4.2 }, { c: 107, r: 18, phase: 5.1 },
    { c: 111, r: 42, phase: 0.7 }, { c: 79, r: 22, phase: 2.8 },
    { c: 66, r: 42, phase: 4.9 }, { c: 19, r: 17, phase: 3.0 },
  ].map((city) => ({
    c: Math.round((city.c / 120) * (COLS - 1)),
    r: Math.round((city.r / 60) * (ROWS - 1)),
    phase: city.phase,
  }));

  interface Pulse { a: number; b: number; t: number; speed: number; }
  const pulses: Pulse[] = [];
  let nextSpawn = 0.4;
  let elapsed = 0;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  function draw(): void {
    ctx!.fillStyle = '#000000';
    ctx!.fillRect(0, 0, W, H);

    // dim land pixels
    ctx!.fillStyle = 'rgba(255,255,255,0.18)';
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (landGrid[r * COLS + c]) {
          ctx!.fillRect(c * CELL, r * CELL, SIZE, SIZE);
        }
      }
    }

    // pulses
    nextSpawn -= 1 / 60;
    if (nextSpawn <= 0) {
      let a = Math.floor(Math.random() * cities.length);
      let b = Math.floor(Math.random() * cities.length);
      if (a === b) b = (b + 1) % cities.length;
      pulses.push({ a, b, t: 0, speed: 0.3 + Math.random() * 0.4 });
      nextSpawn = 1.2 + Math.random() * 1.6;
    }
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const p = pulses[i];
      p.t += p.speed / 60;
      if (p.t > 1) { pulses.splice(i, 1); continue; }
      const a = cities[p.a];
      const b = cities[p.b];
      // faint path
      ctx!.fillStyle = 'rgba(255,255,255,0.06)';
      const steps = 12;
      for (let s = 0; s <= steps; s += 1) {
        const tt = s / steps;
        const cx = Math.round((a.c + (b.c - a.c) * tt) * CELL);
        const cy = Math.round((a.r + (b.r - a.r) * tt) * CELL);
        ctx!.fillRect(cx, cy, SIZE, SIZE);
      }
      // bright head with trail
      for (let tr = 0; tr < 4; tr += 1) {
        const tt = p.t - tr * 0.02;
        if (tt < 0) break;
        const cx = Math.round((a.c + (b.c - a.c) * tt) * CELL);
        const cy = Math.round((a.r + (b.r - a.r) * tt) * CELL);
        ctx!.fillStyle = `rgba(255,255,255,${(0.85 - tr * 0.2).toFixed(2)})`;
        ctx!.fillRect(cx, cy, SIZE, SIZE);
      }
    }

    // location highlights
    for (const city of cities) {
      const breathe = 0.5 + Math.sin(elapsed * 1.6 + city.phase) * 0.5;
      ctx!.fillStyle = `rgba(255,255,255,${(0.4 + breathe * 0.5).toFixed(3)})`;
      const size = breathe > 0.7 ? CELL * 2 : CELL;
      const off = breathe > 0.7 ? -CELL / 2 : 0;
      ctx!.fillRect(city.c * CELL + off, city.r * CELL + off, size, size);
    }

    texture.needsUpdate = true;
  }

  function update(e: number, _delta: number): void {
    elapsed = e;
    draw();
  }

  draw();
  return { canvas, texture, update };
}

export function createRoomScene(canvas: HTMLCanvasElement, options: { bloom?: boolean; labels?: boolean; pixelRatio?: number; events?: readonly SecurityEvent[]; eventIntervalMs?: number } = {}): CityScene {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  const renderer = createRenderer(canvas, { pixelRatio: options.pixelRatio });
  renderer.info.autoReset = false;

  const camera = new PerspectiveCamera(55, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 200);
  const INITIAL_POS = new Vector3(9, 7, 9);
  const INITIAL_TARGET = new Vector3(0, 1.5, 0);
  camera.position.copy(INITIAL_POS);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.copy(INITIAL_TARGET);
  controls.update();

  const ambient = new AmbientLight(0xffffff, 0.5);
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(8, 14, 10);
  scene.add(ambient, key);

  // room shell: floor + 3 walls (wireframe edges for contrast)
  const roomGroup = new Group();
  roomGroup.name = 'room';
  const floor = new Mesh(
    new BoxGeometry(ROOM.w, 0.1, ROOM.d),
    new MeshBasicMaterial({ color: 0x1a1a1a }),
  );
  floor.position.y = -0.05;
  roomGroup.add(floor);

  const wallMat = new MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.35, depthWrite: false });
  const back = new Mesh(new BoxGeometry(ROOM.w, ROOM.h, 0.1), wallMat);
  back.position.set(0, ROOM.h / 2, -ROOM.d / 2);
  roomGroup.add(back);
  const left = new Mesh(new BoxGeometry(0.1, ROOM.h, ROOM.d), wallMat);
  left.position.set(-ROOM.w / 2, ROOM.h / 2, 0);
  roomGroup.add(left);
  const right = new Mesh(new BoxGeometry(0.1, ROOM.h, ROOM.d), wallMat);
  right.position.set(ROOM.w / 2, ROOM.h / 2, 0);
  roomGroup.add(right);

  // grid on floor
  const gridGroup = new Group();
  for (let i = -ROOM.w / 2; i <= ROOM.w / 2; i += 1) {
    const g = new Mesh(new BoxGeometry(0.02, 0.01, ROOM.d), new MeshBasicMaterial({ color: 0x333333 }));
    g.position.set(i, 0.01, 0);
    gridGroup.add(g);
  }
  for (let i = -ROOM.d / 2; i <= ROOM.d / 2; i += 1) {
    const g = new Mesh(new BoxGeometry(ROOM.w, 0.01, 0.02), new MeshBasicMaterial({ color: 0x333333 }));
    g.position.set(0, 0.01, i);
    gridGroup.add(g);
  }
  roomGroup.add(gridGroup);

  scene.add(roomGroup);

  const labels = new LabelFactory(options.labels ?? true);

  const devicesGroup = new Group();
  devicesGroup.name = 'devices';
  scene.add(devicesGroup);

  const clickables: Mesh[] = [];
  const positions = new Map<string, Vector3>();

  for (const dev of DEVICES) {
    const box = new Mesh(
      new BoxGeometry(dev.size.x, dev.size.y, dev.size.z),
      new MeshBasicMaterial({ color: 0xffffff }),
    );
    box.position.set(dev.pos.x, dev.pos.y + dev.size.y / 2, dev.pos.z);
    box.userData.assetId = dev.id;
    clickables.push(box);
    devicesGroup.add(box);

    // wireframe edges for contrast
    const edges = new Mesh(
      new BoxGeometry(dev.size.x + 0.02, dev.size.y + 0.02, dev.size.z + 0.02),
      new MeshBasicMaterial({ color: 0x000000, wireframe: true }),
    );
    edges.position.copy(box.position);
    devicesGroup.add(edges);

    positions.set(dev.id, box.position.clone());

    const label = labels.create(dev.name, '#000000', 3.2, 0.6);
    if (label) {
      label.position.set(dev.pos.x, dev.pos.y + dev.size.y + 0.6, dev.pos.z);
      devicesGroup.add(label);
    }
  }

  // external origin marker (where attacks come from)
  // external origin marker: torus frame enclosing a pixel world map
  const uplinkGroup = new Group();
  uplinkGroup.position.set(0, 5.2, -6.0);

  const uplinkRing = new Mesh(
    new TorusGeometry(0.55, 0.06, 8, 32),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  uplinkRing.rotation.x = Math.PI / 2;
  uplinkGroup.add(uplinkRing);

  const worldMap = createWorldMap();
  const mapPlane = new Mesh(
    new BoxGeometry(0.9, 0.01, 0.9),
    new MeshBasicMaterial({ map: worldMap.texture, transparent: true, opacity: 1.0 }),
  );
  uplinkGroup.add(mapPlane);

  devicesGroup.add(uplinkGroup);

  const arcs = createRoomArcsLayer({
    scene,
    devicePositions: positions,
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight,
  });

  // initial arc so the space isn't empty on load
  arcs.spawn({
    id: 'room-evt-0',
    ts: new Date().toISOString(),
    type: 'anomaly',
    severity: 'high',
    src: { ip: '203.0.113.9', host: null, asset_id: null },
    dst: { ip: '10.0.0.1', host: 'Server Rack', asset_id: 'room-rack' },
    description: null,
    mitre: null,
    risk_delta: 2.0,
    raw_source: 'demo',
    meta: {},
  });

  const renderContext: RenderContext = createRenderContext(renderer, scene, camera, {
    bloom: false,
  });

  const clock = new Clock();
  const frameTimes: number[] = [];
  let raf = 0;
  let running = false;
  let elapsed = 0;
  let eventTimer = 0;

  function viewportSize(): { width: number; height: number } {
    const rect = canvas.getBoundingClientRect();
    return { width: Math.max(1, Math.round(rect.width || window.innerWidth)), height: Math.max(1, Math.round(rect.height || window.innerHeight)) };
  }

  function resize(): void {
    const { width, height } = viewportSize();
    camera.aspect = height > 0 ? width / height : 1;
    camera.updateProjectionMatrix();
    renderContext.setSize(width, height);
    arcs.resize(width, height);
  }

  function render(): void {
    const delta = Math.min(0.05, clock.getDelta());
    elapsed += delta;
    controls.update();
    worldMap.update(elapsed, delta);
    arcs.update(elapsed, delta);
    renderer.info.reset();
    renderContext.render();
    frameTimes.push(delta * 1000);
    if (frameTimes.length > 60) frameTimes.shift();
  }

  function loop(): void {
    raf = requestAnimationFrame(loop);
    render();
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  const demoEvents = options.events ?? [];
  const severities: SecurityEvent['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
  if (demoEvents.length > 0 || true) {
    let index = 0;
    eventTimer = window.setInterval(() => {
      const dev = DEVICES[Math.floor(Math.random() * DEVICES.length)];
      const evt: SecurityEvent = {
        id: `room-evt-${index}`,
        ts: new Date().toISOString(),
        type: 'anomaly',
        severity: severities[index % severities.length],
        src: { ip: '203.0.113.9', host: null, asset_id: null },
        dst: { ip: '10.0.0.1', host: dev.name, asset_id: dev.id },
        description: null,
        mitre: null,
        risk_delta: 2.0,
        raw_source: 'demo',
        meta: {},
      };
      arcs.spawn(evt);
      index += 1;
    }, options.eventIntervalMs ?? 1300);
  }

  const sceneApi: CityScene = {
    assetIds: DEVICES.map((d) => d.id),
    start(): void {
      if (running) return;
      running = true;
      clock.start();
      loop();
    },
    stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      clock.stop();
    },
    dispose(): void {
      sceneApi.stop();
      window.removeEventListener('resize', resize);
      observer?.disconnect();
      if (eventTimer) window.clearInterval(eventTimer);
      controls.dispose();
      labels.dispose();
      worldMap.texture.dispose();
      arcs.dispose();
      renderContext.dispose();
    },
    resize,
    resetView(): void {
      camera.position.copy(INITIAL_POS);
      controls.target.copy(INITIAL_TARGET);
      controls.update();
    },
    getStats(): SceneStats {
      const frameMs = frameTimes.length === 0 ? 0 : frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      return {
        fps: frameMs > 0 ? Math.round((1000 / frameMs) * 10) / 10 : 0,
        frameMs: Math.round(frameMs * 100) / 100,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        assets: DEVICES.length,
        labelCount: DEVICES.length,
      };
    },
    pick(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      const pointer = new Vector2();
      pointer.set(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
      const raycaster = new Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickables, false);
      const id = hits[0]?.object.userData.assetId;
      return typeof id === 'string' ? id : null;
    },
    focusAsset(id: string, _distance = 6): void {
      const dev = DEVICES.find((d) => d.id === id);
      if (!dev) return;
      const target = new Vector3(dev.pos.x, dev.pos.y + dev.size.y / 2, dev.pos.z);
      controls.target.copy(target);
      camera.position.copy(target).add(new Vector3(4, 3, 4));
      controls.update();
    },
    spawnArc(event: SecurityEvent): void {
      arcs.spawn(event);
    },
  };

  return sceneApi;
}