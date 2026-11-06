// The sounds, made from numbers: pink noise for the beds, loops of raindrops in the water, on the stones and on a roof
// just overhead, of dry leaves stirring, of birds at dawn, autumn's crickets and summer's cicadas and frogs, and the
// single sounds: a drip, the oar's creak on its pin and the swish of its blade, thunder, a temple bell, the reverb's
// tail. Each comes back as plain sample arrays, { rate, chs: [Float32Array, ...] }, at a rate of its own (the low
// sounds need fewer samples), so nothing here needs an AudioContext, and all of it is deterministic. The longer ones
// also come in pieces ({ steps, done }), to be spread over a few moments.
import { rng } from '../lib/math.js';

const TAU = Math.PI * 2;

// a two-pole resonator at f Hz whose ring dies away over tau seconds, scaled so a click rings at about its own height
function ring(x, rate, f, tau) {
  const w = (TAU * f) / rate, r = Math.exp(-1 / (tau * rate));
  const c = 2 * r * Math.cos(w), r2 = r * r, k = Math.sin(w);
  const out = new Float32Array(x.length);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] * k + c * y1 - r2 * y2;
    out[i] = y;
    y2 = y1;
    y1 = y;
  }
  return out;
}

// scale channels to an RMS, as far as a peak allows
function level(chs, rms, peak = 0.98) {
  let s = 0, n = 0, p = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) { s += c[i] * c[i]; if (Math.abs(c[i]) > p) p = Math.abs(c[i]); n++; }
  if (!(p > 0)) return chs;
  const k = Math.min(rms / Math.max(Math.sqrt(s / n), 1e-12), peak / p);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= k;
  return chs;
}
const peakTo = (x, peak) => level([x], Infinity, peak)[0];

// a decaying click of white noise, k samples to fall by e, n long
function click(R, n, k) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (R.next() * 2 - 1) * Math.exp(-i / k);
  return x;
}

// the ring of a bubble: a sine from f0 rising by `rise` of itself over each tau as it dies away, added into x at `at`
function bubble(x, at, rate, f0, tau, rise, amp) {
  const on = 0.0006 * rate;
  let ph = 0;
  for (let i = 0; at + i < x.length; i++) {
    const t = i / rate;
    ph += (TAU * f0 * (1 + (rise * t) / tau)) / rate;
    x[at + i] += Math.sin(ph) * Math.exp(-t / tau) * Math.min(1, i / on) * amp;
  }
}

// A seamless stereo loop of pink noise, its two sides independent so it sounds wide: the rain's wash, the water and
// the air are each a filter on it. The tail is laid over the head, so the loop has no seam.
export function pinkLoop(seconds, rate, seed = 1) {
  const R = rng(seed);
  const n = Math.round(seconds * rate), f = Math.round(0.08 * rate);
  const chs = [0, 1].map(() => {
    const x = new Float32Array(n + f);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n + f; i++) {
      const w = R.next() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      x[i] = b0 + b1 + b2 + w * 0.1848;
    }
    for (let i = 0; i < f; i++) { const t = i / f; x[i] = x[i] * Math.sqrt(t) + x[n + i] * Math.sqrt(1 - t); }
    return x.slice(0, n);
  });
  return { rate, chs: level(chs, 0.2) };
}

// A seamless stereo loop of grains: perSecond of them at random moments, each a grain(R, rate) at a loudness drawn
// from a power law (a few near and loud, most faint), panned somewhere across the field. A grain running past the
// end carries on from the start, so this loop has no seam either. Only `kinds` different grains are made, each placed
// many times: in a crowd of drops no one hears a drop come round again.
export function grainLoop({ seconds, rate, perSecond, grain, seed, loud = 3, rms = 0.12, kinds = 48 }) {
  const R = rng(seed);
  const n = Math.round(seconds * rate);
  const L = new Float32Array(n), Rt = new Float32Array(n);
  const palette = Array.from({ length: kinds }, () => grain(R, rate));
  for (let k = Math.round(seconds * perSecond); k > 0; k--) {
    const g = palette[Math.floor(R.next() * kinds)];
    const a = Math.pow(R.next(), loud);
    const p = ((R.next() * 1.8 - 0.9) + 1) * (Math.PI / 4);
    const gl = Math.cos(p) * a, gr = Math.sin(p) * a;
    for (let i = 0, j = Math.floor(R.next() * n); i < g.length; i++, j = j + 1 === n ? 0 : j + 1) {
      L[j] += g[i] * gl;
      Rt[j] += g[i] * gr;
    }
  }
  return { rate, chs: level([L, Rt], rms) };
}

