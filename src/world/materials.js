// The town's materials. Each is a MeshStandardMaterial patched into the shared world (fog, wetness, sky sheen,
// occlusion) with its own fragment work on top:
//   plaster  lime-washed walls from a scanned wall, lifted to white, with rain streaks under the eaves, rising damp
//            at the foot and plaster fallen away to the grey brick behind
//   tile     small grey roof tiles, drawn procedurally from the roof's own uv (metres across the rows / down the
//            slope): alternating cover and channel rows, courses with dark lips, lichen in the channels
//   stone    granite embankment courses, greyed, with the water's damp band and green skin at the waterline
import * as THREE from 'three';
import { patch } from '../core/shared.js';
import { latticeAtlas } from './textures.js';

// the row pitch of the roof tiles (one cover + one channel), shared with the roof geometry
export const TILE_PITCH = 0.22;
export const COVER_FRAC = 0.42;
export const COVER_H = 0.045;
export const CHANNEL_D = 0.018;

// the roof's cross profile at u metres across the rows: covers raised, channels dipped
export function tileProfile(u) {
  const t = ((u / TILE_PITCH) % 1 + 1) % 1;
  return t < COVER_FRAC ? COVER_H * Math.sin((Math.PI * t) / COVER_FRAC) : -CHANNEL_D * Math.sin((Math.PI * (t - COVER_FRAC)) / (1 - COVER_FRAC));
}

let white = null;
const white1 = () => {
  if (white) return white;
  white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  return white;
};

const GLOW = {
  vertexHead: `attribute float aGlow; varying float vGlow, vSeed;`,
  fragHead: `varying float vGlow, vSeed;`,
  // the fraction is the amount, the whole part the window's seed (see kit.js)
  vertex: `vGlow = fract(aGlow); vSeed = floor(aGlow) / 64.0;`,
};

// A window at night. Some rooms stay dark; the rest light up one after another as dusk deepens, each in its own warm
// tone, and late at night most of them go out again. Steady lights (seed 0) just follow the lamps.
const WINDOW = /* glsl */ `
float jnLit(float seed){
  if (seed <= 0.0) return uLampOn;
  if (seed > 0.7) return 0.0;
  float t0 = seed * 0.8;
  float on = smoothstep(t0, t0 + 0.14, uLampOn);
  return on * (1.0 - smoothstep(-0.04, 0.04, uWinOff * 0.85 - fract(seed * 7.13)));
}
vec3 jnLampTone(float seed){
  vec3 c = mix(vec3(1.0, 0.46, 0.17), vec3(1.0, 0.66, 0.36), fract(seed * 3.71));
  return fract(seed * 5.37) > 0.86 ? vec3(1.0, 0.3, 0.12) : c;
}
// The room behind the glass (interior mapping): a ray from the eye through the window into a box of rooms laid along
// the wall, every room a floor high, a bay wide and a few metres deep. Back wall, side walls, floor and ceiling, a
// lamp near the ceiling, a dark cabinet against the back wall, a pale scroll hung above it. By day only the window's
// own daylight reaches in, fading with depth.
vec3 jnRoom(vec3 wp, vec3 n, float seed, float lit, vec3 tone){
  vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n));
  vec3 v = normalize(wp - cameraPosition);
  vec3 ro = vec3(dot(wp, t), wp.y - 1.3, 0.0);
  vec3 rd = vec3(dot(v, t), v.y, max(-dot(v, n), 0.02));
  vec3 size = vec3(3.6, 3.1, 3.0 + 2.0 * fract(seed * 9.1));
  vec2 lo = floor(ro.xy / size.xy) * size.xy, hi = lo + size.xy;
  float tx = (rd.x > 0.0 ? hi.x - ro.x : lo.x - ro.x) / (abs(rd.x) < 1e-4 ? 1e-4 : rd.x);
  float ty = (rd.y > 0.0 ? hi.y - ro.y : lo.y - ro.y) / (abs(rd.y) < 1e-4 ? 1e-4 : rd.y);
  float tz = size.z / rd.z;
  float th = min(min(tx, ty), tz);
  vec3 h = ro + rd * th;
  vec3 f = vec3((h.xy - lo) / size.xy, h.z / size.z);
  vec3 alb;
  if (th == tz) {
    alb = vec3(0.52, 0.46, 0.38);
    float cx = fract(seed * 13.7) * 0.5 + 0.15;
    if (f.y < 0.3 && abs(f.x - cx - 0.15) < 0.22) alb = vec3(0.12, 0.08, 0.05);
    if (f.y > 0.42 && f.y < 0.78 && abs(f.x - cx - 0.15) < 0.07) alb = vec3(0.78, 0.72, 0.6);
  } else if (th == tx) alb = vec3(0.44, 0.39, 0.32);
  else alb = rd.y < 0.0 ? vec3(0.2, 0.13, 0.08) : vec3(0.3, 0.24, 0.18) * (0.7 + 0.3 * step(0.5, fract(f.z * 4.0)));
  vec3 lamp = vec3(0.5 + 0.25 * (fract(seed * 4.3) - 0.5), 0.8, 0.45);
  float d = length((f - lamp) * size);
  vec3 light = tone * lit * (0.62 / (1.0 + d * d * 0.3) + 0.05);
  vec3 day = (uAmbUp * 0.35 + uAmbDown * 0.2) * (1.0 - 0.75 * f.z) * (1.0 - uNight * 0.9);
  return alb * (light + day);
}
`;

