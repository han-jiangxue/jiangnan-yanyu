// Time of day and weather: targets set by the viewer (or later the journey), eased into the shared uniforms.
// Adapted from Sakura Fantasy (c) 2026 Bill Chan, MIT License: the sky keyframes by sun elevation and the easing are
// theirs; the weathers, fog scales and wetness are tuned for a small town in the rain.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { clamp, lerp, smoothstep } from '../lib/math.js';

// sky keyframes by sun elevation (sine of altitude); colours are linear HDR
const KF = [
  { e: -0.4, zen: [0.0035, 0.0065, 0.016], hor: [0.010, 0.016, 0.03], sun: [0, 0, 0], fs: [0.03, 0.03, 0.042], fa: [0.022, 0.024, 0.034], up: [0.028, 0.038, 0.066], dn: [0.006, 0.007, 0.01], exp: 3.4 },
  { e: -0.14, zen: [0.012, 0.02, 0.055], hor: [0.07, 0.06, 0.1], sun: [0, 0, 0], fs: [0.14, 0.08, 0.1], fa: [0.035, 0.045, 0.08], up: [0.035, 0.045, 0.08], dn: [0.008, 0.008, 0.012], exp: 2.6 },
  { e: -0.03, zen: [0.045, 0.07, 0.17], hor: [0.62, 0.3, 0.2], sun: [1.2, 0.4, 0.15], fs: [0.75, 0.36, 0.2], fa: [0.13, 0.15, 0.22], up: [0.1, 0.12, 0.2], dn: [0.03, 0.025, 0.03], exp: 1.7 },
  { e: 0.06, zen: [0.085, 0.15, 0.33], hor: [1.05, 0.56, 0.27], sun: [5.4, 2.7, 1.1], fs: [1.3, 0.72, 0.34], fa: [0.3, 0.33, 0.42], up: [0.26, 0.29, 0.4], dn: [0.12, 0.08, 0.05], exp: 1.15 },
  { e: 0.2, zen: [0.09, 0.2, 0.46], hor: [0.85, 0.7, 0.55], sun: [6.2, 4.5, 2.8], fs: [1.15, 0.86, 0.56], fa: [0.38, 0.46, 0.58], up: [0.36, 0.44, 0.6], dn: [0.16, 0.13, 0.09], exp: 0.95 },
  { e: 0.5, zen: [0.08, 0.24, 0.6], hor: [0.62, 0.74, 0.88], sun: [6.6, 6.0, 5.3], fs: [0.9, 0.9, 0.86], fa: [0.5, 0.62, 0.78], up: [0.45, 0.56, 0.75], dn: [0.17, 0.15, 0.11], exp: 0.85 },
  { e: 1.01, zen: [0.07, 0.22, 0.58], hor: [0.6, 0.73, 0.88], sun: [6.8, 6.3, 5.7], fs: [0.9, 0.92, 0.9], fa: [0.5, 0.62, 0.8], up: [0.46, 0.58, 0.78], dn: [0.18, 0.16, 0.12], exp: 0.82 },
];

// each weather is a set of targets, not a switch; snow is how much falls (what lies on the ground follows it slowly)
export const WEATHERS = {
  mist: { cloud: 0.82, dark: 0.12, fog: 2.6, mist: 2.2, rain: 0, wet: 0.45, sun: 0.26, wind: 0.12, flash: 0, snow: 0 },
  drizzle: { cloud: 0.94, dark: 0.24, fog: 2.2, mist: 1.5, rain: 0.32, wet: 1, sun: 0.09, wind: 0.22, flash: 0, snow: 0 },
  rain: { cloud: 0.98, dark: 0.4, fog: 2.3, mist: 1.2, rain: 0.65, wet: 1, sun: 0.05, wind: 0.45, flash: 0, snow: 0 },
  storm: { cloud: 1.0, dark: 0.6, fog: 2.9, mist: 1.3, rain: 1.0, wet: 1, sun: 0.03, wind: 1.0, flash: 1, snow: 0 },
  after: { cloud: 0.62, dark: 0.06, fog: 1.4, mist: 1.2, rain: 0, wet: 0.85, sun: 0.75, wind: 0.18, flash: 0, snow: 0 },
  snow: { cloud: 0.95, dark: 0.2, fog: 2.0, mist: 1.0, rain: 0, wet: 0.5, sun: 0.1, wind: 0.12, flash: 0, snow: 0.45 },
  blizzard: { cloud: 1.0, dark: 0.42, fog: 3.0, mist: 1.1, rain: 0, wet: 0.55, sun: 0.04, wind: 0.75, flash: 0, snow: 1 },
};
export const WEATHER_NAMES = { mist: '薄雾', drizzle: '细雨', rain: '中雨', storm: '骤雨', after: '雨后', snow: '细雪', blizzard: '大雪' };

