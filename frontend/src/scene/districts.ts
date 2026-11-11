import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import type { Asset } from '../types/contract';
import { GROUND_LEVEL } from './ground';

const DISTRICT_RADII: Record<string, number> = {
  Nauryzbay: 17,
  Auezov: 15,
  Almaly: 13,
  Bostandyk: 15,
  Medeu: 16,
  Turksib: 16,
  Zhetysu: 15,
  Alatau: 14,
};

const DEFAULT_RADIUS = 14;
const SIDES = 9;

export interface DistrictRig {
  group: Group;
  dispose(): void;
}

function districtRadius(name: string): number {
  return DISTRICT_RADII[name] ?? DEFAULT_RADIUS;
}

function districtPolygon(centerX: number, centerZ: number, radius: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < SIDES; i += 1) {
    const angle = (i / SIDES) * Math.PI * 2;
    const wobble = radius * (0.82 + 0.2 * Math.sin(i * 2.3 + centerX * 0.7));
    points.push([
      centerX + Math.cos(angle) * wobble,
      centerZ + Math.sin(angle) * wobble * 0.86,
    ]);
  }
  return points;
}

export function createDistricts(districts: readonly Asset[]): DistrictRig {
  const group = new Group();
  group.name = 'districts';

  for (const district of districts) {
    const radius = districtRadius(district.name);
    const polygon = districtPolygon(district.position.x, district.position.z, radius);

    const shape = new Shape();
    polygon.forEach(([x, z], index) => {
      if (index === 0) {
        shape.moveTo(x, -z);
      } else {
        shape.lineTo(x, -z);
      }
    });
    shape.closePath();

    const pad = new Mesh(
      new ShapeGeometry(shape),
      new MeshBasicMaterial({
        color: 0x123a6a,
        transparent: true,
        opacity: 0.12,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    pad.name = `district-pad-${district.id}`;
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = GROUND_LEVEL + 0.02;
    group.add(pad);

    const outlineGeometry = new BufferGeometry();
    outlineGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        polygon.flatMap(([x, z]) => [x, GROUND_LEVEL + 0.06, z]),
        3,
      ),
    );
    const outline = new LineLoop(
      outlineGeometry,
      new LineBasicMaterial({ color: 0x2f81f7, transparent: true, opacity: 0.32 }),
    );
    outline.name = `district-outline-${district.id}`;
    group.add(outline);
  }

  return {
    group,
    dispose(): void {
      group.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material.dispose();
          }
        }
        if (child instanceof LineLoop) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material.dispose();
          }
        }
      });
    },
  };
}
