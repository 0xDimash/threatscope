import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { GROUND_LEVEL } from './ground';

const RIVER_PATHS: Array<Array<[number, number]>> = [
  [
    [10, 46],
    [8, 34],
    [5, 22],
    [3, 10],
    [2, -2],
    [6, -16],
    [8, -30],
  ],
  [
    [22, 42],
    [20, 30],
    [17, 20],
    [15, 8],
    [14, -6],
    [16, -20],
  ],
];

const SEGMENTS = 120;

export interface RiverRig {
  group: Group;
  dispose(): void;
}

function ribbonGeometry(path: Array<[number, number]>, width: number): BufferGeometry {
  const curve = new CatmullRomCurve3(
    path.map(([x, z]) => new Vector3(x, 0, z)),
    false,
    'catmullrom',
    0.4,
  );

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const level = GROUND_LEVEL + 0.04;

  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const side = new Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
    const left = point.clone().add(side);
    const right = point.clone().sub(side);

    positions.push(left.x, level, left.z, right.x, level, right.z);
    uvs.push(t, 0, t, 1);

    if (i < SEGMENTS) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createRivers(): RiverRig {
  const group = new Group();
  group.name = 'rivers';

  for (const [index, path] of RIVER_PATHS.entries()) {
    const river = new Mesh(
      ribbonGeometry(path, 1.4),
      new MeshBasicMaterial({
        color: index === 0 ? 0x2a7abe : 0x24709f,
        transparent: true,
        opacity: 0.45,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    river.name = `river-${index + 1}`;
    group.add(river);
  }

  return {
    group,
    dispose(): void {
      for (const child of group.children) {
        if (child instanceof Mesh) {
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