// a few takes of a grain, each its own single sound
export function takes(grain, count, seed, rate) {
  const R = rng(seed);
  return Array.from({ length: count }, () => ({ rate, chs: [grain(R, rate)] }));
}

// ------------------------------------------------------------------ grains: (R, rate) -> mono samples, peak 1

// a raindrop into the canal: a tick as it strikes and, for about half of them, the plink of the bubble it traps, a
// ring rising in pitch as the bubble comes up
export function dropOnWater(R, rate) {
  const rings = R.next() < 0.55, big = R.next() < 0.12;
  const f0 = big ? R.range(650, 1300) : R.range(1400, 3600);
  const tau = big ? R.range(0.012, 0.028) : R.range(0.004, 0.011);
  const n = Math.ceil(rate * (rings ? tau * 4 : 0.004));
  const x = click(R, n, 0.00035 * rate);
  for (let i = 0; i < n; i++) x[i] *= 0.5;
  if (rings) bubble(x, 0, rate, f0, tau, R.range(0.06, 0.16), 1);
  return peakTo(x, 1);
}

// a raindrop on stone or tile: a dry click, a little ring of the stone and a lower knock
export function dropOnStone(R, rate) {
  const x = click(R, Math.ceil(rate * 0.018), R.range(0.00025, 0.0008) * rate);
  const hi = ring(x, rate, R.range(2600, 5400), R.range(0.0012, 0.003));
  const lo = ring(x, rate, R.range(650, 1300), R.range(0.0015, 0.004));
  for (let i = 0; i < x.length; i++) x[i] = x[i] * 0.35 + hi[i] * 1.2 + lo[i] * 0.6;
  return peakTo(x, 1);
}

// rain on the roof just overhead (the corridor's tiles, the boat's bamboo awning), heard from beneath: duller pats
export function dropOverhead(R, rate) {
  const x = click(R, Math.ceil(rate * 0.03), R.range(0.0006, 0.0016) * rate);
  const a = ring(x, rate, R.range(380, 760), R.range(0.004, 0.009));
  const b = ring(x, rate, R.range(1100, 1900), R.range(0.002, 0.004));
  for (let i = 0; i < x.length; i++) x[i] = a[i] + b[i] * 0.5 + x[i] * 0.1;
  return peakTo(x, 1);
}

// a drip off the eaves into the water: a fuller plunk than a raindrop's, its bubble lower and longer
export function dripInWater(R, rate) {
  const tau = R.range(0.018, 0.04);
  const x = click(R, Math.ceil(rate * tau * 5), 0.0005 * rate);
  for (let i = 0; i < x.length; i++) x[i] *= 0.3;
  bubble(x, Math.floor(R.range(0.0005, 0.002) * rate), rate, R.range(520, 1150), tau, R.range(0.1, 0.25), 1);
  return peakTo(x, 1);
}

// a drip onto the slabs: a sharp plip, and the spray of it a moment after
export function dripOnStone(R, rate) {
  const n = Math.ceil(rate * 0.04);
  const x = click(R, n, R.range(0.0003, 0.0006) * rate);
  const a = ring(x, rate, R.range(1800, 3200), R.range(0.003, 0.006));
  const b = ring(x, rate, R.range(4500, 6500), 0.0015);
  const spray = click(R, n, 0.004 * rate);
  const at = Math.floor(R.range(0.006, 0.012) * rate);
  for (let i = 0; i < n; i++) x[i] = a[i] + b[i] * 0.6 + x[i] * 0.2 + (i >= at ? spray[i - at] * 0.08 : 0);
  return peakTo(x, 1);
}

