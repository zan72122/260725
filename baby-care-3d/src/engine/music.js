/* ============================================================================
 * music.js — adaptive background music
 * ----------------------------------------------------------------------------
 * Four pieces, all played by a synthesised music-box / celesta / marimba /
 * soft-pad ensemble. They are *written*, not generated: each has a chord
 * progression, a melody with antecedent-and-consequent phrasing, a bass line
 * and a light percussion layer.
 *
 * Adaptivity is by layer, not by piece. The score is compiled once into a flat
 * event list tagged with a layer name; every layer has its own gain node, and
 * `setMood()` fades them against each other. When the baby gets sleepy the
 * melody and shaker withdraw and the pad swells, and the tempo eases off —
 * same piece, different feeling, no seam.
 *
 * Timing comes from a lookahead scheduler: a setTimeout tick queues every
 * event that falls inside the next ~180 ms against `AudioContext.currentTime`.
 * Nothing is ever scheduled from requestAnimationFrame — a dropped frame must
 * not become a dropped beat.
 * ========================================================================== */

import { midiToFreq, clamp, lerp } from './synth.js';

/* ------------------------------------------------------------- scores ---- */
/*
 * Melody/bass/etc. events are [bar, beat, durationInBeats, midi, velocity].
 * Percussion events are [bar, beat, instrument, velocity].
 * Chords are absolute midi note arrays, one per bar, used by the pad and by
 * the generated harmony/bass parts.
 */

/** Warm major triad/7th voicings around the middle of the keyboard. */
const CH = {
  C:   [48, 55, 60, 64, 67],
  Am:  [45, 52, 57, 60, 64],
  F:   [41, 48, 53, 57, 60],
  G:   [43, 50, 55, 59, 62],
  G7:  [43, 50, 53, 59, 62],
  Dm:  [38, 45, 50, 53, 57],
  Dm7: [38, 45, 48, 53, 57],
  Bb:  [46, 53, 58, 62, 65],
  Gm7: [43, 50, 53, 58, 62],
  C7s: [48, 55, 58, 60, 65],
  Fm:  [41, 48, 53, 56, 60],
  Em:  [40, 47, 52, 55, 59],
  D:   [38, 45, 50, 54, 57],
  Cg:  [36, 43, 48, 52, 55],
  Bbm: [46, 53, 58, 61, 65]
};

