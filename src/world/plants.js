// Small green things: tufts of grass at the foot of walls and along the coping, ferns from the joints of the
// embankments just above the water, lotus near the banks at the canal's ends (pads floating, and in summer leaves and
// flowers standing out of the water, in autumn and winter broken stems), and banana plants by a few walls on the lanes
// (雨打芭蕉). All of them sway a little in the wind, and turn with the seasons.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { patch, WIND_GLSL, U } from '../core/shared.js';
import { LAYER_NOREFL } from '../core/pipeline.js';
import { rng } from '../lib/math.js';
import { bankX, bankNormal, bankKind, coreDist, BANK_Y, Z0, Z1, BRIDGE_Z, CORRIDOR, coreFirst } from './layout.js';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// blades of grass from a common root, curving out; drawn bottom (root) to top
function grassTexture(R) {
  return canvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x0 = w / 2 + R.range(-30, 30), lean = R.range(-90, 90), tall = R.range(0.45, 0.98) * h;
      const l = R.range(-14, 14);
      g.strokeStyle = `rgb(${88 + l}, ${120 + l}, ${52 + l * 0.5})`;
      g.lineWidth = R.range(2.5, 5);
      g.beginPath();
      g.moveTo(x0, h);
      g.quadraticCurveTo(x0 + lean * 0.2, h - tall * 0.6, x0 + lean, h - tall);
      g.stroke();
    }
  });
}

function leafTexture(R, kind) {
  if (kind === 'lotus') {
    return canvas(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      g.fillStyle = 'rgb(66, 104, 52)';
      g.beginPath(); g.arc(cx, cy, 124, 0.12, Math.PI * 2 - 0.12); g.lineTo(cx, cy); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(160, 190, 120, 0.45)';
      g.lineWidth = 2;
      for (let a = 0.3; a < Math.PI * 2 - 0.2; a += 0.38) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120); g.stroke(); }
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, 40);
      grd.addColorStop(0, 'rgba(190, 210, 150, 0.7)'); grd.addColorStop(1, 'rgba(190, 210, 150, 0)');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
    });
  }
  // a banana leaf, long, the midrib down the middle and fine veins out to the ragged, split edge
  return canvas(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgb(70, 112, 48)';
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.bezierCurveTo(w * 1.05, h * 0.2, w * 1.0, h * 0.8, w / 2, h);
    g.bezierCurveTo(0, h * 0.8, -w * 0.05, h * 0.2, w / 2, 0);
    g.fill();
    g.strokeStyle = 'rgba(170, 200, 120, 0.5)';
    g.lineWidth = 1;
    for (let y = 8; y < h; y += 7) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(2, y + 14); g.moveTo(w / 2, y); g.lineTo(w - 2, y + 14); g.stroke(); }
    g.strokeStyle = 'rgb(160, 180, 110)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    // splits where the wind has torn the blade
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const y = R.range(0.1, 0.9) * h, side = R.sign();
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(side > 0 ? w : 0, y); g.lineTo(w / 2 + side * 6, y - 18); g.stroke();
    }
  });
}

// the lotus, near the banks where the canal widens toward its ends: [z0, z1, side]
export const PONDS = [[52, 28, -1], [46, 30, 1], [-196, -228, 1], [-205, -232, -1]];

const swayHook = (k) => ({
  vertexHead: `attribute float aSway;\n${WIND_GLSL}`,
  hooks: {
    vertex: /* glsl */ `
      {
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        transformed += (inverse(mat3(modelMatrix * instanceMatrix)) * sfWindOffset(root, aSway * ${k}, 1.0));
      }`,
  },
});

