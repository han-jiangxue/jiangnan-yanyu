// One set of uniforms drives every material, so light, air and weather stay consistent everywhere.
// Adapted from Sakura Fantasy (c) 2026 Bill Chan, MIT License: the shared-uniform design, the atmosphere and the
// material patching are theirs; the sky-lit wet sheen, the span-based occlusion and the rain exposure are new here.
import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v4 = (x = 0, y = 0, z = 0, w = 0) => new THREE.Vector4(x, y, z, w);

export const MAX_LAMPS = 10;

// the rain-occlusion map (core/occlusion.js): a depth image of the town from straight above, OCC_RES texels across,
// taken by a camera OCC_RANGE metres deep
export const OCC_RES = 1024;
export const OCC_RANGE = 60;

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: v3(0.3, 0.5, -0.8).normalize() }, // toward the dominant light (sun, or moon at night)
  uTrueSun: { value: v3(0.3, 0.5, -0.8).normalize() },
  uMoonDir: { value: v3(-0.3, 0.5, -0.8).normalize() },
  uSunCol: { value: v3(1, 1, 1) },
  uFogSun: { value: v3(0.8, 0.8, 0.8) },
  uFogAway: { value: v3(0.6, 0.65, 0.7) },
  uFogParams: { value: v4(0.001, 0.006, 0.05, 0) }, // haze/m, height fog density at y = 0, its falloff /m, -
  uMist: { value: 1 },
  uWind: { value: v4(0.6, -0.8, 0.3, 0) }, // dir xz, strength, -
  uSeason: { value: v4(1, 0, 0, 0) }, // spring, summer, autumn, winter weights (only spring is drawn so far)
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uRain: { value: 0 },
  uNight: { value: 0 },
  uFlash: { value: 0 },
  uFlashDir: { value: v3(0, 0.6, -0.8).normalize() },
  uSkyZen: { value: v3(0.4, 0.45, 0.5) },
  uSkyHor: { value: v3(0.6, 0.62, 0.64) },
  uAmbUp: { value: v3(0.4, 0.42, 0.45) },
  uAmbDown: { value: v3(0.12, 0.12, 0.11) },
  uLampPos: { value: Array.from({ length: MAX_LAMPS }, () => v4(0, -999, 0, 1)) },
  uLampCol: { value: Array.from({ length: MAX_LAMPS }, () => v3()) },
  uLampOn: { value: 0 }, // lanterns and windows lit, dusk to dawn
  uWinOff: { value: 0 }, // late at night: the share of lit windows that have gone out again
  // the view camera's position, for effects that must agree between the view and the shadow/mirror passes
  uViewPos: { value: v3() },
  // rain occlusion: the map, and (min x, max z, extent, camera height); extent 0 until the first render
  tOcc: { value: null },
  uOcc: { value: v4(0, 0, 0, 0) },
};

export const NOISE = /* glsl */ `
float sfHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sfHash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float sfNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(sfHash12(i), sfHash12(i+vec2(1,0)), u.x), mix(sfHash12(i+vec2(0,1)), sfHash12(i+vec2(1,1)), u.x), u.y); }
float sfFbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * sfNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
float sfFbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * sfNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
`;

export const UNIFORMS_GLSL = /* glsl */ `
uniform float uTime, uMist, uSnow, uWet, uRain, uNight, uFlash, uLampOn, uWinOff;
uniform vec3 uSunDir, uTrueSun, uMoonDir, uSunCol, uFogSun, uFogAway, uFlashDir, uSkyZen, uSkyHor, uAmbUp, uAmbDown, uViewPos;
uniform vec4 uFogParams, uWind, uSeason;
uniform vec4 uLampPos[${MAX_LAMPS}];
uniform vec3 uLampCol[${MAX_LAMPS}];
uniform sampler2D tOcc;
uniform vec4 uOcc;
`;

