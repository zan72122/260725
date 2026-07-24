/* ============================================================
 * ui.js — HUD / メーター / スター / シールずかん / ふきだし
 * ============================================================ */
(function () {
  'use strict';

  var STICKERS = ['🐶', '🐱', '🐰', '🐼', '🦁', '🐸', '🐧', '🦄', '🐢', '🐬', '🦊', '🐥'];
  var STARS_PER_STICKER = 5;
  var SAVE_KEY = 'babycare3d_save_v1';

  var els = {};
  var state = {
    stars: 0,
    stickerCount: 0,
    outfitColor: 0xffd44d,
    hat: 'none',
    meters: { food: 0.8, clean: 0.8, happy: 0.8, sleep: 0.9 }
  };

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (typeof d.stars === 'number') state.stars = d.stars;
        if (typeof d.stickerCount === 'number') state.stickerCount = d.stickerCount;
        if (typeof d.outfitColor === 'number') state.outfitColor = d.outfitColor;
        if (typeof d.hat === 'string') state.hat = d.hat;
        if (d.meters) {
          for (var k in state.meters) {
            if (typeof d.meters[k] === 'number') state.meters[k] = d.meters[k];
          }
        }
      }
    } catch (e) { /* セーブ破損時は初期状態で開始 */ }
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        stars: state.stars,
        stickerCount: state.stickerCount,
        outfitColor: state.outfitColor,
        hat: state.hat,
        meters: state.meters
      }));
    } catch (e) { /* プライベートモード等では保存しない */ }
  }

  function setMeter(name, v) {
    state.meters[name] = Math.max(0, Math.min(1, v));
    var el = els.meters[name];
    if (!el) return;
    el.querySelector('.fill').style.width = (state.meters[name] * 100) + '%';
    el.classList.toggle('low', state.meters[name] < 0.3);
  }

  function refreshMeters() {
    for (var k in state.meters) setMeter(k, state.meters[k]);
  }

  function updateStarDisplay() {
    els.starCount.textContent = state.stars;
  }

  function addStars(n, onSticker) {
    var before = Math.floor(state.stars / STARS_PER_STICKER);
    state.stars += n;
    var after = Math.floor(state.stars / STARS_PER_STICKER);
    updateStarDisplay();
    els.starBox.classList.remove('bump');
    void els.starBox.offsetWidth; // アニメ再トリガ
    els.starBox.classList.add('bump');
    SND.play('star');
    if (after > before && state.stickerCount < STICKERS.length) {
      state.stickerCount = Math.min(STICKERS.length, state.stickerCount + (after - before));
      setTimeout(function () {
        celebrate('🎉 あたらしいシール！ ' + STICKERS[state.stickerCount - 1]);
        SND.play('tada');
        if (onSticker) onSticker();
      }, 500);
    }
    save();
  }

  function bigFeedback(emoji) {
    els.bigFeedback.textContent = emoji;
    els.bigFeedback.classList.remove('show');
    void els.bigFeedback.offsetWidth;
    els.bigFeedback.classList.add('show');
  }

  function celebrate(text) {
    els.celebrate.textContent = text;
    els.celebrate.classList.remove('show');
    void els.celebrate.offsetWidth;
    els.celebrate.classList.add('show');
  }

  function showThought(emoji, x, y) {
    els.thought.textContent = emoji;
    els.thought.classList.add('show');
    if (x != null) {
      els.thought.style.left = x + 'px';
      els.thought.style.top = y + 'px';
    }
  }

  function hideThought() {
    els.thought.classList.remove('show');
  }

  function setContext(buttons, onTap) {
    els.contextPanel.innerHTML = '';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'ctx-btn' + (b.selected ? ' selected' : '');
      btn.textContent = b.emoji;
      if (b.color) btn.style.background = b.color;
      btn.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        onTap(b.id, btn);
      });
      els.contextPanel.appendChild(btn);
    });
  }

  function clearContext() {
    els.contextPanel.innerHTML = '';
  }

  function setActiveActivity(name) {
    els.actBtns.forEach(function (b) {
      b.classList.toggle('active', b.dataset.act === name);
    });
  }

  function setNeedy(act, needy) {
    els.actBtns.forEach(function (b) {
      if (b.dataset.act === act) b.classList.toggle('needy', needy);
    });
  }

  function renderStickerBook() {
    els.stickerGrid.innerHTML = '';
    for (var i = 0; i < STICKERS.length; i++) {
      var slot = document.createElement('div');
      var unlocked = i < state.stickerCount;
      slot.className = 'sticker-slot' + (unlocked ? '' : ' locked');
      slot.textContent = unlocked ? STICKERS[i] : '❓';
      if (i === state.stickerCount - 1 && unlocked) slot.classList.add('new');
      els.stickerGrid.appendChild(slot);
    }
    var next = STARS_PER_STICKER - (state.stars % STARS_PER_STICKER);
    if (state.stickerCount >= STICKERS.length) {
      els.stickerProgress.textContent = '🌟 ぜんぶあつめたね！すごい！ 🌟';
    } else {
      els.stickerProgress.textContent = 'つぎのシールまで ⭐×' + next;
    }
  }

  function openStickerBook() {
    renderStickerBook();
    els.stickerBook.classList.add('open');
    SND.play('chime');
  }

  function closeStickerBook() {
    els.stickerBook.classList.remove('open');
    SND.play('tap');
  }

  function init(callbacks) {
    load();
    els.hud = document.getElementById('hud');
    els.meters = {
      food: document.getElementById('m-food'),
      clean: document.getElementById('m-clean'),
      happy: document.getElementById('m-happy'),
      sleep: document.getElementById('m-sleep')
    };
    els.starBox = document.getElementById('star-box');
    els.starCount = document.getElementById('star-count');
    els.bigFeedback = document.getElementById('big-feedback');
    els.celebrate = document.getElementById('celebrate');
    els.thought = document.getElementById('thought');
    els.contextPanel = document.getElementById('context-panel');
    els.stickerBook = document.getElementById('sticker-book');
    els.stickerGrid = document.getElementById('sticker-grid');
    els.stickerProgress = document.getElementById('sticker-progress');
    els.actBtns = Array.prototype.slice.call(document.querySelectorAll('.act-btn'));

    els.actBtns.forEach(function (b) {
      b.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        callbacks.onActivity(b.dataset.act);
      });
    });

    var soundBtn = document.getElementById('sound-btn');
    soundBtn.addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      var m = !SND.isMuted();
      SND.setMuted(m);
      soundBtn.textContent = m ? '🔇' : '🔊';
      if (!m) SND.play('tap');
    });

    document.getElementById('book-btn').addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      openStickerBook();
    });
    document.getElementById('sticker-close').addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      closeStickerBook();
    });
    els.stickerBook.addEventListener('pointerdown', function (ev) {
      if (ev.target === els.stickerBook) closeStickerBook();
    });

    updateStarDisplay();
    refreshMeters();
  }

  window.UI = {
    init: init,
    show: function () { els.hud.classList.add('visible'); },
    state: state,
    save: save,
    setMeter: setMeter,
    refreshMeters: refreshMeters,
    addStars: addStars,
    bigFeedback: bigFeedback,
    celebrate: celebrate,
    showThought: showThought,
    hideThought: hideThought,
    setContext: setContext,
    clearContext: clearContext,
    setActiveActivity: setActiveActivity,
    setNeedy: setNeedy,
    openStickerBook: openStickerBook
  };
})();