export function createPlants(mats, lots, piers) {
  const R = rng(97);
  const group = new THREE.Group();
  group.name = 'plants';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const tufts = [], ferns = [], pads = [];
  const add = (list, frame, x, y, z, s, rx = 0) => {
    e.set(rx, R.next() * Math.PI * 2, 0);
    q.setFromEuler(e);
    m.compose(p.set(x, y, z), q, sc.set(s, s * R.range(0.8, 1.2), s));
    list.push(frame.clone().multiply(m));
  };
  // at the foot of the walls facing the lanes, and at the corners of houses
  for (const lot of lots) {
    const { spec, pos } = lot;
    if (spec.row !== 0 || coreDist(lot.zc) >= 50 || !pos) continue;
    const frame = new THREE.Matrix4().makeRotationY(pos.rot).setPosition(pos.x, pos.y, pos.z);
    const zf = spec.D / 2;
    for (let x = -spec.W / 2 + 0.2; x < spec.W / 2; x += R.range(0.6, 1.8)) {
      if (R.next() < 0.45) continue;
      if (spec.bankGap > 1) add(tufts, frame, x, 0, zf + 0.12, R.range(0.22, 0.42));
    }
  }
  // along the coping on the lanes, and ferns from the embankment's joints over the water
  for (const side of [-1, 1]) {
    for (let z = Z0; z > Z1; z -= R.range(1.2, 3.2)) {
      if (coreDist(z) > 70 || Math.abs(z - BRIDGE_Z) < 2.5) continue;
      const n = bankNormal(z, side);
      const frame = new THREE.Matrix4().makeRotationY(Math.atan2(-n.x, -n.z)).setPosition(bankX(z, side), BANK_Y, z);
      if (bankKind(z, side) === 'lane' && R.next() < 0.5 && !(side === CORRIDOR.side && z < CORRIDOR.z0 && z > CORRIDOR.z1)) add(tufts, frame, R.range(-0.2, 0.2), 0, -0.45, R.range(0.2, 0.36));
      if (R.next() < 0.35) add(ferns, frame, 0, R.range(-0.95, -0.35), 0.06, R.range(0.25, 0.42), -0.9);
    }
  }
  // lotus pads near the banks where the canal widens toward its ends
  for (const [z0, z1, side] of PONDS) {
    for (let k = 0; k < 26; k++) {
      const z = R.range(z1, z0);
      const n = bankNormal(z, side);
      const out = R.range(0.3, 2.4);
      const x = bankX(z, side) - n.x * out, zz = z - n.z * out;
      e.set(-Math.PI / 2, 0, R.next() * Math.PI * 2);
      q.setFromEuler(e);
      const s = R.range(0.25, 0.5);
      m.compose(p.set(x, 0.012 + R.next() * 0.01, zz), q, sc.set(s, s, s));
      pads.push(m.clone());
    }
  }
  // and in summer more of them, farther out (接天莲叶), from a sequence of their own so the rest keep their places
  const padsBase = pads.length;
  const Rs = rng(149);
  for (const [z0, z1, side] of PONDS) {
    for (let k = 0; k < 22; k++) {
      const z = Rs.range(z1, z0);
      const n = bankNormal(z, side);
      const out = Rs.range(0.3, side < 0 ? 3.0 : 3.4);
      e.set(-Math.PI / 2, 0, Rs.next() * Math.PI * 2);
      q.setFromEuler(e);
      const s = Rs.range(0.3, 0.55);
      m.compose(p.set(bankX(z, side) - n.x * out, 0.014 + Rs.next() * 0.01, z - n.z * out), q, sc.set(s, s, s));
      pads.push(m.clone());
    }
  }
  const mk = (key, map, o = {}) => {
    const sway = o.sway ? swayHook(o.sway) : {};
    return patch(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: o.rough ?? 0.85 }), {
      key, wet: 0.5, gloss: o.gloss ?? 0.5, snow: o.snow ?? 1,
      vertexHead: (sway.vertexHead || '') + (o.vertexHead || ''), fragHead: o.fragHead, hooks: { ...sway.hooks, ...o.hooks },
    });
  };
  // a tuft: two crossed cards, rooted at their foot
  const cross = () => {
    const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const b = a.clone().rotateY(Math.PI / 2);
    const g = mergePlanes([a, b]);
    const sway = new Float32Array(g.attributes.position.count);
    for (let i = 0; i < sway.length; i++) sway[i] = g.attributes.position.getY(i);
    g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    // normals up, so a tuft is lit like the ground it grows from
    for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0);
    return g;
  };
  // lush in summer; in autumn the grass goes tuft by tuft from yellow-green to straw; in winter it is all straw, under
  // what snow there is
  const grassMat = mk('grass', grassTexture(R), {
    sway: 1.2,
    snow: 0.7,
    vertexHead: 'varying float vJnTuft;',
    fragHead: 'varying float vJnTuft;',
    hooks: {
      vertexPost: 'vJnTuft = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);',
      map: /* glsl */ `
        {
          float l = dot(diffuseColor.rgb, vec3(0.333));
          vec3 straw = vec3(l) * vec3(1.45, 1.2, 0.72);
          vec3 autumn = mix(vec3(l) * vec3(1.25, 1.3, 0.62), straw, smoothstep(0.35, 0.65, vJnTuft));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.85, 1.12, 0.78), uSeason.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, autumn, uSeason.z * 0.8);
          diffuseColor.rgb = mix(diffuseColor.rgb, straw, uSeason.w * 0.85);
        }`,
    },
  });
  for (const [list, name] of [[tufts, 'tufts'], [ferns, 'ferns']]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(cross(), grassMat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.layers.set(LAYER_NOREFL);
    im.name = name;
    group.add(im);
  }
  if (pads.length) {
    // In summer the pads are bigger and the extra ones farther out grow in. In autumn they go brown and spotted,
    // holed, their rims curling down into the water, and a third of them sink one by one (each its own from where it
    // floats); in winter they are gone
    const padMat = patch(new THREE.MeshStandardMaterial({ map: leafTexture(R, 'lotus'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42 }), {
      key: 'lotus',
      wet: 0.2,
      gloss: 0.6,
      snow: 0,
      vertexHead: 'attribute float aExtra; varying float vJnPad;',
      fragHead: 'varying float vJnPad;',
      hooks: {
        vertex: /* glsl */ `
          vJnPad = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          transformed.xy *= (1.0 + 0.3 * uSeason.y) * mix(1.0, uSeason.y, aExtra);
          {
            float r = length(transformed.xy);
            float a = atan(transformed.y, transformed.x);
            transformed.z -= uSeason.z * (0.25 + 0.5 * vJnPad) * r * r * (0.7 + 0.5 * sin(a * 2.0 + vJnPad * 6.283));
          }`,
        map: /* glsl */ `
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.75, 0.9, 0.8), uSeason.y * 0.6);
          if (uSeason.z > 0.001) {
            float l = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)) / 0.1;
            vec3 dead = mix(vec3(0.07, 0.065, 0.028), vec3(0.08, 0.05, 0.022), smoothstep(0.3, 0.7, vJnPad)) * l;
            dead *= 1.0 - 0.6 * smoothstep(0.6, 0.7, sfNoise(vMapUv * 9.0 + vJnPad * 13.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, dead, uSeason.z);
          }`,
        alpha: /* glsl */ `
          diffuseColor.a *= 1.0 - uSeason.z * step(0.74, sfNoise(vMapUv * 6.0 + vJnPad * 7.0));
          diffuseColor.a *= 1.0 - step(vJnPad, 0.35 * uSeason.z);
          diffuseColor.a *= 1.0 - smoothstep(0.25, 0.75, uSeason.w);`,
        // a dead pad is dry and matte, not the waxy green one that mirrors the sky
        preLight: 'roughnessFactor = mix(roughnessFactor, 0.9, uSeason.z);',
      },
    });
    const g = new THREE.CircleGeometry(0.5, 20);
    // a pad lifts at its rim
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const r = Math.hypot(pa.getX(i), pa.getY(i)); pa.setZ(i, r * r * 0.12); }
    g.computeVertexNormals();
    g.setAttribute('aExtra', new THREE.InstancedBufferAttribute(Float32Array.from(pads, (_, i) => (i < padsBase ? 0 : 1)), 1));
    const im = new THREE.InstancedMesh(g, padMat, pads.length);
    pads.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = 'lotus';
    group.add(im);
  }
  group.add(createBananas(mats, lots, R));
  const stems = createLotusStems(PONDS);
  group.add(stems);
  // summer's lotus in two batches, the canal's two ends
  const lotus = [PONDS.filter((p) => p[0] > 0), PONDS.filter((p) => p[0] < 0)].map((ponds) => createLotusSummer(ponds));
  for (const l of lotus) group.add(l);
  // the stems are only drawn in the seasons that have them, summer's lotus only in summer and within reach
  group.userData.update = (cam) => {
    stems.visible = U.uSeason.value.z + U.uSeason.value.w > 0.01;
    for (const l of lotus) l.visible = U.uSeason.value.y > 0.01 && l.boundingSphere.center.distanceTo(cam) - l.boundingSphere.radius < 110;
  };
  group.userData.stats = { tufts: tufts.length, ferns: ferns.length, pads: pads.length, stems: stems.count, lotus: lotus.reduce((a, l) => a + l.count, 0) };
  return group;
}

