// Covered boats (乌篷船): a narrow hull lofted from cross sections, three arched awnings of black woven bamboo, a
// sculling oar (橹) on a pin at the stern, a paper lantern on a pole at the bow, and the boatman in a straw cape and a
// bamboo hat (蓑衣斗笠) working the oar. The hull carries a floor just above the waterline, which hides the canal's
// surface inside it.
// Local frame: origin on the waterline amidships, +z toward the bow, y up.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { patch } from '../core/shared.js';
import { LAYER_DYN } from '../core/pipeline.js';
import { createLocalDrips } from '../fx/drips.js';
import { face } from './people.js';
import { rng, smoothstep } from '../lib/math.js';

const LEN = 7.2, HALF = LEN / 2, BEAM = 0.66;
export const hullW = (z) => BEAM * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z) / HALF, 2.4)), 0.55);
const sheer = (z) => 0.3 + 0.24 * Math.pow(Math.abs(z) / HALF, 2.6); // gunwale height over the water
const draft = (z) => 0.3 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(z) / HALF, 2)));
// a point on the hull at station z, section angle a (-pi/2 port gunwale, 0 keel, pi/2 starboard gunwale)
function hullPt(z, a, inset = 0) {
  const w = Math.max(0, hullW(z) - inset), f = sheer(z), d = Math.max(0, draft(z) - inset);
  return [w * Math.sin(a), -d + (f + d) * (1 - Math.cos(a)), z];
}
const FLOOR_Y = 0.07;
const PIN = new THREE.Vector3(0.18, sheer(-3.05) + 0.16, -3.05);
const MAN = new THREE.Vector3(0.05, sheer(-2.45) - 0.05, -2.45);
const HANDLE = new THREE.Vector3(0, 0.84, 1.12); // on the oar, from the pin: out in front of the boatman's cape

