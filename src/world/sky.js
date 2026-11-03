// Sky dome drawn at the far plane after the opaque world: gradient, sun and moon, stars, a cloud deck that closes
// into overcast as cover rises, lightning inside it, and the same haze as the ground at the horizon.
// Adapted from Sakura Fantasy (c) 2026 Bill Chan, MIT License.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS } from '../core/shared.js';

// Tileable cloud noise baked once: R billowy perlin-worley, G fine erosion detail, B worley cells, A fibres.
function cloudNoise(N = 256) {
  const hash = (x, y, p, s) => {
    x = ((x % p) + p) % p; y = ((y % p) + p) % p;
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const grad = (x, y, p, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const g = (ix, iy) => { const a = hash(ix, iy, p, s) * Math.PI * 2; return Math.cos(a) * (xf - (ix - xi)) + Math.sin(a) * (yf - (iy - yi)); };
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 0.7 + 0.5;
  };
  const worley = (x, y, p, s) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let d = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i + hash(xi + i, yi + j, p, s), cy = yi + j + hash(xi + i, yi + j, p, s + 7);
      d = Math.min(d, (cx - x) ** 2 + (cy - y) ** 2);
    }
    return Math.sqrt(d);
  };
  const fbm = (x, y, p, oct, s) => { let v = 0, a = 0.5, f = 1, t = 0; for (let o = 0; o < oct; o++) { v += a * grad(x * f, y * f, p * f, s + o); t += a; a *= 0.5; f *= 2; } return v / t; };
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const pw = fbm(u * 4, v * 4, 4, 5, 1);
    const w = 1 - Math.min(1, worley(u * 6, v * 6, 6, 3) * 1.2);
    const r = Math.min(1, Math.max(0, pw * 0.75 + w * 0.45 - 0.12));
    const g = fbm(u * 16, v * 16, 16, 3, 9);
    const b = 1 - Math.min(1, worley(u * 12, v * 12, 12, 21) * 1.35);
    const a = fbm(u * 3 + pw * 0.6, v * 14, 3, 4, 31);
    const i = (y * N + x) * 4;
    data[i] = r * 255; data[i + 1] = g * 255; data[i + 2] = b * 255; data[i + 3] = a * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function createSky() {
  const uniforms = {
    ...U,
    tCloud: { value: cloudNoise() },
    uCloud: { value: 0.9 },
    uCloudDark: { value: 0 },
    uSunVis: { value: 0.2 },
    uMoonPhase: { value: 0.82 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position + cameraPosition, 1.0);
        gl_Position = p.xyww; // at the far plane
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      ${UNIFORMS_GLSL}
      uniform float uCloud, uCloudDark, uSunVis, uMoonPhase;
      uniform sampler2D tCloud;
      ${NOISE}
      ${ATMOS}

      vec3 starField(vec3 rd){
        vec3 a = abs(rd);
        vec2 uv; float face;
        if (a.x > a.y && a.x > a.z){ uv = rd.yz / a.x; face = sign(rd.x); }
        else if (a.y > a.z){ uv = rd.xz / a.y; face = 2.0 + sign(rd.y); }
        else { uv = rd.xy / a.z; face = 4.0 + sign(rd.z); }
        vec2 g = uv * 160.0;
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = sfHash13(vec3(id, face));
        vec2 off = vec2(sfHash13(vec3(id, face + 7.0)), sfHash13(vec3(id, face + 13.0))) - 0.5;
        float d = length(f - off * 0.7);
        float bright = pow(h, 22.0) * 3.0;
        float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 80.0);
        return vec3(0.85, 0.88, 1.0) * bright * tw * smoothstep(0.09, 0.0, d);
      }

      float cloudShape(vec2 p, float cover){
        vec4 w = texture2D(tCloud, p * 0.3 + 0.3);
        vec2 q = p + (w.ga - 0.5) * 0.35;
        float base = texture2D(tCloud, vec2(q.x * 0.3, q.y * 0.55)).r * 0.55 + texture2D(tCloud, q * 1.05 + 0.5).r * 0.45;
        // past ~0.8 cover the gaps close into an overcast deck
        float th = mix(0.66, 0.2, cover) - smoothstep(0.7, 0.95, cover) * 0.25;
        return base - th;
      }
      float cloudDensity(vec2 p, float cover, float detail){
        float s = cloudShape(p, cover);
        float d = texture2D(tCloud, p * 3.4 + 0.17).g;
        return smoothstep(0.0, 0.3, s - (d - 0.5) * 0.2 * detail);
      }

      void main(){
        vec3 rd = normalize(vDir);
        float h = rd.y;
        float hp = max(h, 0.0);
        vec3 sun = uTrueSun;
        float sd = dot(rd, sun);

        vec3 col = mix(uSkyHor, uSkyZen, pow(hp, 0.42));
        col = mix(col, uFogAway * 0.85, smoothstep(0.0, -0.08, h));

        float sunLow = smoothstep(0.45, -0.05, sun.y) * smoothstep(-0.25, -0.02, sun.y);
        float bandH = exp(-hp * 6.0);
        col += uFogSun * (pow(max(sd, 0.0), 6.0) * 0.55 * bandH * (0.4 + sunLow) + pow(max(sd, 0.0), 2.0) * 0.12 * sunLow * bandH) * uSunVis;

        float night = uNight;
        if (night > 0.01) col += starField(rd) * night * smoothstep(0.02, 0.18, h) * (1.0 - uCloud * 0.9);

        // the sun's disc, when it shows at all
        float disc = smoothstep(0.99955, 0.99975, sd);
        col += uSunCol * 4.0 * disc * uSunVis * pow(1.0 - uCloud, 2.0) * smoothstep(-0.02, 0.01, h);
        col += uSunCol * pow(max(sd, 0.0), 300.0) * 0.4 * uSunVis * (1.0 - uCloud * 0.7);

        float md = dot(rd, uMoonDir);
        float moonVis = night * (1.0 - uCloud * 0.8);
        col += vec3(0.16, 0.2, 0.3) * pow(max(md, 0.0), 220.0) * 0.6 * moonVis;
        col += vec3(0.05, 0.065, 0.1) * pow(max(md, 0.0), 12.0) * 0.4 * moonVis;

        if (h > -0.02){
          float hh = max(h, 0.0) + 0.06;
          vec2 p = rd.xz / hh * 0.9;
          vec2 drift = uWind.xy * uTime * 0.012;
          float cover = uCloud;
          vec2 pc = p * 0.55 + drift;
          float d1 = cloudDensity(pc, cover, 1.0);
          vec2 toSun = normalize(sun.xz + 1e-4) * (0.05 + 0.08 * (1.0 - max(sun.y, 0.0)));
          float od = 0.0;
          for (int i = 1; i <= 3; i++) od += cloudDensity(pc + toSun * float(i), cover, 0.0) * (1.2 - float(i) * 0.25);
          float beer = exp(-od * 1.25 - d1 * 0.6);
          float powder = 1.0 - exp(-d1 * 3.0);
          float lightK = beer * mix(0.55, 1.0, powder);
          vec3 sunLit = mix(uFogSun * 1.25, vec3(1.0), 0.3) * (0.3 + 0.7 * uSunVis) * (night > 0.5 ? 0.1 : 1.0);
          vec3 ambTop = mix(uSkyZen, uSkyHor, 0.4) * 1.05;
          vec3 ambBase = mix(uSkyZen, uFogAway, 0.6) * 0.62 * (1.0 - uCloudDark * 0.6);
          vec3 amb = mix(ambTop, ambBase, smoothstep(0.2, 1.0, d1) * (0.5 + 0.5 * cover));
          // an overcast deck still has rolls: thicker bands hang darker
          amb *= 1.0 - smoothstep(0.6, 1.0, cover) * (cloudShape(pc * 0.5 + 3.0, 1.0) * 0.45);
          float phase = 0.55 + 0.45 * smoothstep(-0.3, 0.9, sd) + pow(max(sd, 0.0), 8.0) * 1.2;
          vec3 ccol = amb + sunLit * lightK * phase * (1.0 - uCloudDark * 0.7) * uSunVis;
          ccol += uFogSun * pow(max(sd, 0.0), 14.0) * (1.0 - d1) * smoothstep(0.0, 0.3, d1) * 2.4 * uSunVis;
          ccol += vec3(0.04, 0.05, 0.08) * night * pow(max(md, 0.0), 6.0) * (1.0 - d1 * 0.5) * 2.0;
          // a low wet deck over a lit town glows faintly from below, warmest near the roofs
          ccol += vec3(0.045, 0.03, 0.017) * uLampOn * night * (1.0 - smoothstep(0.0, 0.5, h)) * (0.4 + 0.6 * d1) * cover;
          ccol += uFlash * vec3(0.7, 0.75, 1.0) * (0.5 + 0.5 * texture2D(tCloud, p * 0.3 + uTime).g) * d1;
          // near the horizon the deck sinks into the same air as the far town
          float dc = min(1500.0 / max(h, 0.012), 30000.0);
          ccol = mix(ccol, sfFogColor(rd), 1.0 - exp(-sfOptical(cameraPosition, rd, dc)));
          float fade = smoothstep(0.0, 0.1, h);
          col = mix(col, ccol, clamp(d1 * fade, 0.0, 1.0));
        }

        // the same air as the ground near the horizon, fading out with altitude
        float T = exp(-sfOptical(cameraPosition, rd, 3200.0) * 0.55);
        float band = exp(-max(h, 0.0) * 10.0);
        col = mix(col, sfFogColor(rd), (1.0 - T) * mix(0.25, 1.0, band));
        col += uFlash * vec3(0.3, 0.32, 0.4) * 0.3;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const geo = new THREE.SphereGeometry(1, 48, 24);
  geo.scale(3000, 3000, 3000);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.name = 'sky';
  return { mesh, uniforms };
}
