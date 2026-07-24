/* ================================================================
   ui.js — HTMLオーバーレイUI ヘルパー
   ================================================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  const PRAISES = [
    'すごーい！', 'かわいい！', 'じょうずだね！', 'やったね！',
    'すてき〜！', 'ばっちり！', 'えらいね！', 'さいこう！',
  ];

  const RUI = {
    /* ---------- 表示切り替え ---------- */
    show(id) { $(id).classList.remove('hidden'); },
    hide(id) { $(id).classList.add('hidden'); },

    hideAllGameUI() {
      ['homenav', 'dressup-ui', 'minigame-ui', 'submenu', 'reward', 'stampcard', 'present', 'stampanim'].forEach(RUI.hide);
      RUI.hide('mg-guide'); RUI.hide('mg-toolbar'); RUI.hide('mg-action');
      $('mg-toolbar').innerHTML = '';
      RUI.hideSkip();
    },

    /* ---------- スキップボタン（おでかけ・じゅんび を とばす） ---------- */
    showSkip(onTap) {
      const b = $('btn-skip');
      b.classList.remove('hidden');
      b.onclick = () => { RAudio.sfx('tap'); onTap(); };
    },
    hideSkip() {
      const b = $('btn-skip');
      b.classList.add('hidden');
      b.onclick = null;
    },

    /* ---------- 上部バー ---------- */
    updateTopbar() {
      $('coin-count').textContent = RSave.data.coins;
      $('stamp-count').textContent = RSave.data.stamps;
      $('btn-sound').classList.toggle('off', !RSave.data.soundOn);
      $('btn-voice').classList.toggle('off', !RSave.data.voiceOn);
    },

    /* ---------- ほめポップアップ ---------- */
    praise(text) {
      const t = text || PRAISES[Math.floor(Math.random() * PRAISES.length)];
      const el = $('praise');
      el.classList.add('hidden');
      // アニメーションをリスタート
      void el.offsetWidth;
      $('praise-text').textContent = t;
      el.classList.remove('hidden');
      RAudio.speak(t);
      clearTimeout(RUI._praiseTimer);
      RUI._praiseTimer = setTimeout(() => el.classList.add('hidden'), 1700);
    },

    /* ---------- ミニゲームガイド ---------- */
    guide(text) {
      const el = $('mg-guide');
      if (!text) { el.classList.add('hidden'); return; }
      el.textContent = text;
      el.classList.remove('hidden');
    },

    /* ---------- ツールバー（絵文字ボタン列） ---------- */
    // items: [{icon, id}], onPick(id, btnEl)
    toolbar(items, onPick, opts) {
      const bar = $('mg-toolbar');
      bar.innerHTML = '';
      items.forEach((it) => {
        const b = document.createElement('button');
        b.className = 'tool-btn';
        b.textContent = it.icon;
        b.dataset.id = it.id;
        if (it.selected) b.classList.add('selected');
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          RAudio.unlock();
          RAudio.sfx('tap');
          if (opts && opts.radio) {
            bar.querySelectorAll('.tool-btn').forEach((x) => x.classList.remove('selected'));
            b.classList.add('selected');
          }
          onPick(it.id, b);
        });
        bar.appendChild(b);
      });
      bar.classList.remove('hidden');
    },

    /* ---------- 「かんせい」等のアクションボタン ---------- */
    actionBtn(label, onTap, withToolbar) {
      const b = $('mg-action');
      b.textContent = label;
      b.classList.remove('hidden');
      b.classList.toggle('with-toolbar', !!withToolbar);
      b.onclick = () => { RAudio.sfx('tap'); onTap(); };
    },
    hideActionBtn() { $('mg-action').classList.add('hidden'); },

    /* ---------- サブメニュー ---------- */
    // cards: [{icon, label, id}]
    submenu(title, cards, onPick) {
      $('submenu-title').textContent = title;
      const wrap = $('submenu-cards');
      wrap.innerHTML = '';
      cards.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'submenu-card';
        b.innerHTML = `<span class="card-icon">${c.icon}</span><span class="card-label">${c.label}</span>`;
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          RAudio.sfx('pop');
          RUI.hide('submenu');
          onPick(c.id);
        });
        wrap.appendChild(b);
      });
      RUI.show('submenu');
    },

    /* ---------- ごほうび画面 ---------- */
    reward(coins, onDone) {
      $('reward-coins').textContent = '💗 +' + coins;
      RUI.show('reward');
      RAudio.sfx('fanfare');
      RAudio.speak('よくできました！');
      $('reward-ok').onclick = () => {
        RAudio.sfx('coin');
        RUI.hide('reward');
        RSave.addCoins(coins);
        const present = RSave.addStamp();
        if (present) {
          RUI.showPresent(onDone);
        } else if (onDone) onDone();
      };
    },

    /* ---------- スタンプカード ---------- */
    showStampCard() {
      const grid = $('stamp-grid');
      grid.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const c = document.createElement('div');
        c.className = 'stamp-cell' + (i < RSave.data.stamps ? ' filled' : '');
        c.textContent = i < RSave.data.stamps ? '🌟' : '';
        grid.appendChild(c);
      }
      RUI.show('stampcard');
    },

    /* ---------- プレゼント演出 ---------- */
    showPresent(onDone) {
      const gift = $('present-gift');
      const text = $('present-text');
      const ok = $('present-ok');
      gift.textContent = '🎁';
      gift.classList.remove('opened');
      text.classList.add('hidden');
      ok.classList.add('hidden');
      RUI.show('present');
      RAudio.speak('プレゼントだよ！あけてみて！');

      const itemInfo = window.RDressup ? RDressup.unlockRandomItem() : null;

      gift.onclick = () => {
        gift.onclick = null;
        RAudio.sfx('gift');
        gift.classList.add('opened');
        setTimeout(() => {
          gift.textContent = '';
          const rev = document.createElement('div');
          rev.className = 'present-reveal';
          rev.textContent = itemInfo ? itemInfo.icon : '💖';
          gift.appendChild(rev);
          text.textContent = itemInfo ? 'あたらしい「' + itemInfo.label + '」ゲット！' : 'ハート いっぱい！';
          text.classList.remove('hidden');
          ok.classList.remove('hidden');
          RAudio.sfx('fanfare');
          RAudio.speak(itemInfo ? 'あたらしい ' + itemInfo.label + ' ゲット！' : 'ハートいっぱい！');
          if (!itemInfo) RSave.addCoins(10);
        }, 650);
      };
      ok.onclick = () => {
        RUI.hide('present');
        if (onDone) onDone();
      };
    },
  };

  window.RUI = RUI;
})();
