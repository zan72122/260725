/**
 * geometry.js — 機械部品のジオメトリを手続き的につくる
 *
 * 3D モデルファイルを使わず、歯車・バネ・シャフト・羽根などを
 * すべてコードから生成する。寸法はメートル系（機械の全高がおよそ 0.3）。
 *
 * 設計方針:
 *   - 「見て分かる」形を優先。歯は本物のインボリュート曲線で作り、
 *     面取り（ベベル）を必ず入れて稜線に光を乗せる。
 *   - 円筒系は LatheGeometry のプロファイルで作り、角に必ず C 面を付ける。
 *   - 生成したジオメトリは呼び出し側が dispose する。
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, clamp, lerp } from './math.js';

export { RoundedBoxGeometry, mergeGeometries, toCreasedNormals };

/**
 * ジオメトリをまとめる。インデックスの有無が混在していても壊れないよう、
 * 片方でも非インデックスなら全部を非インデックス化してから結合する。
 * （toCreasedNormals() が非インデックスを返すため、素の mergeGeometries は失敗しやすい）
 */
export function mergeAll(list) {
  const geos = list.filter(Boolean);
  if (geos.length === 0) return new THREE.BufferGeometry();
  if (geos.length === 1) return geos[0];
  const anyNonIndexed = geos.some((g) => g.index === null);
  const prepared = geos.map((g) => {
    let out = g;
    if (anyNonIndexed && g.index !== null) out = g.toNonIndexed();
    // 属性の並びを position/normal/uv に揃える
    if (!out.attributes.uv) {
      const count = out.attributes.position.count;
      out = out === g ? out.clone() : out;
      out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    return out;
  });
  const merged = mergeGeometries(prepared);
  prepared.forEach((p, i) => {
    if (p !== geos[i]) p.dispose();
  });
  if (!merged) {
    console.warn('geometry: mergeAll に失敗しました');
    return geos[0];
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* 汎用ヘルパー                                                        */
/* ------------------------------------------------------------------ */

/**
 * 折れ線の角を丸める。歯車の歯元フィレットや板金の角に使う。
 * @param {THREE.Vector2[]} pts 閉じた折れ線（末尾と先頭は繋がっている扱い）
 * @param {number} radius 目標フィレット半径
 * @param {number} segments 1 角あたりの分割数
 * @param {number} minAngle これより緩い角は丸めない（ラジアン）
 */
export function roundCorners(pts, radius, segments = 3, minAngle = 0.18) {
  const n = pts.length;
  if (n < 3 || radius <= 0) return pts;
  const out = [];
  const a = new THREE.Vector2();
  const b = new THREE.Vector2();

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];

    a.subVectors(prev, cur);
    b.subVectors(next, cur);
    const la = a.length();
    const lb = b.length();
    if (la < 1e-7 || lb < 1e-7) {
      out.push(cur.clone());
      continue;
    }
    a.divideScalar(la);
    b.divideScalar(lb);
    const cosT = clamp(a.dot(b), -1, 1);
    const theta = Math.acos(cosT);
    // ほぼ直線なら丸めない
    if (Math.PI - theta < minAngle) {
      out.push(cur.clone());
      continue;
    }
    const tanHalf = Math.tan(theta / 2);
    let dist = radius / Math.max(tanHalf, 1e-4);
    dist = Math.min(dist, la * 0.48, lb * 0.48);
    const p0 = cur.clone().addScaledVector(a, dist);
    const p1 = cur.clone().addScaledVector(b, dist);
    // 2次ベジエで角を置き換える
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const it = 1 - t;
      out.push(
        new THREE.Vector2(
          it * it * p0.x + 2 * it * t * cur.x + t * t * p1.x,
          it * it * p0.y + 2 * it * t * cur.y + t * t * p1.y,
        ),
      );
    }
  }
  return out;
}

/** 押し出しジオメトリの天面 UV を、指定半径で 0..1 に正規化する */
function radialUVGenerator(radius) {
  const inv = 1 / (radius * 2);
  return {
    generateTopUV(geometry, vertices, ia, ib, ic) {
      const uv = [];
      for (const i of [ia, ib, ic]) {
        uv.push(new THREE.Vector2(vertices[i * 3] * inv + 0.5, vertices[i * 3 + 1] * inv + 0.5));
      }
      return uv;
    },
    generateSideWallUV(geometry, vertices, ia, ib, ic, id) {
      const uv = [];
      for (const i of [ia, ib, ic, id]) {
        const x = vertices[i * 3];
        const y = vertices[i * 3 + 1];
        const z = vertices[i * 3 + 2];
        uv.push(new THREE.Vector2(Math.atan2(y, x) / TAU + 0.5, z * inv * 4));
      }
      return uv;
    },
  };
}

