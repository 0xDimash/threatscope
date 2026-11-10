import { createRenderer } from './scene/renderer';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('#scene canvas missing');

const app = createRenderer(canvas);
app.start();
