// The sounds, made from numbers: pink noise for the beds, loops of raindrops in the water, on the stones and on a roof
// just overhead, and the single sounds: a drip, the oar's creak on its pin and the swish of its blade, thunder, a
// temple bell, the reverb's tail. Each comes back as plain sample arrays, { rate, chs: [Float32Array, ...] }, at a
// rate of its own (the low sounds need fewer samples), so nothing here needs an AudioContext, and all of it is
// deterministic.
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
