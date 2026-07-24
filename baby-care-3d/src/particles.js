/* ============================================================
 * particles.js — FX: 絵文字スプライトのパーティクル演出
 * ハート/星/泡/紙吹雪/音符/Zzz/キラキラ/しずく/たべかす
 * ============================================================ */
(function () {
  'use strict';

  var scene = null;
  var particles = [];
  var texCache = {};

  function emojiTexture(emoji, size) {
    var key = emoji + '_' + size;
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = Math.floor(size * 0.82) + 'px sans-serif';
    g.fillText(emoji, size / 2, size / 2 + size * 0.04);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    texCache[key] = tex;
    return tex;
  }

  function circleTexture(color, size) {
    var key = 'c_' + color + '_' + size;
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
    g.fill();
    var tex = new THREE.CanvasTexture(c);
    texCache[key] = tex;
    return tex;
  }

  function rectTexture(color, size) {
    var key = 'r_' + color + '_' + size;
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(size * 0.15, size * 0.3, size * 0.7, size * 0.4);
    var tex = new THREE.CanvasTexture(c);
    texCache[key] = tex;
    return tex;
  }

  function spawn(tex, pos, opt) {
    opt = opt || {};
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    var sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    var s = opt.scale || 0.2;
    sp.scale.set(s, s, 1);
    scene.add(sp);
    particles.push({
      sprite: sp,
      vel: opt.vel || new THREE.Vector3(0, 0.5, 0),
      gravity: opt.gravity != null ? opt.gravity : 0,
      drag: opt.drag != null ? opt.drag : 0,
      life: 0,
      maxLife: opt.life || 1.2,
      scale0: s,
      scale1: opt.scaleEnd != null ? opt.scaleEnd : s,
      spin: opt.spin || 0,
      wobble: opt.wobble || 0,
      wobbleSpeed: 3 + Math.random() * 3,
      wobblePhase: Math.random() * Math.PI * 2,
      fadeIn: opt.fadeIn || 0
    });
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function rndVel(spread, up) {
    return new THREE.Vector3(rnd(-spread, spread), up + rnd(-spread * 0.4, spread * 0.4), rnd(-spread, spread));
  }

  var CONFETTI_COLORS = ['#ff6fa5', '#ffd44d', '#7fd8ff', '#9dff8a', '#c9a6ff', '#ffab6b'];

  var BURSTS = {
    hearts: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture('💗', 64), jitter(pos, 0.15), {
          vel: rndVel(0.4, 0.9), gravity: -0.25, scale: rnd(0.14, 0.26), scaleEnd: 0.06,
          life: rnd(0.9, 1.5), wobble: 0.15
        });
      }
    },
    stars: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture('⭐', 64), jitter(pos, 0.1), {
          vel: rndVel(1.1, 1.2), gravity: 2.2, scale: rnd(0.15, 0.3), scaleEnd: 0.05,
          life: rnd(0.8, 1.3), spin: rnd(-4, 4)
        });
      }
    },
    sparkle: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture('✨', 64), jitter(pos, 0.22), {
          vel: rndVel(0.25, 0.35), scale: rnd(0.12, 0.24), scaleEnd: 0.02,
          life: rnd(0.5, 1.0), wobble: 0.1
        });
      }
    },
    bubbles: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture('🫧', 64), jitter(pos, 0.2), {
          vel: new THREE.Vector3(rnd(-0.15, 0.15), rnd(0.4, 0.9), rnd(-0.1, 0.1)),
          scale: rnd(0.1, 0.28), scaleEnd: rnd(0.15, 0.35),
          life: rnd(1.2, 2.2), wobble: 0.25
        });
      }
    },
    foam: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(circleTexture('rgba(255,255,255,0.9)', 64), jitter(pos, 0.16), {
          vel: rndVel(0.2, 0.3), scale: rnd(0.08, 0.2), scaleEnd: 0.02,
          life: rnd(0.6, 1.2), wobble: 0.12
        });
      }
    },
    drops: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture('💧', 64), jitter(pos, 0.25), {
          vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.6, -0.2), rnd(-0.2, 0.2)),
          gravity: 2.6, scale: rnd(0.08, 0.16), life: rnd(0.5, 0.9)
        });
      }
    },
    confetti: function (pos, n) {
      for (var i = 0; i < n; i++) {
        var col = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        spawn(rectTexture(col, 32), jitter(pos, 0.3), {
          vel: rndVel(1.6, 2.2), gravity: 3.2, drag: 0.9,
          scale: rnd(0.08, 0.16), life: rnd(1.2, 2.0), spin: rnd(-8, 8), wobble: 0.3
        });
      }
    },
    notes: function (pos, n) {
      var notes = ['🎵', '🎶'];
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture(notes[i % 2], 64), jitter(pos, 0.2), {
          vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.35, 0.6), 0),
          scale: rnd(0.14, 0.24), scaleEnd: 0.05, life: rnd(1.2, 1.8), wobble: 0.2
        });
      }
    },
    zzz: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture('💤', 64), jitter(pos, 0.08), {
          vel: new THREE.Vector3(rnd(0.1, 0.25), rnd(0.25, 0.4), 0),
          scale: 0.1, scaleEnd: 0.3, life: rnd(1.6, 2.2), wobble: 0.2, fadeIn: 0.2
        });
      }
    },
    crumbs: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(circleTexture('#e8a95b', 32), jitter(pos, 0.08), {
          vel: rndVel(0.7, 0.5), gravity: 3.0, scale: rnd(0.04, 0.09), life: rnd(0.4, 0.8)
        });
      }
    },
    smoke: function (pos, n) {
      for (var i = 0; i < n; i++) {
        spawn(circleTexture('rgba(255,255,255,0.5)', 64), jitter(pos, 0.1), {
          vel: rndVel(0.3, 0.6), scale: rnd(0.1, 0.2), scaleEnd: rnd(0.4, 0.6),
          life: rnd(0.5, 0.9)
        });
      }
    },
    rainbow: function (pos, n) {
      var em = ['🌈', '⭐', '✨', '💛', '💙', '💜'];
      for (var i = 0; i < n; i++) {
        spawn(emojiTexture(em[i % em.length], 64), jitter(pos, 0.3), {
          vel: rndVel(1.4, 1.8), gravity: 2.0, scale: rnd(0.16, 0.3), scaleEnd: 0.08,
          life: rnd(1.0, 1.8), spin: rnd(-5, 5)
        });
      }
    }
  };

  function jitter(pos, amt) {
    return new THREE.Vector3(
      pos.x + rnd(-amt, amt),
      pos.y + rnd(-amt, amt),
      pos.z + rnd(-amt, amt)
    );
  }

  window.FX = {
    init: function (s) { scene = s; },
    emojiTexture: emojiTexture,
    burst: function (type, pos, n) {
      if (!scene || !BURSTS[type]) return;
      BURSTS[type](pos, n || 8);
    },
    update: function (dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          scene.remove(p.sprite);
          p.sprite.material.dispose();
          particles.splice(i, 1);
          continue;
        }
        var t = p.life / p.maxLife;
        p.vel.y -= p.gravity * dt;
        if (p.drag) {
          var d = Math.max(0, 1 - p.drag * dt);
          p.vel.x *= d; p.vel.z *= d;
        }
        p.sprite.position.x += p.vel.x * dt + Math.sin(p.life * p.wobbleSpeed + p.wobblePhase) * p.wobble * dt;
        p.sprite.position.y += p.vel.y * dt;
        p.sprite.position.z += p.vel.z * dt;
        var s = p.scale0 + (p.scale1 - p.scale0) * t;
        p.sprite.scale.set(s, s, 1);
        if (p.spin) p.sprite.material.rotation += p.spin * dt;
        var op = 1;
        if (p.fadeIn > 0 && p.life < p.fadeIn) op = p.life / p.fadeIn;
        if (t > 0.7) op = Math.min(op, (1 - t) / 0.3);
        p.sprite.material.opacity = op;
      }
    },
    clear: function () {
      for (var i = 0; i < particles.length; i++) {
        scene.remove(particles[i].sprite);
        particles[i].sprite.material.dispose();
      }
      particles = [];
    }
  };
})();
