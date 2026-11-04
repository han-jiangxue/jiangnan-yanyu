// A Jiangnan house from a handful of numbers.
// Local frame: origin at the middle of the footprint on the ground (lane level), x along the bank, +z toward the
// canal, y up. The roof's ridge runs along x, its eaves face the water and the street.
//
// spec: {
//   W, D            frontage along the bank, depth (m)
//   floors          1 | 2
//   face            what faces the canal: 'water' (the plastered back of a house standing on the water) or
//                   'shop' (a timber shop front across a lane)
//   gables          [left, right]: 'plain' | 'mt2' | 'mt3' (stepped firewalls, 马头墙, two or three steps)
//   lod             0 full detail, 1 openings without trim, 2 massing only
//   tint            plaster tint [r, g, b]
//   pier            { x, dir } a back door with stone steps down to the water (water face only)
//   seed
// }
import * as THREE from 'three';
import { TILE_PITCH, COVER_FRAC, tileProfile } from './materials.js';
import { latticeUv, LATTICE_CELLS } from './textures.js';
import { rng } from '../lib/math.js';
import { BANK_Y, BED_Y, WATER_Y } from './layout.js';

export const PITCH = 0.5; // roof rise per metre run, about 27 degrees
export const PLINTH = 0.45;
const FLOOR1 = 3.1, FLOOR2 = 2.65, RAISE = 0.2;
const FIRE_T = 0.38; // firewall thickness
const SAG = 0.07; // the slight hollow of a roof slope
const SOFFIT = 0.1; // eave boards under the tiles

export const WOOD_COL = [0.66, 0.45, 0.33];
export const TIMBER_COL = [0.48, 0.38, 0.31];
export const FRAME_COL = [0.36, 0.25, 0.19];
const LATTICE_COL = [0.3, 0.2, 0.15];

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// a choice of the house's own, from its seed and a salt, so it does not disturb the house's other random choices
const pickOf = (spec, salt) => Math.abs(Math.sin(spec.seed * 91.7 + salt * 17.3) * 1e4) % 1;

// Floor heights, a little different from house to house (by its own seed) so that the eaves do not run down the canal
// in one straight line; the shops behind the corridor keep the standard heights its roof is built against.
export function floorsOf(spec) {
  if (spec.corridor) return { f1: FLOOR1, f2: FLOOR2, g1: RAISE + FLOOR1 };
  const f1 = FLOOR1 * (0.9 + 0.2 * pickOf(spec, 31)), f2 = FLOOR2 * (0.88 + 0.24 * pickOf(spec, 32));
  return { f1, f2, g1: RAISE + f1 };
}

// a two-storey house on the water whose upper floor is timber with a run of casements, as often as plaster
const upperTimber = (spec) => spec.face === 'water' && spec.floors === 2 && spec.lod < 2 && pickOf(spec, 21) < 0.45;

export function houseHeights(spec) {
  const { f1, f2 } = floorsOf(spec);
  const eaveH = RAISE + f1 + (spec.floors === 2 ? f2 : 0);
  const ridgeH = eaveH + PITCH * (spec.D / 2);
  return { eaveH, ridgeH };
}

// ------------------------------------------------------------------ small helpers

// a vertical quad in a z-plane facing s (+1 toward +z)
function quadZ(kit, mat, s, z, x0, x1, y0, y1, o = {}) {
  if (s > 0) kit.quad(mat, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], o);
  else kit.quad(mat, [x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], o);
}

// a sloped surface from a top edge (a0 -> a1) to a bottom edge (b0 -> b1), uv in metres (u along the top edge,
// v down the slope); faces up unless o.down. cols: extra positions (0..1) along the edge for the tile rows.
export function slope(kit, mat, a0, a1, b0, b1, o = {}) {
  const cols = o.cols || [0, 1];
  const nt = o.nt || 1;
  const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nt; j++) {
    const t = j / nt;
    for (const s of cols) {
      const top = [a0[0] + (a1[0] - a0[0]) * s, a0[1] + (a1[1] - a0[1]) * s, a0[2] + (a1[2] - a0[2]) * s];
      const bot = [b0[0] + (b1[0] - b0[0]) * s, b0[1] + (b1[1] - b0[1]) * s, b0[2] + (b1[2] - b0[2]) * s];
      const p = [top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t, top[2] + (bot[2] - top[2]) * t];
      if (o.shape) o.shape(p, s, t);
      pos.push(...p);
      const sl = Math.hypot(bot[0] - top[0], bot[1] - top[1], bot[2] - top[2]);
      uv.push(s * len, t * sl);
    }
  }
  const nc = cols.length;
  for (let j = 0; j < nt; j++) for (let i = 0; i < nc - 1; i++) {
    const a = j * nc + i, b = a + 1, c = a + nc, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // which way the winding faces, from the first cell
  const P = (k) => pos.slice(k * 3, k * 3 + 3);
  const A = P(0), B = P(1), C = P(nc);
  const ux = C[0] - A[0], uy = C[1] - A[1], uz = C[2] - A[2];
  const vx = B[0] - A[0], vy = B[1] - A[1], vz = B[2] - A[2];
  const ny = uz * vx - ux * vz;
  const wantUp = !o.down;
  if ((ny > 0) !== wantUp) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  kit.add(mat, g, { keepUv: true, ...o });
}