/**
 * 断面プロファイルを回転させて円筒系の部品を作る。
 * @param {[number, number][]} profile [半径, 高さ] の配列（下から上へ）
 * @param {object} opts
 */
export function lathe(profile, { segments = 48, creaseAngle = 0.6, center = true } = {}) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-5), y));
  let geo = new THREE.LatheGeometry(pts, segments);
  if (center) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    geo.translate(0, -(minY + maxY) / 2, 0);
  }
  geo = toCreasedNormals(geo, creaseAngle);
  return geo;
}

/**
 * 角を C 面取りした円柱。シャフト・ハブ・ボスなど、機械らしさの基本形。
 */
export function chamferedCylinder(radius, height, chamfer = 0.0015, segments = 40) {
  const c = Math.min(chamfer, radius * 0.4, height * 0.4);
  const h = height / 2;
  return lathe(
    [
      [0, -h],
      [radius - c, -h],
      [radius, -h + c],
      [radius, h - c],
      [radius - c, h],
      [0, h],
    ],
    { segments, center: false },
  );
}

/** 中空の管（パイプ・スリーブ） */
export function pipe(outerR, innerR, height, { segments = 40, chamfer = 0.0008 } = {}) {
  const c = Math.min(chamfer, (outerR - innerR) * 0.35, height * 0.3);
  const h = height / 2;
  return lathe(
    [
      [innerR, -h],
      [outerR - c, -h],
      [outerR, -h + c],
      [outerR, h - c],
      [outerR - c, h],
      [innerR, h],
      [innerR, -h],
    ],
    { segments, center: false },
  );
}

/** ワッシャ／リング（面取りつき） */
export function ring(outerR, innerR, thickness, segments = 48) {
  return pipe(outerR, innerR, thickness, { segments, chamfer: thickness * 0.25 });
}

/* ------------------------------------------------------------------ */
/* 歯車                                                                */
/* ------------------------------------------------------------------ */

/**
 * インボリュート歯形の輪郭（頂点列）だけを作る。
 * 平歯車にも、内歯車（リングギヤ）にも使いまわす。
 *
 * @param {object} o
 * @returns {{points: THREE.Vector2[], pitchR: number, tipR: number, rootR: number, baseR: number}}
 */
export function gearOutline({ teeth, module: m, pressureAngle = 20 * (Math.PI / 180), profileSteps = 7 }) {
  const pitchR = (m * teeth) / 2;
  const baseR = pitchR * Math.cos(pressureAngle);
  const tipR = pitchR + m * 1.0;
  const rootR = Math.max(pitchR - m * 1.25, m * 0.25);
  const startR = Math.max(baseR, rootR);

  const invAt = (r) => {
    if (r <= baseR) return 0;
    const a = Math.acos(clamp(baseR / r, -1, 1));
    return Math.tan(a) - a;
  };
  const halfBase = Math.PI / (2 * teeth) + invAt(pitchR);
  const flankAngle = (r) => halfBase - invAt(r);

  /** @type {THREE.Vector2[]} */
  const pts = [];
  const push = (r, ang) => pts.push(new THREE.Vector2(Math.cos(ang) * r, Math.sin(ang) * r));

  const step = TAU / teeth;
  for (let k = 0; k < teeth; k++) {
    const c = k * step;

    // 歯元の谷 → 右フランクの立ち上がり
    if (rootR < startR) push(rootR, c - flankAngle(startR) - 0.012);
    // 右フランク（外向き）
    for (let i = 0; i <= profileSteps; i++) {
      const t = i / profileSteps;
      const r = lerp(startR, tipR, t * t * 0.35 + t * 0.65); // 先端側を細かく
      push(r, c - flankAngle(r));
    }
    // 歯先の円弧
    const ta = flankAngle(tipR);
    for (let i = 1; i < 3; i++) push(tipR, c - ta + (2 * ta * i) / 3);
    // 左フランク（内向き）
    for (let i = profileSteps; i >= 0; i--) {
      const t = i / profileSteps;
      const r = lerp(startR, tipR, t * t * 0.35 + t * 0.65);
      push(r, c + flankAngle(r));
    }
    if (rootR < startR) push(rootR, c + flankAngle(startR) + 0.012);

    // 歯底の円弧（次の歯まで）
    const a0 = c + flankAngle(startR) + 0.012;
    const a1 = c + step - flankAngle(startR) - 0.012;
    const arcSteps = 3;
    for (let i = 1; i < arcSteps; i++) push(rootR, lerp(a0, a1, i / arcSteps));
  }

  return { points: pts, pitchR, tipR, rootR, baseR };
}

