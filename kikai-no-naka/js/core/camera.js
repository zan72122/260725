/**
 * camera.js — さわり心地のよいカメラ操作
 *
 * 4歳児が指でぐるぐる回しても迷子にならないように:
 *   - 上下の回転は狭く制限（機械が逆さまにならない）
 *   - 左右は自由。ただし長く放置すると、ゆっくり正面へ戻る
 *   - ピンチでの拡大縮小は範囲を限定
 *   - 縦画面／横画面で UI に隠れない位置へ、フレーミングを自動調整
 */

import * as THREE from 'three';
import { DEG, clamp, damp, dampAngle, lerp, smoothstep, TAU } from '../lib/math.js';

export class CameraRig {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;

    /** 注視点（機械の中心） */
    this.target = new THREE.Vector3(0, 0.09, 0);
    this.targetGoal = this.target.clone();

    this.homeYaw = 0;
    this.homePitch = 14 * DEG;

    this.yaw = this.homeYaw;
    this.pitch = this.homePitch;
    this.yawGoal = this.yaw;
    this.pitchGoal = this.pitch;

    this.minPitch = -12 * DEG;
    this.maxPitch = 62 * DEG;

    this.fitDistance = 0.6;
    this.zoom = 1;
    this.zoomGoal = 1;
    this.minZoom = 0.72;
    this.maxZoom = 1.7;

    this.distance = this.fitDistance;

    /** 直近の操作からの経過秒 */
    this.idleTime = 0;
    /** 放置してから正面に戻り始めるまでの秒数 */
    this.autoReturnDelay = 14;
    this.autoReturnEnabled = true;

    this._viewOffset = { x: 0, y: 0, active: false };
    this._swayPhase = Math.random() * TAU;
    this._shake = 0;
    this._shakeDecay = 6;
    this._tmp = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- */
  /* フレーミング                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * 画面サイズと「UI に隠れていない領域」から、機械がぴったり収まる距離を求める。
   * @param {number} radius 機械のバウンディング球の半径
   * @param {object} rect 表示に使いたい矩形（CSS ピクセル、キャンバス左上原点）
   * @param {number} viewW キャンバス幅
   * @param {number} viewH キャンバス高
   * @param {number} margin 余白倍率
   */
  frame(radius, rect, viewW, viewH, margin = 1.18) {
    const cam = this.camera;
    cam.aspect = viewW / viewH;

    const halfVAtUnit = Math.tan((cam.fov * DEG) / 2);
    // 表示領域が画面全体に占める割合から、使える画角を求める
    const availV = halfVAtUnit * (rect.height / viewH);
    const availH = halfVAtUnit * (rect.width / viewH);
    const avail = Math.max(0.02, Math.min(availV, availH));
    this.fitDistance = (radius * margin) / avail;

    // 表示領域の中心が画面中心からどれだけずれているかを、フラスタムのオフセットで補正
    const dx = rect.x + rect.width / 2 - viewW / 2;
    const dy = rect.y + rect.height / 2 - viewH / 2;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      cam.setViewOffset(viewW, viewH, -dx, -dy, viewW, viewH);
      this._viewOffset = { x: dx, y: dy, active: true };
    } else if (this._viewOffset.active) {
      cam.clearViewOffset();
      this._viewOffset.active = false;
    }
    cam.updateProjectionMatrix();
  }

  setTarget(v, immediate = false) {
    this.targetGoal.copy(v);
    if (immediate) this.target.copy(v);
  }

  /* ---------------------------------------------------------------- */
  /* 操作                                                              */
  /* ---------------------------------------------------------------- */

  /** ドラッグ量（正規化: 画面幅 1.0 で 1 回転相当） */
  orbit(dxNorm, dyNorm) {
    this.yawGoal -= dxNorm * TAU * 0.85;
    this.pitchGoal = clamp(this.pitchGoal + dyNorm * Math.PI * 0.6, this.minPitch, this.maxPitch);
    this.idleTime = 0;
  }

  /** ピンチ倍率（>1 で近づく） */
  pinch(factor) {
    this.zoomGoal = clamp(this.zoomGoal / factor, this.minZoom, this.maxZoom);
    this.idleTime = 0;
  }

  /** 操作があったことを伝える（自動で正面に戻るのを先送りする） */
  poke() {
    this.idleTime = 0;
  }

  /** 正面へ戻す */
  home(immediate = false) {
    this.yawGoal = this.homeYaw;
    this.pitchGoal = this.homePitch;
    this.zoomGoal = 1;
    this.idleTime = 0;
    if (immediate) {
      this.yaw = this.yawGoal;
      this.pitch = this.pitchGoal;
      this.zoom = 1;
    }
  }

  /** 「ポンッ」と弾けたときの軽い揺れ */
  kick(strength = 1) {
    this._shake = Math.min(1.6, this._shake + strength);
  }

  /* ---------------------------------------------------------------- */

  update(dt, { interacting = false } = {}) {
    this.idleTime += dt;

    // 放置されたらゆっくり正面へ。急がず、気付かれない速さで。
    if (this.autoReturnEnabled && !interacting && this.idleTime > this.autoReturnDelay) {
      const k = smoothstep(this.autoReturnDelay, this.autoReturnDelay + 2.5, this.idleTime);
      this.yawGoal = dampAngle(this.yawGoal, this.homeYaw, 0.55 * k, dt);
      this.pitchGoal = lerp(this.pitchGoal, this.homePitch, 1 - Math.exp(-0.55 * k * dt));
      this.zoomGoal = lerp(this.zoomGoal, 1, 1 - Math.exp(-0.5 * k * dt));
    }

    this.yaw = dampAngle(this.yaw, this.yawGoal, 9, dt);
    this.pitch = damp(this.pitch, this.pitchGoal, 9, dt);
    this.zoom = damp(this.zoom, this.zoomGoal, 8, dt);
    this.target.lerp(this.targetGoal, 1 - Math.exp(-6 * dt));

    this.distance = damp(this.distance, this.fitDistance * this.zoom, 7, dt);

    // 待機中のごくわずかな揺らぎ。静止画に見せない。
    this._swayPhase += dt * 0.35;
    const idleAmount = smoothstep(1.2, 3.5, this.idleTime) * (interacting ? 0 : 1);
    const swayYaw = Math.sin(this._swayPhase) * 0.010 * idleAmount;
    const swayPitch = Math.sin(this._swayPhase * 0.73 + 1.1) * 0.006 * idleAmount;

    this._shake = Math.max(0, this._shake - this._shakeDecay * dt * this._shake);
    const shakeY = this._shake * Math.sin(this.idleTime * 92) * 0.004;
    const shakeX = this._shake * Math.sin(this.idleTime * 71 + 2) * 0.003;

    const y = this.yaw + swayYaw + shakeX;
    const p = this.pitch + swayPitch + shakeY;
    const cp = Math.cos(p);
    this.camera.position.set(
      this.target.x + Math.sin(y) * cp * this.distance,
      this.target.y + Math.sin(p) * this.distance,
      this.target.z + Math.cos(y) * cp * this.distance,
    );
    this.camera.lookAt(this.target);
  }

  /** 現在の視線に対して「右」方向のワールドベクトル */
  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
