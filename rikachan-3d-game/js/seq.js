/* ================================================================
   seq.js — カットシーン／プロセス演出のシーケンス基盤
   「歩いて行く→開ける→取り出す→…」の連続動作を記述する。
   各ステップ: {dur, onStart, onUpdate(p,dt), onEnd} または {until(dt)=>bool}
   ================================================================ */
(function () {
  const RSeq = { list: [] };

  RSeq.update = function (dt) {
    for (let i = RSeq.list.length - 1; i >= 0; i--) {
      const h = RSeq.list[i];
      if (h.cancelled) { RSeq.list.splice(i, 1); continue; }
      let guard = 0;
      while (h.idx < h.steps.length && guard++ < 50) {
        const step = h.steps[h.idx];
        if (!step._started) { step._started = true; step.t = 0; if (step.onStart) step.onStart(); }
        let done = true;
        if (step.until) {
          done = step.until(dt);
        } else if (step.dur !== undefined && step.dur > 0) {
          step.t += dt;
          const p = Math.min(1, step.t / step.dur);
          if (step.onUpdate) step.onUpdate(p, dt);
          done = p >= 1;
        }
        if (!done) break;
        if (step.onEnd) step.onEnd();
        h.idx++;
      }
      if (h.cancelled) { RSeq.list.splice(i, 1); continue; }
      if (h.idx >= h.steps.length) {
        RSeq.list.splice(i, 1);
        if (h.onDone) h.onDone();
      }
    }
  };

  RSeq.run = function (steps, onDone) {
    const h = {
      steps: steps.filter(Boolean),
      idx: 0,
      onDone,
      cancelled: false,
      cancel() { this.cancelled = true; },
    };
    RSeq.list.push(h);
    return h;
  };

  RSeq.clear = function () {
    RSeq.list.forEach((h) => { h.cancelled = true; });
    RSeq.list = [];
  };

  /* ---------------- ステップのヘルパー ---------------- */
  RSeq.wait = (dur) => ({ dur });
  RSeq.call = (fn) => ({ dur: 0, onStart: fn });
  RSeq.say = (text, opts) => ({ dur: 0, onStart: () => RAudio.speak(text, opts) });
  RSeq.sayMama = (text) => ({ dur: 0, onStart: () => RAudio.speakMama(text) });
  RSeq.sfx = (name) => ({ dur: 0, onStart: () => RAudio.sfx(name) });
  RSeq.guide = (t) => ({ dur: 0, onStart: () => RUI.guide(t) });
  RSeq.praise = (t) => ({ dur: 0, onStart: () => RUI.praise(t) });
  RSeq.mood = (char, mood, dur) => ({ dur: 0, onStart: () => RCharacter.setMood(char, mood, dur) });
  RSeq.cam = (pos, look) => ({ dur: 0, onStart: () => RWorld.moveCamera(pos, look) });

  // キャラが目的地まで歩く（足音つき・到着で向きを合わせる）
  RSeq.walk = (char, x, z, opts) => {
    opts = opts || {};
    const speed = opts.speed || 1.7;
    return {
      onStart: () => RCharacter.setMood(char, opts.mood || 'walk'),
      until: (dt) => {
        const dx = x - char.position.x, dz = z - char.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.07) return true;
        const step = Math.min(d, speed * dt);
        char.position.x += dx / d * step;
        char.position.z += dz / d * step;
        const ty = Math.atan2(dx, dz);
        let diff = ((ty - char.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        char.rotation.y += diff * Math.min(1, dt * 10);
        char.userData.stepT = (char.userData.stepT || 0) + dt;
        if (char.userData.stepT > 0.26) { char.userData.stepT = 0; RAudio.sfx('step'); }
        return false;
      },
      onEnd: () => {
        RCharacter.setMood(char, opts.endMood || 'idle');
        if (opts.faceY !== undefined) char.rotation.y = opts.faceY;
      },
    };
  };

  // オブジェクトを移動（arc: 山なりの高さ）
  RSeq.move = (obj, to, dur, opts) => {
    opts = opts || {};
    let from = null;
    const target = new THREE.Vector3(to[0], to[1], to[2]);
    return {
      dur,
      onStart: () => { from = obj.position.clone(); if (opts.onStart) opts.onStart(); },
      onUpdate: (p) => {
        const q = opts.ease === 'out' ? 1 - Math.pow(1 - p, 2) : p;
        obj.position.lerpVectors(from, target, q);
        if (opts.arc) obj.position.y += Math.sin(p * Math.PI) * opts.arc;
        if (opts.spin) obj.rotation.z = p * opts.spin;
      },
    };
  };

  RSeq.rotTo = (obj, axis, target, dur) => {
    let from = 0;
    return {
      dur,
      onStart: () => { from = obj.rotation[axis]; },
      onUpdate: (p) => { obj.rotation[axis] = from + (target - from) * (1 - Math.pow(1 - p, 2)); },
    };
  };

  RSeq.scaleTo = (obj, target, dur) => {
    let from = 1;
    return {
      dur,
      onStart: () => { from = obj.scale.x; },
      onUpdate: (p) => { obj.scale.setScalar(from + (target - from) * p); },
    };
  };

  // 条件がtrueになるまでまつ（プレイヤーの操作まちなど）
  RSeq.waitFor = (fn) => ({ until: () => !!fn() });

  window.RSeq = RSeq;
})();
