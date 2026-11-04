// Far hills in layers (远山): rings of ridges around the town, all one dark ink, left to the wet air to grade from near
// to far the way an ink painting lightens its farther ranges. A pagoda stands on the nearest ridge down the canal.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U, UNIFORMS_GLSL, NOISE, ATMOS } from '../core/shared.js';
import { ridged } from '../lib/math.js';

const CENTRE = { x: 0, z: -140 };
const RINGS = [
  { r: 430, base: 14, amp: 50, freq: 6.0, seed: 11 },
  { r: 650, base: 32, amp: 80, freq: 4.4, seed: 23 },
  { r: 960, base: 58, amp: 120, freq: 3.3, seed: 37 },
  { r: 1450, base: 90, amp: 170, freq: 2.5, seed: 53 },
];
// where the pagoda should stand: a little left of the canal's line, seen over the roofs at the far end (and where
// the temple bell is heard from)
export const PAGODA_AIM = { x: -42, z: -570 };
const PAGODA_TH = Math.atan2(PAGODA_AIM.z - CENTRE.z, PAGODA_AIM.x - CENTRE.x);

function ridgeHeight(ring, i, th) {
  const u = Math.cos(th) * ring.freq + ring.seed, v = Math.sin(th) * ring.freq - ring.seed;
  let h = ring.base + ring.amp * ridged(u, v, 5);
  // the pagoda's hill rises a little above its neighbours
  if (i === 0) {
    let d = th - PAGODA_TH;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    h += 26 * Math.exp(-((d / 0.07) ** 2));
  }
  return h;
}

function pagoda() {
  const parts = [];
  const add = (g, y) => { g.translate(0, y, 0); parts.push(g.toNonIndexed()); };
  let y = 0;
  add(new THREE.CylinderGeometry(6.5, 7.6, 2.6, 8), 1.3);
  y = 2.6;
  for (let i = 0; i < 7; i++) {
    const r = 5.0 * Math.pow(0.88, i), h = 4.0 * Math.pow(0.95, i);
    add(new THREE.CylinderGeometry(r, r, h, 8), y + h / 2);
    y += h;
    add(new THREE.CylinderGeometry(r * 0.8, r + 1.9, 0.9, 8), y + 0.45);
    y += 0.9;
  }
  add(new THREE.ConeGeometry(0.9, 7, 8), y + 3.5);
  return mergeGeometries(parts);
}

export function createHills() {
  const pos = [];
  const N = 480;
  RINGS.forEach((ring, i) => {
    for (let k = 0; k < N; k++) {
      const t0 = (k / N) * Math.PI * 2, t1 = ((k + 1) / N) * Math.PI * 2;
      const p = (th, y) => [CENTRE.x + Math.cos(th) * ring.r, y, CENTRE.z + Math.sin(th) * ring.r];
      const h0 = ridgeHeight(ring, i, t0), h1 = ridgeHeight(ring, i, t1);
      const a = p(t0, -40), b = p(t1, -40), c = p(t1, h1), d = p(t0, h0);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // the pagoda on its hill
  const r0 = RINGS[0];
  const px = CENTRE.x + Math.cos(PAGODA_TH) * r0.r, pz = CENTRE.z + Math.sin(PAGODA_TH) * r0.r;
  const pg = pagoda();
  pg.translate(px, ridgeHeight(r0, 0, PAGODA_TH) - 4, pz);
  pg.deleteAttribute('uv');
  const geo = mergeGeometries([g, pg]);

  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vWP;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      varying vec3 vWP;
      void main(){
        // ink, a little uneven, as a brush leaves it
        vec3 col = vec3(0.04, 0.047, 0.045) * (0.85 + 0.3 * sfNoise(vWP.xz * 0.012 + vWP.y * 0.02));
        gl_FragColor = vec4(sfAtmos(col, vWP), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'hills';
  return mesh;
}
