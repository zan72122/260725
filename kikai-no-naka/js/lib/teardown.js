/**
 * teardown.js — 「ばらして ならべる」しくみ
 *
 * プラモデルの ランナー（部品が ぶら下がっている わく）を まねている。
 * 0 = 組み上がった機械、1 = 平らに ならんだ ランナー。
 * とちゅうの 0.5 は 空中に 浮いた 分解図になる。
 *
 * だいじな 決めごと:
 *
 *   1. 部品は 機械の 中に いたまま 動かす。
 *      別の場所へ 付けかえると、はねが まわらなくなる。
 *      だから「いまの ワールド行列」と「ランナーの ワールド行列」を
 *      混ぜて、それを 親の ローカル座標に 戻して 書きこむ。
 *
 *   2. 抜いた部品は、ランナーの 自分の 席に 座る。
 *      つまり「ばらす」と「抜く」は 同じ 1 つの しくみで できていて、
 *      抜いた部品の 置き場所を べつに 作る必要がない。
 *
 *   3. 部品ごとの 進みぐあいは max(ぜんたいの ばらし量, 抜かれていれば 1)。
 *      ばらしを 戻しても、抜いた部品だけは 席に 残る。
 */

import * as THREE from 'three';
import { clamp, clamp01, damp, ease } from './math.js';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pp = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _ppW = new THREE.Vector3();
const _psW = new THREE.Vector3();

export class Teardown {
  /**
   * @param {import('../machines/base.js').Machine} machine
   * @param {object} o
   * @param {number} o.radius ランナーを 収める 半径
   * @param {THREE.Vector3} o.center ランナーの まん中
   */
  constructor(machine, { radius = 0.10, center = new THREE.Vector3(0, 0.09, 0) } = {}) {
    this.machine = machine;
    this.radius = radius;
    this.center = center.clone();

    /** @type {object[]} */
    this.parts = [];
    this.byId = new Map();
    /** ぜんたいの ばらし量 0..1 */
    this.spread = 0;
    this._spreadShown = 0;
    this._built = false;

    this.group = new THREE.Group();
    this.group.name = 'runner';
    machine.root.add(this.group);
  }

  /**
   * 部品を 1 つ 登録する。
   *
   * @param {object} spec
   * @param {string} spec.id
   * @param {string} spec.label よみあげる 名前
   * @param {THREE.Object3D} spec.node 動かす ノード（この下ぜんぶが 1 部品）
   * @param {boolean} [spec.removable] 抜けるか
   * @param {number} [spec.order] ランナーの ならび順（小さいほど 先）
   */
  add(spec) {
    const node = spec.node;
    const part = {
      id: spec.id,
      label: spec.label,
      node,
      removable: spec.removable !== false,
      order: spec.order ?? this.parts.length,
      removed: false,
      /** 見た目の 進みぐあい（なめらかに 追う） */
      t: 0,
      restPos: node.position.clone(),
      restQuat: node.quaternion.clone(),
      restScale: node.scale.clone(),
      slot: new THREE.Vector3(),
      slotScale: 1,
      radius: 0.01,
    };
    this.parts.push(part);
    this.byId.set(part.id, part);
    return part;
  }

