// The town along the canal: lots planned down both banks, three rows deep, built into one merged mesh per material
// per 80 m chunk (so each chunk culls on its own). The first row is drawn in full near the core stretch and simpler
// further away; the rows behind are massing whose roofs show over the first.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from './kit.js';
import { buildHouse } from './house.js';
import { patch } from '../core/shared.js';
import { LAYER_NOREFL, LAYER_MIRROR } from '../core/pipeline.js';
import { bankX, bankNormal, bankKind, canalX, canalSlope, coreDist, detailDist, BANK_Y, Z0, Z1, BRIDGE_Z, LANE_W, CORRIDOR, SLAB, SLAB_BRIDGES } from './layout.js';
import { rng } from '../lib/math.js';

// lime washes: fresh white, warm, grey, and the older ones gone ochre or sooty with the years
const TINTS = [[1, 1, 1], [1.0, 0.985, 0.95], [0.96, 0.965, 0.955], [1.02, 1.0, 0.97], [0.92, 0.925, 0.915], [0.98, 0.97, 0.94], [0.97, 0.92, 0.82], [0.86, 0.86, 0.85]];
const CHUNK = 80;
const BRIDGE_GAP = 3.4; // half-width of the street the bridge lands in

function pickGable(R, floors) {
  const r = R.next();
  if (floors === 1) return r < 0.75 ? 'plain' : 'mt2';
  return r < 0.42 ? 'plain' : r < 0.67 ? 'mt2' : 'mt3';
}

// lots along one bank, `row` deep (0 at the water)
function planRow(side, row, seed) {
  const R = rng(seed);
  const lots = [];
  let z = Z0 - R.range(0, 5);
  let i = 0;
  while (z > Z1) {
    const W = R.pick(row === 0 ? [3.6, 4.4, 5.2, 6.4, 7.2, 8.4] : [5.2, 6.4, 7.2, 8.4, 9.6]);
    const k = Math.hypot(1, canalSlope(z));
    const dz = W / k;
    // keep the bridge's landing street open
    if (z - dz < BRIDGE_Z + BRIDGE_GAP && z > BRIDGE_Z - BRIDGE_GAP) { z = BRIDGE_Z - BRIDGE_GAP; continue; }
    const zc = z - dz / 2;
    const gap = R.pick(row === 0 ? [0.12, 0.25, 0.25, 0.5, 0.9, 1.5] : [0.3, 1.0, 2.0, 3.0]);
    z -= dz + gap / k;
    const cd = coreDist(zc);
    if (row === 2 && cd > 140) continue;
    if (row === 1 && R.next() < 0.12) continue; // a courtyard, a garden
    const kind = bankKind(zc, side);
    const floors = R.next() < (row === 0 ? 0.78 : 0.62) ? 2 : 1;
    const D = row === 0 ? R.range(6.6, 9.0) : R.range(7.5, 11);
    let setback, face;
    if (row === 0) {
      setback = kind === 'water' ? 0.12 : LANE_W + R.range(0, 0.35);
      face = kind === 'water' ? 'water' : R.next() < 0.72 ? 'shop' : 'water';
    } else {
      const lane = kind === 'lane' ? LANE_W : 0;
      setback = lane + (row === 1 ? 10.5 + R.range(0, 3) : 24 + R.range(0, 5));
      face = 'water';
    }
    const dd = detailDist(zc);
    const lod = row > 0 ? 2 : dd === 0 ? 0 : dd < 50 ? 1 : 2;
    const spec = {
      W, D, floors, face, lod, row, side,
      gables: [pickGable(R, floors), pickGable(R, floors)],
      tint: R.pick(TINTS),
      ovF: face === 'shop' ? R.range(0.85, 1.0) : R.range(0.45, 0.62),
      ovB: R.range(0.45, 0.6),
      seed: seed * 1000 + i,
      bankGap: setback,
      door: null,
      pier: null,
      waist: false,
    };
    spec.waist = row === 0 && R.next() < (face === 'shop' ? 0.65 : 0.38);
    // along the corridor: two-storey shops close behind it, its roof meeting their first-floor beam
    if (row === 0 && side === CORRIDOR.side && kind === 'lane' && zc < CORRIDOR.z0 + W / 2 && zc > CORRIDOR.z1 - W / 2) {
      spec.floors = 2;
      spec.face = 'shop';
      spec.waist = false;
      spec.corridor = true;
      spec.ovF = R.range(0.85, 1.0);
      spec.bankGap = LANE_W + R.range(0, 0.2);
      spec.door = null;
    }
    if (row === 0 && face === 'water') {
      const roll = R.next();
      if (kind === 'water' && roll < 0.22 && W > 4) {
        const px = R.range(-W / 2 + 0.9, W / 2 - 0.9);
        spec.door = px;
        spec.pier = { x: px, dir: px > 0 ? -1 : 1 };
      } else if (kind === 'lane' && roll < 0.8) {
        spec.door = R.range(-W / 2 + 0.9, W / 2 - 0.9);
      }
    }
    lots.push({ zc, side, spec });
    i++;
  }
  return lots;
}

