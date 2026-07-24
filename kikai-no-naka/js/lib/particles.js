/**
 * particles.js — 目に見えないもの（風・水・電気）を見せる粒
 *
 * 進行方向に伸びた「すじ」として描くことで、
 * ただの点より速さと向きが分かりやすくなる。
 *
 * 実装は InstancedMesh + 自前シェーダ。
 * 位置と速度は CPU で更新し、毎フレーム属性を送る。
 * 数百〜千個程度なら iPad でも余裕がある。
 */

import * as THREE from 'three';
import { makeRandom } from './math.js';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec2 iLife;   // x: 経過, y: 寿命
attribute vec2 iShape;  // x: 大きさ, y: 乱数シード

uniform float uStretch;
uniform float uWidth;
uniform float uMinLength;

varying vec2 vUvP;
varying float vFade;
varying float vSeed;

void main() {
  float age = iLife.x;
  float life = iLife.y;
  float alive = step(0.0, age) * step(age, life);
  float t = life > 0.0 ? clamp(age / life, 0.0, 1.0) : 1.0;

  // 生まれた直後と消える直前をなめらかに
  vFade = alive * smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.68, t);
  vSeed = iShape.y;
  vUvP = uv;

  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec3 velView = (modelViewMatrix * vec4(iVel, 0.0)).xyz;

  float speed = length(velView.xy);
  vec2 dir = speed > 1e-6 ? velView.xy / speed : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float size = iShape.x;
  float len = max(uMinLength, speed * uStretch) * size;
  float wid = uWidth * size;

  vec2 offset = dir * ((uv.y - 0.5) * len) + perp * ((uv.x - 0.5) * wid);
  mv.xy += offset * alive;

  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uOpacity;
uniform float uSoftness;
varying vec2 vUvP;
varying float vFade;
varying float vSeed;

