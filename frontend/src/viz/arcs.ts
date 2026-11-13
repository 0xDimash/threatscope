import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  QuadraticBezierCurve3,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Scene,
  type Texture,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Asset, SecurityEvent, Severity } from '../types/contract';

export interface ArcsLayer {
  group: Group;
  spawn(event: SecurityEvent): void;
  update(elapsed: number, delta: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

interface ArcStyle {
  width: number;
  opacity: number;
  dashed: boolean;
  dashSize: number;
  gapSize: number;
  pulseScale: number;
}

const STYLES: Record<Severity, ArcStyle> = {
  critical: { width: 2.8, opacity: 0.95, dashed: false, dashSize: 0, gapSize: 0, pulseScale: 1.6 },
  high: { width: 2.2, opacity: 0.82, dashed: false, dashSize: 0, gapSize: 0, pulseScale: 1.35 },
  medium: { width: 1.7, opacity: 0.68, dashed: true, dashSize: 0.5, gapSize: 0.35, pulseScale: 1.15 },
  low: { width: 1.3, opacity: 0.5, dashed: true, dashSize: 0.3, gapSize: 0.5, pulseScale: 0.95 },
  info: { width: 1.0, opacity: 0.32, dashed: true, dashSize: 0.2, gapSize: 0.6, pulseScale: 0.8 },
};

const LIFETIME = 3.6;

interface ActiveArc {
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  head: Sprite;
  curve: QuadraticBezierCurve3;
  style: ArcStyle;
  age: number;
  lifetime: number;
  points: Vector3[];
}

function createWhiteGlowTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createArcsLayer(options: {
  scene: Scene;
  assets: readonly Asset[];
  viewportWidth: number;
  viewportHeight: number;
}): ArcsLayer {
  const { scene, assets } = options;
  const group = new Group();
  group.name = 'attack-arcs';
  scene.add(group);

  const positions = new Map<string, Vector3>(
    assets.map((asset) => [asset.id, new Vector3(asset.position.x, asset.position.y, asset.position.z)]),
  );
  const externalIds = assets.filter((asset) => asset.kind === 'external').map((asset) => asset.id);
  const fallbackSource = externalIds[0]
    ? positions.get(externalIds[0])!.clone()
    : new Vector3(0, 26, -42);

  const glowTexture = createWhiteGlowTexture();
  const arcs: ActiveArc[] = [];
  let resolution = { width: options.viewportWidth, height: options.viewportHeight };

  function sourcePosition(event: SecurityEvent): Vector3 {
    const id = event.src.asset_id;
    if (id && positions.has(id)) {
      return positions.get(id)!.clone();
    }
    // Rotate through external origins so arcs fan out.
    const index = Math.abs(hashString(event.id)) % Math.max(1, externalIds.length);
    const chosen = externalIds[index] ? positions.get(externalIds[index]) : null;
    return (chosen ? chosen.clone() : fallbackSource.clone()).add(
      new Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6),
    );
  }

  function destinationPosition(event: SecurityEvent): Vector3 | null {
    const id = event.dst.asset_id;
    if (id && positions.has(id)) {
      return positions.get(id)!.clone();
    }
    return null;
  }

  function spawn(event: SecurityEvent): void {
    const dst = destinationPosition(event);
    if (!dst) return;
    const src = sourcePosition(event);
    const style = STYLES[event.severity] ?? STYLES.info;

    const mid = new Vector3().addVectors(src, dst).multiplyScalar(0.5);
    const distance = src.distanceTo(dst);
    mid.y += distance * 0.32 + 5;

    const curve = new QuadraticBezierCurve3(src, mid, dst);
    const sampled = curve.getPoints(52);
    const positionsArray: number[] = [];
    for (const point of sampled) {
      positionsArray.push(point.x, point.y, point.z);
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positionsArray);

    const material = new LineMaterial({
      color: 0xffffff,
      linewidth: style.width,
      transparent: true,
      opacity: 0,
      dashed: style.dashed,
      dashSize: style.dashSize,
      gapSize: style.gapSize,
      resolution: new Vector2(resolution.width, resolution.height),
    });
    material.depthWrite = false;

    const line = new Line2(geometry, material);
    line.computeLineDistances();
    group.add(line);

    const head = new Sprite(
      new SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        opacity: 0.95,
      }),
    );
    head.scale.setScalar(style.pulseScale * 2.2);
    group.add(head);

    arcs.push({
      line,
      geometry,
      material,
      head,
      curve,
      style,
      age: 0,
      lifetime: LIFETIME,
      points: sampled,
    });
  }

  function update(elapsed: number, delta: number): void {
    for (let i = arcs.length - 1; i >= 0; i -= 1) {
      const arc = arcs[i];
      arc.age += delta;
      const progress = arc.age / arc.lifetime;

      // Fade in, then fade out.
      let opacity = arc.style.opacity;
      if (progress < 0.08) {
        opacity *= progress / 0.08;
      } else if (progress > 0.65) {
        opacity *= 1 - (progress - 0.65) / 0.35;
      }
      arc.material.opacity = Math.max(0, opacity);

      // Traveling head.
      const headT = Math.min(1, progress / 0.75);
      const point = arc.curve.getPoint(headT);
      arc.head.position.copy(point);
      arc.head.material.opacity = progress < 0.75 ? 0.95 : 0;
      arc.head.scale.setScalar(arc.style.pulseScale * 2.2 * (1 + Math.sin(elapsed * 6) * 0.12));

      if (progress >= 1) {
        group.remove(arc.line, arc.head);
        arc.geometry.dispose();
        arc.material.dispose();
        (arc.head.material as SpriteMaterial).dispose();
        arcs.splice(i, 1);
      }
    }
  }

  function resize(width: number, height: number): void {
    resolution = { width, height };
    for (const arc of arcs) {
      arc.material.resolution.set(width, height);
    }
  }

  function dispose(): void {
    for (const arc of arcs) {
      group.remove(arc.line, arc.head);
      arc.geometry.dispose();
      arc.material.dispose();
      (arc.head.material as SpriteMaterial).dispose();
    }
    arcs.length = 0;
    glowTexture.dispose();
    scene.remove(group);
  }

  return { group, spawn, update, resize, dispose };
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