// positions (0..1 along x0..x1) at the key points of the tile rows, so the cross profile is sampled the same way in
// every row: channel start, crest of the cover, cover end, channel bottom
function rowCols(x0, x1, uOff) {
  const P = TILE_PITCH, L = x1 - x0;
  const keys = [0, COVER_FRAC * 0.5, COVER_FRAC, COVER_FRAC + (1 - COVER_FRAC) * 0.5];
  const out = [0];
  const k0 = Math.floor(uOff / P) - 1, k1 = Math.ceil((uOff + L) / P) + 1;
  for (let k = k0; k <= k1; k++) for (const f of keys) {
    const x = (k + f) * P - uOff;
    if (x > 0.01 && x < L - 0.01) out.push(x / L);
  }
  out.push(1);
  return out.sort((a, b) => a - b);
}

function boxM(cx, cy, cz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(cx, cy, cz), _q, _s.set(sx, sy, sz));
}

// a round silk lantern, 0.36 m tall, its foot at the origin
export function lanternGeometry() {
  const pts = [[0.05, 0], [0.13, 0.025], [0.19, 0.09], [0.215, 0.18], [0.19, 0.27], [0.13, 0.335], [0.05, 0.36]];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
}

// ------------------------------------------------------------------ snow along the eaves

const _le = new THREE.Euler(0, 0, 0, 'YXZ'), _lq = new THREE.Quaternion(), _ld = new THREE.Vector3(), _ln = new THREE.Vector3(), _ls = new THREE.Vector3();
// the turn about y that sends a lip's front out the way its slope falls: [falling toward +, toward -] off each axis
const LIP_YAW = { x: [0, Math.PI], z: [Math.PI / 2, -Math.PI / 2] };

// Snow lying along an eave or on a ridge's flat top: from the water this is all of a roof's snow that shows, a white
// lip over the tile ends. A box lying on the slope from the edge up, its front a little past the edge, collected in
// out.lips (when there is such a list) to be drawn instanced with the tile ends (town.js tileEnds), growing with the
// snow lying. (x, y, z): the middle of the edge in the local frame; len: its length along `axis` ('x' or 'z'); fall:
// +1 or -1, the way the slope runs down off that axis; tilt: the slope's angle, 0 for a flat top; o.depth up the
// slope, o.thick at its fullest, o.over how far the front stands past the edge (half the depth centres a flat top).
export function snowLip(kit, out, x, y, z, len, axis, fall, tilt, o = {}) {
  if (!out || !out.lips) return;
  const depth = o.depth ?? 0.3;
  // each lip a little thicker or thinner than the next, from where it is
  const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
  _le.set(tilt, LIP_YAW[axis][fall > 0 ? 0 : 1], 0);
  _lq.setFromEuler(_le);
  _ld.set(0, 0, 1).applyQuaternion(_lq); // down the slope
  _ln.set(0, 1, 0).applyQuaternion(_lq); // off it
  _p.set(x, y, z).addScaledVector(_ld, o.over ?? 0.03).addScaledVector(_ln, 0.015);
  out.lips.push(kit.m.clone().multiply(new THREE.Matrix4().compose(_p, _lq, _ls.set(len + 0.04, (o.thick ?? 0.07) * (0.7 + 0.3 * h), depth))));
}

// ------------------------------------------------------------------ windows and doors

function windowZ(kit, s, zf, x, y0, w, h, o = {}) {
  const R = o.R;
  quadZ(kit, o.paper ? 'paper' : 'dark', s, zf + s * 0.006, x - w / 2, x + w / 2, y0, y0 + h, { glow: o.glow ?? 0.8 });
  if (o.lod > 0) {
    // trim only: a frame of four quads' worth, cheap
    const fw = 0.08;
    quadZ(kit, 'timber', s, zf + s * 0.012, x - w / 2 - fw, x + w / 2 + fw, y0 + h, y0 + h + fw, { col: FRAME_COL });
    quadZ(kit, 'timber', s, zf + s * 0.012, x - w / 2 - fw, x + w / 2 + fw, y0 - fw, y0, { col: FRAME_COL });
    return;
  }
  const ci = o.cell ?? Math.floor(R.next() * LATTICE_CELLS);
  quadZ(kit, 'lattice', s, zf + s * 0.04, x - w / 2, x + w / 2, y0, y0 + h, { uv: latticeUv(ci), keepUv: true, rawUv: true, col: LATTICE_COL });
  const fw = 0.075, fd = 0.1;
  const zc = zf + s * fd / 2;
  kit.box('timber', x, y0 + h + fw / 2, zc, w + 2 * fw, fw, fd, { col: FRAME_COL });
  kit.box('timber', x, y0 - fw / 2, zc, w + 2 * fw, fw, fd, { col: FRAME_COL });
  kit.box('timber', x - w / 2 - fw / 2, y0 + h / 2, zc, fw, h, fd, { col: FRAME_COL });
  kit.box('timber', x + w / 2 + fw / 2, y0 + h / 2, zc, fw, h, fd, { col: FRAME_COL });
  kit.box('slab', x, y0 - fw - 0.035, zf + s * 0.08, w + 0.32, 0.07, 0.16);
  if (o.hood) hoodZ(kit, s, zf, x, y0 + h + fw + 0.04, w + 0.55, o.ctx);
}

