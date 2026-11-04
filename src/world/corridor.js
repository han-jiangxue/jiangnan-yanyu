// The covered corridor along the lane (廊棚): a lean-to roof from the shop fronts out over the water's edge on posts
// along the bank, a bench with a back leaning out over the water (美人靠) between the posts, and a red lantern under
// every bay. Under it the lane stays dry while the rain falls a step away, and its eave drips into the canal.
// Built bay by bay along the bank, each bay in its own frame: origin on the bank's edge at lane level, x along the
// bank, +z out over the water.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { slope, snowLip, lanternGeometry, FRAME_COL, TIMBER_COL, WOOD_COL } from './house.js';
import { TILE_PITCH, COVER_FRAC } from './materials.js';
import { latticeUv } from './textures.js';
import { bankX, bankNormal, canalSlope, BANK_Y, LANE_W, CORRIDOR } from './layout.js';

const BAY = 3.2;
const Y_BACK = 3.49, Z_BACK = -(LANE_W + 0.4); // the back edge runs into the shop fronts
const Y_FRONT = 2.6, Z_FRONT = 0.35; // the eave stands out over the water
const Z_POST = -0.12;
const LATTICE_COL = [0.32, 0.21, 0.15];

const roofY = (z) => Y_FRONT + ((Y_BACK - Y_FRONT) * (Z_FRONT - z)) / (Z_FRONT - Z_BACK);

const _v = new THREE.Vector3();

