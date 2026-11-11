import { Sprite, SpriteMaterial, type Texture } from 'three';
import { createLabelTexture } from './textures';

export class LabelFactory {
  private readonly cache = new Map<string, Texture>();

  constructor(private readonly enabled: boolean) {}

  create(text: string, color: string, width: number, height: number): Sprite | null {
    if (!this.enabled) {
      return null;
    }
    const key = `${text}|${color}`;
    let texture = this.cache.get(key);
    if (!texture) {
      texture = createLabelTexture(text, color);
      this.cache.set(key, texture);
    }
    const sprite = new Sprite(
      new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    sprite.scale.set(width, height, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  dispose(): void {
    this.cache.forEach((texture) => texture.dispose());
    this.cache.clear();
  }
}
