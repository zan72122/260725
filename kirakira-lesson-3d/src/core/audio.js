/* ============================================================
 * audio.js — おと エンジン（おんせいファイル ゼロ / ぜんぶ WebAudio でつくる）
 *   - こうかおん 50しゅるい いじょう
 *   - BGM 5きょく（ハブ / おしゃれ / おしごと / ランウェイ / ゆったり）
 *   - おはなし（SpeechSynthesis の にほんごボイス）
 * ============================================================ */
var SND = (function () {
  'use strict';

  var ctx = null, master = null, musicBus = null, sfxBus = null, reverb = null;
  var muted = false, voiceOn = true;
  var song = null, schedTimer = null, nextTime = 0, step = 0;
  var lastSpoken = '', lastSpokenAt = 0;

  /* ================= きほん ================= */

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.26; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);

    // かんたんリバーブ（ノイズのインパルスレスポンス）
    try {
      var len = Math.floor(ctx.sampleRate * 1.1);
      var buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      reverb = ctx.createConvolver(); reverb.buffer = buf;
      var rg = ctx.createGain(); rg.gain.value = 0.16;
      reverb.connect(rg); rg.connect(master);
    } catch (e) { reverb = null; }

    if (ctx.state === 'suspended') ctx.resume();

    // iOS は「ユーザー そうさ の なか」でないと しゃべれないので、
    // ここ（タップ の ハンドラ の なか）で から の はつわ を して かいきん する。
    if ('speechSynthesis' in window) {
      try {
        var warm = new SpeechSynthesisUtterance(' ');
        warm.volume = 0; warm.lang = 'ja-JP';
        window.speechSynthesis.speak(warm);
      } catch (e) { }
    }
    return true;
  }

  function tone(o) {
    if (!ctx || muted) return;
    var when = ctx.currentTime + (o.when || 0);
    var dur = o.dur || 0.2;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.freq), when);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), when + dur);
    if (o.vibrato) {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vibrato; lg.gain.value = o.vibDepth || 6;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(when); lfo.stop(when + dur + 0.05);
    }
    var g = ctx.createGain();
    var vol = o.vol != null ? o.vol : 0.3;
    var atk = o.attack != null ? o.attack : 0.008;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(o.dest || sfxBus);
    if (o.wet && reverb) { var w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(reverb); }
    osc.start(when);
    osc.stop(when + dur + 0.06);
  }

  function noise(o) {
    if (!ctx || muted) return;
    var when = ctx.currentTime + (o.when || 0);
    var dur = o.dur || 0.2;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1000, when);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), when + dur);
    f.Q.value = o.q || 1;
    var g = ctx.createGain();
    var vol = o.vol != null ? o.vol : 0.25;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(when); src.stop(when + dur + 0.05);
  }

  function arp(freqs, o) {
    o = o || {};
    for (var i = 0; i < freqs.length; i++) {
      tone({
        freq: freqs[i], type: o.type || 'triangle', dur: o.dur || 0.28,
        vol: o.vol != null ? o.vol : 0.2, when: (o.when || 0) + i * (o.gap || 0.07), wet: o.wet || 0.3
      });
    }
  }

  /* ================= おんかい ================= */

  var N = {};
  (function () {
    var names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
    for (var oct = 1; oct <= 7; oct++) {
      for (var i = 0; i < 12; i++) {
        N[names[i] + oct] = 440 * Math.pow(2, (i - 9 + (oct - 4) * 12) / 12);
      }
    }
  })();

  /* ================= こうかおん ================= */

  var SFX = {
    tap: function () { tone({ freq: 760, freqEnd: 1080, type: 'triangle', dur: 0.07, vol: 0.28 }); },
    pop: function () { tone({ freq: 480, freqEnd: 980, type: 'sine', dur: 0.09, vol: 0.36 }); noise({ dur: 0.04, vol: 0.1, freq: 3400, type: 'highpass' }); },
    bloop: function () { tone({ freq: 300, freqEnd: 620, type: 'sine', dur: 0.14, vol: 0.32 }); },
    click: function () { noise({ dur: 0.03, vol: 0.14, freq: 2600, type: 'highpass' }); },
    swish: function () { noise({ dur: 0.22, vol: 0.16, freq: 500, freqEnd: 3600, type: 'bandpass', q: 1.4 }); },
    whoosh: function () { noise({ dur: 0.42, vol: 0.2, freq: 2400, freqEnd: 260, type: 'bandpass', q: 1.1 }); },

    chime: function () { arp([N.A5, N.Cs6, N.E6], { dur: 0.4, vol: 0.2, wet: 0.4 }); },
    star: function () { arp([N.C6, N.E6, N.G6, N.C7], { dur: 0.32, vol: 0.19, gap: 0.06, wet: 0.4 }); },
    sparkle: function () { arp([N.E6, N.G6, N.B6, N.E7, N.G7], { dur: 0.24, vol: 0.13, gap: 0.045, wet: 0.5 }); },
    magic: function () {
      tone({ freq: 400, freqEnd: 2400, type: 'sine', dur: 0.5, vol: 0.16, wet: 0.5 });
      arp([N.C6, N.D6, N.E6, N.G6, N.A6, N.C7], { dur: 0.3, vol: 0.13, gap: 0.05, wet: 0.5 });
    },
    coin: function () { tone({ freq: N.B5, type: 'square', dur: 0.07, vol: 0.15 }); tone({ freq: N.E6, type: 'square', dur: 0.3, vol: 0.15, when: 0.07 }); },
    heart: function () { tone({ freq: N.G5, freqEnd: N.C6, type: 'sine', dur: 0.24, vol: 0.24, wet: 0.4 }); tone({ freq: N.E6, type: 'sine', dur: 0.3, vol: 0.16, when: 0.1, wet: 0.4 }); },

    correct: function () { arp([N.C6, N.E6, N.G6], { dur: 0.3, vol: 0.22, gap: 0.055, wet: 0.35 }); },
    wrong: function () { tone({ freq: 320, freqEnd: 250, type: 'sine', dur: 0.2, vol: 0.2 }); tone({ freq: 260, freqEnd: 200, type: 'sine', dur: 0.24, vol: 0.16, when: 0.11 }); },
    levelup: function () { arp([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7], { dur: 0.36, vol: 0.16, gap: 0.06, wet: 0.5 }); },
    tada: function () {
      var seq = [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, N.E6];
      var w = [0, 0.1, 0.2, 0.32, 0.46, 0.56, 0.68];
      for (var i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], type: 'square', dur: 0.24, vol: 0.1, when: w[i] });
        tone({ freq: seq[i], type: 'triangle', dur: 0.3, vol: 0.16, when: w[i], wet: 0.4 });
      }
    },
    fanfare: function () {
      var seq = [N.G4, N.C5, N.E5, N.G5, N.E5, N.G5, N.C6];
      var w = [0, 0.13, 0.26, 0.4, 0.56, 0.66, 0.8];
      for (var i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], type: 'sawtooth', dur: 0.3, vol: 0.07, when: w[i] });
        tone({ freq: seq[i] * 2, type: 'triangle', dur: 0.34, vol: 0.12, when: w[i], wet: 0.5 });
      }
      noise({ dur: 1.2, vol: 0.05, freq: 6000, type: 'highpass', when: 0.8 });
    },
    applause: function () {
      for (var i = 0; i < 26; i++) {
        noise({ dur: 0.06, vol: 0.05 + Math.random() * 0.05, freq: 1600 + Math.random() * 2600, type: 'bandpass', q: 0.9, when: Math.random() * 1.5 });
      }
      noise({ dur: 1.8, vol: 0.05, freq: 2200, type: 'bandpass', q: 0.5 });
    },
    camera: function () { noise({ dur: 0.05, vol: 0.3, freq: 3200, type: 'highpass' }); noise({ dur: 0.09, vol: 0.2, freq: 1400, type: 'bandpass', when: 0.07 }); tone({ freq: 1800, type: 'sine', dur: 0.05, vol: 0.1, when: 0.02 }); },

    water: function () { noise({ dur: 0.7, vol: 0.14, freq: 700, freqEnd: 1800, type: 'bandpass', q: 0.8 }); },
    bubble: function () { for (var i = 0; i < 4; i++) tone({ freq: 380 + Math.random() * 500, freqEnd: 900 + Math.random() * 700, type: 'sine', dur: 0.1, vol: 0.14, when: i * 0.08 }); },
    splash: function () { noise({ dur: 0.35, vol: 0.24, freq: 2600, freqEnd: 500, type: 'lowpass' }); tone({ freq: 700, freqEnd: 200, type: 'sine', dur: 0.2, vol: 0.14 }); },
    scrub: function () { noise({ dur: 0.16, vol: 0.16, freq: 1300, freqEnd: 2600, type: 'bandpass', q: 2.2 }); },
    vacuum: function () { noise({ dur: 0.5, vol: 0.12, freq: 380, type: 'lowpass', q: 3 }); tone({ freq: 110, type: 'sawtooth', dur: 0.5, vol: 0.05 }); },
    spray: function () { noise({ dur: 0.3, vol: 0.16, freq: 4200, type: 'highpass' }); },
    dryer: function () { noise({ dur: 0.9, vol: 0.11, freq: 900, freqEnd: 1500, type: 'bandpass', q: 1.2 }); tone({ freq: 220, freqEnd: 260, type: 'sawtooth', dur: 0.9, vol: 0.04 }); },
    snip: function () { noise({ dur: 0.05, vol: 0.2, freq: 4600, type: 'highpass' }); tone({ freq: 2400, freqEnd: 1500, type: 'triangle', dur: 0.06, vol: 0.14 }); },
    brush: function () { noise({ dur: 0.26, vol: 0.12, freq: 1800, freqEnd: 900, type: 'bandpass', q: 1.6 }); },
    washer: function () { noise({ dur: 1.0, vol: 0.1, freq: 500, type: 'lowpass', q: 2 }); tone({ freq: 90, type: 'sine', dur: 1.0, vol: 0.08, vibrato: 5, vibDepth: 10 }); },

    chop: function () { noise({ dur: 0.06, vol: 0.25, freq: 1800, freqEnd: 500, type: 'bandpass', q: 1.4 }); tone({ freq: 220, freqEnd: 90, type: 'sine', dur: 0.08, vol: 0.16 }); },
    sizzle: function () { noise({ dur: 0.8, vol: 0.1, freq: 4800, type: 'highpass' }); },
    stir: function () { noise({ dur: 0.3, vol: 0.1, freq: 800, freqEnd: 400, type: 'bandpass', q: 1.2 }); },
    ding: function () { tone({ freq: N.C7, type: 'sine', dur: 0.7, vol: 0.2, wet: 0.6 }); tone({ freq: N.G6, type: 'sine', dur: 0.7, vol: 0.1, wet: 0.6 }); },
    squirt: function () { tone({ freq: 900, freqEnd: 1800, type: 'sine', dur: 0.16, vol: 0.2 }); noise({ dur: 0.14, vol: 0.08, freq: 3000, type: 'highpass' }); },
    munch: function () { noise({ dur: 0.1, vol: 0.24, freq: 900, freqEnd: 300, type: 'lowpass', q: 2 }); tone({ freq: 180, freqEnd: 95, type: 'sine', dur: 0.1, vol: 0.16 }); },
    register: function () { tone({ freq: N.E6, type: 'sine', dur: 0.14, vol: 0.2 }); tone({ freq: N.C6, type: 'sine', dur: 0.3, vol: 0.18, when: 0.1 }); noise({ dur: 0.1, vol: 0.1, freq: 2800, type: 'highpass', when: 0.24 }); },

    dog: function () { tone({ freq: 420, freqEnd: 300, type: 'sawtooth', dur: 0.12, vol: 0.16, vibrato: 30, vibDepth: 40 }); tone({ freq: 380, freqEnd: 260, type: 'sawtooth', dur: 0.14, vol: 0.14, when: 0.2, vibrato: 26, vibDepth: 30 }); },
    cat: function () { tone({ freq: 620, freqEnd: 900, type: 'sawtooth', dur: 0.32, vol: 0.12, vibrato: 12, vibDepth: 40 }); tone({ freq: 900, freqEnd: 520, type: 'sawtooth', dur: 0.3, vol: 0.1, when: 0.3, vibrato: 10, vibDepth: 30 }); },
    bird: function () { arp([N.E7, N.G7, N.E7, N.B6], { dur: 0.1, vol: 0.1, gap: 0.08, type: 'sine' }); },
    rabbit: function () { tone({ freq: 1400, freqEnd: 2000, type: 'sine', dur: 0.08, vol: 0.12 }); tone({ freq: 1600, freqEnd: 2200, type: 'sine', dur: 0.08, vol: 0.1, when: 0.12 }); },
    purr: function () { tone({ freq: 70, type: 'sawtooth', dur: 1.0, vol: 0.1, vibrato: 22, vibDepth: 16 }); },

    jump: function () { tone({ freq: 320, freqEnd: 760, type: 'triangle', dur: 0.16, vol: 0.22 }); },
    land: function () { tone({ freq: 200, freqEnd: 90, type: 'sine', dur: 0.14, vol: 0.2 }); },
    step: function () { noise({ dur: 0.05, vol: 0.09, freq: 700, type: 'lowpass' }); },
    door: function () { tone({ freq: 500, freqEnd: 800, type: 'triangle', dur: 0.16, vol: 0.18 }); tone({ freq: 800, freqEnd: 1200, type: 'triangle', dur: 0.2, vol: 0.14, when: 0.12 }); },
    ribbon: function () { noise({ dur: 0.18, vol: 0.13, freq: 2200, freqEnd: 4200, type: 'bandpass', q: 1.6 }); tone({ freq: N.E6, type: 'sine', dur: 0.24, vol: 0.14, when: 0.14, wet: 0.4 }); },
    place: function () { tone({ freq: 420, freqEnd: 300, type: 'sine', dur: 0.1, vol: 0.24 }); noise({ dur: 0.05, vol: 0.07, freq: 1200, type: 'lowpass' }); },
    grab: function () { tone({ freq: 300, freqEnd: 500, type: 'sine', dur: 0.07, vol: 0.2 }); },
    unlock: function () { arp([N.G5, N.B5, N.D6, N.G6], { dur: 0.4, vol: 0.18, gap: 0.07, wet: 0.5 }); },
    beat: function () { tone({ freq: 160, freqEnd: 60, type: 'sine', dur: 0.12, vol: 0.28 }); },
    pose: function () { tone({ freq: N.A5, type: 'triangle', dur: 0.2, vol: 0.2, wet: 0.4 }); noise({ dur: 0.1, vol: 0.06, freq: 5200, type: 'highpass' }); }
  };

  function play(name, opt) {
    if (!ctx) return;
    var f = SFX[name];
    if (f) { try { f(opt); } catch (e) { } }
  }

  /* ================= BGM ================= */
  // 16ぶおんぷ ステップシーケンサ。1ステップ = 0.14〜0.16びょう

  function n(name) { return N[name]; }
  var _ = 0; // やすみ

  var SONGS = {
    // まちの テーマ：あかるい ポップ
    town: {
      bpm: 124,
      lead: ['C5', 'E5', 'G5', 'E5', 'F5', 'A5', 'G5', 'E5', 'D5', 'F5', 'A5', 'F5', 'G5', 'B4', 'D5', 'G5',
        'C5', 'E5', 'G5', 'C6', 'B5', 'G5', 'E5', 'G5', 'A5', 'F5', 'D5', 'F5', 'E5', 'C5', 'D5', 'E5'],
      bass: ['C3', _, 'C3', _, 'F3', _, 'F3', _, 'D3', _, 'D3', _, 'G3', _, 'G3', _,
        'C3', _, 'C3', _, 'E3', _, 'E3', _, 'F3', _, 'D3', _, 'G3', _, 'G2', _],
      hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1],
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1],
      leadType: 'triangle'
    },
    // おしゃれ：やわらかい ワルツふう
    fashion: {
      bpm: 108,
      lead: ['E5', 'G5', 'B5', 'A5', 'G5', 'E5', 'D5', 'E5', 'C5', 'E5', 'G5', 'B5', 'A5', 'G5', 'E5', 'D5',
        'F5', 'A5', 'C6', 'B5', 'A5', 'F5', 'E5', 'F5', 'G5', 'B5', 'D6', 'C6', 'B5', 'G5', 'E5', 'G5'],
      bass: ['C3', _, _, 'G3', _, _, 'A2', _, 'E3', _, _, 'B2', _, _, 'G2', _,
        'F3', _, _, 'C3', _, _, 'D3', _, 'G3', _, _, 'D3', _, _, 'G2', _],
      hat: [0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1],
      kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      leadType: 'sine'
    },
    // おしごと：はずむ マーチ
    work: {
      bpm: 132,
      lead: ['G5', 'G5', 'A5', 'B5', 'G5', _, 'E5', _, 'C6', 'B5', 'A5', 'G5', 'A5', _, 'B5', _,
        'C6', 'C6', 'B5', 'A5', 'G5', _, 'A5', _, 'B5', 'A5', 'G5', 'E5', 'D5', _, 'G5', _],
      bass: ['G2', _, 'D3', _, 'G2', _, 'B2', _, 'C3', _, 'G3', _, 'C3', _, 'E3', _,
        'D3', _, 'A3', _, 'D3', _, 'Fs3', _, 'G2', _, 'D3', _, 'G3', _, 'G2', _],
      hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1],
      leadType: 'square'
    },
    // ランウェイ：かっこいい ビート
    runway: {
      bpm: 116,
      lead: ['A5', _, 'E5', _, 'A5', 'B5', 'C6', _, 'B5', _, 'G5', _, 'E5', _, _, _,
        'C6', _, 'B5', _, 'A5', 'G5', 'A5', _, 'E5', _, 'A5', _, 'B5', _, 'C6', _],
      bass: ['A2', 'A2', _, 'A2', _, 'A2', 'E3', _, 'F3', 'F3', _, 'F3', _, 'C3', _, _,
        'G2', 'G2', _, 'G2', _, 'D3', _, _, 'A2', 'A2', _, 'E3', _, 'A2', _, _],
      hat: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
      kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1],
      leadType: 'sawtooth'
    },
    // ゆったり：おうち
    calm: {
      bpm: 84,
      lead: ['C5', _, 'E5', _, 'G5', _, 'E5', _, 'F5', _, 'A5', _, 'G5', _, _, _,
        'E5', _, 'G5', _, 'C6', _, 'B5', _, 'A5', _, 'G5', _, 'E5', _, _, _],
      bass: ['C3', _, _, _, 'F3', _, _, _, 'D3', _, _, _, 'G3', _, _, _,
        'C3', _, _, _, 'A2', _, _, _, 'F3', _, _, _, 'G3', _, _, _],
      hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      leadType: 'sine'
    }
  };

  var beatCallbacks = [];
  var lastBeatTime = 0;

  function scheduler() {
    if (!ctx || !song) return;
    var s = SONGS[song];
    var spb = 60 / s.bpm / 2;   // 8ぶおんぷ
    while (nextTime < ctx.currentTime + 0.2) {
      var i = step % s.lead.length;
      var t = nextTime - ctx.currentTime;
      if (t < 0) t = 0;

      if (s.lead[i]) tone({ freq: n(s.lead[i]), type: s.leadType, dur: spb * 1.7, vol: 0.12, when: t, dest: musicBus, wet: 0.25 });
      if (s.bass[i]) tone({ freq: n(s.bass[i]), type: 'triangle', dur: spb * 1.9, vol: 0.2, when: t, dest: musicBus });
      if (s.hat[i]) noise({ dur: 0.035, vol: 0.05, freq: 7000, type: 'highpass', when: t, dest: musicBus });
      if (s.kick[i]) tone({ freq: 130, freqEnd: 48, type: 'sine', dur: 0.13, vol: 0.3, when: t, dest: musicBus });

      // ビートつうち（ランウェイの リズムあそび よう）
      if (i % 2 === 0) {
        (function (absTime) {
          for (var b = 0; b < beatCallbacks.length; b++) beatCallbacks[b](absTime);
        })(nextTime);
        lastBeatTime = nextTime;
      }

      nextTime += spb;
      step++;
    }
  }

  function startMusic(name) {
    if (!ctx || !SONGS[name]) return;
    if (song === name) return;
    song = name;
    step = 0;
    nextTime = ctx.currentTime + 0.05;
    if (schedTimer) clearInterval(schedTimer);
    schedTimer = setInterval(scheduler, 60);
    scheduler();
  }

  function stopMusic() {
    song = null;
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  }

  function onBeat(fn) { beatCallbacks.push(fn); }
  function offBeat(fn) { var i = beatCallbacks.indexOf(fn); if (i >= 0) beatCallbacks.splice(i, 1); }
  function beatInfo() {
    if (!ctx || !song) return null;
    var s = SONGS[song];
    return { bpm: s.bpm, period: 60 / s.bpm, last: lastBeatTime, now: ctx.currentTime };
  }

  /* ================= おはなし（にほんごボイス） ================= */

  var jaVoice = null, voiceReady = false;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    var vs = window.speechSynthesis.getVoices();
    if (!vs || !vs.length) return;
    for (var i = 0; i < vs.length; i++) {
      if (/ja[-_]JP/i.test(vs[i].lang)) {
        // おんなのこ っぽい こえを ゆうせん
        if (/kyoko|otoya|female|女性|ja-JP/i.test(vs[i].name) && !jaVoice) jaVoice = vs[i];
        if (/kyoko|female|女性/i.test(vs[i].name)) { jaVoice = vs[i]; break; }
      }
    }
    voiceReady = true;
  }

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.onvoiceschanged = pickVoice;
      pickVoice();
    } catch (e) { }
  }

  function say(text, opt) {
    if (!voiceOn || muted || !text) return;
    if (!('speechSynthesis' in window)) return;
    opt = opt || {};
    var t = performance.now();
    if (text === lastSpoken && t - lastSpokenAt < 1400) return;
    lastSpoken = text; lastSpokenAt = t;
    try {
      if (!voiceReady) pickVoice();
      if (!opt.queue) window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (jaVoice) u.voice = jaVoice;
      u.rate = opt.rate || 1.0;
      u.pitch = opt.pitch || 1.35;
      u.volume = opt.volume != null ? opt.volume : 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) { }
  }

  function shutUp() {
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) { } }
  }

  /* ================= せってい ================= */

  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    if (muted) shutUp();
  }
  function isMuted() { return muted; }
  function setVoice(v) { voiceOn = !!v; if (!voiceOn) shutUp(); }
  function isVoiceOn() { return voiceOn; }
  function ready() { return !!ctx; }

  return {
    init: init, play: play, say: say, shutUp: shutUp,
    startMusic: startMusic, stopMusic: stopMusic,
    onBeat: onBeat, offBeat: offBeat, beatInfo: beatInfo,
    setMuted: setMuted, isMuted: isMuted, setVoice: setVoice, isVoiceOn: isVoiceOn,
    ready: ready, tone: tone, noise: noise, notes: N
  };
})();