// Lotus stems (荷梗) standing out of the water among the pads. In autumn most have broken over and dip into the water,
// and six in ten still hold up a dead leaf crumpled into a brown knot (留得枯荷听雨声); in winter three in ten bare
// stalks are left, dark against the snow; in spring there are none. One instanced mesh: the stem is a tube of unit
// height up y, the knot a ragged cup at its top (aStem: how far up the stem, and 1 for the knot), and the shader gives
// each stem its height, its break and its leaf from where it stands.
function createLotusStems(ponds) {
  const R = rng(131);
  const pos = [], nrm = [], st = [], idx = [];
  const SEG = 8, SIDES = 5;
  for (let j = 0; j <= SEG; j++) {
    const t = j / SEG, r = 0.008 * (1 - 0.35 * t);
    for (let s = 0; s <= SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      pos.push(Math.cos(a) * r, t, Math.sin(a) * r);
      nrm.push(Math.cos(a), 0, Math.sin(a));
      st.push(t, 0);
    }
  }
  for (let j = 0; j < SEG; j++) for (let s = 0; s < SIDES; s++) {
    const a = j * (SIDES + 1) + s, c = a + SIDES + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  // the knot: a cup hanging open side down from the stem's top, in metres, its rim torn
  const base = pos.length / 3, RINGS = 4, AROUND = 9;
  const rag = Array.from({ length: AROUND }, () => R.range(0.7, 1.25));
  for (let j = 0; j <= RINGS; j++) {
    const v = j / RINGS;
    for (let s = 0; s <= AROUND; s++) {
      const a = (s / AROUND) * Math.PI * 2;
      const r = (0.012 + 0.075 * Math.sin(v * Math.PI * 0.5)) * (1 + (rag[s % AROUND] - 1) * v);
      const y = -0.07 * v * v * (0.8 + 0.4 * rag[(s + 3) % AROUND]) + 0.01;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const n = new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).normalize();
      nrm.push(n.x, n.y, n.z);
      st.push(1, 1);
    }
  }
  for (let j = 0; j < RINGS; j++) for (let s = 0; s < AROUND; s++) {
    const a = base + j * (AROUND + 1) + s, c = a + AROUND + 1;
    idx.push(a, a + 1, c, a + 1, c + 1, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aStem', new THREE.Float32BufferAttribute(st, 2));
  g.setIndex(idx);
  // where they stand: among the pads, not too far out from the bank
  const list = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (const [z0, z1, side] of ponds) {
    for (let k = 0; k < 14; k++) {
      const z = R.range(z1, z0);
      const n = bankNormal(z, side);
      const out = R.range(0.25, 1.7);
      q.setFromAxisAngle(up, R.next() * Math.PI * 2);
      list.push(m.compose(p.set(bankX(z, side) - n.x * out, 0, z - n.z * out), q, one).clone());
    }
  }
  const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), {
    key: 'lotus-stem',
    wet: 0.5,
    gloss: 0.5,
    snow: 0.4,
    vertexHead: 'attribute vec2 aStem; varying float vJnKnot;',
    fragHead: 'varying float vJnKnot;',
    hooks: {
      beginNormal: /* glsl */ `
        float jnH1 = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        float jnH2 = fract(jnH1 * 7.31 + 0.13), jnH3 = fract(jnH1 * 13.7 + 0.71), jnH4 = fract(jnH1 * 3.17 + 0.37);
        // every stem in autumn, three in ten in winter; the dead leaf on six in ten, in autumn only
        float jnVis = clamp(uSeason.z + uSeason.w * step(jnH4, 0.3), 0.0, 1.0);
        float jnLeaf = uSeason.z * step(jnH3, 0.6);
        float jnHt = (0.3 + 0.6 * jnH2) * jnVis;
        float jnBroken = step(jnH1, 0.65);
        float jnB = mix(1.0, 0.45 + 0.3 * jnH3, jnBroken);
        float jnT = aStem.y > 0.5 ? 1.0 : aStem.x;
        // folded over at the break, the top swung down toward the water; the dead leaf hangs off to one side, crumpled
        float jnA = jnBroken * (2.0 + 0.8 * jnH2) * smoothstep(jnB, jnB + 0.05, jnT);
        mat3 jnR = mat3(1.0, 0.0, 0.0, 0.0, cos(jnA), sin(jnA), 0.0, -sin(jnA), cos(jnA));
        float jnTilt = 1.1 + 0.6 * jnH4;
        mat3 jnK = mat3(cos(jnTilt), sin(jnTilt), 0.0, -sin(jnTilt), cos(jnTilt), 0.0, 0.0, 0.0, 1.0);
        if (aStem.y > 0.5) objectNormal = jnK * objectNormal;
        objectNormal = jnR * objectNormal;`,
      vertex: /* glsl */ `
        vJnKnot = aStem.y;
        {
          vec3 q = aStem.y > 0.5 ? vec3(0.0, jnHt, 0.0) + jnK * (transformed * vec3(0.6, 1.0, 1.0)) * jnLeaf : vec3(transformed.x, transformed.y * jnHt, transformed.z);
          // an unbroken stem leans a little
          q.z += (1.0 - jnBroken) * 0.1 * jnHt * jnT * jnT;
          vec3 piv = vec3(0.0, jnB * jnHt, 0.0);
          transformed = piv + jnR * (q - piv);
        }`,
      // olive-brown in autumn, the knot browner; near black in winter
      map: `diffuseColor.rgb *= mix(mix(vec3(0.15, 0.13, 0.065), vec3(0.14, 0.085, 0.04), vJnKnot), vec3(0.05, 0.045, 0.035), uSeason.w);`,
    },
  });
  const im = new THREE.InstancedMesh(g, mat, list.length);
  list.forEach((mm, i) => im.setMatrixAt(i, mm));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = false;
  im.receiveShadow = true;
  im.name = 'lotus-stems';
  return im;
}

