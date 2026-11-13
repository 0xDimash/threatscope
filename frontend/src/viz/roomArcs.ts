import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  Vector2,
  Vector3,
  type Scene,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { SecurityEvent, Severity } from '../types/contract';

export interface RoomArcsLayer {
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
  packetSize: number;
  speed: number;
}

const STYLES: Record<Severity, ArcStyle> = {
  critical: { width: 2.6, opacity: 0.95, dashed: false, dashSize: 0, gapSize: 0, packetSize: 0.22, speed: 1.0 },
  high: { width: 2.0, opacity: 0.82, dashed: false, dashSize: 0, gapSize: 0, packetSize: 0.18, speed: 0.9 },
  medium: { width: 1.6, opacity: 0.68, dashed: true, dashSize: 0.4, gapSize: 0.3, packetSize: 0.16, speed: 0.8 },
  low: { width: 1.2, opacity: 0.5, dashed: true, dashSize: 0.25, gapSize: 0.45, packetSize: 0.14, speed: 0.7 },
  info: { width: 1.0, opacity: 0.32, dashed: true, dashSize: 0.15, gapSize: 0.55, packetSize: 0.12, speed: 0.6 },
};

const LIFETIME = 2.6;
const EXTERNAL_ORIGIN = new Vector3(0, 5.2, -6.0);

interface ActiveArc {
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  packet: Mesh;
  curve: QuadraticBezierCurve3;
  style: ArcStyle;
  age: number;
}

export function createRoomArcsLayer(options: {
  scene: Scene;
  devicePositions: Map<string, Vector3>;
  viewportWidth: number;
  viewportHeight: number;
}): RoomArcsLayer {
  const { scene, devicePositions } = options;
  const group = new Group();
  group.name = 'room-arcs';
  scene.add(group);

  const arcs: ActiveArc[] = [];
  let resolution = { width: options.viewportWidth, height: options.viewportHeight };

  function destinationPosition(event: SecurityEvent): Vector3 | null {
    const id = event.dst.asset_id;
    if (id && devicePositions.has(id)) return devicePositions.get(id)!.clone();
    return null;
  }

  function sourcePosition(event: SecurityEvent): Vector3 {
    const id = event.src.asset_id;
    if (id && devicePositions.has(id)) return devicePositions.get(id)!.clone();
    return EXTERNAL_ORIGIN.clone();
  }

  function spawn(event: SecurityEvent): void {
    const end = destinationPosition(event);
    if (!end) return;
    const start = sourcePosition(event);
    const style = STYLES[event.severity] ?? STYLES.info;

    const mid = new Vector3().addVectors(start, end).multiplyScalar(0.5);
    const distance = start.distanceTo(end);
    mid.y += distance * 0.35 + 1.2;

    const curve = new QuadraticBezierCurve3(start, mid, end);
    const sampled = curve.getPoints(28);
    const positionsArray: number[] = [];
    for (const p of sampled) positionsArray.push(p.x, p.y, p.z);

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

    const packet = new Mesh(
      new BoxGeometry(style.packetSize, style.packetSize, style.packetSize),
      new MeshBasicMaterial({ color: 0xffffff }),
    );
    packet.position.copy(start);
    group.add(packet);

    arcs.push({ line, geometry, material, packet, curve, style, age: 0 });
  }

  function update(_elapsed: number, delta: number): void {
    for (let i = arcs.length - 1; i >= 0; i -= 1) {
      const arc = arcs[i];
      arc.age += delta;
      const progress = arc.age / LIFETIME;

      let opacity = arc.style.opacity;
      if (progress < 0.1) opacity *= progress / 0.1;
      else if (progress > 0.7) opacity *= 1 - (progress - 0.7) / 0.3;
      arc.material.opacity = Math.max(0, opacity);

      const t = Math.min(1, progress / 0.85);
      arc.packet.position.copy(arc.curve.getPoint(t));
      arc.packet.visible = progress < 0.85;

      if (progress >= 1) {
        group.remove(arc.line, arc.packet);
        arc.geometry.dispose();
        arc.material.dispose();
        (arc.packet.material as MeshBasicMaterial).dispose();
        arc.packet.geometry.dispose();
        arcs.splice(i, 1);
      }
    }
  }

  function resize(width: number, height: number): void {
    resolution = { width, height };
    for (const arc of arcs) arc.material.resolution.set(width, height);
  }

  function dispose(): void {
    for (const arc of arcs) {
      group.remove(arc.line, arc.packet);
      arc.geometry.dispose();
      arc.material.dispose();
      (arc.packet.material as MeshBasicMaterial).dispose();
      arc.packet.geometry.dispose();
    }
    arcs.length = 0;
    scene.remove(group);
  }

  return { group, spawn, update, resize, dispose };
}