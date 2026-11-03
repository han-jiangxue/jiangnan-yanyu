// Cloth in the wind: shop banners (幌子) hung from poles out of the shop fronts, each with its trade in one large
// character, and laundry on bamboo poles out of upper windows over the water. The cloth hangs in the plane of its
// pole, so it shows its face to anyone looking along the lane or the canal, and the wind works it in the vertex
// shader, freest at the hem and at the pole's outer end.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { patch } from '../core/shared.js';
import { rng } from '../lib/math.js';
import { CORRIDOR, coreFirst } from './layout.js';
import { floorsOf } from './house.js';

const TRADES = ['酒', '茶', '米', '布', '药', '当', '面', '油'];
const BANNER_BG = [['#e9e2d0', '#1a1a1a'], ['#26324a', '#efe8d8'], ['#e9e2d0', '#8e1b14'], ['#7c1d16', '#f2e6cf']];
const LAUNDRY = ['#2b3a5c', '#d9d4c8', '#8a3a30', '#5d6a6e', '#3e5a48', '#c7b48a'];

// atlas: eight banners (128 x 384) along the top, four garment shapes (256 x 256) below
function clothAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 640;
  const g = c.getContext('2d');
  const R = rng(64);
  g.clearRect(0, 0, 1024, 640);
  TRADES.forEach((ch, i) => {
    const x = i * 128;
    const [bg, fg] = BANNER_BG[i % BANNER_BG.length];
    g.fillStyle = bg;
    g.fillRect(x + 4, 0, 120, 368);
    // the tails of a banner's hem
    g.beginPath(); g.moveTo(x + 4, 368); g.lineTo(x + 34, 384); g.lineTo(x + 64, 368); g.lineTo(x + 94, 384); g.lineTo(x + 124, 368); g.fill();
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.strokeRect(x + 12, 8, 104, 352);
    g.fillStyle = fg;
    g.font = 'bold 92px "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, x + 64, 190);
    // weathering
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(0,0,0,${R.range(0.02, 0.06)})`;
      g.fillRect(x + 4 + R.next() * 120, R.next() * 360, R.range(4, 20), R.range(10, 60));
    }
  });
  const shapes = [
    // a jacket
    (x, y, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x + 40, y + 10); g.lineTo(x + 216, y + 10); g.lineTo(x + 246, y + 90); g.lineTo(x + 196, y + 96); g.lineTo(x + 190, y + 246); g.lineTo(x + 66, y + 246); g.lineTo(x + 60, y + 96); g.lineTo(x + 10, y + 90); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 128, y + 12); g.lineTo(x + 128, y + 246); g.stroke(); },
    // trousers
    (x, y, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x + 50, y + 10); g.lineTo(x + 206, y + 10); g.lineTo(x + 220, y + 246); g.lineTo(x + 146, y + 246); g.lineTo(x + 128, y + 90); g.lineTo(x + 110, y + 246); g.lineTo(x + 36, y + 246); g.closePath(); g.fill(); },
    // a square cloth
    (x, y, col) => { g.fillStyle = col; g.fillRect(x + 20, y + 10, 216, 200); g.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 6; k++) g.fillRect(x + 20, y + 20 + k * 32, 216, 6); },
    // a long strip
    (x, y, col) => { g.fillStyle = col; g.fillRect(x + 88, y + 10, 80, 240); },
  ];
  shapes.forEach((f, i) => f(i * 256, 384, LAUNDRY[i % LAUNDRY.length]));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const atlasUv = {
  banner: (i) => [(i * 128 + 4) / 1024, 1 - 384 / 640, (i * 128 + 124) / 1024, 1],
  garment: (i) => [(i * 256) / 1024, 0, (i * 256 + 256) / 1024, 1 - 384 / 640],
};

export function createCloth(mats, lots) {
  const R = rng(73);
  const pos = [], nrm = [], uv = [], ac = [], idx = [];
  const kit = new Kit();
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3(), nW = new THREE.Vector3();
  let banners = 0, garments = 0;
  const samples = {};
  // a hanging cloth from top corners a -> b (house-local), drop h, uv rect [u0, v0, u1, v1]
  const hang = (a, b, h, rect, phase) => {
    const n = 6;
    const base = pos.length / 3;
    nW.set(b.z - a.z, 0, -(b.x - a.x)).normalize().transformDirection(m4);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const s = i / n, d = j / n;
      v.set(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s - d * h, a.z + (b.z - a.z) * s).applyMatrix4(m4);
      pos.push(v.x, v.y, v.z);
      nrm.push(nW.x, nW.y, nW.z);
      uv.push(rect[0] + (rect[2] - rect[0]) * s, rect[3] - (rect[3] - rect[1]) * d);
      ac.push(d, phase, s, 0);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const p = base + j * (n + 1) + i;
      idx.push(p, p + n + 1, p + 1, p + 1, p + n + 1, p + n + 2);
    }
  };
  for (const lot of coreFirst(lots)) {
    const { spec, pos: p, heights } = lot;
    if (spec.row !== 0 || spec.lod !== 0 || !p || !heights) continue;
    m4.makeRotationY(p.rot).setPosition(p.x, p.y, p.z);
    kit.at(p.x, p.y, p.z, p.rot);
    const zf = spec.D / 2;
    const inCorridor = spec.side === CORRIDOR.side && lot.zc < CORRIDOR.z0 + 3 && lot.zc > CORRIDOR.z1 - 3;
    if (spec.face === 'shop' && !inCorridor && R.next() < 0.6) {
      // a banner on a bracket out of the upper floor at one end of the front, hung from a crossbar so it faces the
      // water, where the boats pass
      const x = R.sign() * (spec.W / 2 - 0.55);
      const y = spec.floors === 2 ? floorsOf(spec).g1 + 1.6 : heights.eaveH - 0.45;
      const zb = zf + 0.75;
      kit.tube('timber', [new THREE.Vector3(x, y, zf - 0.05), new THREE.Vector3(x, y + 0.04, zb)], [0.022, 0.018], 5, { col: [0.7, 0.6, 0.42] });
      kit.tube('timber', [new THREE.Vector3(x - 0.33, y + 0.04, zb), new THREE.Vector3(x + 0.33, y + 0.04, zb)], [0.014, 0.014], 5, { col: [0.7, 0.6, 0.42] });
      hang(new THREE.Vector3(x - 0.28, y + 0.03, zb), new THREE.Vector3(x + 0.28, y + 0.03, zb), 1.6, atlasUv.banner(Math.floor(R.next() * TRADES.length)), R.next());
      if (!samples.banner || Math.abs(lot.zc + 20) < Math.abs(samples.banner.zc + 20)) samples.banner = { zc: lot.zc, at: new THREE.Vector3(x, y - 0.6, zb).applyMatrix4(m4).toArray().map((v) => +v.toFixed(2)), facing: [Math.sin(p.rot), Math.cos(p.rot)] };
      banners++;
    }
    if (spec.face === 'water' && spec.floors === 2 && spec.bankGap < 1 && R.next() < 0.28) {
      // a laundry pole out over the water from an upper window, rising a little
      const x = R.range(-spec.W / 2 + 0.8, spec.W / 2 - 0.8);
      const y = floorsOf(spec).g1 + 1.95;
      const a = new THREE.Vector3(x, y, zf - 0.1), b = new THREE.Vector3(x + R.range(-0.3, 0.3), y + 0.25, zf + 2.3);
      kit.tube('timber', [a, b], [0.024, 0.018], 5, { col: [0.72, 0.62, 0.42] });
      if (!samples.laundry || Math.abs(lot.zc + 30) < Math.abs(samples.laundry.zc + 30)) samples.laundry = { zc: lot.zc, at: a.clone().lerp(b, 0.6).applyMatrix4(m4).toArray().map((v) => +v.toFixed(2)), facing: [Math.sin(p.rot), Math.cos(p.rot)] };
      const nG = 2 + Math.floor(R.next() * 3);
      for (let k = 0; k < nG; k++) {
        const t0 = 0.3 + (k / nG) * 0.62, t1 = t0 + 0.5 / 2.4;
        const A = a.clone().lerp(b, t0), B = a.clone().lerp(b, Math.min(0.98, t1));
        const shape = Math.floor(R.next() * 4);
        hang(A, B, shape === 3 ? 1.0 : 0.62, atlasUv.garment(shape), R.next());
        garments++;
      }
    }
  }
  const group = kit.build(mats, 'cloth-poles');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCloth', new THREE.Float32BufferAttribute(ac, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = patch(new THREE.MeshStandardMaterial({ map: clothAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }), {
    key: 'cloth',
    wet: 0.6,
    gloss: 0.2,
    vertexHead: `attribute vec4 aCloth;`,
    hooks: {
      vertex: /* glsl */ `
        {
          // freest at the hem and at the pole's outer end; a flap across the cloth and a lean downwind
          float d = aCloth.x;
          float k = d * (0.55 + 0.45 * aCloth.z);
          float w = uWind.z;
          float flap = sin(uTime * (2.0 + w * 2.2) + aCloth.y * 6.283 + d * 2.6) * 0.55 + sin(uTime * 3.9 + aCloth.y * 11.0 + d * 4.4 + aCloth.z * 3.0) * 0.22;
          transformed += objectNormal * flap * k * (0.03 + 0.18 * w);
          vec2 wd = normalize(uWind.xy + 1e-4);
          transformed += vec3(wd.x, 0.0, wd.y) * k * k * 0.18 * w;
        }`,
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'cloth';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.stats = { banners, garments };
  group.userData.samples = samples;
  return group;
}