void main() {
  vec2 p = (vUvP - 0.5) * 2.0;
  // 縦に伸びたカプセル状の減衰
  float d = length(vec2(p.x, p.y * 0.55));
  float a = pow(max(0.0, 1.0 - d), uSoftness) * vFade * uOpacity;
  if (a < 0.004) discard;
  vec3 col = mix(uColor, uColor2, fract(vSeed * 7.31));
  gl_FragColor = vec4(col, a);
}
`;

export class ParticleField {
  /**
   * @param {object} o
   * @param {number} o.count 最大個数
   * @param {number} [o.stretch] 速度に応じて伸びる量
   * @param {number} [o.width] すじの太さ
   * @param {number} [o.minLength] 静止時の長さ
   * @param {number|string} [o.color]
   * @param {number|string} [o.color2] もう一方の色（粒ごとに混ざる）
   * @param {THREE.Blending} [o.blending]
   */
  constructor(o = {}) {
    this.count = o.count ?? 512;
    this.rand = makeRandom(o.seed ?? 12345);

    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.lives = new Float32Array(this.count * 2);
    this.shapes = new Float32Array(this.count * 2);
    this._cursor = 0;
    this.activeCount = 0;

    for (let i = 0; i < this.count; i++) {
      this.lives[i * 2] = -1; // 未使用
      this.lives[i * 2 + 1] = 1;
      this.shapes[i * 2] = 1;
      this.shapes[i * 2 + 1] = this.rand();
    }

    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    geo.attributes.normal = base.attributes.normal;
    geo.instanceCount = this.count;

    this.aPos = new THREE.InstancedBufferAttribute(this.positions, 3);
    this.aVel = new THREE.InstancedBufferAttribute(this.velocities, 3);
    this.aLife = new THREE.InstancedBufferAttribute(this.lives, 2);
    this.aShape = new THREE.InstancedBufferAttribute(this.shapes, 2);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aVel.setUsage(THREE.DynamicDrawUsage);
    this.aLife.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iLife', this.aLife);
    geo.setAttribute('iShape', this.aShape);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), o.bounds ?? 0.6);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
        uColor2: { value: new THREE.Color(o.color2 ?? o.color ?? 0xffffff) },
        uOpacity: { value: o.opacity ?? 0.5 },
        uStretch: { value: o.stretch ?? 0.05 },
        uWidth: { value: o.width ?? 0.004 },
        uMinLength: { value: o.minLength ?? 0.004 },
        uSoftness: { value: o.softness ?? 1.6 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: o.blending ?? THREE.NormalBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder ?? 5;
    this.geometry = geo;
    this._baseGeometry = base;
  }

  get object() {
    return this.mesh;
  }

  setOpacity(v) {
    this.material.uniforms.uOpacity.value = v;
  }

  /**
   * 粒を 1 つ出す。
   * @param {THREE.Vector3|number[]} pos
   * @param {THREE.Vector3|number[]} vel
   * @param {number} life 秒
   * @param {number} size
   */
  emit(pos, vel, life, size = 1) {
    // 使い回し: いちばん古いスロットから順に上書きする
    let idx = -1;
    for (let k = 0; k < this.count; k++) {
      const i = (this._cursor + k) % this.count;
      const l = this.lives[i * 2];
      if (l < 0 || l >= this.lives[i * 2 + 1]) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = this._cursor % this.count;
    this._cursor = (idx + 1) % this.count;

    const px = pos.isVector3 ? pos.x : pos[0];
    const py = pos.isVector3 ? pos.y : pos[1];
    const pz = pos.isVector3 ? pos.z : pos[2];
    const vx = vel.isVector3 ? vel.x : vel[0];
    const vy = vel.isVector3 ? vel.y : vel[1];
    const vz = vel.isVector3 ? vel.z : vel[2];

    this.positions[idx * 3] = px;
    this.positions[idx * 3 + 1] = py;
    this.positions[idx * 3 + 2] = pz;
    this.velocities[idx * 3] = vx;
    this.velocities[idx * 3 + 1] = vy;
    this.velocities[idx * 3 + 2] = vz;
    this.lives[idx * 2] = 0;
    this.lives[idx * 2 + 1] = life;
    this.shapes[idx * 2] = size;
    this.aShape.needsUpdate = true;
    return idx;
  }

  /**
   * 全粒を進める。
   * @param {number} dt
   * @param {(i:number, px:number, py:number, pz:number, vx:number, vy:number, vz:number, out:Float32Array)=>void} [force]
   *        速度を書き換えるコールバック（out に新しい速度を入れる）
   */
  update(dt, force) {
    const P = this.positions;
    const V = this.velocities;
    const L = this.lives;
    const out = this._forceOut || (this._forceOut = new Float32Array(3));
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      const age = L[i * 2];
      if (age < 0) continue;
      const life = L[i * 2 + 1];
      if (age >= life) {
        L[i * 2] = -1;
        continue;
      }
      L[i * 2] = age + dt;
      alive++;
      const i3 = i * 3;
      if (force) {
        out[0] = V[i3];
        out[1] = V[i3 + 1];
        out[2] = V[i3 + 2];
        force(i, P[i3], P[i3 + 1], P[i3 + 2], V[i3], V[i3 + 1], V[i3 + 2], out, dt);
        V[i3] = out[0];
        V[i3 + 1] = out[1];
        V[i3 + 2] = out[2];
      }
      P[i3] += V[i3] * dt;
      P[i3 + 1] += V[i3 + 1] * dt;
      P[i3 + 2] += V[i3 + 2] * dt;
    }
    this.activeCount = alive;
    this.aPos.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aLife.needsUpdate = true;
  }

  killAll() {
    for (let i = 0; i < this.count; i++) this.lives[i * 2] = -1;
    this.aLife.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this._baseGeometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/* ------------------------------------------------------------------ */
/* 吹き流し（風の筋を大きく見せる）                                    */
/* ------------------------------------------------------------------ */

/**
 * バネで繋がった質点の列。風を受けてなびく。
 * 見た目は geometry.js の makeRibbon で帯にする。
 */
export class Streamer {
  /**
   * @param {THREE.Vector3} anchor 根元（ワールド／親ローカル）
   * @param {number} count 節の数
   * @param {number} spacing 節の間隔
   */
  constructor(anchor, count = 18, spacing = 0.009) {
    this.anchor = anchor.clone();
    this.spacing = spacing;
    this.points = [];
    this.prev = [];
    for (let i = 0; i < count; i++) {
      const p = anchor.clone();
      p.y -= i * spacing;
      this.points.push(p);
      this.prev.push(p.clone());
    }
    this._tmp = new THREE.Vector3();
  }

  /**
   * ベルレ積分 + 距離拘束。
   * @param {number} dt
   * @param {(pos: THREE.Vector3, out: THREE.Vector3) => void} windAt 位置での風速を返す
   */
  update(dt, windAt) {
    const damping = 0.965;
    const gravity = -0.55;
    const step = Math.min(dt, 1 / 60);

    for (let i = 1; i < this.points.length; i++) {
      const p = this.points[i];
      const prev = this.prev[i];
      const vx = (p.x - prev.x) * damping;
      const vy = (p.y - prev.y) * damping;
      const vz = (p.z - prev.z) * damping;
      prev.copy(p);

      this._tmp.set(0, 0, 0);
      if (windAt) windAt(p, this._tmp);
      // 先端ほど風の影響を受ける
      const w = 0.25 + (i / this.points.length) * 0.85;
      const h2 = step * step;
      p.x += vx + this._tmp.x * w * h2;
      p.y += vy + (gravity + this._tmp.y * w) * h2;
      p.z += vz + this._tmp.z * w * h2;
    }
    this.points[0].copy(this.anchor);

    // 長さを保つ
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.points.length - 1; i++) {
        const a = this.points[i];
        const b = this.points[i + 1];
        this._tmp.subVectors(b, a);
        const d = this._tmp.length() || 1e-6;
        const diff = (d - this.spacing) / d;
        const k = i === 0 ? 1 : 0.5;
        if (i > 0) a.addScaledVector(this._tmp, diff * 0.5);
        b.addScaledVector(this._tmp, -diff * k);
      }
    }
  }

  reset() {
    for (let i = 0; i < this.points.length; i++) {
      this.points[i].copy(this.anchor);
      this.points[i].y -= i * this.spacing;
      this.prev[i].copy(this.points[i]);
    }
  }
}
