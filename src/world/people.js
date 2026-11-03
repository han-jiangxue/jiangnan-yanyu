// People in the lanes with oil-paper umbrellas (油纸伞): they walk the right bank's lane, through the corridor, up
// and over the bridge and on along the left bank, and back. Umbrellas open in the rain and fold under the corridor
// or when it stops; seen from beneath, the oiled paper glows with the sky behind it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from './kit.js';
import { patch } from '../core/shared.js';
import { LAYER_DYN } from '../core/pipeline.js';
import { rng, clamp } from '../lib/math.js';
import { bankX, bankNormal, BANK_Y, CORRIDOR, BRIDGE_Z } from './layout.js';
import { BRIDGE } from './bridge.js';

const ROBES = [[0.12, 0.15, 0.28], [0.32, 0.36, 0.4], [0.22, 0.16, 0.12], [0.74, 0.71, 0.65], [0.07, 0.07, 0.08], [0.2, 0.34, 0.37], [0.42, 0.3, 0.32]];
const UMBRELLAS = [[0.62, 0.12, 0.06], [0.76, 0.48, 0.16], [0.82, 0.7, 0.48], [0.22, 0.38, 0.24], [0.2, 0.26, 0.44], [0.74, 0.4, 0.4]];
const SKIN = [0.72, 0.56, 0.46], HAIR = [0.05, 0.045, 0.04];

// the walkers' way, as points with a height and whether a roof is over them
function buildPath() {
  const pts = [];
  const lane = (side, z, d) => { const n = bankNormal(z, side); return [bankX(z, side) + n.x * d, BANK_Y, z + n.z * d]; };
  const cov = (side, z) => side === CORRIDOR.side && z < CORRIDOR.z0 - 0.5 && z > CORRIDOR.z1 + 0.5;
  for (let z = 36; z > BRIDGE_Z + 3; z -= 1) pts.push([...lane(1, z, 1.7), cov(1, z)]);
  // over the bridge along its middle, on the line of the step nosings
  const { top, xEnd, crown, x: bx, z: bz, rot } = BRIDGE;
  const noseY = (x) => (Math.abs(x) <= top ? crown : crown - ((Math.abs(x) - top) / (xEnd - top)) * (crown - BANK_Y));
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let x = xEnd + 1.2; x >= -xEnd - 1.2; x -= 0.5) {
    const lx = clamp(x, -xEnd, xEnd);
    pts.push([bx + x * c, noseY(lx) + 0.02, bz - x * s, false]);
  }
  for (let z = BRIDGE_Z - 3; z > -232; z -= 1) pts.push([...lane(-1, z, 1.6), false]);
  // lengths along the way
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  return { pts, len, total: len[len.length - 1] };
}

function pathAt(P, s, out) {
  s = clamp(s, 0, P.total);
  let lo = 0, hi = P.len.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P.len[mid] <= s) lo = mid; else hi = mid; }
  const a = P.pts[lo], b = P.pts[hi];
  const t = (s - P.len[lo]) / Math.max(1e-6, P.len[hi] - P.len[lo]);
  out.x = a[0] + (b[0] - a[0]) * t;
  out.y = a[1] + (b[1] - a[1]) * t;
  out.z = a[2] + (b[2] - a[2]) * t;
  out.dx = b[0] - a[0]; out.dz = b[2] - a[2];
  out.covered = t < 0.5 ? a[3] : b[3];
  return out;
}

function ribTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 64);
  // sixteen ribs, a darker band at the rim and a ring of thread near the top
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 16; i++) g.fillRect((i / 16) * 256, 0, 2, 64);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 60, 256, 4);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(0, 6, 256, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function walkerBody(kit, R) {
  const robe = R.pick(ROBES);
  const prof = [[0.2, 0.04], [0.19, 0.4], [0.16, 0.9], [0.18, 1.18], [0.2, 1.32], [0.12, 1.4], [0.05, 1.44]];
  kit.add('body', new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 12), { col: robe });
  for (const sx of [-1, 1]) kit.box('body', sx * 0.08, 0.03, 0.06, 0.08, 0.06, 0.2, { col: HAIR });
  kit.add('body', new THREE.SphereGeometry(0.1, 12, 10), { local: new THREE.Matrix4().makeTranslation(0, 1.56, 0), col: SKIN });
  kit.add('body', new THREE.SphereGeometry(0.107, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), { local: new THREE.Matrix4().makeTranslation(0, 1.572, -0.022), col: HAIR });
  // a bun at the back, or a plait's knot
  kit.add('body', new THREE.SphereGeometry(0.055, 8, 6), { local: new THREE.Matrix4().makeTranslation(0, 1.58, -0.11), col: HAIR });
  // the umbrella arm bent up to the handle in front, the other hanging
  kit.tube('body', [new THREE.Vector3(0.17, 1.34, 0), new THREE.Vector3(0.2, 1.08, 0.08), new THREE.Vector3(0.07, 1.2, 0.2)], [0.045, 0.042, 0.035], 6, { col: robe });
  kit.tube('body', [new THREE.Vector3(-0.17, 1.34, 0), new THREE.Vector3(-0.2, 1.05, 0.02), new THREE.Vector3(-0.17, 0.82, 0.05)], [0.045, 0.042, 0.035], 6, { col: robe });
  return R.pick(UMBRELLAS);
}

// One part of every walker (all the bodies, or all the canopies, or all the sticks) as a single mesh: three draws for
// the whole crowd in each pass instead of three per walker. Each walker's vertices are moved on the CPU every frame
// (a few thousand in all) from its own copy, by the matrix the walker's part has that frame.
class Crowd {
  constructor(parts, material, name) {
    this.local = parts.map((g) => ({ pos: g.attributes.position.array.slice(), nrm: g.attributes.normal.array.slice() }));
    this.offs = [];
    let o = 0;
    for (const g of parts) { this.offs.push(o); o += g.attributes.position.count; }
    this.geo = mergeGeometries(parts);
    this.geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false; // spread along the whole lane
    this.mesh.matrixAutoUpdate = false;
    this.mesh.layers.set(LAYER_DYN);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this._n = new THREE.Matrix3();
  }

