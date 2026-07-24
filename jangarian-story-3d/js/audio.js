/* ===== じゃんがりあん ものがたり : サウンド (WebAudio 全部手づくり) ===== */
window.JG = window.JG || {};

JG.Sound = (function () {
  var ctx = null;
  var master = null, sfxBus = null, musicBus = null;
  var noiseBuf = null;
  var muted = false;

  // ---- BGM シーケンサ ----
  var bgm = {
    playing: false,
    mode: 'day',      // 'day' | 'night'
    step: 0,
    nextTime: 0
  };

  // ドレミ: MIDIノート番号 → 周波数
  function nf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // 明るいペンタトニックのメロディ (8分音符 32ステップ, -1 = 休符)
  var DAY_MELODY = [
    72, 76, 79, 76, 81, 79, 76, 74,
    72, 76, 79, 81, 79, 76, 74, 72,
    74, 77, 81, 77, 83, 81, 77, 76,
    72, 76, 79, 84, 81, 79, 76, 72
  ];
  var DAY_BASS = [48, -1, 55, -1, 45, -1, 52, -1,
                  48, -1, 55, -1, 43, -1, 50, -1,
                  50, -1, 57, -1, 53, -1, 57, -1,
                  48, -1, 55, -1, 43, -1, 48, -1];

  // 夜: ゆっくりやさしい子守唄
  var NIGHT_MELODY = [
    76, -1, 79, -1, 84, -1, 79, -1,
    81, -1, 79, -1, 76, -1, -1, -1,
    74, -1, 76, -1, 79, -1, 76, -1,
    72, -1, -1, -1, -1, -1, -1, -1
  ];
  var NIGHT_BASS = [48, -1, -1, -1, 45, -1, -1, -1,
                    43, -1, -1, -1, 48, -1, -1, -1,
                    50, -1, -1, -1, 43, -1, -1, -1,
                    48, -1, -1, -1, -1, -1, -1, -1];

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.0;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);
    // ノイズバッファ (しぶき・シャカシャカ用)
    var len = ctx.sampleRate * 1.0;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  // ---- 基本のピコピコ音 ----
  function tone(opts) {
    if (!ctx || muted) return;
    var t0 = (opts.when !== undefined ? opts.when : ctx.currentTime);
    var dur = opts.dur || 0.15;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || 'triangle';
    osc.frequency.setValueAtTime(opts.f0 || 440, t0);
    if (opts.f1) osc.frequency.exponentialRampToValueAtTime(opts.f1, t0 + dur);
    var vol = opts.vol !== undefined ? opts.vol : 0.25;
    var atk = opts.attack !== undefined ? opts.attack : 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(opts.music ? musicBus : sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseHit(opts) {
    if (!ctx || muted) return;
    var t0 = (opts.when !== undefined ? opts.when : ctx.currentTime);
    var dur = opts.dur || 0.25;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = opts.rate || 1;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.filter || 'bandpass';
    filt.frequency.setValueAtTime(opts.f0 || 1200, t0);
    if (opts.f1) filt.frequency.exponentialRampToValueAtTime(opts.f1, t0 + dur);
    filt.Q.value = opts.q || 1.2;
    var g = ctx.createGain();
    var vol = opts.vol !== undefined ? opts.vol : 0.25;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(sfxBus);
    src.start(t0, Math.random() * 0.4, dur + 0.05);
  }

  // ---- 効果音いろいろ ----
  var S = {};

  S.tap = function () { tone({ f0: 660, f1: 990, dur: 0.07, vol: 0.12, type: 'sine' }); };

  S.pip = function () { tone({ f0: 880, f1: 1320, dur: 0.09, vol: 0.16, type: 'triangle' }); };

  S.pop = function () {
    tone({ f0: 520, f1: 1150, dur: 0.11, vol: 0.24, type: 'triangle' });
    tone({ f0: 1560, f1: 2200, dur: 0.08, vol: 0.1, type: 'sine', when: ctx ? ctx.currentTime + 0.03 : 0 });
  };

  S.squeak = function () {
    var base = 1150 + Math.random() * 450;
    tone({ f0: base, f1: base * 1.5, dur: 0.09, vol: 0.15, type: 'sine' });
    tone({ f0: base * 1.4, f1: base * 0.95, dur: 0.12, vol: 0.13, type: 'sine',
           when: ctx ? ctx.currentTime + 0.09 : 0 });
  };

  S.boing = function () {
    tone({ f0: 160, f1: 620, dur: 0.28, vol: 0.3, type: 'sine' });
    tone({ f0: 320, f1: 1240, dur: 0.24, vol: 0.12, type: 'triangle' });
  };

  S.whoosh = function () {
    noiseHit({ f0: 500, f1: 2400, dur: 0.22, vol: 0.14, filter: 'bandpass', q: 2 });
  };

  S.splash = function () {
    noiseHit({ f0: 900, f1: 300, dur: 0.4, vol: 0.3, filter: 'lowpass' });
    tone({ f0: 300, f1: 140, dur: 0.25, vol: 0.1, type: 'sine' });
  };

  S.munch = function () {
    noiseHit({ f0: 800, dur: 0.07, vol: 0.22, filter: 'lowpass' });
    noiseHit({ f0: 650, dur: 0.07, vol: 0.2, filter: 'lowpass', when: ctx ? ctx.currentTime + 0.12 : 0 });
    noiseHit({ f0: 700, dur: 0.07, vol: 0.18, filter: 'lowpass', when: ctx ? ctx.currentTime + 0.24 : 0 });
  };

  S.heart = function () {
    tone({ f0: 880, dur: 0.18, vol: 0.12, type: 'sine' });
    tone({ f0: 1108, dur: 0.2, vol: 0.1, type: 'sine', when: ctx ? ctx.currentTime + 0.02 : 0 });
  };

  S.tick = function () { tone({ f0: 1400, f1: 1900, dur: 0.045, vol: 0.1, type: 'square' }); };

  S.jingle = function () {
    if (!ctx) return;
    var notes = [72, 76, 79, 84];
    for (var i = 0; i < notes.length; i++) {
      tone({ f0: nf(notes[i]), dur: 0.16, vol: 0.18, type: 'triangle',
             when: ctx.currentTime + i * 0.09 });
    }
  };

  S.fanfare = function () {
    if (!ctx) return;
    var seq = [[72, 0], [72, 0.12], [72, 0.24], [76, 0.36], [79, 0.6], [76, 0.78], [84, 0.94]];
    for (var i = 0; i < seq.length; i++) {
      tone({ f0: nf(seq[i][0]), dur: 0.22, vol: 0.2, type: 'triangle',
             when: ctx.currentTime + seq[i][1] });
      tone({ f0: nf(seq[i][0] - 12), dur: 0.22, vol: 0.1, type: 'sine',
             when: ctx.currentTime + seq[i][1] });
    }
  };

  S.firework = function () {
    tone({ f0: 200, f1: 900, dur: 0.3, vol: 0.1, type: 'sine' });
    noiseHit({ f0: 2500, f1: 500, dur: 0.5, vol: 0.16, filter: 'bandpass',
               when: ctx ? ctx.currentTime + 0.28 : 0 });
  };

  S.magic = function () {
    if (!ctx) return;
    for (var i = 0; i < 6; i++) {
      tone({ f0: 900 + i * 260, dur: 0.1, vol: 0.09, type: 'sine',
             when: ctx.currentTime + i * 0.05 });
    }
  };

  // ---- BGM ----
  function startBGM(mode) {
    if (!ensure()) return;
    bgm.playing = true;
    bgm.mode = mode || bgm.mode;
    bgm.step = 0;
    bgm.nextTime = ctx.currentTime + 0.1;
  }
  function stopBGM() { bgm.playing = false; }
  function setBGMMode(mode) {
    if (bgm.mode !== mode) { bgm.mode = mode; bgm.step = 0; }
  }

  // メインループから毎フレーム呼ぶ (先読みスケジュール)
  function update() {
    if (!ctx || !bgm.playing || muted) return;
    var night = bgm.mode === 'night';
    var stepDur = night ? 0.34 : 0.155; // 8分音符の長さ
    var mel = night ? NIGHT_MELODY : DAY_MELODY;
    var bas = night ? NIGHT_BASS : DAY_BASS;
    while (bgm.nextTime < ctx.currentTime + 0.35) {
      var idx = bgm.step % mel.length;
      var m = mel[idx];
      if (m >= 0) {
        tone({ f0: nf(m), dur: night ? stepDur * 1.7 : stepDur * 1.25,
               vol: night ? 0.1 : 0.13,
               type: night ? 'sine' : 'triangle',
               when: bgm.nextTime, music: true, attack: night ? 0.05 : 0.01 });
      }
      var b = bas[idx];
      if (b >= 0) {
        tone({ f0: nf(b), dur: stepDur * 1.9, vol: night ? 0.07 : 0.1,
               type: 'sine', when: bgm.nextTime, music: true, attack: 0.02 });
      }
      bgm.nextTime += stepDur;
      bgm.step++;
    }
  }

  function setMuted(m) {
    muted = m;
    if (!ctx) return;
    master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
    if (!m) { bgm.nextTime = ctx.currentTime + 0.1; }
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
      bgm.nextTime = ctx.currentTime + 0.1;
    }
  }

  return {
    unlock: unlock,
    sfx: S,
    startBGM: startBGM,
    stopBGM: stopBGM,
    setBGMMode: setBGMMode,
    update: update,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    suspend: suspend,
    resume: resume
  };
})();
