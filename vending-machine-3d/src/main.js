/* ============================================================
 * main.js — ゲーム本体（入力・カメラ・購入の流れ・お仕事モード）
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var A = window.VMAudio;
  var MONEY = window.VMMoney;
  var CONSUME = window.VMConsume;
  var RESTOCK = window.VMRestock;
  var UI = window.VMUI;

  /* ---------------- 基本 ---------------- */
  var FOV = 42;
  var MACHINE_X = [-0.62, 0.62];

  var renderer, scene, camera, clock, raycaster, ndc;
  var world, wallet, machines = [], mIndex = 0;
  var hand;                       // カメラの子。手に持った商品の入れ物
  var attnRing;

  var started = false;
  var state = 'play';             // play / work
  var handItem = null;
  var binItem = null;             // 取出口にある商品
  var trayCoins = [];             // 釣銭受けの硬貨
  var stars = 0;
  var helpMode = true;
  var xrayMode = false;
  var soundOn = true;
  var camFocus = MACHINE_X[0];
  var camFocusTarget = MACHINE_X[0];
  var camDist = 3.3, camDistTarget = 3.3;

  /* ---------------- ドラッグ状態 ---------------- */
  var drag = null;                // {mesh, value, kind, fromItem, plane, dist}
  var pointerDownAt = null, pointerMoved = 0, pressTarget = null;

  /* ============================================================
   * 初期化
   * ============================================================ */
  function init() {
    UI.init();

    // 色を「見たとおり」に扱う（これを切ると赤がピンクに転ぶ）
    if (THREE.ColorManagement) {
      if ('enabled' in THREE.ColorManagement) THREE.ColorManagement.enabled = true;
      if ('legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    }

    var canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;   // 色をはっきり出す（こども向け）

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80);
    scene.add(camera);

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();
    ndc = new THREE.Vector2();

    world = VMWorld.create(scene);

    // 自販機を2台ならべる
    var m0 = VMDrinkMachine.create();
    m0.group.position.set(MACHINE_X[0], 0, 0);
    scene.add(m0.group);
    var m1 = VMSnackMachine.create();
    m1.group.position.set(MACHINE_X[1], 0, 0);
    scene.add(m1.group);
    machines = [m0, m1];
    machines.forEach(function (m) {
      m.credit = 0;
      RESTOCK.attach(m);
      m.setCredit(0);
      m.updateAffordable(0);
    });

    // おさいふ（カメラの子）
    wallet = MONEY.createWallet(camera);

    // 手（カメラの子）
    hand = new THREE.Group();
    hand.position.set(0, 0.05, -0.72);
    camera.add(hand);

    // 手もと用のあかり。おさいふと手に持った商品だけを照らす（届く距離を短くしてある）
    var uiLight = new THREE.PointLight(0xfff6e8, 1.15, 2.0, 2);
    uiLight.position.set(0.25, 0.30, 0.10);
    camera.add(uiLight);

    // 注目リング
    attnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.085, 0.115, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffe14a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false
      })
    );
    attnRing.renderOrder = 940;
    attnRing.visible = false;
    scene.add(attnRing);

    bindUI();
    bindPointer();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 260); });
    resize();
    renderer.setAnimationLoop(loop);
  }

  /* ============================================================
   * レイアウト
   * ============================================================ */
  var camLookY = 0.66, camLookYTarget = 0.66;

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    var aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    /* 自販機の前面（z=0.39）のところで見える高さ fitH を決める。
       たて画面／よこ画面のどちらでも
         ・機械の足もと(y=0)が画面の73%あたり
         ・機械のてっぺん(y=1.83)が画面の上のほう
       に来るように、カメラの距離と注視点の高さを逆算する。 */
    var work = (state === 'work');
    // おしごとモードはおさいふを隠すので、画面の下まで使える
    var FLOOR_AT = work ? 0.80 : 0.735;         // 足もとの画面位置（0=上, 1=下）
    var baseH = aspect < 1 ? 2.78 : 3.02;
    var fitH = Math.max(baseH, (work ? 1.55 : 1.36) / aspect);
    if (work) fitH *= 1.10;                     // 開いた扉のぶんだけ少し引く

    var tanHalf = Math.tan(FOV * Math.PI / 360);
    camDistTarget = fitH / (2 * tanHalf) + 0.39;   // 前面の位置ぶん下がる
    camLookYTarget = fitH * (FLOOR_AT - 0.5);

    wallet.relayout(aspect, FOV);

    // ヒントの吹き出しがおさいふに重ならないようにする
    var b = work ? 5 : (wallet.layout.trayTopFromBottom || 0.22) * 100 + 2.5;
    UI.setHintAnchor(b.toFixed(1) + '%');
  }

  function updateCamera(dt) {
    var k = 1 - Math.pow(0.001, dt);
    camFocus = U.lerp(camFocus, camFocusTarget, k);
    camDist = U.lerp(camDist, camDistTarget, k);
    camLookY = U.lerp(camLookY, camLookYTarget, k);
    var offX = (state === 'work') ? 0.10 : 0;
    // 水平にまっすぐ見る（前面パネルがゆがまないので実機っぽく見える）
    camera.position.set(camFocus + offX, camLookY, camDist);
    camera.lookAt(camFocus + offX, camLookY, 0);
  }

  /* ============================================================
   * ループ
   * ============================================================ */
  var maxDt = 0.05;   // タブを離れて戻ったときに時間が飛ばないように上限をつける

  function loop() {
    var dt = Math.min(clock.getDelta(), maxDt);
    U.updateTweens(dt);
    wallet.update(dt);
    updateCamera(dt);

    if (attnRing.visible) {
      attnRing.lookAt(camera.position);
      var p = 1 + Math.sin(performance.now() * 0.006) * 0.14;
      attnRing.scale.setScalar(p);
      attnRing.material.opacity = 0.55 + Math.sin(performance.now() * 0.006) * 0.30;
    }
    renderer.render(scene, camera);
  }

  /* ============================================================
   * UIの結線
   * ============================================================ */
  function bindUI() {
    UI.el.start.addEventListener('click', start);

    UI.el.btn.swap.addEventListener('click', function () {
      if (state === 'work') { UI.toast('おしごとを おわってからね'); return; }
      switchMachine();
    });

    UI.el.btn.xray.addEventListener('click', function () {
      xrayMode = !xrayMode;
      UI.setToggle('xray', xrayMode);
      machines.forEach(function (m) { m.chassis.setXray(xrayMode); });
      A.click(xrayMode ? 1800 : 1200);
      UI.toast(xrayMode ? 'なかが みえるよ！' : 'もとに もどしたよ');
      guidance();
    });

    UI.el.btn.help.addEventListener('click', function () {
      helpMode = !helpMode;
      UI.setToggle('help', helpMode);
      A.click(1400);
      UI.toast(helpMode ? 'おてつだい ON' : 'おてつだい OFF');
      guidance();
    });

    UI.el.btn.work.addEventListener('click', function () {
      if (state === 'work') exitWork(); else enterWork();
    });

    UI.el.btn.sound.addEventListener('click', function () {
      soundOn = !soundOn;
      A.setEnabled(soundOn);
      UI.setToggle('sound', !soundOn);
      UI.el.btn.sound.querySelector('.ic').textContent = soundOn ? '🔊' : '🔇';
      if (soundOn) { A.startHum(); A.click(1500); }
    });

    UI.el.btn.trash.addEventListener('click', function () {
      if (handItem && handItem.userData.stage === 'empty') discard();
    });

    UI.setToggle('help', helpMode);
  }

  function start() {
    if (started) return;
    started = true;
    A.unlock();
    A.setEnabled(soundOn);
    A.startHum();
    UI.hideTitle();
    UI.showHud(true);
    UI.setStars(0);
    guidance();
  }

  /* ============================================================
   * ポインタ入力
   * ============================================================ */
  function bindPointer() {
    var c = renderer.domElement;
    c.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onUp, { passive: false });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function toNDC(e) {
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  /** いま当たり判定に使うメッシュ一覧 */
  function currentTargets() {
    var t = [];
    var m = machines[mIndex];
    if (state === 'work') {
      t = m.work.hitTargets();
    } else {
      t = m.hitTargets();
      t.push(world.recycle.userData.hit);
      if (handItem) handItem.traverse(function (o) { if (o.isMesh) t.push(o); });
      t = t.concat(wallet.pickables());
    }
    return t;
  }

  function pickVM(e) {
    toNDC(e);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(currentTargets(), false);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o) {
        if (o.userData && o.userData.vm) return { vm: o.userData.vm, point: hits[i].point, object: o };
        o = o.parent;
      }
      // 手に持っている商品はどこを触ってもOK
      if (handItem && isDescendant(hits[i].object, handItem)) {
        return { vm: { action: 'hand' }, point: hits[i].point, object: hits[i].object };
      }
    }
    return null;
  }

  function isDescendant(o, root) {
    while (o) { if (o === root) return true; o = o.parent; }
    return false;
  }

  function onDown(e) {
    if (!started) return;
    e.preventDefault();
    pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    pointerMoved = 0;
    var hit = pickVM(e);
    pressTarget = hit;
    if (hit && hit.vm.action === 'money') startDrag(hit.vm.value, e);
  }

  function onMove(e) {
    if (!started || !pointerDownAt) return;
    pointerMoved = Math.max(pointerMoved,
      Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y));
    if (drag) { e.preventDefault(); moveDrag(e); }
  }

  function onUp(e) {
    if (!started) return;
    if (drag) { endDrag(e); pointerDownAt = null; pressTarget = null; return; }
    if (pointerDownAt && pointerMoved < 18 && pressTarget) handleTap(pressTarget.vm);
    pointerDownAt = null; pressTarget = null;
  }

  /* ============================================================
   * タップの処理
   * ============================================================ */
  function handleTap(vm) {
    var m = machines[mIndex];
    switch (vm.action) {
      case 'button':
        if (state === 'work') return;
        onSelect(vm.machine || m, vm.index);
        break;
      case 'lever':
        if (state === 'work') return;
        onLever(vm.machine || m);
        break;
      case 'port':
        if (state === 'work') return;
        onPort();
        break;
      case 'tray':
        if (state === 'work') return;
        onTray();
        break;
      case 'coinslot':
      case 'billslot':
        A.click(1300);
        UI.toast(vm.action === 'coinslot' ? 'コインを ここに ドラッグしてね' : 'おさつを ここに ドラッグしてね');
        break;
      case 'lock':
        if (state === 'work') exitWork(); else enterWork();
        break;
      case 'hand':
        onHandTap();
        break;
      case 'recycle':
        if (handItem && handItem.userData.stage === 'empty') discard();
        else if (handItem) UI.toast('まだ のこってるよ');
        break;
      case 'refill':
        if (state !== 'work') return;
        onRefill(vm.machine || m, vm.index);
        break;
      case 'coinbox':
        if (state !== 'work') return;
        onCollect(vm.machine || m);
        break;
    }
  }

  /* ============================================================
   * お金のドラッグ＆投入
   * ============================================================ */
  function startDrag(value, e) {
    var item = null;
    wallet.items.forEach(function (it) { if (it.value === value) item = it; });
    if (!item) return;

    var mesh = (value === 1000) ? MONEY.makeBill() : MONEY.makeCoin(value);
    scene.add(mesh);

    var wp = new THREE.Vector3();
    item.node.getWorldPosition(wp);
    mesh.position.copy(wp);
    mesh.quaternion.copy(camera.quaternion);

    var dist = 1.00;
    var scale0 = item.base.s * (dist / wallet.layout.dist);
    var scaleDrag = scale0 * 1.18;
    mesh.scale.setScalar(item.base.s);

    drag = {
      mesh: mesh, value: value, kind: value === 1000 ? 'bill' : 'coin',
      dist: dist, scale: scaleDrag, walletItem: item, spin: 0
    };
    U.tween({
      dur: 0.16, ease: U.easeOutCubic,
      onUpdate: function (t) { mesh.scale.setScalar(U.lerp(item.base.s, scaleDrag, t)); }
    });
    A.click(1900);
    moveDrag(e);
  }

  var _plane = new THREE.Plane();
  var _fwd = new THREE.Vector3();
  var _pt = new THREE.Vector3();

  function moveDrag(e) {
    toNDC(e);
    raycaster.setFromCamera(ndc, camera);
    camera.getWorldDirection(_fwd);
    var origin = camera.position.clone().addScaledVector(_fwd, drag.dist);
    _plane.setFromNormalAndCoplanarPoint(_fwd.clone().negate(), origin);
    if (raycaster.ray.intersectPlane(_plane, _pt)) {
      drag.mesh.position.copy(_pt);
    }
    drag.mesh.quaternion.copy(camera.quaternion);
    drag.spin += 0.06;
    if (drag.kind === 'coin') drag.mesh.rotateY(Math.sin(drag.spin) * 0.28);
    else drag.mesh.rotateZ(Math.sin(drag.spin) * 0.05);
  }

  function endDrag(e) {
    var d = drag; drag = null;
    var m = machines[mIndex];

    var coinPos = new THREE.Vector3();
    m.chassis.coinSlot.userData.entry.getWorldPosition(coinPos);
    var billPos = new THREE.Vector3();
    m.chassis.billSlot.getWorldPosition(billPos);

    var thresh = Math.min(window.innerWidth, window.innerHeight) * 0.20;
    var dCoin = screenDist(coinPos, e);
    var dBill = screenDist(billPos, e);

    if (d.kind === 'coin' && dCoin < thresh && dCoin <= dBill) {
      insertCoin(m, d, coinPos);
    } else if (d.kind === 'bill' && dBill < thresh && dBill <= dCoin) {
      insertBill(m, d, billPos);
    } else if (d.kind === 'coin' && dBill < thresh) {
      reject(d, 'コインは まるい あなだよ');
    } else if (d.kind === 'bill' && dCoin < thresh) {
      reject(d, 'おさつは よこながの ところだよ');
    } else {
      backToWallet(d);
    }
  }

  var _proj = new THREE.Vector3();
  function screenDist(worldPos, e) {
    _proj.copy(worldPos).project(camera);
    var sx = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    var sy = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    return Math.hypot(sx - e.clientX, sy - e.clientY);
  }

  function insertCoin(m, d, entryPos) {
    var mesh = d.mesh;
    var from = mesh.position.clone();
    var fromS = mesh.scale.x;
    var q0 = mesh.quaternion.clone();
    var q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0.20, 'ZYX'));

    U.tween({
      dur: 0.34, ease: U.easeInOutCubic,
      onUpdate: function (t) {
        mesh.position.lerpVectors(from, entryPos, t);
        mesh.scale.setScalar(U.lerp(fromS, 1, t));
        mesh.quaternion.slerpQuaternions(q0, q1, t);
      },
      onDone: function () {
        var sizeIdx = [10, 50, 100, 500].indexOf(d.value);
        A.coin(sizeIdx);
        // スリットに吸い込まれる
        var p0 = mesh.position.clone();
        U.tween({
          dur: 0.26, ease: U.easeInCubic,
          onUpdate: function (t) {
            mesh.position.set(p0.x, p0.y - 0.018 * t, p0.z - 0.032 * t);
          },
          onDone: function () {
            scene.remove(mesh);
            A.coinRoll();
            m.credit += d.value;
            afterCredit(m);
          }
        });
      }
    });
  }

  function insertBill(m, d, slotPos) {
    var mesh = d.mesh;
    var from = mesh.position.clone();
    var fromS = mesh.scale.x;
    var q0 = mesh.quaternion.clone();
    var q1 = new THREE.Quaternion();     // 自販機の正面と同じ向き
    var above = slotPos.clone();
    above.y += MONEY.BILL.h * 0.5 + 0.012;
    above.z += 0.02;

    U.tween({
      dur: 0.32, ease: U.easeInOutCubic,
      onUpdate: function (t) {
        mesh.position.lerpVectors(from, above, t);
        mesh.scale.setScalar(U.lerp(fromS, 1, t));
        mesh.quaternion.slerpQuaternions(q0, q1, t);
      },
      onDone: function () {
        A.billSuck();
        var baseY = slotPos.y + 0.012;
        U.tween({
          dur: 0.85, ease: U.easeInOutCubic,
          onUpdate: function (t) {
            var s = 1 - t;
            mesh.scale.set(1, Math.max(s, 0.001), 1);
            mesh.position.y = baseY + MONEY.BILL.h * s * 0.5;
            mesh.position.z = above.z - t * 0.012;
          },
          onDone: function () {
            scene.remove(mesh);
            m.credit += 1000;
            afterCredit(m);
          }
        });
      }
    });
  }

  function reject(d, msg) {
    A.nope();
    UI.toast(msg);
    backToWallet(d, true);
  }

  function backToWallet(d, shake) {
    var mesh = d.mesh;
    var from = mesh.position.clone();
    var target = new THREE.Vector3();
    d.walletItem.node.getWorldPosition(target);
    var fromS = mesh.scale.x;
    U.tween({
      dur: shake ? 0.42 : 0.30, ease: U.easeInOutCubic,
      onUpdate: function (t) {
        mesh.position.lerpVectors(from, target, t);
        if (shake) mesh.position.x += Math.sin(t * 34) * 0.02 * (1 - t);
        mesh.scale.setScalar(U.lerp(fromS, d.walletItem.base.s * 0.4, t));
        mesh.quaternion.copy(camera.quaternion);
      },
      onDone: function () { scene.remove(mesh); }
    });
  }

  function afterCredit(m) {
    m.setCredit(m.credit);
    m.updateAffordable(m.credit);
    UI.setCredit(m.credit);
    guidance();
  }

  /* ============================================================
   * 商品を えらぶ
   * ============================================================ */
  function onSelect(m, index) {
    if (m !== machines[mIndex]) return;
    var slot = m.slots[index];
    if (m.busy) return;
    if (binItem) { A.nope(); UI.toast('さきに したから とってね'); flashPort(); return; }

    if (slot.stock <= 0) {
      A.nope();
      slot.button.userData.press();
      m.message('うりきれ');
      UI.toast('うりきれ だよ<br><span style="font-size:.6em">ほかの ボタンを おしてね</span>', 1700);
      U.delay(1.6, function () { m.clearMessage(); m.setCredit(m.credit); });
      return;
    }
    if (m.credit < slot.def.price) {
      A.nope();
      slot.button.userData.press();
      var need = slot.def.price - m.credit;
      m.message('あと' + need);
      UI.toast('あと ' + need + 'えん！', 1600);
      U.delay(1.5, function () { m.clearMessage(); m.setCredit(m.credit); });
      if (helpMode) {
        var hv = MONEY.hintFor(slot.def.price, m.credit);
        wallet.setHint(hv);
      }
      UI.setHint('あと <span class="accent">' + need + 'えん</span>！ おさいふから いれてね');
      return;
    }

    // 購入成立
    m.credit -= slot.def.price;
    m.work.addSale(slot.def.price);
    m.setCredit(m.credit);
    UI.setCredit(m.credit);
    wallet.setHint([]);
    attn(null);
    UI.setHint('しょうひんが おちてくるよ…');

    m.dispense(index, function (item) { onDispensed(m, item); });
    U.delay(0.24, function () { A.chime(); });
    m.updateAffordable(m.credit);
  }

  function onDispensed(m, item) {
    binItem = item;
    addStar(1);
    UI.toast('でてきたよ！', 1100);
    flashPort();
    guidance();
  }

  function flashPort() {
    var m = machines[mIndex];
    var p = new THREE.Vector3();
    m.chassis.port.userData.hit.getWorldPosition(p);
    p.z += 0.12;
    attn(p, 0.13);
  }

  function attn(worldPos, r) {
    if (!worldPos) { attnRing.visible = false; return; }
    attnRing.visible = true;
    attnRing.position.copy(worldPos);
    attnRing.geometry.dispose();
    var rr = r || 0.1;
    attnRing.geometry = new THREE.RingGeometry(rr * 0.78, rr, 32);
  }

  /* ============================================================
   * 取り出す → あける → のむ → すてる
   * ============================================================ */
  function onPort() {
    if (!binItem) { A.nope(); UI.toast('まだ なにも ないよ'); return; }
    if (handItem) { UI.toast('りょうてが ふさがってるよ'); return; }
    var m = machines[mIndex];
    m.chassis.port.userData.swing(0.9);
    A.flap();
    var item = binItem; binItem = null;
    attn(null);
    CONSUME.takeToHand(item, hand, function (it) {
      handItem = it;
      guidance();
    });
  }

  function onHandTap() {
    if (!handItem) return;
    var st = handItem.userData.stage;
    if (st === 'sealed') {
      CONSUME.open(handItem, function () { guidance(); });
    } else if (st === 'open') {
      CONSUME.consume(handItem, function (last) {
        if (last) addStar(1);
        guidance();
      });
    } else if (st === 'empty') {
      discard();
    }
  }

  function discard() {
    if (!handItem || handItem.userData.stage !== 'empty') return;
    var item = handItem; handItem = null;
    var target = new THREE.Vector3();
    world.recycle.getWorldPosition(target);
    target.y += world.recycle.userData.mouthY;
    UI.setVisible('trash', false);
    CONSUME.discard(item, scene, target, function () {
      addStar(1);
      UI.toast('えらい！ ポイできたね', 1300);
      guidance();
    });
  }

  /* ============================================================
   * おかえし（返却レバー・釣銭受け）
   * ============================================================ */
  function onLever(m) {
    m.chassis.lever.userData.pull();
    A.click(1100);
    if (m.credit <= 0) {
      A.nope();
      UI.toast('おかねは はいって ないよ');
      return;
    }
    var coins = MONEY.breakdown(m.credit);
    var amount = m.credit;
    m.credit = 0;
    m.setCredit(0);
    m.updateAffordable(0);
    UI.setCredit(0);

    var trayPos = new THREE.Vector3();
    m.chassis.tray.getWorldPosition(trayPos);
    var floorY = trayPos.y + m.chassis.tray.userData.floorY;

    coins.forEach(function (v, i) {
      U.delay(0.12 + i * 0.11, function () {
        var c = MONEY.makeCoin(v);
        scene.add(c);
        c.position.set(trayPos.x + U.rand(-0.03, 0.03), trayPos.y + 0.10, trayPos.z - 0.03);
        c.rotation.set(-Math.PI / 2 + U.rand(-0.3, 0.3), 0, U.rand(0, 3));
        var y0 = c.position.y;
        var ty = floorY + 0.002 + trayCoins.length * 0.0018;
        var tz = trayPos.z - U.rand(0.02, 0.06);
        var tx = c.position.x;
        U.track(0.34, function (t) {
          c.position.y = U.lerp(y0, ty, U.easeOutBounce(t));
          c.position.z = U.lerp(c.position.z, tz, 0.12);
          c.rotation.z += 0.22 * (1 - t);
        }, function () {
          c.position.set(tx, ty, tz);
          c.rotation.x = -Math.PI / 2 + U.rand(-0.12, 0.12);
        });
        A.coinDrop(1);
        trayCoins.push(c);
      });
    });

    UI.toast('おつり ' + amount + 'えん', 1400);
    U.delay(0.2 + coins.length * 0.11, function () {
      var p = new THREE.Vector3();
      m.chassis.tray.getWorldPosition(p);
      p.z += 0.08;
      attn(p, 0.10);
      guidance();
    });
  }

  function onTray() {
    if (!trayCoins.length) { A.nope(); UI.toast('おつりは ないよ'); return; }
    var total = 0;
    var list = trayCoins.slice();
    trayCoins.length = 0;
    attn(null);

    list.forEach(function (c, i) {
      total += c.userData.money.value;
      var from = c.position.clone();
      U.delay(i * 0.05, function () {
        var target = new THREE.Vector3();
        var wi = null;
        wallet.items.forEach(function (it) { if (it.value === c.userData.money.value) wi = it; });
        (wi ? wi.node : wallet.group).getWorldPosition(target);
        U.track(0.45, function (t) {
          c.position.lerpVectors(from, target, U.easeInOutCubic(t));
          c.position.y += Math.sin(t * Math.PI) * 0.14;
          c.rotation.z += 0.3;
          c.scale.setScalar(U.lerp(1, 0.3, t));
        }, function () { scene.remove(c); });
      });
    });
    A.coinDrop(Math.min(list.length, 4));
    A.sparkle();
    UI.toast('おさいふに ' + total + 'えん もどしたよ', 1500);
    addStar(1);
    guidance();
  }

  /* ============================================================
   * 機械のきりかえ
   * ============================================================ */
  function switchMachine() {
    if (handItem) { UI.toast('もっている ものを さきに どうぞ'); return; }
    if (binItem) { UI.toast('さきに したから とってね'); flashPort(); return; }
    if (trayCoins.length) { UI.toast('おつりを とってからね'); return; }
    mIndex = (mIndex + 1) % machines.length;
    camFocusTarget = MACHINE_X[mIndex];
    A.click(1600);
    var m = machines[mIndex];
    UI.setCredit(m.credit);
    UI.toast(m.name, 1200);
    attn(null);
    guidance();
  }

  /* ============================================================
   * お仕事モード（補充・集金）
   * ============================================================ */
  function enterWork() {
    if (handItem || binItem || trayCoins.length) {
      UI.toast('さきに かたづけてから ひらこうね');
      return;
    }
    var m = machines[mIndex];
    if (m.credit > 0) {
      UI.toast('おかねを おかえしして からね');
      A.nope();
      return;
    }
    state = 'work';
    UI.setWorkMode(true);
    UI.setToggle('work', true);
    UI.setSales(m.work.getSales());
    attn(null);
    wallet.setHint([]);
    wallet.setVisible(false);
    resize();

    A.key();
    m.chassis.lock.userData.turn(1, function () {
      A.door(true);
      m.chassis.setDoorOpen(true, function () {
        m.work.setWorkVisible(true);
        UI.setHint('きいろい ＋を タップして ほじゅうしよう');
      });
    });
    UI.toast('🔧 おしごと スタート！', 1400);
  }

  function exitWork() {
    var m = machines[mIndex];
    state = 'play';
    m.work.setWorkVisible(false);
    A.door(false);
    m.chassis.setDoorOpen(false, function () {
      A.key();
      m.chassis.lock.userData.turn(-1);
    });
    UI.setWorkMode(false);
    UI.setToggle('work', false);
    wallet.setVisible(true);
    resize();
    UI.toast('おしごと おつかれさま！', 1400);
    addStar(1);
    guidance();
  }

  function onRefill(m, index) {
    var slot = m.slots[index];
    if (slot.stock >= slot.max) {
      A.nope();
      UI.toast('もう いっぱいだよ');
      return;
    }
    A.click(1500);
    RESTOCK.refill(m, index, function (n) {
      UI.toast(slot.def.name + 'を ' + n + 'こ ほじゅう！', 1400);
      m.updateAffordable(m.credit);
    });
  }

  function onCollect(m) {
    var got = m.work.collect();
    if (got <= 0) {
      A.nope();
      UI.toast('まだ うれてないよ');
      return;
    }
    A.coinDrop(4);
    A.sparkle();
    UI.setSales(0);
    UI.toast('うりあげ ' + U.yen(got) + 'えん<br><span style="font-size:.55em">しゅうきん できたね！</span>', 2000);
    addStar(2);
  }

  /* ============================================================
   * ほしとガイド
   * ============================================================ */
  function addStar(n) {
    stars += n;
    UI.setStars(stars, true);
    A.sparkle();
  }

  function guidance() {
    var m = machines[mIndex];
    UI.setCredit(m.credit);
    UI.setVisible('trash', !!(handItem && handItem.userData.stage === 'empty'));
    UI.setAttn('trash', !!(handItem && handItem.userData.stage === 'empty'));

    if (state === 'work') {
      wallet.setHint([]);
      UI.setHintHigh(false);
      return;
    }

    if (handItem) {
      wallet.setHint([]);
      UI.setHintHigh(false);
      UI.setHint(CONSUME.hint(handItem));
      return;
    }
    if (binItem) {
      wallet.setHint([]);
      UI.setHintHigh(true);      // 取出口をかくさないように吹き出しを上へ
      UI.setHint('したの とりだし口を タップしてね');
      return;
    }
    UI.setHintHigh(false);

    var cheapest = m.cheapestPrice();
    if (cheapest === 0) {
      UI.setHint('ぜんぶ うりきれ！ 🔧おしごとで ほじゅうしよう');
      wallet.setHint([]);
      return;
    }
    if (m.credit >= cheapest) {
      wallet.setHint([]);
      UI.setHint('ひかっている ボタンを おしてね');
    } else {
      var need = cheapest - m.credit;
      var hv = helpMode ? MONEY.hintFor(cheapest, m.credit) : [];
      wallet.setHint(hv);
      if (m.credit === 0) {
        UI.setHint('おかねを ドラッグして いれてね');
      } else {
        UI.setHint('あと <span class="accent">' + need + 'えん</span> いれてね');
      }
    }
  }

  /* ============================================================
   * デバッグ用の入口（動作確認とスクリーンショット撮影に使う）
   * ============================================================ */
  window.VMDebug = window.__vm = {
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get machines() { return machines; },
    get wallet() { return wallet; },
    get world() { return world; },
    mIndex: function () { return mIndex; },
    handItem: function () { return handItem; },
    binItem: function () { return binItem; },
    credit: function () { return machines[mIndex].credit; },
    stars: function () { return stars; },
    state: function () { return state; },
    /** 描画がとても遅い環境（自動テストなど）で1フレームの進み幅を広げる */
    setMaxDt: function (v) { maxDt = v; },
    /** 画面座標に何が当たるか（動作確認用） */
    pickAt: function (x, y) {
      ndc.x = (x / window.innerWidth) * 2 - 1;
      ndc.y = -(y / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(currentTargets(), false);
      return hits.map(function (h) {
        var o = h.object, vm = null;
        while (o) { if (o.userData && o.userData.vm) { vm = o.userData.vm; break; } o = o.parent; }
        return {
          name: h.object.name || h.object.type,
          dist: +h.distance.toFixed(3),
          action: vm ? vm.action : null,
          index: vm ? vm.index : null
        };
      }).slice(0, 5);
    },
    /** テスト用：手持ち・取出口・釣銭をまとめて片づける */
    forceClear: function () {
      if (handItem && handItem.parent) handItem.parent.remove(handItem);
      if (binItem && binItem.parent) binItem.parent.remove(binItem);
      trayCoins.forEach(function (c) { scene.remove(c); });
      trayCoins.length = 0;
      handItem = null; binItem = null;
      attn(null); guidance();
    }
  };

  /* ============================================================
   * 起動
   * ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
