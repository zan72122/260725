/**
 * xray.js — 「すけすけ」表現の中核
 *
 * 外側のケース（shell）を、なめらかに“光るガラス”へ溶かしていくシェーダ拡張。
 * 0 のときは完全に普通の不透明な機械、1 のときは骨組みだけが見えるスケルトン。
 * 途中の値でも破綻しないよう、ディゾルブの境界に光る帯を出して連続変化を強調する。
 *
 * 実装方針:
 *   - three.js の標準マテリアルを onBeforeCompile で拡張する（PBR の質感は保つ）
 *   - uniform オブジェクトを共有参照にして、1 箇所の書き換えで全マテリアルへ伝播
 *   - 半透明時は premultipliedAlpha を使い、薄いガラスの上でもリムがしっかり光る
 */

import * as THREE from 'three';
import { clamp01 } from './math.js';

/* ------------------------------------------------------------------ */
/* 共有 uniform                                                        */
/* ------------------------------------------------------------------ */

export const xrayUniforms = {
  uXray: { value: 0 },
  uTime: { value: 0 },
  /** ゴースト面のリム色（うっすら青白い） */
  uXrayRim: { value: new THREE.Color(0x8fd8ff) },
  /** ディゾルブ境界の帯の色（魔法っぽい水色〜白） */
  uXrayEdge: { value: new THREE.Color(0xbdf3ff) },
  /** 青写真の等高線の強さ（0 で消す。平らな面ではブラインドのように見えるので控えめに） */
  uXrayLines: { value: 0.0 },

  /* --- ディゾルブは「機械ぜんたいで 1 つの波」にする ---------------- */
  /* 部品ごとのローカル座標で判定すると、小さな部品だけが一斉に消えて
     ちぐはぐになる。ワールド座標を使い、機械全体を下から上へ
     ひとつづきの波がなめらかに通り抜けるようにしている。            */
  /** 波の進む向き（ワールド） */
  uShellDissolveDir: { value: new THREE.Vector3(0.18, 1, 0.42).normalize() },
  /** 機械の中心（ワールド） */
  uShellCenter: { value: new THREE.Vector3(0, 0.07, 0) },
  /** 機械の大きさ。これで波の座標を正規化する。 */
  uShellSpan: { value: 0.17 },
  /** ゆらぎの細かさ */
  uShellNoiseScale: { value: 11.0 },
};

/**
 * 機械ごとに、すけすけの波の向き・中心・大きさを設定する。
 * @param {{dir?: THREE.Vector3, center?: THREE.Vector3, span?: number, noiseScale?: number}} o
 */
export function setShellDissolve(o = {}) {
  if (o.dir) xrayUniforms.uShellDissolveDir.value.copy(o.dir).normalize();
  if (o.center) xrayUniforms.uShellCenter.value.copy(o.center);
  if (o.span) xrayUniforms.uShellSpan.value = o.span;
  if (o.noiseScale) xrayUniforms.uShellNoiseScale.value = o.noiseScale;
}

const GLSL_NOISE = /* glsl */ `
float xrHash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.43));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float xrNoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(xrHash(i + vec3(0,0,0)), xrHash(i + vec3(1,0,0)), f.x),
        mix(xrHash(i + vec3(0,1,0)), xrHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(xrHash(i + vec3(0,0,1)), xrHash(i + vec3(1,0,1)), f.x),
        mix(xrHash(i + vec3(0,1,1)), xrHash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
`;

const VERT_PARS = /* glsl */ `
varying vec3 vXrLocal;
varying vec3 vXrWorld;
varying vec3 vXrNormalW;
varying vec3 vXrViewW;
`;

const VERT_BODY = /* glsl */ `
  vXrLocal = position;
  vec4 xrWorld = modelMatrix * vec4(transformed, 1.0);
  vXrWorld = xrWorld.xyz;
  vXrNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vXrViewW = cameraPosition - xrWorld.xyz;
`;

/* ------------------------------------------------------------------ */
/* シェル（外装）用パッチ                                              */
/* ------------------------------------------------------------------ */

const SHELL_FRAG_PARS = /* glsl */ `
uniform float uXray;
uniform float uTime;
uniform vec3 uXrayRim;
uniform vec3 uXrayEdge;
uniform float uXrayLines;
uniform float uShellSolidFloor;
uniform float uShellNoiseScale;
uniform vec3 uShellDissolveDir;
uniform vec3 uShellCenter;
uniform float uShellSpan;
varying vec3 vXrLocal;
varying vec3 vXrWorld;
varying vec3 vXrNormalW;
varying vec3 vXrViewW;
${GLSL_NOISE}
`;

