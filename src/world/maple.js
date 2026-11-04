// The maples by the water (江枫): broad trees standing in a few of the willows' places, the ends of the stone bridge
// above all (江枫渔火对愁眠). A trunk and limbs spreading up and out, built into the willows' bark so that they cost no
// draw of their own, and a crown of leaf cards round the limbs' ends. Tender green in spring; in autumn the leaves
// turn one by one from the outside of the crown in, yellow, orange, then red, and a third of them fall; bare in winter.
// (Deep green in summer.)
// The crown shades smoothly as one volume, as the willows' strands do.
import * as THREE from 'three';
import { patch, WIND_GLSL } from '../core/shared.js';
import { rng } from '../lib/math.js';
import { bankX, bankNormal, BANK_Y } from './layout.js';

const BARK_COL = [0.6, 0.56, 0.52];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A card of maple leaves: five lobes each, the two lowest smaller, on short stalks, at a few sizes and turns. Beside
// it the same leaves each in a grey of its own (0.02..0.98, the gaps black): every leaf's number, so that each turns
// and falls on its own.
function clusterTexture() {
  const S = 256;
  const c = document.createElement('canvas'), ci = document.createElement('canvas');
  c.width = c.height = ci.width = ci.height = S;
  const g = c.getContext('2d'), gi = ci.getContext('2d');
  gi.fillStyle = '#000';
  gi.fillRect(0, 0, S, S);
  const R = rng(29);
  const outline = (ctx, r) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const th = (i / 120) * Math.PI * 2;
      const lobe = Math.pow(Math.abs(Math.cos(2.5 * (th - Math.PI / 2))), 0.7);
      const low = 1 - 0.3 * Math.max(0, -Math.sin(th));
      const rr = r * (0.38 + 0.62 * lobe) * low;
      ctx.lineTo(Math.cos(th) * rr, -Math.sin(th) * rr);
    }
    ctx.closePath();
  };
  for (let k = 0; k < 9; k++) {
    const r = R.range(22, 38);
    const x = R.range(r + 4, S - r - 4), y = R.range(r + 4, S - r - 4), rot = R.range(-0.9, 0.9);
    const hue = R.range(-1, 1);
    const id = Math.round((0.02 + 0.96 * R.next()) * 255);
    for (const [ctx, fill] of [[g, `rgb(${Math.round(112 + hue * 16)}, ${Math.round(150 + hue * 14)}, ${Math.round(58 + hue * 8)})`], [gi, `rgb(${id}, ${id}, ${id})`]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = fill;
      outline(ctx, r);
      ctx.fill();
      if (ctx === g) {
        // the veins out to the lobes' tips, and the stalk
        ctx.strokeStyle = 'rgba(190, 210, 140, 0.45)';
        ctx.lineWidth = 1.2;
        for (let l = 0; l < 5; l++) {
          const th = Math.PI / 2 + (l - 2) * (Math.PI * 2 / 5);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(th) * r * 0.85, -Math.sin(th) * r * 0.85); ctx.stroke();
        }
        ctx.strokeStyle = 'rgb(90, 96, 50)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, r * 0.75); ctx.stroke();
      }
      ctx.restore();
    }
  }
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(c, true), id: tex(ci, false) };
}

