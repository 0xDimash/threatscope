import { AmbientLight, DirectionalLight, Group, PointLight } from 'three';

export interface LightRig {
  group: Group;
  key: DirectionalLight;
  fill: PointLight;
  rim: PointLight;
  dispose(): void;
}

export function createLights(): LightRig {
  const group = new Group();
  group.name = 'lights';

  const ambient = new AmbientLight(0x1c2b45, 1.0);
  const key = new DirectionalLight(0xbcd8ff, 1.15);
  key.position.set(30, 60, 40);
  const fill = new PointLight(0x1f6feb, 2.4, 160);
  fill.position.set(-45, 18, -30);
  const rim = new PointLight(0xe74c3c, 1.1, 130);
  rim.position.set(45, -8, 25);

  group.add(ambient, key, fill, rim);

  return {
    group,
    key,
    fill,
    rim,
    dispose(): void {
      ambient.dispose();
      key.dispose();
      fill.dispose();
      rim.dispose();
    },
  };
}
