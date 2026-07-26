/* ============================================================
 * audio.js — 合成サウンド（音声ファイル不要 / WebAudio）
 *   「キィン」「シャラン」など宝石を削る音と、オルゴールBGM
 * ============================================================ */
(function () {
  'use strict';

  var ctx = null, master = null, musicGain = null, sfxGain = null;
  var muted = false;
  var enabled = false;   // 最初のタップまで音は鳴らさない（iOSの自動再生制限）
  var grind = null;          // なぞっている間のこすり音
  var schedTimer = null, nextNoteTime = 0, songPos = 0, playing = false;

  function ensureCtx() {
    if (!enabled) return false;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  /* ---------- 基本パーツ ---------- */

  function tone(o) {
    if (!ctx || muted) return;
    var when = ctx.currentTime + (o.when || 0);
    var dur = o.dur || 0.2;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, when);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), when + dur);
    var g = ctx.createGain();
    var vol = o.vol != null ? o.vol : 0.25;
    var atk = o.attack != null ? o.attack : 0.006;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(o.dest || sfxGain);
    osc.start(when); osc.stop(when + dur + 0.05);
  }

  function noise(o) {
    if (!ctx || muted) return;
    var when = ctx.currentTime + (o.when || 0);
    var dur = o.dur || 0.2;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = o.type || 'bandpass';
    filt.frequency.setValueAtTime(o.filterFreq || 2000, when);
    if (o.freqEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), when + dur);
    filt.Q.value = o.filterQ || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(o.vol != null ? o.vol : 0.2, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start(when); src.stop(when + dur + 0.05);
  }

  /* 金属的な鐘（倍音を非整数比にすると「キィン」になる） */
  function bell(base, vol, dur, when) {
    var parts = [1, 2.02, 2.99, 4.24, 5.43];
    var amps = [1, 0.6, 0.42, 0.24, 0.14];
    for (var i = 0; i < parts.length; i++) {
      tone({
        freq: base * parts[i], type: 'sine',
        dur: dur * (1 - i * 0.13), vol: vol * amps[i],
        when: when || 0, attack: 0.003
      });
    }
  }

  /* ---------- 効果音 ---------- */

  var SFX = {
    /* 新しい面ができた瞬間の「キィン！」 */
    kiin: function (pitch) {
      var p = pitch || 1;
      bell(1560 * p, 0.30, 1.35, 0);
      bell(2340 * p, 0.16, 0.9, 0.012);
      noise({ dur: 0.06, vol: 0.14, filterFreq: 6000, filterQ: 1.2, type: 'highpass' });
    },

    /* きらきら「シャラン」 */
    sharan: function (n) {
      var scale = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349, 2637];
      var count = n || 6;
      for (var i = 0; i < count; i++) {
        var f = scale[(i + Math.floor(Math.random() * 3)) % scale.length] * (i > 4 ? 2 : 1);
        tone({ freq: f, type: 'triangle', dur: 0.55, vol: 0.10, when: i * 0.045 });
        tone({ freq: f * 2.01, type: 'sine', dur: 0.3, vol: 0.04, when: i * 0.045 });
      }
    },

    /* 面がおおきいほど低く長い「ゴォン」寄りの音 */
    facet: function (size) {
      var s = Math.max(0, Math.min(1, size));
      SFX.kiin(1.25 - s * 0.45);
      SFX.sharan(3 + Math.round(s * 4));
    },

    tap: function () { tone({ freq: 900, freqEnd: 1400, type: 'triangle', dur: 0.07, vol: 0.22 }); },
    pop: function () {
      tone({ freq: 520, freqEnd: 960, type: 'sine', dur: 0.09, vol: 0.3 });
      noise({ dur: 0.05, vol: 0.08, filterFreq: 4000, type: 'highpass' });
    },
    whoosh: function () { noise({ dur: 0.5, vol: 0.12, filterFreq: 400, freqEnd: 2600, type: 'bandpass', filterQ: 0.8 }); },
    rainbow: function () {
      var f = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1318.5];
      for (var i = 0; i < f.length; i++)
        tone({ freq: f[i], type: 'triangle', dur: 0.7, vol: 0.09, when: i * 0.07 });
    },
    butterfly: function () {
      for (var i = 0; i < 5; i++)
        noise({ dur: 0.05, vol: 0.05, filterFreq: 900 + i * 120, filterQ: 6, when: i * 0.07 });
      tone({ freq: 1318.5, type: 'sine', dur: 0.5, vol: 0.07, when: 0.1 });
      tone({ freq: 1760, type: 'sine', dur: 0.5, vol: 0.05, when: 0.22 });
    },
    star: function () {
      var f = [1046.5, 1318.5, 1568, 2093];
      for (var i = 0; i < f.length; i++)
        tone({ freq: f[i], type: 'triangle', dur: 0.4, vol: 0.13, when: i * 0.06 });
    },
    fanfare: function () {
      var seq = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1046.5, 1318.5, 1567.98];
      var at = [0, 0.12, 0.24, 0.38, 0.5, 0.66, 0.78, 0.92];
      for (var i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], type: 'triangle', dur: 0.35, vol: 0.15, when: at[i] });
        tone({ freq: seq[i] / 2, type: 'sine', dur: 0.4, vol: 0.11, when: at[i] });
      }
      for (var j = 0; j < 3; j++) bell(1568, 0.10, 1.2, 1.0 + j * 0.1);
    },
    princess: function () {
      var seq = [784, 880, 1046.5, 1318.5, 1174.7, 1046.5];
      for (var i = 0; i < seq.length; i++)
        tone({ freq: seq[i], type: 'sine', dur: 0.5, vol: 0.13, when: i * 0.16 });
    },
    reset: function () {
      noise({ dur: 0.6, vol: 0.16, filterFreq: 2400, freqEnd: 200, type: 'lowpass', filterQ: 1 });
      tone({ freq: 400, freqEnd: 180, type: 'sine', dur: 0.5, vol: 0.16 });
    }
  };

  /* ---------- こすり音（なぞっている間ずっと） ---------- */

  function startGrind() {
    if (!ensureCtx() || muted || grind) return;
    var len = Math.floor(ctx.sampleRate * 1.2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 2.2;
    var g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start();
    grind = { src: src, gain: g, filt: filt };
  }

  function setGrind(speed) {   // speed: 0..1
    if (!grind || !ctx) return;
    var s = Math.max(0, Math.min(1, speed));
    grind.gain.gain.setTargetAtTime(0.0001 + s * 0.085, ctx.currentTime, 0.05);
    grind.filt.frequency.setTargetAtTime(1400 + s * 2600, ctx.currentTime, 0.06);
  }

  function stopGrind() {
    if (!grind || !ctx) return;
    var g = grind;
    g.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    setTimeout(function () { try { g.src.stop(); } catch (e) {} }, 300);
    grind = null;
  }

  /* ---------- BGM（オルゴール風アルペジオ） ---------- */
  /* Cメジャーペンタトニックを漂わせるだけの、じゃまをしない曲 */
  var CHORDS = [
    [261.63, 329.63, 392.00, 523.25],   // C
    [293.66, 349.23, 440.00, 587.33],   // Dm7 風
    [349.23, 440.00, 523.25, 659.25],   // F
    [392.00, 493.88, 587.33, 783.99]    // G
  ];
  var PATTERN = [0, 2, 1, 3, 2, 0, 3, 1];

  function scheduleMusic() {
    if (!ctx || !playing) return;
    var ahead = ctx.currentTime + 0.6;
    while (nextNoteTime < ahead) {
      var chord = CHORDS[Math.floor(songPos / 8) % CHORDS.length];
      var idx = PATTERN[songPos % 8];
      var f = chord[idx];
      var when = nextNoteTime - ctx.currentTime;
      if (when >= 0 && !muted) {
        tone({ freq: f * 2, type: 'sine', dur: 1.5, vol: 0.10, when: when, dest: musicGain, attack: 0.01 });
        tone({ freq: f * 4, type: 'sine', dur: 0.7, vol: 0.03, when: when, dest: musicGain });
        if (songPos % 8 === 0) tone({ freq: f / 2, type: 'sine', dur: 2.2, vol: 0.07, when: when, dest: musicGain });
      }
      nextNoteTime += 0.42;
      songPos++;
    }
    schedTimer = setTimeout(scheduleMusic, 200);
  }

  var Sound = {
    init: function () {
      enabled = true;
      return ensureCtx();
    },
    play: function (name, arg) {
      if (!ensureCtx() || muted) return;
      if (SFX[name]) SFX[name](arg);
    },
    startGrind: startGrind,
    setGrind: setGrind,
    stopGrind: stopGrind,
    startMusic: function () {
      if (!ensureCtx() || playing) return;
      playing = true;
      nextNoteTime = ctx.currentTime + 0.1;
      scheduleMusic();
    },
    stopMusic: function () {
      playing = false;
      if (schedTimer) { clearTimeout(schedTimer); schedTimer = null; }
    },
    toggleMute: function () {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
      if (muted) stopGrind();
      return muted;
    },
    isMuted: function () { return muted; }
  };

  window.Sound = Sound;
})();
