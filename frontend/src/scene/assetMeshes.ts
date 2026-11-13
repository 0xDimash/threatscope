import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  SpriteMaterial,
  TetrahedronGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Sprite,
  type Texture,
} from 'three';
import type { Asset, AssetKind } from '../types/contract';
import { kindColor, kindLabelColor, kindStyle } from './palette';
import type { LabelFactory } from './labels';

export interface AssetNode {
  id: string;
  name: string;
  kind: AssetKind;
  group: Group;
  mesh: Mesh;
  halo: Mesh;
  label: Sprite | null;
}

export interface AssetMeshOptions {
  glowTexture: Texture;
  labels: LabelFactory;
}

export interface AssetMeshResult {
  group: Group;
  nodes: Map<string, AssetNode>;
  clickables: Mesh[];
  dispose(): void;
}

function geometryFor(kind: AssetKind): BufferGeometry {
  switch (kind) {
    case 'scada':
      return new CylinderGeometry(1.5, 1.5, 3.3, 8);
    case 'server':
      return new BoxGeometry(2.7, 2.7, 2.7);
    case 'gateway':
      return new OctahedronGeometry(2.2, 0);
    case 'district':
      return new SphereGeometry(1.15, 20, 20);
    case 'db':
      return new CylinderGeometry(1.7, 1.7, 2.2, 16);
    case 'service':
      return new BoxGeometry(2.4, 1.7, 2.4);
    case 'cctv':
      return new CylinderGeometry(0.22, 0.22, 2.8, 8);
    case 'external':
      return new TetrahedronGeometry(2.5, 0);
    default:
      return new BoxGeometry(2.4, 2.4, 2.4);
  }
}

function decorate(mesh: Mesh, kind: AssetKind, extras: Mesh[]): void {
  if (kind === 'service') {
    const canopy = new Mesh(
      new BoxGeometry(3.1, 0.22, 3.1),
      new MeshStandardMaterial({ color: 0x0b2237, roughness: 0.6, metalness: 0.3 }),
    );
    canopy.position.y = 0.95;
    mesh.add(canopy);
    extras.push(canopy);
  }
  if (kind === 'cctv') {
    const head = new Mesh(
      new ConeGeometry(0.8, 1.1, 8),
      new MeshStandardMaterial({ color: 0x0b2237, roughness: 0.5, metalness: 0.4 }),
    );
    head.position.y = 1.7;
    head.rotation.z = Math.PI / 3;
    mesh.add(head);
    extras.push(head);
  }
}

export function createAssetMeshes(
  assets: readonly Asset[],
  options: AssetMeshOptions,
): AssetMeshResult {
  const group = new Group();
  group.name = 'assets';
  const nodes = new Map<string, AssetNode>();
  const clickables: Mesh[] = [];
  const extras: Mesh[] = [];

  const geometries = new Map<AssetKind, BufferGeometry>();
  for (const kind of [
    'scada',
    'server',
    'gateway',
    'district',
    'db',
    'service',
    'cctv',
    'external',
  ] as AssetKind[]) {
    geometries.set(kind, geometryFor(kind));
  }

  for (const asset of assets) {
    const style = kindStyle(asset.kind);
    const color = kindColor(asset.kind);
    const isDistrict = asset.kind === 'district';

    const node = new Group();
    node.name = `asset-${asset.id}`;
    node.position.set(asset.position.x, asset.position.y, asset.position.z);

    const geometry = geometries.get(asset.kind) ?? geometryFor(asset.kind);
    const material = new MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(style.emissive),
      metalness: style.metalness,
      roughness: style.roughness,
      envMapIntensity: 0.75,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `asset-mesh-${asset.id}`;
    mesh.userData.assetId = asset.id;
    decorate(mesh, asset.kind, extras);
    node.add(mesh);
    clickables.push(mesh);

    // glow sprite removed for cleaner high-contrast look
    const haloRadius = isDistrict ? 2.5 : 4.1;
    const halo = new Mesh(
      new TorusGeometry(haloRadius, isDistrict ? 0.04 : 0.055, 8, 48),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.26 }),
    );
    halo.name = `asset-halo-${asset.id}`;
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -3.0;
    node.add(halo);

    // shield shell not added (removed for cleaner high-contrast look)

    const labelText = isDistrict ? asset.name.toUpperCase() : asset.name;
    const label = options.labels.create(
      labelText,
      kindLabelColor(asset.kind),
      isDistrict ? 10 : 14,
      isDistrict ? 1.9 : 2.6,
    );
    if (label) {
      label.name = `asset-label-${asset.id}`;
      label.position.set(0, isDistrict ? 3.2 : 5.4, 0);
      node.add(label);
    }

    group.add(node);
    nodes.set(asset.id, {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      group: node,
      mesh,
      halo,
      label,
    });
  }

  return {
    group,
    nodes,
    clickables,
    dispose(): void {
      for (const node of nodes.values()) {
        const material = node.mesh.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material.dispose();
        }
        node.halo.geometry.dispose();
        (node.halo.material as MeshBasicMaterial).dispose();
        if (node.label) {
          (node.label.material as SpriteMaterial).dispose();
        }
      }
      for (const extra of extras) {
        extra.geometry.dispose();
        const material = extra.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material.dispose();
        }
      }
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
