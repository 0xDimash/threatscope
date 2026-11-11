import {
  DoubleSide,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type LineBasicMaterial,
} from 'three';
import { createGroundTexture } from './textures';

export const GROUND_SIZE = 140;
export const GROUND_LEVEL = -6.4;

export interface GroundRig {
  group: Group;
  update(time: number): void;
  dispose(): void;
}

export function createGround(): GroundRig {
  const group = new Group();
  group.name = 'ground';

  const apron = new Mesh(
    new PlaneGeometry(GROUND_SIZE * 3, GROUND_SIZE * 3),
    new MeshBasicMaterial({ color: 0x04080f }),
  );
  apron.name = 'ground-apron';
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = GROUND_LEVEL - 0.05;
  group.add(apron);

  const floor = new Mesh(
    new PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new MeshBasicMaterial({
      map: createGroundTexture(),
      transparent: true,
      opacity: 0.95,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  floor.name = 'ground-plate';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = GROUND_LEVEL;
  group.add(floor);

  const grid = new GridHelper(GROUND_SIZE, 28, 0x2f81f7, 0x12304f);
  grid.name = 'ground-grid';
  grid.position.y = GROUND_LEVEL + 0.05;
  const gridMaterial = grid.material as LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.12;
  group.add(grid);

  return {
    group,
    update(time: number): void {
      gridMaterial.opacity = 0.14 + Math.sin(time * 0.7) * 0.05;
    },
    dispose(): void {
      apron.geometry.dispose();
      (apron.material as MeshBasicMaterial).dispose();
      floor.geometry.dispose();
      (floor.material as MeshBasicMaterial).dispose();
      grid.geometry.dispose();
      gridMaterial.dispose();
    },
  };
}
