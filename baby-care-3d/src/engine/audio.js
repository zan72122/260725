/* ============================================================================
 * audio.js — the game's sound library
 * ----------------------------------------------------------------------------
 * Every sound in this game is synthesised. There are no audio files, and there
 * never will be. What stops that from sounding like a 1980s handheld is how
 * each sound is *built*:
 *
 *   transient + body + tail
 *     A cookie crumbling is a sharp filtered noise snap (transient), a short
 *     granular scatter of little cracks (body) and a dusty decay (tail).
 *     Nearly every recipe below has those three parts.
 *
 *   per-trigger variation
 *     Every voice re-rolls pitch (a few tens of cents), timing and filter
 *     positions from its own RNG, so the fiftieth block placement of the
 *     afternoon still doesn't sound like a copy-paste.
 *
 *   a room
 *     Dry synthesis sounds like a synthesiser. Everything goes through a
 *     procedurally-generated convolution reverb — the tiled bathroom, the
 *     soft nursery, or the wide dreamy hall for the sleep scene.
 *
 * Baby vocalisations use formant synthesis: a jittering glottal saw through a
 * bank of bandpass formants placed for an *infant* vocal tract (roughly 1.6×
 * the formant frequencies of an adult male), plus a breath-noise layer. The
 * pitch contour is what actually sells it as a baby rather than a synth, so
 * every vocal recipe below specifies its contour as breakpoints.
 *
 * Public API (see CONTRACTS.md):
 *     unlock() / play(name, {rate,gain,pan}) / loop(name,opts)
 *     bgm(name,{fade}) / setMuted(v)
 * ========================================================================== */

import { Synth, midiToFreq, clamp, lerp, mulberry32, SPACES } from './synth.js';
import { Music } from './music.js';

/* ----------------------------------------------------------- formants ---- */

/**
 * Infant vowel formants. F1/F2 sit far higher than an adult's because the
 * vocal tract is ~7 cm rather than ~17 cm. `bw` is the formant bandwidth
 * (wider = breathier, less "vowel-y"), `g` the relative level.
 */
const VOWELS = {
  a:  { f: [1100, 1650, 3300, 4400], bw: [130, 170, 260, 340], g: [1.00, 0.72, 0.30, 0.16] }, // あ
  ae: { f: [1250, 2150, 3400, 4500], bw: [140, 180, 260, 340], g: [1.00, 0.80, 0.30, 0.14] }, // bright あ (cry)
  e:  { f: [ 820, 2450, 3350, 4400], bw: [110, 170, 240, 320], g: [1.00, 0.78, 0.32, 0.14] }, // え
  i:  { f: [ 460, 3150, 3900, 4700], bw: [ 90, 190, 260, 340], g: [1.00, 0.62, 0.28, 0.12] }, // い
  o:  { f: [ 720, 1250, 3200, 4300], bw: [110, 150, 250, 330], g: [1.00, 0.70, 0.24, 0.12] }, // お
  u:  { f: [ 540, 1120, 3000, 4200], bw: [100, 140, 250, 330], g: [1.00, 0.55, 0.20, 0.10] }, // う
  schwa:{f: [ 900, 1750, 3200, 4300], bw: [120, 170, 250, 330], g: [1.00, 0.60, 0.26, 0.12] },
  m:  { f: [ 330, 1150, 2350, 3400], bw: [ 90, 200, 300, 400], g: [1.00, 0.30, 0.12, 0.06] }, // nasal / lips closed
  w:  { f: [ 430,  950, 2600, 3800], bw: [100, 150, 280, 360], g: [1.00, 0.45, 0.16, 0.08] }
};

const vowelOf = n => VOWELS[n] || VOWELS.a;

/* ------------------------------------------------------------- Voice ----- */

let __voiceSeed = 0x1234567;

/**
 * One triggered sound. Recipes are written against this: they call
 * `v.tone()`, `v.noise()`, `v.vox()` with times *relative to the voice start*,
 * which keeps the recipes readable as little scores.
 */
class Voice {
  constructor(audio, opts = {}) {
    const A = audio;
    this.A = A;
    this.S = A.synth;
    this.ctx = A.ctx;
    this.rng = mulberry32((__voiceSeed = (__voiceSeed * 1664525 + 1013904223) >>> 0));

    this.t = opts.when != null ? opts.when : this.ctx.currentTime + 0.002;
    this.rate = opts.rate != null ? opts.rate : 1;   // pitch multiplier
    this.speed = opts.speed != null ? opts.speed : 1; // time multiplier
    this.end = this.t;

    this._nodes = [];
    this._srcs = [];

    // bus → panner → out → destination (+ reverb sends)
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.out = this.ctx.createGain();
    this.out.gain.value = opts.gain != null ? opts.gain : 1;

    let head = this.bus;
    if (this.ctx.createStereoPanner) {
      this.panner = this.ctx.createStereoPanner();
      this.panner.pan.value = clamp(opts.pan || 0, -1, 1);
      this.bus.connect(this.panner);
      head = this.panner;
      this._nodes.push(this.panner);
    }
    head.connect(this.out);
    this._nodes.push(this.bus, this.out);

    this.dest = opts.dest || A.sfxBus;
    this.out.connect(this.dest);

    this._space = opts.space || A.space;
    this._sendGain = null;
  }

  /* --------------------------------------------------------- helpers -- */

  rnd(a = 0, b = 1) { return a + this.rng() * (b - a); }
  /** Random pitch ratio, ±`c` cents. */
  vary(c = 40) { return Math.pow(2, this.rnd(-c, c) / 1200); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length) % arr.length]; }
  coin(p = 0.5) { return this.rng() < p; }
  /** Mark the voice as living at least until `t` seconds after its start. */
  until(t) { this.end = Math.max(this.end, this.t + t); return this.end; }

  /** Send this voice to a room. amount 0..1. */
  room(space, amount = 0.25) {
    const bus = this.A.roomBus(space || this._space);
    if (!bus) return this;
    if (!this._sendGain) {
      this._sendGain = this.ctx.createGain();
      this.out.connect(this._sendGain);
      this._nodes.push(this._sendGain);
    }
    this._sendGain.gain.value = amount;
    this._sendGain.disconnect();
    this._sendGain.connect(bus.input);
    return this;
  }

  /** Send this voice to the shared stereo delay. */
  echo(amount = 0.2) {
    const d = this.A.delayBus();
    if (!d) return this;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    this.out.connect(g);
    g.connect(d.input);
    this._nodes.push(g);
    return this;
  }

  _panned(node, pan) {
    if (pan == null || pan === 0 || !this.ctx.createStereoPanner) return node;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    node.connect(p);
    this._nodes.push(p);
    return p;
  }

  /* ----------------------------------------------------------- tone --- */

  /**
   * A pitched layer. `f`/`to` are in Hz *before* the voice rate is applied.
   */
  tone(o = {}) {
    const S = this.S;
    const t = this.t + (o.t || 0) * this.speed;
    const dur = Math.max(0.008, (o.dur != null ? o.dur : 0.25) * this.speed);
    const f = Math.max(8, (o.f != null ? o.f : 440) * this.rate * (o.ratio || 1));
    const to = o.to != null ? Math.max(8, o.to * this.rate * (o.ratio || 1)) : null;

    const osc = S.osc({
      type: o.type || 'sine', freq: f, detune: o.detune || 0,
      when: t, dur, glideTo: to, glide: o.glide != null ? o.glide * this.speed : null,
      curve: o.curve || 'exp'
    });
    const env = S.env({
      when: t, dur,
      a: o.a != null ? o.a : 0.004, d: o.d != null ? o.d : dur * 0.6,
      s: o.s != null ? o.s : 0, r: o.r != null ? o.r : 0.03,
      peak: o.gain != null ? o.gain : 0.3,
      shape: o.shape || 'exp'
    });
    let node = osc;
    if (o.filter) {
      const flt = S.filter({
        type: o.filter, freq: (o.ff || 1200) * (o.filterRate === false ? 1 : this.rate),
        q: o.fq || 1, when: t, to: o.fto ? o.fto * this.rate : null, sweep: o.fsweep, dur
      });
      node.connect(flt); node = flt; this._nodes.push(flt);
    }
    node.connect(env);
    this._panned(env, o.pan).connect(o.dest || this.bus);

    if (o.vib) {
      const l = S.lfo({
        freq: o.vib.rate || 5, depth: o.vib.depth || 10, target: osc.detune,
        when: t, dur, delay: o.vib.delay || 0
      });
      this._srcs.push(l.osc); this._nodes.push(l.gain);
    }
    if (o.jitter) {
      const j = S.jitter(osc.detune, { depth: o.jitter, rate: o.jitterRate || 30, when: t, dur });
      this._srcs.push(j.src); this._nodes.push(j.gain);
    }
    this._srcs.push(osc);
    this._nodes.push(osc, env);
    this.end = Math.max(this.end, env.end);
    return env;
  }

  /** Detuned stack — for balloons, hums, motors, pads. */
  stack(o = {}) {
    const S = this.S;
    const t = this.t + (o.t || 0) * this.speed;
    const dur = Math.max(0.02, (o.dur != null ? o.dur : 0.4) * this.speed);
    const u = S.unison({
      type: o.type || 'sawtooth', freq: (o.f || 220) * this.rate,
      voices: o.voices || 3, spread: o.spread || 12, when: t, dur
    });
    const env = S.env({
      when: t, dur, a: o.a != null ? o.a : 0.01, d: o.d != null ? o.d : dur * 0.5,
      s: o.s != null ? o.s : 0.5, r: o.r != null ? o.r : 0.15,
      peak: o.gain != null ? o.gain : 0.2
    });
    let node = u.out;
    if (o.filter !== null) {
      const flt = S.filter({
        type: o.filter || 'lowpass', freq: o.ff || 1400, q: o.fq || 1,
        when: t, to: o.fto || null, sweep: o.fsweep, dur
      });
      node.connect(flt); node = flt; this._nodes.push(flt);
    }
    node.connect(env);
    this._panned(env, o.pan).connect(o.dest || this.bus);
    for (const osc of u.oscs) this._srcs.push(osc);
    this._nodes.push(u.out, env);
    this.end = Math.max(this.end, env.end);
    return env;
  }

  /* ---------------------------------------------------------- noise --- */

  /**
   * A noise layer. Filter type defaults to bandpass; `f`→`to` sweeps the
   * cutoff, which is how nearly every water, cloth and crunch sound gets its
   * movement.
   */
  noise(o = {}) {
    const S = this.S;
    const t = this.t + (o.t || 0) * this.speed;
    const dur = Math.max(0.008, (o.dur != null ? o.dur : 0.2) * this.speed);
    const src = S.noiseSource({
      kind: o.kind || 'white', when: t, dur,
      rate: (o.rate || 1) * (o.pitched === false ? 1 : this.rate)
    });
    const flt = S.filter({
      type: o.filter || 'bandpass',
      freq: (o.f != null ? o.f : 1200) * (o.pitched === false ? 1 : this.rate),
      q: o.q != null ? o.q : 1, when: t,
      to: o.to != null ? o.to * (o.pitched === false ? 1 : this.rate) : null,
      sweep: o.sweep != null ? o.sweep * this.speed : null, dur, curve: o.curve || 'exp'
    });
    const env = S.env({
      when: t, dur,
      a: o.a != null ? o.a : 0.003, d: o.d != null ? o.d : dur * 0.7,
      s: o.s != null ? o.s : 0, r: o.r != null ? o.r : 0.03,
      peak: o.gain != null ? o.gain : 0.2, shape: o.shape || 'exp'
    });
    src.connect(flt); flt.connect(env);
    let tail = env;
    if (o.crush) { const c = S.bitcrush({ bits: o.crush }); env.connect(c); tail = c; this._nodes.push(c); }
    if (o.drive) { const w = S.shaper({ amount: o.drive }); tail.connect(w); tail = w; this._nodes.push(w); }
    this._panned(tail, o.pan).connect(o.dest || this.bus);

    if (o.wobble) {
      const j = S.jitter(flt.frequency, {
        depth: o.wobble, rate: o.wobbleRate || 9, when: t, dur
      });
      this._srcs.push(j.src); this._nodes.push(j.gain);
    }
    this._srcs.push(src);
    this._nodes.push(src, flt, env);
    this.end = Math.max(this.end, env.end);
    return env;
  }

  /** Very short filtered noise — the "attack" of a physical object. */
  click(o = {}) {
    return this.noise(Object.assign({
      dur: 0.018, f: 3000, q: 0.9, filter: 'highpass', gain: 0.18, a: 0.0008, d: 0.012
    }, o));
  }

  /* ------------------------------------------------------- formants --- */

  /**
   * Formant-synthesised vocal.
   *
   *  f0     number | [[fraction, hz], ...]   pitch contour over the note
   *  vowel  name   | [[fraction, name], ...] morphing vowel targets
   *  breath 0..1   amount of aspiration noise (also routed through formants)
   *  tension 0..1  glottal source brightness — a strained cry is "tight"
   */
  vox(o = {}) {
    const S = this.S, ctx = this.ctx;
    const t = this.t + (o.t || 0) * this.speed;
    const dur = Math.max(0.03, (o.dur != null ? o.dur : 0.5) * this.speed);
    const rate = this.rate;

    const contour = Array.isArray(o.f0) ? o.f0 : [[0, o.f0 || 380]];
    const vseq = Array.isArray(o.vowel) ? o.vowel : [[0, o.vowel || 'a']];
    const tension = o.tension != null ? o.tension : 0.45;
    const gain = o.gain != null ? o.gain : 0.32;

    /* --- glottal source ------------------------------------------------ */
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    const f0at = i => Math.max(40, contour[i][1] * rate);
    src.frequency.setValueAtTime(f0at(0), t);
    for (let i = 1; i < contour.length; i++) {
      const tt = t + clamp(contour[i][0], 0, 1) * dur;
      src.frequency.exponentialRampToValueAtTime(f0at(i), Math.max(tt, t + 0.001));
    }
    src.start(t); src.stop(t + dur + 0.06); src.__stopAt = t + dur + 0.06;

    // A second, quieter source an octave up sharpens the "cry" register.
    let src2 = null;
    if (tension > 0.35) {
      src2 = ctx.createOscillator();
      src2.type = 'square';
      src2.frequency.setValueAtTime(f0at(0) * 2, t);
      for (let i = 1; i < contour.length; i++) {
        const tt = t + clamp(contour[i][0], 0, 1) * dur;
        src2.frequency.exponentialRampToValueAtTime(f0at(i) * 2, Math.max(tt, t + 0.001));
      }
      src2.detune.value = this.rnd(-9, 9);
      src2.start(t); src2.stop(t + dur + 0.06); src2.__stopAt = t + dur + 0.06;
    }

    // jitter (pitch irregularity) + shimmer (amplitude irregularity)
    const jit = S.jitter(src.detune, {
      depth: o.jitter != null ? o.jitter : 22, rate: 42, when: t, dur: dur + 0.05
    });
    this._srcs.push(jit.src); this._nodes.push(jit.gain);
    if (src2) {
      const j2 = S.jitter(src2.detune, { depth: (o.jitter != null ? o.jitter : 22) * 1.4, rate: 55, when: t, dur: dur + 0.05 });
      this._srcs.push(j2.src); this._nodes.push(j2.gain);
    }
    if (o.vib) {
      const l = S.lfo({
        freq: o.vib.rate || 5.5, depth: o.vib.depth || 18, target: src.detune,
        when: t, dur, delay: o.vib.delay || 0.1
      });
      this._srcs.push(l.osc); this._nodes.push(l.gain);
    }

    // Glottal spectral tilt: a lowpass tracking f0 decides how buzzy it is.
    const tilt = S.filter({
      type: 'lowpass', when: t, dur,
      freq: clamp(contour[0][1] * rate * (3 + tension * 16), 300, 7000),
      q: 0.7,
      to: clamp(contour[contour.length - 1][1] * rate * (3 + tension * 16), 300, 7000)
    });
    const srcMix = ctx.createGain();
    srcMix.gain.value = 0.5;
    src.connect(tilt);
    if (src2) { const g2 = ctx.createGain(); g2.gain.value = 0.18 * tension; src2.connect(g2); g2.connect(tilt); this._nodes.push(g2); }
    tilt.connect(srcMix);

    // shimmer: slow random amplitude wobble on the source
    if (o.shimmer !== 0) {
      const sh = S.randomMod({ dur: Math.min(2, dur + 0.2), rate: 17 });
      const shg = ctx.createGain();
      shg.gain.value = (o.shimmer != null ? o.shimmer : 0.1) * 0.5;
      sh.connect(shg); shg.connect(srcMix.gain);
      sh.start(t); sh.stop(t + dur + 0.06); sh.__stopAt = t + dur + 0.06;
      this._srcs.push(sh); this._nodes.push(shg);
    }

    /* --- formant bank -------------------------------------------------- */
    const v0 = vowelOf(vseq[0][1]);
    const bank = S.formantBank(v0.f.map((f, i) => ({ f, bw: v0.bw[i], gain: v0.g[i] })), t);
    for (let i = 1; i < vseq.length; i++) {
      const vv = vowelOf(vseq[i][1]);
      const tt = t + clamp(vseq[i][0], 0, 1) * dur;
      bank.filters.forEach((ff, k) => {
        ff.bp.frequency.linearRampToValueAtTime(clamp(vv.f[k], 60, ctx.sampleRate * 0.45), tt);
        ff.bp.Q.linearRampToValueAtTime(Math.max(0.4, vv.f[k] / vv.bw[k]), tt);
        ff.g.gain.linearRampToValueAtTime(vv.g[k], tt);
      });
    }
    srcMix.connect(bank.input);

    /* --- breath -------------------------------------------------------- */
    if (o.breath) {
      const bn = S.noiseSource({ kind: 'pink', when: t, dur: dur + 0.04 });
      const bf = S.filter({
        type: 'bandpass', freq: 1600, q: 0.7, when: t, dur,
        to: o.breathTo || 2600
      });
      const bg = S.env({
        when: t, dur, a: Math.max(0.01, dur * 0.12), d: dur * 0.4,
        s: 0.7, r: dur * 0.35, peak: o.breath * 0.5
      });
      bn.connect(bf); bf.connect(bg);
      bg.connect(bank.input);            // voiced breathiness…
      const direct = ctx.createGain();
      direct.gain.value = 0.55;
      bg.connect(direct); direct.connect(this.bus);   // …plus air on top
      this._srcs.push(bn);
      this._nodes.push(bn, bf, bg, direct);
    }

    /* --- output envelope ----------------------------------------------- */
    const env = S.env({
      when: t, dur,
      a: o.a != null ? o.a : 0.025, d: o.d != null ? o.d : dur * 0.35,
      s: o.s != null ? o.s : 0.85, r: o.r != null ? o.r : Math.max(0.05, dur * 0.28),
      peak: gain
    });
    let tail = bank.output;
    if (o.drive) { const w = S.shaper({ amount: o.drive }); tail.connect(w); tail = w; this._nodes.push(w); }
    tail.connect(env);
    // A gentle mouth-radiation high shelf — heads are not omnidirectional.
    const mouth = S.filter({ type: 'highshelf', freq: 3000, gain: -4 });
    env.connect(mouth);
    this._panned(mouth, o.pan).connect(o.dest || this.bus);

    this._srcs.push(src);
    if (src2) this._srcs.push(src2);
    this._nodes.push(src, tilt, srcMix, bank.input, bank.output, env, mouth);
    for (const f of bank.filters) this._nodes.push(f.bp, f.g);
    this.end = Math.max(this.end, env.end);
    return env;
  }

  /* --------------------------------------------------------- finish --- */

  finish() {
    this.S.autoClean(this._nodes, this._srcs, this.end + 0.05);
    return this;
  }
}

