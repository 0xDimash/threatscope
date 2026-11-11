import {
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND_LEVEL } from './ground';

const PEAKS: Array<[number, number, number]> = [
  [-64, -56, 11],
  [-50, -60, 15],
  [-36, -57, 12],
  [-22, -62, 18],
  [-8, -58, 13],
  [6, -61, 16],
  [20, -55, 11],
  [34, -60, 15],
  [48, -56, 11],
  [62, -59, 13],
];

const BACK_PEAKS: Array<[number, number, number]> = [
  [-56, -64, 9],
  [-42, -67, 12],
  [-28, -65, 10],
  [-14, -68, 13],
  [2, -66, 11],
  [16, -68, 9],
  [30, -64, 12],
  [46, -67, 10],
  [60, -65, 9],
];

export interface RidgeRig {
  group: Group;
  dispose(): void;
}

function peakGeometries(
  peaks: Array<[number, number, number]>,
  offset: number,
): BufferGeometry[] {
  return peaks.map(([x, z, height], index) => {
    const geometry = new ConeGeometry(height * 1.8, height, 5);
    geometry.rotateY(index * 0.7 + offset);
    geometry.translate(x, GROUND_LEVEL + height / 2, z);
    return geometry;
  });
}

export function createRidge(): RidgeRig {
  const group = new Group();
  group.name = 'ridge';

  const front = mergeGeometries(peakGeometries(PEAKS, 0), false);
  const back = mergeGeometries(peakGeometries(BACK_PEAKS, 0.4), false);
  if (!front || !back) {
    throw new Error('ridge geometry merge failed');
  }

  const material = new MeshStandardMaterial({
    color: 0x0a1728,
    roughness: 0.98,
    metalness: 0.02,
    emissive: 0x03080f,
  });

  const frontMesh = new Mesh(front, material);
  frontMesh.name = 'ridge-front';
  group.add(frontMesh);

  const backMaterial = new MeshStandardMaterial({
    color: 0x081222,
    roughness: 1,
    metalness: 0,
    emissive: 0x02060c,
  });
  const backMesh = new Mesh(back, backMaterial);
  backMesh.name = 'ridge-back';
  group.add(backMesh);

  return {
    group,
    dispose(): void {
      front.dispose();
      back.dispose();
      material.dispose();
      backMaterial.dispose();
    },
  };
}
