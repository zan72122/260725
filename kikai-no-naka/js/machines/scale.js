/**
 * scale.js — はかり
 *
 * 「おもさ」が、バネの ちぢみ に化けて、はりの 角度になるまでを見せる機械。
 *
 *   ものを のせる（または 指で おす）→ バネが ちぢむ
 *   → ラック（歯のついた棒）が下がる → ピニオン（小さな歯車）がまわる
 *   → はりが うごく。ひげぜんまい が はりを もどそうとするので、
 *     きゅうに のせると はりが 行きすぎて、ゆらゆら してから 止まる。
 *
 * さわりどころ:
 *   - 皿を 指で ぐっと おすと、おした ぶんだけ はりが うごく（ずっと つながっている）
 *   - りんご・レモン・おもり を さわると、皿に のったり おりたり する
 *   - バネを 指で つかむと、いくら のせても はりが うごかない
 *   - わく をまわすと、ゼロの いちを ずらせる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, ease, lerp, TAU } from '../lib/math.js';

const BODY_W = 0.0880;
const BODY_H = 0.0480;
const BODY_D = 0.0560;
/** 文字盤は 正面の 平らな面に 置く */
const DIAL_Z = BODY_D / 2 + 0.0010;
const DIAL_Y = 0.0250;
const PAN_Y = 0.0620;
/** バネが いっぱいに ちぢんだときの 沈みこみ */
const TRAVEL = 0.0140;
/** 目盛りいっぱいの おもさ */
const FULL_SCALE = 1.4;

/** 皿にのせられるもの */
const ITEMS = [
  { id: 'apple', label: 'りんご', weight: 0.46, home: [-0.086, 0, 0.024] },
  { id: 'lemon', label: 'レモン', weight: 0.26, home: [-0.090, 0, -0.026] },
  { id: 'weight', label: 'おもり', weight: 0.72, home: [0.090, 0, 0.006] },
];

