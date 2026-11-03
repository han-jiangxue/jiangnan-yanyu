// The canal's stone: embankment walls of granite courses with a coping on top, the slab ground of the lanes, the
// canal bed, and stone steps down to the water from the lanes.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { pierSteps } from './house.js';
import { bankX, bankNormal, bankKind, canalX, BANK_Y, BED_Y, Z0, Z1, BRIDGE_Z, CORRIDOR, GATE, SLAB_BRIDGES } from './layout.js';
import { rng } from '../lib/math.js';

const STEP = 2;
const COPING_OUT = 0.08, COPING_H = 0.26, COPING_IN = 0.5;
const BRIDGE_HALF = 2.05; // the bridge's half width along the canal: no bank wall inside it

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// a quad turned to face `want` whichever order the corners came in
function face(kit, mat, a, b, c, d, want, o = {}) {
  _a.fromArray(b).sub(_c.fromArray(a));
  _b.fromArray(c).sub(_c.fromArray(a));
  const n = _a.cross(_b);
  if (n.x * want[0] + n.y * want[1] + n.z * want[2] < 0) kit.quad(mat, a, d, c, b, o);
  else kit.quad(mat, a, b, c, d, o);
}

export function createBanks(mats) {
  const kit = new Kit();
  kit.at(0, 0, 0, 0);
  const R = rng(77);
  for (const side of [-1, 1]) {
    for (let z = Z0; z > Z1; z -= STEP) {
      const z2 = z - STEP;
      const inBridge = Math.abs((z + z2) / 2 - BRIDGE_Z) < BRIDGE_HALF + STEP / 2;
      const n1 = bankNormal(z, side), n2 = bankNormal(z2, side);
      const x1 = bankX(z, side), x2 = bankX(z2, side);
      const toWater = [-(n1.x + n2.x) / 2, 0, -(n1.z + n2.z) / 2];
      const at = (x, zz, n, off, y) => [x - n.x * off, y, zz - n.z * off];
      if (!inBridge) {
        // the wall, from the bed to under the coping
        face(kit, 'stone', at(x1, z, n1, 0, BED_Y), at(x2, z2, n2, 0, BED_Y), at(x2, z2, n2, 0, BANK_Y - COPING_H), at(x1, z, n1, 0, BANK_Y - COPING_H), toWater, { span: [BED_Y, BANK_Y + 2] });
        // the coping: front, top, and the strip underneath its lip
        face(kit, 'slab', at(x1, z, n1, COPING_OUT, BANK_Y - COPING_H), at(x2, z2, n2, COPING_OUT, BANK_Y - COPING_H), at(x2, z2, n2, COPING_OUT, BANK_Y), at(x1, z, n1, COPING_OUT, BANK_Y), toWater, { uvScale: 0.6 });
        face(kit, 'slab', at(x1, z, n1, COPING_OUT, BANK_Y - COPING_H), at(x2, z2, n2, COPING_OUT, BANK_Y - COPING_H), at(x2, z2, n2, 0, BANK_Y - COPING_H), at(x1, z, n1, 0, BANK_Y - COPING_H), [0, -1, 0]);
        face(kit, 'slab', at(x1, z, n1, COPING_OUT, BANK_Y), at(x2, z2, n2, COPING_OUT, BANK_Y), at(x2, z2, n2, -COPING_IN, BANK_Y + 0.001), at(x1, z, n1, -COPING_IN, BANK_Y + 0.001), [0, 1, 0], { uvScale: 0.6 });
      }
      // the ground: slab lanes near the water, the same paving under the houses further in
      face(kit, 'slab', at(x1, z, n1, -COPING_IN, BANK_Y), at(x2, z2, n2, -COPING_IN, BANK_Y), at(x2, z2, n2, -60, BANK_Y), at(x1, z, n1, -60, BANK_Y), [0, 1, 0]);
    }
  }
  // the canal bed
  for (let z = Z0; z > Z1; z -= STEP * 2) {
    const z2 = z - STEP * 2;
    const a = [bankX(z, -1) - 0.5, BED_Y, z], b = [bankX(z2, -1) - 0.5, BED_Y, z2];
    const c = [bankX(z2, 1) + 0.5, BED_Y, z2], d = [bankX(z, 1) + 0.5, BED_Y, z];
    face(kit, 'bed', a, b, c, d, [0, 1, 0]);
  }
  // steps from the lanes down to the water, every so often
  let piers = [];
  for (const side of [-1, 1]) {
    for (let z = Z0 - 20; z > Z1 + 20; z -= R.range(45, 80)) {
      if (bankKind(z, side) !== 'lane' || Math.abs(z - BRIDGE_Z) < 12) continue;
      if (side === CORRIDOR.side && z < CORRIDOR.z0 + 4 && z > CORRIDOR.z1 - 4) continue;
      piers.push({ x: bankX(z, side), z, side, dir: R.sign() });
    }
  }
  // none where the town gate stands; dropped afterwards so that the others keep their places
  piers = piers.filter((p) => (p.side !== GATE.side || Math.abs(p.z - GATE.z) > 6) && !SLAB_BRIDGES.some((b) => p.z > b.z - 6 && p.z < b.z + 9));
  for (const p of piers) {
    const n = bankNormal(p.z, p.side);
    kit.at(p.x, BANK_Y, p.z, Math.atan2(-n.x, -n.z));
    pierSteps(kit, 0, p.dir, COPING_OUT, { mooring: true, landW: 1.2 });
  }
  const group = kit.build(mats, 'banks');
  group.userData.piers = piers;
  return group;
}

// the canal's far reaches beyond the built stretch fade into the rain; this is just the centre line for the camera
export const centreAt = (z) => new THREE.Vector3(canalX(z), 0, z);