/* ============================================================ recipes ===== */
/* Each recipe is `(v, o) => void`. `v` is the Voice, `o` the caller options.  */

const SOUNDS = {

  /* ---------------------------------------------------------- feeding -- */

  /** Rhythmic negative-pressure suck on a bottle teat. */
  'feed.suck': (v) => {
    const f = v.rnd(0.92, 1.08);
    v.noise({ dur: 0.13, kind: 'pink', f: 640 * f, to: 300, q: 4.2, gain: 0.16, a: 0.02, d: 0.09 });
    v.tone({ f: 235 * f, to: 165, dur: 0.12, type: 'sine', gain: 0.1, a: 0.02 });
    v.tone({ t: 0.11, f: 160, to: 220, dur: 0.06, type: 'sine', gain: 0.05, a: 0.01 });
    v.noise({ t: 0.115, dur: 0.05, f: 1500, to: 800, q: 2, gain: 0.05 });
    v.room('nursery', 0.1);
  },

  /** Swallow — throat click, descending liquid gulp, small after-pop. */
  'feed.gulp': (v) => {
    const f = v.rnd(0.9, 1.12);
    v.noise({ dur: 0.02, f: 900, q: 3, gain: 0.09, filter: 'bandpass' });
    v.tone({ t: 0.01, f: 330 * f, to: 118, dur: 0.19, type: 'sine', gain: 0.26, a: 0.008, glide: 0.14 });
    v.tone({ t: 0.02, f: 660 * f, to: 210, dur: 0.11, type: 'triangle', gain: 0.06 });
    v.noise({ t: 0.02, dur: 0.16, kind: 'brown', f: 520, to: 180, q: 2.4, gain: 0.1 });
    v.tone({ t: 0.2, f: 150, to: 380, dur: 0.07, type: 'sine', gain: 0.1, a: 0.004 });
    v.room('nursery', 0.12);
  },

  /** 「ぷはー」 — lips release, then a satisfied breathy sigh. */
  'feed.puha': (v) => {
    v.noise({ dur: 0.055, f: 1100, to: 2200, q: 1.1, gain: 0.2, a: 0.002, d: 0.04 });
    v.tone({ f: 420, to: 260, dur: 0.06, type: 'triangle', gain: 0.1 });
    v.vox({
      t: 0.05, dur: 0.42, gain: 0.2, breath: 0.75, tension: 0.2, jitter: 16,
      f0: [[0, 430], [0.25, 470], [1, 300]],
      vowel: [[0, 'u'], [0.2, 'a'], [1, 'a']], a: 0.05, r: 0.18
    });
    v.room('nursery', 0.16);
  },

  /** Burp — a low bubbling belch with a comic tail. */
  'feed.burp': (v) => {
    const f = v.rnd(0.88, 1.14);
    v.noise({ dur: 0.05, f: 500, to: 240, q: 2, gain: 0.12 });
    v.tone({ f: 128 * f, to: 74, dur: 0.3, type: 'sawtooth', gain: 0.2, a: 0.02, d: 0.24, filter: 'lowpass', ff: 900, fto: 380 });
    v.tone({ t: 0.03, f: 93 * f, to: 58, dur: 0.26, type: 'square', gain: 0.07, a: 0.03, filter: 'lowpass', ff: 600 });
    v.noise({ t: 0.01, dur: 0.3, kind: 'brown', f: 420, to: 170, q: 3.2, gain: 0.14, wobble: 90, wobbleRate: 26 });
    v.tone({ t: 0.28, f: 150 * f, to: 110, dur: 0.12, type: 'triangle', gain: 0.05 });
    v.room('nursery', 0.2);
  },

  /** Spoon meeting a bowl rim. */
  'feed.spoon': (v) => {
    const f = v.rnd(0.94, 1.1);
    v.click({ dur: 0.01, f: 5200, gain: 0.14 });
    v.tone({ f: 2350 * f, dur: 0.19, type: 'sine', gain: 0.16, a: 0.001, d: 0.15 });
    v.tone({ f: 3810 * f, dur: 0.13, type: 'sine', gain: 0.09, a: 0.001, d: 0.1 });
    v.tone({ f: 6100 * f, dur: 0.07, type: 'sine', gain: 0.04, a: 0.001 });
    v.room('nursery', 0.22);
  },

  /** Apple bite — hard shear transient, wet snap, juicy tail. */
  'feed.bite': (v) => {
    const f = v.rnd(0.9, 1.12);
    v.noise({ dur: 0.035, f: 3400 * f, to: 1500, q: 1.2, gain: 0.3, a: 0.0008, d: 0.03, filter: 'bandpass' });
    v.noise({ t: 0.012, dur: 0.1, kind: 'pink', f: 1500 * f, to: 520, q: 2.2, gain: 0.2, d: 0.08, crush: 8 });
    v.tone({ t: 0.008, f: 240 * f, to: 130, dur: 0.09, type: 'triangle', gain: 0.1 });
    // little secondary cracks
    for (let i = 0; i < 3; i++) {
      v.noise({ t: 0.05 + i * v.rnd(0.02, 0.05), dur: 0.03, f: v.rnd(1800, 3600), q: 3, gain: v.rnd(0.04, 0.1) });
    }
    v.room('nursery', 0.12);
  },

  /** Soft chew — gentle wet compressions, no crack. */
  'feed.chew': (v) => {
    const n = 2 + Math.floor(v.rnd(0, 2));
    for (let i = 0; i < n; i++) {
      const t = i * v.rnd(0.13, 0.18);
      v.noise({ t, dur: 0.07, kind: 'pink', f: v.rnd(700, 1100), to: 320, q: 2.6, gain: 0.11, a: 0.008 });
      v.tone({ t, f: v.rnd(150, 210), to: 105, dur: 0.07, type: 'sine', gain: 0.07 });
    }
    v.room('nursery', 0.1);
  },

  /** Straw punching through the foil hole — 「プスッ」 */
  'feed.straw-pierce': (v) => {
    v.noise({ dur: 0.025, f: 4200, to: 2200, q: 1.4, gain: 0.22, a: 0.0006, d: 0.02 });
    v.noise({ t: 0.012, dur: 0.07, f: 2400, to: 700, q: 3.5, gain: 0.16, d: 0.05 });
    v.tone({ t: 0.01, f: 880, to: 260, dur: 0.06, type: 'triangle', gain: 0.12, glide: 0.05 });
    v.tone({ t: 0.03, f: 320, to: 240, dur: 0.08, type: 'sine', gain: 0.05 });
    v.room('nursery', 0.14);
  },

  /** The last of the juice — 「ズゾゾー」 */
  'feed.straw-slurp': (v, o) => {
    const dur = (o.dur || 0.75);
    v.noise({ dur, kind: 'white', f: 1450, to: 380, q: 5.5, gain: 0.16, a: 0.05, d: dur * 0.5, s: 0.5, r: 0.15, wobble: 260, wobbleRate: 13 });
    v.noise({ dur, kind: 'pink', f: 2600, to: 1400, q: 2, gain: 0.07, a: 0.08, s: 0.6, r: 0.2 });
    v.tone({ f: 330, to: 140, dur: dur * 0.9, type: 'sawtooth', gain: 0.04, a: 0.06, s: 0.5, r: 0.15, filter: 'lowpass', ff: 700, fto: 300, vib: { rate: 11, depth: 30 } });
    // gurgling bubbles at the end
    for (let i = 0; i < 5; i++) {
      const t = dur * 0.55 + i * v.rnd(0.03, 0.07);
      v.tone({ t, f: v.rnd(320, 700), to: v.rnd(700, 1500), dur: 0.05, type: 'sine', gain: 0.06 });
    }
    v.room('nursery', 0.12);
  },

  /** Plastic packet being squeezed. */
  'feed.crumple': (v) => {
    const n = 7 + Math.floor(v.rnd(0, 5));
    for (let i = 0; i < n; i++) {
      const t = v.rnd(0, 0.34);
      v.noise({ t, dur: v.rnd(0.012, 0.035), f: v.rnd(2200, 6200), q: v.rnd(2, 7), gain: v.rnd(0.03, 0.12), a: 0.001 });
    }
    v.noise({ dur: 0.36, kind: 'white', f: 3400, to: 5200, q: 0.8, gain: 0.05, a: 0.02, s: 0.4, r: 0.1 });
    v.room('nursery', 0.1);
  },

  /** Banana skin tearing down in one strip. */
  'feed.peel': (v) => {
    const dur = 0.34;
    v.noise({ dur, kind: 'pink', f: 900, to: 2600, q: 1.6, gain: 0.16, a: 0.02, d: dur * 0.5, s: 0.5, r: 0.1, wobble: 400, wobbleRate: 22 });
    for (let i = 0; i < 9; i++) {
      v.noise({ t: v.rnd(0.01, dur * 0.9), dur: 0.014, f: v.rnd(1800, 4800), q: 5, gain: v.rnd(0.02, 0.07) });
    }
    v.tone({ f: 180, to: 120, dur: 0.12, type: 'sine', gain: 0.05 });
    v.room('nursery', 0.12);
  },

  /** Rice ball squished in a small hand. */
  'feed.squish': (v) => {
    v.noise({ dur: 0.22, kind: 'brown', f: 480, to: 220, q: 2.2, gain: 0.16, a: 0.03, d: 0.16, wobble: 120, wobbleRate: 15 });
    v.noise({ dur: 0.2, kind: 'white', f: 2600, to: 1200, q: 1.4, gain: 0.05, a: 0.04 });
    v.tone({ f: 150, to: 96, dur: 0.2, type: 'sine', gain: 0.09, a: 0.03 });
    for (let i = 0; i < 4; i++) v.noise({ t: v.rnd(0.02, 0.18), dur: 0.01, f: v.rnd(2500, 5000), q: 6, gain: 0.03 });
    v.room('nursery', 0.1);
  },

  /** Cookie breaking into crumbs. */
  'feed.crumble': (v) => {
    v.noise({ dur: 0.04, f: 2600, to: 900, q: 1.1, gain: 0.24, a: 0.0008, d: 0.035 });
    v.tone({ f: 300, to: 140, dur: 0.08, type: 'triangle', gain: 0.08 });
    const n = 9 + Math.floor(v.rnd(0, 6));
    for (let i = 0; i < n; i++) {
      const t = 0.02 + Math.pow(v.rnd(0, 1), 1.6) * 0.4;
      v.noise({ t, dur: v.rnd(0.008, 0.02), f: v.rnd(2200, 6800), q: v.rnd(4, 10), gain: v.rnd(0.02, 0.08) * (1 - t) });
    }
    v.room('nursery', 0.14);
  },

  /** Warm cloth wiped across a face. */
  'feed.wipe': (v) => {
    const dur = 0.3;
    v.noise({ dur, kind: 'pink', f: 900, to: 2400, q: 0.9, gain: 0.13, a: 0.05, d: 0.1, s: 0.6, r: 0.12, wobble: 300, wobbleRate: 7 });
    v.noise({ t: 0.05, dur: dur * 0.8, kind: 'white', f: 3800, to: 2000, q: 0.7, gain: 0.05, a: 0.06, s: 0.5, r: 0.1 });
    v.room('nursery', 0.14);
  },

  /** 「ぷいっ」 — a small refusal, lips and a two-note falling sulk. */
  'feed.refuse': (v) => {
    v.noise({ dur: 0.05, f: 900, to: 1800, q: 1.5, gain: 0.12, a: 0.002 });
    v.vox({
      dur: 0.16, gain: 0.24, breath: 0.3, tension: 0.35, jitter: 30,
      f0: [[0, 480], [1, 430]], vowel: [[0, 'u'], [1, 'i']], a: 0.02, r: 0.06
    });
    v.vox({
      t: 0.17, dur: 0.2, gain: 0.2, breath: 0.2, tension: 0.3, jitter: 30,
      f0: [[0, 420], [1, 330]], vowel: [[0, 'i'], [1, 'a']], a: 0.02, r: 0.09
    });
    v.room('nursery', 0.18);
  },

  /* ------------------------------------------------------------- bath -- */

  /** Tap running into a tub — hiss plus a hollow splashing column. */
  'bath.tap': (v, o) => {
    const dur = o.dur || 1.2;
    v.noise({ dur, kind: 'white', f: 2300, to: 1900, q: 0.6, gain: 0.11, a: 0.05, s: 0.8, r: 0.15, wobble: 500, wobbleRate: 6 });
    v.noise({ dur, kind: 'pink', f: 620, to: 700, q: 1.4, gain: 0.1, a: 0.06, s: 0.8, r: 0.2, wobble: 200, wobbleRate: 11 });
    v.noise({ dur, kind: 'brown', f: 260, q: 1.1, gain: 0.06, a: 0.08, s: 0.8, r: 0.2 });
    for (let i = 0; i < Math.floor(dur * 9); i++) {
      const t = v.rnd(0.05, dur - 0.05);
      v.tone({ t, f: v.rnd(400, 1300), to: v.rnd(900, 2400), dur: 0.045, type: 'sine', gain: v.rnd(0.02, 0.05) });
    }
    v.room('bathroom', 0.3);
  },

  /** Tub filling — the resonant column rises in pitch as the water rises. */
  'bath.fill': (v, o) => {
    const dur = o.dur || 2.4;
    v.noise({ dur, kind: 'white', f: 900, to: 2000, q: 2.4, gain: 0.1, a: 0.15, s: 0.85, r: 0.25, sweep: dur, wobble: 300, wobbleRate: 5 });
    v.noise({ dur, kind: 'brown', f: 300, to: 620, q: 1.6, gain: 0.09, a: 0.15, s: 0.85, r: 0.3, sweep: dur });
    v.tone({ f: 180, to: 330, dur, type: 'sine', gain: 0.05, a: 0.2, s: 0.8, r: 0.3, glide: dur, vib: { rate: 3.2, depth: 20 } });
    for (let i = 0; i < Math.floor(dur * 7); i++) {
      const p = i / (dur * 7);
      v.tone({ t: v.rnd(0.1, dur - 0.1), f: lerp(320, 900, p) * v.rnd(0.8, 1.3), to: lerp(700, 1900, p), dur: 0.05, type: 'sine', gain: v.rnd(0.02, 0.045) });
    }
    v.room('bathroom', 0.35);
  },

  /** Small splash — a hand or a foot. */
  'bath.splash': (v) => {
    const f = v.rnd(0.9, 1.15);
    v.noise({ dur: 0.045, kind: 'white', f: 2600 * f, to: 1300, q: 0.9, gain: 0.22, a: 0.001, d: 0.04 });
    v.noise({ t: 0.01, dur: 0.3, kind: 'pink', f: 1500 * f, to: 420, q: 1.2, gain: 0.16, a: 0.008, d: 0.24 });
    v.tone({ t: 0.005, f: 300 * f, to: 130, dur: 0.13, type: 'sine', gain: 0.11 });
    for (let i = 0; i < 6; i++) {
      v.tone({ t: 0.04 + v.rnd(0, 0.22), f: v.rnd(500, 1400), to: v.rnd(1000, 2600), dur: 0.05, type: 'sine', gain: v.rnd(0.02, 0.06) });
    }
    v.room('bathroom', 0.34);
  },

  /** Big splash — the whole baby goes in. */
  'bath.splash-big': (v) => {
    const f = v.rnd(0.88, 1.06);
    v.noise({ dur: 0.07, kind: 'white', f: 2200 * f, to: 900, q: 0.7, gain: 0.3, a: 0.002, d: 0.06 });
    v.noise({ t: 0.01, dur: 0.75, kind: 'pink', f: 1400 * f, to: 260, q: 1.0, gain: 0.22, a: 0.015, d: 0.55, r: 0.2 });
    v.noise({ t: 0.02, dur: 0.6, kind: 'brown', f: 400, to: 150, q: 1.4, gain: 0.14, a: 0.02, d: 0.4 });
    v.tone({ f: 260 * f, to: 90, dur: 0.28, type: 'sine', gain: 0.16, a: 0.004 });
    for (let i = 0; i < 16; i++) {
      const t = 0.05 + Math.pow(v.rnd(0, 1), 1.4) * 0.6;
      v.tone({ t, f: v.rnd(380, 1500), to: v.rnd(900, 3000), dur: 0.06, type: 'sine', gain: v.rnd(0.02, 0.07) });
    }
    v.room('bathroom', 0.42);
  },

  /** Hand swirling through the water. */
  'bath.swirl': (v, o) => {
    const dur = o.dur || 0.8;
    v.noise({ dur, kind: 'pink', f: 700, to: 1500, q: 2.1, gain: 0.13, a: 0.08, s: 0.7, r: 0.2, sweep: dur * 0.6, wobble: 400, wobbleRate: 3.5 });
    v.noise({ dur, kind: 'brown', f: 300, q: 1.2, gain: 0.08, a: 0.1, s: 0.7, r: 0.2, wobble: 120, wobbleRate: 2.5 });
    for (let i = 0; i < 8; i++) {
      v.tone({ t: v.rnd(0.05, dur * 0.9), f: v.rnd(400, 1100), to: v.rnd(800, 2000), dur: 0.05, type: 'sine', gain: v.rnd(0.015, 0.045) });
    }
    v.room('bathroom', 0.3);
  },

  /** Shampoo bottle pump. */
  'bath.pump': (v) => {
    const f = v.rnd(0.94, 1.08);
    v.noise({ dur: 0.06, f: 1200 * f, to: 500, q: 2.6, gain: 0.13, a: 0.004, d: 0.05 });
    v.tone({ f: 420 * f, to: 190, dur: 0.07, type: 'triangle', gain: 0.09 });
    v.noise({ t: 0.07, dur: 0.1, kind: 'pink', f: 2200 * f, to: 3200, q: 1.4, gain: 0.1, a: 0.006 });
    v.tone({ t: 0.075, f: 240, to: 480, dur: 0.06, type: 'sine', gain: 0.06 });
    v.noise({ t: 0.15, dur: 0.09, kind: 'brown', f: 380, to: 200, q: 2, gain: 0.06 });
    v.room('bathroom', 0.26);
  },

  /** Lathering hair — foam under the palm. */
  'bath.lather': (v, o) => {
    const dur = o.dur || 0.5;
    v.noise({ dur, kind: 'white', f: 3200, to: 2200, q: 1.1, gain: 0.09, a: 0.04, s: 0.7, r: 0.12, wobble: 700, wobbleRate: 8 });
    v.noise({ dur, kind: 'pink', f: 900, to: 1400, q: 1.6, gain: 0.07, a: 0.05, s: 0.7, r: 0.12, wobble: 250, wobbleRate: 5 });
    const n = Math.floor(dur * 30);
    for (let i = 0; i < n; i++) {
      v.noise({ t: v.rnd(0, dur), dur: 0.006, f: v.rnd(3000, 8000), q: 8, gain: v.rnd(0.006, 0.02) });
    }
    v.room('bathroom', 0.3);
  },

  /** Shower spray. */
  'bath.shower': (v, o) => {
    const dur = o.dur || 1.4;
    v.noise({ dur, kind: 'white', f: 3200, to: 2800, q: 0.5, gain: 0.12, a: 0.08, s: 0.85, r: 0.2 });
    v.noise({ dur, kind: 'pink', f: 1400, q: 1.0, gain: 0.09, a: 0.1, s: 0.85, r: 0.22, wobble: 300, wobbleRate: 4 });
    v.noise({ dur, kind: 'brown', f: 380, q: 1.2, gain: 0.05, a: 0.12, s: 0.85, r: 0.25 });
    v.room('bathroom', 0.4);
  },

  /** Rinsing — a poured sheet of water that fades away. */
  'bath.rinse': (v, o) => {
    const dur = o.dur || 1.0;
    v.noise({ dur, kind: 'white', f: 2400, to: 1200, q: 0.8, gain: 0.13, a: 0.06, d: dur * 0.4, s: 0.6, r: 0.25, sweep: dur });
    v.noise({ dur, kind: 'brown', f: 420, to: 240, q: 1.5, gain: 0.09, a: 0.07, s: 0.6, r: 0.3 });
    for (let i = 0; i < 10; i++) {
      v.tone({ t: v.rnd(0.05, dur * 0.9), f: v.rnd(350, 900), to: v.rnd(700, 1800), dur: 0.05, type: 'sine', gain: v.rnd(0.015, 0.05) });
    }
    v.room('bathroom', 0.38);
  },

  /** One bubble popping. Helmholtz-ish: a rising sine chirp plus a tick. */
  'bath.bubble': (v, o) => {
    const f = (o.f || v.rnd(380, 1100));
    v.tone({ f, to: f * v.rnd(1.8, 3.2), dur: v.rnd(0.05, 0.1), type: 'sine', gain: v.rnd(0.08, 0.16), a: 0.002, glide: 0.05 });
    v.click({ dur: 0.008, f: f * 4, gain: 0.05, filter: 'bandpass', q: 4 });
    v.room('bathroom', 0.22);
  },

  /** A whole raft of foam popping at once. */
  'bath.bubbles': (v, o) => {
    const n = o.count || 10 + Math.floor(v.rnd(0, 8));
    const spread = o.spread || 0.8;
    for (let i = 0; i < n; i++) {
      const t = Math.pow(v.rnd(0, 1), 1.3) * spread;
      const f = v.rnd(360, 1400);
      v.tone({ t, f, to: f * v.rnd(1.8, 3.4), dur: v.rnd(0.04, 0.09), type: 'sine', gain: v.rnd(0.04, 0.1), a: 0.002, glide: 0.04, pan: v.rnd(-0.5, 0.5) });
      if (v.coin(0.4)) v.noise({ t, dur: 0.006, f: f * 3.5, q: 6, gain: 0.02 });
    }
    v.room('bathroom', 0.26);
  },

  /** The plug pulled — a descending gurgle into an empty tub. */
  'bath.drain': (v, o) => {
    const dur = o.dur || 1.6;
    v.noise({ dur, kind: 'brown', f: 700, to: 220, q: 3.2, gain: 0.14, a: 0.08, d: dur * 0.4, s: 0.6, r: 0.3, sweep: dur, wobble: 260, wobbleRate: 7 });
    v.noise({ dur, kind: 'pink', f: 1800, to: 600, q: 1.4, gain: 0.07, a: 0.1, s: 0.5, r: 0.3, sweep: dur });
    v.tone({ f: 260, to: 90, dur: dur * 0.9, type: 'sine', gain: 0.05, a: 0.15, s: 0.6, r: 0.3, glide: dur * 0.85, vib: { rate: 6, depth: 40 } });
    for (let i = 0; i < 18; i++) {
      const p = v.rnd(0, 1);
      v.tone({ t: p * dur * 0.95, f: lerp(900, 300, p) * v.rnd(0.8, 1.2), to: lerp(1800, 500, p), dur: 0.05, type: 'sine', gain: v.rnd(0.02, 0.06) });
    }
    v.room('bathroom', 0.34);
  },

  /** Towel rubbed over a wet head. */
  'bath.towel': (v, o) => {
    const dur = o.dur || 0.42;
    v.noise({ dur, kind: 'pink', f: 700, to: 1900, q: 0.8, gain: 0.14, a: 0.04, d: 0.12, s: 0.55, r: 0.12, sweep: dur * 0.5, wobble: 500, wobbleRate: 6.5 });
    v.noise({ dur, kind: 'brown', f: 260, q: 1.2, gain: 0.07, a: 0.05, s: 0.5, r: 0.14 });
    v.noise({ t: 0.02, dur: dur * 0.7, kind: 'white', f: 4200, to: 2600, q: 0.6, gain: 0.04, a: 0.05, s: 0.4, r: 0.1 });
    v.room('nursery', 0.16);
  },

  /** Hairdryer: motor spin-up, sustained blast, spin-down. */
  'bath.hairdryer': (v, o) => {
    const dur = o.dur || 1.8;
    const up = 0.35, down = 0.4;
    const body = Math.max(0.2, dur - up - down);
    v.noise({ dur, kind: 'white', f: 700, to: 1500, q: 0.9, gain: 0.11, a: up, d: 0.1, s: 0.85, r: down, sweep: up });
    v.noise({ dur, kind: 'pink', f: 2400, to: 3000, q: 0.6, gain: 0.06, a: up, s: 0.85, r: down });
    v.noise({ dur, kind: 'brown', f: 320, q: 1.4, gain: 0.09, a: up * 0.7, s: 0.85, r: down });
    // motor whine glides up, holds, glides down
    v.tone({ f: 130, to: 420, dur: up, type: 'sawtooth', gain: 0.05, a: up * 0.8, s: 0.9, r: 0.02, glide: up, filter: 'lowpass', ff: 1400 });
    v.tone({ t: up, f: 420, dur: body, type: 'sawtooth', gain: 0.05, a: 0.02, s: 0.95, r: 0.02, filter: 'lowpass', ff: 1500, vib: { rate: 7, depth: 6 } });
    v.tone({ t: up + body, f: 420, to: 120, dur: down, type: 'sawtooth', gain: 0.05, a: 0.01, s: 0.6, r: down * 0.5, glide: down, filter: 'lowpass', ff: 1200, fto: 500 });
    v.room('bathroom', 0.22);
  },

  /** Shivering — chattering teeth and a small unhappy hum. */
  'bath.shiver': (v) => {
    const n = 7 + Math.floor(v.rnd(0, 4));
    for (let i = 0; i < n; i++) {
      const t = i * v.rnd(0.055, 0.075);
      v.click({ t, dur: 0.012, f: v.rnd(2600, 4200), q: 3, gain: v.rnd(0.05, 0.1), filter: 'bandpass' });
      v.tone({ t, f: v.rnd(300, 380), dur: 0.03, type: 'triangle', gain: 0.04 });
    }
    v.vox({
      dur: 0.55, gain: 0.16, breath: 0.25, tension: 0.3, jitter: 45,
      f0: [[0, 400], [0.5, 430], [1, 380]], vowel: [[0, 'm'], [1, 'u']],
      vib: { rate: 14, depth: 45, delay: 0.02 }, a: 0.04, r: 0.15
    });
    v.room('bathroom', 0.24);
  },

  /** Steam hissing off hot water. */
  'bath.steam': (v, o) => {
    const dur = o.dur || 0.9;
    v.noise({ dur, kind: 'white', f: 5200, to: 3400, q: 0.7, gain: 0.08, a: 0.12, d: dur * 0.3, s: 0.5, r: 0.3, sweep: dur });
    v.noise({ dur, kind: 'pink', f: 2200, to: 1400, q: 1.2, gain: 0.05, a: 0.15, s: 0.4, r: 0.3 });
    v.room('bathroom', 0.4);
  },

  /* --------------------------------------------------------- dressing -- */

  /** Cloth moving over cloth. */
  'dress.rustle': (v, o) => {
    const dur = o.dur || 0.34;
    v.noise({ dur, kind: 'pink', f: 1400, to: 2800, q: 0.9, gain: 0.11, a: 0.03, d: 0.12, s: 0.5, r: 0.12, sweep: dur * 0.6, wobble: 600, wobbleRate: 9 });
    v.noise({ dur: dur * 0.8, kind: 'white', f: 4600, to: 3000, q: 0.6, gain: 0.04, a: 0.04, s: 0.4, r: 0.1 });
    v.noise({ dur: dur * 0.6, kind: 'brown', f: 240, q: 1.2, gain: 0.04, a: 0.05, s: 0.4, r: 0.1 });
    v.room('nursery', 0.12);
  },

  /** 「すぽっ」 — the head coming through the neck hole. */
  'dress.head-through': (v) => {
    v.noise({ dur: 0.18, kind: 'pink', f: 800, to: 1800, q: 1.6, gain: 0.12, a: 0.04, d: 0.1, s: 0.4, r: 0.06 });
    v.noise({ t: 0.16, dur: 0.05, kind: 'white', f: 2400, to: 5200, q: 1.1, gain: 0.16, a: 0.002, d: 0.04 });
    v.tone({ t: 0.16, f: 300, to: 900, dur: 0.07, type: 'sine', gain: 0.16, a: 0.003, glide: 0.05 });
    v.tone({ t: 0.19, f: 1100, to: 700, dur: 0.05, type: 'triangle', gain: 0.05 });
    v.room('nursery', 0.16);
  },

  /** Velcro. Granular ripping — the only place bitcrush earns its keep. */
  'dress.velcro': (v, o) => {
    const dur = o.dur || 0.32;
    v.noise({ dur, kind: 'white', f: 2600, to: 1800, q: 1.3, gain: 0.16, a: 0.006, d: dur * 0.5, s: 0.6, r: 0.06, crush: 5, wobble: 900, wobbleRate: 40 });
    v.noise({ dur, kind: 'pink', f: 900, to: 700, q: 2.2, gain: 0.08, a: 0.01, s: 0.5, r: 0.06 });
    for (let i = 0; i < 14; i++) {
      v.noise({ t: v.rnd(0, dur * 0.92), dur: 0.008, f: v.rnd(2000, 6000), q: 7, gain: v.rnd(0.01, 0.04) });
    }
    v.room('nursery', 0.14);
  },

  /** A press-stud closing — 「パチン」 */
  'dress.button': (v) => {
    const f = v.rnd(0.92, 1.12);
    v.noise({ dur: 0.012, f: 5200 * f, to: 2600, q: 1.2, gain: 0.2, a: 0.0006, d: 0.01, filter: 'highpass' });
    v.tone({ f: 1750 * f, dur: 0.06, type: 'sine', gain: 0.14, a: 0.001, d: 0.05 });
    v.tone({ f: 2900 * f, dur: 0.035, type: 'sine', gain: 0.07, a: 0.001 });
    v.tone({ f: 420 * f, to: 260, dur: 0.05, type: 'triangle', gain: 0.06 });
    v.room('nursery', 0.18);
  },

  /** Zip. A rate-modulated buzz of tiny teeth. */
  'dress.zip': (v, o) => {
    const dur = o.dur || 0.4;
    v.noise({ dur, kind: 'white', f: 3000, to: 4200, q: 1.6, gain: 0.12, a: 0.01, d: dur * 0.6, s: 0.6, r: 0.05, sweep: dur, crush: 4 });
    v.tone({ f: 90, to: 170, dur, type: 'square', gain: 0.035, a: 0.01, s: 0.7, r: 0.05, glide: dur, filter: 'bandpass', ff: 2400, fq: 2 });
    const n = Math.floor(dur * 70);
    for (let i = 0; i < n; i += 3) {
      v.noise({ t: (i / n) * dur, dur: 0.005, f: lerp(2400, 5200, i / n), q: 9, gain: 0.02 });
    }
    v.room('nursery', 0.12);
  },

  /** A sock stretched over a heel. */
  'dress.sock': (v) => {
    const dur = 0.3;
    v.noise({ dur, kind: 'pink', f: 700, to: 1600, q: 2.4, gain: 0.11, a: 0.06, d: 0.1, s: 0.5, r: 0.08, sweep: dur * 0.8, wobble: 300, wobbleRate: 6 });
    v.tone({ f: 210, to: 340, dur: dur * 0.9, type: 'triangle', gain: 0.05, a: 0.07, s: 0.5, r: 0.08, glide: dur * 0.8, filter: 'lowpass', ff: 1200 });
    v.noise({ t: dur * 0.85, dur: 0.05, f: 1800, to: 3200, q: 1.4, gain: 0.09, a: 0.002 });
    v.room('nursery', 0.12);
  },

  /** A little shoe hitting the floor. */
  'dress.shoe': (v) => {
    const f = v.rnd(0.9, 1.12);
    v.noise({ dur: 0.03, kind: 'brown', f: 900 * f, to: 320, q: 1.1, gain: 0.22, a: 0.001, d: 0.026 });
    v.tone({ f: 150 * f, to: 78, dur: 0.16, type: 'sine', gain: 0.22, a: 0.002 });
    v.tone({ f: 260 * f, to: 160, dur: 0.08, type: 'triangle', gain: 0.07 });
    v.noise({ t: 0.02, dur: 0.1, kind: 'pink', f: 1200, to: 500, q: 1.6, gain: 0.05 });
    v.room('nursery', 0.2);
  },

  /** Washing machine on its cycle: a rolling drum with a wobble. */
  'dress.washer': (v, o) => {
    const dur = o.dur || 2.2;
    v.noise({ dur, kind: 'brown', f: 300, to: 380, q: 1.8, gain: 0.13, a: 0.2, s: 0.85, r: 0.35, wobble: 90, wobbleRate: 1.6 });
    v.noise({ dur, kind: 'pink', f: 900, q: 1.2, gain: 0.05, a: 0.25, s: 0.8, r: 0.35, wobble: 250, wobbleRate: 2.2 });
    v.tone({ f: 84, dur, type: 'sine', gain: 0.09, a: 0.25, s: 0.9, r: 0.35, vib: { rate: 1.3, depth: 30 } });
    // clothes thumping round the drum
    const n = Math.max(2, Math.floor(dur * 2.2));
    for (let i = 0; i < n; i++) {
      const t = i * (dur / n) + v.rnd(-0.05, 0.05);
      v.noise({ t: Math.max(0.02, t), dur: 0.1, kind: 'brown', f: v.rnd(180, 320), to: 120, q: 2, gain: v.rnd(0.05, 0.1), a: 0.004 });
    }
    v.room('bathroom', 0.2);
  },

  /** A single drip from washing on the line. */
  'dress.drip': (v) => {
    const f = v.rnd(600, 1000);
    v.tone({ f, to: f * 2.6, dur: 0.07, type: 'sine', gain: 0.14, a: 0.001, glide: 0.045 });
    v.tone({ t: 0.005, f: f * 0.5, to: f * 1.1, dur: 0.05, type: 'sine', gain: 0.05, glide: 0.04 });
    v.click({ dur: 0.006, f: f * 4, q: 5, gain: 0.04, filter: 'bandpass' });
    v.room('bathroom', 0.4);
  },

  /** Tumble dryer — softer, airier, with a buckle tick now and then. */
  'dress.tumble': (v, o) => {
    const dur = o.dur || 2.0;
    v.noise({ dur, kind: 'brown', f: 260, q: 1.4, gain: 0.11, a: 0.25, s: 0.85, r: 0.4, wobble: 60, wobbleRate: 1.1 });
    v.noise({ dur, kind: 'white', f: 1800, q: 0.7, gain: 0.045, a: 0.3, s: 0.8, r: 0.4 });
    v.tone({ f: 62, dur, type: 'sine', gain: 0.07, a: 0.3, s: 0.9, r: 0.4 });
    const n = Math.max(2, Math.floor(dur * 1.6));
    for (let i = 0; i < n; i++) {
      const t = i * (dur / n) + v.rnd(0, 0.12);
      v.noise({ t, dur: 0.06, kind: 'pink', f: v.rnd(600, 1400), to: 400, q: 2.4, gain: v.rnd(0.03, 0.07), a: 0.003 });
      if (v.coin(0.35)) v.click({ t: t + 0.01, dur: 0.01, f: v.rnd(3000, 5000), gain: 0.05, filter: 'bandpass', q: 4 });
    }
    v.room('bathroom', 0.18);
  },

  /** 「くさい！」 — a comic descending wah of disgust. */
  'dress.stink': (v) => {
    v.tone({ f: 420, to: 210, dur: 0.34, type: 'sawtooth', gain: 0.1, a: 0.01, d: 0.28, filter: 'lowpass', ff: 1600, fto: 400, fq: 6 });
    v.tone({ t: 0.28, f: 330, to: 160, dur: 0.34, type: 'sawtooth', gain: 0.08, a: 0.01, filter: 'lowpass', ff: 1300, fto: 320, fq: 6 });
    v.vox({ t: 0.02, dur: 0.3, gain: 0.16, breath: 0.3, tension: 0.4, f0: [[0, 470], [1, 340]], vowel: [[0, 'e'], [1, 'a']] });
    v.room('nursery', 0.16);
  },

  /* ------------------------------------------------------------- play -- */

  /** Ball bounce. `velocity` (0..1) drives pitch, brightness and level. */
  'play.bounce': (v, o) => {
    const vel = clamp(o.velocity != null ? o.velocity : 0.6, 0.05, 1.4);
    const f = v.rnd(0.94, 1.08) * (0.7 + vel * 0.5);
    v.noise({ dur: 0.016 + 0.01 * vel, kind: 'white', f: 1800 * f, to: 700, q: 0.9, gain: 0.1 + 0.16 * vel, a: 0.0006 });
    v.tone({ f: 210 * f, to: 96 * f, dur: 0.1 + 0.06 * vel, type: 'sine', gain: 0.12 + 0.18 * vel, a: 0.001, glide: 0.07 });
    v.tone({ f: 430 * f, to: 250 * f, dur: 0.06, type: 'triangle', gain: 0.05 + 0.06 * vel });
    v.noise({ t: 0.008, dur: 0.09, kind: 'pink', f: 900 * f, to: 300, q: 2.2, gain: 0.05 + 0.05 * vel });
    v.room('nursery', 0.16);
  },

  /** Ball rolling across the floor. */
  'play.roll': (v, o) => {
    const dur = o.dur || 0.9;
    v.noise({ dur, kind: 'brown', f: 220, to: 300, q: 2.6, gain: 0.11, a: 0.06, s: 0.75, r: 0.2, wobble: 70, wobbleRate: 7 });
    v.noise({ dur, kind: 'pink', f: 700, q: 1.4, gain: 0.05, a: 0.08, s: 0.7, r: 0.2, wobble: 200, wobbleRate: 11 });
    v.tone({ f: 96, dur, type: 'sine', gain: 0.05, a: 0.08, s: 0.8, r: 0.2, vib: { rate: 6.5, depth: 25 } });
    v.room('nursery', 0.14);
  },

  /** A wooden block set down on another. */
  'play.block': (v, o) => {
    const size = o.size != null ? o.size : 0.5;         // 0 small … 1 big
    const f = v.rnd(0.94, 1.07) * lerp(1.25, 0.75, size);
    v.noise({ dur: 0.012, kind: 'white', f: 4200 * f, to: 1800, q: 1.0, gain: 0.14, a: 0.0005 });
    v.tone({ f: 620 * f, dur: 0.1, type: 'sine', gain: 0.16, a: 0.001, d: 0.08 });
    v.tone({ f: 1180 * f, dur: 0.05, type: 'sine', gain: 0.07, a: 0.001 });
    v.tone({ f: 240 * f, to: 170 * f, dur: 0.13, type: 'triangle', gain: 0.1 });
    v.noise({ t: 0.004, dur: 0.05, kind: 'pink', f: 1400 * f, to: 600, q: 2.4, gain: 0.06 });
    v.room('nursery', 0.2);
  },

  /** 「ガッシャーン」 — the tower goes over. A real multi-impact cluster. */
  'play.collapse': (v, o) => {
    const n = o.count || 11 + Math.floor(v.rnd(0, 6));
    // initial topple: the biggest block hits first
    v.noise({ dur: 0.03, kind: 'white', f: 3000, to: 900, q: 0.9, gain: 0.22, a: 0.0008 });
    v.tone({ f: 300, to: 150, dur: 0.2, type: 'triangle', gain: 0.16 });
    v.noise({ dur: 0.5, kind: 'brown', f: 180, to: 90, q: 1.4, gain: 0.12, a: 0.01, d: 0.4 });
    // the scatter: impacts thin out and quieten as the pile settles
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const t = 0.03 + Math.pow(p, 0.72) * v.rnd(0.75, 1.0);
      const f = v.rnd(0.7, 1.5) * lerp(1.0, 1.5, p);
      const g = lerp(1, 0.28, p) * v.rnd(0.6, 1.1);
      const pan = v.rnd(-0.55, 0.55);
      v.noise({ t, dur: 0.01, kind: 'white', f: 4000 * f, to: 1600, q: 1, gain: 0.09 * g, a: 0.0005, pan });
      v.tone({ t, f: 600 * f, dur: 0.09, type: 'sine', gain: 0.11 * g, a: 0.001, d: 0.07, pan });
      v.tone({ t, f: 1150 * f, dur: 0.04, type: 'sine', gain: 0.05 * g, a: 0.001, pan });
      v.tone({ t, f: 230 * f, to: 160 * f, dur: 0.1, type: 'triangle', gain: 0.07 * g, pan });
    }
    // last few tumbling stragglers
    for (let i = 0; i < 3; i++) {
      const t = 0.85 + i * v.rnd(0.09, 0.16);
      v.tone({ t, f: v.rnd(500, 900), dur: 0.07, type: 'sine', gain: v.rnd(0.02, 0.05), a: 0.001, pan: v.rnd(-0.6, 0.6) });
    }
    v.room('nursery', 0.3);
  },

  /** Balloon bounced off a palm — a rubbery boing. */
  'play.balloon': (v) => {
    const f = v.rnd(0.9, 1.14);
    v.noise({ dur: 0.02, kind: 'pink', f: 1800 * f, to: 700, q: 1.4, gain: 0.1, a: 0.001 });
    v.tone({ f: 170 * f, to: 520 * f, dur: 0.2, type: 'sine', gain: 0.24, a: 0.004, glide: 0.14, vib: { rate: 22, depth: 60, delay: 0.03 } });
    v.tone({ f: 340 * f, to: 900 * f, dur: 0.13, type: 'triangle', gain: 0.07, glide: 0.1 });
    v.tone({ t: 0.16, f: 520 * f, to: 400 * f, dur: 0.12, type: 'sine', gain: 0.06 });
    v.room('nursery', 0.18);
  },

  /** A finger squeaking on balloon rubber. */
  'play.balloon-squeak': (v) => {
    const f = v.rnd(0.85, 1.2);
    const dur = 0.24;
    v.tone({ f: 950 * f, to: 1500 * f, dur: dur * 0.5, type: 'triangle', gain: 0.1, a: 0.006, glide: dur * 0.4, vib: { rate: 26, depth: 90 } });
    v.tone({ t: dur * 0.45, f: 1500 * f, to: 820 * f, dur: dur * 0.55, type: 'triangle', gain: 0.09, glide: dur * 0.45, vib: { rate: 20, depth: 70 } });
    v.noise({ dur, kind: 'white', f: 3200 * f, to: 2000, q: 4, gain: 0.04, a: 0.01, s: 0.5, r: 0.05 });
    v.room('nursery', 0.14);
  },

  /**
   * Xylophone. Pentatonic C D E G A over two octaves.
   * `note` is a scale index (0..9), or pass `midi` directly.
   * The bar is modelled with its real inharmonic partials (1 : 3 : 6.3) plus a
   * short resonator swell and a felt-mallet click.
   */
  'play.xylo': (v, o) => {
    const SCALE = [0, 2, 4, 7, 9];
    let midi;
    if (o.midi != null) midi = o.midi;
    else {
      const i = clamp(Math.round(o.note != null ? o.note : 0), 0, 9);
      midi = 72 + Math.floor(i / 5) * 12 + SCALE[i % 5];
    }
    const f = midiToFreq(midi);
    const g = o.gain != null ? 1 : 1;
    // mallet contact
    v.noise({ dur: 0.012, kind: 'white', f: f * 4, to: f * 1.5, q: 1.1, gain: 0.09 * g, a: 0.0004, pitched: false });
    v.noise({ dur: 0.03, kind: 'pink', f: 2200, to: 900, q: 1.6, gain: 0.05 * g, a: 0.001, pitched: false });
    // bar modes
    v.tone({ f, dur: 0.85, type: 'sine', gain: 0.3 * g, a: 0.0015, d: 0.8 });
    v.tone({ f: f * 3.0, dur: 0.3, type: 'sine', gain: 0.12 * g, a: 0.001, d: 0.26 });
    v.tone({ f: f * 6.3, dur: 0.13, type: 'sine', gain: 0.05 * g, a: 0.001, d: 0.11 });
    // resonator tube: a soft swell under the fundamental
    v.tone({ f: f * 0.5, dur: 0.5, type: 'sine', gain: 0.07 * g, a: 0.02, d: 0.45 });
    v.room('nursery', 0.3);
  },

  /** A little run up the pentatonic — used for rewards on the xylophone. */
  'play.xylo-run': (v, o) => {
    const up = o.down !== true;
    for (let i = 0; i < 5; i++) {
      const idx = up ? i : 4 - i;
      SOUNDS['play.xylo'](
        Object.assign(Object.create(Object.getPrototypeOf(v)), v, { t: v.t + i * 0.085 }),
        { note: idx }
      );
    }
    v.until(0.085 * 5 + 0.9);
  },

  /** Toy drum — a taut membrane and a wooden shell. */
  'play.drum': (v, o) => {
    const hi = o.hi === true;
    const f = (hi ? 250 : 128) * v.rnd(0.95, 1.06);
    v.noise({ dur: 0.02, kind: 'white', f: hi ? 3600 : 2200, to: 800, q: 0.9, gain: hi ? 0.14 : 0.11, a: 0.0005, pitched: false });
    v.tone({ f, to: f * 0.55, dur: hi ? 0.18 : 0.3, type: 'sine', gain: 0.34, a: 0.001, glide: hi ? 0.1 : 0.16 });
    v.tone({ f: f * 1.6, to: f * 1.0, dur: 0.1, type: 'triangle', gain: 0.09 });
    v.noise({ t: 0.002, dur: 0.12, kind: 'brown', f: f * 3, to: f, q: 1.6, gain: 0.07, pitched: false });
    v.room('nursery', 0.24);
  },

  /** Rattle — a shell full of beads. */
  'play.rattle': (v, o) => {
    const shakes = o.shakes || 2;
    for (let s = 0; s < shakes; s++) {
      const t0 = s * v.rnd(0.15, 0.2);
      const n = 7 + Math.floor(v.rnd(0, 5));
      for (let i = 0; i < n; i++) {
        const t = t0 + Math.pow(v.rnd(0, 1), 1.5) * 0.07;
        v.noise({ t, dur: v.rnd(0.006, 0.014), f: v.rnd(2600, 6500), q: v.rnd(4, 9), gain: v.rnd(0.03, 0.09), a: 0.0006, pan: v.rnd(-0.3, 0.3) });
      }
      v.noise({ t: t0, dur: 0.09, kind: 'pink', f: 1400, to: 900, q: 1.6, gain: 0.06, a: 0.002 });
      v.tone({ t: t0, f: 380, to: 260, dur: 0.07, type: 'triangle', gain: 0.05 });
    }
    v.room('nursery', 0.2);
  },

  /** 「いない いない…」 — two suspended notes. */
  'play.peekaboo-hide': (v) => {
    v.tone({ f: midiToFreq(76), dur: 0.22, type: 'triangle', gain: 0.13, a: 0.006, d: 0.18, filter: 'lowpass', ff: 3000 });
    v.tone({ f: midiToFreq(88), dur: 0.18, type: 'sine', gain: 0.05, a: 0.004 });
    v.tone({ t: 0.3, f: midiToFreq(76), dur: 0.22, type: 'triangle', gain: 0.13, a: 0.006, d: 0.18, filter: 'lowpass', ff: 3000 });
    v.tone({ t: 0.3, f: midiToFreq(88), dur: 0.18, type: 'sine', gain: 0.05, a: 0.004 });
    v.room('nursery', 0.26);
  },

  /** 「ばあ！」 — a bright surprise sting. */
  'play.peekaboo-baa': (v) => {
    const chord = [72, 76, 79, 84];
    chord.forEach((m, i) => {
      v.tone({ t: i * 0.012, f: midiToFreq(m), dur: 0.5, type: 'triangle', gain: 0.12 - i * 0.015, a: 0.003, d: 0.4, filter: 'lowpass', ff: 4200 });
      v.tone({ t: i * 0.012, f: midiToFreq(m + 12), dur: 0.25, type: 'sine', gain: 0.04, a: 0.002 });
    });
    v.noise({ dur: 0.12, kind: 'white', f: 5000, to: 2600, q: 0.8, gain: 0.07, a: 0.001, d: 0.1 });
    v.tone({ f: 160, to: 320, dur: 0.16, type: 'sine', gain: 0.1, glide: 0.1 });
    v.room('nursery', 0.3);
  },

  /** The little chime that answers a giggle. */
  'play.chime': (v) => {
    const notes = [84, 88, 91];
    notes.forEach((m, i) => {
      v.tone({ t: i * 0.055, f: midiToFreq(m), dur: 0.7 - i * 0.1, type: 'sine', gain: 0.12, a: 0.002, d: 0.6 });
      v.tone({ t: i * 0.055, f: midiToFreq(m) * 2.76, dur: 0.2, type: 'sine', gain: 0.03, a: 0.002 });
    });
    v.room('dream', 0.3);
    v.echo(0.14);
  },

  /* ------------------------------------------------------------ sleep -- */

  /** Toothbrush scrubbing. */
  'sleep.toothbrush': (v, o) => {
    const dur = o.dur || 0.42;
    const strokes = Math.max(1, Math.round(dur / 0.14));
    for (let i = 0; i < strokes; i++) {
      const t = i * 0.14;
      v.noise({ t, dur: 0.11, kind: 'white', f: 3600, to: 2400, q: 2.2, gain: 0.1, a: 0.02, d: 0.07, sweep: 0.09, wobble: 800, wobbleRate: 24 });
      v.noise({ t, dur: 0.1, kind: 'pink', f: 1200, q: 2.6, gain: 0.05, a: 0.02 });
    }
    v.room('bathroom', 0.28);
  },

  /** 「ぺっ」 — spitting into the basin. */
  'sleep.spit': (v) => {
    v.noise({ dur: 0.04, kind: 'white', f: 2600, to: 1100, q: 1.2, gain: 0.16, a: 0.001, d: 0.035 });
    v.tone({ f: 380, to: 150, dur: 0.09, type: 'sine', gain: 0.09 });
    v.noise({ t: 0.06, dur: 0.11, kind: 'pink', f: 1500, to: 500, q: 2.4, gain: 0.09, a: 0.004 });
    v.tone({ t: 0.09, f: 700, to: 1500, dur: 0.05, type: 'sine', gain: 0.05, glide: 0.035 });
    v.room('bathroom', 0.36);
  },

  /** Curtain running along its rail. */
  'sleep.curtain': (v, o) => {
    const dur = o.dur || 0.75;
    v.noise({ dur, kind: 'pink', f: 1100, to: 2200, q: 1.1, gain: 0.1, a: 0.05, d: dur * 0.4, s: 0.6, r: 0.15, sweep: dur * 0.7, wobble: 500, wobbleRate: 8 });
    v.noise({ dur, kind: 'brown', f: 240, q: 1.3, gain: 0.05, a: 0.06, s: 0.6, r: 0.15 });
    const n = Math.floor(dur * 14);
    for (let i = 0; i < n; i++) {
      v.noise({ t: (i / n) * dur + v.rnd(-0.01, 0.01), dur: 0.008, f: v.rnd(3000, 6000), q: 7, gain: v.rnd(0.008, 0.025) });
    }
    v.room('nursery', 0.2);
  },

  /** Light switch — 「カチッ」 */
  'sleep.switch': (v, o) => {
    const on = o.on !== false;
    v.noise({ dur: 0.01, kind: 'white', f: on ? 5200 : 4200, to: 2200, q: 1.4, gain: 0.16, a: 0.0004 });
    v.tone({ f: on ? 1900 : 1500, to: on ? 1400 : 1100, dur: 0.045, type: 'square', gain: 0.06, a: 0.0008, filter: 'lowpass', ff: 4000 });
    v.tone({ f: on ? 620 : 480, dur: 0.05, type: 'sine', gain: 0.07, a: 0.001 });
    v.room('nursery', 0.22);
  },

  /** Bedside lamp hum — very quiet, just enough to feel the room. */
  'sleep.lamp': (v, o) => {
    const dur = o.dur || 2.0;
    v.tone({ f: 100, dur, type: 'sine', gain: 0.035, a: 0.4, s: 0.9, r: 0.5 });
    v.tone({ f: 200, dur, type: 'sine', gain: 0.014, a: 0.4, s: 0.9, r: 0.5 });
    v.noise({ dur, kind: 'pink', f: 1600, q: 1.4, gain: 0.012, a: 0.5, s: 0.9, r: 0.5 });
    v.room('nursery', 0.1);
  },

  /** A page of the picture book turning. */
  'sleep.page': (v) => {
    const dur = 0.3;
    v.noise({ dur: 0.1, kind: 'white', f: 2400, to: 4600, q: 0.9, gain: 0.1, a: 0.01, d: 0.07, sweep: 0.09 });
    v.noise({ t: 0.08, dur: 0.2, kind: 'pink', f: 3200, to: 1400, q: 1.2, gain: 0.08, a: 0.02, d: 0.14, sweep: 0.18 });
    v.noise({ t: 0.22, dur: 0.06, kind: 'pink', f: 800, to: 400, q: 2, gain: 0.06, a: 0.004 });
    v.until(dur);
    v.room('nursery', 0.2);
  },

  /** とんとん — a soft flat palm on a back. Deliberately very low and dull. */
  'sleep.pat': (v) => {
    const f = v.rnd(0.92, 1.09);
    v.noise({ dur: 0.055, kind: 'brown', f: 320 * f, to: 130, q: 1.3, gain: 0.14, a: 0.003, d: 0.045 });
    v.tone({ f: 110 * f, to: 68, dur: 0.11, type: 'sine', gain: 0.16, a: 0.003 });
    v.noise({ t: 0.002, dur: 0.03, kind: 'pink', f: 900, to: 400, q: 1.8, gain: 0.035 });
    v.room('nursery', 0.16);
  },

  /** A wind-up music box phrase — the real thing has a lot of case rattle. */
  'sleep.musicbox': (v, o) => {
    const phrase = o.phrase || [79, 76, 72, 74, 76, 72];
    phrase.forEach((m, i) => {
      const t = i * 0.34;
      const f = midiToFreq(m + 12);
      v.tone({ t, f, dur: 1.1, type: 'sine', gain: 0.13, a: 0.002, d: 1.0 });
      v.tone({ t, f: f * 2.01, dur: 0.5, type: 'sine', gain: 0.05, a: 0.002, d: 0.45 });
      v.tone({ t, f: f * 4.2, dur: 0.16, type: 'sine', gain: 0.02, a: 0.001 });
      v.noise({ t, dur: 0.01, kind: 'white', f: 6000, q: 2, gain: 0.02, a: 0.0004, pitched: false });
    });
    v.until(phrase.length * 0.34 + 1.2);
    v.room('dream', 0.34);
  },

  /** Snoring — in through the nose, out with a flutter. */
  'sleep.snore': (v) => {
    const f = v.rnd(0.92, 1.1);
    // inhale: rattling flutter
    v.noise({ dur: 0.55, kind: 'brown', f: 380 * f, to: 260, q: 3.2, gain: 0.11, a: 0.18, d: 0.2, s: 0.6, r: 0.16, wobble: 160, wobbleRate: 19 });
    v.tone({ f: 78 * f, to: 62, dur: 0.5, type: 'sawtooth', gain: 0.06, a: 0.2, s: 0.6, r: 0.15, filter: 'lowpass', ff: 500, fto: 260, vib: { rate: 19, depth: 90 } });
    // exhale: soft breath
    v.noise({ t: 0.65, dur: 0.5, kind: 'pink', f: 700, to: 380, q: 1.2, gain: 0.06, a: 0.1, d: 0.2, s: 0.5, r: 0.2 });
    v.until(1.25);
    v.room('nursery', 0.24);
  },

  /** Dream twinkle — a little bell far away. */
  'sleep.twinkle': (v) => {
    const base = v.pick([84, 86, 88, 91, 93]);
    const f = midiToFreq(base) * v.rnd(0.995, 1.005);
    v.tone({ f, dur: 1.0, type: 'sine', gain: 0.09, a: 0.004, d: 0.9 });
    v.tone({ f: f * 2.0, dur: 0.5, type: 'sine', gain: 0.035, a: 0.003 });
    v.tone({ f: f * 3.01, dur: 0.28, type: 'sine', gain: 0.016, a: 0.002 });
    v.room('dream', 0.4);
    v.echo(0.18);
  },

  /** Shooting star — a rising filtered whoosh with a sparkle at the top. */
  'sleep.shooting-star': (v) => {
    v.noise({ dur: 0.8, kind: 'white', f: 700, to: 6500, q: 2.6, gain: 0.09, a: 0.12, d: 0.4, s: 0.4, r: 0.25, sweep: 0.7, pan: -0.4 });
    v.tone({ f: 500, to: 2600, dur: 0.7, type: 'sine', gain: 0.05, a: 0.1, d: 0.3, s: 0.4, r: 0.2, glide: 0.65, pan: -0.3 });
    [93, 96, 100].forEach((m, i) => {
      v.tone({ t: 0.55 + i * 0.06, f: midiToFreq(m), dur: 0.8, type: 'sine', gain: 0.07, a: 0.003, d: 0.7, pan: 0.3 });
    });
    v.until(1.5);
    v.room('dream', 0.45);
    v.echo(0.2);
  },

  /* --------------------------------------------------------------- UI -- */

  /** Soft tap — the sound almost every touch makes. Must never fatigue. */
  'ui.tap': (v) => {
    v.tone({ f: 760 * v.rnd(0.97, 1.03), to: 620, dur: 0.075, type: 'sine', gain: 0.14, a: 0.0025, d: 0.06 });
    v.tone({ f: 1540, dur: 0.035, type: 'sine', gain: 0.045, a: 0.001 });
    v.noise({ dur: 0.012, kind: 'pink', f: 3200, q: 1.2, gain: 0.03, a: 0.0006, filter: 'highpass' });
    v.room('nursery', 0.12);
  },

  /** Confirm — a friendly rising two-note. */
  'ui.confirm': (v) => {
    v.tone({ f: midiToFreq(76), dur: 0.13, type: 'triangle', gain: 0.13, a: 0.003, d: 0.1, filter: 'lowpass', ff: 3600 });
    v.tone({ t: 0.085, f: midiToFreq(83), dur: 0.3, type: 'triangle', gain: 0.13, a: 0.003, d: 0.26, filter: 'lowpass', ff: 4200 });
    v.tone({ t: 0.085, f: midiToFreq(95), dur: 0.14, type: 'sine', gain: 0.04, a: 0.002 });
    v.room('nursery', 0.2);
  },

  /** ⭐ earned — a bright ascending arpeggio with a shimmer on top. */
  'ui.star': (v) => {
    const arp = [72, 76, 79, 84, 88];
    arp.forEach((m, i) => {
      const t = i * 0.062;
      v.tone({ t, f: midiToFreq(m), dur: 0.55 - i * 0.05, type: 'triangle', gain: 0.12, a: 0.002, d: 0.4, filter: 'lowpass', ff: 5200 });
      v.tone({ t, f: midiToFreq(m + 12), dur: 0.2, type: 'sine', gain: 0.045, a: 0.002 });
    });
    v.tone({ t: 0.31, f: midiToFreq(91), dur: 0.9, type: 'sine', gain: 0.1, a: 0.004, d: 0.8 });
    v.noise({ t: 0.3, dur: 0.5, kind: 'white', f: 7000, to: 4000, q: 1.2, gain: 0.03, a: 0.02, d: 0.4 });
    v.until(1.4);
    v.room('dream', 0.28);
    v.echo(0.12);
  },

  /** A sticker pressed onto the book. */
  'ui.sticker': (v) => {
    v.noise({ dur: 0.1, kind: 'white', f: 2600, to: 5200, q: 1.6, gain: 0.09, a: 0.008, d: 0.07, sweep: 0.08 });
    v.tone({ f: 520, to: 900, dur: 0.09, type: 'sine', gain: 0.1, a: 0.003, glide: 0.06 });
    v.tone({ t: 0.09, f: midiToFreq(88), dur: 0.4, type: 'triangle', gain: 0.1, a: 0.002, d: 0.34 });
    v.tone({ t: 0.09, f: midiToFreq(93), dur: 0.25, type: 'sine', gain: 0.04, a: 0.002 });
    v.room('nursery', 0.24);
  },

  /** A meter running low — a gentle chirp, never an alarm. */
  'ui.meter-low': (v) => {
    v.tone({ f: midiToFreq(81), dur: 0.14, type: 'triangle', gain: 0.1, a: 0.004, d: 0.11, filter: 'lowpass', ff: 3000 });
    v.tone({ t: 0.13, f: midiToFreq(78), dur: 0.26, type: 'triangle', gain: 0.09, a: 0.004, d: 0.22, filter: 'lowpass', ff: 2600 });
    v.tone({ t: 0.13, f: midiToFreq(90), dur: 0.12, type: 'sine', gain: 0.025, a: 0.003 });
    v.room('nursery', 0.2);
  },

  /** Page swipe. */
  'ui.swipe': (v, o) => {
    const back = o.back === true;
    const dur = 0.26;
    v.noise({ dur, kind: 'pink', f: back ? 3000 : 700, to: back ? 700 : 3000, q: 2.2, gain: 0.09, a: 0.03, d: 0.12, s: 0.4, r: 0.08, sweep: dur * 0.8 });
    v.noise({ dur: dur * 0.7, kind: 'white', f: back ? 5000 : 2000, to: back ? 2000 : 5000, q: 1.4, gain: 0.04, a: 0.03, sweep: dur * 0.6 });
    v.room('nursery', 0.12);
  },

  /** Menu opening — a soft airy rise. */
  'ui.open': (v) => {
    v.noise({ dur: 0.28, kind: 'pink', f: 900, to: 3600, q: 1.4, gain: 0.06, a: 0.04, d: 0.16, sweep: 0.24 });
    v.tone({ f: midiToFreq(72), to: midiToFreq(79), dur: 0.2, type: 'triangle', gain: 0.09, a: 0.006, glide: 0.14, filter: 'lowpass', ff: 3200 });
    v.tone({ t: 0.14, f: midiToFreq(84), dur: 0.35, type: 'sine', gain: 0.06, a: 0.004, d: 0.3 });
    v.room('nursery', 0.22);
  },

  /** Menu closing — the same shape, falling. */
  'ui.close': (v) => {
    v.noise({ dur: 0.24, kind: 'pink', f: 3200, to: 800, q: 1.4, gain: 0.055, a: 0.02, d: 0.16, sweep: 0.2 });
    v.tone({ f: midiToFreq(79), to: midiToFreq(72), dur: 0.2, type: 'triangle', gain: 0.09, a: 0.005, glide: 0.15, filter: 'lowpass', ff: 2600 });
    v.tone({ t: 0.1, f: midiToFreq(65), dur: 0.28, type: 'sine', gain: 0.05, a: 0.004, d: 0.24 });
    v.room('nursery', 0.18);
  },

  /* ----------------------------------------------- baby vocalisations -- */

  /** Coo — the contented open-mouth "ooooh". Soft, breathy, low tension. */
  'baby.coo': (v) => {
    const p = v.rnd(0.94, 1.08);
    v.vox({
      dur: 0.7, gain: 0.26, breath: 0.4, tension: 0.18, jitter: 18, shimmer: 0.12,
      f0: [[0, 300 * p], [0.25, 420 * p], [0.6, 445 * p], [1, 355 * p]],
      vowel: [[0, 'u'], [0.35, 'o'], [1, 'u']],
      a: 0.09, d: 0.2, s: 0.85, r: 0.22, vib: { rate: 4.2, depth: 14, delay: 0.25 }
    });
    v.room('nursery', 0.26);
  },

  /** Giggle — a burst sequence. Pitch steps down, each pulse rises inside. */
  'baby.giggle': (v, o) => {
    const n = o.count || 4 + Math.floor(v.rnd(0, 3));
    const p = v.rnd(0.95, 1.1);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const base = (520 - i * 26) * p * v.rnd(0.97, 1.03);
      const d = v.rnd(0.075, 0.105);
      // breathy onset — the /h/ of "he-he-he"
      v.noise({ t, dur: 0.026, kind: 'pink', f: 2100, to: 1300, q: 1.1, gain: 0.055, a: 0.003 });
      v.vox({
        t, dur: d, gain: 0.24 * (1 - i * 0.06), breath: 0.35, tension: 0.5, jitter: 34, shimmer: 0.2,
        f0: [[0, base * 0.86], [0.35, base * 1.1], [1, base * 0.9]],
        vowel: [[0, 'e'], [0.4, 'a'], [1, 'e']],
        a: 0.012, d: d * 0.4, s: 0.6, r: 0.05
      });
      t += d + v.rnd(0.045, 0.07);
    }
    // the little intake at the end
    v.noise({ t, dur: 0.16, kind: 'pink', f: 900, to: 2000, q: 1.5, gain: 0.05, a: 0.09, d: 0.06, sweep: 0.14 });
    v.until(t + 0.3);
    v.room('nursery', 0.3);
  },

  /** Full laugh — a big first "AH" then the giggle train, then a gasp. */
  'baby.laugh': (v) => {
    const p = v.rnd(0.96, 1.08);
    v.vox({
      dur: 0.24, gain: 0.3, breath: 0.4, tension: 0.62, jitter: 40, shimmer: 0.22, drive: 0.12,
      f0: [[0, 430 * p], [0.18, 620 * p], [1, 470 * p]],
      vowel: [[0, 'a'], [0.3, 'ae'], [1, 'a']], a: 0.014, d: 0.1, s: 0.6, r: 0.09
    });
    let t = 0.3;
    for (let i = 0; i < 4; i++) {
      const base = (540 - i * 40) * p;
      const d = v.rnd(0.08, 0.11);
      v.noise({ t, dur: 0.03, kind: 'pink', f: 2000, to: 1200, q: 1.1, gain: 0.06, a: 0.003 });
      v.vox({
        t, dur: d, gain: 0.26 - i * 0.03, breath: 0.4, tension: 0.55, jitter: 38, shimmer: 0.2,
        f0: [[0, base * 0.88], [0.3, base * 1.12], [1, base * 0.92]],
        vowel: [[0, 'a'], [0.5, 'ae'], [1, 'a']], a: 0.012, d: d * 0.4, s: 0.6, r: 0.05
      });
      t += d + v.rnd(0.05, 0.075);
    }
    v.noise({ t, dur: 0.22, kind: 'pink', f: 800, to: 2400, q: 1.4, gain: 0.07, a: 0.13, d: 0.07, sweep: 0.2 });
    v.until(t + 0.4);
    v.room('nursery', 0.32);
  },

  /** Whine — nasal, wavering, going nowhere. The pre-cry. */
  'baby.whine': (v) => {
    const p = v.rnd(0.95, 1.06);
    v.vox({
      dur: 1.05, gain: 0.24, breath: 0.22, tension: 0.42, jitter: 30, shimmer: 0.16,
      f0: [[0, 350 * p], [0.2, 430 * p], [0.55, 415 * p], [0.8, 440 * p], [1, 360 * p]],
      vowel: [[0, 'm'], [0.15, 'e'], [0.6, 'a'], [1, 'm']],
      a: 0.07, d: 0.25, s: 0.8, r: 0.22, vib: { rate: 6.5, depth: 30, delay: 0.15 }
    });
    v.room('nursery', 0.26);
  },

  /** Cry — intake, a rising strained wail, a second shorter one, a fall. */
  'baby.cry': (v, o) => {
    const p = v.rnd(0.95, 1.07);
    const big = o.big === true;
    // the breath in
    v.noise({ dur: 0.2, kind: 'pink', f: 700, to: 1900, q: 1.6, gain: 0.07, a: 0.14, d: 0.05, sweep: 0.18 });
    // wail 1
    v.vox({
      t: 0.18, dur: big ? 0.75 : 0.6, gain: big ? 0.34 : 0.28, breath: 0.3,
      tension: 0.8, jitter: 45, shimmer: 0.22, drive: big ? 0.22 : 0.14,
      f0: [[0, 380 * p], [0.16, 600 * p], [0.35, 640 * p], [0.7, 590 * p], [1, 430 * p]],
      vowel: [[0, 'a'], [0.2, 'ae'], [0.75, 'ae'], [1, 'a']],
      a: 0.03, d: 0.15, s: 0.85, r: 0.16, vib: { rate: 7, depth: 26, delay: 0.2 }
    });
    // a catch of breath
    v.noise({ t: big ? 0.98 : 0.83, dur: 0.15, kind: 'pink', f: 900, to: 2100, q: 1.5, gain: 0.06, a: 0.1, d: 0.04 });
    // wail 2, shorter and lower
    v.vox({
      t: big ? 1.1 : 0.95, dur: 0.45, gain: big ? 0.3 : 0.24, breath: 0.32,
      tension: 0.72, jitter: 48, shimmer: 0.24, drive: 0.12,
      f0: [[0, 400 * p], [0.2, 560 * p], [0.6, 520 * p], [1, 330 * p]],
      vowel: [[0, 'ae'], [0.6, 'a'], [1, 'a']],
      a: 0.025, d: 0.12, s: 0.8, r: 0.2, vib: { rate: 7.5, depth: 30, delay: 0.1 }
    });
    v.until((big ? 1.1 : 0.95) + 0.8);
    v.room('nursery', 0.3);
  },

  /** Sniffle — two wet nasal intakes. */
  'baby.sniffle': (v) => {
    for (let i = 0; i < 2; i++) {
      const t = i * 0.28;
      v.noise({ t, dur: 0.13, kind: 'pink', f: 900, to: 2200, q: 3.4, gain: 0.11, a: 0.05, d: 0.06, sweep: 0.11 });
      v.noise({ t: t + 0.01, dur: 0.1, kind: 'brown', f: 420, to: 700, q: 2.6, gain: 0.05, a: 0.04 });
      v.vox({
        t: t + 0.02, dur: 0.1, gain: 0.1, breath: 0.5, tension: 0.3, jitter: 40,
        f0: [[0, 420], [1, 470]], vowel: [[0, 'm'], [1, 'm']], a: 0.03, r: 0.05
      });
    }
    v.until(0.6);
    v.room('nursery', 0.24);
  },

  /** Yawn — a long open vowel that closes, with lots of air. */
  'baby.yawn': (v) => {
    const p = v.rnd(0.96, 1.06);
    v.noise({ dur: 0.5, kind: 'pink', f: 700, to: 1800, q: 1.1, gain: 0.07, a: 0.35, d: 0.12, s: 0.5, r: 0.2, sweep: 0.45 });
    v.vox({
      t: 0.12, dur: 1.15, gain: 0.24, breath: 0.62, tension: 0.28, jitter: 20, shimmer: 0.14,
      f0: [[0, 300 * p], [0.2, 400 * p], [0.5, 380 * p], [1, 235 * p]],
      vowel: [[0, 'a'], [0.15, 'a'], [0.6, 'o'], [1, 'u']],
      a: 0.22, d: 0.3, s: 0.8, r: 0.3, breathTo: 1400, vib: { rate: 3.5, depth: 12, delay: 0.4 }
    });
    v.until(1.7);
    v.room('nursery', 0.3);
  },

  /** Sleepy sigh — almost all breath, falling away to nothing. */
  'baby.sigh': (v) => {
    const p = v.rnd(0.95, 1.06);
    v.vox({
      dur: 0.8, gain: 0.17, breath: 0.8, tension: 0.14, jitter: 14, shimmer: 0.1,
      f0: [[0, 380 * p], [0.25, 350 * p], [1, 250 * p]],
      vowel: [[0, 'a'], [0.4, 'schwa'], [1, 'u']],
      a: 0.1, d: 0.25, s: 0.7, r: 0.35, breathTo: 1200
    });
    v.room('nursery', 0.3);
  },

  /** Hiccup — glottal closure, a squeezed upward chirp, a hollow thump. */
  'baby.hiccup': (v) => {
    const p = v.rnd(0.93, 1.1);
    v.tone({ f: 150 * p, to: 90, dur: 0.05, type: 'sine', gain: 0.1, a: 0.002 });
    v.vox({
      t: 0.01, dur: 0.09, gain: 0.3, breath: 0.25, tension: 0.75, jitter: 30, shimmer: 0,
      f0: [[0, 380 * p], [0.4, 720 * p], [1, 620 * p]],
      vowel: [[0, 'a'], [0.5, 'i'], [1, 'i']], a: 0.006, d: 0.03, s: 0.5, r: 0.03
    });
    v.noise({ t: 0.1, dur: 0.03, kind: 'pink', f: 1400, to: 500, q: 2.4, gain: 0.05, a: 0.002 });
    v.tone({ t: 0.11, f: 260 * p, to: 170, dur: 0.09, type: 'sine', gain: 0.06 });
    v.room('nursery', 0.24);
  },

  /** 「ばぶばぶ」 — babble. Plosive-gated syllables with morphing vowels. */
  'baby.babble': (v, o) => {
    const p = v.rnd(0.94, 1.1);
    const syl = o.syllables || ['ba', 'bu', 'ba', 'bu'];
    let t = 0;
    for (let i = 0; i < syl.length; i++) {
      const s = syl[i];
      const vowel = s[1] === 'u' ? 'u' : s[1] === 'i' ? 'i' : s[1] === 'e' ? 'e' : s[1] === 'o' ? 'o' : 'a';
      const base = (400 + (i % 2 ? -35 : 35)) * p * v.rnd(0.97, 1.04);
      const d = v.rnd(0.16, 0.21);
      // bilabial release: a short low burst
      v.noise({ t, dur: 0.02, kind: 'brown', f: 500, to: 260, q: 1.6, gain: 0.07, a: 0.001 });
      v.vox({
        t, dur: d, gain: 0.24, breath: 0.2, tension: 0.4, jitter: 26, shimmer: 0.14,
        f0: [[0, base * 0.9], [0.3, base * 1.06], [1, base * 0.92]],
        vowel: [[0, 'm'], [0.14, vowel], [0.9, vowel], [1, 'm']],
        a: 0.008, d: 0.05, s: 0.85, r: 0.04
      });
      t += d + v.rnd(0.04, 0.08);
    }
    v.until(t + 0.2);
    v.room('nursery', 0.26);
  },

  /** Delighted squeal — high, bright, a little bit wild. */
  'baby.squeal': (v) => {
    const p = v.rnd(0.96, 1.1);
    v.vox({
      dur: 0.55, gain: 0.24, breath: 0.3, tension: 0.7, jitter: 42, shimmer: 0.22, drive: 0.15,
      f0: [[0, 520 * p], [0.18, 900 * p], [0.5, 1000 * p], [0.8, 950 * p], [1, 700 * p]],
      vowel: [[0, 'e'], [0.25, 'i'], [0.8, 'i'], [1, 'e']],
      a: 0.02, d: 0.12, s: 0.85, r: 0.14, vib: { rate: 8, depth: 34, delay: 0.15 }
    });
    v.noise({ t: 0.02, dur: 0.5, kind: 'white', f: 4200, to: 3000, q: 1.4, gain: 0.035, a: 0.05, s: 0.5, r: 0.15 });
    v.room('nursery', 0.3);
  },

  /** ハックション！ — the sneeze from a bad towel-drying job. */
  'baby.sneeze': (v) => {
    const p = v.rnd(0.96, 1.08);
    // "ha…" the intake
    v.noise({ dur: 0.28, kind: 'pink', f: 800, to: 2200, q: 1.4, gain: 0.07, a: 0.2, d: 0.06, sweep: 0.26 });
    v.vox({
      t: 0.06, dur: 0.2, gain: 0.12, breath: 0.5, tension: 0.3, jitter: 25,
      f0: [[0, 420 * p], [1, 520 * p]], vowel: [[0, 'a'], [1, 'e']], a: 0.1, r: 0.06
    });
    // "…kshun!" the explosion
    v.noise({ t: 0.3, dur: 0.05, kind: 'white', f: 4600, to: 1800, q: 0.8, gain: 0.26, a: 0.001, d: 0.045 });
    v.vox({
      t: 0.3, dur: 0.22, gain: 0.26, breath: 0.55, tension: 0.75, jitter: 45, drive: 0.2,
      f0: [[0, 620 * p], [0.3, 520 * p], [1, 330 * p]],
      vowel: [[0, 'ae'], [0.4, 'a'], [1, 'u']], a: 0.008, d: 0.08, s: 0.5, r: 0.12
    });
    v.noise({ t: 0.34, dur: 0.3, kind: 'white', f: 3000, to: 1200, q: 1.1, gain: 0.09, a: 0.01, d: 0.24 });
    v.until(0.8);
    v.room('nursery', 0.3);
  }
};

