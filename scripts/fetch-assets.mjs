// Downloads CC0 textures and models from Poly Haven (https://polyhaven.com): textures become WebP under
// public/assets/tex, models keep their glTF and buffers under public/assets/models/<id> with their textures shrunk to
// WebP (props are small on screen). Needs ImageMagick (`magick` or `convert`). Finished files are skipped.
// usage: node scripts/fetch-assets.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../public/assets/tex/', import.meta.url).pathname;
const TMP = new URL('../.cache/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// [asset, output size, maps]; c = colour, n = GL normal
export const LIST = [
  ['worn_mossy_plasterwall', 1024, 'cn'], // whitewashed walls, mould and rain stains
  ['white_rough_plaster', 1024, 'cn'], // flaking plaster
  ['whitewashed_brick', 1024, 'cn'], // plinths and brick showing where the plaster fell
  ['granite_wall', 1024, 'cn'], // embankment courses
  ['granite_tile', 1024, 'cn'], // slab lanes, steps, the bridge deck
  ['weathered_planks', 1024, 'cn'], // plank doors
  ['old_planks_02', 1024, 'cn'], // posts, beams, frames
  ['grey_roof_tiles', 1024, 'cn'], // colour detail under the procedural tiles
  ['bark_willow', 1024, 'cn'], // the willows' trunks
];

// [asset, texture size]
export const MODELS = [
  ['wooden_bucket_01', 512],
  ['wicker_basket_01', 512],
  ['ceramic_vase_02', 512],
  ['antique_ceramic_vase_01', 512],
  ['planter_pot_clay', 512],
];
const KEY = { c: 'Diffuse', n: 'nor_gl' };

const magick = (() => {
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' });
      return bin;
    } catch {
      // try the next name
    }
  }
  throw new Error('ImageMagick not found: install it (magick / convert) to convert textures');
})();

for (const [id, size, maps] of LIST) {
  const meta = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const m of maps) {
    const dst = join(OUT, `${id}_${m}.webp`);
    if (existsSync(dst)) continue;
    const url = meta[KEY[m]]['1k'].jpg.url;
    const tmp = join(TMP, `${id}_${m}.jpg`);
    writeFileSync(tmp, Buffer.from(await (await fetch(url)).arrayBuffer()));
    const q = m === 'n' ? 90 : 82;
    execFileSync(magick, [tmp, '-resize', `${size}x${size}!`, '-quality', String(q), '-define', 'webp:method=6', dst]);
    rmSync(tmp);
    console.log('ok', `${id}_${m}.webp`);
  }
}

// models: the 1k glTF, its buffer, its textures converted to WebP and the glTF pointed at them
const MODEL_OUT = new URL('../public/assets/models/', import.meta.url).pathname;
for (const [id, size] of MODELS) {
  const dir = join(MODEL_OUT, id);
  const gltfPath = join(dir, `${id}.gltf`);
  if (existsSync(gltfPath)) continue;
  mkdirSync(dir, { recursive: true });
  const meta = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = meta.gltf['1k'].gltf;
  const gltf = await (await fetch(g.url)).json();
  for (const [rel, f] of Object.entries(g.include)) {
    const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
    if (/\.(jpe?g|png)$/i.test(rel)) {
      const tmp = join(TMP, rel.replace(/[\\/]/g, '_'));
      writeFileSync(tmp, buf);
      const out = rel.split('/').pop().replace(/\.(jpe?g|png)$/i, '.webp');
      execFileSync(magick, [tmp, '-resize', `${size}x${size}`, '-quality', '84', join(dir, out)]);
      rmSync(tmp);
      for (const img of gltf.images || []) if (img.uri === rel) { img.uri = out; delete img.mimeType; }
    } else {
      writeFileSync(join(dir, rel.split('/').pop()), buf);
      for (const b of gltf.buffers || []) if (b.uri === rel) b.uri = rel.split('/').pop();
    }
  }
  writeFileSync(gltfPath, JSON.stringify(gltf));
  console.log('ok', id);
}