export function planTown() {
  const lots = [];
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) lots.push(...planRow(side, row, 101 + (side + 1) * 7 + row * 31));
  // where a slab bridge lands among the houses on the water, the house that stood there makes way for an alley
  // (left out after planning, so that every other house keeps its place)
  return lots.filter((l) => !(l.spec.row === 0 && l.side === SLAB.land && SLAB_BRIDGES.some((b) => Math.abs(l.zc - b.z) < l.spec.W / 2 + 1.3)));
}

// where a lot stands: centre on the ground, heading so local +z faces the water
export function placeLot(lot) {
  const { zc, side, spec } = lot;
  const n = bankNormal(zc, side);
  const off = spec.bankGap + spec.D / 2;
  return { x: bankX(zc, side) + n.x * off, y: BANK_Y, z: zc + n.z * off, rot: Math.atan2(-n.x, -n.z) };
}

function capGeometries() {
  // round cap at the end of a cover row (瓦当), facing +z: its face and its rim, not the back against the tile
  const rim = new THREE.CylinderGeometry(0.068, 0.068, 0.035, 8, 1, true);
  rim.rotateX(Math.PI / 2);
  const face = new THREE.CircleGeometry(0.068, 8);
  face.translate(0, 0, 0.0175);
  const cap = mergeGeometries([rim, face]);
  // drip tile at the end of a channel (滴水): a blunt triangle hanging down, tipped outward
  const s = new THREE.Shape();
  s.moveTo(-0.075, 0.02);
  s.lineTo(0.075, 0.02);
  s.lineTo(0.02, -0.085);
  s.lineTo(-0.02, -0.085);
  s.closePath();
  const drip = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false });
  drip.translate(0, 0, -0.0125);
  drip.rotateX(-0.3);
  return { cap, drip };
}

let capMat = null;
const ENDS_CHUNK = 40; // metres of canal per instanced batch, one batch per bank
const ENDS_FAR = 75; // beyond this a cap is a few pixels wide: not drawn at all

