/**
 * materials.js — 質感ライブラリ
 *
 * 画像アセットを持たずに、手続き的テクスチャ + PBR パラメータだけで
 * 「真鍮」「削り出しの鋼」「塗装された板金」「樹脂」「ガラス」などを作る。
 *
 * 使い方:
 *   const M = new MaterialLibrary({ tier: 'high' });
 *   const gear = M.part('brass');            // 中身（すけすけ時にリムが出る）
 *   const case_ = M.shell('paint', { color: 0x9fe0d6 });  // 外装（すけすけ対象）
 *
 * part() / shell() は必ず新しいインスタンスを返すので、部品ごとに
 * タッチ発光やエミッシブを個別に動かせる。共有したいときは share() を使う。
 */

import * as THREE from 'three';
import * as TEX from './textures.js';
import { makeGutsMaterial, makeShellMaterial } from './xray.js';

/* ------------------------------------------------------------------ */
/* カラーパレット（4歳児向け: 明るく、けれど濁らない）                 */
/* ------------------------------------------------------------------ */

export const PALETTE = {
  cream: 0xfaf1e2,
  paper: 0xfff8ec,
  mint: 0x8fded0,
  mintDeep: 0x4fb8a6,
  sky: 0x8ecdf5,
  skyDeep: 0x4b9fdc,
  butter: 0xffd86b,
  apricot: 0xffb15c,
  tomato: 0xf37361,
  berry: 0xe0669a,
  grape: 0xa88ad6,
  leaf: 0x9ed36a,
  charcoal: 0x3b3a3f,
  slate: 0x5c6470,

  brass: 0xd8a441,
  brassDark: 0xa87b28,
  copper: 0xd07b4f,
  steel: 0xbfc6cd,
  steelDark: 0x8a9099,
  chrome: 0xe6ecf2,
  zinc: 0xa9b0b8,
  nickel: 0xcfd6dc,

  glow: 0xffe9a8,
  spark: 0x9fe8ff,
  hot: 0xff5a2a,
  water: 0x6cc7f0,
};

/* ------------------------------------------------------------------ */

const TIERS = { low: 0, mid: 1, high: 2 };

export class MaterialLibrary {
  /**
   * @param {object} opts
   * @param {'low'|'mid'|'high'} opts.tier 品質ティア（テクスチャ解像度や高価な機能を制御）
   * @param {THREE.Texture} opts.envMap 既定の環境マップ（scene.environment を使う場合は不要）
   */
  constructor({ tier = 'high', envMap = null } = {}) {
    this.tier = tier;
    this.level = TIERS[tier] ?? 2;
    this.envMap = envMap;
    /** @type {THREE.Material[]} */
    this.owned = [];
    this._shared = new Map();
  }

  get texSize() {
    return this.level >= 2 ? 512 : this.level >= 1 ? 256 : 128;
  }

  /** 生成済みマテリアルを全部破棄する（機械を切り替えるとき） */
  dispose() {
    for (const m of this.owned) m.dispose();
    this.owned.length = 0;
    this._shared.clear();
  }

  _own(m) {
    this.owned.push(m);
    return m;
  }

  /**
   * 内部部品用マテリアル。すけすけ時のリムとタッチ発光が有効になる。
   * @param {keyof MaterialLibrary['recipes']|string} name
   */
  part(name, opts = {}) {
    const m = this._build(name, opts);
    makeGutsMaterial(m, { touchColor: opts.touchColor });
    return this._own(m);
  }

  /** 外装用マテリアル。すけすけの対象になる。 */
  shell(name, opts = {}) {
    const m = this._build(name, opts);
    makeShellMaterial(m, { solidFloor: opts.solidFloor });
    return this._own(m);
  }

  /** すけすけにもタッチ発光にも関与しない、素のマテリアル（背景の台など） */
  plain(name, opts = {}) {
    return this._own(this._build(name, opts));
  }

  /** 同じ設定を複数メッシュで共有したいとき（描画コール削減） */
  share(key, factory) {
    if (this._shared.has(key)) return this._shared.get(key);
    const m = factory();
    this._shared.set(key, m);
    return m;
  }

