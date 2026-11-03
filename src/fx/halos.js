// Halos: the glow a lantern makes in wet air. One soft billboard on each of the nearest lamps (the same list the
// materials are lit by, already dimmed by the hour and flickering), wider and brighter in mist and rain, drawn
// additively over everything with the other effects. Farther lanterns get their glow from the bloom alone.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, MAX_LAMPS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';

export function createHalos() {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aIdx', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: MAX_LAMPS }, (_, i) => i)), 1));
  geo.instanceCount = MAX_LAMPS;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${UNIFORMS_GLSL}
      attribute float aIdx;
      varying vec2 vQ; varying vec3 vCol;
      void main(){
        int i = int(aIdx + 0.5);
        vec4 lp = uLampPos[i];
        vec3 c = uLampCol[i];
        if (lp.y < -100.0 || dot(c, c) < 1e-6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        // pulled a little toward the eye so a wall behind does not cut the glow in half
        vec3 toEye = cameraPosition - lp.xyz;
        float d = length(toEye);
        vec3 ctr = lp.xyz + toEye / d * min(0.6, d * 0.5);
        float wet = clamp(uMist * 0.25 + uRain * 0.9, 0.0, 1.5);
        float size = (0.3 + 0.5 * wet) * lp.w / 3.2;
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        gl_Position = projectionMatrix * viewMatrix * vec4(ctr + (cr * position.x + cu * position.y) * size, 1.0);
        vQ = position.xy;
        // a near lantern's glow fills the view less than a far one's would; fade the nearest so it never floods
        vCol = c * (0.1 + 0.16 * wet) * smoothstep(3.0, 9.0, d) * smoothstep(70.0, 30.0, d);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vQ; varying vec3 vCol;
      void main(){
        float r2 = dot(vQ, vQ);
        if (r2 > 1.0) discard;
        float g = exp(-r2 * 7.0) * 0.7 + exp(-r2 * 2.2) * 0.3;
        g *= 1.0 - r2;
        gl_FragColor = vec4(vCol * g, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 12;
  mesh.name = 'halos';
  return { mesh };
}
