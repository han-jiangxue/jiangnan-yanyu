// The slab bridges (石板桥) of 枕河人家: three spans of granite slabs, three abreast, on two stone piers standing in the
// canal, the middle span wide and high enough for the boats; a stone landing at each end, steps from the left one
// down along the lane, from the right one into the alley between the houses; a squat post at each corner of the
// middle span.
// Local frame: origin on the canal's centre line at the water, x across toward the right bank, z along the canal.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { canalX, canalW, canalSlope, BANK_Y, BED_Y, SLAB, SLAB_BRIDGES } from './layout.js';

// where each bridge stands and what clears it, for the boats and the camera
export const SLABS = SLAB_BRIDGES.map(({ z }) => ({
  kind: 'slab', z, x: canalX(z), rot: Math.atan2(canalSlope(z), 1), hw: canalW(z) / 2,
  W: SLAB.width, top: SLAB.top, bottom: SLAB.top - SLAB.thick, half: SLAB.pierX - SLAB.pierT / 2,
}));

export function createSlabBridges(mats) {
  const group = new THREE.Group();
  group.name = 'slab-bridges';
  const kit = new Kit();
  for (const b of SLABS) {
    kit.at(b.x, 0, b.z, b.rot);
    const { hw, W, top, bottom } = b, P = SLAB.pierX;
    // the piers, a little wider than the deck, capped
    for (const sx of [-1, 1]) {
      kit.box('stone', sx * P, (BED_Y + bottom) / 2, 0, SLAB.pierT, bottom - BED_Y, W + 0.3, { uvScale: 0.6 });
      kit.box('slab', sx * P, bottom - 0.06, 0, SLAB.pierT + 0.12, 0.12, W + 0.45, { uvScale: 0.6 });
    }
    // the deck: each span three slabs abreast, the outer spans resting on the landings
    for (const [xa, xb] of [[-hw - 0.4, -P], [-P, P], [P, hw + 0.4]]) {
      for (let k = 0; k < 3; k++) {
        const zk = -W / 2 + (k + 0.5) * (W / 3);
        kit.box('slab', (xa + xb) / 2, top - SLAB.thick / 2, zk, xb - xa + 0.1, SLAB.thick, W / 3 - 0.03, { uvScale: 0.5 });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box('stone', sx * P, top + 0.24, sz * (W / 2 - 0.1), 0.2, 0.48, 0.2, { uvScale: 0.5 });
    const rise = 0.15, run = 0.3, n = Math.round((top - BANK_Y) / rise);
    // left: a landing on the lane's edge and steps down along the lane, upstream
    kit.box('stone', -hw - 0.75, (BANK_Y + top) / 2, 0, 1.5, top - BANK_Y, W + 0.1, { uvScale: 0.6 });
    kit.box('slab', -hw - 0.75, top + 0.02, 0, 1.56, 0.04, W + 0.16, { uvScale: 0.5 });
    for (let k = 0; k < n; k++) {
      const yt = top - (k + 1) * rise;
      kit.box('stone', -hw - 0.75, (BANK_Y + yt) / 2, W / 2 + (k + 0.5) * run, 1.5, yt - BANK_Y, run, { uvScale: 0.6 });
      kit.box('slab', -hw - 0.75, yt + 0.02, W / 2 + (k + 0.5) * run + 0.02, 1.54, 0.04, run + 0.02, { uvScale: 0.5 });
    }
    // right: a landing at the bank's edge and steps up out of the alley
    kit.box('stone', hw + 0.6, (BANK_Y + top) / 2, 0, 1.2, top - BANK_Y, W + 0.1, { uvScale: 0.6 });
    kit.box('slab', hw + 0.6, top + 0.02, 0, 1.26, 0.04, W + 0.16, { uvScale: 0.5 });
    for (let k = 0; k < n; k++) {
      const yt = top - (k + 1) * rise;
      kit.box('stone', hw + 1.2 + (k + 0.5) * run, (BANK_Y + yt) / 2, 0, run, yt - BANK_Y, W, { uvScale: 0.6 });
      kit.box('slab', hw + 1.2 + (k + 0.5) * run + 0.02, yt + 0.02, 0, run + 0.02, 0.04, W + 0.04, { uvScale: 0.5 });
    }
  }
  group.add(kit.build(mats, 'slab-bridges'));
  return group;
}
