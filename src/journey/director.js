// The camera on the journey: a follow camera to orbit and zoom round the boat, a seat inside the awning looking out,
// a cinematic mode that cuts between composed shots (through the bridge's arch as the boat comes to it, from under
// the corridor, from the lanes, from above the roofs), and a photo mode that orbits like the follow camera.
// Below the roofs it is kept over the water, never inside a house, and through the bridge's arch or over its deck,
// never inside the stone.
// Shot ideas and the follow/seat/cinema split after Sakura Fantasy's director (c) 2026 Bill Chan, MIT License.
import * as THREE from 'three';
import { canalX, canalW, bankX, bankNormal, bankKind, BANK_Y, BRIDGE_Z, CORRIDOR } from '../world/layout.js';
import { BRIDGE } from '../world/bridge.js';
import { SLABS } from '../world/slabbridge.js';
import { clamp, lerp, smoothstep } from '../lib/math.js';

const V = () => new THREE.Vector3();
const ROOFS = 12.5; // above this a camera may be anywhere (ridges reach 10.3 m, the firewalls 11 m)

export class Director {
  constructor(camera, dom) {
    this.camera = camera;
    this.mode = 'follow';
    this.yaw = 0.35; // around the boat, from astern
    this.pitch = 0.2;
    this.dist = 9;
    this.wantYaw = this.yaw; this.wantPitch = this.pitch; this.wantDist = this.dist;
    this.pos = V(); this.look = V(); this.tPos = V(); this.tLook = V();
    this.shot = null;
    this.shotIdx = 0;
    this.fov = 50;
    this.lookYaw = 0; this.lookPitch = 0;
    this.first = true;
    this.bridgeShown = false;
    this._v = V();
    this.bind(dom);
  }