// a dry leaf stirred by the wind or scraping over the stones: a few tiny crackles close together, bright and papery
export function crackle(R, rate) {
  const n = Math.ceil(rate * R.range(0.015, 0.05));
  const x = new Float32Array(n);
  for (let c = 2 + Math.floor(R.next() * 5); c > 0; c--) {
    const at = Math.floor(R.next() * n * 0.8), len = Math.ceil(rate * R.range(0.0008, 0.003)), amp = R.range(0.4, 1);
    for (let i = 0; i < len && at + i < n; i++) x[at + i] += (R.next() * 2 - 1) * Math.exp(-i / (len * 0.3)) * amp;
  }
  const hi = ring(x, rate, R.range(3000, 7000), 0.0008);
  for (let i = 0; i < n; i++) x[i] = x[i] * 0.5 + hi[i];
  return peakTo(x, 1);
}

// Autumn's insects at dusk and through the night (秋虫唧唧): a few crickets about the banks, each at its own pitch and
// pace and from its own place in the field. Field crickets chirp three to five pulses at a time with a pause now and
// then; a bell cricket rings a long quick trill and rests. Each pulse a tone falling a little in pitch, with a touch of
// its octave. A seamless stereo loop: a chirp running past the end carries on from the start.
export function crickets(seconds, rate, seed) {
  const R = rng(seed);
  const n = Math.round(seconds * rate);
  const L = new Float32Array(n), Rt = new Float32Array(n);
  const add = (t, x, gl, gr) => {
    for (let i = 0, j = Math.floor(t * rate) % n; i < x.length; i++, j = j + 1 === n ? 0 : j + 1) { L[j] += x[i] * gl; Rt[j] += x[i] * gr; }
  };
  const pulse = (f, len) => {
    const m = Math.round(len * rate), x = new Float32Array(m);
    let ph = 0;
    for (let i = 0; i < m; i++) {
      const t = i / m;
      ph += (TAU * f * (1 - 0.04 * t)) / rate;
      x[i] = (Math.sin(ph) + 0.22 * Math.sin(2 * ph)) * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    return x;
  };
  for (let v = 0; v < 7; v++) {
    const a = 0.15 + 0.85 * Math.pow(R.next(), 2);
    const p = ((R.next() * 1.8 - 0.9) + 1) * (Math.PI / 4);
    const gl = Math.cos(p) * a, gr = Math.sin(p) * a;
    const f = R.range(3600, 5200);
    if (v < 5) {
      const period = R.range(0.38, 0.75), pulses = 3 + Math.floor(R.next() * 3), pp = R.range(0.03, 0.042);
      const x = pulse(f, R.range(0.012, 0.018));
      for (let t = R.next() * period; t < seconds; t += period * R.range(0.92, 1.08)) {
        if (R.next() < 0.12) continue;
        for (let k = 0; k < pulses; k++) add(t + k * pp, x, gl * (k ? 1 : 0.7), gr * (k ? 1 : 0.7));
      }
    } else {
      const pp = R.range(0.016, 0.02);
      const x = pulse(f * 0.75, 0.009);
      for (let t = R.next() * 2; t < seconds;) {
        const dur = R.range(0.8, 2.2);
        for (let s = 0; s < dur; s += pp) add(t + s, x, gl * 0.6, gr * 0.6);
        t += dur + R.range(1, 3);
      }
    }
  }
  return { rate, chs: level([L, Rt], 0.1) };
}

// a sound made in pieces, all at once
const allAtOnce = (job) => {
  for (const step of job.steps) step();
  return job.done();
};

// Summer's cicadas (蝉鸣): each sings in long phrases, a rasping buzz swelling up, holding and dying away, then resting;
// the buzz is noise rung through the cicada's own band and chopped by its quick pulses. A few of them, near and far,
// each from its own place in the field. A seamless stereo loop: a phrase running past the end carries on from the start.
// The work comes in pieces, one singer each (steps), to be spread over a few moments; done() gives the loop.
export function cicadaSteps(seconds, rate, seed) {
  const R = rng(seed);
  const n = Math.round(seconds * rate);
  const L = new Float32Array(n), Rt = new Float32Array(n);
  // one stretch of noise for them all, each reading it from its own place; their pulse's shape from a table
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = R.next() * 2 - 1;
  const PULSE = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = 0.5 + 0.5 * Math.sin((TAU * i) / 256); PULSE[i] = v * v * v; }
  const env = new Float32Array(n);
  const singer = () => {
    const a = 0.25 + 0.75 * Math.pow(R.next(), 1.5);
    const p = ((R.next() * 1.8 - 0.9) + 1) * (Math.PI / 4);
    const gl = Math.cos(p) * a, gr = Math.sin(p) * a;
    const f = R.range(4200, 6800), pr = R.range(140, 230);
    const off = Math.floor(R.next() * n);
    // its phrases: up over a second, held a few, down over one and a half, then a rest
    env.fill(0);
    for (let t = R.range(0, 3); t < seconds;) {
      const up = R.range(0.8, 1.4), hold = R.range(2, 5.5), down = R.range(1.2, 2), len = up + hold + down;
      for (let i = 0, j = Math.floor(t * rate) % n, m = Math.round(len * rate); i < m; i++, j = j + 1 === n ? 0 : j + 1) {
        const s = i / rate, u = s < up ? s / up : s < up + hold ? 1 : 1 - (s - up - hold) / down;
        if (u * u > env[j]) env[j] = u * u;
      }
      t += len + R.range(1.5, 4.5);
    }
    // in one pass: the noise rung through its two bands (as ring() does), chopped by its pulses, which quicken a
    // little as the phrase swells, shaped by the phrases, and placed in the field
    const r1 = Math.exp(-1 / (0.004 * rate)), w1 = (TAU * f) / rate, c1 = 2 * r1 * Math.cos(w1), q1 = r1 * r1, k1 = Math.sin(w1);
    const r2 = Math.exp(-1 / (0.003 * rate)), w2 = (TAU * f * 1.32) / rate, c2 = 2 * r2 * Math.cos(w2), q2 = r2 * r2, k2 = Math.sin(w2) * 0.6;
    let y1 = 0, y2 = 0, z1 = 0, z2 = 0, ph = 0;
    const k = (pr * 256) / rate;
    for (let i = 0, j = off; i < n; i++, j = j + 1 === n ? 0 : j + 1) {
      const x = noise[j];
      const y = x * k1 + c1 * y1 - q1 * y2;
      y2 = y1; y1 = y;
      const z = x * k2 + c2 * z1 - q2 * z2;
      z2 = z1; z1 = z;
      const e = env[i];
      ph += k * (0.9 + 0.15 * e);
      if (ph >= 256) ph -= 256;
      const o = (y + z) * PULSE[ph | 0] * e;
      L[i] += o * gl;
      Rt[i] += o * gr;
    }
  };
  return { steps: [singer, singer, singer, singer], done: () => ({ rate, chs: level([L, Rt], 0.12) }) };
}