function bay(kit, len, last, out) {
  const x0 = -len / 2, x1 = len / 2;
  const ang = Math.atan2(Y_BACK - Y_FRONT, Z_FRONT - Z_BACK);
  // the roof, its boards underneath, the fascia and the flashing against the shop fronts
  slope(kit, 'tile', [x0 - 0.01, Y_BACK, Z_BACK], [x1 + 0.01, Y_BACK, Z_BACK], [x0 - 0.01, Y_FRONT, Z_FRONT], [x1 + 0.01, Y_FRONT, Z_FRONT], { span: [-1, -1], spanRaw: true });
  slope(kit, 'timber', [x0, Y_BACK - 0.08, Z_BACK], [x1, Y_BACK - 0.08, Z_BACK], [x0, Y_FRONT - 0.08, Z_FRONT], [x1, Y_FRONT - 0.08, Z_FRONT], { down: true, col: FRAME_COL });
  kit.box('timber', 0, Y_FRONT - 0.1, Z_FRONT, len + 0.02, 0.12, 0.04, { col: FRAME_COL });
  // the snow along its eave, over the water
  snowLip(kit, out, 0, Y_FRONT + 0.03, Z_FRONT, len, 'x', 1, ang);
  // rafters, and the front beam on the posts
  for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.55) {
    const zm = (Z_FRONT + Z_BACK) / 2;
    kit.box('timber', x, roofY(zm) - 0.13, zm, 0.06, 0.07, Math.hypot(Z_FRONT - Z_BACK, Y_BACK - Y_FRONT), { rx: ang, col: FRAME_COL });
  }
  kit.box('timber', 0, Y_FRONT - 0.32, Z_POST, len + 0.02, 0.22, 0.16, { col: TIMBER_COL });
  // posts on the coping: each bay brings the one at its start, the last one closes the run
  for (const x of last ? [x0, x1] : [x0]) {
    kit.box('timber', x, (Y_FRONT - 0.3) / 2, Z_POST, 0.17, Y_FRONT - 0.3, 0.17, { col: TIMBER_COL, span: [0, Y_FRONT] });
    kit.box('slab', x, 0.05, Z_POST, 0.3, 0.1, 0.3, {});
  }
  // the bench with its back leaning out over the water
  const bx0 = x0 + 0.1, bx1 = x1 - 0.1;
  kit.box('wood', 0, 0.45, Z_POST + 0.06, bx1 - bx0, 0.06, 0.4, { col: WOOD_COL });
  kit.quad('timber', [bx0, 0.04, Z_POST + 0.25], [bx1, 0.04, Z_POST + 0.25], [bx1, 0.42, Z_POST + 0.25], [bx0, 0.42, Z_POST + 0.25], { col: FRAME_COL });
  const b0 = [Z_POST + 0.22, 0.5], b1 = [Z_POST + 0.5, 0.98];
  kit.quad('lattice', [bx0, b0[1], b0[0]], [bx1, b0[1], b0[0]], [bx1, b1[1], b1[0]], [bx0, b1[1], b1[0]], { uv: latticeUv(1), keepUv: true, rawUv: true, col: LATTICE_COL });
  const tilt = Math.atan2(b1[0] - b0[0], b1[1] - b0[1]);
  kit.box('timber', 0, b1[1], b1[0], bx1 - bx0, 0.06, 0.07, { col: FRAME_COL });
  kit.box('timber', 0, b0[1], b0[0], bx1 - bx0, 0.05, 0.06, { col: FRAME_COL });
  for (const x of [bx0 + 0.04, bx1 - 0.04]) kit.box('timber', x, (b0[1] + b1[1]) / 2, (b0[0] + b1[0]) / 2, 0.05, Math.hypot(b1[0] - b0[0], b1[1] - b0[1]), 0.05, { rx: tilt, col: FRAME_COL });
  // a lantern under the bay: cord, cap, silk body, cap, tassel
  const ly = Y_FRONT - 0.43 - 0.3 - 0.36;
  kit.box('timber', 0, Y_FRONT - 0.43 - 0.15, Z_POST, 0.012, 0.3, 0.012, { col: [0.2, 0.15, 0.12] });
  kit.cyl('timber', 0, ly + 0.375, Z_POST, 0.07, 0.07, 0.035, { sides: 12, col: [0.18, 0.14, 0.11] });
  kit.add('lantern', lanternGeometry(), { local: new THREE.Matrix4().makeTranslation(0, ly, Z_POST), glow: 1, steady: true });
  kit.cyl('timber', 0, ly - 0.012, Z_POST, 0.065, 0.065, 0.03, { sides: 12, col: [0.18, 0.14, 0.11] });
  kit.box('lantern', 0, ly - 0.12, Z_POST, 0.035, 0.18, 0.035, { glow: 0.3, steady: true });
  out.lamps.push(_v.set(0, ly + 0.18, Z_POST).applyMatrix4(kit.m).clone());
  // the eave's tile ends, and where its drips fall from
  const P = TILE_PITCH, U = kit.uvOff[0];
  for (let k = Math.floor(U / P) - 1; (k - 1) * P - U < len; k++) {
    const xc = x0 + (k + COVER_FRAC * 0.5) * P - U;
    const xd = x0 + (k + COVER_FRAC + (1 - COVER_FRAC) * 0.5) * P - U;
    const tip = (x) => new THREE.Matrix4().makeTranslation(x, Y_FRONT, Z_FRONT + 0.01);
    if (xc > x0 + 0.02 && xc < x1 - 0.02) out.caps.push(kit.m.clone().multiply(tip(xc).multiply(new THREE.Matrix4().makeTranslation(0, 0.025, 0))));
    if (xd > x0 + 0.02 && xd < x1 - 0.02) {
      out.drips.push(kit.m.clone().multiply(tip(xd).multiply(new THREE.Matrix4().makeTranslation(0, -0.03, 0.005))));
      out.dripPoints.push(_v.set(xd, Y_FRONT - 0.11, Z_FRONT + 0.02).applyMatrix4(kit.m).toArray());
    }
  }
}

export function createCorridor(mats) {
  const { side, z0, z1 } = CORRIDOR;
  const kit = new Kit();
  const out = { lamps: [], caps: [], drips: [], dripPoints: [], lips: [] };
  let z = z0;
  let U = 0;
  while (z > z1 + 0.5) {
    const k = Math.hypot(1, canalSlope(z));
    const dz = Math.min(BAY / k, z - z1);
    const zc = z - dz / 2;
    const len = dz * k;
    const n = bankNormal(zc, side);
    kit.at(bankX(zc, side), BANK_Y, zc, Math.atan2(-n.x, -n.z));
    // keep the tile rows running on from bay to bay: each bay's uv starts where the last one's ended
    U -= len;
    kit.uvOff = [U, 0];
    const last = z - dz <= z1 + 0.5;
    bay(kit, len, last, out);
    z -= dz;
  }
  const group = kit.build(mats, 'corridor');
  group.userData = { ...group.userData, ...out };
  return group;
}
