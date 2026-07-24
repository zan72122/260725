/**
 * base.js — 機械の共通土台
 *
 * どの機械も次の形を守る。
 *   root ─┬─ shell : 外装。すけすけスライダーで消えていく部分
 *         └─ guts  : 中身。歯車・バネ・モーターなど、いつでも存在するもの
 *
 * 「連続的に変わる」ことがこのおもちゃの核なので、
 * 状態（回転速度・電気・熱・水位…）はすべて実数で持ち、
 * 固定ステップの update() で積分する。表示は lateUpdate() で追従させる。
 */

import * as THREE from 'three';
import { clamp01, damp } from '../lib/math.js';
import { setSpotlight, setTouchGlow, updateShellRenderState } from '../lib/xray.js';

/* ------------------------------------------------------------------ */
/* メッシュ生成の小道具                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {object} o
 */
export function mesh(geometry, material, o = {}) {
  const m = new THREE.Mesh(geometry, material);
  if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) m.rotation.set(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0);
  if (o.scale !== undefined) {
    if (typeof o.scale === 'number') m.scale.setScalar(o.scale);
    else m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.name) m.name = o.name;
  if (o.renderOrder !== undefined) m.renderOrder = o.renderOrder;
  if (o.parent) o.parent.add(m);
  return m;
}

export function group(o = {}) {
  const g = new THREE.Group();
  if (o.pos) g.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) g.rotation.set(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0);
  if (o.name) g.name = o.name;
  if (o.parent) o.parent.add(g);
  return g;
}

/** 見えないけれど指では掴める、大きめの当たり判定 */
export function hitProxy(parent, geometry, o = {}) {
  const m = new THREE.Mesh(geometry, HIT_MATERIAL);
  m.visible = false; // レイキャストは visible を見ないので、描画だけ止まる
  if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) m.rotation.set(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0);
  m.userData.isHitProxy = true;
  parent.add(m);
  return m;
}

const HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

/** 球の当たり判定を手早く付ける */
export function hitSphere(parent, radius, pos) {
  return hitProxy(parent, new THREE.SphereGeometry(radius, 10, 8), { pos });
}

/** 円柱の当たり判定（軸は Y） */
export function hitCylinder(parent, radius, height, pos, rot) {
  return hitProxy(parent, new THREE.CylinderGeometry(radius, radius, height, 12, 1), { pos, rot });
}

/**
 * 2点のあいだに棒を張る。長さと向きを毎フレーム作り直したいときに使う。
 * ジオメトリは「ローカル +Y 方向に長さ 1」であること。
 *
 * @param {THREE.Mesh} m
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 */
const _sbDir = new THREE.Vector3();
const _sbUp = new THREE.Vector3(0, 1, 0);
export function stretchBetween(m, a, b, thickness = 1) {
  _sbDir.subVectors(b, a);
  const len = _sbDir.length();
  if (len < 1e-6) {
    m.visible = false;
    return 0;
  }
  m.visible = true;
  m.position.copy(a).addScaledVector(_sbDir, 0.5);
  m.scale.set(thickness, len, thickness);
  _sbDir.divideScalar(len);
  m.quaternion.setFromUnitVectors(_sbUp, _sbDir);
  return len;
}

/* ------------------------------------------------------------------ */
/* 機械の基底クラス                                                    */
/* ------------------------------------------------------------------ */

export class Machine {
  /**
   * 各機械はこれを static meta として持つ。
   * @type {{id:string,name:string,sub:string,accent:number,backdrop:object,icon:string}}
   */
  static meta = {};

  /**
   * @param {object} ctx
   * @param {import('../lib/materials.js').MaterialLibrary} ctx.materials
   * @param {import('../core/audio.js').AudioEngine} ctx.audio
   * @param {import('../core/stage.js').Stage} ctx.stage
   * @param {string} ctx.tier
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.M = ctx.materials;
    this.audio = ctx.audio;
    this.stage = ctx.stage;
    this.tier = ctx.tier;

    this.root = new THREE.Group();
    this.shell = new THREE.Group();
    this.guts = new THREE.Group();
    this.root.add(this.guts);
    this.root.add(this.shell);

    /** @type {object[]} 指でさわれる部分 */
    this.handles = [];
    /** @type {THREE.Mesh[]} すけすけの対象になるメッシュ */
    this.shellMeshes = [];
    /** カメラのフレーミング用 */
    this.radius = 0.14;
    this.center = new THREE.Vector3(0, 0.09, 0);
    /** 接地影の大きさ */
    this.footprint = { w: 0.2, d: 0.2, opacity: 0.32 };