// Summer's lotus (接天莲叶无穷碧，映日荷花别样红): stems standing out of the water among the pads, most holding up a
// broad leaf cupped like a shallow bowl, some a flower open to the light, some a bud still closed. It all grows up out
// of the water as summer comes in and sinks back as it goes. One instanced mesh for the given stretches, whose parts
// (aPart: how far along, and which: 0 the stem, 1 the leaf, 2 a petal, 3 the seed head) the shader shapes and shows for
// each stem from where it stands; a petal's own frame is in aPetal (along it, across it, its turn about the stem, inner
// or outer row).
let lotusKit = null;
function createLotusSummer(ponds) {
  if (!lotusKit) lotusKit = lotusSummerKit();
  const { g, mat } = lotusKit;
  // where they stand: among the pads, out to where the extra summer pads reach
  const R = rng(151 + Math.round(Math.abs(ponds[0][0])));
  const list = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (const [z0, z1, side] of ponds) {
    for (let k = 0; k < 34; k++) {
      const z = R.range(z1, z0);
      const n = bankNormal(z, side);
      const out = R.range(0.25, side < 0 ? 2.6 : 3.0);
      q.setFromAxisAngle(up, R.next() * Math.PI * 2);
      list.push(m.compose(p.set(bankX(z, side) - n.x * out, 0, z - n.z * out), q, one).clone());
    }
  }
  const im = new THREE.InstancedMesh(g, mat, list.length);
  list.forEach((mm, i) => im.setMatrixAt(i, mm));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = false;
  im.receiveShadow = true;
  im.name = ponds[0][0] > 0 ? 'lotus-summer' : 'lotus-summer-end';
  return im;
}

