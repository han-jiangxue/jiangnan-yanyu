// Mist lying on the water (烟): soft banks drifting slowly down the canal, each a veil turned to face the camera
// about the vertical, its edge broken by noise, fading where it meets walls and banks and as the camera passes
// through it. Densest in mist and at dawn, a thin smoke over the water after rain.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { canalTexture } from '../world/water.js';
import { CORE, Z0, Z1 } from '../world/layout.js';
import { rng } from '../lib/math.js';

export function createMist(count = 60) {
  const R = rng(91);
  const zMin = CORE.z1 - 80, zMax = CORE.z0 + 60;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aA = new Float32Array(count * 4), aB = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // start z, height of the bank's middle, offset across the canal, drift speed
    aA.set([R.range(zMin, zMax), R.range(0.5, 1.5), R.range(-2.5, 2.5), R.range(0.12, 0.4)], i * 4);
    // width, height, seed, -
    aB.set([R.range(7, 15), R.range(1.6, 3.2), R.next(), 0], i * 4);
  }
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  geo.instanceCount = count;

  const uniforms = {
    ...U,
    tDepth: { value: null },
    tCanal: { value: canalTexture() },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNearFar: { value: new THREE.Vector2(0.1, 4000) },
    uZRange: { value: new THREE.Vector2(Z0, Z1) },
    uSpan: { value: new THREE.Vector2(zMin, zMax) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      attribute vec4 aA; attribute vec4 aB;
      uniform sampler2D tCanal; uniform vec2 uZRange, uSpan;
      varying vec2 vUv; varying vec3 vWP; varying float vViewZ, vFade, vSeed;
      void main(){
        float range = uSpan.y - uSpan.x;
        float z = uSpan.x + mod(aA.x - uSpan.x - uTime * aA.w, range);
        float zt = clamp((uZRange.x - z) / (uZRange.x - uZRange.y), 0.0, 1.0);
        vec4 cv = texture2D(tCanal, vec2(zt, 0.5));
        vec3 c = vec3(cv.x + aA.z * cv.y / 4.5, aA.y, z);
        vec3 toCam = cameraPosition - c;
        toCam.y = 0.0;
        toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
        vec3 right = vec3(-toCam.z, 0.0, toCam.x);
        vec3 wp = c + right * position.x * aB.x + vec3(0.0, position.y * aB.y, 0.0);
        vUv = position.xy + 0.5;
        vWP = wp;
        vSeed = aB.z;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vViewZ = -mv.z;
        // a bank the camera is passing through must not fill the frame; far off the fog takes over anyway
        float d = length(c.xz - cameraPosition.xz);
        // and it comes in and goes out at the ends of its run instead of jumping back
        vFade = smoothstep(3.0, 10.0, d) * smoothstep(160.0, 100.0, d) * smoothstep(0.0, 15.0, z - uSpan.x) * smoothstep(0.0, 15.0, uSpan.y - z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      uniform sampler2D tDepth; uniform vec2 uRes, uNearFar;
      varying vec2 vUv; varying vec3 vWP; varying float vViewZ, vFade, vSeed;
      float linDepth(float d){
        float n = uNearFar.x, f = uNearFar.y;
        float z = d * 2.0 - 1.0;
        return 2.0 * n * f / (f + n - z * (f - n));
      }
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        // a low bank: soft all round, thinning toward its top
        float shape = smoothstep(1.0, 0.25, length(q)) * smoothstep(1.0, -0.4, q.y);
        float n = sfFbm(vec2(vUv.x * 3.2 + vSeed * 13.0 + uTime * 0.035, vUv.y * 1.4 + vSeed * 7.0 - uTime * 0.015));
        float dens = clamp((uMist - 0.6) / 1.8, 0.0, 1.0) * 0.62;
        float a = shape * smoothstep(0.3, 0.72, n) * vFade * dens;
        // soft where it meets the walls, the banks, the bridge
        float sceneZ = linDepth(texture2D(tDepth, gl_FragCoord.xy / uRes).x);
        a *= smoothstep(0.0, 2.5, sceneZ - vViewZ);
        if (a < 0.003) discard;
        vec3 rd = normalize(vWP - cameraPosition);
        // mostly the air's own grey; only half the glow toward the sun, or a bank in front of it burns white
        vec3 col = mix(uFogAway, sfFogColor(rd), 0.5) * 1.05 + uAmbUp * 0.03;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 9;
  mesh.name = 'mist';
  return { mesh, uniforms };
}
