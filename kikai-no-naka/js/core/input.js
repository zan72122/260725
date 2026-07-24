/**
 * input.js — 指でさわる／ひっぱる／とめる を実現する入力系
 *
 * 4歳児が相手なので、次の性質を最優先にしている。
 *   - 指を何本使ってもいい。片手でギヤを押さえながら、もう片方でハンドルを回せる。
 *   - どの角度から見ていても、部品の上をなぞれば必ず動く（画面上の接線に投影する）。
 *   - 空いているところをなぞればカメラが回る。2本指でつまめば拡大縮小。
 *   - 素早くはじけば勢いが残る（慣性）。
 *
 * 部品側は「ハンドル」を登録するだけでよい。
 *   { id, label, type: 'rotate'|'slide'|'press'|'grab'|'pluck', object, ... }
 */

import * as THREE from 'three';
import { RollingAverage, clamp } from '../lib/math.js';

const TAP_MAX_MS = 260;
const TAP_MAX_PX = 12;
const DOUBLE_TAP_MS = 320;

export class InputManager {
  /**
   * @param {HTMLElement} element イベントを受ける要素（キャンバス）
   * @param {THREE.Camera} camera
   * @param {import('./camera.js').CameraRig} rig
   */
  constructor(element, camera, rig) {
    this.el = element;
    this.camera = camera;
    this.rig = rig;

    /** @type {Map<number, object>} 生きているポインタ */
    this.pointers = new Map();
    /** @type {{object: THREE.Object3D, handle: object}[]} */
    this.interactives = [];

    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.001;
    this.raycaster.far = 12;

    this.enabled = true;
    this.rect = { left: 0, top: 0, width: 1, height: 1 };

    /** ハンドルが掴まれた／離されたときに呼ばれる */
    this.onGrabStart = null;
    this.onGrabEnd = null;
    this.onHandleTap = null;
    this.onBackgroundTap = null;
    this.onDoubleTap = null;
    this.onAnyInput = null;

    this._lastTapTime = 0;
    this._pinchStartDist = 0;
    this._pinchStartZoom = 1;

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._proj = new THREE.Vector3();
    this._rot = {
      contact: new THREE.Vector3(),
      radial: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      rim: new THREE.Vector3(),
      tip: new THREE.Vector3(),
      pivot: new THREE.Vector3(),
      axis: new THREE.Vector3(),
    };
    this._screenA = { x: 0, y: 0 };
    this._screenB = { x: 0, y: 0 };
    this._screenC = { x: 0, y: 0 };
    this._plane = new THREE.Plane();
    this._ndc = new THREE.Vector2();
    this._quat = new THREE.Quaternion();

    this._bind();
  }

  /* ---------------------------------------------------------------- */

  _bind() {
    const opts = { passive: false };
    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    this._onCancel = (e) => this._pointerUp(e, true);
    this._onWheel = (e) => {
      e.preventDefault();
      this.rig.pinch(Math.exp(-e.deltaY * 0.0016));
    };
    this._onContext = (e) => e.preventDefault();

    this.el.addEventListener('pointerdown', this._onDown, opts);
    window.addEventListener('pointermove', this._onMove, opts);
    window.addEventListener('pointerup', this._onUp, opts);
    window.addEventListener('pointercancel', this._onCancel, opts);
    this.el.addEventListener('wheel', this._onWheel, opts);
    this.el.addEventListener('contextmenu', this._onContext);
    // iOS Safari のピンチズーム／ダブルタップズームを抑止
    this.el.addEventListener('gesturestart', this._onContext, opts);
    this.el.addEventListener('gesturechange', this._onContext, opts);
    this.el.addEventListener('touchmove', this._onContext, opts);
  }

