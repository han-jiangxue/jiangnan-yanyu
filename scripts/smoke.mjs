// A quick check that every season and weather draws without a shader error, on the journey and in review: each season
// the build has (window.jiangnan.seasons) with each weather, snapped in at noon and at night, two frames drawn each,
// any page error or console error reported, the programs counted and any that failed to link named. Exits 1 on a
// problem, so it can stand in front of a commit.
// usage: npm run dev &   then   node scripts/smoke.mjs
//   env: URL (default http://127.0.0.1:5192/), SOFT=1 to force software GL (no GPU), CHROME=/path/to/chrome
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://127.0.0.1:5192/';
const args = ['--ignore-gpu-blocklist'];
if (process.env.SOFT) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args });
const problems = [];
const rows = [];
const t0 = Date.now();

for (const [mode, query] of [['journey', 'z=-30'], ['review', 'shot=bridge']]) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => problems.push(`${mode}: page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${mode}: ${m.text().slice(0, 400)}`); });
  await page.goto(`${URL}?${query}&q=low&scale=0.5&ui=0`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__jn && window.__jn.frames >= 3, null, { timeout: 15 * 60 * 1000, polling: 500 });
  const out = await page.evaluate(async () => {
    const { app, env, pipe, seasons, weathers } = window.jiangnan;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    let states = 0;
    for (const s of seasons) for (const w of weathers) for (const h of [12, 21.5]) {
      app.setSeason(s);
      app.setWeather(w);
      app.setHours(h);
      env.update(0, true);
      await frame();
      await frame();
      states++;
    }
    // three.js keeps a program's diagnostics when its shaders fail to compile or link
    const programs = pipe.renderer.info.programs;
    return { states, programs: programs.length, failed: programs.filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name || p.cacheKey.slice(0, 60)) };
  });
  for (const name of out.failed) problems.push(`${mode}: a program failed: ${name}`);
  rows.push({ mode, states: out.states, programs: out.programs, failed: out.failed.length });
  await page.close();
}
await browser.close();

console.table(rows);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('ok');
