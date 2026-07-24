/* ============================================================
 * main.js — ゲームループ / 入力 / アクティビティ管理 / おせわメーター
 * ============================================================ */
(function () {
  'use strict';

  var renderer, scene, camera, clock;
  var baby, world;
  var raycaster = new THREE.Raycaster();
  var pointerNDC = new THREE.Vector2();
  var started = false;
  var pointerDown = false;
  var current = null;       // いまのアクティビティ
  var currentName = '';
  var saveTimer = 0;
  var sadTimer = 0;
  var wetTimer = 9;
  var idleTimer = 8;

  var METER_DECAY = { food: 0.010, clean: 0.007, happy: 0.009, sleep: 0.006 };
  var METER_ACT = { food: 'feed', clean: 'bath', happy: 'play', sleep: 'sleep' };

  /* ---------- 共有コンテキスト ---------- */
  var G = {
    get scene() { return scene; },
    get camera() { return camera; },
    get baby() { return baby; },
    get world() { return world; },
    get currentName() { return currentName; },

    pick: function (clientX, clientY, objects, recursive) {
      setPointer(clientX, clientY);
      raycaster.setFromCamera(pointerNDC, camera);
      var hits = raycaster.intersectObjects(objects, recursive);
      return hits.length ? hits[0] : null;
    },

    rayPlane: function (clientX, clientY, plane) {
      setPointer(clientX, clientY);
      raycaster.setFromCamera(pointerNDC, camera);
      var out = new THREE.Vector3();
      var ok = raycaster.ray.intersectPlane(plane, out);
      return ok ? out : null;
    },

    project: function (worldPos) {
      var v = worldPos.clone().project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight
      };
    },

    bumpMeter: function (name, delta) {
      UI.setMeter(name, UI.state.meters[name] + delta);
    },

    onSticker: function () {
      // シールかくとくのおいわい
      var center = new THREE.Vector3(0, 1.4, 0.5);
      FX.burst('rainbow', center, 20);
      FX.burst('confetti', center, 24);
      if (baby) { baby.setMood('happy'); baby.clap(); }
    }
  };

  function setPointer(clientX, clientY) {
    pointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(clientY / window.innerHeight) * 2 + 1;
  }

  /* ---------- 初期化 ---------- */

  function init() {
    var canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffeef5);
    scene.fog = new THREE.Fog(0xffeef5, 9, 16);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 40);
    layoutCamera();

    FX.init(scene);
    world = new World(scene);
    world.setNight(0);

    baby = new Baby({
      outfitColor: UI.state.outfitColor,
      hat: UI.state.hat
    });
    baby.group.position.set(0, 0, 0.5);
    scene.add(baby.group);

    // 場面をまたぐ痕跡の復元（シミ・はだか・天気・ちらかり・口まわり）
    world.setWeather(CARE.state.weather);
    world.setMess(CARE.state.toysOut);
    if (CARE.state.naked) {
      baby.setNaked(true);
    } else {
      baby.setOutfitStyle(CARE.state.outfitStyle);
      for (var si = 0; si < CARE.state.clothesStains.length; si++) {
        baby.addStain(CARE.state.clothesStains[si]);
      }
    }
    if (CARE.state.mouthDirt > 0.2) baby.addCrumbDots(2);

    clock = new THREE.Clock();

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 250); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) UI.save();
    });
    // ピンチズームなどのジェスチャーをむこうか
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });

    // move/up は window で受ける：UIボタン起点のドラッグ（たべものなど）も追跡できる
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    animate();
  }

  function layoutCamera() {
    var aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    if (aspect < 0.8) {
      // たてがめん：ひいてたかめから
      camera.fov = 58;
      camera.position.set(0, 1.7, 5.4);
    } else if (aspect < 1.4) {
      camera.fov = 52;
      camera.position.set(0, 1.55, 4.6);
    } else {
      // よこがめん
      camera.fov = 48;
      camera.position.set(0, 1.5, 4.3);
    }
    camera.lookAt(0, 0.95, 0);
    camera.updateProjectionMatrix();
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    layoutCamera();
  }

  /* ---------- 入力 ---------- */

  function onPointerDown(ev) {
    ev.preventDefault();
    pointerDown = true;
    if (!started) return;
    if (current && current.onDown) current.onDown(ev.clientX, ev.clientY);
  }

  function onPointerMove(ev) {
    if (!started) return;
    if (current && current.onMove) current.onMove(ev.clientX, ev.clientY, pointerDown);
  }

  function onPointerUp(ev) {
    pointerDown = false;
    if (!started) return;
    if (current && current.onUp) current.onUp(ev.clientX, ev.clientY);
  }

  /* ---------- アクティビティ切り替え ---------- */

  function switchActivity(name) {
    if (currentName === name) return;
    if (current && current.exit) current.exit();
    UI.hideThought();
    UI.clearContext();
    currentName = name;
    current = ACTIVITIES[name];
    UI.setActiveActivity(name);
    SND.play('tap');
    if (current && current.enter) current.enter();
    UI.save();
  }

  /* ---------- おせわメーター ---------- */

  function updateMeters(dt) {
    var m = UI.state.meters;
    for (var k in METER_DECAY) {
      // いまやっているおせわのメーターはへらさない
      if (METER_ACT[k] === currentName) continue;
      // ねんね中でなければ、ねむけ以外もゆっくりへる
      var v = m[k] - METER_DECAY[k] * dt * 0.35;
      UI.setMeter(k, Math.max(0.05, v));
    }
    // バッジ表示（メーター + 痕跡の連鎖）
    UI.setNeedy('feed', m.food < 0.3 && currentName !== 'feed');
    UI.setNeedy('bath', (m.clean < 0.3 || CARE.state.mouthDirt > 0.5) && currentName !== 'bath');
    UI.setNeedy('sleep', m.sleep < 0.3 && currentName !== 'sleep');
    UI.setNeedy('play', (m.happy < 0.3 || CARE.state.toysOut > 0) && currentName !== 'play');
    UI.setNeedy('dress', (CARE.state.naked || CARE.state.clothesStains.length > 0) && currentName !== 'dress');
    // げんきがないとしょんぼり（ねんね中いがい）
    var minV = Math.min(m.food, m.clean, m.happy, m.sleep);
    if (minV < 0.18 && baby.mood === 'idle' && currentName !== 'sleep') {
      sadTimer -= dt;
      if (sadTimer <= 0) {
        sadTimer = 6;
        baby.setMood('sad');
        SND.play('sadBaby');
        setTimeout(function () {
          if (baby.mood === 'sad') baby.setMood('idle');
        }, 1600);
      }
    }

    // ふきのこしの痕跡：おふろのあとぬれたまま → ときどきハックション
    if (CARE.state.wet && currentName !== 'bath') {
      wetTimer -= dt;
      if (wetTimer <= 0) {
        wetTimer = 9;
        SND.play('sneeze');
        baby.setMood('surprised');
        baby.giggle();
        UI.bigFeedback('🤧');
        FX.burst('drops', new THREE.Vector3(
          baby.group.position.x, baby.group.position.y + 1.2, baby.group.position.z
        ), 4);
        setTimeout(function () {
          if (baby.mood === 'surprised') baby.setMood('idle');
        }, 1200);
      }
    }

    // 自発行動：ほしいものを指差してアピール（ガイドつき操作のさいちゅうはしない）
    var busy = current && current.isBusy && current.isBusy();
    if (!busy && currentName !== 'sleep' && currentName !== 'bath' && baby.mood === 'idle') {
      idleTimer -= dt;
      if (idleTimer <= 0) {
        idleTimer = 8 + Math.random() * 5;
        var wants = null;
        if (m.food < 0.35) wants = '🍎';
        else if (m.clean < 0.35) wants = '🛁';
        else if (m.sleep < 0.35) wants = '💤';
        else if (m.happy < 0.35) wants = '🎈';
        if (wants) {
          baby.pointTo(Math.random() < 0.5 ? -1 : 1, 1.8);
          var hw = new THREE.Vector3();
          baby.head.getWorldPosition(hw);
          hw.y += 0.5;
          var sp = G.project(hw);
          UI.showThought(wants, sp.x, sp.y);
          setTimeout(function () { UI.hideThought(); }, 2400);
        } else if (Math.random() < 0.35) {
          // ごきげんならバイバイやおててをふる
          baby.wave();
          SND.play('happyBaby');
        }
      }
    }
  }

  /* ---------- メインループ ---------- */

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    if (started) {
      baby.update(dt, t);
      world.update(dt, t);
      FX.update(dt);
      if (current && current.update) current.update(dt, t);
      updateMeters(dt);

      saveTimer += dt;
      if (saveTimer > 8) {
        saveTimer = 0;
        UI.save();
      }
    }

    renderer.render(scene, camera);
  }

  /* ---------- スタート ---------- */

  function startGame() {
    if (started) return;
    started = true;
    SND.init();
    SND.play('tada');
    SND.startMusic('happy');
    document.getElementById('title-screen').classList.add('hidden');
    UI.show();
    ACTIVITIES.init(G);
    switchActivity('play');
    baby.wave();
    baby.setMood('happy');
    UI.celebrate('こんにちは！ 👶');
    FX.burst('confetti', new THREE.Vector3(0, 1.6, 0.5), 20);
    setTimeout(function () { baby.setMood('idle'); }, 1600);
  }

  /* ---------- タイトルがめんのくも ---------- */

  function makeTitleClouds() {
    var titleEl = document.getElementById('title-screen');
    for (var i = 0; i < 5; i++) {
      var c = document.createElement('div');
      c.className = 'cloud';
      var size = 8 + Math.random() * 10;
      c.style.width = size + 'vmin';
      c.style.height = size * 0.55 + 'vmin';
      c.style.top = (5 + Math.random() * 75) + '%';
      c.style.left = (Math.random() * 80) + '%';
      c.style.animationDuration = (24 + Math.random() * 26) + 's';
      c.style.animationDelay = (-Math.random() * 30) + 's';
      titleEl.appendChild(c);
    }
  }

  /* ---------- エントリーポイント ---------- */

  window.addEventListener('load', function () {
    CARE.load();
    UI.init({ onActivity: switchActivity });
    makeTitleClouds();
    init();
    var startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      startGame();
    });
    // タイトルがめんのどこをおしてもスタートできる（4さいむけ）
    document.getElementById('title-screen').addEventListener('pointerdown', startGame);
  });
})();
