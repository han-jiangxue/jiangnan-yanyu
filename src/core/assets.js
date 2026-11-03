// Texture loading: CC0 Poly Haven sets converted by scripts/fetch-assets.mjs (colour _c, GL normal _n).
import * as THREE from 'three';

const BASE = './assets/tex/';
export const TEX_LIST = [
  'worn_mossy_plasterwall', 'white_rough_plaster', 'whitewashed_brick', 'granite_wall', 'granite_tile',
  'weathered_planks', 'old_planks_02', 'grey_roof_tiles', 'bark_willow',
];

export async function loadTextures(renderer, onProgress) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const out = {};
  let done = 0;
  const total = TEX_LIST.length * 2;
  const jobs = [];
  for (const id of TEX_LIST) {
    for (const m of ['c', 'n']) {
      jobs.push(
        loader.loadAsync(`${BASE}${id}_${m}.webp`).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = aniso;
          t.colorSpace = m === 'c' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          out[`${id}_${m}`] = t;
          done++;
          if (onProgress) onProgress(done / total);
        })
      );
    }
  }
  await Promise.all(jobs);
  return out;
}