let shared = null;
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// the boat's own materials, made once
function boatMaterials(mats, tex) {
  if (shared) return shared;
  const R = rng(81);
  // Split-bamboo matting woven two over two, tarred and sooted black (乌篷): strips of uneven width and tone, worn a
  // little paler along their edges, the weave soft rather than a crisp pattern
  // (strips about two and a half centimetres wide on the awning, a shallow difference between those on top and those
  // under, each strip its own tone, with a few knots and scuffs: a mat, not a fabric)
  const weave = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(34, 29, 24)';
    g.fillRect(0, 0, w, h);
    const s = 16;
    const across = Array.from({ length: w / s }, () => R.range(-4, 4)), along = Array.from({ length: h / s }, () => R.range(-4, 4));
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const i = x / s, j = y / s;
      const over = ((i + j) >> 1) % 2 === 0;
      const l = (over ? 40 : 31) + (over ? along[j] : across[i]) * 1.5 + R.range(-2, 2);
      g.fillStyle = `rgb(${l + 5}, ${l + 1}, ${l - 4})`;
      g.fillRect(x, y, s, s);
      // the strip's soft edges
      g.fillStyle = 'rgba(0, 0, 0, 0.18)';
      if (over) { g.fillRect(x, y, s, 1); g.fillRect(x, y + s - 1, s, 1); } else { g.fillRect(x, y, 1, s); g.fillRect(x + s - 1, y, 1, s); }
    }
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(${R.next() < 0.5 ? '120, 100, 80' : '0, 0, 0'}, ${R.range(0.05, 0.14)})`;
      g.fillRect(R.next() * w, R.next() * h, R.range(2, 10), R.range(1, 3));
    }
  });
  // straw: a solid layer of strands, ragged at the hem (the canvas's top row is the lathe's last profile point)
  const straw = canvasTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgb(118, 98, 62)';
    g.fillRect(0, h * 0.12, w, h * 0.88);
    for (let i = 0; i < 520; i++) {
      const x = R.next() * w, y0 = R.next() * h * 0.12, len = R.range(0.6, 1.0) * h;
      const l = R.range(120, 190);
      g.strokeStyle = `rgba(${l}, ${l * 0.86}, ${l * 0.55}, ${R.range(0.6, 1)})`;
      g.lineWidth = R.range(1, 2.5);
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + R.range(-4, 4), Math.min(h, y0 + len));
      g.stroke();
    }
  });
  // a boat carries its rain and snow under the bridges with it
  const mk = (key, params, o = {}) => patch(new THREE.MeshStandardMaterial({ vertexColors: true, ...params }), { key, carried: true, ...o });
  shared = {
    // Planks oiled with tung oil (桐油) and gone dark with years of it: a seam between each strake, no two strakes quite
    // the same brown, the wood worn paler along the gunwale where hands and ropes rub it, and a wet dark band with a
    // green skin of weed at the waterline. Oiled, not lacquered: it hardly shines unless wet
    hull: mk('boat-hull', { map: tex.old_planks_02_c, normalMap: tex.old_planks_02_n, normalScale: new THREE.Vector2(0.8, 0.8), color: 0x6a5038, roughness: 0.82 }, {
      wet: 0.4,
      gloss: 0.35,
      hooks: {
        map: /* glsl */ `
          {
            float jnS = clamp(vMapUv.x / 2.2, 0.0, 1.0);
            float jnK = jnS * 18.0;
            float jnId = floor(jnK);
            diffuseColor.rgb *= 0.78 + 0.4 * fract(sin(jnId * 91.7 + 3.1) * 43758.5453);
            diffuseColor.rgb *= 1.0 - 0.7 * smoothstep(0.4, 0.5, abs(fract(jnK) - 0.5));
            // grain and grime along the length, at the scale of the planks
            diffuseColor.rgb *= 0.85 + 0.3 * sfNoise(vec2(vMapUv.y * 3.0, jnId * 1.7));
            float jnWear = smoothstep(0.09, 0.0, min(jnS, 1.0 - jnS));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.9, 1.75, 1.5), jnWear * 0.7);
            float jnWl = smoothstep(0.14, 0.02, vSfWP.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.62, 0.5), jnWl);
          }`,
      },
    }),
    // no snow on the floor and the decks: a boat moves, so the rain-occlusion map cannot keep it out from under the
    // awnings, and the boatman sweeps his decks
    inner: mk('boat-inner', { map: tex.weathered_planks_c, color: 0x9a8270, roughness: 0.8 }, { wet: 0.4, gloss: 0.4, snow: 0 }),
    // the matting is tarred black outside; seen from under it (the back faces) it is split bamboo, warm and pale
    awning: mk('boat-awning', { map: weave, roughness: 0.9, side: THREE.DoubleSide }, {
      wet: 0.3,
      gloss: 0.15,
      hooks: {
        map: /* glsl */ `
          // outside: soot and dust lying unevenly, and patches where the old tar has worn through to brown
          if (gl_FrontFacing) {
            diffuseColor.rgb *= 0.75 + 0.5 * sfNoise(vMapUv * vec2(0.6, 1.2) + 3.7);
            float jnWorn = smoothstep(0.5, 0.8, sfNoise(vMapUv * vec2(1.3, 2.1) + 11.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(2.2, 1.75, 1.25), jnWorn * 0.75);
          }
          else {
            float jnL = dot(diffuseColor.rgb, vec3(0.333));
            diffuseColor.rgb = vec3(0.34, 0.24, 0.13) * clamp(0.75 + 0.25 * (jnL / 0.012 - 1.0), 0.72, 1.18);
          }`,
      },
    }),
    bamboo: mk('boat-bamboo', { map: tex.old_planks_02_c, color: 0xa08a62, roughness: 0.75 }, { wet: 0.4, gloss: 0.35 }),
    // the cape is palm fibre, dark and shaggy; the hat split bamboo, pale
    straw: mk('boat-straw', { map: straw, color: 0x6a5840, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.95 }, { wet: 0.6, gloss: 0.25 }),
    hat: mk('boat-hat', { map: straw, color: 0xf2e2c0, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.85 }, { wet: 0.4, gloss: 0.3 }),
    cloth: mk('boat-cloth', { color: 0x1c2233, roughness: 0.95 }, { wet: 0.5, gloss: 0.2 }),
    // weathered, sunburnt
    skin: mk('boat-skin', { color: 0x7a5844, roughness: 0.75 }, { wet: 0.2, gloss: 0.3 }),
    paper: mats.paper,
  };
  return shared;
}

// a surface over a (s, t) grid, faced the way `want` points at the first cell
function surface(kit, mat, ns, nt, f, uvf, flip, o = {}) {
  kit.grid(mat, ns, nt, f, uvf, { flip, ...o });
}

function buildHull(kit) {
  const NZ = 28, NA = 14;
  const zAt = (t) => -HALF + t * LEN;
  // outer planking, inner planking, the floor that hides the water inside
  surface(kit, 'hull', NA, NZ, (s, t) => hullPt(zAt(t), (s - 0.5) * Math.PI), (s, t) => [s * 2.2, zAt(t) / 1.6], true, { rawUv: true });
  surface(kit, 'inner', NA, NZ, (s, t) => hullPt(zAt(t), (s - 0.5) * Math.PI, 0.035), (s, t) => [s * 2.2, zAt(t) / 1.6], false, { rawUv: true });
  const floorX = (z) => {
    const w = Math.max(0, hullW(z) - 0.035), f = sheer(z), d = Math.max(0.01, draft(z) - 0.035);
    const c = 1 - (FLOOR_Y + d) / (f + d);
    return c <= -1 ? w : w * Math.sin(Math.acos(Math.max(-1, Math.min(1, c))));
  };
  surface(kit, 'inner', 2, 20, (s, t) => { const z = -3.2 + t * 6.4; const x = floorX(z); return [(s - 0.5) * 2 * x, FLOOR_Y, z]; }, (s, t) => [s, t * 4], false, { rawUv: true });
  // gunwales and stems
  for (const a of [-Math.PI / 2, Math.PI / 2]) {
    const pts = [];
    for (let i = 0; i <= NZ; i++) pts.push(new THREE.Vector3(...hullPt(zAt(i / NZ), a, 0.017)).add(new THREE.Vector3(0, 0.015, 0)));
    kit.tube('bamboo', pts, pts.map(() => 0.03), 6, { col: [0.55, 0.45, 0.36] });
  }
  // a rubbing strake (护舷) along each side a little below the gunwale
  for (const a of [-Math.PI / 2 + 0.42, Math.PI / 2 - 0.42]) {
    const pts = [];
    for (let i = 2; i <= NZ - 2; i++) pts.push(new THREE.Vector3(...hullPt(zAt(i / NZ), a, -0.012)));
    kit.tube('bamboo', pts, pts.map(() => 0.02), 5, { col: [0.32, 0.26, 0.2] });
  }
  for (const zs of [-1, 1]) {
    const z = zs * (HALF - 0.02);
    kit.box('hull', 0, (sheer(z) - 0.2) / 2, z, 0.08, sheer(z) + 0.2, 0.08, {});
  }
  // the decks fore and aft, where the boatman stands and the lantern is raised
  for (const [z0, z1] of [[2.15, 3.35], [-3.35, -1.95]]) {
    surface(kit, 'inner', 2, 6, (s, t) => { const z = z0 + t * (z1 - z0); const w = hullW(z) - 0.02; return [(s - 0.5) * 2 * w, sheer(z) - 0.05, z]; }, (s, t) => [s * 1.3, t * (z1 - z0)], z0 > z1 ? true : false, { rawUv: true, col: [1.05, 1.0, 0.95] });
  }
}

// the awnings, stern to bow: [z0, z1, height of the arch]
const AWNINGS = [[-1.85, -0.58, 0.78], [-0.66, 0.66, 0.85], [0.58, 1.9, 0.78]];
const awningBase = (z0, z1) => sheer((z0 + z1) / 2) - 0.02;

function buildAwnings(kit) {
  for (const [z0, z1, H] of AWNINGS) {
    const base = awningBase(z0, z1);
    const Wa = 0.7;
    // the matting stands out a little over each hoop and sags between them, and is never quite even
    const hoops = [0, 1, 2, 3].map((k) => z0 + ((k + 0.5) / 4) * (z1 - z0));
    const swell = (th, z) => {
      const near = Math.min(...hoops.map((hz) => Math.abs(z - hz)));
      const lump = Math.sin(th * 7.3 + z * 9.1) * Math.sin(z * 17.0 + th * 3.0);
      return 0.007 * Math.exp(-near * near * 900) - 0.016 * smoothstep(0.03, 0.16, near) + 0.006 * lump;
    };
    const P = (th, z) => { const r = 1 + swell(th, z) * Math.cos(th * 0.5); return [Wa * r * Math.sin(th), base + H * r * Math.cos(th), z]; };
    // a point just inside the shell: stepped in along the arch's inward normal
    const Pin = (th, z, d) => {
      const nx = Math.sin(th) / Wa, ny = Math.cos(th) / H, l = Math.hypot(nx, ny);
      const [x, y] = P(th, z);
      return new THREE.Vector3(x - (nx / l) * d, y - (ny / l) * d, z);
    };
    surface(kit, 'awning', 32, 3, (s, t) => P((s - 0.5) * Math.PI, z0 + t * (z1 - z0)), (s, t) => [s * 6, (z0 + t * (z1 - z0)) * 2.5], false, { rawUv: true });
    for (const z of [z0 + 0.03, z1 - 0.03]) {
      const pts = [];
      for (let i = 0; i <= 32; i++) pts.push(new THREE.Vector3(...P((i / 32 - 0.5) * Math.PI, z)).multiply(new THREE.Vector3(1.03, 1, 1)).add(new THREE.Vector3(0, 0.02, 0)));
      kit.tube('bamboo', pts, pts.map(() => 0.024), 6, { col: [0.8, 0.66, 0.48] });
    }
    // inside: bamboo hoops holding the matting up, and a batten along the ridge, what the seat looks up at
    for (let k = 0; k < 4; k++) {
      const z = z0 + ((k + 0.5) / 4) * (z1 - z0);
      const pts = [];
      for (let i = 0; i <= 24; i++) pts.push(Pin((i / 24 - 0.5) * Math.PI * 0.98, z, 0.02));
      kit.tube('bamboo', pts, pts.map(() => 0.013), 5, {});
    }
    kit.tube('bamboo', [Pin(0, z0 + 0.06, 0.03), Pin(0, z1 - 0.06, 0.03)], [0.012, 0.012], 5, {});
  }
}

// where the rain runs off the awnings: all along their lower edges into the canal, and all round the rims of the open
// ends at bow and stern, past the gunwale into the water or inside onto the floor (the curtain of drops the seat
// looks out through). [x, y, z, fall, lands in water] in the boat's frame, for createLocalDrips
function awningDrips() {
  const out = [];
  for (const [z0, z1] of AWNINGS) {
    const base = awningBase(z0, z1);
    for (const sx of [-1, 1]) for (let z = z0 + 0.12; z < z1 - 0.06; z += 0.24) out.push([sx * 0.74, base, z, base, 1]);
  }
  for (const [z0, z1, H] of [AWNINGS[0], AWNINGS[2]]) {
    const z = z1 > 1 ? z1 + 0.04 : z0 - 0.04, base = awningBase(z0, z1);
    for (const a of [0.18, 0.42, 0.66, 0.88, 1.08, 1.27, 1.45]) for (const th of [-a, a]) {
      const x = 0.72 * Math.sin(th), y = base + H * Math.cos(th);
      const water = Math.abs(x) > hullW(z) - 0.04;
      out.push([x, y, z, water ? y : y - FLOOR_Y, water ? 1 : 0]);
    }
  }
  return out;
}

// where a downpour's drops are seen to bounce on the awnings (fx/splash.js): sixteen points over the top of each, in the
// boat's frame
export function awningSplashPoints() {
  const R = rng(61);
  const out = [];
  for (const [z0, z1, H] of AWNINGS) {
    const base = awningBase(z0, z1);
    for (let i = 0; i < 16; i++) {
      const th = R.range(-0.95, 0.95), z = R.range(z0 + 0.06, z1 - 0.06);
      out.push([0.7 * Math.sin(th), base + H * Math.cos(th), z]);
    }
  }
  return out;
}

// the lantern hangs from a pole leaning out over the bow's starboard side, clear of the view from under the awning
function buildLantern(kit) {
  const z = 3.1, y0 = sheer(z) - 0.05, x = 0.4;
  kit.tube('bamboo', [new THREE.Vector3(0.08, y0, z), new THREE.Vector3(0.24, y0 + 0.5, z + 0.1), new THREE.Vector3(x, y0 + 0.64, z + 0.18)], [0.02, 0.016, 0.013], 5, {});
  kit.tube('bamboo', [new THREE.Vector3(x, y0 + 0.64, z + 0.18), new THREE.Vector3(x, y0 + 0.54, z + 0.18)], [0.004, 0.004], 4, {});
  const pts = [[0.03, 0], [0.09, 0.02], [0.12, 0.07], [0.125, 0.12], [0.11, 0.17], [0.07, 0.205], [0.03, 0.22]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  kit.add('paper', g, { local: new THREE.Matrix4().makeTranslation(x, y0 + 0.33, z + 0.18), glow: 0.4, steady: true });
  return new THREE.Vector3(x, y0 + 0.44, z + 0.18);
}

// a small paper lantern on a cord, its foot at (x, y, z)
function smallLantern(kit, x, y, z, glow) {
  const pts = [[0.025, 0], [0.07, 0.016], [0.095, 0.055], [0.1, 0.095], [0.088, 0.135], [0.055, 0.162], [0.025, 0.175]];
  kit.add('paper', new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 10), { local: new THREE.Matrix4().makeTranslation(x, y, z), glow, steady: true });
}

// a lantern on a short pole at the stern, behind the boatman, so that after dark he is seen at his oar
function buildSternLantern(kit) {
  const z = -3.25, y0 = sheer(z) - 0.05;
  kit.tube('bamboo', [new THREE.Vector3(-0.2, y0, z), new THREE.Vector3(-0.26, y0 + 0.82, z - 0.12)], [0.016, 0.012], 5, {});
  kit.tube('bamboo', [new THREE.Vector3(-0.26, y0 + 0.82, z - 0.12), new THREE.Vector3(-0.26, y0 + 0.72, z - 0.12)], [0.004, 0.004], 4, {});
  smallLantern(kit, -0.26, y0 + 0.545, z - 0.12, 0.5);
  return new THREE.Vector3(-0.26, y0 + 0.63, z - 0.12);
}

// a lantern hung from the ridge of the middle awning: the cabin lit warm at night (画船听雨眠)
function buildCabinLantern(kit) {
  const [z0, z1, H] = AWNINGS[1];
  const top = awningBase(z0, z1) + H - 0.03, z = (z0 + z1) / 2 + 0.05;
  kit.tube('bamboo', [new THREE.Vector3(0, top, z), new THREE.Vector3(0, top - 0.14, z)], [0.004, 0.004], 4, {});
  smallLantern(kit, 0, top - 0.315, z, 0.45);
  return new THREE.Vector3(0, top - 0.23, z);
}

function buildOar(kit) {
  // from the pin: the loom forward and up to the handle, the shaft back and down to the blade
  const pts = [HANDLE.clone(), new THREE.Vector3(0, 0.3, 0.32), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.42, -1.05), new THREE.Vector3(0, -0.8, -2.0)];
  kit.tube('bamboo', pts, [0.03, 0.035, 0.04, 0.035, 0.03], 6, {});
  kit.box('bamboo', 0, -0.95, -2.35, 0.17, 0.025, 0.8, { rx: 0.42 });
  kit.box('bamboo', HANDLE.x, HANDLE.y + 0.02, HANDLE.z, 0.05, 0.05, 0.22, {});
}

// the boatman, built about his feet facing +z: legs fixed, the upper body (cape, head, hat) on a pivot at the hips
// so it can lean into each stroke, and two arms reaching for the oar's handle, each an upper arm and a forearm bent
// at the elbow, his hands round the handle
function buildBoatman(mats) {
  const group = new THREE.Group();
  const legs = new Kit();
  legs.at(0, 0, 0, 0);
  for (const sx of [-1, 1]) {
    // trousers rolled to below the knee, bare shins, straw sandals
    legs.cyl('cloth', sx * 0.09, 0.66, 0, 0.07, 0.078, 0.4, { sides: 8 });
    legs.cyl('cloth', sx * 0.09, 0.47, 0, 0.082, 0.082, 0.05, { sides: 8, col: [1.3, 1.3, 1.3] });
    legs.cyl('skin', sx * 0.09, 0.25, 0.005, 0.045, 0.036, 0.42, { sides: 7 });
    legs.box('skin', sx * 0.09, 0.035, 0.05, 0.075, 0.05, 0.19);
    legs.box('bamboo', sx * 0.09, 0.008, 0.05, 0.09, 0.016, 0.23, { col: [1.2, 1.1, 0.85] });
  }
  const lower = legs.build(mats, 'boatman-legs');
  group.add(lower);
  const upper = new THREE.Group();
  upper.position.set(0, 0.86, 0);
  const k = new Kit();
  k.at(0, 0, 0, 0);
  // the cape in three overlapping tiers, each flaring out and ragged at its hem
  for (const tier of [[[0.12, 0.57], [0.22, 0.51], [0.3, 0.37], [0.35, 0.2]], [[0.27, 0.3], [0.34, 0.12], [0.39, -0.06]], [[0.33, 0.02], [0.39, -0.17], [0.44, -0.37]]]) {
    k.add('straw', new THREE.LatheGeometry(tier.map(([r, y]) => new THREE.Vector2(r, y)), 16), { keepUv: true, rawUv: true });
  }
  const at = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  k.cyl('skin', 0, 0.6, 0.02, 0.045, 0.052, 0.12, { sides: 8 });
  // the head a little long, the jaw below it, ears, a short nose; the hair black over the back of the head and down to
  // the nape, gathered in a knot under the hat
  k.add('skin', new THREE.SphereGeometry(0.1, 14, 12), { local: at(0, 0.72, 0.02, 0.92, 1.12, 1.0) });
  k.add('skin', new THREE.SphereGeometry(0.07, 10, 8), { local: at(0, 0.66, 0.045, 1.0, 0.8, 1.0) });
  for (const sx of [-1, 1]) k.add('skin', new THREE.SphereGeometry(0.022, 6, 5), { local: at(sx * 0.1, 0.712, 0.012, 0.5, 1, 0.8) });
  face(k, 0.715, 0.022, 'skin', { ink: [0.12, 0.1, 0.09], lip: [0.62, 0.42, 0.38], skin: [1, 1, 1] });
  k.add('cloth', new THREE.SphereGeometry(0.104, 14, 12), { local: at(0, 0.735, -0.012, 0.93, 1.1, 1.0), col: [0.22, 0.2, 0.18] });
  k.add('cloth', new THREE.SphereGeometry(0.04, 8, 6), { local: at(0, 0.83, -0.03), col: [0.22, 0.2, 0.18] });
  // the hat: a wide, shallow cone of split bamboo
  k.add('hat', new THREE.ConeGeometry(0.37, 0.17, 18, 1, true), { local: new THREE.Matrix4().makeTranslation(0, 0.86, 0.02), keepUv: true, rawUv: true });
  k.add('hat', new THREE.ConeGeometry(0.37, 0.17, 18, 1, true).scale(1, -0.15, 1), { local: new THREE.Matrix4().makeTranslation(0, 0.79, 0.02), keepUv: true, rawUv: true });
  upper.add(k.build(mats, 'boatman-upper'));
  group.add(upper);
  // the arms: a unit cylinder for each segment, stretched between its joints every frame, and a hand at the end
  const seg = new THREE.CylinderGeometry(0.048, 0.042, 1, 7);
  seg.translate(0, 0.5, 0);
  const handGeo = new THREE.SphereGeometry(0.038, 8, 6).scale(0.8, 1.15, 1.0);
  const arms = [0, 1].map(() => ({ upper: new THREE.Mesh(seg, mats.straw), fore: new THREE.Mesh(seg, mats.cloth), hand: new THREE.Mesh(handGeo, mats.skin) }));
  for (const a of arms) for (const m of [a.upper, a.fore, a.hand]) { m.castShadow = true; group.add(m); }
  return { group, upper, arms };
}

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const ARM = 0.34; // upper arm, and forearm to the palm
// a unit segment (a cylinder from y = 0 to 1) stretched from p to q
const bone = (m, p, q) => {
  m.position.copy(p);
  m.quaternion.copy(_q.setFromUnitVectors(_up, _d.subVectors(q, p).normalize()));
  m.scale.set(1, Math.max(0.01, p.distanceTo(q)), 1);
};

export class Boat {
  constructor(mats, tex, o = {}) {
    const m = { ...mats, ...boatMaterials(mats, tex) };
    this.root = new THREE.Group();
    this.root.name = 'boat';
    const layer = o.moving ? LAYER_DYN : 0;
    const kit = new Kit();
    kit.at(0, 0, 0, 0);
    buildHull(kit);
    buildAwnings(kit);
    // its lanterns: at the bow always, at the stern where there is a boatman, in the cabin for your own boat
    const lampAt = [{ p: buildLantern(kit), r: 2.6, c: [1.3, 0.75, 0.38] }];
    if (o.boatman) lampAt.push({ p: buildSternLantern(kit), r: 2.4, c: [0.95, 0.55, 0.26] });
    if (o.cabin) lampAt.push({ p: buildCabinLantern(kit), r: 1.6, c: [0.85, 0.48, 0.22] });
    const body = kit.build(m, 'boat-body');
    this.root.add(body);
    this.oar = new THREE.Group();
    this.oar.position.copy(PIN);
    const ok = new Kit();
    ok.at(0, 0, 0, 0);
    buildOar(ok);
    this.oar.add(ok.build(m, 'boat-oar'));
    this.root.add(this.oar);
    this.man = null;
    if (o.boatman) {
      this.man = buildBoatman(m);
      this.man.group.position.copy(MAN);
      this.root.add(this.man.group);
    }
    this.root.traverse((c) => {
      if (!c.isMesh) return;
      c.layers.set(layer);
      c.castShadow = true;
      c.receiveShadow = true;
    });
    // added after the layers are set: the drops are drawn with the other effects
    this.root.add(createLocalDrips(awningDrips(), 17 + (o.seed || 0), 0.007).mesh);
    this.lamps = lampAt.map((l) => ({ x: 0, y: -999, z: 0, r: l.r, c: l.c, local: l.p }));
    this.lamp = this.lamps[0];
    this.phase = (o.seed || 0) * 1.7;
    this.speed = 0;
    // where the stroke is (radians) and whether the boatman is working the oar or only steadying it, for the sound
    this.stroke = 0;
    this.working = false;
    this._hand = new THREE.Vector3();
  }

  // pose: { x, z, heading (rad, the direction of +z), speed }
  update(t, pose) {
    const r = this.root;
    const stroke = this.phase + t * 2 * Math.PI * (pose.speed > 0.05 ? 0.55 : 0.18);
    this.stroke = stroke;
    this.working = pose.speed > 0.05;
    this.speed = pose.speed;
    // a sculled boat's bow swings a little with every stroke
    const yaw = pose.speed > 0.05 ? Math.sin(stroke) * 0.02 : 0;
    r.position.set(pose.x, Math.sin(t * 1.3 + this.phase) * 0.018, pose.z);
    r.rotation.set(Math.sin(t * 0.9 + this.phase) * 0.008, pose.heading + yaw, Math.sin(t * 1.1 + 1 + this.phase) * 0.014, 'YXZ');
    r.updateMatrixWorld();
    // the oar sweeps across the stern and turns its blade with each stroke
    const sweep = pose.speed > 0.05 ? 0.34 : 0.06;
    this.oar.rotation.set(0, Math.sin(stroke) * sweep, Math.cos(stroke) * 0.35 * (sweep / 0.34), 'YXZ');
    this.oar.updateMatrixWorld();
    if (this.man) {
      const man = this.man;
      man.upper.rotation.set(Math.sin(stroke) * 0.1 + 0.08, Math.sin(stroke) * 0.18, 0);
      man.upper.updateMatrixWorld();
      // hands on the handle, wherever the stroke has taken it
      this.oar.localToWorld(this._hand.copy(HANDLE));
      man.group.worldToLocal(this._hand);
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? -1 : 1;
        // the shoulder turns with the upper body about the hips
        _a.set(sx * 0.21, 0.44, 0.04).applyEuler(man.upper.rotation);
        _a.y += 0.86;
        _b.copy(this._hand).add(_d.set(sx * 0.06, 0, sx * 0.03));
        // the elbow: two bones of ARM each, bent down and out (toward the pole) as far as the reach needs
        _d.subVectors(_b, _a);
        const dist = Math.min(Math.max(_d.length(), 0.08), ARM * 2 - 0.002);
        _d.normalize();
        _b.copy(_a).addScaledVector(_d, dist);
        _e.set(sx * 0.7, -1, -0.15);
        _e.addScaledVector(_d, -_e.dot(_d)).normalize();
        _c.copy(_a).addScaledVector(_d, dist / 2).addScaledVector(_e, Math.sqrt(Math.max(0, ARM * ARM - dist * dist / 4)));
        const arm = man.arms[i];
        bone(arm.upper, _a, _c);
        bone(arm.fore, _c, _b);
        arm.hand.position.copy(_b);
        arm.hand.quaternion.copy(arm.fore.quaternion);
      }
    }
    // the lanterns, for the lamps
    for (const l of this.lamps) {
      const lw = _b.copy(l.local).applyMatrix4(r.matrixWorld);
      l.x = lw.x; l.y = lw.y; l.z = lw.z;
    }
  }
}

// boats going up and down the canal: each keeps to its side, loops out of sight past the far ends
export class BoatTraffic {
  // starts: [{ dir, z, speed }] per boat; by default they start inside the stretch the shots look at, one coming
  // toward the default view
  constructor(boats, canalX, canalSlope, span, starts) {
    const st = starts || boats.map((b, i) => ({ dir: i % 2 === 0 ? -1 : 1, z: i % 2 === 0 ? 5 - i * 40 : -78 + i * 10, speed: 1.05 + i * 0.12 }));
    this.agents = boats.map((b, i) => ({ boat: b, ...st[i], wake: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -1e4, 0)), lastSample: -1, dist: 0 }));
    this.canalX = canalX;
    this.canalSlope = canalSlope;
    this.span = span; // [max z, min z]
  }
  update(dt, t) {
    for (const a of this.agents) {
      a.z += a.dir * a.speed * dt;
      let jumped = false;
      if (a.dir < 0 && a.z < this.span[1]) { a.z = this.span[0]; jumped = true; }
      if (a.dir > 0 && a.z > this.span[0]) { a.z = this.span[1]; jumped = true; }
      // a boat that has looped round starts a fresh wake
      if (jumped) for (const w of a.wake) w.set(0, 0, -1e4, 0);
      // keep to the right of the way: heading -z the right is -x
      const off = a.dir < 0 ? -1.25 : 1.25;
      const x = this.canalX(a.z) + off;
      const s = this.canalSlope(a.z);
      const heading = Math.atan2(a.dir * s, a.dir);
      a.boat.update(t, { x, z: a.z, heading, speed: a.speed });
      a.x = x;
      a.heading = heading;
      // the bow's track for the water's wake: now, then a sample every half second
      a.dist += a.speed * dt;
      const bx = x + Math.sin(heading) * 3.4, bz = a.z + Math.cos(heading) * 3.4;
      if (t - a.lastSample > 0.5) {
        for (let i = a.wake.length - 1; i > 1; i--) a.wake[i].copy(a.wake[i - 1]);
        a.wake[1].set(bx, bz, t, a.dist);
        a.lastSample = t;
      }
      a.wake[0].set(bx, bz, t, a.dist);
    }
  }
}
