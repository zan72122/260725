/* =========================================================
   game.js — ぜんたいの しんこうやく
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util, UI = YA.UI;

  var FIXED = 1 / 60;

  function Game() {
    this.canvas = null; this.ctx = null;
    this.dpr = 1; this.w = 0; this.h = 0; this.scale = 1;
    this.scene = null; this.def = null;
    this.fx = new YA.FX();
    this.input = null;
    this.acc = 0; this.last = 0; this.running = false;
    this.fps = new YA.FpsMeter();
    this.lowFrames = 0;
    this.time = 0;
    this.stars = YA.Store.get('stars', 0);
    this.milestones = YA.Store.get('milestones', []);
    this.tool = 'poke';
    this.colorIdx = 0;
    this.stamp = YA.Store.get('stamp', 'star');
    this.settings = {
      zeroG: YA.Store.get('zeroG', false),
      slow: YA.Store.get('slow', false),
      amount: YA.Store.get('amount', 1),
      quality: YA.Store.get('quality', true),
      hints: YA.Store.get('hints', true)
    };
    this.hintTimer = 0; this.sayTimer = 0;
    this.bgPhase = 0;
    this.env = null;
    this.idle = 0;
  }

  /* ================= しょきか ================= */
  Game.prototype.init = function () {
    var self = this;
    UI.init();
    this.canvas = U.el('cv');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.input = new YA.PointerTracker(this.canvas);

    this.env = {
      w: 0, h: 0, scale: 1,
      fx: this.fx,
      audio: YA.Audio,
      tool: this.tool, colorIdx: 0, color: '#ffffff', stamp: this.stamp,
      zeroG: this.settings.zeroG, slow: this.settings.slow,
      amount: this.settings.amount, quality: this.settings.quality,
      gravityX: 0, pointerId: -1,
      addStars: function (n) { self.addStars(n); },
      say: function (m) { UI.say(m); },
      toast: function (m) { UI.toast(m); }
    };

    UI.buildPicker(YA.materials, function (m) { self.play(m); });
    UI.setStars(this.stars);
    this._bindUI();

    YA.Viewport.onChange(function () { self.resize(); });
    U.on(global, 'resize', function () { self.resize(); });

    YA.onShake(function () {
      if (!self.scene || !self.running) return;
      if (self.scene.shake) self.scene.shake(self.env);
      self.fx.confetti(self.w / 2, self.h / 2, 18);
      UI.say('わわっ！');
    });

    this._titleAnim();
  };

  /* ================= ボタン ================= */
  Game.prototype._bindUI = function () {
    var self = this;
    function tap() { YA.Audio.play('tap'); YA.Haptics.fire('tap'); }

    U.on(U.el('btnStart'), 'click', function () {
      tap();
      YA.Audio.unlock();
      YA.enableMotion();
      UI.screen('picker');
      self._stopTitleAnim();
    });

    U.on(U.el('btnHome'), 'click', function () {
      tap();
      self.stop();
      UI.screen('picker');
      UI.setStars(self.stars);
    });

    U.on(U.el('btnReset'), 'click', function () {
      tap();
      if (self.scene) { self.scene.reset(self.env); self.fx.clear(); }
      UI.toast('さいしょから！');
    });

    U.on(U.el('btnPhoto'), 'click', function () { tap(); self.takePhoto(); });
    U.on(U.el('btnGear'), 'click', function () { tap(); self.openSheet(); });
    U.on(U.el('sheetClose'), 'click', function () { tap(); UI.sheet(false); });
    U.on(U.el('photoClose'), 'click', function () { tap(); UI.photo(false); });
    U.on(U.el('levelClose'), 'click', function () { tap(); UI.levelup(false); });
    U.on(U.el('sheetWrap'), 'click', function (e) { if (e.target.id === 'sheetWrap') UI.sheet(false); });
    U.on(U.el('photoWrap'), 'click', function (e) { if (e.target.id === 'photoWrap') UI.photo(false); });
    U.on(U.el('levelWrap'), 'click', function (e) { if (e.target.id === 'levelWrap') UI.levelup(false); });

    U.on(U.el('btnMagic'), 'click', function () {
      YA.Haptics.fire('success');
      if (self.scene && self.scene.magic) self.scene.magic(self.env);
    });

    /* せってい */
    var vol = U.el('setVol');
    if (vol) {
      vol.value = Math.round(YA.Audio.getVolume() * 100);
      U.on(vol, 'input', function () { YA.Audio.setVolume(vol.value / 100); });
    }
    function toggle(id, get, set) {
      var b = U.el(id);
      if (!b) return;
      function paint() {
        var v = get();
        b.classList.toggle('off', !v);
        b.textContent = (id === 'setQuality') ? (v ? 'たかい' : 'ふつう') : (v ? 'ON' : 'OFF');
      }
      paint();
      U.on(b, 'click', function () { tap(); set(!get()); paint(); });
    }
    toggle('setBgm', function () { return YA.Audio.getBgm(); }, function (v) { YA.Audio.setBgm(v); });
    toggle('setHap', function () { return YA.Haptics.enabled; }, function (v) { YA.Haptics.setEnabled(v); });
    toggle('setZeroG', function () { return self.settings.zeroG; }, function (v) {
      self.settings.zeroG = v; self.env.zeroG = v; YA.Store.set('zeroG', v);
      UI.toast(v ? 'むじゅうりょく！' : 'もとに もどった');
    });
    toggle('setSlow', function () { return self.settings.slow; }, function (v) {
      self.settings.slow = v; self.env.slow = v; YA.Store.set('slow', v);
    });
    toggle('setQuality', function () { return self.settings.quality; }, function (v) {
      self.settings.quality = v; self.env.quality = v; YA.Store.set('quality', v);
      self.resize(true);
    });
    toggle('setHint', function () { return self.settings.hints; }, function (v) {
      self.settings.hints = v; YA.Store.set('hints', v);
      if (!v) UI.hint(null);
    });
    var amt = U.el('setAmount');
    if (amt) {
      amt.value = Math.round(self.settings.amount * 100);
      U.on(amt, 'change', function () {
        self.settings.amount = amt.value / 100;
        self.env.amount = self.settings.amount;
        YA.Store.set('amount', self.settings.amount);
        if (self.scene) self.scene.reset(self.env);
      });
    }
  };

  Game.prototype.openSheet = function () { UI.sheet(true); };

  /* ================= あそぶ ================= */
  Game.prototype.play = function (def) {
    var self = this;
    this.stop();
    this.def = def;
    UI.setMaterial(def);
    UI.screen('play');

    this.tool = def.tools[0];
    this.colorIdx = 0;
    this.env.tool = this.tool;
    this.env.colorIdx = 0;
    this.env.color = def.colors[0].c;
    this.env.stamp = this.stamp;

    UI.buildTools(def, this.tool, function (id) { self.setTool(id); });
    this._buildBottomBar();

    YA.Audio.setBgmRoot(def.bgmRoot || 523.25);

    var kind = def.kind;
    var factory = YA.Scenes[kind];
    this.scene = factory.create(def);

    this.resize(true);
    this.scene.init(this.env);

    this.fx.clear();
    this.input.clearAll();
    this.hintTimer = 1.4;
    this.sayTimer = 5;
    this.idle = 0;
    this.start();
    UI.say(U.pick(def.says));
  };

  Game.prototype._buildBottomBar = function () {
    var self = this;
    if (this.tool === 'stamp') {
      UI.buildStamps(this.stamp, function (name) {
        self.stamp = name; self.env.stamp = name;
        YA.Store.set('stamp', name);
        YA.Audio.play('tap');
      });
    } else {
      UI.buildColors(this.def, this.stars, this.colorIdx,
        function (i) {
          self.colorIdx = i;
          self.env.colorIdx = i;
          self.env.color = self.def.colors[i].c;
          YA.Audio.play('tap', { freq: 620 + i * 70 });
        },
        function (need) {
          UI.toast('⭐' + need + 'こで あけられるよ');
          YA.Audio.play('tap', { freq: 260 });
        });
    }
  };

  Game.prototype.setTool = function (id) {
    this.tool = id;
    this.env.tool = id;
    YA.Audio.play('tap', { freq: 760 });
    YA.Haptics.fire('tap');
    this._buildBottomBar();
    var t = YA.TOOLS[id];
    if (t) UI.toast(t.icon + ' ' + t.label);
  };

  /* ================= サイズ ================= */
  Game.prototype.resize = function (force) {
    if (!this.canvas) return;
    var stage = UI.stage();
    if (!stage) return;
    UI.fitBars();
    var r = stage.getBoundingClientRect();
    var w = Math.max(80, Math.round(r.width));
    var h = Math.max(80, Math.round(r.height));
    var maxDpr = this.settings.quality ? 2 : 1.4;
    if (YA.tier === 0) maxDpr = 1.25;
    var dpr = Math.min(global.devicePixelRatio || 1, maxDpr);
    if (!force && w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.min(w, h) / 720;
    this.env.w = w; this.env.h = h; this.env.scale = this.scale;
    this.fx.setBounds(0, 0, w, h, this.scale);
    if (this.scene) {
      this.scene.resize(w, h, this.scale, this.env);
    }
  };

  /* ================= ループ ================= */
  Game.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = U.now();
    var self = this;
    var frame = function (t) {
      if (!self.running) return;
      self.raf = requestAnimationFrame(frame);
      self.tick(t);
    };
    this.raf = requestAnimationFrame(frame);
  };

  Game.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.scene && this.scene.dispose) this.scene.dispose();
    this.scene = null;
  };

  Game.prototype.tick = function (t) {
    var now = t || U.now();
    var el = (now - this.last) / 1000;
    this.last = now;
    if (el > 0.25) el = 0.25;
    var fps = this.fps.tick(el);
    this.time += el;

    /* じどう ひんしつ ちょうせい */
    if (fps < 40) { this.lowFrames++; } else { this.lowFrames = Math.max(0, this.lowFrames - 1); }
    if (this.lowFrames > 90 && this.settings.quality) {
      /* この かいだけ かるく する（せっていには のこさない） */
      this.settings.quality = false; this.env.quality = false;
      this.lowFrames = 0;
      this.resize(true);
    }

    var pointers = this.input.beginFrame(el);
    var active = 0;
    for (var i = 0; i < pointers.length; i++) if (pointers[i].down) active++;
    this.idle = active > 0 ? 0 : this.idle + el;

    /* シミュレーション */
    var speed = this.settings.slow ? 0.35 : 1;
    this.acc += el * speed;
    var steps = 0;
    var maxSteps = 2;
    if (this.scene) {
      while (this.acc >= FIXED && steps < maxSteps) {
        this.scene.update(FIXED, steps === 0 ? pointers : [], this.env);
        this.acc -= FIXED;
        steps++;
      }
      if (this.acc > FIXED * 4) this.acc = FIXED * 4;
    }
    this.fx.update(el);

    /* えがく */
    this.render();

    /* たいせつ：シミュレーションを 1かいも まわさなかった フレームでは
       ゆびの「さわった しゅんかん」を まだ けさない。
       けして しまうと、つまむ・おかお・かたぬき が ときどき
       はんのう しなく なる。 */
    if (steps > 0 || !this.scene) this.input.endFrame();

    /* ヒント と マスコット */
    if (this.def) {
      this.hintTimer -= el;
      if (this.hintTimer <= 0) {
        this.hintTimer = 22;
        if (this.settings.hints && this.idle > 2.5) UI.hint(U.pick(this.def.hints));
      }
      this.sayTimer -= el;
      if (this.sayTimer <= 0) {
        this.sayTimer = U.rnd(14, 24);
        if (Math.random() < 0.65) UI.say(U.pick(this.def.says));
      }
    }
  };

  /* ================= えがく ================= */
  Game.prototype.render = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    if (!ctx) return;
    this.drawBackground(ctx, w, h);
    if (this.scene) this.scene.render(ctx, this.env);
    this.fx.render(ctx);
  };

  Game.prototype.drawBackground = function (ctx, w, h) {
    var def = this.def;
    var c0 = def ? def.bg[0] : '#fff6ee', c1 = def ? def.bg[1] : '#ffe0e8';
    /* グラデーションは つくり直さず つかいまわす */
    var key = c0 + c1 + w + 'x' + h;
    if (this._bgKey !== key) {
      this._bgKey = key;
      var gr = ctx.createLinearGradient(0, 0, w * 0.3, h);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, c1);
      this._bgGrad = gr;
    }
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, w, h);

    /* ふんわり もよう */
    this.bgPhase += 0.002;
    ctx.save();
    ctx.globalAlpha = 0.30;
    var n = 4;
    for (var i = 0; i < n; i++) {
      var a = this.bgPhase * (0.4 + i * 0.13) + i * 2.1;
      var x = w * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(a)));
      var y = h * (0.12 + 0.7 * (0.5 + 0.5 * Math.cos(a * 0.83 + i)));
      var r = Math.min(w, h) * (0.16 + 0.09 * Math.sin(a * 1.4));
      var sp = YA.Sprites.glow('#ffffff', r, 0.5);
      ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  /* ================= ほし ================= */
  Game.prototype.addStars = function (n) {
    this.stars += n;
    YA.Store.set('stars', this.stars);
    UI.setStars(this.stars);
    this.fx.star(U.rnd(this.w * 0.2, this.w * 0.8), this.h * 0.5, {});
    YA.Audio.play('sparkle', { notes: 2, freq: 1700, vol: 0.55, minGap: 150 });
    this._checkMilestone();
  };

  var MILESTONES = [
    { at: 30, title: 'レベル 2！', text: 'あたらしい いろが ふえたよ！' },
    { at: 60, title: 'レベル 3！', text: 'もっと いろが ふえたよ！' },
    { at: 100, title: 'レベル 4！', text: 'ぜんぶの いろが つかえる！' },
    { at: 200, title: 'たつじん！', text: 'すごい！ ほしを 200こ あつめた！' },
    { at: 400, title: 'マスター！', text: 'やわらか はかせに なった！' }
  ];

  Game.prototype._checkMilestone = function () {
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (this.stars >= m.at && this.milestones.indexOf(m.at) < 0) {
        this.milestones.push(m.at);
        YA.Store.set('milestones', this.milestones);
        UI.showLevelUp(m.title, m.text);
        YA.Audio.play('fanfare');
        YA.Haptics.fire('success');
        this.fx.confetti(this.w / 2, this.h * 0.3, 70);
        this._buildBottomBar();
        return;
      }
    }
  };

  /* ================= しゃしん ================= */
  Game.prototype.takePhoto = function () {
    try {
      var w = this.canvas.width, h = this.canvas.height;
      var pad = Math.round(Math.min(w, h) * 0.035);
      var cv = U.makeCanvas(w + pad * 2, h + pad * 2 + pad * 1.6);
      var c = cv.getContext('2d');
      // フレーム
      var g = c.createLinearGradient(0, 0, cv.width, cv.height);
      g.addColorStop(0, '#fff2f8'); g.addColorStop(1, '#e9f6ff');
      c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
      c.save();
      c.shadowColor = 'rgba(0,0,0,.2)'; c.shadowBlur = pad * 0.8; c.shadowOffsetY = pad * 0.2;
      c.fillStyle = '#fff';
      c.fillRect(pad, pad, w, h);
      c.restore();
      c.drawImage(this.canvas, pad, pad);
      // もじ
      var fs = Math.round(pad * 1.0);
      c.font = '800 ' + fs + 'px "Hiragino Maru Gothic ProN","M PLUS Rounded 1c",sans-serif';
      c.fillStyle = '#e0629d';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText((this.def ? this.def.emoji + ' ' + this.def.name : '') + '  ⭐' + this.stars,
        cv.width / 2, h + pad * 2 + pad * 0.7);
      var url = cv.toDataURL('image/png');
      UI.showPhoto(url);
      YA.Audio.play('chime');
      YA.Haptics.fire('pop');
      this.fx.burst(this.w / 2, this.h / 2, 20, ['#ffffff'], { maxSpeed: 300 });
      this.addStars(1);
    } catch (e) {
      UI.toast('しゃしんが とれなかった…');
    }
  };

  /* ================= タイトルの アニメ ================= */
  Game.prototype._titleAnim = function () {
    var cv = U.el('titleCv');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var self = this;
    var blobs = [];
    for (var i = 0; i < 9; i++) {
      blobs.push({
        x: Math.random(), y: Math.random(),
        r: U.rnd(0.06, 0.16), vx: U.rnd(-0.02, 0.02), vy: U.rnd(-0.03, -0.005),
        c: U.pick(['#ffc7e2', '#c7e8ff', '#d9f5c7', '#fff0b8', '#e3d0ff']),
        ph: U.rnd(0, U.TAU)
      });
    }
    var t0 = U.now();
    function loop() {
      if (self._titleStop) return;
      self._titleRaf = requestAnimationFrame(loop);
      var r = cv.getBoundingClientRect();
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
        cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      }
      var w = r.width, h = r.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var t = (U.now() - t0) / 1000;
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        b.x += b.vx * 0.004; b.y += b.vy * 0.004;
        if (b.y < -0.25) { b.y = 1.25; b.x = Math.random(); }
        if (b.x < -0.3) b.x = 1.3; if (b.x > 1.3) b.x = -0.3;
        var rr = Math.min(w, h) * b.r * (1 + 0.12 * Math.sin(t * 1.6 + b.ph));
        var sp = YA.Sprites.blob(b.c, rr, 0.55);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(sp, b.x * w - sp.width / 2, b.y * h - sp.height / 2);
      }
      ctx.globalAlpha = 1;
    }
    loop();
  };
  Game.prototype._stopTitleAnim = function () {
    this._titleStop = true;
    if (this._titleRaf) cancelAnimationFrame(this._titleRaf);
  };

  YA.Game = Game;

})(window);
