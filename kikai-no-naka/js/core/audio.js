/**
 * audio.js — 音を全部その場で合成する
 *
 * 音源ファイルを持たず、WebAudio のオシレータとノイズだけで
 * 歯車のうなり、モーターの唸り、時計のチクタク、オルゴールの音、
 * 水音、パンが飛び出す「ポンッ」までを作る。
 *
 * 連続音（voice）は機械の状態に合わせて音量とピッチが滑らかに変わるので、
 * 「速く回すと音が高くなる」といった因果が耳からも分かる。
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.enabled = true;
    this.speechEnabled = true;
    this.ready = false;
    /** @type {Map<string, Voice>} */
    this.voices = new Map();
    this._pendingUnlock = false;
    this._voiceList = null;
  }

  /* ---------------------------------------------------------------- */

  /** 最初のタップで呼ぶ（iOS は必ずユーザー操作の中で作る必要がある） */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // マスターチェーン: [voices] → reverbSend → convolver ─┐
    //                   └──────────────── dry ────────────┴→ comp → master → out
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.9 : 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    const dry = ctx.createGain();
    dry.gain.value = 0.86;
    const wet = ctx.createGain();
    wet.gain.value = 0.24;

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 1.15, 2.6);

    const input = ctx.createGain();
    input.gain.value = 1;

    input.connect(dry);
    input.connect(convolver);
    convolver.connect(wet);
    dry.connect(comp);
    wet.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    this.master = master;
    this.bus = input;
    this.reverbWet = wet;
    this.noiseBuffer = makeNoise(ctx, 2.0);
    this.ready = true;

    if (ctx.state === 'suspended') ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.05);
    }
    if (!on) window.speechSynthesis?.cancel();
  }

  setSpeechEnabled(on) {
    this.speechEnabled = on;
    if (!on) window.speechSynthesis?.cancel();
  }

  suspend() {
    this.ctx?.suspend?.();
    window.speechSynthesis?.cancel();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  /* ---------------------------------------------------------------- */
  /* 連続音                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * 名前付きの連続音を取得（なければ作る）。
   * @param {string} name
   * @param {object} spec
   */
  voice(name, spec) {
    if (!this.ready) return NULL_VOICE;
    let v = this.voices.get(name);
    if (!v) {
      v = new Voice(this, spec);
      this.voices.set(name, v);
    }
    return v;
  }

  /** 機械を切り替えるとき、連続音を全部止めて捨てる */
  clearVoices() {
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
  }

  /* ---------------------------------------------------------------- */
  /* 単発音                                                            */
  /* ---------------------------------------------------------------- */

  _now() {
    return this.ctx.currentTime;
  }

  _noiseSource(duration) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    src.start(0, Math.random() * 1.5, duration + 0.05);
    return src;
  }

  /** カチッ（スイッチ・ボタン） */
  click({ gain = 0.5, bright = 2600 } = {}) {
    if (!this.ready || !this.enabled) return;
    const t = this._now();
    const src = this._noiseSource(0.05);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = bright;
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(bp).connect(g).connect(this.bus);
    src.stop(t + 0.06);
  }

  /** チッ・カチ（脱進機／ラチェット） */
  tick({ gain = 0.35, pitch = 1 } = {}) {
    if (!this.ready || !this.enabled) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1800 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.02);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.05);

    const src = this._noiseSource(0.03);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(gain * 0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    src.connect(hp).connect(g2).connect(this.bus);
    src.stop(t + 0.04);
  }

  /**
   * オルゴールの一音。自由端の棒の倍音比（1 : 6.27 : 17.55）を使うと
   * 本物の櫛歯らしい澄んだ音になる。
   */
  musicNote(freq, { gain = 0.32, decay = 2.4, brightness = 1 } = {}) {
    if (!this.ready || !this.enabled) return;
    const t = this._now();
    const out = this.ctx.createGain();
    out.gain.value = gain;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(clamp(freq * 14 * brightness, 900, 12000), t);
    lp.frequency.exponentialRampToValueAtTime(clamp(freq * 4, 400, 8000), t + decay * 0.5);
    out.connect(lp).connect(this.bus);

    const partials = [
      { ratio: 1, amp: 1.0, dec: decay },
      { ratio: 2.02, amp: 0.22, dec: decay * 0.45 },
      { ratio: 6.27, amp: 0.16, dec: decay * 0.22 },
      { ratio: 17.55, amp: 0.05, dec: decay * 0.08 },
    ];
    for (const p of partials) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * p.ratio;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p.amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.dec);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + p.dec + 0.05);
    }
    // 爪が離れる瞬間の「カリッ」
    const src = this._noiseSource(0.02);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clamp(freq * 6, 1200, 9000);
    bp.Q.value = 2;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(gain * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    src.connect(bp).connect(g2).connect(out);
    src.stop(t + 0.04);
  }

  /** ベル（目ざまし・チン） */
  bell(freq = 880, { gain = 0.3, decay = 1.6 } = {}) {
    if (!this.ready || !this.enabled) return;
    const t = this._now();
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 1.41;
    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(freq * 3.2, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay * 0.4);
    mod.connect(modGain).connect(carrier.frequency);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    carrier.connect(g).connect(this.bus);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  /** バネが弾ける「ボヨン」（トースターのポップアップ） */
  boing({ gain = 0.34, freq = 240, decay = 0.5 } = {}) {
    if (!this.ready || !this.enabled) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 2.6, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + decay);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 17;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(freq * 0.7, t);
    lfoGain.gain.exponentialRampToValueAtTime(1, t + decay);
    lfo.connect(lfoGain).connect(osc.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(this.bus);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + decay + 0.05);
    lfo.stop(t + decay + 0.05);
  }

  /** ぽちゃん（水滴） */
  drop({ gain = 0.22, freq = 620 } = {}) {
    if (!this.ready || !this.enabled) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.6, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.9, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** ぱしゃっ（しぶき） */
  splash({ gain = 0.18 } = {}) {
    if (!this.ready || !this.enabled) return;
    const t = this._now();
    const src = this._noiseSource(0.3);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(bp).connect(g).connect(this.bus);
    src.stop(t + 0.35);
  }

  /** ふわっと明るい確認音（画面の切り替えなど） */
  chime(root = 660, { gain = 0.16 } = {}) {
    if (!this.ready || !this.enabled) return;
    [0, 4, 7].forEach((semi, i) => {
      const f = root * Math.pow(2, semi / 12);
      setTimeout(() => this.musicNote(f, { gain: gain * (1 - i * 0.15), decay: 1.1 }), i * 55);
    });
  }

  /* ---------------------------------------------------------------- */
  /* 読み上げ                                                          */
  /* ---------------------------------------------------------------- */

  /** 部品の名前をひらがなで読み上げる */
  speak(text) {
    if (!this.speechEnabled || !this.enabled) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.92;
      u.pitch = 1.15;
      u.volume = 0.95;
      if (!this._voiceList || this._voiceList.length === 0) this._voiceList = synth.getVoices();
      const ja = this._voiceList?.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
      if (ja) u.voice = ja;
      synth.speak(u);
    } catch {
      /* 読み上げが使えない端末では黙って諦める */
    }
  }
}

