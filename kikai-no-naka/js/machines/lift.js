/**
 * lift.js — エレベーター
 *
 * 「おもい ものが かるくなる」しくみ（つりあいおもり）と、
 * 「もどらないようにする」しくみ（ラチェット）を見せる機械。
 *
 *   ハンドル → ウォーム → ウォームホイール → まきとりドラム
 *            → ロープ が 片がわは 巻かれ、もう片がわは ほどける
 *            → かごが 上がると、つりあいおもりが 下がる
 *   ラチェットの つめ が 戻り止めになっていて、手をはなしても落ちない。
 *
 * さわりどころ:
 *   - ハンドルをまわすと、かごが 上がる／下がる（カチカチ 音がする）
 *   - つめ を おすと 戻り止めが はずれて、かごが ゆっくり おりてくる
 *   - つりあいおもりを 指で つかむと、かごが とたんに 重くなって 動かない
 *   - かごを 直接 指で 押し上げることもできる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh, stretchBetween } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, TAU } from '../lib/math.js';

const BASE_Y = 0.0100;
const TOP_Y = 0.1520;
const DRUM_Y = 0.1385;
const DRUM_R = 0.0108;
const CAGE_X = -0.0145;
const CW_X = 0.0160;
/** かごが動ける高さ */
const CAGE_LOW = 0.0170;
const CAGE_HIGH = 0.1010;
/** 満行程に必要なドラムの回転数 */
const TURNS = 3.4;