// a little tiled hood over a window (小披檐)
function hoodZ(kit, s, zf, x, yb, wH, ctx) {
  const d = 0.46, rise = 0.24;
  const x0 = x - wH / 2, x1 = x + wH / 2;
  snowLip(kit, ctx, x, yb + 0.02, zf + s * d, wH, 'x', s, Math.atan2(rise, d), { depth: 0.22, thick: 0.05 });
  slope(kit, 'tile', [x0, yb + rise, zf], [x1, yb + rise, zf], [x0, yb, zf + s * d], [x1, yb, zf + s * d], { span: [-1, -1], spanRaw: true });
  slope(kit, 'timber', [x0, yb + rise - 0.06, zf], [x1, yb + rise - 0.06, zf], [x0, yb - 0.06, zf + s * d], [x1, yb - 0.06, zf + s * d], { down: true, col: FRAME_COL });
  kit.box('ridge', x, yb + rise + 0.04, zf + s * 0.05, wH + 0.04, 0.09, 0.11);
  kit.box('timber', x, yb - 0.08, zf + s * d, wH, 0.06, 0.03, { col: FRAME_COL });
}

// a narrow tiled pent roof along the whole front between the floors (腰檐), the line that gives a Jiangnan
// facade its horizontal rhythm
function waistEave(kit, spec, zf, y, depth, lod, ctx) {
  const rise = depth * 0.55;
  const x0 = -spec.W / 2 - 0.05, x1 = spec.W / 2 + 0.05;
  if (lod === 0) snowLip(kit, ctx, 0, y + 0.02, zf + depth, x1 - x0, 'x', 1, Math.atan2(rise, depth), { depth: 0.25, thick: 0.06 });
  slope(kit, 'tile', [x0, y + rise, zf], [x1, y + rise, zf], [x0, y, zf + depth], [x1, y, zf + depth], { span: [-1, -1], spanRaw: true });
  slope(kit, 'timber', [x0, y + rise - 0.07, zf], [x1, y + rise - 0.07, zf], [x0, y - 0.07, zf + depth], [x1, y - 0.07, zf + depth], { down: true, col: FRAME_COL });
  kit.box('timber', 0, y - 0.09, zf + depth, x1 - x0, 0.1, 0.035, { col: FRAME_COL });
  kit.box('ridge', 0, y + rise + 0.04, zf + 0.05, x1 - x0, 0.1, 0.12);
  // the eave's two triangular ends, so it does not show its edge as a sheet
  for (const sx of [-1, 1]) {
    const x = sx * (x1 - 0.01);
    const lo = y - 0.07, hi = y + rise;
    if (sx > 0) kit.quad('timber', [x, lo, zf + depth], [x, lo, zf], [x, hi, zf], [x, hi, zf], { col: FRAME_COL });
    else kit.quad('timber', [x, lo, zf], [x, lo, zf + depth], [x, hi, zf], [x, hi, zf], { col: FRAME_COL });
  }
  if (lod === 0) {
    for (let x = x0 + 0.12; x < x1 - 0.08; x += 0.3) kit.box('timber', x, y + rise / 2 - 0.1, zf + depth * 0.5, 0.05, 0.05, Math.hypot(depth, rise), { rx: Math.atan2(rise, depth), col: FRAME_COL });
  }
}

function doorZ(kit, s, zf, x, o = {}) {
  const w = o.w || 0.95, h = o.h || 2.05;
  const zc = zf + s * 0.06;
  kit.box('slab', x - w / 2 - 0.1, (h + 0.2) / 2, zc, 0.2, h + 0.2, 0.13);
  kit.box('slab', x + w / 2 + 0.1, (h + 0.2) / 2, zc, 0.2, h + 0.2, 0.13);
  kit.box('slab', x, h + 0.3, zc, w + 0.5, 0.22, 0.15);
  kit.box('slab', x, 0.09, zf + s * 0.16, w + 0.5, 0.18, 0.32);
  quadZ(kit, 'wood', s, zf + s * 0.01, x - w / 2, x + w / 2, 0.18, h + 0.19, { col: WOOD_COL, uvScale: 0.8 });
  quadZ(kit, 'dark', s, zf + s * 0.013, x - 0.012, x + 0.012, 0.18, h + 0.19, {});
  // door rings
  if (o.lod === 0) for (const dx of [-0.12, 0.12]) kit.cyl('timber', x + dx, 1.1, zf + s * 0.03, 0.05, 0.05, 0.015, { rx: Math.PI / 2, col: [0.2, 0.2, 0.2], sides: 8 });
}

// ------------------------------------------------------------------ facades facing the canal (+z)

// a lantern on a little bracket out from the wall (x, y = the lantern's foot, local), lit at dusk; for the lamp list
function wallLantern(kit, ctx, x, y, zf) {
  const zl = zf + 0.3;
  kit.box('timber', x, y + 0.5, zf + 0.15, 0.04, 0.04, 0.32, { col: TIMBER_COL });
  kit.box('timber', x, y + 0.42, zl, 0.015, 0.14, 0.015, { col: TIMBER_COL });
  kit.add('lantern', lanternGeometry(), { local: new THREE.Matrix4().makeTranslation(x, y, zl), glow: 1, steady: true });
  ctx.lamps.push(new THREE.Vector3(x, y + 0.18, zl).applyMatrix4(kit.m));
}