/* --------------------------------------------------------------- aliases -- */
/* Short, forgiving names — including everything the old prototype used, so
 * gameplay code written against either vocabulary keeps working.            */

const ALIASES = {
  tap: 'ui.tap', pop: 'bath.bubble', chime: 'play.chime', star: 'ui.star',
  ding: 'ui.confirm', tada: 'ui.star', sparkle: 'sleep.twinkle',
  twinkle: 'sleep.twinkle', whoosh: 'ui.swipe', camera: 'dress.button',
  munch: 'feed.bite', chew: 'feed.chew', gulp: 'feed.gulp', suck: 'feed.suck',
  puha: 'feed.puha', burp: 'feed.burp', peel: 'feed.peel', slurp: 'feed.straw-slurp',
  strawStab: 'feed.straw-pierce', refuse: 'feed.refuse', pat: 'sleep.pat',
  splash: 'bath.splash', bubble: 'bath.bubble', shower: 'bath.shower',
  pour: 'bath.fill', shiver: 'bath.shiver', dryer: 'bath.hairdryer',
  washer: 'dress.washer', stink: 'dress.stink', brush: 'sleep.toothbrush',
  spit: 'sleep.spit', pageTurn: 'sleep.page', snore: 'sleep.snore',
  giggle: 'baby.giggle', happyBaby: 'baby.coo', sadBaby: 'baby.whine',
  cry: 'baby.cry', yawn: 'baby.yawn', sneeze: 'baby.sneeze',
  boing: 'play.balloon', bounce: 'play.bounce', balloonPop: 'bath.bubble',
  squeak: 'play.balloon-squeak', crash: 'play.collapse', drum: 'play.drum',
  taikoLow: 'play.drum', taikoHigh: 'play.drum', pofu: 'sleep.pat',
  peekabooCall: 'play.peekaboo-hide', peekabooBaa: 'play.peekaboo-baa',
  kenken: 'play.bounce', hairFlutter: 'dress.rustle', quack: 'play.balloon-squeak',
  crumple: 'feed.crumple', velcro: 'dress.velcro', zip: 'dress.zip',
  rattle: 'play.rattle', xylo: 'play.xylo', drip: 'dress.drip'
};

