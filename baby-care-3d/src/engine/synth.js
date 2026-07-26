/* ============================================================================
 * synth.js — WebAudio DSP toolkit
 * ----------------------------------------------------------------------------
 * Everything the game makes noise with is built from the primitives in here.
 * No sample files: oscillators, procedurally-filled noise buffers, envelopes,
 * filters, a procedurally-generated convolution reverb and a mastering chain.
 *
 * Three rules the whole audio pass follows:
 *   1. Nothing is created per-frame. Buffers (noise, impulse responses,
 *      waveshaper curves) are generated once and cached on the Synth.
 *   2. Every voice is self-cleaning: the last source node to stop disconnects
 *      the little subgraph it belonged to, so the graph never grows.
 *   3. The master bus is soft-limited and low-shelved. This is a toy for a
 *      four-year-old holding a tablet 30 cm from their face — nothing may
 *      clip, and nothing may startle.
 * ========================================================================== */

/* ------------------------------------------------------------- maths ----- */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = db => Math.pow(10, db / 20);
/** Musical ratio for a cents offset. */
export const cents = c => Math.pow(2, c / 1200);

/** Small deterministic PRNG — used for impulse responses so the reverb of a
 *  given room is identical every session (and every screenshot). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EPS = 0.00015;   // exponentialRamp floor — must never be 0

/* --------------------------------------------------------- reverb spec --- */

/**
 * The three rooms the game plays in. `brightness` is the initial one-pole
 * coefficient of the tail damping filter (higher = more tiles, less carpet).
 */
export const SPACES = {
  /** Small tiled bathroom: bright, flutter-y early reflections, ~1.1 s. */
  bathroom: { seconds: 1.15, decay: 4.2, brightness: 0.82, damping: 0.55, predelay: 0.006, taps: 16, width: 0.75, seed: 0x5eed01 },
  /** Soft nursery: rugs, curtains and a cot — dark and short, ~0.6 s. */
  nursery:  { seconds: 0.62, decay: 6.5, brightness: 0.30, damping: 0.80, predelay: 0.004, taps: 9,  width: 0.55, seed: 0x5eed02 },
  /** Wide dreamy hall for the sleep scene — long, soft, very wide. */
  dream:    { seconds: 2.70, decay: 2.4, brightness: 0.48, damping: 0.35, predelay: 0.030, taps: 7,  width: 1.00, seed: 0x5eed03 }
};

/* ============================================================== Synth ===== */

export class Synth {
  /**
   * @param {BaseAudioContext} ctx  a real AudioContext or an OfflineAudioContext.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.offline = typeof ctx.startRendering === 'function';
    this._noise = new Map();
    this._ir = new Map();
    this._curves = new Map();
    this._mod = new Map();
    this.rng = mulberry32(0xC0FFEE);
  }

  get now() { return this.ctx.currentTime; }

  /* ------------------------------------------------------------ noise --- */