function waterFace(kit, spec, hh, R, zf, ctx, Rd) {
  const { W } = spec;
  const nb = Math.max(1, Math.round(W / 3.3));
  const bw = W / nb;
  const { g1 } = floorsOf(spec);
  const lamps = ctx && ctx.lamps && spec.lod < 2;
  // ground floor: a back door (to the steps, or onto the lane), small high windows elsewhere
  for (let i = 0; i < nb; i++) {
    const x = -W / 2 + bw * (i + 0.5);
    if (spec.door !== null && spec.door !== undefined && Math.abs(spec.door - x) < bw / 2) {
      doorZ(kit, 1, zf, spec.door, { lod: spec.lod });
      // most back doors onto the water steps keep a lantern by them, for coming home by boat after dark
      if (lamps && spec.pier && pickOf(spec, 5) < 0.7) {
        const sx = spec.pier.dir > 0 ? -1 : 1;
        wallLantern(kit, ctx, spec.door + sx * 0.82, 1.95, zf);
      }
      continue;
    }
    if (R.next() < 0.75) windowZ(kit, 1, zf, x + R.range(-0.4, 0.4), 1.15, R.range(0.7, 0.95), R.range(0.75, 0.95), { R: Rd, lod: spec.lod, hood: R.next() < 0.3, ctx });
  }
  if (spec.floors !== 2) return;
  const timber = upperTimber(spec);
  const balcony = timber && spec.lod === 0 && pickOf(spec, 22) < 0.4;
  if (spec.waist && !balcony) {
    waistEave(kit, spec, zf, g1 - 0.05, 0.5, spec.lod, ctx);
    // now and then a lantern hung under the waist eave, over the water
    if (lamps && pickOf(spec, 9) < 0.25) {
      const xl = -W / 2 + bw * (Math.floor(pickOf(spec, 11) * nb) + 0.5);
      kit.box('timber', xl, g1 - 0.24, zf + 0.3, 0.015, 0.3, 0.015, { col: TIMBER_COL });
      kit.add('lantern', lanternGeometry(), { local: new THREE.Matrix4().makeTranslation(xl, g1 - 0.75, zf + 0.3), glow: 1, steady: true });
      ctx.lamps.push(new THREE.Vector3(xl, g1 - 0.57, zf + 0.3).applyMatrix4(kit.m));
    }
  }
  if (timber) {
    // a timber upper floor: posts at the bays, a beam at the floor, casements across each bay; now and then a balcony
    for (let i = 0; i <= nb; i++) {
      const x = Math.min(W / 2 - 0.08, Math.max(-W / 2 + 0.08, -W / 2 + i * bw));
      kit.box('timber', x, (g1 + hh.eaveH) / 2, zf + 0.06, 0.16, hh.eaveH - g1, 0.14, { col: TIMBER_COL });
    }
    kit.box('timber', 0, g1 + 0.02, zf + 0.08, W, 0.22, 0.16, { col: TIMBER_COL });
    casementFloor(kit, spec, R, Rd, zf, nb, bw, g1, hh.eaveH, spec.lod);
    if (balcony) balconyZ(kit, spec, Rd, zf + 0.08, g1, nb, bw);
    return;
  }
  // a plastered upper floor: a window in each bay, two in a wide one
  for (let i = 0; i < nb; i++) {
    const x = -W / 2 + bw * (i + 0.5);
    if (R.next() < 0.12) continue;
    const two = bw > 3.4;
    const w = Math.min(two ? bw / 2 - 0.55 : bw - 0.7, R.range(1.0, 1.5));
    const h = R.range(0.95, 1.15), hood = R.next() < 0.45, paper = R.next() < 0.35;
    for (const dx of two ? [-bw / 4, bw / 4] : [0]) windowZ(kit, 1, zf, x + dx, g1 + 0.85, w, h, { R: Rd, lod: spec.lod, hood, paper, ctx });
  }
}

// an upper floor of timber across the front: boards up to the sill, a run of casements across each bay (lattice in
// full detail), a board up to the eave
function casementFloor(kit, spec, R, Rd, zf, nb, bw, g1, eaveH, lod) {
  const { W } = spec;
  const yw0 = g1 + 0.9, yw1 = eaveH - 0.2;
  for (let i = 0; i < nb; i++) {
    const x0 = -W / 2 + i * bw + 0.1, x1 = x0 + bw - 0.2;
    quadZ(kit, 'wood', 1, zf + 0.01, x0, x1, g1 + 0.13, yw0, { col: WOOD_COL });
    const paper = R.next() < 0.5;
    const n = Math.max(2, Math.round((x1 - x0) / 0.75));
    const cw = (x1 - x0) / n;
    quadZ(kit, paper ? 'paper' : 'dark', 1, zf + 0.005, x0, x1, yw0, yw1, { glow: 0.9 });
    if (lod === 0) {
      const ci = Math.floor(Rd.next() * LATTICE_CELLS);
      for (let k = 0; k < n; k++) {
        const a = x0 + k * cw, b = a + cw;
        quadZ(kit, 'lattice', 1, zf + 0.04, a + 0.03, b - 0.03, yw0 + 0.03, yw1 - 0.03, { uv: latticeUv(ci), keepUv: true, rawUv: true, col: LATTICE_COL });
        kit.box('timber', a, (yw0 + yw1) / 2, zf + 0.05, 0.05, yw1 - yw0, 0.08, { col: FRAME_COL });
      }
      kit.box('timber', (x0 + x1) / 2, yw0, zf + 0.06, x1 - x0, 0.07, 0.1, { col: FRAME_COL });
      kit.box('timber', (x0 + x1) / 2, yw1, zf + 0.06, x1 - x0, 0.07, 0.1, { col: FRAME_COL });
    } else {
      quadZ(kit, 'timber', 1, zf + 0.012, x0, x1, yw0 - 0.04, yw0 + 0.04, { col: FRAME_COL });
    }
  }
  // the board under the eave, above the casements
  quadZ(kit, 'wood', 1, zf + 0.01, -W / 2, W / 2, yw1, eaveH, { col: WOOD_COL });
}