const TRACKS = {

  /* ---------------------------------------------------- playful daytime -- */
  day: {
    title: 'ひなたのおせわ',
    bpm: 108, beatsPerBar: 4, bars: 8,
    lead: 'celesta', harm: 'marimba', bassInst: 'bass', padInst: 'pad',
    swing: 0.06,
    chords: [CH.C, CH.Am, CH.F, CH.G, CH.C, CH.Am, CH.Dm, CH.G7],
    // antecedent (bars 0-3) answered by a higher consequent (bars 4-7)
    melody: [
      [0, 0, 1, 76, 0.90], [0, 1, 0.5, 79, 0.80], [0, 1.5, 0.5, 76, 0.70], [0, 2, 1, 72, 0.85], [0, 3, 1, 74, 0.80],
      [1, 0, 1.5, 76, 0.90], [1, 1.5, 0.5, 72, 0.70], [1, 2, 2, 69, 0.85],
      [2, 0, 1, 77, 0.90], [2, 1, 1, 76, 0.80], [2, 2, 1, 74, 0.80], [2, 3, 1, 72, 0.78],
      [3, 0, 1, 74, 0.88], [3, 1, 1, 71, 0.78], [3, 2, 2, 74, 0.85],
      [4, 0, 1, 76, 0.92], [4, 1, 0.5, 79, 0.82], [4, 1.5, 0.5, 81, 0.86], [4, 2, 1, 79, 0.86], [4, 3, 1, 76, 0.80],
      [5, 0, 1, 81, 0.95], [5, 1, 1, 79, 0.85], [5, 2, 2, 76, 0.85],
      [6, 0, 1, 74, 0.85], [6, 1, 1, 77, 0.85], [6, 2, 1, 76, 0.80], [6, 3, 1, 74, 0.78],
      [7, 0, 1, 71, 0.85], [7, 1, 1, 74, 0.85], [7, 2, 2, 72, 0.92]
    ],
    sparkle: [
      [1, 3, 1, 88, 0.5], [3, 3, 1, 91, 0.5], [5, 3, 0.5, 93, 0.45], [5, 3.5, 0.5, 88, 0.4], [7, 3, 1, 84, 0.5]
    ],
    bass: 'walk',      // generated: root / fifth / root / approach
    harmony: 'offbeat',
    perc: 'shaker8',
    layers: { pad: 0.55, bass: 0.85, harmony: 0.6, melody: 1.0, perc: 0.5, sparkle: 0.5 }
  },

  /* -------------------------------------------------------- gentle bath -- */
  bath: {
    title: 'ぽかぽかおふろ',
    bpm: 72, beatsPerBar: 4, bars: 8,
    lead: 'musicbox', harm: 'celesta', bassInst: 'bass', padInst: 'pad',
    swing: 0,
    chords: [CH.F, CH.Bb, CH.Gm7, CH.C7s, CH.F, CH.Dm7, CH.Bb, CH.C7s],
    melody: [
      [0, 0, 2, 77, 0.75], [0, 2, 1, 81, 0.70], [0, 3, 1, 79, 0.65],
      [1, 0, 2, 77, 0.75], [1, 2, 2, 74, 0.68],
      [2, 0, 1.5, 75, 0.72], [2, 1.5, 0.5, 77, 0.60], [2, 2, 2, 79, 0.70],
      [3, 0, 2, 77, 0.72], [3, 2, 2, 72, 0.66],
      [4, 0, 2, 84, 0.78], [4, 2, 1, 81, 0.70], [4, 3, 1, 79, 0.66],
      [5, 0, 1.5, 77, 0.74], [5, 1.5, 0.5, 79, 0.62], [5, 2, 2, 81, 0.72],
      [6, 0, 2, 79, 0.72], [6, 2, 1, 77, 0.66], [6, 3, 1, 75, 0.62],
      [7, 0, 3, 77, 0.74], [7, 3, 1, 72, 0.60]
    ],
    sparkle: [
      [0, 3.5, 0.5, 89, 0.35], [2, 2.5, 0.5, 86, 0.32], [4, 1.5, 0.5, 91, 0.35],
      [5, 3.5, 0.5, 89, 0.3], [7, 2, 1, 84, 0.35]
    ],
    bass: 'half',
    harmony: 'arpeggio',
    perc: 'drops',
    layers: { pad: 0.9, bass: 0.7, harmony: 0.5, melody: 0.9, perc: 0.35, sparkle: 0.45 }
  },

  /* --------------------------------------------- curious / exploration --- */
  curious: {
    title: 'なにかな？',
    bpm: 96, beatsPerBar: 4, bars: 8,
    lead: 'marimba', harm: 'marimba', bassInst: 'pizz', padInst: 'pad',
    swing: 0.08,
    // D dorian — the natural 6th (B) is what makes it inquisitive, not sad
    chords: [CH.Dm, CH.Dm, CH.F, CH.G, CH.Dm, CH.Bb, CH.C, CH.Dm],
    melody: [
      [0, 0, 0.5, 74, 0.85], [0, 0.5, 0.5, 77, 0.70], [0, 1, 0.5, 79, 0.80], [0, 2, 1, 81, 0.85], [0, 3, 0.5, 79, 0.7],
      [1, 0, 0.5, 77, 0.80], [1, 0.5, 0.5, 79, 0.68], [1, 1, 1, 74, 0.80], [1, 2.5, 0.5, 72, 0.62], [1, 3, 1, 74, 0.72],
      [2, 0, 0.5, 77, 0.85], [2, 0.5, 0.5, 81, 0.72], [2, 1, 1, 84, 0.88], [2, 2.5, 0.5, 81, 0.7], [2, 3, 1, 79, 0.75],
      [3, 0, 1, 83, 0.85], [3, 1, 0.5, 81, 0.7], [3, 1.5, 0.5, 79, 0.68], [3, 2, 2, 74, 0.8],
      [4, 0, 0.5, 74, 0.85], [4, 0.5, 0.5, 77, 0.70], [4, 1, 0.5, 79, 0.80], [4, 2, 1, 81, 0.85], [4, 3, 0.5, 84, 0.75],
      [5, 0, 1, 82, 0.85], [5, 1, 0.5, 79, 0.7], [5, 2, 1, 77, 0.78], [5, 3, 1, 74, 0.7],
      [6, 0, 0.5, 76, 0.85], [6, 0.5, 0.5, 79, 0.7], [6, 1, 1, 84, 0.85], [6, 2, 1, 83, 0.78], [6, 3, 1, 79, 0.72],
      [7, 0, 1, 77, 0.85], [7, 1, 1, 74, 0.8], [7, 2, 2, 74, 0.86]
    ],
    sparkle: [[3, 3, 1, 93, 0.4], [7, 2.5, 0.5, 91, 0.4], [7, 3, 1, 86, 0.35]],
    bass: 'pulse',
    harmony: 'offbeat',
    perc: 'woodblock',
    layers: { pad: 0.4, bass: 0.85, harmony: 0.45, melody: 1.0, perc: 0.55, sparkle: 0.4 }
  },

  /* ------------------------------------------------------------ lullaby -- */
  lullaby: {
    title: 'おやすみのうた',
    bpm: 58, beatsPerBar: 3, bars: 8,
    lead: 'musicbox', harm: 'musicbox', bassInst: 'bass', padInst: 'pad',
    swing: 0,
    chords: [
      [43, 50, 55, 59, 62],  // G
      [40, 47, 52, 55, 59],  // Em
      [36, 48, 52, 55, 60],  // C
      [38, 45, 50, 54, 57],  // D
      [43, 50, 55, 59, 62],  // G
      [36, 48, 52, 55, 60],  // C
      [38, 45, 50, 54, 57],  // D
      [43, 50, 55, 59, 62]   // G
    ],
    melody: [
      [0, 0, 2, 79, 0.7], [0, 2, 1, 78, 0.55],
      [1, 0, 2, 76, 0.68], [1, 2, 1, 74, 0.52],
      [2, 0, 1, 72, 0.66], [2, 1, 1, 74, 0.55], [2, 2, 1, 76, 0.58],
      [3, 0, 3, 74, 0.68],
      [4, 0, 2, 79, 0.72], [4, 2, 1, 81, 0.58],
      [5, 0, 2, 83, 0.70], [5, 2, 1, 79, 0.55],
      [6, 0, 1, 78, 0.64], [6, 1, 1, 76, 0.56], [6, 2, 1, 74, 0.54],
      [7, 0, 3, 67, 0.66]
    ],
    sparkle: [
      [1, 2.5, 0.5, 91, 0.3], [3, 2, 1, 88, 0.32], [5, 2.5, 0.5, 93, 0.3], [7, 1, 2, 79, 0.3]
    ],
    bass: 'waltz',
    harmony: 'none',
    perc: 'heartbeat',
    layers: { pad: 1.0, bass: 0.6, harmony: 0.0, melody: 0.9, perc: 0.3, sparkle: 0.5 }
  }
};

