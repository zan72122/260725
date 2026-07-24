/**
 * quality.js — 端末に合わせた描画品質の決定と、動的な自動調整
 *
 * iPad / iPhone で 60fps を保つことを最優先にしつつ、
 * 余力のある端末では影・ブルーム・屈折までフルに使う。
 *
 * 3 段階のティア:
 *   high … 影 2048 / MSAA / ブルーム / 屈折ガラス / 高解像テクスチャ
 *   mid  … 影 1024 / FXAA / ブルーム / 簡易ガラス
 *   low  … 影 512  / FXAA / ブルームなし / パーティクル削減
 */

export const TIER_SETTINGS = {
  high: {
    pixelRatioCap: 2.0,
    shadowMapSize: 2048,
    msaaSamples: 4,
    bloom: true,
    bloomResolutionScale: 0.5,
    grade: true,
    particleScale: 1.0,
    envResolution: 256,
    softShadows: true,
  },
  mid: {
    pixelRatioCap: 1.75,
    shadowMapSize: 1024,
    msaaSamples: 0,
    bloom: true,
    bloomResolutionScale: 0.4,
    grade: true,
    particleScale: 0.7,
    envResolution: 128,
    softShadows: true,
  },
  low: {
    pixelRatioCap: 1.4,
    shadowMapSize: 512,
    msaaSamples: 0,
    bloom: false,
    bloomResolutionScale: 0.35,
    grade: true,
    particleScale: 0.45,
    envResolution: 128,
    softShadows: false,
  },
};

const ORDER = ['low', 'mid', 'high'];

/** 端末情報からの初期ティア推定 */
export function detectTier() {
  if (typeof navigator === 'undefined') return 'high';

  const ua = navigator.userAgent || '';
  const dpr = window.devicePixelRatio || 1;
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const screenPx = window.screen.width * window.screen.height * dpr * dpr;

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const isAndroid = /Android/.test(ua);

  // 明らかに非力な端末
  if (mem <= 2 || cores <= 3) return 'low';
  if (isAndroid && screenPx > 4.5e6 && cores <= 6) return 'mid';

  // iOS は GPU が強いので基本 high。ただし古い小型 iPhone は mid。
  if (isIOS) {
    const shortSide = Math.min(window.screen.width, window.screen.height);
    if (shortSide <= 375 && dpr <= 2) return 'mid';
    return 'high';
  }

  if (cores >= 8 && mem >= 8) return 'high';
  return 'mid';
}

/**
 * 実測 FPS に応じてティアを上下させる監視役。
 * 落ちるときは素早く、上げるときは慎重に。
 */
export class AdaptiveQuality {
  /**
   * @param {string} tier 初期ティア
   * @param {(tier: string) => void} onChange 変更時に呼ばれる
   */
  constructor(tier, onChange) {
    this.tier = tier;
    this.onChange = onChange;
    this.frames = 0;
    this.accum = 0;
    this.slowStreak = 0;
    this.fastStreak = 0;
    this.locked = false;
    this.lastFps = 60;
    /** 起動直後はシェーダのコンパイルで重いので、しばらく判定しない */
    this.warmup = 2.0;
  }

  lock() {
    this.locked = true;
  }

  /** 毎フレーム呼ぶ */
  sample(dt) {
    if (this.locked) return;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.accum += dt;
    this.frames++;
    if (this.accum < 1.0) return;

    const fps = this.frames / this.accum;
    this.lastFps = fps;
    this.accum = 0;
    this.frames = 0;

    if (fps < 40) {
      this.slowStreak++;
      this.fastStreak = 0;
    } else if (fps > 57) {
      this.fastStreak++;
      this.slowStreak = 0;
    } else {
      this.slowStreak = Math.max(0, this.slowStreak - 1);
      this.fastStreak = 0;
    }

    const idx = ORDER.indexOf(this.tier);
    if (this.slowStreak >= 2 && idx > 0) {
      this.tier = ORDER[idx - 1];
      this.slowStreak = 0;
      this.onChange(this.tier);
    } else if (this.fastStreak >= 8 && idx < ORDER.length - 1 && this._everDowngraded !== true) {
      // 一度も下げていない端末だけ、上げる余地を試す
      this.tier = ORDER[idx + 1];
      this.fastStreak = 0;
      this.onChange(this.tier);
    }
    if (this.slowStreak > 0) this._everDowngraded = true;
  }
}
