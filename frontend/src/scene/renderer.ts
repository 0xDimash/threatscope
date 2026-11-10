import * as THREE from 'three';

export interface App {
  start(): void;
  stop(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): App {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050912');

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 20, 32);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight('#8fc4ff', '#0a1020', 0.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(12, 24, 8);
  scene.add(sun);

  const grid = new THREE.GridHelper(60, 30, '#1d3b5c', '#102338');
  grid.material.opacity = 0.5;
  grid.material.transparent = true;
  scene.add(grid);

  let raf = 0;
  const onResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    start() {
      const loop = (): void => {
        raf = requestAnimationFrame(loop);
        renderer.render(scene, camera);
      };
      loop();
    },
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