// A balcony out over the water along the middle of the upper floor: a plank floor on brackets, a bench, and its back
// a panel of lattice leaning out over the water to rest against (美人靠).
function balconyZ(kit, spec, Rd, zf, g1, nb, bw) {
  const span = Math.min(spec.W - 0.6, nb >= 3 ? bw * (nb - 2) + bw * 0.5 : 3.0);
  const x0 = -span / 2, x1 = span / 2, d = 0.66, y = g1 + 0.1;
  kit.box('timber', 0, y, zf + d / 2, span, 0.09, d, { col: FRAME_COL });
  for (let x = x0 + 0.15; x <= x1 - 0.1; x += Math.max(0.9, span / 3)) {
    kit.box('timber', x, y - 0.3, zf + d * 0.42, 0.07, 0.07, 0.68, { rx: -0.72, col: FRAME_COL });
  }
  kit.box('timber', 0, y + 0.42, zf + d - 0.16, span, 0.05, 0.3, { col: TIMBER_COL });
  const ci = Math.floor(Rd.next() * LATTICE_CELLS);
  const n = Math.max(2, Math.round(span / 0.6)), sw = span / n;
  const lo = y + 0.46, hi = y + 1.0, z0 = zf + d - 0.02, z1 = zf + d + 0.17;
  for (let k = 0; k < n; k++) {
    const a = x0 + k * sw, b = a + sw;
    kit.quad('lattice', [a, lo, z0], [b, lo, z0], [b, hi, z1], [a, hi, z1], { uv: latticeUv(ci), keepUv: true, rawUv: true, col: LATTICE_COL });
  }
  kit.tube('timber', [new THREE.Vector3(x0, hi, z1), new THREE.Vector3(x1, hi, z1)], [0.03, 0.03], 6, { col: TIMBER_COL });
  for (const x of [x0, x1]) kit.box('timber', x, (y + hi) / 2, (z0 + z1) / 2, 0.07, hi - y, 0.07, { col: TIMBER_COL });
}

function shopFace(kit, spec, hh, R, zf, ctx, Rd) {
  const { W, lod } = spec;
  const { eaveH } = hh;
  const nb = Math.max(1, Math.round(W / 3.2));
  const bw = W / nb;
  const { g1 } = floorsOf(spec);
  const zp = zf + 0.1;
  // posts and beams
  for (let i = 0; i <= nb; i++) {
    const x = Math.min(W / 2 - 0.1, Math.max(-W / 2 + 0.1, -W / 2 + i * bw));
    kit.box('timber', x, eaveH / 2, zp, 0.2, eaveH, 0.2, { col: TIMBER_COL, span: [0, eaveH] });
  }
  kit.box('timber', 0, g1, zp, W, 0.26, 0.2, { col: TIMBER_COL });
  if (spec.waist && spec.floors === 2) waistEave(kit, spec, zf + 0.2, g1 + 0.18, 0.7, lod, ctx);
  // the step along the front
  kit.box('slab', 0, 0.09, zf + 0.42, W + 0.1, 0.18, 0.6);
  for (let i = 0; i < nb; i++) {
    const x0 = -W / 2 + i * bw + 0.1, x1 = x0 + bw - 0.2;
    const open = lod < 2 && R.next() < 0.4;
    if (open) {
      const zb = zf - 0.6, yt = g1 - 0.13;
      quadZ(kit, 'dark', 1, zb, x0, x1, 0.2, yt, { glow: 1 });
      // the open bay's sides, ceiling and floor, so it reads as a room and not a hole
      kit.quad('dark', [x0, 0.2, zf], [x0, 0.2, zb], [x0, yt, zb], [x0, yt, zf], { glow: 0.3, steady: true });
      kit.quad('dark', [x1, 0.2, zb], [x1, 0.2, zf], [x1, yt, zf], [x1, yt, zb], { glow: 0.3, steady: true });
      kit.quad('dark', [x0, yt, zf], [x0, yt, zb], [x1, yt, zb], [x1, yt, zf], { glow: 0.3, steady: true });
      kit.quad('dark', [x0, 0.2, zb], [x0, 0.2, zf], [x1, 0.2, zf], [x1, 0.2, zb], {});
      kit.box('wood', (x0 + x1) / 2, 0.5, zf - 0.15, x1 - x0, 0.9, 0.45, { col: WOOD_COL });
      // a lantern hung from the beam over some of the open shops (its own hash, so the house's other choices stay)
      if (ctx && ctx.lamps && pickOf(spec, i) < 0.5) {
        const xc = (x0 + x1) / 2, ly = g1 - 0.62, zl = zp + 0.28;
        kit.add('lantern', lanternGeometry(), { local: new THREE.Matrix4().makeTranslation(xc, ly, zl), glow: 1, steady: true });
        kit.box('timber', xc, g1 - 0.2, zl, 0.02, 0.3, 0.02, { col: TIMBER_COL });
        ctx.lamps.push(new THREE.Vector3(xc, ly + 0.18, zl).applyMatrix4(kit.m));
      }
    } else {
      quadZ(kit, 'wood', 1, zf + 0.02, x0, x1, 0.2, g1 - 0.13, { col: WOOD_COL, uvScale: 0.9 });
      // the boards' lintel and sill
      if (lod === 0) {
        kit.box('timber', (x0 + x1) / 2, 0.24, zf + 0.06, x1 - x0, 0.08, 0.06, { col: FRAME_COL });
      }
    }
  }
  if (spec.floors === 2) {
    casementFloor(kit, spec, R, Rd, zf, nb, bw, g1, eaveH, lod);
  } else {
    quadZ(kit, 'wood', 1, zf + 0.01, -W / 2, W / 2, g1 + 0.13, eaveH, { col: WOOD_COL });
  }
}

