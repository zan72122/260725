/* ================================================================
   dressup.js — おしゃれ（きせかえ）モード
   こどもべやで：タンスのひきだし・ハンガーラック・ぼうしばこ・
   くつばこ・かがみだい から じっさいに とりだして きがえる。
   きがえは「ぬぐ→さむさむっ→かぶる→そでとおし→スカート→リボン」
   の だんかいで えがかれる。
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

  // タブごとに「どのかぐの前へいくか」
  const STATIONS = {
    dress:     { pos: [-1.3, -4.3], faceY: Math.PI + 0.25, cam: [[-0.6, 2.5, -1.9], [-0.9, 1.3, -5.9]] },
    hairStyle: { pos: [-3.1, 2.2],  faceY: -2.25,          cam: [[-1.6, 2.3, 3.8], [-4.2, 1.4, 1.0]] },
    hairColor: { pos: [-3.1, 2.2],  faceY: -2.25,          cam: [[-1.6, 2.3, 3.8], [-4.2, 1.4, 1.0]] },
    acc:       { pos: [-3.1, 2.2],  faceY: -2.25,          cam: [[-1.6, 2.3, 3.8], [-4.2, 1.4, 1.0]] },
    shoes:     { pos: [2.7, -4.3],  faceY: Math.PI - 0.2,  cam: [[2.2, 2.5, -1.6], [3.0, 1.0, -5.7]] },
    hat:       { pos: [-1.3, -4.3], faceY: Math.PI + 0.25, cam: [[-0.6, 2.6, -1.9], [-1.6, 1.9, -5.9]] },
  };

  // たたまれてタンスに入っているドレス → ひきだし番号
  const DRAWER_OF = { dress_pink: 0, dress_yellow: 0, dress_mint: 1, dress_sailor: 1 };

  /* ================================================================
     きがえシーケンス（アイドルの楽屋でも使う共通処理）
     ================================================================ */
  window.RChangeSeq = function (char, newOutfit, opts) {
    opts = opts || {};
    const g = opts.group;
    const quick = opts.quick;
    const oldDressItem = RCharacter.findItem('dress', char.userData.currentDress || RSave.data.outfit.dress);
    const newDressItem = RCharacter.findItem('dress', newOutfit.dress);
    const base = () => char.position;

    // ふくの「ぬぎき」用ゴースト
    function ghostDress(color) {
      const gh = new THREE.Group();
      const skirt = RWorld.cone(0.42, 0.58, color);
      skirt.position.y = -0.1;
      const top = RWorld.cyl(0.16, 0.19, 0.35, color);
      top.position.y = 0.28;
      gh.add(skirt, top);
      return gh;
    }

    // そでとおし（うでを あげて → おろす）
    function sleeveStep(side, label) {
      return [
        RSeq.say(label, { rate: 1.05 }),
        {
          dur: quick ? 0.4 : 0.55,
          onStart: () => { RCharacter.setMood(char, 'manual'); },
          onUpdate: (p) => {
            const arms = char.userData.parts.arms;
            const sgn = side === 'right' ? 1 : -1;
            arms[side].rotation.z = sgn * (2.9 - p * 2.4);
            arms[side].rotation.x = -0.4 * Math.sin(p * Math.PI);
          },
          onEnd: () => RAudio.sfx('swish'),
        },
      ];
    }

    let ghostOld = null, ghostNew = null;
    const steps = [];

    steps.push(RSeq.call(() => { RCharacter.setMood(char, 'manual'); }));

    // --- 1. いまのふくを ぬぐ（あたまから ポン） ---
    steps.push(RSeq.call(() => {
      ghostOld = ghostDress(oldDressItem.color || 0xff8ec7);
      ghostOld.position.set(base().x, 1.0, base().z);
      g.add(ghostOld);
      RCharacter.applyOutfit(char, Object.assign({}, newOutfit, { dress: '_camisole' }));
      RAudio.sfx('swish');
    }));
    steps.push({
      dur: 0.5,
      onUpdate: (p) => {
        if (!ghostOld) return;
        ghostOld.position.y = 1.0 + p * 1.9;
        ghostOld.rotation.z = p * 0.6;
        ghostOld.scale.setScalar(1 - p * 0.25);
      },
    });
    // ぬいだふくは タンス/ラックへ もどっていく（opts.oldReturnPos）
    steps.push({
      dur: 0.5,
      onUpdate: (p) => {
        if (!ghostOld) return;
        const to = opts.oldReturnPos || [base().x + 1.5, 1.2, base().z - 1];
        ghostOld.position.x += (to[0] - ghostOld.position.x) * p;
        ghostOld.position.y += (to[1] - ghostOld.position.y) * p;
        ghostOld.position.z += (to[2] - ghostOld.position.z) * p;
        ghostOld.scale.setScalar(Math.max(0.05, 0.75 - p * 0.7));
      },
      onEnd: () => { if (ghostOld) { g.remove(ghostOld); ghostOld = null; } if (opts.onOldReturned) opts.onOldReturned(); },
    });

    // --- 2. したぎすがたで さむさむっ ---
    steps.push(RSeq.mood(char, 'shiver'));
    steps.push(RSeq.say('さむさむっ…！'));
    steps.push(RSeq.wait(quick ? 0.6 : 1.0));

    // --- 3. あたらしいふくを あたまから かぶる ---
    steps.push(RSeq.call(() => {
      ghostNew = ghostDress(newDressItem.color);
      ghostNew.position.set(base().x, 3.0, base().z);
      g.add(ghostNew);
      RCharacter.setMood(char, 'manual');
      const arms = char.userData.parts.arms;
      arms.left.rotation.set(0, 0, -2.9);
      arms.right.rotation.set(0, 0, 2.9);
      RAudio.sfx('swish');
    }));
    steps.push({
      dur: 0.5,
      onUpdate: (p) => { if (ghostNew) ghostNew.position.y = 3.0 - p * 2.1; },
      onEnd: () => {
        if (ghostNew) { g.remove(ghostNew); ghostNew = null; }
        RCharacter.applyOutfit(char, newOutfit);
        RCharacter.setMood(char, 'manual');
        const arms = char.userData.parts.arms;
        arms.left.rotation.set(0, 0, -2.9);
        arms.right.rotation.set(0, 0, 2.9);
        RAudio.sfx('pop');
      },
    });

    // --- 4. みぎそで・ひだりそで を とおす ---
    sleeveStep('right', 'みぎてを そでに とおして…').forEach((s) => steps.push(s));
    sleeveStep('left', 'ひだりても とおして…').forEach((s) => steps.push(s));

    // --- 5. スカートを ととのえる ---
    steps.push({
      dur: quick ? 0.5 : 0.7,
      onStart: () => RAudio.sfx('swish'),
      onUpdate: (p) => {
        const parts = char.userData.parts;
        parts.arms.left.rotation.set(-1.3 + p * 0.9, 0, -0.35);
        parts.arms.right.rotation.set(-1.3 + p * 0.9, 0, 0.35);
        parts.dress.scale.x = 1 + Math.sin(p * Math.PI) * 0.08;
        parts.dress.scale.z = 1 + Math.sin(p * Math.PI) * 0.08;
      },
    });

    // --- 6. うしろの リボンを キュッ ---
    steps.push(RSeq.call(() => RAudio.sfx('swish')));
    steps.push(RSeq.rotTo(char, 'y', (opts.faceY !== undefined ? opts.faceY : char.rotation.y) + Math.PI, quick ? 0.3 : 0.45));
    steps.push({
      dur: quick ? 0.4 : 0.6,
      onUpdate: (p) => {
        const arms = char.userData.parts.arms;
        arms.left.rotation.set(0.9 * p, 0, -0.3);
        arms.right.rotation.set(0.9 * p, 0, 0.3);
      },
      onEnd: () => {
        RAudio.sfx('clip');
        RWorld.sparkleBurst(char.position.clone().add(new THREE.Vector3(0, 1.1, -0.3)), 8, 0xfff0c0);
      },
    });
    steps.push(RSeq.say('うしろの リボンを キュッ！'));
    steps.push(RSeq.wait(quick ? 0.3 : 0.5));
    steps.push(RSeq.rotTo(char, 'y', opts.faceY !== undefined ? opts.faceY : 0, quick ? 0.3 : 0.45));
    steps.push(RSeq.call(() => {
      char.userData.currentDress = newOutfit.dress;
      RCharacter.setMood(char, 'happy', 1.0);
      RWorld.sparkleBurst(char.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 14, 0xffd0f0);
      RAudio.sfx('sparkle');
    }));
    return steps;
  };

  /* ================================================================
     おしゃれモード本体
     ================================================================ */
  const RDressup = {
    group: null, char: null, refs: null,
    activeTab: 'dress',
    busy: false,
    hangers: {},
    freshSparkles: [],

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xffe3f2);
      RWorld.scene.fog = new THREE.Fog(0xffe3f2, 16, 36);
      this.busy = true;
      this.activeTab = 'dress';
      this.hangers = {};
      this.freshSparkles = [];

      RWorld.buildHomeRoom(g);
      this.refs = g.userData.refs;

      // ひきだしに たたんだふく を いれておく
      const drawers = this.refs.tansu.userData.drawers;
      RCharacter.Items.dress.filter((d) => d.folded).forEach((d, i) => {
        const fc = RProps.makeFoldedCloth(d.color);
        fc.position.set(-0.35 + (i % 2) * 0.7, 0, 0);
        drawers[DRAWER_OF[d.id]].userData.inner.add(fc);
      });
      // ハンガーラックに ドレスを かけておく
      const rack = this.refs.rack;
      RCharacter.Items.dress.filter((d) => !d.folded).forEach((d, i) => {
        const hg = RProps.makeHangerDress(d.color);
        hg.position.set(rack.userData.slots[i % 4], 1.95, 0.05);
        rack.add(hg);
        this.hangers[d.id] = hg;
        if (d.id === RSave.data.outfit.dress) hg.visible = false; // いま きているふく
      });

      // せんたくしたての キラキラ
      if (RSave.data.freshWash) {
        [this.refs.tansu.position, this.refs.rack.position].forEach((p) => {
          const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
          sp.position.set(p.x, 2.3, p.z + 0.5);
          g.add(sp);
          this.freshSparkles.push(sp);
        });
      }

      // リナちゃん：へやの まんなかから タンスへ あるいていく
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.userData.currentDress = RSave.data.outfit.dress;
      this.char.position.set(1.8, 0, 1.6);
      this.char.rotation.y = 0.4;
      g.add(this.char);

      RWorld.snapCamera([0, 3.0, 7.6], [0, 1.2, 0]);
      RAudio.playBGM('dressup');
      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finishIntro(true));
      RUI.guide('タンスまで いこう！');
      RAudio.speak('きょうは どんなおしゃれに しようかな？タンスまで いこう！');

      const st = STATIONS.dress;
      this.introSeq = RSeq.run([
        RSeq.wait(0.6),
        RSeq.walk(this.char, st.pos[0], st.pos[1], { faceY: st.faceY }),
        RSeq.cam(st.cam[0], st.cam[1]),
        RSeq.wait(0.5),
      ], () => this.finishIntro(false));
    },

    finishIntro(skipped) {
      if (this.introDone) return;
      this.introDone = true;
      if (skipped && this.introSeq) {
        this.introSeq.cancel();
        const st = STATIONS.dress;
        this.char.position.set(st.pos[0], 0, st.pos[1]);
        this.char.rotation.y = st.faceY;
        RCharacter.setMood(this.char, 'idle');
        RWorld.moveCamera(st.cam[0], st.cam[1]);
      }
      RUI.hideSkip();
      this.busy = false;
      RUI.guide('');
      RUI.show('dressup-ui');
      this.buildTabs();
      this.buildItems();
      $('btn-dress-done').onclick = () => this.finish();
    },

    exit() {
      RUI.hide('dressup-ui');
      RUI.hideAllGameUI();
      RUI.hideSkip();
      this.introDone = false;
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null;
      this.refs = null;
    },

    /* ---------------- タブ＝かぐの まえへ いどう ---------------- */
    buildTabs() {
      const wrap = $('dressup-tabs');
      wrap.innerHTML = '';
      TABS.forEach((tb) => {
        const b = document.createElement('button');
        b.className = 'dtab' + (tb.cat === this.activeTab ? ' active' : '');
        b.textContent = tb.icon;
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (this.busy) return;
          RAudio.sfx('tap');
          const prev = STATIONS[this.activeTab];
          this.activeTab = tb.cat;
          wrap.querySelectorAll('.dtab').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          this.buildItems();
          // ちがう かぐ なら あるいて いどう
          const st = STATIONS[tb.cat];
          if (st.pos[0] !== prev.pos[0] || st.pos[1] !== prev.pos[1]) {
            this.busy = true;
            RSeq.run([
              RSeq.walk(this.char, st.pos[0], st.pos[1], { faceY: st.faceY }),
              RSeq.cam(st.cam[0], st.cam[1]),
            ], () => { this.busy = false; });
          } else {
            RWorld.moveCamera(st.cam[0], st.cam[1]);
          }
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
          this.pickItem(cat, item);
        });
        wrap.appendChild(b);
      });
    },

    pickItem(cat, item) {
      if (this.busy) return;
      if (RSave.data.outfit[cat] === item.id) return;
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
      }
      this.busy = true;
      const done = () => {
        this.busy = false;
        this.buildItems();
        RCharacter.setMood(this.char, 'idle');
      };
      if (cat === 'dress') this.pickDress(item, done);
      else if (cat === 'hairStyle' || cat === 'hairColor') this.pickHair(cat, item, done);
      else if (cat === 'shoes') this.pickShoes(item, done);
      else if (cat === 'hat') this.pickHat(item, done);
      else this.pickAcc(item, done);
    },

    /* ---------------- ドレス：とりだして きがえる ---------------- */
    pickDress(item, done) {
      const g = this.group;
      const char = this.char;
      const oldId = RSave.data.outfit.dress;
      const oldItem = RCharacter.findItem('dress', oldId);
      const newOutfit = Object.assign({}, RSave.data.outfit, { dress: item.id });
      const steps = [];
      const tansu = this.refs.tansu;
      const rack = this.refs.rack;

      let takenGhost = null;
      let drawer = null;

      if (item.folded) {
        // ひきだしから とりだす
        drawer = tansu.userData.drawers[DRAWER_OF[item.id]];
        steps.push(RSeq.say('ひきだしを あけて…'));
        steps.push(RSeq.sfx('drawer'));
        steps.push({ dur: 0.45, onUpdate: (p) => { drawer.position.z = p * 0.5; } });
        steps.push(RSeq.wait(0.25));
        steps.push(RSeq.call(() => {
          takenGhost = RProps.makeFoldedCloth(item.color);
          const wp = new THREE.Vector3();
          drawer.userData.inner.getWorldPosition(wp);
          takenGhost.position.copy(wp);
          g.add(takenGhost);
          RAudio.sfx('pop');
        }));
        steps.push({
          dur: 0.5,
          onUpdate: (p) => {
            if (!takenGhost) return;
            const to = new THREE.Vector3(char.position.x, 1.1, char.position.z + 0.4);
            takenGhost.position.lerp(to, p);
            takenGhost.position.y += Math.sin(p * Math.PI) * 0.5;
          },
          onEnd: () => { if (takenGhost) { g.remove(takenGhost); takenGhost = null; } },
        });
        steps.push(RSeq.say('たたんである おようふく、これに する！'));
      } else {
        // ハンガーごと とる
        const hanger = this.hangers[item.id];
        steps.push(RSeq.say('ハンガーごと とって…'));
        steps.push({
          dur: 0.3,
          onUpdate: (p) => { if (hanger) hanger.position.y = 1.95 + p * 0.25; },
        });
        steps.push({
          dur: 0.5,
          onStart: () => RAudio.sfx('pop'),
          onUpdate: (p) => {
            if (!hanger) return;
            const wp = new THREE.Vector3(char.position.x, 1.3, char.position.z + 0.4);
            const lp = rack.worldToLocal(wp.clone());
            hanger.position.lerp(lp, p);
          },
          onEnd: () => { if (hanger) hanger.visible = false; },
        });
        steps.push(RSeq.call(() => { if (hanger) hanger.position.set(rack.userData.slots[RCharacter.Items.dress.filter(d=>!d.folded).findIndex(d=>d.id===item.id) % 4], 1.95, 0.05); }));
      }

      // ぬいだふくの もどりさき
      let oldReturnPos;
      if (oldItem.folded && drawer !== null) {
        const wp = new THREE.Vector3();
        tansu.userData.drawers[DRAWER_OF[oldId]].userData.inner.getWorldPosition(wp);
        oldReturnPos = [wp.x, wp.y, wp.z];
      } else if (oldItem.folded) {
        const wp = new THREE.Vector3();
        tansu.getWorldPosition(wp);
        oldReturnPos = [wp.x, wp.y + 1.4, wp.z];
      } else {
        const wp = new THREE.Vector3();
        rack.getWorldPosition(wp);
        oldReturnPos = [wp.x, wp.y + 1.6, wp.z];
      }

      // きがえ（だんかい描写）
      RChangeSeq(char, newOutfit, {
        group: g,
        faceY: STATIONS.dress.faceY - Math.PI, // カメラのほうを むいて きがえる
        oldReturnPos,
        onOldReturned: () => {
          // ぬいだふくが ハンガー/ひきだしに もどる
          if (!oldItem.folded && this.hangers[oldId]) this.hangers[oldId].visible = true;
        },
      }).forEach((s) => steps.push(s));

      // ひきだしを しめる
      if (drawer) {
        steps.push(RSeq.sfx('drawer'));
        steps.push({ dur: 0.4, onUpdate: (p) => { drawer.position.z = 0.5 * (1 - p); } });
      }

      steps.push(RSeq.call(() => {
        RSave.setOutfit('dress', item.id);
        this.consumeFreshWash();
        RUI.praise('とっても にあう！');
      }));

      // さいしょに カメラのほうへ むきなおす
      steps.unshift(RSeq.rotTo(char, 'y', STATIONS.dress.faceY - Math.PI, 0.35));
      RSeq.run(steps, done);
    },

    /* ---------------- かみがた・かみいろ：ブラシで とかす ---------------- */
    pickHair(cat, item, done) {
      const char = this.char;
      const newOutfit = Object.assign({}, RSave.data.outfit, { [cat]: item.id });
      const brush = RProps.makeBrush();
      const needsTie = cat === 'hairStyle' && ['twin', 'ponytail', 'buns'].indexOf(item.id) !== -1;
      const steps = [
        RSeq.rotTo(char, 'y', STATIONS.hairStyle.faceY - Math.PI, 0.35),
        RSeq.say('ブラシで とかそう！'),
        RSeq.call(() => {
          RCharacter.setMood(char, 'manual');
          RCharacter.hold(char, 'right', brush);
          brush.rotation.z = -0.5;
        }),
      ];
      // シュッシュッと 3かい とかす
      for (let i = 0; i < 3; i++) {
        steps.push({
          dur: 0.4,
          onStart: () => RAudio.sfx('swish'),
          onUpdate: (p) => {
            const arms = char.userData.parts.arms;
            arms.right.rotation.set(-2.4 + Math.sin(p * Math.PI) * 0.7, 0, 0.9);
            arms.left.rotation.set(0, 0, -0.5);
            char.userData.parts.head.rotation.z = Math.sin(p * Math.PI) * 0.12;
          },
        });
      }
      steps.push(RSeq.call(() => {
        RCharacter.drop(char, 'right');
        RCharacter.applyOutfit(char, newOutfit);
        RCharacter.setMood(char, 'manual');
        RWorld.sparkleBurst(char.position.clone().add(new THREE.Vector3(0, 1.9, 0)), 10, 0xfff0c0);
        RAudio.sfx('sparkle');
      }));
      if (needsTie) {
        // ゴムで むすぶ
        steps.push(RSeq.say('ゴムで キュッと むすんで…'));
        steps.push({
          dur: 0.6,
          onUpdate: (p) => {
            const arms = char.userData.parts.arms;
            arms.left.rotation.set(-2.6, 0, -0.8 + Math.sin(p * Math.PI * 2) * 0.2);
            arms.right.rotation.set(-2.6, 0, 0.8 - Math.sin(p * Math.PI * 2) * 0.2);
          },
          onEnd: () => RAudio.sfx('clip'),
        });
      }
      steps.push(RSeq.call(() => {
        RSave.setOutfit(cat, item.id);
        RCharacter.setMood(char, 'happy', 1.0);
        RUI.praise('かわいい かみがた！');
      }));
      RSeq.run(steps, done);
    },

    /* ---------------- くつ：くつばこから ---------------- */
    pickShoes(item, done) {
      const g = this.group;
      const char = this.char;
      const shoeBox = this.refs.shoeBox;
      const newOutfit = Object.assign({}, RSave.data.outfit, { shoes: item.id });
      const pair = new THREE.Group();
      [-0.12, 0.12].forEach((x) => {
        const s = RWorld.sphere(0.12, item.color, 1, 0.7, 1.4);
        s.position.x = x;
        pair.add(s);
      });
      const boxWp = new THREE.Vector3();
      shoeBox.getWorldPosition(boxWp);
      const steps = [
        RSeq.say('くつばこから だそう！'),
        RSeq.sfx('doorOpen'),
        RSeq.rotTo(shoeBox.userData.door, 'y', -1.7, 0.5),
        RSeq.call(() => {
          pair.position.set(boxWp.x, 0.9, boxWp.z + 0.4);
          g.add(pair);
        }),
        RSeq.move(pair, [char.position.x, 0.05, char.position.z + 0.5], 0.55, { arc: 0.6 }),
        RSeq.sfx('boing'),
        RSeq.say('よいしょ…'),
        RSeq.mood(char, 'crouch'),
        RSeq.wait(0.7),
        RSeq.call(() => {
          g.remove(pair);
          RCharacter.applyOutfit(char, newOutfit);
          RSave.setOutfit('shoes', item.id);
          RAudio.sfx('pop');
        }),
        // ぴょんぴょん して はきごこち チェック
        RSeq.mood(char, 'happy'),
        RSeq.sfx('step'),
        RSeq.wait(0.3),
        RSeq.sfx('step'),
        RSeq.wait(0.4),
        RSeq.say('ぴったり！'),
        RSeq.rotTo(shoeBox.userData.door, 'y', 0, 0.4),
        RSeq.call(() => RUI.praise('すてきな くつ！')),
      ];
      RSeq.run(steps, done);
    },

    /* ---------------- ぼうし：ぼうしばこから ---------------- */
    pickHat(item, done) {
      const g = this.group;
      const char = this.char;
      const hatBox = this.refs.hatBox;
      const lid = hatBox.userData.lid;
      const newOutfit = Object.assign({}, RSave.data.outfit, { hat: item.id });
      const boxWp = new THREE.Vector3();
      hatBox.getWorldPosition(boxWp);
      let ghost = null;
      const steps = [
        RSeq.rotTo(char, 'y', STATIONS.hat.faceY - Math.PI, 0.35),
        RSeq.say('ぼうしばこを あけよう！'),
        RSeq.sfx('paka'),
        { dur: 0.5, onUpdate: (p) => { lid.position.y = 0.4 + p * 0.45; lid.rotation.z = p * 0.5; } },
      ];
      if (item.id !== 'hat_none') {
        steps.push(RSeq.call(() => {
          ghost = RBuildHat(item);
          ghost.position.copy(boxWp).add(new THREE.Vector3(0, 0.3, 0));
          ghost.scale.setScalar(0.9);
          g.add(ghost);
        }));
        steps.push({
          dur: 0.6,
          onStart: () => {
            RCharacter.setMood(char, 'manual');
            const arms = char.userData.parts.arms;
            arms.left.rotation.set(-2.7, 0, -0.5);
            arms.right.rotation.set(-2.7, 0, 0.5);
          },
          onUpdate: (p) => {
            if (!ghost) return;
            const to = new THREE.Vector3(char.position.x, 2.4, char.position.z);
            ghost.position.lerp(to, p);
          },
          onEnd: () => { if (ghost) { g.remove(ghost); ghost = null; } },
        });
        steps.push(RSeq.say('りょうてで そーっと かぶって…'));
      } else {
        steps.push(RSeq.say('きょうは ぼうし なしに する！'));
      }
      steps.push(RSeq.call(() => {
        RCharacter.applyOutfit(char, newOutfit);
        RSave.setOutfit('hat', item.id);
        RAudio.sfx('pop');
        RWorld.sparkleBurst(char.position.clone().add(new THREE.Vector3(0, 2.1, 0)), 8, 0xfff0c0);
      }));
      steps.push({ dur: 0.4, onUpdate: (p) => { lid.position.y = 0.85 - p * 0.45; lid.rotation.z = 0.5 * (1 - p); } });
      steps.push(RSeq.mood(char, 'happy', 0.8));
      steps.push(RSeq.call(() => RUI.praise('にあってる！')));
      RSeq.run(steps, done);
    },

    /* ---------------- アクセ：かがみの まえで ---------------- */
    pickAcc(item, done) {
      const char = this.char;
      const newOutfit = Object.assign({}, RSave.data.outfit, { acc: item.id });
      const steps = [
        RSeq.rotTo(char, 'y', STATIONS.acc.faceY - Math.PI, 0.35),
        RSeq.say('かがみを みながら…'),
        {
          dur: 0.6,
          onStart: () => RCharacter.setMood(char, 'manual'),
          onUpdate: (p) => {
            const arms = char.userData.parts.arms;
            arms.right.rotation.set(-2.6, 0, 0.7 - Math.sin(p * Math.PI) * 0.3);
            arms.left.rotation.set(0, 0, -0.5);
          },
          onEnd: () => RAudio.sfx('clip'),
        },
        RSeq.call(() => {
          RCharacter.applyOutfit(char, newOutfit);
          RSave.setOutfit('acc', item.id);
          RWorld.sparkleBurst(char.position.clone().add(new THREE.Vector3(0.3, 2.0, 0.2)), 8, 0xffd0f0);
          RAudio.sfx('sparkle');
        }),
        RSeq.mood(char, 'happy', 0.8),
        RSeq.call(() => RUI.praise('キラキラ！')),
      ];
      RSeq.run(steps, done);
    },

    /* ---------------- せんたくしたて ボーナス ---------------- */
    consumeFreshWash() {
      if (!RSave.data.freshWash) return;
      RSave.data.freshWash = false;
      RSave.save();
      RWorld.sparkleBurst(this.char.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 24, 0xd0f4ff);
      RAudio.sfx('sparkle');
      setTimeout(() => RAudio.speak('せんたくしたてで きもちいいね！'), 900);
      this.freshSparkles.forEach((sp) => this.group.remove(sp));
      this.freshSparkles = [];
    },

    /* ---------------- 「きめた！」 ---------------- */
    finish() {
      if (this.busy) return;
      this.busy = true;
      RAudio.sfx('fanfare');
      RAudio.sfx('camera');
      RUI.praise('とっても かわいい！');
      RWorld.confetti(this.char.position.clone().add(new THREE.Vector3(0, 3, 0.5)), 70);
      RCharacter.setMood(this.char, 'dance', 3.0);
      this.spin = 9;
      RSave.addCoins(1);
      setTimeout(() => { if (window.RMain) RMain.goHome(); }, 3200);
    },

    /* ---------------- 入力 ---------------- */
    onPointerDown(x, y) {
      if (this.busy || !this.char) return;
      // ひきだしを じかに タップしても あく
      const drawers = this.refs ? this.refs.tansu.userData.drawers : [];
      const hitsD = RMain.raycast(x, y, drawers);
      if (hitsD.length) {
        let obj = hitsD[0].object;
        while (obj && obj.userData.drawerIndex === undefined) obj = obj.parent;
        if (obj) {
          const open = !obj.userData.open;
          obj.userData.open = open;
          RAudio.sfx('drawer');
          this.busy = true;
          RSeq.run([{ dur: 0.4, onUpdate: (p) => { obj.position.z = open ? p * 0.5 : 0.5 * (1 - p); } }],
            () => { this.busy = false; });
          return;
        }
      }
      const hits = RMain.raycast(x, y, [this.char]);
      if (hits.length) {
        RAudio.sfx('boing');
        RCharacter.setMood(this.char, 'happy', 1);
        RWorld.heartBurst(this.char.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 4);
      }
    },
    onPointerMove() {},
    onPointerUp() {},

    update(time, dt) {
      if (!this.char) return;
      if (this.spin) {
        this.char.rotation.y += this.spin * dt;
        this.spin *= Math.pow(0.2, dt);
        if (this.spin < 0.05) this.spin = 0;
      }
      RCharacter.animate(this.char, time, dt);
      this.freshSparkles.forEach((sp) => { sp.rotation.y += dt * 3; sp.position.y += Math.sin(time * 2) * 0.002; });
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