/* ------------------------------------------------------------------ */
/* 連続音のボイス                                                      */
/* ------------------------------------------------------------------ */

const NULL_VOICE = {
  set() {},
  stop() {},
  dispose() {},
};

class Voice {
  /**
   * @param {AudioEngine} engine
   * @param {object} spec
   * @param {'noise'|'tone'} spec.source
   * @param {OscillatorType} [spec.type]
   * @param {'lowpass'|'bandpass'|'highpass'} [spec.filter]
   * @param {number} [spec.freq] 初期周波数
   * @param {number} [spec.Q]
   * @param {number} [spec.detune] うなりを作る第2オシレータのデチューン（セント）
   */
  constructor(engine, spec = {}) {
    const ctx = engine.ctx;
    this.engine = engine;
    this.ctx = ctx;
    this.spec = spec;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    /** @type {BiquadFilterNode|null} */
    this.filter = null;
    if (spec.filter) {
      this.filter = ctx.createBiquadFilter();
      this.filter.type = spec.filter;
      this.filter.frequency.value = spec.freq ?? 800;
      this.filter.Q.value = spec.Q ?? 1;
      this.filter.connect(this.gain);
    }

    const dest = this.filter || this.gain;

    this.oscs = [];
    if (spec.source === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = engine.noiseBuffer;
      src.loop = true;
      src.start();
      src.connect(dest);
      this.noise = src;
    } else {
      const mk = (detune = 0) => {
        const o = ctx.createOscillator();
        o.type = spec.type || 'sawtooth';
        o.frequency.value = spec.freq ?? 120;
        o.detune.value = detune;
        o.connect(dest);
        o.start();
        return o;
      };
      this.oscs.push(mk(0));
      if (spec.detune) this.oscs.push(mk(spec.detune));
    }

    this.gain.connect(engine.bus);
    this._level = 0;
  }

  /**
   * @param {object} p
   * @param {number} [p.level] 音量 0..1
   * @param {number} [p.freq] 周波数（tone なら発振、noise ならフィルタ）
   * @param {number} [p.filterFreq] フィルタ周波数（tone のとき別指定）
   * @param {number} [p.Q]
   * @param {number} [p.smooth] 追従の時定数（秒）
   */
  set({ level, freq, filterFreq, Q, smooth = 0.06 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (level !== undefined) {
      this._level = level;
      this.gain.gain.setTargetAtTime(clamp(level, 0, 1.5), t, smooth);
    }
    if (freq !== undefined) {
      const f = clamp(freq, 20, 16000);
      if (this.oscs.length) {
        for (const o of this.oscs) o.frequency.setTargetAtTime(f, t, smooth);
      } else if (this.filter) {
        this.filter.frequency.setTargetAtTime(f, t, smooth);
      }
    }
    if (filterFreq !== undefined && this.filter) {
      this.filter.frequency.setTargetAtTime(clamp(filterFreq, 20, 16000), t, smooth);
    }
    if (Q !== undefined && this.filter) {
      this.filter.Q.setTargetAtTime(clamp(Q, 0.05, 40), t, smooth);
    }
  }

  stop() {
    this.set({ level: 0, smooth: 0.05 });
  }

  dispose() {
    try {
      this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gain.gain.value = 0;
      for (const o of this.oscs) {
        o.stop();
        o.disconnect();
      }
      this.noise?.stop();
      this.noise?.disconnect();
      this.filter?.disconnect();
      this.gain.disconnect();
    } catch {
      /* すでに止まっている場合は無視 */
    }
  }
}

/* ------------------------------------------------------------------ */
/* バッファ生成                                                        */
/* ------------------------------------------------------------------ */

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // 少しピンクがかったノイズ（白より耳ざわりが柔らかい）
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }
  return buf;
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // 初期反射をまばらに、後半をなめらかに
      const sparse = t < 0.06 && Math.random() > 0.86 ? 2.2 : 1;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * sparse * 0.6;
    }
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* 音階ヘルパー                                                        */
/* ------------------------------------------------------------------ */

/** 中央ハを基準にした平均律の周波数（半音単位） */
export function semitoneToFreq(semitone, base = 261.6256) {
  return base * Math.pow(2, semitone / 12);
}