// One maple into the kit (its wood) and into cards (its leaf cards, in world space); its crown into crowns, for the
// falling leaves. Its local frame is the willows': origin on the bank's edge, +z out over the water.
export function buildMaple(kit, tree, cards, crowns) {
  const R = rng(tree.seed + 7);
  const n = bankNormal(tree.z, tree.side);
  const rot = Math.atan2(-n.x, -n.z);
  const ox = bankX(tree.z, tree.side), oz = tree.z;
  kit.at(ox, BANK_Y, oz, rot);
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(ox, BANK_Y, oz);
  const S = tree.scale;
  const lean = R.range(0.1, 0.35);
  const trunk = [V(0, -0.1, -1.0), V(R.range(-0.08, 0.08), 1.0 * S, -1.0 + lean * 0.25), V(R.range(-0.1, 0.1), 2.0 * S, -1.0 + lean * 0.6), V(R.range(-0.12, 0.12), 2.7 * S, -1.0 + lean)];
  kit.tube('bark', trunk, [0.21 * S, 0.17 * S, 0.14 * S, 0.12 * S], 9, { col: BARK_COL });
  const top = trunk[3];
  const crown = V(top.x, top.y + 1.5 * S, top.z + 0.35);
  const CR = 2.4 * S;
  // limbs rising and spreading from the top of the trunk, each forking toward the edge of the crown
  const tips = [];
  const limbs = 4 + (R.next() < 0.5 ? 1 : 0);
  const up = V(0, 1, 0);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + R.range(-0.3, 0.3);
    const dir = V(Math.cos(a), 0, Math.sin(a) * 0.85 + 0.15).normalize();
    const from = trunk[2].clone().lerp(top, R.range(0.3, 1));
    const L = R.range(1.3, 1.9) * S, rise = R.range(1.2, 1.8) * S;
    const pts = [from];
    for (const [f, h] of [[0.35, 0.45], [0.7, 0.8], [1.0, 1.0]]) pts.push(from.clone().addScaledVector(dir, f * L).addScaledVector(up, h * rise));
    kit.tube('bark', pts, [0.075 * S, 0.055 * S, 0.035 * S, 0.02 * S], 6, { col: BARK_COL });
    tips.push(pts[3]);
    for (let k = 0; k < 2; k++) {
      const p1 = pts[2].clone().lerp(pts[3], R.range(0.1, 0.7));
      const d2 = dir.clone().applyAxisAngle(up, R.range(-1.0, 1.0));
      const tip = p1.clone().addScaledVector(d2, R.range(0.5, 0.9) * S).addScaledVector(up, R.range(0.15, 0.55) * S);
      kit.tube('bark', [p1, p1.clone().lerp(tip, 0.5).addScaledVector(up, 0.08 * S), tip], [0.026 * S, 0.018 * S, 0.01 * S], 5, { col: BARK_COL });
      tips.push(tip);
    }
  }
  // the leaf cards, gathered round the tips and filling the dome between them
  const wc = crown.clone().applyMatrix4(m);
  const card = (c) => {
    const w = c.clone().applyMatrix4(m);
    const out = w.clone().sub(wc);
    const shell = Math.min(1, out.length() / CR);
    // facing more or less out of the crown, turned every which way about that
    const nC = out.clone().normalize().add(V(R.range(-0.8, 0.8), R.range(-0.4, 0.9), R.range(-0.8, 0.8))).normalize();
    const t = V(R.range(-1, 1), R.range(-1, 1), R.range(-1, 1)).cross(nC).normalize();
    const b = nC.clone().cross(t);
    const s = R.range(0.3, 0.48) * S;
    const nv = out.clone().add(V(0, 0.8 * CR, 0)).normalize();
    const base = cards.pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = w.clone().addScaledVector(t, (u - 0.5) * 2 * s).addScaledVector(b, (v - 0.5) * 2 * s);
      cards.pos.push(p.x, p.y, p.z);
      cards.nrm.push(nv.x, nv.y, nv.z);
      cards.uv.push(u, v);
      cards.leaf.push(shell, R.next(), p.y - BANK_Y);
    }
    cards.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const tip of tips) for (let k = 0; k < 16; k++) card(tip.clone().add(V(R.range(-1, 1), R.range(-0.6, 0.8), R.range(-1, 1)).multiplyScalar(0.7 * S)));
  for (let k = 0; k < 70; k++) {
    const a = R.next() * Math.PI * 2, e = Math.sqrt(R.next());
    card(crown.clone().add(V(Math.cos(a) * e * CR * 0.85, R.range(-0.5, 0.75) * CR * 0.7, Math.sin(a) * e * CR * 0.85)));
  }
  crowns.push({ x: wc.x, y: wc.y, z: wc.z, r: CR, kind: 1 });
}

// all the maples' leaf cards as one mesh
export function mapleLeaves(cards) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(cards.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(cards.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(cards.uv, 2));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(cards.leaf, 3));
  g.setIndex(cards.idx);
  g.computeBoundingSphere();
  const tex = clusterTexture();
  const mat = patch(new THREE.MeshStandardMaterial({ map: tex.map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75 }), {
    key: 'maple',
    wet: 0.5,
    gloss: 0.5,
    snow: 0.6,
    uniforms: { tLeafId: { value: tex.id } },
    vertexHead: `attribute vec3 aLeaf; varying vec2 vJnLeaf;\n${WIND_GLSL}`,
    fragHead: 'uniform sampler2D tLeafId; varying vec2 vJnLeaf;',
    hooks: {
      // the crown sways with the gusts, more toward its top, and each card flutters a little on its own
      vertex: /* glsl */ `
        vJnLeaf = aLeaf.xy;
        transformed += sfWindOffset(transformed, aLeaf.z * 0.6, 0.5);
        transformed.y += sin(uTime * 3.1 + aLeaf.y * 40.0) * 0.012 * (0.3 + uWind.z);`,
      // Spring's leaves a tender, lighter green, summer's a deep one. In autumn each leaf turns on its own, those on the outside of the
      // crown first: a few only to yellow, more to orange, most to red; a third of them fall, one by one, and in
      // winter the rest. vJnLeaf: how far out in the crown the card is, and its own number
      alpha: /* glsl */ `
        {
          float jnId = texture2D(tLeafId, vMapUv).r;
          float jnLeafM = smoothstep(0.005, 0.02, jnId);
          float jnP = fract((jnId - 0.02) / 0.96 + vJnLeaf.y * 0.618);
          float jnL = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)) / 0.28;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.33, 0.05) * jnL, uSeason.x * 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.19, 0.035) * jnL, uSeason.y * 0.85);
          if (uSeason.z > 0.001) {
            float turn = (1.0 - vJnLeaf.x) * 0.4 + fract(jnP * 5.3) * 0.35;
            vec3 ac = mix(mix(vec3(0.6, 0.4, 0.035), vec3(0.62, 0.17, 0.02), smoothstep(0.15, 0.3, jnP)), vec3(0.42, 0.035, 0.02), smoothstep(0.45, 0.6, jnP));
            diffuseColor.rgb = mix(diffuseColor.rgb, ac * jnL * (0.85 + 0.3 * fract(jnP * 11.0)), smoothstep(turn, turn + 0.2, uSeason.z) * jnLeafM);
            diffuseColor.a *= 1.0 - jnLeafM * step(jnP, 0.3) * step(0.6 + jnP, uSeason.z);
          }
          diffuseColor.a *= step(uSeason.w * 1.02, jnP);
        }`,
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'maple-leaves';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
