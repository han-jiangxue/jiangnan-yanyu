// The rain-occlusion map: the town seen from straight above as a depth image, so every shader can tell whether the
// sky reaches a point. Rain stops under the eaves and the corridor roofs, the lanes stay dry there, and the canal
// has no rings under the bridge. The town is static, so the map is only redrawn when the camera has moved on.
import * as THREE from 'three';
import { U, OCC_RES, OCC_RANGE } from './shared.js';
import { LAYER_MIRROR } from './pipeline.js';

const EXTENT = 100; // metres across
const HEIGHT = 45; // the camera's height; nothing in the town is taller
const AHEAD = 22; // the map centres this far ahead of the camera, where most of what is seen lies
const MOVE = 10; // redraw once the wanted centre has drifted this far

export class RainOcclusion {
  constructor() {
    const depth = new THREE.DepthTexture(OCC_RES, OCC_RES);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(OCC_RES, OCC_RES, { depthBuffer: true, depthTexture: depth, type: THREE.UnsignedByteType, generateMipmaps: false });
    this.cam = new THREE.OrthographicCamera(-EXTENT / 2, EXTENT / 2, EXTENT / 2, -EXTENT / 2, 0, OCC_RANGE);
    this.cam.up.set(0, 0, -1); // image up = world -z, so image y runs from max z down to min z
    // the buildings, roofs and bridges (nearby houses through their simpler copies, which have the same roofs and
    // eaves); props and the instanced tile ends are too small to keep rain off anything
    this.cam.layers.mask = (1 << 0) | (1 << LAYER_MIRROR);
    this.override = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.centre = new THREE.Vector2(1e9, 1e9);
    this._f = new THREE.Vector3();
    this.hidden = []; // objects that must not occlude (the sky dome)
    U.tOcc.value = depth;
  }

  update(renderer, scene, camera, force = false) {
    camera.getWorldDirection(this._f);
    const fl = Math.hypot(this._f.x, this._f.z) || 1;
    const cx = camera.position.x + (this._f.x / fl) * AHEAD, cz = camera.position.z + (this._f.z / fl) * AHEAD;
    if (!force && Math.hypot(cx - this.centre.x, cz - this.centre.y) < MOVE) return false;
    // snap to whole texels so the map does not shimmer from one redraw to the next
    const tx = EXTENT / OCC_RES;
    const sx = Math.round(cx / tx) * tx, sz = Math.round(cz / tx) * tx;
    this.centre.set(sx, sz);
    const c = this.cam;
    c.position.set(sx, HEIGHT, sz);
    c.lookAt(sx, 0, sz);
    c.updateMatrixWorld();
    const prevOverride = scene.overrideMaterial;
    const sm = renderer.shadowMap, shadowDue = sm.needsUpdate;
    sm.needsUpdate = false;
    for (const o of this.hidden) o.visible = false;
    scene.overrideMaterial = this.override;
    renderer.setRenderTarget(this.rt);
    renderer.clear(false, true, false);
    renderer.render(scene, c);
    scene.overrideMaterial = prevOverride;
    for (const o of this.hidden) o.visible = true;
    sm.needsUpdate = shadowDue;
    U.uOcc.value.set(sx - EXTENT / 2, sz + EXTENT / 2, EXTENT, HEIGHT);
    return true;
  }
}
