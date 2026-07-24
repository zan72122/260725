/**
 * musicbox.js — オルゴール
 *
 * 「おと」が、とがった突起と金属のはじきでできていることを見せる機械。
 *
 *   ハンドル → 歯車 → ピンのついた ドラム → くしの歯を はじく → おと
 *            → 風切りの調速機（回りすぎないようにする）
 *
 * さわりどころ:
 *   - ハンドルをまわすと、まわす速さがそのまま曲の速さになる
 *   - くしの歯を指でなぞると、一枚ずつ ちがう おとが鳴る（グリッサンド）
 *   - ドラムを押さえると、曲がぴたりと止まる
 *   - ふたを閉じると、おとがこもる（連続的に変わる）
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { semitoneToFreq } from '../core/audio.js';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../lib/math.js';

/** ハ長調の音階を 2 オクターブぶん（15枚の歯） */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const TINES = SCALE.length;
const BEATS = 48;

/** きらきら星（8拍 × 6フレーズ）。数字は くしの歯のばんごう、-1 は休み。 */
const MELODY = [
  0, 0, 4, 4, 5, 5, 4, -1,
  3, 3, 2, 2, 1, 1, 0, -1,
  4, 4, 3, 3, 2, 2, 1, -1,
  4, 4, 3, 3, 2, 2, 1, -1,
  0, 0, 4, 4, 5, 5, 4, -1,
  3, 3, 2, 2, 1, 1, 0, -1,
];
/** ひくい ばんそう（フレーズのあたまだけ） */
const BASS = { 0: 0, 8: 3, 16: 4, 24: 4, 32: 0, 40: 3 };

const DRUM_R = 0.0132;
const DRUM_LEN = 0.058;
const TINE_PITCH = 0.0036;