  dispose() {
    this.el.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onCancel);
    this.el.removeEventListener('wheel', this._onWheel);
    this.el.removeEventListener('contextmenu', this._onContext);
    this.el.removeEventListener('gesturestart', this._onContext);
    this.el.removeEventListener('gesturechange', this._onContext);
    this.el.removeEventListener('touchmove', this._onContext);
  }

  updateRect() {
    const r = this.el.getBoundingClientRect();
    this.rect = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
  }

  /** 機械が入れ替わったら、掴めるものを登録し直す */
  setInteractives(list) {
    this.releaseAll();
    this.interactives = list || [];
    for (const entry of this.interactives) {
      entry.object.traverse((o) => {
        o.userData.__handle = entry.handle;
      });
    }
  }

  releaseAll() {
    for (const p of this.pointers.values()) this._endPointer(p, true);
    this.pointers.clear();
  }

  get isInteracting() {
    return this.pointers.size > 0;
  }

  /** いま何かの部品を掴んでいるか */
  get isHoldingPart() {
    for (const p of this.pointers.values()) if (p.handle) return true;
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* 座標変換                                                          */
  /* ---------------------------------------------------------------- */

  _toLocal(e) {
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  }

  _setRayFromLocal(x, y) {
    this._ndc.set((x / this.rect.width) * 2 - 1, -(y / this.rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
  }

  /** ワールド座標 → キャンバス上の CSS ピクセル座標 */
  worldToScreen(v, out = { x: 0, y: 0 }) {
    this._proj.copy(v).project(this.camera);
    out.x = (this._proj.x * 0.5 + 0.5) * this.rect.width;
    out.y = (-this._proj.y * 0.5 + 0.5) * this.rect.height;
    return out;
  }

  _pick(x, y) {
    if (this.interactives.length === 0) return null;
    this._setRayFromLocal(x, y);
    const objects = this.interactives.map((i) => i.object);
    const hits = this.raycaster.intersectObjects(objects, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o) {
        if (o.userData.__handle) return { handle: o.userData.__handle, point: hit.point.clone(), distance: hit.distance };
        o = o.parent;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* ポインタ処理                                                      */
  /* ---------------------------------------------------------------- */

  _pointerDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.updateRect();
    const { x, y } = this._toLocal(e);
    this.el.setPointerCapture?.(e.pointerId);
    this.onAnyInput?.();

    const now = performance.now();
    const hit = this._pick(x, y);

    /** @type {any} */
    const p = {
      id: e.pointerId,
      startX: x,
      startY: y,
      x,
      y,
      lastX: x,
      lastY: y,
      startTime: now,
      moved: 0,
      handle: null,
      mode: 'orbit',
      angVel: new RollingAverage(5),
      lastMoveTime: now,
    };

    if (hit) {
      this._beginHandle(p, hit);
    } else {
      // 空いているところ: 1本目はカメラ回転、2本目はピンチへ
      const orbiting = [...this.pointers.values()].filter((q) => q.mode === 'orbit' || q.mode === 'pinch');
      if (orbiting.length >= 1) {
        p.mode = 'pinch';
        const other = orbiting[0];
        other.mode = 'pinch';
        this._pinchStartDist = Math.hypot(x - other.x, y - other.y) || 1;
        this._pinchStartZoom = this.rig.zoomGoal;
      }
      this.rig.poke();
    }

    this.pointers.set(e.pointerId, p);
  }

  _beginHandle(p, hit) {
    const h = hit.handle;
    p.handle = h;
    p.mode = h.type;
    p.hitPoint = hit.point;
    p.pluckedIds = new Set();

    const pivot = this._handlePivot(h, this._v1);
    const axis = this._handleAxis(h, this._v2);

    if (h.type === 'rotate') {
      // 掴んだ点を、回転体のローカル座標で覚えておく（部品が回っても指が追従する）
      const owner = h.axisObject || h.object;
      p.localGrab = owner.worldToLocal(hit.point.clone());
      p.owner = owner;
      p.accum = 0;
    } else if (h.type === 'slide') {
      // カメラに正対する平面を作り、その上で指を追う
      this.camera.getWorldDirection(this._v3);
      this._plane.setFromNormalAndCoplanarPoint(this._v3, hit.point);
      p.slidePlane = this._plane.clone();
      p.slideStart = hit.point.clone();
      p.slideAxis = axis.clone();
      p.slideValue0 = h.getValue ? h.getValue() : 0;
    }
    void pivot;

    h.__held = (h.__held || 0) + 1;
    if (h.type === 'press') h.onPress?.();
    if (h.type === 'grab') h.onGrab?.();
    if (h.type === 'pluck') {
      h.onPluck?.(hit.point);
      p.pluckedIds.add(h.id);
    }
    this.onGrabStart?.(h, hit.point);
    this.rig.poke();
  }

  _handlePivot(h, out) {
    if (!h.pivot) return h.object.getWorldPosition(out);
    if (h.pivot.isVector3) return out.copy(h.pivot);
    return h.pivot.getWorldPosition(out);
  }

  _handleAxis(h, out) {
    const local = h.axis || new THREE.Vector3(0, 1, 0);
    out.copy(local);
    const owner = h.axisObject || h.object;
    if (owner) {
      owner.getWorldQuaternion(this._quat);
      out.applyQuaternion(this._quat);
    }
    return out.normalize();
  }

  _pointerMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.enabled) return;
    e.preventDefault();
    const { x, y } = this._toLocal(e);
    const dx = x - p.lastX;
    const dy = y - p.lastY;
    p.moved += Math.hypot(dx, dy);
    p.x = x;
    p.y = y;
    const now = performance.now();
    const dt = Math.max(0.001, (now - p.lastMoveTime) / 1000);
    p.lastMoveTime = now;
    this.onAnyInput?.();

    switch (p.mode) {
      case 'orbit':
        this.rig.orbit(dx / this.rect.width, dy / this.rect.height);
        break;
      case 'pinch':
        this._updatePinch();
        break;
      case 'rotate':
        this._updateRotate(p, dx, dy, dt);
        break;
      case 'slide':
        this._updateSlide(p, x, y);
        break;
      case 'pluck':
        this._updatePluck(p, x, y);
        break;
      case 'grab':
      case 'press':
      default:
        this.rig.poke();
        break;
    }

    p.lastX = x;
    p.lastY = y;
  }

  _updatePinch() {
    const list = [...this.pointers.values()].filter((q) => q.mode === 'pinch');
    if (list.length < 2) return;
    const [a, b] = list;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    this.rig.zoomGoal = clamp(
      this._pinchStartZoom * (this._pinchStartDist / d),
      this.rig.minZoom,
      this.rig.maxZoom,
    );
    this.rig.poke();
  }

  /**
   * 回転ハンドル。
   * 掴んだ点の「回転方向の接線」を画面に投影し、指の動きをそこへ射影して角度に直す。
   * こうすると、真横から見ていても真正面から見ていても同じように回せる。
   */
  _updateRotate(p, dx, dy, dt) {
    const h = p.handle;
    const S = this._rot;
    const pivot = this._handlePivot(h, S.pivot);
    const axis = this._handleAxis(h, S.axis);

    // 現在の接触点（部品と一緒に回っている）
    const contact = S.contact.copy(p.localGrab);
    p.owner.localToWorld(contact);
    // 軸に垂直な半径ベクトル
    const radial = S.radial.subVectors(contact, pivot);
    radial.addScaledVector(axis, -axis.dot(radial));
    let r = radial.length();
    if (r < 1e-5) {
      // 軸のちょうど真上を掴んだ場合の保険
      radial.set(1, 0, 0).addScaledVector(axis, -axis.x);
      if (radial.lengthSq() < 1e-8) radial.set(0, 1, 0).addScaledVector(axis, -axis.y);
      radial.normalize();
      r = 0.004;
    } else {
      radial.divideScalar(r);
    }

    const tangent = S.tangent.copy(axis).cross(radial).normalize();

    // 画面上での半径と接線方向
    const pPivot = this.worldToScreen(pivot, this._screenA);
    const rimWorld = S.rim.copy(pivot).addScaledVector(radial, r);
    const pRim = this.worldToScreen(rimWorld, this._screenB);
    const tipWorld = S.tip.copy(rimWorld).addScaledVector(tangent, r * 0.5);
    const pTan = this.worldToScreen(tipWorld, this._screenC);

    let tx = pTan.x - pRim.x;
    let ty = pTan.y - pRim.y;
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-4) return;
    tx /= tl;
    ty /= tl;

    // 極端に小さく見えているときに感度が跳ね上がらないよう下限を設ける
    const radiusPx = Math.max(Math.hypot(pRim.x - pPivot.x, pRim.y - pPivot.y), 26);

    const arc = dx * tx + dy * ty;
    let dAngle = (arc / radiusPx) * (h.gain ?? 1);
    dAngle = clamp(dAngle, -0.7, 0.7);

    p.accum += dAngle;
    p.angVel.push(dAngle / dt);
    h.onRotate?.(dAngle, { velocity: p.angVel.value, total: p.accum });
    this.rig.poke();
  }

  _updateSlide(p, x, y) {
    const h = p.handle;
    this._setRayFromLocal(x, y);
    const hit = this.raycaster.ray.intersectPlane(p.slidePlane, this._v3);
    if (!hit) return;
    const delta = hit.sub(p.slideStart).dot(p.slideAxis);
    h.onSlide?.(delta, { value0: p.slideValue0 });
    this.rig.poke();
  }

  /** 指をすべらせて次々に部品をはじく（オルゴールの櫛など） */
  _updatePluck(p, x, y) {
    const hit = this._pick(x, y);
    if (hit && hit.handle.type === 'pluck' && !p.pluckedIds.has(hit.handle.id)) {
      p.pluckedIds.add(hit.handle.id);
      hit.handle.onPluck?.(hit.point);
      this.onGrabStart?.(hit.handle, hit.point);
    }
    this.rig.poke();
  }

  _pointerUp(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault?.();
    this.el.releasePointerCapture?.(e.pointerId);
    this._endPointer(p, cancelled);
    this.pointers.delete(e.pointerId);

    // ピンチの片方が離れたら、残りは通常のカメラ回転へ戻す
    const rest = [...this.pointers.values()].filter((q) => q.mode === 'pinch');
    if (rest.length === 1) rest[0].mode = 'orbit';
  }

  _endPointer(p, cancelled) {
    const h = p.handle;
    const now = performance.now();
    const isTap = !cancelled && now - p.startTime < TAP_MAX_MS && p.moved < TAP_MAX_PX;

    if (h) {
      h.__held = Math.max(0, (h.__held || 1) - 1);
      if (h.type === 'press') h.onRelease?.();
      if (h.type === 'grab') h.onRelease?.();
      if (h.type === 'rotate') {
        const v = cancelled ? 0 : p.angVel.value;
        h.onFling?.(clamp(v, -80, 80));
      }
      if (h.type === 'slide') h.onSlideEnd?.();
      if (isTap) {
        h.onTap?.();
        this.onHandleTap?.(h);
      }
      this.onGrabEnd?.(h);
    } else if (isTap) {
      if (now - this._lastTapTime < DOUBLE_TAP_MS) {
        this.onDoubleTap?.();
        this._lastTapTime = 0;
      } else {
        this._lastTapTime = now;
        this.onBackgroundTap?.(p);
      }
    }
  }
}
