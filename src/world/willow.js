// Weeping willows (垂柳): a trunk leaning out over the water, a few limbs arching up and out, and a couple of hundred
// hanging strands of narrow leaves. The strands are ribbons turned to face the camera about their own line; the wind
// swings them in the vertex shader, more toward the tip, and over the canal their tips trail just above the water.
// A few of their places go to maples (world/maple.js), built here alongside them.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { patch, WIND_GLSL, U } from '../core/shared.js';
import { rng } from '../lib/math.js';
import { buildMaple, mapleLeaves } from './maple.js';
import { bankX, bankNormal, bankKind, coreDist, detailDist, BANK_Y, Z0, Z1, BRIDGE_Z, CORRIDOR, GATE, SLAB_BRIDGES } from './layout.js';

const BARK_COL = [0.85, 0.82, 0.78];

// a metre of strand: a twig down the middle, narrow leaves alternating along it, pointing down and out. Drawn so the
// tile repeats along the strand. Beside it the same leaves drawn again, each in a grey of its own (0.02..0.98, the twig
// and the gaps black): every leaf's number, so that in autumn each turns and falls on its own.
function strandTexture() {
  const W = 64, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const ci = document.createElement('canvas');
  ci.width = W; ci.height = H;
  const gi = ci.getContext('2d');
  gi.fillStyle = '#000';
  gi.fillRect(0, 0, W, H);
  const R = rng(3), Ri = rng(4);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgb(78, 84, 46)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  const leaves = [];
  for (let y = 0; y < H; y += 8.5) for (const side of [-1, 1]) leaves.push([y + (side > 0 ? 4 : 0), side, R.range(28, 44), R.range(3.0, 4.4), R.range(0.22, 0.55), R.range(-1, 1)]);
  for (const [y, side, len, wid, ang, hue] of leaves) {
    const id = Math.round((0.02 + 0.96 * Ri.next()) * 255);
    for (const dy of [-H, 0, H]) {
      g.save();
      g.translate(W / 2, y + dy);
      g.rotate(-side * ang);
      const r = Math.round(140 + hue * 18), gg = Math.round(168 + hue * 14), b = Math.round(62 + hue * 10);
      g.fillStyle = `rgb(${r}, ${gg}, ${b})`;
      g.beginPath();
      g.ellipse(0, len / 2, wid, len / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(${r + 30}, ${gg + 25}, ${b + 20}, 0.6)`;
      g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(0, 1); g.lineTo(0, len - 2); g.stroke();
      g.restore();
      gi.save();
      gi.translate(W / 2, y + dy);
      gi.rotate(-side * ang);
      gi.fillStyle = `rgb(${id}, ${id}, ${id})`;
      gi.beginPath();
      gi.ellipse(0, len / 2, wid, len / 2, 0, 0, Math.PI * 2);
      gi.fill();
      gi.restore();
    }
  }
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(c, true), id: tex(ci, false) };
}

// where the willows stand: on the lanes' edge, clear of the corridor, the bridge and the steps down to the water
export function planWillows(piers = []) {
  const R = rng(55);
  const out = [];
  for (const side of [-1, 1]) {
    let z = Z0 - 8;
    while (z > Z1 + 8) {
      z -= R.range(11, 19);
      if (coreDist(z) > 90 || bankKind(z, side) !== 'lane') continue;
      if (side === CORRIDOR.side && z < CORRIDOR.z0 + 4 && z > CORRIDOR.z1 - 4) continue;
      if (Math.abs(z - BRIDGE_Z) < 7) continue;
      if (piers.some((p) => p.side === side && Math.abs(p.z - z) < 4)) continue;
      out.push({ side, z, seed: Math.floor(R.next() * 1e6), lod: detailDist(z) === 0 ? 0 : 1, scale: R.range(0.85, 1.2) });
    }
  }
  // the town gate stands clear, most of all upstream where the boat first sees it; dropped afterwards so that the
  // other willows keep their places
  const list = out.filter((t) => (t.side !== GATE.side || t.z < GATE.z - 5 || t.z > GATE.z + 16)
    // nor where a slab bridge's steps come down along the lane
    && !SLAB_BRIDGES.some((b) => t.z > b.z - 5 && t.z < b.z + 8));
  // and maples (world/maple.js) stand in a few of their places: both ends of the bridge (the upstream one also closes
  // the corridor), just past the gate, where the corridor begins, and by the lotus at the far end of the canal
  for (const [side, z] of MAPLES) {
    let best = null;
    for (const t of list) if (t.side === side && !t.maple && Math.abs(t.z - z) < 9 && (!best || Math.abs(t.z - z) < Math.abs(best.z - z))) best = t;
    if (best) best.maple = true;
  }
  return list;
}
const MAPLES = [[1, -78], [-1, -104], [1, 38], [1, 11], [-1, -220]];

export function createWillows(mats, plan) {
  const kit = new Kit();
  const pos = [], nrm = [], uv = [], aw = [], at = [], idx = [];
  const crowns = [];
  const cards = { pos: [], nrm: [], uv: [], leaf: [], idx: [] };
  const _m = new THREE.Matrix4();
  const _v = new THREE.Vector3();
  for (const tree of plan) {
    if (tree.maple) { buildMaple(kit, tree, cards, crowns); continue; }
    const R = rng(tree.seed);
    const n = bankNormal(tree.z, tree.side);
    const rot = Math.atan2(-n.x, -n.z);
    const ox = bankX(tree.z, tree.side), oz = tree.z;
    kit.at(ox, BANK_Y, oz, rot);
    _m.makeRotationY(rot).setPosition(ox, BANK_Y, oz);
    const S = tree.scale;
    const W = (x, y, z) => new THREE.Vector3(x, y, z);
    // the trunk, leaning out over the water, a little crooked
    const lean = R.range(0.35, 0.75);
    const trunk = [W(0, -0.1, -0.8), W(R.range(-0.1, 0.1), 1.2 * S, -0.8 + lean * 0.3), W(R.range(-0.15, 0.15), 2.3 * S, -0.8 + lean * 0.75), W(R.range(-0.2, 0.2), 3.3 * S, -0.8 + lean * 1.25)];
    kit.tube('bark', trunk, [0.22 * S, 0.18 * S, 0.15 * S, 0.11 * S], 9, { col: BARK_COL });
    const top = trunk[3];
    const crown = new THREE.Vector3(top.x, top.y + 0.6 * S, top.z + 0.5);
    // where its leaves come from, for the falling leaves (fx/leaves.js): the crown's middle in the world, and its reach
    const cw = crown.clone().applyMatrix4(_m);
    crowns.push({ x: cw.x, y: cw.y - 0.4 * S, z: cw.z, r: 2.0 * S, kind: 0 });
    // limbs arching up and out, more of them toward the water, their ends drooping
    const anchors = [];
    const nl = tree.lod === 0 ? 8 : 5;
    for (let i = 0; i < nl; i++) {
      const a = (i / nl) * Math.PI * 2 + R.range(-0.35, 0.35);
      const dir = W(Math.cos(a), 0, Math.sin(a) * 0.8 + 0.4).normalize();
      const from = trunk[2].clone().lerp(top, R.range(0.25, 1));
      const L = R.range(1.6, 2.8) * S;
      const rise = R.range(1.0, 1.6) * S;
      const pts = [from];
      for (const [f, up] of [[0.25, 0.5], [0.5, 0.92], [0.75, 0.88], [0.9, 0.6], [1.0, 0.25]]) pts.push(from.clone().addScaledVector(dir, f * L).add(W(0, up * rise, 0)));
      kit.tube('bark', pts, [0.075 * S, 0.06 * S, 0.045 * S, 0.032 * S, 0.022 * S, 0.014 * S], 6, { col: BARK_COL });
      // strands all along the outer three quarters of each limb
      const per = tree.lod === 0 ? 30 : 16;
      for (let k = 0; k < per; k++) {
        const f = R.range(0.25, 1);
        const seg = Math.min(4, Math.floor(f * 5)), ft = f * 5 - seg;
        anchors.push(pts[seg].clone().lerp(pts[Math.min(5, seg + 1)], ft).add(W(R.range(-0.18, 0.18), R.range(-0.08, 0.1), R.range(-0.18, 0.18))));
      }
    }
    // and from the twigs filling the dome between them
    const nd = tree.lod === 0 ? 70 : 30;
    for (let k = 0; k < nd; k++) {
      const a = R.next() * Math.PI * 2, e = R.range(0.1, 1.0);
      const r = R.range(1.2, 2.4) * S;
      anchors.push(crown.clone().add(W(Math.cos(a) * r * Math.sqrt(e), R.range(-0.3, 0.7) * S + (1 - e) * 0.6, Math.sin(a) * r * Math.sqrt(e) * 0.85 + 0.2)));
    }
    // the strands: out along the twig a little, then bent down by their own weight. Mostly short, a few long ones
    // trailing to the water
    for (const A of anchors) {
      const wA = _v.copy(A).applyMatrix4(_m).clone();
      const overWater = A.z > 0.15;
      const floor = overWater ? 0.2 : BANK_Y + 1.7;
      let Lh = (0.6 + 2.8 * Math.pow(R.next(), 1.7)) * S;
      Lh = Math.min(Lh, wA.y - floor);
      if (Lh < 0.35) continue;
      const out = W(A.x - crown.x, 0, A.z - crown.z);
      const hdir = out.lengthSq() > 1e-4 ? out.normalize() : W(0, 0, 1);
      const hW = hdir.clone().transformDirection(_m);
      const phase = R.next();
      const seg = tree.lod === 0 ? 9 : 5;
      const P = (t) => wA.clone().addScaledVector(hW, Lh * 0.2 * (1 - (1 - t) * (1 - t))).add(W(0, Lh * 0.06 * Math.sin(Math.PI * t * 0.8) - Lh * Math.pow(t, 1.35), 0));
      const base = pos.length / 3;
      let len = 0, prev = null;
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const p = P(t);
        if (prev) len += p.distanceTo(prev);
        prev = p;
        const tan = P(Math.min(1, t + 0.02)).sub(P(Math.max(0, t - 0.02))).normalize();
        // the crown's own volume as the normal: tops face the sky, undersides the ground
        const nv = p.clone().sub(_v.copy(crown).applyMatrix4(_m)).add(W(0, 0.8, 0)).normalize();
        for (const side of [-1, 1]) {
          pos.push(p.x, p.y, p.z);
          nrm.push(nv.x, nv.y, nv.z);
          uv.push(side > 0 ? 1 : 0, -len);
          aw.push(t, phase, Lh, side);
          at.push(tan.x, tan.y, tan.z);
        }
      }
      for (let i = 0; i < seg; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const group = kit.build(mats, 'willows');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 4));
  g.setAttribute('aTan', new THREE.Float32BufferAttribute(at, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const strandTex = strandTexture();
  const leaves = patch(new THREE.MeshStandardMaterial({ map: strandTex.map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.72, color: 0xffffff }), {
    key: 'willow',
    wet: 0.5,
    gloss: 0.5,
    snow: 0.6,
    uniforms: { tLeafId: { value: strandTex.id } },
    vertexHead: `attribute vec4 aW; attribute vec3 aTan; varying float vJnPh;\n${WIND_GLSL}`,
    fragHead: 'uniform sampler2D tLeafId; varying float vJnPh;',
    hooks: {
      vertex: /* glsl */ `
        vJnPh = aW.y;
        {
          // a strand swings like a pendulum hung from its twig: nothing at the top, most at the tip, with the gusts
          vec2 wd = normalize(uWind.xy + 1e-4);
          vec3 wdir = vec3(wd.x, 0.0, wd.y), perp = vec3(-wd.y, 0.0, wd.x);
          float t = aW.x;
          float sway = sin(uTime * 1.2 + aW.y * 6.283) * 0.55 + sin(uTime * 2.3 + aW.y * 17.0) * 0.22;
          float amp = t * t * min(aW.z, 3.0) * (0.05 + 0.17 * uWind.z) * (0.55 + 0.9 * sfGust(transformed.xz));
          transformed += (wdir * (0.55 + sway) + perp * sway * 0.6) * amp;
          transformed.y += amp * amp * 0.25;
          // a ribbon turned toward the eye about the strand's own line
          vec3 side = normalize(cross(aTan, normalize(cameraPosition - transformed)) + 1e-5);
          transformed += side * aW.w * 0.05 * (1.0 - 0.5 * t);
        }`,
      // In summer the green deepens and the strands fill out.
      // In autumn every leaf turns on its own as the season comes in (its number from tLeafId, shifted by the strand's
      // so that no two strands match): most to gold, some only to yellow-green, a few to rust; nearly a third of them
      // fall, one by one. The twig keeps its colour.
      // In winter the leaves fall, a few at a time as the season comes in, and only the twig hangs, yellow-brown; it
      // is drawn wider than the texture's own twig so that it still shows.
      // Leaves thin out to nothing when a strand is under a pixel: keep far strands from vanishing,
      // and strands brushing the lens dissolve instead of filling the view: a dither, since the leaves are alpha-tested
      alpha: /* glsl */ `
        // summer's leaves a deeper green, drawn a little wider so that the strands hang fuller
        if (uSeason.y > 0.001) {
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.25, 0.035) * dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)) / 0.3, uSeason.y * 0.85);
          diffuseColor.a = min(diffuseColor.a * (1.0 + 0.35 * uSeason.y), 1.0);
        }
        float jnAut = uSeason.z;
        if (jnAut > 0.001) {
          float jnId = texture2D(tLeafId, vMapUv).r;
          float jnLeaf = smoothstep(0.005, 0.02, jnId);
          float jnP = fract((jnId - 0.02) / 0.96 + vJnPh * 0.618);
          float jnTurn = fract(jnP * 7.13) * 0.7;
          vec3 jnGold = vec3(0.55, 0.31, 0.036) * (0.8 + 0.35 * fract(jnP * 13.7));
          vec3 jnAc = mix(mix(vec3(0.3, 0.35, 0.05), jnGold, smoothstep(0.42, 0.55, jnP)), vec3(0.3, 0.08, 0.025), smoothstep(0.88, 0.93, jnP));
          float jnL = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)) / 0.3;
          diffuseColor.rgb = mix(diffuseColor.rgb, jnAc * jnL, smoothstep(jnTurn, jnTurn + 0.25, jnAut) * jnLeaf);
          diffuseColor.a *= 1.0 - jnLeaf * step(jnP, 0.3) * step(0.5 + jnP * 1.5, jnAut);
        }
        float jnBare = uSeason.w;
        if (jnBare > 0.001) {
          float jnFall = fract(sin(dot(floor(vSfWP * 5.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float jnTwig = smoothstep(0.085, 0.035, abs(vMapUv.x - 0.5)) * smoothstep(0.0, 0.35, jnBare);
          diffuseColor.a = max(diffuseColor.a * step(jnBare * 1.05, jnFall), jnTwig);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.26, 0.15), smoothstep(0.2, 0.8, jnBare));
        }
        float jnD = length(vSfWP - cameraPosition);
        diffuseColor.a = clamp(diffuseColor.a * (1.0 + 1.8 * smoothstep(8.0, 45.0, jnD)), 0.0, 1.0);
        float jnNear = smoothstep(0.8, 2.4, jnD);
        if (jnNear < 1.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > jnNear) diffuseColor.a = 0.0;`,
    },
  });
  const strands = new THREE.Mesh(g, leaves);
  strands.name = 'willow-strands';
  strands.castShadow = false;
  strands.receiveShadow = true;
  strands.frustumCulled = false;
  group.add(strands);
  // the maples' crowns, drawn only while they have leaves
  if (cards.idx.length) {
    const maples = mapleLeaves(cards);
    group.add(maples);
    group.userData.update = () => { maples.visible = U.uSeason.value.w < 0.99; };
  } else group.userData.update = () => {};
  group.userData.stats = { trees: plan.length, maples: plan.filter((t) => t.maple).length, strandVerts: pos.length / 3 };
  group.userData.crowns = crowns;
  return group;
}