// Where the sky reaches. The occlusion map holds the height of the highest surface over each point near the camera;
// off the map everything counts as open.
export const OCC = /* glsl */ `
float sfOccHeight(vec2 xz){
  if (uOcc.z < 1.0) return -99.0;
  vec2 uv = vec2(xz.x - uOcc.x, uOcc.y - xz.y) / uOcc.z;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return -99.0;
  return uOcc.w - texture2D(tOcc, uv).x * ${OCC_RANGE.toFixed(1)};
}
// 1 in the open, 0 under a roof: four taps half a texel apart, so the line under an eave is not a staircase
float sfSkyExposure(vec3 wp){
  if (uOcc.z < 1.0) return 1.0;
  float t = uOcc.z / ${OCC_RES.toFixed(1)} * 0.6;
  float e = smoothstep(0.3, 0.08, sfOccHeight(wp.xz + vec2(t, t)) - wp.y)
          + smoothstep(0.3, 0.08, sfOccHeight(wp.xz + vec2(-t, t)) - wp.y)
          + smoothstep(0.3, 0.08, sfOccHeight(wp.xz + vec2(t, -t)) - wp.y)
          + smoothstep(0.3, 0.08, sfOccHeight(wp.xz + vec2(-t, -t)) - wp.y);
  return e * 0.25;
}
// What a reflected ray from p meets first: a house (marched through the occlusion map, a step that grows as it goes)
// or the sky it was given. A house shows as lime wall lit by the sky, dark just under its eaves.
vec3 sfOccReflect(vec3 p, vec3 R, vec3 sky){
  if (uOcc.z < 1.0 || R.y > 0.6) return sky;
  float t = 0.25;
  for (int i = 0; i < 14; i++){
    vec3 q = p + R * t;
    float h = sfOccHeight(q.xz);
    if (q.y < h) {
      vec3 wall = (uAmbUp * 0.55 + uAmbDown * 0.25) * smoothstep(0.0, 0.9, h - q.y);
      return mix(wall, sky, smoothstep(25.0, 60.0, t));
    }
    t *= 1.38;
  }
  return sky;
}
`;

// Raindrop rings on still water (the canal, puddles): at most one drop per cell per layer, each ring expanding and
// fading on its own clock; the share of live cells follows the rain. xy: the surface's slope, z: each drop's splash.
export const RINGS = /* glsl */ `
vec3 sfRainRings(vec2 p, float t, float rain){
  vec3 acc = vec3(0.0);
  for (int L = 0; L < 3; L++){
    float fl = float(L);
    vec2 q = p * (2.3 + fl * 0.9) + fl * 17.0;
    vec2 id = floor(q), f = fract(q) - 0.5;
    float h = sfHash12(id + fl * 9.1);
    float live = step(h, 0.25 + 0.75 * rain);
    float ph = fract(t * (1.1 + h * 0.6) + h * 7.0);
    vec2 c = vec2(sfHash12(id + 3.7), sfHash12(id + 8.3)) - 0.5;
    vec2 d = f - c * 0.6;
    float r = length(d);
    float R = ph * 0.42;
    float ring = sin((r - R) * 64.0) * smoothstep(0.075, 0.0, abs(r - R)) * (1.0 - ph) * (1.0 - ph);
    acc.xy += d / max(r, 1e-3) * ring * live;
    acc.z += smoothstep(0.05, 0.0, r) * smoothstep(0.08, 0.0, ph) * live;
  }
  return acc;
}
`;

// Aerial perspective: uniform haze + exponential height fog + a thin drifting mist over the water, in-scattering a
// little warmer toward the sun. The town is small and the air is wet, so the scales are tens of metres, not kilometres.
export const ATMOS = /* glsl */ `
float sfExpLayer(float k, float b, float y0, float dy, float dist){
  float h0 = k * exp(-b * y0);
  return abs(dy) > 0.01 ? h0 * (1.0 - exp(-b * dy)) / (b * dy / dist) : h0 * dist;
}
float sfOptical(vec3 ro, vec3 rd, float dist){
  float dy = rd.y * dist;
  float od = uFogParams.x * dist + sfExpLayer(uFogParams.y, uFogParams.z, ro.y, dy, dist);
  // mist hugging the water, broken into slow drifting banks
  float near = min(dist, 160.0);
  vec3 mp = ro + rd * near * 0.55;
  float bank = sfNoise(mp.xz * 0.03 + uTime * vec2(0.012, -0.018)) * 0.75 + sfNoise(mp.xz * 0.08 - uTime * 0.025) * 0.5;
  float mist = sfExpLayer(0.012 * uMist, 0.32, max(ro.y, 0.0), clamp(dy, -12.0, 400.0), dist);
  return od + mist * (0.2 + 1.1 * bank * bank);
}
vec3 sfFogColor(vec3 rd){
  float s = max(dot(rd, uTrueSun), 0.0);
  float glow = pow(s, 5.0) * 0.6 + pow(s, 40.0) * 0.4;
  vec3 c = mix(uFogAway, uFogSun, glow);
  // lightning lights the haze from inside
  c += uFlash * vec3(0.55, 0.6, 0.8) * (0.4 + 0.6 * max(dot(rd, uFlashDir), 0.0));
  return c;
}
vec3 sfAtmos(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition; float dist = length(v); vec3 rd = v / max(dist, 1e-4);
  float T = exp(-sfOptical(cameraPosition, rd, dist));
  return col * T + sfFogColor(rd) * (1.0 - T);
}
`;