// ------------------------------------------------------------------ roof

function roof(kit, spec, hh, ctx) {
  const { W, D, lod } = spec;
  const { ridgeH } = hh;
  const left = spec.gables[0], right = spec.gables[1];
  const x0 = left === 'plain' ? -W / 2 - 0.26 : -W / 2 + FIRE_T / 2;
  const x1 = right === 'plain' ? W / 2 + 0.26 : W / 2 - FIRE_T / 2;
  const corr = lod === 0;
  const cols = corr ? rowCols(x0, x1, kit.uvOff[0]) : [0, 1];
  for (const side of [1, -1]) {
    const ov = side > 0 ? spec.ovF : spec.ovB;
    const zE = D / 2 + ov;
    const yE = ridgeH - PITCH * zE;
    const shape = (p, s, t) => {
      p[1] -= SAG * Math.sin(Math.PI * t);
      if (corr) p[1] += tileProfile(s * (x1 - x0) + kit.uvOff[0]) * 0.9;
    };
    slope(kit, 'tile', [x0, ridgeH, 0], [x1, ridgeH, 0], [x0, yE, side * zE], [x1, yE, side * zE], {
      cols, nt: corr ? 8 : 3, shape, ...(corr ? {} : { span: [-1, -1], spanRaw: true }),
    });
    // the eave boards underneath
    const under = (p, s, t) => { p[1] -= SAG * Math.sin(Math.PI * t) + SOFFIT; };
    slope(kit, 'timber', [x0, ridgeH, 0], [x1, ridgeH, 0], [x0, yE, side * zE], [x1, yE, side * zE], { nt: 3, shape: under, down: true, col: FRAME_COL });
    // fascia under the tile ends
    kit.box('timber', (x0 + x1) / 2, yE - 0.09, side * (zE - 0.02), x1 - x0, 0.12, 0.04, { col: FRAME_COL });
    if (lod === 0) {
      // the snow along the eave, lying on the covers' crests
      snowLip(kit, ctx, (x0 + x1) / 2, yE + 0.035, side * zE, x1 - x0, 'x', side, Math.atan(PITCH));
      // rafters under the overhang
      const ang = Math.atan(PITCH);
      for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.26) {
        const zm = side * (D / 2 + ov / 2);
        const tm = (D / 2 + ov / 2) / zE;
        const ym = ridgeH - PITCH * Math.abs(zm) - SAG * Math.sin(Math.PI * tm) - SOFFIT - 0.035;
        kit.box('timber', x, ym, zm, 0.06, 0.06, ov / Math.cos(ang), { rx: side * ang, col: FRAME_COL });
      }
      // tile ends: round caps on the covers, drip tiles on the channels (instanced, see town.js)
      const P = TILE_PITCH;
      const L = x1 - x0, uOff = kit.uvOff[0];
      for (let k = Math.ceil(uOff / P); (k + 1) * P - uOff < L + P; k++) {
        const xc = x0 + (k + COVER_FRAC * 0.5) * P - uOff;
        const xd = x0 + (k + COVER_FRAC + (1 - COVER_FRAC) * 0.5) * P - uOff;
        if (xc > x0 + 0.06 && xc < x1 - 0.06) ctx.caps.push(kit.m.clone().multiply(boxM(xc, yE + 0.025, side * (zE + 0.01), 0, side > 0 ? 0 : Math.PI, 0)));
        if (xd > x0 + 0.06 && xd < x1 - 0.06) ctx.drips.push(kit.m.clone().multiply(boxM(xd, yE - 0.03, side * (zE + 0.015), 0, side > 0 ? 0 : Math.PI, 0)));
      }
    }
  }
  // ridge, and the snow along its top
  kit.box('ridge', (x0 + x1) / 2, ridgeH + 0.12, 0, x1 - x0 + 0.04, 0.3, 0.24);
  if (lod === 0) snowLip(kit, ctx, (x0 + x1) / 2, ridgeH + 0.27, 0, x1 - x0 + 0.04, 'x', 1, 0, { depth: 0.24, thick: 0.06, over: 0.12 });
  for (const [sx, kind] of [[-1, left], [1, right]]) {
    if (kind !== 'plain') continue;
    const xe = sx < 0 ? x0 : x1;
    // the ridge end swept up into a horn (雌毛脊), the verge tiles and barge board down the gable
    kit.box('ridge', xe - sx * 0.12, ridgeH + 0.22, 0, 0.3, 0.42, 0.26);
    kit.box('ridge', xe + sx * 0.12, ridgeH + 0.48, 0, 0.55, 0.11, 0.15, { rz: sx * 0.62 });
    for (const side of [1, -1]) {
      const ov = side > 0 ? spec.ovF : spec.ovB;
      const zE = D / 2 + ov, yE = ridgeH - PITCH * zE;
      const len = Math.hypot(zE, ridgeH - yE);
      const ang = Math.atan(PITCH);
      kit.box('ridge', xe - sx * 0.06, (ridgeH + yE) / 2 + 0.03, side * zE / 2, 0.16, 0.1, len, { rx: side * ang });
      kit.box('timber', xe + sx * 0.01, (ridgeH + yE) / 2 - 0.12, side * zE / 2, 0.04, 0.2, len, { rx: side * ang, col: FRAME_COL });
    }
  }
}

