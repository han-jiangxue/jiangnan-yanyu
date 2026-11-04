// Fireflies on summer nights (夏夜流萤): a few hundred along the canal, thickest over the lotus, under the willows and
// in the grass at the foot of the banks, each drifting slowly about its own spot a little above the water or the lane
// and glowing up and dying away at its own pace; the canal shows them again. Only on a summer night without rain. All
// motion runs in the vertex shader; drawn additively, among the glowing effects the mirror also draws.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL } from '../core/shared.js';
import { LAYER_FX, LAYER_FXREFL } from '../core/pipeline.js';
import { bankX, bankNormal, bankKind, BANK_Y, CORE } from '../world/layout.js';
import { rng } from '../lib/math.js';

// crowns: the trees' crowns ({ x, y, z, r }); ponds: the lotus stretches ([z0, z1, side])
export function createFireflies(count, crowns, ponds) {
  const R = rng(83);
  const aA = new Float32Array(count * 4), aB = new Float32Array(count * 4);
  const out = (z, side, d) => { const n = bankNormal(z, side); return [bankX(z, side) + n.x * d, z + n.z * d]; };
  for (let i = 0; i < count; i++) {
    const f = i / count;
    let x, y, z;
    if (f < 0.35) {
      // over the lotus
      const [z0, z1, side] = ponds[Math.floor(R.next() * ponds.length)];
      z = R.range(z1, z0);
      [x, z] = out(z, side, -R.range(0.2, 3.0));
      y = R.range(0.2, 1.3);
    } else if (f < 0.65 && crowns.length) {
      // under a tree
      const c = crowns[Math.floor(R.next() * crowns.length)];
      const a = R.next() * Math.PI * 2, r = Math.sqrt(R.next()) * c.r;
      x = c.x + Math.cos(a) * r;
      z = c.z + Math.sin(a) * r;
      y = R.range(BANK_Y + 0.3, c.y - 0.6);
    } else {
      // along the banks: low over the water by the stones, or in the grass at the edge of a lane
      z = R.range(CORE.z1 - 20, CORE.z0 + 40);
      const side = R.next() < 0.5 ? -1 : 1;
      if (bankKind(z, side) === 'lane' && R.next() < 0.6) { [x, z] = out(z, side, R.range(0.2, 2.2)); y = BANK_Y + R.range(0.2, 1.2); }
      else { [x, z] = out(z, side, -R.range(0.2, 1.8)); y = R.range(0.15, 0.9); }
    }
    aA.set([x, y, z, R.next()], i * 4);
    // how long each glow takes, how far it wanders, how quickly, how big its halo
    aB.set([R.range(2.2, 4.5), R.range(0.4, 1.1), R.range(0.25, 0.6), R.range(0.06, 0.1)], i * 4);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      attribute vec4 aA, aB;
      varying vec2 vQ; varying float vGlow;
      void main(){
        // out on a summer night, not in the rain; fewer at the edges of it
        float k = uSeason.y * smoothstep(0.3, 0.8, uNight) * (1.0 - smoothstep(0.03, 0.2, uRain)) * (1.0 - smoothstep(0.02, 0.1, uSnowFall));
        if (fract(aA.w * 7.31) > k) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        // drifting about its spot
        float t = uTime * aB.z, ph = aA.w * 6.2832;
        vec3 p = aA.xyz + vec3(sin(t * 0.7 + ph) * cos(t * 0.31), 0.35 * sin(t * 0.53 + ph * 0.5), cos(t * 0.63 + ph * 0.7) * sin(t * 0.27 + 1.3)) * aB.y;
        // glowing up and dying away, then dark a while
        float c = fract(uTime / aB.x + aA.w);
        float glow = c < 0.4 ? pow(sin(3.14159 * c / 0.4), 2.0) : 0.0;
        float dc = distance(p, cameraPosition);
        vGlow = glow * smoothstep(70.0, 40.0, dc) * smoothstep(0.3, 0.8, dc);
        if (vGlow < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // a halo that stays a few pixels wide far off
        float s = aB.w * (1.0 + dc * 0.02);
        vQ = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(p + (cr * position.x + cu * position.y) * s, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vQ; varying float vGlow;
      void main(){
        float r2 = dot(vQ, vQ);
        float a = (exp(-r2 * 40.0) + 0.22 * exp(-r2 * 5.0)) * smoothstep(1.0, 0.7, r2);
        gl_FragColor = vec4(vec3(0.65, 1.0, 0.32) * 2.4 * a * vGlow, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.layers.enable(LAYER_FXREFL);
  mesh.renderOrder = 12;
  mesh.name = 'fireflies';
  return { mesh };
}
