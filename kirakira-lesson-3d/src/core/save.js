/* ============================================================
 * save.js — セーブデータ（localStorage）
 * ============================================================ */
var SAVE = (function () {
  'use strict';

  var KEY = 'kirakira-lesson-3d.v1';

  var DEFAULT = {
    v: 1,
    stars: 12,
    hearts: 0,
    day: 1,
    name: 'ひまり',
    stickers: {},         // id -> true
    owned: {},            // wardrobe item id -> true
    outfit: {
      hair: 'twin', hairColor: 'brown',
      top: 'tee', topColor: 'pink',
      bottom: 'flare', bottomColor: 'sky',
      shoes: 'sneaker', shoesColor: 'white',
      acc: 'ribbon', accColor: 'pink',
      eye: 'brown'
    },
    coords: [null, null, null, null],   // ほぞんした コーデ 4つ
    room: null,                          // おへや デコの はいち
    jobs: {},                            // mode -> {plays, best, level}
    photos: 0,
    opts: { sound: true, voice: true, hints: true },
    seen: {}                             // はじめて フラグ
  };

  var data = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function merge(base, over) {
    var out = clone(base);
    if (!over || typeof over !== 'object') return out;
    for (var k in over) {
      if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) &&
        over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) {
        out[k] = merge(out[k], over[k]);
      } else if (over[k] !== undefined) {
        out[k] = over[k];
      }
    }
    return out;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    data = merge(DEFAULT, parsed);
    return data;
  }

  var dirty = false;

  function save() {
    if (!data) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); dirty = false; } catch (e) { }
  }

  function touch() { dirty = true; }
  function flush() { if (dirty) save(); }

  function reset() {
    data = clone(DEFAULT);
    save();
    return data;
  }

  /* ---------- べんりメソッド ---------- */

  function addStars(n) {
    data.stars = Math.max(0, data.stars + n);
    touch();
    return data.stars;
  }

  function addHearts(n) {
    data.hearts = Math.max(0, data.hearts + n);
    touch();
    return data.hearts;
  }

  function spend(n) {
    if (data.stars < n) return false;
    data.stars -= n; touch();
    return true;
  }

  function own(id) { return !!data.owned[id]; }
  function buy(id) { data.owned[id] = true; touch(); }

  function hasSticker(id) { return !!data.stickers[id]; }
  function giveSticker(id) {
    if (data.stickers[id]) return false;
    data.stickers[id] = true; touch();
    return true;
  }
  function stickerCount() { return Object.keys(data.stickers).length; }

  function job(mode) {
    if (!data.jobs[mode]) { data.jobs[mode] = { plays: 0, best: 0, level: 1 }; touch(); }
    return data.jobs[mode];
  }

  function recordJob(mode, score) {
    var j = job(mode);
    j.plays++;
    if (score > j.best) j.best = score;
    j.level = Math.min(9, 1 + Math.floor(j.plays / 3));
    touch();
    return j;
  }

  function firstTime(key) {
    if (data.seen[key]) return false;
    data.seen[key] = true; touch();
    return true;
  }

  return {
    load: load, save: save, touch: touch, flush: flush, reset: reset,
    get data() { return data; },
    addStars: addStars, addHearts: addHearts, spend: spend,
    own: own, buy: buy,
    hasSticker: hasSticker, giveSticker: giveSticker, stickerCount: stickerCount,
    job: job, recordJob: recordJob, firstTime: firstTime
  };
})();