/**
 * インボリュート歯形の平歯車。
 *
 * @param {object} o
 * @param {number} o.teeth 歯数
 * @param {number} o.module モジュール（ピッチ円直径 = module * teeth）
 * @param {number} o.thickness 歯幅
 * @param {number} [o.bore] 軸穴の半径（0 で穴なし）
 * @param {number} [o.hub] ハブ（軸まわりの厚い部分）の半径
 * @param {number} [o.hubHeight] ハブの張り出し
 * @param {number} [o.spokes] スポーク数（0 で無垢の円板）
 * @param {number} [o.web] スポーク部の薄板の厚み比（0..1）
 * @param {number} [o.pressureAngle] 圧力角
 */
export function gearGeometry(o) {
  const {
    teeth,
    module: m,
    thickness,
    bore = 0,
    hub = 0,
    hubHeight = 0,
    spokes = 0,
    pressureAngle = 20 * (Math.PI / 180),
    profileSteps = 7,
  } = o;

  const { points: pts, pitchR, tipR, rootR } = gearOutline({
    teeth, module: m, pressureAngle, profileSteps,
  });

  const rounded = roundCorners(pts, m * 0.22, 2, 0.28);
  const shape = new THREE.Shape(rounded);

  // 穴（軸穴・肉抜き）
  if (bore > 0) shape.holes.push(circleHole(bore, 32));
  if (spokes > 0) {
    const rIn = Math.max(bore, hub) + m * 0.55;
    const rOut = rootR - m * 0.5;
    if (rOut - rIn > m * 0.7) {
      for (let s = 0; s < spokes; s++) {
        shape.holes.push(spokeHole(rIn, rOut, (s / spokes) * TAU, spokes, m));
      }
    }
  }

  const bevel = Math.min(m * 0.16, thickness * 0.3);
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 12,
    steps: 1,
    UVGenerator: radialUVGenerator(tipR),
  });
  geo.translate(0, 0, -(thickness - bevel * 2) / 2 - bevel);
  geo.rotateX(-Math.PI / 2); // Y 軸まわりに回る向きへ
  geo = toCreasedNormals(geo, 0.62);

  const parts = [geo];
  if (hub > 0 && hubHeight > 0) {
    const hubGeo = pipe(hub, Math.max(bore, 1e-4), thickness + hubHeight * 2, {
      segments: 36,
      chamfer: m * 0.12,
    });
    parts.push(hubGeo);
  }
  const merged = parts.length > 1 ? mergeAll(parts) : parts[0];
  if (parts.length > 1) parts.forEach((p) => p !== merged && p.dispose?.());
  merged.userData = { pitchR, tipR, rootR, teeth, module: m, thickness };
  return merged;
}

function circleHole(r, segments = 32) {
  const path = new THREE.Path();
  path.absarc(0, 0, r, 0, TAU, true);
  path.curveSegments = segments;
  return path;
}

/** スポーク間の肉抜き穴（丸みのある扇形） */
function spokeHole(rIn, rOut, angle, count, m) {
  const spread = (TAU / count) * 0.62;
  const pts = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = angle - spread / 2 + (spread * i) / steps;
    pts.push(new THREE.Vector2(Math.cos(a) * rOut, Math.sin(a) * rOut));
  }
  for (let i = steps; i >= 0; i--) {
    const a = angle - spread / 2 + (spread * i) / steps;
    pts.push(new THREE.Vector2(Math.cos(a) * rIn, Math.sin(a) * rIn));
  }
  const rounded = roundCorners(pts, m * 0.7, 4, 0.2);
  const path = new THREE.Path();
  path.moveTo(rounded[0].x, rounded[0].y);
  for (let i = rounded.length - 1; i >= 1; i--) path.lineTo(rounded[i].x, rounded[i].y);
  path.closePath();
  return path;
}

/**
 * ラチェット歯車（のこぎり歯）。ぜんまいの逆転止めなどに使う。
 */
export function ratchetGeometry({ teeth = 16, radius = 0.02, depth = 0.004, thickness = 0.003, bore = 0.0025 }) {
  const pts = [];
  const step = TAU / teeth;
  for (let k = 0; k < teeth; k++) {
    const a0 = k * step;
    pts.push(new THREE.Vector2(Math.cos(a0) * (radius - depth), Math.sin(a0) * (radius - depth)));
    const a1 = a0 + step * 0.82;
    pts.push(new THREE.Vector2(Math.cos(a1) * radius, Math.sin(a1) * radius));
  }
  const shape = new THREE.Shape(roundCorners(pts, depth * 0.18, 1, 0.3));
  if (bore > 0) shape.holes.push(circleHole(bore, 24));
  const bevel = thickness * 0.22;
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 10,
    UVGenerator: radialUVGenerator(radius),
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  return toCreasedNormals(geo, 0.7);
}