// ------------------------------------------------------------------ walls

function walls(kit, spec, hh) {
  const { W, D, tint, gables } = spec;
  const { eaveH, ridgeH } = hh;
  const wallTop = (z) => ridgeH - PITCH * Math.abs(z) - 0.14;
  const eaveTop = eaveH - 0.12;
  // plinth of grey brick
  kit.boxY('brick', 0, 0, W + 0.05, D + 0.05, -0.1, PLINTH);
  // street side (back, -z): plastered
  quadZ(kit, 'plaster', -1, -D / 2, -W / 2, W / 2, PLINTH, eaveTop, { col: tint, span: [0, eaveH] });
  // canal side: plastered unless it is a timber shop front, which closes the front itself (or, on a timber upper
  // floor, plastered up to the first floor only)
  if (spec.face === 'water') quadZ(kit, 'plaster', 1, D / 2, -W / 2, W / 2, PLINTH, upperTimber(spec) ? floorsOf(spec).g1 + 0.1 : eaveTop, { col: tint, span: [0, eaveH] });
  // gable walls up to the roof line, in two halves so the eave height interpolates exactly along each
  for (const [sx, kind] of [[-1, gables[0]], [1, gables[1]]]) {
    if (kind !== 'plain') continue;
    const x = sx * W / 2;
    const sp = (p) => [0, wallTop(p.z) + 0.14];
    for (const [za, zb] of [[-D / 2, 0], [0, D / 2]]) {
      // corners in order so the quad faces outward (sx)
      const A = [x, PLINTH, sx > 0 ? zb : za], B = [x, PLINTH, sx > 0 ? za : zb];
      const C = [x, wallTop(sx > 0 ? za : zb), sx > 0 ? za : zb], Dd = [x, wallTop(sx > 0 ? zb : za), sx > 0 ? zb : za];
      kit.quad('plaster', A, B, C, Dd, { col: tint, span: sp });
    }
  }
}

// stepped firewalls (马头墙): columns of wall stepping down from the ridge, each capped with a small tiled roof and
// ending in an upturned block
function firewall(kit, spec, hh, sx, steps, ctx) {
  const { D, W, tint, lod } = spec;
  const { ridgeH } = hh;
  const cx = sx * W / 2;
  const a3 = D / 2 + 0.42;
  const nSide = steps === 3 ? 2 : 1;
  const c0 = a3 * (steps === 3 ? 0.26 : 0.38);
  const cols = [{ za: -c0, zb: c0, top: ridgeH + 0.72, end: 0 }];
  for (let j = 1; j <= nSide; j++) {
    const zi = c0 + ((a3 - c0) * (j - 1)) / nSide, zo = c0 + ((a3 - c0) * j) / nSide;
    const top = ridgeH - PITCH * zi + 0.6;
    cols.push({ za: zi, zb: zo, top, end: 1 });
    cols.push({ za: -zo, zb: -zi, top, end: -1 });
  }
  kit.boxY('brick', cx, 0, FIRE_T + 0.05, 2 * a3 + 0.05, -0.1, PLINTH);
  const capW = FIRE_T / 2 + 0.15;
  for (const c of cols) {
    const len = c.zb - c.za;
    const zc = (c.za + c.zb) / 2;
    kit.boxY('plaster', cx, zc, FIRE_T, len, PLINTH, c.top - 0.05, { col: tint, span: [0, c.top] });
    if (lod === 2) {
      kit.box('ridge', cx, c.top + 0.03, zc, FIRE_T + 0.26, 0.16, len + 0.1);
      continue;
    }
    // the cap: two short tiled slopes along the wall, a ridge on top
    const yr = c.top + 0.12, ye = c.top - 0.03;
    for (const s of [-1, 1]) {
      slope(kit, 'tile', [cx, yr, c.za - 0.05], [cx, yr, c.zb + 0.05], [cx + s * capW, ye, c.za - 0.05], [cx + s * capW, ye, c.zb + 0.05], { span: [-1, -1], spanRaw: true });
      slope(kit, 'timber', [cx, yr - 0.07, c.za - 0.05], [cx, yr - 0.07, c.zb + 0.05], [cx + s * capW, ye - 0.07, c.za - 0.05], [cx + s * capW, ye - 0.07, c.zb + 0.05], { down: true, col: FRAME_COL });
    }
    kit.box('ridge', cx, yr + 0.04, zc, 0.13, 0.1, len + 0.1);
    // snow along both of the cap's eaves and on its ridge: the stepped white lines of a firewall in snow
    if (lod === 0) {
      for (const s of [-1, 1]) snowLip(kit, ctx, cx + s * capW, ye + 0.02, zc, len + 0.1, 'z', s, Math.atan2(yr - ye, capW), { depth: 0.2, thick: 0.05 });
      snowLip(kit, ctx, cx, yr + 0.09, zc, len + 0.1, 'z', 1, 0, { depth: 0.14, thick: 0.05, over: 0.07 });
    }
    // the upturned block (座头) at the outer end of each step
    if (c.end !== 0) {
      const ze = c.end > 0 ? c.zb : c.za;
      kit.box('ridge', cx, yr + 0.12, ze, 0.2, 0.22, 0.32);
      if (lod === 0) kit.box('ridge', cx, yr + 0.3, ze + c.end * 0.16, 0.12, 0.08, 0.42, { rx: c.end * -0.55 });
    }
  }
}

