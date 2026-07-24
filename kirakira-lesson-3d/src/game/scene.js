/* ============================================================
 * scene.js — シーン かんり と ゲーム きょうつう きのう
 *   ・シーンの とうろく / きりかえ（フェード つき）
 *   ・タップ / ドラッグ の うけつけ
 *   ・カメラ の わくぐみ（たて・よこ りょうほう）
 *   ・ごほうび と けっか がめん
 * ============================================================ */
var GAME = (function () {
  'use strict';

  var defs = {};
  var cur = null, curId = null, prevId = null;
  var fadeEl = null;

  var api = {
    scene: null, camera: null, renderer: null,
    root: null, charHolder: null,
    char: null, pet: null,
    lights: {},
    clickable: [],
    draggables: [],
    dragging: null,
    time: 0,
    idle: 0,
    hintFn: null,
    paused: false
  };

  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();

  /* ================= しょきか ================= */

  function init(o) {
    api.scene = o.scene;
    api.camera = o.camera;
    api.renderer = o.renderer;
    api.char = o.char;
    api.pet = o.pet;
    api.lights = o.lights;

    api.root = new THREE.Group();
    api.scene.add(api.root);

    api.charHolder = new THREE.Group();
    api.scene.add(api.charHolder);
    api.charHolder.add(api.char.group);
    api.charHolder.add(api.pet.group);

    fadeEl = document.createElement('div');
    fadeEl.style.cssText = 'position:absolute;inset:0;z-index:70;background:#fff;opacity:0;' +
      'pointer-events:none;transition:opacity .32s ease;';
    document.body.appendChild(fadeEl);
  }

  function register(id, def) { defs[id] = def; }
  function def(id) { return defs[id]; }
  function allDefs() { return defs; }

  /* ================= かたづけ ================= */

  function disposeNode(node) {
    node.traverse(function (o) {
      if (o.geometry && !o.geometry.__cached) {
        try { o.geometry.dispose(); } catch (e) { }
      }
      var mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (var i = 0; i < mats.length; i++) {
        var m = mats[i];
        if (!m || !m.__unique) continue;
        if (m.map && m.map.__unique) { try { m.map.dispose(); } catch (e) { } }
        try { m.dispose(); } catch (e) { }
      }
    });
  }

  function clearRoot() {
    while (api.root.children.length) {
      var c = api.root.children.pop();
      disposeNode(c);
    }
    api.clickable.length = 0;
    api.draggables.length = 0;
    api.dragging = null;
  }

  /* ================= きりかえ ================= */

  var switching = false;

  function go(id, opts) {
    if (switching) return;
    if (!defs[id]) { console.warn('no scene', id); return; }
    switching = true;
    SND.shutUp();
    fadeEl.style.opacity = '1';
    setTimeout(function () {
      try { doSwitch(id, opts || {}); } catch (e) { console.error(e); }
      fadeEl.style.opacity = '0';
      switching = false;
    }, 330);
  }

  function doSwitch(id, opts) {
    if (cur && cur.exit) { try { cur.exit(); } catch (e) { console.error(e); } }
    U.killTweens();
    U.clearTimers();
    FX.clear();
    UI.clearRows();
    UI.clearTabs();
    UI.clearSteps();
    UI.clearTask();
    UI.taskMid(false);
    UI.hideHint();
    clearRoot();

    if (curId !== id) prevId = curId;
    curId = id;
    cur = defs[id];
    api.idle = 0;
    api.hintFn = null;
    api.paused = false;

    // キャラ を しょきち に
    api.char.group.position.set(0, 0, 0);
    api.char.group.rotation.set(0, 0, 0);
    api.char.group.scale.setScalar(1);
    api.char.group.visible = true;
    api.char.setPose('idle');
    api.char.setExpr('normal');
    api.char.walkSpeed = 0;
    api.char.lookAt(null);
    api.char.hold(null, 'L'); api.char.hold(null, 'R');
    api.pet.group.visible = false;
    api.pet.group.position.set(-1.0, 0, -0.4);
    api.pet.follow = null;

    // はいけい と ひかり を しょきち に
    setSky(0xffeaf3, 0xffd6e8);
    api.lights.hemi.intensity = 0.42;
    api.lights.dir.intensity = 0.52;
    api.lights.dir.position.set(3, 6, 4);
    api.lights.amb.intensity = 0.18;
    api.lights.amb.color.setHex(0xffffff);

    UI.setBackIcon(id === 'hub' ? '🗺️' : '🏠');

    if (cur.build) cur.build(api.root, opts);
    if (cur.enter) cur.enter(opts);

    if (cur.bgm) SND.startMusic(cur.bgm);
    layoutCamera();
  }

  function current() { return curId; }
  function currentDef() { return cur; }

  /* ================= そら ================= */

  var skyMesh = null;
  function setSky(top, bottom) {
    if (skyMesh) { api.scene.remove(skyMesh); disposeNode(skyMesh); skyMesh = null; }
    skyMesh = B.skyDome(top, bottom, 70);
    api.scene.add(skyMesh);
    api.scene.background = new THREE.Color(bottom);
    if (api.scene.fog) { api.scene.fog.color.setHex(bottom); }
  }

  /* ================= カメラ ================= */

  var view = { tx: 0, ty: 1.0, tz: 0, dist: 4.2, height: 1.6, yaw: 0, fov: 48 };
  var viewTarget = null;

  /**
   * setView({target:[x,y,z], dist, height, yaw, fov, instant})
   *  たてがめん では じどうで ひいて うつす。
   */
  function setView(o, instant) {
    var nv = {
      tx: o.target ? o.target[0] : view.tx,
      ty: o.target ? o.target[1] : view.ty,
      tz: o.target ? o.target[2] : view.tz,
      dist: o.dist != null ? o.dist : view.dist,
      height: o.height != null ? o.height : view.height,
      yaw: o.yaw != null ? o.yaw : view.yaw,
      fov: o.fov != null ? o.fov : view.fov
    };
    if (instant) {
      view = nv; viewTarget = null; layoutCamera();
    } else {
      viewTarget = nv;
    }
  }

  function layoutCamera() {
    var aspect = window.innerWidth / window.innerHeight;
    var cam = api.camera;
    cam.aspect = aspect;

    var dist = view.dist, height = view.height, fov = view.fov;
    if (aspect < 0.62) { dist *= 1.62; height *= 1.16; fov = Math.min(66, fov + 10); }
    else if (aspect < 0.85) { dist *= 1.36; height *= 1.1; fov = Math.min(62, fov + 6); }
    else if (aspect < 1.15) { dist *= 1.14; fov = Math.min(58, fov + 3); }
    else if (aspect > 2.0) { dist *= 0.94; }

    cam.fov = fov;
    cam.position.set(
      view.tx + Math.sin(view.yaw) * dist,
      view.ty + height,
      view.tz + Math.cos(view.yaw) * dist
    );
    cam.lookAt(view.tx, view.ty, view.tz);
    cam.updateProjectionMatrix();
  }

  function updateCamera(dt) {
    if (!viewTarget) return;
    var done = true;
    for (var k in viewTarget) {
      view[k] = U.damp(view[k], viewTarget[k], 4.5, dt);
      if (Math.abs(view[k] - viewTarget[k]) > 0.002) done = false;
    }
    layoutCamera();
    if (done) { view = viewTarget; viewTarget = null; }
  }

  /* ================= レイキャスト ================= */

  function setNDC(x, y) {
    ndc.x = (x / window.innerWidth) * 2 - 1;
    ndc.y = -(y / window.innerHeight) * 2 + 1;
  }

  function pick(x, y, objects, recursive) {
    setNDC(x, y);
    raycaster.setFromCamera(ndc, api.camera);
    var hits = raycaster.intersectObjects(objects || api.root.children, recursive !== false);
    return hits.length ? hits[0] : null;
  }

  var _plane = new THREE.Plane();
  var _out = new THREE.Vector3();

  function rayPlane(x, y, normal, constant) {
    setNDC(x, y);
    raycaster.setFromCamera(ndc, api.camera);
    _plane.set(normal || new THREE.Vector3(0, 1, 0), constant != null ? -constant : 0);
    var ok = raycaster.ray.intersectPlane(_plane, _out);
    return ok ? _out.clone() : null;
  }

  function rayY(x, y, yLevel) {
    return rayPlane(x, y, new THREE.Vector3(0, 1, 0), yLevel || 0);
  }

  function project(worldPos) {
    var v = worldPos.clone().project(api.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  /* ================= タップ たいしょう ================= */

  /**
   * addTap(obj, fn, opts)
   *  opts: {hint:bool, pop:bool, group:string, data}
   */
  function addTap(obj, fn, opts) {
    opts = opts || {};
    obj.userData.__tap = { fn: fn, opts: opts, obj: obj };
    api.clickable.push(obj);
    if (opts.pop !== false) {
      obj.userData.__baseScale = obj.scale.clone();
    }
    return obj;
  }

  function removeTap(obj) {
    var i = api.clickable.indexOf(obj);
    if (i >= 0) api.clickable.splice(i, 1);
    if (obj.userData) obj.userData.__tap = null;
  }

  function clearTaps() { api.clickable.length = 0; }

  function findTapRoot(o) {
    var n = o;
    while (n) {
      if (n.userData && n.userData.__tap) return n;
      n = n.parent;
    }
    return null;
  }

  function tapPop(obj) {
    var base = obj.userData.__baseScale || obj.scale.clone();
    obj.userData.__baseScale = base;
    U.tween({
      from: 0, to: 1, dur: 0.34, ease: 'outBack',
      onUpdate: function (v) {
        var k = 1 + Math.sin(v * Math.PI) * 0.22;
        obj.scale.set(base.x * k, base.y * k, base.z * k);
      },
      onDone: function () { obj.scale.copy(base); }
    });
  }

  /* ================= ドラッグ ================= */

  /**
   * addDrag(obj, {onGrab, onDrag(pos, ev), onDrop(pos), plane:yLevel, lift})
   */
  function addDrag(obj, o) {
    obj.userData.__drag = o || {};
    api.draggables.push(obj);
    return obj;
  }

  function findDragRoot(o) {
    var n = o;
    while (n) {
      if (n.userData && n.userData.__drag) return n;
      n = n.parent;
    }
    return null;
  }

  /* ================= にゅうりょく ================= */

  function onDown(x, y) {
    api.idle = 0;
    UI.hideHint();
    if (api.paused) return;
    if (cur && cur.onDown && cur.onDown(x, y) === true) return;

    // ドラッグ が さいゆうせん
    if (api.draggables.length) {
      var hitD = pick(x, y, api.draggables, true);
      if (hitD) {
        var dr = findDragRoot(hitD.object);
        if (dr) {
          api.dragging = dr;
          var d = dr.userData.__drag;
          dr.userData.__dragStart = dr.position.clone();
          if (d.onGrab) d.onGrab(dr, hitD.point);
          SND.play('grab');
          return;
        }
      }
    }
    if (api.clickable.length) {
      var hit = pick(x, y, api.clickable, true);
      if (hit) {
        var t = findTapRoot(hit.object);
        if (t && t.userData.__tap) {
          var info = t.userData.__tap;
          if (info.opts.pop !== false) tapPop(t);
          info.fn(t, hit.point, hit);
          return;
        }
      }
    }
    if (cur && cur.onMiss) cur.onMiss(x, y);
  }

  function onMove(x, y, down) {
    if (api.paused) return;
    if (down) api.idle = 0;
    if (api.dragging) {
      var d = api.dragging.userData.__drag;
      var lvl = d.plane != null ? d.plane : api.dragging.userData.__dragStart.y;
      var p = rayY(x, y, lvl);
      if (p) {
        if (d.onDrag) d.onDrag(api.dragging, p);
        else {
          api.dragging.position.x = p.x;
          api.dragging.position.z = p.z;
          if (d.lift) api.dragging.position.y = lvl + d.lift;
        }
      }
      return;
    }
    if (cur && cur.onMove) cur.onMove(x, y, down);
  }

  function onUp(x, y) {
    if (api.paused) return;
    if (api.dragging) {
      var obj = api.dragging;
      api.dragging = null;
      var d = obj.userData.__drag;
      var p = rayY(x, y, d.plane != null ? d.plane : obj.userData.__dragStart.y);
      if (d.onDrop) d.onDrop(obj, p || obj.position.clone());
      return;
    }
    if (cur && cur.onUp) cur.onUp(x, y);
  }

  /* ================= ヒント（4さい むけ おてほん） ================= */

  function setHint(fn) { api.hintFn = fn; api.idle = 0; }

  function hintObject(obj) {
    if (!obj) return;
    obj.updateMatrixWorld();
    var p = project(obj.getWorldPosition(new THREE.Vector3()));
    UI.hintAt(p.x, p.y);
  }

  function updateIdle(dt) {
    if (UI.anyOverlayOpen()) { api.idle = 0; return; }
    api.idle += dt;
    if (api.idle > 4.5 && api.hintFn && SAVE.data.opts.hints) {
      try { api.hintFn(); } catch (e) { }
      api.idle = 2.6;   // ときどき くりかえす
    }
  }

  /* ================= ごほうび ================= */

  function reward(stars, hearts, atPos) {
    if (stars) SAVE.addStars(stars);
    if (hearts) SAVE.addHearts(hearts);
    UI.updateCounters();
    SAVE.save();
    if (atPos) {
      FX.burst('gold', atPos, 10, { up: 2.2, size: 0.22 });
      if (hearts) FX.burst('heart', atPos, 6, { up: 2, size: 0.2 });
    }
  }

  function praise(pos, word) {
    var words = ['すごい！', 'じょうず！', 'やったね！', 'かわいい！', 'ばっちり！', 'てんさい！'];
    var w = word || U.pick(words);
    UI.big(U.pick(['🌟', '💖', '✨', '🎉', '👏']));
    if (pos) FX.celebrate(pos);
    SND.play('correct');
    SND.say(w);
    UI.toast(w);
  }

  function oops() {
    SND.play('wrong');
    SND.say('もういちど やってみよう');
    UI.toast('もう いちど やってみよう！');
  }

  /**
   * finish(mode, {stars, msg, reward, hearts, title})
   * けっかがめん を だし、シール と セーブ を しょり する。
   */
  function finish(mode, o) {
    o = o || {};
    var stars = U.clamp(o.stars != null ? o.stars : 3, 1, 3);
    var j = SAVE.recordJob(mode, stars);
    var rew = o.reward != null ? o.reward : (3 + stars * 2);
    var hearts = o.hearts != null ? o.hearts : 1;
    SAVE.addStars(rew);
    SAVE.addHearts(hearts);

    var st = STICKERS.forMode(mode, j.plays);
    var gotSticker = null;
    if (st && SAVE.giveSticker(st.id)) gotSticker = st;

    // とくべつ シール
    checkSpecials();
    SAVE.save();
    UI.updateCounters();

    api.paused = true;
    var pos = api.char.headPos();
    FX.celebrate(pos);
    api.char.celebrate();
    U.after(0.5, function () {
      UI.openResult({
        title: o.title || 'できたね！',
        stars: stars,
        reward: rew,
        hearts: hearts,
        sticker: gotSticker,
        msg: o.msg || (gotSticker ? 'あたらしい シールを ゲット！' : 'また あそぼうね！')
      });
    });
  }

  function checkSpecials() {
    if (SAVE.data.stars >= 50) SAVE.giveSticker('x2');
    if (SAVE.data.hearts >= 30) SAVE.giveSticker('x3');
    var modes = Object.keys(STICKERS.BY_MODE);
    var all = true;
    for (var i = 0; i < modes.length; i++) if (!SAVE.data.jobs[modes[i]]) all = false;
    if (all) SAVE.giveSticker('x5');
    if (SAVE.stickerCount() >= 40) SAVE.giveSticker('x6');
  }

  function giveSticker(id) {
    var s = STICKERS.get(id);
    if (!s) return false;
    if (!SAVE.giveSticker(id)) return false;
    SAVE.save();
    SND.play('unlock');
    UI.banner('シール ゲット！ ' + s.icon);
    UI.big(s.icon);
    FX.celebrate(api.char.headPos());
    return true;
  }

  /* ================= こうしん ================= */

  function update(dt, t) {
    api.time = t;
    updateCamera(dt);
    updateIdle(dt);
    if (cur && cur.update && !api.paused) {
      try { cur.update(dt, t); } catch (e) { console.error(e); }
    }
  }

  function resume() { api.paused = false; }

  /* ================= こうかい ================= */

  api.init = init;
  api.register = register;
  api.def = def;
  api.allDefs = allDefs;
  api.go = go;
  api.current = current;
  api.currentDef = currentDef;
  api.prev = function () { return prevId; };
  api.setSky = setSky;
  api.setView = setView;
  api.layoutCamera = layoutCamera;
  api.pick = pick;
  api.rayPlane = rayPlane;
  api.rayY = rayY;
  api.project = project;
  api.addTap = addTap;
  api.removeTap = removeTap;
  api.clearTaps = clearTaps;
  api.tapPop = tapPop;
  api.addDrag = addDrag;
  api.onDown = onDown;
  api.onMove = onMove;
  api.onUp = onUp;
  api.setHint = setHint;
  api.hintObject = hintObject;
  api.reward = reward;
  api.praise = praise;
  api.oops = oops;
  api.finish = finish;
  api.giveSticker = giveSticker;
  api.update = update;
  api.resume = resume;
  api.disposeNode = disposeNode;

  return api;
})();
