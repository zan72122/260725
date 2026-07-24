/* =========================================================
   materials.js — 12しゅるいの そざい ていぎ
   （ぶつりパラメータは「720px きじゅん」。あそぶ ときに がめんの
     おおきさで かけざん される）
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});

  /* どうぐ の じしょ */
  var TOOLS = YA.TOOLS = {
    poke: { icon: '👆', label: 'ゆび' },
    grab: { icon: '🤏', label: 'つまむ' },
    cut: { icon: '✂️', label: 'きる' },
    blow: { icon: '🌬️', label: 'かぜ' },
    heat: { icon: '🔥', label: 'あつく' },
    cool: { icon: '❄️', label: 'つめたく' },
    paint: { icon: '🎨', label: 'いろ' },
    glitter: { icon: '✨', label: 'きらきら' },
    face: { icon: '😊', label: 'おかお' },
    stamp: { icon: '⭐', label: 'かたぬき' },
    add: { icon: '➕', label: 'ふやす' },
    pour: { icon: '🫗', label: 'そそぐ' },
    dig: { icon: '🥄', label: 'ほる' },
    water: { icon: '💧', label: 'おみず' },
    pack: { icon: '⛄', label: 'かためる' },
    pop: { icon: '💥', label: 'パチン' },
    bubble: { icon: '🫧', label: 'ぶくぶく' },
    wand: { icon: '🪄', label: 'ふく' },
    spin: { icon: '🍭', label: 'くるくる' },
    eat: { icon: '😋', label: 'たべる' },
    shake: { icon: '💫', label: 'ゆらす' },
    freeze: { icon: '🧊', label: 'こおらす' }
  };

  /* かたぬきの かたち */
  YA.STAMPS = ['star', 'heart', 'flower', 'circle', 'bear', 'moon', 'fish', 'square', 'triangle'];

  var C = function (hex, lock) { return { c: hex, lock: lock || 0 }; };

  YA.materials = [

    /* ---------------- 1. ねんど ---------------- */
    {
      id: 'clay', tray: true, name: 'ねんど', emoji: '🟠', kind: 'pbd',
      card: ['#ffcf87', '#ff9a5b'], bg: ['#fff6e6', '#ffe0bd'],
      hints: ['ゆびで ぎゅーっと おしてみて！', 'かたぬきで ぺったん スタンプ！', 'いろを まぜて みよう'],
      says: ['むにゅ〜', 'こねこね！', 'すごい かたち！'],
      colors: [C('#f2b56b'), C('#f08c62'), C('#e5757f'), C('#8fc9a0'), C('#8fb6e8'), C('#c9a5e8', 30), C('#f7e08a', 60), C('#ffffff', 100)],
      tools: ['poke', 'grab', 'cut', 'stamp', 'paint', 'face'],
      count: 560,
      fill: 0.2,
      style: { kind: 'clay', gloss: 0.10, rim: 0.22, core: 0.72, rMul: 1.30, shadow: 0.28, grain: 0.10 },
      bgmRoot: 523.25,
      params: {
        spacing: 13, hMul: 2.1,
        fluidK: 0.38, clampNeg: true, scorrK: 0.0004,
        viscosity: 0.40, cohesion: 40, damping: 1.2,
        gravity: 1500, restitution: 0.02, friction: 0.60, iters: 3,
        useBonds: true, bondK: 0.98, yield: 0.14, plastic: 1.4,
        breakStretch: 1.9, formDist: 1.35, reform: true, minRest: 0.62, maxRest: 1.9
      }
    },

    /* ---------------- 2. ゼリー ---------------- */
    {
      id: 'jelly', tray: true, name: 'ゼリー', emoji: '🍮', kind: 'pbd',
      card: ['#ffa8d0', '#ff6fa8'], bg: ['#fff2f8', '#ffdcec'],
      hints: ['ぷるぷる ゆれるよ！', 'ひっぱって ぱっと はなして みて', 'つめたく すると かたくなる'],
      says: ['ぷるるん♪', 'ゆれた〜！', 'ぷるぷる〜'],
      colors: [C('#ff7fb0'), C('#ffb35c'), C('#8fe08f'), C('#7fd4ff'), C('#c99cff'), C('#fff07f', 30), C('#ff6b6b', 60), C('#8ff0e0', 100)],
      tools: ['poke', 'grab', 'cut', 'stamp', 'cool', 'paint', 'face'],
      count: 620,
      fill: 0.22,
      style: { kind: 'jelly', gloss: 0.8, rim: 0.55, core: 0.55, rMul: 1.34, shadow: 0.24, alpha: 0.95, sub: 0.5 },
      bgmRoot: 587.33,
      params: {
        spacing: 12.5, hMul: 2.1,
        fluidK: 0.28, clampNeg: true, scorrK: 0.0004,
        viscosity: 0.05, cohesion: 30, damping: 0.25,
        gravity: 1500, restitution: 0.34, friction: 0.16, iters: 3,
        useBonds: true, bondK: 0.72, yield: 9, plastic: 0,
        breakStretch: 3.4, formDist: 1.3, reform: false,
        useTemp: true, ambient: 0.5, tempRelax: 0.10, meltT: 9, freezeT: 9
      }
    },

    /* ---------------- 3. おもち ---------------- */
    {
      id: 'mochi', tray: true, name: 'おもち', emoji: '🍡', kind: 'pbd',
      card: ['#f7dcc4', '#dcb894'], bg: ['#fffaf4', '#f6e6d8'],
      hints: ['びよーんと のばして みて！', 'ちぎれるまで ひっぱれる？', 'きなこの いろに してみよう'],
      says: ['のび〜る！', 'もちもち！', 'ちぎれた〜'],
      colors: [C('#fffaf2'), C('#ffe4a8'), C('#f7c1d4'), C('#c4e8b8'), C('#d8c4a0'), C('#a8d8f0', 30), C('#e8b0f0', 60), C('#5b4a55', 100)],
      tools: ['grab', 'poke', 'cut', 'stamp', 'paint', 'face'],
      count: 520,
      fill: 0.2,
      style: { kind: 'mochi', gloss: 0.35, rim: 0.30, core: 0.66, rMul: 1.36, shadow: 0.24, powder: 0.35 },
      bgmRoot: 493.88,
      params: {
        spacing: 13.5, hMul: 2.2,
        fluidK: 0.30, clampNeg: true, scorrK: 0.0005,
        viscosity: 0.55, cohesion: 130, damping: 0.9,
        gravity: 1400, restitution: 0.05, friction: 0.72, iters: 3,
        useBonds: true, bondK: 0.44, yield: 0.08, plastic: 1.2,
        breakStretch: 7.0, formDist: 1.5, reform: true, minRest: 0.6, maxRest: 3.4
      }
    },

    /* ---------------- 4. スライム ---------------- */
    {
      id: 'slime', tray: true, name: 'スライム', emoji: '🟢', kind: 'pbd',
      card: ['#8fe8a8', '#3fc98d'], bg: ['#effff5', '#d0f5e2'],
      hints: ['どろ〜っと ながれるよ', 'ゆびで すくって みて！', 'きらきらを いれて みよう'],
      says: ['ぬる〜ん', 'とろとろ〜', 'びよ〜ん'],
      colors: [C('#5fd99b'), C('#5fc7e8'), C('#c98fe8'), C('#ffb85c'), C('#ff7fa8'), C('#f2ea5c', 30), C('#7f8fff', 60), C('#ff5f5f', 100)],
      tools: ['poke', 'grab', 'blow', 'glitter', 'paint', 'face'],
      count: 780,
      fill: 0.26,
      style: { kind: 'slime', gloss: 0.95, rim: 0.45, core: 0.46, rMul: 1.44, shadow: 0.20, alpha: 0.94, sub: 0.35 },
      bgmRoot: 440,
      params: {
        spacing: 11.5, hMul: 2.2,
        fluidK: 1.0, clampNeg: true, scorrK: 0.0010,
        viscosity: 0.78, cohesion: 300, damping: 0.35,
        gravity: 1450, restitution: 0.02, friction: 0.42, iters: 3,
        useBonds: false
      }
    },

    /* ---------------- 5. おみず ---------------- */
    {
      id: 'water', name: 'おみず', emoji: '💧', kind: 'pbd',
      card: ['#8fd8ff', '#3fa8f0'], bg: ['#eef9ff', '#c8e9ff'],
      hints: ['ばしゃばしゃ しよう！', 'ゆらすと なみが できるよ', 'つめたくすると こおるかも？'],
      says: ['ちゃぷちゃぷ', 'ばしゃーん！', 'つめた〜い'],
      colors: [C('#5fc0f0'), C('#5fe0d8'), C('#8f9fff'), C('#c98ff0'), C('#5fe08f'), C('#ff9fc0', 30), C('#ffe07f', 60), C('#ffffff', 100)],
      tools: ['poke', 'blow', 'stamp', 'glitter', 'paint'],
      count: 820,
      fill: 0.34,
      style: { kind: 'water', gloss: 1.0, rim: 0.7, core: 0.40, rMul: 1.50, shadow: 0.14, alpha: 0.80, sub: 0.2, refract: 1 },
      bgmRoot: 659.25,
      params: {
        spacing: 10.5, hMul: 2.3,
        fluidK: 1.0, clampNeg: true, scorrK: 0.0013,
        viscosity: 0.05, cohesion: 90, damping: 0.06,
        gravity: 1950, restitution: 0.06, friction: 0.06, iters: 3,
        useBonds: false
      }
    },

    /* ---------------- 6. はちみつ ---------------- */
    {
      id: 'honey', tray: true, name: 'はちみつ', emoji: '🍯', kind: 'pbd',
      card: ['#ffd76b', '#f0a02b'], bg: ['#fff8e2', '#ffe6ad'],
      hints: ['と〜ろ とろ ながれるよ', 'たかい ところから おとして みて', 'ゆびに くっつく！'],
      says: ['とろ〜り', 'あま〜い！', 'ねばねば！'],
      colors: [C('#f5ba34'), C('#e88f2b'), C('#ffd76b'), C('#d9713f'), C('#f5e0a0'), C('#c98f5f', 30), C('#ffa8d0', 60), C('#a0e0c0', 100)],
      tools: ['poke', 'grab', 'heat', 'cool', 'stamp', 'glitter'],
      count: 700,
      fill: 0.22,
      style: { kind: 'honey', gloss: 0.9, rim: 0.5, core: 0.5, rMul: 1.42, shadow: 0.3, alpha: 0.95, sub: 0.6 },
      bgmRoot: 392,
      params: {
        spacing: 12, hMul: 2.25,
        fluidK: 1.0, clampNeg: true, scorrK: 0.0008,
        viscosity: 0.94, cohesion: 380, damping: 0.7,
        gravity: 1500, restitution: 0.0, friction: 0.6, iters: 3,
        useBonds: false,
        useTemp: true, ambient: 0.5, tempRelax: 0.12
      }
    },

    /* ---------------- 7. チョコ ---------------- */
    {
      id: 'choco', tray: true, name: 'チョコ', emoji: '🍫', kind: 'pbd',
      card: ['#b07a4f', '#6b4227'], bg: ['#fff2e6', '#f0dcc4'],
      hints: ['🔥で あたためると とけるよ！', '❄️で ひやすと かたまる！', 'とけた チョコで おえかき'],
      says: ['とろ〜ん', 'かたまった！', 'あま〜い！'],
      colors: [C('#7a4a2a'), C('#a86b3f'), C('#d9a06b'), C('#fff0e0'), C('#e88fb0'), C('#5b3520', 30), C('#f0d060', 60), C('#8fc9a0', 100)],
      tools: ['heat', 'cool', 'poke', 'grab', 'stamp', 'glitter'],
      count: 680,
      fill: 0.22,
      style: { kind: 'choco', gloss: 0.55, rim: 0.35, core: 0.62, rMul: 1.36, shadow: 0.3 },
      bgmRoot: 349.23,
      params: {
        spacing: 12.5, hMul: 2.15,
        fluidK: 0.75, clampNeg: true, scorrK: 0.0006,
        viscosity: 0.55, cohesion: 240, damping: 1.4,
        gravity: 1500, restitution: 0.02, friction: 0.5, iters: 3,
        useBonds: true, bondK: 0.95, yield: 0.14, plastic: 1.2,
        breakStretch: 1.8, formDist: 1.3, reform: true,
        useTemp: true, ambient: 0.42, tempDiffuse: 0.55, tempRelax: 0.14,
        meltT: 0.56, freezeT: 0.48
      }
    },

    /* ---------------- 8. すな ---------------- */
    {
      id: 'sand', name: 'すな', emoji: '🏖️', kind: 'grid',
      card: ['#f0d79b', '#d8a85f'], bg: ['#fff8e8', '#ffeccb'],
      hints: ['さらさら〜っと そそいで みて！', 'おみずを かけると かたまるよ', 'かたぬきで おしろを つくろう'],
      says: ['さらさら〜', 'できた！', 'ざくざく！'],
      colors: [C('#e8c88a'), C('#f0dcb0'), C('#d9a86b'), C('#ffc8a0'), C('#c0e0f0'), C('#f0b0d0', 30), C('#c8f0b0', 60), C('#e0c0f0', 100)],
      tools: ['pour', 'dig', 'water', 'stamp', 'blow', 'glitter'],
      cellSize: 3.4,
      style: { kind: 'sand' },
      bgmRoot: 466.16
    },

    /* ---------------- 9. ゆき ---------------- */
    {
      id: 'snow', name: 'ゆき', emoji: '⛄', kind: 'grid',
      card: ['#dff0ff', '#9fc9e8'], bg: ['#f2fbff', '#d8ecfb'],
      hints: ['ゆきを ふらせよう！', 'ぎゅっと かためて ゆきだるま', '🔥で とかすと おみずに！'],
      says: ['ふわふわ〜', 'つめた〜い！', 'ゆきだるま！'],
      colors: [C('#f4fbff'), C('#dcecfa'), C('#c0e0f5'), C('#ffd0e0'), C('#d0ffe8'), C('#fff0c0', 30), C('#e0d0ff', 60), C('#a8dcf5', 100)],
      tools: ['pour', 'pack', 'dig', 'heat', 'blow', 'stamp'],
      cellSize: 3.8,
      style: { kind: 'snow' },
      bgmRoot: 698.46
    },

    /* ---------------- 10. あわあわ ---------------- */
    {
      id: 'foam', name: 'あわあわ', emoji: '🫧', kind: 'bubble', mode: 'foam',
      card: ['#c9f0ff', '#8fd0f0'], bg: ['#f2fdff', '#dbf2fb'],
      hints: ['あわを もこもこ だそう！', 'さわると パチンって われるよ', 'ふーっと ふいて みて'],
      says: ['もこもこ〜', 'パチン！', 'ふわふわ〜'],
      colors: [C('#ffffff'), C('#d0f0ff'), C('#ffd0ec'), C('#d8ffd0'), C('#fff0c0'), C('#e0d0ff', 30), C('#c0fff0', 60), C('#ffc0c0', 100)],
      tools: ['bubble', 'pop', 'blow', 'poke', 'glitter'],
      style: { kind: 'foam' },
      bgmRoot: 783.99
    },

    /* ---------------- 11. しゃぼんだま ---------------- */
    {
      id: 'soap', name: 'しゃぼん', emoji: '🪩', kind: 'bubble', mode: 'soap',
      card: ['#b6e6ff', '#7fb0f0'], bg: ['#eaf7ff', '#cfe8ff'],
      hints: ['ゆびで ふいて しゃぼんだま！', 'あわせると おおきく なるよ', 'さわると パチン！'],
      says: ['ふわ〜', 'おおきい！', 'パチン！'],
      colors: [C('#ffffff'), C('#ffd0f0'), C('#d0f0ff'), C('#fff0d0'), C('#d0ffd8'), C('#e8d0ff', 30), C('#ffd0d0', 60), C('#d0fff0', 100)],
      tools: ['wand', 'pop', 'blow', 'glitter'],
      style: { kind: 'soap' },
      bgmRoot: 880
    },

    /* ---------------- 12. わたあめ ---------------- */
    {
      id: 'candy', name: 'わたあめ', emoji: '🍬', kind: 'fiber',
      card: ['#ffc0e0', '#ff8fc0'], bg: ['#fff2f9', '#ffe0f0'],
      hints: ['ぼうを くるくる まわして あつめよう！', 'おおきく なったら たべちゃおう', 'ふーっと ふくと ゆれるよ'],
      says: ['ふわふわ〜', 'あま〜い！', 'もぐもぐ！'],
      colors: [C('#ffc7e2'), C('#c7e2ff'), C('#e2ffc7'), C('#fff3c7'), C('#e8c7ff'), C('#ffc7c7', 30), C('#c7fff0', 60), C('#ffffff', 100)],
      tools: ['spin', 'eat', 'blow', 'glitter'],
      style: { kind: 'candy' },
      bgmRoot: 622.25
    }
  ];

  /* いろの ちいさな しゅうせい（はちみつの タイプミス よけ） */
  YA.materials.forEach(function (m) {
    if (!m.colors) return;
    m.colors.forEach(function (c) {
      if (!/^#[0-9a-fA-F]{3,8}$/.test(c.c)) c.c = '#f5ba34';
    });
  });

  YA.getMaterial = function (id) {
    for (var i = 0; i < YA.materials.length; i++) if (YA.materials[i].id === id) return YA.materials[i];
    return YA.materials[0];
  };

})(window);
