/* ============================================================
 * main.js — ゲームの スタートちてん
 *   レンダラ / ライト / キャラ を つくって、ループ を まわす。
 * ============================================================ */
(function () {
  'use strict';

  var renderer, scene, camera, clock;
  var char, pet;
  var started = false;
  var pointerDown = false;
  var saveTimer = 0;
  var lastMode = 'hub';

  /* ---------- しょきか ---------- */

  function init() {
    SAVE.load();

    var canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffeaf3);
    scene.fog = new THREE.Fog(0xdff3ff, 22, 46);

    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.08, 120);

    var lights = {
      hemi: new THREE.HemisphereLight(0xffffff, 0xffc9de, 0.42),
      dir: new THREE.DirectionalLight(0xfff4e8, 0.52),
      amb: new THREE.AmbientLight(0xffffff, 0.18)
    };
    lights.dir.position.set(3, 6, 4);
    scene.add(lights.hemi);
    scene.add(lights.dir);
    scene.add(lights.amb);

    FX.init(scene);

    char = new Character({ outfit: SAVE.data.outfit });
    pet = new Pet('dog');
    pet.group.visible = false;

    GAME.init({
      scene: scene, camera: camera, renderer: renderer,
      char: char, pet: pet, lights: lights
    });

    clock = new THREE.Clock();

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 260); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { SAVE.flush(); SND.shutUp(); }
    });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      pointerDown = true;
      if (started) GAME.onDown(ev.clientX, ev.clientY);
    });
    window.addEventListener('pointermove', function (ev) {
      if (started) GAME.onMove(ev.clientX, ev.clientY, pointerDown);
    });
    window.addEventListener('pointerup', function (ev) {
      pointerDown = false;
      if (started) GAME.onUp(ev.clientX, ev.clientY);
    });
    window.addEventListener('pointercancel', function (ev) {
      pointerDown = false;
      if (started) GAME.onUp(ev.clientX, ev.clientY);
    });

    animate();
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    GAME.layoutCamera();
    UI.layout();
  }

  /* ---------- ループ ---------- */

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    U.update(dt);
    if (started) {
      char.update(dt, t);
      if (pet.group.visible) pet.update(dt, t);
      FX.update(dt);
      GAME.update(dt, t);

      saveTimer += dt;
      if (saveTimer > 10) { saveTimer = 0; SAVE.flush(); }
    } else {
      char.update(dt, t);
      FX.update(dt);
    }

    renderer.render(scene, camera);
  }

  /* ---------- タイトル ---------- */

  function decorateTitle() {
    var t = document.getElementById('title');
    for (var i = 0; i < 5; i++) {
      var c = document.createElement('div');
      c.className = 'cloud deco';
      var size = 9 + Math.random() * 12;
      c.style.width = size + 'vmin';
      c.style.height = size * 0.52 + 'vmin';
      c.style.top = (4 + Math.random() * 70) + '%';
      c.style.left = (Math.random() * 70) + '%';
      c.style.animationDuration = (26 + Math.random() * 28) + 's';
      c.style.animationDelay = (-Math.random() * 34) + 's';
      t.appendChild(c);
    }
    var icons = ['✨', '🌸', '💖', '⭐', '🎀', '🦋', '🍬', '🌈'];
    for (var j = 0; j < 10; j++) {
      var s = document.createElement('div');
      s.className = 'sparkle-deco deco';
      s.textContent = icons[j % icons.length];
      s.style.top = (5 + Math.random() * 88) + '%';
      s.style.left = (3 + Math.random() * 92) + '%';
      s.style.animationDelay = (-Math.random() * 3) + 's';
      t.appendChild(s);
    }
  }

  function startGame() {
    if (started) return;
    started = true;
    SND.init();
    SND.setMuted(!SAVE.data.opts.sound);
    SND.setVoice(SAVE.data.opts.voice);
    SND.play('tada');
    UI.hideTitle();
    UI.show();
    UI.updateCounters(false);
    GAME.go('hub');
    U.after(0.6, function () {
      SND.say('きらきら おんなのこレッスン、はじめるよ');
    });
  }

  /* ---------- UI コールバック ---------- */

  function setupUI() {
    UI.init({
      onHome: function () {
        if (GAME.current() === 'hub') { UI.openMenu(); return; }
        GAME.go('hub');
      },
      onGo: function (id) {
        if (id === 'shop') { UI.openShop(); return; }
        GAME.go(id);
      },
      onAgain: function () {
        var c = GAME.current();
        GAME.resume();
        GAME.go(c, { again: true });
      },
      onResultClosed: function () { GAME.resume(); },
      onBuy: function (item) {
        // かった もの を すぐ きてみる
        if (item.slot && item.id) {
          SAVE.data.outfit[item.slot] = item.id;
          SAVE.touch(); SAVE.save();
          GAME.char.applyOutfit(SAVE.data.outfit);
          FX.celebrate(GAME.char.headPos());
          GAME.char.play('spin');
        }
        SAVE.giveSticker('x4');
      }
    });
    UI.setDestinations(DESTS);

    document.getElementById('start-btn').addEventListener('click', function (ev) {
      ev.stopPropagation(); startGame();
    });
    document.getElementById('title').addEventListener('pointerdown', function (ev) {
      if (ev.target && ev.target.id === 'title-reset') return;
      startGame();
    });
    document.getElementById('title-reset').addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (window.confirm('さいしょから あそぶ？ あつめた シールも きえちゃうよ')) {
        SAVE.reset();
        location.reload();
      }
    });
  }

  /* ---------- スタート ---------- */

  window.addEventListener('load', function () {
    try {
      SAVE.load();
      setupUI();
      decorateTitle();
      init();
      UI.hideLoading();
    } catch (e) {
      console.error(e);
      var l = document.getElementById('loading');
      if (l) l.innerHTML = '<div class="ltx">エラーが おきました…<br>' + (e && e.message) + '</div>';
    }
  });
})();