// The seasons: an axis of their own beside the weather (any weather in any season; the journeys pair them). Each is a
// weight in uSeason, eased from one season to the next.
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
// the seasons drawn so far: all four
export const SEASONS_READY = ['spring', 'summer', 'autumn', 'winter'];

// the hour sliders' day: from half past four round to half past four the next morning, so past midnight a slider
// reads the hour plus 24
export const DAY_START = 4.5;
export const dialHours = (h) => (h < DAY_START ? h + 24 : h);

const mix3 = (out, a, b, t) => out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));

// the sun rises ahead and to the right of a boat heading down the canal (-z) and stays ahead, so the wet air
// toward the far end of the canal is the bright part of the sky
const E = new THREE.Vector3(0.62, 0, -0.78).normalize();
const S = new THREE.Vector3(-0.7, 0, -0.71).normalize();

export function sunDirAt(hours, out = new THREE.Vector3()) {
  const a = ((hours - 6) / 12) * Math.PI;
  out.copy(E).multiplyScalar(Math.cos(a));
  out.addScaledVector(S, Math.sin(a) * 0.5);
  out.y = Math.sin(a) * 0.8;
  return out.normalize();
}

export class Environment {
  constructor() {
    this.hours = 9.5;
    this.hoursTarget = 9.5;
    this.weather = 'drizzle';
    this.w = { ...WEATHERS.drizzle };
    this.season = 'spring';
    this.sw = [1, 0, 0, 0]; // the seasons' weights, as SEASONS
    this.snowLying = 0;
    this.frost = 0;
    this.exposure = 1;
    this.lightning = { next: 4, flash: 0, pulses: null, t: 0 };
    this.sunVis = 1;
    this.daylight = 1;
    this.lampOn = 0;
    this.night = 0;
    this.cloud = 0.9;
    this.dark = 0;
    this.c = { zen: new THREE.Vector3(), hor: new THREE.Vector3(), sun: new THREE.Vector3(), fs: new THREE.Vector3(), fa: new THREE.Vector3(), up: new THREE.Vector3(), dn: new THREE.Vector3() };
    this._sun = new THREE.Vector3();
    this._moon = new THREE.Vector3();
    this._moonCol = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this.onStrike = null;
    this.update(0, true);
  }

  setWeather(name) { if (WEATHERS[name]) this.weather = name; }

  setSeason(name) { if (SEASONS.includes(name)) this.season = name; }

  // shortest way round the clock, so 23h -> 1h moves forward
  setHours(h, snap = false) {
    this.hoursTarget = ((h % 24) + 24) % 24;
    if (snap) this.hours = this.hoursTarget;
  }

