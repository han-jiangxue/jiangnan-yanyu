// A downpour's splashes (白雨跳珠乱入船): where each heavy drop strikes the canal or the stones, a little crown of
// water flicks up and a few beads leap and fall back; none under the eaves, the corridor or the bridge. Some of them
// land on your own boat's awnings. Only in hard rain, and more and bigger in summer's showers. Each splash is a group
// of five instances (the crown, then four beads) with its own short round, struck somewhere new each round within a
// few metres of the camera (or on the awnings, carried with the boat); all motion runs in the vertex shader.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, OCC, MAX_LAMPS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { BANK_Y, Z0, Z1 } from '../world/layout.js';

const GROUP = 5;
const ON_BOAT = 0.15; // the share of splashes on the awnings, while there is a boat to land on
const MAX_AWN = 48;

// tCanal: the canal's centre-line lookup (world/water.js); awning: up to 48 points on top of the awnings in the boat's
// frame (world/boat.js awningSplashPoints)
export function createSplash(count, tCanal, awning = []) {
  const groups = Math.floor(count / GROUP);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = groups * GROUP;
  const awn = Array.from({ length: MAX_AWN }, (_, i) => new THREE.Vector3(...(awning[i % Math.max(1, awning.length)] || [0, -99, 0])));
  const uniforms = {
    ...U,
    uCam: { value: new THREE.Vector3() },
    uGroups: { value: groups },
    tCanal: { value: tCanal },
    uZRange: { value: new THREE.Vector2(Z0, Z1) },
    uAwn: { value: awn },
    uAwnN: { value: Math.min(awning.length, MAX_AWN) },
    uBoat: { value: new THREE.Matrix4() },
    uBoatOn: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${OCC}
      uniform vec3 uCam, uAwn[${MAX_AWN}];
      uniform float uGroups, uAwnN, uBoatOn;
      uniform sampler2D tCanal;
      uniform vec2 uZRange;
      uniform mat4 uBoat;
      varying vec2 vQ; varying vec3 vWP; varying float vAlpha, vCrown;
      void main(){
        int g = gl_InstanceID / ${GROUP}, sub = gl_InstanceID - g * ${GROUP};
        float gf = float(g);
        // how many splash now: none until the rain is hard; summer's drops are big and many
        float hard = smoothstep(0.45, 0.95, uRain) * (0.55 + 0.45 * uSeason.y);
        if (gf / uGroups > hard) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float big = 1.0 + 0.4 * uSeason.y;
        // its round, and where it strikes this round
        float T = 0.45 + 0.35 * sfHash12(vec2(gf, 1.7));
        float tt = uTime + sfHash12(vec2(gf, 2.9)) * T;
        float n = floor(tt / T), t = tt - n * T;
        float h1 = sfHash12(vec2(n, gf + 0.31)), h2 = sfHash12(vec2(n + 4.7, gf)), h3 = sfHash12(vec2(n + 9.1, gf * 1.3));
        vec3 p;
        if (gf / uGroups < ${ON_BOAT} * uBoatOn && uAwnN > 0.5) {
          p = (uBoat * vec4(uAwn[int(min(h1 * uAwnN, uAwnN - 1.0))], 1.0)).xyz + vec3(0.0, 0.01, 0.0);
        } else {
          // within ten metres or so, more of them near
          float a = h1 * 6.2832, r = 0.8 + 9.5 * pow(h2, 0.8);
          p = vec3(uCam.x + cos(a) * r, 0.0, uCam.z + sin(a) * r);
          vec4 cv = texture2D(tCanal, vec2(clamp((uZRange.x - p.z) / (uZRange.x - uZRange.y), 0.0, 1.0), 0.5));
          p.y = abs(p.x - cv.x) < cv.y ? 0.0 : ${BANK_Y.toFixed(2)};
          // nothing strikes under a roof (or a tree: the map from above cannot tell them apart)
          if (sfOccHeight(p.xz) > p.y + 0.25) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        }
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp;
        if (sub == 0) {
          // the crown: a cup of water thrown up and spreading for a moment, its rim catching the light
          float k = t / 0.14;
          if (k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float w = (0.02 + 0.045 * k) * big, ht = (0.018 + 0.03 * sqrt(k)) * big;
          wp = p + cr * position.x * w + vec3(0.0, (position.y * 0.5 + 0.5) * ht, 0.0);
          vAlpha = 0.55 * (1.0 - k);
          vCrown = 1.0;
        } else {
          // a bead: up and out, and back down
          float hs = sfHash12(vec2(n + float(sub) * 3.1, gf * 0.7));
          float v0 = (0.8 + 0.8 * hs) * big, ang = (h3 + float(sub) * 0.25) * 6.2832, vh = 0.15 + 0.45 * fract(hs * 7.3);
          float tb = t - 0.01, tEnd = 2.0 * v0 / 9.8;
          if (tb < 0.0 || tb > tEnd) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec3 c = p + vec3(cos(ang) * vh * tb, v0 * tb - 4.9 * tb * tb, sin(ang) * vh * tb);
          float r = (0.004 + 0.003 * hs) * big;
          wp = c + (cr * position.x + cu * position.y) * r;
          vAlpha = 0.85 * (1.0 - smoothstep(0.7, 1.0, tb / tEnd));
          vCrown = 0.0;
        }
        float dc = distance(wp, cameraPosition);
        vAlpha *= smoothstep(0.5, 1.2, dc) * smoothstep(12.0, 8.0, dc);
        vQ = position.xy;
        vWP = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      varying vec2 vQ; varying vec3 vWP; varying float vAlpha, vCrown;
      void main(){
        float a;
        if (vCrown > 0.5) {
          // the crown seen from the side: the rim of a cup, open at the top, ragged
          vec2 q = vec2(vQ.x, vQ.y * 0.5 + 0.5);
          float rim = abs(length(vec2(q.x, (q.y - 1.0) * 1.6)) - 1.0);
          a = smoothstep(0.35, 0.0, rim) * step(0.0, q.y) * (0.6 + 0.4 * sfNoise(vec2(atan(q.y - 1.0, q.x) * 6.0, 0.0)));
        } else {
          a = smoothstep(1.0, 0.3, length(vQ));
        }
        a *= vAlpha;
        if (a < 0.01) discard;
        vec3 col = uSkyHor * 1.1 + uAmbUp * 0.6 + uFlash * 1.5 + 0.015;
        for (int i = 0; i < ${MAX_LAMPS}; i++){
          vec4 lp = uLampPos[i];
          float d = distance(lp.xyz, vWP);
          col += uLampCol[i] * 0.8 / (1.0 + d * d * 0.5) * step(d, lp.w * 3.0);
        }
        gl_FragColor = vec4(sfAtmos(col, vWP), a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 11;
  mesh.name = 'splash';
  return {
    mesh,
    // boat: the object whose awnings the drops land on (your boat), or null
    update(camera, boat) {
      uniforms.uCam.value.copy(camera.position);
      uniforms.uBoatOn.value = boat ? 1 : 0;
      if (boat) uniforms.uBoat.value.copy(boat.matrixWorld);
    },
  };
}