export const cicadas = (seconds, rate, seed) => allAtOnce(cicadaSteps(seconds, rate, seed));

// Birds at first light (春眠不觉晓，处处闻啼鸟): a few singers about the trees and eaves, each with a phrase of its own
// that it repeats with small changes, sometimes answered, often resting: notes that slide up or down through a few
// kilohertz with a flutter in them, a trill of quick repeats now and then. A seamless stereo loop, a singer a step.
export function birdSteps(seconds, rate, seed) {
  const R = rng(seed);
  const n = Math.round(seconds * rate);
  const L = new Float32Array(n), Rt = new Float32Array(n);
  // one note: a glide from f0 to f1 with a flutter, swelling in and dying away
  const note = (f0, f1, len, flut) => {
    const m = Math.round(len * rate), x = new Float32Array(m);
    let ph = 0;
    for (let i = 0; i < m; i++) {
      const t = i / m;
      const f = f0 + (f1 - f0) * t * (2 - t);
      ph += (TAU * f * (1 + 0.03 * Math.sin(TAU * flut * (i / rate)))) / rate;
      x[i] = Math.sin(ph) * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.4 * t);
    }
    return x;
  };
  const singer = () => {
    const a = 0.2 + 0.8 * Math.pow(R.next(), 1.6);
    const p = ((R.next() * 1.8 - 0.9) + 1) * (Math.PI / 4);
    const gl = Math.cos(p) * a, gr = Math.sin(p) * a;
    // its phrase: three to seven notes, or a trill
    const base = R.range(2400, 5200), trill = R.next() < 0.3;
    const phrase = [];
    const count = trill ? 8 + Math.floor(R.next() * 8) : 3 + Math.floor(R.next() * 5);
    for (let k = 0, t = 0; k < count; k++) {
      const len = trill ? R.range(0.025, 0.04) : R.range(0.05, 0.16);
      const f0 = base * R.range(0.8, 1.3), f1 = trill ? f0 * R.range(0.85, 0.95) : base * R.range(0.7, 1.5);
      phrase.push([t, note(f0, f1, len, R.range(18, 40))]);
      t += len + (trill ? R.range(0.012, 0.02) : R.range(0.03, 0.12));
    }
    for (let t = R.range(0, 3); t < seconds; t += R.range(2.5, 7)) {
      const g = R.range(0.6, 1);
      for (const [dt, x] of phrase) {
        if (R.next() < 0.12) continue;
        for (let i = 0, j = Math.floor((t + dt) * rate) % n; i < x.length; i++, j = j + 1 === n ? 0 : j + 1) { L[j] += x[i] * gl * g; Rt[j] += x[i] * gr * g; }
      }
    }
  };
  return { steps: Array(6).fill(singer), done: () => ({ rate, chs: level([L, Rt], 0.08) }) };
}