  update(dt, snap = false) {
    let dh = this.hoursTarget - this.hours;
    if (dh > 12) dh -= 24;
    if (dh < -12) dh += 24;
    const maxRate = 1.6; // hours per second at most, so a dial spin still reads as a sweep
    this.hours += snap ? dh : clamp(dh * Math.min(1, dt * 1.8), -maxRate * dt, maxRate * dt);
    this.hours = ((this.hours % 24) + 24) % 24;

    const k = snap ? 1 : 1 - Math.exp(-dt * 0.45);
    const tw = WEATHERS[this.weather];
    for (const key in tw) this.w[key] = lerp(this.w[key], tw[key], k);
    // a season comes in over some seconds: the leaves fall, the snow settles
    const ks = snap ? 1 : 1 - Math.exp(-dt * 0.35);
    SEASONS.forEach((s, i) => { this.sw[i] = lerp(this.sw[i], s === this.season ? 1 : 0, ks); });
    U.uSeason.value.set(this.sw[0], this.sw[1], this.sw[2], this.sw[3]);
    const summer = this.sw[1], autumn = this.sw[2], winter = this.sw[3];

    const sun = sunDirAt(this.hours, this._sun);
    const moon = sunDirAt(this.hours + 12.6, this._moon);
    moon.y = Math.max(moon.y, 0.12) * 0.9 + 0.08;
    moon.normalize();
    U.uTrueSun.value.copy(sun);
    U.uMoonDir.value.copy(moon);

    // palette at this sun elevation
    const e = sun.y;
    const night = smoothstep(0.02, -0.16, e);
    let i = 0;
    while (i < KF.length - 2 && KF[i + 1].e < e) i++;
    const a = KF[i], b = KF[i + 1];
    const t = smoothstep(a.e, b.e, e);
    const c = this.c;
    for (const key of ['zen', 'hor', 'sun', 'fs', 'fa', 'up', 'dn']) mix3(c[key], a[key], b[key], t);
    this.exposure = lerp(a.exp, b.exp, t);

    // weather darkens, greys and flattens the light
    const w = this.w;
    const dark = w.dark, grey = clamp(w.cloud * 1.1 - 0.35, 0, 1);
    const lum = (v) => v.x * 0.3 + v.y * 0.55 + v.z * 0.15;
    const desat = (v, amt, mul) => {
      const l = lum(v);
      v.set(lerp(v.x, l, amt), lerp(v.y, l * 1.02, amt), lerp(v.z, l * 1.06, amt)).multiplyScalar(mul);
    };
    desat(c.zen, grey * 0.85, 1 - dark * 0.55);
    desat(c.hor, grey * 0.8, 1 - dark * 0.5);
    desat(c.fs, grey * 0.75, 1 - dark * 0.45);
    desat(c.fa, grey * 0.7, 1 - dark * 0.45);
    desat(c.up, grey * 0.6, 1 - dark * 0.35);
    // under an overcast deck the zenith is brighter than the horizon (the CIE overcast sky is about three times),
    // and what lights the town is that whole bright dome, so the walls stand pale against the haze
    c.zen.lerp(this._t.copy(c.hor).multiplyScalar(1.35), grey * 0.8);
    c.up.lerp(this._t.copy(c.hor).multiplyScalar(1.15), grey * 0.7);
    // what comes through cloud is scattered light: paler and whiter than the clear-sky sun
    const sl = (c.sun.x + c.sun.y + c.sun.z) / 3;
    c.sun.lerp(this._t.set(sl, sl, sl), grey * 0.6);
    c.sun.multiplyScalar(w.sun);
    this.exposure *= 1 + dark * 0.35;

    // Autumn's air is drier and clearer (the haze thinner, set below): a bluer zenith where the cloud breaks, and a
    // low sun that comes through gold, warming the haze around it
    const clear = 1 - grey;
    c.zen.multiply(this._t.set(1 - 0.08 * autumn * clear, 1, 1 + 0.14 * autumn * clear));
    const golden = autumn * (1 - smoothstep(0.05, 0.4, e)) * smoothstep(-0.06, 0.02, e);
    c.sun.multiply(this._t.set(1 + 0.3 * golden, 1 + 0.04 * golden, 1 - 0.3 * golden));
    for (const v of [c.fs, c.hor]) v.multiply(this._t.set(1 + 0.12 * golden, 1 + 0.02 * golden, 1 - 0.12 * golden));
    // Summer's plum rain (梅雨) is warm and close: the haze a little warmer and greener, the more so the greyer the
    // day; where the cloud opens, the afternoon sun comes through whiter and brighter, and the nights are warm
    const humid = summer * (0.4 + 0.6 * grey);
    for (const v of [c.fs, c.fa]) v.multiply(this._t.set(1 + 0.02 * humid, 1 + 0.045 * humid, 1 - 0.05 * humid));
    c.sun.multiplyScalar(1 + 0.25 * summer * clear);
    c.up.multiplyScalar(1 + 0.08 * summer * clear);
    c.up.multiply(this._t.set(1 + 0.05 * summer * night, 1 + 0.02 * summer * night, 1 - 0.04 * summer * night));

    // Snow settles while it falls and lies on in winter's cold, melting slowly then, quickly in the other seasons and
    // fastest in rain; and a winter town keeps the snow of the days before even when none is falling.
    const kept = 0.6 * winter;
    if (snap) this.snowLying = Math.max(kept, w.snow > 0.2 ? 0.75 + 0.25 * w.snow : 0);
    else {
      const melt = (0.002 + 0.03 * (1 - winter) + 0.03 * w.rain) * dt;
      this.snowLying = clamp(Math.max(kept, this.snowLying + w.snow * 0.015 * dt - melt), 0, 1);
    }
    // Hoar frost (霜): late on a clear, still, dry night in autumn or winter it whitens what lies open to the sky, and
    // it is gone within a couple of hours of sunrise; none on snow, in rain or under thick cloud
    const hh = this.hours < 12 ? this.hours + 24 : this.hours;
    const frostWant = clamp(autumn + winter, 0, 1) * smoothstep(20.5, 23.5, hh) * (1 - smoothstep(30, 32, hh))
      * smoothstep(0.95, 0.8, w.cloud) * (1 - smoothstep(0.02, 0.15, w.rain)) * (1 - smoothstep(0.05, 0.2, w.snow)) * (1 - smoothstep(0.1, 0.4, this.snowLying));
    this.frost = snap ? frostWant : lerp(this.frost, frostWant, 1 - Math.exp(-dt * 0.25));
    // winter's air is colder and paler, and the snow on the ground throws light back up into the eaves and arches
    const cold = winter * 0.7;
    for (const v of [c.zen, c.hor, c.fs, c.fa, c.up]) v.multiply(this._t.set(1 - 0.08 * cold, 1 - 0.015 * cold, 1 + 0.06 * cold));
    c.dn.lerp(this._t.copy(c.up).multiplyScalar(0.7), this.snowLying * 0.65);
    this.exposure *= 1 - 0.12 * this.snowLying;
    // and a snowy night is lighter than a rainy one: the lanterns' and the windows' light goes back and forth
    // between the snow and the low cloud, warmed a little by them
    const snowNight = this.snowLying * night;
    c.up.multiplyScalar(1 + 0.6 * snowNight).add(this._t.set(0.012, 0.008, 0.004).multiplyScalar(snowNight));
    c.dn.multiplyScalar(1 + 1.2 * snowNight);
    for (const v of [c.zen, c.hor, c.fs, c.fa]) v.multiplyScalar(1 + 0.35 * snowNight);

    // the moon takes over below the horizon (brighter through autumn's clear air)
    this.night = night;
    U.uNight.value = night;
    const moonCol = this._moonCol.set(0.13, 0.17, 0.28).multiplyScalar((1 - w.dark * 0.8) * (1 + 0.5 * autumn));
    const dominantSun = e > -0.06;
    // fade the key light through the swap so shadows never jump
    const swap = dominantSun ? smoothstep(-0.06, 0.0, e) : smoothstep(-0.06, -0.14, e);
    if (dominantSun) {
      U.uSunDir.value.copy(sun);
      U.uSunCol.value.copy(c.sun).multiplyScalar(swap);
    } else {
      U.uSunDir.value.copy(moon);
      U.uSunCol.value.copy(moonCol).multiplyScalar(swap * (1 - w.cloud * 0.8));
    }
    this.keyIsSun = dominantSun;
    this.daylight = smoothstep(-0.1, 0.15, e);
    // lanterns come on early under a dark sky in the evening; in the morning they are put out while it is still blue
    const morning = this.hours > 3 && this.hours < 12;
    this.lampOn = morning
      ? clamp(smoothstep(-0.02, -0.13, e) + dark * 0.12 * smoothstep(0.1, -0.05, e), 0, 1)
      : clamp(smoothstep(0.12, -0.04, e) * 0.85 + smoothstep(0.05, -0.1, e) * 0.15 + dark * 0.25 * smoothstep(0.35, 0.1, e), 0, 1);
    // the town goes to bed from half past ten; the early risers light up again before five
    U.uWinOff.value = smoothstep(22.3, 25.2, hh) * (1 - smoothstep(28.2, 29.4, hh));

    U.uSkyZen.value.copy(c.zen);
    U.uSkyHor.value.copy(c.hor);
    U.uFogSun.value.copy(c.fs);
    U.uFogAway.value.copy(c.fa);
    U.uAmbUp.value.copy(c.up);
    U.uAmbDown.value.copy(c.dn);

    // haze per metre and the height fog's density at the water; the rain itself thickens the air, as does summer's
    // damp, and autumn's thins it
    const clearAir = (1 - 0.25 * autumn) * (1 + 0.12 * summer);
    const fogMul = w.fog * (1 + 0.45 * w.rain) * clearAir;
    U.uFogParams.value.set(0.0005 * fogMul, 0.0028 * fogMul, 0.05, 0);
    // dawn and dusk mist is thicker
    const lowSun = 1 - smoothstep(0.05, 0.35, Math.abs(e - 0.02));
    U.uMist.value = w.mist * (1 + 0.8 * lowSun + 0.4 * night) * clearAir;
    U.uRain.value = w.rain;
    U.uSnowFall.value = w.snow;
    U.uSnow.value = this.snowLying;
    U.uFrost.value = this.frost;
    // surfaces soak quickly and dry slowly
    U.uWet.value = lerp(U.uWet.value, Math.max(w.wet, w.rain), snap ? 1 : 1 - Math.exp(-dt * (w.wet > U.uWet.value ? 0.5 : 0.06)));
    U.uWind.value.z = w.wind;
    this.cloud = w.cloud;
    this.dark = dark;
    this.sunVis = w.sun;

    // lightning: a strike every few seconds at full storm
    const L = this.lightning;
    if (w.flash > 0.5 && !snap) {
      L.next -= dt;
      if (L.next <= 0) {
        L.next = 4 + Math.random() * 10;
        L.pulses = [0, 0.09 + Math.random() * 0.08, 0.25 + Math.random() * 0.2];
        L.t = 0;
        if (this.onStrike) this.onStrike();
      }
    }
    if (L.pulses) {
      L.t += dt;
      let f = 0;
      for (const p of L.pulses) f = Math.max(f, Math.exp(-Math.max(0, L.t - p) * 14) * (L.t >= p ? 1 : 0));
      U.uFlash.value = f * 2.2 * w.flash;
      if (L.t > 1.2) L.pulses = null;
    } else U.uFlash.value = 0;
  }
}
