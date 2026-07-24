/* ============================================================
 * audio.js — 合成サウンドエンジン（音声ファイル不要）
 * BGM 2曲（ハッピー / こもりうた）+ 効果音を WebAudio で生成
 * ============================================================ */
(function () {
  'use strict';

  var ctx = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var muted = false;
  var currentSong = null;   // 'happy' | 'lullaby' | null
  var schedTimer = null;
  var nextNoteTime = 0;
  var songPos = 0;

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.32;
      musicGain.connect(masterGain);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.85;
      sfxGain.connect(masterGain);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  /* ---------- 基本音源ヘルパー ---------- */

  function tone(opts) {
    // opts: {freq, freqEnd, type, dur, vol, when, dest, attack, release}
    if (!ctx || muted) return;
    var when = ctx.currentTime + (opts.when || 0);
    var dur = opts.dur || 0.2;
    var osc = ctx.createOscillator();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, when);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), when + dur);
    var g = ctx.createGain();
    var vol = opts.vol != null ? opts.vol : 0.3;
    var atk = opts.attack != null ? opts.attack : 0.01;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(opts.dest || sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function noise(opts) {
    // opts: {dur, vol, when, filterFreq, filterQ, type('lowpass'|'bandpass'|'highpass'), freqEnd}
    if (!ctx || muted) return;
    var when = ctx.currentTime + (opts.when || 0);
    var dur = opts.dur || 0.2;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.type || 'lowpass';
    filt.frequency.setValueAtTime(opts.filterFreq || 1000, when);
    if (opts.freqEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), when + dur);
    filt.Q.value = opts.filterQ || 1;
    var g = ctx.createGain();
    var vol = opts.vol != null ? opts.vol : 0.25;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start(when);
    src.stop(when + dur + 0.05);
  }

  /* ---------- 効果音 ---------- */

  var SFX = {
    pop: function () {
      tone({ freq: 500, freqEnd: 900, type: 'sine', dur: 0.09, vol: 0.4 });
      noise({ dur: 0.05, vol: 0.12, filterFreq: 3200, type: 'highpass' });
    },
    tap: function () {
      tone({ freq: 700, freqEnd: 1000, type: 'triangle', dur: 0.07, vol: 0.3 });
    },
    chime: function () {
      var notes = [880, 1108.7, 1318.5];
      for (var i = 0; i < notes.length; i++)
        tone({ freq: notes[i], type: 'triangle', dur: 0.35, vol: 0.22, when: i * 0.08 });
    },
    star: function () {
      var notes = [1046.5, 1318.5, 1568, 2093];
      for (var i = 0; i < notes.length; i++)
        tone({ freq: notes[i], type: 'triangle', dur: 0.3, vol: 0.2, when: i * 0.07 });
    },
    tada: function () {
      var seq = [523.25, 659.25, 784, 1046.5, 784, 1046.5];
      var when = [0, 0.11, 0.22, 0.36, 0.5, 0.62];
      for (var i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], type: 'square', dur: 0.22, vol: 0.12, when: when[i] });
        tone({ freq: seq[i] / 2, type: 'triangle', dur: 0.25, vol: 0.15, when: when[i] });
      }
    },
    munch: function () {
      noise({ dur: 0.1, vol: 0.3, filterFreq: 900, freqEnd: 300, type: 'lowpass', filterQ: 2 });
      tone({ freq: 180, freqEnd: 90, type: 'sine', dur: 0.1, vol: 0.2 });
    },
    gulp: function () {
      tone({ freq: 300, freqEnd: 120, type: 'sine', dur: 0.22, vol: 0.3 });
      tone({ freq: 150, freqEnd: 350, type: 'sine', dur: 0.15, vol: 0.2, when: 0.2 });
    },
    giggle: function () {
      var base = 600 + Math.random() * 150;
      for (var i = 0; i < 4; i++) {
        tone({ freq: base + i * 90, freqEnd: base + i * 90 + 220, type: 'sine', dur: 0.09, vol: 0.22, when: i * 0.09 });
      }
    },
    happyBaby: function () {
      tone({ freq: 550, freqEnd: 880, type: 'sine', dur: 0.18, vol: 0.24 });
      tone({ freq: 700, freqEnd: 1050, type: 'sine', dur: 0.2, vol: 0.2, when: 0.18 });
    },
    sadBaby: function () {
      tone({ freq: 500, freqEnd: 320, type: 'sine', dur: 0.4, vol: 0.2 });
      tone({ freq: 430, freqEnd: 260, type: 'sine', dur: 0.45, vol: 0.16, when: 0.4 });
    },
    splash: function () {
      noise({ dur: 0.28, vol: 0.3, filterFreq: 1600, freqEnd: 500, type: 'bandpass', filterQ: 1.2 });
      tone({ freq: 260, freqEnd: 120, type: 'sine', dur: 0.15, vol: 0.14 });
    },
    bubble: function () {
      var f = 350 + Math.random() * 500;
      tone({ freq: f, freqEnd: f * 2.4, type: 'sine', dur: 0.1, vol: 0.2 });
    },
    squeak: function () {
      var f = 900 + Math.random() * 300;
      tone({ freq: f, freqEnd: f * 1.4, type: 'triangle', dur: 0.09, vol: 0.16 });
      tone({ freq: f * 1.4, freqEnd: f, type: 'triangle', dur: 0.1, vol: 0.14, when: 0.09 });
    },
    quack: function () {
      tone({ freq: 320, freqEnd: 210, type: 'sawtooth', dur: 0.12, vol: 0.2 });
      tone({ freq: 290, freqEnd: 180, type: 'sawtooth', dur: 0.14, vol: 0.16, when: 0.14 });
    },
    shower: function () {
      noise({ dur: 1.1, vol: 0.2, filterFreq: 2500, freqEnd: 1800, type: 'bandpass', filterQ: 0.6 });
    },
    boing: function () {
      tone({ freq: 160, freqEnd: 520, type: 'sine', dur: 0.22, vol: 0.3 });
    },
    balloonPop: function () {
      noise({ dur: 0.14, vol: 0.5, filterFreq: 2200, freqEnd: 300, type: 'lowpass' });
      tone({ freq: 800, freqEnd: 150, type: 'square', dur: 0.08, vol: 0.14 });
    },
    camera: function () {
      noise({ dur: 0.05, vol: 0.35, filterFreq: 4000, type: 'highpass' });
      tone({ freq: 1400, type: 'square', dur: 0.05, vol: 0.15, when: 0.06 });
    },
    yawn: function () {
      tone({ freq: 440, freqEnd: 200, type: 'sine', dur: 0.8, vol: 0.18, attack: 0.15 });
    },
    snore: function () {
      noise({ dur: 0.5, vol: 0.1, filterFreq: 400, freqEnd: 200, type: 'lowpass', filterQ: 2 });
    },
    twinkle: function () {
      var f = 1300 + Math.random() * 900;
      tone({ freq: f, type: 'triangle', dur: 0.4, vol: 0.16 });
      tone({ freq: f * 1.5, type: 'triangle', dur: 0.35, vol: 0.1, when: 0.05 });
    },
    ding: function () {
      tone({ freq: 1046.5, type: 'triangle', dur: 0.4, vol: 0.25 });
    },
    whoosh: function () {
      noise({ dur: 0.25, vol: 0.2, filterFreq: 600, freqEnd: 2400, type: 'bandpass', filterQ: 1 });
    },
    sparkle: function () {
      for (var i = 0; i < 3; i++) {
        var f = 1500 + Math.random() * 1200;
        tone({ freq: f, type: 'sine', dur: 0.18, vol: 0.1, when: i * 0.06 });
      }
    },
    drum: function () {
      tone({ freq: 150, freqEnd: 60, type: 'sine', dur: 0.18, vol: 0.4 });
    },
    /* ---- ごはん用 ---- */
    suck: function () {
      // ちゅうちゅう（ほにゅうびん）
      noise({ dur: 0.16, vol: 0.16, filterFreq: 700, freqEnd: 350, type: 'bandpass', filterQ: 3 });
      tone({ freq: 240, freqEnd: 180, type: 'sine', dur: 0.14, vol: 0.12 });
    },
    puha: function () {
      // のみおわり「ぷはー」
      noise({ dur: 0.45, vol: 0.18, filterFreq: 1300, freqEnd: 500, type: 'bandpass', filterQ: 0.7 });
      tone({ freq: 500, freqEnd: 280, type: 'sine', dur: 0.4, vol: 0.14, attack: 0.06 });
    },
    burp: function () {
      // げっぷ
      tone({ freq: 130, freqEnd: 70, type: 'sawtooth', dur: 0.32, vol: 0.22, attack: 0.03 });
      tone({ freq: 95, freqEnd: 55, type: 'square', dur: 0.3, vol: 0.1, when: 0.05 });
      noise({ dur: 0.28, vol: 0.1, filterFreq: 420, freqEnd: 180, type: 'lowpass', filterQ: 3 });
    },
    strawStab: function () {
      // ストロー「プスッ」
      noise({ dur: 0.07, vol: 0.32, filterFreq: 2600, freqEnd: 700, type: 'bandpass', filterQ: 2 });
      tone({ freq: 900, freqEnd: 300, type: 'triangle', dur: 0.06, vol: 0.16 });
    },
    slurp: function () {
      // さいごの「ズゾゾー」
      noise({ dur: 0.7, vol: 0.26, filterFreq: 1500, freqEnd: 300, type: 'bandpass', filterQ: 4 });
      tone({ freq: 350, freqEnd: 130, type: 'sawtooth', dur: 0.65, vol: 0.07 });
    },
    peel: function () {
      // かわを「びりっ」
      noise({ dur: 0.18, vol: 0.3, filterFreq: 1800, freqEnd: 3600, type: 'bandpass', filterQ: 1.5 });
    },
    pat: function () {
      // せなか・むねをとんとん
      tone({ freq: 130, freqEnd: 85, type: 'sine', dur: 0.1, vol: 0.28 });
      noise({ dur: 0.06, vol: 0.08, filterFreq: 500, type: 'lowpass' });
    },
    refuse: function () {
      // いやいや（ぷいっ）
      tone({ freq: 400, freqEnd: 340, type: 'triangle', dur: 0.12, vol: 0.2 });
      tone({ freq: 360, freqEnd: 300, type: 'triangle', dur: 0.14, vol: 0.2, when: 0.14 });
    },
    /* ---- あそぶ用 ---- */
    crash: function () {
      // つみきが「ガッシャーン」
      noise({ dur: 0.5, vol: 0.5, filterFreq: 2400, freqEnd: 300, type: 'lowpass', filterQ: 1 });
      var ns = [520, 390, 300, 240];
      for (var i = 0; i < ns.length; i++) {
        tone({ freq: ns[i], freqEnd: ns[i] * 0.6, type: 'square', dur: 0.16, vol: 0.08, when: i * 0.07 });
      }
    },
    bounce: function () {
      // ふうせんを「ポン」
      tone({ freq: 300, freqEnd: 520, type: 'sine', dur: 0.12, vol: 0.3 });
    },
    pofu: function () {
      // ゆかに「ぽふっ」
      noise({ dur: 0.14, vol: 0.2, filterFreq: 500, freqEnd: 200, type: 'lowpass' });
      tone({ freq: 170, freqEnd: 110, type: 'sine', dur: 0.14, vol: 0.16 });
    },
    taikoLow: function () {
      tone({ freq: 120, freqEnd: 55, type: 'sine', dur: 0.28, vol: 0.5 });
      noise({ dur: 0.05, vol: 0.1, filterFreq: 900, type: 'lowpass' });
    },
    taikoHigh: function () {
      tone({ freq: 260, freqEnd: 160, type: 'sine', dur: 0.14, vol: 0.36 });
      noise({ dur: 0.04, vol: 0.14, filterFreq: 2400, type: 'highpass' });
    },
    peekabooCall: function () {
      // 「いない いない…」
      tone({ freq: 392, type: 'triangle', dur: 0.18, vol: 0.18 });
      tone({ freq: 392, type: 'triangle', dur: 0.18, vol: 0.18, when: 0.28 });
    },
    peekabooBaa: function () {
      // 「ばあ！」
      tone({ freq: 523.25, freqEnd: 784, type: 'square', dur: 0.3, vol: 0.14 });
      tone({ freq: 659.25, freqEnd: 988, type: 'square', dur: 0.3, vol: 0.12, when: 0.02 });
      noise({ dur: 0.12, vol: 0.1, filterFreq: 3000, type: 'highpass' });
    },
    /* ---- おふろ・みだしなみ用 ---- */
    pour: function () {
      // じゃばじゃばおゆはり
      noise({ dur: 0.9, vol: 0.22, filterFreq: 900, freqEnd: 1400, type: 'bandpass', filterQ: 0.8 });
    },
    sneeze: function () {
      // 「ハックション！」
      tone({ freq: 600, freqEnd: 900, type: 'sine', dur: 0.18, vol: 0.16 });
      noise({ dur: 0.22, vol: 0.34, filterFreq: 2200, freqEnd: 500, type: 'bandpass', filterQ: 1, when: 0.2 });
      tone({ freq: 500, freqEnd: 200, type: 'sine', dur: 0.25, vol: 0.18, when: 0.2 });
    },
    shiver: function () {
      // ぶるぶる
      for (var i = 0; i < 4; i++) {
        tone({ freq: 300 + (i % 2) * 40, type: 'triangle', dur: 0.06, vol: 0.1, when: i * 0.07 });
      }
    },
    dryer: function () {
      // ドライヤー「ブオー」
      noise({ dur: 1.2, vol: 0.2, filterFreq: 600, freqEnd: 900, type: 'bandpass', filterQ: 0.6 });
      tone({ freq: 110, type: 'sawtooth', dur: 1.1, vol: 0.06 });
    },
    stink: function () {
      // 「くさい！」コミカルな下降ワウ
      tone({ freq: 380, freqEnd: 200, type: 'sawtooth', dur: 0.35, vol: 0.12 });
      tone({ freq: 300, freqEnd: 150, type: 'sawtooth', dur: 0.4, vol: 0.1, when: 0.3 });
    },
    washer: function () {
      // せんたくきゴトゴト
      noise({ dur: 0.5, vol: 0.14, filterFreq: 300, freqEnd: 500, type: 'lowpass', filterQ: 2 });
      tone({ freq: 90, freqEnd: 120, type: 'sine', dur: 0.45, vol: 0.12 });
    },
    brush: function () {
      // はみがきシャカシャカ
      noise({ dur: 0.09, vol: 0.2, filterFreq: 3600, freqEnd: 2600, type: 'bandpass', filterQ: 2 });
    },
    spit: function () {
      // 「ぺっ」
      noise({ dur: 0.12, vol: 0.24, filterFreq: 1400, freqEnd: 400, type: 'bandpass', filterQ: 1.5 });
      tone({ freq: 300, freqEnd: 140, type: 'sine', dur: 0.12, vol: 0.12, when: 0.05 });
    },
    pageTurn: function () {
      // ページをめくる
      noise({ dur: 0.2, vol: 0.16, filterFreq: 1600, freqEnd: 3400, type: 'bandpass', filterQ: 1 });
    },
    kenken: function () {
      // けんけんバランス
      tone({ freq: 220, freqEnd: 420, type: 'sine', dur: 0.14, vol: 0.2 });
    },
    hairFlutter: function () {
      noise({ dur: 0.3, vol: 0.1, filterFreq: 1200, freqEnd: 2000, type: 'bandpass', filterQ: 0.8 });
    }
  };

  /* 楽器用：任意の音程を鳴らす（木琴・たいこ以外にも使える） */
  function playNote(freq, kind) {
    if (!ensureCtx() || muted) return;
    if (kind === 'xylo') {
      tone({ freq: freq, type: 'triangle', dur: 0.5, vol: 0.26, attack: 0.005 });
      tone({ freq: freq * 3, type: 'sine', dur: 0.22, vol: 0.08, attack: 0.005 });
    } else {
      tone({ freq: freq, type: 'triangle', dur: 0.35, vol: 0.2 });
    }
  }

  /* ---------- BGM（16分音符ステップシーケンサ） ----------
   * 配列: [メロディ半音番号 or null, ...]  A4=69 基準の MIDI ノート
   * ------------------------------------------------------- */

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // ハッピーなおせわタイム（オリジナル・8小節ループ / C メジャーペンタ中心）
  var HAPPY_MELODY = [
    72, null, 76, null, 79, null, 76, null, 72, null, 76, null, 79, 81, 79, null,
    76, null, 72, null, 74, null, 76, null, 74, null, 72, null, 69, null, null, null,
    72, null, 76, null, 79, null, 76, null, 81, null, 79, null, 76, 74, 72, null,
    74, null, 76, null, 74, null, 72, null, 69, null, 72, null, null, null, null, null
  ];
  var HAPPY_BASS = [
    48, null, null, null, 52, null, null, null, 45, null, null, null, 43, null, null, null,
    48, null, null, null, 45, null, null, null, 41, null, null, null, 43, null, null, null,
    48, null, null, null, 52, null, null, null, 45, null, null, null, 43, null, null, null,
    41, null, null, null, 43, null, null, null, 48, null, null, null, 43, null, null, null
  ];

  // こもりうた（オリジナル・ゆったり 3 拍子風ループ）
  var LULLABY_MELODY = [
    76, null, null, null, 74, null, 72, null, null, null, null, null,
    74, null, null, null, 72, null, 69, null, null, null, null, null,
    72, null, null, null, 74, null, 76, null, 74, null, 72, null,
    69, null, null, null, null, null, null, null, null, null, null, null
  ];
  var LULLABY_BASS = [
    48, null, null, null, null, null, 52, null, null, null, null, null,
    45, null, null, null, null, null, 48, null, null, null, null, null,
    41, null, null, null, null, null, 43, null, null, null, null, null,
    45, null, null, null, null, null, 40, null, null, null, null, null
  ];

  var SONGS = {
    happy:   { melody: HAPPY_MELODY,   bass: HAPPY_BASS,   stepDur: 0.145, mtype: 'square',   mvol: 0.10, btype: 'triangle', bvol: 0.20 },
    lullaby: { melody: LULLABY_MELODY, bass: LULLABY_BASS, stepDur: 0.30,  mtype: 'triangle', mvol: 0.16, btype: 'sine',     bvol: 0.18 }
  };

  function scheduleSong() {
    if (!currentSong || !ctx || muted) return;
    var song = SONGS[currentSong];
    var ahead = 0.35;
    while (nextNoteTime < ctx.currentTime + ahead) {
      var i = songPos % song.melody.length;
      var m = song.melody[i];
      var b = song.bass[i % song.bass.length];
      var when = nextNoteTime - ctx.currentTime;
      if (m != null) {
        tone({ freq: midi(m), type: song.mtype, dur: song.stepDur * 1.9, vol: song.mvol, when: when, dest: musicGain, attack: 0.02 });
        if (currentSong === 'lullaby') {
          // オルゴール風のきらめき
          tone({ freq: midi(m) * 2, type: 'sine', dur: song.stepDur * 2.4, vol: song.mvol * 0.35, when: when, dest: musicGain, attack: 0.01 });
        }
      }
      if (b != null) {
        tone({ freq: midi(b), type: song.btype, dur: song.stepDur * 3.2, vol: song.bvol, when: when, dest: musicGain, attack: 0.03 });
      }
      nextNoteTime += song.stepDur;
      songPos++;
    }
  }

  function startMusic(name) {
    if (!ensureCtx()) return;
    if (currentSong === name) return;
    stopMusic();
    currentSong = name;
    songPos = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduleSong, 90);
  }

  function stopMusic() {
    currentSong = null;
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  }

  /* ---------- 公開 API ---------- */

  window.SND = {
    init: function () { return ensureCtx(); },
    play: function (name) {
      if (!ensureCtx()) return;
      if (muted) return;
      if (SFX[name]) SFX[name]();
    },
    note: playNote,
    startMusic: startMusic,
    stopMusic: stopMusic,
    setMuted: function (m) {
      muted = m;
      if (masterGain) masterGain.gain.value = m ? 0 : 0.9;
    },
    isMuted: function () { return muted; }
  };
})();
