// Per-pass cost of one frame: draw calls and triangles for each render (the times are only indicative: on software
// GL gl.finish does not wait for the rasteriser), plus geometry and texture memory and the JS heap.
// usage: node scripts/perf.mjs "<query>" [w h]   (env URL, default http://127.0.0.1:5192/)
import { chromium } from 'playwright-core';
const [q = 'z=-22&w=drizzle&h=19.5&q=high&ui=0', w = '960', h = '540'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.text().startsWith('[jn]')) console.log(m.text()); });
const t0 = Date.now();
await page.goto(`${process.env.URL || 'http://127.0.0.1:5192/'}?${q}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__jn && window.__jn.frames >= 3, null, { timeout: 900000, polling: 500 });
console.log(`first frames after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.evaluate(() => {
  const { pipe, scene } = window.jiangnan;
  const r = pipe.renderer, gl = r.getContext();
  r.info.autoReset = false;
  const orig = r.render.bind(r);
  const log = [];
  window.__perf = { log, on: false };
  r.render = (s, c) => {
    if (!window.__perf.on) return orig(s, c);
    gl.finish();
    const rt = r.getRenderTarget();
    const c0 = r.info.render.calls, t0 = r.info.render.triangles, p0 = performance.now();
    orig(s, c);
    gl.finish();
    log.push({ rt: rt ? `${rt.width}x${rt.height}${rt.samples ? ' msaa' + rt.samples : ''}` : 'screen', mask: c.layers.mask, scene: s === scene ? 'scene' : (s.name || s.type), calls: r.info.render.calls - c0, tris: r.info.render.triangles - t0, ms: +(performance.now() - p0).toFixed(1) });
  };
  // one whole frame, from the start of one to the start of the next
  const f0 = window.__jn.frames;
  const wait = () => new Promise((res) => { const k = () => (window.__jn.frames > f0 ? res() : requestAnimationFrame(k)); k(); });
  window.__perfRun = (async () => {
    await wait();
    window.__perf.on = true;
    const p0 = performance.now();
    const f1 = window.__jn.frames;
    await new Promise((res) => { const k = () => (window.__jn.frames > f1 ? res() : requestAnimationFrame(k)); k(); });
    window.__perf.on = false;
    window.__perf.frameMs = performance.now() - p0;
  })();
});
await page.evaluate(() => window.__perfRun);
const out = await page.evaluate(() => {
  const { pipe, scene, THREE } = window.jiangnan;
  const r = pipe.renderer;
  // memory: unique geometries' buffers, textures' base levels (x4/3 for mips)
  const geos = new Set(), texs = new Set();
  let meshes = 0, statics = 0;
  scene.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.isMesh || o.isInstancedMesh) { meshes++; if (!o.matrixAutoUpdate) statics++; }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k in m) if (m[k] && m[k].isTexture) texs.add(m[k]);
  });
  let gbytes = 0, verts = 0;
  const byAttr = {};
  for (const g of geos) {
    for (const [k, a] of Object.entries(g.attributes)) { const b = a.array.byteLength; gbytes += b; byAttr[k] = (byAttr[k] || 0) + b; }
    if (g.index) { gbytes += g.index.array.byteLength; byAttr.index = (byAttr.index || 0) + g.index.array.byteLength; }
    if (g.attributes.position) verts += g.attributes.position.count;
  }
  let tbytes = 0;
  for (const t of texs) { const im = t.image; if (im && im.width) tbytes += im.width * im.height * 4 * (t.generateMipmaps === false ? 1 : 4 / 3); }
  const MB = (b) => +(b / 1048576).toFixed(1);
  const rts = [pipe.rtOpaque, pipe.rtMain].filter(Boolean).map((t) => `${t.width}x${t.height} type ${t.texture.type} samples ${t.samples}`);
  return {
    frameMs: +window.__perf.frameMs.toFixed(0), passes: window.__perf.log,
    totals: { calls: window.__perf.log.reduce((a, p) => a + p.calls, 0), tris: window.__perf.log.reduce((a, p) => a + p.tris, 0) },
    memory: { geometries: geos.size, verts, geometryMB: MB(gbytes), byAttrMB: Object.fromEntries(Object.entries(byAttr).map(([k, v]) => [k, MB(v)]).sort((a, b) => b[1] - a[1]).slice(0, 10)), textures: texs.size, textureMB: MB(tbytes), meshes, staticMeshes: statics, programs: r.info.programs.length, heapMB: performance.memory ? MB(performance.memory.usedJSHeapSize) : null },
    targets: rts, scale: pipe.scale, W: pipe.W, H: pipe.H, dpr: devicePixelRatio,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
