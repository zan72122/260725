/* ================================================================
   main.js — ゲーム全体の制御（モード切替・入力・ループ）
   ================================================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  /* ================================================
     おうち（ホーム）モード
     ================================================ */
  const RHome = {
    group: null, char: null, cat: null, catTarget: null,

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xffe3f2);
      RWorld.scene.fog = new THREE.Fog(0xffe3f2, 16, 36);

      RWorld.buildHomeRoom(g);

      // リナちゃん
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(0, 0, 0.8);
      g.add(this.char);
      RCharacter.setMood(this.char, 'idle');

      // ねこのミルク
      this.cat = RWorld.buildCat();
      this.cat.position.set(2, 0, 1.5);
      g.add(this.cat);
      this.catTarget = new THREE.Vector3(2, 0, 1.5);
      this.catTimer = 2;

      RWorld.snapCamera([0, 3.2, 8.2], [0, 1.2, 0]);
      RWorld.moveCamera([0, 2.6, 6.8], [0, 1.2, 0]);
      RAudio.playBGM('home');
      RUI.show('homenav');
      RUI.show('topbar');
    },

    exit() {
      RUI.hide('homenav');
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.cat = null;
    },

    onPointerDown(x, y) {
      const targets = [];
      if (this.char) targets.push(this.char);
      if (this.cat) targets.push(this.cat);
      const hits = RMain.raycast(x, y, targets);
      if (!hits.length) return;
      let obj = hits[0].object;
      while (obj && obj !== this.char && obj !== this.cat) obj = obj.parent;
      if (obj === this.char) {
        RAudio.sfx('boing');
        RCharacter.setMood(this.char, 'happy', 1.2);
        RWorld.heartBurst(this.char.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 5);
        const lines = ['えへへ！', 'こんにちは！', 'あそぼ！', 'だーいすき！'];
        RAudio.speak(lines[Math.floor(Math.random() * lines.length)]);
      } else if (obj === this.cat) {
        RAudio.sfx('meow');
        RWorld.heartBurst(this.cat.position.clone().add(new THREE.Vector3(0, 1, 0)), 3);
        this.cat.userData.jump = 0.6;
      }
    },
    onPointerMove() {}, onPointerUp() {},

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      // ねこのおさんぽ
      if (this.cat) {
        this.catTimer -= dt;
        if (this.catTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 2.5;
          this.catTarget.set(Math.cos(a) * r, 0, Math.abs(Math.sin(a)) * r * 0.8 + 0.5);
          this.catTimer = 3 + Math.random() * 4;
        }
        const dir = this.catTarget.clone().sub(this.cat.position);
        dir.y = 0;
        if (dir.length() > 0.1) {
          dir.normalize();
          this.cat.position.addScaledVector(dir, dt * 0.8);
          this.cat.rotation.y = Math.atan2(dir.x, dir.z);
          this.cat.position.y = Math.abs(Math.sin(time * 8)) * 0.05;
        }
        if (this.cat.userData.jump > 0) {
          this.cat.userData.jump -= dt;
          this.cat.position.y = Math.abs(Math.sin(this.cat.userData.jump * Math.PI / 0.6)) * 0.4;
        }
        if (this.cat.userData.tail) this.cat.userData.tail.rotation.z = Math.sin(time * 3) * 0.3;
      }
    },
  };

  /* ================================================
     メイン制御
     ================================================ */
  const RMain = {
    mode: null,
    modeName: '',
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),

    modes: {},

    init() {
      RSave.load();
      RWorld.init($('game-canvas'));

      this.modes = {
        home: RHome,
        dressup: RDressup,
        job_cake: RJobCake,
        job_idol: RJobIdol,
        job_flower: RJobFlower,
        help_clean: RHelpClean,
        help_laundry: RHelpLaundry,
        help_cook: RHelpCook,
      };

      RAudio.soundOn = RSave.data.soundOn;
      RAudio.voiceOn = RSave.data.voiceOn;

      this.bindUI();
      this.bindPointer();
      this.startLoop();

      // タイトルの背景（おうちをうっすら表示）
      RHome.enter();
      RUI.hide('homenav');
      RUI.hide('topbar');
    },

    bindUI() {
      $('btn-start').addEventListener('pointerdown', () => {
        RAudio.unlock();
        RAudio.sfx('fanfare');
        $('screen-title').classList.add('hidden');
        RUI.show('topbar');
        RUI.show('homenav');
        RUI.updateTopbar();
        RAudio.playBGM('home');
        RAudio.speak('リナちゃんのおうちへ ようこそ！');
      });

      $('btn-home').addEventListener('pointerdown', () => {
        RAudio.sfx('tap');
        this.goHome();
      });

      $('btn-sound').addEventListener('pointerdown', () => {
        RSave.data.soundOn = !RSave.data.soundOn;
        RSave.save();
        RAudio.setSound(RSave.data.soundOn);
        RUI.updateTopbar();
      });

      $('btn-voice').addEventListener('pointerdown', () => {
        RSave.data.voiceOn = !RSave.data.voiceOn;
        RSave.save();
        RAudio.voiceOn = RSave.data.voiceOn;
        RUI.updateTopbar();
        if (RSave.data.voiceOn) RAudio.speak('おしゃべりするね！');
      });

      $('stamp-box').addEventListener('pointerdown', () => {
        RAudio.sfx('tap');
        RUI.showStampCard();
      });
      $('stamp-close').addEventListener('pointerdown', () => {
        RAudio.sfx('tap');
        RUI.hide('stampcard');
      });
      $('submenu-close').addEventListener('pointerdown', () => {
        RAudio.sfx('tap');
        RUI.hide('submenu');
      });

      document.querySelectorAll('.nav-btn').forEach((b) => {
        b.addEventListener('pointerdown', () => {
          RAudio.unlock();
          RAudio.sfx('pop');
          const nav = b.dataset.nav;
          if (nav === 'dressup') {
            this.switchMode('dressup');
          } else if (nav === 'jobs') {
            RUI.submenu('どの おしごとに する？', [
              { icon: '🎂', label: 'ケーキやさん', id: 'job_cake' },
              { icon: '🎤', label: 'アイドル', id: 'job_idol' },
              { icon: '💐', label: 'おはなやさん', id: 'job_flower' },
            ], (id) => this.switchMode(id));
          } else if (nav === 'help') {
            RUI.submenu('どの おてつだいに する？', [
              { icon: '🧹', label: 'おそうじ', id: 'help_clean' },
              { icon: '👕', label: 'おせんたく', id: 'help_laundry' },
              { icon: '🥞', label: 'パンケーキ', id: 'help_cook' },
            ], (id) => this.switchMode(id));
          }
        });
      });
    },

    bindPointer() {
      const canvas = $('game-canvas');
      let isDown = false;
      let lastX = 0, lastY = 0;

      canvas.addEventListener('pointerdown', (e) => {
        RAudio.unlock();
        isDown = true;
        lastX = e.clientX; lastY = e.clientY;
        if (this.mode && this.mode.onPointerDown) this.mode.onPointerDown(e.clientX, e.clientY);
      });
      canvas.addEventListener('pointermove', (e) => {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (this.mode && this.mode.onPointerMove) this.mode.onPointerMove(e.clientX, e.clientY, dx, dy, isDown);
      });
      const up = (e) => {
        isDown = false;
        if (this.mode && this.mode.onPointerUp) this.mode.onPointerUp(e.clientX, e.clientY);
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('pointerleave', up);

      // iOSのダブルタップズームなどをふうじる
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('dblclick', (e) => e.preventDefault());
    },

    raycast(clientX, clientY, objects) {
      this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, RWorld.camera);
      return this.raycaster.intersectObjects(objects, true);
    },

    switchMode(name) {
      if (this.mode && this.mode.exit) this.mode.exit();
      RWorld.clearParticles();
      RUI.hideAllGameUI();
      RUI.show('topbar');
      this.modeName = name;
      this.mode = this.modes[name];
      this.mode.enter();
    },

    goHome() {
      this.switchMode('home');
    },

    startLoop() {
      const clock = new THREE.Clock();
      let time = 0;
      const loop = () => {
        requestAnimationFrame(loop);
        const dt = Math.min(0.05, clock.getDelta());
        time += dt;
        if (this.mode && this.mode.update) this.mode.update(time, dt);
        if (this.mode && this.mode.group) RWorld.updateEnvironment(this.mode.group, time, dt);
        RWorld.updateCamera(dt);
        RWorld.updateParticles(dt);
        RWorld.renderer.render(RWorld.scene, RWorld.camera);
      };
      loop();
    },
  };

  window.RMain = RMain;
  RMain.mode = RHome;
  RMain.modeName = 'home';

  window.addEventListener('DOMContentLoaded', () => RMain.init());
})();
