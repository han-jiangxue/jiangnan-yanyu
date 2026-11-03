// HDR post chain: physically based bloom (13-tap down / tent up), then one composite pass to the canvas: tone map,
// white balance, a soft grade for wet grey air, vignette, grain, sharpening upscale from the render scale.
// Adapted from Sakura Fantasy (c) 2026 Bill Chan, MIT License (sun shafts dropped: there is no sun to shaft here).
import * as THREE from 'three';

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FullScreen {
  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new THREE.Mesh(geo, null);
    this.mesh.frustumCulled = false;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, this.camera);
  }
}

const mk = (frag, uniforms) =>
  new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };

export class Post {
  constructor(renderer, levels = 6) {
    this.renderer = renderer;
    this.fs = new FullScreen();
    this.mips = [];
    this.levels = levels;
    for (let i = 0; i < this.levels; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, rtOpts));

    this.down = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst;
      varying vec2 vUv;
      vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
      float lw(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25); }
      void main(){
        vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
        vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
        vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
        vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
        vec3 r;
        if (uFirst > 0.5) {
          // Karis average on the first step keeps single bright pixels (glints) from flickering
          vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
          float w0 = lw(g0), w1 = lw(g1), w2 = lw(g2), w3 = lw(g3), w4 = lw(g4);
          r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
        } else {
          r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        }
        gl_FragColor = vec4(max(r, 0.0), 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } }
    );
    this.up = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
      varying vec2 vUv;
      void main(){
        vec2 o = uTexel * uRadius;
        vec3 r = texture2D(tSrc, vUv).rgb * 4.0;
        r += (texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb) * 2.0;
        r += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(r / 16.0, 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } }
    );
    this.up.blending = THREE.AdditiveBlending;
    this.up.transparent = true;

    this.composite = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tScene, tBloom;
      uniform vec2 uSrcTexel;
      uniform float uExposure, uBloom, uTime, uSharpen, uVignette, uSat, uFade, uNightK, uGrain;
      uniform vec3 uWB, uFadeCol, uLift;
      varying vec2 vUv;

      vec3 aces(vec3 x){
        const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        vec3 v = m1 * x;
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return clamp(m2 * (a / b), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

      // Catmull-Rom upscale in five bilinear taps: below full scale it keeps the edges a bilinear stretch would smear
      vec3 catmullRom(vec2 uv){
        vec2 pos = uv / uSrcTexel;
        vec2 c = floor(pos - 0.5) + 0.5;
        vec2 f = pos - c;
        vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
        vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
        vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
        vec2 w3 = f * f * (-0.5 + 0.5 * f);
        vec2 w12 = w1 + w2;
        vec2 t0 = (c - 1.0) * uSrcTexel, t3 = (c + 2.0) * uSrcTexel, t12 = (c + w2 / w12) * uSrcTexel;
        vec3 r = texture2D(tScene, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y)
               + texture2D(tScene, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
               + texture2D(tScene, t12).rgb * (w12.x * w12.y)
               + texture2D(tScene, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
               + texture2D(tScene, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
        return r / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
      }

      void main(){
        vec3 n0 = texture2D(tScene, vUv + vec2(0.0, uSrcTexel.y)).rgb, n1 = texture2D(tScene, vUv - vec2(0.0, uSrcTexel.y)).rgb;
        vec3 n2 = texture2D(tScene, vUv + vec2(uSrcTexel.x, 0.0)).rgb, n3 = texture2D(tScene, vUv - vec2(uSrcTexel.x, 0.0)).rgb;
        vec3 c = clamp(catmullRom(vUv), min(min(n0, n1), min(n2, n3)), max(max(n0, n1), max(n2, n3)));
        vec2 cuv = vUv - 0.5;
        // unsharp mask, stronger the further below full scale the frame is drawn
        vec3 hp = c - (n0 + n1 + n2 + n3) * 0.25;
        float lc = dot(c, vec3(0.3, 0.59, 0.11));
        c += hp * uSharpen / (1.0 + lc * 2.0);
        c = max(c, 0.0);

        vec3 bloom = texture2D(tBloom, vUv).rgb;
        c = mix(c, bloom, uBloom);

        c *= uExposure * uWB;
        // night: dim areas lose colour and drift blue (lamplight stays warm)
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float scot = uNightK * smoothstep(0.25, 0.0, lum);
        c = mix(c, vec3(lum * 0.75, lum * 0.9, lum * 1.35), scot * 0.6);

        vec3 t = aces(c * 1.05);
        // wet-air grade: blue-green in the shadows, faintly warm paper in the highlights, colour held back
        float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
        vec3 shadowTint = vec3(0.93, 1.0, 1.03), hiTint = vec3(1.02, 1.0, 0.96);
        t *= mix(shadowTint, hiTint, smoothstep(0.1, 0.75, l));
        t = mix(vec3(l), t, uSat);
        t *= mix(0.9, 1.0, smoothstep(0.0, 0.3, l));
        t = t + uLift * (1.0 - t);

        float v = 1.0 - dot(cuv * vec2(1.0, 0.85), cuv * vec2(1.0, 0.85)) * uVignette;
        t *= v;

        t = mix(t, uFadeCol, uFade);
        vec3 o = toSRGB(clamp(t, 0.0, 1.0));
        // film grain + dither
        float g = fract(sin(dot(vUv * 1000.0 + uTime * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
        float g2 = fract(sin(dot(vUv * 1000.0 - uTime * 3.71, vec2(39.346, 11.135))) * 24634.6345);
        o += (g + g2 - 1.0) * (uGrain + uNightK * 0.01);
        gl_FragColor = vec4(o, 1.0);
      }`,
      {
        tScene: { value: null }, tBloom: { value: null },
        uSrcTexel: { value: new THREE.Vector2() },
        uExposure: { value: 1 }, uBloom: { value: 0.04 }, uTime: { value: 0 },
        uSharpen: { value: 0.12 }, uVignette: { value: 0.42 }, uSat: { value: 0.94 }, uFade: { value: 0 }, uGrain: { value: 0.014 },
        uWB: { value: new THREE.Vector3(1, 1, 1) }, uFadeCol: { value: new THREE.Vector3(0, 0, 0) },
        uLift: { value: new THREE.Vector3(0.012, 0.014, 0.016) }, uNightK: { value: 0 },
      }
    );
  }

  setSize(w, h) {
    // the bloom chain starts at half the scene resolution
    let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.mips[i].setSize(mw, mh);
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
    this.srcW = w; this.srcH = h;
  }

  bloom(src) {
    const r = this.renderer;
    let input = src;
    for (let i = 0; i < this.levels; i++) {
      const t = this.mips[i];
      this.down.uniforms.tSrc.value = input.texture;
      this.down.uniforms.uTexel.value.set(1 / input.width, 1 / input.height);
      this.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this.fs.render(r, this.down, t);
      input = t;
    }
    for (let i = this.levels - 1; i > 0; i--) {
      const s = this.mips[i], t = this.mips[i - 1];
      this.up.uniforms.tSrc.value = s.texture;
      this.up.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this.fs.render(r, this.up, t);
    }
    return this.mips[0].texture;
  }

  final(sceneTex, bloomTex) {
    const u = this.composite.uniforms;
    u.tScene.value = sceneTex;
    u.tBloom.value = bloomTex;
    u.uSrcTexel.value.set(1 / this.srcW, 1 / this.srcH);
    this.fs.render(this.renderer, this.composite, null);
  }
}
