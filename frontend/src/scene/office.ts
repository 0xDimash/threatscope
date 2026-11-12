import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Clock,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry as BufferGeometryType,
  type Material,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Asset, AssetKind, Link } from '../types/contract';
import { kindLabelColor } from './palette';
import { createRenderContext, createRenderer, type RenderContext } from './renderer';
import { createGlowTexture } from './textures';
import { LabelFactory } from './labels';
import type { CityScene, SceneStats } from './types';

export interface OfficeSceneOptions {
  bloom?: boolean;
  labels?: boolean;
  pixelRatio?: number;
}

/**
 * Room-scale demo space: one small office shown as a physical room.
 * Devices keep the shared contract kinds (server / gateway / db / service / cctv /
 * external) so the risk engine and HUD work on it unchanged.
 */
const OFFICE_ASSETS: readonly Asset[] = [
  { id: 'office-router', name: 'Router', kind: 'gateway', criticality: 5, district: 'Server Corner', position: { x: 0, y: 0, z: 0 }, ip: '192.168.1.1', tags: ['hub'] },
  { id: 'office-rack', name: 'Server Rack', kind: 'server', criticality: 5, district: 'Server Corner', position: { x: -9, y: 0, z: -6.4 }, ip: '192.168.1.2', tags: ['rack'] },
  { id: 'office-nas', name: 'NAS Storage', kind: 'db', criticality: 4, district: 'Server Corner', position: { x: -9, y: 0, z: -3.6 }, ip: '192.168.1.3', tags: ['storage'] },
  { id: 'office-ws-manager', name: 'WS · Manager', kind: 'service', criticality: 3, district: 'Work Row', position: { x: -5, y: 0, z: -4.4 }, ip: '192.168.1.11', tags: ['workstation'] },
  { id: 'office-ws-hr', name: 'WS · HR', kind: 'service', criticality: 3, district: 'Work Row', position: { x: 1, y: 0, z: -4.4 }, ip: '192.168.1.12', tags: ['workstation'] },
  { id: 'office-ws-ops', name: 'WS · Ops', kind: 'service', criticality: 3, district: 'Work Row', position: { x: 7, y: 0, z: -4.4 }, ip: '192.168.1.13', tags: ['workstation'] },
  { id: 'office-reception', name: 'Reception PC', kind: 'service', criticality: 2, district: 'Front Row', position: { x: -2, y: 0, z: 3.2 }, ip: '192.168.1.21', tags: ['workstation'] },
  { id: 'office-printer', name: 'Printer', kind: 'service', criticality: 1, district: 'Front Row', position: { x: 8, y: 0, z: 3.2 }, ip: '192.168.1.30', tags: ['iot'] },
  { id: 'office-tv', name: 'Meeting TV', kind: 'service', criticality: 1, district: 'Front Row', position: { x: -12.4, y: 2.6, z: 0.5 }, ip: '192.168.1.31', tags: ['iot'] },
  { id: 'office-ac', name: 'Smart AC', kind: 'service', criticality: 1, district: 'Back Wall', position: { x: 3, y: 4.2, z: -8.6 }, ip: '192.168.1.32', tags: ['iot'] },
  { id: 'office-badge', name: 'Badge Reader', kind: 'service', criticality: 2, district: 'Front Row', position: { x: 12.4, y: 1.6, z: 1.5 }, ip: '192.168.1.33', tags: ['iot', 'access'] },
  { id: 'office-cam-1', name: 'Cam · Door', kind: 'cctv', criticality: 2, district: 'Back Wall', position: { x: -11, y: 4.2, z: -8.4 }, ip: '192.168.1.40', tags: ['cctv'] },
  { id: 'office-cam-2', name: 'Cam · Corner', kind: 'cctv', criticality: 2, district: 'Back Wall', position: { x: 11, y: 4.2, z: -8.4 }, ip: '192.168.1.41', tags: ['cctv'] },
  { id: 'office-uplink', name: 'Internet Uplink', kind: 'external', criticality: 3, district: 'Above', position: { x: 0, y: 8.4, z: -4 }, tags: ['wan'] },
];

const LINK_COLOR = new Color(0x2f81f7);
const UPLINK_COLOR = new Color(0xff2d55);

