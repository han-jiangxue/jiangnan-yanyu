// Rain: thin streaks falling through a box that follows the camera, each turned to face it and drawn out along its
// fall the way a short exposure smears a drop. Drizzle is fine, short and slow; a downpour long, dense and slanted
// by the wind. All motion runs in the vertex shader; the CPU sets a few uniforms per frame.
// The falling-box idea is Sakura Fantasy's (c) 2026 Bill Chan, MIT License; the drop model here is new.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, OCC, MAX_LAMPS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { rng } from '../lib/math.js';

export function createRain(count) {
  const R = rng(5);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = R.next();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;

  const uniforms = { ...U, uCam: { value: new THREE.Vector3() }, uCount: { value: count } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${OCC}
      attribute vec4 aSeed;
      uniform vec3 uCam; uniform float uCount;
      varying vec2 vUv; varying vec3 vWP; varying float vAlpha;
      void main(){
        float id = float(gl_InstanceID) / uCount;
        // the share of drops alive follows the rain; even a drizzle is dense, its drops just fine and slow
        if (uRain < 0.01 || id > 0.35 + 0.65 * uRain) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 box = vec3(34.0, 20.0, 34.0);
        vec3 wind = vec3(uWind.x, 0.0, uWind.y) * (0.3 + uWind.z * 2.6);
        float fall = mix(3.6, 8.5, uRain) * (0.8 + aSeed.w * 0.4);
        vec3 vel = wind + vec3(0.0, -fall, 0.0);
        vec3 p = aSeed.xyz * box + vel * uTime;
        vec3 c0 = uCam + vec3(0.0, box.y * 0.25, 0.0);
        p = mod(p - c0 + box * 0.5, box) - box * 0.5 + c0;
        // a drop that has fallen below a roof never got there: none under the eaves, the corridor, the bridge
        if (p.y < sfOccHeight(p.xz) - 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 rel = (p - c0) / (box * 0.5);
        float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(rel.x), max(abs(rel.y), abs(rel.z))));
        // nothing may brush the lens: very near drops would fill the frame
        float dc = distance(p, cameraPosition);
        vAlpha = edge * smoothstep(0.8, 2.5, dc);
        vec3 v = normalize(vel);
        vec3 side = normalize(cross(v, normalize(p - cameraPosition)));
        // what a 1/50 s exposure smears a falling drop into; far drops are drawn a little wider so they do not
        // vanish between pixels
        float len = fall * mix(0.035, 0.06, uRain) * (0.8 + aSeed.w * 0.4);
        float wid = mix(0.005, 0.009, uRain) * (1.0 + dc * 0.03);
        vec3 wp = p + v * position.y * len + side * position.x * wid;
        vUv = position.xy + 0.5;
        vWP = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      varying vec2 vUv; varying vec3 vWP; varying float vAlpha;
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        // brighter at the head, thinning into the trail
        float a = smoothstep(1.0, 0.0, abs(q.x)) * smoothstep(1.0, 0.4, abs(q.y)) * mix(0.35, 1.0, smoothstep(-1.0, 0.8, -q.y));
        a *= vAlpha * mix(0.3, 0.42, uRain);
        if (a < 0.01) discard;
        // a drop is a lens: it shows the bright sky around it, and lanterns when they are lit
        vec3 col = uSkyHor * 0.9 + uAmbUp * 0.5 + uFlash * 1.5 + 0.01;
        for (int i = 0; i < ${MAX_LAMPS}; i++){
          vec4 lp = uLampPos[i];
          float d = distance(lp.xyz, vWP);
          col += uLampCol[i] * 0.6 / (1.0 + d * d * 0.5) * step(d, lp.w * 3.0);
        }
        col = sfAtmos(col, vWP);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 10;
  mesh.name = 'rain';
  return {
    mesh,
    update(camera) {
      uniforms.uCam.value.copy(camera.position);
    },
  };
}
