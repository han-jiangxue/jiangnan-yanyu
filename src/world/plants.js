// Small green things: tufts of grass at the foot of walls and along the coping, ferns from the joints of the
// embankments just above the water, lotus pads floating near the banks at the canal's ends, and banana plants by a
// few walls on the lanes (雨打芭蕉). All of them sway a little in the wind.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { patch, WIND_GLSL } from '../core/shared.js';
import { LAYER_NOREFL } from '../core/pipeline.js';
import { rng } from '../lib/math.js';
import { bankX, bankNormal, bankKind, coreDist, BANK_Y, Z0, Z1, BRIDGE_Z, CORRIDOR, coreFirst } from './layout.js';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// blades of grass from a common root, curving out; drawn bottom (root) to top
function grassTexture(R) {
  return canvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x0 = w / 2 + R.range(-30, 30), lean = R.range(-90, 90), tall = R.range(0.45, 0.98) * h;
      const l = R.range(-14, 14);
      g.strokeStyle = `rgb(${88 + l}, ${120 + l}, ${52 + l * 0.5})`;
      g.lineWidth = R.range(2.5, 5);
      g.beginPath();
      g.moveTo(x0, h);
      g.quadraticCurveTo(x0 + lean * 0.2, h - tall * 0.6, x0 + lean, h - tall);
      g.stroke();
    }
  });
}

function leafTexture(R, kind) {
  if (kind === 'lotus') {
    return canvas(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      g.fillStyle = 'rgb(66, 104, 52)';
      g.beginPath(); g.arc(cx, cy, 124, 0.12, Math.PI * 2 - 0.12); g.lineTo(cx, cy); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(160, 190, 120, 0.45)';
      g.lineWidth = 2;
      for (let a = 0.3; a < Math.PI * 2 - 0.2; a += 0.38) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120); g.stroke(); }
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, 40);
      grd.addColorStop(0, 'rgba(190, 210, 150, 0.7)'); grd.addColorStop(1, 'rgba(190, 210, 150, 0)');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
    });
  }
  // a banana leaf, long, the midrib down the middle and fine veins out to the ragged, split edge
  return canvas(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgb(70, 112, 48)';
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.bezierCurveTo(w * 1.05, h * 0.2, w * 1.0, h * 0.8, w / 2, h);
    g.bezierCurveTo(0, h * 0.8, -w * 0.05, h * 0.2, w / 2, 0);
    g.fill();
    g.strokeStyle = 'rgba(170, 200, 120, 0.5)';
    g.lineWidth = 1;
    for (let y = 8; y < h; y += 7) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(2, y + 14); g.moveTo(w / 2, y); g.lineTo(w - 2, y + 14); g.stroke(); }
    g.strokeStyle = 'rgb(160, 180, 110)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    // splits where the wind has torn the blade
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const y = R.range(0.1, 0.9) * h, side = R.sign();
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(side > 0 ? w : 0, y); g.lineTo(w / 2 + side * 6, y - 18); g.stroke();
    }
  });
}

const swayHook = (k) => ({
  vertexHead: `attribute float aSway;\n${WIND_GLSL}`,
  hooks: {
    vertex: /* glsl */ `
      {
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        transformed += (inverse(mat3(modelMatrix * instanceMatrix)) * sfWindOffset(root, aSway * ${k}, 1.0));
      }`,
  },
});

