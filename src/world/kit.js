// Geometry accumulator for everything built from parts: houses, the bridge, the embankments. Parts are added in a
// local frame (a house's own axes), placed by the current transform, and merged into one mesh per material.
//
// Per vertex, besides position / normal / uv / colour:
//   aSpan = (foot y, eave y) in world metres for walls, so the shaders can darken the foot, shade under the eaves
//           and start rain streaks below the coping. (0, 0) means "not a wall".
//   aGlow = how much the surface lights up when the lamps come on (windows, lanterns): the fraction is the amount,
//           the whole part a per-part seed 1..63 (each window its own room and its own hour), 0 for steady lights.
import * as THREE from 'three';

// box-projected UV tile size per material, in metres
export const TILE = { plaster: 2.6, brick: 1.6, wood: 1.8, timber: 2.2, stone: 2.4, slab: 2.0, dark: 1, lattice: 1, paper: 1, tile: 1, ridge: 1, bed: 6 };

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _l = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const _nm = new THREE.Matrix3();

class Part {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.span = []; this.glow = []; this.idx = [];
  }
  get count() { return this.pos.length / 3; }
}

export class Kit {
  constructor() {
    this.parts = {};
    this.m = new THREE.Matrix4(); // local -> world
    this.uvOff = [0, 0]; // per-house texture offset, so neighbours do not repeat the same stains
  }

  // place the local frame: origin at (x, y, z), turned by rot about y
  at(x, y, z, rot = 0) {
    this.m.makeRotationY(rot).setPosition(x, y, z);
    this.baseY = y;
    this.uvOff = [((x * 0.37 + z * 0.61) % 7.3 + 7.3) % 7.3, ((x * 0.53 - z * 0.29) % 5.1 + 5.1) % 5.1];
    return this;
  }

  part(mat) {
    if (!this.parts[mat]) this.parts[mat] = new Part();
    return this.parts[mat];
  }

