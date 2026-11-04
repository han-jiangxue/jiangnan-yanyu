// 江南烟雨: boot, the frame loop, and the glue between the systems.
// Two ways in: the journey (the default: the title page, then your own boat down the canal through the chapters), and
// review (?shot=, ?cam= or ?review: the composed shots and the review panel, for checking and for the capture script).
import * as THREE from 'three';
import './ui/ui.css';
import { U } from './core/shared.js';
import { QUALITY } from './core/quality.js';
import { Pipeline } from './core/pipeline.js';
import { loadTextures } from './core/assets.js';
import { Environment, WEATHERS, WEATHER_NAMES } from './env/environment.js';
import { createMaterials } from './world/materials.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createBanks } from './world/banks.js';
import { createBridge, BRIDGE } from './world/bridge.js';
import { createSlabBridges } from './world/slabbridge.js';
import { planTown, createTown, tileEnds } from './world/town.js';
import { createCorridor } from './world/corridor.js';
import { createGate } from './world/gate.js';
import { createHills } from './world/hills.js';
import { planWillows, createWillows } from './world/willow.js';
import { Boat, BoatTraffic } from './world/boat.js';
import { People } from './world/people.js';
import { createCloth } from './world/cloth.js';
import { loadProps, createProps } from './world/props.js';
import { createPlants } from './world/plants.js';
import { canalX, canalSlope, bankX, bankNormal, BRIDGE_Z, BANK_Y, CORRIDOR, CORE, nearSlabBridge } from './world/layout.js';
import { RainOcclusion } from './core/occlusion.js';
import { createRain } from './fx/rain.js';
import { createDrips } from './fx/drips.js';
import { createMist } from './fx/mist.js';
import { createHalos } from './fx/halos.js';
import { Soundscape } from './audio/soundscape.js';
import { CameraRig } from './journey/camera.js';
import { Director } from './journey/director.js';
import { Journey } from './journey/journey.js';
import { CHAPTERS, LOOPS, START_Z, END_Z } from './journey/route.js';
import { clamp } from './lib/math.js';
import { Panel } from './ui/panel.js';
import { JourneyUI, shichen } from './ui/journey-ui.js';
import { typingIn } from './ui/keys.js';

