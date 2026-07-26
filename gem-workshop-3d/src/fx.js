/* ============================================================
 * fx.js — テクスチャ生成とパーティクル（火花・虹のかけら・空気のキラキラ）
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- Canvasテクスチャ ---------------- */

  function canvasTex(size, draw) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d');
    draw(g, size);
    var t = new THREE.CanvasTexture(cv);
    t.needsUpdate = true;
    return t;
  }

  var cache = {};

  var TEX = {
    glow: function () {
      if (cache.glow) return cache.glow;
      cache.glow = canvasTex(128, function (g, s) {
        var r = s / 2;
        var grd = g.createRadialGradient(r, r, 0, r, r, r);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
        grd.addColorStop(0.6, 'rgba(255,255,255,0.13)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      });
      return cache.glow;
    },

    /* 4方向にのびるキラーン形 */
    star: function () {
      if (cache.star) return cache.star;
      cache.star = canvasTex(128, function (g, s) {
        var r = s / 2;
        var grd = g.createRadialGradient(r, r, 0, r, r, r * 0.42);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineCap = 'round';
        for (var i = 0; i < 4; i++) {
          var a = i * Math.PI / 4;
          var len = (i % 2 === 0) ? r * 0.96 : r * 0.5;
          g.lineWidth = (i % 2 === 0) ? 5 : 2.5;
          g.beginPath();
          g.moveTo(r - Math.cos(a) * len, r - Math.sin(a) * len);
          g.lineTo(r + Math.cos(a) * len, r + Math.sin(a) * len);
          g.stroke();
        }
      });
      return cache.star;
    },

    /* 壁に映る光の斑点（中心が白く、ふちが虹色ににじむ） */
    caustic: function () {
      if (cache.caustic) return cache.caustic;
      cache.caustic = canvasTex(128, function (g, s) {
        var r = s / 2;
        var grd = g.createRadialGradient(r, r, 0, r, r, r);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.2, 'rgba(255,255,255,0.72)');
        grd.addColorStop(0.42, 'rgba(255,255,255,0.3)');
        grd.addColorStop(0.75, 'rgba(255,255,255,0.08)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      });
      return cache.caustic;
    },

    /* 虹のアーチ */
    rainbow: function () {
      if (cache.rainbow) return cache.rainbow;
      cache.rainbow = canvasTex(256, function (g, s) {
        var cx = s / 2, cy = s * 0.95;
        var cols = ['#ff4d6d', '#ff9f43', '#ffe66d', '#6bd47a', '#4dc3ff', '#7b8cff', '#c77bff'];
        g.lineCap = 'butt';
        for (var i = 0; i < cols.length; i++) {
          g.strokeStyle = cols[i];
          g.globalAlpha = 0.55;
          g.lineWidth = s * 0.035;
          g.beginPath();
          g.arc(cx, cy, s * 0.42 - i * s * 0.035, Math.PI, Math.PI * 2);
          g.stroke();
        }
        g.globalAlpha = 1;
        /* ふちをぼかす */
        var grd = g.createRadialGradient(cx, cy, s * 0.16, cx, cy, s * 0.48);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(0.7, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(0,0,0,1)');
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
        g.globalCompositeOperation = 'source-over';
      });
      return cache.rainbow;
    },

    /* にこにこ太陽 */
    sun: function () {
      if (cache.sun) return cache.sun;
      cache.sun = canvasTex(256, function (g, s) {
        var c = s / 2;
        var grd = g.createRadialGradient(c, c, s * 0.1, c, c, c);
        grd.addColorStop(0, 'rgba(255,255,235,1)');
        grd.addColorStop(0.32, 'rgba(255,226,120,0.95)');
        grd.addColorStop(0.55, 'rgba(255,190,80,0.35)');
        grd.addColorStop(1, 'rgba(255,170,60,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
        /* 光条 */
        g.strokeStyle = 'rgba(255,214,110,0.85)'; g.lineCap = 'round';
        for (var i = 0; i < 12; i++) {
          var a = i * Math.PI / 6;
          g.lineWidth = (i % 2 ? 5 : 8);
          g.beginPath();
          g.moveTo(c + Math.cos(a) * s * 0.3, c + Math.sin(a) * s * 0.3);
          g.lineTo(c + Math.cos(a) * s * (i % 2 ? 0.4 : 0.45), c + Math.sin(a) * s * (i % 2 ? 0.4 : 0.45));
          g.stroke();
        }
        /* 本体 */
        g.fillStyle = '#ffe27a';
        g.beginPath(); g.arc(c, c, s * 0.26, 0, Math.PI * 2); g.fill();
        /* かお */
        g.fillStyle = '#c8873c';
        g.beginPath(); g.arc(c - s * 0.09, c - s * 0.04, s * 0.022, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(c + s * 0.09, c - s * 0.04, s * 0.022, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#c8873c'; g.lineWidth = s * 0.018;
        g.beginPath(); g.arc(c, c + s * 0.02, s * 0.09, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
        g.fillStyle = 'rgba(255,140,140,0.5)';
        g.beginPath(); g.arc(c - s * 0.15, c + s * 0.04, s * 0.032, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(c + s * 0.15, c + s * 0.04, s * 0.032, 0, Math.PI * 2); g.fill();
      });
      return cache.sun;
    },

    /* ちょうちょの片羽（虹グラデーション） */
    wing: function () {
      if (cache.wing) return cache.wing;
      cache.wing = canvasTex(128, function (g, s) {
        g.clearRect(0, 0, s, s);
        var grd = g.createLinearGradient(0, s, s, 0);
        grd.addColorStop(0, '#ff7ab8');
        grd.addColorStop(0.3, '#ffd166');
        grd.addColorStop(0.6, '#6ee7c8');
        grd.addColorStop(1, '#8ab6ff');
        g.fillStyle = grd;
        /* 上下2枚の羽っぽいシルエット */
        g.beginPath();
        g.moveTo(s * 0.05, s * 0.5);
        g.bezierCurveTo(s * 0.1, s * 0.02, s * 0.95, s * 0.05, s * 0.92, s * 0.42);
        g.bezierCurveTo(s * 0.9, s * 0.66, s * 0.45, s * 0.62, s * 0.05, s * 0.5);
        g.closePath(); g.fill();
        g.beginPath();
        g.moveTo(s * 0.07, s * 0.54);
        g.bezierCurveTo(s * 0.35, s * 0.62, s * 0.78, s * 0.72, s * 0.66, s * 0.97);
        g.bezierCurveTo(s * 0.4, s * 1.0, s * 0.08, s * 0.8, s * 0.07, s * 0.54);
        g.closePath(); g.fill();
        /* 模様 */
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.beginPath(); g.arc(s * 0.62, s * 0.3, s * 0.075, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(s * 0.44, s * 0.78, s * 0.05, 0, Math.PI * 2); g.fill();
      });
      return cache.wing;
    }
  };

  /* ---------------- パーティクル ---------------- */

  var MAX = 700;
  var scene = null, points = null, geo = null;
  var pos, col, siz;
  var P = [];   // {x,y,z, vx,vy,vz, life, max, size, r,g,b, grav, drag}
  var ambient = null, ambGeo = null, ambBase = null, ambPhase = null, ambLevel = 0;
  var pixelScale = { value: 600 };

  function hsl(h, s, l) {
    var c = new THREE.Color();
    c.setHSL(h, s, l);
    return c;
  }

  /* 粒ごとに大きさを変えたいので、点の描画は自前シェーダで行う */
  var POINT_VS = [
    'attribute vec3 aColor;',
    'attribute float aSize;',
    'uniform float uScale;',
    'varying vec3 vColor;',
    'void main() {',
    '  vColor = aColor;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var POINT_FS = [
    'uniform sampler2D uMap;',
    'varying vec3 vColor;',
    'void main() {',
    '  vec4 t = texture2D(uMap, gl_PointCoord);',
    '  gl_FragColor = vec4(vColor, 1.0) * t;',
    '  if (gl_FragColor.a < 0.01) discard;',
    '}'
  ].join('\n');

  function pointMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uMap: { value: TEX.star() }, uScale: pixelScale },
      vertexShader: POINT_VS,
      fragmentShader: POINT_FS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }

  var FX = {
    init: function (sc) {
      scene = sc;
      pos = new Float32Array(MAX * 3);
      col = new Float32Array(MAX * 3);
      siz = new Float32Array(MAX);
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
      points = new THREE.Points(geo, pointMaterial());
      points.frustumCulled = false;
      points.renderOrder = 6;
      scene.add(points);

      for (var i = 0; i < MAX; i++) P.push({ life: 0 });

      /* 空気中のキラキラ（部屋全体のごほうび演出で増える） */
      var N = 260;
      ambBase = new Float32Array(N * 3);
      ambPhase = new Float32Array(N);
      var ap = new Float32Array(N * 3), ac = new Float32Array(N * 3), asz = new Float32Array(N);
      for (i = 0; i < N; i++) {
        ambBase[i * 3] = (Math.random() - 0.5) * 8.5;
        ambBase[i * 3 + 1] = Math.random() * 4.2 + 0.15;
        ambBase[i * 3 + 2] = (Math.random() - 0.5) * 6.0 - 0.3;
        ambPhase[i] = Math.random() * Math.PI * 2;
        var c = hsl(Math.random(), 0.6, 0.75);
        ac[i * 3] = c.r; ac[i * 3 + 1] = c.g; ac[i * 3 + 2] = c.b;
        asz[i] = 0.0;
      }
      ap.set(ambBase);
      ambGeo = new THREE.BufferGeometry();
      ambGeo.setAttribute('position', new THREE.BufferAttribute(ap, 3));
      ambGeo.setAttribute('aColor', new THREE.BufferAttribute(ac, 3));
      ambGeo.setAttribute('aSize', new THREE.BufferAttribute(asz, 1));
      ambient = new THREE.Points(ambGeo, pointMaterial());
      ambient.frustumCulled = false;
      ambient.renderOrder = 5;
      scene.add(ambient);
    },

    setAmbient: function (level) { ambLevel = Math.max(0, Math.min(1, level)); },

    /* 画面の高さと画角から、点の大きさのスケールを決める */
    setViewport: function (heightPx, fovRad) {
      pixelScale.value = heightPx * 0.5 / Math.tan(fovRad * 0.5);
    },

    spawn: function (o) {
      for (var i = 0; i < MAX; i++) {
        var p = P[i];
        if (p.life > 0) continue;
        p.x = o.x; p.y = o.y; p.z = o.z;
        p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
        p.max = p.life = o.life;
        p.size = o.size;
        p.r = o.r; p.g = o.g; p.b = o.b;
        p.grav = o.grav != null ? o.grav : -1.6;
        p.drag = o.drag != null ? o.drag : 1.2;
        return;
      }
    },

    /* 削るときの火花 */
    sparks: function (p, n, hue) {
      for (var i = 0; i < n; i++) {
        var c = hsl((hue + Math.random() * 0.12) % 1, 0.55, 0.78);
        var sp = 0.7 + Math.random() * 1.7;
        FX.spawn({
          x: p.x, y: p.y, z: p.z,
          vx: (Math.random() - 0.5) * sp, vy: Math.random() * sp * 0.9 + 0.2, vz: (Math.random() - 0.5) * sp,
          life: 0.45 + Math.random() * 0.5, size: 0.06 + Math.random() * 0.10,
          r: c.r, g: c.g, b: c.b, grav: -2.2, drag: 1.8
        });
      }
    },

    /* 虹のかけらがふわっと舞う */
    rainbowBurst: function (p, n) {
      for (var i = 0; i < n; i++) {
        var c = hsl(i / n, 0.75, 0.68);
        var a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI;
        var sp = 0.6 + Math.random() * 1.4;
        FX.spawn({
          x: p.x, y: p.y, z: p.z,
          vx: Math.cos(a) * Math.sin(e) * sp, vy: Math.cos(e) * sp * 0.8 + 0.7, vz: Math.sin(a) * Math.sin(e) * sp,
          life: 1.0 + Math.random() * 1.0, size: 0.10 + Math.random() * 0.14,
          r: c.r, g: c.g, b: c.b, grav: -0.35, drag: 0.7
        });
      }
    },

    sparkle: function (p, n, hue) {
      for (var i = 0; i < n; i++) {
        var c = hsl(hue != null ? (hue + Math.random() * 0.1) % 1 : Math.random(), 0.5, 0.85);
        FX.spawn({
          x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + (Math.random() - 0.5) * 0.5, z: p.z + (Math.random() - 0.5) * 0.5,
          vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.5,
          life: 0.6 + Math.random() * 0.7, size: 0.08 + Math.random() * 0.12,
          r: c.r, g: c.g, b: c.b, grav: -0.2, drag: 1.0
        });
      }
    },

    update: function (dt, time) {
      var n = 0;
      for (var i = 0; i < MAX; i++) {
        var p = P[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        var k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; }
        var t = p.life / p.max;
        var fade = t > 0.7 ? (1 - t) / 0.3 : t / 0.7;
        pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
        col[n * 3] = p.r * fade; col[n * 3 + 1] = p.g * fade; col[n * 3 + 2] = p.b * fade;
        siz[n] = p.size * (0.55 + fade * 0.75);
        n++;
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;

      /* 空気のキラキラ：ゆっくり漂ってチカチカ */
      if (ambient) {
        var ap = ambGeo.attributes.position.array;
        var asz = ambGeo.attributes.aSize.array;
        var count = ambBase.length / 3;
        var active = Math.floor(count * ambLevel);
        for (i = 0; i < count; i++) {
          var ph = ambPhase[i];
          ap[i * 3] = ambBase[i * 3] + Math.sin(time * 0.3 + ph) * 0.25;
          ap[i * 3 + 1] = ambBase[i * 3 + 1] + Math.sin(time * 0.45 + ph * 1.7) * 0.3;
          ap[i * 3 + 2] = ambBase[i * 3 + 2] + Math.cos(time * 0.35 + ph) * 0.25;
          var tw = 0.5 + 0.5 * Math.sin(time * 2.2 + ph * 3.1);
          asz[i] = i < active ? (0.05 + tw * 0.13) : 0;
        }
        ambGeo.attributes.position.needsUpdate = true;
        ambGeo.attributes.aSize.needsUpdate = true;
      }
    }
  };

  window.FX = FX;
  window.TEX = TEX;
})();
