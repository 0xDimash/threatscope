import { AmbientLight, DirectionalLight, Group } from 'three';

export interface LightRig {
  group: Group;
  key: DirectionalLight;
  dispose(): void;
}

export function createLights(): LightRig {
  const group = new Group();
  group.name = 'lights';

  const ambient = new AmbientLight(0xffffff, 0.55);
  const key = new DirectionalLight(0xffffff, 1.9);
  key.position.set(40, 70, 50);

  group.add(ambient, key);

  return {
    group,
    key,
    dispose(): void {
      ambient.dispose();
      key.dispose();
    },
  };
}