const LINKS: readonly Link[] = [
  { source: 'office-router', target: 'office-uplink', kind: 'network' },
  { source: 'office-router', target: 'office-rack', kind: 'network' },
  { source: 'office-router', target: 'office-nas', kind: 'network' },
  { source: 'office-router', target: 'office-ws-manager', kind: 'network' },
  { source: 'office-router', target: 'office-ws-hr', kind: 'network' },
  { source: 'office-router', target: 'office-ws-ops', kind: 'network' },
  { source: 'office-router', target: 'office-reception', kind: 'network' },
  { source: 'office-router', target: 'office-printer', kind: 'network' },
  { source: 'office-router', target: 'office-tv', kind: 'network' },
  { source: 'office-router', target: 'office-ac', kind: 'network' },
  { source: 'office-router', target: 'office-badge', kind: 'network' },
  { source: 'office-router', target: 'office-cam-1', kind: 'network' },
  { source: 'office-router', target: 'office-cam-2', kind: 'network' },
  { source: 'office-rack', target: 'office-nas', kind: 'dataflow' },
];

interface TrackedResources {
  geometries: BufferGeometryType[];
  materials: Material[];
}

const ROOM_W = 26;
const ROOM_D = 18;
const WALL_H = 6.2;

export function createOfficeScene(canvas: HTMLCanvasElement, options: OfficeSceneOptions = {}): CityScene {
  const scene = new Scene();
  scene.background = new Color(0x03060d);
  const renderer = createRenderer(canvas, { pixelRatio: options.pixelRatio });
  renderer.info.autoReset = false;

  const tracked: TrackedResources = { geometries: [], materials: [] };
  const trackGeometry = <T extends BufferGeometryType>(geometry: T): T => {
    tracked.geometries.push(geometry);
    return geometry;
  };
  const trackMaterial = <T extends Material>(material: T): T => {
    tracked.materials.push(material);
    return material;
  };

  const camera = new PerspectiveCamera(55, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 300);
  const INITIAL_POSITION = new Vector3(16.5, 13, 17.5);
  const INITIAL_TARGET = new Vector3(0, 1.4, -1);
  camera.position.copy(INITIAL_POSITION);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.55;
  controls.minDistance = 7;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = Math.PI * 0.08;
  controls.target.copy(INITIAL_TARGET);
  controls.update();

  const room = buildRoom(trackGeometry, trackMaterial);
  scene.add(room.group);

  const lights = buildLights();
  scene.add(lights.group);

  const labels = new LabelFactory(options.labels ?? true);
  const glowTexture = createGlowTexture();

  const assetsGroup = new Group();
  assetsGroup.name = 'office-assets';
  const clickables: Mesh[] = [];
  const animators: Array<(elapsed: number, delta: number) => void> = [];
  for (const asset of OFFICE_ASSETS) {
    const node = buildDevice(asset, { labels, trackGeometry, trackMaterial, clickables, animators });
    assetsGroup.add(node);
  }
  scene.add(assetsGroup);

  const network = buildNetwork({ trackGeometry, trackMaterial, animators, glowTexture });
  scene.add(network.group);

  const renderContext: RenderContext = createRenderContext(renderer, scene, camera, {
    bloom: options.bloom ?? true,
    bloomStrength: 0.42,
  });

  const clock = new Clock();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const frameTimes: number[] = [];
  let frameHandle = 0;
  let running = false;
  let elapsed = 0;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    camera.aspect = height > 0 ? width / height : 1;
    camera.updateProjectionMatrix();
    renderContext.setSize(width, height);
  }

  function render(): void {
    const delta = Math.min(0.05, clock.getDelta());
    elapsed += delta;
    controls.update();
    for (const animate of animators) {
      animate(elapsed, delta);
    }
    renderer.info.reset();
    renderContext.render();
    frameTimes.push(delta * 1000);
    if (frameTimes.length > 60) {
      frameTimes.shift();
    }
  }

  function loop(): void {
    frameHandle = requestAnimationFrame(loop);
    render();
  }

  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  const positions = new Map<string, Vector3>(
    OFFICE_ASSETS.map((asset) => [asset.id, new Vector3(asset.position.x, asset.position.y, asset.position.z)]),
  );

  function getStats(): SceneStats {
    const frameMs =
      frameTimes.length === 0 ? 0 : frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
    let labelCount = 0;
    assetsGroup.children.forEach((child) => {
      if (child.userData.hasLabel === true) {
        labelCount += 1;
      }
    });
    return {
      fps: frameMs > 0 ? Math.round((1000 / frameMs) * 10) / 10 : 0,
      frameMs: Math.round(frameMs * 100) / 100,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      assets: OFFICE_ASSETS.length,
      labelCount,
    };
  }

  const sceneApi: CityScene = {
    assetIds: OFFICE_ASSETS.map((asset) => asset.id),
    start(): void {
      if (running) return;
      running = true;
      clock.start();
      loop();
    },
    stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frameHandle);
      clock.stop();
    },
    dispose(): void {
      sceneApi.stop();
      window.removeEventListener('resize', resize);
      observer?.disconnect();
      scene.remove(room.group, assetsGroup, network.group);
      lights.group.removeFromParent();
      lights.dispose();
      labels.dispose();
      glowTexture.dispose();
      for (const geometry of tracked.geometries) geometry.dispose();
      for (const material of tracked.materials) material.dispose();
      controls.dispose();
      renderContext.dispose();
    },
    resize,
    resetView(): void {
      camera.position.copy(INITIAL_POSITION);
      controls.target.copy(INITIAL_TARGET);
      controls.update();
    },
    getStats,
    pick(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickables, false)[0];
      const id = hit?.object.userData.assetId;
      return typeof id === 'string' ? id : null;
    },
    focusAsset(id: string, distance = 10): void {
      const target = positions.get(id);
      if (!target) return;
      const direction = new Vector3(0.35, 0.45, 1).normalize();
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(direction, distance);
      controls.update();
    },
  };
  return sceneApi;
}

