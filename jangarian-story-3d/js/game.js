/* ===== じゃんがりあん ものがたり : ゲームほんたい ===== */
(function () {
  var U = JG.U, S = JG.Sound, FX = JG.FX;

  // ---------------- 基本セットアップ ----------------
  var app = document.getElementById('app');
  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd9ff);
  scene.fog = new THREE.Fog(0xbfe8ff, 42, 95);

  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

  var hemi = new THREE.HemisphereLight(0xbfe8ff, 0x88b86a, 0.95);
  scene.add(hemi);
  var dir = new THREE.DirectionalLight(0xfff2d8, 0.9);
  dir.position.set(14, 24, 10);
  scene.add(dir);

  // ---------------- せかい・エフェクト ----------------
  var world = JG.World.create(scene);

  var fx = {
    sparkle: new FX.Psys(scene, { count: 160, tex: FX.circleTex(), size: 0.55, additive: true, gravity: -2, drag: 1.5 }),
    star:    new FX.Psys(scene, { count: 120, tex: FX.starTex(),   size: 0.8,  additive: true, gravity: -3, drag: 0.8 }),
    heart:   new FX.Psys(scene, { count: 60,  tex: FX.heartTex(),  size: 0.65, additive: false, gravity: 2.2, drag: 1.2 }),
    confetti:new FX.Psys(scene, { count: 200, tex: FX.squareTex(), size: 0.38, additive: false, gravity: -5, drag: 0.9 }),
    petal:   new FX.Psys(scene, { count: 90,  tex: FX.petalTex(),  size: 0.5,  additive: false, gravity: -1.6, drag: 1.4 }),
    splash:  new FX.Psys(scene, { count: 90,  tex: FX.circleTex(), size: 0.45, additive: true, gravity: -10, drag: 0.4 }),
    trail:   new FX.Psys(scene, { count: 120, tex: FX.circleTex(), size: 0.35, additive: true, gravity: 0.5, drag: 1.5 })
  };

  var HEART_COLORS = [[1, 0.45, 0.6], [1, 0.6, 0.75]];
  var CONFETTI_COLORS = [[1, 0.35, 0.55], [1, 0.85, 0.25], [0.4, 0.8, 1], [0.55, 0.85, 0.4], [0.8, 0.55, 1], [1, 0.62, 0.25]];
  var SPARKLE_GOLD = [[1, 0.95, 0.55], [1, 0.85, 0.35], [1, 1, 0.85]];

  // ---------------- プレイヤー ----------------
  var player = JG.Hamster.create({});
  scene.add(player.group);
  player.group.position.set(0, 0, 4);

  var P = {
    x: 0, z: 4, y: 0, vy: 0,
    yaw: 0,
    speed: 0,
    dash: 0,          // りんごダッシュのこり時間
    inPond: false,
    splashTimer: 0,
    grounded: true
  };

  // かげ
  function makeShadow(r) {
    var m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 20),
      new THREE.MeshBasicMaterial({ color: 0x1a3a1a, transparent: true, opacity: 0.22, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    scene.add(m);
    return m;
  }
  var playerShadow = makeShadow(0.72);
  var ballShadow = makeShadow(0.8);

  // ---------------- おともだち ----------------
  var FRIEND_DEFS = [
    { bodyColor: 0xe8c87a, bellyColor: 0xfff7e0, earColor: 0xd0a850, stripe: false }, // ぷりん
    { bodyColor: 0xf2f2ec, bellyColor: 0xffffff, earColor: 0xd8d8d0, stripe: false }, // ゆき
    { bodyColor: 0x9fb4c7, bellyColor: 0xeef4f8, earColor: 0x7a92a8, stripe: true }   // そら
  ];
  var friends = [];
  for (var fi = 0; fi < FRIEND_DEFS.length; fi++) {
    var fdef = FRIEND_DEFS[fi];
    fdef.scale = 0.88;
    var fh = JG.Hamster.create(fdef);
    var fa = (fi / 3) * Math.PI * 2 + 1;
    fh.group.position.set(Math.cos(fa) * 8, 0, Math.sin(fa) * 8);
    scene.add(fh.group);
    var hit = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 6, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = 0.7;
    fh.group.add(hit);
    var fr = {
      h: fh, x: fh.group.position.x, z: fh.group.position.z,
      yaw: fa, mode: 'wander',
      tx: 0, tz: 0, retarget: 0,
      follow: 0, greetCool: 0,
      followOff: [[-2.0, -1.4], [2.0, -1.4], [0, -2.8]][fi],
      shadow: makeShadow(0.6),
      speed01: 0
    };
    hit.userData.type = 'friend';
    hit.userData.ref = fr;
    friends.push(fr);
  }

  // ---------------- ちょうちょ ----------------
  var butterflies = [];
  var BUTTERFLY_COLORS = [0xffd24d, 0xff8bb8, 0x8ad4ff, 0xc79aff];
  for (var bi = 0; bi < 4; bi++) {
    butterflies.push(new FX.Butterfly(scene, BUTTERFLY_COLORS[bi]));
  }

  // ---------------- たね ----------------
  var seeds = [];
  function makeSeedMesh() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x5a4632 })
    );
    body.scale.set(0.72, 1.05, 0.45);
    g.add(body);
    var tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xf2e2b8 })
    );
    tip.position.y = 0.26;
    g.add(tip);
    var stripe = new THREE.Mesh(
      new THREE.SphereGeometry(0.305, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xf2e2b8 })
    );
    stripe.scale.set(0.2, 1.02, 0.4);
    g.add(stripe);
    return g;
  }
  function seedSpot() {
    for (var tries = 0; tries < 30; tries++) {
      var a = Math.random() * Math.PI * 2;
      var r = U.rand(3, 26.5);
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (U.dist2d(x, z, world.pond.x, world.pond.z) < world.pond.r + 1) continue;
      var ok = true;
      for (var oi = 0; oi < world.obstacles.length; oi++) {
        var ob = world.obstacles[oi];
        if (U.dist2d(x, z, ob.x, ob.z) < ob.r + 0.8) { ok = false; break; }
      }
      if (ok) return { x: x, z: z };
    }
    return { x: U.rand(-8, 8), z: U.rand(-8, 8) };
  }
  for (var si = 0; si < 10; si++) {
    var sm = makeSeedMesh();
    var spot = seedSpot();
    sm.position.set(spot.x, 0.42, spot.z);
    scene.add(sm);
    seeds.push({ mesh: sm, active: true, respawn: 0, phase: Math.random() * 10 });
  }
  // ちかくのたねをキラッとさせるタイマー
  var seedSparkleTimer = 0;

  // ---------------- じょうたい ----------------
  var state = {
    started: false,
    seeds: 0,        // ぜんぶで あつめた かず
    stored: 0,       // おうちの たくわえ
    level: 1,
    hatIndex: 0,
    unlockedHats: 1,
    night: false,
    pouch: 0,        // ほっぺの たね (さいだい6)
    nightFactor: 0
  };

  // セーブ・ロード
  function save() {
    try {
      localStorage.setItem('jangarian-save', JSON.stringify({
        sd: state.seeds, st: state.stored, hat: state.hatIndex,
        uh: state.unlockedHats, ni: state.night ? 1 : 0
      }));
    } catch (e) { /* プライベートモードなどでは保存なし */ }
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem('jangarian-save'));
      if (!d) return;
      state.seeds = d.sd || 0;
      state.stored = d.st || 0;
      state.unlockedHats = Math.max(1, d.uh || 1);
      state.hatIndex = Math.min(d.hat || 0, state.unlockedHats - 1);
      state.night = !!d.ni;
      state.nightFactor = state.night ? 1 : 0;
      state.level = Math.floor(state.stored / 10) + 1;
    } catch (e) { /* こわれたセーブはむし */ }
  }
  load();
  player.setHat(state.hatIndex);
  world.updateSign(state.stored);

  // ---------------- UI ----------------
  var el = {
    hud: document.getElementById('hud'),
    controls: document.getElementById('controls'),
    banner: document.getElementById('banner'),
    bigMsg: document.getElementById('big-msg'),
    toast: document.getElementById('toast'),
    seedCount: document.getElementById('seed-count'),
    storedCount: document.getElementById('stored-count'),
    levelNum: document.getElementById('level-num'),
    pouchDots: document.querySelectorAll('#pouch-dots .pdot'),
    chipSeeds: document.getElementById('chip-seeds'),
    chipStored: document.getElementById('chip-stored'),
    chipLevel: document.getElementById('chip-level'),
    chipPouch: document.getElementById('chip-pouch'),
    gaugeWrap: document.getElementById('gauge-wrap'),
    gaugeFill: document.getElementById('gauge-fill'),
    titleScreen: document.getElementById('title-screen'),
    btnStart: document.getElementById('btn-start'),
    btnJump: document.getElementById('btn-jump'),
    btnHat: document.getElementById('btn-hat'),
    btnHide: document.getElementById('btn-hide'),
    btnCall: document.getElementById('btn-call'),
    tapHint: document.getElementById('tap-hint'),
    btnSound: document.getElementById('btn-sound'),
    btnDayNight: document.getElementById('btn-daynight')
  };

  function bump(chip) {
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }

  function syncHUD() {
    el.seedCount.textContent = state.seeds;
    el.storedCount.textContent = state.stored;
    el.levelNum.textContent = state.level;
    for (var i = 0; i < el.pouchDots.length; i++) {
      el.pouchDots[i].classList.toggle('full', i < state.pouch);
    }
    el.btnDayNight.textContent = state.night ? '☀️' : '🌙';
    el.btnSound.textContent = S.isMuted() ? '🔇' : '🎵';
  }

  var bannerTimer = 0;
  function showBanner(text, dur) {
    el.banner.textContent = text;
    el.banner.classList.remove('hidden');
    bannerTimer = dur || 4.5;
  }

  var bigMsgTimer = 0;
  function bigMsg(text) {
    el.bigMsg.textContent = text;
    el.bigMsg.classList.remove('hidden');
    el.bigMsg.classList.remove('fade-out');
    bigMsgTimer = 1.7;
  }

  var toastTimer = 0;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.remove('hidden');
    toastTimer = 2.6;
  }

  var HINTS = [
    '🌻 たねを ひろって ほっぺに いれよう！',
    '🏠 ほっぺが いっぱいなら おうちへ とどけよう！',
    '🎡 くるくるに ちかづくと のれるよ！',
    '🍎 きを たっぷすると りんごが おちるよ',
    '🦋 ちょうちょを たっぷしてみよう',
    '🍄 きのこに のると ぴょーん！',
    '⚽ ボールを おして ゴールへ！',
    '📣 らっぱで おともだちを よぼう',
    '🌙 よるにすると ホタルが とぶよ'
  ];
  var hintIdx = 0, hintTimer = 8;

  // ---------------- おいわいキュー ----------------
  var queue = [];
  function later(delay, fn) { queue.push({ t: delay, fn: fn }); }
  function runQueue(dt) {
    for (var i = queue.length - 1; i >= 0; i--) {
      queue[i].t -= dt;
      if (queue[i].t <= 0) {
        var fn = queue[i].fn;
        queue.splice(i, 1);
        fn();
      }
    }
  }

  // ---------------- 移動マーカー・タップ波紋 ----------------
  var marker = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.06;
  marker.visible = false;
  scene.add(marker);

  var ripplePool = [];
  for (var rp = 0; rp < 4; rp++) {
    var rm = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.45, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0, depthWrite: false })
    );
    rm.rotation.x = -Math.PI / 2;
    rm.position.y = 0.05;
    rm.userData.life = 0;
    scene.add(rm);
    ripplePool.push(rm);
  }
  function tapRipple(x, z) {
    for (var i = 0; i < ripplePool.length; i++) {
      if (ripplePool[i].userData.life <= 0) {
        ripplePool[i].position.set(x, 0.05, z);
        ripplePool[i].userData.life = 0.45;
        return;
      }
    }
  }

  // ---------------- かくれんぼ ----------------
  var SPOTS = [
    { x: -16.8, z: -12.6 },  // おうちのうら
    { x: -22.3, z: 4.0 },    // にしのき
    { x: 20.2, z: -5.0 },    // ひがしのき
    { x: -13, z: 12.5 },     // ひまわりばたけ
    { x: -3.0, z: 17.0 },    // きのこ
    { x: 13.8, z: -14.0 }    // くるくるのうら
  ];
  var hide = { active: false, friend: null, correct: null, spots: [], visited: [] };
  var qSprites = [];
  for (var qi = 0; qi < 3; qi++) {
    var qs = FX.textSprite('？', { color: '#ff8330', bubble: true, scale: 1.9 });
    qs.visible = false;
    scene.add(qs);
    qSprites.push(qs);
  }

  function startHideSeek() {
    if (hide.active || wheel.mode) return;
    var candidates = SPOTS.slice();
    // シャッフルして3つえらぶ
    for (var i = candidates.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }
    hide.spots = candidates.slice(0, 3);
    hide.correct = hide.spots[Math.floor(Math.random() * 3)];
    hide.visited = [];
    hide.friend = U.pick(friends);
    hide.friend.mode = 'hiding';
    hide.friend.x = hide.correct.x;
    hide.friend.z = hide.correct.z;
    hide.friend.h.group.position.set(hide.correct.x, 0, hide.correct.z);
    hide.active = true;
    for (var q = 0; q < 3; q++) {
      qSprites[q].position.set(hide.spots[q].x, 2.4, hide.spots[q].z);
      qSprites[q].visible = true;
    }
    S.sfx.magic();
    bigMsg('かくれんぼ！🙈');
    showBanner('「？」の ところを さがしてみよう！', 6);
  }

  function endHideSeek(found) {
    hide.active = false;
    for (var q = 0; q < 3; q++) qSprites[q].visible = false;
    if (found && hide.friend) {
      guide.notifyProgress();
      var f = hide.friend;
      f.mode = 'follow';
      f.follow = 20;
      fx.confetti.spawn(f.x, 1.5, f.z, { n: 40, colors: CONFETTI_COLORS, speed: 4, up: 5, life: 1.4 });
      fx.heart.spawn(f.x, 1.6, f.z, { n: 6, colors: HEART_COLORS, speed: 1, up: 1.5, life: 1.2 });
      S.sfx.fanfare();
      bigMsg('みーつけた！🎉');
      // ごほうびのたね
      spawnBonusSeeds(f.x, f.z, 2);
    }
    hide.friend = null;
  }

  // ---------------- くるくる (かいしゃぐるま) ----------------
  var wheel = {
    mode: false, spinV: 0, gauge: 0, cool: 0, time: 0,
    yaw: 0, sinceTap: 0
  };
  (function () {
    var th = world.wheel.group.rotation.y;
    wheel.yaw = Math.atan2(Math.cos(th), -Math.sin(th));
  })();

  function enterWheel() {
    guide.notifyProgress();
    wheel.mode = true;
    wheel.spinV = 0.6;
    wheel.gauge = 0;
    wheel.time = 0;
    wheel.sinceTap = 0;
    marker.visible = false;
    moveTarget = null;
    P.x = world.wheel.x; P.z = world.wheel.z; P.y = 0.3; P.vy = 0;
    P.yaw = wheel.yaw;
    el.gaugeWrap.classList.remove('hidden');
    el.gaugeFill.style.width = '0%';
    S.sfx.pip();
    bigMsg('くるくる！🎡');
    showBanner('がめんを たっぷ たっぷ！', 5);
  }

  function exitWheel(success) {
    wheel.mode = false;
    el.tapHint.classList.add('hidden');
    wheel.cool = 9;
    el.gaugeWrap.classList.add('hidden');
    // ひろばがわに おりる
    var dx = -world.wheel.x, dz = -world.wheel.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    P.x = world.wheel.x + (dx / d) * 3.0;
    P.z = world.wheel.z + (dz / d) * 3.0;
    P.y = 0; P.vy = 0;
    if (success) {
      bigMsg('はやーい！🌈');
      S.sfx.fanfare();
      fx.confetti.spawn(world.wheel.x, 2.5, world.wheel.z, { n: 60, colors: CONFETTI_COLORS, speed: 5, up: 6, life: 1.6 });
      world.rainbow.show = 9;
      spawnBonusSeeds(P.x, P.z, 3);
    }
  }

  function spawnBonusSeeds(x, z, n) {
    var placed = 0;
    for (var i = 0; i < seeds.length && placed < n; i++) {
      if (!seeds[i].active) {
        var a = (placed / n) * Math.PI * 2 + Math.random();
        seeds[i].active = true;
        seeds[i].respawn = 0;
        seeds[i].mesh.visible = true;
        seeds[i].mesh.position.set(x + Math.cos(a) * 2, 0.42, z + Math.sin(a) * 2);
        placed++;
      }
    }
    // あきがなければ そのばに キラキラだけ
    fx.star.spawn(x, 1, z, { n: 10, colors: SPARKLE_GOLD, speed: 2.5, up: 3.5, life: 1 });
  }

  // ---------------- 段階ガイド ----------------
  function getGuideGoal(auto) {
    if (wheel.mode) return null;
    if (hide.active) {
      if (auto) return { x: hide.correct.x, z: hide.correct.z, kind: 'hide' };
      var best = null, bd = 1e9;
      for (var i = 0; i < hide.spots.length; i++) {
        var sp = hide.spots[i];
        if (hide.visited.indexOf(sp) !== -1) continue;
        var d = U.dist2d(P.x, P.z, sp.x, sp.z);
        if (d < bd) { bd = d; best = sp; }
      }
      best = best || hide.correct;
      return { x: best.x, z: best.z, kind: 'hide' };
    }
    if (state.pouch >= 6) {
      return { x: world.house.doorX, z: world.house.doorZ, kind: 'house' };
    }
    var ns = null, nd = 1e9;
    for (var s = 0; s < seeds.length; s++) {
      if (!seeds[s].active) continue;
      var sd2 = U.dist2d(P.x, P.z, seeds[s].mesh.position.x, seeds[s].mesh.position.z);
      if (sd2 < nd) { nd = sd2; ns = seeds[s]; }
    }
    if (ns) return { x: ns.mesh.position.x, z: ns.mesh.position.z, kind: 'seed' };
    if (state.pouch > 0) {
      return { x: world.house.doorX, z: world.house.doorZ, kind: 'house' };
    }
    return null;
  }

  var guide = JG.Guide({
    scene: scene,
    glowTex: FX.circleTex(),
    getPlayer: function () { return P; },
    getGoal: getGuideGoal,
    isBusy: function () { return wheel.mode; },
    autoMove: function (x, z) {
      moveTarget = { x: x, z: z };
      marker.visible = true;
      marker.position.set(x, 0.06, z);
    },
    squeak: function () { S.sfx.squeak(); },
    trail: function (x, y, z) {
      fx.trail.spawn(x, y, z, { n: 1, colors: [[0.6, 0.85, 1]], speed: 0.3, up: 0.5, life: 0.5 });
    }
  });

  // ---------------- ボール ----------------
  var ballV = { x: 0, z: 0 };
  var ballAxis = new THREE.Vector3();
  var ballResetTimer = 0;

  // ---------------- 入力 ----------------
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var planeHit = new THREE.Vector3();
  var moveTarget = null;
  var dragging = false;
  var dragPointerId = -1;
  var lastInputTime = 0;

  function interactiveTargets() {
    var arr = world.interactives.slice();
    for (var i = 0; i < friends.length; i++) arr.push(friends[i].h.group);
    for (var b = 0; b < butterflies.length; b++) arr.push(butterflies[b].hit);
    return arr;
  }

  function findType(obj) {
    var o = obj;
    while (o) {
      if (o.userData && o.userData.type) return o;
      o = o.parent;
    }
    return null;
  }

  function onTap(clientX, clientY, isFirstDown) {
    lastInputTime = clock.elapsedTime;
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    if (wheel.mode) {
      if (isFirstDown) {
        wheel.spinV = Math.min(10, wheel.spinV + 2.3);
        wheel.sinceTap = 0;
        S.sfx.tick();
      }
      return;
    }

    // インタラクティブなものを さわった？
    if (isFirstDown) {
      var hits = raycaster.intersectObjects(interactiveTargets(), true);
      if (hits.length > 0) {
        var node = findType(hits[0].object);
        if (node && handleInteract(node, hits[0].point)) return;
      }
    }

    // じめんへ いどう
    if (raycaster.ray.intersectPlane(groundPlane, planeHit)) {
      var r = Math.sqrt(planeHit.x * planeHit.x + planeHit.z * planeHit.z);
      if (r > 28.5) {
        planeHit.x *= 28.5 / r;
        planeHit.z *= 28.5 / r;
      }
      moveTarget = { x: planeHit.x, z: planeHit.z };
      marker.visible = true;
      marker.position.set(planeHit.x, 0.06, planeHit.z);
      if (isFirstDown) {
        tapRipple(planeHit.x, planeHit.z);
        S.sfx.tap();
      }
    }
  }

  function handleInteract(node, point) {
    var type = node.userData.type;
    var root = node.userData.root || node;
    if (type === 'butterfly') {
      var bf = node.userData.ref;
      fx.sparkle.spawn(bf.group.position.x, bf.group.position.y, bf.group.position.z,
        { n: 14, colors: SPARKLE_GOLD, speed: 2.5, up: 1.5, life: 0.8 });
      S.sfx.squeak();
      bf.retarget();
      bf.group.position.y += 0.8;
      return true;
    }
    if (type === 'friend') {
      var fr2 = node.userData.ref;
      greetFriend(fr2);
      return true;
    }
    if (type === 'flower') {
      root.userData.pop = 0.5;
      var col = new THREE.Color(root.userData.color);
      fx.petal.spawn(root.position.x, 0.9, root.position.z,
        { n: 10, colors: [[col.r, col.g, col.b], [1, 1, 1]], speed: 2, up: 2.6, life: 1.2 });
      S.sfx.pop();
      return false; // あるいて ちかづきもする
    }
    if (type === 'sunflower') {
      if (root.userData.cool <= 0) {
        root.userData.cool = 18;
        fx.sparkle.spawn(root.position.x, 2, root.position.z,
          { n: 10, colors: SPARKLE_GOLD, speed: 2, up: 2, life: 0.8 });
        // たねがおちてくる！
        var free = null;
        for (var i = 0; i < seeds.length; i++) if (!seeds[i].active) { free = seeds[i]; break; }
        if (free) {
          free.active = true;
          free.mesh.visible = true;
          free.mesh.position.set(root.position.x + U.rand(-1, 1), 0.42, root.position.z + U.rand(0.6, 1.6));
        }
        S.sfx.pip();
      }
      return false;
    }
    if (type === 'tree') {
      root.userData.shake = 1;
      S.sfx.whoosh();
      fx.petal.spawn(root.position.x, 3.4, root.position.z,
        { n: 8, colors: [[0.45, 0.75, 0.35], [0.55, 0.85, 0.4]], speed: 2, up: 0.5, life: 1.4 });
      if (root.userData.withApples) {
        for (var a = 0; a < world.apples.length; a++) {
          if (world.apples[a].userData.state === 'tree') {
            world.apples[a].userData.state = 'falling';
            world.apples[a].userData.vy = 0;
            break;
          }
        }
      }
      return false;
    }
    if (type === 'ball') {
      var dx = world.ball.position.x - P.x, dz = world.ball.position.z - P.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      ballV.x += (dx / d) * 4;
      ballV.z += (dz / d) * 4;
      S.sfx.pop();
      return false;
    }
    if (type === 'house') {
      fx.heart.spawn(world.house.doorX, 1.5, world.house.doorZ, { n: 3, colors: HEART_COLORS, speed: 0.8, up: 1.4, life: 1.1 });
      S.sfx.squeak();
      return false;
    }
    if (type === 'mushroom' || type === 'wheel') {
      return false; // ちかづけば あそべる
    }
    return false;
  }

  function greetFriend(fr) {
    if (fr.mode === 'hiding') return;
    if (fr.greetCool > 0) return;
    guide.notifyProgress();
    fr.greetCool = 5;
    fr.mode = 'follow';
    fr.follow = 22;
    fx.heart.spawn(fr.x, 1.5, fr.z, { n: 6, colors: HEART_COLORS, speed: 1.2, up: 1.8, life: 1.3 });
    S.sfx.squeak();
    later(0.25, function () { S.sfx.heart(); });
  }

  var canvasEl = renderer.domElement;
  canvasEl.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    S.unlock();
    if (!state.started) return;
    guide.notifyInput();
    dragging = true;
    dragPointerId = e.pointerId;
    onTap(e.clientX, e.clientY, true);
  });
  canvasEl.addEventListener('pointermove', function (e) {
    if (!dragging || e.pointerId !== dragPointerId || !state.started) return;
    e.preventDefault();
    onTap(e.clientX, e.clientY, false);
  });
  window.addEventListener('pointerup', function (e) {
    if (e.pointerId === dragPointerId) { dragging = false; dragPointerId = -1; }
  });
  window.addEventListener('pointercancel', function () { dragging = false; dragPointerId = -1; });

  // iOS のダブルタップズームなどをふうじる
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) {
    if (e.target === canvasEl) e.preventDefault();
  }, { passive: false });

  // ---------------- ボタン ----------------
  function bindBtn(btn, fn) {
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      S.unlock();
      if (state.started) guide.notifyInput();
      fn();
    });
  }

  bindBtn(el.btnJump, function () {
    if (!state.started || wheel.mode) return;
    if (P.grounded) {
      P.vy = 8.4;
      P.grounded = false;
      S.sfx.whoosh();
      fx.sparkle.spawn(P.x, 0.3, P.z, { n: 6, colors: [[1, 1, 1]], speed: 1.5, up: 0.5, life: 0.5 });
    }
  });

  bindBtn(el.btnHat, function () {
    if (!state.started) return;
    state.hatIndex = (state.hatIndex + 1) % state.unlockedHats;
    player.setHat(state.hatIndex);
    S.sfx.pip();
    if (state.unlockedHats <= 1) {
      toast('⭐ レベルが あがると ぼうしが もらえるよ');
    } else {
      toast('🎩 ' + JG.Hamster.HATS[state.hatIndex].name);
      fx.star.spawn(P.x, 1.6, P.z, { n: 6, colors: SPARKLE_GOLD, speed: 1.5, up: 2, life: 0.8 });
    }
    save();
  });

  bindBtn(el.btnHide, function () {
    if (!state.started) return;
    if (hide.active) {
      showBanner('「？」の ところを さがしてみよう！', 4);
      return;
    }
    startHideSeek();
  });

  bindBtn(el.btnCall, function () {
    if (!state.started) return;
    S.sfx.squeak();
    later(0.2, function () { S.sfx.squeak(); });
    for (var i = 0; i < friends.length; i++) {
      if (friends[i].mode !== 'hiding') {
        friends[i].mode = 'follow';
        friends[i].follow = 18;
      }
    }
    bigMsg('おいでー！📣');
  });

  bindBtn(el.btnSound, function () {
    S.setMuted(!S.isMuted());
    syncHUD();
  });

  bindBtn(el.btnDayNight, function () {
    if (!state.started) return;
    state.night = !state.night;
    S.sfx.magic();
    bigMsg(state.night ? 'よるに なった！🌙' : 'あさに なった！☀️');
    if (state.night) showBanner('🌙 ホタルが とんでるよ', 5);
    syncHUD();
    save();
  });

  bindBtn(el.btnStart, function () {
    if (state.started) return;
    state.started = true;
    S.unlock();
    S.startBGM(state.night ? 'night' : 'day');
    el.titleScreen.classList.add('fade-out');
    setTimeout(function () { el.titleScreen.classList.add('hidden'); }, 700);
    el.hud.classList.remove('hidden');
    el.controls.classList.remove('hidden');
    S.sfx.jingle();
    later(0.4, function () { S.sfx.squeak(); });
    showBanner('ようこそ！🐹 がめんを たっぷして あるこう', 6);
    if (state.seeds === 0) guide.boost();   // はじめてなら すぐ おてほんガイド
    syncHUD();
  });

  // ---------------- あつめる・とどける ----------------
  function collectSeed(sd) {
    sd.active = false;
    sd.mesh.visible = false;
    sd.respawn = U.rand(4, 8);
    state.seeds++;
    guide.notifyProgress();
    if (state.pouch < 6) state.pouch++;
    player.cheekLevel = state.pouch / 6;
    player.cheekPulse = 0.4;
    fx.sparkle.spawn(sd.mesh.position.x, 0.6, sd.mesh.position.z,
      { n: 10, colors: SPARKLE_GOLD, speed: 2.2, up: 2.6, life: 0.7 });
    S.sfx.pop();
    bump(el.chipSeeds);
    bump(el.chipPouch);
    syncHUD();
    save();
    if (state.pouch >= 6) {
      showBanner('🏠 ほっぺが いっぱい！おうちへ とどけよう', 5);
    }
    // 25こごとに にじのおいわい
    if (state.seeds % 25 === 0) {
      world.rainbow.show = 9;
      S.sfx.magic();
      bigMsg('にじが でたよ！🌈');
      for (var i = 0; i < 5; i++) {
        later(0.3 + i * 0.35, function () {
          fx.star.spawn(P.x + U.rand(-3, 3), 5 + U.rand(0, 2), P.z + U.rand(-3, 3),
            { n: 8, colors: SPARKLE_GOLD, speed: 1.5, up: -1, life: 1.6 });
        });
      }
    }
  }

  var houseMarker = FX.houseSprite();
  houseMarker.position.set(world.house.x, 5.4, world.house.z);
  houseMarker.visible = false;
  scene.add(houseMarker);

  function deliverSeeds() {
    guide.notifyProgress();
    var n = state.pouch;
    state.stored += n;
    state.pouch = 0;
    player.cheekLevel = 0;
    player.cheekPulse = 0.5;
    world.updateSign(state.stored);
    fx.star.spawn(world.house.x, 3, world.house.z, { n: 14, colors: SPARKLE_GOLD, speed: 3, up: 4, life: 1.1 });
    S.sfx.jingle();
    bigMsg('とどけたよ！✨');
    bump(el.chipStored);
    syncHUD();
    var newLevel = Math.floor(state.stored / 10) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      later(1.2, levelUp);
    }
    save();
  }

  function levelUp() {
    S.sfx.fanfare();
    bigMsg('レベルアップ！⭐');
    bump(el.chipLevel);
    syncHUD();
    // はなび！
    for (var i = 0; i < 4; i++) {
      later(0.3 + i * 0.55, (function (k) {
        return function () {
          S.sfx.firework();
          var fxc = U.pick(CONFETTI_COLORS);
          fx.star.spawn(P.x + U.rand(-6, 6), 8 + U.rand(0, 3), P.z + U.rand(-6, 6),
            { n: 24, colors: [fxc, [1, 1, 0.8]], speed: 6, up: 0, life: 1.4 });
        };
      })(i));
    }
    var newUnlock = Math.min(JG.Hamster.HATS.length, state.level);
    if (newUnlock > state.unlockedHats) {
      state.unlockedHats = newUnlock;
      var hatName = JG.Hamster.HATS[state.unlockedHats - 1].name;
      later(2.2, function () {
        toast('🎁 あたらしい ぼうし: ' + hatName);
        S.sfx.magic();
      });
    }
    save();
  }

  // ---------------- ゴール ----------------
  var prevBallX = world.ball.position.x;
  function checkGoal() {
    var b = world.ball.position;
    if (prevBallX < world.goal.x && b.x >= world.goal.x &&
        Math.abs(b.z - world.goal.z) < world.goal.halfW - 0.4 &&
        ballResetTimer <= 0) {
      guide.notifyProgress();
      bigMsg('ゴーール！⚽');
      S.sfx.fanfare();
      fx.confetti.spawn(world.goal.x, 2.5, world.goal.z, { n: 70, colors: CONFETTI_COLORS, speed: 5, up: 6, life: 1.7 });
      ballResetTimer = 2.5;
    }
    prevBallX = b.x;
  }

  // ---------------- 昼夜 ----------------
  var skyDay = new THREE.Color(0x9fd9ff), skyNight = new THREE.Color(0x27336b);
  var fogDay = new THREE.Color(0xbfe8ff), fogNight = new THREE.Color(0x27336b);
  var hemiDay = new THREE.Color(0xbfe8ff), hemiNight = new THREE.Color(0x6a7ec2);
  var hgDay = new THREE.Color(0x88b86a), hgNight = new THREE.Color(0x3a5a6e);
  var dirDay = new THREE.Color(0xfff2d8), dirNight = new THREE.Color(0x9ab8ff);
  var tmpColor = new THREE.Color();

  function updateDayNight(dt) {
    var target = state.night ? 1 : 0;
    var nf = state.nightFactor;
    if (Math.abs(nf - target) > 0.001) {
      nf = U.lerp(nf, target, U.damp(1.4, dt));
      state.nightFactor = nf;
    }
    scene.background.copy(tmpColor.copy(skyDay).lerp(skyNight, nf));
    scene.fog.color.copy(tmpColor.copy(fogDay).lerp(fogNight, nf));
    hemi.color.copy(tmpColor.copy(hemiDay).lerp(hemiNight, nf));
    hemi.groundColor.copy(tmpColor.copy(hgDay).lerp(hgNight, nf));
    hemi.intensity = U.lerp(0.95, 0.72, nf);
    dir.color.copy(tmpColor.copy(dirDay).lerp(dirNight, nf));
    dir.intensity = U.lerp(0.9, 0.55, nf);
    world.sun.position.set(20, U.lerp(28, -10, nf), -26);
    world.moon.position.set(-18, U.lerp(-10, 26, nf), -28);
    world.stars.material.opacity = nf;
    S.setBGMMode(nf > 0.5 ? 'night' : 'day');
  }

  // ---------------- リサイズ ----------------
  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', function () {
    setTimeout(onResize, 250);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) S.suspend(); else S.resume();
  });

  // ---------------- カメラ ----------------
  var camPos = new THREE.Vector3(0, 12, 18);
  var camLook = new THREE.Vector3();
  function updateCamera(dt) {
    var portrait = window.innerHeight > window.innerWidth;
    var offY = portrait ? 13.5 : 9.6;
    var offZ = portrait ? 15.5 : 12.6;
    var fovT = portrait ? 58 : 50;
    if (wheel.mode) { offY *= 0.72; offZ *= 0.72; }
    var tx = P.x, tz = P.z + offZ, ty = offY;
    var k = U.damp(4, dt);
    camPos.x = U.lerp(camPos.x, tx, k);
    camPos.y = U.lerp(camPos.y, ty, k);
    camPos.z = U.lerp(camPos.z, tz, k);
    camera.position.copy(camPos);
    camLook.x = U.lerp(camLook.x, P.x, k);
    camLook.y = U.lerp(camLook.y, P.y + 1.1, k);
    camLook.z = U.lerp(camLook.z, P.z, k);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fovT) > 0.3) {
      camera.fov = U.lerp(camera.fov, fovT, U.damp(3, dt));
      camera.updateProjectionMatrix();
    }
  }

  // ---------------- メインループ ----------------
  var clock = new THREE.Clock();
  var fpsAcc = 0, fpsCount = 0, fpsChecked = false;

  function updatePlayer(dt) {
    var moving = 0;
    if (wheel.mode) {
      // くるくるのなか
      wheel.time += dt;
      wheel.sinceTap += dt;
      el.tapHint.classList.toggle('hidden', wheel.sinceTap < 2.2);
      wheel.spinV *= (1 - 1.15 * dt);
      world.wheel.spin.rotation.z -= wheel.spinV * dt * 1.6;
      wheel.gauge = Math.min(100, wheel.gauge + wheel.spinV * dt * 3.4);
      el.gaugeFill.style.width = wheel.gauge + '%';
      P.x = world.wheel.x;
      P.z = world.wheel.z;
      P.y = 0.3 + Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.05 * Math.min(1, wheel.spinV);
      P.yaw = wheel.yaw;
      moving = Math.min(1, wheel.spinV / 3.5);
      if (wheel.spinV > 3) {
        fx.trail.spawn(P.x + U.rand(-0.8, 0.8), U.rand(0.5, 3.2), P.z + U.rand(-0.8, 0.8),
          { n: 1, colors: [[1, 0.7, 0.9]], speed: 0.4, up: 0.3, life: 0.5 });
      }
      if (wheel.gauge >= 100) exitWheel(true);
      else if (wheel.time > 5 && wheel.spinV < 0.15) exitWheel(false);
    } else {
      // ふつうの おさんぽ
      if (moveTarget) {
        var dx = moveTarget.x - P.x, dz = moveTarget.z - P.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.3) {
          moveTarget = null;
          marker.visible = false;
        } else {
          var spd = 5.4 * (P.dash > 0 ? 1.55 : 1) * (P.inPond ? 0.62 : 1);
          var step = Math.min(d, spd * dt);
          P.x += (dx / d) * step;
          P.z += (dz / d) * step;
          P.yaw = U.lerpAngle(P.yaw, Math.atan2(dx, dz), U.damp(12, dt));
          moving = Math.min(1, spd / 5.4);
        }
      }
      // そとには でない
      var pr = Math.sqrt(P.x * P.x + P.z * P.z);
      if (pr > 28.5) { P.x *= 28.5 / pr; P.z *= 28.5 / pr; }
      // しょうがいぶつ
      for (var oi = 0; oi < world.obstacles.length; oi++) {
        var ob = world.obstacles[oi];
        var ox = P.x - ob.x, oz = P.z - ob.z;
        var od = Math.sqrt(ox * ox + oz * oz);
        if (od < ob.r && od > 0.001) {
          P.x = ob.x + (ox / od) * ob.r;
          P.z = ob.z + (oz / od) * ob.r;
        }
      }
      // ジャンプ
      if (!P.grounded) {
        P.vy -= 22 * dt;
        P.y += P.vy * dt;
        if (P.y <= 0) {
          P.y = 0;
          P.vy = 0;
          P.grounded = true;
          fx.sparkle.spawn(P.x, 0.2, P.z, { n: 4, colors: [[1, 1, 1]], speed: 1.5, up: 0.3, life: 0.4 });
        }
      }
      // いけ
      var inPond = U.dist2d(P.x, P.z, world.pond.x, world.pond.z) < world.pond.r && P.y < 0.2;
      if (inPond && !P.inPond) {
        S.sfx.splash();
        fx.splash.spawn(P.x, 0.3, P.z, { n: 16, colors: [[0.7, 0.92, 1], [1, 1, 1]], speed: 2.5, up: 3.5, life: 0.8 });
      }
      P.inPond = inPond;
      if (inPond && moving > 0.1) {
        P.splashTimer -= dt;
        if (P.splashTimer <= 0) {
          P.splashTimer = 0.55;
          fx.splash.spawn(P.x, 0.2, P.z, { n: 5, colors: [[0.7, 0.92, 1]], speed: 1.5, up: 2, life: 0.6 });
        }
      }
      // きのこで ぴょーん
      for (var mi = 0; mi < world.mushrooms.length; mi++) {
        var mu = world.mushrooms[mi];
        if (P.grounded &&
            U.dist2d(P.x, P.z, mu.position.x, mu.position.z) < 1.0) {
          P.vy = 10.5;
          P.grounded = false;
          mu.userData.squish = 1;
          S.sfx.boing();
          fx.star.spawn(mu.position.x, 1.2, mu.position.z,
            { n: 8, colors: SPARKLE_GOLD, speed: 2, up: 2.5, life: 0.8 });
        }
      }
      // ダッシュ
      if (P.dash > 0) {
        P.dash -= dt;
        if (moving > 0.1) {
          fx.trail.spawn(P.x, 0.4, P.z, { n: 1, colors: [[1, 0.85, 0.4]], speed: 0.3, up: 0.6, life: 0.5 });
        }
      }
      // くるくるに はいる？
      if (wheel.cool > 0) wheel.cool -= dt;
      else if (P.grounded &&
               U.dist2d(P.x, P.z, world.wheel.x, world.wheel.z) < 2.3) {
        enterWheel();
      }
    }

    player.group.position.set(P.x, P.y, P.z);
    player.group.rotation.y = P.yaw;
    player.cheekLevel = state.pouch / 6;
    player.update(dt, moving, !moveTarget);
    playerShadow.position.set(P.x, 0.03, P.z);
    var shScale = Math.max(0.4, 1 - P.y * 0.12);
    playerShadow.scale.setScalar(shScale);
    P.speed = moving;
  }

  function updateFriends(dt) {
    for (var i = 0; i < friends.length; i++) {
      var f = friends[i];
      if (f.greetCool > 0) f.greetCool -= dt;
      var moving = 0;
      if (f.mode === 'hiding') {
        f.h.group.position.set(f.x, 0, f.z);
        f.h.update(dt, 0, false);
        f.shadow.position.set(f.x, 0.03, f.z);
        continue;
      }
      if (f.mode === 'follow') {
        f.follow -= dt;
        if (f.follow <= 0) f.mode = 'wander';
        f.tx = P.x + f.followOff[0];
        f.tz = P.z + f.followOff[1];
      } else {
        f.retarget -= dt;
        if (f.retarget <= 0) {
          f.retarget = U.rand(3, 7);
          var a = Math.random() * Math.PI * 2;
          var r = U.rand(4, 24);
          f.tx = Math.cos(a) * r;
          f.tz = Math.sin(a) * r;
        }
      }
      var dx = f.tx - f.x, dz = f.tz - f.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var spd = f.mode === 'follow' ? 4.2 : 1.9;
      if (d > (f.mode === 'follow' ? 1.2 : 0.4)) {
        var step = Math.min(d, spd * dt);
        f.x += (dx / d) * step;
        f.z += (dz / d) * step;
        f.yaw = U.lerpAngle(f.yaw, Math.atan2(dx, dz), U.damp(8, dt));
        moving = spd / 5.4;
      }
      // プレイヤーと おともだちの あいさつ (ちかづいたら)
      if (f.greetCool <= 0 && f.mode === 'wander' &&
          U.dist2d(f.x, f.z, P.x, P.z) < 1.5) {
        greetFriend(f);
      }
      f.h.group.position.set(f.x, 0, f.z);
      f.h.group.rotation.y = f.yaw;
      f.h.update(dt, Math.min(1, moving), f.mode === 'wander');
      f.shadow.position.set(f.x, 0.03, f.z);
    }
    // かくれんぼ はっけん チェック
    if (hide.active) {
      var t = clock.elapsedTime;
      for (var q = 0; q < 3; q++) {
        qSprites[q].position.y = 2.4 + Math.sin(t * 3 + q) * 0.25;
      }
      if (hide.friend &&
          U.dist2d(P.x, P.z, hide.friend.x, hide.friend.z) < 2.4) {
        endHideSeek(true);
      } else {
        for (var s = 0; s < hide.spots.length; s++) {
          var sp = hide.spots[s];
          if (sp === hide.correct) continue;
          if (hide.visited.indexOf(sp) === -1 &&
              U.dist2d(P.x, P.z, sp.x, sp.z) < 2.2) {
            hide.visited.push(sp);
            fx.sparkle.spawn(sp.x, 1.2, sp.z, { n: 8, colors: [[1, 1, 1]], speed: 2, up: 2, life: 0.7 });
            S.sfx.pip();
            showBanner('ここじゃ ないみたい…！', 3);
          }
        }
      }
    }
  }

  function updateSeeds(dt) {
    var t = clock.elapsedTime;
    for (var i = 0; i < seeds.length; i++) {
      var sd = seeds[i];
      if (sd.active) {
        sd.mesh.position.y = 0.42 + Math.sin(t * 2.4 + sd.phase) * 0.12;
        sd.mesh.rotation.y += dt * 1.6;
        if (U.dist2d(P.x, P.z, sd.mesh.position.x, sd.mesh.position.z) < 1.15) {
          collectSeed(sd);
        }
      } else if (sd.respawn > 0) {
        sd.respawn -= dt;
        if (sd.respawn <= 0) {
          var spot = seedSpot();
          sd.active = true;
          sd.mesh.visible = true;
          sd.mesh.position.set(spot.x, 0.42, spot.z);
          fx.sparkle.spawn(spot.x, 0.6, spot.z, { n: 5, colors: [[1, 1, 1]], speed: 1, up: 1.5, life: 0.6 });
        }
      }
    }
    // たねが ときどき キラッ
    seedSparkleTimer -= dt;
    if (seedSparkleTimer <= 0) {
      seedSparkleTimer = 0.8;
      var actives = [];
      for (var j = 0; j < seeds.length; j++) if (seeds[j].active) actives.push(seeds[j]);
      if (actives.length) {
        var pickd = U.pick(actives);
        fx.sparkle.spawn(pickd.mesh.position.x, 0.8, pickd.mesh.position.z,
          { n: 1, colors: [[1, 1, 0.8]], speed: 0.3, up: 0.8, life: 0.6 });
      }
    }
    // おうちへ とどける
    var nearDoor = U.dist2d(P.x, P.z, world.house.doorX, world.house.doorZ) < 2.6;
    houseMarker.visible = state.pouch >= 6 && !nearDoor;
    if (houseMarker.visible) {
      houseMarker.position.y = 5.4 + Math.sin(t * 3) * 0.3;
    }
    if (state.pouch > 0 && nearDoor) deliverSeeds();
    // りんごを たべる
    for (var a = 0; a < world.apples.length; a++) {
      var ap = world.apples[a];
      if (ap.userData.state === 'ground' &&
          U.dist2d(P.x, P.z, ap.position.x, ap.position.z) < 1.2) {
        ap.userData.state = 'eaten';
        guide.notifyProgress();
        ap.visible = false;
        ap.userData.timer = 25;
        S.sfx.munch();
        player.cheekPulse = 0.6;
        fx.heart.spawn(P.x, 1.4, P.z, { n: 5, colors: HEART_COLORS, speed: 1, up: 1.6, life: 1.2 });
        P.dash = 8;
        bigMsg('りんご おいしい！🍎');
        showBanner('💨 はしるのが はやくなった！', 4);
      } else if (ap.userData.state === 'eaten') {
        ap.userData.timer -= dt;
        if (ap.userData.timer <= 0) {
          // きに もどる
          ap.userData.state = 'tree';
          ap.visible = true;
          var aa = Math.random() * Math.PI * 2;
          ap.position.set(Math.cos(aa) * 1.35, U.rand(2.6, 3.5), -20 + Math.sin(aa) * 1.35);
          fx.sparkle.spawn(ap.position.x, ap.position.y, ap.position.z,
            { n: 5, colors: [[1, 1, 1]], speed: 1, up: 0.5, life: 0.5 });
        }
      }
    }
  }

  function updateBall(dt) {
    var b = world.ball;
    if (ballResetTimer > 0) {
      ballResetTimer -= dt;
      if (ballResetTimer <= 0) {
        b.position.set(5, 0.85, 3);
        ballV.x = 0; ballV.z = 0;
        fx.sparkle.spawn(5, 1, 3, { n: 8, colors: [[1, 1, 1]], speed: 2, up: 2, life: 0.6 });
      }
    }
    // ハムスターが おす
    var dx = b.position.x - P.x, dz = b.position.z - P.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.6 && d > 0.001 && !wheel.mode) {
      var push = 2.2 + P.speed * 4;
      ballV.x += (dx / d) * push * dt * 8;
      ballV.z += (dz / d) * push * dt * 8;
    }
    var sp = Math.sqrt(ballV.x * ballV.x + ballV.z * ballV.z);
    if (sp > 11) { ballV.x *= 11 / sp; ballV.z *= 11 / sp; }
    ballV.x *= (1 - 0.55 * dt);
    ballV.z *= (1 - 0.55 * dt);
    b.position.x += ballV.x * dt;
    b.position.z += ballV.z * dt;
    // さくで はねかえる
    var br = Math.sqrt(b.position.x * b.position.x + b.position.z * b.position.z);
    if (br > 28.6) {
      var nx = b.position.x / br, nz = b.position.z / br;
      var dot = ballV.x * nx + ballV.z * nz;
      ballV.x -= 2 * dot * nx * 0.85;
      ballV.z -= 2 * dot * nz * 0.85;
      b.position.x = nx * 28.6;
      b.position.z = nz * 28.6;
      if (Math.abs(dot) > 1) S.sfx.tap();
    }
    // ころころ まわる
    if (sp > 0.05) {
      ballAxis.set(ballV.z, 0, -ballV.x).normalize();
      b.rotateOnWorldAxis(ballAxis, (sp * dt) / 0.85);
    }
    ballShadow.position.set(b.position.x, 0.03, b.position.z);
    checkGoal();
  }

  function updateUITimers(dt) {
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) el.banner.classList.add('hidden');
    }
    if (bigMsgTimer > 0) {
      bigMsgTimer -= dt;
      if (bigMsgTimer <= 0.5 && !el.bigMsg.classList.contains('fade-out')) {
        el.bigMsg.classList.add('fade-out');
      }
      if (bigMsgTimer <= 0) el.bigMsg.classList.add('hidden');
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.add('hidden');
    }
    // ヒントぐるぐる
    hintTimer -= dt;
    if (hintTimer <= 0 && bannerTimer <= 0 && !wheel.mode && !hide.active) {
      showBanner(HINTS[hintIdx % HINTS.length], 5);
      hintIdx++;
      hintTimer = 22;
    }
  }

  function updateMarker(dt) {
    if (marker.visible) {
      var t = clock.elapsedTime;
      var s = 1 + Math.sin(t * 6) * 0.18;
      marker.scale.setScalar(s);
      marker.material.opacity = 0.55 + Math.sin(t * 6) * 0.25;
    }
    for (var i = 0; i < ripplePool.length; i++) {
      var r = ripplePool[i];
      if (r.userData.life > 0) {
        r.userData.life -= dt;
        var k = 1 - Math.max(0, r.userData.life) / 0.45;
        r.scale.setScalar(0.6 + k * 2.2);
        r.material.opacity = 0.7 * (1 - k);
      } else {
        r.material.opacity = 0;
      }
    }
  }

  function tick() {
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    if (state.started) {
      updatePlayer(dt);
      updateFriends(dt);
      updateSeeds(dt);
      updateBall(dt);
      updateUITimers(dt);
      runQueue(dt);
      guide.update(dt, t);
      S.update();
    }
    updateDayNight(dt);
    updateMarker(dt);
    world.update(dt, t, state.nightFactor);
    for (var i = 0; i < butterflies.length; i++) butterflies[i].update(dt);
    for (var k in fx) fx[k].update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);

    // かんたんな じどう画質ちょうせい
    if (!fpsChecked && state.started) {
      fpsAcc += dt; fpsCount++;
      if (fpsAcc > 5) {
        var avg = fpsCount / fpsAcc;
        if (avg < 38 && (window.devicePixelRatio || 1) > 1) {
          renderer.setPixelRatio(1);
        }
        fpsChecked = true;
      }
    }
  }

  syncHUD();
  onResize();
  renderer.setAnimationLoop(tick);

  // かいはつ・テストよう (ゲームには えいきょうなし)
  JG.debug = {
    state: state,
    P: P,
    wheel: wheel,
    hide: hide,
    seeds: seeds,
    world: world,
    guide: guide,
    moveTo: function (x, z) { moveTarget = { x: x, z: z }; }
  };
})();