const SHELL_FRAG_BODY = /* glsl */ `
{
  vec3 nrm = normalize(vXrNormalW);
  vec3 vdir = normalize(vXrViewW);
  float fres = 1.0 - abs(dot(nrm, vdir));
  float fres3 = pow(fres, 2.6);

  // ディゾルブ場: 機械ぜんたいを貫く方向のグラデーション + ゆらぎ
  vec3 rel = vXrWorld - uShellCenter;
  float grad = clamp(dot(rel, uShellDissolveDir) / uShellSpan + 0.5, 0.0, 1.0);
  float n = xrNoise(vXrWorld * uShellNoiseScale);
  float field = grad * 0.80 + n * 0.20;

  // 進行するディゾルブ前線。境界を細くして「途中でミルク状に濁る」のを避ける。
  float front = mix(-0.24, 1.24, uXray);
  float ghost = 1.0 - smoothstep(front - 0.11, front + 0.11, field);
  float band = exp(-pow((field - front) / 0.075, 2.0));
  band *= smoothstep(0.0, 0.08, uXray) * smoothstep(1.0, 0.92, uXray);

  // 透明度: 面はほぼ消え、稜線だけがガラスのように残る。
  // ghost を pow で寝かせて、少し溶け始めた時点でしっかり透けるようにする。
  float ghostAlpha = mix(0.014, 0.17, fres3) + 0.16 * pow(fres, 10.0);
  float alpha = mix(1.0, max(ghostAlpha, uShellSolidFloor), pow(ghost, 0.55));
  alpha = clamp(max(alpha, band * 0.85), 0.0, 1.0);

  // 青写真の等高線（薄い水平ライン）
  float lineWave = sin((vXrWorld.y + vXrWorld.x * 0.15) * 900.0);
  float lines = smoothstep(0.86, 1.0, lineWave) * ghost * uXrayLines;

  // 走査のきらめき
  float sweep = exp(-pow((field - fract(uTime * 0.16)) / 0.045, 2.0)) * ghost * 0.20;

  vec3 rim = uXrayRim * (fres3 * 0.50 + 0.02) * ghost;
  vec3 edge = uXrayEdge * band * 1.15;
  vec3 extra = rim + edge + uXrayEdge * (lines + sweep);

  // premultipliedAlpha なので rgb は自前で alpha を掛けてから加算光を足す。
  // もともと半透明な素材（ガラスなど）の opacity も掛け合わせる。
  float srcA = gl_FragColor.a;
  vec3 base = gl_FragColor.rgb * mix(1.0, 0.42, pow(ghost, 0.55));
  float outA = alpha * srcA;
  gl_FragColor = vec4(base * outA + extra, outA);
}
`;

/**
 * 外装マテリアルに「すけすけ」効果を仕込む。
 * @param {THREE.Material} material
 * @param {object} opts
 * @param {number} [opts.solidFloor] 透けきっても残す不透明度（0 でほぼ消える）
 *
 * 波の向き・中心・大きさは機械ごとに setShellDissolve() で決める。
 */