function buildRoom(
  trackGeometry: <T extends BufferGeometryType>(geometry: T) => T,
  trackMaterial: <T extends Material>(material: T) => T,
): { group: Group; dispose(): void } {
  const group = new Group();
  group.name = 'office-room';

  const floorGeometry = trackGeometry(new PlaneGeometry(ROOM_W, ROOM_D));
  const floorMaterial = trackMaterial(
    new MeshStandardMaterial({ color: 0x0a1526, roughness: 0.55, metalness: 0.35 }),
  );
  const floor = new Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const grid = new Mesh(
    trackGeometry(new PlaneGeometry(ROOM_W, ROOM_D)),
    trackMaterial(
      new MeshBasicMaterial({ color: 0x2f81f7, transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false }),
    ),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.01;
  group.add(grid);

  const wallMaterial = trackMaterial(
    new MeshStandardMaterial({
      color: 0x0c1b2e,
      roughness: 0.8,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
    }),
  );
  const back = new Mesh(trackGeometry(new PlaneGeometry(ROOM_W, WALL_H)), wallMaterial);
  back.position.set(0, WALL_H / 2, -ROOM_D / 2);
  group.add(back);

  const left = new Mesh(trackGeometry(new PlaneGeometry(ROOM_D, WALL_H)), wallMaterial);
  left.position.set(-ROOM_W / 2, WALL_H / 2, 0);
  left.rotation.y = Math.PI / 2;
  group.add(left);

  const right = new Mesh(trackGeometry(new PlaneGeometry(ROOM_D, WALL_H)), wallMaterial);
  right.position.set(ROOM_W / 2, WALL_H / 2, 0);
  right.rotation.y = -Math.PI / 2;
  group.add(right);

  const windowPane = new Mesh(
    trackGeometry(new PlaneGeometry(ROOM_W * 0.6, WALL_H * 0.6)),
    trackMaterial(
      new MeshStandardMaterial({
        color: 0x123a63,
        emissive: 0x1a4d7f,
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.6,
        transparent: true,
        opacity: 0.35,
      }),
    ),
  );
  windowPane.position.set(-4, WALL_H * 0.55, -ROOM_D / 2 + 0.05);
  group.add(windowPane);

  return { group, dispose(): void {} };
}

function buildLights(): { group: Group; dispose(): void } {
  const group = new Group();
  group.name = 'office-lights';
  const ambient = new AmbientLight(0x233a58, 1.6);
  const key = new DirectionalLight(0xbcd8ff, 1.4);
  key.position.set(12, 20, 14);
  const warm = new PointLight(0x2f81f7, 3.2, 40);
  warm.position.set(-6, 5, -4);
  const cool = new PointLight(0x38e8d0, 1.4, 34);
  cool.position.set(9, 4, 4);
  group.add(ambient, key, warm, cool);
  return {
    group,
    dispose(): void {
      ambient.dispose();
      key.dispose();
      warm.dispose();
      cool.dispose();
    },
  };
}

interface DeviceBuild {
  labels: LabelFactory;
  trackGeometry: <T extends BufferGeometryType>(geometry: T) => T;
  trackMaterial: <T extends Material>(material: T) => T;
  clickables: Mesh[];
  animators: Array<(elapsed: number, delta: number) => void>;
}

function buildDevice(asset: Asset, build: DeviceBuild): Group {
  const node = new Group();
  node.name = `office-${asset.id}`;
  node.position.set(asset.position.x, asset.position.y, asset.position.z);
  const label = build.labels.create(asset.name, kindLabelColor(asset.kind), asset.kind === 'external' ? 5.4 : 4.6, 0.86);
  if (label) {
    label.position.set(0, labelHeight(asset.kind), 0);
    node.add(label);
  }
  node.userData.hasLabel = label !== null;

  switch (asset.kind) {
    case 'server':
      buildServerRack(node, build);
      break;
    case 'db':
      buildNas(node, build);
      break;
    case 'gateway':
      buildRouter(node, build, asset.id);
      break;
    case 'cctv':
      buildCamera(node, build);
      break;
    case 'external':
      buildUplink(node, build);
      break;
    default:
      buildServiceDevice(node, build, asset);
      break;
  }
  return node;
}

function labelHeight(kind: AssetKind): number {
  switch (kind) {
    case 'server':
      return 5.4;
    case 'cctv':
      return 2.2;
    case 'external':
      return 2.4;
    default:
      return 3.2;
  }
}

function clickable(node: Group, mesh: Mesh, id: string): void {
  mesh.userData.assetId = id;
  node.add(mesh);
}

function buildServerRack(node: Group, build: DeviceBuild): void {
  const body = new Mesh(
    build.trackGeometry(new BoxGeometry(2.2, 4.6, 1.6)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x14263f, roughness: 0.5, metalness: 0.6 })),
  );
  body.position.y = 2.3;
  clickable(node, body, 'office-rack');

  const ledMaterial = build.trackMaterial(
    new MeshStandardMaterial({ color: 0x19b3ff, emissive: 0x19b3ff, emissiveIntensity: 1.6 }),
  );
  const ledGeometry = build.trackGeometry(new BoxGeometry(1.5, 0.06, 0.04));
  for (let i = 0; i < 9; i += 1) {
    const led = new Mesh(ledGeometry, ledMaterial);
    led.position.set(0, 0.6 + i * 0.42, 0.82);
    node.add(led);
  }
  const phase = Math.random() * Math.PI * 2;
  build.animators.push((elapsed) => {
    ledMaterial.emissiveIntensity = 1.1 + Math.abs(Math.sin(elapsed * 7 + phase)) * 0.9;
  });
}