export const birds = (seconds, rate, seed) => allAtOnce(birdSteps(seconds, rate, seed));

// Summer's frogs (蛙鸣): a chorus in the lotus and along the banks, each frog croaking in short runs of pulses, a hoarse
// tone (a train of narrow pulses at its pitch) through the resonances of its throat, at its own pitch and pace, near
// and far, now and then resting. A seamless stereo loop.
export function frogs(seconds, rate, seed) {
  const R = rng(seed);
  const n = Math.round(seconds * rate);
  const L = new Float32Array(n), Rt = new Float32Array(n);
  const add = (t, x, gl, gr) => {
    for (let i = 0, j = Math.floor(t * rate) % n; i < x.length; i++, j = j + 1 === n ? 0 : j + 1) { L[j] += x[i] * gl; Rt[j] += x[i] * gr; }
  };
  const croak = (f0, pulses, pp, f1, f2) => {
    const m = Math.round((pulses * pp + 0.05) * rate), src = new Float32Array(m);
    for (let k = 0; k < pulses; k++) {
      const at = Math.round(k * pp * rate), len = Math.round(pp * 0.7 * rate);
      const per = rate / f0;
      for (let i = 0, c = 0; i < len && at + i < m; i++, c = c + 1 >= per ? c + 1 - per : c + 1) if (c < per * 0.15) src[at + i] += Math.sin((Math.PI * i) / len);
    }
    const a = ring(src, rate, f1, 0.006), b = ring(src, rate, f2, 0.004);
    for (let i = 0; i < m; i++) src[i] = a[i] + 0.5 * b[i];
    return peakTo(src, 1);
  };
  for (let v = 0; v < 10; v++) {
    const a = 0.12 + 0.88 * Math.pow(R.next(), 2);
    const p = ((R.next() * 1.8 - 0.9) + 1) * (Math.PI / 4);
    const gl = Math.cos(p) * a, gr = Math.sin(p) * a;
    const f0 = R.range(180, 420), pulses = 2 + Math.floor(R.next() * 4), pp = R.range(0.045, 0.085);
    const f1 = R.range(500, 900), f2 = R.range(1300, 2000);
    const takes = [croak(f0, pulses, pp, f1, f2), croak(f0 * 1.04, pulses, pp * 0.96, f1, f2 * 1.05)];
    const period = R.range(0.5, 1.6);
    for (let t = R.next() * period; t < seconds; t += period * R.range(0.8, 1.25)) {
      if (R.next() < 0.25) continue;
      add(t, takes[R.next() < 0.5 ? 0 : 1], gl, gr);
    }
  }
  return { rate, chs: level([L, Rt], 0.1) };
}

// ------------------------------------------------------------------ single sounds: (seed, rate, ...) -> { rate, chs }