    /** 内部シミュレーションの固定ステップ */
    this.fixedStep = 1 / 180;
    this._accumulator = 0;
    this.time = 0;

    /** すけすけ量 0..1 */
    this.xray = 0;
    /** ハンドルごとのタッチ発光量 */
    this._glow = new Map();
  }

  /* ---------------------------------------------------------------- */
  /* 構築                                                              */
  /* ---------------------------------------------------------------- */

  /** サブクラスが実装する。root 以下に部品を並べる。 */
  build() {}

  /**
   * さわれる部分を登録する。
   * @param {object} spec
   */
  handle(spec) {
    spec.__held = 0;
    spec.glowMaterials = spec.glowMaterials || collectMaterials(spec.object);
    this.handles.push(spec);
    return spec;
  }

  /** 外装として登録（すけすけ対象） */
  addShell(object) {
    this.shell.add(object);
    object.traverse((o) => {
      if (o.isMesh && !o.userData.isHitProxy) {
        this.shellMeshes.push(o);
        o.userData.castShadowDefault = o.castShadow;
      }
    });
    return object;
  }

  /** 中身として登録 */
  addGuts(object) {
    this.guts.add(object);
    return object;
  }

  /**
   * すけすけ用マテリアルを使っているのに addShell() を通っていないメッシュを拾う。
   *
   * シェーダは差し替わっているので色だけ 0.42 倍に暗くなり、けれど
   * transparent / depthWrite が切り替わらないので、いつまでも不透明のまま残る。
   * 「中が見えるはずの場所に、黒っぽい板が 1 枚居座る」という形で出る。
   * 組み立ての順番を間違えると簡単に起きるので、最後に必ずここで掃除する。
   */
  adoptStrayShells() {
    const known = new Set(this.shellMeshes);
    this.root.traverse((o) => {
      if (!o.isMesh || o.userData.isHitProxy || known.has(o)) return;
      const mat = o.material;
      if (!mat || mat.userData?.shellBaseTransparent === undefined) return;
      known.add(o);
      this.shellMeshes.push(o);
      o.userData.castShadowDefault = o.castShadow;
    });
  }

  /* ---------------------------------------------------------------- */
  /* ループ                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * 固定ステップでシミュレーションを進め、そのあと表示を更新する。
   * @param {number} dt 実時間の経過（秒）
   */
  tick(dt) {
    this._accumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (this._accumulator >= this.fixedStep && steps < 40) {
      this.step(this.fixedStep);
      this._accumulator -= this.fixedStep;
      this.time += this.fixedStep;
      steps++;
    }
    this.lateUpdate(dt);
    this._updateGlow(dt);
  }

  /** 物理・状態の更新（固定ステップ） */
  step(dt) {} // eslint-disable-line no-unused-vars

  /** 見た目の更新（可変ステップ） */
  lateUpdate(dt) {} // eslint-disable-line no-unused-vars

  /** すけすけ量が変わったとき */
  setXray(v) {
    this.xray = clamp01(v);
    updateShellRenderState(this.shellMeshes, this.xray);
    this.onXray?.(this.xray);
  }

  _updateGlow(dt) {
    for (const h of this.handles) {
      const target = h.__held > 0 ? 1 : (h.__hover ? 0.35 : 0);
      const cur = damp(this._glow.get(h) ?? 0, target, 12, dt);
      this._glow.set(h, cur);
      for (const m of h.glowMaterials) setTouchGlow(m, cur * (h.glowScale ?? 1));
    }
  }

  /** チュートリアルで注目させる */
  spotlight(handleId, amount) {
    const h = this.handles.find((x) => x.id === handleId);
    if (!h) return;
    for (const m of h.glowMaterials) setSpotlight(m, amount);
  }

  /* ---------------------------------------------------------------- */

  /** 上部に出すメーター（アイコンと 0..1 の値） */
  meters() {
    return [];
  }

  /** 全部を初期状態へ */
  reset() {}

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine) {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      }
    });
    this.root.removeFromParent();
  }
}

/* ------------------------------------------------------------------ */

function collectMaterials(object) {
  const set = new Set();
  if (!object) return [];
  object.traverse((o) => {
    if (!o.isMesh || o.userData.isHitProxy) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m && m.userData?.isGuts) set.add(m);
  });
  return [...set];
}
