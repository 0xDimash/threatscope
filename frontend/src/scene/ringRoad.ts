import {
  BufferGeometry,
  EllipseCurve,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Vector2,
} from 'three';
import { GROUND_LEVEL } from './ground';

const CENTER_X = 0;
const CENTER_Z = -4.2;
const RADIUS_X = 37.8;
const RADIUS_Z = 32.2;

export interface RingRoadRig {
  group: Group;
  dispose(): void;
}

export function createRingRoad(): RingRoadRig {
  const group = new Group();
  group.name = 'ring-road';

  const curve = new EllipseCurve(CENTER_X, CENTER_Z, RADIUS_X, RADIUS_Z, 0, Math.PI * 2);
  const points = curve.getPoints(180).map((point: Vector2) => [
    point.x,
    GROUND_LEVEL + 0.08,
    point.y,
  ]);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));

  const ring = new Line(
    geometry,
    new LineDashedMaterial({
      color: 0x2f81f7,
      transparent: true,
      opacity: 0.38,
      dashSize: 3,
      gapSize: 2.4,
    }),
  );
  ring.name = 'ring-road-dashed';
  ring.computeLineDistances();
  group.add(ring);

  const outline = new Line(
    geometry.clone(),
    new LineBasicMaterial({ color: 0x1c6fd8, transparent: true, opacity: 0.16 }),
  );
  outline.name = 'ring-road-outline';
  group.add(outline);

  return {
    group,
    dispose(): void {
      for (const child of group.children) {
        if (child instanceof Line) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material.dispose();
          }
        }
      }
    },
  };
}