  /* ---------------------------------------------------------------- */

  _build(name, opts) {
    const recipe = this.recipes[name];
    if (!recipe) throw new Error(`materials: 未知のレシピ "${name}"`);
    const m = recipe.call(this, opts);
    if (this.envMap && !m.envMap) m.envMap = this.envMap;
    if (opts.envMapIntensity !== undefined) m.envMapIntensity = opts.envMapIntensity;
    if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
    if (opts.emissiveIntensity !== undefined) m.emissiveIntensity = opts.emissiveIntensity;
    if (opts.opacity !== undefined) {
      m.opacity = opts.opacity;
      m.transparent = opts.opacity < 1;
    }
    if (opts.name) m.name = opts.name;
    return m;
  }

  /* ---------------------------------------------------------------- */
  /* レシピ集                                                          */
  /* ---------------------------------------------------------------- */

  get recipes() {
    if (this._recipes) return this._recipes;
    const S = () => this.texSize;
    const hi = this.level >= 2;

    this._recipes = {
      /* --- 金属 ------------------------------------------------- */

      /** 真鍮: 歯車・クランク・装飾リング */
      brass: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? PALETTE.brass,
          metalness: 0.92,
          roughness: 0.30,
          envMapIntensity: 1.45,
        });
        m.roughnessMap = TEX.brushedRadial({ size: S(), base: 0.30, contrast: 0.20, seed: 11 });
        if (hi) {
          m.normalMap = TEX.brushedNormal({ size: S(), seed: 11, strength: 0.35, stretch: 64 });
          m.normalScale = new THREE.Vector2(0.22, 0.22);
          m.anisotropy = 0.35;
        }
        return m;
      },

      /** 磨いた銅: コイル線・配線 */
      copper: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? PALETTE.copper,
          metalness: 0.95,
          roughness: 0.26,
          envMapIntensity: 1.45,
        });
        m.roughnessMap = TEX.fineGrain({ size: 256, base: 0.26, contrast: 0.14, seed: 33, freq: 30 });
        return m;
      },

      /** 削り出しの鋼: シャフト・ネジ・板バネ */
      steel: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? PALETTE.steel,
          metalness: o.metalness ?? 0.9,
          roughness: o.roughness ?? 0.28,
          envMapIntensity: 1.35,
        });
        m.roughnessMap =
          o.brushed === 'linear'
            ? TEX.brushedLinear({ size: S(), base: 0.26, contrast: 0.16, seed: 3 })
            : TEX.brushedRadial({ size: S(), base: 0.26, contrast: 0.18, seed: 7 });
        if (hi) {
          m.normalMap = TEX.brushedNormal({ size: S(), seed: 3, strength: 0.30, stretch: 56 });
          m.normalScale = new THREE.Vector2(0.18, 0.18);
        }
        return m;
      },

      /** 黒染めした鉄: フレーム・ベース */
      darkSteel: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? 0x565d66,
          metalness: 0.92,
          roughness: 0.52,
          envMapIntensity: 0.85,
        });
        m.roughnessMap = TEX.fineGrain({ size: 256, base: 0.52, contrast: 0.22, seed: 55, freq: 26 });
        return m;
      },

      /** クロムメッキ: トースターの外装など */
      chrome: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? PALETTE.chrome,
          metalness: 1,
          roughness: 0.07,
          envMapIntensity: 1.4,
          clearcoat: 0.4,
          clearcoatRoughness: 0.08,
        });
        if (hi) {
          m.roughnessMap = TEX.fineGrain({ size: 256, base: 0.08, contrast: 0.05, seed: 71, freq: 18 });
        }
        return m;
      },

      /** 亜鉛ダイキャスト: ざらついた鋳物 */
      zinc: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? PALETTE.zinc,
          metalness: 0.85,
          roughness: 0.62,
          envMapIntensity: 0.9,
        });
        m.roughnessMap = TEX.fineGrain({ size: 256, base: 0.62, contrast: 0.2, seed: 91, freq: 44 });
        if (hi) {
          m.normalMap = TEX.orangePeelNormal({ size: 256, seed: 12, strength: 1.1 });
          m.normalScale = new THREE.Vector2(0.5, 0.5);
        }
        return m;
      },

      /* --- 塗装・樹脂 --------------------------------------------- */

      /** 焼き付け塗装された板金（外装の主役） */
      paint: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? PALETTE.mint,
          metalness: 0,
          roughness: o.roughness ?? 0.34,
          clearcoat: hi ? (o.clearcoat ?? 0.85) : 0,
          clearcoatRoughness: o.clearcoatRoughness ?? 0.14,
          envMapIntensity: 1.0,
          sheen: 0,
        });
        if (hi) {
          m.normalMap = TEX.orangePeelNormal({ size: 256, seed: 5, strength: 0.45 });
          m.normalScale = new THREE.Vector2(0.28, 0.28);
          m.clearcoatNormalMap = m.normalMap;
          m.clearcoatNormalScale = new THREE.Vector2(0.2, 0.2);
        }
        return m;
      },

      /** 粉体塗装した金属板（地板・ブラケット）。金属より暗くならず、形が読みやすい。 */
      coated: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? 0xb9c4cf,
          metalness: 0.18,
          roughness: o.roughness ?? 0.48,
          envMapIntensity: 1.0,
          clearcoat: hi ? 0.25 : 0,
          clearcoatRoughness: 0.4,
        });
        m.roughnessMap = TEX.fineGrain({ size: 256, base: o.roughness ?? 0.48, contrast: 0.12, seed: 63, freq: 34 });
        return m;
      },

      /** 半つやの ABS 樹脂 */
      plastic: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? PALETTE.cream,
          metalness: 0,
          roughness: o.roughness ?? 0.46,
          envMapIntensity: 0.85,
        });
        m.roughnessMap = TEX.fineGrain({ size: 256, base: o.roughness ?? 0.46, contrast: 0.1, seed: 19, freq: 36 });
        return m;
      },

      /** つや消しのやわらかい樹脂（ボタン・グリップ） */
      softPlastic: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? PALETTE.butter,
          metalness: 0,
          roughness: 0.62,
          sheen: hi ? 0.35 : 0,
          sheenRoughness: 0.7,
          sheenColor: new THREE.Color(0xffffff),
          envMapIntensity: 0.75,
        });
        if (hi) {
          m.normalMap = TEX.orangePeelNormal({ size: 256, seed: 26, strength: 0.9 });
          m.normalScale = new THREE.Vector2(0.35, 0.35);
        }
        return m;
      },

      /** ゴム（脚・ベルト・パッキン） */
      rubber: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? 0x35383d,
          metalness: 0,
          roughness: 0.88,
          envMapIntensity: 0.5,
        });
        m.roughnessMap = TEX.fineGrain({ size: 256, base: 0.88, contrast: 0.08, seed: 43, freq: 50 });
        if (hi) {
          m.normalMap = TEX.orangePeelNormal({ size: 256, seed: 43, strength: 1.4 });
          m.normalScale = new THREE.Vector2(0.6, 0.6);
        }
        return m;
      },

      /** ケーブル被覆（ローレット状のリブ入り） */
      cable: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? PALETTE.charcoal,
          metalness: 0,
          roughness: 0.7,
          envMapIntensity: 0.6,
        });
        if (hi) {
          m.normalMap = TEX.fabricNormal({ size: 256, pitch: 30, strength: 0.8 });
          m.normalScale = new THREE.Vector2(0.5, 0.5);
        }
        return m;
      },

      /* --- 透明・発光 --------------------------------------------- */

      /**
       * ガラス（レンズ・風防・水槽）。
       *
       * 屈折（transmission）は美しいが、three の実装では
       * 「屈折するもの同士は重ねて見えない」うえ、iPad では重い。
       * ここでは水槽の中の水など、透明なものが何枚も重なるので、
       * 素直なアルファ合成のガラスにしている。縁のハイライトを強めに出して
       * ガラスらしさを稼ぐ。
       */
      glass: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? 0xeaf6ff,
          metalness: 0,
          roughness: o.roughness ?? 0.045,
          transparent: true,
          opacity: o.opacity ?? 0.20,
          envMapIntensity: 2.0,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          side: THREE.DoubleSide,
          depthWrite: false,
          specularIntensity: 1,
        });
        return m;
      },

      /** 光る部分（電球・ヒーター・LED）。emissiveIntensity で明るさを操作。 */
      emissive: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? 0x201c14,
          emissive: new THREE.Color(o.emissive ?? PALETTE.glow),
          emissiveIntensity: o.emissiveIntensity ?? 1,
          metalness: o.metalness ?? 0.2,
          roughness: o.roughness ?? 0.4,
          toneMapped: true,
        });
        return m;
      },

      /** 半透明の光のかたまり（電球のガラス球の内側など） */
      lightBlob: (o = {}) => {
        const m = new THREE.MeshBasicMaterial({
          color: o.color ?? PALETTE.glow,
          transparent: true,
          opacity: o.opacity ?? 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: true,
        });
        return m;
      },

      /* --- そのほか ----------------------------------------------- */

      /** 木（オルゴールの箱） */
      wood: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          metalness: 0,
          roughness: 0.5,
          clearcoat: hi ? 0.6 : 0,
          clearcoatRoughness: 0.25,
          envMapIntensity: 0.9,
        });
        m.map = TEX.woodGrain({ size: S(), seed: o.seed ?? 61, light: o.light, dark: o.dark });
        m.roughnessMap = TEX.woodRoughness({ size: S(), seed: o.seed ?? 61 });
        if (o.repeat) {
          m.map = m.map.clone();
          m.map.repeat.set(o.repeat, o.repeat);
          m.map.needsUpdate = true;
        }
        return m;
      },

      /** 食パン */
      bread: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? 0xffffff,
          metalness: 0,
          roughness: 0.92,
          envMapIntensity: 0.6,
        });
        m.map = TEX.breadCrumb({ size: S(), seed: 91 });
        if (hi) {
          m.normalMap = TEX.breadNormal({ size: S(), seed: 91 });
          m.normalScale = new THREE.Vector2(0.8, 0.8);
        }
        return m;
      },

      /** プリント基板 */
      pcb: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          metalness: 0.1,
          roughness: 0.45,
          envMapIntensity: 0.8,
        });
        m.map = TEX.circuitBoard({ size: S(), seed: o.seed ?? 77 });
        return m;
      },

      /** つまみ表面のローレット */
      knurled: (o = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color: o.color ?? PALETTE.steel,
          metalness: o.metalness ?? 0.9,
          roughness: 0.42,
          envMapIntensity: 1.0,
        });
        m.normalMap = TEX.knurlNormal({ size: 256, pitch: o.pitch ?? 26, strength: 2.4 });
        m.normalScale = new THREE.Vector2(1, 1);
        if (o.repeat) {
          m.normalMap = m.normalMap.clone();
          m.normalMap.repeat.set(o.repeat, 1);
          m.normalMap.needsUpdate = true;
        }
        return m;
      },

      /** 布・リボン（風を見せるための吹き流し） */
      fabric: (o = {}) => {
        const m = new THREE.MeshPhysicalMaterial({
          color: o.color ?? PALETTE.tomato,
          metalness: 0,
          roughness: 0.85,
          sheen: hi ? 0.7 : 0,
          sheenRoughness: 0.6,
          sheenColor: new THREE.Color(0xffffff),
          side: THREE.DoubleSide,
          envMapIntensity: 0.8,
        });
        if (hi) {
          m.normalMap = TEX.fabricNormal({ size: 256, pitch: 40, strength: 1.0 });
          m.normalScale = new THREE.Vector2(0.45, 0.45);
        }
        return m;
      },

      /** 水（水槽・水柱）。ガラスと同じ理由で、こちらもアルファ合成。 */
      water: (o = {}) => {
        return new THREE.MeshPhysicalMaterial({
          color: o.color ?? PALETTE.water,
          metalness: 0,
          roughness: 0.06,
          transparent: true,
          opacity: o.opacity ?? 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
          envMapIntensity: 1.6,
          clearcoat: 0.6,
          clearcoatRoughness: 0.08,
        });
      },
    };
    return this._recipes;
  }
}