function buildNas(node: Group, build: DeviceBuild): void {
  const body = new Mesh(
    build.trackGeometry(new BoxGeometry(1.8, 1.1, 1.2)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x241536, roughness: 0.45, metalness: 0.55, emissive: 0x8a2be2, emissiveIntensity: 0.25 })),
  );
  body.position.y = 0.55;
  clickable(node, body, 'office-nas');
}

function buildRouter(node: Group, build: DeviceBuild, id: string): void {
  const pedestal = new Mesh(
    build.trackGeometry(new CylinderGeometry(0.28, 0.34, 1.2, 12)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x14263f, roughness: 0.6, metalness: 0.4 })),
  );
  pedestal.position.y = 0.6;
  node.add(pedestal);

  const body = new Mesh(
    build.trackGeometry(new BoxGeometry(1.5, 0.4, 1.5)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x0f2038, roughness: 0.4, metalness: 0.6, emissive: 0x2f81f7, emissiveIntensity: 0.35 })),
  );
  body.position.y = 1.4;
  clickable(node, body, id);

  for (const dx of [-0.45, 0.45]) {
    const antenna = new Mesh(
      build.trackGeometry(new CylinderGeometry(0.035, 0.05, 0.8, 8)),
      build.trackMaterial(new MeshStandardMaterial({ color: 0x9fc3e8, roughness: 0.35, metalness: 0.7 })),
    );
    antenna.position.set(dx, 2, 0);
    antenna.rotation.z = dx > 0 ? 0.16 : -0.16;
    node.add(antenna);
  }

  const ring = new Mesh(
    build.trackGeometry(new TorusGeometry(1.05, 0.035, 8, 48)),
    build.trackMaterial(new MeshBasicMaterial({ color: 0x2f81f7, transparent: true, opacity: 0.5 })),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.42;
  node.add(ring);
  build.animators.push((elapsed) => {
    const material = ring.material as MeshBasicMaterial;
    material.opacity = 0.25 + Math.abs(Math.sin(elapsed * 2.2)) * 0.4;
    ring.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.08);
  });
}

