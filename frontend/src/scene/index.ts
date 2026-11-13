import {
  Clock,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type ShaderMaterial,
  type SpriteMaterial,
} from 'three';
import { createAssetMeshes, type AssetNode } from './assetMeshes';
import { createArcsLayer } from '../viz/arcs';
import { createCameraRig } from './camera';
import { createDistricts } from './districts';
import { createEnvironment } from './environment';
import { createGround } from './ground';
import { LabelFactory } from './labels';
import { createLights } from './lights';
import { createRenderer, createRenderContext } from './renderer';
import { createRidge } from './ridge';
import { createRingRoad } from './ringRoad';
import { createRivers } from './rivers';
import { createGlowTexture } from './textures';
import type { CityScene, SceneOptions, SceneStats } from './types';
import type { SecurityEvent } from '../types/contract';

interface AnimatedNode {
  group: Group;
  uTime: { value: number };
  glow: SpriteMaterial;
  halo: Mesh;
  spin: number;
  phase: number;
}

const FRAME_SAMPLES = 60;

export function createCityScene(canvas: HTMLCanvasElement, options: SceneOptions): CityScene {
  const scene = new Scene();
  const renderer = createRenderer(canvas, { pixelRatio: options.pixelRatio });
  renderer.info.autoReset = false;

  const rig = createCameraRig(canvas, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  const environment = createEnvironment(renderer, scene);
  const lights = createLights();
  scene.add(lights.group);

  const ground = createGround();
  scene.add(ground.group);

  const districtAssets = options.assets.filter((asset) => asset.kind === 'district');
  const districts = createDistricts(districtAssets);
  scene.add(districts.group);

  const rivers = createRivers();
  scene.add(rivers.group);

  const ringRoad = createRingRoad();
  scene.add(ringRoad.group);

  const ridge = createRidge();
  scene.add(ridge.group);

  const labels = new LabelFactory(options.labels ?? true);
  const glowTexture = createGlowTexture();
  const assets = createAssetMeshes(options.assets, { glowTexture, labels });
  scene.add(assets.group);

  const arcs = createArcsLayer({
    scene,
    assets: options.assets,
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight,
  });

  const renderContext = createRenderContext(renderer, scene, rig.camera, { bloom: options.bloom });

  const animated: AnimatedNode[] = [];
  assets.nodes.forEach((node: AssetNode) => {
    animated.push({
      group: node.group,
      uTime: (node.shell.material as ShaderMaterial).uniforms.uTime as { value: number },
      glow: node.glow.material as SpriteMaterial,
      halo: node.halo,
      spin: node.kind === 'external' ? 0.55 : 0.12,
      phase: node.group.position.z,
    });
  });

  const clock = new Clock();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const frameTimes: number[] = [];
  let frameHandle = 0;
  let running = false;
  let elapsed = 0;
  let eventTimer = 0;

  function viewportSize(): { width: number; height: number } {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    return { width, height };
  }

  function resize(): void {
    const { width, height } = viewportSize();
    rig.resize(width, height);
    renderContext.setSize(width, height);
    arcs.resize(width, height);
  }

  function render(): void {
    const delta = Math.min(0.05, clock.getDelta());
    elapsed += delta;

    rig.controls.update();
    environment.update(elapsed, delta);
    ground.update(elapsed);

    for (const node of animated) {
      node.group.rotation.y += delta * node.spin;
      node.uTime.value = elapsed;
      node.halo.rotation.z += delta * 0.35;
      node.glow.opacity = 0.17 + Math.sin(elapsed * 2 + node.phase) * 0.04;
    }

    arcs.update(elapsed, delta);

    renderer.info.reset();
    renderContext.render();

    frameTimes.push(delta * 1000);
    if (frameTimes.length > FRAME_SAMPLES) {
      frameTimes.shift();
    }
  }

  function loop(): void {
    frameHandle = requestAnimationFrame(loop);
    render();
  }

  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          resize();
        });
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  const demoEvents = options.events ?? [];
  if (demoEvents.length > 0) {
    let index = 0;
    eventTimer = window.setInterval(() => {
      arcs.spawn(demoEvents[index % demoEvents.length]);
      index += 1;
    }, options.eventIntervalMs ?? 1100);
  }

  function getStats(): SceneStats {
    const frameMs =
      frameTimes.length === 0
        ? 0
        : frameTimes.reduce((total, value) => total + value, 0) / frameTimes.length;
    let labelCount = 0;
    assets.nodes.forEach((node) => {
      if (node.label) {
        labelCount += 1;
      }
    });
    return {
      fps: frameMs > 0 ? Math.round((1000 / frameMs) * 10) / 10 : 0,
      frameMs: Math.round(frameMs * 100) / 100,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      assets: assets.nodes.size,
      labelCount,
    };
  }

  const sceneApi: CityScene = {
    assetIds: [...assets.nodes.keys()],
    start(): void {
      if (running) {
        return;
      }
      running = true;
      clock.start();
      loop();
    },
    stop(): void {
      if (!running) {
        return;
      }
      running = false;
      cancelAnimationFrame(frameHandle);
      clock.stop();
    },
    dispose(): void {
      sceneApi.stop();
      window.removeEventListener('resize', resize);
      observer?.disconnect();
      if (eventTimer) window.clearInterval(eventTimer);
      scene.remove(assets.group, districts.group, rivers.group, ringRoad.group, ridge.group);
      ground.group.removeFromParent();
      lights.group.removeFromParent();
      assets.dispose();
      districts.dispose();
      rivers.dispose();
      ringRoad.dispose();
      ridge.dispose();
      ground.dispose();
      lights.dispose();
      environment.dispose();
      labels.dispose();
      glowTexture.dispose();
      arcs.dispose();
      rig.dispose();
      renderContext.dispose();
    },
    resize,
    resetView(): void {
      rig.reset();
    },
    getStats,
    pick(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, rig.camera);
      const hits = raycaster.intersectObjects(assets.clickables, false);
      const first = hits[0];
      if (!first) {
        return null;
      }
      const id = first.object.userData.assetId;
      return typeof id === 'string' ? id : null;
    },
    focusAsset(id: string, distance = 24): void {
      const node = assets.nodes.get(id);
      if (!node) {
        return;
      }
      rig.focus(
        new Vector3(node.group.position.x, node.group.position.y, node.group.position.z),
        distance,
      );
    },
    spawnArc(event: SecurityEvent): void {
      arcs.spawn(event);
    },
  };

  return sceneApi;
}
