// Shrinks the Poly Haven prop scans to what a prop on a landing needs: the meshes simplified with meshoptimizer to
// about a thousand triangles each (the weave and the glaze live in the normal and colour maps, which stay), and the
// maps scaled to 256 px. Run after `npm run fetch-assets`; it rewrites public/assets/models/<id> in place and skips
// models that are already small enough. Needs ImageMagick for the maps.
// usage: node scripts/simplify-props.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../public/assets/models/', import.meta.url).pathname;
// triangles to aim for, per model
const TARGET = { wicker_basket_01: 1600, ceramic_vase_02: 900, antique_ceramic_vase_01: 900, wooden_bucket_01: 1100, planter_pot_clay: 700 };
const MAP_SIZE = 256;

const magick = (() => { for (const c of ['magick', 'convert']) { try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch { /* next */ } } return null; })();

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

for (const id of Object.keys(TARGET)) {
  const dir = join(ROOT, id);
  const path = join(dir, `${id}.gltf`);
  const doc = await io.read(path);
  const before = tris(doc);
  if (before > TARGET[id] * 1.5) {
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: TARGET[id] / before, error: 0.02, lockBorder: false }),
      dedup(),
      prune(),
    );
    await io.write(path, doc);
  }
  console.log(`${id}: ${before} -> ${tris(await io.read(path))} triangles`);
  if (!magick) { console.log('  (no ImageMagick: maps left as they are)'); continue; }
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.webp'))) {
    const p = join(dir, f);
    const w = parseInt(execFileSync(magick === 'magick' ? 'magick' : 'identify', magick === 'magick' ? ['identify', '-format', '%w', p] : ['-format', '%w', p]).toString(), 10);
    if (w > MAP_SIZE) execFileSync(magick, [p, '-resize', `${MAP_SIZE}x${MAP_SIZE}`, '-quality', '86', p]);
  }
}
