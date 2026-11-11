import type { Asset, Link } from '../types/contract';

export interface Inventory {
  assets: Asset[];
  links: Link[];
}

export interface SceneOptions {
  assets: readonly Asset[];
  links?: readonly Link[];
  bloom?: boolean;
  labels?: boolean;
  pixelRatio?: number;
}

export interface SceneStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  assets: number;
  labelCount: number;
}

export interface CityScene {
  readonly assetIds: string[];
  start(): void;
  stop(): void;
  dispose(): void;
  resize(): void;
  resetView(): void;
  getStats(): SceneStats;
  pick(clientX: number, clientY: number): string | null;
  focusAsset(id: string, distance?: number): void;
}