/* Options folded in for aliases that need them (e.g. the high drum). */
const ALIAS_OPTS = {
  taikoHigh: { hi: true }, balloonPop: { f: 900 }, pofu: {}
};

/* ------------------------------------------------------------ sustained -- */
/* Sounds that can be held indefinitely. Anything not listed here is looped by
 * re-triggering the one-shot on a musical-ish interval.                     */

const LOOPS = {
  'bath.tap':       { chunk: 1.2,  fade: 0.25 },
  'bath.shower':    { chunk: 1.4,  fade: 0.3 },
  'bath.fill':      { chunk: 2.4,  fade: 0.4 },
  'bath.steam':     { chunk: 0.9,  fade: 0.3 },
  'bath.lather':    { chunk: 0.5,  fade: 0.12 },
  'bath.swirl':     { chunk: 0.8,  fade: 0.2 },
  'bath.hairdryer': { chunk: 1.8,  fade: 0.35 },
  'dress.washer':   { chunk: 2.2,  fade: 0.4 },
  'dress.tumble':   { chunk: 2.0,  fade: 0.4 },
  'sleep.lamp':     { chunk: 2.0,  fade: 0.6 },
  'play.roll':      { chunk: 0.9,  fade: 0.2 },
  'sleep.toothbrush': { chunk: 0.42, fade: 0.1 }
};

