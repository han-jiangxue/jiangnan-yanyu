// Snow: flakes drifting down through a box that follows the camera, each a soft disc turned to face it, circling a
// little as it falls and carried by the wind; none under the eaves, the corridor or the bridge. A light snow is slow
// and sparse, a heavy one thick, quicker and driven slantwise by the wind. All motion runs in the vertex shader; the
// CPU sets one uniform per frame. Built like the rain (fx/rain.js), from the same falling box.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, OCC, MAX_LAMPS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { rng } from '../lib/math.js';

export function createSnow(count) {
  const R = rng(13);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
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
    vertexShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${OCC}
      attribute vec4 aSeed;
      uniform vec3 uCam; uniform float uCount;
      varying vec2 vQ; varying vec3 vWP; varying float vAlpha;
      void main(){
        float id = float(gl_InstanceID) / uCount;
        // the share of flakes alive follows the fall
        if (uSnowFall < 0.01 || id > 0.2 + 0.8 * uSnowFall) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 box = vec3(30.0, 18.0, 30.0);
        // a flake comes down at about a metre a second, quicker in a heavy fall, and the wind carries it
        float fall = mix(0.75, 1.5, uSnowFall) * (0.7 + aSeed.w * 0.6);
        vec3 wind = vec3(uWind.x, 0.0, uWind.y) * (0.25 + uWind.z * 2.4);
        vec3 p = aSeed.xyz * box + (wind + vec3(0.0, -fall, 0.0)) * uTime;
        // and circles as it comes
        float ph = aSeed.w * 37.0, sw = 0.18 + 0.25 * aSeed.x;
        p.x += sin(uTime * (0.8 + aSeed.y * 0.9) + ph) * sw;
        p.z += cos(uTime * (0.6 + aSeed.z * 0.8) + ph) * sw;
        vec3 c0 = uCam + vec3(0.0, box.y * 0.25, 0.0);
        p = mod(p - c0 + box * 0.5, box) - box * 0.5 + c0;
        // a flake that has come down below a roof never got there
        if (p.y < sfOccHeight(p.xz) - 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 rel = (p - c0) / (box * 0.5);
        float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(rel.x), max(abs(rel.y), abs(rel.z))));
        // a flake at the lens would be a blot: gone within a metre or so
        float dc = distance(p, cameraPosition);
        vAlpha = edge * smoothstep(0.5, 1.6, dc);
        // a centimetre or two across, bigger in a heavy fall; far ones a little larger so they do not vanish
        // between pixels
        float r = mix(0.012, 0.03, aSeed.y * aSeed.y) * (1.0 + 0.6 * uSnowFall) * (1.0 + dc * 0.025);
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = p + (cr * position.x + cu * position.y) * r;
        vQ = position.xy;
        vWP = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      varying vec2 vQ; varying vec3 vWP; varying float vAlpha;
      void main(){
        float a = smoothstep(1.0, 0.15, dot(vQ, vQ)) * vAlpha * 0.9;
        if (a < 0.01) discard;
        // white in the sky's light, warm where it passes a lantern
        vec3 col = uSkyHor * 0.75 + uAmbUp * 0.9 + 0.012;
        for (int i = 0; i < ${MAX_LAMPS}; i++){
          vec4 lp = uLampPos[i];
          float d = distance(lp.xyz, vWP);
          col += uLampCol[i] * 0.5 / (1.0 + d * d * 0.5) * step(d, lp.w * 3.0);
        }
        col = sfAtmos(col, vWP);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 10;
  mesh.name = 'snow';
  return {
    mesh,
    update(camera) {
      uniforms.uCam.value.copy(camera.position);
    },
  };
}
