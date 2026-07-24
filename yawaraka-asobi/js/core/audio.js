/* =========================================================
   audio.js — WebAudio で ぜんぶ その場で つくる おと
   （おんせいファイルなし。ぷにっ・ぱちん・ちゃぽん…）
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  var ctx = null, master = null, comp = null, reverb = null, revGain = null;
  var noiseBuf = null;
  var ready = false;
  var muted = false;
  var volume = YA.Store ? YA.Store.get('volume', 0.7) : 0.7;

  /* ---------- 初期化 ---------- */
  function init() {
    if (ctx) return true;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;

    master = ctx.createGain();
    master.gain.value = volume;

    master.connect(comp);
    comp.connect(ctx.destination);

    // かるい リバーブ（ノイズの みじかい インパルス）
    try {
      reverb = ctx.createConvolver();
      var len = Math.floor(ctx.sampleRate * 1.1);
      var ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) {
        var d = ir.getChannelData(c);
        for (var i = 0; i < len; i++) {
          var t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * 0.6;
        }
      }
      reverb.buffer = ir;
      revGain = ctx.createGain();
      revGain.gain.value = 0.16;
      reverb.connect(revGain);
      revGain.connect(master);
    } catch (e) { reverb = null; }

    // ノイズバッファ
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;

    ready = true;
    return true;
  }

  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    // iOS: むおんを 1かい ならして あける
    try {
      var s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination); s.start(0);
    } catch (e) { }
  }

  function T() { return ctx.currentTime; }
  function ok() { return ready && !muted && ctx && ctx.state === 'running'; }

  /* ---------- ぶひん ---------- */
  function noise(dur, gain, dest) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.5;
    var g = ctx.createGain();
    g.gain.value = gain === undefined ? 1 : gain;
    s.connect(g); g.connect(dest || master);
    s.start(T());
    s.stop(T() + (dur || 0.4));
    return { src: s, gain: g };
  }
  function osc(type, freq, dest) {
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq || 440;
    if (dest) o.connect(dest);
    return o;
  }
  function filt(type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    return f;
  }
  function gain(v) { var g = ctx.createGain(); g.gain.value = v === undefined ? 1 : v; return g; }
  function env(param, t0, a, peak, d, sus, r, end) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    param.exponentialRampToValueAtTime(Math.max(0.0002, sus === undefined ? 0.0002 : sus), t0 + a + d);
    if (end) param.exponentialRampToValueAtTime(0.0001, end);
  }
  function sendRev(node, amt) {
    if (!reverb) return;
    var g = gain(amt);
    node.connect(g); g.connect(reverb);
  }

  /* ---------- こうかおん ---------- */
  var SFX = {};

  /* ぷにっ（やわらかいものを おす） */
  SFX.squish = function (o) {
    o = o || {};
    var t0 = T(), s = U.clamp(o.strength === undefined ? 0.6 : o.strength, 0.05, 1);
    var pitch = (o.pitch || 1) * (0.85 + Math.random() * 0.35);
    var g = gain(0);
    var lp = filt('lowpass', 900 * pitch, 6);
    var n = noise(0.24, 0.9, lp);
    lp.connect(g); g.connect(master);
    lp.frequency.setValueAtTime(1500 * pitch, t0);
    lp.frequency.exponentialRampToValueAtTime(260 * pitch, t0 + 0.16);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.30 * s, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);
    // ぼわん とした ていおん
    var o1 = osc('sine', 180 * pitch);
    var g1 = gain(0);
    o1.connect(g1); g1.connect(master);
    o1.frequency.exponentialRampToValueAtTime(74 * pitch, t0 + 0.18);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime(0.16 * s, t0 + 0.02);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o1.start(t0); o1.stop(t0 + 0.24);
    sendRev(g, 0.1);
  };

  /* もちっ（ねばり） */
  SFX.sticky = function (o) {
    o = o || {};
    var t0 = T(), s = o.strength || 0.5;
    var bp = filt('bandpass', 700, 4);
    var g = gain(0);
    noise(0.34, 0.8, bp);
    bp.connect(g); g.connect(master);
    bp.frequency.setValueAtTime(420, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.3);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16 * s, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
  };

  /* ぱちん（あわ・しゃぼん） */
  SFX.pop = function (o) {
    o = o || {};
    var t0 = T();
    var f = (o.freq || 700) * (0.75 + Math.random() * 0.7);
    var v = (o.vol === undefined ? 0.3 : o.vol);
    var o1 = osc('sine', f);
    var g1 = gain(0);
    o1.connect(g1); g1.connect(master);
    o1.frequency.setValueAtTime(f * 2.4, t0);
    o1.frequency.exponentialRampToValueAtTime(f * 0.45, t0 + 0.07);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime(v, t0 + 0.004);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);
    o1.start(t0); o1.stop(t0 + 0.12);
    // クリック
    var hp = filt('highpass', 2200, 1);
    var g2 = gain(0);
    noise(0.05, 0.6, hp); hp.connect(g2); g2.connect(master);
    g2.gain.setValueAtTime(v * 0.5, t0);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    sendRev(g1, 0.14);
  };

  /* ちゃぽん（みずおと） */
  SFX.drop = function (o) {
    o = o || {};
    var t0 = T();
    var f = (o.freq || 520) * (0.7 + Math.random() * 0.8);
    var o1 = osc('sine', f);
    var g1 = gain(0);
    o1.connect(g1); g1.connect(master);
    o1.frequency.setValueAtTime(f * 0.6, t0);
    o1.frequency.exponentialRampToValueAtTime(f * 2.6, t0 + 0.055);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime((o.vol || 0.24), t0 + 0.006);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o1.start(t0); o1.stop(t0 + 0.18);
    sendRev(g1, 0.2);
  };

  /* ばしゃっ（しぶき） */
  SFX.splash = function (o) {
    o = o || {};
    var t0 = T(), s = o.strength || 0.6;
    var bp = filt('bandpass', 1800, 1.1);
    var g = gain(0);
    noise(0.4, 1, bp); bp.connect(g); g.connect(master);
    bp.frequency.setValueAtTime(900, t0);
    bp.frequency.exponentialRampToValueAtTime(4200, t0 + 0.12);
    bp.frequency.exponentialRampToValueAtTime(1200, t0 + 0.38);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.26 * s, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.40);
    sendRev(g, 0.22);
  };

  /* さらさら（すな・かぜ の ループ） */
  function makeLoop(build) {
    return function (o) {
      if (!ok()) return { set: function () { }, stop: function () { } };
      return build(o || {});
    };
  }

  SFX.pourLoop = makeLoop(function () {
    var bp = filt('bandpass', 3200, 0.8);
    var g = gain(0.0001);
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(T());
    return {
      set: function (v, pitch) {
        var t = T();
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(Math.max(0.0001, v * 0.20), t, 0.05);
        if (pitch) bp.frequency.setTargetAtTime(1800 + pitch * 2600, t, 0.08);
      },
      stop: function () {
        var t = T();
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, 0.06);
        try { s.stop(t + 0.5); } catch (e) { }
      }
    };
  });

  SFX.windLoop = makeLoop(function () {
    var bp = filt('bandpass', 700, 0.7);
    var lp = filt('lowpass', 1800, 1);
    var g = gain(0.0001);
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master);
    s.start(T());
    return {
      set: function (v, pitch) {
        var t = T();
        g.gain.setTargetAtTime(Math.max(0.0001, v * 0.22), t, 0.06);
        bp.frequency.setTargetAtTime(420 + (pitch || 0.5) * 1400, t, 0.1);
      },
      stop: function () {
        var t = T();
        g.gain.setTargetAtTime(0.0001, t, 0.08);
        try { s.stop(t + 0.6); } catch (e) { }
      }
    };
  });

  /* びよーん（のばす） */
  SFX.stretchLoop = makeLoop(function () {
    var o1 = osc('triangle', 220);
    var lp = filt('lowpass', 1400, 3);
    var g = gain(0.0001);
    o1.connect(lp); lp.connect(g); g.connect(master);
    var lfo = osc('sine', 5.4);
    var lg = gain(6);
    lfo.connect(lg); lg.connect(o1.frequency);
    o1.start(T()); lfo.start(T());
    return {
      set: function (v, stretch) {
        var t = T();
        g.gain.setTargetAtTime(Math.max(0.0001, v * 0.11), t, 0.05);
        o1.frequency.setTargetAtTime(150 + (stretch || 0) * 480, t, 0.07);
        lp.frequency.setTargetAtTime(700 + (stretch || 0) * 2200, t, 0.1);
      },
      stop: function () {
        var t = T();
        g.gain.setTargetAtTime(0.0001, t, 0.05);
        try { o1.stop(t + 0.4); lfo.stop(t + 0.4); } catch (e) { }
      }
    };
  });

  /* きらきら */
  SFX.sparkle = function (o) {
    o = o || {};
    var t0 = T();
    var base = o.freq || 1400;
    var n = o.notes || 3;
    for (var i = 0; i < n; i++) {
      var t = t0 + i * 0.045;
      var f = base * Math.pow(1.26, i) * (0.95 + Math.random() * 0.12);
      var car = osc('sine', f);
      var mod = osc('sine', f * 2.01);
      var mg = gain(f * 1.4);
      var g = gain(0);
      mod.connect(mg); mg.connect(car.frequency);
      car.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.10 * (o.vol || 1), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
      car.start(t); car.stop(t + 0.32);
      mod.start(t); mod.stop(t + 0.32);
      sendRev(g, 0.3);
    }
  };

  /* ぼよん（ゼリー） */
  SFX.boing = function (o) {
    o = o || {};
    var t0 = T();
    var f = (o.freq || 300) * (0.8 + Math.random() * 0.4);
    var o1 = osc('sine', f);
    var g1 = gain(0);
    o1.connect(g1); g1.connect(master);
    o1.frequency.setValueAtTime(f * 1.9, t0);
    o1.frequency.exponentialRampToValueAtTime(f * 0.72, t0 + 0.26);
    var lfo = osc('sine', 13);
    var lg = gain(f * 0.22);
    lfo.connect(lg); lg.connect(o1.frequency);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime(0.20 * (o.vol || 1), t0 + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
    o1.start(t0); o1.stop(t0 + 0.36);
    lfo.start(t0); lfo.stop(t0 + 0.36);
    sendRev(g1, 0.15);
  };

  /* しゅわ〜（とける・こおる） */
  SFX.sweep = function (o) {
    o = o || {};
    var t0 = T(), up = o.up !== false;
    var bp = filt('bandpass', 800, 3);
    var g = gain(0);
    noise(0.6, 1, bp); bp.connect(g); g.connect(master);
    bp.frequency.setValueAtTime(up ? 400 : 3600, t0);
    bp.frequency.exponentialRampToValueAtTime(up ? 3600 : 380, t0 + 0.5);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    sendRev(g, 0.2);
  };

  /* ざくっ（きる） */
  SFX.cut = function () {
    var t0 = T();
    var hp = filt('highpass', 1600, 1);
    var g = gain(0);
    noise(0.16, 1, hp); hp.connect(g); g.connect(master);
    hp.frequency.setValueAtTime(900, t0);
    hp.frequency.exponentialRampToValueAtTime(5200, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.17, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
  };

  /* どすん（かたぬき・スタンプ） */
  SFX.thump = function (o) {
    o = o || {};
    var t0 = T();
    var o1 = osc('sine', 120);
    var g1 = gain(0);
    o1.connect(g1); g1.connect(master);
    o1.frequency.setValueAtTime(210, t0);
    o1.frequency.exponentialRampToValueAtTime(52, t0 + 0.19);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime(0.3 * (o.vol || 1), t0 + 0.008);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    o1.start(t0); o1.stop(t0 + 0.28);
    var lp = filt('lowpass', 700, 1);
    var g2 = gain(0);
    noise(0.1, 1, lp); lp.connect(g2); g2.connect(master);
    g2.gain.setValueAtTime(0.12, t0);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  };

  /* もぐもぐ */
  SFX.munch = function () {
    var t0 = T();
    for (var i = 0; i < 2; i++) {
      var t = t0 + i * 0.11;
      var lp = filt('lowpass', 1100, 5);
      var g = gain(0);
      var s = ctx.createBufferSource();
      s.buffer = noiseBuf; s.loop = true;
      s.connect(lp); lp.connect(g); g.connect(master);
      s.start(t); s.stop(t + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      lp.frequency.setValueAtTime(1600, t);
      lp.frequency.exponentialRampToValueAtTime(360, t + 0.09);
    }
  };

  /* ぽん（UIタップ） */
  SFX.tap = function (o) {
    o = o || {};
    var t0 = T();
    var o1 = osc('sine', o.freq || 880);
    var g1 = gain(0);
    o1.connect(g1); g1.connect(master);
    o1.frequency.setValueAtTime((o.freq || 880) * 1.5, t0);
    o1.frequency.exponentialRampToValueAtTime((o.freq || 880), t0 + 0.06);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime(0.13, t0 + 0.005);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
    o1.start(t0); o1.stop(t0 + 0.15);
  };

  /* ファンファーレ（レベルアップ） */
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function note(f, t, dur, vol, type) {
    var o1 = osc(type || 'triangle', f);
    var g1 = gain(0);
    var lp = filt('lowpass', 4200, 1);
    o1.connect(lp); lp.connect(g1); g1.connect(master);
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.start(t); o1.stop(t + dur + 0.02);
    sendRev(g1, 0.25);
  }
  SFX.fanfare = function () {
    var t0 = T();
    var seq = [0, 4, 7, 12, 9, 12, 16];
    for (var i = 0; i < seq.length; i++) {
      var f = 523.25 * Math.pow(2, seq[i] / 12);
      note(f, t0 + i * 0.10, 0.36, 0.15, 'triangle');
      if (i % 2 === 0) note(f / 2, t0 + i * 0.10, 0.4, 0.07, 'sine');
    }
    SFX.sparkle({ freq: 1800, notes: 5, vol: 0.9 });
  };
  SFX.chime = function () {
    var t0 = T();
    [0, 7, 12].forEach(function (n, i) {
      note(523.25 * Math.pow(2, n / 12), t0 + i * 0.07, 0.5, 0.12, 'sine');
    });
  };

  /* ---------- BGM（やさしい ペンタトニックの ループ） ---------- */
  var bgm = {
    on: YA.Store ? YA.Store.get('bgm', true) : true,
    timer: 0, step: 0, nextT: 0, gainNode: null, running: false, root: 523.25
  };

  function bgmSchedule() {
    if (!bgm.running || !ctx) return;
    var lookahead = 0.4;
    while (bgm.nextT < ctx.currentTime + lookahead) {
      var t = bgm.nextT;
      var s = bgm.step;
      // ゆっくりした アルペジオ ＋ ときどき ベース
      var deg = PENTA[(s * 3 + ((s / 8) | 0)) % PENTA.length];
      var f = bgm.root * Math.pow(2, deg / 12) / 2;
      if (bgm.on && ok()) {
        var o1 = osc('sine', f);
        var g1 = gain(0);
        var lp = filt('lowpass', 2400, 1);
        o1.connect(lp); lp.connect(g1); g1.connect(bgm.gainNode);
        g1.gain.setValueAtTime(0.0001, t);
        g1.gain.exponentialRampToValueAtTime(0.10, t + 0.03);
        g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        o1.start(t); o1.stop(t + 0.8);
        sendRev(g1, 0.3);
        if (s % 8 === 0) {
          var b = osc('sine', bgm.root / 4);
          var bg = gain(0);
          b.connect(bg); bg.connect(bgm.gainNode);
          bg.gain.setValueAtTime(0.0001, t);
          bg.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
          bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
          b.start(t); b.stop(t + 1.7);
        }
      }
      bgm.nextT += 0.42;
      bgm.step = (s + 1) % 64;
    }
    bgm.timer = setTimeout(bgmSchedule, 120);
  }

  function startBgm() {
    if (!ready || bgm.running) return;
    bgm.gainNode = gain(0.5);
    bgm.gainNode.connect(master);
    bgm.running = true;
    bgm.nextT = ctx.currentTime + 0.15;
    bgmSchedule();
  }
  function stopBgm() {
    bgm.running = false;
    clearTimeout(bgm.timer);
    if (bgm.gainNode) { try { bgm.gainNode.disconnect(); } catch (e) { } bgm.gainNode = null; }
  }

  /* ---------- こうかい API ---------- */
  var lastPlay = {};
  var A = YA.Audio = {
    init: init,
    unlock: function () {
      unlock();
      if (bgm.on) startBgm();
    },
    get ready() { return ready; },
    setVolume: function (v) {
      volume = U.clamp01(v);
      if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
      YA.Store.set('volume', volume);
    },
    getVolume: function () { return volume; },
    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
    },
    setBgm: function (b) {
      bgm.on = !!b; YA.Store.set('bgm', bgm.on);
      if (bgm.on) startBgm(); else stopBgm();
    },
    getBgm: function () { return bgm.on; },
    setBgmRoot: function (f) { bgm.root = f; },
    /* おとを ならす。minGap で ならしすぎを ふせぐ */
    play: function (name, opts) {
      if (!ok()) return;
      var fn = SFX[name];
      if (!fn) return;
      opts = opts || {};
      if (opts.minGap) {
        var t = U.now();
        if (lastPlay[name] && t - lastPlay[name] < opts.minGap) return;
        lastPlay[name] = t;
      }
      try { fn(opts); } catch (e) { }
    },
    loop: function (name, opts) {
      if (!ok()) return { set: function () { }, stop: function () { } };
      var fn = SFX[name];
      if (!fn) return { set: function () { }, stop: function () { } };
      try { return fn(opts || {}); } catch (e) { return { set: function () { }, stop: function () { } }; }
    },
    sfx: SFX
  };

  /* タブが かくれたら とめる */
  U.on(document, 'visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { try { ctx.suspend(); } catch (e) { } }
    else { try { ctx.resume(); } catch (e) { } }
  });

})(window);