/** Friendly names the game can use. */
const TRACK_ALIAS = {
  happy: 'day', play: 'day', feed: 'day', dress: 'day', main: 'day',
  explore: 'curious', menu: 'curious', title: 'curious',
  sleep: 'lullaby', night: 'lullaby', bathtime: 'bath'
};

export const TRACK_NAMES = Object.keys(TRACKS);

/* ------------------------------------------------------------ compiler --- */

/**
 * Turn a track definition into a flat, sorted event list.
 * Every event: { bar, beat, dur, midi, vel, layer, inst }.
 * Percussion events carry `perc` instead of `midi`.
 */
export function compileTrack(def) {
  const ev = [];
  const chordOf = b => def.chords[b % def.chords.length];

  for (const [bar, beat, dur, midi, vel] of def.melody) {
    ev.push({ bar, beat, dur, midi, vel, layer: 'melody', inst: def.lead });
  }
  for (const [bar, beat, dur, midi, vel] of (def.sparkle || [])) {
    ev.push({ bar, beat, dur, midi, vel, layer: 'sparkle', inst: 'bell' });
  }

  for (let bar = 0; bar < def.bars; bar++) {
    const ch = chordOf(bar);
    const root = ch[0];
    const bpb = def.beatsPerBar;

    /* --- pad: one sustained voicing per bar ------------------------- */
    ev.push({ bar, beat: 0, dur: bpb, midi: ch.slice(1), vel: 0.5, layer: 'pad', inst: def.padInst });

    /* --- bass ------------------------------------------------------- */
    switch (def.bass) {
      case 'walk': {
        const next = chordOf(bar + 1)[0];
        const approach = next + (next > root ? -1 : 1);
        ev.push({ bar, beat: 0, dur: 1.2, midi: root, vel: 0.85, layer: 'bass', inst: def.bassInst });
        ev.push({ bar, beat: 1.5, dur: 0.5, midi: root + 7, vel: 0.6, layer: 'bass', inst: def.bassInst });
        ev.push({ bar, beat: 2, dur: 1.0, midi: root, vel: 0.75, layer: 'bass', inst: def.bassInst });
        ev.push({ bar, beat: 3.5, dur: 0.5, midi: approach, vel: 0.55, layer: 'bass', inst: def.bassInst });
        break;
      }
      case 'half':
        ev.push({ bar, beat: 0, dur: 2, midi: root, vel: 0.7, layer: 'bass', inst: def.bassInst });
        ev.push({ bar, beat: 2, dur: 2, midi: root + 7, vel: 0.55, layer: 'bass', inst: def.bassInst });
        break;
      case 'pulse':
        for (let b = 0; b < bpb; b++) {
          ev.push({ bar, beat: b, dur: 0.45, midi: b % 2 ? root + 7 : root, vel: b % 2 ? 0.55 : 0.8, layer: 'bass', inst: def.bassInst });
        }
        break;
      case 'waltz':
        ev.push({ bar, beat: 0, dur: 1.5, midi: root - 12, vel: 0.62, layer: 'bass', inst: def.bassInst });
        ev.push({ bar, beat: 2, dur: 0.9, midi: root, vel: 0.42, layer: 'bass', inst: def.bassInst });
        break;
      default: break;
    }

    /* --- harmony ---------------------------------------------------- */
    if (def.harmony === 'offbeat') {
      const tones = [ch[2], ch[3], ch[4]];
      for (let b = 0; b < bpb; b++) {
        ev.push({
          bar, beat: b + 0.5, dur: 0.4, midi: tones[(b + bar) % tones.length] + 12,
          vel: 0.32 + (b % 2 ? 0 : 0.08), layer: 'harmony', inst: def.harm
        });
      }
    } else if (def.harmony === 'arpeggio') {
      const tones = [ch[1], ch[2], ch[3], ch[4], ch[3], ch[2]];
      for (let i = 0; i < tones.length; i++) {
        ev.push({
          bar, beat: i * (bpb / tones.length), dur: 0.5, midi: tones[i] + 12,
          vel: 0.26, layer: 'harmony', inst: def.harm
        });
      }
    }

    /* --- percussion -------------------------------------------------- */
    switch (def.perc) {
      case 'shaker8':
        for (let i = 0; i < bpb * 2; i++) {
          ev.push({ bar, beat: i * 0.5, perc: 'shaker', vel: i % 2 ? 0.3 : 0.55, layer: 'perc' });
        }
        ev.push({ bar, beat: 0, perc: 'tom', vel: 0.5, layer: 'perc' });
        if (bar % 2 === 1) ev.push({ bar, beat: 2, perc: 'tom', vel: 0.36, layer: 'perc' });
        break;
      case 'woodblock':
        ev.push({ bar, beat: 0, perc: 'tom', vel: 0.5, layer: 'perc' });
        ev.push({ bar, beat: 1.5, perc: 'block', vel: 0.4, layer: 'perc' });
        ev.push({ bar, beat: 2.5, perc: 'block', vel: 0.3, layer: 'perc' });
        for (let i = 0; i < bpb * 2; i++) {
          if (i % 2) ev.push({ bar, beat: i * 0.5, perc: 'shaker', vel: 0.22, layer: 'perc' });
        }
        break;
      case 'drops':
        ev.push({ bar, beat: 0, perc: 'drop', vel: 0.35, layer: 'perc' });
        ev.push({ bar, beat: 2.5, perc: 'drop', vel: 0.26, layer: 'perc' });
        break;
      case 'heartbeat':
        ev.push({ bar, beat: 0, perc: 'heart', vel: 0.4, layer: 'perc' });
        ev.push({ bar, beat: 0.42, perc: 'heart', vel: 0.26, layer: 'perc' });
        break;
      default: break;
    }
  }

  ev.sort((a, b) => (a.bar - b.bar) || (a.beat - b.beat));
  return {
    def, events: ev, bars: def.bars, bpb: def.beatsPerBar, bpm: def.bpm,
    layers: Object.keys(def.layers)
  };
}

