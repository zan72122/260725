/* =========================================================
   scene-fiber.js — わたあめ の あそびば
   まわる きかいから ざらめの いとが とびだす。
   ぼうを くるくる うごかして あつめよう！
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util, S = YA.Sprites;
  YA.Scenes = YA.Scenes || {};

  function FiberScene(def) {
    this.def = def;
    this.sim = new YA.FiberSim();
    this.palette = def.colors.map(function (c) { return c.c; });
    this.spin = 0;
    this.emitT = 0;
    this.fluff = 0;
    this.fluffR = 0;
    this.stick = { x: 0, y: 0, vx: 0, vy: 0, held: false, ang: 0 };
    this.starProgress = 0;
    this.time = 0;
    this.loops = {};
    this.eaten = 0;
    this.glitters = [];
    this.best = YA.Store.get('candyBest', 0);
  }

  FiberScene.prototype.init = function (env) {
    this.resize(env.w, env.h, env.scale, env);
    this.reset(env);
  };

  FiberScene.prototype.resize = function (w, h, scale, env) {
    this.w = w; this.h = h; this.scale = scale;
    this.sim.setBounds(0, 0, w, h, scale);
    this.machine = { x: w * 0.5, y: h * 0.86, r: Math.min(w, h) * 0.15 };
    if (!this.stick.x) { this.stick.x = w * 0.5; this.stick.y = h * 0.34; }
    this.sim.max = YA.tier >= 2 ? 46 : 28;
  };

  FiberScene.prototype.reset = function (env) {
    this.sim.clear();
    this.fluff = 0; this.fluffR = 0; this.eaten = 0;
    this.glitters.length = 0;
    this.stick.x = this.w * 0.5;
    this.stick.y = this.h * 0.34;
  };

  FiberScene.prototype.dispose = function () {
    for (var k in this.loops) if (this.loops[k]) { this.loops[k].stop(); this.loops[k] = null; }
  };

  /* ---------- こうしん ---------- */
  FiberScene.prototype.update = function (dt, pointers, env) {
    var sim = this.sim, sc = this.scale;
    this.time += dt;
    this.spin += dt * 5.5;
    sim.gravity = env.zeroG ? -70 : 74;   // ざらめの いとは ほとんど おもさが ない
    sim.wind.x *= Math.exp(-3 * dt);
    sim.wind.y *= Math.exp(-3 * dt);

    this._tools(dt, pointers, env);

    /* いとを だす */
    this.emitT -= dt;
    if (this.emitT <= 0 && sim.strands.length < sim.max) {
      this.emitT = 0.085 + Math.random() * 0.07;
      var m = this.machine;
      var a = this.spin + U.rnd(-0.5, 0.5);
      var ex = m.x + Math.cos(a) * m.r * 0.8;
      var ey = m.y - m.r * 0.18 + Math.sin(a) * m.r * 0.22;
      var col = this.palette[env.colorIdx] || this.palette[0];
      // ゆびの ほうへ ふきあがる（ぼうが うえに あるほど たかく とぶ）
      var toX = this.stick.x - ex, toY = this.stick.y - ey;
      var tl = Math.max(1, U.len(toX, toY));
      var dirx = Math.cos(a) * 0.55 + (toX / tl) * 0.7;
      var diry = -0.85 + (toY / tl) * 0.7;
      var s = sim.spawn(ex, ey, dirx, diry, 120 * sc, 11,
        U.mixHex(col, '#ffffff', U.rnd(0, 0.35)));
      if (s) {
        // とびだす いきおい（さきほど ほど はやい）
        var pw = U.rnd(13, 18) * sc;
        for (var i = 0; i < s.n; i++) {
          var f = (1 - i / s.n);
          s.ox[i] = s.x[i] - dirx * pw * f;
          s.oy[i] = s.y[i] - diry * pw * f;
        }
      }
    }

    /* ぼうに くっつく */
    var st = this.stick;
    var catchR = 62 * sc + this.fluffR;     // 4さいでも かんたんに とれるように
    var pullR = catchR * 2.6;
    for (var k = sim.strands.length - 1; k >= 0; k--) {
      var sd = sim.strands[k];
      if (!sd.attached) {
        var best = 1e9;
        for (var q = 0; q < sd.n; q++) {
          var dq = U.dist(sd.x[q], sd.y[q], st.x, st.y);
          if (dq < best) best = dq;
          if (dq < catchR) { sd.attached = true; break; }
        }
        // とびだした あとは ぼうに むかって ふわ〜っと ながれる
        if (!sd.attached && sd.age > 0.30) {
          var near = best < pullR;
          sim.homeTo(sd, st.x, st.y, (near ? 2600 : 1500) * sc, dt);
        }
        if (sd.age > 9) { sd.dead = true; }
      }
      if (sd.attached) {
        sim.suck(sd, st.x, st.y, 4.2, dt);
        sd.absorb += dt * 1.5;
        if (sd.absorb >= 1) {
          sd.dead = true;
          this.fluff += 1;
          this._score(1.4, env);
          env.audio.play('sparkle', { notes: 1, freq: 900 + Math.random() * 900, vol: 0.35, minGap: 60 });
          env.fx.spark(st.x + U.rnd(-10, 10) * sc, st.y + U.rnd(-10, 10) * sc,
            { color: sd.color, size: U.rnd(4, 8), life: 0.5 });
          if (this.fluff % 15 === 0 && env.say) env.say(U.pick(['おおきくなった！', 'ふわふわ〜！', 'いいかんじ！']));
          if (this.fluff > this.best) { this.best = this.fluff; YA.Store.set('candyBest', this.best); }
        }
      }
    }
    // ごみそうじ
    for (var d = sim.strands.length - 1; d >= 0; d--) if (sim.strands[d].dead) sim.strands.splice(d, 1);

    sim.step(dt);

    /* わたあめの おおきさ */
    var target = Math.sqrt(this.fluff) * 13 * sc;
    this.fluffR = U.lerp(this.fluffR, Math.min(target, Math.min(this.w, this.h) * 0.26), 1 - Math.exp(-6 * dt));

    /* きらきら の こうしん */
    for (var g = this.glitters.length - 1; g >= 0; g--) {
      this.glitters[g].ph += dt * 7;
      this.glitters[g].life -= dt;
      if (this.glitters[g].life <= 0) this.glitters.splice(g, 1);
    }
  };

  FiberScene.prototype._tools = function (dt, pointers, env) {
    var sim = this.sim, sc = this.scale, tool = env.tool, fx = env.fx, st = this.stick;
    var blowing = false, spinning = false;

    for (var i = 0; i < pointers.length; i++) {
      var p = pointers[i];
      if (!p.down) continue;

      switch (tool) {
        case 'spin': {
          spinning = true;
          st.vx = (p.x - st.x);
          st.vy = (p.y - st.y);
          st.x = U.lerp(st.x, p.x, 1 - Math.exp(-18 * dt));
          st.y = U.lerp(st.y, p.y, 1 - Math.exp(-18 * dt));
          st.ang = U.angleLerp(st.ang, Math.atan2(st.vy, st.vx) + Math.PI / 2, 0.12);
          st.held = true;
          if (p.speed > 260 * sc && Math.random() < 0.25) {
            fx.spark(st.x + U.rnd(-18, 18) * sc, st.y + U.rnd(-18, 18) * sc,
              { color: '#fff0f8', size: U.rnd(3, 6), life: 0.4 });
            this._score(0.05, env);
          }
          break;
        }
        case 'eat': {
          if (p.justDown && U.dist(p.x, p.y, st.x, st.y) < this.fluffR + 34 * sc && this.fluff > 0) {
            var bite = Math.min(this.fluff, 6);
            this.fluff -= bite;
            this.eaten += bite;
            env.audio.play('munch');
            YA.Haptics.fire('squish');
            for (var h = 0; h < 4; h++) fx.heart(st.x + U.rnd(-24, 24) * sc, st.y, {});
            fx.burst(st.x, st.y, 8, ['#ffd0e8', '#ffffff'], { maxSpeed: 200 });
            this._score(bite * 1.1, env);
            if (env.say) env.say(U.pick(['もぐもぐ！', 'おいし〜い！', 'あま〜い！']));
            if (this.fluff <= 0 && env.say) env.say('ぜんぶ たべた！');
          }
          break;
        }
        case 'blow': {
          blowing = true;
          var bx = p.vx, by = p.vy;
          if (U.len(bx, by) < 80 * sc) { bx = 0; by = -260 * sc; }
          sim.wind.x = bx * 0.9; sim.wind.y = by * 0.9;
          if (Math.random() < 0.35) fx.puff(p.x, p.y, { vx: bx * 0.3 / sc, vy: by * 0.3 / sc, r: U.rnd(10, 20), alpha: 0.2 });
          this._score(0.04, env);
          break;
        }
        case 'glitter': {
          if (U.dist(p.x, p.y, st.x, st.y) < this.fluffR + 50 * sc) {
            if (this.glitters.length < 70) {
              var a = U.rnd(0, U.TAU), d = U.rnd(0, 1);
              this.glitters.push({
                a: a, d: d, hue: U.rnd(0, 360), size: U.rnd(3, 6) * sc,
                ph: U.rnd(0, U.TAU), life: U.rnd(6, 20)
              });
            }
          }
          fx.spark(p.x, p.y, { color: U.rainbow(Math.random()), size: U.rnd(4, 8), life: 0.6 });
          env.audio.play('sparkle', { notes: 1, freq: U.rnd(1600, 2800), vol: 0.4, minGap: 80 });
          this._score(0.14, env);
          break;
        }
      }
    }

    if (!spinning) {
      // ゆびを はなしたら ゆっくり ただよう
      st.y += Math.sin(this.time * 1.6) * 6 * sc * dt;
    }

    if (blowing && !this.loops.wind) this.loops.wind = env.audio.loop('windLoop');
    if (this.loops.wind) {
      if (blowing) this.loops.wind.set(0.85, 0.6);
      else { this.loops.wind.stop(); this.loops.wind = null; }
    }
  };

  FiberScene.prototype._score = function (v, env) {
    this.starProgress += v;
    if (this.starProgress >= 26) { this.starProgress = 0; env.addStars(1); }
  };

  FiberScene.prototype.magic = function (env) {
    var sc = this.scale;
    this.fluff += 22;
    env.fx.confetti(this.stick.x, this.stick.y, 44);
    env.audio.play('fanfare');
    for (var i = 0; i < 22; i++) {
      this.glitters.push({
        a: U.rnd(0, U.TAU), d: U.rnd(0, 1), hue: U.rnd(0, 360),
        size: U.rnd(3, 6) * sc, ph: U.rnd(0, U.TAU), life: U.rnd(8, 24)
      });
    }
    if (env.say) env.say('きょだい わたあめ！');
    env.addStars(1);
    YA.Haptics.fire('success');
  };

  FiberScene.prototype.shake = function (env) {
    var sim = this.sim, sc = this.scale;
    sim.wind.x = U.rnd(-600, 600) * sc;
    sim.wind.y = U.rnd(-400, 100) * sc;
    env.audio.play('sweep', { up: true });
  };

  /* ---------- えがく ---------- */
  FiberScene.prototype.render = function (ctx, env) {
    var sc = this.scale, m = this.machine, st = this.stick;

    /* きかい */
    ctx.save();
    // うけざら
    ctx.fillStyle = '#e8e2ee';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.r, m.r * 0.42, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#d3ccdb';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + m.r * 0.10, m.r * 0.98, m.r * 0.40, 0, 0, Math.PI);
    ctx.fill();
    // なかの まわる ぶぶん
    ctx.save();
    ctx.translate(m.x, m.y - m.r * 0.05);
    ctx.scale(1, 0.42);
    ctx.rotate(this.spin);
    for (var i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? U.rgba(this.palette[env.colorIdx] || '#ffc7e2', .9) : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, m.r * 0.55, i / 8 * U.TAU, (i + 1) / 8 * U.TAU);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#bfb6c9';
    ctx.lineWidth = 3 * sc;
    ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r, m.r * 0.42, 0, 0, U.TAU); ctx.stroke();
    ctx.restore();

    /* いと */
    this.sim.render(ctx);

    /* ぼう ＋ わたあめ */
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.rotate(st.ang * 0.35);
    // ぼう
    ctx.fillStyle = '#e6d3b8';
    ctx.strokeStyle = '#c9b294';
    ctx.lineWidth = 2 * sc;
    var sw = 9 * sc, sh = Math.max(70 * sc, this.fluffR * 1.6);
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-sw / 2, -10 * sc, sw, sh, sw / 2); }
    else { ctx.beginPath(); ctx.rect(-sw / 2, -10 * sc, sw, sh); }
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // わたあめ
    if (this.fluffR > 2) {
      ctx.save();
      var col = this.palette[env.colorIdx] || '#ffc7e2';
      var rnd = U.mulberry32(7);
      var puffs = Math.min(34, 8 + Math.round(this.fluffR / (5 * sc)));
      ctx.globalCompositeOperation = 'source-over';
      for (var k = 0; k < puffs; k++) {
        var a = rnd() * U.TAU + this.time * 0.22;
        var d = Math.sqrt(rnd()) * this.fluffR * 0.72;
        var wob = Math.sin(this.time * 2.4 + k) * 3 * sc;
        var px = st.x + Math.cos(a) * d + wob;
        var py = st.y + Math.sin(a) * d * 0.92 + wob * 0.6;
        var rr = this.fluffR * (0.34 + rnd() * 0.26);
        var sp = S.fluff(U.mixHex(col, '#ffffff', rnd() * 0.4), rr);
        ctx.drawImage(sp, px - sp.width / 2, py - sp.height / 2);
      }
      // しんの かたまり
      var core = S.glow(U.mixHex(col, '#ffffff', 0.25), this.fluffR * 0.85, 0.65);
      ctx.drawImage(core, st.x - core.width / 2, st.y - core.height / 2);
      ctx.restore();

      // きらきら
      if (this.glitters.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (var q = 0; q < this.glitters.length; q++) {
          var gl = this.glitters[q];
          var gx = st.x + Math.cos(gl.a + this.time * 0.3) * gl.d * this.fluffR * 0.8;
          var gy = st.y + Math.sin(gl.a + this.time * 0.3) * gl.d * this.fluffR * 0.7;
          var tw = 0.5 + 0.5 * Math.sin(gl.ph);
          var gs = S.spark(U.hsl2hex(gl.hue + this.time * 50, 95, 74), gl.size * (0.7 + tw * 0.6));
          ctx.globalAlpha = 0.4 + tw * 0.6;
          ctx.drawImage(gs, gx - gs.width / 2, gy - gs.height / 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // おおきさ メーター
      if (this.fluff > 0) {
        ctx.save();
        ctx.font = '800 ' + (17 * sc) + 'px "Hiragino Maru Gothic ProN",sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.lineWidth = 5 * sc; ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.fillStyle = '#e0629d';
        var txt = '🍬 ' + this.fluff + (this.best > 0 ? '  さいこう ' + this.best : '');
        ctx.strokeText(txt, 12 * sc, 10 * sc);
        ctx.fillText(txt, 12 * sc, 10 * sc);
        ctx.restore();
      }
    }
  };

  YA.Scenes.fiber = { create: function (def) { return new FiberScene(def); } };

})(window);
