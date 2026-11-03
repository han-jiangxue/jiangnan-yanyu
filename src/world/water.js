// The canal's surface: a planar reflection read along each pixel's reflected ray (so ripples stretch reflections
// downward and break them, the way real water does), ripples too fine for a pixel turned into roughness that blurs
// it, refraction through the opaque scene with absorption along the true optical path, and raindrop rings.
// Adapted from Sakura Fantasy (c) 2026 Bill Chan, MIT License: the reflection lookup, the roughness blur, the
// refraction and the ripple texture are theirs. The canal's slow, murky, sheltered water and the rain are tuned here;
// their boat wake, foam, petals and fireworks are left out for now.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, OCC, RINGS, MAX_LAMPS } from '../core/shared.js';
import { canalX, canalW, bankKind, Z0, Z1, BRIDGE_Z, CORRIDOR } from './layout.js';

export const LAYER_WATER = 1;

// centre-line lookup, sampled by z: x, half-width, and whether eaves overhang the water along the left and the right
// bank (houses standing in the water, the corridor), where a line of drips falls
export function canalTexture() {
  const n = 1024;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = Z0 - (i / (n - 1)) * (Z0 - Z1);
    data[i * 4] = canalX(z);
    data[i * 4 + 1] = canalW(z) / 2;
    const open = Math.abs(z - BRIDGE_Z) > 3.6;
    const corridor = z < CORRIDOR.z0 && z > CORRIDOR.z1;
    data[i * 4 + 2] = open && bankKind(z, -1) === 'water' ? 1 : 0;
    data[i * 4 + 3] = open && (bankKind(z, 1) === 'water' || (CORRIDOR.side === 1 && corridor)) ? 1 : 0;
  }
  const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// tileable ripple normals: integer wave vectors on the torus, so the texture repeats seamlessly