/**
 * 脱進機の「がんぎ車」。歯先が斜めに切られた特徴的な形。
 */
export function escapeWheelGeometry({ teeth = 15, radius = 0.016, thickness = 0.0018, bore = 0.0016 }) {
  const pts = [];
  const step = TAU / teeth;
  const rIn = radius * 0.74;
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    // 歯: ゆるやかな背 → 鋭い先端 → 急な落ち込み
    pts.push(new THREE.Vector2(Math.cos(a) * rIn, Math.sin(a) * rIn));
    const aBack = a + step * 0.30;
    pts.push(new THREE.Vector2(Math.cos(aBack) * radius * 0.93, Math.sin(aBack) * radius * 0.93));
    const aTip = a + step * 0.62;
    pts.push(new THREE.Vector2(Math.cos(aTip) * radius, Math.sin(aTip) * radius));
    const aDrop = a + step * 0.68;
    pts.push(new THREE.Vector2(Math.cos(aDrop) * rIn * 1.02, Math.sin(aDrop) * rIn * 1.02));
  }
  const shape = new THREE.Shape(roundCorners(pts, radius * 0.02, 1, 0.35));
  if (bore > 0) shape.holes.push(circleHole(bore, 20));
  // 軽量化の穴
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * TAU;
    const path = new THREE.Path();
    path.absarc(Math.cos(a) * rIn * 0.62, Math.sin(a) * rIn * 0.62, rIn * 0.2, 0, TAU, true);
    shape.holes.push(path);
  }
  const bevel = thickness * 0.28;
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 10,
    UVGenerator: radialUVGenerator(radius),
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  return toCreasedNormals(geo, 0.7);
}

/* ------------------------------------------------------------------ */
/* バネ                                                                */
/* ------------------------------------------------------------------ */

/** らせん曲線（コイルバネ用） */
class HelixCurve extends THREE.Curve {
  constructor(radius, height, turns, taper = 0) {
    super();
    this.radius = radius;
    this.height = height;
    this.turns = turns;
    this.taper = taper;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * TAU * this.turns;
    const r = this.radius * (1 - this.taper * Math.sin(t * Math.PI));
    return target.set(Math.cos(a) * r, (t - 0.5) * this.height, Math.sin(a) * r);
  }
}

/**
 * コイルバネ。`update` 可能にするため、長さは呼び出し側で scale.y するのではなく
 * 作り直すか、Mesh の scale で伸ばす（線径が歪むので軽い伸縮向け）。
 */
export function coilSpring({ radius = 0.006, wire = 0.0012, turns = 8, length = 0.03, taper = 0, radialSegments = 8, tubularSegments = 0 }) {
  const curve = new HelixCurve(radius, length, turns, taper);
  const seg = tubularSegments || Math.max(32, Math.round(turns * 14));
  return new THREE.TubeGeometry(curve, seg, wire, radialSegments, false);
}

/** トーラス状のコイル（発電機・モーターの巻線） */
class ToroidCoilCurve extends THREE.Curve {
  constructor(majorR, minorR, turns, arc = TAU) {
    super();
    this.majorR = majorR;
    this.minorR = minorR;
    this.turns = turns;
    this.arc = arc;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const u = t * this.arc;
    const v = t * TAU * this.turns;
    const r = this.majorR + Math.cos(v) * this.minorR;
    return target.set(Math.cos(u) * r, Math.sin(v) * this.minorR, Math.sin(u) * r);
  }
}

export function toroidCoil({ majorR = 0.012, minorR = 0.004, turns = 26, wire = 0.0008, arc = TAU, radialSegments = 6 }) {
  const curve = new ToroidCoilCurve(majorR, minorR, turns, arc);
  return new THREE.TubeGeometry(curve, Math.max(96, turns * 10), wire, radialSegments, false);
}

