/* ============================================================
 * main.js — ゲームループ / ゆびの入力（なぞる・まわす・たいようを動かす）
 * ============================================================ */
(function () {
  'use strict';

  var SAVE_KEY = 'gemWorkshop.save.v1';

  var renderer, scene, camera, clock;
  var gem, room, rewards;
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var started = false;
  var autoSpin = true;
  var saveTimer = 0, saveDirty = false;
  var idleTimer = 0, hintStage = 0;

  /* 入力の状態 */
  var drag = {
    active: false, mode: null, id: null,
    lastX: 0, lastY: 0,
    startLocal: new THREE.Vector3(),
    lastLocal: new THREE.Vector3(),
    length: 0, hits: 0
  };

  /* ---------------- 初期化 ---------------- */

  function init() {
    var canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    clock = new THREE.Clock();

    FX.init(scene);
    room = new Room(scene);
    gem = new Gem(scene);
    rewards = new Rewards(scene, gem, room);

    layout();
    load();
    UIBind();

    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', function () { setTimeout(layout, 250); });

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    animate();
  }

  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    var aspect = w / h;
    camera.aspect = aspect;
    var fov = camera.fov * Math.PI / 180;
    /* 宝石を大きく、でも壁や床の光の模様も見えるようにカメラの距離を決める */
    var fit = Math.min(1, aspect * 1.1);
    var dist = (Gem.BASE_R * 2.0) / (Math.tan(fov / 2) * fit);
    dist = Math.max(4.0, Math.min(8.4, dist));
    camera.position.set(0, Gem.GEM_Y + 0.55, dist);
    camera.lookAt(0, Gem.GEM_Y - 0.42, 0);
    camera.updateProjectionMatrix();
    FX.setViewport(h * Math.min(window.devicePixelRatio || 1, 2), fov);
    if (rewards) rewards.setLayout(Math.tan(fov / 2) * dist * aspect);
  }

  /* ---------------- 入力 ---------------- */

  function setNDC(x, y) {
    ndc.x = (x / window.innerWidth) * 2 - 1;
    ndc.y = -(y / window.innerHeight) * 2 + 1;
  }

  function gemHit(x, y) {
    setNDC(x, y);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObject(gem.meshFront, false);
    return hits.length ? hits[0] : null;
  }

  function nearSun(x, y) {
    var p = room.sunPosition().clone().project(camera);
    var sx = (p.x * 0.5 + 0.5) * window.innerWidth;
    var sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
    var r = Math.max(58, Math.min(window.innerWidth, window.innerHeight) * 0.11);
    return (x - sx) * (x - sx) + (y - sy) * (y - sy) < r * r;
  }

  function onDown(e) {
    if (!started || drag.active) return;
    e.preventDefault();
    drag.id = e.pointerId;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    drag.active = true;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    drag.length = 0; drag.hits = 0;
    idleTimer = 0;

    if (nearSun(e.clientX, e.clientY)) {
      drag.mode = 'sun';
      Sound.play('tap');
      return;
    }
    var hit = gemHit(e.clientX, e.clientY);
    if (hit) {
      drag.mode = 'carve';
      var local = gem.group.worldToLocal(hit.point.clone());
      drag.startLocal.copy(local);
      drag.lastLocal.copy(local);
      drag.hits = 1;
      Sound.startGrind();
      Sound.setGrind(0.25);
      FX.sparks(hit.point, 4, 0.13);
      hideHint();
    } else {
      drag.mode = 'spin';
    }
  }

  function onMove(e) {
    if (!drag.active || e.pointerId !== drag.id) return;
    e.preventDefault();
    var dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    idleTimer = 0;

    if (drag.mode === 'sun') {
      moveSun(e.clientX, e.clientY);
      return;
    }

    if (drag.mode === 'spin') {
      spinGem(dx, dy);
      return;
    }

    /* --- なぞって削る --- */
    var hit = gemHit(e.clientX, e.clientY);
    if (hit) {
      var local = gem.group.worldToLocal(hit.point.clone());
      if (drag.hits === 0) { drag.startLocal.copy(local); drag.hits = 1; }
      var step = local.distanceTo(drag.lastLocal);
      drag.length += step;
      drag.lastLocal.copy(local);
      drag.hits++;
      Sound.setGrind(Math.min(1, step * 22 + 0.2));
      if (Math.random() < 0.75) FX.sparks(hit.point, 1 + Math.floor(Math.random() * 2), 0.10 + Math.random() * 0.1);
      /* うんと長くなぞったら、途中でも1面できる */
      if (drag.length > Gem.BASE_R * 2.6) {
        commitCut();
        drag.startLocal.copy(local);
        drag.length = 0;
      }
    } else {
      Sound.setGrind(0.05);
    }
  }

  function onUp(e) {
    if (!drag.active || (e.pointerId != null && e.pointerId !== drag.id)) return;
    if (drag.mode === 'carve') {
      Sound.stopGrind();
      if (drag.hits > 0) commitCut();
    }
    drag.active = false;
    drag.mode = null;
    drag.id = null;
  }

  function spinGem(dx, dy) {
    var q = new THREE.Quaternion();
    var right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.009);
    gem.group.quaternion.premultiply(q);
    q.setFromAxisAngle(right, dy * 0.009);
    gem.group.quaternion.premultiply(q);
  }

  function moveSun(x, y) {
    setNDC(x, y);
    raycaster.setFromCamera(ndc, camera);
    var origin = raycaster.ray.origin, dir = raycaster.ray.direction;
    var c = room.sunPivot;
    /* 視線のうち、宝石にいちばん近い点の向きを太陽の方向にする */
    var oc = new THREE.Vector3().subVectors(c, origin);
    var t = Math.max(0.1, oc.dot(dir));
    var p = origin.clone().addScaledVector(dir, t);
    var d = p.sub(c);
    if (d.lengthSq() < 1e-4) return;
    room.setSunDir(d);
    if (Math.random() < 0.25) FX.sparkle(room.sunPosition(), 1, 0.13);
  }

  /* ---- 1面ぶんの切り込みを確定する ---- */
  function commitCut() {
    /* なぞった真ん中あたりを削る（指の軌跡そのままではなく、きれいな角度へ補正） */
    var mid = drag.startLocal.clone().add(drag.lastLocal).multiplyScalar(0.5);
    var strength = Math.min(1, drag.length / (Gem.BASE_R * 1.9));
    var res = gem.carveAt(mid, strength);
    if (!res) { Sound.play('tap'); return; }

    gem.group.updateMatrixWorld(true);
    var worldCenter = res.center.clone().applyMatrix4(gem.group.matrixWorld);

    Sound.play('facet', res.size);
    FX.sparks(worldCenter, 12 + Math.floor(res.size * 22), res.hue);
    FX.sparkle(worldCenter, 6, res.hue);

    /* 壁へ虹をとばす */
    var n = res.dir.clone().applyMatrix4(new THREE.Matrix4().extractRotation(gem.group.matrixWorld)).normalize();
    var inc = room.sunDir.clone().negate();
    var refl = inc.clone().addScaledVector(n, -2 * inc.dot(n)).normalize();
    room.flashRainbow(worldCenter, refl, res.hue);
    room.flashRainbow(worldCenter, new THREE.Vector3(n.x * 0.6, n.y * 0.4 - 0.25, n.z * 0.6 - 0.7).normalize(), (res.hue + 0.4) % 1);

    if (gem.facetCount > 0 && gem.facetCount % 5 === 0) Sound.play('rainbow');

    var msg = rewards.check(gem.facetCount);
    rewards.applaud();
    if (msg) showBanner(msg);
    updateHud();
    saveDirty = true;
  }

  /* ---------------- HUD ---------------- */

  function el(id) { return document.getElementById(id); }

  function updateHud() {
    el('facet-count').textContent = gem.facetCount;
    var next = nextGoal(gem.facetCount);
    var pct = next.total > 0 ? Math.min(100, (next.done / next.total) * 100) : 100;
    el('shine-fill').style.width = pct + '%';
    el('next-hint').textContent = next.label;
  }

  var GOALS = [4, 8, 12, 16, 20, 26, 32, 40, 50];
  function nextGoal(count) {
    for (var i = 0; i < GOALS.length; i++) {
      if (count < GOALS[i]) {
        var prev = i === 0 ? 0 : GOALS[i - 1];
        return { done: count - prev, total: GOALS[i] - prev, label: 'あと ' + (GOALS[i] - count) + ' めん' };
      }
    }
    /* 50面から先も、10面ごとにおいわいがつづく */
    var last = GOALS[GOALS.length - 1];
    var step = Math.floor((count - last) / 10);
    var goal = last + (step + 1) * 10;
    return { done: count - (last + step * 10), total: 10, label: 'あと ' + (goal - count) + ' めん' };
  }

  function showBanner(text) {
    var b = el('banner');
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  function hideHint() {
    var h = el('hint');
    if (h.classList.contains('show')) h.classList.remove('show');
  }

  var hintTimer = null;
  function showHint(text) {
    var h = el('hint');
    h.innerHTML = text;
    h.classList.add('show');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 7000);
  }

  /* ---------------- セーブ ---------------- */

  function save() {
    try {
      /* 何時間あそんでも保存がふくらみ続けないよう、直近の記録だけ残す */
      var cuts = gem.cuts.length > 500 ? gem.cuts.slice(gem.cuts.length - 500) : gem.cuts;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ cuts: cuts, color: gem.colorIndex }));
    } catch (e) {}
  }

  function load() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
    gem.setColor(data && data.color != null ? data.color : 0);
    if (data && data.cuts && data.cuts.length) {
      gem.applySavedCuts(data.cuts);
      rewards.restore(gem.facetCount);
    }
    markColorButton();
    updateHud();
  }

  /* ---------------- UI ---------------- */

  function UIBind() {
    /* スタート */
    el('start-btn').addEventListener('click', function () {
      Sound.init();
      Sound.play('sharan', 7);
      Sound.startMusic();
      el('title-screen').classList.add('hidden');
      el('hud').classList.add('visible');
      started = true;
      setTimeout(function () { showHint('ゆびで ほうせきを<br>なぞってね 👆'); }, 700);
    });

    /* 音 */
    el('sound-btn').addEventListener('click', function () {
      var m = Sound.toggleMute();
      this.textContent = m ? '🔇' : '🔊';
    });

    /* くるくる回す */
    el('spin-btn').addEventListener('click', function () {
      autoSpin = !autoSpin;
      this.classList.toggle('off', !autoSpin);
      Sound.play('tap');
    });

    /* いろ */
    var palette = el('palette');
    for (var i = 0; i < Gem.COLORS.length; i++) {
      (function (idx) {
        var b = document.createElement('button');
        b.className = 'color-btn';
        var c = Gem.COLORS[idx].c;
        b.style.background = 'rgb(' + Math.round(c[0] * 235) + ',' + Math.round(c[1] * 235) + ',' + Math.round(c[2] * 235) + ')';
        b.setAttribute('aria-label', Gem.COLORS[idx].name);
        b.addEventListener('click', function () {
          gem.setColor(idx);
          markColorButton();
          Sound.play('pop');
          FX.sparkle(gem.group.position, 10, idx / Gem.COLORS.length);
          saveDirty = true;
        });
        palette.appendChild(b);
      })(i);
    }

    /* あたらしい石（まちがって押しても大丈夫なように2段階） */
    el('new-btn').addEventListener('click', function () {
      el('confirm').classList.add('open');
      Sound.play('tap');
    });
    el('confirm-yes').addEventListener('click', function () {
      el('confirm').classList.remove('open');
      gem.reset();
      rewards.reset();
      Sound.play('reset');
      FX.rainbowBurst(gem.group.position, 24);
      updateHud();
      saveDirty = true;
      showHint('あたらしい いしだよ！<br>なぞってね 👆');
    });
    el('confirm-no').addEventListener('click', function () {
      el('confirm').classList.remove('open');
      Sound.play('tap');
    });
  }

  function markColorButton() {
    var btns = document.querySelectorAll('.color-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('selected', i === gem.colorIndex);
  }

  /* ---------------- ループ ---------------- */

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(0.05, clock.getDelta());
    var time = clock.elapsedTime;

    if (started) {
      if (autoSpin && !(drag.active && drag.mode === 'carve')) {
        gem.group.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dt * 0.16);
      }
      gem.group.position.y = Gem.GEM_Y + Math.sin(time * 0.9) * 0.05;
      gem.uniforms.uSunDir.value.copy(room.sunDir);
      gem.update(dt, time);
      room.update(dt, time);
      room.keepSunOnScreen(camera);
      gem.group.updateMatrixWorld(true);
      room.updateCaustics(gem.worldFacets(), gem.group.position, dt);
      rewards.update(dt, time, gem.group.position);
      FX.update(dt, time);

      /* しばらく触っていなければ、そっとヒントを出す */
      idleTimer += dt;
      if (idleTimer > 12 && hintStage === 0 && gem.facetCount > 0) {
        showHint('たいようを うごかすと<br>ひかりが かわるよ ☀️');
        hintStage = 1; idleTimer = 0;
      } else if (idleTimer > 16 && hintStage === 1) {
        showHint('ほうせきを まわして<br>べつの ところも けずれるよ 🔄');
        hintStage = 0; idleTimer = 0;
      }

      if (saveDirty) {
        saveTimer += dt;
        if (saveTimer > 1.2) { save(); saveDirty = false; saveTimer = 0; }
      }
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
