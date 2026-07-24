/* ================================================================
   rewards.js — ごほうびの「手渡し」演出
   お客さん（またはママの手）がコインを手渡し → リナちゃんが
   ぶたの貯金箱にチャリン → ハンコをポン → ごほうびパネル
   ================================================================ */
(function () {
  const RRewards = {};
  window.RRewards = RRewards;

  /* opts: { group, char, payerPos:[x,y,z]（お客さんの手元）, mama:true（ママの手）,
            coins, thanks（はらうときのセリフ）, onDone } */
  RRewards.pay = function (opts) {
    const g = opts.group;
    const char = opts.char;
    const coins = opts.coins || 3;
    const charP = char.position;

    // ぶたの貯金箱が よこに ぽんと あらわれる
    const piggy = RProps.makePiggyBank();
    const side = charP.x > 0 ? -1 : 1;
    piggy.position.set(charP.x + side * 0.95, 0, charP.z + 0.35);
    piggy.scale.setScalar(0.01);
    g.add(piggy);

    // はらうひとの手元
    let payerPos;
    let mamaArm = null;
    if (opts.mama) {
      mamaArm = RProps.makeMamaArm();
      mamaArm.position.set(charP.x + 3.6, 1.15, charP.z + 0.4);
      g.add(mamaArm);
      payerPos = () => new THREE.Vector3(mamaArm.position.x - 0.1, mamaArm.position.y, mamaArm.position.z);
    } else {
      const p = opts.payerPos;
      payerPos = () => new THREE.Vector3(p[0], p[1], p[2]);
    }

    const steps = [];
    steps.push(RSeq.call(() => {
      RUI.guide('');
      RUI.hideActionBtn();
      // てわたしの ようすが よくみえるように カメラを よせる
      RWorld.moveCamera([charP.x + side * -0.3, 2.4, charP.z + 4.6], [charP.x + side * -0.3, 1.1, charP.z]);
    }));
    steps.push(RSeq.scaleTo(piggy, 1, 0.35));
    steps.push(RSeq.sfx('boing'));

    if (opts.mama) {
      // ママの手が すっと はいってくる
      steps.push(RSeq.move(mamaArm, [charP.x + 1.7, 1.15, charP.z + 0.4], 0.7, { ease: 'out' }));
      steps.push(RSeq.sayMama(opts.thanks || 'おてつだい ありがとう。はい、おこづかいよ'));
      steps.push(RSeq.wait(0.9));
    } else if (opts.thanks) {
      steps.push(RSeq.say(opts.thanks, { pitch: 1.3 }));
      steps.push(RSeq.wait(0.6));
    }

    steps.push(RSeq.mood(char, 'reach'));

    // コインを 1まいずつ てわたし → ちょきんばこへ チャリン
    for (let i = 0; i < coins; i++) {
      const coin = RProps.makeCoin();
      steps.push(RSeq.call(() => {
        coin.position.copy(payerPos());
        g.add(coin);
        RAudio.sfx('coin');
      }));
      // てのひらへ
      steps.push({
        dur: 0.4,
        onStart: function () { this._from = coin.position.clone(); },
        onUpdate: function (p) {
          const to = new THREE.Vector3(charP.x, 1.15, charP.z + 0.5);
          coin.position.lerpVectors(this._from, to, p);
          coin.position.y += Math.sin(p * Math.PI) * 0.5;
          coin.rotation.y = p * 5;
        },
      });
      // ちょきんばこの スリットへ
      steps.push({
        dur: 0.35,
        onStart: function () { this._from = coin.position.clone(); },
        onUpdate: function (p) {
          const to = new THREE.Vector3(piggy.position.x, 0.62, piggy.position.z);
          coin.position.lerpVectors(this._from, to, p);
          coin.position.y += Math.sin(p * Math.PI) * 0.35;
          coin.scale.setScalar(1 - p * 0.5);
        },
        onEnd: () => {
          g.remove(coin);
          RAudio.sfx('charin');
          RWorld.sparkleBurst(piggy.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 4, 0xffe14d);
        },
      });
      // ぶたさんが ぷるんと よろこぶ
      steps.push({
        dur: 0.18,
        onUpdate: (p) => { piggy.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.12); },
      });
    }

    steps.push(RSeq.mood(char, 'happy', 1.0));
    if (opts.mama) {
      steps.push(RSeq.move(mamaArm, [charP.x + 3.6, 1.15, charP.z + 0.4], 0.6));
      steps.push(RSeq.call(() => g.remove(mamaArm)));
    }
    steps.push(RSeq.wait(0.3));

    RSeq.run(steps, () => {
      RRewards.stampThenPanel(coins, opts.onDone);
    });
  };

  /* ---------------- ハンコをポン（オーバーレイ演出） ---------------- */
  RRewards.stampThenPanel = function (coins, onDone) {
    const overlay = document.getElementById('stampanim');
    const grid = document.getElementById('sa-grid');
    const hanko = document.getElementById('sa-hanko');
    const pon = document.getElementById('sa-pon');
    grid.innerHTML = '';
    const cur = RSave.data.stamps;
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('div');
      c.className = 'stamp-cell' + (i < cur ? ' filled' : '');
      c.textContent = i < cur ? '🌟' : '';
      grid.appendChild(c);
    }
    hanko.classList.remove('pressing');
    pon.classList.add('hidden');
    overlay.classList.remove('hidden');
    RAudio.speakMama('がんばったね。ハンコ ポン！');

    setTimeout(() => {
      hanko.classList.add('pressing');
      setTimeout(() => {
        RAudio.sfx('pon');
        const cell = grid.children[Math.min(9, cur)];
        cell.classList.add('filled');
        cell.textContent = '🌟';
        pon.classList.remove('hidden');
      }, 420);
      setTimeout(() => {
        overlay.classList.add('hidden');
        RUI.reward(coins, onDone);
      }, 1600);
    }, 700);
  };
})();