// Instanced round caps and drip tiles from lists of world matrices, in short batches per bank so that the view's
// frustum culls them and the far ones can be left out; group.userData.update(cameraPosition) does the latter.
export function tileEnds(caps, drips) {
  const group = new THREE.Group();
  group.name = 'tile-ends';
  if (!capMat) capMat = patch(new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.6 }), { key: 'cap', wet: 0.4, gloss: 0.7 });
  const { cap, drip } = capGeometries();
  let verts = 0;
  const batches = [];
  for (const [geo, list, name] of [[cap, caps, 'caps'], [drip, drips, 'drips']]) {
    const bins = new Map();
    for (const m of list) {
      const x = m.elements[12], z = m.elements[14];
      const key = `${Math.floor(z / ENDS_CHUNK)}:${x > canalX(z) ? 1 : -1}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(m);
    }
    for (const part of bins.values()) {
      const im = new THREE.InstancedMesh(geo, capMat, part.length);
      part.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = false;
      im.receiveShadow = true;
      // too small to matter in the rippled mirror
      im.layers.set(LAYER_NOREFL);
      im.matrixAutoUpdate = false;
      im.name = name;
      group.add(im);
      batches.push(im);
      verts += geo.attributes.position.count * part.length;
    }
  }
  group.userData.verts = verts;
  group.userData.update = (cam) => {
    for (const im of batches) {
      const b = im.boundingSphere;
      im.visible = b.center.distanceTo(cam) - b.radius < ENDS_FAR;
    }
  };
  return group;
}

const FINE_CHUNK = 60; // metres of canal (both banks) per run of full-detail houses
const NEAR_IN = 55, NEAR_OUT = 65; // a run is drawn in full detail while the camera is this close (with hysteresis)

export function createTown(mats, lots) {
  const group = new THREE.Group();
  group.name = 'town';
  const ctx = { caps: [], drips: [], lamps: [] };
  const spare = { caps: [], drips: [], lamps: [] }; // what the simpler copies would add to ctx: not wanted twice
  const chunks = new Map(), fine = new Map();
  for (const lot of lots) {
    const fineLot = lot.spec.lod === 0;
    const key = fineLot ? `f${Math.floor(lot.zc / FINE_CHUNK)}` : Math.floor(lot.zc / CHUNK);
    const m = fineLot ? fine : chunks;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(lot);
  }
  const stats = { houses: 0, verts: 0, chunks: 0, runs: 0 };
  const count = (g) => g.traverse((o) => { if (o.isMesh) stats.verts += o.geometry.attributes.position.count; });
  const kit = new Kit();
  const place = (lot) => {
    if (!lot.pos) lot.pos = placeLot(lot);
    kit.at(lot.pos.x, lot.pos.y, lot.pos.z, lot.pos.rot);
  };
  for (const [key, list] of chunks) {
    for (const lot of list) {
      place(lot);
      lot.heights = buildHouse(kit, lot.spec, ctx);
      stats.houses++;
    }
    const g = kit.build(mats, `town-${key}`);
    count(g);
    group.add(g);
    stats.chunks++;
  }
  // The full-detail houses, in short runs along the canal. Each run also has a simpler copy, the same houses one level
  // of detail down, drawn in the mirror, where the ripples and the quarter resolution would waste the detail, and in
  // place of the run when it is far from the camera. group.userData.update(cameraPosition) switches them.
  const runs = [];
  for (const [key, list] of fine) {
    for (const lot of list) {
      place(lot);
      lot.heights = buildHouse(kit, lot.spec, ctx);
      stats.houses++;
    }
    const detail = kit.build(mats, `town-fine-${key}`);
    for (const lot of list) {
      place(lot);
      buildHouse(kit, { ...lot.spec, lod: 1 }, spare);
    }
    const copy = kit.build(mats, `town-copy-${key}`);
    detail.traverse((o) => { if (o.isMesh) o.layers.set(LAYER_NOREFL); });
    const box = new THREE.Box3();
    detail.traverse((o) => { if (o.isMesh) box.union(o.geometry.boundingBox); });
    count(detail);
    count(copy);
    group.add(detail, copy);
    runs.push({ detail, copy, sphere: box.getBoundingSphere(new THREE.Sphere()), near: null });
    stats.runs++;
  }
  const setCopy = (copy, layer) => copy.traverse((o) => { if (o.isMesh) o.layers.set(layer); });
  group.userData.update = (cam) => {
    for (const r of runs) {
      const d = r.sphere.center.distanceTo(cam) - r.sphere.radius;
      const near = r.near ? d < NEAR_OUT : d < NEAR_IN;
      if (near === r.near) continue;
      r.near = near;
      // near: the detailed run in the view (and its shadows), the copy in the mirror only; far: the copy everywhere
      r.detail.visible = near;
      setCopy(r.copy, near ? LAYER_MIRROR : 0);
    }
  };
  group.userData.update(new THREE.Vector3(1e9, 0, 0));
  // the tile ends, instanced
  const ends = tileEnds(ctx.caps, ctx.drips);
  group.add(ends);
  group.userData.ends = ends;
  stats.verts += ends.userData.verts;
  // where the drips fall from: the drip tiles' tips, for the drips that run off them in the rain
  group.userData.dripPoints = ctx.drips.map((m) => [m.elements[12], m.elements[13] - 0.08, m.elements[14]]);
  // the shops' lanterns; under the corridor's roof its own lanterns light the way
  group.userData.lamps = ctx.lamps.filter((v) => {
    const side = Math.sign(v.x - canalX(v.z));
    return !(side === CORRIDOR.side && v.z < CORRIDOR.z0 + 2 && v.z > CORRIDOR.z1 - 2);
  });
  group.userData.stats = stats;
  return group;
}
