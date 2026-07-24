/* =========================================================
   scene-pbd.js — ねんど / ゼリー / おもち / スライム /
                  おみず / はちみつ / チョコ の あそびば
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util, S = YA.Sprites;
  YA.Scenes = YA.Scenes || {};

  function PbdScene(def) {
    this.def = def;
    this.sim = new YA.PBD(1500);
    this.palette = def.colors.map(function (c) { return c.c; });
    this.style = def.style;
    this.glitter = [];
    this.faces = [];
    this.stampObs = null;
    this.grabInfo = {};
    this.loops = {};
    this.blobCv = null; this.blobCtx = null;
    this.shadCv = null; this.shadCtx = null;
    this.q = 0.62;
    this.qs = 0.30;
    this.interact = 0;
    this.starProgress = 0;
    this.prevKE = 0;
    this.avgTemp = 0.5;
    this.time = 0;
    this.rainbow = 0;
    this.splashCool = 0;
    this.tmp = { x: 0, y: 0 };
  }

  /* ---------------- しょきか ---------------- */
  PbdScene.prototype.init = function (env) {
    this.resize(env.w, env.h, env.scale, env);
    this.reset(env);
  };

  /* つぶの かず（たんまつの ちからと せっていで きめる） */
  PbdScene.prototype._count = function (env) {
    var tier = YA.tier === undefined ? 1 : YA.tier;
    var base = this.def.count * (tier === 0 ? 0.55 : tier === 1 ? 0.8 : 1);
    return Math.max(80, Math.min(this.sim.cap, Math.round(base * ((env && env.amount) || 1))));
  };

  PbdScene.prototype.resize = function (w, h, scale, env) {
    this.w = w; this.h = h; this.scale = scale;
    var p = this.def.params;
    var sc = {};
    for (var k in p) sc[k] = p[k];

    /* つぶの おおきさは「がめんの ひろさ」から きめる。
       こうすると どの たんまつでも おなじ おおきさに みえる。 */
    var n = this._count(env);
    var fill = (this.def.fill || 0.22) * ((env && env.amount) || 1);
    var spacing = Math.sqrt(w * h * fill / (n * 0.9));
    sc.spacing = U.clamp(spacing, 4.2, 30);
    sc.h = sc.spacing * (p.hMul || 2.1);
    sc.gravity = p.gravity * scale;
    sc.cohesion = (p.cohesion || 0) * scale;
    sc.maxVel = 2600 * scale;
    this.sim.configure(sc, scale);
    /* だいの うえに のっている ように みせる */
    this.trayH = this.def.tray ? Math.max(12, Math.round(h * 0.05)) : 0;
    this.sim.setBounds(0, 0, w, h - this.trayH);

    this.q = env && env.quality ? 0.68 : 0.5;
    this.qs = this.q * 0.5;
    this.blobCv = U.makeCanvas(Math.max(2, w * this.q), Math.max(2, h * this.q));
    this.blobCtx = this.blobCv.getContext('2d');
    this.tmpCv = U.makeCanvas(this.blobCv.width, this.blobCv.height);
    this.tmpCtx = this.tmpCv.getContext('2d');
    this.midCv = U.makeCanvas(Math.max(2, this.blobCv.width / 4), Math.max(2, this.blobCv.height / 4));
    this.midCtx = this.midCv.getContext('2d');
    this.blurCv = U.makeCanvas(Math.max(2, this.blobCv.width / 14), Math.max(2, this.blobCv.height / 14));
    this.blurCtx = this.blurCv.getContext('2d');
    this.shadCv = U.makeCanvas(Math.max(2, w * this.qs), Math.max(2, h * this.qs));
    this.shadCtx = this.shadCv.getContext('2d');
  };

  PbdScene.prototype.reset = function (env) {
    var sim = this.sim, def = this.def;
    sim.clear();
    this.glitter.length = 0;
    this.faces.length = 0;
    this.stampObs = null;
    sim.obstacles.length = 0;

    var n = this._count(env);
    var w = this.w, h = this.h;
    var id = def.id;
    if (id === 'water') {
      sim.spawnRect(w * 0.06, h * 0.30, w * 0.94, h * 0.96, n, 0, 'bottom');
    } else if (id === 'choco') {
      sim.spawnRect(w * 0.16, h * 0.34, w * 0.84, h * 0.60, n, 0);
      for (var i = 0; i < sim.n; i++) sim.temp[i] = 0.22;
    } else if (id === 'jelly') {
      sim.spawnRect(w * 0.20, h * 0.28, w * 0.80, h * 0.72, n, 0);
    } else if (id === 'honey') {
      sim.spawnDisc(w * 0.5, h * 0.42, n, 0);
    } else {
      sim.spawnDisc(w * 0.5, h * 0.52, n, 0);
    }
    if (def.params.useBonds) sim.buildBonds();
    this.avgTemp = def.params.ambient === undefined ? 0.5 : def.params.ambient;
    this.interact = 0;
  };

  PbdScene.prototype.dispose = function () {
    for (var k in this.loops) if (this.loops[k]) { this.loops[k].stop(); this.loops[k] = null; }
  };

  /* ---------------- こうしん ---------------- */
  PbdScene.prototype.update = function (dt, pointers, env) {
    var sim = this.sim, def = this.def, sc = this.scale;
    this.time += dt;
    if (this.splashCool > 0) this.splashCool -= dt;

    /* じゅうりょく */
    sim.p.gravity = (env.zeroG ? 0 : def.params.gravity * sc);
    sim.p.gravityX = env.gravityX || 0;
    if (env.zeroG) {
      for (var z = 0; z < sim.n; z += 3) {
        sim.vx[z] += Math.cos(this.time * 1.3 + z) * 8 * sc * dt * 60;
        sim.vy[z] += Math.sin(this.time * 1.1 + z * 0.7) * 8 * sc * dt * 60;
      }
    }

    /* おんど こうか */
    if (def.params.useTemp) this._tempEffects(dt, env);

    /* どうぐ */
    this._tools(dt, pointers, env);

    /* ぶつり */
    var steps = env.slow ? 1 : 1;
    sim.step(dt);

    /* エフェクトの ついか（ゆびに ついていく きらきら） */
    this._updateGlitter(dt);

    /* おと：ゆかに ぶつかった しぶき */
    var ke = sim.kineticEnergy();
    var d = ke - this.prevKE;
    this.prevKE = ke;
    if (def.id === 'water' && ke > 40000 * sc * sc && this.splashCool <= 0) {
      env.audio.play('splash', { strength: U.clamp(ke / (300000 * sc * sc), 0.15, 0.8), minGap: 160 });
      this.splashCool = 0.16;
    }
  };

  PbdScene.prototype._tempEffects = function (dt, env) {
    var sim = this.sim, def = this.def, n = sim.n;
    var s = 0;
    for (var i = 0; i < n; i++) s += sim.temp[i];
    this.avgTemp = n ? s / n : 0.5;
    var t = this.avgTemp;
    if (def.id === 'choco') {
      sim.p.viscosity = U.lerp(0.75, 0.30, U.clamp01((t - 0.35) / 0.5));
      sim.p.damping = U.lerp(1.8, 0.4, U.clamp01((t - 0.35) / 0.5));
      sim.p.fluidK = U.lerp(0.6, 0.95, U.clamp01((t - 0.4) / 0.4));
    } else if (def.id === 'honey') {
      sim.p.viscosity = U.lerp(0.97, 0.52, U.clamp01((t - 0.3) / 0.55));
    } else if (def.id === 'jelly') {
      sim.p.bondK = U.lerp(0.95, 0.55, U.clamp01((t - 0.2) / 0.6));
      sim.p.damping = U.lerp(0.7, 0.18, U.clamp01((t - 0.2) / 0.6));
    }
  };

  /* ---------------- どうぐ しょり ---------------- */
  PbdScene.prototype._tools = function (dt, pointers, env) {
    var sim = this.sim, sc = this.scale, tool = env.tool, fx = env.fx;
    var self = this;
    var anyBlow = false, anyStretch = 0, grabbing = false;
    sim.fingers.length = 0;

    for (var i = 0; i < pointers.length; i++) {
      var p = pointers[i];

      /* --- はなした とき --- */
      if (p.justUp) {
        if (this.grabInfo[p.id]) {
          sim.releaseGrab(p.id);
          delete this.grabInfo[p.id];
          env.audio.play('sticky', { strength: 0.4 });
        }
        if (this.stampObs && this.stampObs.owner === p.id) {
          this._liftStamp(env);
        }
        continue;
      }
      if (!p.down) continue;

      var r, cnt;
      switch (tool) {

        case 'poke': {
          r = 46 * sc;
          var speed = U.clamp(p.speed / (900 * sc), 0, 1.6);
          // ゆびを「まるい もの」と して おしこむ → ちゃんと へこむ
          sim.fingers.push({ x: p.x, y: p.y, r: 30 * sc });
          cnt = sim.push(p.x, p.y, r, 150 * sc * (0.4 + speed), p.vx * 0.30, p.vy * 0.30);
          if (cnt > 3) {
            this._score(cnt * 0.02, env);
            if (p.justDown || speed > 0.10) {
              var kind = this.def.id === 'jelly' ? 'boing' : (this.def.id === 'water' ? 'drop' : 'squish');
              env.audio.play(kind, {
                strength: U.clamp(0.25 + speed * 0.7, 0.2, 1),
                minGap: 95, vol: 0.3
              });
              YA.Haptics.fire('soft');
            }
            if (p.justDown) fx.ring(p.x, p.y, { r: 58 * sc, color: U.rgba(env.color, .8), lw: 4 });
          }
          break;
        }

        case 'grab': {
          if (p.justDown) {
            r = 74 * sc;
            var g = sim.grabAt(p.x, p.y, r, p.id, this.def.id === 'mochi' ? 0.42 : 0.55);
            if (g) {
              this.grabInfo[p.id] = { n: g.ids.length, sx: p.x, sy: p.y };
              env.audio.play('sticky', { strength: 0.5 });
              YA.Haptics.fire('tap');
              fx.ring(p.x, p.y, { r: 60 * sc, color: 'rgba(255,255,255,.9)', lw: 4 });
            }
          } else if (this.grabInfo[p.id]) {
            sim.moveGrab(p.id, p.x, p.y);
            grabbing = true;
            var gi = this.grabInfo[p.id];
            var stretch = U.dist(p.x, p.y, gi.sx, gi.sy) / (260 * sc);
            anyStretch = Math.max(anyStretch, U.clamp01(stretch));
            if (Math.random() < 0.10) this._score(0.06, env);
            if (Math.random() < 0.06) fx.spark(p.x + U.rnd(-16, 16) * sc, p.y + U.rnd(-16, 16) * sc,
              { color: env.color, size: U.rnd(3, 7), life: 0.5 });
          }
          break;
        }

        case 'cut': {
          if (!p.justDown && (Math.abs(p.x - p.px) + Math.abs(p.y - p.py)) > 1) {
            var broke = sim.cut(p.px, p.py, p.x, p.y, 20 * sc);
            if (broke > 0) {
              env.audio.play('cut', { minGap: 110 });
              YA.Haptics.fire('pop');
              this._score(broke * 0.05, env);
              for (var c = 0; c < Math.min(6, broke); c++) {
                fx.spark((p.x + p.px) / 2 + U.rnd(-14, 14) * sc, (p.y + p.py) / 2 + U.rnd(-14, 14) * sc,
                  { color: '#ffffff', size: U.rnd(3, 6), life: 0.35, speed: U.rnd(40, 140) });
              }
            }
          }
          break;
        }

        case 'blow': {
          anyBlow = true;
          var bx = p.vx, by = p.vy;
          var mag = U.len(bx, by);
          if (mag < 60 * sc) { bx = 0; by = -260 * sc; mag = 260 * sc; }
          sim.wind(p.x, p.y, 190 * sc, bx * 2.2, by * 2.2, dt);
          if (Math.random() < 0.5) {
            fx.puff(p.x + U.rnd(-30, 30) * sc, p.y + U.rnd(-30, 30) * sc, {
              vx: bx * 0.4 / sc, vy: by * 0.4 / sc, r: U.rnd(10, 22), alpha: 0.22, life: 0.5
            });
          }
          this._score(0.03, env);
          break;
        }

        case 'heat':
        case 'cool': {
          var hot = tool === 'heat';
          r = 95 * sc;
          cnt = sim.heat(p.x, p.y, r, hot ? 1 : 0, 13, dt);
          if (cnt > 0) {
            if (Math.random() < 0.55) {
              if (hot) fx.puff(p.x + U.rnd(-24, 24) * sc, p.y + U.rnd(-10, 10) * sc,
                { r: U.rnd(10, 20), color: '#ffffff', alpha: 0.30, vy: -70, life: 0.7 });
              else fx.spark(p.x + U.rnd(-30, 30) * sc, p.y + U.rnd(-30, 30) * sc,
                { color: '#bfeaff', size: U.rnd(4, 9), life: 0.7, speed: 25 });
            }
            env.audio.play('sweep', { up: hot, minGap: 620 });
            this._score(0.05, env);
          }
          break;
        }

        case 'paint': {
          r = 56 * sc;
          cnt = sim.paint(p.x, p.y, r, env.colorIdx);
          if (cnt > 0) {
            this._score(cnt * 0.02, env);
            env.audio.play('tap', { freq: 500 + env.colorIdx * 90, minGap: 130 });
            if (p.justDown || Math.random() < 0.25)
              fx.ring(p.x, p.y, { r: 62 * sc, color: U.rgba(env.color, .85), lw: 5 });
          }
          break;
        }

        case 'glitter': {
          if (Math.random() < 0.75) this._addGlitter(p.x, p.y, 40 * sc, env);
          break;
        }

        case 'face': {
          if (p.justDown) this._addFace(p.x, p.y, env);
          break;
        }

        case 'stamp': {
          if (p.justDown) { env.pointerId = p.id; this._pressStamp(p.x, p.y, env); }
          else if (this.stampObs && this.stampObs.owner === p.id) {
            this.stampObs.cx = p.x; this.stampObs.cy = p.y;
            this.stampObs.rot += (p.vx * 0.00035);
          }
          break;
        }

        case 'add': {
          if (sim.n < sim.cap && Math.random() < 0.5) {
            for (var a = 0; a < 3; a++) {
              var idx = sim.addParticle(p.x + U.rnd(-14, 14) * sc, p.y + U.rnd(-14, 14) * sc, env.colorIdx);
              if (idx >= 0) { sim.vx[idx] = p.vx * 0.4; sim.vy[idx] = p.vy * 0.4; }
            }
            env.audio.play('drop', { minGap: 90, vol: 0.14 });
          }
          break;
        }
      }
    }

    /* ループおん */
    this._loop('wind', anyBlow, env, function (l) { l.set(0.9, 0.55); });
    this._loop('stretch', grabbing && (self.def.id === 'mochi' || self.def.id === 'slime' || self.def.id === 'jelly'),
      env, function (l) { l.set(0.8, anyStretch); });
  };

  PbdScene.prototype._loop = function (name, want, env, cfg) {
    var key = name;
    if (want && !this.loops[key]) {
      this.loops[key] = env.audio.loop(name === 'wind' ? 'windLoop' : name === 'stretch' ? 'stretchLoop' : 'pourLoop');
    }
    if (this.loops[key]) {
      if (want) cfg(this.loops[key]);
      else { this.loops[key].stop(); this.loops[key] = null; }
    }
  };

  /* ---------------- かたぬき ---------------- */
  PbdScene.prototype._pressStamp = function (x, y, env) {
    if (this.stampObs) this._liftStamp(env);
    var poly = (U.shapes[env.stamp] || U.shapes.star)();
    var sp = this._sp || this._spread();
    var size = U.clamp(sp * 0.62, 46 * this.scale, 150 * this.scale);
    var ob = {
      poly: poly, cx: x, cy: y, s: size, rot: 0,
      active: true, owner: env.pointerId, shape: env.stamp, t: 0
    };
    this.stampObs = ob;
    this.sim.obstacles.push(ob);
    /* はんこ みたいに いろも つく（へこみだけ だと わかりにくい） */
    this._inkStamp(ob, env);
    env.audio.play('thump', { vol: 0.9 });
    YA.Haptics.fire('heavy');
    env.fx.ring(x, y, { r: 110 * this.scale, color: 'rgba(255,255,255,.9)', lw: 6, life: 0.6 });
    env.fx.burst(x, y, 8, ['#fff', env.color], { maxSpeed: 180 });
    this._score(2.5, env);
  };
  /* かたちの まわりに いろを つける */
  PbdScene.prototype._inkStamp = function (ob, env) {
    var sim = this.sim, t = this._tmp2 || (this._tmp2 = { x: 0, y: 0, d: 0 });
    var co = Math.cos(-ob.rot), si = Math.sin(-ob.rot);
    var rad = ob.s * 2.1, r2 = rad * rad;
    for (var i = 0; i < sim.n; i++) {
      var dx = sim.x[i] - ob.cx, dy = sim.y[i] - ob.cy;
      if (dx * dx + dy * dy > r2) continue;
      var lx = (dx * co - dy * si) / ob.s, ly = (dx * si + dy * co) / ob.s;
      U.polyNearest(ob.poly, lx, ly, t);
      if (t.d < 0.34) sim.col[i] = env.colorIdx;   // ふちの ところを そめる
    }
  };

  PbdScene.prototype._liftStamp = function (env) {
    var ob = this.stampObs;
    if (!ob) return;
    var idx = this.sim.obstacles.indexOf(ob);
    if (idx >= 0) this.sim.obstacles.splice(idx, 1);
    this.stampObs = null;
    env.audio.play('sticky', { strength: 0.35 });
    env.fx.burst(ob.cx, ob.cy, 6, ['#ffffff'], { maxSpeed: 120 });
  };

  /* ---------------- きらきら ---------------- */
  PbdScene.prototype._addGlitter = function (x, y, r, env) {
    var sim = this.sim;
    var i = sim.nearest(x + U.rnd(-r, r), y + U.rnd(-r, r), r);
    if (i < 0) return;
    if (this.glitter.length > 190) this.glitter.shift();
    this.glitter.push({
      pi: i,
      ox: U.rnd(-6, 6) * this.scale, oy: U.rnd(-6, 6) * this.scale,
      hue: U.rnd(0, 360), size: U.rnd(2.5, 5.5) * this.scale,
      ph: U.rnd(0, U.TAU)
    });
    env.audio.play('sparkle', { freq: U.rnd(1400, 2400), notes: 1, vol: 0.5, minGap: 70 });
    env.fx.spark(x, y, { color: '#fff6c0', size: 6, life: 0.5 });
    this._score(0.18, env);
  };
  PbdScene.prototype._updateGlitter = function (dt) {
    var g = this.glitter, sim = this.sim;
    for (var i = g.length - 1; i >= 0; i--) {
      if (g[i].pi >= sim.n) g.splice(i, 1);
      else g[i].ph += dt * 6;
    }
  };

  /* ---------------- おかお ---------------- */
  PbdScene.prototype._addFace = function (x, y, env) {
    var sim = this.sim;
    var i = sim.nearest(x, y, 70 * this.scale);
    if (i < 0) return;
    if (this.faces.length >= 6) this.faces.shift();
    var sp = this._sp || this._spread();
    var fr = U.clamp(sp * U.rnd(0.34, 0.44), 24 * this.scale, 110 * this.scale);
    this.faces.push({ pi: i, type: U.pick(S.FACES), r: fr, tilt: 0 });
    env.audio.play('chime');
    YA.Haptics.fire('success');
    env.fx.burst(x, y - 20 * this.scale, 10, ['#ffd0e8', '#fff6c0'], { maxSpeed: 180 });
    for (var k = 0; k < 3; k++) env.fx.heart(x + U.rnd(-20, 20) * this.scale, y, {});
    this._score(3, env);
    if (env.say) env.say(U.pick(['かわいい！', 'おかお できた！', 'にっこり♪']));
  };

  /* ---------------- スコア ---------------- */
  PbdScene.prototype._score = function (v, env) {
    this.starProgress += v;
    if (this.starProgress >= 26) {
      this.starProgress = 0;
      env.addStars(1);
    }
  };

  /* ---------------- まほう ---------------- */
  PbdScene.prototype.magic = function (env) {
    var sim = this.sim, sc = this.scale;
    var mode = (this.rainbow = (this.rainbow + 1) % 3);
    if (mode === 1) {
      // にじいろ ＆ ジャンプ
      for (var i = 0; i < sim.n; i++) {
        sim.col[i] = (i * 7 / Math.max(1, sim.n) * this.palette.length | 0) % this.palette.length;
        sim.vy[i] -= U.rnd(300, 900) * sc;
        sim.vx[i] += U.rnd(-160, 160) * sc;
      }
      env.fx.confetti(this.w * 0.5, this.h * 0.45, 60);
      env.audio.play('fanfare');
      if (env.say) env.say('にじいろ〜！');
    } else if (mode === 2) {
      // きらきら シャワー
      for (var k = 0; k < 40; k++) {
        this._addGlitter(U.rnd(this.w * 0.1, this.w * 0.9), U.rnd(this.h * 0.2, this.h * 0.9), 100 * sc, env);
      }
      env.fx.burst(this.w / 2, this.h / 2, 40, ['#fff6c0', '#ffd0e8', '#c0f0ff'], { maxSpeed: 420 });
      env.audio.play('sparkle', { notes: 6, freq: 1200 });
      if (env.say) env.say('きらきら〜！');
    } else {
      // ハートの あめ ＆ ぐるぐる
      for (var q = 0; q < sim.n; q++) {
        var dx = sim.x[q] - this.w / 2, dy = sim.y[q] - this.h / 2;
        sim.vx[q] += -dy * 3.0; sim.vy[q] += dx * 3.0;
      }
      for (var m = 0; m < 14; m++) env.fx.heart(U.rnd(0, this.w), this.h * 0.9, {});
      env.audio.play('chime');
      if (env.say) env.say('ぐるぐる〜！');
    }
    YA.Haptics.fire('success');
    env.addStars(1);
  };

  PbdScene.prototype.shake = function (env) {
    var sim = this.sim, sc = this.scale;
    for (var i = 0; i < sim.n; i++) {
      sim.vx[i] += U.rnd(-420, 420) * sc;
      sim.vy[i] += U.rnd(-500, 200) * sc;
    }
    env.audio.play(this.def.id === 'water' ? 'splash' : 'boing', { strength: 0.8 });
  };

  /* =========================================================
     えがく
     ========================================================= */
  PbdScene.prototype._colorFor = function (i) {
    var sim = this.sim, def = this.def;
    var base = this.palette[sim.col[i]] || this.palette[0];
    if (!def.params.useTemp) return base;
    var t = sim.temp[i];
    if (def.id === 'choco') {
      var q = Math.round(U.clamp01((t - 0.25) / 0.5) * 4) / 4;
      return U.mixHex(base, U.shade(base, 0.22), q);
    }
    if (def.id === 'jelly') {
      var c = Math.round(U.clamp01((0.5 - t) * 2) * 3) / 3;
      return U.mixHex(base, '#d8f4ff', c * 0.45);
    }
    if (def.id === 'honey') {
      var w = Math.round(U.clamp01((t - 0.4) * 2.4) * 3) / 3;
      return U.mixHex(base, '#ffe9a8', w * 0.4);
    }
    return base;
  };

  /* だい（まな板みたいな もの） */
  PbdScene.prototype._renderTray = function (ctx, env) {
    var th = this.trayH;
    if (!th) return;
    var w = this.w, h = this.h, y = h - th;
    var base = this.def.bg[1];
    ctx.save();
    ctx.fillStyle = U.shade(base, -0.14);
    ctx.fillRect(0, y, w, th);
    var g = ctx.createLinearGradient(0, y, 0, y + th);
    g.addColorStop(0, 'rgba(255,255,255,.55)');
    g.addColorStop(0.35, 'rgba(255,255,255,.12)');
    g.addColorStop(1, 'rgba(0,0,0,.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, th);
    ctx.fillStyle = U.rgba(U.shade(base, -0.32), 0.5);
    ctx.fillRect(0, y, w, Math.max(1, th * 0.10));
    ctx.restore();
  };

  PbdScene.prototype.render = function (ctx, env) {
    var sim = this.sim, st = this.style, sc = this.scale;
    this._renderTray(ctx, env);
    var n = sim.n;
    if (n === 0) return;
    var q = this.q, qs = this.qs;
    var R = sim.p.spacing * (st.rMul || 1.3);
    var core = st.core === undefined ? 0.6 : st.core;

    /* --- かげ --- */
    var sctx = this.shadCtx;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, this.shadCv.width, this.shadCv.height);
    if (st.shadow > 0) {
      var shSp = S.blob('#6a5570', R * qs * 1.35, 0.5);
      var shw = shSp.width;
      for (var s = 0; s < n; s += 3) {
        sctx.drawImage(shSp, sim.x[s] * qs - shw / 2, sim.y[s] * qs - shw / 2);
      }
    }

    /* --- ほんたい --- */
    var bctx = this.blobCtx;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, this.blobCv.width, this.blobCv.height);
    var rr = R * q;
    var lastCol = null, sprite = null, sw = 0;
    for (var i = 0; i < n; i++) {
      var col = this._colorFor(i);
      if (col !== lastCol) { sprite = S.blob(col, rr, core); sw = sprite.width; lastCol = col; }
      bctx.drawImage(sprite, sim.x[i] * q - sw / 2, sim.y[i] * q - sw / 2);
    }

    /* --- りったいかん を だす（じぶんの コピーを ずらして かさねる）
           つぶ ごとに ハイライトを うつと つぶつぶに みえるので、
           かたまり ぜんたいで しょりする --- */
    var gloss = st.gloss || 0, rim = st.rim || 0;
    if (gloss > 0 || rim > 0) {
      var BW = this.blobCv.width, BH = this.blobCv.height;
      // もとの かたちを とっておく
      var tctx = this.tmpCtx;
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, BW, BH);
      tctx.drawImage(this.blobCv, 0, 0);
      // 2だんかいで ちいさく して ぼかす（フィルタが なくても つかえる ぼかし）
      var mid = this.midCv, mctx = this.midCtx;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, mid.width, mid.height);
      mctx.imageSmoothingEnabled = true;
      mctx.drawImage(this.tmpCv, 0, 0, mid.width, mid.height);
      var blur = this.blurCv, blctx = this.blurCtx;
      blctx.setTransform(1, 0, 0, 1, 0, 0);
      blctx.clearRect(0, 0, blur.width, blur.height);
      blctx.imageSmoothingEnabled = true;
      blctx.drawImage(mid, 0, 0, blur.width, blur.height);

      // ずらす りょうは かたまりの おおきさに あわせる
      var spread = this._spread();
      var off = U.clamp(spread * q * 0.26, rr * 0.6, BW * 0.10);
      var ox = off * 0.72, oy = off;
      bctx.save();
      bctx.imageSmoothingEnabled = true;
      // ぼかした かたちを「はい いろ」に そめる
      // （そざいの いろで かけざん すると、しろい おもちが くらく ならない）
      blctx.globalCompositeOperation = 'source-in';
      blctx.fillStyle = '#8e8ba0';
      blctx.fillRect(0, 0, blur.width, blur.height);
      blctx.globalCompositeOperation = 'source-over';
      // みぎしたを くらく（うちがわの かげ）
      bctx.globalCompositeOperation = 'multiply';
      bctx.globalAlpha = 0.20 + rim * 0.24;
      bctx.drawImage(blur, ox, oy, BW, BH);
      // こんどは しろく そめて ひだりうえに ひかりを おく
      blctx.globalCompositeOperation = 'source-in';
      blctx.fillStyle = '#ffffff';
      blctx.fillRect(0, 0, blur.width, blur.height);
      blctx.globalCompositeOperation = 'source-over';
      bctx.globalCompositeOperation = 'lighter';
      bctx.globalAlpha = 0.06 + gloss * 0.17;
      bctx.drawImage(blur, -ox * 1.1, -oy * 1.1, BW, BH);
      // もとの かたちで きりぬく
      bctx.globalCompositeOperation = 'destination-in';
      bctx.globalAlpha = 1;
      bctx.drawImage(this.tmpCv, 0, 0);
      bctx.restore();
    }

    /* --- がめんへ --- */
    ctx.save();
    if (st.shadow > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = st.shadow * 0.8;
      ctx.drawImage(this.shadCv, 0, 0, this.shadCv.width, this.shadCv.height,
        -1 * sc, 11 * sc, this.w, this.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = st.alpha === undefined ? 1 : st.alpha;
    ctx.drawImage(this.blobCv, 0, 0, this.blobCv.width, this.blobCv.height, 0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
    ctx.restore();

    /* --- つや・ハイライト --- */
    this._renderGloss(ctx, env);

    /* --- きらきら --- */
    this._renderGlitter(ctx);

    /* --- かたぬきの かたち --- */
    if (this.stampObs) this._renderStamp(ctx, env);

    /* --- おかお --- */
    this._renderFaces(ctx);

    /* --- そざい こべつの えんしゅつ --- */
    if (this.def.id === 'water') this._renderWaterExtras(ctx);
    if (this.def.id === 'choco' || this.def.id === 'honey') this._renderTempHint(ctx);
  };

  /* かたまりの ひろがり（じゅうしんからの きょりの へいきん） */
  PbdScene.prototype._spread = function () {
    var sim = this.sim;
    if (sim.n === 0) return 1;
    var c = sim.centroid(this.tmp);
    var s = 0, cnt = 0;
    for (var i = 0; i < sim.n; i += 5) { s += U.dist2(sim.x[i], sim.y[i], c.x, c.y); cnt++; }
    this._cx = c.x; this._cy = c.y;
    this._sp = Math.sqrt(s / Math.max(1, cnt));
    return this._sp;
  };

  /* おおきな てかり（1つだけ おくと つやつやに みえる） */
  PbdScene.prototype._renderGloss = function (ctx, env) {
    var sim = this.sim, st = this.style, sc = this.scale;
    var gloss = st.gloss || 0;
    if (gloss < 0.3 || sim.n === 0) return;
    var c = { x: this._cx, y: this._cy };
    var spread = this._sp || this._spread();
    var r = U.clamp(spread * 0.55, 26 * sc, 150 * sc);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = gloss * 0.26;
    var big = S.shine(r, 0.5);
    ctx.drawImage(big, c.x - spread * 0.30 - big.width / 2, c.y - spread * 0.42 - big.height / 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  PbdScene.prototype._renderGlitter = function (ctx) {
    var g = this.glitter, sim = this.sim;
    if (!g.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < g.length; i++) {
      var it = g[i];
      if (it.pi >= sim.n) continue;
      var x = sim.x[it.pi] + it.ox, y = sim.y[it.pi] + it.oy;
      var tw = 0.55 + 0.45 * Math.sin(it.ph);
      var sp = S.spark(U.hsl2hex(it.hue + this.time * 40, 95, 72), it.size * (0.7 + tw * 0.6));
      ctx.globalAlpha = 0.45 + tw * 0.55;
      ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  PbdScene.prototype._renderStamp = function (ctx, env) {
    var ob = this.stampObs, sc = this.scale;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.strokeStyle = U.rgba(env.color, 0.95);
    ctx.lineWidth = 5 * sc;
    ctx.lineJoin = 'round';
    U.polyPath(ctx, ob.poly, ob.cx, ob.cy, ob.s, ob.rot);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  PbdScene.prototype._renderFaces = function (ctx) {
    var f = this.faces, sim = this.sim;
    for (var i = 0; i < f.length; i++) {
      var it = f[i];
      if (it.pi >= sim.n) continue;
      var x = sim.x[it.pi], y = sim.y[it.pi];
      var tilt = U.clamp(sim.vx[it.pi] / (900 * this.scale), -0.5, 0.5);
      it.tilt = U.lerp(it.tilt, tilt, 0.12);
      var sq = 1 + U.clamp(sim.vy[it.pi] / (2400 * this.scale), -0.2, 0.2);
      S.drawFace(ctx, x, y, it.r, it.tilt, it.type, sq);
    }
  };

  PbdScene.prototype._renderWaterExtras = function (ctx) {
    var sim = this.sim, sc = this.scale, n = sim.n;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sp = S.glow('#ffffff', 9 * sc, 0.75);
    for (var i = 0; i < n; i += 2) {
      var sp2 = sim.vx[i] * sim.vx[i] + sim.vy[i] * sim.vy[i];
      if (sp2 < 300000 * sc * sc) continue;
      ctx.globalAlpha = U.clamp(sp2 / (2200000 * sc * sc), 0, 0.65);
      ctx.drawImage(sp, sim.x[i] - sp.width / 2, sim.y[i] - sp.height / 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  PbdScene.prototype._renderTempHint = function (ctx) {
    var t = this.avgTemp, sc = this.scale;
    if (t > 0.56 || t < 0.36) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.font = (26 * sc) + 'px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(t > 0.56 ? '🔥' : '❄️', this.w - 12 * sc, 12 * sc);
      ctx.restore();
    }
  };

  YA.Scenes.pbd = { create: function (def) { return new PbdScene(def); } };

})(window);