export class MusicBox extends Machine {
  static meta = {
    id: 'music',
    name: 'オルゴール',
    sub: 'おとが みえる',
    accent: 0xc98a4b,
    backdrop: {
      top: '#fbf1e4',
      middle: '#f0dfc6',
      bottom: '#d5bb99',
      glow: '#ffdfae',
      glowStrength: 0.12,
    },
    bloom: { strength: 0.28, radius: 0.5, threshold: 1.1 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M8 20h32v16a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V20Z" fill="#c98a4b" stroke="#7d4f24" stroke-width="2.4"/>
      <path d="M8 20 24 9l16 11" fill="#e7b979" stroke="#7d4f24" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M40 24h5v6h-5" stroke="#7d4f24" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="47" cy="30" r="2.6" fill="#f2c04f" stroke="#7d4f24" stroke-width="2"/>
      <path d="M18 33a2.6 2.6 0 1 1-1.8-2.5v-6l8-1.8v6.4" stroke="#fff3d6" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <circle cx="21.6" cy="30.6" r="2.6" fill="#fff3d6"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    this.angle = 0;      // ドラムの角度
    this.omega = 0;      // ドラムの角速度
    this.lastBeat = -1;
    this.drumHeld = false;
    this.driving = false;
    this._driveTimer = 0;
    this.lid = 1;        // ふたの開き 0..1
    this.lidTarget = 1;
    /** 各歯の振動状態 */
    this.tineVib = new Float32Array(TINES);
    this.tinePhase = new Float32Array(TINES);

    this.radius = 0.082;
    this.center = new THREE.Vector3(0, 0.040, 0);
    this.footprint = { w: 0.125, d: 0.085, opacity: 0.36 };

    // 少し斜めに置いて、正面のくしと右のハンドルが同時に見えるようにする
    this.root.rotation.y = -26 * (Math.PI / 180);
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.25, -0.55, -1.0),
      center: this.center,
      span: 0.115,
      noiseScale: 12,
    });

    this.mats = {
      wood: M.shell('wood', { seed: 61 }),
      woodDark: M.shell('wood', { seed: 61, light: '#a9723f', dark: '#5d3a1c' }),
      lidGlass: M.shell('glass', { strength: 0.94, thickness: 0.003 }),
      brassTrim: M.shell('brass', { color: 0xe0b055 }),
      felt: M.shell('fabric', { color: 0xc0503f }),

      plate: M.part('brass', { color: 0xd9a94e }),
      drum: M.part('brass', { color: 0xe8c073 }),
      pin: M.part('steel', { color: 0xe6ecf2, roughness: 0.14 }),
      comb: M.part('steel', { color: 0xd4dce4, roughness: 0.16 }),
      combBase: M.part('brass', { color: 0xc79a4e }),
      gear: M.part('brass'),
      shaft: M.part('steel', { color: 0xdde3e9, roughness: 0.18 }),
      governor: M.part('steel', { color: 0xc8d2da, roughness: 0.2 }),
      crankPaint: M.part('brass', { color: 0xefc978 }),
      knob: M.part('softPlastic', { color: 0xf2634f }),
      screw: M.part('steel', { color: 0xc8ced5 }),
    };

    this._buildBox();
    this._buildMechanism();
    this._buildComb();
    this._buildCrank();

    this.setXray(0);
  }

  /* --- 箱とふた ------------------------------------------------------- */

  _buildBox() {
    const g = group({ name: 'box' });
    const W = 0.118;
    const D = 0.080;
    const H = 0.042;

    // 箱（そこと4面）
    mesh(new G.RoundedBoxGeometry(W, H, D, 5, 0.0055), this.mats.wood, {
      parent: g, pos: [0, H / 2, 0],
    });
    // ふちの真鍮
    mesh(G.roundedPlate(W + 0.003, D + 0.003, 0.0032, 0.007, { bevel: 0.0006 }), this.mats.brassTrim, {
      parent: g, pos: [0, H + 0.0002, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    // 内側のフェルト（底）
    mesh(G.roundedPlate(W - 0.014, D - 0.014, 0.0012, 0.004), this.mats.felt, {
      parent: g, pos: [0, H - 0.0026, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    // 脚
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(
          G.lathe(
            [
              [0, 0],
              [0.0068, 0],
              [0.0074, 0.0026],
              [0.0056, 0.0060],
              [0, 0.0064],
            ],
            { segments: 18, center: false },
          ),
          this.mats.woodDark,
          { parent: g, pos: [sx * 0.046, 0.0002, sz * 0.028], rot: [Math.PI, 0, 0], cast: false },
        );
      }
    }
    g.position.y = 0.0064;
    this.addShell(g);
    this.boxGroup = g;

    /* --- ふた（ガラス + 木のわく） --- */
    const hinge = group({ pos: [0, 0.0064 + H, -D / 2 + 0.004] });
    this.root.add(hinge);
    this.lidHinge = hinge;

    const lidFrame = G.extrudeOutline(
      rectPts(W, D - 0.006),
      [rectPts(W - 0.016, D - 0.022)],
      0.0044,
      { corner: 0.006, bevel: 0.0007 },
    );
    const frame = mesh(lidFrame, this.mats.wood, { parent: hinge, pos: [0, 0.0022, (D - 0.006) / 2 - 0.004] });
    frame.rotation.x = -Math.PI / 2;

    const pane = mesh(G.roundedPlate(W - 0.018, D - 0.024, 0.0016, 0.004), this.mats.lidGlass, {
      parent: hinge, pos: [0, 0.0022, (D - 0.006) / 2 - 0.004], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    pane.renderOrder = 22;

    // つまみ
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0052, 0.0004],
          [0.0058, 0.0022],
          [0.0044, 0.0044],
          [0, 0.0048],
        ],
        { segments: 20, center: false },
      ),
      this.mats.brassTrim,
      { parent: hinge, pos: [0, 0.0046, D - 0.014], cast: false },
    );

    hinge.traverse((o) => {
      if (o.isMesh && !o.userData.isHitProxy) {
        this.shellMeshes.push(o);
        o.userData.castShadowDefault = o.castShadow;
      }
    });

    hitProxy(hinge, new THREE.BoxGeometry(W, 0.012, D), { pos: [0, 0.003, D / 2 - 0.006] });
    this.handle({
      id: 'lid',
      label: 'ふた',
      type: 'rotate',
      object: hinge,
      axisObject: this.root,
      axis: new THREE.Vector3(1, 0, 0),
      pivot: hinge,
      gain: 0.8,
      hint: { kind: 'pull', offset: [0, 0.030, 0.030], size: 0.014, axis: new THREE.Vector3(0, 1, 0) },
      onRotate: (d) => {
        this.lidTarget = clamp01(this.lidTarget - d * 1.2);
      },
    });
  }

  /* --- ドラムと調速機 -------------------------------------------------- */

  _buildMechanism() {
    const m = group({ name: 'mechanism', pos: [0, 0.0064 + 0.014, 0.004] });
    this.mechanism = m;

    // 地板
    mesh(G.roundedPlate(0.098, 0.030, 0.0022, 0.004, { bevel: 0.0005 }), this.mats.plate, {
      parent: m, pos: [0, -0.0072, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    // 軸受け
    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0046, 0.0170, 0.0110, 2, 0.0014), this.mats.plate, {
        parent: m, pos: [sx * (DRUM_LEN / 2 + 0.0055), 0.0018, 0], cast: false,
      });
    }

    /* --- ピンのついたドラム --- */
    const drum = group({ parent: m });
    this.drumGroup = drum;
    const drumGeo = G.lathe(
      [
        [0, -DRUM_LEN / 2],
        [DRUM_R, -DRUM_LEN / 2],
        [DRUM_R, DRUM_LEN / 2],
        [0, DRUM_LEN / 2],
      ],
      { segments: 48, center: false },
    );
    const drumMesh = mesh(drumGeo, this.mats.drum, { parent: drum, cast: false });
    drumMesh.rotation.z = Math.PI / 2; // 軸を X 方向へ

    // 端の飾りリング
    for (const sx of [-1, 1]) {
      const r = mesh(G.ring(DRUM_R + 0.0012, DRUM_R - 0.0016, 0.0022, 40), this.mats.plate, {
        parent: drum, pos: [sx * (DRUM_LEN / 2 - 0.0012), 0, 0], cast: false,
      });
      r.rotation.z = Math.PI / 2;
    }

    // ピン。曲の譜面がそのまま形になる。
    const pinGeo = G.chamferedCylinder(0.00042, 0.0026, 0.0001, 6);
    const pins = [];
    const addPin = (beat, tine) => {
      if (tine < 0) return;
      const a = (beat / BEATS) * TAU;
      const x = this._tineX(tine);
      const p = new THREE.Mesh(pinGeo, this.mats.pin);
      p.position.set(x, Math.cos(a) * (DRUM_R + 0.0011), Math.sin(a) * (DRUM_R + 0.0011));
      p.rotation.x = -a;
      p.castShadow = false;
      p.receiveShadow = false;
      drum.add(p);
      pins.push(p);
    };
    for (let b = 0; b < BEATS; b++) {
      addPin(b, MELODY[b]);
      if (BASS[b] !== undefined) addPin(b, BASS[b]);
    }
    this.pinMeshes = pins;

    hitCylinder(drum, DRUM_R + 0.004, DRUM_LEN, [0, 0, 0], [0, 0, Math.PI / 2]);
    this.handle({
      id: 'drum',
      label: 'ドラム',
      type: 'grab',
      object: drum,
      hint: { kind: 'hold', offset: [0, 0.020, 0], size: 0.012 },
      onGrab: () => {
        this.drumHeld = true;
      },
      onRelease: () => {
        this.drumHeld = false;
      },
    });

    /* --- 調速機（風切り） --- */
    const govPos = new THREE.Vector3(DRUM_LEN / 2 + 0.016, 0.0035, -0.008);
    const gov = group({ parent: m, pos: govPos.toArray() });
    this.governor = gov;
    mesh(G.chamferedCylinder(0.0011, 0.0180, 0.0002, 10), this.mats.shaft, {
      parent: gov, rot: [Math.PI / 2, 0, 0], cast: false,
    });
    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0130, 0.0072, 0.0006, 2, 0.0003), this.mats.governor, {
        parent: gov, pos: [0, sx * 0.0040, 0], rot: [0, 0, 0], cast: false,
      });
    }
    // 調速機を回す小歯車
    mesh(
      G.gearGeometry({ teeth: 9, module: 0.0009, thickness: 0.0018, bore: 0.0011, hub: 0.0020, hubHeight: 0.0008 }),
      this.mats.gear,
      { parent: gov, pos: [-0.0075, 0, 0], rot: [0, 0, Math.PI / 2], cast: false },
    );

    // ドラム端の大歯車（調速機を駆動）
    mesh(
      G.gearGeometry({ teeth: 40, module: 0.0009, thickness: 0.0020, bore: 0.0028, hub: 0.0050, hubHeight: 0.0012, spokes: 5 }),
      this.mats.gear,
      { parent: drum, pos: [DRUM_LEN / 2 + 0.0038, 0, 0], rot: [0, 0, Math.PI / 2], cast: false },
    );

    this.addGuts(m);
  }

  /** 歯 i の X 座標 */
  _tineX(i) {
    return (i - (TINES - 1) / 2) * TINE_PITCH;
  }

  /* --- くし（歯） ------------------------------------------------------ */

  _buildComb() {
    const TINE_LEN = 0.0168;
    const comb = group({ parent: this.mechanism, pos: [0, -0.0022, DRUM_R + TINE_LEN + 0.0016] });
    this.combGroup = comb;

    // 台座（歯の根もとを押さえる金具）
    mesh(new G.RoundedBoxGeometry(TINES * TINE_PITCH + 0.010, 0.0072, 0.0060, 3, 0.0014), this.mats.combBase, {
      parent: comb, pos: [0, 0, 0.0032], cast: false,
    });
    for (const sx of [-1, 1]) {
      mesh(G.screw({ headR: 0.0022, headH: 0.0010, shaftR: 0.0009, shaftLen: 0.002 }), this.mats.screw, {
        parent: comb, pos: [sx * (TINES * TINE_PITCH / 2 + 0.0016), 0.0038, 0.0032], cast: false,
      });
    }

    this.tineMeshes = [];
    for (let i = 0; i < TINES; i++) {
      const t = i / (TINES - 1);
      // 歯の長さはそろえ、太さと先端のおもりで音の高さを変える（本物と同じ考え方）
      const wid = lerp(0.0030, 0.0018, t);
      const th = lerp(0.0012, 0.0007, t);
      const pivot = group({ parent: comb, pos: [this._tineX(i), 0, 0] });
      mesh(new G.RoundedBoxGeometry(wid, th, TINE_LEN, 2, th * 0.35), this.mats.comb, {
        parent: pivot, pos: [0, 0, -TINE_LEN / 2], cast: false,
      });
      // 低い音ほど大きな おもり を先につける
      const weight = Math.max(0, 1 - i / 7);
      if (weight > 0.02) {
        mesh(
          new G.RoundedBoxGeometry(wid * 1.2, th + weight * 0.0026, 0.0030 + weight * 0.0030, 2, 0.0004),
          this.mats.comb,
          { parent: pivot, pos: [0, -weight * 0.0012, -TINE_LEN + 0.0022 + weight * 0.0014], cast: false },
        );
      }
      this.tineMeshes.push(pivot);

      hitProxy(pivot, new THREE.BoxGeometry(TINE_PITCH * 0.95, 0.0080, TINE_LEN), { pos: [0, 0, -TINE_LEN / 2] });
      this.handle({
        id: `tine${i}`,
        label: 'くしの は',
        type: 'pluck',
        object: pivot,
        onPluck: () => this._pluck(i, 0.85),
      });
    }

    this.addGuts(group());
  }

  /* --- ハンドル -------------------------------------------------------- */

  _buildCrank() {
    const crank = group({ pos: [0.0118 + 0.058, 0.0064 + 0.014, 0.004] });
    this.root.add(crank);
    this.crankGroup = crank;

    const shaft = mesh(G.chamferedCylinder(0.0022, 0.0180, 0.0004, 14), this.mats.shaft, {
      parent: crank, pos: [-0.0090, 0, 0], cast: false,
    });
    shaft.rotation.z = Math.PI / 2;

    const armOutline = [
      new THREE.Vector2(-0.0052, -0.0038),
      new THREE.Vector2(0.0185, -0.0034),
      new THREE.Vector2(0.0185, 0.0034),
      new THREE.Vector2(-0.0052, 0.0038),
    ];
    const arm = mesh(G.extrudeOutline(armOutline, [], 0.0032, { corner: 0.0030, bevel: 0.0005 }), this.mats.crankPaint, {
      parent: crank, pos: [0.0022, 0, 0],
    });
    // アームは YZ 平面（軸が X）
    arm.rotation.y = Math.PI / 2;
    arm.position.set(0.0022, 0, 0);
    arm.rotation.set(0, Math.PI / 2, 0);

    const knob = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0044, 0.0004],
          [0.0052, 0.0028],
          [0.0050, 0.0086],
          [0.0040, 0.0108],
          [0, 0.0112],
        ],
        { segments: 24, center: false },
      ),
      this.mats.knob,
      { parent: crank, pos: [0.0044, 0, -0.0185] },
    );
    knob.rotation.z = -Math.PI / 2;

    hitSphere(crank, 0.0125, [0.0095, 0, -0.0185]);
    hitCylinder(crank, 0.0075, 0.024, [0.0035, 0, -0.0095], [Math.PI / 2, 0, 0]);

    this.handle({
      id: 'crank',
      label: 'ハンドル',
      type: 'rotate',
      object: crank,
      axisObject: this.root,
      axis: new THREE.Vector3(1, 0, 0),
      pivot: crank,
      primary: true,
      hint: { kind: 'spin', axis: new THREE.Vector3(1, 0, 0), offset: [0.030, 0, 0], size: 0.024 },
      onRotate: (d, ctx) => {
        // 逆回しはできない（ラチェット）
        if (d < 0) {
          this.angle -= d * 1.0;
          this.omega = clamp(-ctx.velocity, 0, 26);
          this.driving = true;
          this._driveTimer = 0.14;
        }
      },
      onFling: (v) => {
        this.omega = clamp(-v, 0, 22);
        this.driving = false;
      },
      onTap: () => {
        this.omega = Math.max(this.omega, 6);
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  _pluck(i, strength) {
    this.tineVib[i] = Math.min(1.4, this.tineVib[i] + strength);
    this.tinePhase[i] = 0;
    const freq = semitoneToFreq(SCALE[i], 261.63 * 2);
    const openness = this.lid;
    this.audio.musicNote(freq, {
      gain: (0.10 + strength * 0.20) * (0.35 + openness * 0.65),
      decay: 1.5 + (1 - i / TINES) * 1.6,
      brightness: 0.35 + openness * 0.9,
    });
  }

  step(dt) {
    this._driveTimer = Math.max(0, this._driveTimer - dt);
    if (this._driveTimer === 0) this.driving = false;

    if (this.drumHeld) {
      this.omega = damp(this.omega, 0, 34, dt);
      if (this.omega < 0.05) this.omega = 0;
    } else if (!this.driving) {
      // 調速機（風のていこう）は速度の2乗で効く
      this.omega -= this.omega * this.omega * 0.16 * dt;
      this.omega -= Math.min(this.omega, 0.9 * dt);
      this.angle += this.omega * dt;
    }

    // ドラムが 1 拍ぶん回るごとに、ピンが歯をはじく
    const beatPos = (this.angle / TAU) * BEATS;
    const beat = Math.floor(beatPos);
    if (beat !== this.lastBeat && this.omega > 0.05) {
      // とばした拍も鳴らす（速く回したときに音が抜けないように）
      const from = this.lastBeat < 0 ? beat : this.lastBeat + 1;
      for (let b = from; b <= beat; b++) {
        const idx = ((b % BEATS) + BEATS) % BEATS;
        const strength = clamp(0.45 + this.omega * 0.05, 0.35, 1.0);
        if (MELODY[idx] >= 0) this._pluck(MELODY[idx], strength);
        if (BASS[idx] !== undefined) this._pluck(BASS[idx], strength * 0.7);
      }
      this.lastBeat = beat;
    }

    // 歯の振動を減衰
    for (let i = 0; i < TINES; i++) {
      if (this.tineVib[i] > 0) {
        this.tineVib[i] = Math.max(0, this.tineVib[i] - dt * (1.4 + i * 0.14));
        this.tinePhase[i] += dt * (90 + i * 26);
      }
    }

    this.lid = damp(this.lid, this.lidTarget, 9, dt);
  }

  lateUpdate(dt) {
    this.drumGroup.rotation.x = this.angle;
    this.crankGroup.rotation.x = this.angle;
    this.governor.rotation.x = -this.angle * (40 / 9);

    // 歯は はじかれた瞬間に大きく、そのあと細かく震える
    for (let i = 0; i < TINES; i++) {
      const v = this.tineVib[i];
      this.tineMeshes[i].rotation.x = v > 0 ? Math.sin(this.tinePhase[i]) * v * 0.10 : 0;
    }

    // ふた
    this.lidHinge.rotation.x = -this.lid * 1.15;

    this._updateSound();
  }

  _updateSound() {
    const air = this.audio.voice('mbAir', { source: 'noise', filter: 'bandpass', freq: 900, Q: 2.4 });
    const spin = clamp01(this.omega / 12);
    air.set({ level: spin * 0.05, freq: 700 + this.omega * 220, smooth: 0.08 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'tempo', icon: 'note', label: 'はやさ', value: clamp01(this.omega / 12), color: '#c98a4b' },
      { id: 'lid', icon: 'soundOn', label: 'ふたの あき', value: this.lid, color: '#7cb8a0' },
    ];
  }

  reset() {
    this.angle = 0;
    this.omega = 0;
    this.lastBeat = -1;
    this.lidTarget = 1;
    this.tineVib.fill(0);
  }
}

/* ------------------------------------------------------------------ */

function rectPts(w, h) {
  return [
    new THREE.Vector2(-w / 2, -h / 2),
    new THREE.Vector2(w / 2, -h / 2),
    new THREE.Vector2(w / 2, h / 2),
    new THREE.Vector2(-w / 2, h / 2),
  ];
}