// What a glossy surface sees along a reflected ray when there is no mirror for it: under an overcast sky that is a
// smooth gradient, the far town dissolved in fog near the horizon, and the dark ground below. In a town as close-
// built as this one, a low ray meets the houses across the lane or the canal long before the horizon, so the low
// band is the town's grey, not the bright sky. Rough surfaces see the average.
export const SKYRAD = /* glsl */ `
vec3 sfSkyRad(vec3 R, float rough){
  float h = R.y;
  vec3 sky = mix(uSkyHor, uSkyZen, pow(max(h, 0.0), 0.5));
  sky = mix(sky, uFogAway, exp(-max(h, 0.0) * 7.0) * 0.55);
  vec3 town = uAmbUp * 0.32 + uFogAway * 0.12;
  sky = mix(sky, town, smoothstep(0.45, 0.08, h) * 0.8);
  vec3 c = mix(uAmbDown * 0.7, sky, smoothstep(-0.14, 0.05, h));
  return mix(c, (uAmbUp + uAmbDown) * 0.5, rough * rough);
}
`;

// extra lights: lanterns (constant-count loop, so the programs never recompile), lightning
const LAMPS = /* glsl */ `
vec3 sfLamps(vec3 wp, vec3 nW, float wrap){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LAMPS}; i++){
    vec4 lp = uLampPos[i];
    vec3 L = lp.xyz - wp;
    float d2 = dot(L, L);
    float r2 = lp.w * lp.w;
    // a lantern lights what is near it: a quick falloff, gone by two and a half times its reach
    if (d2 > r2 * 6.25) continue;
    float d = sqrt(d2);
    float att = 1.0 / (1.0 + 3.0 * d2 / r2) * smoothstep(2.5 * lp.w, 1.0 * lp.w, d);
    float ndl = (dot(nW, L / d) + wrap) / (1.0 + wrap);
    acc += uLampCol[i] * att * max(ndl, 0.0);
  }
  return acc;
}
`;

// wind for plants: bend grows with height above the instance origin (h in metres) times stiffness
export const WIND_GLSL = /* glsl */ `
float sfGust(vec2 xz){
  vec2 wd = normalize(uWind.xy);
  vec2 q = vec2(dot(xz, wd), dot(xz, vec2(-wd.y, wd.x)));
  vec2 g = vec2((q.x - uTime * (3.0 + uWind.z * 5.0)) * 0.045, q.y * 0.014);
  return smoothstep(0.35, 0.8, sfNoise(g) * 0.65 + sfNoise(g * 2.3 + 7.1) * 0.35);
}
vec3 sfWindOffset(vec3 wpRoot, float h, float stiff){
  vec2 wd = normalize(uWind.xy);
  float gust = 0.15 + 0.85 * sfGust(wpRoot.xz);
  float s = uWind.z * (0.6 + gust) * stiff;
  float bend = h * h * 0.02;
  float flutter = sin(uTime * 2.7 + wpRoot.x * 0.7 + wpRoot.z * 0.9) * 0.25 + sin(uTime * 4.9 + wpRoot.z * 1.3) * 0.12;
  return vec3(wd.x, 0.0, wd.y) * bend * s * (1.0 + flutter) + vec3(0.0, -bend * s * 0.15, 0.0);
}
`;

