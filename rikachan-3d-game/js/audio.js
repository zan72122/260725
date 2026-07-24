/* ================================================================
   audio.js — WebAudio による効果音・BGM・ほめボイス（外部アセット不要）
   ================================================================ */
(function () {
  const RAudio = {
    ctx: null,
    master: null,
    bgmGain: null,
    sfxGain: null,
    soundOn: true,
    voiceOn: true,
    bgmTimer: null,
    bgmStep: 0,
    bgmSong: 'home',
    unlocked: false,
  };
  window.RAudio = RAudio;

  function ensureCtx() {
    if (!RAudio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      RAudio.ctx = new AC();
      RAudio.master = RAudio.ctx.createGain();
      RAudio.master.gain.value = 0.9;
      RAudio.master.connect(RAudio.ctx.destination);
      RAudio.bgmGain = RAudio.ctx.createGain();
      RAudio.bgmGain.gain.value = 0.22;
      RAudio.bgmGain.connect(RAudio.master);
      RAudio.sfxGain = RAudio.ctx.createGain();
      RAudio.sfxGain.gain.value = 0.8;
      RAudio.sfxGain.connect(RAudio.master);
    }
    if (RAudio.ctx.state === 'suspended') RAudio.ctx.resume();
    return true;
  }

  // iOS では最初のタッチでアンロックが必要
  RAudio.unlock = function () {
    if (!ensureCtx()) return;
    if (!RAudio.unlocked) {
      const b = RAudio.ctx.createBuffer(1, 1, 22050);
      const s = RAudio.ctx.createBufferSource();
      s.buffer = b; s.connect(RAudio.ctx.destination); s.start(0);
      RAudio.unlocked = true;
    }
  };

  /* ---------------- 基本トーン ---------------- */
  function tone(freq, t0, dur, type, vol, dest, bend) {
    const ctx = RAudio.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * bend), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(dest || RAudio.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, vol, hp) {
    const ctx = RAudio.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 2000;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(RAudio.sfxGain);
    src.start(t0);
  }

  /* ---------------- 効果音 ---------------- */
  const SFX = {
    tap()      { const t = RAudio.ctx.currentTime; tone(660, t, 0.09, 'sine', 0.35, null, 1.4); },
    pop()      { const t = RAudio.ctx.currentTime; tone(420, t, 0.1, 'square', 0.18, null, 2.2); },
    sparkle()  { const t = RAudio.ctx.currentTime;
                 [1318, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.06, 0.25, 'sine', 0.22)); },
    coin()     { const t = RAudio.ctx.currentTime;
                 tone(988, t, 0.09, 'square', 0.16); tone(1319, t + 0.09, 0.24, 'square', 0.16); },
    yay()      { const t = RAudio.ctx.currentTime;
                 [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.22, 'triangle', 0.3)); },
    fanfare()  { const t = RAudio.ctx.currentTime;
                 const seq = [[523,0],[523,0.14],[523,0.28],[659,0.42],[784,0.62],[659,0.82],[1047,0.96]];
                 seq.forEach(([f, dt]) => { tone(f, t + dt, 0.3, 'triangle', 0.3); tone(f/2, t + dt, 0.3, 'sine', 0.2); }); },
    boing()    { const t = RAudio.ctx.currentTime; tone(180, t, 0.25, 'sine', 0.35, null, 3.5); },
    swish()    { noise(RAudio.ctx.currentTime, 0.2, 0.25, 1200); },
    scrub()    { noise(RAudio.ctx.currentTime, 0.1, 0.15, 900); },
    splash()   { const t = RAudio.ctx.currentTime; noise(t, 0.3, 0.2, 500); tone(300, t, 0.2, 'sine', 0.15, null, 0.5); },
    sizzle()   { noise(RAudio.ctx.currentTime, 0.35, 0.12, 3000); },
    flip()     { const t = RAudio.ctx.currentTime; tone(300, t, 0.3, 'sine', 0.3, null, 4); },
    note(i)    { const t = RAudio.ctx.currentTime;
                 const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319];
                 tone(scale[i % scale.length], t, 0.35, 'triangle', 0.32); },
    wrong()    { const t = RAudio.ctx.currentTime; tone(220, t, 0.18, 'sine', 0.2, null, 0.85); },
    ding()     { const t = RAudio.ctx.currentTime; tone(1568, t, 0.5, 'sine', 0.3); tone(2093, t, 0.5, 'sine', 0.15); },
    camera()   { const t = RAudio.ctx.currentTime; noise(t, 0.05, 0.3, 3000); tone(1200, t, 0.05, 'square', 0.1); },
    meow()     { const t = RAudio.ctx.currentTime; tone(700, t, 0.28, 'sawtooth', 0.1, null, 0.6); },
    gift()     { const t = RAudio.ctx.currentTime;
                 [784, 988, 1175, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.07, 0.3, 'sine', 0.25)); },
    step()     { const t = RAudio.ctx.currentTime; tone(160, t, 0.07, 'sine', 0.12, null, 0.6); },
    kon()      { const t = RAudio.ctx.currentTime; tone(900, t, 0.05, 'square', 0.12, null, 0.8); noise(t, 0.03, 0.1, 3000); },
    paka()     { const t = RAudio.ctx.currentTime; noise(t, 0.08, 0.2, 2000); tone(500, t + 0.03, 0.15, 'sine', 0.2, null, 1.6); },
    pour()     { noise(RAudio.ctx.currentTime, 0.5, 0.14, 600); },
    squeak()   { const t = RAudio.ctx.currentTime; tone(1300, t, 0.12, 'sine', 0.12, null, 1.5); },
    pon()      { const t = RAudio.ctx.currentTime; tone(220, t, 0.16, 'sine', 0.4, null, 0.55); noise(t, 0.05, 0.12, 1500); },
    clip()     { const t = RAudio.ctx.currentTime; tone(1500, t, 0.04, 'square', 0.1); },
    beep()     { const t = RAudio.ctx.currentTime; tone(1760, t, 0.15, 'square', 0.15); tone(1760, t + 0.25, 0.15, 'square', 0.15); tone(1760, t + 0.5, 0.3, 'square', 0.15); },
    rumble()   { noise(RAudio.ctx.currentTime, 0.4, 0.06, 150); },
    rain()     { noise(RAudio.ctx.currentTime, 0.6, 0.1, 4000); },
    gust()     { noise(RAudio.ctx.currentTime, 0.5, 0.16, 900); },
    doorOpen() { const t = RAudio.ctx.currentTime; tone(300, t, 0.35, 'sine', 0.14, null, 1.8); noise(t, 0.15, 0.06, 1200); },
    drawer()   { const t = RAudio.ctx.currentTime; noise(t, 0.2, 0.1, 700); tone(240, t, 0.2, 'sine', 0.1, null, 1.3); },
    shakeCloth(){ noise(RAudio.ctx.currentTime, 0.12, 0.25, 1800); },
    snip()     { const t = RAudio.ctx.currentTime; tone(2400, t, 0.05, 'square', 0.12); noise(t, 0.04, 0.15, 4000); },
    chime()    { const t = RAudio.ctx.currentTime; [1568, 1319, 1047].forEach((f, i) => tone(f, t + i * 0.18, 0.5, 'sine', 0.2)); },
    charin()   { const t = RAudio.ctx.currentTime; tone(2093, t, 0.08, 'square', 0.14); tone(2637, t + 0.06, 0.3, 'sine', 0.18); },
    slide()    { noise(RAudio.ctx.currentTime, 0.25, 0.08, 500); },
    thunk()    { const t = RAudio.ctx.currentTime; tone(120, t, 0.15, 'sine', 0.3, null, 0.5); },
  };

  RAudio.sfx = function (name, arg) {
    if (!RAudio.soundOn) return;
    if (!ensureCtx()) return;
    try { if (SFX[name]) SFX[name](arg); } catch (e) { /* no-op */ }
  };

  /* ---------------- BGM（かんたんシーケンサー） ---------------- */
  // メロディ: 周波数 or 0（休符）。8分音符ごと。
  const N = { C4:262, D4:294, E4:330, F4:349, G4:392, A4:440, B4:494,
              C5:523, D5:587, E5:659, F5:698, G5:784, A5:880, B5:988, C6:1047, R:0 };
  const SONGS = {
    home: {
      tempo: 108,
      mel: [N.E5,N.R,N.G5,N.R,N.C5,N.R,N.E5,N.R, N.D5,N.R,N.F5,N.R,N.G5,N.R,N.R,N.R,
            N.E5,N.R,N.G5,N.R,N.A5,N.R,N.G5,N.R, N.E5,N.D5,N.C5,N.R,N.R,N.R,N.R,N.R],
      bass: [N.C4,0,0,0,N.G4,0,0,0, N.F4,0,0,0,N.G4,0,0,0,
             N.C4,0,0,0,N.F4,0,0,0, N.G4,0,0,0,N.C4,0,0,0],
    },
    dressup: {
      tempo: 96,
      mel: [N.G5,N.R,N.E5,N.R,N.C5,N.E5,N.G5,N.R, N.A5,N.R,N.F5,N.R,N.A5,N.R,N.G5,N.R,
            N.E5,N.R,N.F5,N.R,N.G5,N.R,N.E5,N.C5, N.D5,N.R,N.R,N.R,N.C5,N.R,N.R,N.R],
      bass: [N.C4,0,N.E4,0,N.G4,0,N.E4,0, N.F4,0,N.A4,0,N.F4,0,N.G4,0,
             N.C4,0,N.E4,0,N.G4,0,N.E4,0, N.G4,0,N.B4,0,N.C4,0,0,0],
    },
    game: {
      tempo: 132,
      mel: [N.C5,N.E5,N.G5,N.E5,N.C5,N.E5,N.G5,N.R, N.D5,N.F5,N.A5,N.F5,N.D5,N.F5,N.A5,N.R,
            N.E5,N.G5,N.C6,N.G5,N.E5,N.G5,N.C6,N.R, N.G5,N.F5,N.E5,N.D5,N.C5,N.R,N.R,N.R],
      bass: [N.C4,0,N.C4,0,N.C4,0,N.C4,0, N.F4,0,N.F4,0,N.F4,0,N.F4,0,
             N.C4,0,N.C4,0,N.C4,0,N.C4,0, N.G4,0,N.G4,0,N.C4,0,0,0],
    },
    idol: {
      tempo: 140,
      mel: [N.A4,N.C5,N.E5,N.C5,N.A4,N.C5,N.E5,N.R, N.G4,N.B4,N.D5,N.B4,N.G4,N.B4,N.D5,N.R,
            N.A4,N.C5,N.E5,N.A5,N.G5,N.E5,N.C5,N.R, N.E5,N.D5,N.B4,N.D5,N.A4,N.R,N.R,N.R],
      bass: [N.A4/2,0,0,0,N.A4/2,0,0,0, N.G4/2,0,0,0,N.G4/2,0,0,0,
             N.A4/2,0,0,0,N.F4/2,0,0,0, N.E4/2,0,0,0,N.A4/2,0,0,0],
    },
  };

  function bgmTick() {
    const song = SONGS[RAudio.bgmSong] || SONGS.home;
    const stepDur = 60 / song.tempo / 2; // 8分音符
    const t = RAudio.ctx.currentTime;
    const i = RAudio.bgmStep % song.mel.length;
    const m = song.mel[i];
    const b = song.bass[i];
    if (m) tone(m, t, stepDur * 1.7, 'triangle', 0.16, RAudio.bgmGain);
    if (b) tone(b / 2, t, stepDur * 1.9, 'sine', 0.2, RAudio.bgmGain);
    if (i % 4 === 0) tone(70, t, 0.08, 'sine', 0.25, RAudio.bgmGain, 0.5); // キック風
    RAudio.bgmStep++;
    RAudio.bgmTimer = setTimeout(bgmTick, stepDur * 1000);
  }

  RAudio.playBGM = function (name) {
    RAudio.bgmSong = name || 'home';
    if (!RAudio.soundOn) return;
    if (!ensureCtx()) return;
    RAudio.stopBGM();
    RAudio.bgmStep = 0;
    bgmTick();
  };
  RAudio.stopBGM = function () {
    if (RAudio.bgmTimer) { clearTimeout(RAudio.bgmTimer); RAudio.bgmTimer = null; }
  };
  RAudio.setSound = function (on) {
    RAudio.soundOn = on;
    if (!on) RAudio.stopBGM();
    else RAudio.playBGM(RAudio.bgmSong);
  };

  /* ---------------- ほめボイス（音声合成） ---------------- */
  let jaVoice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices();
    jaVoice = vs.find(v => v.lang && v.lang.startsWith('ja')) || null;
  }
  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  RAudio.speak = function (text, opts) {
    if (!RAudio.voiceOn || !window.speechSynthesis) return;
    opts = opts || {};
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (jaVoice) u.voice = jaVoice;
      u.pitch = opts.pitch !== undefined ? opts.pitch : 1.5;
      u.rate = opts.rate !== undefined ? opts.rate : 0.95;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* no-op */ }
  };

  // ママのこえ（すこしおちついたトーン）
  RAudio.speakMama = function (text) { RAudio.speak(text, { pitch: 1.15, rate: 0.9 }); };
})();
