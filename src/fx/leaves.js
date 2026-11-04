// Falling leaves in autumn: each leaf belongs to one of the eight tree crowns nearest the camera, lets go somewhere in
// it, tumbles down fluttering and carried by the wind, and lands: on the canal it floats off with the current (and
// joins the leaves the water draws, world/water.js), on the stones it lies a while; then it fades and starts again
// from its crown. More of them fall in a wind, faster and straighter in the rain; a maple sheds more, and red. All
// motion runs in the vertex shader; the CPU only hands over the crowns.
// (Sakura Fantasy's leaves circle the camera for good; here they come from the trees and come to rest.)
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, MAX_LAMPS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { BANK_Y, Z0, Z1 } from '../world/layout.js';
import { rng } from '../lib/math.js';

const SLOTS = 8;
const FAR = 50; // a crown farther than this gives up its slot to a nearer one

// crowns: [{ x, y, z, r, kind: 0 willow, 1 maple }]; tCanal: the canal's centre-line lookup (world/water.js)
export function createLeaves(count, crowns, tCanal) {
  const R = rng(17);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = R.next();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;

  const uniforms = {
    ...U,
    uCrowns: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uCount: { value: count },
    tCanal: { value: tCanal },
    uZRange: { value: new THREE.Vector2(Z0, Z1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      attribute vec4 aSeed;
      uniform vec4 uCrowns[${SLOTS}];
      uniform float uCount;
      uniform sampler2D tCanal;
      uniform vec2 uZRange;
      varying vec2 vQ; varying vec3 vWP, vCol; varying float vAlpha, vKind, vUp;
      const float GROUND = ${BANK_Y.toFixed(2)};
      float ground(vec2 xz){
        vec4 cv = texture2D(tCanal, vec2(clamp((uZRange.x - xz.y) / (uZRange.x - uZRange.y), 0.0, 1.0), 0.5));
        return abs(xz.x - cv.x) < cv.y ? 0.012 : GROUND + 0.012;
      }
      mat3 rotAxis(vec3 a, float t){
        float c = cos(t), s = sin(t), k = 1.0 - c;
        return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
                    a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
                    a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
      }
      void main(){
        int slot = gl_InstanceID - (gl_InstanceID / ${SLOTS}) * ${SLOTS};
        vec4 cr = uCrowns[slot];
        float maple = cr.w < 0.0 ? 1.0 : 0.0;
        float rad = abs(cr.w);
        // the share falling now: more in a wind or the rain, more off a maple
        float rate = uSeason.z * clamp(0.4 + 0.6 * uWind.z + 0.3 * uRain, 0.0, 1.0) * (1.0 + 0.5 * maple);
        if (rad < 0.01 || float(gl_InstanceID) / uCount > rate) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        // its own round: lets go, falls, rests, fades; each round from a new place in the crown
        float T = 9.0 + 6.0 * aSeed.w;
        float tt = uTime + aSeed.x * T;
        float n = floor(tt / T), t = tt - n * T;
        float r1 = sfHash12(vec2(n, aSeed.y * 97.0)), r2 = sfHash12(vec2(n + 7.1, aSeed.z * 89.0));
        float r3 = sfHash12(vec2(n + 3.3, aSeed.y * 53.0)), r4 = sfHash12(vec2(n + 5.9, aSeed.z * 61.0));
        float a0 = r1 * 6.2832, d0 = sqrt(r2) * rad * 0.85;
        // a willow's leaves hang on its strands, well below the crown; a maple's are in it
        vec3 p0 = cr.xyz + vec3(cos(a0) * d0, rad * mix(0.2 - 1.3 * r3, 0.45 - 0.9 * r3, maple), sin(a0) * d0);
        float v = (0.5 + 0.35 * r4) * (1.0 + 0.7 * uRain);
        float fl = 1.0 - 0.6 * uRain;
        vec3 drift = vec3(uWind.x, 0.0, uWind.y) * (0.15 + 1.4 * uWind.z) * (0.6 + 0.8 * r1);
        float ph = r2 * 31.0;
        // where it lands, and when: first as if over the water, then again for the stones if it comes down on them
        float tf = max(p0.y - 0.012, 0.0) / v;
        vec2 land = p0.xz + drift.xz * tf;
        float gy = ground(land);
        tf = max(p0.y - gy, 0.0) / v;
        land = p0.xz + drift.xz * tf;
        float onWater = gy < 0.1 ? 1.0 : 0.0;
        vec3 p, eu, ev;
        if (t < tf) {
          // falling: side to side and round as it comes down, tumbling about an axis of its own
          p = vec3(p0.x, p0.y - v * t, p0.z) + drift * t;
          p.x += sin(t * 1.7 + ph) * 0.32 * fl;
          p.z += cos(t * 1.3 + ph) * 0.24 * fl;
          vec3 ax = normalize(vec3(r3 - 0.5, 0.35 + r4, r1 - 0.5));
          mat3 Rm = rotAxis(ax, t * (2.0 + 3.0 * r4) + ph);
          eu = Rm * vec3(1.0, 0.0, 0.0);
          ev = Rm * vec3(0.0, 0.2, 1.0);
          vUp = abs(normalize(cross(eu, ev)).y);
        } else {
          // at rest: flat, and on the water carried off and turning slowly
          float ts = t - tf;
          p = vec3(land.x, gy, land.y - onWater * 0.12 * ts);
          float ang = ph + onWater * ts * 0.15 * (r4 - 0.5);
          eu = vec3(cos(ang), 0.0, sin(ang));
          ev = vec3(-sin(ang), 0.0, cos(ang));
          vUp = 1.0;
        }
        ev = normalize(ev - eu * dot(ev, eu));
        // a maple's own leaf, or off a willow its narrow leaf or (more often, and easier to see) a broad one blown in
        float kind = maple > 0.5 ? 2.0 : step(0.4, fract(r2 * 7.3));
        float size = kind > 1.5 ? 0.06 + 0.03 * r4 : kind > 0.5 ? 0.055 + 0.03 * r4 : 0.05 + 0.025 * r4;
        vec3 wp = p + (eu * position.x + ev * position.y * (kind > 1.5 ? 1.0 : kind > 0.5 ? 0.7 : 0.35)) * size;
        // in at the start of its round, out at the end, gone far off and at the lens
        float dc = distance(wp, cameraPosition);
        vAlpha = smoothstep(0.0, 0.8, t) * (1.0 - smoothstep(T - 2.0, T, t)) * smoothstep(${FAR.toFixed(1)} - 5.0, 28.0, dc) * smoothstep(0.4, 1.2, dc);
        vQ = position.xy;
        vKind = kind;
        // a maple's red to orange, the others gold to rust
        vCol = maple > 0.5 ? mix(vec3(0.5, 0.05, 0.02), vec3(0.62, 0.22, 0.03), r3) : mix(vec3(0.52, 0.32, 0.03), vec3(0.32, 0.13, 0.03), r3 * r3);
        vWP = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      varying vec2 vQ; varying vec3 vWP, vCol; varying float vAlpha, vKind, vUp;
      void main(){
        float sd;
        float t = clamp(vQ.x, -1.0, 1.0);
        if (vKind > 1.5) {
          float th = atan(vQ.y, vQ.x);
          sd = length(vQ) - (0.45 + 0.55 * pow(abs(cos(th * 2.5)), 0.7));
        } else if (vKind > 0.5) {
          sd = max(abs(vQ.y) - 0.95 * pow(max(1.0 - t * t, 0.0), 0.7), abs(vQ.x) - 1.0);
        } else {
          sd = max(abs(vQ.y) - 0.8 * (1.0 - t * t), abs(vQ.x) - 1.0);
        }
        float a = clamp(0.5 - sd / max(fwidth(sd), 1e-4), 0.0, 1.0) * vAlpha;
        if (a < 0.01) discard;
        // lit by the sky, the sun (more when it lies flat to it) and the lanterns nearby
        vec3 col = vCol * (1.0 - 0.3 * uWet) * (uAmbUp * 0.85 + uSkyHor * 0.15 + uSunCol * max(uSunDir.y, 0.0) * (0.15 + 0.3 * vUp));
        for (int i = 0; i < ${MAX_LAMPS}; i++){
          vec4 lp = uLampPos[i];
          float d = distance(lp.xyz, vWP);
          col += vCol * uLampCol[i] * 1.2 / (1.0 + 3.0 * d * d / (lp.w * lp.w));
        }
        col *= 1.0 - 0.25 * smoothstep(0.08, 0.0, abs(vQ.y)) * step(vKind, 1.5);
        gl_FragColor = vec4(sfAtmos(col, vWP), a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 10;
  mesh.name = 'leaves';

  // the slots: which crown each feeds; a crown keeps its slot until it is far behind, so no leaf jumps mid-air
  const slots = new Array(SLOTS).fill(-1);
  const dist = new Float32Array(crowns.length);
  const order = crowns.map((c, i) => i);
  let wait = 0;
  return {
    mesh,
    update(camera) {
      if (--wait > 0) return;
      wait = 15;
      const c = camera.position;
      crowns.forEach((k, i) => { dist[i] = Math.hypot(k.x - c.x, k.z - c.z); });
      order.sort((a, b) => dist[a] - dist[b]);
      for (const i of order) {
        if (dist[i] > FAR - 5 || slots.includes(i)) continue;
        // a free slot, or the one with the farthest crown if that is out of reach
        let s = slots.indexOf(-1);
        if (s < 0) {
          let far = -1;
          slots.forEach((k, j) => { if (dist[k] > FAR && (far < 0 || dist[k] > dist[slots[far]])) far = j; });
          s = far;
        }
        if (s < 0) break;
        slots[s] = i;
      }
      slots.forEach((k, j) => {
        const v = uniforms.uCrowns.value[j];
        if (k < 0) v.set(0, -999, 0, 0);
        else { const t = crowns[k]; v.set(t.x, t.y, t.z, t.kind === 1 ? -t.r : t.r); }
      });
    },
  };
}
