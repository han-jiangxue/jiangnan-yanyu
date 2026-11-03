// The stone arch bridge: one semicircular arch springing from the waterline, so on still water the arch and its
// reflection close into a full circle. Coursed granite spandrels, a ring of voussoirs on each face, a stepped deck
// with a short level top, parapets with posts.
// Local frame: origin on the canal's centre line at the waterline, x across the canal (along the bridge), z along
// the canal, y up.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { canalX, canalSlope, BANK_Y, BED_Y, BRIDGE_Z, BRIDGE_SPAN } from './layout.js';

export const BRIDGE = (() => {
  const R = BRIDGE_SPAN / 2;
  const ring = 0.46;
  const W = 3.8; // structure width along the canal
  const crown = R + ring + 0.32; // deck level at the top
  const top = 1.1; // half length of the level top
  const n = Math.round((crown - BANK_Y) / 0.15); // steps each side
  const rise = (crown - BANK_Y) / n, run = 0.32;
  const xEnd = top + n * run;
  return { R, ring, W, crown, top, n, rise, run, xEnd, x: canalX(BRIDGE_Z), z: BRIDGE_Z, rot: Math.atan2(canalSlope(BRIDGE_Z), 1) };
})();

const STONE_COL = [2.1, 2.12, 2.18];
const RING_COL = [1.9, 1.9, 1.95];

export function createBridge(mats) {
  const { R, ring, W, crown, top, n, rise, run, xEnd } = BRIDGE;
  const kit = new Kit();
  kit.at(BRIDGE.x, 0, BRIDGE.z, BRIDGE.rot);
  kit.baseY = 0;

  // the body: the face outline extruded across the width, with the arch and the water opening cut out of it. Its top
  // runs a slab's depth under the step nosings, so the steps stand on it
  const sunk = 0.24;
  const s = new THREE.Shape();
  s.moveTo(-xEnd, BANK_Y - sunk);
  s.lineTo(-top, crown - sunk);
  s.lineTo(top, crown - sunk);
  s.lineTo(xEnd, BANK_Y - sunk);
  s.lineTo(xEnd, BED_Y);
  s.lineTo(R, BED_Y);
  s.lineTo(R, 0);
  s.absarc(0, 0, R, 0, Math.PI, false);
  s.lineTo(-R, BED_Y);
  s.lineTo(-xEnd, BED_Y);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false, curveSegments: 56 });
  body.translate(0, 0, -W / 2);
  kit.add('stone', body, { col: STONE_COL });

  // the ring of voussoirs on each face, a keystone at the crown
  const N = 29;
  const rm = R + ring / 2;
  for (const sz of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const th = ((i + 0.5) / N) * Math.PI;
      const len = (Math.PI / N) * rm - 0.014;
      const key = i === (N - 1) / 2;
      kit.box('slab', rm * Math.cos(th), rm * Math.sin(th), sz * (W / 2 + 0.035), len + (key ? 0.04 : 0), ring + (key ? 0.08 : 0), 0.1, { rz: th - Math.PI / 2, col: RING_COL, uvScale: 0.5 });
    }
  }

  // the deck: a level top and steps down to each bank
  const dw = W - 0.62;
  kit.box('slab', 0, crown - sunk / 2, 0, top * 2, sunk, dw, { uvScale: 0.6 });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const tread = crown - (i + 1) * rise;
      const xa = top + i * run, xb = xa + run;
      kit.box('slab', sx * (xa + xb) / 2, tread - 0.2, 0, run + 0.02, 0.4, dw, { uvScale: 0.6 });
    }
  }

  // parapets: low slabs following the line of the step nosings, reaching down over the body's edge; posts between
  const noseY = (x) => (Math.abs(x) <= top ? crown : crown - ((Math.abs(x) - top) / (xEnd - top)) * (crown - BANK_Y));
  const pz = W / 2 - 0.13;
  const posts = [-xEnd + 0.15, -top - (xEnd - top) * 0.66, -top - (xEnd - top) * 0.33, -top, top, top + (xEnd - top) * 0.33, top + (xEnd - top) * 0.66, xEnd - 0.15];
  for (const sz of [-1, 1]) {
    for (let i = 0; i < posts.length - 1; i++) {
      const xa = posts[i], xb = posts[i + 1];
      const ya = noseY(xa), yb = noseY(xb);
      const len = Math.hypot(xb - xa, yb - ya);
      const ang = Math.atan2(yb - ya, xb - xa);
      kit.box('slab', (xa + xb) / 2, (ya + yb) / 2 + 0.11, sz * pz, len, 0.82, 0.18, { rz: ang, uvScale: 0.5 });
      // the coping rail on top
      kit.box('slab', (xa + xb) / 2, (ya + yb) / 2 + 0.55, sz * pz, len, 0.07, 0.24, { rz: ang, uvScale: 0.5 });
    }
    for (const x of posts) {
      const y = noseY(x);
      kit.box('slab', x, y + 0.27, sz * pz, 0.22, 1.14, 0.22, { uvScale: 0.5 });
      kit.cyl('slab', x, y + 0.84, sz * pz, 0.07, 0.12, 0.16, { sides: 8, uvScale: 0.5 });
    }
  }

  const group = kit.build(mats, 'bridge');
  group.userData.bridge = BRIDGE;
  return group;
}