// The oar's creak on its pin (摇橹): wood that sticks and slips, a ragged train of pulses whose rate glides up as the
// stroke loads the pin (rising) or down as it eases off, rung through a few modes of the wooden stern.
export function creak(seed, rate, rising) {
  const R = rng(seed);
  const dur = R.range(0.3, 0.52);
  const n = Math.round(dur * rate);
  const x = new Float32Array(n);
  const f0 = R.range(120, 175), f1 = f0 * (rising ? R.range(1.3, 1.7) : R.range(0.55, 0.75));
  for (let t = R.range(0, 0.01); t < dur;) {
    const u = t / dur;
    x[Math.floor(t * rate)] += Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.6) * R.range(0.5, 1);
    // the stick-slip is never quite regular
    t += R.range(0.86, 1.16) / (f0 + (f1 - f0) * u);
  }
  const out = new Float32Array(n);
  for (const [f, tau, g] of [[R.range(460, 600), 0.014, 1], [R.range(1000, 1300), 0.009, 0.75], [R.range(1800, 2300), 0.006, 0.5], [R.range(2900, 3600), 0.004, 0.3]]) {
    const y = ring(x, rate, f, tau);
    for (let i = 0; i < n; i++) out[i] += y[i] * g;
  }
  for (let i = 0; i < n; i++) out[i] += x[i] * 0.15;
  const fade = Math.round(0.02 * rate);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return { rate, chs: [peakTo(out, 0.9)] };
}

// the oar's blade through the water: a soft rush swelling and falling with the stroke, a few bubbles in it
export function swish(seed, rate) {
  const R = rng(seed);
  const n = Math.round(R.range(0.55, 0.85) * rate);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = R.next() * 2 - 1;
  const a = ring(w, rate, R.range(650, 950), 0.0012), b = ring(w, rate, R.range(1500, 2200), 0.0008);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] + b[i] * 0.5) * Math.pow(Math.sin(Math.PI * Math.pow(i / n, 0.7)), 2);
  peakTo(out, 0.7);
  for (let k = 0; k < 3; k++) bubble(out, Math.floor(R.range(0.15, 0.6) * n), rate, R.range(300, 650), R.range(0.015, 0.035), 0.15, 0.3);
  return { rate, chs: [peakTo(out, 0.9)] };
}

// Thunder: brown noise swelling in a few bursts over several seconds, a deep roll and the growl above it that small
// speakers can still play; a near strike opens with a crack.
export function thunder(seed, rate, near) {
  const R = rng(seed);
  const dur = R.range(6, 8.5);
  const n = Math.round(dur * rate);
  // each burst rises over `up` and dies over `down`: e^(-d/down) - e^(-d(1/up + 1/down)), two decays per sample
  const env = new Float32Array(n);
  for (let k = R.int(4, 7); k > 0; k--) {
    const at = Math.floor(R.range(0, near ? 0.4 : 0.6) * n), a = R.range(0.35, 1), up = R.range(0.04, 0.3), down = R.range(0.6, 2.2);
    const k1 = Math.exp(-1 / (down * rate)), k2 = Math.exp(-(1 / up + 1 / down) / rate);
    for (let i = at, e1 = a, e2 = a; i < n; i++, e1 *= k1, e2 *= k2) env[i] += e1 - e2;
  }
  const roll = new Float32Array(n), growl = new Float32Array(n);
  const a1 = 1 - Math.exp((-TAU * R.range(140, 220)) / rate), a2 = 1 - Math.exp((-TAU * R.range(450, 700)) / rate);
  let br = 0, l1 = 0, l2 = 0, m1 = 0, m2 = 0;
  for (let i = 0; i < n; i++) {
    const w = R.next() * 2 - 1;
    br = (br + 0.02 * w) / 1.02;
    l1 += a1 * (br - l1); l2 += a1 * (l1 - l2);
    m1 += a2 * (w - m1); m2 += a2 * (m1 - m2);
    roll[i] = l2; growl[i] = m2;
  }
  level([roll], 1, Infinity);
  level([growl], 1, Infinity);
  const out = new Float32Array(n);
  // the growl flickers, the roll does not
  let fl = 0;
  for (let i = 0; i < n; i++) {
    if (i % 64 === 0) fl += (Math.pow(R.next(), 3) - fl) * 0.2;
    out[i] = (roll[i] + growl[i] * (0.15 + 0.6 * fl)) * env[i];
  }
  if (near) {
    let lp = 0;
    const a = 1 - Math.exp((-TAU * 1500) / rate);
    for (let c = R.int(3, 5), at = 0; c > 0; c--, at += Math.floor(R.range(0.01, 0.06) * rate)) {
      const amp = R.range(0.5, 1) * 3;
      for (let i = 0; at + i < n && i < 0.3 * rate; i++) {
        const w = R.next() * 2 - 1;
        lp += a * (w - lp);
        out[at + i] += (w - lp) * amp * Math.exp(-i / (0.05 * rate));
      }
    }
  }
  const fade = Math.round(0.6 * rate);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return { rate, chs: [peakTo(out, 0.95)] };
}