/** 角柱コアに巻いた巻線（モーターのステータ・電磁石むけ） */
export function bobbinCoil({ radius = 0.008, wire = 0.0009, turns = 14, length = 0.014, layers = 2, radialSegments = 6 }) {
  const geos = [];
  for (let l = 0; l < layers; l++) {
    const r = radius + l * wire * 1.9;
    const curve = new HelixCurve(r, length, turns, 0);
    geos.push(new THREE.TubeGeometry(curve, turns * 12, wire, radialSegments, false));
  }
  const merged = mergeAll(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

/**
 * 平ぜんまい（うずまきバネ）。巻き具合を動的に変えられるよう、
 * 頂点を書き換える `update(tension)` を持つジオメトリを返す。
 */
export function makeMainspring({ innerR = 0.004, outerR = 0.019, width = 0.006, thickness = 0.0006, turnsMin = 2.2, turnsMax = 5.2, samples = 320 }) {
  const geo = new THREE.BufferGeometry();
  const cols = samples + 1;
  const rows = 2; // 帯の上下
  const positions = new Float32Array(cols * rows * 3 * 2); // 表裏で 2 レイヤ
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array((positions.length / 3) * 2);
  const indices = [];

  // インデックス: 表面 + 裏面（法線を反転させて厚みを感じさせる）
  for (let layer = 0; layer < 2; layer++) {
    const base = layer * cols * rows;
    for (let i = 0; i < samples; i++) {
      const a = base + i * rows;
      const b = a + rows;
      if (layer === 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
      else indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const update = (tension) => {
    const turns = lerp(turnsMin, turnsMax, clamp(tension, 0, 1));
    const total = TAU * turns;
    const halfW = width / 2;
    for (let layer = 0; layer < 2; layer++) {
      const off = layer * cols * rows;
      const sgn = layer === 0 ? 1 : -1;
      for (let i = 0; i < cols; i++) {
        const t = i / samples;
        const ang = t * total;
        // 巻きが強いほど内側に詰まる
        const r = lerp(innerR, outerR, Math.pow(t, lerp(1.35, 0.72, clamp(tension, 0, 1))));
        const cx = Math.cos(ang) * r;
        const cz = Math.sin(ang) * r;
        for (let j = 0; j < rows; j++) {
          const idx = (off + i * rows + j) * 3;
          positions[idx] = cx;
          positions[idx + 1] = (j === 0 ? -halfW : halfW);
          positions[idx + 2] = cz;
          const nIdx = idx;
          normals[nIdx] = Math.cos(ang) * sgn;
          normals[nIdx + 1] = 0;
          normals[nIdx + 2] = Math.sin(ang) * sgn;
          const uvIdx = (off + i * rows + j) * 2;
          uvs[uvIdx] = t * turns;
          uvs[uvIdx + 1] = j;
        }
      }
    }
    // 厚みぶんだけ表裏をずらす
    for (let i = 0; i < cols * rows; i++) {
      const idx = (cols * rows + i) * 3;
      positions[idx] += normals[idx] * thickness;
      positions[idx + 2] += normals[idx + 2] * thickness;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingSphere();
  };

  update(0.5);
  geo.userData.update = update;
  return geo;
}

/* ------------------------------------------------------------------ */
/* 線材                                                                */
/* ------------------------------------------------------------------ */

/** 点列から滑らかなチューブ（配線・パイプ） */
export function tubeFromPoints(points, radius, { segments = 0, radialSegments = 8, closed = false, curveType = 'catmullrom', tension = 0.5 } = {}) {
  const v3 = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  const curve = new THREE.CatmullRomCurve3(v3, closed, curveType, tension);
  const seg = segments || Math.max(24, v3.length * 8);
  return new THREE.TubeGeometry(curve, seg, radius, radialSegments, closed);
}

/**
 * ジグザグに折り返した線（トースターのニクロム線、ヒーターなど）。
 * XY 平面上に生成する。
 */
export function zigzagWire({ width = 0.06, height = 0.05, count = 7, wire = 0.0006, radialSegments = 6, round = 0.004 }) {
  const pts = [];
  const dx = width / count;
  for (let i = 0; i <= count; i++) {
    const x = -width / 2 + dx * i;
    const up = i % 2 === 0;
    pts.push(new THREE.Vector3(x, up ? -height / 2 : height / 2, 0));
    if (i < count) {
      const xm = x + dx / 2;
      pts.push(new THREE.Vector3(xm, up ? height / 2 - round : -height / 2 + round, 0));
    }
  }
  return tubeFromPoints(pts, wire, { radialSegments, tension: 0.42 });
}

/** 円弧状に曲げたパイプ（エルボ） */
export function elbow({ bendRadius = 0.01, tubeRadius = 0.003, angle = Math.PI / 2, radialSegments = 16, tubularSegments = 24 }) {
  return new THREE.TorusGeometry(bendRadius, tubeRadius, radialSegments, tubularSegments, angle);
}

/* ------------------------------------------------------------------ */
/* 板金・ケース                                                        */
/* ------------------------------------------------------------------ */

/**
 * 角丸の板（パネル・ブラケット・ベース）。押し出し方向は Z。
 */
export function roundedPlate(width, height, thickness, radius = 0.004, { bevel = 0.0006, curveSegments = 8 } = {}) {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w * 0.98, h * 0.98);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const b = Math.min(bevel, thickness * 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - b * 2,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments,
  });
  geo.translate(0, 0, -thickness / 2);
  return toCreasedNormals(geo, 0.6);
}

/**
 * 任意の閉じた輪郭を押し出す（穴つき対応）。
 * @param {THREE.Vector2[]} outline
 * @param {THREE.Vector2[][]} holes
 */
export function extrudeOutline(outline, holes, thickness, { bevel = 0.0006, curveSegments = 10, corner = 0, uvRadius = 0 } = {}) {
  const pts = corner > 0 ? roundCorners(outline, corner, 3) : outline;
  const shape = new THREE.Shape(pts);
  for (const hole of holes || []) {
    const hp = corner > 0 ? roundCorners(hole, corner * 0.6, 3) : hole;
    shape.holes.push(new THREE.Path(hp));
  }
  const b = Math.min(bevel, thickness * 0.35);
  const opts = {
    depth: thickness - b * 2,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments,
  };
  if (uvRadius > 0) opts.UVGenerator = radialUVGenerator(uvRadius);
  const geo = new THREE.ExtrudeGeometry(shape, opts);
  geo.translate(0, 0, -thickness / 2);
  return toCreasedNormals(geo, 0.6);
}

/* ------------------------------------------------------------------ */
/* 小物                                                                */
/* ------------------------------------------------------------------ */

/** なべ頭のネジ（すりわり付き） */
export function screw({ headR = 0.0022, headH = 0.0012, shaftR = 0.0012, shaftLen = 0.004, slot = true }) {
  const parts = [
    lathe(
      [
        [0, 0],
        [headR * 0.9, 0],
        [headR, headH * 0.35],
        [headR * 0.86, headH],
        [0, headH * 1.02],
      ],
      { segments: 24, center: false },
    ),
    chamferedCylinder(shaftR, shaftLen, shaftR * 0.3, 16).translate(0, -shaftLen / 2, 0),
  ];
  if (slot) {
    const s = new THREE.BoxGeometry(headR * 1.8, headH * 0.45, headR * 0.32);
    s.translate(0, headH * 0.92, 0);
    parts.push(s);
  }
  const merged = mergeAll(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** 六角ナット */
export function hexNut({ across = 0.005, height = 0.002, bore = 0.0015 }) {
  const r = across / Math.sqrt(3);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const shape = new THREE.Shape(pts);
  shape.holes.push(circleHole(bore, 20));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height * 0.8,
    bevelEnabled: true,
    bevelThickness: height * 0.1,
    bevelSize: height * 0.1,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 8,
  });
  geo.translate(0, 0, -height / 2);
  geo.rotateX(-Math.PI / 2);
  return toCreasedNormals(geo, 0.7);
}

/** リベット／突起 */
export function rivet(r = 0.0012, h = 0.0008) {
  return lathe(
    [
      [0, 0],
      [r, 0],
      [r * 0.92, h * 0.6],
      [r * 0.6, h],
      [0, h * 1.05],
    ],
    { segments: 16, center: false },
  );
}

/**
 * 扇風機の羽根。付け根から先端へ向かってねじれ、外周に向かって広がる。
 * 生成される羽根は原点（回転軸）から +X 方向に伸びる。
 */
export function fanBlade({ innerR = 0.006, outerR = 0.05, chordIn = 0.012, chordOut = 0.030, twistIn = 0.75, twistOut = 0.24, thickness = 0.0012, spanSteps = 18, chordSteps = 9, sweep = 0.55 }) {
  const cols = spanSteps + 1;
  const rows = chordSteps + 1;
  const count = cols * rows * 2;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices = [];

  const pt = new THREE.Vector3();
  const write = (layer, i, j, x, y, z) => {
    const idx = ((layer * cols * rows) + i * rows + j) * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
  };

  for (let layer = 0; layer < 2; layer++) {
    const off = layer === 0 ? thickness / 2 : -thickness / 2;
    for (let i = 0; i < cols; i++) {
      const s = i / spanSteps;
      const r = lerp(innerR, outerR, s);
      const chord = lerp(chordIn, chordOut, Math.pow(s, 0.72));
      const twist = lerp(twistIn, twistOut, Math.pow(s, 0.85));
      const sweepAng = sweep * Math.pow(s, 1.6);
      // 翼端に向かって細くする
      const taper = 1 - Math.pow(Math.max(0, s - 0.72) / 0.28, 2) * 0.55;
      for (let j = 0; j < rows; j++) {
        const c = j / chordSteps - 0.5; // -0.5..0.5 コード方向
        // キャンバー（そり）
        const camber = (0.25 - c * c) * chord * 0.28;
        const local = new THREE.Vector3(0, camber + off, c * chord * taper);
        // ねじり（X 軸まわり）
        const cy = Math.cos(twist);
        const sy = Math.sin(twist);
        const ly = local.y * cy - local.z * sy;
        const lz = local.y * sy + local.z * cy;
        // 半径方向に配置しつつ、回転方向へスイープ
        pt.set(r, ly, lz);
        const ca = Math.cos(sweepAng);
        const sa = Math.sin(sweepAng);
        write(layer, i, j, pt.x * ca - pt.z * sa, pt.y, pt.x * sa + pt.z * ca);
        const uvIdx = ((layer * cols * rows) + i * rows + j) * 2;
        uvs[uvIdx] = s;
        uvs[uvIdx + 1] = j / chordSteps;
      }
    }
  }

  for (let layer = 0; layer < 2; layer++) {
    const base = layer * cols * rows;
    for (let i = 0; i < spanSteps; i++) {
      for (let j = 0; j < chordSteps; j++) {
        const a = base + i * rows + j;
        const b = a + rows;
        if (layer === 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  // 縁を閉じる（前縁・後縁・翼端）
  const top = 0;
  const bot = cols * rows;
  for (let i = 0; i < spanSteps; i++) {
    const a0 = top + i * rows;
    const b0 = bot + i * rows;
    indices.push(a0, b0, a0 + rows, a0 + rows, b0, b0 + rows);
    const a1 = top + i * rows + chordSteps;
    const b1 = bot + i * rows + chordSteps;
    indices.push(a1 + rows, b1 + rows, a1, a1, b1 + rows, b1);
  }
  for (let j = 0; j < chordSteps; j++) {
    const a = top + spanSteps * rows + j;
    const b = bot + spanSteps * rows + j;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * ふきながし／リボン用の帯メッシュ。
 * `update(points)` で頂点を書き換えられる（風になびかせる）。
 */
export function makeRibbon({ segments = 24, width = 0.012 }) {
  const cols = segments + 1;
  const positions = new Float32Array(cols * 2 * 3);
  const normals = new Float32Array(cols * 2 * 3);
  const uvs = new Float32Array(cols * 2 * 2);
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let i = 0; i < cols; i++) {
    uvs[i * 4 + 0] = i / segments;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = i / segments;
    uvs[i * 4 + 3] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  /** @param {THREE.Vector3[]} pts 中心線（cols 個） */
  geo.userData.update = (pts, taper = true) => {
    for (let i = 0; i < cols; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      const pNext = pts[Math.min(i + 1, pts.length - 1)];
      const pPrev = pts[Math.max(i - 1, 0)];
      tangent.subVectors(pNext, pPrev);
      if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
      tangent.normalize();
      // 接線が真上を向いていると外積が潰れるので、その場合は画面に平行な向きを使う
      side.crossVectors(tangent, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const w = (width / 2) * (taper ? 1 - 0.55 * (i / segments) : 1);
      const i0 = i * 6;
      positions[i0 + 0] = p.x - side.x * w;
      positions[i0 + 1] = p.y - side.y * w;
      positions[i0 + 2] = p.z - side.z * w;
      positions[i0 + 3] = p.x + side.x * w;
      positions[i0 + 4] = p.y + side.y * w;
      positions[i0 + 5] = p.z + side.z * w;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  return geo;
}

/* ------------------------------------------------------------------ */

/** 複数ジオメトリをまとめて 1 つにする（描画コール削減用の簡易ヘルパー） */
export function combine(list) {
  const geos = list.map(({ geometry, position, rotation, scale }) => {
    const g = geometry.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (rotation) q.setFromEuler(new THREE.Euler(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0));
    m.compose(
      new THREE.Vector3(...(position || [0, 0, 0])),
      q,
      new THREE.Vector3(...(scale || [1, 1, 1])),
    );
    g.applyMatrix4(m);
    return g;
  });
  const merged = mergeAll(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

/* ------------------------------------------------------------------ */
/* 追加の部品（後から増やした機械のために）                            */
/* ------------------------------------------------------------------ */

/**
 * 内歯車（リングギヤ）。えんぴつけずりの遊星機構などに使う。
 *
 * 外歯車の輪郭をピッチ円で内外反転（r → 2·pitchR − r）すると、
 * 歯先が中心を向いた内歯の形になる。これを円板の穴として使う。
 */
export function ringGearGeometry({ teeth, module: m, thickness, outerR, pressureAngle = 20 * (Math.PI / 180) }) {
  const { points, pitchR } = gearOutline({ teeth, module: m, pressureAngle, profileSteps: 5 });
  const hole = points.map((p) => {
    const r = p.length() || 1e-6;
    const rr = 2 * pitchR - r;
    return new THREE.Vector2((p.x / r) * rr, (p.y / r) * rr);
  });
  // 反転すると巻き方向が逆になるので、戻しておく
  hole.reverse();

  const outer = [];
  const ro = outerR ?? pitchR + m * 2.6;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU;
    outer.push(new THREE.Vector2(Math.cos(a) * ro, Math.sin(a) * ro));
  }

  const shape = new THREE.Shape(outer);
  shape.holes.push(new THREE.Path(roundCorners(hole, m * 0.18, 2, 0.3)));

  const bevel = Math.min(m * 0.14, thickness * 0.28);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 10,
    UVGenerator: radialUVGenerator(ro),
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  return toCreasedNormals(geo, 0.62);
}

/** らせん状の切れ刃（えんぴつけずりのカッター）が通る曲線 */
class TaperedHelix extends THREE.Curve {
  constructor(r0, r1, height, turns, phase) {
    super();
    this.r0 = r0;
    this.r1 = r1;
    this.height = height;
    this.turns = turns;
    this.phase = phase;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.phase + t * TAU * this.turns;
    const r = lerp(this.r0, this.r1, t);
    return target.set(Math.cos(a) * r, (t - 0.5) * this.height, Math.sin(a) * r);
  }
}

/**
 * えんぴつけずりのらせん刃。
 * 円錐台の本体に、ねじれた稜線（切れ刃）を何本か巻きつける。
 */
export function helicalCutter({ r0 = 0.0028, r1 = 0.0072, length = 0.026, flutes = 6, turns = 0.55, edge = 0.0009 }) {
  const parts = [
    lathe(
      [
        [0, -length / 2],
        [r0, -length / 2],
        [r1, length / 2],
        [0, length / 2],
      ],
      { segments: 26, center: false },
    ),
  ];
  for (let i = 0; i < flutes; i++) {
    const curve = new TaperedHelix(r0 + edge * 0.5, r1 + edge * 0.5, length, turns, (i / flutes) * TAU);
    parts.push(new THREE.TubeGeometry(curve, 26, edge, 4, false));
  }
  return mergeAll(parts);
}

/** 六角柱（えんぴつの軸） */
export function hexPrism(acrossFlats, length, { corner = 0.0002 } = {}) {
  const r = acrossFlats / Math.sqrt(3);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const geo = extrudeOutline(pts, [], length, { corner, bevel: acrossFlats * 0.02, curveSegments: 4 });
  geo.rotateX(Math.PI / 2); // 長さ方向を Y へ
  return geo;
}

/**
 * 削りかす。うずまきに巻いた薄い帯。
 */
export function shavingGeometry({ width = 0.008, turns = 1.6, r0 = 0.0022, r1 = 0.0048, samples = 26, seed = 0 }) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = seed + t * TAU * turns;
    const r = lerp(r0, r1, t);
    pts.push(new THREE.Vector3(Math.cos(a) * r, (t - 0.5) * width * 0.35, Math.sin(a) * r));
  }
  const geo = makeRibbon({ segments: samples, width });
  geo.userData.update(pts, false);
  return geo;
}

/** 星形の輪郭 */
export function starPoints(outer, inner, points = 5, rotate = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rotate + (i / (points * 2)) * TAU;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

/** ハート形の輪郭 */
export function heartPoints(size, steps = 40) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(new THREE.Vector2((x / 17) * size, (y / 17) * size));
  }
  return pts;
}

/**
 * ガチャのカプセル（上下 2 色の球）。half = 'top' | 'bottom'
 */
export function capsuleHalf(radius, half = 'top', segments = 24) {
  const pts = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    const r = Math.sin(a) * radius;
    const y = Math.cos(a) * radius;
    pts.push([r, half === 'top' ? y : -y]);
  }
  if (half === 'top') pts.reverse();
  // ふちのつば
  pts.push([radius * 1.02, half === 'top' ? -0.0002 : 0.0002]);
  pts.push([radius * 0.96, 0]);
  pts.push([0, 0]);
  return lathe(pts, { segments, center: false, creaseAngle: 1.1 });
}