export function makeShellMaterial(material, opts = {}) {
  const local = {
    uShellSolidFloor: { value: opts.solidFloor ?? 0.0 },
  };

  // もともと半透明な素材（ガラス・水）は、すけすけ 0 のときも半透明のままにする
  const baseTransparent = material.transparent === true;
  material.userData.shellBaseTransparent = baseTransparent;
  material.userData.shellBaseDepthWrite = baseTransparent ? false : true;
  material.transparent = baseTransparent;
  material.depthWrite = !baseTransparent;
  material.side = THREE.DoubleSide;
  material.premultipliedAlpha = true;
  material.userData.isShell = true;
  material.userData.xrayLocal = local;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, xrayUniforms, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHELL_FRAG_PARS}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${SHELL_FRAG_BODY}`);
  };
  material.customProgramCacheKey = () => 'kikai-shell-v1';
  material.needsUpdate = true;
  return material;
}

/* ------------------------------------------------------------------ */
/* 中身（guts）用パッチ                                                */
/* ------------------------------------------------------------------ */

const GUTS_FRAG_PARS = /* glsl */ `
uniform float uXray;
uniform float uTime;
uniform vec3 uXrayRim;
uniform float uTouchGlow;
uniform vec3 uTouchColor;
uniform float uSpotlight;
varying vec3 vXrLocal;
varying vec3 vXrNormalW;
varying vec3 vXrViewW;
`;

const GUTS_FRAG_BODY = /* glsl */ `
{
  vec3 nrm = normalize(vXrNormalW);
  vec3 vdir = normalize(vXrViewW);
  float fres = pow(1.0 - abs(dot(nrm, vdir)), 3.0);

  // すけすけ時は、外装の霞にまけないよう内部部品を少し持ち上げる
  gl_FragColor.rgb *= 1.0 + uXray * 0.26;
  // 輪郭にうっすらリムを乗せて、ゴースト外装から浮き立たせる
  gl_FragColor.rgb += uXrayRim * fres * (0.12 + 0.26 * uXray);

  // さわられている部品はやわらかく発光する
  float pulse = 0.65 + 0.35 * sin(uTime * 7.0);
  gl_FragColor.rgb += uTouchColor * uTouchGlow * (0.30 + fres * 0.95) * pulse;

  // 注目させたい部品を一時的に明るくする（チュートリアル用）
  gl_FragColor.rgb *= 1.0 + uSpotlight * 0.45;
}
`;

/**
 * 内部部品のマテリアルに、リム／タッチ発光を仕込む。
 * `material.userData.touch` 経由で発光量を制御できる。
 */
export function makeGutsMaterial(material, opts = {}) {
  const local = {
    uTouchGlow: { value: 0 },
    uTouchColor: { value: new THREE.Color(opts.touchColor ?? 0xffd75e) },
    uSpotlight: { value: 0 },
  };
  material.userData.isGuts = true;
  material.userData.xrayLocal = local;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, xrayUniforms, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GUTS_FRAG_PARS}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${GUTS_FRAG_BODY}`);
  };
  material.customProgramCacheKey = () => 'kikai-guts-v1';
  material.needsUpdate = true;
  return material;
}

/** タッチ発光量を設定（0..1） */
export function setTouchGlow(material, v) {
  const l = material?.userData?.xrayLocal;
  if (l && l.uTouchGlow) l.uTouchGlow.value = clamp01(v);
}

/** チュートリアル用スポットライト量を設定（0..1） */
export function setSpotlight(material, v) {
  const l = material?.userData?.xrayLocal;
  if (l && l.uSpotlight) l.uSpotlight.value = clamp01(v);
}

/* ------------------------------------------------------------------ */
/* オーラ（さわれる部品の目印）                                        */
/* ------------------------------------------------------------------ */

const AURA_VERT = /* glsl */ `
uniform float uGrow;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 p = position + normal * uGrow;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const AURA_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float pulse = 0.60 + 0.40 * sin(uTime * 4.2);
  float a = fres * uStrength * pulse;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a * 1.6, a);
}
`;

/**
 * 部品の外側にふわっと出る光のオーラ。
 * 元メッシュの法線方向へ少し膨らませ、加算合成で描く。
 */
export function makeAuraMaterial(color = 0xffd75e) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: 0 },
      uGrow: { value: 0.004 },
      uTime: xrayUniforms.uTime,
    },
    vertexShader: AURA_VERT,
    fragmentShader: AURA_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false,
  });
  return mat;
}

/* ------------------------------------------------------------------ */
/* シェル群の状態切り替え                                              */
/* ------------------------------------------------------------------ */

/**
 * xray 値に応じて、シェルの描画状態（半透明・深度書き込み・影）を更新する。
 * シェーダ内の連続変化に加えて、ラスタ側の設定も切り替える必要があるため。
 */
export function updateShellRenderState(shellMeshes, xray) {
  const ghost = xray > 0.002;
  for (const mesh of shellMeshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || !m.userData.isShell) continue;
      const wantTransparent = ghost || m.userData.shellBaseTransparent === true;
      const wantDepthWrite = ghost ? false : m.userData.shellBaseDepthWrite !== false;
      if (m.transparent !== wantTransparent) m.transparent = wantTransparent;
      if (m.depthWrite !== wantDepthWrite) m.depthWrite = wantDepthWrite;
    }
    mesh.renderOrder = ghost ? 20 : 0;
    // ほぼ透明になったら影を落とさない（透明な壁の影は違和感になる）
    const shouldCast = xray < 0.55 && mesh.userData.castShadowDefault !== false;
    if (mesh.castShadow !== shouldCast) mesh.castShadow = shouldCast;
  }
}
