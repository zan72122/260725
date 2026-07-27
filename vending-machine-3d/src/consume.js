/* ============================================================
 * consume.js — 取り出して・あけて・のんで（たべて）・すてる
 *   缶はプルタブ、ペットボトルはキャップ、おかしは袋／箱をあける。
 *   飲むとペットボトルの中身がへっていくなど、見た目でわかるようにしてある。
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var A = window.VMAudio;

  var C = {};

  /* ---------------- ちいさな粒（しゅわしゅわ・きらきら） ---------------- */
  var sparkGeo = null, fizzMat = null, starMat = null;

  function ensureParticleAssets() {
    if (sparkGeo) return;
    sparkGeo = new THREE.SphereGeometry(1, 6, 5);
    fizzMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.95 });
  }

  /** 発生源のまわりに粒をとばす */
  C.burst = function (parent, pos, count, opt) {
    ensureParticleAssets();
    opt = opt || {};
    var mat = (opt.kind === 'star') ? starMat : fizzMat;
    for (var i = 0; i < count; i++) {
      (function () {
        var m = new THREE.Mesh(sparkGeo, mat.clone());
        var s = (opt.size || 0.004) * U.rand(0.5, 1.5);
        m.scale.setScalar(s);
        m.position.copy(pos);
        m.renderOrder = 950;
        m.material.depthTest = opt.depthTest !== false;
        parent.add(m);
        var vx = U.rand(-1, 1) * (opt.spread || 0.05);
        var vy = U.rand(0.6, 1.4) * (opt.rise || 0.10);
        var vz = U.rand(-1, 1) * (opt.spread || 0.05);
        var life = U.rand(0.5, 1.1) * (opt.life || 1);
        U.track(life, function (t) {
          m.position.set(
            pos.x + vx * t,
            pos.y + vy * t - (opt.gravity || 0.04) * t * t,
            pos.z + vz * t
          );
          m.material.opacity = (1 - t) * 0.9;
          m.scale.setScalar(s * (1 + t * 0.6));
        }, function () {
          parent.remove(m);
          m.material.dispose();
        });
      })();
    }
  };

  /* ============================================================
   * 取出口から手にとる
   * ============================================================ */
  C.takeToHand = function (item, hand, onDone) {
    var wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    item.getWorldPosition(wp);
    item.getWorldQuaternion(wq);
    item.getWorldScale(ws);

    if (item.parent) item.parent.remove(item);
    hand.add(item);
    hand.worldToLocal(wp);
    var pq = new THREE.Quaternion();
    hand.getWorldQuaternion(pq);
    pq.invert();
    var startQ = pq.multiply(wq);

    item.position.copy(wp);
    item.quaternion.copy(startQ);
    item.scale.copy(ws);

    var h = item.userData.height || 0.13;
    // 缶は機内で横倒しになっているので、手に取るときに「よいしょ」と起こす
    var lay = item.userData.lay || null;
    var layFrom = lay ? lay.rotation.z : 0;
    var target = lay
      ? new THREE.Vector3(0, 0, 0)          // ホルダー原点＝商品の中心
      : new THREE.Vector3(0, -h * 0.42, 0); // それ以外は底が原点
    var targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.42, 0));
    var from = item.position.clone();

    U.tween({
      dur: 0.62, ease: U.easeOutCubic,
      onUpdate: function (t) {
        item.position.lerpVectors(from, target, t);
        item.position.y += Math.sin(t * Math.PI) * 0.05;
        item.quaternion.slerpQuaternions(startQ, targetQ, t);
        item.scale.setScalar(U.lerp(ws.x, 1, t));
        if (lay) lay.rotation.z = U.lerp(layFrom, 0, t);
      },
      onDone: function () {
        item.userData.stage = 'sealed';
        item.userData.sips = 0;
        if (onDone) onDone(item);
      }
    });
  };

  /* ============================================================
   * あける
   * ============================================================ */
  C.open = function (item, onDone) {
    var def = item.userData.def;
    var type = item.userData.type;
    if (item.userData.stage !== 'sealed') { if (onDone) onDone(); return false; }
    item.userData.stage = 'opening';

    if (type === 'can') return openCan(item, def, onDone);
    if (type === 'pet') return openPet(item, def, onDone);
    return openPack(item, def, onDone);
  };

  function openCan(item, def, onDone) {
    var tab = item.getObjectByName('tab');
    var hole = item.getObjectByName('hole');
    var r = item.userData.radius || 0.033;

    U.tween({
      dur: 0.42, ease: U.easeOutCubic,
      onUpdate: function (t) {
        if (tab) {
          tab.rotation.x = -1.35 * t;         // タブが起き上がる
          tab.position.z = r * 0.10 * t;
        }
      },
      onDone: function () {
        A.pop();
        if (hole) hole.visible = true;
        if (def.fizzy) {
          A.fizz(1.4);
          var top = new THREE.Vector3(0, (item.userData.height || 0.12) * 0.99, -r * 0.30);
          C.burst(item, top, 16, { size: 0.0035, rise: 0.16, spread: 0.03, gravity: 0.06 });
        }
        // タブを少し戻して「あいた」形にする
        U.tween({
          dur: 0.22, ease: U.easeOutCubic,
          onUpdate: function (t) { if (tab) tab.rotation.x = -1.35 + 0.45 * t; },
          onDone: function () {
            item.userData.stage = 'open';
            if (onDone) onDone();
          }
        });
      }
    });
    return true;
  }

  function openPet(item, def, onDone) {
    var cap = item.getObjectByName('cap');
    if (!cap) { item.userData.stage = 'open'; if (onDone) onDone(); return true; }
    var y0 = cap.position.y;
    A.click(1200);
    U.tween({
      dur: 0.7, ease: U.easeInOutCubic,
      onUpdate: function (t) {
        cap.rotation.y = t * Math.PI * 4;      // ねじって
        cap.position.y = y0 + t * 0.035;       // 持ち上げて
      },
      onDone: function () {
        A.pop();
        // キャップをぽいっと横へ（そのまま消える）
        var px = cap.position.x, py = cap.position.y;
        U.tween({
          dur: 0.5, ease: U.easeInCubic,
          onUpdate: function (t) {
            cap.position.x = px + t * 0.10;
            cap.position.y = py + Math.sin(t * Math.PI) * 0.04 - t * 0.12;
            cap.rotation.z = t * 6;
            cap.scale.setScalar(1 - t * 0.9);
          },
          onDone: function () {
            cap.visible = false;
            item.userData.stage = 'open';
            if (onDone) onDone();
          }
        });
      }
    });
    return true;
  }

  function openPack(item, def, onDone) {
    // 袋・箱・筒：上のふちがひらく
    A.bag();
    var body = item.children[0];
    var y0 = body ? body.position.y : 0;
    U.tween({
      dur: 0.45, ease: U.easeOutBack,
      onUpdate: function (t) {
        item.rotation.z = Math.sin(t * Math.PI * 3) * 0.10 * (1 - t);
        if (body) body.scale.x = 1 + 0.06 * Math.sin(t * Math.PI);
      },
      onDone: function () {
        var h = item.userData.height || 0.15;
        C.burst(item, new THREE.Vector3(0, h * 0.96, 0), 10,
          { kind: 'star', size: 0.005, rise: 0.10, spread: 0.05 });
        A.sparkle();
        item.userData.stage = 'open';
        if (onDone) onDone();
      }
    });
    return true;
  }

  /* ============================================================
   * のむ・たべる
   * ============================================================ */
  C.consume = function (item, onDone) {
    if (item.userData.stage !== 'open') { if (onDone) onDone(false); return false; }
    item.userData.stage = 'busy';
    var type = item.userData.type;
    var sips = (item.userData.sips || 0) + 1;
    var total = (type === 'pet') ? 3 : 2;
    item.userData.sips = sips;
    var last = sips >= total;

    var q0 = item.quaternion.clone();
    var p0 = item.position.clone();
    var tilt = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(type === 'bag' || type === 'box' ? 0.55 : 1.05, 0.42, 0)
    );
    var liq = item.getObjectByName('liquid');
    var liqFull = liq ? liq.userData.fullH : 0;
    var liqFrom = liq ? liq.scale.y : 0;
    var liqTo = liq ? liqFull * (1 - sips / total) : 0;

    U.delay(0.18, function () {
      if (type === 'bag' || type === 'box' || type === 'tube') A.bag();
      else A.gulp();
    });

    U.tween({
      dur: 1.05,
      ease: function (t) { return t; },
      onUpdate: function (t) {
        // 口もとへ持っていって、かたむけて、もどす
        var k = U.easeInOutCubic(Math.sin(U.clamp(t, 0, 1) * Math.PI));
        item.quaternion.slerpQuaternions(q0, tilt, k);
        item.position.set(p0.x, p0.y + k * 0.045, p0.z + k * 0.085);
        if (liq) {
          var lt = U.clamp((t - 0.18) / 0.5, 0, 1);
          liq.scale.y = U.lerp(liqFrom, liqTo, lt);
          liq.position.y = liq.scale.y / 2 + (item.userData.height || 0.2) * 0.01;
        }
      },
      onDone: function () {
        item.quaternion.copy(q0);
        item.position.copy(p0);
        if (last) {
          item.userData.stage = 'empty';
          // 袋はぺたんこに
          if (type === 'bag') {
            var body = item.children[0];
            if (body) U.tween({
              dur: 0.4, ease: U.easeOutCubic,
              onUpdate: function (t) { body.scale.z = 1 - 0.62 * t; }
            });
          }
          A.sparkle();
          C.burst(item, new THREE.Vector3(0, (item.userData.height || 0.14) * 0.7, 0), 12,
            { kind: 'star', size: 0.005, rise: 0.12, spread: 0.06 });
        } else {
          item.userData.stage = 'open';
        }
        if (onDone) onDone(last);
      }
    });
    return true;
  };

  /* ============================================================
   * すてる（リサイクルボックスへ）
   * ============================================================ */
  C.discard = function (item, scene, targetWorldPos, onDone) {
    var wp = new THREE.Vector3();
    item.getWorldPosition(wp);
    var wq = new THREE.Quaternion();
    item.getWorldQuaternion(wq);

    if (item.parent) item.parent.remove(item);
    scene.add(item);
    item.position.copy(wp);
    item.quaternion.copy(wq);

    var from = wp.clone();
    var apexY = Math.max(from.y, targetWorldPos.y) + 0.55;

    U.tween({
      dur: 0.85, ease: function (t) { return t; },
      onUpdate: function (t) {
        // ほうり投げる放物線
        var x = U.lerp(from.x, targetWorldPos.x, t);
        var z = U.lerp(from.z, targetWorldPos.z, t);
        var y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * apexY + t * t * targetWorldPos.y;
        item.position.set(x, y, z);
        item.rotation.x += 0.22;
        item.rotation.z += 0.14;
        if (t > 0.86) item.scale.setScalar(U.lerp(1, 0.2, (t - 0.86) / 0.14));
      },
      onDone: function () {
        A.thud(false);
        A.sparkle();
        scene.remove(item);
        if (onDone) onDone();
      }
    });
  };

  /* ============================================================
   * いまの状態に合わせたヒント文
   * ============================================================ */
  C.hint = function (item) {
    var t = item.userData.type;
    switch (item.userData.stage) {
      case 'sealed':
        if (t === 'can') return 'プルタブを ひっぱって あけよう！';
        if (t === 'pet') return 'キャップを まわして あけよう！';
        return 'ふくろを あけよう！';
      case 'open':
        if (t === 'can' || t === 'pet') return 'ゴクゴク のもう！ タップしてね';
        return 'モグモグ たべよう！ タップしてね';
      case 'empty':
        return 'リサイクルボックスに ポイしてね';
      default:
        return '';
    }
  };

  window.VMConsume = C;
})();