// the summer lotus's one geometry and material, shared by both batches
function lotusSummerKit() {
  const R = rng(151);
  const pos = [], nrm = [], part = [], pet = [], idx = [];
  const add = (p, n, a, b) => { pos.push(...p); nrm.push(...n); part.push(...a); pet.push(...b); };
  const grid = (base, rows, cols, flip) => {
    for (let j = 0; j < rows; j++) for (let s = 0; s < cols; s++) {
      const a = base + j * (cols + 1) + s, c = a + cols + 1;
      if (flip) idx.push(a, c, a + 1, a + 1, c, c + 1);
      else idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  };
  // the stem: a thin tube of unit height
  const SEG = 6, SIDES = 5;
  for (let j = 0; j <= SEG; j++) for (let s = 0; s <= SIDES; s++) {
    const a = (s / SIDES) * Math.PI * 2;
    add([Math.cos(a) * 0.009, j / SEG, Math.sin(a) * 0.009], [Math.cos(a), 0, Math.sin(a)], [j / SEG, 0], [0, 0, 0, 0]);
  }
  grid(0, SEG, SIDES, true);
  // the leaf: a disc of unit radius, cupped, its rim waved
  let base = pos.length / 3;
  const RINGS = 5, AROUND = 16;
  for (let j = 0; j <= RINGS; j++) for (let s = 0; s <= AROUND; s++) {
    const r = j / RINGS, a = (s / AROUND) * Math.PI * 2;
    const n = new THREE.Vector3(-Math.cos(a) * 0.26 * r, 1, -Math.sin(a) * 0.26 * r).normalize();
    add([Math.cos(a) * r, 0.13 * r * r - 0.02 + 0.035 * r * r * r * Math.sin(a * 5 + 1.3), Math.sin(a) * r], [n.x, n.y, n.z], [r, 1], [0, 0, 0, 0]);
  }
  grid(base, RINGS, AROUND, false);
  // the petals: two rows of five, each a strip from its base (0) to its tip (1), widest past the middle
  const PT = 4, PS = 2;
  for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) {
    const th = (k / 5) * Math.PI * 2 + row * (Math.PI / 5) + R.range(-0.15, 0.15);
    base = pos.length / 3;
    for (let j = 0; j <= PT; j++) for (let s = 0; s <= PS; s++) {
      const t = j / PT, w = 0.32 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08)) * (1 - 0.35 * t * t);
      add([0, 0, 0], [0, 1, 0], [t, 2], [t, (s / PS - 0.5) * 2 * w, th, row]);
    }
    grid(base, PT, PS, false);
  }
  // the seed head (莲蓬): a small drum in metres, its flat top up
  base = pos.length / 3;
  const AR = 9;
  for (const [y, r] of [[0, 0.012], [0.022, 0.025]]) for (let s = 0; s <= AR; s++) {
    const a = (s / AR) * Math.PI * 2;
    add([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a), 0.4, Math.sin(a)], [0, 3], [0, 0, 0, 0]);
  }
  grid(base, 1, AR, true);
  base = pos.length / 3;
  add([0, 0.026, 0], [0, 1, 0], [0, 3], [0, 0, 0, 0]);
  for (let s = 0; s <= AR; s++) { const a = (s / AR) * Math.PI * 2; add([Math.cos(a) * 0.025, 0.022, Math.sin(a) * 0.025], [0, 1, 0], [1, 3], [0, 0, 0, 0]); }
  for (let s = 0; s < AR; s++) idx.push(base, base + 2 + s, base + 1 + s);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 2));
  g.setAttribute('aPetal', new THREE.Float32BufferAttribute(pet, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }), {
    key: 'lotus-summer',
    wet: 0.3,
    gloss: 0.6,
    snow: 0,
    vertexHead: /* glsl */ `
      attribute vec2 aPart; attribute vec4 aPetal; varying float vJnPart, vJnT;
      mat3 jnRot(vec3 a, float t){
        float c = cos(t), s = sin(t), k = 1.0 - c;
        return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
                    a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
                    a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
      }`,
    fragHead: 'varying float vJnPart, vJnT;',
    hooks: {
      beginNormal: /* glsl */ `
        float jnH1 = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        float jnH2 = fract(jnH1 * 7.31 + 0.13), jnH3 = fract(jnH1 * 13.7 + 0.71), jnH4 = fract(jnH1 * 3.17 + 0.37);
        // grown as far as summer has come in; a leaf on six stems in ten, a flower on two, a bud on the rest
        float jnG = uSeason.y;
        float jnRole = jnH1 < 0.62 ? 0.0 : (jnH1 < 0.82 ? 1.0 : 2.0);
        float jnHt = (jnRole < 0.5 ? 0.3 + 0.6 * jnH2 : (jnRole < 1.5 ? 0.75 + 0.45 * jnH2 : 0.55 + 0.4 * jnH2)) * jnG;
        // a leaf's stem arches out under its weight and the leaf tips a little; a flower stands straighter
        vec2 jnLd = vec2(cos(jnH3 * 6.283), sin(jnH3 * 6.283));
        float jnLean = (jnRole < 0.5 ? 0.12 + 0.2 * jnH4 : 0.05) * jnHt;
        mat3 jnTR = jnRot(vec3(-jnLd.y, 0.0, jnLd.x), (0.15 + 0.4 * jnH2) * step(jnRole, 0.5));
        // a petal's frame: how far it lies open (a bud's hardly, a flower's outer row most), along it, across it, and
        // in toward the flower's middle
        float jnPh = (jnRole > 1.5 ? 0.12 : 0.5 + 0.35 * jnH4) + aPetal.w * (jnRole > 1.5 ? 0.05 : 0.35);
        vec3 jnAx = vec3(cos(aPetal.z) * sin(jnPh), cos(jnPh), sin(aPetal.z) * sin(jnPh));
        vec3 jnAc = vec3(-sin(aPetal.z), 0.0, cos(aPetal.z));
        vec3 jnIn = vec3(-cos(aPetal.z) * cos(jnPh), sin(jnPh), -sin(aPetal.z) * cos(jnPh));
        if (aPart.y > 0.5 && aPart.y < 1.5) objectNormal = jnTR * objectNormal;
        else if (aPart.y > 1.5 && aPart.y < 2.5) objectNormal = jnIn;`,
      vertex: /* glsl */ `
        vJnPart = aPart.y;
        vJnT = aPart.x;
        {
          vec3 top = vec3(jnLd.x * jnLean, jnHt, jnLd.y * jnLean);
          // the wind sways the tops
          top += vec3(uWind.x, 0.0, uWind.y) * (0.02 + 0.06 * uWind.z) * sin(uTime * 1.3 + jnH2 * 20.0) * jnHt;
          vec3 q;
          if (aPart.y < 0.5) {
            float t = aPart.x;
            q = vec3(transformed.x + top.x * t * t, t * jnHt - 0.06 * (1.0 - t), transformed.z + top.z * t * t);
          } else if (aPart.y < 1.5) {
            q = top + jnTR * transformed * ((0.24 + 0.2 * jnH3) * jnG * step(jnRole, 0.5));
          } else if (aPart.y < 2.5) {
            float L = (0.09 + 0.035 * jnH3) * jnG * step(0.5, jnRole);
            float t = aPetal.x, s = aPetal.y;
            q = top + vec3(0.0, 0.012 * jnG, 0.0) + (jnAx * t + jnAc * s + jnIn * (s * s * 1.6 + t * t * (jnRole > 1.5 ? 0.12 : 0.05))) * L;
          } else {
            q = top + transformed * jnG * step(0.5, jnRole) * step(jnRole, 1.5);
          }
          transformed = q;
        }`,
      // the stem green; a leaf dark green above with a paler heart, paler and bluer beneath; a petal white at its base
      // flushing pink to the tip; the seed head yellow-green
      map: /* glsl */ `
        {
          vec3 c = vec3(0.1, 0.19, 0.05);
          if (vJnPart > 0.5 && vJnPart < 1.5) {
            c = mix(vec3(0.06, 0.16, 0.035), vec3(0.11, 0.2, 0.06), smoothstep(0.35, 0.0, vJnT)) * (0.9 + 0.2 * sfNoise(vSfWP.xz * 9.0));
            if (!gl_FrontFacing) c = vec3(0.12, 0.2, 0.12);
          } else if (vJnPart > 1.5 && vJnPart < 2.5) c = mix(vec3(0.85, 0.8, 0.74), vec3(0.8, 0.26, 0.4), smoothstep(0.25, 1.0, vJnT));
          else if (vJnPart > 2.5) c = vec3(0.5, 0.5, 0.12);
          diffuseColor.rgb = c;
        }`,
      // the petals let the light through; the leaves are waxy
      preLight: /* glsl */ `
        if (vJnPart > 1.5 && vJnPart < 2.5) totalEmissiveRadiance += diffuseColor.rgb * (uAmbUp * 0.18 + uSkyHor * 0.06);
        if (vJnPart > 0.5 && vJnPart < 1.5) roughnessFactor = 0.45;`,
    },
  });
  return { g, mat };
}