function buildCamera(node: Group, build: DeviceBuild): void {
  const mount = new Mesh(
    build.trackGeometry(new BoxGeometry(0.16, 0.4, 0.3)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x14263f, roughness: 0.5, metalness: 0.5 })),
  );
  mount.position.y = 0.1;
  node.add(mount);

  const head = new Mesh(
    build.trackGeometry(new BoxGeometry(0.5, 0.28, 0.42)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x1c2b45, roughness: 0.4, metalness: 0.6 })),
  );
  head.position.set(0, -0.2, 0);
  node.add(head);
  node.userData.baseRotation = node.rotation.y;

  const lens = new Mesh(
    build.trackGeometry(new SphereGeometry(0.09, 12, 12)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0xff8c42, emissive: 0xff8c42, emissiveIntensity: 1.4 })),
  );
  lens.position.set(0, -0.22, 0.24);
  node.add(lens);

  build.animators.push((elapsed) => {
    const base = (node.userData.baseRotation as number) ?? 0;
    node.rotation.y = base + Math.sin(elapsed * 0.7 + node.position.x) * 0.5;
  });
}

function buildUplink(node: Group, build: DeviceBuild): void {
  const core = new Mesh(
    build.trackGeometry(new ConeGeometry(0.7, 1.5, 4)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0xff2d55, emissive: 0xff2d55, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 })),
  );
  core.position.y = 0.6;
  core.rotation.x = Math.PI;
  clickable(node, core, 'office-uplink');
  build.animators.push((elapsed, delta) => {
    core.rotation.y += delta * 0.8;
    core.position.y = 0.6 + Math.sin(elapsed * 1.6) * 0.25;
  });
}

function buildServiceDevice(node: Group, build: DeviceBuild, asset: Asset): void {
  if (asset.tags.includes('workstation')) {
    buildWorkstation(node, build, asset);
    return;
  }
  if (asset.tags.includes('iot')) {
    buildIotBox(node, build, asset);
    return;
  }
  const box = new Mesh(
    build.trackGeometry(new BoxGeometry(0.8, 0.8, 0.8)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x1c2b45, roughness: 0.5, metalness: 0.5 })),
  );
  box.position.y = 0.4;
  clickable(node, box, asset.id);
}

function buildWorkstation(node: Group, build: DeviceBuild, asset: Asset): void {
  const deskTop = new Mesh(
    build.trackGeometry(new BoxGeometry(3.4, 0.14, 1.8)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x14263f, roughness: 0.6, metalness: 0.35 })),
  );
  deskTop.position.y = 1.0;
  node.add(deskTop);

  const legGeometry = build.trackGeometry(new CylinderGeometry(0.05, 0.05, 1.0, 8));
  const legMaterial = build.trackMaterial(new MeshStandardMaterial({ color: 0x0f2038, roughness: 0.55, metalness: 0.5 }));
  for (const [dx, dz] of [
    [-1.5, -0.7],
    [1.5, -0.7],
    [-1.5, 0.7],
    [1.5, 0.7],
  ] as const) {
    const leg = new Mesh(legGeometry, legMaterial);
    leg.position.set(dx, 0.5, dz);
    node.add(leg);
  }

  const tower = new Mesh(
    build.trackGeometry(new BoxGeometry(0.5, 0.9, 0.8)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x0f2038, roughness: 0.45, metalness: 0.55 })),
  );
  tower.position.set(-1.2, 1.55, 0);
  clickable(node, tower, asset.id);

  const stand = new Mesh(
    build.trackGeometry(new CylinderGeometry(0.05, 0.09, 0.35, 8)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x0f2038, roughness: 0.5, metalness: 0.5 })),
  );
  stand.position.set(0.25, 1.25, -0.35);
  node.add(stand);

  const screen = new Mesh(
    build.trackGeometry(new BoxGeometry(1.9, 1.05, 0.07)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x0a1526, roughness: 0.35, metalness: 0.6 })),
  );
  screen.position.set(0.25, 1.95, -0.4);
  node.add(screen);

  const panel = new Mesh(
    build.trackGeometry(new PlaneGeometry(1.7, 0.9)),
    build.trackMaterial(
      new MeshStandardMaterial({ color: 0x4fd1ff, emissive: 0x4fd1ff, emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.85 }),
    ),
  );
  panel.position.set(0.25, 1.95, -0.34);
  panel.rotation.y = Math.PI;
  node.add(panel);
  const flicker = build.trackMaterial(panel.material);
  build.animators.push((elapsed) => {
    const material = flicker as MeshStandardMaterial;
    material.emissiveIntensity = 0.4 + Math.abs(Math.sin(elapsed * 3.1 + asset.position.x)) * 0.25;
  });
}

