/* ============================================================
 * care.js — 痕跡と連鎖の統一管理（場面をまたいで持続する状態）
 *  ・服のシミ（原因つき）→ 洗濯 / おふろへの連鎖
 *  ・からだの汚れ（原因つき）/ 口まわりの汚れ / ぬれた体
 *  ・おもちゃの散らかり → お片付け
 *  ・はだか / パジャマ / 天気
 * あわせて、各アクティビティ共通のヘルパー(AX)もここに置く
 * ============================================================ */
(function () {
  'use strict';

  var SAVE_KEY = 'babycare3d_care_v2';

  var state = {
    weather: 'sunny',        // 'sunny' | 'rain' … セッションごとに抽選
    naked: false,            // おふろのあと、きせかえまでおむつ姿
    outfitStyle: 'normal',   // 'normal' | 'rain' | 'pajama'
    bibOn: false,            // スタイ
    clothesStains: [],       // いま着ている服のシミ ['food','juice',...]
    bodyDirt: [],            // からだの汚れの原因 ['food','play',...]
    mouthDirt: 0,            // 口まわりの汚れ 0..1
    wet: false,              // おふろ上がりでまだ拭けていない
    toysOut: 0,              // 散らかっているおもちゃの数
    fedSinceBath: 0,         // おふろ後に食べた回数（→次のおふろの汚れ）
    playedSinceBath: 0,      // おふろ後に遊んだ回数
    wardrobe: {},            // 服の状態 { key: 'clean'|'dirty'|'wet' }  key=色hex or 'rain'/'pajama'
    teethDirty: true         // ねんね前の歯みがきが必要か
  };

  var OUTFIT_KEYS = ['ffd44d', 'ff6fa5', '7fd8ff', '9dff8a', 'c9a6ff', 'ffab6b', 'rain', 'pajama'];

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        for (var k in state) if (d[k] !== undefined) state[k] = d[k];
      }
    } catch (e) { /* こわれたセーブは無視 */ }
    // ワードローブの初期化（未知キーを補完）
    OUTFIT_KEYS.forEach(function (k) {
      if (!state.wardrobe[k]) state.wardrobe[k] = 'clean';
    });
    // 天気はセッションごとに抽選（雨は3回に1回くらい）
    state.weather = Math.random() < 0.34 ? 'rain' : 'sunny';
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { /* プライベートモードでは保存しない */ }
  }

  window.CARE = {
    state: state,
    load: load,
    save: save,
    OUTFIT_KEYS: OUTFIT_KEYS,

    /* 服にシミがつく（スタイをしていればスタイが受け止める） */
    stainClothes: function (type) {
      if (state.naked) return false;
      if (state.bibOn) return false; // スタイがガード
      state.clothesStains.push(type);
      save();
      return true;
    },

    /* いま着ている服が汚れているか */
    clothesDirty: function () { return state.clothesStains.length > 0; },

    /* おふろで洗うべき汚れリストを作る（原因と場所が一致する） */
    buildBathDirt: function () {
      var dirt = [];
      var i;
      for (i = 0; i < Math.min(3, state.fedSinceBath + 1); i++) {
        dirt.push({ cause: 'food', zone: 'face' });   // たべこぼし → 顔まわり・むね
      }
      if (state.mouthDirt > 0.2) dirt.push({ cause: 'food', zone: 'face' });
      for (i = 0; i < Math.min(3, state.playedSinceBath + 1); i++) {
        dirt.push({ cause: 'play', zone: 'hands' });  // あそび → 手・ひざ
      }
      dirt.push({ cause: 'dust', zone: 'body' });     // ふつうのほこり
      if (state.weather === 'rain') dirt.push({ cause: 'mud', zone: 'feet' });
      return dirt;
    },

    /* おふろ完了：からだ関連の痕跡をリセット */
    finishBath: function () {
      state.bodyDirt = [];
      state.mouthDirt = 0;
      state.fedSinceBath = 0;
      state.playedSinceBath = 0;
      state.wet = true;   // まだ拭いていない
      save();
    }
  };

  /* ============================================================
   * AX — アクティビティ共通ヘルパー
   * ============================================================ */
  var G = null;

  window.AX = {
    setG: function (g) { G = g; },
    get G() { return G; },

    lambert: function (color) { return new THREE.MeshLambertMaterial({ color: color }); },

    emojiSprite: function (emoji, scale) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.emojiTexture(emoji, 128), transparent: true }));
      sp.scale.set(scale, scale, 1);
      return sp;
    },

    removeAll: function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].parent) list[i].parent.remove(list[i]);
      }
      list.length = 0;
    },

    headWorld: function () {
      var v = new THREE.Vector3();
      G.baby.head.getWorldPosition(v);
      return v;
    },

    mouthWorld: function () {
      var v = new THREE.Vector3(0, -0.09, 0.26);
      G.baby.head.localToWorld(v);
      return v;
    },

    chestWorld: function () {
      var v = new THREE.Vector3();
      G.baby.torso.getWorldPosition(v);
      return v;
    },

    /* 複数の候補から「いちばん手前」のものを選ぶピック（奥のものの横取りを防ぐ） */
    pickBest: function (x, y, specs) {
      var best = null;
      for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.objects || !s.objects.length) continue;
        var hit = G.pick(x, y, s.objects, s.recursive !== false);
        if (hit && (!best || hit.distance < best.hit.distance)) {
          best = { key: s.key, hit: hit };
        }
      }
      return best;
    },

    /* ちいさな部品用の見えないあたり判定（こどもの指でもタップしやすく） */
    hitProxy: function (radius) {
      return new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
    },

    /* キャンバスにお絵かきしてテクスチャ化 */
    canvasTexture: function (size, drawFn) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var g = c.getContext('2d');
      drawFn(g, size);
      var tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return { canvas: c, ctx: g, tex: tex };
    }
  };

  window.ACTIVITIES = { init: function (ctx) { AX.setG(ctx); } };
})();