export class Lift extends Machine {
  static meta = {
    id: 'lift',
    name: 'エレベーター',
    sub: 'かるく もちあげる',
    accent: 0xd9883f,
    backdrop: {
      top: '#fdf5e8',
      middle: '#f4e5cd',
      bottom: '#dcc6a4',
      glow: '#ffe2b4',
      glowStrength: 0.13,
    },
    bloom: { strength: 0.26, radius: 0.5, threshold: 1.1 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M10 6v36M38 6v36" stroke="#a8702f" stroke-width="3" stroke-linecap="round"/>
      <path d="M8 6h32" stroke="#a8702f" stroke-width="3" stroke-linecap="round"/>
      <path d="M18 8v10M32 8v6" stroke="#7d5a2a" stroke-width="2" stroke-linecap="round"/>
      <rect x="11" y="18" width="14" height="14" rx="3" fill="#f0c060" stroke="#7d5a2a" stroke-width="2.2"/>
      <rect x="28" y="14" width="8" height="10" rx="2" fill="#8b939c" stroke="#4a525c" stroke-width="2.2"/>
      <circle cx="18" cy="8" r="3" fill="#e0685a" stroke="#8d3328" stroke-width="2"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.cage = 0.12;      // かごの高さ 0..1
    this.vel = 0;
    this.pawlHeld = false;
    this.cwHeld = false;
    this.driving = false;
    this._driveTimer = 0;
    this._clickAt = 0;
    this._pawlKick = 0;

    this.radius = 0.098;
    this.center = new THREE.Vector3(0.002, 0.080, 0);
    this.footprint = { w: 0.11, d: 0.09, opacity: 0.32 };

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.10, -0.35, -1.0),
      center: this.center,
      span: 0.115,
      noiseScale: 12,
    });

    this.mats = {
      frame: M.shell('paint', { color: 0xe8b463, roughness: 0.30 }),
      frameDeep: M.shell('paint', { color: 0xa8702f, roughness: 0.34 }),
      base: M.shell('wood', { seed: 45, light: '#c8a273', dark: '#8d6539' }),

      drum: M.part('brass', { color: 0xd9a94e }),
      gear: M.part('brass', { color: 0xefc978 }),
      shaft: M.part('steel', { color: 0xd8dee5, roughness: 0.18 }),
      pawl: M.part('steel', { color: 0xc7d0d8, roughness: 0.22 }),
      rope: M.part('cable', { color: 0xe6d6b0 }),
      cage: M.part('paint', { color: 0xf0c060, clearcoat: 0.85, roughness: 0.26 }),
      cageFrame: M.part('coated', { color: 0x8d5a2a, roughness: 0.42 }),
      weight: M.part('coated', { color: 0x8b939c, roughness: 0.40 }),
      crank: M.part('paint', { color: 0xe0685a, clearcoat: 0.9, roughness: 0.22 }),
      knob: M.part('softPlastic', { color: 0xffd45e }),
      doll: M.part('plastic', { color: 0xf4d9b5, roughness: 0.5 }),
      dollCoat: M.part('plastic', { color: 0x4f9fd6, roughness: 0.45 }),
      dollHat: M.part('plastic', { color: 0xe0553f, roughness: 0.45 }),
      rubber: M.plain('rubber'),
    };

    this._buildTower();
    this._buildDrum();
    this._buildRatchet();
    this._buildCage();
    this._buildCounterweight();
    this._buildCrank();
    this._buildRopes();

    this.setXray(0);
  }

  /* --- やぐら ----------------------------------------------------------- */

  _buildTower() {
    const g = group({ name: 'tower' });

    mesh(new G.RoundedBoxGeometry(0.100, BASE_Y, 0.076, 4, 0.0040), this.mats.base, {
      parent: g, pos: [0, BASE_Y / 2, 0],
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(
          G.lathe([[0, 0], [0.0056, 0], [0.0060, 0.0016], [0.0044, 0.0030], [0, 0.0032]], { segments: 16, center: false }),
          this.mats.rubber,
          { parent: g, pos: [sx * 0.042, 0.0002, sz * 0.030], rot: [Math.PI, 0, 0], cast: false },
        );
      }
    }

    // 4本の柱
    const postGeo = new G.RoundedBoxGeometry(0.0062, TOP_Y - BASE_Y, 0.0062, 2, 0.0018);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(postGeo, this.mats.frame, {
          parent: g, pos: [sx * 0.0300, (TOP_Y + BASE_Y) / 2, sz * 0.0250],
        });
      }
    }
    // すじかい（見た目の骨組み）
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = BASE_Y + 0.020 + i * 0.040;
        mesh(new G.RoundedBoxGeometry(0.0640, 0.0044, 0.0044, 2, 0.0014), this.mats.frameDeep, {
          parent: g, pos: [0, y, sz * 0.0250], cast: false,
        });
        if (sz > 0 && i === 1) continue; // 正面の 真ん中は あけておく（中が見えるように）
        const diag = mesh(new G.RoundedBoxGeometry(0.0680, 0.0030, 0.0030, 2, 0.0010), this.mats.frameDeep, {
          parent: g, pos: [0, y + 0.020, sz * 0.0250], cast: false,
        });
        diag.rotation.z = 0.53;
      }
    }
    // 天板
    mesh(new G.RoundedBoxGeometry(0.0720, 0.0058, 0.0600, 3, 0.0020), this.mats.frame, {
      parent: g, pos: [0, TOP_Y, 0],
    });

    this.addShell(g);
  }

  /* --- まきとりドラム --------------------------------------------------- */

  _buildDrum() {
    const g = group({ name: 'drum', pos: [0, DRUM_Y, 0] });
    this.drumGroup = g;
    this.root.add(g);

    // 胴
    const body = mesh(G.chamferedCylinder(DRUM_R, 0.0480, 0.0008, 30), this.mats.drum, { parent: g, cast: false });
    body.rotation.z = Math.PI / 2;
    // ロープの みぞ（らせん）
    const groove = mesh(
      G.coilSpring({ radius: DRUM_R + 0.0004, wire: 0.0005, turns: 12, length: 0.0440, radialSegments: 5 }),
      this.mats.rope,
      { parent: g, cast: false },
    );
    groove.rotation.z = Math.PI / 2;
    this.drumGroove = groove;
    // つば
    for (const sx of [-1, 1]) {
      const f = mesh(G.ring(DRUM_R + 0.0034, DRUM_R - 0.0020, 0.0026, 30), this.mats.gear, {
        parent: g, pos: [sx * 0.0250, 0, 0], cast: false,
      });
      f.rotation.z = Math.PI / 2;
    }
    // 軸
    const axle = mesh(G.chamferedCylinder(0.0026, 0.0840, 0.0004, 14), this.mats.shaft, {
      parent: g, cast: false,
    });
    axle.rotation.z = Math.PI / 2;

    // ウォームホイール
    const wheel = mesh(
      G.gearGeometry({ teeth: 26, module: 0.0009, thickness: 0.0032, bore: 0.0028, hub: 0.0050, hubHeight: 0.0012, spokes: 4 }),
      this.mats.gear,
      { parent: g, pos: [0.0345, 0, 0], cast: false },
    );
    wheel.rotation.z = Math.PI / 2;

    this.addGuts(group());
  }

  /* --- ラチェット（戻り止め） ------------------------------------------- */

  _buildRatchet() {
    const g = group({ pos: [-0.0345, DRUM_Y, 0] });
    this.root.add(g);

    const wheel = mesh(
      G.ratchetGeometry({ teeth: 16, radius: 0.0118, depth: 0.0030, thickness: 0.0030, bore: 0.0028 }),
      this.mats.gear,
      { parent: g, cast: false },
    );
    wheel.rotation.z = Math.PI / 2;
    this.ratchetWheel = g;

    // つめ（板バネつき）
    const pivot = group({ pos: [-0.0345, DRUM_Y - 0.0210, 0.0060] });
    this.root.add(pivot);
    this.pawlGroup = pivot;
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0030, -0.0028),
          new THREE.Vector2(0.0040, -0.0026),
          new THREE.Vector2(0.0186, 0.0034),
          new THREE.Vector2(0.0166, 0.0074),
          new THREE.Vector2(0.0026, 0.0034),
          new THREE.Vector2(-0.0030, 0.0028),
        ],
        [],
        0.0022,
        { corner: 0.0016, bevel: 0.0004 },
      ),
      this.mats.pawl,
      { parent: pivot, cast: false },
    );
    mesh(G.chamferedCylinder(0.0016, 0.0090, 0.0003, 12), this.mats.shaft, {
      parent: pivot, rot: [Math.PI / 2, 0, 0], cast: false,
    });
    // つまむ ところ
    mesh(new G.RoundedBoxGeometry(0.0060, 0.0090, 0.0040, 2, 0.0014), this.mats.crank, {
      parent: pivot, pos: [-0.0056, -0.0028, 0], cast: false,
    });

    hitSphere(pivot, 0.0130, [-0.004, -0.002, 0.002]);
    this.handle({
      id: 'pawl',
      label: 'つめ',
      type: 'press',
      object: pivot,
      hint: { kind: 'push', offset: [-0.014, 0.018, 0.010], size: 0.011 },
      onPress: () => {
        this.pawlHeld = true;
        this._pawlKick = 1;
        this.audio.click({ gain: 0.42, bright: 1800 });
      },
      onRelease: () => {
        this.pawlHeld = false;
        this.audio.click({ gain: 0.34, bright: 1200 });
      },
    });
  }

  /* --- かご -------------------------------------------------------------- */

  _buildCage() {
    const c = group({ pos: [CAGE_X, CAGE_LOW, 0] });
    this.root.add(c);
    this.cageGroup = c;

    const W = 0.0340;
    const H = 0.0400;
    const D = 0.0340;

    // 床と天井
    mesh(G.roundedPlate(W, D, 0.0022, 0.0030, { bevel: 0.0005 }), this.mats.cage, {
      parent: c, pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0],
    });
    mesh(G.roundedPlate(W, D, 0.0022, 0.0030, { bevel: 0.0005 }), this.mats.cage, {
      parent: c, pos: [0, H, 0], rot: [Math.PI / 2, 0, 0],
    });
    // 4すみの柱
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(new G.RoundedBoxGeometry(0.0034, H, 0.0034, 2, 0.0010), this.mats.cageFrame, {
          parent: c, pos: [sx * (W / 2 - 0.0022), H / 2, sz * (D / 2 - 0.0022)], cast: false,
        });
      }
    }
    // 背面と側面の格子
    for (let i = 0; i < 4; i++) {
      mesh(new G.RoundedBoxGeometry(W - 0.004, 0.0022, 0.0022, 1, 0.0008), this.mats.cageFrame, {
        parent: c, pos: [0, 0.0060 + i * 0.0095, -D / 2 + 0.0022], cast: false,
      });
    }
    // 吊り金具
    const bail = new THREE.TorusGeometry(0.0060, 0.0014, 8, 20, Math.PI);
    const b = mesh(bail, this.mats.shaft, { parent: c, pos: [0, H + 0.0010, 0] });
    b.rotation.y = Math.PI / 2;

    // のっている人（つみき の 人形）
    const doll = group({ parent: c, pos: [0, 0.0022, 0.0020] });
    mesh(G.chamferedCylinder(0.0062, 0.0140, 0.0010, 20), this.mats.dollCoat, {
      parent: doll, pos: [0, 0.0070, 0], cast: false,
    });
    mesh(new THREE.SphereGeometry(0.0058, 16, 12), this.mats.doll, {
      parent: doll, pos: [0, 0.0198, 0], cast: false,
    });
    mesh(
      G.lathe([[0, 0], [0.0080, 0], [0.0074, 0.0012], [0.0044, 0.0016], [0.0042, 0.0056], [0, 0.0060]], { segments: 20, center: false }),
      this.mats.dollHat,
      { parent: doll, pos: [0, 0.0234, 0], cast: false },
    );
    this.doll = doll;

    hitProxy(c, new THREE.BoxGeometry(W + 0.010, H + 0.010, D + 0.010), { pos: [0, H / 2, 0] });
    this.handle({
      id: 'cage',
      label: 'かご',
      type: 'slide',
      object: c,
      axis: new THREE.Vector3(0, 1, 0),
      hint: { kind: 'pull', offset: [-0.024, 0.020, 0], size: 0.012, axis: new THREE.Vector3(0, 1, 0) },
      getValue: () => this.cage,
      onSlide: (delta, ctx) => {
        this.cage = clamp01(ctx.value0 + delta / (CAGE_HIGH - CAGE_LOW));
        this.driving = true;
        this._driveTimer = 0.15;
      },
    });

    this.addGuts(group());
  }

  /* --- つりあいおもり ---------------------------------------------------- */

  _buildCounterweight() {
    const w = group({ pos: [CW_X, 0, 0] });
    this.root.add(w);
    this.cwGroup = w;

    for (let i = 0; i < 3; i++) {
      mesh(new G.RoundedBoxGeometry(0.0170, 0.0092, 0.0140, 2, 0.0016), this.mats.weight, {
        parent: w, pos: [0, 0.0050 + i * 0.0100, 0],
      });
    }
    const bail = new THREE.TorusGeometry(0.0050, 0.0013, 8, 18, Math.PI);
    const b = mesh(bail, this.mats.shaft, { parent: w, pos: [0, 0.0308, 0] });
    b.rotation.y = Math.PI / 2;

    hitProxy(w, new THREE.BoxGeometry(0.026, 0.038, 0.024), { pos: [0, 0.016, 0] });
    this.handle({
      id: 'counterweight',
      label: 'つりあいおもり',
      type: 'grab',
      object: w,
      hint: { kind: 'hold', offset: [0.018, 0.016, 0], size: 0.011 },
      onGrab: () => {
        this.cwHeld = true;
        this.audio.click({ gain: 0.3, bright: 700 });
      },
      onRelease: () => {
        this.cwHeld = false;
      },
    });

    this.addGuts(group());
  }

  /* --- ハンドル ---------------------------------------------------------- */

  _buildCrank() {
    const wormY = DRUM_Y - 0.0155;
    const c = group({ pos: [0.0345, wormY, 0.0180] });
    this.root.add(c);
    this.crankGroup = c;

    // ウォーム（らせん）
    const worm = mesh(
      G.coilSpring({ radius: 0.0042, wire: 0.0015, turns: 6, length: 0.0120, radialSegments: 7 }),
      this.mats.gear,
      { parent: c, pos: [0, 0, -0.0180], cast: false },
    );
    worm.rotation.x = Math.PI / 2;
    mesh(G.chamferedCylinder(0.0026, 0.0400, 0.0004, 14), this.mats.shaft, {
      parent: c, pos: [0, 0, -0.0090], rot: [Math.PI / 2, 0, 0], cast: false,
    });

    // クランクアーム
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0056, -0.0038),
          new THREE.Vector2(0.0200, -0.0034),
          new THREE.Vector2(0.0200, 0.0034),
          new THREE.Vector2(-0.0056, 0.0038),
        ],
        [],
        0.0034,
        { corner: 0.0032, bevel: 0.0006 },
      ),
      this.mats.crank,
      { parent: c, pos: [0, 0, 0.0022] },
    );
    const knob = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0044, 0.0004],
          [0.0052, 0.0028],
          [0.0048, 0.0092],
          [0, 0.0100],
        ],
        { segments: 22, center: false },
      ),
      this.mats.knob,
      { parent: c, pos: [0.0190, 0, 0.0044] },
    );
    knob.rotation.x = -Math.PI / 2;

    hitSphere(c, 0.0130, [0.0190, 0, 0.0090]);
    hitCylinder(c, 0.0075, 0.024, [0.0095, 0, 0.0040], [Math.PI / 2, 0, 0]);

    this.handle({
      id: 'crank',
      label: 'ハンドル',
      type: 'rotate',
      object: c,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: c,
      primary: true,
      hint: { kind: 'spin', offset: [0, 0, 0.030], size: 0.022 },
      onRotate: (d) => {
        if (this.cwHeld) return; // おもりを押さえていると重くて動かない
        const before = this.cage;
        this.cage = clamp01(this.cage + d / (TAU * TURNS));
        this.driving = true;
        this._driveTimer = 0.14;
        this.vel = 0;
        this._clickCheck(before);
      },
    });
  }

  /* --- ロープ ------------------------------------------------------------ */

  _buildRopes() {
    const g = group({ name: 'ropes' });
    const seg = G.chamferedCylinder(0.0009, 1.0, 0.0002, 8);
    this.ropeCage = mesh(seg, this.mats.rope, { parent: g, cast: false });
    this.ropeWeight = mesh(seg.clone(), this.mats.rope, { parent: g, cast: false });
    this.addGuts(g);
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  _clickCheck(before) {
    // ラチェットの歯 1 枚ぶん進むごとに カチッ
    const teeth = 16;
    const a0 = Math.floor(before * TURNS * teeth);
    const a1 = Math.floor(this.cage * TURNS * teeth);
    if (a0 !== a1) this.audio.tick({ gain: 0.16, pitch: 1.5 });
  }

  step(dt) {
    this._driveTimer = Math.max(0, this._driveTimer - dt);
    if (this._driveTimer === 0) this.driving = false;

    if (!this.driving) {
      if (this.pawlHeld && !this.cwHeld) {
        // 戻り止めが はずれている: つりあいおもりのぶん、ゆっくり おりる
        this.vel -= 0.55 * dt;
        this.vel = Math.max(this.vel, -0.45);
        const before = this.cage;
        this.cage = clamp01(this.cage + this.vel * dt);
        if (this.cage <= 0 && before > 0) {
          this.vel = 0;
          this.audio.boing({ gain: 0.22, freq: 150, decay: 0.35 });
          this.onPop?.();
        }
      } else {
        this.vel = damp(this.vel, 0, 26, dt);
      }
    }
    this._pawlKick = damp(this._pawlKick, 0, 8, dt);
  }

  lateUpdate(dt) {
    const cageY = lerp(CAGE_LOW, CAGE_HIGH, this.cage);
    const cwY = lerp(CAGE_HIGH - 0.0330, CAGE_LOW - 0.0060, this.cage);

    this.cageGroup.position.y = cageY;
    this.cwGroup.position.y = cwY;

    const turn = this.cage * TURNS * TAU;
    this.drumGroup.rotation.x = turn;
    this.ratchetWheel.rotation.x = turn;
    this.crankGroup.rotation.z = turn;
    this.drumGroove.position.x = 0;

    // つめ（押されると持ち上がる。歯を乗り越えるときは かすかに はねる）
    const ride = this.pawlHeld ? 0.42 : Math.abs(Math.sin(turn * 8)) * 0.05;
    this.pawlGroup.rotation.z = -ride - this._pawlKick * 0.12;

    // ロープ
    this._a.set(CAGE_X, DRUM_Y - DRUM_R, 0);
    this._b.set(CAGE_X, cageY + 0.0400 + 0.0060, 0);
    stretchBetween(this.ropeCage, this._a, this._b);
    this._a.set(CW_X, DRUM_Y - DRUM_R, 0);
    this._b.set(CW_X, cwY + 0.0308, 0);
    stretchBetween(this.ropeWeight, this._a, this._b);

    // 人形は かごが動くと ちょっと ゆれる
    this.doll.rotation.z = clamp(this.vel * 0.6, -0.2, 0.2);

    this._updateSound(dt);
  }

  _updateSound() {
    const creak = this.audio.voice('liftCreak', { source: 'noise', filter: 'bandpass', freq: 420, Q: 5 });
    const moving = clamp01(Math.abs(this.vel) * 3);
    creak.set({ level: moving * 0.07, freq: 380 + this.cage * 260, smooth: 0.08 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'height', icon: 'gauge', label: 'たかさ', value: this.cage, color: '#d9883f' },
      { id: 'lock', icon: 'spring', label: 'とめ金', value: this.pawlHeld ? 0.08 : 1, color: '#8b939c' },
    ];
  }

  reset() {
    this.cage = 0.12;
    this.vel = 0;
    this.pawlHeld = false;
    this.cwHeld = false;
  }
}