  /**
   * Add a geometry given in local coordinates.
   * o.col: [r, g, b] tint; o.glow: 0..1; o.local: Matrix4 applied first; o.keepUv: use the geometry's own uv
   * (offset by the house's uvOff unless o.rawUv) instead of box projection; o.span: [foot, eave] in local y, or a
   * function (localPos) -> [foot, eave]; o.steady: a glow that is not a window (a lantern), no seed; o.spanRaw: write the span as given, not lifted to world y (a flag channel
   * for surfaces that are not walls); o.uvScale: multiplies the box tile size.
   */
  add(mat, g, o = {}) {
    if (o.local) g.applyMatrix4(o.local);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = this.part(mat);
    const base = P.count;
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    const col = o.col || [1, 1, 1];
    let glow = (o.glow || 0) * 0.999;
    if (glow > 0 && !o.steady) {
      // the seed from where the part stands, so a window keeps its habits whatever else is built
      _v.fromBufferAttribute(pos, 0).applyMatrix4(this.m);
      const h = Math.abs(Math.sin(_v.x * 12.9898 + _v.y * 37.719 + _v.z * 78.233) * 43758.5453) % 1;
      glow += 1 + Math.floor(h * 63);
    }
    const t = (TILE[mat] || 1) * (o.uvScale || 1);
    const by = o.spanRaw ? 0 : this.baseY || 0;
    const off = o.rawUv ? [0, 0] : this.uvOff;
    _nm.getNormalMatrix(this.m);
    for (let i = 0; i < pos.count; i++) {
      _l.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nrm, i);
      // uv: box projection in the local frame, so a wall's texture runs along it whatever the house's heading
      let u, v;
      if (o.keepUv && uv) {
        u = uv.getX(i) + off[0];
        v = uv.getY(i) + off[1];
      } else {
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        if (ay >= ax && ay >= az) { u = _l.x; v = _l.z; }
        else if (ax >= az) { u = _l.z; v = _l.y; }
        else { u = _l.x; v = _l.y; }
        u = u / t + off[0];
        v = v / t + off[1];
      }
      let sp = o.span;
      if (typeof sp === 'function') sp = sp(_l);
      _v.copy(_l).applyMatrix4(this.m);
      _n.applyMatrix3(_nm).normalize();
      P.pos.push(_v.x, _v.y, _v.z);
      P.nrm.push(_n.x, _n.y, _n.z);
      P.uv.push(u, v);
      P.col.push(col[0], col[1], col[2]);
      if (sp) P.span.push(sp[0] + by, sp[1] + by);
      else P.span.push(0, 0);
      P.glow.push(glow);
    }
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) P.idx.push(base + idx[i]);
    } else {
      for (let i = 0; i < pos.count; i++) P.idx.push(base + i);
    }
    g.dispose();
  }

  // an axis-aligned box in local coordinates, optionally turned (o.rx, o.ry, o.rz radians about its centre)
  box(mat, cx, cy, cz, sx, sy, sz, o = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
    _q.setFromEuler(_e);
    this.add(mat, g, { ...o, local: _m.compose(_p.set(cx, cy, cz), _q, _s) });
  }

  // a box spanning y0..y1 (convenient for walls)
  boxY(mat, cx, cz, sx, sz, y0, y1, o = {}) {
    this.box(mat, cx, (y0 + y1) / 2, cz, sx, y1 - y0, sz, o);
  }

  cyl(mat, cx, cy, cz, rTop, rBot, h, o = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, o.sides || 10, 1, !!o.open);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    this.add(mat, g, { ...o, local: _m.compose(_p.set(cx, cy, cz), _q, _s) });
  }

  // a flat quad from four local corners (counter-clockwise seen from the front), with its own uv in metres
  quad(mat, a, b, c, d, o = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    const uv = o.uv || [0, 0, 1, 0, 1, 1, 0, 1];
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    this.add(mat, g, o);
  }

  // a grid surface: f(s, t) -> [x, y, z] in local coordinates, s across (ns cells), t along (nt cells);
  // uvf(s, t) -> [u, v] (metres) when given
  grid(mat, ns, nt, f, uvf, o = {}) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
      const s = i / ns, t = j / nt;
      pos.push(...f(s, t));
      uv.push(...(uvf ? uvf(s, t) : [s, t]));
    }
    for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
      const a = j * (ns + 1) + i, b = a + 1, c = a + ns + 1, d = c + 1;
      if (o.flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.add(mat, g, { keepUv: true, ...o });
  }

  // a tube along local points (THREE.Vector3[]), tapering through radii; uv: u once around, v in metres along it
  tube(mat, pts, radii, sides = 8, o = {}) {
    const pos = [], uv = [], idx = [];
    const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), prev = new THREE.Vector3();
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i < pts.length - 1) t.subVectors(pts[i + 1], p).normalize();
      else t.subVectors(p, pts[i - 1]).normalize();
      // parallel transport of the frame, so the tube does not twist
      if (i === 0) {
        n.set(0, 1, 0);
        if (Math.abs(t.y) > 0.9) n.set(1, 0, 0);
      } else n.copy(prev);
      n.addScaledVector(t, -n.dot(t)).normalize();
      prev.copy(n);
      b.crossVectors(t, n).normalize();
      if (i > 0) len += p.distanceTo(pts[i - 1]);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const c = Math.cos(a), sn = Math.sin(a);
        pos.push(p.x + (n.x * c + b.x * sn) * radii[i], p.y + (n.y * c + b.y * sn) * radii[i], p.z + (n.z * c + b.z * sn) * radii[i]);
        uv.push(s / sides, len / (o.vScale || 1.5));
      }
    }
    for (let i = 0; i < pts.length - 1; i++) for (let s = 0; s < sides; s++) {
      const a = i * (sides + 1) + s, c = a + sides + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.add(mat, g, { keepUv: true, ...o });
  }

  build(materials, name, opts = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [k, P] of Object.entries(this.parts)) {
      if (!P.count) continue;
      if (!materials[k]) throw new Error(`no material "${k}"`);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
      g.setAttribute('aSpan', new THREE.Float32BufferAttribute(P.span, 2));
      g.setAttribute('aGlow', new THREE.Float32BufferAttribute(P.glow, 1));
      g.setIndex(P.count > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, materials[k]);
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = `${name}:${k}`;
      group.add(mesh);
    }
    this.parts = {};
    return group;
  }
}
