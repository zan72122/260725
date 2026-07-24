/* ===== じゃんがりあん ものがたり : 段階ガイド (まよわないための おてつだい) =====
   ステージ1: ひかる矢印 + ひかる点々の道 + 目標リング
   ステージ2: 半透明のゴーストハムスターが「こっちだよ！」と先導
   ステージ3: それでも困っていたら 自動でお手本プレイ (タップですぐ操作が戻る) */
window.JG = window.JG || {};

JG.Guide = function (ctx) {
  // ctx: {
  //   scene, glowTex,
  //   getPlayer(): {x, z},
  //   getGoal(auto): {x, z, kind} | null,
  //   autoMove(x, z),
  //   isBusy(): bool  … くるくる中など、移動ガイドを出さない場面
  //   squeak(): やわらかい鳴き声
  // }
  var U = JG.U;
  var scene = ctx.scene;

  var g = {
    idleT: 0,       // 最後の入力からの秒数
    progressT: 0,   // 最後の「進展」(たね取得など)からの秒数
    stage: 0,
    auto: false,
    goal: null
  };

  // ---------- ステージ1: 目標の上の光る矢印 ----------
  var arrowG = new THREE.Group();
  var coneMat = new THREE.MeshBasicMaterial({ color: 0xffdf4d, transparent: true, opacity: 0.95 });
  var cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 12), coneMat);
  cone.rotation.x = Math.PI;   // 下むき
  arrowG.add(cone);
  var coneEdge = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.2, 12), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.BackSide
  }));
  coneEdge.rotation.x = Math.PI;
  arrowG.add(coneEdge);
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ctx.glowTex, color: 0xffe97a, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glow.scale.set(2.8, 2.8, 1);
  glow.position.y = 0.2;
  arrowG.add(glow);
  arrowG.visible = false;
  scene.add(arrowG);

  // 目標の足もとのパルスリング
  var goalRing = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.95, 28),
    new THREE.MeshBasicMaterial({ color: 0xffe97a, transparent: true, opacity: 0, depthWrite: false })
  );
  goalRing.rotation.x = -Math.PI / 2;
  goalRing.position.y = 0.06;
  scene.add(goalRing);

  // ---------- ステージ1: ひかる点々の道 ----------
  var DOTN = 8;
  var dotPos = new Float32Array(DOTN * 3);
  for (var i = 0; i < DOTN; i++) dotPos[i * 3 + 1] = -999;
  var dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
  var dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({
    color: 0xffe97a, size: 0.55, map: ctx.glowTex, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  dots.frustumCulled = false;
  dots.visible = false;
  scene.add(dots);

  // ---------- ステージ2: ゴーストハムスター ----------
  var ghost = JG.Hamster.create({});
  var ghostMats = [];
  ghost.group.traverse(function (o) {
    if (o.isMesh && o.material) {
      o.material.transparent = true;
      if (o.material.emissive !== undefined) {
        o.material.emissive = new THREE.Color(0x4a7ab0);
        o.material.emissiveIntensity = 0.5;
      }
      ghostMats.push({ m: o.material, base: 0.5 });
    }
  });
  ghost.group.visible = false;
  scene.add(ghost.group);
  var G = { x: 0, z: 0, yaw: 0, mode: 'lead', fade: 0, squeakT: 2, trailT: 0 };

  var bubble = JG.FX.textSprite('こっちだよ！', { px: 36, w: 256, bubble: true, scale: 1.35, color: '#ff8330' });
  bubble.visible = false;
  scene.add(bubble);

  // ---------- ステージ3: 自動おてほんプレイ ----------
  var autoTick = 0;

  function stageFrom(tv, a, b, c) { return tv > c ? 3 : (tv > b ? 2 : (tv > a ? 1 : 0)); }

  g.update = function (dt, t) {
    g.idleT += dt;
    g.progressT += dt;
    var sIdle = stageFrom(g.idleT, 8, 16, 26);
    var sProg = stageFrom(g.progressT, 25, 40, 60);
    g.stage = Math.max(sIdle, sProg);
    g.auto = sIdle >= 3;   // 自動プレイは「さわっていない」ときだけ

    var busy = ctx.isBusy();
    var goal = busy ? null : ctx.getGoal(g.auto);
    g.goal = goal;
    var p = ctx.getPlayer();

    // ----- 矢印・リング・点々 (ステージ1〜) -----
    var show = g.stage >= 1 && !!goal;
    arrowG.visible = show;
    dots.visible = show;
    if (show) {
      arrowG.position.set(goal.x, 2.5 + Math.sin(t * 4) * 0.4, goal.z);
      arrowG.rotation.y += dt * 2.2;
      var ph = (t * 1.1) % 1;
      goalRing.position.set(goal.x, 0.06, goal.z);
      goalRing.scale.setScalar(0.8 + ph * 1.6);
      goalRing.material.opacity = (1 - ph) * 0.7;

      var dx = goal.x - p.x, dz = goal.z - p.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var arr = dotGeo.attributes.position.array;
      var n = Math.min(DOTN, Math.max(0, Math.floor((dist - 1.2) / 1.6)));
      for (var d = 0; d < DOTN; d++) {
        if (d < n && dist > 0.01) {
          var k = (d + 1) * 1.6 / dist;
          arr[d * 3] = p.x + dx * k;
          arr[d * 3 + 1] = 0.3 + Math.max(0, Math.sin(t * 5 - d * 0.8)) * 0.35;
          arr[d * 3 + 2] = p.z + dz * k;
        } else {
          arr[d * 3 + 1] = -999;
        }
      }
      dotGeo.attributes.position.needsUpdate = true;
    } else {
      goalRing.material.opacity = 0;
    }

    // ----- ゴーストハムスター (ステージ2〜) -----
    var wantGhost = g.stage >= 2 && !!goal;
    G.fade = U.lerp(G.fade, wantGhost ? 1 : 0, U.damp(3, dt));
    ghost.group.visible = G.fade > 0.03;
    var waiting = false;
    if (ghost.group.visible) {
      for (var m = 0; m < ghostMats.length; m++) {
        ghostMats[m].m.opacity = ghostMats[m].base * G.fade;
      }
      var moving = 0;
      if (goal) {
        var gdx = goal.x - G.x, gdz = goal.z - G.z;
        var dGoal = Math.sqrt(gdx * gdx + gdz * gdz);
        var pdx = p.x - G.x, pdz = p.z - G.z;
        var dPl = Math.sqrt(pdx * pdx + pdz * pdz);
        if (dPl > 14) {
          // おいてけぼりなら プレイヤーのそばに もどる
          G.x = p.x; G.z = p.z;
          dPl = 0;
        }
        if (G.mode === 'lead') {
          if (dGoal < 1.3 || dPl > 6.5) {
            G.mode = 'wait';
          } else {
            var step = 4.4 * dt;
            G.x += (gdx / dGoal) * step;
            G.z += (gdz / dGoal) * step;
            G.yaw = U.lerpAngle(G.yaw, Math.atan2(gdx, gdz), U.damp(10, dt));
            moving = 0.85;
            G.trailT -= dt;
            if (G.trailT <= 0) {
              G.trailT = 0.14;
              ctx.trail(G.x, 0.5, G.z);
            }
          }
        } else {
          // まって、ふりかえって よぶ
          waiting = true;
          G.yaw = U.lerpAngle(G.yaw, Math.atan2(pdx, pdz), U.damp(6, dt));
          if (dPl < 3 && dGoal >= 1.3) G.mode = 'lead';
          G.squeakT -= dt;
          if (G.squeakT <= 0) {
            G.squeakT = 4.5;
            ctx.squeak();
          }
        }
      }
      ghost.group.position.set(G.x, waiting ? Math.abs(Math.sin(t * 7)) * 0.22 : 0, G.z);
      ghost.group.rotation.y = G.yaw;
      ghost.update(dt, moving, false);
      bubble.visible = waiting && G.fade > 0.5;
      if (bubble.visible) {
        bubble.position.set(G.x, 2.05 + Math.sin(t * 3) * 0.1, G.z);
        bubble.material.opacity = G.fade;
      }
    } else {
      bubble.visible = false;
      if (goal) { G.x = p.x; G.z = p.z; G.mode = 'lead'; }
    }

    // ----- 自動おてほん (ステージ3, さわっていないときだけ) -----
    if (g.auto && goal) {
      autoTick -= dt;
      if (autoTick <= 0) {
        autoTick = 0.4;
        ctx.autoMove(goal.x, goal.z);
      }
    }
  };

  // 入力があった → 操作はこどもに (自動プレイ即オフ)
  g.notifyInput = function () { g.idleT = 0; };
  // 進展があった → ガイドをひっこめる (idleT はさわらないので
  // 「ほうっておくと おてほんプレイがつづく」 デモ動作にもなる)
  g.notifyProgress = function () { g.progressT = 0; };
  // はじめてのプレイで すぐ おてほんを見せる
  g.boost = function () { g.idleT = 15; };

  return g;
};
