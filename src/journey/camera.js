// The camera: fixed shots composed for review, a glide down the canal at boat height, and a free orbit.
// Dragging in a shot hands the camera to the orbit around what the shot was looking at.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { canalX, CORE } from '../world/layout.js';
import { clamp } from '../lib/math.js';

export class CameraRig {
  constructor(camera, canvas) {
    this.camera = camera;
    this.shots = {};
    this.mode = 'shot';
    this.name = '';
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = Math.PI * 0.56;
    this.controls.rotateSpeed = 0.55;
    this.controls.addEventListener('start', () => {
      if (this.mode === 'shot') this.mode = 'free';
      if (this.onChange) this.onChange(this.mode, this.name);
    });
    this.glide = { z: CORE.z0 - 10, speed: 1.4 };
    this.t = 0;
    this._look = new THREE.Vector3();
    this.base = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  }

  addShot(name, pos, look, fov = 45) {
    this.shots[name] = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov };
  }

  setShot(name) {
    this.name = name;
    if (name === 'glide') {
      this.mode = 'glide';
      this.controls.enabled = false;
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    } else if (name === 'free') {
      this.mode = 'free';
      this.controls.enabled = true;
    } else {
      const s = this.shots[name];
      if (!s) return;
      this.mode = 'shot';
      this.controls.enabled = true;
      this.base.pos.copy(s.pos);
      this.base.look.copy(s.look);
      this.camera.position.copy(s.pos);
      this.controls.target.copy(s.look);
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(s.look);
    }
    if (this.onChange) this.onChange(this.mode, this.name);
  }

  // an explicit position and target, from the URL
  setView(pos, look, fov) {
    this.addShot('url', pos, look, fov || this.camera.fov);
    this.setShot('url');
  }

  update(dt) {
    this.t += dt;
    const cam = this.camera;
    if (this.mode === 'glide') {
      const g = this.glide;
      g.z -= g.speed * dt;
      if (g.z < CORE.z1 + 20) g.z = CORE.z0 - 10;
      const z = g.z;
      // sitting low in a boat: a slow heave and roll
      const heave = Math.sin(this.t * 1.1) * 0.035 + Math.sin(this.t * 0.47) * 0.02;
      cam.position.set(canalX(z) - 0.7, 1.55 + heave, z);
      const zl = z - 16;
      this._look.set(canalX(zl) - 0.4, 2.3 + Math.sin(this.t * 0.31) * 0.15, zl);
      cam.lookAt(this._look);
      cam.rotateZ(Math.sin(this.t * 0.9) * 0.006);
      return;
    }
    if (this.mode === 'shot') {
      // a fixed shot still breathes a little, as if held from a moored boat
      const b = this.base;
      cam.position.copy(b.pos);
      cam.position.y += Math.sin(this.t * 0.8) * 0.012;
      cam.lookAt(b.look);
      return;
    }
    this.controls.update();
    // never under the water or inside the bank
    cam.position.y = clamp(cam.position.y, 0.35, 200);
  }
}