/* Retrigger intervals for one-shots used as loops. */
const RETRIGGER = {
  'sleep.pat': 0.75, 'feed.suck': 0.42, 'feed.chew': 0.55,
  'bath.bubble': 0.5, 'dress.drip': 0.9, 'sleep.twinkle': 1.6,
  'play.bounce': 0.6, 'bath.splash': 0.8
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/* ============================================================== Audio ===== */

export class Audio {
  /**
   * @param {object} [opts]
   * @param {BaseAudioContext} [opts.context] inject a context (tests/offline).
   * @param {number} [opts.volume] master volume, 0..1.
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.ctx = null;
    this.synth = null;
    this.music = null;
    this.ready = false;
    this.muted = false;
    this.volume = opts.volume != null ? opts.volume : 0.8;
    this.space = 'nursery';
    this.listener = [0, 1.5, 3.2];
    this._rooms = new Map();
    this._delay = null;
    this._loops = new Set();
    this._lastPlay = new Map();
    this._unlockBound = null;

    if (opts.context) this._boot(opts.context);
  }

  /* ------------------------------------------------------------ boot --- */

  _boot(ctx) {
    if (this.ready) return;
    this.ctx = ctx;
    this.synth = new Synth(ctx);

    this.master = this.synth.masterBus(ctx.destination, { volume: this.muted ? 0 : this.volume });

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master.input);

    // Vocals get their own bus so music can duck against them.
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1.0;
    this.voiceBus.connect(this.master.input);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master.input);

    // The nursery is the room we are in most of the time — build it eagerly.
    this.roomBus('nursery');

    this.music = new Music(ctx, this.synth, this.musicBus);
    this.ready = true;
  }

  /** Lazily build (and cache) a reverb send for a named space. */
  roomBus(name) {
    if (!this.ready) return null;
    const key = SPACES[name] ? name : 'nursery';
    let bus = this._rooms.get(key);
    if (!bus) {
      bus = this.synth.reverb(key, { wet: key === 'dream' ? 0.75 : 0.85 });
      bus.output.connect(this.master.input);
      this._rooms.set(key, bus);
    }
    return bus;
  }

  delayBus() {
    if (!this.ready) return null;
    if (!this._delay) {
      this._delay = this.synth.stereoDelay({ time: 0.28, spread: 0.035, feedback: 0.3, cutoff: 2400, wet: 0.5 });
      this._delay.output.connect(this.master.input);
    }
    return this._delay;
  }

  /**
   * Create/resume the AudioContext. Must be called from a user gesture on
   * iOS — everything starts suspended and stays silent until it is.
   */
  unlock() {
    if (!this.ctx) {
      const AC = (typeof window !== 'undefined')
        ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AC) return Promise.resolve(false);
      let ctx;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        try { ctx = new AC(); } catch (e2) { return Promise.resolve(false); }
      }
      this._boot(ctx);
    }
    const ctx = this.ctx;
    const done = () => {
      // Safari sometimes needs an actual (silent) source to really start.
      try {
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) { /* fine */ }
      this._armGestureFallback(false);
      return true;
    };
    if (ctx.state === 'running') return Promise.resolve(done());
    const p = ctx.resume ? ctx.resume() : Promise.resolve();
    return Promise.resolve(p).then(done, () => { this._armGestureFallback(true); return false; });
  }

  /** If resume() was refused, try again on the next real gesture. */
  _armGestureFallback(arm) {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const evs = ['pointerdown', 'touchend', 'keydown'];
    if (arm && !this._unlockBound) {
      this._unlockBound = () => { this.unlock(); };
      for (const e of evs) window.addEventListener(e, this._unlockBound, { once: true, passive: true });
    } else if (!arm && this._unlockBound) {
      for (const e of evs) window.removeEventListener(e, this._unlockBound);
      this._unlockBound = null;
    }
  }

  /* ------------------------------------------------------------ query -- */

  /** Every playable name (canonical, sorted). */
  list() { return SOUND_NAMES.slice().sort(); }
  has(name) { return !!(SOUNDS[name] || SOUNDS[ALIASES[name]]); }
  resolve(name) { return SOUNDS[name] ? name : (ALIASES[name] || name); }

  /* ------------------------------------------------------------- play -- */

  /**
   * Fire a sound.
   * @param {string} name
   * @param {object} [opts] rate, gain, pan, when, space, position, plus any
   *                        recipe-specific options (velocity, note, count…).
   * @returns {Voice|null}
   */
  play(name, opts = {}) {
    if (!this.ready || this.muted) return null;
    if (this.ctx.state === 'suspended') return null;

    const key = this.resolve(name);
    const recipe = SOUNDS[key];
    if (!recipe) {
      if (typeof console !== 'undefined') console.warn('[audio] unknown sound:', name);
      return null;
    }

    // Voice-limit identical sounds so a held finger can't machine-gun.
    const now = this.ctx.currentTime;
    const last = this._lastPlay.get(key) || 0;
    const minGap = opts.minGap != null ? opts.minGap : 0.028;
    if (now - last < minGap) return null;
    this._lastPlay.set(key, now);

    const o = Object.assign({}, ALIAS_OPTS[name] || null, opts);
    const isVocal = key.startsWith('baby.');

    const vopts = {
      when: o.when != null ? (o.when > 1e6 ? o.when : now + o.when) : now + 0.004,
      rate: o.rate != null ? o.rate : 1,
      speed: o.speed != null ? o.speed : 1,
      gain: (o.gain != null ? o.gain : 1) * (isVocal ? 1.0 : 1.0),
      pan: o.pan || 0,
      space: o.space || this.space,
      dest: o.dest || (isVocal ? this.voiceBus : this.sfxBus)
    };

    // Per-trigger pitch variation — the thing that stops repeats sounding
    // identical. Vocals wander more than mechanical sounds.
    const v = new Voice(this, vopts);
    if (o.rate == null) v.rate *= v.vary(o.varyCents != null ? o.varyCents : (isVocal ? 70 : 32));

    // Positional playback.
    if (o.position) {
      const s = this.synth.spatial({ position: o.position, listener: this.listener });
      v.out.disconnect();
      v.out.connect(s.input);
      s.output.connect(vopts.dest);
      v._nodes.push(s.input);
      if (s.panner) v._nodes.push(s.panner);
    }

    try {
      recipe(v, o);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[audio] recipe failed:', key, err);
    }
    v.finish();

    // Speech-like cues get the music out of their way.
    if (isVocal && this.music) this.music.duck(0.55, Math.max(0.4, v.end - v.t + 0.25));
    else if (o.duck && this.music) this.music.duck(o.duck, 0.5);

    return v;
  }

  /** Positional convenience: `playAt('play.bounce', [x,y,z], { velocity })`. */
  playAt(name, position, opts = {}) {
    return this.play(name, Object.assign({}, opts, { position }));
  }

  /** Where the ears are. Call this when the camera rig moves. */
  setListener(pos) {
    if (pos && pos.isVector3) this.listener = [pos.x, pos.y, pos.z];
    else if (Array.isArray(pos)) this.listener = pos.slice(0, 3);
  }

  /** Default reverb space for subsequent sounds ('nursery'|'bathroom'|'dream'). */
  setSpace(name) { if (SPACES[name]) this.space = name; }

  /* ------------------------------------------------------------- loop -- */

  /**
   * Hold a sound. Returns a handle: `{ stop(fade), gain(v) }`.
   * Sustained recipes are re-armed just before they run out so the loop is
   * seamless; everything else is re-triggered on an interval.
   */
  loop(name, opts = {}) {
    const key = this.resolve(name);
    const ctl = this.ctx ? this.ctx.createGain() : null;
    const handle = {
      name: key, stopped: false, _timer: null, _node: ctl,
      gain: (val, fade = 0.12) => {
        if (!ctl) return handle;
        const t = this.ctx.currentTime;
        ctl.gain.cancelScheduledValues(t);
        ctl.gain.setValueAtTime(Math.max(0.0002, ctl.gain.value), t);
        ctl.gain.linearRampToValueAtTime(clamp(val, 0, 2), t + fade);
        return handle;
      },
      stop: (fade = 0.2) => {
        if (handle.stopped) return;
        handle.stopped = true;
        if (handle._timer) { clearTimeout(handle._timer); clearInterval(handle._timer); handle._timer = null; }
        this._loops.delete(handle);
        if (ctl) {
          const t = this.ctx.currentTime;
          ctl.gain.cancelScheduledValues(t);
          ctl.gain.setValueAtTime(Math.max(0.0002, ctl.gain.value), t);
          ctl.gain.linearRampToValueAtTime(0.0001, t + fade);
          const kill = () => { try { ctl.disconnect(); } catch (e) { /* gone */ } };
          if (this.synth && this.synth.offline) kill();
          else setTimeout(kill, fade * 1000 + 120);
        }
      }
    };

    if (!this.ready || !SOUNDS[key]) return handle;

    ctl.gain.value = opts.gain != null ? opts.gain : 1;
    ctl.connect(key.startsWith('baby.') ? this.voiceBus : this.sfxBus);
    this._loops.add(handle);

    const spec = LOOPS[key];
    const sustained = !!spec;
    const period = sustained ? spec.chunk : (opts.every || RETRIGGER[key] || 0.6);

    const fire = () => {
      if (handle.stopped || this.muted) return;
      this.play(key, Object.assign({}, opts, {
        dest: ctl, gain: 1, minGap: 0,
        dur: sustained ? spec.chunk + spec.fade : opts.dur
      }));
    };

    fire();
    if (this.synth.offline) return handle;   // offline renders one instance

    const ms = Math.max(60, period * 1000 - (sustained ? spec.fade * 500 : 0));
    handle._timer = setInterval(fire, ms);
    return handle;
  }

  /** Stop every running loop (used on scene change). */
  stopLoops(fade = 0.25) {
    for (const h of Array.from(this._loops)) h.stop(fade);
  }

  /* -------------------------------------------------------------- bgm -- */

  /** Crossfade to a BGM track. `null` stops the music. */
  bgm(name, opts = {}) {
    if (!this.ready || !this.music) return null;
    return this.music.play(name, opts);
  }

  /** Adaptive music control — see music.js. */
  setMusicMood(m) { if (this.music) this.music.setMood(m); }
  duckMusic(amount = 0.5, seconds = 0.6) { if (this.music) this.music.duck(amount, seconds); }

  /* -------------------------------------------------------------- mix -- */

  setMuted(v) {
    this.muted = !!v;
    if (!this.ready) return;
    this.master.setVolume(this.muted ? 0 : this.volume, 0.09);
    if (this.muted) this.stopLoops(0.1);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.ready && !this.muted) this.master.setVolume(this.volume, 0.15);
  }

  /** Pause everything (tab hidden). */
  suspend() {
    if (this.ready && this.ctx.suspend && this.ctx.state === 'running') {
      this.stopLoops(0.05);
      return this.ctx.suspend();
    }
    return Promise.resolve();
  }

  resume() {
    if (this.ready && this.ctx.resume && this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  dispose() {
    this.stopLoops(0);
    if (this.music) this.music.stop(0);
    if (this.ctx && this.ctx.close && !this.opts.context) this.ctx.close();
  }
}

export { SOUNDS, ALIASES, LOOPS, VOWELS, Voice };
export default Audio;
