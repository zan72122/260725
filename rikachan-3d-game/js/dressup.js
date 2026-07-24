/* ================================================================
   dressup.js — おしゃれ（きせかえ）モード
   ================================================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  const TABS = [
    { cat: 'dress',     icon: '👗' },
    { cat: 'hairStyle', icon: '💇' },
    { cat: 'hairColor', icon: '🎨' },
    { cat: 'shoes',     icon: '👟' },
    { cat: 'hat',       icon: '👒' },
    { cat: 'acc',       icon: '🎀' },
  ];

  const RDressup = {
    group: null,
    char: null,
    activeTab: 'dress',
    rotY: 0,
    rotVel: 0,

    /* ---------------- モード開始 ---------------- */
    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xffd0e8);
      RWorld.scene.fog = new THREE.Fog(0xffd0e8, 15, 35);

      // ステージ（おしゃれルーム）
      const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 40), RWorld.mat(0xffe8f4));
      floor.rotation.x = -Math.PI / 2;
      g.add(floor);

      const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.25, 32), RWorld.mat(0xff9ecd));
      podium.position.y = 0.125;
      g.add(podium);
      const podiumTop = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.05, 32), RWorld.mat(0xfff0f8));
      podiumTop.position.y = 0.27;
      g.add(podiumTop);

      // うしろのハートアーチ
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI;
        const h = RWorld.makeHeart([0xff8ec7, 0xffd0e8, 0xffb3d9][i % 3], 2.2);
        h.position.set(Math.cos(a) * 3.4, Math.sin(a) * 3.2 + 0.4, -2.5);
        this.group.add(h);
      }
      // りょうサイドのハンガーラック
      [-3.1, 3.1].forEach((x, idx) => {
        const rack = new THREE.Group();
        const bar = RWorld.cyl(0.04, 0.04, 2.2, 0xd0a060, 10);
        bar.rotation.z = Math.PI / 2;
        bar.position.y = 2.1;
        rack.add(bar);
        [-0.9, 0.9].forEach((bx) => {
          const pole = RWorld.cyl(0.05, 0.06, 2.1, 0xd0a060, 10);
          pole.position.set(bx, 1.05, 0);
          rack.add(pole);
        });
        const dressColors = idx === 0 ? [0xff8ec7, 0x8fe3c0, 0xffd447] : [0x9ecdff, 0xc9a0f0, 0xff5a5a];
        dressColors.forEach((c, i) => {
          const d = RWorld.cone(0.28, 0.6, c);
          d.position.set(-0.65 + i * 0.65, 1.7, 0);
          rack.add(d);
        });
        rack.position.set(x, 0, -1.2);
        rack.rotation.y = x > 0 ? -0.4 : 0.4;
        g.add(rack);
      });

      // キャラクター
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.y = 0.3;
      g.add(this.char);
      this.rotY = 0;
      this.rotVel = 0;

      RWorld.snapCamera([0, 2.3, 5.8], [0, 1.1, 0]);
      RWorld.moveCamera([0, 2.1, 4.8], [0, 1.05, 0]);

      RAudio.playBGM('dressup');
      RUI.show('dressup-ui');
      this.buildTabs();
      this.buildItems();
      $('btn-dress-done').onclick = () => this.finish();
      RAudio.speak('どんなおしゃれにする？');
    },

    exit() {
      RUI.hide('dressup-ui');
      if (this.group) {
        RWorld.scene.remove(this.group);
        this.group = null;
        this.char = null;
      }
    },

    /* ---------------- タブとアイテム一覧 ---------------- */
    buildTabs() {
      const wrap = $('dressup-tabs');
      wrap.innerHTML = '';
      TABS.forEach((tb) => {
        const b = document.createElement('button');
        b.className = 'dtab' + (tb.cat === this.activeTab ? ' active' : '');
        b.textContent = tb.icon;
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          RAudio.sfx('tap');
          this.activeTab = tb.cat;
          wrap.querySelectorAll('.dtab').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          this.buildItems();
        });
        wrap.appendChild(b);
      });
    },

    buildItems() {
      const wrap = $('dressup-items');
      wrap.innerHTML = '';
      const cat = this.activeTab;
      const current = RSave.data.outfit[cat];
      RCharacter.Items[cat].forEach((item) => {
        const locked = item.locked && !RSave.isUnlocked(item.id);
        const b = document.createElement('button');
        b.className = 'ditem' + (item.id === current ? ' selected' : '') + (locked ? ' locked' : '');
        if (item.swatch) {
          const sw = document.createElement('div');
          sw.className = 'swatch';
          sw.style.background = item.swatch;
          b.appendChild(sw);
        } else {
          b.textContent = item.icon;
        }
        if (locked) {
          const p = document.createElement('span');
          p.className = 'price';
          p.textContent = '💗' + item.price;
          b.appendChild(p);
        }
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.pickItem(cat, item, b);
        });
        wrap.appendChild(b);
      });
    },

    pickItem(cat, item) {
      const locked = item.locked && !RSave.isUnlocked(item.id);
      if (locked) {
        if (RSave.data.coins >= item.price) {
          RSave.addCoins(-item.price);
          RSave.unlock(item.id);
          RAudio.sfx('gift');
          RUI.praise('おかいもの できた！');
        } else {
          RAudio.sfx('wrong');
          RAudio.speak('ハートを あつめてね');
          return;
        }
      } else {
        RAudio.sfx('sparkle');
      }
      RSave.setOutfit(cat, item.id);
      RCharacter.applyOutfit(this.char, RSave.data.outfit);
      RCharacter.setMood(this.char, 'happy', 0.9);
      if (this.char) {
        const p = this.char.position.clone();
        p.y += 1.3;
        RWorld.sparkleBurst(p, 14, 0xffd0f0);
      }
      this.buildItems();
    },

    /* ---------------- 「きめた！」 ---------------- */
    finish() {
      RAudio.sfx('fanfare');
      RAudio.sfx('camera');
      RUI.praise('とっても かわいい！');
      RWorld.confetti(new THREE.Vector3(0, 3.4, 0.5), 70);
      RCharacter.setMood(this.char, 'dance', 3.2);
      RSave.addCoins(1);
      // くるっとまわってポーズ
      this.rotVel = 9;
      setTimeout(() => { if (window.RMain) RMain.goHome(); }, 3400);
    },

    /* ---------------- 入力 ---------------- */
    onPointerDown(x, y) {
      // キャラをタップしたらよろこぶ
      const hits = RMain.raycast(x, y, this.char ? [this.char] : []);
      if (hits.length) {
        RAudio.sfx('boing');
        RCharacter.setMood(this.char, 'happy', 1);
        RWorld.heartBurst(this.char.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 4);
      }
    },
    onPointerMove(x, y, dx, dy, isDown) {
      if (isDown) this.rotVel = dx * 0.35;
    },
    onPointerUp() {},

    update(time, dt) {
      if (!this.char) return;
      this.rotY += this.rotVel * dt;
      this.rotVel *= Math.pow(0.05, dt);
      this.char.rotation.y = this.rotY;
      RCharacter.animate(this.char, time, dt);
    },

    /* ---------------- プレゼント用：ランダム解放 ---------------- */
    unlockRandomItem() {
      const candidates = [];
      Object.keys(RCharacter.Items).forEach((cat) => {
        RCharacter.Items[cat].forEach((item) => {
          if (item.locked && !RSave.isUnlocked(item.id)) candidates.push(item);
        });
      });
      if (!candidates.length) return null;
      const item = candidates[Math.floor(Math.random() * candidates.length)];
      RSave.unlock(item.id);
      return { icon: item.icon || '🎀', label: item.label };
    },
  };

  window.RDressup = RDressup;
})();