  /**
   * 部品の 大きさを 測って、ランナーの 席を 決める。
   * 機械を 組み立て終わってから 1 度だけ 呼ぶ。
   */
  layout() {
    this.machine.root.updateWorldMatrix(true, true);
    // それぞれの 見かけの 大きさ（当たり判定用の 見えないメッシュは 数えない）
    for (const p of this.parts) {
      measure(p.node, _box);
      if (_box.isEmpty()) {
        p.radius = 0.006;
        p.localCenter = new THREE.Vector3();
        continue;
      }
      _box.getSize(_size);
      _box.getCenter(_center);
      p.radius = Math.max(0.004, Math.max(_size.x, _size.y, _size.z) * 0.5);
      // 席に 座らせるとき、部品の まん中が 席に 来るようにする
      p.localCenter = p.node.worldToLocal(_center.clone());
    }

    const list = [...this.parts].sort((a, b) => a.order - b.order);

    /*
     * ならべかたは 図鑑。ます目に 1 つずつ 入れる。
     *
     * 実物の 大きさの ままだと、かごや 台が 場所を ぜんぶ 取ってしまい、
     * ブラシや 軸うけが 点にしか 見えない（8 倍以上 ちがう）。
     * ここは「どんな 部品が 何個 あるか」を 見せる場なので、
     * ます目に 収まるよう 1 つずつ 拡大・縮小する。
     * 中の 機械では もちろん 実寸のまま。
     */
    const n = list.length;
    const cols = Math.max(1, Math.round(Math.sqrt(n * 1.25)));
    const rows = Math.ceil(n / cols);
    const cellW = (this.radius * 2.0) / cols;
    const cellH = Math.min(cellW, (this.radius * 2.1) / rows);

    this.cols = cols;
    this.rows = rows;
    this.cellW = cellW;
    this.cellH = cellH;

    for (let i = 0; i < n; i++) {
      const p = list[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      p.slot.set(
        this.center.x + (col - (cols - 1) / 2) * cellW,
        this.center.y - (row - (rows - 1) / 2) * cellH,
        this.center.z,
      );
      const fit = Math.min(cellW, cellH) * 0.38;
      p.slotScale = clamp(fit / p.radius, 0.16, 3.4);
    }

    this._buildFrame();
    this._built = true;
  }

  /** ランナーの わく（ます目の 枠と、部品への 短い つなぎ） */
  _buildFrame() {
    const bar = 0.0020;
    const W = this.cols * this.cellW;
    const H = this.rows * this.cellH;
    const x0 = this.center.x - W / 2;
    const y0 = this.center.y - H / 2;
    const z = this.center.z - 0.0022;
    const geos = [];

    const push = (w, h, x, y) => {
      const g = new THREE.BoxGeometry(w, h, bar);
      g.translate(x, y, z);
      geos.push(g);
    };

    for (let c = 0; c <= this.cols; c++) push(bar, H, x0 + c * this.cellW, this.center.y);
    for (let r = 0; r <= this.rows; r++) push(W, bar, this.center.x, y0 + r * this.cellH);

    // 部品を ぶら下げている ゲート
    for (const p of this.parts) {
      push(bar * 0.8, this.cellH * 0.30, p.slot.x, p.slot.y + this.cellH * 0.34);
    }

    const geo = mergeBoxes(geos);
    this.frameMesh = new THREE.Mesh(geo, this.machine.M.plain('coated', { color: 0xc3b394, roughness: 0.7 }));
    this.frameMesh.castShadow = false;
    this.frameMesh.receiveShadow = false;
    this.frameMesh.visible = false;
    this.frameMesh.material.transparent = true;
    this.frameMesh.material.opacity = 0;
    this.frameMesh.renderOrder = -1;
    this.group.add(this.frameMesh);
  }

  /* ---------------------------------------------------------------- */

  /** ぜんたいの ばらし量 */
  setSpread(v) {
    this.spread = clamp01(v);
  }

  /** 部品を 抜く／もどす */
  toggle(id) {
    const p = this.byId.get(id);
    if (!p || !p.removable) return null;
    p.removed = !p.removed;
    return p;
  }

  setRemoved(id, on) {
    const p = this.byId.get(id);
    if (!p || !p.removable) return null;
    p.removed = !!on;
    return p;
  }

  isRemoved(id) {
    return this.byId.get(id)?.removed === true;
  }

  /** 抜かれていない部品の 数 */
  countPresent(ids) {
    let n = 0;
    for (const id of ids) if (!this.isRemoved(id)) n++;
    return n;
  }

  restoreAll() {
    for (const p of this.parts) p.removed = false;
  }

  /* ---------------------------------------------------------------- */

  /**
   * 毎フレーム、機械の lateUpdate の いちばん最後に 呼ぶ。
   * （機械の アニメーションが 書いた あとに 上から かぶせる）
   */
  apply(dt) {
    if (!this._built) return;

    let maxT = 0;
    for (const p of this.parts) {
      const target = Math.max(this.spread, p.removed ? 1 : 0);
      p.t = damp(p.t, target, 9, dt);
      if (p.t < 0.0015) {
        p.t = 0;
        continue;
      }
      maxT = Math.max(maxT, p.t);
      this._place(p, ease.inOutCubic(p.t));
    }

    this._spreadShown = damp(this._spreadShown, this.spread, 9, dt);
    if (this.frameMesh) {
      const a = clamp01((this._spreadShown - 0.12) / 0.5);
      this.frameMesh.visible = a > 0.01;
      this.frameMesh.material.opacity = a * 0.85;
    }
  }

  /** 部品 1 つを、いまの場所と ランナーの席の あいだに 置く */
  _place(p, t) {
    const node = p.node;
    const parent = node.parent;
    if (!parent) return;

    parent.updateWorldMatrix(true, false);
    parent.matrixWorld.decompose(_pp, _pq, _ps);
    _pq.invert();

    // ランナーでは 部品を 機械と 同じ 向きに そろえるので、
    // 「部品の まん中を 席に 置く」ための ずらしも root 空間で 計算できる。
    const s = p.restScale.x * p.slotScale;
    _pos.copy(p.slot).addScaledVector(p.localCenter, -s);
    _pos.applyMatrix4(this.machine.root.matrixWorld);   // → ワールド
    _pos.sub(_pp).applyQuaternion(_pq).divide(_ps);     // → 親の ローカル

    // 向きは 機械の 向きに そろえる（ランナーは カメラに 正対する 板）
    this.machine.root.matrixWorld.decompose(_ppW, _quat, _psW);
    _quat.premultiply(_pq);

    node.position.lerpVectors(p.restPos, _pos, t);
    node.quaternion.copy(p.restQuat).slerp(_quat, t);
    _scale.copy(p.restScale).lerp(
      _scale.set(p.restScale.x * p.slotScale, p.restScale.y * p.slotScale, p.restScale.z * p.slotScale),
      t,
    );
    node.scale.copy(_scale);
  }
}

/* ------------------------------------------------------------------ */

/** 当たり判定用の 見えないメッシュを 除いて、部品の 大きさを 測る */
function measure(node, out) {
  out.makeEmpty();
  node.updateWorldMatrix(true, true);
  node.traverse((o) => {
    if (!o.isMesh || o.userData.isHitProxy || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _box2.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    out.union(_box2);
  });
}
const _box2 = new THREE.Box3();

function mergeBoxes(list) {
  let vertCount = 0;
  let idxCount = 0;
  for (const g of list) {
    vertCount += g.attributes.position.count;
    idxCount += g.index.count;
  }
  const pos = new Float32Array(vertCount * 3);
  const nor = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const idx = new Uint32Array(idxCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    pos.set(p, vo * 3);
    nor.set(n, vo * 3);
    uv.set(u, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