// frame-local helpers for walls: the face's horizontal direction, distance along it, height above its foot and
// below its eave
const WALL_FRAME = /* glsl */ `
  vec3 jnFn = normalize(cross(dFdx(vSfWP), dFdy(vSfWP)));
  vec2 jnTan = normalize(vec2(-jnFn.z, jnFn.x) + 1e-5);
  float jnAlong = dot(vSfWP.xz, jnTan);
  float jnHasSpan = step(vSpan.x + 0.05, vSpan.y);
  float jnUp = vSfWP.y - vSpan.x, jnDown = vSpan.y - vSfWP.y;
`;

export function createMaterials(tex) {
  const T = (id) => ({ map: tex[id + '_c'], normalMap: tex[id + '_n'] });
  const mk = (key, params, o = {}) => patch(new THREE.MeshStandardMaterial({ vertexColors: true, ...params }), { key, ...o });

  const plaster = mk('plaster', { ...T('worn_mossy_plasterwall'), roughness: 0.94, normalScale: new THREE.Vector2(0.55, 0.55) }, {
    wet: 0.8,
    gloss: 0.4,
    uniforms: { tPl2: { value: tex.white_rough_plaster_c }, tBrick: { value: tex.whitewashed_brick_c } },
    fragHead: `uniform sampler2D tPl2, tBrick;`,
    hooks: {
      map: /* glsl */ `
        ${WALL_FRAME}
        float jnStreak = 0.0;
        {
          vec3 scan = diffuseColor.rgb;
          float lum = dot(scan, vec3(0.2126, 0.7152, 0.0722));
          vec3 chroma = scan / max(lum, 1e-3);
          // lime white: the scan's mould and stains kept at half their contrast, its grey lifted
          float rel = mix(1.0, lum / 0.21, 0.38);
          vec3 c = vec3(0.79, 0.78, 0.745) * rel * mix(vec3(1.0), chroma, 0.15);
          vec2 wq = vec2(jnAlong, vSfWP.y);
          // patches where an older, rougher coat shows through
          vec3 pl2 = texture2D(tPl2, vMapUv * 0.7 + 0.37).rgb;
          float flakeZone = smoothstep(0.55, 0.78, sfNoise(wq * 0.35 + 3.7));
          c = mix(c, c * mix(0.86, 1.03, smoothstep(0.08, 0.5, dot(pl2, vec3(0.33)))), flakeZone * 0.5);
          // grime at the scale of the whole wall
          c *= 0.92 + 0.1 * sfNoise(wq * 0.17 + 11.0);
          // rain streaks running down from the eave or the coping, heavier below some bays than others
          float sx = jnAlong * 2.6;
          float st = sfNoise(vec2(sx, vSfWP.y * 0.09)) * 0.6 + sfNoise(vec2(sx * 2.7 + 5.0, vSfWP.y * 0.25)) * 0.4;
          float src = 0.3 + 0.95 * sfNoise(vec2(jnAlong * 0.45, 7.3));
          jnStreak = clamp(smoothstep(0.5, 0.82, st) * smoothstep(0.05, 0.4, jnDown) * exp(-jnDown * 0.26) * src * jnHasSpan, 0.0, 1.0);
          c = mix(c, c * vec3(0.58, 0.575, 0.54), jnStreak * 0.65);
          // rising damp: a dark, greenish tide with a ragged line
          float tide = 0.45 + 0.6 * sfFbm3(vec2(jnAlong * 0.7, 2.3));
          float damp = smoothstep(tide + 0.15, tide - 0.25, jnUp) * jnHasSpan;
          c = mix(c, c * vec3(0.4, 0.44, 0.36), damp * 0.8);
          c *= 1.0 - 0.16 * exp(-pow((jnUp - tide) * 8.0, 2.0)) * jnHasSpan;
          // plaster fallen away, grey brick behind, a thin shadow at the broken edge; most of it near the foot
          float pn = sfFbm(wq * 1.7 + 13.1);
          float th = 0.79 - 0.13 * smoothstep(1.6, 0.15, jnUp) * jnHasSpan - 0.03 * jnStreak;
          float peel = smoothstep(th, th + 0.006, pn);
          float rim = smoothstep(th - 0.025, th, pn) * (1.0 - peel);
          vec3 brick = texture2D(tBrick, wq * 0.55).rgb * vec3(0.62, 0.65, 0.69);
          c = mix(c, brick, peel);
          c *= 1.0 - 0.3 * rim;
          diffuseColor.rgb = c;
        }`,
      // water runs down the streaks first
      preLight: `diffuseColor.rgb *= 1.0 - 0.22 * jnStreak * uWet;`,
    },
  });

  const tile = mk('tile', { map: tex.grey_roof_tiles_c, roughness: 0.7 }, {
    wet: 0.5,
    gloss: 0.55,
    fragHead: `const float JP = ${TILE_PITCH.toFixed(3)}; const float JCF = ${COVER_FRAC.toFixed(3)};`,
    hooks: {
      map: /* glsl */ `
        float jnU = vMapUv.x, jnV = vMapUv.y;
        float jnT = fract(jnU / JP);
        float jnRow = floor(jnU / JP);
        float jnCover = step(jnT, JCF);
        float jnCv = jnV / 0.085 + jnCover * 0.5 + sfHash12(vec2(jnRow, 3.0));
        float jnF = fract(jnCv);
        float jnFw = fwidth(jnCv);
        float jnFwU = fwidth(jnU / JP);
        {
          // the scan only for grime at the scale of metres
          float grime = dot(texture2D(map, vMapUv * 0.07).rgb, vec3(0.33));
          float id = sfHash12(vec2(jnRow * 2.0 + jnCover, floor(jnCv)));
          vec3 c = vec3(0.085, 0.088, 0.094) * (0.8 + 0.4 * id) * (0.75 + 0.7 * grime);
          c *= mix(0.84, 1.18, jnCover);
          // lichen and soot in the channels, where the water runs
          c = mix(c, vec3(0.06, 0.075, 0.05), (1.0 - jnCover) * 0.3);
          // each tile's lower lip overhangs the next: a dark line (filled in and gone under snow)
          float lip = smoothstep(0.8, 0.97, jnF);
          c *= 1.0 - 0.5 * lip * (1.0 - smoothstep(0.25, 0.7, jnFw)) * (1.0 - smoothstep(0.15, 0.6, uSnow));
          // the shade a cover row casts on the channel beside it
          float side = smoothstep(JCF, JCF + 0.08, jnT) * (1.0 - smoothstep(JCF + 0.08, JCF + 0.2, jnT)) + smoothstep(0.92, 1.0, jnT);
          c *= 1.0 - 0.35 * side * (1.0 - smoothstep(0.3, 0.8, jnFwU));
          // moss blotches (greener in summer, browner and duller in autumn and winter)
          float moss = smoothstep(0.58, 0.82, sfNoise(vec2(jnU, jnV) * 0.7 + 5.0)) * mix(1.0, 0.4, jnCover);
          vec3 mossC = mix(vec3(0.055, 0.075, 0.04), vec3(0.045, 0.09, 0.03), uSeason.y * 0.7);
          c = mix(c, mix(mossC, vec3(0.06, 0.056, 0.036), clamp(uSeason.z * 0.7 + uSeason.w * 0.8, 0.0, 1.0)), moss * 0.55);
          // where rows and courses fall under a pixel, their average
          vec3 avg = vec3(0.08, 0.082, 0.087) * (0.75 + 0.7 * grime);
          c = mix(c, avg, smoothstep(0.35, 0.9, max(jnFw, jnFwU * 0.6)));
          diffuseColor.rgb = c;
        }`,
      normal: /* glsl */ `
        {
          vec3 dpx = dFdx(vSfWP), dpy = dFdy(vSfWP);
          vec2 dux = dFdx(vMapUv), duy = dFdy(vMapUv);
          float det = dux.x * duy.y - dux.y * duy.x;
          if (abs(det) > 1e-14) {
            vec3 Tu = normalize((dpx * duy.y - dpy * dux.y) / det); // across the rows
            vec3 Bv = normalize((dpy * dux.x - dpx * duy.x) / det); // down the slope
            vec3 nW = inverseTransformDirection(normal, viewMatrix);
            // each tile lies steeper than the deck, and its rounded lip faces down the slope
            // (snow fills the steps from one course to the next and leaves the slope smooth)
            float tilt = (0.12 + 0.8 * smoothstep(0.84, 0.98, jnF)) * (1.0 - smoothstep(0.25, 0.7, jnFw)) * (1.0 - 0.85 * smoothstep(0.15, 0.6, uSnow));
            // flat stand-in roofs (span flag -1) carry the rows in the normal instead of the geometry
            float dh = 0.0;
            if (vSpan.x < -0.5) {
              dh = jnT < JCF ? cos(3.14159 * jnT / JCF) * 3.14159 / JCF * ${COVER_H.toFixed(3)} / JP
                             : -cos(3.14159 * (jnT - JCF) / (1.0 - JCF)) * 3.14159 / (1.0 - JCF) * ${CHANNEL_D.toFixed(3)} / JP;
              dh *= 1.0 - smoothstep(0.3, 0.8, jnFwU);
            }
            nW = normalize(nW - Tu * dh + Bv * tilt);
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          }
        }`,
      // snow fills the channels first and covers the rows of covers last, so a light fall leaves the roof striped
      // white and black (白雪黑瓦); where the rows fall under a pixel, their average, or the stripes shimmer
      snow: /* glsl */ `
        float jnCK = 0.25 + 0.75 * smoothstep(0.45, 0.95, uSnow);
        sfSnowK *= mix(mix(1.0, jnCK, jnCover), mix(1.0, jnCK, JCF), smoothstep(0.3, 0.8, jnFwU));`,
    },
  });

  // ridges: tiles stood on edge in a row
  const ridge = mk('ridge', { map: white1(), color: 0x2a2b2d, roughness: 0.7 }, {
    wet: 0.4,
    gloss: 0.7,
    hooks: {
      map: `{ float s = abs(fract(vMapUv.x * 15.0) - 0.5); diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.06, 0.2, s)); }`,
    },
  });

  // waterline: damp below ~0.9 m, a green-black skin where the water laps, moss creeping from the joints (greener in
  // summer, browner and duller in autumn and winter)
  const WATERLINE = /* glsl */ `
    float wy = vSfWP.y;
    c *= mix(1.0, 0.5, smoothstep(0.95, 0.1, wy));
    c = mix(c, c * vec3(0.7, 0.95, 0.68), smoothstep(0.45, -0.1, wy) * 0.8);
    float moss = smoothstep(0.6, 0.85, sfNoise(vSfWP.xz * 0.9 + vSfWP.y * 1.3)) * smoothstep(2.4, 0.5, wy);
    c = mix(c, mix(mix(vec3(0.07, 0.09, 0.045), vec3(0.055, 0.1, 0.038), uSeason.y * 0.7), vec3(0.072, 0.068, 0.045), clamp(uSeason.z * 0.7 + uSeason.w * 0.8, 0.0, 1.0)), moss * 0.5);
  `;
  const stone = mk('stone', { ...T('granite_wall'), roughness: 0.88 }, {
    wet: 0.9,
    gloss: 0.4,
    hooks: {
      map: /* glsl */ `
        {
          vec3 s = diffuseColor.rgb;
          float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
          // the scan is a warm granite; the banks here are grey-blue
          vec3 c = vec3(l) * vec3(0.97, 1.0, 1.05) * 1.1 + (s - l) * 0.2;
          ${WATERLINE}
          diffuseColor.rgb = c;
        }`,
    },
  });

  // slabs, with puddles where they have worn hollow: on what faces the sky, filling as the rain goes on, last to dry.
  // A puddle is a film of still water: dark underneath, a mirror of the sky on top, broken by the drops falling in it
  const slab = mk('slab', { ...T('granite_tile'), roughness: 0.82 }, {
    wet: 0.7,
    gloss: 0.5,
    hooks: {
      map: /* glsl */ `
        float jnPud = 0.0;
        // how light the stone is here: the joints and the darker slabs are rougher and take less of the sky's sheen,
        // which keeps the slab pattern in a wet lane seen at a low angle instead of one even pale sheet
        float jnTex = clamp(dot(diffuseColor.rgb, vec3(0.333)) / 0.12, 0.0, 1.0);
        {
          vec3 c = diffuseColor.rgb * vec3(0.97, 1.0, 1.06) * 1.25;
          ${WATERLINE}
          vec3 fn = normalize(cross(dFdx(vSfWP), dFdy(vSfWP)));
          if (fn.y > 0.92 && uWet > 0.05) {
            float n = sfFbm(vSfWP.xz * 0.3 + 3.1) * 0.8 + sfNoise(vSfWP.xz * 1.9 + 7.0) * 0.25;
            // puddles in the low spots only: about a fifth of the paving when soaked
            float level = 0.76 - 0.1 * uWet;
            jnPud = smoothstep(level, level + 0.07, n) * smoothstep(0.1, 0.6, uWet) * sfSkyExposure(vSfWP);
            // and none under the snow
            jnPud *= 1.0 - smoothstep(0.1, 0.45, uSnow);
          }
          c *= 1.0 - 0.45 * jnPud;
          // Fallen leaves in autumn, one at most in each cell of a grid on the paving: more of them under the eaves and
          // the corridor's roof, where the wind leaves them, and over a puddle they lie on top
          if (uSeason.z > 0.001 && fn.y > 0.92) {
            vec2 cell = floor(vSfWP.xz / 0.3);
            float sheltered = smoothstep(0.2, 0.6, sfOccHeight(vSfWP.xz) - vSfWP.y);
            if (sfHash12(cell * 1.31 + 7.7) < uSeason.z * (0.08 + 0.3 * sheltered)) {
              float h2 = sfHash12(cell + 2.9), h3 = sfHash12(cell + 5.3), h4 = sfHash12(cell + 8.1);
              vec2 q = vSfWP.xz - (cell + 0.3 + 0.4 * vec2(h2, h3)) * 0.3;
              float ang = h4 * 6.2832, ca = cos(ang), sa = sin(ang);
              vec2 lq = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);
              float broad = step(0.7, h4);
              float size = mix(0.05 + 0.035 * h3, 0.07 + 0.03 * h3, broad);
              float t = clamp(lq.x / size, -1.0, 1.0);
              float sd = max(abs(lq.y) - size * mix(0.28, 0.55, broad) * (1.0 - t * t), abs(lq.x) - size);
              float fx = length(dFdx(vSfWP.xz)), fy = length(dFdy(vSfWP.xz));
              float a = clamp(0.5 - sd / max(sqrt(fx * fy), 1e-4), 0.0, 1.0) * smoothstep(size * 0.9, size * 0.3, min(fx, fy));
              c = mix(c, mix(vec3(0.42, 0.24, 0.035), vec3(0.2, 0.09, 0.03), h2 * h2), a);
              jnPud *= 1.0 - a;
            }
          }
          diffuseColor.rgb = c;
        }`,
      normal: /* glsl */ `
        if (jnPud > 0.01) {
          vec3 rr = sfRainRings(vSfWP.xz * 1.3, uTime, uRain);
          vec3 nW = normalize(vec3(-rr.x * 0.45, 1.0, -rr.y * 0.45) * vec3(smoothstep(0.0, 0.08, uRain), 1.0, smoothstep(0.0, 0.08, uRain)));
          normal = normalize(mix(normal, (viewMatrix * vec4(nW, 0.0)).xyz, jnPud));
        }`,
      preLight: `roughnessFactor = mix(1.0, roughnessFactor, smoothstep(0.2, 0.6, jnTex)); roughnessFactor = mix(roughnessFactor, 0.03, jnPud);`,
      // a puddle mirrors what is really around it: the bright sky, or the houses and the dark line of their eaves
      // (the sky in a puddle is the wet, misted sky the other wet surfaces see, not the bright dome itself). The wet
      // stone between the puddles shows a sheen, not a mirror: the eaves on both sides of a lane hide much of the sky
      // it would reflect, so it reads as dark wet 青石板 rather than as a pale sheet
      radiance: `sfRad *= mix(0.6 * mix(0.4, 1.0, jnTex), 1.0, jnPud); if (jnPud > 0.01) sfRad = mix(sfRad, sfOccReflect(vSfWP + vec3(0.0, 0.02, 0.0), sfR, mix(uSkyHor, uSkyZen, sqrt(max(sfR.y, 0.0))) * 0.7), jnPud);`,
    },
  });

  const brick = mk('brick', { ...T('whitewashed_brick'), roughness: 0.9 }, {
    wet: 0.8,
    gloss: 0.4,
    hooks: {
      map: /* glsl */ `
        {
          vec3 c = diffuseColor.rgb * vec3(0.44, 0.47, 0.5);
          ${WATERLINE}
          diffuseColor.rgb = c;
        }`,
    },
  });

  const wood = mk('wood', { ...T('weathered_planks'), roughness: 0.82, normalScale: new THREE.Vector2(0.7, 0.7) }, { wet: 0.45, gloss: 0.35 });
  const timber = mk('timber', { ...T('old_planks_02'), roughness: 0.85, normalScale: new THREE.Vector2(0.6, 0.6) }, { wet: 0.4, gloss: 0.3 });

  // window interiors and paper: dark by day, warm when the lamps come on
  // window glass opens onto a room; paper glows evenly from the lamp behind it
  const glowHooks = (k, room) => ({
    vertexHead: GLOW.vertexHead,
    fragHead: GLOW.fragHead + WINDOW,
    hooks: {
      vertex: GLOW.vertex,
      preLight: /* glsl */ `
        if (vGlow > 0.001) {
          float lit = jnLit(vSeed) * vGlow;
          vec3 tone = jnLampTone(vSeed) * (0.94 + 0.06 * sin(uTime * 5.0 + vSfWP.x * 3.1 + vSfWP.z));
          ${room ? 'totalEmissiveRadiance += (vSeed > 0.0 ? jnRoom(vSfWP, sfNW, vSeed, lit, tone) : tone * lit * 0.5) * ' + k + ';' : 'totalEmissiveRadiance += tone * lit * ' + k + ';'}
        }`,
    },
  });
  const dark = mk('dark', { color: 0x090807, roughness: 0.95 }, { wet: 0, gloss: 0, ...glowHooks('1.0', true) });
  const paper = mk('paper', { color: 0xc9bfae, roughness: 0.92 }, { wet: 0.2, gloss: 0, ...glowHooks('1.5', false) });

  // red silk lanterns: a deep red by day; after dusk lit from inside, brightest where the silk faces the eye and a
  // deeper red toward the rim, where the light crosses more of it
  const lantern = mk('lantern', { color: 0x8a1a12, roughness: 0.55 }, {
    wet: 0.2,
    gloss: 0.3,
    vertexHead: GLOW.vertexHead,
    fragHead: GLOW.fragHead,
    hooks: {
      vertex: GLOW.vertex,
      preLight: /* glsl */ `
        {
          float g = vGlow * uLampOn;
          if (g > 0.001) {
            float face = max(dot(sfNW, normalize(cameraPosition - vSfWP)), 0.0);
            vec3 silk = mix(vec3(0.55, 0.05, 0.02), vec3(1.25, 0.32, 0.08), face * face);
            totalEmissiveRadiance += silk * g * 0.75 * (0.93 + 0.07 * sin(uTime * 6.0 + vSfWP.x * 3.1 + vSfWP.z));
          }
        }`,
    },
  });

  const lattice = mk('lattice', { map: latticeAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }, { wet: 0.3, gloss: 0.3 });

  const bark = mk('bark', { ...T('bark_willow'), roughness: 0.92 }, { wet: 0.8, gloss: 0.35 });
  const bed = mk('bed', { color: 0x15130e, roughness: 1 }, { wet: 0, gloss: 0 });

  return { plaster, tile, ridge, stone, slab, brick, wood, timber, dark, paper, lattice, lantern, bark, bed };
}