function buildIotBox(node: Group, build: DeviceBuild, asset: Asset): void {
  const body = new Mesh(
    build.trackGeometry(new BoxGeometry(0.7, 0.5, 0.55)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x1c2b45, roughness: 0.5, metalness: 0.45 })),
  );
  body.position.y = 0.25;
  clickable(node, body, asset.id);

  const dot = new Mesh(
    build.trackGeometry(new SphereGeometry(0.05, 10, 10)),
    build.trackMaterial(new MeshStandardMaterial({ color: 0x4fd1ff, emissive: 0x4fd1ff, emissiveIntensity: 1.2 })),
  );
  dot.position.set(0.25, 0.3, 0.3);
  node.add(dot);
  build.animators.push((elapsed) => {
    const material = dot.material as MeshStandardMaterial;
    material.emissiveIntensity = Math.sin(elapsed * 4 + asset.position.z) > 0 ? 1.6 : 0.4;
  });
}

interface NetworkBuild {
  trackGeometry: <T extends BufferGeometryType>(geometry: T) => T;
  trackMaterial: <T extends Material>(material: T) => T;
  animators: Array<(elapsed: number, delta: number) => void>;
  glowTexture: ReturnType<typeof createGlowTexture>;
}

function buildNetwork(build: NetworkBuild): { group: Group; dispose(): void } {
  const group = new Group();
  group.name = 'office-network';
  const points = new Map<string, Vector3>(
    OFFICE_ASSETS.map((asset) => [asset.id, new Vector3(asset.position.x, asset.position.y, asset.position.z)]),
  );

  const lineMaterial = build.trackMaterial(
    new LineBasicMaterial({ color: LINK_COLOR, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false }),
  );

  const vertices: number[] = [];
  const pulses: Array<{ sprite: Sprite; a: Vector3; b: Vector3; speed: number; phase: number }> = [];
  const pulseMaterialFactory = () =>
    build.trackMaterial(
      new SpriteMaterial({
        map: build.glowTexture,
        color: LINK_COLOR,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        opacity: 0.85,
      }),
    );

  for (const link of LINKS) {
    const a = points.get(link.source);
    const b = points.get(link.target);
    if (!a || !b) continue;
    const liftA = a.clone().add(new Vector3(0, a.y > 2 ? 0 : 1.4, 0));
    const liftB = b.clone().add(new Vector3(0, b.y > 2 ? 0 : 1.4, 0));
    vertices.push(liftA.x, liftA.y, liftA.z, liftB.x, liftB.y, liftB.z);

    const isUplink = link.kind === 'network' && link.target === 'office-uplink';
    const sprite = new Sprite(pulseMaterialFactory());
    sprite.name = `pulse-${link.source}-${link.target}`;
    if (isUplink) {
      (sprite.material as SpriteMaterial).color = UPLINK_COLOR;
      sprite.scale.setScalar(1.5);
    } else {
      sprite.scale.setScalar(0.9);
    }
    group.add(sprite);
    pulses.push({
      sprite,
      a: liftA,
      b: liftB,
      speed: isUplink ? 0.35 : 0.22 + Math.random() * 0.12,
      phase: Math.random(),
    });
  }

  const geometry = build.trackGeometry(new BufferGeometry());
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  group.add(new LineSegments(geometry, lineMaterial));

  build.animators.push((elapsed) => {
    for (const pulse of pulses) {
      const t = (elapsed * pulse.speed + pulse.phase) % 1;
      pulse.sprite.position.lerpVectors(pulse.a, pulse.b, t);
      pulse.sprite.visible = t > 0.03 && t < 0.97;
    }
  });

  return { group, dispose(): void {} };
}