const VERT_HEAD = /* glsl */ `
varying vec3 vSfWP;
varying vec2 vSpan;
attribute vec2 aSpan;
${UNIFORMS_GLSL}
${NOISE}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vSfWP;
varying vec2 vSpan;
${UNIFORMS_GLSL}
${NOISE}
${ATMOS}
${SKYRAD}
${LAMPS}
${OCC}
${RINGS}
// how much of the sky a point on a wall sees: dark at the foot where the ground and the canal close in, darker again
// right under the eaves, whose overhang hides the brightest part of an overcast sky. span = (foot y, eave y);
// geometry without a span (both 0) is left alone
float sfSpanAO(vec3 wp, vec2 span){
  if (span.y < span.x + 0.05) return 1.0;
  float up = wp.y - span.x, down = span.y - wp.y;
  float foot = mix(0.5, 1.0, smoothstep(0.0, 1.1, up));
  float eave = 1.0 - 0.38 * smoothstep(1.3, 0.0, down);
  return foot * eave;
}
`;

const WP_VERT = /* glsl */ `
  {
    vec4 sfWP4 = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      sfWP4 = batchingMatrix * sfWP4;
    #endif
    #ifdef USE_INSTANCING
      sfWP4 = instanceMatrix * sfWP4;
    #endif
    vSfWP = (modelMatrix * sfWP4).xyz;
    vSpan = aSpan;
  }
`;

/**
 * Patch a built-in material (Standard) with the shared world: fog and mist, lamps, lightning, wetness, the sky's
 * sheen on wet surfaces and span-based occlusion.
 * opts: { key, wet: 0..1 how much it darkens when soaked, gloss: 0..1 how glossy it gets, hooks: {vertex,
 * vertexPost, map, normal, alpha, preLight, light, post}, vertexHead, fragHead, uniforms, wrap }
 * Hooks share main()'s scope: a variable declared at the top level of an earlier hook is visible in later ones.
 */
export function patch(mat, opts = {}) {
  const wet = opts.wet ?? 1;
  const gloss = opts.gloss ?? 0.65;
  const hooks = opts.hooks || {};
  const extraUniforms = opts.uniforms || {};
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, extraUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}\n${opts.vertexHead || ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${hooks.beginNormal || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${hooks.vertex || ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WP_VERT}\n${hooks.vertexPost || ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}\n${opts.fragHead || ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${hooks.map || ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${hooks.normal || ''}`)
      .replace('#include <alphatest_fragment>', `${hooks.alpha || ''}\n#include <alphatest_fragment>`)
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        vec3 sfNW = inverseTransformDirection(normal, viewMatrix);
        // rain reaches what faces the sky; walls take it slantwise, the undersides of eaves not at all
        float sfExpo = smoothstep(-0.6, 0.0, sfNW.y) * mix(0.55, 1.0, max(sfNW.y, 0.0));
        // what faces up is wet only where the sky reaches it: dry under the eaves and the corridor roof
        if (sfNW.y > 0.3) sfExpo *= mix(1.0, sfSkyExposure(vSfWP), smoothstep(0.3, 0.8, sfNW.y));
        float sfWetK = uWet * sfExpo;
        ${hooks.preLight || ''}
        {
          diffuseColor.rgb *= 1.0 - ${wet.toFixed(3)} * 0.4 * sfWetK;
          #ifdef STANDARD
            roughnessFactor = mix(roughnessFactor, roughnessFactor * (1.0 - ${gloss.toFixed(3)}), sfWetK);
          #endif
        }`
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `
        float sfAO = sfSpanAO(vSfWP, vSpan);
        #if defined( RE_IndirectDiffuse )
          irradiance *= sfAO;
        #endif
        #if defined( RE_IndirectSpecular )
          vec3 sfR = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix);
          vec3 sfRad = sfSkyRad(sfR, material.roughness);
          ${hooks.radiance || ''}
          radiance += sfRad * mix(sfAO, 1.0, 0.3);
        #endif
        #include <lights_fragment_end>
        reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * (sfLamps(vSfWP, sfNW, ${(opts.wrap ?? 0).toFixed(2)}) + uFlash * vec3(1.1, 1.2, 1.5) * max(dot(sfNW, uFlashDir) * 0.6 + 0.4, 0.0));
        ${hooks.light || ''}`
      )
      .replace('#include <fog_fragment>', `gl_FragColor.rgb = mix(sfAtmos(gl_FragColor.rgb, vSfWP), gl_FragColor.rgb, smoothstep(0.0, -0.35, vSfWP.y));\n${hooks.post || ''}`);
    if (opts.onShader) opts.onShader(sh);
  };
  mat.customProgramCacheKey = () => 'jn:' + (opts.key || mat.type) + ':' + wet + ':' + gloss;
  return mat;
}
