export const SHIELD_VERTEX_SHADER = [
  'varying vec3 vNormal;',
  'varying vec3 vView;',
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = uv;',
  '  vNormal = normalize(normalMatrix * normal);',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vView = normalize(-mv.xyz);',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

export const SHIELD_FRAGMENT_SHADER = [
  'uniform float uTime;',
  'uniform vec3 uColor;',
  'uniform float uThreat;',
  'varying vec3 vNormal;',
  'varying vec3 vView;',
  'varying vec2 vUv;',
  'void main() {',
  '  float fres = pow(1.0 - abs(dot(vNormal, vView)), 2.6);',
  '  float scan = 0.5 + 0.5 * sin(vUv.y * 60.0 - uTime * 3.0);',
  '  vec3 col = mix(uColor, vec3(1.0, 0.25, 0.18), uThreat);',
  '  float a = fres * (0.10 + scan * 0.07 + uThreat * 0.30);',
  '  gl_FragColor = vec4(col * (1.0 + uThreat), a);',
  '}',
].join('\n');