  bind(dom) {
    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (this.mode === 'seat') {
        this.lookYaw = clamp(this.lookYaw - dx * 0.004, -2.2, 2.2);
        this.lookPitch = clamp(this.lookPitch - dy * 0.003, -0.45, 0.6);
        return;
      }
      if (this.mode === 'cinema') this.setMode('follow');
      this.wantYaw -= dx * 0.005;
      this.wantPitch = clamp(this.wantPitch + dy * 0.003, -0.05, 1.3);
    });
    const up = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.mode === 'seat') { this.fov = clamp(this.fov + e.deltaY * 0.02, 25, 72); return; }
      if (this.mode === 'cinema') this.setMode('follow');
      this.wantDist = clamp(this.wantDist * Math.exp(e.deltaY * 0.0012), 3.5, 70);
    }, { passive: false });
    // pinch to zoom on a touch screen
    let pinch0 = 0;
    const pd = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    dom.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch0 = pd(e.touches); }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2 || !pinch0) return;
      const d = pd(e.touches);
      this.wantDist = clamp(this.wantDist * (pinch0 / d), 3.5, 70);
      pinch0 = d;
    }, { passive: true });
    dom.addEventListener('touchend', () => { pinch0 = 0; }, { passive: true });
  }

  // a hard cut, nothing carried over: after a jump down the canal or at the start of a new journey
  cut() {
    this.first = true;
    this.shot = null;
    this.bridgeShown = false;
  }

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    this.shot = null;
    if (m === 'seat') { this.lookYaw = 0; this.lookPitch = 0.03; this.fov = 56; }
    if (m === 'follow' || m === 'photo') this.fov = 50;
    if (this.onMode) this.onMode(m);
  }

  // the next composed shot: the bridge when the boat is coming up to it, the corridor along it, otherwise a round
  nextShot(p) {
    const toBridge = p.z - BRIDGE_Z;
    if (toBridge > 14 && toBridge < 55 && !this.bridgeShown) {
      this.bridgeShown = true;
      // long enough for the boat to come through the arch whatever its speed
      this.shot = { k: 'bridge', t: 0, dur: Math.max(40, (toBridge + 8) / Math.max(p.speed, 0.5)) };
      return;
    }
    if (toBridge < 0) this.bridgeShown = false;
    const inCorridor = p.z < CORRIDOR.z0 + 8 && p.z > CORRIDOR.z1 + 12;
    const kinds = ['low', 'bank', 'bow', 'aerial', 'beside', 'stern'];
    let k = kinds[this.shotIdx++ % kinds.length];
    if (inCorridor && this.shotIdx % 3 === 0) k = 'corridor';
    // beside the boat only on its own side, away from the boats coming up the other lane
    const side = k === 'beside' ? 1 : this.shotIdx % 2 ? 1 : -1;
    this.shot = { k, side, t: 0, dur: k === 'bank' || k === 'corridor' ? 12 : 9, anchor: null };
    if (k === 'bank' || k === 'corridor') {
      // a fixed camera ahead; the boat glides past it. Above head height, so people on the lane pass under it
      const za = p.z - (k === 'corridor' ? 16 : 26) - p.speed * 4;
      const cs = k === 'corridor' ? CORRIDOR.side : bankKind(za, 1) === 'lane' ? 1 : bankKind(za, -1) === 'lane' ? -1 : 0;
      if (cs) {
        const n = bankNormal(za, cs);
        const d = k === 'corridor' ? 1.5 : 1.2;
        this.shot.anchor = new THREE.Vector3(bankX(za, cs) + n.x * d, BANK_Y + 2.25, za + n.z * d);
      } else {
        // no lane on either side here: from the water by the far bank
        this.shot.anchor = new THREE.Vector3(canalX(za) + (canalW(za) / 2 - 1.0) * side, 1.15, za);
      }
    }
  }

  // below the roofs, keep a camera over the canal: never inside a house or a bank, nor inside the bridge
  keepOut(v, margin = 0.45) {
    if (v.y > ROOFS) return v;
    const c = canalX(v.z), hw = canalW(v.z) / 2 - margin;
    v.x = clamp(v.x, c - hw, c + hw);
    v.y = Math.max(v.y, 0.4);
    this.keepBridge(v);
    for (const b of SLABS) this.keepSlab(v, b);
    return v;
  }

  // A slab bridge: under its deck through the middle span (lowered below the slabs and kept between the piers) or,
  // from high up, over it; eased in over the few metres before the bridge like the arch.
  keepSlab(v, b) {
    const cr = Math.cos(b.rot), sr = Math.sin(b.rot);
    const dx = v.x - b.x, dz = v.z - b.z;
    const lx = cr * dx - sr * dz, lz = sr * dx + cr * dz;
    const near = 1 - smoothstep(b.W / 2 + 0.4, b.W / 2 + 5.5, Math.abs(lz));
    if (near <= 0 || v.y > b.top + 1.3) return v;
    let y, x = lx;
    // over it only from well above; at the follow camera's usual height it ducks under with the boat
    if (v.y > b.top + 0.6) y = b.top + 1.3;
    else {
      y = Math.min(v.y, b.bottom - 0.3);
      x = clamp(lx, -b.half + 0.35, b.half - 0.35);
    }
    const nx = lerp(lx, x, near);
    v.y = lerp(v.y, y, near);
    v.x = b.x + cr * nx + sr * lz;
    v.z = b.z - sr * nx + cr * lz;
    return v;
  }

  // At the bridge: through the arch (lowered and drawn in toward the middle until the stone is clear) or, from high
  // up, over the parapet; eased in over the few metres before the bridge so it never jumps.
  keepBridge(v) {
    const B = BRIDGE, cr = Math.cos(B.rot), sr = Math.sin(B.rot);
    const dx = v.x - B.x, dz = v.z - B.z;
    const lx = cr * dx - sr * dz, lz = sr * dx + cr * dz; // across the canal, along it
    const near = 1 - smoothstep(B.W / 2 + 0.5, B.W / 2 + 4, Math.abs(lz));
    if (near <= 0 || v.y > B.crown + 1.4) return v;
    const r = B.R - 0.45;
    let y, x;
    if (v.y > (r + B.crown) * 0.5) {
      y = B.crown + 1.4;
      x = lx;
    } else {
      y = Math.min(v.y, r - 0.8);
      const half = Math.sqrt(Math.max(0, r * r - (y + 0.15) * (y + 0.15)));
      x = clamp(lx, -half, half);
    }
    const nx = lerp(lx, x, near);
    v.y = lerp(v.y, y, near);
    v.x = B.x + cr * nx + sr * lz;
    v.z = B.z - sr * nx + cr * lz;
    return v;
  }

  update(dt, p, boatRoot) {
    const cam = this.camera;
    const h = p.heading;
    const fx = Math.sin(h), fz = Math.cos(h); // the boat's forward
    const rx = Math.cos(h), rz = -Math.sin(h); // and its side
    this.yaw += (this.wantYaw - this.yaw) * (1 - Math.exp(-dt * 6));
    this.pitch += (this.wantPitch - this.pitch) * (1 - Math.exp(-dt * 6));
    this.dist += (this.wantDist - this.dist) * (1 - Math.exp(-dt * 5));
    let snap = false;
    if (this.mode === 'follow' || this.mode === 'photo') {
      const a = h + Math.PI + this.yaw;
      const cd = this.dist * Math.cos(this.pitch);
      this.tPos.set(p.x + Math.sin(a) * cd, 1.3 + this.dist * Math.sin(this.pitch), p.z + Math.cos(a) * cd);
      this.keepOut(this.tPos);
      this.tLook.set(p.x + fx * 2.5, 1.5 + this.dist * 0.03, p.z + fz * 2.5);
    } else if (this.mode === 'seat') {
      // sitting under the awning, looking out past the bow; the boat's own rocking carries the eye
      boatRoot.localToWorld(this.tPos.set(0, 0.9, 1.15));
      const a = this.lookYaw, e = this.lookPitch;
      boatRoot.localToWorld(this.tLook.set(Math.sin(a) * 10 * Math.cos(e), 0.9 + Math.sin(e) * 10, 1.15 + Math.cos(a) * 10 * Math.cos(e)));
      snap = true;
    } else if (this.mode === 'cinema') {
      if (!this.shot || this.shot.t > this.shot.dur || (this.shot.k === 'bridge' && p.z < BRIDGE_Z - 6)) { this.nextShot(p); snap = true; }
      const s = this.shot;
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      const sd = s.side || 1;
      switch (s.k) {
        case 'bridge':
          // low on the water beyond the arch, looking back through it: the boat comes into the circle the arch and its
          // reflection make
          this.tPos.set(BRIDGE.x + 0.4, 0.95, BRIDGE_Z - 15);
          this.tLook.set(p.x * 0.3 + BRIDGE.x * 0.7, 1.5, Math.max(p.z, BRIDGE_Z + 2));
          this.fov = 40;
          break;
        case 'low':
          this.tPos.set(p.x - fx * (8 - u * 3) + rx * sd * 1.6, 0.6, p.z - fz * (8 - u * 3) + rz * sd * 1.6);
          this.tLook.set(p.x + fx * 3, 1.4, p.z + fz * 3);
          this.fov = 46;
          break;
        case 'bank':
        case 'corridor':
          this.tPos.copy(s.anchor);
          this.tLook.set(p.x, 1.3, p.z);
          this.fov = 44;
          break;
        case 'bow':
          // ahead of the bow, looking back at the boatman at his oar
          this.tPos.set(p.x + fx * 6.5 + rx * sd * 0.9, 1.75, p.z + fz * 6.5 + rz * sd * 0.9);
          this.tLook.set(p.x - fx * 2.2, 1.5, p.z - fz * 2.2);
          this.fov = 42;
          break;
        case 'aerial': {
          const a = h + Math.PI + sd * (0.35 + u * 0.6);
          this.tPos.set(p.x + Math.sin(a) * 24, 19 - u * 5, p.z + Math.cos(a) * 24);
          this.tLook.set(p.x + fx * 14, 0, p.z + fz * 14);
          this.fov = 48;
          break;
        }
        case 'beside':
          this.tPos.set(p.x + rx * sd * 2.6 + fx * (u * 5 - 2.5), 1.25, p.z + rz * sd * 2.6 + fz * (u * 5 - 2.5));
          this.tLook.set(p.x + fx * 1.2, 1.2, p.z + fz * 1.2);
          this.fov = 50;
          break;
        case 'stern':
          // over the boatman's shoulder, down the canal ahead
          this.tPos.set(p.x - fx * 5.5 + rx * sd * 0.5, 2.3, p.z - fz * 5.5 + rz * sd * 0.5);
          this.tLook.set(p.x + fx * 30, 1.8, p.z + fz * 30);
          this.fov = 50;
          break;
      }
      if (s.k !== 'bank' && s.k !== 'corridor' && s.k !== 'aerial') this.keepOut(this.tPos);
      snap = snap || s.t <= dt * 1.5;
    }
    if (this.first || snap) {
      this.pos.copy(this.tPos);
      this.look.copy(this.tLook);
      this.first = false;
    } else {
      const k = this.mode === 'cinema' ? 1 - Math.exp(-dt * 5) : 1 - Math.exp(-dt * 3.2);
      this.pos.lerp(this.tPos, k);
      this.look.lerp(this.tLook, 1 - Math.exp(-dt * 5));
    }
    // the eased position as well as the target: on its way to a target the camera must not cut through a wall
    const fixed = this.mode === 'cinema' && this.shot && (this.shot.k === 'bank' || this.shot.k === 'corridor' || this.shot.k === 'aerial');
    if (this.mode !== 'seat' && !fixed) this.keepOut(this.pos);
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov += (this.fov - cam.fov) * (snap ? 1 : 1 - Math.exp(-dt * 6));
      cam.updateProjectionMatrix();
    }
  }
}