// A temple bell heard from beyond the roofs (夜半钟声到客船): the hum below the strike note and the bell's other
// partials, each a pair a fraction of a hertz apart so that the tone wavers as it dies, the low ones ringing longest.
// [ratio to the strike note, amplitude, seconds to fall by e]
const PARTIALS = [[0.5, 0.5, 10], [1, 1, 7.5], [1.183, 0.45, 5.5], [1.506, 0.32, 4.5], [2, 0.55, 3.8], [2.51, 0.24, 2.8], [2.66, 0.2, 2.4], [3.01, 0.16, 2], [4.07, 0.09, 1.4], [5.2, 0.05, 1]];
export function bell(rate, f0 = 110, seed = 7) {
  const R = rng(seed);
  const n = Math.round(11.5 * rate);
  const L = new Float32Array(n), Rt = new Float32Array(n);
  // every partial a phasor turned and shrunk a sample at a time (cheaper than a sine per sample, and exact enough);
  // the two of a pair lean to opposite sides, so the wavering moves across the field
  const m = PARTIALS.length * 2;
  const cw = new Float64Array(m), sw = new Float64Array(m), d = new Float64Array(m), re = new Float64Array(m), im = new Float64Array(m), gl = new Float64Array(m), gr = new Float64Array(m);
  PARTIALS.forEach(([k, a, tau], p) => {
    const beat = R.range(0.35, 1.3);
    for (let s = 0; s < 2; s++) {
      const j = p * 2 + s, w = (TAU * (f0 * k + (s ? beat : -beat) / 2)) / rate;
      cw[j] = Math.cos(w); sw[j] = Math.sin(w); d[j] = Math.exp(-1 / (tau * rate));
      re[j] = a * 0.5; im[j] = 0;
      gl[j] = s ? 0.45 : 0.8; gr[j] = s ? 0.8 : 0.45;
    }
  });
  for (let i = 0; i < n; i++) {
    let l = 0, r = 0;
    for (let j = 0; j < m; j++) {
      const x = re[j], y = im[j];
      re[j] = (x * cw[j] - y * sw[j]) * d[j];
      const v = (x * sw[j] + y * cw[j]) * d[j];
      im[j] = v;
      l += v * gl[j];
      r += v * gr[j];
    }
    L[i] = l;
    Rt[i] = r;
  }
  // the beam's soft thump as it strikes
  let lp = 0;
  const a = 1 - Math.exp((-TAU * 300) / rate);
  for (let i = 0; i < 0.06 * rate; i++) {
    lp += a * ((R.next() * 2 - 1) - lp);
    const v = lp * 1.6 * Math.exp(-i / (0.015 * rate));
    L[i] += v; Rt[i] += v;
  }
  return { rate, chs: level([L, Rt], Infinity, 0.9) };
}

// The reverb's tail: noise dying away over a couple of seconds and darkening as it goes, like water and stone between
// close walls. Made at the context's own rate (a convolver takes no other).
export function impulse(rate, seconds = 1.8, seed = 3) {
  const R = rng(seed);
  const n = Math.round(seconds * rate);
  const kd = Math.exp(-1 / (0.38 * rate)), kf = Math.exp(-32 / (0.6 * rate));
  const chs = [0, 1].map(() => {
    const x = new Float32Array(n);
    let lp = 0, e = 1, fc = 9000, a = 0;
    for (let i = 0; i < n; i++, e *= kd) {
      // the filter darkens in steps of 32 samples, too small to hear
      if ((i & 31) === 0) { a = 1 - Math.exp((-TAU * (fc + 900)) / rate); fc *= kf; }
      lp += a * ((R.next() * 2 - 1) - lp);
      x[i] = lp * e * Math.min(1, i / (0.006 * rate));
    }
    return x;
  });
  return { rate, chs: level(chs, Infinity, 0.5) };
}
