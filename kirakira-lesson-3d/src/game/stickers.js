/* ============================================================
 * stickers.js — シールアルバム（ぜんぶで 48まい）
 * ============================================================ */
var STICKERS = (function () {
  'use strict';

  // モードごとに 4まい：1かいめ / 3かいめ / 6かいめ / 10かいめ
  var BY_MODE = {
    dressup: [
      { id: 'd1', icon: '👗', name: 'はじめての おしゃれ' },
      { id: 'd2', icon: '🎀', name: 'リボン だいすき' },
      { id: 'd3', icon: '💎', name: 'きらきら コーデ' },
      { id: 'd4', icon: '👑', name: 'おしゃれ めいじん' }
    ],
    runway: [
      { id: 'r1', icon: '🌟', name: 'はじめての ランウェイ' },
      { id: 'r2', icon: '📸', name: 'フラッシュ あびた' },
      { id: 'r3', icon: '🏆', name: 'グランプリ' },
      { id: 'r4', icon: '👸', name: 'スーパーモデル' }
    ],
    salon: [
      { id: 's1', icon: '💇', name: 'はじめての サロン' },
      { id: 's2', icon: '✂️', name: 'カット じょうず' },
      { id: 's3', icon: '💈', name: 'ヘアメイク はかせ' },
      { id: 's4', icon: '🌈', name: 'にじいろ ヘア' }
    ],
    cake: [
      { id: 'c1', icon: '🍰', name: 'はじめての ケーキ' },
      { id: 'c2', icon: '🍓', name: 'いちご もりもり' },
      { id: 'c3', icon: '🎂', name: 'バースデー ケーキ' },
      { id: 'c4', icon: '👩‍🍳', name: 'パティシエ' }
    ],
    flower: [
      { id: 'f1', icon: '💐', name: 'はじめての はなたば' },
      { id: 'f2', icon: '🌷', name: 'チューリップ' },
      { id: 'f3', icon: '🌻', name: 'ひまわり さん' },
      { id: 'f4', icon: '🏵️', name: 'フラワー マイスター' }
    ],
    icecream: [
      { id: 'i1', icon: '🍦', name: 'はじめての アイス' },
      { id: 'i2', icon: '🍨', name: 'トッピング だいすき' },
      { id: 'i3', icon: '🍧', name: 'たかづみ チャンプ' },
      { id: 'i4', icon: '🧁', name: 'スイーツ てんちょう' }
    ],
    vet: [
      { id: 'v1', icon: '🐶', name: 'はじめての おせわ' },
      { id: 'v2', icon: '🐱', name: 'ねこ と なかよし' },
      { id: 'v3', icon: '🩺', name: 'どうぶつ せんせい' },
      { id: 'v4', icon: '🦄', name: 'ゆめの おともだち' }
    ],
    clean: [
      { id: 'k1', icon: '🧹', name: 'はじめての おそうじ' },
      { id: 'k2', icon: '✨', name: 'ピカピカ' },
      { id: 'k3', icon: '🧽', name: 'そうじ たいちょう' },
      { id: 'k4', icon: '🏠', name: 'おうち ぴかぴか' }
    ],
    laundry: [
      { id: 'l1', icon: '🧺', name: 'はじめての おせんたく' },
      { id: 'l2', icon: '👕', name: 'たたみ めいじん' },
      { id: 'l3', icon: '☀️', name: 'おひさま の におい' },
      { id: 'l4', icon: '🌬️', name: 'せんたく はかせ' }
    ],
    cooking: [
      { id: 'o1', icon: '🍳', name: 'はじめての おりょうり' },
      { id: 'o2', icon: '🥕', name: 'やさい きりきり' },
      { id: 'o3', icon: '🍛', name: 'おいしい ごはん' },
      { id: 'o4', icon: '👩‍🍳', name: 'キッチン しゃちょう' }
    ],
    room: [
      { id: 'm1', icon: '🛋️', name: 'はじめての もようがえ' },
      { id: 'm2', icon: '🪴', name: 'グリーン だいすき' },
      { id: 'm3', icon: '🖼️', name: 'インテリア じょうず' },
      { id: 'm4', icon: '🏰', name: 'ゆめの おへや' }
    ],
    photo: [
      { id: 'p1', icon: '📷', name: 'はじめての しゃしん' },
      { id: 'p2', icon: '🤳', name: 'ポーズ きまった' },
      { id: 'p3', icon: '🖼️', name: 'アルバム づくり' },
      { id: 'p4', icon: '🎞️', name: 'カメラマン' }
    ]
  };

  // とくべつ シール
  var SPECIAL = [
    { id: 'x1', icon: '🎉', name: 'ようこそ！' },
    { id: 'x2', icon: '⭐', name: 'スター 50こ' },
    { id: 'x3', icon: '💖', name: 'ハート 30こ' },
    { id: 'x4', icon: '🛍️', name: 'はじめての おかいもの' },
    { id: 'x5', icon: '🌸', name: 'ぜんぶの おみせ に いった' },
    { id: 'x6', icon: '🦋', name: 'キラキラ マスター' }
  ];

  var list = [];
  var byId = {};
  Object.keys(BY_MODE).forEach(function (m) {
    BY_MODE[m].forEach(function (s) { s.mode = m; list.push(s); byId[s.id] = s; });
  });
  SPECIAL.forEach(function (s) { s.mode = 'special'; list.push(s); byId[s.id] = s; });

  var THRESH = [1, 3, 6, 10];

  /** そのモードを plays かい あそんだ ときに もらえる シール（なければ null） */
  function forMode(mode, plays) {
    var arr = BY_MODE[mode];
    if (!arr) return null;
    for (var i = 0; i < THRESH.length; i++) {
      if (plays === THRESH[i]) return arr[i];
    }
    return null;
  }

  function get(id) { return byId[id]; }

  return { list: list, byId: byId, forMode: forMode, get: get, BY_MODE: BY_MODE, SPECIAL: SPECIAL };
})();
