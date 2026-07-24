/* ================================================================
   save.js — localStorage セーブ／ロード
   ================================================================ */
(function () {
  const KEY = 'rinachan-save-v1';

  const DEFAULT = {
    coins: 3,
    stamps: 0,
    totalStamps: 0,
    unlocked: [],          // アイテムid の配列
    outfit: {
      hairStyle: 'twin',
      hairColor: '#8a5a2b',
      dress: 'dress_pink',
      shoes: 'shoes_red',
      hat: 'hat_none',
      acc: 'acc_ribbon_pink',
    },
    soundOn: true,
    voiceOn: true,
    trips: {},        // おでかけした かいすう（2かいめから みちのり短縮）
    freshWash: false, // せんたくしたての ふくが タンスに ある
  };

  const RSave = {
    data: null,

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          this.data = Object.assign({}, DEFAULT, d);
          this.data.outfit = Object.assign({}, DEFAULT.outfit, d.outfit || {});
        } else {
          this.data = JSON.parse(JSON.stringify(DEFAULT));
        }
      } catch (e) {
        this.data = JSON.parse(JSON.stringify(DEFAULT));
      }
      return this.data;
    },

    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* no-op */ }
    },

    addCoins(n) {
      this.data.coins = Math.max(0, this.data.coins + n);
      this.save();
      if (window.RUI) RUI.updateTopbar();
    },

    // スタンプを1つ追加。10個たまったら true（プレゼント）
    addStamp() {
      this.data.stamps++;
      this.data.totalStamps++;
      let present = false;
      if (this.data.stamps >= 10) {
        this.data.stamps = 0;
        present = true;
      }
      this.save();
      if (window.RUI) RUI.updateTopbar();
      return present;
    },

    isUnlocked(id) { return this.data.unlocked.indexOf(id) !== -1; },
    unlock(id) {
      if (!this.isUnlocked(id)) { this.data.unlocked.push(id); this.save(); }
    },

    setOutfit(part, id) {
      this.data.outfit[part] = id;
      this.save();
    },
  };

  window.RSave = RSave;
})();