/* -------------------------------------------------------------- Music ---- */

const LOOKAHEAD = 0.20;   // seconds of music queued ahead of the clock
const TICK_MS = 25;       // how often we top the queue up

export class Music {
  /**
   * @param {BaseAudioContext} ctx
   * @param {Synth} synth
   * @param {AudioNode} destination
   */
  constructor(ctx, synth, destination) {
    this.ctx = ctx;
    this.S = synth;
    this.compiled = new Map();

    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.duckGain);
    this.duckGain.connect(destination);

    // A little air on the ensemble. Music sits in the nursery, not the tiles.
    this.verb = synth.reverb('nursery', { wet: 0.5 });
    this.verb.output.connect(this.duckGain);
    this.dreamVerb = null;

    this.instances = [];       // active track instances (2 during a crossfade)
    this.current = null;       // name of the track we are heading toward
    this.mood = { energy: 0.6, sleepy: 0, intensity: 1 };
    this.tempoScale = 1;
    this._tempoTarget = 1;
    this._timer = null;
    this._duckUntil = 0;
    this._tick = this._tick.bind(this);
  }

  /* ------------------------------------------------------------ score -- */

  _score(name) {
    if (!this.compiled.has(name)) this.compiled.set(name, compileTrack(TRACKS[name]));
    return this.compiled.get(name);
  }

  static resolve(name) {
    if (!name) return null;
    return TRACKS[name] ? name : (TRACK_ALIAS[name] || null);
  }

  /* ----------------------------------------------------------- play ---- */

  /**
   * Crossfade to a track. `null` (or 'none') stops the music.
   * @returns {object|null} the new instance
   */
  play(name, { fade = 1.5, restart = false } = {}) {
    const key = Music.resolve(name);
    if (!key) { this.stop(fade); return null; }
    if (this.current === key && !restart) return this.instances[this.instances.length - 1] || null;

    const now = this.ctx.currentTime;
    for (const inst of this.instances) this._fadeOut(inst, fade);

    const score = this._score(key);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(this.instances.length ? 0.0001 : 0.35, now);
    g.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fade));
    g.connect(this.master);

    const layers = {};
    for (const L of score.layers) {
      const lg = this.ctx.createGain();
      lg.gain.value = this._layerTarget(score, L);
      lg.connect(g);
      layers[L] = lg;
    }

    const inst = {
      name: key, score, gain: g, layers,
      beat: 0,                              // absolute beat counter
      nextBeatTime: now + 0.08,
      dying: false
    };
    this.instances.push(inst);
    this.current = key;
    this._start();
    return inst;
  }

  stop(fade = 1.2) {
    for (const inst of this.instances) this._fadeOut(inst, fade);
    this.current = null;
    return this;
  }

  _fadeOut(inst, fade) {
    if (inst.dying) return;
    inst.dying = true;
    const now = this.ctx.currentTime;
    const f = Math.max(0.05, fade);
    inst.gain.gain.cancelScheduledValues(now);
    inst.gain.gain.setValueAtTime(Math.max(0.0002, inst.gain.gain.value), now);
    inst.gain.gain.linearRampToValueAtTime(0.0001, now + f);
    inst.deadAt = now + f;
  }

  _dispose(inst) {
    try { inst.gain.disconnect(); } catch (e) { /* gone */ }
    for (const k in inst.layers) { try { inst.layers[k].disconnect(); } catch (e) { /* gone */ } }
    const i = this.instances.indexOf(inst);
    if (i >= 0) this.instances.splice(i, 1);
    if (!this.instances.length) this._stopTimer();
  }

  /* ------------------------------------------------------ adaptivity --- */

  /**
   * @param {object} m  { energy 0..1, sleepy 0..1, intensity 0..1 }
   * Sleepy pulls the melody and the shaker out and swells the pad; energy
   * brings percussion and counter-melody in.
   */
  setMood(m = {}) {
    Object.assign(this.mood, m);
    this.mood.energy = clamp(this.mood.energy, 0, 1);
    this.mood.sleepy = clamp(this.mood.sleepy, 0, 1);
    this.mood.intensity = clamp(this.mood.intensity == null ? 1 : this.mood.intensity, 0, 1);
    this._tempoTarget = lerp(1, 0.86, this.mood.sleepy);
    for (const inst of this.instances) {
      if (inst.dying) continue;
      for (const L in inst.layers) this.setLayer(L, this._layerTarget(inst.score, L), 1.6, inst);
    }
    return this;
  }

  _layerTarget(score, L) {
    const base = score.def.layers[L] != null ? score.def.layers[L] : 0.6;
    const { energy: e, sleepy: s, intensity: i } = this.mood;
    let k = 1;
    switch (L) {
      case 'melody':  k = (1 - s * 0.92) * (0.62 + 0.38 * e); break;
      case 'perc':    k = Math.pow(1 - s, 1.6) * (0.35 + 0.65 * e); break;
      case 'harmony': k = (1 - s * 0.75) * (0.5 + 0.5 * e); break;
      case 'bass':    k = 1 - s * 0.35; break;
      case 'pad':     k = 0.7 + 0.55 * s; break;
      case 'sparkle': k = 0.4 + 0.6 * (1 - Math.abs(e - 0.5) * 2) + 0.35 * s; break;
      default: k = 1;
    }
    return clamp(base * k * (0.55 + 0.45 * i), 0, 1.4);
  }

  /** Manually ride one layer. */
  setLayer(name, value, fade = 1.0, only = null) {
    const now = this.ctx.currentTime;
    for (const inst of this.instances) {
      if (only && inst !== only) continue;
      const g = inst.layers[name];
      if (!g) continue;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.linearRampToValueAtTime(clamp(value, 0, 1.5), now + Math.max(0.02, fade));
    }
    return this;
  }

  /**
   * Duck the music out of the way of a speech-like cue.
   * @param {number} amount 0..1 (how far down)
   * @param {number} seconds how long to stay there before recovering
   */
  duck(amount = 0.5, seconds = 0.6) {
    const now = this.ctx.currentTime;
    const until = now + seconds;
    if (until < this._duckUntil) return this;      // a deeper duck is running
    this._duckUntil = until;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0002, g.value), now);
    g.linearRampToValueAtTime(clamp(1 - amount, 0.05, 1), now + 0.08);
    g.setValueAtTime(clamp(1 - amount, 0.05, 1), until);
    g.linearRampToValueAtTime(1, until + 0.45);
    return this;
  }

  setVolume(v, fade = 0.3) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0002, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(clamp(v, 0, 1.5), now + fade);
    return this;
  }

  /* ------------------------------------------------------- scheduler --- */

  _start() {
    // Offline rendering has no wall clock: queue one long pass and return.
    if (this.S.offline) { this._renderOffline(); return; }
    if (this._timer != null) return;
    this._timer = setInterval(this._tick, TICK_MS);
    this._tick();
  }

  /** Schedule `seconds` of music in one go (offline render / tests). */
  _renderOffline(seconds = 12) {
    const stop = this.ctx.currentTime + seconds;
    let guard = 0;
    while (guard++ < 4000) {
      const before = this.instances.reduce((m, i) => Math.min(m, i.nextBeatTime), Infinity);
      if (!isFinite(before) || before > stop) break;
      this._tickTo(before + LOOKAHEAD);
    }
  }

  _stopTimer() {
    if (this._timer != null) { clearInterval(this._timer); this._timer = null; }
  }

  /**
   * Lookahead scheduler. Everything inside the next LOOKAHEAD seconds is
   * queued with an exact AudioContext timestamp, so wall-clock jitter in the
   * timer can never move a note.
   */
  _tick() { this._tickTo(this.ctx.currentTime + LOOKAHEAD); }

  _tickTo(horizon) {
    const now = this.ctx.currentTime;

    for (const inst of this.instances.slice()) {
      if (inst.deadAt != null && now > inst.deadAt + 0.2) { this._dispose(inst); continue; }

      const sc = inst.score;
      let guard = 0;
      while (inst.nextBeatTime < horizon && guard++ < 256) {
        // ease the tempo toward its target once per beat — no seams
        this.tempoScale += (this._tempoTarget - this.tempoScale) * 0.06;
        const beatDur = (60 / sc.bpm) / this.tempoScale;

        const idx = inst.beat;
        const bar = Math.floor(idx / sc.bpb) % sc.bars;
        const beatInBar = idx % sc.bpb;

        if (!inst.dying) this._scheduleBeat(inst, bar, beatInBar, inst.nextBeatTime, beatDur);

        inst.beat = idx + 1;
        inst.nextBeatTime += beatDur;
      }
    }
    if (!this.instances.length) this._stopTimer();
  }

  /** Queue every event that starts inside [beat, beat+1). */
  _scheduleBeat(inst, bar, beatInBar, when, beatDur) {
    const sc = inst.score;
    const swing = sc.def.swing || 0;
    for (const e of sc.events) {
      if (e.bar !== bar) continue;
      const off = e.beat - beatInBar;
      if (off < 0 || off >= 1) continue;
      // swing the second eighth of each beat
      const sw = (off > 0.4 && off < 0.6) ? swing * beatDur : 0;
      const t = when + off * beatDur + sw;
      const g = inst.layers[e.layer];
      if (!g) continue;
      if (e.perc) this._perc(e.perc, t, e.vel, g);
      else if (Array.isArray(e.midi)) {
        for (let i = 0; i < e.midi.length; i++) {
          this._voice(e.inst, e.midi[i], t + i * 0.012, e.dur * beatDur, e.vel * (1 - i * 0.1), g);
        }
      } else {
        this._voice(e.inst, e.midi, t, e.dur * beatDur, e.vel, g);
      }
    }
  }

  /* ----------------------------------------------------- instruments --- */

  _send(node, amount) {
    if (amount <= 0) return null;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(this.verb.input);
    return g;
  }

  _voice(inst, midi, t, dur, vel, dest) {
    const f = midiToFreq(midi);
    switch (inst) {
      case 'musicbox': return this._musicBox(f, t, dur, vel, dest);
      case 'celesta':  return this._celesta(f, t, dur, vel, dest);
      case 'marimba':  return this._marimba(f, t, dur, vel, dest);
      case 'bell':     return this._bell(f, t, dur, vel, dest);
      case 'pad':      return this._pad(f, t, dur, vel, dest);
      case 'pizz':     return this._pizz(f, t, dur, vel, dest);
      case 'bass':
      default:         return this._bass(f, t, dur, vel, dest);
    }
  }

  /** Music box: a plucked steel comb tooth. Inharmonic, bright, long tail. */
  _musicBox(f, t, dur, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    const len = clamp(dur * 1.6, 0.6, 2.6);
    const parts = [[1, 1, len], [2.01, 0.32, len * 0.5], [3.86, 0.14, len * 0.28], [5.4, 0.06, len * 0.16]];
    const bus = this.ctx.createGain();
    bus.gain.value = 0.34 * vel;
    for (const [ratio, amp, d] of parts) {
      const o = S.osc({ type: 'sine', freq: f * ratio, when: t, dur: d });
      const e = S.hit({ when: t, dur: d, peak: amp });
      o.connect(e); e.connect(bus);
      nodes.push(o, e); srcs.push(o);
    }
    // the comb's mechanical tick
    const n = S.noiseSource({ kind: 'white', when: t, dur: 0.012 });
    const nf = S.filter({ type: 'bandpass', freq: clamp(f * 6, 200, 12000), q: 2 });
    const ne = S.hit({ when: t, dur: 0.012, peak: 0.1 });
    n.connect(nf); nf.connect(ne); ne.connect(bus);
    nodes.push(n, nf, ne); srcs.push(n);

    bus.connect(dest);
    const send = this._send(bus, 0.3);
    nodes.push(bus); if (send) nodes.push(send);
    S.autoClean(nodes, srcs, t + len + 0.1);
    return bus;
  }

  /** Celesta: softer, rounder, a hint of tremolo shimmer. */
  _celesta(f, t, dur, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    const len = clamp(dur * 1.3, 0.45, 1.8);
    const bus = this.ctx.createGain();
    bus.gain.value = 0.3 * vel;
    const parts = [[1, 1, len], [2, 0.28, len * 0.6], [4.02, 0.1, len * 0.3]];
    for (const [ratio, amp, d] of parts) {
      const o = S.osc({ type: 'sine', freq: f * ratio, when: t, dur: d, detune: (ratio - 1) * 3 });
      const e = S.env({ when: t, dur: d * 0.8, a: 0.006, d: d * 0.7, s: 0.05, r: d * 0.3, peak: amp });
      o.connect(e); e.connect(bus);
      nodes.push(o, e); srcs.push(o);
    }
    const lp = S.filter({ type: 'lowpass', freq: clamp(f * 8, 900, 9000), q: 0.6 });
    bus.connect(lp); lp.connect(dest);
    const send = this._send(lp, 0.26);
    nodes.push(bus, lp); if (send) nodes.push(send);
    S.autoClean(nodes, srcs, t + len + 0.1);
    return bus;
  }

  /** Marimba: rosewood bar, 1:4:10 partials, wooden mallet thud. */
  _marimba(f, t, dur, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    const len = clamp(dur * 1.1, 0.25, 1.1);
    const bus = this.ctx.createGain();
    bus.gain.value = 0.34 * vel;
    const parts = [[1, 1, len], [3.99, 0.22, len * 0.35], [9.6, 0.06, len * 0.14]];
    for (const [ratio, amp, d] of parts) {
      const o = S.osc({ type: 'sine', freq: f * ratio, when: t, dur: d });
      const e = S.hit({ when: t, dur: d, peak: amp });
      o.connect(e); e.connect(bus);
      nodes.push(o, e); srcs.push(o);
    }
    const n = S.noiseSource({ kind: 'pink', when: t, dur: 0.03 });
    const nf = S.filter({ type: 'bandpass', freq: clamp(f * 2.5, 200, 6000), q: 1.2 });
    const ne = S.hit({ when: t, dur: 0.03, peak: 0.18 });
    n.connect(nf); nf.connect(ne); ne.connect(bus);
    nodes.push(n, nf, ne); srcs.push(n);
    // resonator tube under the bar
    const r = S.osc({ type: 'sine', freq: f * 0.5, when: t, dur: len * 0.6 });
    const re = S.env({ when: t, dur: len * 0.5, a: 0.02, d: len * 0.4, s: 0, r: 0.05, peak: 0.16 });
    r.connect(re); re.connect(bus);
    nodes.push(r, re); srcs.push(r);

    bus.connect(dest);
    const send = this._send(bus, 0.22);
    nodes.push(bus); if (send) nodes.push(send);
    S.autoClean(nodes, srcs, t + len + 0.1);
    return bus;
  }

  /** Distant bell for the sparkle layer. */
  _bell(f, t, dur, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    const len = clamp(dur * 2.2, 0.8, 3.0);
    const bus = this.ctx.createGain();
    bus.gain.value = 0.24 * vel;
    const parts = [[1, 1, len], [2.76, 0.3, len * 0.55], [5.4, 0.12, len * 0.28], [8.9, 0.05, len * 0.15]];
    for (const [ratio, amp, d] of parts) {
      const o = S.osc({ type: 'sine', freq: f * ratio, when: t, dur: d });
      const e = S.hit({ when: t, dur: d, peak: amp, a: 0.004 });
      o.connect(e); e.connect(bus);
      nodes.push(o, e); srcs.push(o);
    }
    bus.connect(dest);
    const send = this._send(bus, 0.45);
    nodes.push(bus); if (send) nodes.push(send);
    S.autoClean(nodes, srcs, t + len + 0.1);
    return bus;
  }

  /** Soft pad: detuned saws through a slow filter swell. */
  _pad(f, t, dur, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    const len = dur + 0.5;
    const u = S.unison({ type: 'sawtooth', freq: f, voices: 3, spread: 9, when: t, dur: len });
    const lp = S.filter({
      type: 'lowpass', freq: clamp(f * 2.2, 260, 1800), q: 0.8,
      when: t, to: clamp(f * 3.6, 300, 2600), sweep: dur * 0.6, dur: len
    });
    const e = S.env({ when: t, dur, a: Math.min(0.5, dur * 0.4), d: dur * 0.3, s: 0.75, r: 0.6, peak: 0.075 * vel });
    u.out.connect(lp); lp.connect(e); e.connect(dest);
    const send = this._send(e, 0.4);
    for (const o of u.oscs) srcs.push(o);
    nodes.push(u.out, lp, e); if (send) nodes.push(send);
    S.autoClean(nodes, srcs, t + len + 0.8);
    return e;
  }

  /** Round soft bass, sub-heavy but filtered so tablets don't flap. */
  _bass(f, t, dur, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    const len = clamp(dur * 1.1, 0.2, 2.0);
    const o = S.osc({ type: 'triangle', freq: f, when: t, dur: len });
    const o2 = S.osc({ type: 'sine', freq: f * 0.5, when: t, dur: len });
    const lp = S.filter({ type: 'lowpass', freq: clamp(f * 5, 240, 1400), q: 0.7, when: t, to: clamp(f * 2.4, 180, 900), sweep: len * 0.7, dur: len });
    const e = S.env({ when: t, dur: len * 0.85, a: 0.018, d: len * 0.5, s: 0.45, r: 0.12, peak: 0.2 * vel });
    const sub = this.ctx.createGain(); sub.gain.value = 0.5;
    o.connect(lp); o2.connect(sub); sub.connect(lp); lp.connect(e); e.connect(dest);
    nodes.push(o, o2, sub, lp, e); srcs.push(o, o2);
    S.autoClean(nodes, srcs, t + len + 0.2);
    return e;
  }

  /** Plucked bass for the curious track. */
  _pizz(f, t, dur, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    const len = clamp(dur * 1.2, 0.16, 0.7);
    const o = S.osc({ type: 'triangle', freq: f, when: t, dur: len });
    const lp = S.filter({ type: 'lowpass', freq: clamp(f * 9, 300, 2600), q: 1.1, when: t, to: clamp(f * 2.5, 200, 900), sweep: len * 0.5, dur: len });
    const e = S.hit({ when: t, dur: len, peak: 0.22 * vel, a: 0.004 });
    const n = S.noiseSource({ kind: 'pink', when: t, dur: 0.02 });
    const ne = S.hit({ when: t, dur: 0.02, peak: 0.06 });
    o.connect(lp); n.connect(ne); ne.connect(lp); lp.connect(e); e.connect(dest);
    nodes.push(o, n, ne, lp, e); srcs.push(o, n);
    S.autoClean(nodes, srcs, t + len + 0.2);
    return e;
  }

  /* ---------------------------------------------------------- percussion */

  _perc(kind, t, vel, dest) {
    const S = this.S, nodes = [], srcs = [];
    let end = t + 0.4;

    if (kind === 'shaker') {
      const n = S.noiseSource({ kind: 'white', when: t, dur: 0.06 });
      const f = S.filter({ type: 'highpass', freq: 5200, q: 0.8 });
      const f2 = S.filter({ type: 'bandpass', freq: 7200, q: 1.1 });
      const e = S.env({ when: t, dur: 0.035, a: 0.002, d: 0.03, s: 0, r: 0.02, peak: 0.09 * vel });
      n.connect(f); f.connect(f2); f2.connect(e); e.connect(dest);
      nodes.push(n, f, f2, e); srcs.push(n); end = t + 0.1;

    } else if (kind === 'tom') {
      const o = S.osc({ type: 'sine', freq: 132, when: t, dur: 0.22, glideTo: 74, glide: 0.16 });
      const e = S.hit({ when: t, dur: 0.22, peak: 0.22 * vel });
      const n = S.noiseSource({ kind: 'brown', when: t, dur: 0.05 });
      const nf = S.filter({ type: 'lowpass', freq: 700, q: 0.9 });
      const ne = S.hit({ when: t, dur: 0.05, peak: 0.06 * vel });
      o.connect(e); e.connect(dest);
      n.connect(nf); nf.connect(ne); ne.connect(dest);
      nodes.push(o, e, n, nf, ne); srcs.push(o, n); end = t + 0.35;

    } else if (kind === 'block') {
      const o = S.osc({ type: 'sine', freq: 980, when: t, dur: 0.08 });
      const o2 = S.osc({ type: 'sine', freq: 1710, when: t, dur: 0.04 });
      const e = S.hit({ when: t, dur: 0.08, peak: 0.13 * vel });
      const e2 = S.hit({ when: t, dur: 0.04, peak: 0.05 * vel });
      o.connect(e); e.connect(dest); o2.connect(e2); e2.connect(dest);
      nodes.push(o, o2, e, e2); srcs.push(o, o2); end = t + 0.2;

    } else if (kind === 'drop') {
      const f0 = 620 + (this.S.rng() * 380);
      const o = S.osc({ type: 'sine', freq: f0, when: t, dur: 0.09, glideTo: f0 * 2.6, glide: 0.05 });
      const e = S.env({ when: t, dur: 0.06, a: 0.002, d: 0.05, s: 0, r: 0.03, peak: 0.1 * vel });
      o.connect(e); e.connect(dest);
      const send = this._send(e, 0.5);
      nodes.push(o, e); if (send) nodes.push(send);
      srcs.push(o); end = t + 0.3;

    } else if (kind === 'heart') {
      const o = S.osc({ type: 'sine', freq: 74, when: t, dur: 0.22, glideTo: 52, glide: 0.16 });
      const e = S.env({ when: t, dur: 0.16, a: 0.012, d: 0.14, s: 0, r: 0.05, peak: 0.16 * vel });
      o.connect(e); e.connect(dest);
      nodes.push(o, e); srcs.push(o); end = t + 0.35;
    }

    S.autoClean(nodes, srcs, end);
  }

  /* --------------------------------------------------------- teardown --- */

  dispose() {
    this._stopTimer();
    for (const inst of this.instances.slice()) this._dispose(inst);
    try { this.master.disconnect(); this.duckGain.disconnect(); } catch (e) { /* gone */ }
  }
}

export { TRACKS, TRACK_ALIAS };
export default Music;