export class Scale extends Machine {
  static meta = {
    id: 'scale',
    name: 'はかり',
    sub: 'おもさが みえる',
    accent: 0x6fae74,
    backdrop: {
      top: '#f8fbf3',
      middle: '#eaf2e0',
      bottom: '#cdd9be',
      glow: '#e9f7d9',
      glowStrength: 0.14,
    },
    bloom: { strength: 0.26, radius: 0.5, threshold: 1.1 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="9" y="18" width="30" height="22" rx="6" fill="#eaf2e0" stroke="#3f6b45" stroke-width="2.4"/>
      <circle cx="24" cy="29" r="7.5" fill="#fffdf6" stroke="#3f6b45" stroke-width="2.2"/>
      <path d="M24 29l4.6-4.2" stroke="#e0553f" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="5" y="11" width="38" height="5" rx="2.5" fill="#9fd06a" stroke="#3f6b45" stroke-width="2.2"/>
      <circle cx="17" cy="6.6" r="4.2" fill="#e0553f" stroke="#8d3328" stroke-width="2"/>
      <ellipse cx="30" cy="7.6" rx="3.6" ry="3" fill="#f2c93f" stroke="#8a6320" stroke-width="2"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.press = 0;         // 指で おしている ぶん 0..1
    this.pressTarget = 0;
    this.x = 0;             // バネの ちぢみ 0..1
    this.v = 0;             // その速度
    this.zero = 0;          // ゼロ調整（rad）
    this.springHeld = false;
    /** @type {{def:object, group:THREE.Group, on:boolean, t:number}[]} */
    this.items = [];

    this.radius = 0.084;
    this.center = new THREE.Vector3(0, 0.036, 0.004);
    // 斜めに置くと、文字盤と 中の しくみ が 同時に 見える
    this.root.rotation.y = -30 * (Math.PI / 180);
    this.footprint = { w: 0.21, d: 0.10, opacity: 0.30 };
    this.radius = 0.086;
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.10, -0.30, -1.0),
      center: this.center,
      span: 0.100,
      noiseScale: 13,
    });

    this.mats = {
      body: M.shell('paint', { color: 0xeaf2e0, roughness: 0.28 }),
      bodyTrim: M.shell('paint', { color: 0x3f6b45, roughness: 0.32 }),
      bezel: M.shell('steel', { color: 0xe4eaef, roughness: 0.18 }),
      glass: M.shell('glass', { opacity: 0.18 }),
      dialFace: M.shell('plastic', { color: 0xfffdf6, roughness: 0.55 }),

      pan: M.part('steel', { color: 0xdfe6ec, roughness: 0.20 }),
      post: M.part('steel', { color: 0xd2dae1, roughness: 0.18 }),
      spring: M.part('steel', { color: 0xbcc6cf, roughness: 0.26 }),
      rack: M.part('coated', { color: 0x8f9aa6, roughness: 0.42 }),
      pinion: M.part('brass', { color: 0xe0b055 }),
      hair: M.part('steel', { color: 0xc9d2da, roughness: 0.24 }),
      needle: M.part('plastic', { color: 0xe0553f, roughness: 0.3 }),
      tick: M.part('plastic', { color: 0x77705c, roughness: 0.5 }),
      tickBold: M.part('plastic', { color: 0x3a3428, roughness: 0.45 }),
      // わくは 少し沈んだ色にする。明るすぎると、手前のバネやピニオンが
      // 白い板に溶けこんで、なにが動いているのか分からなくなる。
      frame: M.part('coated', { color: 0xa8b4c1, roughness: 0.46 }),
      rubber: M.plain('rubber'),

      apple: M.part('plastic', { color: 0xe0553f, roughness: 0.28 }),
      lemon: M.part('plastic', { color: 0xf2c93f, roughness: 0.42 }),
      weight: M.part('coated', { color: 0x5c6470, roughness: 0.42 }),
      stem: M.part('plastic', { color: 0x6b4a2a, roughness: 0.6 }),
      leaf: M.part('plastic', { color: 0x6fae74, roughness: 0.5 }),
    };

    this._buildBody();
    this._buildDial();
    this._buildMechanism();
    this._buildPan();
    this._buildItems();

    this.setXray(0);
  }

  /* --- 外装 ------------------------------------------------------------ */

  _buildBody() {
    const g = group({ name: 'body' });

    // 胴（正面が 平らな 箱。ここに 文字盤 を はめる）
    mesh(new G.RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 5, 0.0110), this.mats.body, {
      parent: g, pos: [0, BODY_H / 2, 0],
    });
    // 下の帯
    mesh(new G.RoundedBoxGeometry(BODY_W + 0.0022, 0.0100, BODY_D + 0.0022, 3, 0.0042), this.mats.bodyTrim, {
      parent: g, pos: [0, 0.0062, 0],
    });
    // 正面の 座ぐり（文字盤の まわりの くぼみ）
    mesh(G.ring(0.0346, 0.0300, 0.0026, 48), this.mats.bodyTrim, {
      parent: g, pos: [0, DIAL_Y, BODY_D / 2 - 0.0006], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    // ゴム脚
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(
          G.lathe([[0, 0], [0.0058, 0], [0.0062, 0.0016], [0.0046, 0.0030], [0, 0.0032]], { segments: 16, center: false }),
          this.mats.rubber,
          { parent: g, pos: [sx * 0.0350, 0.0002, sz * 0.0200], rot: [Math.PI, 0, 0], cast: false },
        );
      }
    }

    this.addShell(g);
    this.bodyGroup = g;
  }

  /* --- 文字盤 ---------------------------------------------------------- */

  _buildDial() {
    const d = group({ pos: [0, DIAL_Y, 0] });
    this.root.add(d);
    this.dialGroup = d;

    // ベゼル（まわすとゼロ調整）
    const bezel = group({ parent: d });
    this.bezelGroup = bezel;
    mesh(G.ring(0.0322, 0.0256, 0.0056, 48), this.mats.bezel, {
      parent: bezel, pos: [0, 0, DIAL_Z + 0.0010], rot: [Math.PI / 2, 0, 0],
    });
    // つまみ（ベゼルの回転が分かる目印）
    mesh(new G.RoundedBoxGeometry(0.0060, 0.0036, 0.0080, 2, 0.0012), this.mats.bodyTrim, {
      parent: bezel, pos: [0, 0.0308, DIAL_Z + 0.0006], cast: false,
    });

    // 文字盤
    mesh(G.roundedPlate(0.0536, 0.0536, 0.0016, 0.0268, { bevel: 0.0004, curveSegments: 20 }), this.mats.dialFace, {
      parent: d, pos: [0, 0, DIAL_Z - 0.0020],
    });
    // ガラス
    const glass = mesh(
      G.lathe(
        [
          [0, 0.0014],
          [0.0140, 0.0012],
          [0.0264, 0.0002],
          [0.0264, -0.0006],
          [0, -0.0006],
        ],
        { segments: 44, center: false },
      ),
      this.mats.glass,
      { parent: d, pos: [0, 0, DIAL_Z + 0.0008], rot: [Math.PI / 2, 0, 0], cast: false },
    );
    glass.renderOrder = 22;

    // 目盛り（ベゼルと一緒にまわる = ゼロ調整）
    const bigTick = new G.RoundedBoxGeometry(0.0026, 0.0078, 0.0012, 2, 0.0006);
    const smallTick = new G.RoundedBoxGeometry(0.0014, 0.0040, 0.0010, 2, 0.0004);
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU * 0.82 - TAU * 0.41;
      const big = i % 5 === 0;
      const r = big ? 0.0198 : 0.0212;
      mesh(big ? bigTick : smallTick, big ? this.mats.tickBold : this.mats.tick, {
        parent: bezel,
        pos: [Math.sin(a) * r, Math.cos(a) * r, DIAL_Z - 0.0010],
        rot: [0, 0, -a],
        cast: false,
        receive: false,
      });
    }

    // はり
    const needle = group({ parent: d, pos: [0, 0, DIAL_Z + 0.0002] });
    this.needleGroup = needle;
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0020, -0.0060),
          new THREE.Vector2(0.0020, -0.0060),
          new THREE.Vector2(0.0010, 0.0186),
          new THREE.Vector2(0, 0.0222),
          new THREE.Vector2(-0.0010, 0.0186),
        ],
        [],
        0.0012,
        { corner: 0.0007, bevel: 0.0003 },
      ),
      this.mats.needle,
      { parent: needle, cast: false },
    );
    mesh(
      G.lathe([[0, 0], [0.0038, 0], [0.0034, 0.0018], [0, 0.0024]], { segments: 20, center: false }),
      this.mats.pinion,
      { parent: needle, pos: [0, 0, 0.0008], rot: [-Math.PI / 2, 0, 0], cast: false },
    );

    hitCylinder(bezel, 0.034, 0.014, [0, 0, DIAL_Z], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'bezel',
      label: 'ゼロあわせ',
      type: 'rotate',
      object: bezel,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: d,
      gain: 0.5,
      onRotate: (delta) => {
        this.zero = clamp(this.zero + delta, -0.55, 0.55);
      },
    });
  }

  /* --- なかみ（バネとラックとピニオン） -------------------------------- */

  _buildMechanism() {
    const m = group({ name: 'mechanism' });

    // 支えのわく
    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0040, BODY_H - 0.0080, 0.0120, 2, 0.0010), this.mats.frame, {
        parent: m, pos: [sx * 0.0190, BODY_H / 2, -0.0080], cast: false,
      });
    }
    mesh(new G.RoundedBoxGeometry(0.0420, 0.0038, 0.0180, 2, 0.0010), this.mats.frame, {
      parent: m, pos: [0, 0.0062, -0.0080], cast: false,
    });
    // 明るい背板。すけすけにしたとき、胴の中が 黒い穴に見えないようにする。
    mesh(G.roundedPlate(BODY_W - 0.014, BODY_H - 0.012, 0.0016, 0.0060, { bevel: 0.0004 }), this.mats.frame, {
      parent: m, pos: [0, BODY_H / 2, -BODY_D / 2 + 0.0040], cast: false,
    });

    // 動く棒（皿と一緒に上下する）
    const stem = group({ parent: m });
    this.stemGroup = stem;
    mesh(G.chamferedCylinder(0.0040, 0.0400, 0.0005, 18), this.mats.post, {
      parent: stem, pos: [0, BODY_H - 0.0040, 0], cast: false,
    });

    // バネ（ちぢむのが見える）
    const springGeo = G.coilSpring({ radius: 0.0110, wire: 0.0016, turns: 7, length: 1.0, radialSegments: 8 });
    const spring = new THREE.Mesh(springGeo, this.mats.spring);
    spring.castShadow = false;
    spring.receiveShadow = false;
    m.add(spring);
    this.springMesh = spring;
    // バネの受け皿（上下）
    mesh(G.ring(0.0130, 0.0044, 0.0022, 26), this.mats.frame, {
      parent: m, pos: [0, 0.0090, 0], cast: false,
    });
    const topSeat = mesh(G.ring(0.0130, 0.0044, 0.0022, 26), this.mats.post, {
      parent: stem, pos: [0, 0.0330, 0], cast: false,
    });
    this.springTopSeat = topSeat;

    // ラック（歯のついた棒）
    const rack = group({ parent: stem, pos: [0.0072, 0.0250, 0.0100] });
    mesh(new G.RoundedBoxGeometry(0.0044, 0.0260, 0.0026, 2, 0.0006), this.mats.rack, {
      parent: rack, cast: false,
    });
    for (let i = 0; i < 10; i++) {
      mesh(new G.RoundedBoxGeometry(0.0016, 0.0014, 0.0026, 1, 0.0004), this.mats.rack, {
        parent: rack, pos: [-0.0028, -0.0110 + i * 0.0024, 0], cast: false,
      });
    }

    // ピニオン（はりの軸）
    const pinion = group({ parent: m, pos: [0.0022, DIAL_Y, 0.0110] });
    this.pinionGroup = pinion;
    mesh(
      G.gearGeometry({ teeth: 14, module: 0.00034 * 2, thickness: 0.0026, bore: 0.0010, hub: 0.0020, hubHeight: 0.0008 }),
      this.mats.pinion,
      { parent: pinion, rot: [Math.PI / 2, 0, 0], cast: false },
    );
    const shaft = mesh(G.chamferedCylinder(0.0011, 0.0230, 0.0002, 12), this.mats.post, {
      parent: pinion, pos: [0, 0, 0.0080], cast: false,
    });
    shaft.rotation.x = Math.PI / 2;

    // ひげぜんまい（はりをもどす）
    this.hairGeo = G.makeMainspring({
      innerR: 0.0016,
      outerR: 0.0086,
      width: 0.0013,
      thickness: 0.00015,
      turnsMin: 2.8,
      turnsMax: 4.0,
      samples: 120,
    });
    const hair = new THREE.Mesh(this.hairGeo, this.mats.hair);
    hair.rotation.x = Math.PI / 2;
    hair.position.z = -0.0046;
    hair.castShadow = false;
    hair.receiveShadow = false;
    pinion.add(hair);

    hitCylinder(m, 0.0170, 0.030, [0, 0.0230, 0]);
    this.handle({
      id: 'spring',
      label: 'ばね',
      type: 'grab',
      object: m,
      hint: { kind: 'hold', offset: [0, 0.010, 0.014], size: 0.011 },
      onGrab: () => {
        this.springHeld = true;
        this.audio.click({ gain: 0.28, bright: 900 });
      },
      onRelease: () => {
        this.springHeld = false;
      },
    });

    this.addGuts(m);
  }

  /* --- 皿 --------------------------------------------------------------- */

  _buildPan() {
    const p = group({ pos: [0, PAN_Y, 0] });
    this.root.add(p);
    this.panGroup = p;

    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0350, 0],
          [0.0384, 0.0024],
          [0.0390, 0.0056],
          [0.0366, 0.0062],
          [0.0358, 0.0030],
          [0, 0.0026],
        ],
        { segments: 52, center: false },
      ),
      this.mats.pan,
      { parent: p },
    );
    // 皿を受ける十字
    for (let i = 0; i < 2; i++) {
      mesh(new G.RoundedBoxGeometry(0.0360, 0.0030, 0.0060, 2, 0.0010), this.mats.post, {
        parent: p, pos: [0, -0.0026, 0], rot: [0, (i * Math.PI) / 2, 0], cast: false,
      });
    }

    hitCylinder(p, 0.040, 0.020, [0, 0.002, 0]);
    this.handle({
      id: 'pan',
      label: 'さら',
      type: 'slide',
      object: p,
      axis: new THREE.Vector3(0, -1, 0),
      primary: true,
      hint: { kind: 'push', offset: [0, 0.028, 0], size: 0.014, axis: new THREE.Vector3(0, 1, 0) },
      getValue: () => this.press,
      onSlide: (delta, ctx) => {
        this.pressTarget = clamp01(ctx.value0 + delta / TRAVEL);
      },
      onSlideEnd: () => {
        this.pressTarget = 0;
      },
      onTap: () => {
        // ぽんっと たたくと、はりが ゆれる
        this.v += 5.5;
        this.audio.tick({ gain: 0.16, pitch: 0.9 });
      },
    });
  }

  /* --- のせるもの ------------------------------------------------------- */

  _buildItems() {
    const holder = group();
    this.root.add(holder);

    for (const def of ITEMS) {
      const g = group({ parent: holder, pos: def.home });
      if (def.id === 'apple') {
        mesh(
          G.lathe(
            [
              [0, 0],
              [0.0090, 0.0006],
              [0.0130, 0.0060],
              [0.0128, 0.0140],
              [0.0080, 0.0192],
              [0.0026, 0.0186],
              [0, 0.0176],
            ],
            { segments: 30, center: false },
          ),
          this.mats.apple,
          { parent: g },
        );
        mesh(G.chamferedCylinder(0.0011, 0.0080, 0.0002, 8), this.mats.stem, {
          parent: g, pos: [0.0006, 0.0206, 0], rot: [0, 0, 0.22], cast: false,
        });
        mesh(G.roundedPlate(0.0110, 0.0056, 0.0008, 0.0028), this.mats.leaf, {
          parent: g, pos: [0.0072, 0.0212, 0], rot: [Math.PI / 2, 0.5, 0.35], cast: false,
        });
      } else if (def.id === 'lemon') {
        mesh(
          G.lathe(
            [
              [0, 0],
              [0.0058, 0.0016],
              [0.0092, 0.0080],
              [0.0086, 0.0148],
              [0.0038, 0.0186],
              [0.0012, 0.0196],
              [0, 0.0198],
            ],
            { segments: 28, center: false },
          ),
          this.mats.lemon,
          { parent: g },
        );
      } else {
        // おもり（取っ手つきの 鉄の かたまり）
        mesh(
          G.lathe(
            [
              [0, 0],
              [0.0140, 0],
              [0.0136, 0.0044],
              [0.0104, 0.0170],
              [0.0090, 0.0192],
              [0, 0.0196],
            ],
            { segments: 30, center: false },
          ),
          this.mats.weight,
          { parent: g },
        );
        const ringGeo = new THREE.TorusGeometry(0.0064, 0.0016, 8, 22, Math.PI * 1.25);
        const r = mesh(ringGeo, this.mats.post, { parent: g, pos: [0, 0.0206, 0] });
        r.rotation.set(0, Math.PI / 2, -Math.PI * 0.12);
      }

      const item = { def, group: g, on: false, t: 0, home: new THREE.Vector3(...def.home) };
      this.items.push(item);

      hitSphere(g, 0.020, [0, 0.010, 0]);
      this.handle({
        id: def.id,
        label: def.label,
        type: 'grab',
        object: g,
        hint: def.id === 'apple' ? { kind: 'hold', offset: [0, 0.030, 0], size: 0.011 } : undefined,
        onGrab: () => {
          item.on = !item.on;
          this.audio.click({ gain: 0.36, bright: item.on ? 2600 : 1700 });
          if (item.on) this.audio.tick({ gain: 0.1, pitch: 0.8 });
        },
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  get load() {
    let w = 0;
    for (const it of this.items) if (it.on) w += it.def.weight * it.t;
    return w;
  }

  step(dt) {
    // 指の おし込み
    this.press = damp(this.press, this.pressTarget, 16, dt);

    // のせもの が 皿へ 移動する アニメーション
    for (const it of this.items) {
      it.t = damp(it.t, it.on ? 1 : 0, 7, dt);
    }

    // バネ（ばね・質量・ダンパ）。行きすぎて ゆらゆら するのが 気持ちいい。
    const target = this.springHeld ? this.x : clamp01(this.load / FULL_SCALE + this.press);
    const w = 15.5;
    const zeta = 0.16;
    const a = (target - this.x) * w * w - 2 * zeta * w * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    if (this.x < 0) {
      this.x = 0;
      this.v = Math.max(0, this.v);
    }
    if (this.x > 1.06) {
      this.x = 1.06;
      this.v = Math.min(0, this.v);
    }
  }

  lateUpdate(dt) {
    const sink = this.x * TRAVEL;

    // 皿と棒
    this.panGroup.position.y = PAN_Y - sink;
    this.stemGroup.position.y = -sink;

    // バネ（長さが ちぢむ）
    const springLen = 0.0250 - sink;
    this.springMesh.position.set(0, 0.0100 + springLen / 2, 0);
    this.springMesh.scale.y = springLen;

    // はり
    const angle = -this.x * (TAU * 0.41 * 2) + this.zero;
    this.needleGroup.rotation.z = angle;
    this.pinionGroup.rotation.z = angle * 1.0;
    this.bezelGroup.rotation.z = this.zero;

    // ひげぜんまい（はりと一緒に 巻きしまる）
    const hairT = clamp01(0.35 + this.x * 0.5);
    if (Math.abs(hairT - (this._lastHair ?? -1)) > 0.012) {
      this._lastHair = hairT;
      this.hairGeo.userData.update(hairT);
    }

    // のせもの
    for (const it of this.items) {
      const t = ease.outCubic(clamp01(it.t));
      const y = lerp(0, PAN_Y + 0.0030 - sink, t);
      const arc = Math.sin(clamp01(it.t) * Math.PI) * 0.020;
      it.group.position.set(
        lerp(it.home.x, 0, t) + (it.def.id === 'lemon' ? 0.016 * t : it.def.id === 'weight' ? -0.014 * t : 0),
        y + arc,
        lerp(it.home.z, it.def.id === 'apple' ? 0.012 : -0.010, t),
      );
      it.group.rotation.z = Math.sin(clamp01(it.t) * Math.PI) * 0.5;
    }

    this._updateSound(dt);
  }

  _updateSound() {
    // 大きく振れているあいだだけ、かすかに きしむ
    const creak = this.audio.voice('scaleCreak', { source: 'noise', filter: 'bandpass', freq: 600, Q: 6 });
    creak.set({ level: clamp01(Math.abs(this.v) * 0.05) * 0.05, freq: 500 + this.x * 500, smooth: 0.06 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'weight', icon: 'gauge', label: 'おもさ', value: clamp01(this.x), color: '#6fae74' },
      { id: 'spring', icon: 'spring', label: 'ばねの ちぢみ', value: clamp01(this.x), color: '#8ba3b8' },
    ];
  }

  reset() {
    this.press = 0;
    this.pressTarget = 0;
    this.x = 0;
    this.v = 0;
    this.zero = 0;
    this.springHeld = false;
    for (const it of this.items) {
      it.on = false;
      it.t = 0;
    }
  }
}
