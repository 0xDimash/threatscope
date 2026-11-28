import {
  ACESFilmicToneMapping,
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
  NoToneMapping,
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
import type { CameraPose, CityScene, SceneStats } from './types';
import type { SecurityEvent } from '../types/contract';
import { roomBindings } from './roomMap';

interface Device {
  id: string;
  name: string;
  pos: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

export type ComponentKind = 'rack' | 'switch' | 'pc' | 'monitor' | 'nas' | 'cam' | 'iot';

/** One placed component in a room layout, in room metres. */
export interface RoomComponent {
  /** Stable id; component ids are unique per space. */
  id: string;
  kind: ComponentKind;
  x: number;
  z: number;
  /** Inventory binding, or null when the device is not bound to an asset. */
  asset_id: string | null;
}

export const COMPONENT_KINDS: Record<ComponentKind, { label: string; size: { x: number; y: number; z: number }; y: number }> = {
  rack: { label: 'Server Rack', size: { x: 1.6, y: 3.2, z: 1.2 }, y: 0 },
  switch: { label: 'Switch', size: { x: 1.6, y: 0.4, z: 1.2 }, y: 0 },
  pc: { label: 'Workstation', size: { x: 1.0, y: 0.6, z: 0.8 }, y: 0 },
  monitor: { label: 'Monitor', size: { x: 1.6, y: 1.0, z: 0.15 }, y: 0 },
  nas: { label: 'NAS', size: { x: 1.2, y: 0.8, z: 1.0 }, y: 0 },
  cam: { label: 'Camera', size: { x: 0.5, y: 0.5, z: 0.5 }, y: 3.6 },
  iot: { label: 'IoT Hub', size: { x: 0.7, y: 0.4, z: 0.7 }, y: 0 },
};

function devicesFromLayout(components: RoomComponent[]): Device[] {
  return components.map((component) => {
    const kind = COMPONENT_KINDS[component.kind] ?? COMPONENT_KINDS.pc;
    // The seeded room keeps rack/switch and the PCs stacked; follow the built-in height by id.
    const base = DEVICES.find((device) => device.id === component.id);
    return {
      id: component.id,
      name: base?.name ?? kind.label,
      pos: { x: component.x, y: base?.pos.y ?? kind.y, z: component.z },
      size: { ...kind.size },
    };
  });
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

export function createRoomScene(canvas: HTMLCanvasElement, options: { bloom?: boolean; labels?: boolean; pixelRatio?: number; events?: readonly SecurityEvent[]; eventIntervalMs?: number; layout?: RoomComponent[] } = {}): CityScene {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  // Materials that swap to a print-friendly colour in figure mode (dark = live look).
  const themed: Array<{ material: MeshBasicMaterial; dark: number; light: number }> = [];
  function themedMaterial(material: MeshBasicMaterial, light: number): MeshBasicMaterial {
    themed.push({ material, dark: material.color.getHex(), light });
    return material;
  }

  const renderer = createRenderer(canvas, { pixelRatio: options.pixelRatio });
  renderer.info.autoReset = false;

  const camera = new PerspectiveCamera(55, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 200);
  const INITIAL_POS = new Vector3(9, 7, 9);
  const INITIAL_TARGET = new Vector3(0, 1.5, 0);
  // Portrait crops the room horizontally; step back instead of widening the lens.
  const BASE_OFFSET = INITIAL_POS.clone().sub(INITIAL_TARGET);
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
    themedMaterial(new MeshBasicMaterial({ color: 0x1a1a1a }), 0xe6e6e2),
  );
  floor.position.y = -0.05;
  roomGroup.add(floor);

  const wallMat = themedMaterial(new MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.35, depthWrite: false }), 0xd4d4ce);
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
  const gridMat = themedMaterial(new MeshBasicMaterial({ color: 0x333333 }), 0xb8b8b2);
  for (let i = -ROOM.w / 2; i <= ROOM.w / 2; i += 1) {
    const g = new Mesh(new BoxGeometry(0.02, 0.01, ROOM.d), gridMat);
    g.position.set(i, 0.01, 0);
    gridGroup.add(g);
  }
  for (let i = -ROOM.d / 2; i <= ROOM.d / 2; i += 1) {
    const g = new Mesh(new BoxGeometry(ROOM.w, 0.01, 0.02), gridMat);
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
  const meshById = new Map<string, Mesh>();
  const materialById = new Map<string, MeshBasicMaterial>();

  const devices = options.layout ? devicesFromLayout(options.layout) : DEVICES;

  for (const dev of devices) {
    const mat = themedMaterial(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 }), 0xdde1e7);
    const box = new Mesh(
      new BoxGeometry(dev.size.x, dev.size.y, dev.size.z),
      mat,
    );
    box.position.set(dev.pos.x, dev.pos.y + dev.size.y / 2, dev.pos.z);
    box.userData.assetId = dev.id;
    clickables.push(box);
    meshById.set(dev.id, box);
    materialById.set(dev.id, mat);
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
    themedMaterial(new MeshBasicMaterial({ color: 0xffffff }), 0x15171a),
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

  // Events carry inventory asset ids; give the arc layer the same coordinates under
  // those ids so an arc lands on the device that represents the asset.
  const layoutBindings = options.layout
    ? options.layout.map((component) => [component.id, component.asset_id] as const)
    : roomBindings();
  for (const [deviceId, assetId] of layoutBindings) {
    if (!assetId) continue;
    const p = positions.get(deviceId);
    if (p) positions.set(assetId, p);
  }

  const arcs = createRoomArcsLayer({
    scene,
    devicePositions: positions,
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight,
  });

  const renderContext: RenderContext = createRenderContext(renderer, scene, camera, {
    bloom: false,
  });

  // EffectComposer sizes its targets with the pixel ratio the renderer had when it was created.
  const composerRatio = renderer.getPixelRatio();
  const clock = new Clock();
  const frameTimes: number[] = [];
  let raf = 0;
  let running = false;
  let elapsed = 0;
  let eventTimer = 0;
  let figureMode = false;
  let bufferSize = { width: 0, height: 0 };

  // smooth focus animation
  let focusAnim: {
    fromPos: Vector3;
    fromTarget: Vector3;
    toPos: Vector3;
    toTarget: Vector3;
    t: number;
    duration: number;
  } | null = null;

  function viewportSize(): { width: number; height: number } {
    const rect = canvas.getBoundingClientRect();
    return { width: Math.max(1, Math.round(rect.width || window.innerWidth)), height: Math.max(1, Math.round(rect.height || window.innerHeight)) };
  }

  function resize(): void {
    const { width, height } = viewportSize();
    if (width < 1 || height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const MAX = 2048;
    let bufW = Math.round(width * dpr);
    let bufH = Math.round(height * dpr);
    if (bufW > MAX) { const s = MAX / bufW; bufW = MAX; bufH = Math.round(bufH * s); }
    if (bufH > MAX) { const s = MAX / bufH; bufH = MAX; bufW = Math.round(bufW * s); }
    const aspect = width / height;
    camera.aspect = aspect;
    if (!focusAnim && aspect < 1.15) {
      const back = Math.min(1.8, 1.15 / Math.max(0.4, aspect));
      camera.position.copy(INITIAL_TARGET).add(BASE_OFFSET.clone().multiplyScalar(back));
    }
    camera.updateProjectionMatrix();
    renderContext.setSize(bufW, bufH);
    arcs.resize(bufW, bufH);
    bufferSize = { width: bufW, height: bufH };
  }

  function render(): void {
    const delta = Math.min(0.05, clock.getDelta());
    elapsed += delta;
    if (focusAnim) {
      controls.enableDamping = false;
      focusAnim.t = Math.min(1, focusAnim.t + delta / focusAnim.duration);
      const e = 1 - Math.pow(1 - focusAnim.t, 3);
      camera.position.lerpVectors(focusAnim.fromPos, focusAnim.toPos, e);
      controls.target.lerpVectors(focusAnim.fromTarget, focusAnim.toTarget, e);
      controls.update();
      if (focusAnim.t >= 1) {
        focusAnim = null;
        controls.enableDamping = true;
      }
    } else {
      controls.enableDamping = true;
      controls.update();
    }
    if (hoveredId) {
      const m = materialById.get(hoveredId);
      if (m) m.opacity = 0.4 + 0.2 * Math.sin(elapsed * 4);
    }
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

  let hoveredId: string | null = null;

  const hoverRaycaster = new Raycaster();
  const hoverPointer = new Vector2();

  function updateHover(clientX: number, clientY: number): void {
    if (figureMode) return;
    const rect = canvas.getBoundingClientRect();
    hoverPointer.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    hoverRaycaster.setFromCamera(hoverPointer, camera);
    const hits = hoverRaycaster.intersectObjects(clickables, false);
    const id = (hits[0]?.object.userData.assetId as string | undefined) ?? null;
    if (id === hoveredId) return;
    // restore previous
    if (hoveredId) {
      const m = materialById.get(hoveredId);
      if (m) m.opacity = 1.0;
    }
    hoveredId = id;
    if (id) {
      const m = materialById.get(id);
      if (m) m.opacity = 0.45;
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = '';
    }
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  const onHoverMove = (e: MouseEvent): void => updateHover(e.clientX, e.clientY);
  const onHoverLeave = (): void => {
    if (hoveredId) {
      const m = materialById.get(hoveredId);
      if (m) m.opacity = 1.0;
    }
    hoveredId = null;
    canvas.style.cursor = '';
  };
  canvas.addEventListener('mousemove', onHoverMove);
  canvas.addEventListener('mouseleave', onHoverLeave);


  function setFigureMode(on: boolean): void {
    if (on === figureMode) return;
    figureMode = on;
    (scene.background as Color).setHex(on ? 0xffffff : 0x000000);
    for (const entry of themed) entry.material.color.setHex(on ? entry.light : entry.dark);
    arcs.setColor(on ? 0x15171a : 0xffffff);
    // Literal colours for print: ACES would turn the white page into light grey.
    renderer.toneMapping = on ? NoToneMapping : ACESFilmicToneMapping;
    if (on && hoveredId) {
      const m = materialById.get(hoveredId);
      if (m) m.opacity = 1.0;
      hoveredId = null;
    }
    canvas.style.cursor = on ? 'none' : '';
  }

  function captureFrame(width: number, height: number): HTMLCanvasElement {
    const w = Math.round(width);
    const h = Math.round(height);
    const limit = renderer.capabilities.maxTextureSize;
    if (w < 1 || h < 1 || w > limit || h > limit) {
      throw new Error(`Cannot render ${w}×${h}: this GPU allows at most ${limit}px per side.`);
    }
    const previousRatio = renderer.getPixelRatio();
    const previousAspect = camera.aspect;
    try {
      renderer.setPixelRatio(1);
      renderContext.composer.setPixelRatio(1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderContext.setSize(w, h);
      arcs.resize(w, h);
      renderContext.render();
      // The drawing buffer is only valid until this task ends (no preserveDrawingBuffer),
      // so copy it out right here instead of calling canvas.toBlob later.
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('2D canvas is not available.');
      ctx.drawImage(canvas, 0, 0);
      return out;
    } finally {
      renderer.setPixelRatio(previousRatio);
      renderContext.composer.setPixelRatio(composerRatio);
      camera.aspect = previousAspect;
      camera.updateProjectionMatrix();
      renderContext.setSize(bufferSize.width, bufferSize.height);
      arcs.resize(bufferSize.width, bufferSize.height);
      renderContext.render();
    }
  }

  const sceneApi: CityScene = {
    assetIds: devices.map((d) => d.id),
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
      canvas.removeEventListener('mousemove', onHoverMove);
      canvas.removeEventListener('mouseleave', onHoverLeave);
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
      focusAnim = {
        fromPos: camera.position.clone(),
        fromTarget: controls.target.clone(),
        toPos: INITIAL_POS.clone(),
        toTarget: INITIAL_TARGET.clone(),
        t: 0,
        duration: 0.7,
      };
    },
    getStats(): SceneStats {
      const frameMs = frameTimes.length === 0 ? 0 : frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      return {
        fps: frameMs > 0 ? Math.round((1000 / frameMs) * 10) / 10 : 0,
        frameMs: Math.round(frameMs * 100) / 100,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        assets: devices.length,
        labelCount: devices.length,
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
      const dev = devices.find((d) => d.id === id);
      if (!dev) return;
      const target = new Vector3(dev.pos.x, dev.pos.y + dev.size.y / 2, dev.pos.z);
      const toPos = target.clone().add(new Vector3(4, 3, 4));
      focusAnim = {
        fromPos: camera.position.clone(),
        fromTarget: controls.target.clone(),
        toPos,
        toTarget: target,
        t: 0,
        duration: 0.7,
      };
    },
    spawnArc(event: SecurityEvent): void {
      arcs.spawn(event);
    },
    captureFrame,
    setFigureMode,
    getCameraPose(): CameraPose {
      const round = (v: number): number => Math.round(v * 1000) / 1000;
      return {
        position: [round(camera.position.x), round(camera.position.y), round(camera.position.z)],
        target: [round(controls.target.x), round(controls.target.y), round(controls.target.z)],
        fov: camera.fov,
      };
    },
    highlight(id: string | null): void {
      if (figureMode || id === hoveredId) return;
      if (hoveredId) {
        const m = materialById.get(hoveredId);
        if (m) m.opacity = 1.0;
      }
      hoveredId = id;
      if (id) {
        const m = materialById.get(id);
        if (m) m.opacity = 0.45;
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = '';
      }
    },
  };

  return sceneApi;
}