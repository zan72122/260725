/* ============================================================
 * gem.js — 宝石本体
 *   ・丸い透明な石からスタート
 *   ・なぞった場所に「面（ファセット）」を作る
 *   ・指の軌跡はそのまま使わず、宝石らしい角度へ自動補正する
 * ============================================================ */
(function () {
  'use strict';

  var BASE_R = 1.05;            // 画面上で保ちたい宝石の大きさ
  var MAX_CUT_VOLUME = 0.14;    // 1回で削れる体積の上限（削りすぎ防止）
  var GEM_Y = 2.24;             // 台座の上に浮かぶ高さ

  /* ---- 自動補正用の「きれいな角度」テーブル ----
   * 宝石らしい対称性（テーブル面・クラウン・ガードル・パビリオン）を並べる。
   * どこをなぞっても、いちばん近いこの方向へ吸い付く。 */
  function buildSnapDirs() {
    var bands = [
      { polar: 0, count: 1, offset: 0 },      // テーブル（てっぺんの平ら）
      { polar: 32, count: 8, offset: 0 },      // クラウン上段
      { polar: 56, count: 8, offset: 22.5 },   // クラウン下段
      { polar: 79, count: 16, offset: 0 },      // ガードル上
      { polar: 101, count: 16, offset: 11.25 }, // ガードル下
      { polar: 124, count: 8, offset: 22.5 },   // パビリオン上
      { polar: 148, count: 8, offset: 0 },      // パビリオン下
      { polar: 180, count: 1, offset: 0 }       // キューレット（底の点）
    ];
    var dirs = [];
    for (var b = 0; b < bands.length; b++) {
      var band = bands[b];
      var pol = band.polar * Math.PI / 180;
      for (var i = 0; i < band.count; i++) {
        var az = (band.offset + i * 360 / band.count) * Math.PI / 180;
        var v = new THREE.Vector3(
          Math.sin(pol) * Math.cos(az),
          Math.cos(pol),
          Math.sin(pol) * Math.sin(az)
        ).normalize();
        dirs.push({
          v: v,
          hue: (b * 0.14 + i * 0.055) % 1,
          band: b
        });
      }
    }
    return dirs;
  }

  /* ---------------- シェーダ ---------------- */

  var GEM_VS = [
    'attribute float aHue;',
    'attribute float aFlat;',
    'varying vec3 vWorld;',
    'varying vec3 vNormalW;',
    'varying vec3 vLocal;',
    'varying float vHue;',
    'varying float vFlat;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorld = wp.xyz;',
    '  vNormalW = normalize(mat3(modelMatrix) * normal);',
    '  vLocal = position;',
    '  vHue = aHue;',
    '  vFlat = aFlat;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var GEM_FS = [
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColor;',
    'uniform vec3 uGemColor;',
    'uniform float uTime;',
    'uniform float uWave;',        // 削った瞬間からの秒数（-1 で消灯）
    'uniform vec3 uWaveOrigin;',   // 削った場所（ローカル座標）
    'uniform float uPolish;',      // 0..1 磨きぐあい（面が増えるほど上がる）
    'uniform float uSide;',        // 1.0 = 表面 / -1.0 = 裏面
    'uniform float uAlpha;',
    'varying vec3 vWorld;',
    'varying vec3 vNormalW;',
    'varying vec3 vLocal;',
    'varying float vHue;',
    'varying float vFlat;',

    'vec3 hue2rgb(float h) {',
    '  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);',
    '}',

    /* 部屋のかんたんな環境色（反射・屈折の行き先の色）
       透明な宝石を「濃く」見せたいので、環境は暗めの値にしておく */
    'vec3 envSample(vec3 d) {',
    '  d = normalize(d);',
    '  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);',
    '  vec3 c = mix(vec3(0.55, 0.38, 0.27), vec3(0.58, 0.47, 0.78), smoothstep(0.28, 0.52, up));',
    '  c = mix(c, vec3(0.78, 0.86, 1.05), smoothstep(0.60, 0.95, up));',
    '  float s = max(dot(d, uSunDir), 0.0);',
    '  c += uSunColor * (pow(s, 140.0) * 3.0 + pow(s, 10.0) * 0.32);',
    '  c += 0.04 * vec3(1.0, 0.96, 0.86) * smoothstep(0.3, 1.0, sin(d.x * 9.0) * sin(d.y * 7.0));',
    '  return c;',
    '}',

    'void main() {',
    '  vec3 N = normalize(vNormalW) * uSide;',
    '  vec3 V = normalize(vWorld - cameraPosition);',
    '  float ndv = clamp(dot(N, -V), 0.0, 1.0);',
    '  float fres = 0.06 + 0.94 * pow(1.0 - ndv, 3.0);',

    '  vec3 R = reflect(V, N);',
    '  vec3 refl = envSample(R);',

    /* 分散（色によって曲がりかたを変えると虹っぽくなる） */
    '  float ior = 1.0 / 1.62;',
    '  vec3 rr = refract(V, N, ior * 0.972);',
    '  vec3 rg = refract(V, N, ior);',
    '  vec3 rb = refract(V, N, ior * 1.028);',
    '  vec3 refr = vec3(envSample(rr).r, envSample(rg).g, envSample(rb).b);',
    '  vec3 body = refr * uGemColor * 1.5 + uGemColor * 0.06;',

    /* 内部を走る光の筋 */
    '  float r = length(vLocal);',
    '  float ang = atan(vLocal.z, vLocal.x);',
    '  float rays = pow(max(0.0, sin(ang * 5.0 + uTime * 0.6 + vHue * 6.283)), 16.0);',
    '  rays *= smoothstep(0.15, 0.9, r) * (0.35 + uPolish * 0.9);',
    '  vec3 inner = hue2rgb(fract(vHue + uTime * 0.035)) * rays * 0.26;',
    '  inner += hue2rgb(fract(vHue + 0.5)) * pow(max(0.0, sin(dot(vLocal, vec3(0.5, 0.7, 0.5)) * 6.0 - uTime * 1.2)), 20.0) * 0.14;',

    /* 削った瞬間、内部を光の波が走る */
    '  float wave = 0.0;',
    '  if (uWave >= 0.0) {',
    '    float front = uWave * 3.0;',
    '    float dd = abs(distance(vLocal, uWaveOrigin) - front);',
    '    wave = exp(-dd * dd * 14.0) * exp(-uWave * 1.7);',
    '  }',

    /* 太陽の反射でピカッと光る */
    '  float sp = max(dot(R, uSunDir), 0.0);',
    '  float spark = pow(sp, 200.0) * 3.2 + pow(sp, 45.0) * 0.9 + pow(sp, 10.0) * 0.30;',
    '  spark *= mix(0.45, 1.35, vFlat);',

    /* まだ削っていない面はすりガラスのように曇っている。
       削って面が増えるほど（uPolish）曇りが晴れて、すきとおっていく。 */
    '  float frost = (1.0 - vFlat) * (1.0 - uPolish * 0.72);',

    '  vec3 col = mix(body, refl, fres);',
    '  vec3 milky = mix(uGemColor, vec3(1.0), 0.3) * (0.40 + 0.42 * ndv);',
    '  col = mix(col, milky, frost * 0.52);',
    '  float ndl = max(dot(N, uSunDir), 0.0);',
    '  col += uGemColor * uSunColor * (0.05 + 0.30 * pow(ndl, 1.6)) * mix(0.5, 1.0, vFlat);',
    '  col += vec3(1.0, 0.99, 0.96) * pow(1.0 - ndv, 4.0) * 0.26;',
    '  col *= mix(vec3(1.0), uGemColor * 1.3, 0.45);',
    '  col += inner + uSunColor * spark;',
    '  col += hue2rgb(vHue) * 0.055 * (0.4 + uPolish) * vFlat;',
    '  col += vec3(1.0, 0.97, 0.90) * wave * 1.7;',

    '  float a = clamp(0.34 + fres * 0.52 + spark * 1.6 + wave * 1.2 + frost * 0.26 + uPolish * 0.05, 0.0, 1.0) * uAlpha;',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  /* ---------------- Gem ---------------- */

  function Gem(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(0, GEM_Y, 0);
    scene.add(this.group);

    this.snapDirs = buildSnapDirs();
    this.nextId = 1;
    this.cuts = [];              // セーブ用（削った順の記録）
    this.facetCount = 0;
    this.colorIndex = 0;
    this.growAnim = 1;

    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.7).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.93, 0.72) },
      uGemColor: { value: new THREE.Color(0.72, 0.90, 1.0) },
      uTime: { value: 0 },
      uWave: { value: -1 },
      uWaveOrigin: { value: new THREE.Vector3() },
      uPolish: { value: 0 },
      uSide: { value: 1 },
      uAlpha: { value: 1 }
    };

    var backUniforms = THREE.UniformsUtils.clone(this.uniforms);
    /* 裏面用は同じ値を共有したいので、参照を差し替える */
    backUniforms.uSunDir = this.uniforms.uSunDir;
    backUniforms.uSunColor = this.uniforms.uSunColor;
    backUniforms.uGemColor = this.uniforms.uGemColor;
    backUniforms.uTime = this.uniforms.uTime;
    backUniforms.uWave = this.uniforms.uWave;
    backUniforms.uWaveOrigin = this.uniforms.uWaveOrigin;
    backUniforms.uPolish = this.uniforms.uPolish;
    backUniforms.uSide = { value: -1 };
    backUniforms.uAlpha = { value: 0.72 };
    this.backUniforms = backUniforms;

    function mat(uni, side) {
      return new THREE.ShaderMaterial({
        uniforms: uni,
        vertexShader: GEM_VS,
        fragmentShader: GEM_FS,
        transparent: true,
        depthWrite: false,
        side: side,
        blending: THREE.NormalBlending
      });
    }

    this.frontMat = mat(this.uniforms, THREE.FrontSide);
    this.backMat = mat(backUniforms, THREE.BackSide);

    this.solid = null;
    this.meshBack = null;
    this.meshFront = null;

    /* 宝石の中でまたたく星（面が増えるとふえる） */
    this.starGeo = new THREE.BufferGeometry();
    this.starMax = 30;
    this.starPos = new Float32Array(this.starMax * 3);
    this.starCol = new Float32Array(this.starMax * 3);
    this.starSize = new Float32Array(this.starMax);
    this.starPhase = new Float32Array(this.starMax);
    this.starGeo.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3));
    this.starGeo.setAttribute('aColor', new THREE.BufferAttribute(this.starCol, 3));
    this.starGeo.setAttribute('aSize', new THREE.BufferAttribute(this.starSize, 1));
    this.stars = null;
    this.starCount = 0;

    this.reset(true);
  }

  /* ---- まっさらな丸石にもどす ---- */
  Gem.prototype.reset = function (silent) {
    var solid = new ConvexSolid();
    solid.setBox(BASE_R * 1.9, { kind: 'rock', hue: 0.55 });

    /* 球に接する平面をたくさんかけて、ごつごつの丸石にする */
    var dirs = fibonacciDirs(150);
    for (var i = 0; i < dirs.length; i++) {
      var jitter = 0.94 + 0.10 * pseudoRandom(i * 7.3);
      solid.cut(dirs[i], BASE_R * jitter, { kind: 'rock', hue: 0.55 });
    }
    this.solid = solid;
    this.baseVolume = solid.volume();
    this.cuts = [];
    this.nextId = 1;
    this.facetCount = 0;
    this.growAnim = 1;
    this.group.scale.setScalar(1);
    this.rebuild();
    this.setStarCount(0);
    if (!silent) this.uniforms.uWave.value = -1;
  };

  /* ---- 実際の切り込み（あそんでいるときも、セーブの復元も、必ずここを通る） ----
   * dir   : 削る向き（すでに補正ずみ）
   * hue   : その面の色あい
   * depth : 削る深さ（ワールド単位）
   * 戻り値: 面の中心（ローカル座標）/ 削れなければ null */
  Gem.prototype._cut = function (dir, hue, depth) {
    var support = this.solid.support(dir);
    var maxR = this.solid.maxRadius();
    var vol0 = this.solid.volume();

    /* まんなかまで削り込まないように、いちばん深い位置を決めておく。
       それでも「なぞったのに何も起きない」ことがないよう、かならず少しは削る。 */
    var minD = 0.40 * maxR;
    var thinnest = support - BASE_R * 0.006;

    var applied = null, usedDepth = depth;
    for (var attempt = 0; attempt < 6; attempt++) {
      var target = support - usedDepth;
      if (target < minD) target = minD;
      if (target > thinnest) target = thinnest;
      var test = this.solid.clone();
      var tag = { kind: 'facet', id: this.nextId, hue: hue };
      if (test.cut(dir, target, tag)) {
        var vol1 = test.volume();
        if (vol1 > vol0 * (1 - MAX_CUT_VOLUME) && vol1 > 0) { applied = test; break; }
      }
      usedDepth *= 0.55;
      if (usedDepth < BASE_R * 0.004) break;
    }
    if (!applied) return null;

    this.solid = applied;
    this.nextId++;

    /* 削ったぶんの「量」をおぎなって、見た目の大きさを保つ。
       こうすると何回でも削り続けられて、石が小さくなって消えることがない。 */
    this.solid.recenter(0.4);
    var v1 = this.solid.volume();
    var grow = (v1 > 1e-6 && this.baseVolume > 0) ? Math.pow(this.baseVolume / v1, 1 / 3) : 1;
    grow = Math.max(0.8, Math.min(1.3, grow));
    this.solid.scale(grow);
    var maxR2 = this.solid.maxRadius();
    if (maxR2 > BASE_R * 1.2) {
      var shrink = BASE_R * 1.2 / maxR2;
      this.solid.scale(shrink);
      grow *= shrink;
    }
    this.growAnim = 1 / grow;

    this.rebuild();

    /* 削った面の中心（演出に使う） */
    var center = null;
    var facets = this.facetList;
    for (var i = 0; i < facets.length; i++) {
      if (facets[i].id === this.nextId - 1) { center = facets[i].center.clone(); break; }
    }
    if (!center) center = dir.clone().multiplyScalar(support - usedDepth);
    return center;
  };

  /* ---- なぞられた場所を削る ----
   * localPoint: 宝石ローカル座標の、指が触れた点
   * strength  : 0..1（なぞった長さ）
   * 戻り値: 削れたら {dir, hue, center, size} / 削れなければ null */
  Gem.prototype.carveAt = function (localPoint, strength) {
    var raw = localPoint.clone();
    if (raw.lengthSq() < 1e-6) raw.set(0, 1, 0);
    raw.normalize();

    /* --- 自動補正：いちばん近い「きれいな角度」に吸い付かせる ---
     * 同じ場所を何度もなぞったときは、限界まで削れた向きのとなりへ
     * そっとずらす。そうすると本物のカットのように面が広がっていき、
     * 石がぺちゃんこになることもない。 */
    var cands = [];
    for (var i = 0; i < this.snapDirs.length; i++) {
      cands.push({ s: this.snapDirs[i], d: raw.dot(this.snapDirs[i].v) });
    }
    cands.sort(function (a, b) { return b.d - a.d; });

    var maxR = this.solid.maxRadius();
    var room = 0.40 * maxR;              // これより内側までは削らない
    var best = cands[0].s;
    for (i = 0; i < 6 && i < cands.length; i++) {
      if (this.solid.support(cands[i].s.v) - room > BASE_R * 0.02) { best = cands[i].s; break; }
    }
    var dir = best.v.clone();

    /* --- 削る深さ：短くなぞれば小さい面、長くなぞれば大きい面 --- */
    var s = Math.max(0, Math.min(1, strength));
    var depthFrac = 0.030 + s * 0.135;
    var center = this._cut(dir, best.hue, BASE_R * depthFrac);
    if (!center) return null;

    this.cuts.push({ x: dir.x, y: dir.y, z: dir.z, h: best.hue, d: depthFrac });
    this.uniforms.uWave.value = 0;
    this.uniforms.uWaveOrigin.value.copy(center);

    return { dir: dir, hue: best.hue, center: center, size: s };
  };

  /* セーブデータから復元（あそんだときと同じ手順でなぞり直す） */
  Gem.prototype.applySavedCuts = function (cuts) {
    for (var i = 0; i < cuts.length; i++) {
      var c = cuts[i];
      var dir = new THREE.Vector3(c.x, c.y, c.z);
      if (dir.lengthSq() < 1e-8) continue;
      dir.normalize();
      if (this._cut(dir, c.h || 0, BASE_R * (c.d || 0.05))) this.cuts.push(c);
    }
    this.growAnim = 1;
    this.group.scale.setScalar(1);
    this.rebuild();
  };

  Gem.prototype.rebuild = function () {
    var geo = this.solid.buildGeometry();
    if (this.meshFront) {
      this.meshFront.geometry.dispose();
      this.meshBack.geometry.dispose();
      this.meshFront.geometry = geo;
      this.meshBack.geometry = geo;
    } else {
      this.meshBack = new THREE.Mesh(geo, this.backMat);
      this.meshBack.renderOrder = 2;
      this.meshFront = new THREE.Mesh(geo, this.frontMat);
      this.meshFront.renderOrder = 3;
      this.group.add(this.meshBack);
      this.group.add(this.meshFront);
    }
    this.facetList = this.solid.facets();
    this.facetCount = this.facetList.length;
    this.uniforms.uPolish.value = Math.min(1, this.facetCount / 26);
  };

  /* 宝石の中の星の数 */
  Gem.prototype.setStarCount = function (n) {
    n = Math.max(0, Math.min(this.starMax, n));
    if (n === this.starCount) return;
    var c = new THREE.Color();
    for (var i = this.starCount; i < n; i++) {
      var v = randomInsideGem(i);
      this.starPos[i * 3] = v.x; this.starPos[i * 3 + 1] = v.y; this.starPos[i * 3 + 2] = v.z;
      c.setHSL((i * 0.13) % 1, 0.55, 0.8);
      this.starCol[i * 3] = c.r; this.starCol[i * 3 + 1] = c.g; this.starCol[i * 3 + 2] = c.b;
      this.starPhase[i] = i * 1.7;
    }
    this.starCount = n;
    if (!this.stars && n > 0) {
      this.stars = new THREE.Points(this.starGeo, new THREE.ShaderMaterial({
        uniforms: { uMap: { value: TEX.star() }, uScale: { value: 600 } },
        vertexShader: [
          'attribute vec3 aColor;', 'attribute float aSize;', 'uniform float uScale;',
          'varying vec3 vColor;',
          'void main() {',
          '  vColor = aColor;',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z));',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D uMap;', 'varying vec3 vColor;',
          'void main() {',
          '  vec4 t = texture2D(uMap, gl_PointCoord);',
          '  gl_FragColor = vec4(vColor, 1.0) * t;',
          '  if (gl_FragColor.a < 0.01) discard;',
          '}'
        ].join('\n'),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
      }));
      this.stars.frustumCulled = false;
      this.stars.renderOrder = 4;
      this.group.add(this.stars);
    }
    if (this.stars) this.starGeo.setDrawRange(0, this.starCount);
    this.starGeo.attributes.position.needsUpdate = true;
    this.starGeo.attributes.aColor.needsUpdate = true;
  };

  var GEM_COLORS = [
    { name: 'そら', c: [0.72, 0.90, 1.00] },
    { name: 'ばら', c: [1.00, 0.72, 0.86] },
    { name: 'みどり', c: [0.74, 1.00, 0.82] },
    { name: 'すみれ', c: [0.84, 0.76, 1.00] },
    { name: 'たいよう', c: [1.00, 0.90, 0.66] },
    { name: 'うみ', c: [0.66, 0.96, 0.96] },
    { name: 'ゆき', c: [0.96, 0.96, 1.00] }
  ];

  Gem.prototype.setColor = function (idx) {
    this.colorIndex = ((idx % GEM_COLORS.length) + GEM_COLORS.length) % GEM_COLORS.length;
    var c = GEM_COLORS[this.colorIndex].c;
    this.uniforms.uGemColor.value.setRGB(c[0], c[1], c[2]);
  };

  Gem.prototype.update = function (dt, time) {
    this.uniforms.uTime.value = time;
    if (this.uniforms.uWave.value >= 0) {
      this.uniforms.uWave.value += dt;
      if (this.uniforms.uWave.value > 2.2) this.uniforms.uWave.value = -1;
    }
    /* 削った直後だけ、ふわっと大きさをもどす */
    if (Math.abs(this.growAnim - 1) > 0.0005) {
      this.growAnim += (1 - this.growAnim) * Math.min(1, dt * 7);
      this.group.scale.setScalar(this.growAnim);
    } else if (this.group.scale.x !== 1) {
      this.growAnim = 1;
      this.group.scale.setScalar(1);
    }
    /* 中の星をまたたかせる */
    if (this.stars && this.starCount > 0) {
      for (var i = 0; i < this.starCount; i++) {
        this.starSize[i] = 0.045 + 0.05 * (0.5 + 0.5 * Math.sin(time * 2.4 + this.starPhase[i]));
      }
      this.starGeo.attributes.aSize.needsUpdate = true;
    }
  };

  /* ローカル座標 → ワールド座標のファセット情報（光の模様を作るのに使う） */
  Gem.prototype.worldFacets = function () {
    var out = [];
    var m = this.group.matrixWorld;
    var nm = new THREE.Matrix3().getNormalMatrix(m);
    for (var i = 0; i < this.facetList.length; i++) {
      var f = this.facetList[i];
      out.push({
        id: f.id,
        hue: f.hue,
        area: f.area,
        center: f.center.clone().applyMatrix4(m),
        normal: f.normal.clone().applyMatrix3(nm).normalize()
      });
    }
    return out;
  };

  /* ---------------- ヘルパー ---------------- */

  function pseudoRandom(x) {
    var s = Math.sin(x * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  function fibonacciDirs(n) {
    var dirs = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = ga * i;
      dirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize());
    }
    return dirs;
  }

  function randomInsideGem(i) {
    var a = pseudoRandom(i * 3.1) * Math.PI * 2;
    var b = Math.acos(pseudoRandom(i * 5.7) * 2 - 1);
    var r = 0.25 + pseudoRandom(i * 9.2) * 0.5;
    return new THREE.Vector3(
      Math.sin(b) * Math.cos(a) * r,
      Math.cos(b) * r,
      Math.sin(b) * Math.sin(a) * r
    );
  }

  Gem.COLORS = GEM_COLORS;
  Gem.BASE_R = BASE_R;
  Gem.GEM_Y = GEM_Y;
  window.Gem = Gem;
})();