export function createPlants(mats, lots, piers) {
  const R = rng(97);
  const group = new THREE.Group();
  group.name = 'plants';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const tufts = [], ferns = [], pads = [];
  const add = (list, frame, x, y, z, s, rx = 0) => {
    e.set(rx, R.next() * Math.PI * 2, 0);
    q.setFromEuler(e);
    m.compose(p.set(x, y, z), q, sc.set(s, s * R.range(0.8, 1.2), s));
    list.push(frame.clone().multiply(m));
  };
  // at the foot of the walls facing the lanes, and at the corners of houses
  for (const lot of lots) {
    const { spec, pos } = lot;
    if (spec.row !== 0 || coreDist(lot.zc) >= 50 || !pos) continue;
    const frame = new THREE.Matrix4().makeRotationY(pos.rot).setPosition(pos.x, pos.y, pos.z);
    const zf = spec.D / 2;
    for (let x = -spec.W / 2 + 0.2; x < spec.W / 2; x += R.range(0.6, 1.8)) {
      if (R.next() < 0.45) continue;
      if (spec.bankGap > 1) add(tufts, frame, x, 0, zf + 0.12, R.range(0.22, 0.42));
    }
  }
  // along the coping on the lanes, and ferns from the embankment's joints over the water
  for (const side of [-1, 1]) {
    for (let z = Z0; z > Z1; z -= R.range(1.2, 3.2)) {
      if (coreDist(z) > 70 || Math.abs(z - BRIDGE_Z) < 2.5) continue;
      const n = bankNormal(z, side);
      const frame = new THREE.Matrix4().makeRotationY(Math.atan2(-n.x, -n.z)).setPosition(bankX(z, side), BANK_Y, z);
      if (bankKind(z, side) === 'lane' && R.next() < 0.5 && !(side === CORRIDOR.side && z < CORRIDOR.z0 && z > CORRIDOR.z1)) add(tufts, frame, R.range(-0.2, 0.2), 0, -0.45, R.range(0.2, 0.36));
      if (R.next() < 0.35) add(ferns, frame, 0, R.range(-0.95, -0.35), 0.06, R.range(0.25, 0.42), -0.9);
    }
  }
  // lotus pads near the banks where the canal widens toward its ends
  for (const [z0, z1, side] of [[52, 28, -1], [46, 30, 1], [-196, -228, 1], [-205, -232, -1]]) {
    for (let k = 0; k < 26; k++) {
      const z = R.range(z1, z0);
      const n = bankNormal(z, side);
      const out = R.range(0.3, 2.4);
      const x = bankX(z, side) - n.x * out, zz = z - n.z * out;
      e.set(-Math.PI / 2, 0, R.next() * Math.PI * 2);
      q.setFromEuler(e);
      const s = R.range(0.25, 0.5);
      m.compose(p.set(x, 0.012 + R.next() * 0.01, zz), q, sc.set(s, s, s));
      pads.push(m.clone());
    }
  }
  const mk = (key, map, o = {}) => patch(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: o.rough ?? 0.85 }), { key, wet: 0.5, gloss: o.gloss ?? 0.5, ...(o.sway ? swayHook(o.sway) : {}) });
  // a tuft: two crossed cards, rooted at their foot
  const cross = () => {
    const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const b = a.clone().rotateY(Math.PI / 2);
    const g = mergePlanes([a, b]);
    const sway = new Float32Array(g.attributes.position.count);
    for (let i = 0; i < sway.length; i++) sway[i] = g.attributes.position.getY(i);
    g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    // normals up, so a tuft is lit like the ground it grows from
    for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0);
    return g;
  };
  const grassMat = mk('grass', grassTexture(R), { sway: 1.2 });
  for (const [list, name] of [[tufts, 'tufts'], [ferns, 'ferns']]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(cross(), grassMat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.layers.set(LAYER_NOREFL);
    im.name = name;
    group.add(im);
  }
  if (pads.length) {
    const padMat = patch(new THREE.MeshStandardMaterial({ map: leafTexture(R, 'lotus'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42 }), { key: 'lotus', wet: 0.2, gloss: 0.6 });
    const g = new THREE.CircleGeometry(0.5, 20);
    // a pad lifts at its rim
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const r = Math.hypot(pa.getX(i), pa.getY(i)); pa.setZ(i, r * r * 0.12); }
    g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, padMat, pads.length);
    pads.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = 'lotus';
    group.add(im);
  }
  group.add(createBananas(mats, lots, R));
  group.userData.stats = { tufts: tufts.length, ferns: ferns.length, pads: pads.length };
  return group;
}