function mergePlanes(list) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const g of list) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// banana plants by the walls: a few stems and long arching leaves
function createBananas(mats, lots, R) {
  const kit = new Kit();
  const pos = [], nrm = [], uv = [], sw = [], idx = [];
  const v = new THREE.Vector3();
  let n = 0;
  for (const lot of coreFirst(lots)) {
    const { spec, pos: lp } = lot;
    if (spec.row !== 0 || spec.lod !== 0 || spec.bankGap < 1 || !lp || R.next() > 0.22) continue;
    if (spec.side === CORRIDOR.side && lot.zc < CORRIDOR.z0 + 3 && lot.zc > CORRIDOR.z1 - 3) continue;
    const m4 = new THREE.Matrix4().makeRotationY(lp.rot).setPosition(lp.x, lp.y, lp.z);
    kit.at(lp.x, lp.y, lp.z, lp.rot);
    const bx = R.sign() * (spec.W / 2 - 0.35), bz = spec.D / 2 + 0.45;
    const stems = 2 + Math.floor(R.next() * 2);
    for (let s = 0; s < stems; s++) {
      const sx = bx + R.range(-0.25, 0.25), sz = bz + R.range(-0.15, 0.2);
      const h = R.range(1.4, 2.2);
      kit.tube('wood', [new THREE.Vector3(sx, 0, sz), new THREE.Vector3(sx + R.range(-0.05, 0.05), h * 0.5, sz), new THREE.Vector3(sx, h, sz)], [0.09, 0.075, 0.06], 7, { col: [0.55, 0.62, 0.38] });
      const leaves = 4 + Math.floor(R.next() * 3);
      for (let l = 0; l < leaves; l++) {
        const a = (l / leaves) * Math.PI * 2 + R.range(-0.3, 0.3);
        const L = R.range(1.1, 1.7), W = R.range(0.32, 0.45);
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const up0 = R.range(0.5, 0.9);
        const base = pos.length / 3;
        const seg = 8;
        for (let i = 0; i <= seg; i++) {
          const t = i / seg;
          // out and up from the stem's top, then arching over and down
          const c = new THREE.Vector3(sx, h, sz).addScaledVector(dir, t * L).add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.85) * up0 - t * t * 0.5, 0));
          const tw = Math.sin(t * Math.PI) * 0.15;
          for (const k of [-1, 1]) {
            const pnt = c.clone().addScaledVector(side, k * W * 0.5 * Math.sin(Math.min(1, t * 1.4 + 0.15) * Math.PI * 0.95)).add(new THREE.Vector3(0, -Math.abs(k) * tw, 0));
            v.copy(pnt).applyMatrix4(m4);
            pos.push(v.x, v.y, v.z);
            const nn = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -0.3).normalize().transformDirection(m4);
            nrm.push(nn.x, nn.y, nn.z);
            uv.push(k > 0 ? 1 : 0, 1 - t);
            sw.push(t * L);
          }
        }
        for (let i = 0; i < seg; i++) { const a0 = base + i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      }
    }
    n++;
  }
  const group = kit.build(mats, 'banana-stems');
  if (!pos.length) return group;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = patch(new THREE.MeshStandardMaterial({ map: leafTexture(R, 'banana'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }), {
    key: 'banana',
    wet: 0.4,
    gloss: 0.6,
    vertexHead: `attribute float aSway;\n${WIND_GLSL}`,
    hooks: {
      // the big leaves bob in the gusts, and in rain each drop knocks them a little (雨打芭蕉)
      vertex: `transformed += sfWindOffset(transformed, aSway * 1.6, 1.0) + vec3(0.0, sin(uTime * 7.0 + transformed.x * 9.0 + transformed.z * 7.0) * 0.012 * aSway * uRain, 0.0);`,
      // a deeper green in summer; in autumn they yellow and brown from the edges in and tear further; in winter they
      // wither brown and tear along their veins
      map: /* glsl */ `
        {
          float l = dot(diffuseColor.rgb, vec3(0.333));
          float edge = smoothstep(0.18, 0.46, abs(vMapUv.x - 0.5) + 0.12 * sfNoise(vMapUv * vec2(4.0, 30.0)));
          vec3 autumn = mix(vec3(l) * vec3(1.2, 1.25, 0.6), vec3(l) * vec3(1.35, 0.95, 0.5), edge);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 1.1, 0.72), uSeason.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, autumn, uSeason.z * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(1.3, 1.0, 0.6), uSeason.w * 0.9);
        }`,
      alpha: `{ float n = sfNoise(vMapUv * vec2(3.0, 22.0)); diffuseColor.a *= (1.0 - uSeason.w * step(0.6, n)) * (1.0 - uSeason.z * step(0.7, n)); }`,
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'bananas';
  group.add(mesh);
  group.userData.count = n;
  return group;
}
