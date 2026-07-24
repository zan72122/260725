/**
 * view.js — レンダラーとポストプロセスの管理
 *
 * 構成:
 *   RenderPass（HDR リニア） → ブルーム → OutputPass（トーンマップ + sRGB）
 *   → FXAA（MSAA が使えないとき） → GradePass（周辺減光・色収差・粒子）
 *
 * 端末品質ティアが変わったら、パスの構成を組み直す。
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { TIER_SETTINGS } from './quality.js';

/* ------------------------------------------------------------------ */
/* 仕上げのグレーディング                                              */
/* ------------------------------------------------------------------ */

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uVignette: { value: 0.48 },
    uAberration: { value: 0.0016 },
    uGrain: { value: 0.014 },
    uSaturation: { value: 1.06 },
    uLift: { value: 0.006 },
    uWarmth: { value: 0.02 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uSaturation;
    uniform float uLift;
    uniform float uWarmth;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // 画面周辺だけ、ごくわずかに色をずらす（レンズらしさ）
      float ab = uAberration * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // 彩度をほんの少し上げる
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);

      // 影を持ち上げて、絵本のようにやわらかく
      col = col * (1.0 - uLift) + uLift * vec3(0.10, 0.085, 0.075);

      // ハイライトを少し暖色、シャドウを少し寒色へ
      col += uWarmth * vec3(l * 1.0, l * 0.55, -l * 0.35);
      col += uWarmth * vec3(-0.25, -0.05, 0.55) * (1.0 - l) * 0.5;

      // 周辺減光
      float vig = smoothstep(1.05, 0.18, r2 * 1.85);
      col *= mix(1.0, vig, uVignette);

      // かすかな粒子（バンディング防止も兼ねる）
      float g = fract(sin(dot(uv * uResolution + uTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

/* ------------------------------------------------------------------ */

export class View {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} tier
   */
  constructor(canvas, tier = 'high') {
    this.canvas = canvas;
    this.tier = tier;
    this.settings = TIER_SETTINGS[tier];
    this.width = 1;
    this.height = 1;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA はコンポーザ側の RT で行う
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES は色が寝てしまうので、彩度を保つ Khronos PBR Neutral を使う
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf6e6cd, 1);
    this.renderer = renderer;

    this.isWebGL2 = renderer.capabilities.isWebGL2;
    this.composer = null;
    this._passes = {};
  }

  /** シーンとカメラを結び付けてポストプロセスを組む */
  attach(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._buildComposer();
  }

  _buildComposer() {
    const s = this.settings;
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      for (const p of this.composer.passes) p.dispose?.();
    }

    const samples = this.isWebGL2 ? s.msaaSamples : 0;
    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(this.width * this.renderer.getPixelRatio())),
      Math.max(1, Math.floor(this.height * this.renderer.getPixelRatio())),
      {
        type: THREE.HalfFloatType,
        samples,
        colorSpace: THREE.LinearSRGBColorSpace,
      },
    );
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(this.renderer.getPixelRatio());

    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);
    this._passes.render = renderPass;

    if (s.bloom) {
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(this.width * s.bloomResolutionScale, this.height * s.bloomResolutionScale),
        0.30, // strength
        0.45, // radius
        1.00, // threshold（本当に光っているものだけを滲ませる）
      );
      composer.addPass(bloom);
      this._passes.bloom = bloom;
    } else {
      this._passes.bloom = null;
    }

    const output = new OutputPass();
    composer.addPass(output);
    this._passes.output = output;

    if (samples === 0) {
      const fxaa = new ShaderPass(FXAAShader);
      composer.addPass(fxaa);
      this._passes.fxaa = fxaa;
    } else {
      this._passes.fxaa = null;
    }

    if (s.grade) {
      const grade = new ShaderPass(GradeShader);
      composer.addPass(grade);
      this._passes.grade = grade;
    } else {
      this._passes.grade = null;
    }

    this.composer = composer;
    this._applySizes();
  }

  /** ブルームの強さを機械ごとに調整（電球やヒーターは強め） */
  setBloom({ strength, radius, threshold } = {}) {
    const b = this._passes.bloom;
    if (!b) return;
    if (strength !== undefined) b.strength = strength;
    if (radius !== undefined) b.radius = radius;
    if (threshold !== undefined) b.threshold = threshold;
  }

  setExposure(v) {
    this.renderer.toneMappingExposure = v;
  }

  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.settings = TIER_SETTINGS[tier];
    this.renderer.shadowMap.type = this.settings.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.PCFShadowMap;
    this.setSize(this.width, this.height, true);
    this._buildComposer();
  }

  /**
   * @param {number} width CSS ピクセル幅
   * @param {number} height CSS ピクセル高
   */
  setSize(width, height, force = false) {
    if (!force && width === this.width && height === this.height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.pixelRatioCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(this.width, this.height);
      this._applySizes();
    }
  }

  _applySizes() {
    const dpr = this.renderer.getPixelRatio();
    const w = this.width * dpr;
    const h = this.height * dpr;
    if (this._passes.fxaa) {
      this._passes.fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
    }
    if (this._passes.grade) {
      this._passes.grade.material.uniforms.uResolution.value.set(w, h);
    }
    if (this._passes.bloom) {
      const s = this.settings.bloomResolutionScale;
      this._passes.bloom.setSize(this.width * s, this.height * s);
    }
  }

  render(time) {
    if (this._passes.grade) this._passes.grade.material.uniforms.uTime.value = time;
    this.composer.render();
  }

  dispose() {
    this.composer?.renderTarget1.dispose();
    this.composer?.renderTarget2.dispose();
    this.renderer.dispose();
  }
}
