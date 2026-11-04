// Drips off the eaves: a drop lets go from the tip of a drip tile, falls under gravity, and splashes where it lands
// (on the slabs; over the canal the water draws its own rings). In rain every channel drips; after the rain fewer
// and slower, for as long as the roofs are wet. All motion runs in the vertex shader.
// The same drops run off a boat's awnings: there the points are in the boat's frame and the mesh rides on the boat.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, MAX_LAMPS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { inCanal, BANK_Y, WATER_Y } from '../world/layout.js';
import { rng, clamp, smoothstep } from '../lib/math.js';

// How busy the drips are, 0..1, worked out as the shader below does: in the rain, and a while after it as long as the
// roofs are wet, but not while it snows. (The soundscape's drips and whether the drips are drawn at all follow it.)
export const dripActivity = (rain, wet, snowFall) => clamp(rain * 1.6 + (wet - 0.45) * 1.3, 0, 1) * (1 - smoothstep(0.05, 0.4, snowFall));

export function createDrips(points, max = 3200) {
  // thin out to the budget, evenly
  const step = Math.max(1, points.length / max);
  const list = [];
  for (let i = 0; i < points.length && list.length < max; i += step) {
    const [x, y, z] = points[Math.floor(i)];
    const water = inCanal(x, z);
    const y1 = water ? WATER_Y : BANK_Y;
    if (y - y1 < 0.4) continue;
    list.push([x, y, z, y - y1, water ? 1 : 0]);
  }
  return dripMesh(list, 'drips', 17, 0.014);
}

// drops off something that moves, as [x, y, z, fall, lands in water] in its own frame; add the mesh to it. A drop
// that lets go keeps the boat's way, so in the boat's frame it falls straight down.
// width: the streak's width in metres (a drop seen close is thinner than a run of them under an eave far off)
export function createLocalDrips(list, seed = 17, width = 0.008) {
  return dripMesh(list, 'awning-drips', seed, width);
}

function dripMesh(list, name, seed, width) {
  const R = rng(seed);
  const n = list.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aP = new Float32Array(n * 4), aS = new Float32Array(n * 4);
  list.forEach(([x, y, z, h, w], i) => {
    aP.set([x, y, z, h], i * 4);
    // period scale, phase, which share of activity wakes it, lands in water
    aS.set([R.range(0.7, 1.4), R.next(), R.next(), w], i * 4);
  });
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.instanceCount = n;

  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uDropW: { value: width } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      attribute vec4 aP; attribute vec4 aS;
      uniform float uDropW;
      varying vec2 vUv; varying vec3 vWP; varying float vAlpha, vSplash;
      void main(){
        // drips go on a while after the rain stops, as long as the roofs are wet, but not while it snows
        float act = clamp(uRain * 1.6 + (uWet - 0.45) * 1.3, 0.0, 1.0) * (1.0 - smoothstep(0.05, 0.4, uSnowFall));
        if (aS.z > act) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float T = mix(3.2, 0.75, act) * aS.x; // seconds between drops from one tile
        float h = aP.w;
        float tf = sqrt(2.0 * h / 9.8);
        float t = mod(uTime + aS.y * 17.0 * T, T);
        // where it lets go: fixed under the eaves, riding with a boat's awning
        vec3 o = (modelMatrix * vec4(aP.xyz, 1.0)).xyz;
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 wp;
        vSplash = 0.0;
        if (t < tf) {
          // falling: a streak along the fall, as long as a short exposure smears it
          float v = 9.8 * t;
          vec3 p = vec3(o.x, o.y - 4.9 * t * t, o.z);
          float len = 0.025 + v * 0.016;
          wp = p + vec3(0.0, position.y * len, 0.0) + cr * position.x * uDropW;
          vAlpha = 0.7;
        } else if (aS.w < 0.5 && t < tf + 0.14) {
          // landed on stone: a small crown thrown up and out, gone in a moment
          float k = (t - tf) / 0.14;
          vec3 p = vec3(o.x, o.y - h + 0.02 + 0.03 * k, o.z);
          float s = 0.05 + 0.1 * k;
          wp = p + cr * position.x * s * 2.0 + vec3(0.0, position.y * s, 0.0);
          vAlpha = 0.6 * (1.0 - k);
          vSplash = 1.0;
        } else { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vUv = position.xy + 0.5;
        vWP = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        // fade with distance: drips are a near detail
        vAlpha *= smoothstep(45.0, 20.0, distance(wp, cameraPosition));
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      varying vec2 vUv; varying vec3 vWP; varying float vAlpha, vSplash;
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        float a;
        if (vSplash > 0.5) {
          // a crown: brighter at its rim
          float r = length(q * vec2(1.0, 1.6));
          a = smoothstep(1.0, 0.75, r) * smoothstep(0.2, 0.7, r);
        } else {
          a = smoothstep(1.0, 0.0, abs(q.x)) * smoothstep(1.0, 0.3, abs(q.y)) * mix(0.4, 1.0, smoothstep(-1.0, 0.6, -q.y));
        }
        a *= vAlpha;
        if (a < 0.01) discard;
        vec3 col = uSkyHor * 1.0 + uAmbUp * 0.6 + 0.015;
        for (int i = 0; i < ${MAX_LAMPS}; i++){
          vec4 lp = uLampPos[i];
          float d = distance(lp.xyz, vWP);
          col += uLampCol[i] * 0.8 / (1.0 + d * d * 0.6) * step(d, lp.w * 3.0);
        }
        col = sfAtmos(col, vWP);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 11;
  mesh.name = name;
  return { mesh, count: n };
}
