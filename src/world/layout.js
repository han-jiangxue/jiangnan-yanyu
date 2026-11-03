// The canal and the ground it runs through: a centre line x(z) with a width, the two banks, which bank has houses
// standing in the water and which a slab lane, and the bridge. Everything is a pure function of z, so the town,
// the water and the camera agree without sharing state.
//
// Coordinates: metres, y up, the canal runs toward -z. Water at y = 0, the lanes on top of the embankment at
// BANK_Y, the canal bed at BED_Y.
import { clamp, smoothstep } from '../lib/math.js';

export const WATER_Y = 0;
export const BANK_Y = 1.3;
export const BED_Y = -1.7;
export const LANE_W = 3.2;

// how far the canal is built; the M1 stretch is roughly +30 .. -230, the rest is the town fading into the rain
export const Z0 = 260;
export const Z1 = -560;
export const CORE = { z0: 40, z1: -240 };
// where the first row is built in full detail: the whole journey, from behind the start to a little past the end,
// where the canal already fades into the mist (START_Z + 30 and END_Z - 18 in journey/route.js). CORE still decides
// the town's plan; this only the detail.
export const DETAIL = { z0: 104, z1: -270 };

export const BRIDGE_Z = -95;
export const BRIDGE_SPAN = 9.0;

// Granite slab bridges (石板桥) in 枕河人家, where the poem has 水港小桥多: three spans of long slabs on two piers,
// from the lane on the left bank to an alley between the houses on the right (the house that stood there is left out).
// pierX: the piers either side of the middle span, which the boats pass through.
export const SLAB_BRIDGES = [{ z: -167.5 }, { z: -212 }];
export const SLAB = { width: 1.5, top: BANK_Y + 1.5, thick: 0.34, pierX: 2.4, pierT: 0.5, land: 1 };
export const nearSlabBridge = (z, d) => SLAB_BRIDGES.some((b) => Math.abs(z - b.z) < d);

// the covered corridor along the lane (廊棚): which bank and the stretch of it, z0 > z1
export const CORRIDOR = { side: 1, z0: -10, z1: -64 };

// the town's gate (牌坊) across the lane where the journey comes into town
export const GATE = { side: 1, z: 46, text: '江南水乡' };

const rawX = (z) => {
  let x = 1.6 * Math.sin(z / 58 + 0.9) + 0.9 * Math.sin(z / 23 + 2.4);
  // the canal turns out of sight at both ends, so a view along it closes on house fronts instead of a vanishing point
  if (z < -205) x += 0.0011 * (z + 205) ** 2;
  if (z > 60) x -= 0.0009 * (z - 60) ** 2;
  return x;
};
const X_OFF = rawX(BRIDGE_Z);

export const canalX = (z) => rawX(z) - X_OFF;

// a little wider and narrower along its length, exactly the bridge's span where the bridge stands
export function canalW(z) {
  const w = 9.0 + 0.9 * Math.sin(z / 37 + 1.3) + 0.5 * Math.sin(z / 13 + 0.2);
  return w + (BRIDGE_SPAN - w) * smoothstep(14, 5, Math.abs(z - BRIDGE_Z));
}

// side: -1 left (smaller x), +1 right
export const bankX = (z, side) => canalX(z) + (side * canalW(z)) / 2;

// slope of the centre line, dx/dz; the canal's heading as a rotation about y for something facing down it
export const canalSlope = (z) => (canalX(z + 0.5) - canalX(z - 0.5)) / 1.0;

// which bank has houses standing on the water and which a lane: they swap at the bridge
export function bankKind(z, side) {
  const before = z > BRIDGE_Z;
  if (side < 0) return before ? 'water' : 'lane';
  return before ? 'lane' : 'water';
}

// unit normal of a bank pointing away from the water, in xz
export function bankNormal(z, side) {
  const s = canalSlope(z);
  const len = Math.hypot(1, s);
  // tangent along -z is (-s, -1)/len; the outward normal on the right bank is (1, -s)/len
  return { x: (side * 1) / len, z: (side * -s) / len };
}

// distance (m) from the core stretch, for level of detail
export const coreDist = (z) => (z > CORE.z0 ? z - CORE.z0 : z < CORE.z1 ? CORE.z1 - z : 0);
export const detailDist = (z) => (z > DETAIL.z0 ? z - DETAIL.z0 : z < DETAIL.z1 ? DETAIL.z1 - z : 0);
// lots in the core first, the rest after: decor placed lot by lot from one random sequence keeps the places it had
// in the core whatever is added outside it
export const coreFirst = (lots) => [...lots.filter((l) => coreDist(l.zc) === 0), ...lots.filter((l) => coreDist(l.zc) > 0)];

// horizontal distance from a point to the nearest bank line, positive on land
export function landDepth(x, z) {
  const c = canalX(z), hw = canalW(z) / 2;
  return Math.abs(x - c) - hw;
}

export const inCanal = (x, z) => landDepth(x, z) < 0 && z < Z0 && z > Z1;

export { clamp };
