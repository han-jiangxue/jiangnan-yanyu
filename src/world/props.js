// Things people leave by the water and at their doors: wooden buckets and baskets on the steps down to the canal,
// wine jars and potted plants beside doors on the lanes. CC0 scans from Poly Haven (scripts/fetch-assets.mjs),
// simplified to about a thousand triangles each (scripts/simplify-props.mjs), each drawn as one instanced mesh per
// part, with their materials patched into the shared world.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { patch } from '../core/shared.js';
import { LAYER_NOREFL } from '../core/pipeline.js';
import { rng } from '../lib/math.js';
import { bankX, bankNormal, coreDist, BANK_Y } from './layout.js';

const IDS = ['wooden_bucket_01', 'wicker_basket_01', 'ceramic_vase_02', 'antique_ceramic_vase_01', 'planter_pot_clay'];

export async function loadProps(onProgress) {
  const loader = new GLTFLoader();
  const out = {};
  let done = 0;
  await Promise.all(IDS.map(async (id) => {
    const gltf = await loader.loadAsync(`./assets/models/${id}/${id}.gltf`);
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const m = o.material;
      patch(m, { key: `prop-${id}-${parts.length}`, wet: 0.5, gloss: 0.4 });
      parts.push({ geometry: g, material: m });
    });
    const box = new THREE.Box3();
    for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
    out[id] = { parts, box };
    done++;
    if (onProgress) onProgress(done / IDS.length);
  }));
  return out;
}

export function createProps(src, lots, piers) {
  const R = rng(42);
  const place = Object.fromEntries(IDS.map((id) => [id, []]));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const put = (id, frame, x, y, z, scale = 1) => {
    e.set(0, R.next() * Math.PI * 2, 0);
    q.setFromEuler(e);
    m.compose(p.set(x, y, z), q, s.setScalar(scale));
    place[id].push(frame.clone().multiply(m));
  };
  for (const lot of lots) {
    const { spec, pos } = lot;
    // the houses that had props before the full detail was extended along the journey, so the props keep their places
    if (spec.row !== 0 || coreDist(lot.zc) >= 50 || !pos) continue;
    const frame = new THREE.Matrix4().makeRotationY(pos.rot).setPosition(pos.x, pos.y, pos.z);
    const zf = spec.D / 2;
    if (spec.pier) {
      // on the landing at the top of the steps: a bucket, sometimes a basket of washing
      const lz = zf + spec.bankGap + 0.42;
      put('wooden_bucket_01', frame, spec.pier.x - spec.pier.dir * 0.3, -0.03, lz, R.range(0.9, 1.1));
      if (R.next() < 0.5) put('wicker_basket_01', frame, spec.pier.x + spec.pier.dir * 0.15, -0.03, lz + 0.1, R.range(0.85, 1.0));
    }
    if (spec.door !== null && spec.door !== undefined && spec.bankGap > 1) {
      // by a door on the lane: a wine jar or two, a pot with a plant
      const sx = R.sign();
      put(R.next() < 0.5 ? 'ceramic_vase_02' : 'antique_ceramic_vase_01', frame, spec.door + sx * 0.85, 0, zf + 0.35, R.range(1.6, 2.2));
      if (R.next() < 0.5) put('planter_pot_clay', frame, spec.door - sx * 0.9, 0, zf + 0.32, R.range(0.9, 1.2));
    }
  }
  for (const pr of piers) {
    const n = bankNormal(pr.z, pr.side);
    const frame = new THREE.Matrix4().makeRotationY(Math.atan2(-n.x, -n.z)).setPosition(bankX(pr.z, pr.side), BANK_Y, pr.z);
    if (R.next() < 0.7) put('wooden_bucket_01', frame, -pr.dir * 0.3, -0.03, 0.5, 1);
  }
  const group = new THREE.Group();
  group.name = 'props';
  let count = 0;
  for (const id of IDS) {
    const list = place[id];
    if (!list.length) continue;
    for (const part of src[id].parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      // too small for their shadows to read in this light; they still receive the town's
      im.castShadow = false;
      im.receiveShadow = true;
      im.layers.set(LAYER_NOREFL);
      group.add(im);
    }
    count += list.length;
  }
  group.userData.stats = { props: count };
  return group;
}
