/* ============================================================
 * audio.js — WebAudioによる効果音の合成（外部音源ファイル不要）
 *   自販機まわりの音は「金属」「モーター」「炭酸」の3系統でできている。
 *   ここではそれぞれをノイズ＋フィルタ＋倍音で作り分けている。
 * ============================================================ */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var noiseBuf = null;
  var humNodes = null;

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    noiseBuf = makeNoiseBuffer(2.0);
    return true;
  }

  function makeNoiseBuffer(sec) {
    var len = Math.floor(ctx.sampleRate * sec);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function now() { return ctx.currentTime; }

  /* ---- 基本パーツ ---- */

  function osc(type, freq, t0, dur, gain, dest, detune) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return { osc: o, gain: g };
  }

  function noise(t0, dur, gain, filterType, freq, q, dest) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(freq || 1200, t0);
    f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || master);
    s.start(t0); s.stop(t0 + dur + 0.05);
    return { src: s, filter: f, gain: g };
  }

  /* ---- 効果音 ---- */

  var S = {};

  /** 硬貨の「チャリン」。金属は非整数倍音の集まりなので比を崩して重ねる */
  S.coin = function (size) {
    if (!ready()) return;
    var t = now();
    var base = 2400 - (size || 0) * 320;            // 大きい硬貨ほど低い
    var ratios = [1, 1.53, 2.11, 2.74, 3.62];
    for (var i = 0; i < ratios.length; i++) {
      osc('triangle', base * ratios[i], t + i * 0.0015,
        0.30 - i * 0.04, 0.13 / (i + 1.2));
    }
    noise(t, 0.05, 0.05, 'highpass', 3000, 1);
  };

  /** 硬貨がトレーに落ちて跳ねる */
  S.coinDrop = function (count) {
    if (!ready()) return;
    var n = count || 1;
    for (var i = 0; i < n; i++) {
      (function (i) {
        var t = now() + i * 0.09 + Math.random() * 0.04;
        var base = 2000 + Math.random() * 900;
        for (var k = 0; k < 4; k++) {
          osc('triangle', base * [1, 1.61, 2.3, 3.1][k], t, 0.22 - k * 0.03, 0.10 / (k + 1.3));
        }
        // 跳ね返り
        osc('triangle', base * 1.2, t + 0.11, 0.10, 0.035);
        osc('triangle', base * 1.9, t + 0.19, 0.07, 0.020);
      })(i);
    }
  };

  /** 硬貨投入口から機内を転がって落ちていく音 */
  S.coinRoll = function () {
    if (!ready()) return;
    var t = now();
    var nz = noise(t, 0.42, 0.05, 'bandpass', 2600, 6);
    nz.filter.frequency.setValueAtTime(3200, t);
    nz.filter.frequency.exponentialRampToValueAtTime(900, t + 0.42);
    osc('triangle', 1500, t + 0.36, 0.18, 0.06);
  };

  /** 紙幣の吸い込み（ローラーのモーター＋紙のこすれ） */
  S.billSuck = function () {
    if (!ready()) return;
    var t = now();
    // ローラーモーター
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(210, t + 0.15);
    o.frequency.linearRampToValueAtTime(120, t + 0.9);
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.06);
    g.gain.setValueAtTime(0.07, t + 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + 1.0);
    // 紙のこすれ
    var nz = noise(t + 0.05, 0.8, 0.045, 'bandpass', 1800, 1.2);
    nz.filter.frequency.setValueAtTime(1400, t);
    nz.filter.frequency.linearRampToValueAtTime(2600, t + 0.8);
  };

  /** 商品を押し出すモーター（缶の落下機構） */
  S.motor = function (dur) {
    if (!ready()) return;
    var d = dur || 0.55;
    var t = now();
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(78, t);
    o.frequency.linearRampToValueAtTime(96, t + d * 0.2);
    o.frequency.linearRampToValueAtTime(88, t + d);
    lfo.type = 'sine'; lfo.frequency.value = 34; lg.gain.value = 12;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 700;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.05);
    g.gain.setValueAtTime(0.10, t + d - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + d + 0.05);
    lfo.start(t); lfo.stop(t + d + 0.05);
    noise(t, d, 0.022, 'bandpass', 420, 2);
  };

  /** 缶・ペットボトルが落ちてぶつかる音 */
  S.thud = function (hard) {
    if (!ready()) return;
    var t = now();
    var v = hard ? 1 : 0.6;
    osc('sine', 120, t, 0.16, 0.28 * v);
    osc('sine', 74, t, 0.26, 0.22 * v);
    noise(t, 0.11, 0.10 * v, 'lowpass', 700, 1);
    // 金属のカラン
    osc('triangle', 900, t + 0.005, 0.13, 0.05 * v);
    osc('triangle', 1380, t + 0.005, 0.09, 0.035 * v);
  };

  /** 転がる音（シュートを滑り落ちる） */
  S.roll = function (dur) {
    if (!ready()) return;
    var d = dur || 0.5;
    var t = now();
    var nz = noise(t, d, 0.055, 'bandpass', 700, 3);
    nz.filter.frequency.setValueAtTime(500, t);
    nz.filter.frequency.linearRampToValueAtTime(1100, t + d * 0.6);
    nz.filter.frequency.linearRampToValueAtTime(600, t + d);
  };

  /** 取出口のフラップがバタンと動く */
  S.flap = function () {
    if (!ready()) return;
    var t = now();
    noise(t, 0.13, 0.09, 'bandpass', 900, 1.4);
    osc('sine', 190, t, 0.13, 0.13);
    osc('triangle', 460, t + 0.02, 0.08, 0.05);
  };

  /** ボタンを押した「カチッ」 */
  S.click = function (pitch) {
    if (!ready()) return;
    var t = now();
    osc('square', pitch || 1600, t, 0.035, 0.055);
    noise(t, 0.028, 0.05, 'highpass', 3800, 1);
  };

  /** 購入成立のピンポン */
  S.chime = function () {
    if (!ready()) return;
    var t = now();
    [[880, 0], [1174, 0.10], [1568, 0.20]].forEach(function (p) {
      osc('sine', p[0], t + p[1], 0.5, 0.10);
      osc('sine', p[0] * 2, t + p[1], 0.35, 0.035);
    });
  };

  /** 金額不足などのやさしいブザー（怖くしない） */
  S.nope = function () {
    if (!ready()) return;
    var t = now();
    osc('sine', 420, t, 0.16, 0.10);
    osc('sine', 330, t + 0.13, 0.22, 0.10);
  };

  /** 缶のプルタブ「プシュッ」 */
  S.pop = function () {
    if (!ready()) return;
    var t = now();
    osc('triangle', 2100, t, 0.05, 0.06);
    var nz = noise(t + 0.02, 0.55, 0.10, 'highpass', 2600, 0.9);
    nz.filter.frequency.setValueAtTime(4200, t);
    nz.filter.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
  };

  /** 炭酸のシュワシュワ */
  S.fizz = function (dur) {
    if (!ready()) return;
    noise(now(), dur || 1.6, 0.030, 'highpass', 5200, 0.8);
  };

  /** ゴクゴク飲む */
  S.gulp = function () {
    if (!ready()) return;
    var t = now();
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.20;
      var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, tt);
      o.frequency.exponentialRampToValueAtTime(90, tt + 0.14);
      f.type = 'lowpass'; f.frequency.value = 600;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.16, tt + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(tt); o.stop(tt + 0.2);
    }
  };

  /** 袋菓子がガサッと落ちる */
  S.bag = function () {
    if (!ready()) return;
    var t = now();
    noise(t, 0.30, 0.075, 'highpass', 2400, 0.8);
    osc('sine', 95, t + 0.02, 0.14, 0.10);
  };

  /** スパイラルコイルが回るモーター（少し高め・長め） */
  S.spiral = function () {
    if (!ready()) return;
    var t = now();
    var d = 1.25;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    lfo.type = 'sine'; lfo.frequency.value = 11; lg.gain.value = 18;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 1100;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.08);
    g.gain.setValueAtTime(0.075, t + d - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + d + 0.05);
    lfo.start(t); lfo.stop(t + d + 0.05);
  };

  /** 鍵を回す */
  S.key = function () {
    if (!ready()) return;
    var t = now();
    noise(t, 0.09, 0.06, 'bandpass', 2200, 3);
    osc('square', 1100, t + 0.10, 0.05, 0.05);
    osc('square', 780, t + 0.16, 0.07, 0.05);
  };

  /** 扉の開閉 */
  S.door = function (open) {
    if (!ready()) return;
    var t = now();
    var f0 = open ? 260 : 200;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(open ? 150 : 90, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.6);
    noise(t, 0.45, 0.030, 'bandpass', 500, 2);
  };

  /** きらきら（ごほうび） */
  S.sparkle = function () {
    if (!ready()) return;
    var t = now();
    for (var i = 0; i < 5; i++) {
      osc('sine', 1300 + i * 420 + Math.random() * 200, t + i * 0.055, 0.30, 0.045);
    }
  };

  /* ---- 環境音（自販機のコンプレッサー音） ---- */
  S.startHum = function () {
    if (!ready() || humNodes) return;
    var t = now();
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = 58;
    f.type = 'lowpass'; f.frequency.value = 190;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.030, t + 1.4);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t);
    var nz = ctx.createBufferSource();
    nz.buffer = noiseBuf; nz.loop = true;
    var nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 320;
    var ng = ctx.createGain(); ng.gain.value = 0.012;
    nz.connect(nf); nf.connect(ng); ng.connect(master);
    nz.start(t);
    humNodes = { o: o, g: g, nz: nz, ng: ng };
  };

  S.stopHum = function () {
    if (!humNodes) return;
    var t = now();
    humNodes.g.gain.linearRampToValueAtTime(0, t + 0.4);
    humNodes.ng.gain.linearRampToValueAtTime(0, t + 0.4);
    var h = humNodes; humNodes = null;
    setTimeout(function () { try { h.o.stop(); h.nz.stop(); } catch (e) { } }, 600);
  };

  function ready() {
    if (!enabled) return false;
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  S.unlock = function () {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    // iOS対策：無音を一度鳴らしてオーディオを起こす
    var s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start(0);
  };

  S.setEnabled = function (v) {
    enabled = !!v;
    if (master) master.gain.value = enabled ? 0.85 : 0;
    if (!enabled) S.stopHum();
  };
  S.isEnabled = function () { return enabled; };

  window.VMAudio = S;
})();
