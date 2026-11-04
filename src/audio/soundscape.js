// The soundscape: what you hear on the boat. The rain is three things at once: its wash over the whole town, the drops
// in the canal and on the stones round about, and, under a roof or the boat's awning, the drumming just overhead; a
// roof over you muffles the open rain, and the bridge's arch rings with it. Over the rain come the single sounds:
// drips off the eaves, each boatman's oar creaking on its pin and its blade swishing through the water, the water
// against the hull, thunder after the lightning, and late at night or at first light a temple bell from beyond the
// roofs. All of it is made in code (audio/synth.js) once the first gesture comes, since the browser lets sound start
// only from one, and a piece at a time so that no frame stalls; thunder and the bell only when first wanted.
import * as THREE from 'three';
import * as S from './synth.js';
import { bankX, inCanal, BANK_Y, LANE_W, CORRIDOR } from '../world/layout.js';
import { BRIDGE } from '../world/bridge.js';
import { SLABS } from '../world/slabbridge.js';
import { PAGODA_AIM } from '../world/hills.js';
import { clamp, lerp, smoothstep, vnoise } from '../lib/math.js';

const MUTE_KEY = 'jiangnan-yanyu:muted';
const DROP_RATE = 32000; // drops, drips and creaks: nothing above 16 kHz matters
const LOW_RATE = 24000; // the noise beds (filtered well below 12 kHz), the swish, thunder and the bell
const MASTER = 1;

const rand = (a, b) => a + (b - a) * Math.random();
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// a point source: full within ref metres, then falling as 1/distance, gone by reach
const att = (d, ref, reach) => (ref / Math.max(ref, d)) * smoothstep(reach, reach * 0.7, d);
// the bell's hours: late at night (夜半钟声到客船) and at first light
const bellHours = (h) => h >= 22.5 || h < 1.5 || (h >= 4.6 && h < 7);
const _v = new THREE.Vector3();

