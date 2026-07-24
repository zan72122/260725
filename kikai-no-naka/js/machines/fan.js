/**
 * fan.js — せんぷうき
 *
 * 目に見えない「かぜ」を、粒とリボンで見えるようにした機械。
 *
 *   ダイヤル → モーター（コイルの中で回転子がまわる）→ はね → かぜ
 *            → ウォームギヤ → クランク → 首ふり
 *
 * さわりどころ:
 *   - ダイヤルをまわすと、はねの速さ・音の高さ・かぜの強さが同時に変わる
 *   - はねを指で押さえると止まる。でもモーターは回ろうとするので熱くなる（コイルが赤くなる）
 *   - ボタンを押すと首ふりのクラッチが入り、ウォームギヤが回りはじめる
 *   - 首を指でつかんで、好きな向きに向けられる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { ParticleField, Streamer } from '../lib/particles.js';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../lib/math.js';

const UNIT_X = new THREE.Vector3(1, 0, 0);

/** はねの回転軸は -Z 向き（=前方）に風を送る */
const HEAD_Y = 0.108;
const BLADE_R = 0.047;

export class Fan extends Machine {
  static meta = {
    id: 'fan',
    name: 'せんぷうき',
    sub: 'かぜが みえる',
    accent: 0x4aa8e8,
    backdrop: {
      top: '#f4fbff',
      middle: '#e4f1fb',
      bottom: '#c9dcec',
      glow: '#dff0ff',
      glowStrength: 0.16,
    },
    bloom: { strength: 0.28, radius: 0.5, threshold: 1.1 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="20" r="14" fill="#d9edfb" stroke="#2f6d8f" stroke-width="2.4"/>
      <path d="M24 20c0-6 1.6-11 5.4-11s4 6.8.4 9.2C27.2 19.6 24 20 24 20Zm0 0c6 0 11 1.6 11 5.4s-6.8 4-9.2.4C24.4 23.2 24 20 24 20Zm0 0c0 6-1.6 11-5.4 11s-4-6.8-.4-9.2C20.8 20.4 24 20 24 20Zm0 0c-6 0-11-1.6-11-5.4s6.8-4 9.2-.4C23.6 16.8 24 20 24 20Z" fill="#5bb4e8"/>
      <circle cx="24" cy="20" r="2.6" fill="#2f6d8f"/>
      <path d="M20 34h8v5h-8z" fill="#9fd2ef" stroke="#2f6d8f" stroke-width="2"/>
      <rect x="13" y="38" width="22" height="5.5" rx="2.7" fill="#7ec4e8" stroke="#2f6d8f" stroke-width="2"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.dial = 0;        // ダイヤルの位置 0..1
    this.rpm = 0;         // はねの角速度（rad/s）
    this.bladeAngle = 0;
    this.heat = 0;        // モーターの熱 0..1
    this.oscOn = false;   // 首ふり
    this.oscPhase = 0;
    this.yaw = 0;         // 首の向き（rad）
    this.manualYaw = 0;   // 手で向けたぶん
    this.bladeHeld = false;
    this.wormHeld = false;
    this._btnPress = 0;

    this.radius = 0.098;
    this.center = new THREE.Vector3(0, 0.098, 0);
    this.footprint = { w: 0.11, d: 0.085, opacity: 0.34 };

    this._tmp = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._pinWorld = new THREE.Vector3();
    this._linkDir = new THREE.Vector3();
    this._windDir = new THREE.Vector3(0, 0, 1);
    this._emitAcc = 0;
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.08, -0.30, -1.0),
      center: this.center,
      span: 0.125,
      noiseScale: 12,
    });

    this.mats = {
      shellBody: M.shell('paint', { color: 0xe8f3fb, roughness: 0.30 }),
      shellAccent: M.shell('paint', { color: 0x4aa8e8, roughness: 0.30 }),
      cage: M.shell('steel', { color: 0xe4ebf1, roughness: 0.22 }),
      column: M.shell('paint', { color: 0xdbe7f0, roughness: 0.26 }),

      motorCan: M.part('coated', { color: 0x8e9aa8, roughness: 0.42 }),
      lamination: M.part('coated', { color: 0xa8b4c0, roughness: 0.5 }),
      copper: M.part('copper'),
      copperHot: M.part('copper', { emissive: 0xff3c14, emissiveIntensity: 0 }),
      shaft: M.part('steel', { color: 0xdde3e9, roughness: 0.18 }),
      brass: M.part('brass'),
      blade: M.part('plastic', { color: 0x9fd8f5, roughness: 0.24 }),
      hub: M.part('plastic', { color: 0x2f6d8f, roughness: 0.3 }),
      dialKnob: M.part('knurled', { color: 0xf6c344, metalness: 0.1, repeat: 3 }),
      button: M.part('softPlastic', { color: 0xf2634f }),
      rubber: M.plain('rubber'),
      cord: M.part('cable', { color: 0x3b4048 }),
      ribbon: M.plain('fabric', { color: 0xf2634f }),
      ribbon2: M.plain('fabric', { color: 0xffd45e }),
      brushBlock: M.part('plastic', { color: 0x39424d, roughness: 0.4 }),
    };

    this._buildBase();
    this._buildColumn();
    this._buildHead();
    this._buildMotor();
    this._buildOscillator();
    this._buildBlades();
    this._buildCage();
    this._buildWind();

    this.setXray(0);
  }

  /* --- 台と操作部 ---------------------------------------------------- */

  _buildBase() {
    const g = group({ name: 'base' });

    const baseGeo = G.lathe(
      [
        [0, 0.0026],
        [0.036, 0.0026],
        [0.0405, 0.0060],
        [0.0420, 0.0130],
        [0.0390, 0.0182],
        [0.0300, 0.0206],
        [0, 0.0212],
      ],
      { segments: 56, center: false },
    );
    const base = mesh(baseGeo, this.mats.shellBody, { parent: g });
    base.scale.set(1, 1, 0.86);

    const ringGeo = G.ring(0.0424, 0.0330, 0.0042, 56);
    const ring = mesh(ringGeo, this.mats.shellAccent, { parent: g, pos: [0, 0.0104, 0], cast: false });
    ring.scale.set(1, 1, 0.86);

    // ゴム脚
    const footGeo = G.lathe(
      [
        [0, 0],
        [0.0062, 0],
        [0.0066, 0.0016],
        [0.0050, 0.0030],
        [0, 0.0032],
      ],
      { segments: 18, center: false },
    );
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      mesh(footGeo, this.mats.rubber, {
        parent: g,
        pos: [Math.cos(a) * 0.030, 0.0002, Math.sin(a) * 0.026],
        rot: [Math.PI, 0, 0],
        cast: false,
      });
    }

    // 電源コード
    const cord = G.tubeFromPoints(
      [
        [-0.030, 0.008, -0.014],
        [-0.048, 0.0032, -0.026],
        [-0.068, 0.0030, -0.018],
        [-0.080, 0.0030, 0.000],
      ],
      0.0018,
      { radialSegments: 8 },
    );
    mesh(cord, this.mats.cord, { parent: g, cast: false });
    mesh(new G.RoundedBoxGeometry(0.014, 0.0075, 0.010, 3, 0.002), this.mats.cord, {
      parent: g, pos: [-0.084, 0.0040, 0.006], rot: [0, -1.1, 0], cast: false,
    });

    this.addShell(g);
    this.baseGroup = g;

    /* --- はやさダイヤル --- */
    const dialGroup = group({ parent: g, pos: [0.0215, 0.0206, 0.0128] });
    const dialSeat = mesh(G.ring(0.0130, 0.0074, 0.0022, 32), this.mats.shellAccent, {
      parent: dialGroup, cast: false,
    });
    dialSeat.receiveShadow = false;

    const knobSpin = group({ parent: dialGroup, pos: [0, 0.0016, 0] });
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0092, 0],
          [0.0100, 0.0022],
          [0.0100, 0.0070],
          [0.0086, 0.0088],
          [0, 0.0092],
        ],
        { segments: 30, center: false },
      ),
      this.mats.dialKnob,
      { parent: knobSpin },
    );
    // 位置を示す指標
    mesh(new G.RoundedBoxGeometry(0.0026, 0.0016, 0.0092, 2, 0.0008), this.mats.button, {
      parent: knobSpin, pos: [0, 0.0090, -0.0042], cast: false,
    });
    this.dialKnob = knobSpin;

    hitCylinder(dialGroup, 0.017, 0.020, [0, 0.004, 0]);
    this.handle({
      id: 'dial',
      label: 'はやさ',
      type: 'rotate',
      object: dialGroup,
      axisObject: dialGroup,
      axis: new THREE.Vector3(0, 1, 0),
      pivot: dialGroup,
      primary: true,
      gain: 0.55,
      hint: { kind: 'spin', axis: new THREE.Vector3(0, 1, 0), offset: [0, 0.020, 0], size: 0.016 },
      onRotate: (d) => {
        this.dial = clamp01(this.dial + d * 0.32);
      },
      onTap: () => {
        // タップだけでも段が進む（4歳児は「まわす」より「たたく」が先に出る）
        this.dial = this.dial >= 0.95 ? 0 : clamp01(Math.floor(this.dial * 3 + 1.001) / 3);
        this.audio.click({ gain: 0.4, bright: 2400 });
      },
    });

    /* --- 首ふりボタン --- */
    const btn = group({ parent: g, pos: [-0.0215, 0.0206, 0.0128] });
    const btnSeat = mesh(G.ring(0.0122, 0.0068, 0.0022, 28), this.mats.shellAccent, {
      parent: btn, cast: false,
    });
    btnSeat.receiveShadow = false;
    const cap = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0072, 0.0004],
          [0.0080, 0.0022],
          [0.0080, 0.0050],
          [0.0066, 0.0066],
          [0, 0.0070],
        ],
        { segments: 26, center: false },
      ),
      this.mats.button,
      { parent: btn, pos: [0, 0.0014, 0] },
    );
    this.oscButtonCap = cap;

    hitCylinder(btn, 0.016, 0.020, [0, 0.005, 0]);
    this.handle({
      id: 'osc',
      label: 'くびふり',
      type: 'press',
      object: btn,
      hint: { kind: 'push', offset: [0, 0.024, 0], size: 0.012, axis: new THREE.Vector3(0, 1, 0) },
      onPress: () => {
        this.oscOn = !this.oscOn;
        this._btnPress = 1;
        this.audio.click({ gain: 0.48, bright: this.oscOn ? 3000 : 1900 });
      },
    });
  }

  _buildColumn() {
    const g = group({ name: 'column' });
    mesh(
      G.lathe(
        [
          [0.0140, 0.0180],
          [0.0140, 0.0240],
          [0.0106, 0.0300],
          [0.0100, 0.0820],
          [0.0122, 0.0900],
          [0.0122, 0.0960],
        ],
        { segments: 36, center: false },
      ),
      this.mats.column,
      { parent: g },
    );
    // 高さ調節のリング
    mesh(G.ring(0.0132, 0.0098, 0.0060, 36), this.mats.shellAccent, {
      parent: g, pos: [0, 0.058, 0], cast: false,
    });
    this.addShell(g);
  }

  /* --- 首（ヨー） ----------------------------------------------------- */

  _buildHead() {
    const yawGroup = group({ pos: [0, HEAD_Y, 0] });
    this.yawGroup = yawGroup;
    this.root.add(yawGroup);

    // モーターの缶（外装）
    const canShell = group({ name: 'canShell' });
    mesh(
      G.lathe(
        [
          [0, -0.0250],
          [0.0210, -0.0250],
          [0.0248, -0.0212],
          [0.0262, -0.0060],
          [0.0262, 0.0140],
          [0.0236, 0.0206],
          [0.0150, 0.0232],
          [0, 0.0238],
        ],
        { segments: 44, center: false },
      ),
      this.mats.shellBody,
      { parent: canShell },
    );
    canShell.rotation.x = -Math.PI / 2; // ローカル +Y → ワールド -Z（前方）
    yawGroup.add(canShell);
    this._registerShell(canShell);

    // 後ろのふくらみ（放熱のリブ）
    const ribs = group({ parent: canShell, pos: [0, -0.020, 0] });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      mesh(new G.RoundedBoxGeometry(0.0032, 0.0100, 0.0068, 2, 0.0012), this.mats.shellAccent, {
        parent: ribs,
        pos: [Math.cos(a) * 0.0216, 0.0, Math.sin(a) * 0.0216],
        rot: [0, -a, 0],
        cast: false,
      });
    }

    // 首を手で向けられるようにする
    hitProxy(yawGroup, new THREE.SphereGeometry(0.030, 12, 10), { pos: [0, 0, -0.010] });
    this.handle({
      id: 'head',
      label: 'くび',
      type: 'rotate',
      object: yawGroup,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 1, 0),
      pivot: new THREE.Vector3(0, HEAD_Y, 0),
      gain: 0.7,
      onRotate: (d) => {
        this.manualYaw = clamp(this.manualYaw + d, -1.1, 1.1);
      },
    });
  }

  /** shell グループに登録しつつ、任意の親に付けたままにする */
  _registerShell(object) {
    object.traverse((o) => {
      if (o.isMesh && !o.userData.isHitProxy) {
        this.shellMeshes.push(o);
        o.userData.castShadowDefault = o.castShadow;
      }
    });
  }

  /* --- モーター ------------------------------------------------------- */

  _buildMotor() {
    const m = group({ name: 'motor' });
    m.rotation.x = -Math.PI / 2; // ローカル +Y が前（-Z）
    this.yawGroup.add(m);
    this.motorGroup = m;

    // 固定子（積層鉄心）。外周のわくと 4 本の突極でできていて、
    // 突極のあいだから巻線がちゃんと見える。
    const yoke = G.pipe(0.0208, 0.0176, 0.0260, { segments: 40, chamfer: 0.0006 });
    mesh(yoke, this.mats.lamination, { parent: m, pos: [0, -0.004, 0], cast: false });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const pole = new G.RoundedBoxGeometry(0.0070, 0.0250, 0.0090, 2, 0.0010);
      const pm = mesh(pole, this.mats.lamination, {
        parent: m,
        pos: [Math.cos(a) * 0.0132, -0.004, Math.sin(a) * 0.0132],
        rot: [0, -a, 0],
        cast: false,
      });
      pm.receiveShadow = false;
    }

    // 巻線（4 極）。熱くなると赤く光る。
    const coilGeo = G.bobbinCoil({ radius: 0.0056, wire: 0.00058, turns: 9, length: 0.0130, layers: 2 });
    this.coilMats = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const mat = this.M.part('copper', { emissive: 0xff3410, emissiveIntensity: 0 });
      this.coilMats.push(mat);
      const c = mesh(coilGeo, mat, {
        parent: m,
        pos: [Math.cos(a) * 0.0132, -0.004, Math.sin(a) * 0.0132],
        cast: false,
      });
      c.rotation.set(Math.PI / 2, 0, -a);
    }

    // 回転子とシャフト
    const rotor = group({ parent: m, pos: [0, -0.004, 0] });
    this.rotorGroup = rotor;
    mesh(G.chamferedCylinder(0.0082, 0.0230, 0.0010, 28), this.mats.lamination, {
      parent: rotor, cast: false,
    });
    // 回転子のスロット（回っているのが分かるように）
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      mesh(new G.RoundedBoxGeometry(0.0022, 0.0234, 0.0034, 2, 0.0008), this.mats.motorCan, {
        parent: rotor,
        pos: [Math.cos(a) * 0.0064, 0, Math.sin(a) * 0.0064],
        rot: [0, -a, 0],
        cast: false,
      });
    }
    // 整流子とブラシ
    mesh(G.chamferedCylinder(0.0056, 0.0060, 0.0006, 24), this.mats.brass, {
      parent: rotor, pos: [0, -0.0165, 0], cast: false,
    });
    const shaft = mesh(G.chamferedCylinder(0.0026, 0.070, 0.0005, 20), this.mats.shaft, {
      parent: rotor, pos: [0, 0.006, 0], cast: false,
    });
    void shaft;

    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0044, 0.0070, 0.0052, 2, 0.0010), this.mats.brushBlock, {
        parent: m, pos: [sx * 0.0088, -0.0205, 0], cast: false,
      });
      mesh(new G.RoundedBoxGeometry(0.0032, 0.0022, 0.0032, 2, 0.0006), this.mats.brass, {
        parent: m, pos: [sx * 0.0060, -0.0205, 0], cast: false,
      });
    }

    // 軸受け
    for (const y of [-0.0230, 0.0165]) {
      mesh(G.ring(0.0072, 0.0028, 0.0034, 24), this.mats.motorCan, { parent: m, pos: [0, y, 0], cast: false });
    }

  }

  /* --- 首ふり機構 ----------------------------------------------------- */

  _buildOscillator() {
    const o = group({ name: 'oscillator' });
    this.yawGroup.add(o);

    // ウォーム（モーター軸に付く）
    const worm = group({ parent: this.rotorGroup, pos: [0, -0.0250, 0] });
    this.wormGroup = worm;
    const wormGeo = G.coilSpring({ radius: 0.0044, wire: 0.0016, turns: 7, length: 0.0130, radialSegments: 7 });
    const w = mesh(wormGeo, this.mats.brass, { parent: worm, cast: false });
    w.rotation.x = 0;
    mesh(G.chamferedCylinder(0.0030, 0.0140, 0.0004, 16), this.mats.shaft, { parent: worm, cast: false });

    // ウォームホイール（垂直軸）。首と一緒に動く。
    const wheel = group({ parent: o, pos: [0, -0.0225, -0.0034] });
    this.wormWheel = wheel;
    mesh(
      G.gearGeometry({ teeth: 30, module: 0.0011, thickness: 0.0030, bore: 0.0022, hub: 0.0044, hubHeight: 0.0014, spokes: 4 }),
      this.mats.brass,
      { parent: wheel, cast: false },
    );

    // クランクピン
    const pin = group({ parent: wheel, pos: [0.0092, 0.0026, 0] });
    this.crankPin = pin;
    mesh(G.chamferedCylinder(0.0018, 0.0064, 0.0004, 14), this.mats.shaft, { parent: pin, cast: false });

    // リンク棒。ピンと支柱の固定点のあいだを、毎フレーム張り直す。
    const rodGeo = G.chamferedCylinder(0.0016, 1.0, 0.0002, 12);
    rodGeo.rotateZ(Math.PI / 2); // ローカル +X 方向に長さ 1
    const rod = mesh(rodGeo, this.mats.shaft, { parent: this.root, cast: false });
    this.linkRod = rod;
    this.linkAnchor = new THREE.Vector3(0.008, HEAD_Y - 0.030, 0.010);

    hitCylinder(wheel, 0.020, 0.012, [0, 0, 0]);
    this.handle({
      id: 'worm',
      label: 'くびふりの はぐるま',
      type: 'grab',
      object: wheel,
      onGrab: () => {
        this.wormHeld = true;
      },
      onRelease: () => {
        this.wormHeld = false;
      },
    });

  }

  /* --- はね ----------------------------------------------------------- */

  _buildBlades() {
    const spin = group({ pos: [0, 0, -0.0345] });
    this.yawGroup.add(spin);
    this.bladeSpin = spin;

    const bladeGeo = G.fanBlade({
      innerR: 0.0072,
      outerR: BLADE_R,
      chordIn: 0.013,
      chordOut: 0.0295,
      twistIn: 0.80,
      twistOut: 0.26,
      thickness: 0.0013,
      sweep: 0.5,
    });
    // fanBlade は XZ 平面に生えるので、回転面が XY になるよう寝かせておく
    bladeGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const b = mesh(bladeGeo, this.mats.blade, { parent: spin });
      b.rotation.z = (i / 4) * TAU;
    }

    // ハブとナット
    mesh(
      G.lathe(
        [
          [0, -0.0040],
          [0.0086, -0.0040],
          [0.0092, -0.0020],
          [0.0092, 0.0046],
          [0.0072, 0.0068],
          [0, 0.0072],
        ],
        { segments: 28, center: false },
      ),
      this.mats.hub,
      { parent: spin, rot: [-Math.PI / 2, 0, 0] },
    );
    mesh(G.hexNut({ across: 0.0092, height: 0.0034, bore: 0.0026 }), this.mats.brass, {
      parent: spin, pos: [0, 0, -0.0084], rot: [Math.PI / 2, 0, 0], cast: false,
    });

    hitProxy(spin, new THREE.CylinderGeometry(BLADE_R * 0.95, BLADE_R * 0.95, 0.014, 16), {
      rot: [Math.PI / 2, 0, 0],
    });
    this.handle({
      id: 'blades',
      label: 'はね',
      type: 'grab',
      object: spin,
      hint: { kind: 'hold', offset: [0, 0, -0.028], size: 0.014 },
      onGrab: () => {
        this.bladeHeld = true;
        if (this.rpm > 4) this.audio.click({ gain: 0.4, bright: 700 });
      },
      onRelease: () => {
        this.bladeHeld = false;
      },
    });

  }

  /* --- かご ----------------------------------------------------------- */

  _buildCage() {
    const cage = group();
    this.yawGroup.add(cage);
    this._cageGroup = cage;

    const R = BLADE_R + 0.006;

    // 前面のかご: 同心円 + 放射状の骨
    const front = group({ parent: cage, pos: [0, 0, -0.052] });
    for (const [r, z] of [[R * 0.30, -0.008], [R * 0.55, -0.006], [R * 0.80, -0.003], [R, 0]]) {
      const ring = new THREE.TorusGeometry(r, 0.0011, 6, 40);
      mesh(ring, this.mats.cage, { parent: front, pos: [0, 0, z], cast: false });
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const r = t * R;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -0.009 * (1 - t * t)));
      }
      mesh(G.tubeFromPoints(pts, 0.00085, { radialSegments: 5 }), this.mats.cage, {
        parent: front, cast: false,
      });
    }
    // 中央のキャップ
    mesh(
      G.lathe(
        [
          [0, -0.0100],
          [0.0090, -0.0092],
          [0.0106, -0.0060],
          [0.0106, -0.0020],
          [0, -0.0018],
        ],
        { segments: 26, center: false },
      ),
      this.mats.shellAccent,
      { parent: front, rot: [-Math.PI / 2, 0, 0], cast: false },
    );

    // 後面のかご
    const back = group({ parent: cage, pos: [0, 0, -0.020] });
    for (const [r, z] of [[R * 0.45, 0.006], [R * 0.75, 0.003], [R, 0]]) {
      mesh(new THREE.TorusGeometry(r, 0.0011, 6, 40), this.mats.cage, { parent: back, pos: [0, 0, z], cast: false });
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.1;
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const r = 0.010 + t * (R - 0.010);
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.008 * (1 - t * t)));
      }
      mesh(G.tubeFromPoints(pts, 0.00085, { radialSegments: 5 }), this.mats.cage, { parent: back, cast: false });
    }

    // ふちのリング（前後のかごを留める）
    mesh(G.ring(R + 0.0026, R - 0.0004, 0.0044, 56), this.mats.shellAccent, {
      parent: cage, pos: [0, 0, -0.036], rot: [Math.PI / 2, 0, 0], cast: false,
    });

    this._registerShell(cage);
  }

  /* --- かぜ ----------------------------------------------------------- */

  _buildWind() {
    const scale = this.ctx.tier === 'low' ? 0.4 : this.ctx.tier === 'mid' ? 0.7 : 1;
    this.wind = new ParticleField({
      count: Math.round(620 * scale),
      color: 0xd8f0ff,
      color2: 0xffffff,
      opacity: 0.42,
      stretch: 0.11,
      width: 0.0042,
      minLength: 0.006,
      softness: 1.5,
      bounds: 0.9,
      seed: 4242,
    });
    this.wind.object.position.set(0, 0, 0);
    this.root.add(this.wind.object);

    // 前のかごに結んだリボン。風の形がそのまま見える。
    // リボンはルート空間で計算する（風の場と座標系を合わせるため）。
    // 結び目だけを首の動きに合わせて動かす。
    this.streamers = [];
    this.ribbonMeshes = [];
    this.ribbonAnchors = [
      new THREE.Vector3(-0.030, 0.030, -0.052),
      new THREE.Vector3(0.032, 0.026, -0.052),
    ];
    const mats = [this.mats.ribbon, this.mats.ribbon2];
    for (let i = 0; i < this.ribbonAnchors.length; i++) {
      const world = this.ribbonAnchors[i].clone();
      world.y += HEAD_Y;
      const st = new Streamer(world, 9, 0.0060);
      const geo = G.makeRibbon({ segments: 8, width: 0.0092 });
      const m = new THREE.Mesh(geo, mats[i]);
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      this.root.add(m);
      this.streamers.push(st);
      this.ribbonMeshes.push(m);
    }
    // 結び目（かごに結んだところ）
    for (let i = 0; i < this.ribbonAnchors.length; i++) {
      mesh(new THREE.TorusGeometry(0.0030, 0.0011, 6, 14), mats[i], {
        parent: this.yawGroup,
        pos: this.ribbonAnchors[i].toArray(),
        rot: [0, Math.PI / 2, 0],
        cast: false,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  step(dt) {
    // ダイヤル → 目標回転数
    const targetRpm = this.dial * 46;

    if (this.bladeHeld) {
      this.rpm = damp(this.rpm, 0, 26, dt);
      // 止められたモーターは電流が流れっぱなしになり、熱くなる
      this.heat = clamp01(this.heat + this.dial * 0.55 * dt);
    } else {
      const k = targetRpm > this.rpm ? 2.2 : 1.5;
      this.rpm = damp(this.rpm, targetRpm, k, dt);
      this.heat = clamp01(this.heat - 0.22 * dt + this.dial * 0.018 * dt);
    }
    this.bladeAngle += this.rpm * dt;

    // 首ふり: ウォームで大きく減速されるので、はねよりずっとゆっくり
    if (this.oscOn && !this.wormHeld) {
      this.oscPhase += (this.rpm / 46) * 0.62 * dt;
    }
    const oscYaw = this.oscOn ? Math.sin(this.oscPhase * TAU) * 0.52 : 0;
    this.yaw = damp(this.yaw, oscYaw + this.manualYaw, 12, dt);
  }

  lateUpdate(dt) {
    this.bladeSpin.rotation.z = this.bladeAngle;
    this.rotorGroup.rotation.y = -this.bladeAngle * 1.0;
    this.yawGroup.rotation.y = this.yaw;

    // ウォームホイールとクランクピン、そこから伸びるリンク棒
    const wheelAngle = this.oscPhase * TAU;
    this.wormWheel.rotation.y = wheelAngle;
    this.crankPin.getWorldPosition(this._pinWorld);
    this.root.worldToLocal(this._pinWorld);
    const a = this.linkAnchor;
    const dx = a.x - this._pinWorld.x;
    const dy = a.y - this._pinWorld.y;
    const dz = a.z - this._pinWorld.z;
    const len = Math.hypot(dx, dy, dz) || 1e-4;
    this.linkRod.position.set(
      (a.x + this._pinWorld.x) / 2,
      (a.y + this._pinWorld.y) / 2,
      (a.z + this._pinWorld.z) / 2,
    );
    this.linkRod.scale.set(len, 1, 1);
    this.linkRod.quaternion.setFromUnitVectors(
      UNIT_X,
      this._linkDir.set(dx / len, dy / len, dz / len),
    );

    // 熱でコイルが赤くなる
    for (const m of this.coilMats) m.emissiveIntensity = this.heat * this.heat * 2.6;

    this.oscButtonCap.position.y = 0.0014 - (this._btnPress = damp(this._btnPress, 0, 9, dt)) * 0.0022;

    this._updateWind(dt);
    this._updateSound();
  }

  _updateWind(dt) {
    const strength = clamp01(this.rpm / 46);
    // 首の向きに合わせた風向き
    this._windDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const origin = this._origin.set(0, HEAD_Y, 0).addScaledVector(this._windDir, 0.050);

    this.wind.setOpacity(0.10 + strength * 0.34);

    // 粒を出す
    this._emitAcc += strength * strength * 220 * dt;
    while (this._emitAcc >= 1) {
      this._emitAcc -= 1;
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * BLADE_R * 0.95;
      const px = origin.x + Math.cos(a) * r * Math.cos(this.yaw);
      const py = origin.y + Math.sin(a) * r;
      const pz = origin.z - Math.cos(a) * r * Math.sin(this.yaw);
      const speed = 0.28 + strength * 1.15 + Math.random() * 0.12;
      // 羽根の回転にひきずられて、少しうずを巻く
      const swirl = 0.55 * strength;
      const vx = this._windDir.x * speed - Math.sin(a) * swirl * (r / BLADE_R);
      const vy = Math.cos(a) * swirl * (r / BLADE_R) * 0.7;
      const vz = this._windDir.z * speed - Math.sin(a) * swirl * (r / BLADE_R) * 0.2;
      this.wind.emit([px, py, pz], [vx, vy, vz], 0.55 + Math.random() * 0.5, 0.55 + Math.random() * 0.8);
    }

    this.wind.update(dt, (i, px, py, pz, vx, vy, vz, out) => {
      // 少しずつ広がり、失速し、下に落ちる
      out[0] = vx * 0.985 + (px - origin.x) * 0.35 * dt;
      out[1] = vy * 0.985 - 0.18 * dt;
      out[2] = vz * 0.985 + (pz - origin.z) * 0.35 * dt;
    });

    // リボン
    const windAt = (pos, out) => {
      const d = this._tmp.copy(pos).sub(origin);
      const along = -d.dot(this._windDir);
      const radial = Math.hypot(d.x + this._windDir.x * along, d.y, d.z + this._windDir.z * along);
      const falloff = smoothstep(BLADE_R * 1.5, 0, radial) * smoothstep(0.34, -0.02, Math.abs(along));
      const s = strength * falloff * 46;
      out.set(this._windDir.x * s, this._windDir.y * s + 0.22 * s, this._windDir.z * s);
    };
    for (let i = 0; i < this.streamers.length; i++) {
      const st = this.streamers[i];
      // 結び目は首と一緒に動く
      st.anchor.copy(this.ribbonAnchors[i]).applyQuaternion(this.yawGroup.quaternion);
      st.anchor.y += HEAD_Y;
      st.update(dt, windAt);
      this.ribbonMeshes[i].geometry.userData.update(st.points);
    }
  }

  _updateSound() {
    const s = clamp01(this.rpm / 46);
    const hum = this.audio.voice('fanHum', { source: 'tone', type: 'sawtooth', freq: 60, detune: 9 });
    const air = this.audio.voice('fanAir', { source: 'noise', filter: 'bandpass', freq: 500, Q: 1.4 });

    const stall = this.bladeHeld && this.dial > 0.05 ? 1 : 0;
    hum.set({
      level: (this.dial > 0.02 ? 0.05 + s * 0.05 + stall * 0.06 : 0),
      freq: 46 + s * 74 - stall * 12,
      smooth: 0.12,
    });
    air.set({
      level: s * s * 0.14,
      freq: 380 + s * 900,
      Q: 0.9 + s * 1.6,
      smooth: 0.1,
    });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'speed', icon: 'fan', label: 'はやさ', value: clamp01(this.rpm / 46), color: '#3fa9e8' },
      { id: 'heat', icon: 'heat', label: 'モーターの ねつ', value: this.heat, color: '#f2634f' },
    ];
  }

  reset() {
    this.dial = 0;
    this.rpm = 0;
    this.heat = 0;
    this.oscOn = false;
    this.oscPhase = 0;
    this.manualYaw = 0;
    this.yaw = 0;
    this.wind?.killAll();
    for (const s of this.streamers || []) s.reset();
  }

  dispose() {
    this.wind?.dispose();
    super.dispose();
  }
}