// ------------------------------------------------------------------ steps down to the water (河埠头)

// stone steps standing out from the bank, running down parallel to it. Local frame of the caller: the bank edge at
// z = zb, water toward +z, ground at y = 0 (lane level). From the landing at x = px they step down toward dir.
export function pierSteps(kit, px, dir, zb, o = {}) {
  const depth = o.depth || 0.95;
  const landW = o.landW || 1.1;
  const rise = 0.165, run = 0.3;
  const bed = BED_Y - BANK_Y;
  const z0 = zb, z1 = zb + depth;
  kit.box('slab', px, (bed - 0.03) / 2, (z0 + z1) / 2, landW, -bed - 0.03, depth, {});
  const n = Math.ceil((BANK_Y - WATER_Y + 0.05) / rise);
  for (let i = 1; i <= n; i++) {
    const top = -0.03 - i * rise;
    const xa = px + dir * (landW / 2 + (i - 1) * run), xb = xa + dir * run;
    kit.box('slab', (xa + xb) / 2, (top + bed) / 2, (z0 + z1) / 2, run + 0.004, top - bed, depth, {});
  }
  // a mooring stone set into the bank, its ring for the boat's rope
  if (o.mooring) {
    const mx = px - dir * 0.9;
    kit.box('slab', mx, -0.42, zb + 0.06, 0.34, 0.3, 0.14);
    kit.cyl('timber', mx, -0.42, zb + 0.14, 0.07, 0.07, 0.03, { rx: Math.PI / 2, col: [0.18, 0.18, 0.18], sides: 10, open: true });
  }
}

// ------------------------------------------------------------------ the house

export function buildHouse(kit, spec, ctx) {
  const R = rng(spec.seed);
  // the choices only full detail makes (lattice patterns) draw from their own sequence, so that a house comes out
  // with the same doors, windows and casements at every level of detail (the mirror's copy must match the house)
  const Rd = rng(spec.seed * 7 + 3);
  const { g1 } = floorsOf(spec);
  const hh = houseHeights(spec);
  const { W, D, lod } = spec;
  walls(kit, spec, hh);
  for (const [sx, kind] of [[-1, spec.gables[0]], [1, spec.gables[1]]]) {
    if (kind === 'mt2') firewall(kit, spec, hh, sx, 2, ctx);
    if (kind === 'mt3') firewall(kit, spec, hh, sx, 3, ctx);
  }
  roof(kit, spec, hh, ctx);
  const zf = D / 2;
  if (lod === 2) {
    // massing only: a rhythm of dark openings
    const nb = Math.max(1, Math.round(W / 3.3));
    for (let i = 0; i < nb; i++) {
      const x = -W / 2 + (W / nb) * (i + 0.5);
      if (spec.face === 'shop') quadZ(kit, 'wood', 1, zf + 0.01, x - W / nb / 2 + 0.1, x + W / nb / 2 - 0.1, 0.2, g1, { col: WOOD_COL });
      else quadZ(kit, 'dark', 1, zf + 0.01, x - 0.45, x + 0.45, 1.2, 2.0, { glow: 0.7 });
      if (spec.floors === 2) quadZ(kit, 'dark', 1, zf + 0.01, x - 0.6, x + 0.6, g1 + 0.9, g1 + 1.9, { glow: 0.8 });
    }
    return hh;
  }
  if (spec.face === 'water') waterFace(kit, spec, hh, R, zf, ctx, Rd);
  else shopFace(kit, spec, hh, R, zf - 0.02, ctx, Rd);
  // the street side: a door and a window, for the orbiting camera
  if (lod === 0) {
    doorZ(kit, -1, -D / 2, R.range(-W / 4, W / 4), { lod });
    if (spec.floors === 2) windowZ(kit, -1, -D / 2, R.range(-W / 4, W / 4), g1 + 0.9, 1.1, 1.0, { R: Rd, lod: 1 });
  }
  if (spec.pier && spec.face === 'water') pierSteps(kit, spec.pier.x, spec.pier.dir, D / 2 + spec.bankGap, { mooring: lod === 0 });
  return hh;
}