const params = new URLSearchParams(location.search);
const review = params.has('shot') || params.has('cam') || params.has('review');
// what the address asks for, each checked: a value that is missing or makes no sense counts as not given
const num = (k, lo, hi) => {
  if (!params.has(k)) return null;
  const v = parseFloat(params.get(k));
  return Number.isFinite(v) ? clamp(v, lo, hi) : null;
};
const want = {
  z: num('z', END_Z, START_Z),
  h: num('h', 0, 24),
  w: WEATHERS[params.get('w')] ? params.get('w') : null,
  mode: ['follow', 'seat', 'cinema'].includes(params.get('mode')) ? params.get('mode') : null,
  loop: num('j', 0, 999),
};
// any moment set in the URL goes straight in, without the title page
const direct = !review && [want.z, want.h, want.w, want.mode].some((v) => v !== null) && !params.has('intro');
const loadEl = document.getElementById('load');
const loadBar = loadEl.querySelector('.bar i');
const loadMsg = loadEl.querySelector('.m');
const progress = (p, msg) => {
  loadBar.style.width = `${Math.round(p * 100)}%`;
  if (msg) loadMsg.textContent = msg;
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const shFwd = new THREE.Vector3(), shC = new THREE.Vector3(), shR = new THREE.Vector3(), shU = new THREE.Vector3(), shUp = new THREE.Vector3(0, 1, 0);
let shTexel = 0.06;
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
// 1 -> 一, 12 -> 十二, 20 -> 二十, 35 -> 三十五 (up to 99)
const cnum = (n) => (n <= 10 ? NUM[n - 1] : n < 20 ? '十' + NUM[n - 11] : NUM[Math.floor(n / 10) - 1] + '十' + (n % 10 ? NUM[(n % 10) - 1] : ''));

// the composed shots for review; the pier shot is found among the planned lots
function composeShots(rig, lots) {
  const at = (z, dx, y) => [canalX(z) + dx, y, z];
  rig.addShot('alley', at(-46, 0.5, 1.7), at(-104, -0.2, 3.2), 42);
  rig.addShot('bridge', at(BRIDGE_Z + 23, 0, 0.85), [BRIDGE.x, 1.0, BRIDGE_Z], 38);
  let best = null;
  for (const l of lots) {
    if (l.spec.row !== 0 || !l.spec.pier || l.spec.lod !== 0) continue;
    const d = Math.abs(l.zc + 45);
    if (!best || d < best.d) best = { l, d };
  }
  if (best) {
    const { l } = best;
    const p = l.pos, { pier, D, bankGap } = l.spec;
    const m = new THREE.Matrix4().makeRotationY(p.rot).setPosition(p.x, p.y, p.z);
    const P = new THREE.Vector3(pier.x + pier.dir * 1.2, 0, D / 2 + bankGap + 0.6).applyMatrix4(m);
    const w = new THREE.Vector3(Math.sin(p.rot), 0, Math.cos(p.rot));
    const a = new THREE.Vector3(Math.cos(p.rot), 0, -Math.sin(p.rot));
    const cam = P.clone().addScaledVector(w, 4.4).addScaledVector(a, pier.dir * 3.0);
    cam.y = 1.05;
    const look = P.clone().addScaledVector(a, -pier.dir * 0.4);
    look.y = 1.1;
    rig.addShot('pier', cam.toArray(), look.toArray(), 52);
  } else {
    rig.addShot('pier', at(-45, 2.5, 1.3), at(-48, -4.5, 1.0), 46);
  }
  const cs = CORRIDOR.side;
  const inland = (z, d, y) => { const n = bankNormal(z, cs); return [bankX(z, cs) + n.x * d, y, z + n.z * d]; };
  rig.addShot('corridor', at(-12, -1.6 * cs, 1.25), inland(-38, 0.6, BANK_Y + 1.5), 50);
  rig.addShot('lane', inland(-15, 1.7, BANK_Y + 1.6), inland(-46, 1.1, BANK_Y + 1.3), 56);
  rig.addShot('roofs', at(-18, 4.5, 11), at(-62, -2, 4), 48);
  rig.addShot('landing', [BRIDGE.x + 13, 9, BRIDGE_Z + 14], [BRIDGE.x, 1.5, BRIDGE_Z], 45);
  rig.addShot('hills', at(-20, 6, 26), at(-200, 0, 6), 45);
  rig.addShot('willows', at(-70, -2.2, 1.4), at(-84, 3.6, 3.4), 50);
  rig.addShot('boat', at(-20, 2.6, 1.5), at(-31, -2.0, 0.6), 50);
  rig.addShot('street', inland(24, 1.0, BANK_Y + 1.65), inland(-4, 1.6, BANK_Y + 1.5), 55);
  rig.addShot('gate', at(62, -0.6, 1.5), inland(46, 1.8, BANK_Y + 2.6), 48);
}

async function boot() {
  const canvas = document.getElementById('c');
  const pipe = new Pipeline(canvas);
  const renderer = pipe.renderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);

  progress(0.02, '正在取墙灰与瓦片');
  const [tex, propSrc] = await Promise.all([loadTextures(renderer, (p) => progress(0.05 + p * 0.3)), loadProps()]);
  progress(0.42, '正在砌驳岸');
  await tick();
  const mats = createMaterials(tex);
  const env = new Environment();
  const sky = createSky();
  scene.add(sky.mesh);
  const water = createWater(pipe.reflection);
  scene.add(water.mesh);
  const banks = createBanks(mats);
  scene.add(banks);
  progress(0.5, '正在架石桥');
  await tick();
  scene.add(createBridge(mats));
  scene.add(createSlabBridges(mats));
  progress(0.56, '正在盖粉墙黛瓦');
  await tick();
  const t0 = performance.now();
  const lots = planTown();
  const town = createTown(mats, lots);
  scene.add(town);
  console.log(`[jn] town: ${JSON.stringify(town.userData.stats)} in ${(performance.now() - t0).toFixed(0)}ms`);
  const corridor = createCorridor(mats);
  scene.add(corridor);
  const corridorEnds = tileEnds(corridor.userData.caps, corridor.userData.drips);
  scene.add(corridorEnds);
  scene.add(createGate(mats));
  scene.add(createHills());
  progress(0.62, '正在种柳');
  await tick();
  scene.add(createWillows(mats, planWillows(banks.userData.piers)));
  const rain = createRain(QUALITY.rain);
  scene.add(rain.mesh);
  const drips = createDrips([...town.userData.dripPoints, ...corridor.userData.dripPoints]);
  scene.add(drips.mesh);
  const mist = createMist();
  scene.add(mist.mesh);
  scene.add(createHalos().mesh);
  mist.uniforms.tDepth.value = pipe.rtOpaque.depthTexture;
  const occ = new RainOcclusion();
  occ.hidden.push(sky.mesh);

  // boats: yours on the journey; others coming up the canal on the far side (in review, both ways); two moored
  const player = new Boat(mats, tex, { moving: true, boatman: true, cabin: true, seed: 9 });
  scene.add(player.root);
  const moving = [0, 1].map((i) => new Boat(mats, tex, { moving: true, boatman: true, seed: i + 1 }));
  for (const b of moving) scene.add(b.root);
  const traffic = new BoatTraffic(moving, canalX, canalSlope, [CORE.z0 + 60, CORE.z1 - 60], review ? undefined : [{ dir: 1, z: -40, speed: 1.1 }, { dir: 1, z: -175, speed: 0.95 }]);
  const moored = [];
  for (const zWant of [-32, -150]) {
    let best = null;
    for (const l of lots) {
      if (l.spec.row !== 0 || !l.spec.pier || l.spec.lod !== 0 || nearSlabBridge(l.zc, 9)) continue;
      const d = Math.abs(l.zc - zWant);
      if (!best || d < best.d) best = { l, d };
    }
    if (!best || best.d > 40) continue;
    const { l } = best;
    const { pier, D, bankGap } = l.spec;
    const m = new THREE.Matrix4().makeRotationY(l.pos.rot).setPosition(l.pos.x, 0, l.pos.z);
    const c = new THREE.Vector3(pier.x + pier.dir * 1.6, 0, D / 2 + bankGap + 0.95 + 0.82).applyMatrix4(m);
    const b = new Boat(mats, tex, { seed: moored.length + 5 });
    b.pose = { x: c.x, z: c.z, heading: Math.atan2(Math.cos(l.pos.rot), -Math.sin(l.pos.rot)), speed: 0 };
    scene.add(b.root);
    moored.push(b);
  }
  // the lanterns, fed to every material nearest first: the corridor's, the shops', and the boats' bow lanterns
  const lamps = [...corridor.userData.lamps, ...town.userData.lamps].map((p) => ({ x: p.x, y: p.y, z: p.z, r: 3.2, c: [1.0 * 1.4, 0.34 * 1.4, 0.12 * 1.4] }));
  for (const b of [player, ...moving, ...moored]) lamps.push(...b.lamps);
  const people = new People(10);
  scene.add(people.group);
  scene.add(createCloth(mats, lots));
  scene.add(createProps(propSrc, lots, banks.userData.piers));
  scene.add(createPlants(mats, lots, banks.userData.piers));

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = QUALITY.shadows;
  sun.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 500;
  shTexel = (sc.right - sc.left) / QUALITY.shadowSize;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, Math.PI);
  scene.add(hemi);

  // ------------------------------------------------------------ the journey, the camera, the controls
  const journey = new Journey();
  const ctl = { autoTime: want.h === null, autoWeather: want.w === null, started: review, captures: [], turning: false };
  const preset = () => LOOPS[journey.loop % LOOPS.length];
  if (want.loop !== null) journey.loop = Math.floor(want.loop);
  if (want.z !== null) journey.jump(want.z, true);
  if (review) journey.target = 0;
  const rig = review ? new CameraRig(camera, canvas) : null;
  const director = review ? null : new Director(camera, canvas);
  if (rig) composeShots(rig, lots);
  if (director && want.mode) director.setMode(want.mode);
  const sound = new Soundscape();
  env.onStrike = () => sound.strike();

  let ui = null, panel = null;
  const app = {
    env, rig, pipe, journey, director, ctl, sound,
    setShot(name) { rig.setShot(name); if (panel) panel.sync(); },
    setHours(h) { ctl.autoTime = false; env.setHours(h); if (panel) panel.sync(); },
    setAutoTime(on) { ctl.autoTime = on; },
    setWeather(w) { ctl.autoWeather = false; env.setWeather(w); if (panel) panel.sync(); },
    setAutoWeather(on) { ctl.autoWeather = on; },
    togglePause() { journey.togglePause(); },
    // sound on or off, from the dock or M; the click or the key that asks is the gesture that lets it start
    toggleSound() { return sound.toggle(); },
    // a photograph of the next frame drawn; several asked for before it is drawn all get that one
    capture() { return new Promise((res) => { ctl.captures.push(res); }); },
    // the address of this moment: the place always; the hour, the weather and the view only when chosen by hand.
    // The address bar also keeps this device's own settings (quality, scale, interface), a shared link does not.
    shareUrl(own = false) {
      const q = new URLSearchParams();
      q.set('z', String(Math.round(journey.z)));
      // which journey it is, for the hour and the weather that journey has
      if (journey.loop > 0) q.set('j', String(journey.loop));
      if (!ctl.autoTime) q.set('h', env.hoursTarget.toFixed(1));
      if (!ctl.autoWeather) q.set('w', env.weather);
      if (director && director.mode !== 'follow' && director.mode !== 'photo') q.set('mode', director.mode);
      if (own) for (const k of ['q', 'scale', 'ui']) if (params.has(k)) q.set(k, params.get(k));
      const u = new URL(location.href);
      u.search = q.toString();
      u.hash = '';
      return u.href;
    },
    async jumpTo(i) {
      if (ctl.turning) return;
      ctl.turning = true;
      await ui.paper(true, CHAPTERS[i].name);
      journey.jump(CHAPTERS[i].z0 - 1, true);
      traffic.agents.forEach((a) => a.wake.forEach((w) => w.set(0, 0, -1e4, 0)));
      // the clock is already where this stretch keeps it when the paper lifts
      if (ctl.autoTime) env.setHours(preset().h + journey.progress * 0.8, true);
      director.cut();
      await ui.paper(false);
      ctl.turning = false;
    },
  };

  // the end of a journey: the paper comes down, the next hour and weather, and the boat sets off again at the town gate
  journey.onEnd = async () => {
    if (ctl.turning) return;
    ctl.turning = true;
    const next = LOOPS[(journey.loop + 1) % LOOPS.length];
    await ui.paper(true, `第${cnum(((journey.loop + 1) % 99) + 1)}程<small>${shichen(next.h)} · ${WEATHER_NAMES[next.w]}</small>`);
    journey.reset(journey.loop + 1);
    if (ctl.autoTime) env.setHours(next.h, true);
    if (ctl.autoWeather) env.setWeather(next.w);
    env.update(0, true);
    director.cut();
    await ui.paper(false);
    ctl.turning = false;
  };
  journey.onChapter = (i) => { if (ui) ui.chapter(i); };

  if (want.h !== null) env.setHours(want.h, true);
  else if (!review) env.setHours(preset().h, true);
  if (want.w) env.setWeather(want.w);
  else if (!review) env.setWeather(preset().w);
  env.update(0, true);
  if (rig) {
    const v = (s) => s.split(',').map(Number);
    const ok = (a) => a.length === 3 && a.every(Number.isFinite);
    const cam = params.has('cam') ? v(params.get('cam')) : null;
    const look = v(params.get('look') || `${canalX(-100)},2,-100`);
    const shot = params.get('shot');
    if (cam && ok(cam) && ok(look)) rig.setView(cam, look, num('fov', 10, 120) ?? 45);
    else rig.setShot(shot === 'glide' || shot === 'free' || rig.shots[shot] ? shot : 'alley');
  }

  // The keys are the page's, except while typing, or for the keys a focused hour slider moves with. Nothing with a
  // modifier held (Ctrl+C is a copy, not a change of view; a key released while Cmd is down never reports its keyup).
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (typingIn(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) { keys.clear(); return; }
    keys.add(e.code);
    if (!director || !ctl.started || e.repeat) return;
    // Space on a focused button presses the button
    if (e.code === 'Space' && !(e.target.closest && e.target.closest('button, a'))) { e.preventDefault(); journey.togglePause(); }
    if (e.code === 'KeyC' && director.mode !== 'photo') director.setMode({ follow: 'seat', seat: 'cinema', cinema: 'follow' }[director.mode]);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());
  // The browser lets sound start only from a gesture, so every press and key offers one (启程 is usually the first).
  // A finger going down is not one; lifting it is.
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(ev, () => sound.unlock(), { capture: true, passive: true });

  const resize = () => {
    pipe.resize();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    mist.uniforms.uRes.value.set(pipe.W, pipe.H);
    mist.uniforms.uNearFar.value.set(camera.near, camera.far);
  };
  window.addEventListener('resize', resize);
  resize();

  // link every program before the first frame, off the main thread where the driver allows
  progress(0.7, '正在调墨');
  await tick();
  const tc = performance.now();
  // one pass is enough: compile() prepares every material in the scene whatever its layer, with the lights the
  // camera's layers see (they are on layer 0); a second pass with only the water and effects layers would build an
  // unlit variant of every lit material that is never drawn
  renderer.setRenderTarget(pipe.rtOpaque);
  camera.layers.mask = 1;
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  console.log(`[jn] ${renderer.info.programs.length} programs in ${(performance.now() - tc).toFixed(0)}ms`);
  progress(1, '');

  if (review) {
    panel = params.get('ui') === '0' ? null : new Panel(app);
    if (!panel) document.body.classList.add('hidden-ui');
    rig.onChange = () => panel && panel.sync();
  } else {
    ui = new JourneyUI(app);
    app.ui = ui;
    if (params.get('ui') === '0') ui.root.classList.add('hidden');
  }

  // The nearest lamps light the materials: nearest to a point a little ahead of the camera, where what is seen lies,
  // so lamps behind the view do not take the places of those ahead. Each keeps its own flicker whatever its rank, and
  // the last two places are dimmed so a lamp coming into the list fades in rather than appearing.
  const lampOrder = lamps.map((l, i) => i);
  const lampD = new Float32Array(lamps.length);
  const lampAt = new THREE.Vector3(), lampFwd = new THREE.Vector3();
  function updateLamps(cam, on, t) {
    camera.getWorldDirection(lampFwd);
    lampFwd.y = 0;
    if (lampFwd.lengthSq() > 1e-6) lampFwd.normalize();
    lampAt.copy(cam).addScaledVector(lampFwd, 12);
    // (or near the camera itself: your own boat's lanterns, a lantern being passed, always keep their places)
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      lampD[i] = Math.min((l.x - lampAt.x) ** 2 + (l.z - lampAt.z) ** 2, 4 * ((l.x - cam.x) ** 2 + (l.z - cam.z) ** 2));
    }
    lampOrder.sort((a, b) => lampD[a] - lampD[b]);
    const P = U.uLampPos.value, C = U.uLampCol.value;
    for (let i = 0; i < P.length; i++) {
      const id = lampOrder[i], l = lamps[id];
      if (!l || on < 0.01) { P[i].set(0, -999, 0, 1); C[i].set(0, 0, 0); continue; }
      const flick = 0.93 + 0.07 * Math.sin(t * 7 + id * 1.7) * Math.sin(t * 4.3 + id);
      const k = on * flick * (i < P.length - 2 ? 1 : i === P.length - 2 ? 0.66 : 0.33);
      P[i].set(l.x, l.y, l.z, l.r);
      C[i].set(l.c[0] * k, l.c[1] * k, l.c[2] * k);
    }
  }

  // your boat's wake history, kept the way the other boats keep theirs
  const playerWake = { wake: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -1e4, 0)), sample: -1, dist: 0, lastZ: journey.z };
  function trackPlayerWake(dt, t) {
    const p = journey.pose, w = playerWake;
    // a jump or a new journey starts a fresh wake
    if (Math.abs(p.z - w.lastZ) > 20) w.wake.forEach((v) => v.set(0, 0, -1e4, 0));
    w.lastZ = p.z;
    w.dist += p.speed * dt;
    const bx = p.x + Math.sin(p.heading) * 3.4, bz = p.z + Math.cos(p.heading) * 3.4;
    if (t - w.sample > 0.5) {
      for (let i = 15; i > 1; i--) w.wake[i].copy(w.wake[i - 1]);
      w.wake[1].set(bx, bz, t, w.dist);
      w.sample = t;
    }
    w.wake[0].set(bx, bz, t, w.dist);
  }
  // the water draws two wakes: yours first on the journey, then the nearest other boat
  function feedWakes(cam) {
    const W = [water.uniforms.uWake0.value, water.uniforms.uWake1.value];
    const slots = [];
    if (!review) slots.push({ wake: playerWake.wake, x: journey.pose.x, z: journey.pose.z, heading: journey.pose.heading, speed: journey.pose.speed });
    const others = traffic.agents.slice().sort((a, b) => Math.abs(a.z - cam.z) - Math.abs(b.z - cam.z));
    for (const a of others) if (slots.length < 2) slots.push(a);
    slots.forEach((s, i) => {
      for (let k = 0; k < 16; k++) W[i][k].copy(s.wake[k]);
      water.uniforms.uBoatP.value[i].set(s.x, s.z, s.heading, s.speed);
      // the rectangle the wake can reach: the hull's collar, the track of the last forty seconds (carried down by the
      // current) and the Kelvin waves spreading off it at about 20 degrees
      let x0 = s.x - 5, x1 = s.x + 5, z0 = s.z - 5, z1 = s.z + 5, run = 0, px = s.x, pz = s.z;
      for (let k = 0; k < 16; k++) {
        const w = s.wake[k], age = clockT - w.z;
        if (age > 40 || w.z < -1e3) break;
        const wx = w.x, wz = w.y - 0.16 * age;
        run += Math.hypot(wx - px, wz - pz);
        px = wx; pz = wz;
        // (the current is slower near the banks, so a point lies somewhere between where it was left and wz)
        x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, w.y);
      }
      const m = s.speed > 0.05 ? 4 + 0.36 * Math.min(run, 60) : 0;
      water.uniforms.uWakeBox.value[i].set(x0 - m, z0 - m, x1 + m, z1 + m);
    });
    for (let i = slots.length; i < 2; i++) water.uniforms.uWakeBox.value[i].set(0, 0, -1, -1);
  }

  const state = { frames: 0, ready: false, fps: 60 };
  // what the soundscape is told each frame; the boats with a boatman at the oar are the ones it listens to
  const heard = { live: false, veil: false, rain: 0, wet: 0, wind: 0, hours: 0, storm: false, seat: false, boats: [player, ...moving] };
  let last = performance.now();
  let clockT = 0;
  // ?warm=seconds: run the boats and the people that long before the first frame (wakes need a track behind them)
  const warm = Math.min(120, parseFloat(params.get('warm') || '0'));
  for (let t = 0; t < warm; t += 0.1) {
    clockT += 0.1;
    traffic.update(0.1, clockT);
    people.update(0.1, clockT, U.uRain.value);
    if (direct) { journey.update(0.1); trackPlayerWake(0.1, clockT); }
  }
  let perfT = 0;
  function frame(now) {
    // asked for first, so that an error further down costs one frame and not the rest of the visit
    requestAnimationFrame(frame);
    const dtMs = Math.max(0, Math.min(100, now - last));
    last = now;
    const dt = dtMs / 1000;
    clockT += dt;
    U.uTime.value = clockT;

    // your boat: the keys steer and set the pace once the journey has begun
    if (!review && ctl.started) {
      journey.steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      journey.thrust = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      journey.update(dt);
      trackPlayerWake(dt, clockT);
    }
    player.update(clockT, journey.pose);
    // the hour and the weather follow the journey unless set by hand; the clock drifts on as the boat goes
    if (!review && ctl.autoTime && !ctl.turning) env.setHours(preset().h + journey.progress * 0.8);
    if (!review && ctl.autoWeather && !ctl.turning) env.setWeather(preset().w);
    env.update(dt);
    traffic.update(dt, clockT);
    for (const b of moored) b.update(clockT, b.pose);
    people.update(dt, clockT, U.uRain.value);
    if (rig) rig.update(dt);
    else director.update(dt, journey.pose, player.root);
    camera.updateMatrixWorld();
    feedWakes(camera.position);
    rain.update(camera);
    town.userData.update(camera.position);
    town.userData.ends.userData.update(camera.position);
    corridorEnds.userData.update(camera.position);

    sky.uniforms.uCloud.value = env.cloud;
    sky.uniforms.uCloudDark.value = env.dark;
    sky.uniforms.uSunVis.value = env.sunVis;

    // The key light follows the view: its shadow box centred ahead of the camera, where what is seen lies, and moved
    // only in whole shadow-map texels so that shadow edges hold still as the boat glides. Under a weak sun (rain,
    // night) the shadows are faint and the map is redrawn less often.
    const k = U.uSunDir.value;
    camera.getWorldDirection(shFwd);
    shFwd.y = 0;
    if (shFwd.lengthSq() > 1e-6) shFwd.normalize();
    shC.copy(camera.position).addScaledVector(shFwd, 22);
    shC.y = 0;
    shR.crossVectors(shUp, k);
    if (shR.lengthSq() < 1e-6) shR.set(1, 0, 0);
    shR.normalize();
    shU.crossVectors(k, shR);
    const ta = shC.dot(shR), tb = shC.dot(shU);
    shC.addScaledVector(shR, Math.round(ta / shTexel) * shTexel - ta).addScaledVector(shU, Math.round(tb / shTexel) * shTexel - tb);
    sun.target.position.copy(shC);
    sun.position.copy(shC).addScaledVector(k, 250);
    const scol = U.uSunCol.value;
    const si = Math.max(scol.x, scol.y, scol.z);
    sun.intensity = si;
    if (si > 0) sun.color.setRGB(scol.x / si, scol.y / si, scol.z / si);
    const amb = Math.max(U.uAmbUp.value.x, U.uAmbUp.value.y, U.uAmbUp.value.z);
    pipe.shadowEvery = si < amb * 1.5 ? 8 : 2;
    hemi.color.setRGB(U.uAmbUp.value.x, U.uAmbUp.value.y, U.uAmbUp.value.z);
    hemi.groundColor.setRGB(U.uAmbDown.value.x, U.uAmbDown.value.y, U.uAmbDown.value.z);
    U.uLampOn.value = env.lampOn;
    updateLamps(camera.position, env.lampOn, clockT);
    occ.update(renderer, scene, camera);
    Object.assign(heard, {
      live: review || ctl.started, veil: ctl.turning, rain: U.uRain.value, wet: U.uWet.value, wind: U.uWind.value.z,
      hours: env.hours, storm: env.weather === 'storm', seat: !!director && director.mode === 'seat',
    });
    sound.update(dt, camera, heard);

    const cu = pipe.post.composite.uniforms;
    cu.uExposure.value = env.exposure;
    cu.uTime.value = clockT;
    cu.uNightK.value = env.night;
    cu.uBloom.value = 0.04 + env.night * 0.05;
    // a lighter vignette at night, when the dark corners would only swallow the lanterns' town
    cu.uVignette.value = 0.42 - 0.12 * env.night;

    camera.getWorldPosition(U.uViewPos.value);
    // the mist reads the depth at its own pixel, so it needs the render size the governor may just have changed
    mist.uniforms.uRes.value.set(pipe.W, pipe.H);
    pipe.render(scene, camera, { water });
    if (ctl.captures.length) {
      // copied out in the frame it was drawn, before the drawing buffer is cleared
      const waiting = ctl.captures.splice(0);
      ui.stamp(canvas).toBlob((b) => waiting.forEach((res) => res(b)), 'image/png');
    }
    pipe.govern(dtMs);

    state.frames++;
    state.fps += (1000 / Math.max(dtMs, 1) - state.fps) * 0.05;
    perfT += dt;
    if (panel && perfT > 0.5) {
      perfT = 0;
      panel.perf(state.fps, pipe.scale, pipe.W, pipe.H);
    }
    if (ui) ui.update(now);
    if (state.frames === 2) {
      state.ready = true;
      if (review) loadEl.classList.add('gone');
      else if (direct) { ui.skip(); ctl.started = true; }
      else ui.ready().then(() => { ctl.started = true; });
    }
  }
  window.jiangnan = { app, env, rig, director, journey, pipe, scene, camera, U, lots, state, player, sound };
  window.__jn = state;
  player.update(0, journey.pose);
  if (director) director.update(0, journey.pose, player.root);
  camera.updateMatrixWorld();
  occ.update(renderer, scene, camera, true);
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  const el = document.createElement('div');
  el.className = 'err';
  // a missing WebGL2 is one thing, a file that did not arrive another
  const gl = !!document.createElement('canvas').getContext('webgl2');
  el.textContent = (gl ? '小镇没能建起来，可能是网络中断或素材加载失败，请刷新重试' : '这台设备暂时无法渲染这座小镇（需要 WebGL2）') + ' · ' + (e && e.message ? e.message : e);
  loadEl.appendChild(el);
});