// How sheltered a listener at p is: cover 0..1, a roof over them (the corridor, the bridge's arch, a slab bridge's
// deck, the boat's awning seen from the seat), and arch 0..1, inside the stone arch, which rings
export function shelter(p, seat) {
  let cover = seat ? 0.65 : 0, arch = 0;
  // the corridor's roof, from just over the water's edge back to the shop fronts
  const along = Math.min(p.z - CORRIDOR.z1, CORRIDOR.z0 - p.z);
  if (along > -1.5 && p.y < BANK_Y + 3.3) {
    const d = CORRIDOR.side * (p.x - bankX(p.z, CORRIDOR.side));
    cover = Math.max(cover, smoothstep(-1.5, 0.5, along) * smoothstep(-0.8, 0.3, d) * smoothstep(LANE_W + 0.8, LANE_W, d));
  }
  // the bridges, each in its own frame: lx across the canal, lz along it
  const local = (b) => {
    const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = p.x - b.x, dz = p.z - b.z;
    return [c * dx - s * dz, Math.abs(s * dx + c * dz)];
  };
  const [ax, az] = local(BRIDGE);
  if (p.y < Math.sqrt(Math.max(0, BRIDGE.R * BRIDGE.R - ax * ax))) {
    arch = 1 - smoothstep(BRIDGE.W / 2 - 0.5, BRIDGE.W / 2 + 3.5, az);
    cover = Math.max(cover, 0.85 * (1 - smoothstep(BRIDGE.W / 2 - 0.3, BRIDGE.W / 2 + 0.8, az)));
  }
  for (const b of SLABS) {
    const [sx, sz] = local(b);
    if (p.y > b.bottom || Math.abs(sx) > b.hw + 0.5) continue;
    cover = Math.max(cover, 0.75 * (1 - smoothstep(b.W / 2 - 0.2, b.W / 2 + 0.6, sz)));
    arch = Math.max(arch, 0.35 * (1 - smoothstep(b.W / 2, b.W / 2 + 2, sz)));
  }
  return { cover, arch };
}

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage refused */ }
    this.g = {}; // the beds' gains, as each is made
    this.buf = {}; // the single sounds, as each is made
    this.asked = {};
    this.queue = [];
    this.pumping = false;
    this.want = -1;
    this.wakeAt = 0;
    // the listener: where, and the camera's right in xz
    this.l = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    this.cover = 0;
    this.arch = 0;
    this.water = 0.6;
    this.clock = 0;
    this.tParam = 0;
    this.dripT = 1;
    this.bellT = 10;
    this.halves = new Map(); // boat -> the half-stroke its oar was in
    document.addEventListener('visibilitychange', () => this.wake());
  }

  // From a gesture's handler, every time: the first makes the context, later ones wake it if the browser or a hidden
  // tab put it to sleep. Nothing while muted, or before a gesture that may start sound (a finger going down may not).
  unlock() {
    if (this.muted || this.broken) return;
    if (!this.ctx) {
      if (navigator.userActivation && !navigator.userActivation.isActive) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'playback' });
        this.build();
      } catch (e) {
        console.warn('[jn] no sound:', e);
        this.broken = true;
        if (this.ctx) this.ctx.close().catch(() => {});
        this.ctx = null;
        return;
      }
    }
    this.wake();
  }

  wake() {
    const c = this.ctx;
    if (!c) return;
    if (document.hidden) {
      if (c.state === 'running') c.suspend().catch(() => {});
    } else if (c.state !== 'running' && !this.muted) {
      c.resume().catch(() => {});
    }
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage refused */ }
    if (!m) this.unlock();
  }

  // the master and what feeds it now; the sounds themselves a piece at a time after
  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    // a limiter in all but name: only thunder reaches it
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.3;
    this.meter = c.createAnalyser();
    this.meter.fftSize = 2048;
    this.master.connect(comp).connect(this.meter).connect(c.destination);
    this.mix = c.createGain();
    this.mix.connect(this.master);
    // the reverb: water and stone between close walls, and the bridge's arch
    this.verb = c.createConvolver();
    this.send = c.createGain();
    this.send.connect(this.verb).connect(this.master);
    // the open rain: muffled and quieter under a roof, sent to the reverb more inside the arch
    this.rainBus = c.createGain();
    this.rainLP = this.biquad('lowpass', 16000, 0.5);
    this.rainOut = c.createGain();
    this.rainSend = c.createGain();
    this.rainBus.connect(this.rainLP).connect(this.rainOut).connect(this.mix);
    this.rainOut.connect(this.rainSend).connect(this.send);
    // some browsers start a context only when something plays in the gesture itself
    const b = c.createBufferSource();
    b.buffer = c.createBuffer(1, 1, c.sampleRate);
    b.connect(c.destination);
    b.start();

    const drops = (seconds, perSecond, grain, seed, o = {}) => S.grainLoop({ seconds, rate: DROP_RATE, perSecond, grain, seed, ...o });
    this.queue.push(
      () => { this.verb.buffer = this.buffer(S.impulse(c.sampleRate)); },
      () => {
        const noise = this.buffer(S.pinkLoop(5, LOW_RATE, 11));
        this.washLP = this.biquad('lowpass', 4000, 0.5);
        this.airLP = this.biquad('lowpass', 400, 0.5);
        this.g.wash = this.bed(noise, [this.biquad('highpass', 280, 0.6), this.washLP], this.rainBus);
        this.g.air = this.bed(noise, [this.airLP], this.mix, { offset: 2.1, rate: 0.93 });
        this.g.lap = this.bed(noise, [this.biquad('bandpass', 260, 1.1)], this.mix, { offset: 3.7, rate: 0.9 });
        this.g.bow = this.bed(noise, [this.biquad('bandpass', 1050, 0.7)], this.mix, { offset: 1.3, rate: 1.07 });
      },
      () => { this.g.waterSparse = this.bed(this.buffer(drops(4.3, 34, S.dropOnWater, 21)), [], this.rainBus, { rate: 0.98 }); },
      () => { this.g.waterDense = this.bed(this.buffer(drops(3.7, 320, S.dropOnWater, 22)), [], this.rainBus, { rate: 1.02 }); },
      () => {
        this.g.stoneSparse = this.bed(this.buffer(drops(4.7, 30, S.dropOnStone, 23)), [], this.rainBus, { rate: 1.01 });
        this.g.stoneDense = this.bed(this.buffer(drops(3.1, 280, S.dropOnStone, 24)), [], this.rainBus, { rate: 0.99 });
      },
      // the drumming overhead is not muffled by the roof it falls on
      () => { this.g.roof = this.bed(this.buffer(drops(3.3, 260, S.dropOverhead, 25, { loud: 2 })), [this.biquad('lowpass', 2600, 0.6)], this.mix); },
      () => {
        this.buf.drips = { water: S.takes(S.dripInWater, 6, 31, DROP_RATE).map((d) => this.buffer(d)), stone: S.takes(S.dripOnStone, 6, 32, DROP_RATE).map((d) => this.buffer(d)) };
        // the push loads the pin and the creak rises; the draw eases it and the creak falls
        this.buf.creak = [[51, 53], [52, 54]].map((seeds, k) => seeds.map((s) => this.buffer(S.creak(s, DROP_RATE, k === 0))));
      },
      () => { this.buf.swish = [61, 62, 63].map((s) => this.buffer(S.swish(s, LOW_RATE))); },
    );
    this.pump();
  }

  // the next piece of work now, the one after it a moment later
  pump() {
    if (this.pumping) return;
    this.pumping = true;
    const step = () => {
      const f = this.queue.shift();
      if (!f) { this.pumping = false; return; }
      f();
      setTimeout(step, 25);
    };
    setTimeout(step, 0);
  }

  // a sound only some visits need, made the first time it is wanted
  ask(key, ...work) {
    if (this.asked[key] || !this.ctx) return;
    this.asked[key] = true;
    this.queue.push(...work);
    this.pump();
  }

  biquad(type, f, q) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  // plain samples (synth.js) into an AudioBuffer; a rate other than the context's is resampled as it plays
  buffer({ rate, chs }) {
    const b = this.ctx.createBuffer(chs.length, chs[0].length, rate);
    chs.forEach((x, i) => b.copyToChannel(x, i));
    return b;
  }

  // a loop playing for good through a chain of filters into out; its gain, silent until set, is returned
  bed(buf, chain, out, o = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = c.createGain();
    g.gain.value = 0;
    let n = src;
    for (const f of chain) n = n.connect(f);
    n.connect(g).connect(out);
    src.start(c.currentTime, o.offset || 0);
    return g;
  }

  // one sound, once: at a gain, panned, through a lowpass and into the reverb if asked, now or a moment from now
  play(buf, o) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    if (o.rate) src.playbackRate.value = o.rate;
    let n = src;
    if (o.lp) n = n.connect(this.biquad('lowpass', o.lp, 0.6));
    const g = c.createGain();
    g.gain.value = o.gain;
    n = n.connect(g);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(o.pan || 0, -1, 1);
      n = n.connect(p);
    }
    n.connect(this.mix);
    if (o.send) {
      const s = c.createGain();
      s.gain.value = o.send;
      n.connect(s).connect(this.send);
    }
    src.start(c.currentTime + (o.delay || 0));
  }

  // where a sound at (x, z) sits between the ears
  pan(x, z) {
    const dx = x - this.l.x, dz = z - this.l.z, d = Math.hypot(dx, dz);
    return d < 1e-3 ? 0 : clamp((dx * this.l.rx + dz * this.l.rz) / d, -1, 1) * 0.85;
  }

  // Once a frame. s: { live (the journey has begun, or review), veil (the paper is down), rain, wet, wind, hours,
  // storm, seat (listening from the seat under the awning), boats (those with a boatman) }
  update(dt, camera, s) {
    const c = this.ctx;
    if (!c) return;
    const on = s.live && !this.muted && !document.hidden;
    const want = on ? (s.veil ? 0.35 : 1) * MASTER : 0;
    if (want !== this.want) {
      this.master.gain.setTargetAtTime(want, c.currentTime, want > this.want ? 0.8 : 0.15);
      this.want = want;
    }
    // Muted: asleep once the fade has run out (unmuting is a gesture, and wakes it). Before 启程 it stays awake but
    // silent: a context put to sleep outside a gesture may not be let up again until the next one.
    if (this.muted) {
      if (c.state === 'running' && this.master.gain.value < 0.002) c.suspend().catch(() => {});
      return;
    }
    if (!on) return;
    // woken by the browser's leave (a tab come back, a call ended), at most once a second
    const now = performance.now();
    if (c.state !== 'running' && now > this.wakeAt) {
      this.wakeAt = now + 1000;
      c.resume().catch(() => {});
    }
    this.clock += dt;
    const p = camera.position, e = camera.matrixWorld.elements;
    const rl = Math.hypot(e[0], e[2]) || 1;
    Object.assign(this.l, { x: p.x, y: p.y, z: p.z, rx: e[0] / rl, rz: e[2] / rl });
    const sh = shelter(p, s.seat);
    const k = 1 - Math.exp(-dt * 5);
    this.cover += (sh.cover - this.cover) * k;
    this.arch += (sh.arch - this.arch) * k;
    // over the water the drops are mostly in it; on a lane mostly on the stones
    this.water += ((inCanal(p.x, p.z) ? 0.75 : 0.3) - this.water) * (1 - Math.exp(-dt * 1.5));
    this.tParam -= dt;
    if (this.tParam <= 0) {
      this.tParam = 1 / 15;
      this.params(s);
    }
    // thunder only once a storm is called for (no journey has one), the bell once its hour comes round
    if (s.storm && !this.asked.thunder) {
      const t = (this.buf.thunder = { far: [], near: [] });
      const make = (seed, near) => () => (near ? t.near : t.far).push(this.buffer(S.thunder(seed, LOW_RATE, near)));
      this.ask('thunder', make(41, false), make(42, false), make(43, true));
    }
    if (bellHours(s.hours)) this.ask('bell', () => { this.buf.bell = this.buffer(S.bell(LOW_RATE)); });
    this.drips(dt, s);
    this.oars(s);
    this.bells(dt, s);
  }

  // the beds' levels, a few times a second
  params(s) {
    const t = this.ctx.currentTime, g = this.g;
    const set = (param, v, tc = 0.12) => param.setTargetAtTime(v, t, tc);
    const rain = s.rain, falling = smoothstep(0, 0.06, rain), heavy = smoothstep(0.2, 0.9, rain);
    const stone = 1 - this.water;
    if (g.wash) {
      set(g.wash.gain, falling * (0.08 + 0.45 * rain));
      set(this.washLP.frequency, 1800 + 6500 * rain);
      // the air: a breath in the stillness, gusts in a storm
      set(g.air.gain, 0.015 + 0.07 * Math.pow(s.wind, 1.5) * (0.5 + vnoise(this.clock * 0.25, 3.7)));
      set(this.airLP.frequency, 260 + 900 * s.wind);
      // the water: lapping always (more right by the hull, from the seat), the wash of the boats' way, nearest loudest
      let bow = 0;
      for (const b of s.boats) {
        const d = Math.hypot(b.root.position.x - this.l.x, b.root.position.z - this.l.z);
        bow += smoothstep(0.05, 2.6, b.speed) * att(d, 3, 35) * (0.75 + 0.25 * Math.abs(Math.cos(b.stroke)));
      }
      set(g.lap.gain, 0.06 * (0.6 + 0.8 * vnoise(this.clock * 0.4, 9.1)) + (s.seat ? 0.04 : 0));
      set(g.bow.gain, 0.1 * clamp(bow, 0, 1.3));
    }
    if (g.waterSparse) set(g.waterSparse.gain, falling * 0.8 * this.water);
    if (g.waterDense) set(g.waterDense.gain, heavy * 0.7 * this.water);
    if (g.stoneSparse) {
      set(g.stoneSparse.gain, falling * 0.7 * stone);
      set(g.stoneDense.gain, heavy * 0.6 * stone);
    }
    // a roof over you: the open rain dulled and quieter, the drumming overhead instead; the arch rings with it all
    set(this.rainLP.frequency, lerp(16000, 1400, this.cover));
    set(this.rainOut.gain, lerp(1, 0.55, this.cover));
    set(this.rainSend.gain, 0.05 + 0.45 * this.arch);
    if (g.roof) set(g.roof.gain, falling * this.cover * (0.12 + 0.45 * rain) * (s.seat ? 1.4 : 1));
  }

  // Drips off the eaves (and, from the seat, off the awning's rim just in front), as many as fall in the scene
  // (fx/drips.js): near and far, into the water or onto the stones.
  drips(dt, s) {
    const d = this.buf.drips;
    const act = clamp(s.rain * 1.6 + (s.wet - 0.45) * 1.3, 0, 1);
    if (!d || act < 0.02) return;
    this.dripT -= dt * act * (s.seat ? 6 : 3);
    while (this.dripT <= 0) {
      this.dripT += -Math.log(1 - Math.random() * 0.999);
      const near = s.seat && Math.random() < 0.6;
      const dist = near ? rand(0.7, 1.8) : rand(1.5, 14);
      const water = Math.random() < (near ? 0.7 : this.water);
      this.play(pick(water ? d.water : d.stone), {
        gain: 0.55 * att(dist, 1.5, 20) * rand(0.5, 1),
        pan: rand(-0.85, 0.85) * (near ? 0.6 : 1),
        rate: rand(0.85, 1.18),
        send: 0.08 + 0.3 * this.arch,
      });
    }
  }

  // Each boatman's oar: a creak at each turn of the stroke, rising as he pushes and falling as he draws, the blade's
  // swish after it, heard from the pin wherever that is from you.
  oars(s) {
    if (!this.buf.swish) return;
    for (const b of s.boats) {
      if (!b.working) { this.halves.delete(b); continue; }
      const half = Math.floor((b.stroke - Math.PI / 2) / Math.PI);
      const was = this.halves.get(b);
      this.halves.set(b, half);
      if (was === undefined || half === was) continue;
      b.oar.getWorldPosition(_v);
      const g = att(Math.hypot(_v.x - this.l.x, _v.y - this.l.y, _v.z - this.l.z), 3, 45);
      if (g < 0.01) continue;
      const pan = this.pan(_v.x, _v.z);
      this.play(pick(this.buf.creak[half & 1]), { gain: 0.32 * g, pan, rate: rand(0.94, 1.06), send: 0.08 + 0.35 * this.arch });
      this.play(pick(this.buf.swish), { gain: 0.22 * g, pan, rate: rand(0.9, 1.1), delay: 0.25, send: 0.05 });
    }
  }

  // the temple bell beyond the roofs: three slow strokes every minute or two in its hours, the first soon after the
  // hour comes round, from the pagoda's side
  bells(dt, s) {
    if (!bellHours(s.hours)) { this.bellT = rand(6, 14); return; }
    if (!this.buf.bell) return;
    this.bellT -= dt;
    if (this.bellT > 0) return;
    this.bellT = rand(80, 120);
    const pan = this.pan(PAGODA_AIM.x, PAGODA_AIM.z) * 0.6;
    for (let i = 0, at = 0; i < 3; i++, at += rand(8.5, 10)) this.play(this.buf.bell, { gain: 0.3, pan, lp: 1600, delay: at, send: 0.7 });
  }

  // thunder after the lightning: a near strike's crack within a second, a far one's roll a few seconds on
  strike() {
    const t = this.buf.thunder;
    if (!t || !t.near.length || this.muted || this.ctx.state !== 'running') return;
    const near = Math.random() < 0.3;
    this.play(near ? t.near[0] : pick(t.far), {
      gain: near ? 0.8 : rand(0.45, 0.65),
      pan: rand(-0.5, 0.5),
      delay: near ? rand(0.2, 0.7) : rand(1.5, 4.5),
      lp: near ? 0 : 1800,
      send: 0.25,
    });
  }

  // the master's level just now, for checks: RMS and peak of the last 2048 samples
  level() {
    if (!this.meter) return null;
    const d = new Float32Array(this.meter.fftSize);
    this.meter.getFloatTimeDomainData(d);
    let sum = 0, peak = 0;
    for (const v of d) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
    return { rms: Math.sqrt(sum / d.length), peak, state: this.ctx.state };
  }
}