  /**
   * Cached noise buffer. White is uniform, pink uses the Paul Kellet
   * approximation, brown is a leaky integrator. Two seconds is long enough
   * that looped playback with a random offset never sounds periodic.
   */
  noiseBuffer(kind = 'white', seconds = 2) {
    const key = kind + '|' + seconds;
    if (this._noise.has(key)) return this._noise.get(key);

    const ctx = this.ctx;
    const len = Math.max(256, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const rnd = mulberry32(0xA11CE ^ (kind.length * 2654435761));

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      if (kind === 'pink') {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const w = rnd() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.0168980;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
          b6 = w * 0.115926;
        }
      } else if (kind === 'brown') {
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = rnd() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        }
      } else {
        for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
      }
    }
    this._noise.set(key, buf);
    return buf;
  }

  /**
   * A noise voice. Returns the AudioBufferSourceNode (already started).
   * `dur` only controls when it stops — shaping is the caller's job.
   */
  noiseSource({ kind = 'white', when = this.now, dur = 0.5, rate = 1, loop = true } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(kind);
    src.loop = loop;
    src.playbackRate.value = rate;
    const off = this.rng() * (src.buffer.duration - 0.05);
    src.start(when, off, loop ? undefined : Math.max(0.01, dur));
    src.stop(when + dur + 0.02);
    src.__stopAt = when + dur + 0.02;
    return src;
  }

  /* ----------------------------------------------------- oscillators ---- */

  /** Single oscillator, started/stopped for you. */
  osc({ type = 'sine', freq = 440, detune = 0, when = this.now, dur = 0.5,
        glide = null, glideTo = null, curve = 'exp' } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type === 'pulse' ? 'square' : type;
    o.frequency.setValueAtTime(Math.max(0.01, freq), when);
    o.detune.value = detune;
    if (glideTo != null) {
      const t1 = when + (glide != null ? glide : dur);
      if (curve === 'lin') o.frequency.linearRampToValueAtTime(Math.max(0.01, glideTo), t1);
      else o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t1);
    }
    o.start(when);
    o.stop(when + dur + 0.02);
    o.__stopAt = when + dur + 0.02;
    return o;
  }

  /**
   * Detuned unison stack — the cheap way to make a synth sound "wide" and
   * expensive. Returns { out, oscs }.
   */
  unison({ type = 'sawtooth', freq = 220, voices = 3, spread = 12,
           when = this.now, dur = 1, stereo = true } = {}) {
    const out = this.ctx.createGain();
    out.gain.value = 1 / Math.sqrt(voices);
    const oscs = [];
    for (let i = 0; i < voices; i++) {
      const k = voices === 1 ? 0 : (i / (voices - 1)) * 2 - 1;      // -1..1
      const o = this.osc({ type, freq, detune: k * spread, when, dur });
      let node = o;
      if (stereo && this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = k * 0.7;
        o.connect(p);
        node = p;
      }
      node.connect(out);
      oscs.push(o);
    }
    return { out, oscs };
  }

  /* ------------------------------------------------------- envelopes ---- */

  /**
   * ADSR gain node. `dur` is the time from attack to the start of the
   * release; `end` on the returned node tells you when it is truly silent.
   */
  env({ when = this.now, dur = 0.3, a = 0.005, d = 0.08, s = 0.0, r = 0.12,
        peak = 1, shape = 'exp' } = {}) {
    const g = this.ctx.createGain();
    const p = g.gain;
    const pk = Math.max(EPS * 2, peak);
    const sus = Math.max(EPS, pk * s);
    a = Math.max(0.0008, a);
    d = Math.max(0.001, d);
    r = Math.max(0.004, r);
    const hold = Math.max(a + d, dur);

    p.setValueAtTime(EPS, when);
    if (shape === 'lin') p.linearRampToValueAtTime(pk, when + a);
    else p.exponentialRampToValueAtTime(pk, when + a);

    if (s > 0.001) {
      p.exponentialRampToValueAtTime(sus, when + a + d);
      p.setValueAtTime(sus, when + hold);
      p.exponentialRampToValueAtTime(EPS, when + hold + r);
    } else {
      // Percussive: one long decay that lands exactly at the release point.
      p.exponentialRampToValueAtTime(EPS, when + Math.max(a + d, hold + r));
    }
    const end = when + hold + r + 0.01;
    p.linearRampToValueAtTime(0, end);
    g.end = end;
    return g;
  }

  /** Fixed-shape "pluck / mallet" envelope: instant on, exponential off. */
  hit({ when = this.now, dur = 0.4, peak = 1, a = 0.002 } = {}) {
    return this.env({ when, dur: Math.max(0.01, dur - 0.02), a, d: dur * 0.9, s: 0, r: 0.02, peak });
  }

  /* --------------------------------------------------------- filters ---- */

  /**
   * Biquad with an optional envelope on the cutoff — the single most useful
   * thing in this file. `to` sweeps the cutoff over `sweep` seconds.
   */
  filter({ type = 'lowpass', freq = 1000, q = 1, gain = 0, when = this.now,
           to = null, sweep = null, dur = 0.3, curve = 'exp' } = {}) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    if (type === 'lowshelf' || type === 'highshelf' || type === 'peaking') f.gain.value = gain;
    const nyq = this.ctx.sampleRate * 0.5;
    const f0 = clamp(freq, 10, nyq * 0.98);
    f.frequency.setValueAtTime(f0, when);
    if (to != null) {
      const t1 = when + (sweep != null ? sweep : dur);
      const f1 = clamp(to, 10, nyq * 0.98);
      if (curve === 'lin') f.frequency.linearRampToValueAtTime(f1, t1);
      else f.frequency.exponentialRampToValueAtTime(f1, t1);
    }
    return f;
  }

  /** Parallel formant bank. Returns { input, output, filters }. */
  formantBank(specs, when = this.now) {
    const input = this.ctx.createGain();
    const output = this.ctx.createGain();
    const filters = [];
    for (const s of specs) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(clamp(s.f, 40, this.ctx.sampleRate * 0.45), when);
      bp.Q.setValueAtTime(Math.max(0.3, s.f / Math.max(30, s.bw || 90)), when);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(s.gain != null ? s.gain : 1, when);
      input.connect(bp); bp.connect(g); g.connect(output);
      filters.push({ bp, g });
    }
    return { input, output, filters };
  }

  /* ------------------------------------------------------------ LFOs ---- */

  /**
   * LFO driving an AudioParam. `depth` is in the param's own units.
   * Returns { osc, gain } so the caller can automate depth if it wants.
   */
  lfo({ freq = 5, depth = 1, type = 'sine', target = null, when = this.now,
        dur = 1, delay = 0, phase = 0 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(delay > 0 ? EPS : depth, when);
    if (delay > 0) g.gain.linearRampToValueAtTime(depth, when + delay);
    o.connect(g);
    if (target) g.connect(target);
    // A tiny start offset approximates a phase control.
    o.start(when + (phase ? phase / (freq * Math.PI * 2) : 0));
    o.stop(when + dur + 0.02);
    o.__stopAt = when + dur + 0.02;
    return { osc: o, gain: g };
  }

  /**
   * Smooth band-limited random modulation as an audio-rate buffer.
   * Used for vocal jitter/shimmer and for "hand wobble" on water sounds.
   */
  randomMod({ dur = 1, rate = 30, seed = null, smooth = true } = {}) {
    const ctx = this.ctx;
    const key = `${dur.toFixed(2)}|${rate}|${seed}|${smooth}`;
    let buf = this._mod.get(key);
    if (!buf) {
      const len = Math.max(64, Math.ceil(ctx.sampleRate * dur));
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      const rnd = mulberry32(seed == null ? (Math.random() * 1e9) | 0 : seed);
      const step = Math.max(2, Math.floor(ctx.sampleRate / rate));
      let prev = rnd() * 2 - 1, next = rnd() * 2 - 1, k = 0;
      for (let i = 0; i < len; i++) {
        if (k >= step) { prev = next; next = rnd() * 2 - 1; k = 0; }
        const t = k / step;
        d[i] = smooth ? lerp(prev, next, t * t * (3 - 2 * t)) : prev;
        k++;
      }
      if (seed != null) this._mod.set(key, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  /** Wire smooth random modulation into a param (e.g. detune jitter). */
  jitter(param, { depth = 20, rate = 28, when = this.now, dur = 1, seed = null } = {}) {
    const src = this.randomMod({ dur: Math.min(2, Math.max(0.3, dur)), rate, seed });
    const g = this.ctx.createGain();
    g.gain.value = depth;
    src.connect(g); g.connect(param);
    src.start(when);
    src.stop(when + dur + 0.02);
    src.__stopAt = when + dur + 0.02;
    return { src, gain: g };
  }

  /* ------------------------------------------------------ distortion ---- */

  /** Soft saturation. amount 0..1 → gentle warmth to hard clip. */
  shaper({ amount = 0.4, oversample = '2x' } = {}) {
    const key = 'sat' + amount.toFixed(3);
    let curve = this._curves.get(key);
    if (!curve) {
      const n = 2048;
      curve = new Float32Array(n);
      const k = 1 + amount * 40;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * k) / Math.tanh(k);
      }
      this._curves.set(key, curve);
    }
    const ws = this.ctx.createWaveShaper();
    ws.curve = curve;
    ws.oversample = oversample;
    return ws;
  }

  /** Quantising waveshaper — "bitcrush". bits 1..16. */
  bitcrush({ bits = 6 } = {}) {
    const b = clamp(Math.round(bits), 1, 16);
    const key = 'crush' + b;
    let curve = this._curves.get(key);
    if (!curve) {
      const n = 4096;
      const steps = Math.pow(2, b) - 1;
      curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.round(((x + 1) / 2) * steps) / steps * 2 - 1;
      }
      this._curves.set(key, curve);
    }
    const ws = this.ctx.createWaveShaper();
    ws.curve = curve;
    ws.oversample = 'none';
    return ws;
  }

  /* ---------------------------------------------------------- reverb ---- */

  /**
   * Procedural impulse response.
   *
   * Structure mirrors a real room: a short pre-delay, a handful of discrete
   * early reflections whose spacing differs slightly per channel (that
   * decorrelation is what makes it sound wide rather than mono-in-the-middle),
   * then a diffuse noise tail with an exponential amplitude decay and a
   * one-pole damping filter whose cutoff falls over time, because air and
   * soft furnishings eat the top end first.
   */
  impulse(name = 'nursery') {
    if (this._ir.has(name)) return this._ir.get(name);
    const spec = SPACES[name] || SPACES.nursery;
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.max(64, Math.floor(sr * spec.seconds));
    const buf = ctx.createBuffer(2, len, sr);
    const rnd = mulberry32(spec.seed);

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const side = ch === 0 ? -1 : 1;

      // --- diffuse tail -------------------------------------------------
      let lp = 0;
      const pre = Math.floor(spec.predelay * sr * (1 + side * 0.06 * spec.width));
      for (let i = 0; i < len; i++) {
        const t = i / len;
        if (i < pre) { d[i] = 0; continue; }
        const w = rnd() * 2 - 1;
        // damping coefficient falls from `brightness` toward a dull tail
        const coef = lerp(spec.brightness, spec.brightness * (1 - spec.damping), t);
        lp += coef * (w - lp);
        const decay = Math.pow(1 - t, spec.decay) * (1 - Math.exp(-i / (sr * 0.004)));
        d[i] = lp * decay;
      }

      // --- early reflections -------------------------------------------
      for (let k = 0; k < spec.taps; k++) {
        const frac = Math.pow((k + 1) / spec.taps, 1.35);
        const jitterS = (rnd() - 0.5) * 0.004 * spec.width;
        const pos = Math.floor((spec.predelay + frac * spec.seconds * 0.16 + jitterS
                                + side * 0.0011 * spec.width) * sr);
        if (pos < 1 || pos >= len) continue;
        const amp = (0.55 / (1 + k * 0.85)) * (rnd() > 0.5 ? 1 : -1)
                    * (1 + side * 0.18 * spec.width);
        d[pos] += amp;
        if (pos + 1 < len) d[pos + 1] += amp * 0.4;   // 1-sample smear
      }
    }

    // Normalise to a predictable loudness so send levels mean the same thing
    // for every room.
    let peak = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak > 0) {
      const g = 0.62 / peak;
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] *= g;
      }
    }
    this._ir.set(name, buf);
    return buf;
  }

  /**
   * A complete reverb send: input gain → damping HP/LP → convolver → wet gain.
   * Connect it once, feed it from many voices.
   */
  reverb(name = 'nursery', { wet = 0.9, preLow = 220, preHigh = 7200 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const hp = this.filter({ type: 'highpass', freq: preLow, q: 0.6 });
    const lp = this.filter({ type: 'lowpass', freq: preHigh, q: 0.6 });
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = this.impulse(name);
    const out = ctx.createGain();
    out.gain.value = wet;
    input.connect(hp); hp.connect(lp); lp.connect(conv); conv.connect(out);
    return { input, output: out, convolver: conv, name };
  }

  /* ----------------------------------------------------------- delay ---- */

  /**
   * Stereo ping-pong-ish delay with a filtered feedback path. Returns
   * { input, output } plus the params so callers can automate them.
   */
  stereoDelay({ time = 0.25, spread = 0.02, feedback = 0.32,
                cutoff = 2600, highpass = 300, wet = 0.35 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const output = ctx.createGain();
    output.gain.value = wet;

    const dl = ctx.createDelay(2.0); dl.delayTime.value = Math.max(0.001, time);
    const dr = ctx.createDelay(2.0); dr.delayTime.value = Math.max(0.001, time + spread);
    const fb = ctx.createGain(); fb.gain.value = clamp(feedback, 0, 0.85);
    const lp = this.filter({ type: 'lowpass', freq: cutoff, q: 0.5 });
    const hp = this.filter({ type: 'highpass', freq: highpass, q: 0.5 });

    let pl = null, pr = null;
    if (ctx.createStereoPanner) {
      pl = ctx.createStereoPanner(); pl.pan.value = -0.6;
      pr = ctx.createStereoPanner(); pr.pan.value = 0.6;
    }

    input.connect(dl); input.connect(dr);
    // cross-feedback: left tail feeds right delay and vice-versa
    dl.connect(lp); dr.connect(lp);
    lp.connect(hp); hp.connect(fb);
    fb.connect(dr); fb.connect(dl);
    (pl ? (dl.connect(pl), pl) : dl).connect(output);
    (pr ? (dr.connect(pr), pr) : dr).connect(output);

    return { input, output, delayL: dl, delayR: dr, feedback: fb, filter: lp };
  }

  /* ----------------------------------------------------- master chain --- */

  /**
   * Mastering bus. Gentle 2-stage dynamics: a slow musical compressor to glue
   * everything, then a fast brickwall-ish limiter so a stray layered SFX can
   * never spike. A low shelf keeps things warm on tinny tablet speakers, and
   * a small high shelf takes the edge off harsh transients near a child's ear.
   */
  masterBus(destination, { volume = 0.85 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();

    const shelf = this.filter({ type: 'lowshelf', freq: 210, gain: 3.5 });
    const tame = this.filter({ type: 'highshelf', freq: 6200, gain: -3.0 });
    // Notch out the "ice pick" region a bit — 3 kHz is where cheap speakers
    // and child hearing sensitivity conspire against you.
    const soften = this.filter({ type: 'peaking', freq: 3100, q: 1.1, gain: -2.0 });

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 26;
    comp.ratio.value = 3;
    comp.attack.value = 0.012;
    comp.release.value = 0.28;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3.5;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.09;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    input.connect(shelf); shelf.connect(soften); soften.connect(tame);
    tame.connect(comp); comp.connect(limiter); limiter.connect(gain);
    gain.connect(destination || ctx.destination);

    return {
      input, output: gain, compressor: comp, limiter, shelf, gain,
      setVolume(v, t = 0.08) {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(EPS, gain.gain.value), now);
        gain.gain.linearRampToValueAtTime(clamp(v, 0, 1.2), now + t);
      }
    };
  }

  /* ------------------------------------------------------- panning 3D --- */

  /**
   * Cheap positional audio: StereoPanner + a distance gain curve. A full
   * PannerNode is overkill (and expensive on tier-0 devices) for a game whose
   * camera looks at a single room from a fixed-ish angle.
   */
  spatial({ position = [0, 0, 0], listener = [0, 1.5, 3.5], spread = 1.6,
            rolloff = 0.9, min = 0.35 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let node = g;
    let panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      g.connect(panner);
      node = panner;
    }
    const api = {
      input: g, output: node, panner,
      set(pos, lis) {
        const p = pos || position, l = lis || listener;
        const dx = p[0] - l[0], dy = (p[1] || 0) - (l[1] || 0), dz = (p[2] || 0) - (l[2] || 0);
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const att = clamp(1 / (1 + rolloff * dist * dist * 0.18), min, 1);
        // Pan by the lateral offset, softened by distance so far-away sounds
        // stay near the middle instead of flapping across the stereo field.
        const pan = clamp((dx / spread) / (1 + dist * 0.25), -0.85, 0.85);
        g.gain.value = att;
        if (panner) panner.pan.value = pan;
        return { pan, gain: att, dist };
      }
    };
    api.set(position, listener);
    return api;
  }

  /* ---------------------------------------------------------- hygiene --- */

  /**
   * Disconnect `nodes` once the longest-lived source has finished.
   * Works in an OfflineAudioContext too (onended fires during rendering),
   * with a wall-clock backstop for realtime contexts.
   */
  autoClean(nodes, sources, endTime) {
    const kill = () => {
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already gone */ } }
      nodes.length = 0;
    };
    let last = null, lastT = -Infinity;
    for (const s of sources) {
      const t = s.__stopAt != null ? s.__stopAt : endTime;
      if (t >= lastT) { lastT = t; last = s; }
    }
    if (last) last.onended = kill;
    if (!this.offline) {
      const ms = Math.max(60, ((endTime != null ? endTime : lastT) - this.now) * 1000 + 260);
      setTimeout(kill, ms);
    }
    return kill;
  }
}

export default Synth;
