// Stills of the composed shots from the running app, for review.
// usage: node scripts/capture.mjs [shot ...]
//   env: URL (default http://127.0.0.1:5192/), OUT (default captures), W/H (default 960x540),
//        Q (quality tier, default low), SOFT=1 to force software GL (no GPU), CHROME=/path/to/chrome,
//        PARAMS extra query string for every shot (e.g. "h=17&w=rain"), KEEPLOAD=1 to keep the title page,
//        WAIT=seconds to wait after the frames are in (for interface animations), UI=1 to keep the interface
// A shot is a name from the app's shots (alley, bridge, pier) or name:query, e.g. "dusk:shot=bridge&h=18".
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL || 'http://127.0.0.1:5192/';
const OUT = process.env.OUT || 'captures';
const W = parseInt(process.env.W || '960'), H = parseInt(process.env.H || '540');
const Q = process.env.Q || 'low';
const extra = process.env.PARAMS || '';
const shots = (process.argv.length > 2 ? process.argv.slice(2) : ['alley', 'bridge', 'pier']).map((s) => {
  const [name, q] = s.includes(':') ? s.split(/:(.*)/s) : [s, `shot=${s}`];
  return { name, q };
});
mkdirSync(OUT, { recursive: true });

const args = ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
if (process.env.SOFT) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[jn]')) console.log(`${m.type()}: ${m.text().slice(0, 300)}`); });

for (const s of shots) {
  const t0 = Date.now();
  const q = [s.q, `q=${Q}`, process.env.UI ? '' : 'ui=0', extra].filter(Boolean).join('&');
  await page.goto(`${URL}?${q}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__jn && window.__jn.frames >= 3, null, { timeout: 15 * 60 * 1000, polling: 1000 });
  // the loader fades out over a second and a half; a fast first page can get there before it has gone
  if (!process.env.KEEPLOAD) await page.addStyleTag({ content: '#load { display: none !important; }' });
  if (process.env.WAIT) await page.waitForTimeout(parseFloat(process.env.WAIT) * 1000);
  await page.screenshot({ path: join(OUT, `${s.name}.png`), timeout: 10 * 60 * 1000 });
  console.log(`shot ${s.name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close();