  // walker i's part, placed by m
  set(i, m) {
    const { pos, nrm } = this.local[i];
    const P = this.geo.attributes.position.array, N = this.geo.attributes.normal.array;
    const e = m.elements, n = this._n.getNormalMatrix(m).elements;
    const o = this.offs[i] * 3;
    for (let k = 0; k < pos.length; k += 3) {
      const x = pos[k], y = pos[k + 1], z = pos[k + 2];
      P[o + k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[o + k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[o + k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = nrm[k], b = nrm[k + 1], c = nrm[k + 2];
      const nx = n[0] * a + n[3] * b + n[6] * c, ny = n[1] * a + n[4] * b + n[7] * c, nz = n[2] * a + n[5] * b + n[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      N[o + k] = nx / l; N[o + k + 1] = ny / l; N[o + k + 2] = nz / l;
    }
  }

  done() {
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

export class People {
  constructor(count = 10, seed = 21) {
    const R = rng(seed);
    this.path = buildPath();
    const body = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { key: 'people', wet: 0.4, gloss: 0.3 });
    const paper = patch(new THREE.MeshStandardMaterial({ map: ribTexture(), vertexColors: true, side: THREE.DoubleSide, roughness: 0.5 }), {
      key: 'umbrella',
      wet: 0.2,
      gloss: 0.6,
      // oiled paper lets the sky through: from beneath it glows its own colour
      hooks: { preLight: `if (!gl_FrontFacing) totalEmissiveRadiance += diffuseColor.rgb * (uSkyHor * 0.55 + uAmbUp * 0.2);` },
    });
    const stickMat = patch(new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.7 }), { key: 'umbrella-stick', wet: 0.3, gloss: 0.4 });
    this.walkers = [];
    this.group = new THREE.Group();
    this.group.name = 'people';
    const bodies = [], canopies = [], sticks = [];
    for (let i = 0; i < count; i++) {
      const kit = new Kit();
      kit.at(0, 0, 0, 0);
      const ucol = walkerBody(kit, R);
      bodies.push(kit.build({ body }, 'walker').children[0].geometry);
      // the umbrella: canopy on a pivot at the hand, so it can fold down along its stick. The hierarchy only works out
      // the parts' matrices; the crowd meshes are drawn with them
      const root = new THREE.Object3D();
      const pivot = new THREE.Object3D();
      pivot.position.set(0.07, 1.2, 0.2);
      pivot.rotation.set(-0.18, 0, -0.05);
      const canopy = new THREE.Object3D();
      root.add(pivot);
      pivot.add(canopy);
      const cone = new THREE.ConeGeometry(0.56, 0.21, 16, 1, true);
      cone.translate(0, 0.9 - 0.105, 0);
      const cols = new Float32Array(cone.attributes.position.count * 3);
      for (let k = 0; k < cols.length; k += 3) cols.set(ucol, k);
      cone.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      canopies.push(cone);
      const stickG = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5);
      stickG.translate(0, 0.42, 0);
      sticks.push(stickG);
      this.walkers.push({ root, canopy, pivot, s: R.next() * this.path.total, dir: R.sign(), speed: R.range(0.85, 1.25), off: R.range(-0.45, 0.45), phase: R.next() * 6, open: -1 });
    }
    this.crowd = [new Crowd(bodies, body, 'walker:body'), new Crowd(canopies, paper, 'walker:umbrella'), new Crowd(sticks, stickMat, 'walker:stick')];
    for (const c of this.crowd) this.group.add(c.mesh);
    this._p = {};
  }

  update(dt, t, rain) {
    const P = this.path, p = this._p;
    for (let i = 0; i < this.walkers.length; i++) {
      const w = this.walkers[i];
      w.s += w.dir * w.speed * dt;
      if (w.s > P.total) { w.s = P.total; w.dir = -1; }
      if (w.s < 0) { w.s = 0; w.dir = 1; }
      pathAt(P, w.s, p);
      const len = Math.hypot(p.dx, p.dz) || 1;
      const fx = (p.dx / len) * w.dir, fz = (p.dz / len) * w.dir;
      // keep to one side of the way
      const x = p.x + fz * w.off * w.dir, z = p.z - fx * w.off * w.dir;
      const step = t * w.speed * 3.4 + w.phase;
      w.root.position.set(x, p.y + Math.abs(Math.sin(step)) * 0.025, z);
      w.root.rotation.set(0, Math.atan2(fx, fz), Math.sin(step) * 0.02);
      // open in the rain unless a roof is over them
      const want = rain > 0.05 && !p.covered ? 1 : 0;
      w.open = w.open < 0 ? want : w.open + (want - w.open) * Math.min(1, dt * 2.5);
      // folded, it is carried point-down at the side like a walking stick
      const o = w.open;
      w.canopy.scale.set(0.1 + 0.9 * o, 1 + 0.6 * (1 - o), 0.1 + 0.9 * o);
      w.canopy.position.y = -0.25 * (1 - o);
      w.pivot.rotation.x = -0.18 * o - 2.8 * (1 - o);
      w.root.updateMatrixWorld(true);
      this.crowd[0].set(i, w.root.matrixWorld);
      this.crowd[1].set(i, w.canopy.matrixWorld);
      this.crowd[2].set(i, w.pivot.matrixWorld);
    }
    for (const c of this.crowd) c.done();
  }
}