function rippleTexture(size = 256, seed = 7) {
  const h = new Float32Array(size * size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const waves = [];
  for (let i = 0; i < 56; i++) {
    const k = 1 + Math.floor(Math.pow(rnd(), 1.6) * 22);
    const a = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k), ky = Math.round(Math.sin(a) * k);
    if (kx === 0 && ky === 0) continue;
    const kl = Math.hypot(kx, ky);
    waves.push([kx, ky, rnd() * Math.PI * 2, Math.pow(kl, -1.25)]);
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      const u = (x / size) * Math.PI * 2, w = (y / size) * Math.PI * 2;
      for (const [kx, ky, ph, am] of waves) {
        const p = Math.sin(kx * u + ky * w + ph);
        v += am * (p - 0.35 * p * p * p);
      }
      h[y * size + x] = v;
    }
  const data = new Uint8Array(size * size * 4);
  const sc = 1.6;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      let nx = (l - r) * sc, ny = (d - u) * sc, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = nz * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export class Reflection {
  constructor() {
    // mipmapped and anisotropic: the water blurs its reflection by choosing the footprint of a single fetch
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, anisotropy: 8 });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.matrixAutoUpdate = true;
    this.textureMatrix = new THREE.Matrix4();
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._r = new THREE.Matrix4(); this._la = new THREE.Vector3();
    this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.planeY = 0;
    this._view = new THREE.Vector3(); this._target = new THREE.Vector3(); this._pp = new THREE.Vector3();
    this.primed = false;
  }
  setSize(w, h) { this.rt.setSize(Math.max(1, w), Math.max(1, h)); }
  render(renderer, scene, camera, layersMask) {
    const cam = this.cam, n = this.normal;
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    const origin = this._t.set(0, this.planeY, 0);
    // camera position mirrored in the plane
    const view = this._view.subVectors(origin, camPos).reflect(n).negate().add(origin);
    this._r.extractRotation(camera.matrixWorld);
    const look = this._la.set(0, 0, -1).applyMatrix4(this._r).add(camPos);
    const target = this._target.subVectors(origin, look).reflect(n).negate().add(origin);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(this._r).reflect(n);
    cam.lookAt(target);
    cam.far = camera.far; cam.near = camera.near;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near plane at the water so nothing below the surface is reflected
    this._plane.setFromNormalAndCoplanarPoint(n, this._pp.set(0, this.planeY - 0.06, 0));
    this._plane.applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = cam.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1.0;
    q.w = (1.0 + pm[10]) / pm[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1.0; pm[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.layers.mask = layersMask;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    // the shadow map is drawn in the first render of the frame; keep this pass from redrawing it
    const sm = renderer.shadowMap, shadowDue = sm.needsUpdate;
    if (this.primed) sm.needsUpdate = false;
    this.primed = true;
    renderer.render(scene, cam);
    sm.needsUpdate = shadowDue;
  }
}

export function createWater(reflection) {
  const uniforms = {
    ...U,
    tReflect: { value: reflection.rt.texture },
    tScene: { value: null },
    tDepth: { value: null },
    tRipple: { value: rippleTexture() },
    tCanal: { value: canalTexture() },
    uReflMat: { value: reflection.textureMatrix },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNearFar: { value: new THREE.Vector2(0.1, 5000) },
    uZRange: { value: new THREE.Vector2(Z0, Z1) },
    // the moving boats: their bows' recent tracks (x, z, time, distance run) and where they are (x, z, heading, speed)
    uWake0: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -1e4, 0)) },
    uWake1: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -1e4, 0)) },
    uBoatP: { value: [new THREE.Vector4(0, -1e4, 0, 0), new THREE.Vector4(0, -1e4, 0, 0)] },
    // the rectangle (min x, min z, max x, max z) each boat's wake can reach; outside it the wake is not worked out
    uWakeBox: { value: [new THREE.Vector4(0, 0, -1, -1), new THREE.Vector4(0, 0, -1, -1)] },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform mat4 uReflMat;
      varying vec3 vWP; varying vec4 vRefl; varying float vViewZ;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vRefl = uReflMat * wp;
        vec4 mv = viewMatrix * wp;
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWP; varying vec4 vRefl; varying float vViewZ;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      uniform sampler2D tReflect, tScene, tDepth, tRipple, tCanal;
      uniform vec2 uRes, uNearFar, uZRange;
      uniform mat4 uReflMat;
      uniform vec4 uWake0[16], uWake1[16], uBoatP[2], uWakeBox[2];

      // Kelvin ship waves by stationary phase (from Sakura Fantasy): x metres behind the bow and y off its track, the
      // transverse and divergent systems inside the 19.47 degree wedge. Returns the surface's gradient (d/dx, d/dy);
      // px is metres per pixel, so waves too short to show are left out rather than aliased
      vec2 kelvin(float x, float y, float k0, float px){
        float ay = max(abs(y), 1e-3), sy = y < 0.0 ? -1.0 : 1.0;
        float sq = sqrt(max(x * x - 8.0 * ay * ay, 0.0));
        float past = max(ay - 0.35355 * x, 0.0) / (0.35 + 0.25 * pow(x, 0.333));
        float rc = min(ay / (0.35355 * x), 1.0);
        float xs = max(x, 3.0) / 6.0;
        vec2 g = vec2(0.0);
        for (int j = 0; j < 2; j++) {
          float T = (-x + (j == 0 ? sq : -sq)) / (4.0 * ay);
          float r2 = 1.0 + T * T, r = sqrt(r2);
          float ph = k0 * r * (x + ay * T);
          float lam = 6.2832 / (k0 * r2);
          float a = j == 0 ? 0.05 * inversesqrt(xs) : 0.12 * pow(xs, -0.333) * (1.0 + 1.4 * rc * rc * rc);
          a *= smoothstep(0.18, 0.45, lam) * smoothstep(2.5, 5.0, lam / px);
          g -= a * sin(ph) * vec2(1.0, T * sy) / r;
        }
        return g * exp(-past * past) * smoothstep(0.5, 3.0, x);
      }

      // one boat's wake: the nearest piece of its bow's track (each point carried down by the current since), the
      // Kelvin waves off it, the smoother slick down the middle, and the collar of ripples round the hull.
      // xy: slope to add, z: how much the slick calms the ripples
      vec3 boatWake(vec3 wp, vec4 W[16], vec4 bp, vec4 box, vec2 flow, float px){
        if (wp.x < box.x || wp.z < box.y || wp.x > box.z || wp.z > box.w) return vec3(0.0);
        vec3 o = vec3(0.0);
        float best = 1e9, run = 0.0, wx = -1.0, wy = 0.0, wAge = 1e3;
        vec2 tb = vec2(0.0, 1.0);
        vec4 a = W[0];
        vec2 A = a.xy;
        for (int i = 1; i < 16; i++) {
          vec4 s = W[i];
          float age = uTime - s.z;
          if (age > 40.0) break;
          vec2 B = s.xy + flow * age;
          vec2 ab = B - A, aq = wp.xz - A;
          float L2 = dot(ab, ab);
          if (L2 > 0.01) {
            float L = sqrt(L2);
            float h = clamp(dot(aq, ab) / L2, 0.0, 1.0);
            vec2 d = aq - ab * h;
            float dd = dot(d, d);
            if (dd < best) {
              best = dd;
              wx = run + h * L;
              wAge = uTime - mix(a.z, s.z, h);
              tb = ab / L;
              wy = sign(tb.x * aq.y - tb.y * aq.x) * sqrt(dd);
            }
            run += L;
          }
          a = s; A = B;
        }
        if (wx > 0.0 && bp.w > 0.05) {
          float lay = exp(-wAge / 22.0) * smoothstep(60.0, 40.0, wx);
          float Uv = 1.0 + 0.8 * clamp(bp.w, 0.0, 1.5);
          vec2 g = kelvin(wx, wy, 9.81 / (Uv * Uv), px) * lay;
          o.xy = -(g.x * tb + g.y * vec2(-tb.y, tb.x));
          float along = wx - 6.5, side = abs(wy);
          float slickW = 0.5 + 0.25 * sqrt(max(along, 0.0));
          o.z = smoothstep(slickW, slickW * 0.3, side) * smoothstep(-0.5, 1.5, along) * smoothstep(50.0, 20.0, along) * exp(-wAge / 30.0);
        }
        // the collar round the hull, in the boat's own frame (x across, z toward the bow); the hull rocks even at rest
        vec2 rel = wp.xz - bp.xy;
        float ch = cos(bp.z), sh = sin(bp.z);
        vec2 bl = vec2(rel.x * ch - rel.y * sh, rel.x * sh + rel.y * ch);
        float hullD = length(vec2(bl.x / 0.72, bl.y / 3.75));
        float ring = exp(-(hullD - 1.05) * (hullD - 1.05) * 16.0);
        float bow = 1.0 + 1.5 * smoothstep(0.4, 0.95, bl.y / 3.75) * clamp(bp.w, 0.0, 1.0);
        o.xy += normalize(rel + 1e-3) * ring * sin(hullD * 26.0 - uTime * 4.0) * 0.3 * bow;
        return o;
      }

      // where the ray leaving the surface along N lands in the mirror camera's image, taking what it reflects to lie
      // t metres away; for a flat surface this is the plain projective lookup
      vec2 reflUv(vec3 p, vec3 V, vec3 N, float t){
        vec3 r = reflect(-V, N);
        r.y = max(r.y, 0.25 * V.y);
        vec4 c = uReflMat * vec4(p + r * t, 1.0);
        return c.xy / c.w;
      }
      float linDepth(float d){
        float n = uNearFar.x, f = uNearFar.y;
        float z = d * 2.0 - 1.0;
        return 2.0 * n * f / (f + n - z * (f - n));
      }
      vec2 rip(vec2 uv){ return texture2D(tRipple, uv).xy * 2.0 - 1.0; }

      ${OCC}
      ${RINGS}

      // drips from a line of eaves over the water: a row of rings along the bank, one source every tile channel.
      // d: metres out from the bank's edge, z: along it
      vec2 dripRings(float d, float z, float t){
        float cz = z / 0.22;
        float id = floor(cz), fz = (fract(cz) - 0.5) * 0.22;
        vec2 acc = vec2(0.0);
        for (int k = -1; k <= 1; k++){
          float idk = id + float(k);
          float h = sfHash12(vec2(idk, 7.7));
          float ph = fract(t * (0.55 + h * 0.8) + h * 5.0);
          vec2 dv = vec2(d - 0.42 - (h - 0.5) * 0.1, fz - float(k) * 0.22);
          float r = length(dv);
          float R = ph * 0.32;
          float ring = sin((r - R) * 70.0) * smoothstep(0.05, 0.0, abs(r - R)) * (1.0 - ph) * (1.0 - ph);
          acc += dv / max(r, 1e-3) * ring;
        }
        return acc;
      }

      void main(){
        vec3 wp = vWP;
        float footS = length(dFdx(wp.xz)), footF = length(dFdy(wp.xz));
        vec2 suv = gl_FragCoord.xy / uRes;
        float sceneZ = linDepth(texture2D(tDepth, suv).x);
        float thick = sceneZ - vViewZ;
        if (thick < 0.0) discard;

        // the canal's frame: across its width, and the slow current down it
        float zt = clamp((uZRange.x - wp.z) / (uZRange.x - uZRange.y), 0.0, 1.0);
        vec4 cv = texture2D(tCanal, vec2(zt, 0.5));
        float across = clamp((wp.x - cv.x) / max(cv.y, 1.0), -1.5, 1.5);
        float speed = 0.16 * (1.0 - 0.6 * across * across);
        vec2 flow = vec2(0.0, -1.0) * speed;

        // two-phase flow advection: bounded shear, no visible reset
        float T = uTime * 0.16;
        float p0 = fract(T), p1 = fract(T + 0.5);
        float bw = abs(p0 - 0.5) * 2.0;
        vec2 uvA = (wp.xz - flow * p0 * 6.0) / 6.5;
        vec2 uvB = (wp.xz - flow * p1 * 6.0) / 6.5 + 0.43;
        const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
        vec2 nA = rip(uvA) + rip(ROT * uvA * 2.3 + 0.21) * ROT * 0.6;
        vec2 nB = rip(uvB) + rip(ROT * uvB * 2.3 + 0.71) * ROT * 0.6;
        // a sheltered canal: gusts only find it in patches, and the water lies smoothest along the walls
        vec2 wdir = normalize(uWind.xy);
        vec2 gq = wp.xz / 24.0 - wdir * uTime * 0.05;
        float gust = sfNoise(gq) * 0.65 + sfNoise(gq * 2.3 + 5.1) * 0.35;
        float gustK = mix(0.35, 1.25, smoothstep(0.35, 0.75, gust) * uWind.z * 1.4);
        float edgeK = mix(1.0, 0.55, smoothstep(0.55, 1.0, abs(across)));
        vec2 n = mix(nA, nB, bw) * 0.3 * edgeK;
        vec2 wuv = wp.xz / 2.6 + wdir * uTime * 0.3;
        n += rip(wuv) * (0.05 + 0.35 * uWind.z) * gustK * edgeK;
        // a long, slow undulation under the ripples, so reflections also waver at the scale of metres
        n += rip(wp.xz / 23.0 + wdir * uTime * 0.01 + 0.37) * 0.1;
        // rain, where the sky reaches the water (none under the bridge or an eave); none of it worked out when dry
        vec3 rr = vec3(0.0);
        float rainK = 0.0;
        if (uRain > 0.001) {
          rr = sfRainRings(wp.xz, uTime, uRain);
          rainK = smoothstep(0.0, 0.08, uRain) * sfSkyExposure(vec3(wp.x, 0.0, wp.z));
          n += rr.xy * rainK * (0.8 + 0.8 * uRain);
        }
        // and the drips off the eaves, which keep falling a while after the rain
        float dripK = clamp(uRain * 1.5 + (uWet - 0.4), 0.0, 1.0);
        if (dripK > 0.01) {
          float dl = wp.x - (cv.x - cv.y), dr = (cv.x + cv.y) - wp.x;
          if (cv.z > 0.5 && dl < 1.0) n += dripRings(dl, wp.z, uTime) * vec2(1.0, 1.0) * dripK * 0.9;
          if (cv.w > 0.5 && dr < 1.0) n += dripRings(dr, wp.z, uTime) * vec2(-1.0, 1.0) * dripK * 0.9;
        }

        // the boats' wakes and the calmer water they leave down their tracks
        float px = length(fwidth(wp.xz));
        vec3 wk0 = boatWake(wp, uWake0, uBoatP[0], uWakeBox[0], flow, px);
        vec3 wk1 = boatWake(wp, uWake1, uBoatP[1], uWakeBox[1], flow, px);
        n *= 1.0 - 0.6 * max(wk0.z, wk1.z);
        vec2 wakeS = wk0.xy + wk1.xy;

        // what a pixel resolves of the ripples, and what it cannot: unresolved slopes become roughness
        float dist = length(wp - cameraPosition);
        vec3 V = normalize(cameraPosition - wp);
        vec2 f2 = normalize(wp.xz - cameraPosition.xz + 1e-4);
        vec2 s2 = vec2(-f2.y, f2.x);
        float resF = smoothstep(0.6, 0.04, footF);
        float resS = smoothstep(0.6, 0.04, footS);
        float amp = 0.42;
        vec2 sl = f2 * (dot(n, f2) * amp * mix(0.35, 1.0, resF)) + s2 * (dot(n, s2) * amp * mix(0.35, 1.0, resS)) + wakeS;
        vec3 N = normalize(vec3(sl.x, 1.0, sl.y));
        float rough = (0.5 + 0.5 * gustK) * edgeK * (0.8 + 0.6 * uRain);
        float shoreK = smoothstep(0.0, 1.0, thick);
        float sigF = (0.003 + 0.011 * (1.0 - resF)) * rough * shoreK;
        float sigS = (0.003 + 0.011 * (1.0 - resS)) * rough * shoreK;
        float NdV = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

        // reflection along the rippled ray, spread over the unresolved slopes by the fetch's own footprint
        vec3 Nd = normalize(vec3(sl.x * 0.12 * shoreK, 1.0, sl.y * 0.12 * shoreK));
        float tHit = 6.0 + dist * 0.45;
        vec2 ruv = reflUv(wp, V, Nd, tHit);
        mat2 J = mat2((reflUv(wp, V, normalize(Nd - vec3(f2.x, 0.0, f2.y) * 0.04), tHit) - ruv) / -0.04,
                      (reflUv(wp, V, normalize(Nd + vec3(s2.x, 0.0, s2.y) * 0.04), tHit) - ruv) / 0.04);
        vec2 rtex = 1.0 / vec2(textureSize(tReflect, 0));
        vec2 gF = J[0] * sigF * 3.5 + vec2(0.0, rtex.y * 0.7), gS = J[1] * sigS * 3.5 + vec2(rtex.x * 0.7, 0.0);
        if (!(abs(ruv.x) < 4.0 && abs(ruv.y) < 4.0)) ruv = vRefl.xy / vRefl.w;
        float gm = max(length(gF), length(gS));
        if (!(gm < 1e4)) { gF = vec2(0.0, rtex.y); gS = vec2(rtex.x, 0.0); }
        else if (gm > 0.08) { gF *= 0.08 / gm; gS *= 0.08 / gm; }
        vec3 refl = min(textureGrad(tReflect, clamp(ruv, 0.001, 0.999), gS, gF).rgb, vec3(64.0));

        // refraction through the scene copy; never pull colour from in front of the surface
        vec2 off = N.xz * 0.04 * clamp(thick / 2.0, 0.0, 1.0);
        vec2 suv2 = suv + off;
        float z2 = linDepth(texture2D(tDepth, suv2).x);
        if (z2 < vViewZ) suv2 = suv;
        vec3 under = texture2D(tScene, suv2).rgb;
        float thick2 = max(linDepth(texture2D(tDepth, suv2).x) - vViewZ, 0.0);
        float vDepth = thick2 * max(V.y, 0.05);
        float path = thick2 * 1.6 + vDepth * 2.0;
        // canal water: green-brown and thick with silt; a metre down the stones are gone
        vec3 absorb = exp(-path * vec3(1.5, 0.95, 1.25));
        vec3 body = vec3(0.016, 0.03, 0.022) * (uAmbUp * 1.4 + uSunCol * 0.03 * max(uSunDir.y, 0.0)) * 2.0;
        vec3 water = under * absorb + body * (1.0 - exp(-path * 0.9));
        // the air between the eye and the surface veils what is seen through it. The mirror image needs no more:
        // it was drawn from the mirrored eye, so its fog already spans the whole path, eye to surface to object
        water = sfAtmos(water, wp);

        vec3 col = mix(water, refl, F);

        // the sun or moon, when it shows at all through the cloud
        vec3 L = uSunDir;
        vec3 H = normalize(L + V);
        float nh = max(dot(N, H), 0.0);
        float sig2 = sigF * sigF;
        float eS = clamp(1.0 / (sig2 + 0.0016), 60.0, 600.0);
        col += uSunCol * (pow(nh, eS) * eS * 0.008 + pow(nh, 90.0) * 0.08) * smoothstep(-0.02, 0.05, L.y);

        // lantern glints: each lamp's image smeared into a column by the ripples, and broken across it into the
        // flecks and dashes a ruffled surface makes of a light
        float flecks = smoothstep(0.42, 0.75, sfNoise(wp.xz * vec2(2.2, 7.0) + vec2(0.0, uTime * 0.9)) * 0.65 + sfNoise(wp.xz * vec2(6.0, 15.0) - uTime * 0.6) * 0.35 + uRain * 0.08);
        for (int i = 0; i < ${MAX_LAMPS}; i++){
          vec4 lp = uLampPos[i];
          vec3 Ld = lp.xyz - wp;
          float ld = length(Ld);
          if (ld > 60.0) continue;
          vec3 Hl = normalize(Ld / ld + V);
          float eL = clamp(1.0 / (sig2 + 0.0024), 140.0, 700.0);
          float g = pow(max(dot(N, Hl), 0.0), eL) * eL * 0.006 * (0.25 + 0.95 * flecks);
          col += uLampCol[i] * g / (1.0 + ld * ld * 0.008);
        }

        // a drop's splash catches the light for an instant
        col += (uAmbUp * 0.6 + 0.01) * rr.z * rainK * smoothstep(20.0, 5.0, dist) * 0.5;
        // a damp darker line where the water meets the walls
        float edge = smoothstep(0.35, 0.0, thick2 * max(V.y, 0.2));
        col *= 1.0 - 0.25 * edge;

        // soft edge into the walls
        col = mix(under, col, smoothstep(0.0, 0.12, thick));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const geo = new THREE.PlaneGeometry(900, Z0 - Z1 + 200, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, (Z0 + Z1) / 2);
  mesh.layers.set(LAYER_WATER);
  mesh.frustumCulled = false;
  mesh.name = 'water';
  return { mesh, material: mat, uniforms };
}
