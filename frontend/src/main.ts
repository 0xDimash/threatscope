import './styles/scene.css';
import inventory from '../../data/assets.json';
import { createCityScene } from './scene';
import { parseInventory } from './scene/inventory';
import type { CityScene } from './scene/types';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('#scene canvas missing');

const { assets, links } = parseInventory(inventory);
const bloom = !/[?&]nobloom/.test(window.location.search);

const scene = createCityScene(canvas, { assets, links, bloom });
scene.start();

(window as Window & { __threatscope?: CityScene }).__threatscope = scene;
