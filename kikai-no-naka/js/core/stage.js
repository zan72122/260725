/**
 * stage.js — 「撮影スタジオ」をつくる
 *
 * 機械そのもの以外の全部、つまり
 *   - あたたかいグラデーションの背景
 *   - 手続き的に焼いた環境マップ（金属の映り込みの元）
 *   - キー／フィル／リムの 3 灯 + 接地影
 *   - 影を受ける丸いステージ
 * をまとめて管理する。
 *
 * 環境マップは HDR ファイルを読まずに、
 * 「ソフトボックスを並べた小さなシーン」を PMREM で畳み込んで作る。
 * これで読み込み 0 バイトのまま、金属にちゃんとした映り込みが出る。
 */

import * as THREE from 'three';
import { blobShadow, radialMask } from '../lib/textures.js';
import { TIER_SETTINGS } from './quality.js';

/* ------------------------------------------------------------------ */
/* 背景シェーダ                                                        */
/* ------------------------------------------------------------------ */

const BG_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // 常に最奥
}
`;

const BG_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMiddle;
uniform vec3 uBottom;
uniform vec3 uGlowColor;
uniform float uGlowStrength;
uniform float uVignette;
varying vec3 vDir;

// バンディング防止の微細ディザ
float dither(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y * 0.5 + 0.5;

  vec3 col = mix(uBottom, uMiddle, smoothstep(0.0, 0.52, h));
  col = mix(col, uTop, smoothstep(0.46, 1.0, h));

  // 機械の背後にやわらかい光だまりを置く
  float glow = pow(max(0.0, dot(d, normalize(vec3(0.0, 0.12, 1.0)))), 3.0);
  col += uGlowColor * glow * uGlowStrength;

  // 下方向をわずかに落として、机の上に置かれた感じを出す
  col *= mix(1.0, 0.86, uVignette * smoothstep(0.35, -0.75, d.y));

  col += (dither(gl_FragCoord.xy) - 0.5) * 0.0035;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */

export class Stage {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {string} tier
   */
  constructor(renderer, tier = 'high') {
    this.renderer = renderer;
    this.tier = tier;
    this.settings = TIER_SETTINGS[tier];

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.02, 8);
    this.camera.position.set(0, 0.16, 0.62);

    /** 機械を入れる親（カメラ操作でここを回す） */
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this._buildBackground();
    this._buildLights();
    this._buildGround();
    this._buildEnvironment();
  }

  /* ---------------------------------------------------------------- */

  _buildBackground() {
    const geo = new THREE.SphereGeometry(4, 32, 24);
    this.bgUniforms = {
      uTop: { value: new THREE.Color(0xfdf4e4).convertSRGBToLinear() },
      uMiddle: { value: new THREE.Color(0xf6e6cd).convertSRGBToLinear() },
      uBottom: { value: new THREE.Color(0xe4cfae).convertSRGBToLinear() },
      uGlowColor: { value: new THREE.Color(0xffe6b8).convertSRGBToLinear() },
      uGlowStrength: { value: 0.10 },
      uVignette: { value: 0.75 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.bgUniforms,
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    });
    this.backdrop = new THREE.Mesh(geo, mat);
    this.backdrop.renderOrder = -1000;
    this.backdrop.frustumCulled = false;
    this.scene.add(this.backdrop);
  }

  /**
   * 機械ごとに背景の色味を変える。切り替えはアニメーションで滑らかに。
   */
  setBackdropTheme({ top, middle, bottom, glow, glowStrength = 0.1 }, immediate = false) {
    this._bgTarget = {
      top: new THREE.Color(top).convertSRGBToLinear(),
      middle: new THREE.Color(middle).convertSRGBToLinear(),
      bottom: new THREE.Color(bottom).convertSRGBToLinear(),
      glow: new THREE.Color(glow).convertSRGBToLinear(),
      glowStrength,
    };
    if (immediate) {
      this.bgUniforms.uTop.value.copy(this._bgTarget.top);
      this.bgUniforms.uMiddle.value.copy(this._bgTarget.middle);
      this.bgUniforms.uBottom.value.copy(this._bgTarget.bottom);
      this.bgUniforms.uGlowColor.value.copy(this._bgTarget.glow);
      this.bgUniforms.uGlowStrength.value = glowStrength;
    }
  }

  /* ---------------------------------------------------------------- */

  _buildLights() {
    this.lights = {};

    // キーライト: 右上手前から。影の主役。
    const key = new THREE.DirectionalLight(0xfff0d8, 1.55);
    key.position.set(0.34, 0.86, 0.42);
    key.castShadow = true;
    this._configureShadow(key);
    this.scene.add(key);
    this.scene.add(key.target);
    this.lights.key = key;

    // フィルライト: 左手前から弱く。影を殺しすぎない程度。
    const fill = new THREE.DirectionalLight(0xd9ecff, 0.34);
    fill.position.set(-0.55, 0.28, 0.42);
    this.scene.add(fill);
    this.lights.fill = fill;

    // リムライト: 後方上から。輪郭を光らせて立体感を出す。
    const rim = new THREE.DirectionalLight(0xffe3c0, 0.72);
    rim.position.set(-0.25, 0.5, -0.72);
    this.scene.add(rim);
    this.lights.rim = rim;

    // 下からの跳ね返り（テーブルからの反射を想定）
    const bounce = new THREE.DirectionalLight(0xffe9cf, 0.16);
    bounce.position.set(0.05, -0.6, 0.3);
    this.scene.add(bounce);
    this.lights.bounce = bounce;

    const ambient = new THREE.AmbientLight(0xffffff, 0.03);
    this.scene.add(ambient);
    this.lights.ambient = ambient;
  }

  _configureShadow(light) {
    const size = this.settings.shadowMapSize;
    light.shadow.mapSize.set(size, size);
    const d = 0.28;
    light.shadow.camera.left = -d;
    light.shadow.camera.right = d;
    light.shadow.camera.top = d;
    light.shadow.camera.bottom = -d;
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = 2.2;
    light.shadow.bias = -0.0012;
    light.shadow.normalBias = 0.006;
    light.shadow.radius = this.settings.softShadows ? 3.2 : 1;
    light.shadow.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- */

  _buildGround() {
    const group = new THREE.Group();

    // 影を受ける円形ステージ。縁はアルファでふわっと消す。
    const disc = new THREE.CircleGeometry(0.42, 96);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe7d5b6,
      roughness: 0.98,
      metalness: 0,
      transparent: true,
      alphaMap: radialMask({ size: 256, inner: 0.30, power: 1.15 }),
      depthWrite: false,
      envMapIntensity: 0.4,
    });
    const mesh = new THREE.Mesh(disc, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.renderOrder = -10;
    group.add(mesh);
    this.groundMesh = mesh;
    this.groundMaterial = mat;

    // 接地部の濃い影（レイトレ影の弱さを補う偽の AO）
    const blobMat = new THREE.MeshBasicMaterial({
      map: blobShadow({ size: 256, softness: 2.4 }),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      color: 0x6a5236,
      toneMapped: false,
    });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.0006;
    blob.renderOrder = -9;
    group.add(blob);
    this.contactShadow = blob;
    this.contactShadowMaterial = blobMat;

    this.scene.add(group);
    this.ground = group;
  }

  /** 機械ごとに接地影の大きさを合わせる */
  setContactShadow(width, depth, opacity = 0.34) {
    this.contactShadow.scale.set(width / 0.34, depth / 0.34, 1);
    this.contactShadowMaterial.opacity = opacity;
  }

  /* ---------------------------------------------------------------- */

  /**
   * ソフトボックスを並べた小さなシーンを PMREM で畳み込み、環境マップにする。
   */
  _buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();

    // 全体を包むグラデーションのドーム
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(6, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        toneMapped: false,
        uniforms: {
          uTop: { value: new THREE.Color(0xfff3e0).convertSRGBToLinear().multiplyScalar(0.85) },
          uMiddle: { value: new THREE.Color(0xf2e2c8).convertSRGBToLinear().multiplyScalar(0.65) },
          uBottom: { value: new THREE.Color(0x8f7f6a).convertSRGBToLinear().multiplyScalar(0.35) },
          uGlowColor: { value: new THREE.Color(0x000000) },
          uGlowStrength: { value: 0 },
          uVignette: { value: 0 },
        },
        vertexShader: BG_VERT.replace('gl_Position.z = gl_Position.w;', ''),
        fragmentShader: BG_FRAG,
      }),
    );
    envScene.add(dome);

    /** 板状の光源（ソフトボックス） */
    const box = (w, h, color, intensity, pos, lookAt) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(intensity),
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      m.position.set(...pos);
      m.lookAt(...(lookAt || [0, 0, 0]));
      envScene.add(m);
      return m;
    };

    // 主光源: 右上前方の大きなソフトボックス
    box(3.2, 2.4, 0xfff0d8, 2.6, [2.2, 2.6, 1.9]);
    // 補助: 左前方のやわらかい面
    box(2.6, 2.6, 0xd8ecff, 0.95, [-2.6, 1.2, 1.6]);
    // リム: 後方上のストリップ
    box(3.6, 0.7, 0xffe0b8, 1.7, [-0.8, 2.2, -2.6]);
    // 下からの跳ね返り（テーブル）
    box(5, 5, 0xffeacd, 0.42, [0, -1.6, 0], [0, 1, 0]);
    // 前方のごく弱い面（正面の映り込み）
    box(3.4, 2.6, 0xfff6e8, 1.75, [0.3, 0.55, 2.3]);
    // 左手前からの弱い返し（金属の陰側にも情報を残す）
    box(1.6, 1.6, 0xdceeff, 0.55, [-1.9, 0.3, 1.1]);

    const target = pmrem.fromScene(envScene, 0.02, 0.1, 20);
    this.envMap = target.texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.85;

    // 後始末
    dome.geometry.dispose();
    dome.material.dispose();
    envScene.traverse((o) => {
      if (o.isMesh && o !== dome) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    pmrem.dispose();
    this._envTarget = target;
  }

  /* ---------------------------------------------------------------- */

  setTier(tier) {
    this.tier = tier;
    this.settings = TIER_SETTINGS[tier];
    this._configureShadow(this.lights.key);
    this.lights.key.shadow.map?.dispose();
    this.lights.key.shadow.map = null;
  }

  update(dt) {
    // 背景色をゆっくり目標へ寄せる
    if (this._bgTarget) {
      const k = 1 - Math.exp(-2.6 * dt);
      this.bgUniforms.uTop.value.lerp(this._bgTarget.top, k);
      this.bgUniforms.uMiddle.value.lerp(this._bgTarget.middle, k);
      this.bgUniforms.uBottom.value.lerp(this._bgTarget.bottom, k);
      this.bgUniforms.uGlowColor.value.lerp(this._bgTarget.glow, k);
      this.bgUniforms.uGlowStrength.value +=
        (this._bgTarget.glowStrength - this.bgUniforms.uGlowStrength.value) * k;
    }
  }

  dispose() {
    this._envTarget?.dispose();
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
  }
}
