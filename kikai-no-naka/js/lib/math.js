/**
 * math.js — 小さな数学ユーティリティ
 *
 * ゲーム全体で使う補間・減衰・乱数・簡易バネなどをまとめる。
 * three.js に依存しない純粋な関数だけを置く（テストしやすさのため）。
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(inverseLerp(a, b, v)));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-9));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-9));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * フレームレート非依存の指数減衰補間。
 * `lambda` が大きいほど速く追従する（単位: 1/秒）。
 */
export function damp(current, target, lambda, dt) {
  return lerp(target, current, Math.exp(-lambda * dt));
}

/** 角度の最短差分（-PI..PI） */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** 角度用の指数減衰補間（ラップアラウンド対応） */
export function dampAngle(current, target, lambda, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));
}

/** 一定速度で target に近づく（オーバーシュートしない） */
export function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export function mod(a, n) {
  return ((a % n) + n) % n;
}

/* ------------------------------------------------------------------ */
/* 乱数                                                                */
/* ------------------------------------------------------------------ */

/** 決定的な擬似乱数（mulberry32）。見た目を毎回同じにしたい所で使う。 */
export function makeRandom(seed = 1) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1次元の値ノイズ（滑らかな揺らぎ用） */
export function makeValueNoise1D(seed = 7) {
  const rnd = makeRandom(seed);
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) table[i] = rnd() * 2 - 1;
  return function noise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = table[mod(i, 256)];
    const b = table[mod(i + 1, 256)];
    return lerp(a, b, u);
  };
}

/* ------------------------------------------------------------------ */
/* 1次元バネ（UI やレバーの手触り用）                                  */
/* ------------------------------------------------------------------ */

export class Spring1D {
  /**
   * @param {number} value 初期値
   * @param {number} stiffness 固有角周波数（大きいほど硬い）
   * @param {number} damping 減衰比（1 で臨界減衰）
   */
  constructor(value = 0, stiffness = 120, damping = 1) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  set(v) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
    return this;
  }

  update(dt) {
    // 半陰的オイラー（大きな dt でも発散しにくい）
    const w = this.stiffness;
    const z = this.damping;
    const f = 1 + 2 * dt * z * w;
    const oo = w * w;
    const hoo = dt * oo;
    const hhoo = dt * hoo;
    const det = 1 / (f + hhoo);
    this.value = (f * this.value + dt * this.velocity + hhoo * this.target) * det;
    this.velocity = (this.velocity + hoo * (this.target - this.value)) * det;
    return this.value;
  }
}

/* ------------------------------------------------------------------ */
/* 移動平均（ドラッグ速度の平滑化）                                    */
/* ------------------------------------------------------------------ */

export class RollingAverage {
  constructor(size = 6) {
    this.buf = new Float32Array(size);
    this.i = 0;
    this.n = 0;
  }
  push(v) {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
    return this.value;
  }
  get value() {
    if (this.n === 0) return 0;
    let s = 0;
    for (let k = 0; k < this.n; k++) s += this.buf[k];
    return s / this.n;
  }
  reset() {
    this.buf.fill(0);
    this.i = 0;
    this.n = 0;
  }
}

/* ------------------------------------------------------------------ */
/* イージング                                                          */
/* ------------------------------------------------------------------ */

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};
