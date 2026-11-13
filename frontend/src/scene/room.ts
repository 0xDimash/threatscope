import {
  AmbientLight,
  BoxGeometry,
  Clock,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
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

function createWorldMapTexture(): CanvasTexture {
  const W = 64;
  const H = 32;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const sx = W / 120;
    const sy = H / 60;
    const blob = (cx: number, cy: number, rx: number, ry: number): void => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx * sx, cy * sy, rx * sx, ry * sy, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    blob(28, 22, 17, 12);
    blob(35, 33, 5, 6);
    blob(40, 10, 6, 5);
    blob(41, 43, 8, 13);
    blob(61, 18, 8, 7);
    blob(63, 35, 11, 14);
    blob(88, 20, 24, 12);
    blob(83, 31, 6, 7);
    blob(95, 33, 7, 5);
    blob(101, 45, 10, 6);
    blob(60, 58, 30, 2);

    // dim the land to keep it subtle inside the torus
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
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
    new TorusGeometry(0.6, 0.08, 8, 32),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  uplinkGroup.add(uplinkRing);

  const mapTexture = createWorldMapTexture();
  const mapPlane = new Mesh(
    new BoxGeometry(1.05, 0.01, 1.05),
    new MeshBasicMaterial({ map: mapTexture, transparent: true, opacity: 0.85 }),
  );
  mapPlane.rotation.x = Math.PI / 2;
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