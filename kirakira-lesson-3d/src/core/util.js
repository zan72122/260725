/* ============================================================
 * util.js — きほんの どうぐばこ
 *   すうがくヘルパー / イージング / かんたんトゥイーン / タイマー
 * ============================================================ */
var U = (function () {
  'use strict';

  /* ---------- すうがく ---------- */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function inv(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function chance(p) { return Math.random() < p; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // かさならないように n こ とりだす
  function sample(arr, n) { return shuffle(arr).slice(0, Math.min(n, arr.length)); }

  /* ---------- イージング ---------- */

  var ease = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return t * (2 - t); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    outCubic: function (t) { return (--t) * t * t + 1; },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
    outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: function (t) {
      if (t === 0 || t === 1) return t;
      var p = 0.36;
      return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
    },
    outBounce: function (t) {
      var n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  };

  /* ---------- トゥイーン ---------- */

  var tweens = [];

  /**
   * U.tween({from, to, dur, delay, ease, onUpdate(v,t), onDone, loop})
   * from/to は すうじ でも {x:..,y:..} のような オブジェクト でも OK
   */
  function tween(opts) {
    var tw = {
      from: opts.from != null ? opts.from : 0,
      to: opts.to != null ? opts.to : 1,
      dur: Math.max(0.0001, opts.dur || 0.4),
      delay: opts.delay || 0,
      ease: typeof opts.ease === 'function' ? opts.ease : (ease[opts.ease] || ease.outCubic),
      onUpdate: opts.onUpdate || null,
      onDone: opts.onDone || null,
      loop: !!opts.loop,
      yoyo: !!opts.yoyo,
      t: 0,
      dead: false,
      dir: 1
    };
    tweens.push(tw);
    return tw;
  }

  function mix(from, to, k) {
    if (typeof from === 'number') return from + (to - from) * k;
    var out = {};
    for (var key in to) out[key] = from[key] + (to[key] - from[key]) * k;
    return out;
  }

  function updateTweens(dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      if (tw.dead) { tweens.splice(i, 1); continue; }
      if (tw.delay > 0) { tw.delay -= dt; continue; }
      tw.t += dt / tw.dur;
      var raw = clamp(tw.t, 0, 1);
      var k = tw.ease(tw.dir > 0 ? raw : 1 - raw);
      if (tw.onUpdate) tw.onUpdate(mix(tw.from, tw.to, k), raw);
      if (tw.t >= 1) {
        if (tw.yoyo && tw.dir > 0) { tw.dir = -1; tw.t = 0; }
        else if (tw.loop) { tw.t = 0; tw.dir = 1; }
        else {
          tw.dead = true;
          if (tw.onDone) tw.onDone();
        }
      }
    }
  }

  function killTweens() { tweens.length = 0; }

  /* ---------- ちょっとまってタイマー ---------- */

  var timers = [];

  function after(sec, fn) {
    var t = { t: sec, fn: fn, dead: false };
    timers.push(t);
    return t;
  }

  function updateTimers(dt) {
    for (var i = timers.length - 1; i >= 0; i--) {
      var t = timers[i];
      if (t.dead) { timers.splice(i, 1); continue; }
      t.t -= dt;
      if (t.t <= 0) {
        t.dead = true;
        timers.splice(i, 1);
        try { t.fn(); } catch (e) { console.error(e); }
      }
    }
  }

  function clearTimers() { timers.length = 0; }

  function update(dt) { updateTweens(dt); updateTimers(dt); }

  /* ---------- いろ ---------- */

  // 0xRRGGBB を あかるく / くらく する
  function shade(hex, amt) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    if (amt >= 0) {
      r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt;
    } else {
      r = r * (1 + amt); g = g * (1 + amt); b = b * (1 + amt);
    }
    return (Math.round(clamp(r, 0, 255)) << 16) | (Math.round(clamp(g, 0, 255)) << 8) | Math.round(clamp(b, 0, 255));
  }

  function hex2css(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }

  function hsl(h, s, l) {
    var c = new THREE.Color();
    c.setHSL(h, s, l);
    return c.getHex();
  }

  /* ---------- そのた ---------- */

  function id() { return 'id' + (id._n = (id._n || 0) + 1); }

  function isLandscape() { return window.innerWidth > window.innerHeight; }
  function isNarrow() { return window.innerWidth / window.innerHeight < 0.85; }

  return {
    clamp: clamp, lerp: lerp, inv: inv, damp: damp,
    rand: rand, randInt: randInt, chance: chance, pick: pick, shuffle: shuffle, sample: sample,
    ease: ease, tween: tween, killTweens: killTweens,
    after: after, clearTimers: clearTimers, update: update,
    shade: shade, hex2css: hex2css, hsl: hsl,
    id: id, isLandscape: isLandscape, isNarrow: isNarrow,
    TAU: Math.PI * 2
  };
})();