function mergePlanes(list) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const g of list) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// banana plants by the walls: a few stems and long arching leaves
function createBananas(mats, lots, R) {
  const kit = new Kit();
  const pos = [], nrm = [], uv = [], sw = [], idx = [];
  const v = new THREE.Vector3();
  let n = 0;
  for (const lot of coreFirst(lots)) {
    const { spec, pos: lp } = lot;
    if (spec.row !== 0 || spec.lod !== 0 || spec.bankGap < 1 || !lp || R.next() > 0.22) continue;
    if (spec.side === CORRIDOR.side && lot.zc < CORRIDOR.z0 + 3 && lot.zc > CORRIDOR.z1 - 3) continue;
    const m4 = new THREE.Matrix4().makeRotationY(lp.rot).setPosition(lp.x, lp.y, lp.z);
    kit.at(lp.x, lp.y, lp.z, lp.rot);
    const bx = R.sign() * (spec.W / 2 - 0.35), bz = spec.D / 2 + 0.45;
    const stems = 2 + Math.floor(R.next() * 2);
    for (let s = 0; s < stems; s++) {
      const sx = bx + R.range(-0.25, 0.25), sz = bz + R.range(-0.15, 0.2);
      const h = R.range(1.4, 2.2);
      kit.tube('wood', [new THREE.Vector3(sx, 0, sz), new THREE.Vector3(sx + R.range(-0.05, 0.05), h * 0.5, sz), new THREE.Vector3(sx, h, sz)], [0.09, 0.075, 0.06], 7, { col: [0.55, 0.62, 0.38] });
      const leaves = 4 + Math.floor(R.next() * 3);
      for (let l = 0; l < leaves; l++) {
        const a = (l / leaves) * Math.PI * 2 + R.range(-0.3, 0.3);
        const L = R.range(1.1, 1.7), W = R.range(0.32, 0.45);
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const up0 = R.range(0.5, 0.9);
        const base = pos.length / 3;
        const seg = 8;
        for (let i = 0; i <= seg; i++) {
          const t = i / seg;
          // out and up from the stem's top, then arching over and down
          const c = new THREE.Vector3(sx, h, sz).addScaledVector(dir, t * L).add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.85) * up0 - t * t * 0.5, 0));
          const tw = Math.sin(t * Math.PI) * 0.15;
          for (const k of [-1, 1]) {
            const pnt = c.clone().addScaledVector(side, k * W * 0.5 * Math.sin(Math.min(1, t * 1.4 + 0.15) * Math.PI * 0.95)).add(new THREE.Vector3(0, -Math.abs(k) * tw, 0));
            v.copy(pnt).applyMatrix4(m4);
            pos.push(v.x, v.y, v.z);
            const nn = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -0.3).normalize().transformDirection(m4);
            nrm.push(nn.x, nn.y, nn.z);
            uv.push(k > 0 ? 1 : 0, 1 - t);
            sw.push(t * L);
          }
        }
        for (let i = 0; i < seg; i++) { const a0 = base + i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      }
    }
    n++;
  }
  const group = kit.build(mats, 'banana-stems');
  if (!pos.length) return group;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = patch(new THREE.MeshStandardMaterial({ map: leafTexture(R, 'banana'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }), {
    key: 'banana',
    wet: 0.4,
    gloss: 0.6,
    vertexHead: `attribute float aSway;\n${WIND_GLSL}`,
    hooks: {
      // the big leaves bob in the gusts, and in rain each drop knocks them a little (雨打芭蕉)
      vertex: `transformed += sfWindOffset(transformed, aSway * 1.6, 1.0) + vec3(0.0, sin(uTime * 7.0 + transformed.x * 9.0 + transformed.z * 7.0) * 0.012 * aSway * uRain, 0.0);`,
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'bananas';
  group.add(mesh);
  group.userData.count = n;
  return group;
}
