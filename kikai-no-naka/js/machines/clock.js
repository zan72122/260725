/**
 * clock.js — めざましどけい
 *
 * 「とき」が、ぜんまいのちからでできていることを見せる機械。
 *
 *   かぎ → ぜんまい（うずまきバネ）→ 歯車の列 → がんぎ車
 *        → アンクル ⇄ てんぷ（いったりきたりする輪）→ はりが すすむ
 *
 * さわりどころ:
 *   - かぎをまわすと、うずまきバネが目に見えて きつく巻かれる
 *   - てんぷを指で つかむと、時間そのものが止まる（いちばん見せたい体験）
 *   - はりを直接つかんで、すきな時刻にできる
 *   - ベルのボタンを押すと、ハンマーが2つの鐘のあいだで暴れる
 *   - 巻きが ほどけてくると、てんぷの振れが小さくなり、やがて止まる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../lib/math.js';

const CASE_R = 0.056;
const DIAL_Z = 0.0125;
/** てんぷの振動数（Hz）。実物より少しゆっくりにして、目で追えるようにする。 */
const BEAT_HZ = 2.6;
/** 実時間 1 秒 = 時計の 6 秒。ぶんしんが 1 分で一周する。 */
const TIME_SCALE = 6;

export class Clock extends Machine {
  static meta = {
    id: 'clock',
    name: 'とけい',
    sub: 'ときを とめる',
    accent: 0xe4a13a,
    backdrop: {
      top: '#fdf3e2',
      middle: '#f4e2c6',
      bottom: '#dcc298',
      glow: '#ffe0a8',
      glowStrength: 0.12,
    },
    bloom: { strength: 0.30, radius: 0.5, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="26" r="14.5" fill="#fdf3e2" stroke="#a97828" stroke-width="2.6"/>
      <circle cx="13" cy="11" r="5" fill="#ecc069" stroke="#a97828" stroke-width="2.2"/>
      <circle cx="35" cy="11" r="5" fill="#ecc069" stroke="#a97828" stroke-width="2.2"/>
      <path d="M24 18v8.5l5.5 3.5" stroke="#7a5a12" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M16 41l-3 4M32 41l3 4" stroke="#a97828" stroke-width="2.6" stroke-linecap="round"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.tension = 0.55;      // ぜんまいの巻き 0..1
    this.clockTime = 10 * 3600 + 8 * 60 + 20; // 表示している時刻（秒）
    this.balancePhase = 0;    // てんぷの位相
    this.amplitude = 0;       // てんぷの振れ 0..1
    this.beatCount = 0;
    this.balanceHeld = false;
    this.alarmTimer = 0;
    this.hammerPhase = 0;
    this._springDirty = true;
    this._lastSpringTension = -1;
    this._btnPress = 0;
    this._windClicks = 0;

    this.radius = 0.082;
    this.center = new THREE.Vector3(0, 0.070, 0);
    this.footprint = { w: 0.115, d: 0.055, opacity: 0.34 };
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(0, -0.30, -1.0),
      center: this.center,
      span: 0.085,
      noiseScale: 14,
    });

    this.mats = {
      caseBody: M.shell('paint', { color: 0xf6ead2, roughness: 0.28 }),
      bezel: M.shell('brass'),
      glass: M.shell('glass', { strength: 0.95, thickness: 0.0025 }),
      dial: M.shell('plastic', { color: 0xfffaf0, roughness: 0.55 }),
      bell: M.shell('brass', { color: 0xe8bb62 }),
      foot: M.shell('brass', { color: 0xc79338 }),

      plate: M.part('coated', { color: 0xc8b48a, roughness: 0.42 }),
      tick: M.part('plastic', { color: 0x8b7c62, roughness: 0.5 }),
      tickBold: M.part('plastic', { color: 0x4a3f2e, roughness: 0.45 }),
      brass: M.part('brass'),
      brassBright: M.part('brass', { color: 0xecc372 }),
      steel: M.part('steel', { color: 0xdbe1e7, roughness: 0.16 }),
      steelDark: M.part('coated', { color: 0x8b939c, roughness: 0.4 }),
      blued: M.part('steel', { color: 0x5f7fb8, roughness: 0.2 }),
      spring: M.part('steel', { color: 0xc9d2da, roughness: 0.24 }),
      handHour: M.part('plastic', { color: 0x2f2820, roughness: 0.28 }),
      handMin: M.part('plastic', { color: 0x2f2820, roughness: 0.28 }),
      handSec: M.part('plastic', { color: 0xe0553f, roughness: 0.3 }),
      keyBrass: M.part('coated', { color: 0xe9b84e, roughness: 0.30 }),
      button: M.part('softPlastic', { color: 0xf2634f }),
      ruby: M.part('emissive', { color: 0x6b1a24, emissive: 0xff5a70, emissiveIntensity: 0.35, roughness: 0.15 }),
    };

    this._buildCase();
    this._buildMovement();
    this._buildEscapement();
    this._buildHands();
    this._buildBells();
    this._buildKey();

    this.setXray(0);
  }

  /* --- ケース --------------------------------------------------------- */

  _buildCase() {
    const g = group({ name: 'case', pos: [0, 0.070, 0] });

    // 胴（ドラム）
    mesh(
      G.lathe(
        [
          [0.0000, -0.0180],
          [0.0480, -0.0180],
          [0.0530, -0.0140],
          [0.0548, -0.0060],
          [0.0548, 0.0080],
          [0.0520, 0.0125],
          [0.0470, 0.0138],
          [0.0000, 0.0138],
        ],
        { segments: 60, center: false },
      ),
      this.mats.caseBody,
      { parent: g, rot: [Math.PI / 2, 0, 0] },
    );

    // 前のベゼル
    mesh(G.ring(0.0562, 0.0480, 0.0060, 64), this.mats.bezel, {
      parent: g, pos: [0, 0, DIAL_Z + 0.0018], rot: [Math.PI / 2, 0, 0],
    });

    // ガラス
    const glass = mesh(
      G.lathe(
        [
          [0, 0.0022],
          [0.0200, 0.0020],
          [0.0360, 0.0014],
          [0.0480, 0.0000],
          [0.0480, -0.0006],
          [0, -0.0006],
        ],
        { segments: 56, center: false },
      ),
      this.mats.glass,
      { parent: g, pos: [0, 0, DIAL_Z], rot: [Math.PI / 2, 0, 0], cast: false },
    );
    glass.renderOrder = 22;

    // 文字盤（すけすけで消える）
    const dial = mesh(G.roundedPlate(0.094, 0.094, 0.0016, 0.046, { bevel: 0.0004, curveSegments: 24 }), this.mats.dial, {
      parent: g, pos: [0, 0, DIAL_Z - 0.0028],
    });
    void dial;

    // 時刻の目盛り。3・6・9・12 だけ太くして、時計の顔つきをはっきりさせる。
    const quarterTick = new G.RoundedBoxGeometry(0.0052, 0.0120, 0.0013, 2, 0.0009);
    const bigTick = new G.RoundedBoxGeometry(0.0032, 0.0094, 0.0012, 2, 0.0006);
    const smallTick = new G.RoundedBoxGeometry(0.0016, 0.0046, 0.0010, 2, 0.0004);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      const isQuarter = i % 15 === 0;
      const isHour = i % 5 === 0;
      const r = isQuarter ? 0.0368 : isHour ? 0.0376 : 0.0396;
      mesh(isQuarter ? quarterTick : isHour ? bigTick : smallTick, isHour ? this.mats.tickBold : this.mats.tick, {
        parent: g,
        pos: [Math.sin(a) * r, Math.cos(a) * r, DIAL_Z - 0.0014],
        rot: [0, 0, -a],
        cast: false,
        receive: false,
      });
    }

    // 足
    const footGeo = G.tubeFromPoints(
      [
        [0, 0.004, 0],
        [0.006, -0.010, 0.004],
        [0.014, -0.024, 0.010],
      ],
      0.0034,
      { radialSegments: 10 },
    );
    for (const sx of [-1, 1]) {
      const f = mesh(footGeo, this.mats.foot, { parent: g, pos: [sx * 0.030, -0.0430, 0] });
      f.scale.x = sx;
    }

    this.addShell(g);
    this.caseGroup = g;
  }

  /* --- 機械（ムーブメント） ------------------------------------------- */

  _buildMovement() {
    // 文字盤より確実に奥へ置く（受けやひげぜんまいが盤面から飛び出さないように）
    const m = group({ name: 'movement', pos: [0, 0.070, -0.0102] });
    this.movement = m;

    // 地板（前後 2 枚 + 柱）。手前の板は歯車が見えるよう大きく肉抜きする。
    const backPlate = G.extrudeOutline(circlePts(0.0430, 40), circleHoles(), 0.0018, { bevel: 0.0004 });
    mesh(backPlate, this.mats.plate, { parent: m, pos: [0, 0, -0.0072], cast: false });

    const pillar = G.lathe(
      [
        [0, 0],
        [0.0026, 0],
        [0.0026, 0.0155],
        [0, 0.0155],
      ],
      { segments: 14, center: false },
    );
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const p = mesh(pillar, this.mats.brass, {
        parent: m,
        pos: [Math.cos(a) * 0.0355, Math.sin(a) * 0.0355, -0.0062],
        cast: false,
      });
      p.rotation.x = -Math.PI / 2;
    }

    /* --- ぜんまい（うずまきバネ） --- */
    const barrel = group({ parent: m });
    this.barrelGroup = barrel;
    // 香箱の外わく
    mesh(G.pipe(0.0206, 0.0192, 0.0090, { segments: 44, chamfer: 0.0006 }), this.mats.brassBright, {
      parent: barrel, rot: [Math.PI / 2, 0, 0], cast: false,
    });
    // 中心の軸
    mesh(G.chamferedCylinder(0.0034, 0.0140, 0.0005, 18), this.mats.steel, {
      parent: barrel, rot: [Math.PI / 2, 0, 0], cast: false,
    });

    this.springGeo = G.makeMainspring({
      innerR: 0.0044,
      outerR: 0.0186,
      width: 0.0072,
      thickness: 0.0004,
      turnsMin: 2.4,
      turnsMax: 5.6,
      samples: 260,
    });
    const springMesh = new THREE.Mesh(this.springGeo, this.mats.spring);
    springMesh.rotation.x = Math.PI / 2;
    springMesh.castShadow = false;
    springMesh.receiveShadow = false;
    barrel.add(springMesh);
    this.springMesh = springMesh;

    // 香箱の歯車（外周）
    const barrelGear = G.gearGeometry({ teeth: 44, module: 0.00098, thickness: 0.0022, bore: 0.0198, hub: 0 });
    mesh(barrelGear, this.mats.brass, { parent: barrel, pos: [0, 0, 0.0056], rot: [Math.PI / 2, 0, 0], cast: false });

    /* --- 歯車の列 -----------------------------------------------
       香箱(44) → 二番車のかな(12) / 二番車(38) → 三番車のかな(10)
                → 三番車(34) → がんぎ車のかな(9)
       かみ合う相手どうしは必ず同じ奥行き（Z）に置く。            */
    const MOD = 0.00098;
    const P = (t) => (t * MOD) / 2;
    const polar = (from, dist, deg) =>
      new THREE.Vector2(
        from.x + Math.cos(deg * (Math.PI / 180)) * dist,
        from.y + Math.sin(deg * (Math.PI / 180)) * dist,
      );

    const posBarrel = new THREE.Vector2(-0.0160, -0.0040);
    const posSecond = polar(posBarrel, P(44) + P(12), 40);
    const posThird = polar(posSecond, P(38) + P(10), -50);
    const posEscape = polar(posThird, P(34) + P(9), 60);
    this.trainPos = { posBarrel, posSecond, posThird, posEscape };

    // 歯車が並ぶ 4 つの奥行き
    const zA = -0.0050; // 香箱の歯 + 二番のかな
    const zB = 0.0006;  // 二番の大歯車 + 三番のかな
    const zC = 0.0056;  // 三番の大歯車 + がんぎのかな
    this.zEsc = 0.0092; // がんぎ車・アンクル・てんぷ

    barrel.position.set(posBarrel.x, posBarrel.y, 0);
    mesh(
      G.gearGeometry({ teeth: 44, module: MOD, thickness: 0.0020, bore: 0.0198, hub: 0 }),
      this.mats.brass,
      { parent: barrel, pos: [0, 0, zA], rot: [Math.PI / 2, 0, 0], cast: false },
    );

    /** 1 本の軸に、大小の歯車をまとめて生やす */
    const makeShaft = (pos, defs) => {
      const gp = group({ parent: m, pos: [pos.x, pos.y, 0] });
      for (const d of defs) {
        mesh(
          G.gearGeometry({
            teeth: d.teeth,
            module: MOD,
            thickness: d.thickness ?? 0.0016,
            bore: 0.0011,
            hub: d.hub ?? 0.0026,
            hubHeight: 0.0009,
            spokes: d.spokes ?? 0,
          }),
          d.mat,
          { parent: gp, pos: [0, 0, d.z], rot: [Math.PI / 2, 0, 0], cast: false },
        );
      }
      const axle = mesh(G.chamferedCylinder(0.0010, 0.0230, 0.0002, 12), this.mats.steel, {
        parent: gp, pos: [0, 0, 0.0010], cast: false,
      });
      axle.rotation.x = Math.PI / 2;
      return gp;
    };

    this.secondWheel = makeShaft(posSecond, [
      { teeth: 12, z: zA, mat: this.mats.steel, thickness: 0.0020 },
      { teeth: 38, z: zB, mat: this.mats.brass, spokes: 4 },
    ]);
    this.thirdWheel = makeShaft(posThird, [
      { teeth: 10, z: zB, mat: this.mats.steel, thickness: 0.0020 },
      { teeth: 34, z: zC, mat: this.mats.brass, spokes: 4 },
    ]);

    this.addGuts(m);
  }

  /* --- 脱進機（がんぎ車・アンクル・てんぷ） ---------------------------- */

  _buildEscapement() {
    const m = this.movement;
    const { posEscape } = this.trainPos;
    const zEsc = this.zEsc;

    // がんぎ車（と、三番車とかみ合うかな）
    const esc = group({ parent: m, pos: [posEscape.x, posEscape.y, 0] });
    this.escapeWheel = esc;
    mesh(G.escapeWheelGeometry({ teeth: 15, radius: 0.0118, thickness: 0.0013, bore: 0.0010 }), this.mats.steel, {
      parent: esc, pos: [0, 0, zEsc], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    mesh(
      G.gearGeometry({ teeth: 9, module: 0.00098, thickness: 0.0018, bore: 0.0010, hub: 0.0020, hubHeight: 0.0008 }),
      this.mats.steel,
      { parent: esc, pos: [0, 0, 0.0056], rot: [Math.PI / 2, 0, 0], cast: false },
    );
    const escAxle = mesh(G.chamferedCylinder(0.0009, 0.0180, 0.0002, 12), this.mats.steel, {
      parent: esc, pos: [0, 0, 0.0060], cast: false,
    });
    escAxle.rotation.x = Math.PI / 2;

    // アンクル（がんぎ車と てんぷ の間を行き来する）
    const forkPivot = new THREE.Vector2(posEscape.x + 0.0028, posEscape.y - 0.0182);
    const balPos = new THREE.Vector2(posEscape.x - 0.0122, posEscape.y - 0.0330);

    const fork = group({ parent: m, pos: [forkPivot.x, forkPivot.y, zEsc] });
    this.fork = fork;
    // +Y ローカルが がんぎ車を向くように、基準の角度を決めておく
    const toEsc = new THREE.Vector2(posEscape.x - forkPivot.x, posEscape.y - forkPivot.y).normalize();
    this.forkBase = Math.atan2(-toEsc.x, toEsc.y);

    const forkShape = [
      new THREE.Vector2(-0.0022, -0.0042),
      new THREE.Vector2(0.0022, -0.0042),
      new THREE.Vector2(0.0056, 0.0120),
      new THREE.Vector2(0.0020, 0.0144),
      new THREE.Vector2(0.0004, 0.0106),
      new THREE.Vector2(-0.0020, 0.0144),
      new THREE.Vector2(-0.0056, 0.0120),
    ];
    mesh(G.extrudeOutline(forkShape, [], 0.0012, { corner: 0.0009, bevel: 0.0003 }), this.mats.blued, {
      parent: fork, cast: false,
    });
    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0015, 0.0030, 0.0013, 2, 0.0004), this.mats.ruby, {
        parent: fork, pos: [sx * 0.0040, 0.0118, 0], rot: [0, 0, sx * 0.34], cast: false,
      });
    }
    // てんぷ側へ伸びる尾
    mesh(new G.RoundedBoxGeometry(0.0090, 0.0020, 0.0012, 2, 0.0006), this.mats.blued, {
      parent: fork, pos: [0, -0.0072, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });

    // てんぷ（振れる輪）+ ひげぜんまい
    const bal = group({ parent: m, pos: [balPos.x, balPos.y, zEsc] });
    this.balance = bal;

    mesh(G.ring(0.0132, 0.0110, 0.0016, 44), this.mats.brassBright, {
      parent: bal, rot: [Math.PI / 2, 0, 0], cast: false,
    });
    for (let i = 0; i < 2; i++) {
      mesh(new G.RoundedBoxGeometry(0.0252, 0.0020, 0.0015, 2, 0.0006), this.mats.brassBright, {
        parent: bal, rot: [0, 0, (i / 2) * Math.PI + 0.4], cast: false,
      });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.5;
      mesh(G.chamferedCylinder(0.0011, 0.0026, 0.0003, 10), this.mats.steel, {
        parent: bal, pos: [Math.cos(a) * 0.0121, Math.sin(a) * 0.0121, 0], rot: [Math.PI / 2, 0, 0], cast: false,
      });
    }
    // 振り座（アンクルを叩くつめ）
    mesh(G.chamferedCylinder(0.0026, 0.0014, 0.0003, 14), this.mats.steel, {
      parent: bal, pos: [0, 0, 0.0020], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    mesh(new G.RoundedBoxGeometry(0.0013, 0.0028, 0.0011, 2, 0.0004), this.mats.ruby, {
      parent: bal, pos: [0, 0.0032, 0.0020], cast: false,
    });

    this.hairspringGeo = G.makeMainspring({
      innerR: 0.0018,
      outerR: 0.0100,
      width: 0.0015,
      thickness: 0.00016,
      turnsMin: 3.4,
      turnsMax: 4.4,
      samples: 150,
    });
    const hair = new THREE.Mesh(this.hairspringGeo, this.mats.spring);
    hair.rotation.x = Math.PI / 2;
    hair.position.z = 0.0052;
    hair.castShadow = false;
    hair.receiveShadow = false;
    bal.add(hair);
    this.hairspring = hair;

    // てんぷ受け（橋）
    const bridge = G.extrudeOutline(
      [
        new THREE.Vector2(-0.0055, -0.0050),
        new THREE.Vector2(0.0055, -0.0050),
        new THREE.Vector2(0.0165, 0.0080),
        new THREE.Vector2(0.0055, 0.0126),
        new THREE.Vector2(-0.0055, 0.0090),
      ],
      [],
      0.0015,
      { corner: 0.0028, bevel: 0.0004 },
    );
    mesh(bridge, this.mats.plate, { parent: m, pos: [balPos.x, balPos.y, zEsc + 0.0072], rot: [0, 0, 2.1], cast: false });

    // つかんで時間を止める
    hitCylinder(bal, 0.017, 0.016, [0, 0, 0.002], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'balance',
      label: 'てんぷ',
      type: 'grab',
      object: bal,
      hint: { kind: 'hold', offset: [0, 0, 0.016], size: 0.012 },
      onGrab: () => {
        this.balanceHeld = true;
        this.audio.tick({ gain: 0.3, pitch: 0.7 });
      },
      onRelease: () => {
        this.balanceHeld = false;
      },
    });
  }

  /* --- 針 ------------------------------------------------------------- */

  _buildHands() {
    const hands = group({ pos: [0, 0.070, DIAL_Z - 0.0006] });
    this.handsGroup = hands;
    this.root.add(hands);

    const makeHand = (len, w, tail, mat, z) => {
      const g = group({ parent: hands, pos: [0, 0, z] });
      const pts = [
        new THREE.Vector2(-w * 0.75, -tail),
        new THREE.Vector2(w * 0.75, -tail),
        new THREE.Vector2(w * 0.45, len * 0.82),
        new THREE.Vector2(0, len),
        new THREE.Vector2(-w * 0.45, len * 0.82),
      ];
      mesh(G.extrudeOutline(pts, [], 0.0012, { corner: 0.0008, bevel: 0.0003 }), mat, {
        parent: g, cast: false,
      });
      return g;
    };

    this.hourHand = makeHand(0.0250, 0.0042, 0.0060, this.mats.handHour, 0.0000);
    this.minuteHand = makeHand(0.0370, 0.0032, 0.0070, this.mats.handMin, 0.0018);
    this.secondHand = makeHand(0.0400, 0.0014, 0.0110, this.mats.handSec, 0.0034);

    // 中心のキャップ
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0034, 0],
          [0.0032, 0.0018],
          [0.0018, 0.0028],
          [0, 0.0030],
        ],
        { segments: 20, center: false },
      ),
      this.mats.brassBright,
      { parent: hands, pos: [0, 0, 0.0044], rot: [-Math.PI / 2, 0, 0], cast: false },
    );

    // 針をつかんで時刻あわせ
    hitCylinder(hands, 0.020, 0.014, [0, 0, 0.003], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'hands',
      label: 'はり',
      type: 'rotate',
      object: hands,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: new THREE.Vector3(0, 0.070, DIAL_Z),
      gain: 1,
      onRotate: (d) => {
        // 時計まわりに引っぱると時間が進む
        this.clockTime -= (d / TAU) * 3600;
      },
    });
  }

  /* --- ベル ----------------------------------------------------------- */

  _buildBells() {
    const g = group({ name: 'bells', pos: [0, 0.070, 0] });

    const bellGeo = G.lathe(
      [
        [0, 0.0190],
        [0.0086, 0.0182],
        [0.0148, 0.0140],
        [0.0186, 0.0068],
        [0.0196, 0.0000],
        [0.0186, -0.0010],
        [0.0176, 0.0060],
        [0.0138, 0.0128],
        [0.0080, 0.0168],
        [0, 0.0176],
      ],
      { segments: 40, center: false },
    );
    for (const sx of [-1, 1]) {
      const b = mesh(bellGeo, this.mats.bell, { parent: g, pos: [sx * 0.0345, 0.0470, 0] });
      b.rotation.z = sx * 0.32;
      // ベルを留めるねじ
      mesh(G.screw({ headR: 0.0028, headH: 0.0014, shaftR: 0.0012, shaftLen: 0.003 }), this.mats.foot, {
        parent: g, pos: [sx * 0.0345, 0.0648, 0], cast: false,
      });
    }

    // ハンマー（guts 側。ベルの間を叩く）
    const hammer = group({ pos: [0, 0.070 + 0.0455, 0] });
    this.hammerGroup = hammer;
    this.root.add(hammer);
    const armGeo = G.chamferedCylinder(0.0013, 0.0230, 0.0003, 10);
    const arm = mesh(armGeo, this.mats.steel, { parent: hammer, pos: [0, -0.0110, 0], cast: false });
    void arm;
    mesh(new THREE.SphereGeometry(0.0042, 14, 12), this.mats.brassBright, {
      parent: hammer, pos: [0, 0.0034, 0], cast: false,
    });

    this.addShell(g);

    /* --- ベルのボタン --- */
    const btn = group({ pos: [0, 0.070 + 0.0530, -0.004] });
    this.root.add(btn);
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0086, 0],
          [0.0092, 0.0022],
          [0.0092, 0.0058],
          [0.0074, 0.0074],
          [0, 0.0078],
        ],
        { segments: 26, center: false },
      ),
      this.mats.button,
      { parent: btn },
    );
    this.bellButton = btn;
    hitSphere(btn, 0.013, [0, 0.004, 0]);
    this.handle({
      id: 'bell',
      label: 'ベル',
      type: 'press',
      object: btn,
      hint: { kind: 'push', offset: [0, 0.026, 0], size: 0.013, axis: new THREE.Vector3(0, 1, 0) },
      onPress: () => {
        this.alarmTimer = 2.6;
        this._btnPress = 1;
        this.audio.click({ gain: 0.4, bright: 2600 });
      },
    });
  }

  /* --- 巻きあげのかぎ -------------------------------------------------- */

  _buildKey() {
    const key = group({ pos: [-0.0160, 0.070 - 0.0040, 0.0280] });
    this.root.add(key);
    this.keyGroup = key;

    // 角軸
    mesh(G.chamferedCylinder(0.0030, 0.0220, 0.0004, 14), this.mats.keyBrass, {
      parent: key, pos: [0, 0, -0.0090], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    // ちょうちょ形のつまみ
    const wing = [
      new THREE.Vector2(-0.0038, -0.0042),
      new THREE.Vector2(0.0038, -0.0042),
      new THREE.Vector2(0.0148, -0.0110),
      new THREE.Vector2(0.0168, -0.0012),
      new THREE.Vector2(0.0118, 0.0056),
      new THREE.Vector2(0.0038, 0.0042),
      new THREE.Vector2(-0.0038, 0.0042),
      new THREE.Vector2(-0.0118, 0.0056),
      new THREE.Vector2(-0.0168, -0.0012),
      new THREE.Vector2(-0.0148, -0.0110),
    ];
    mesh(G.extrudeOutline(wing, [], 0.0028, { corner: 0.0032, bevel: 0.0006 }), this.mats.keyBrass, {
      parent: key, pos: [0, 0, 0.0042],
    });

    hitSphere(key, 0.019, [0, 0, 0.005]);
    this.handle({
      id: 'key',
      label: 'ねじまき',
      type: 'rotate',
      object: key,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: key,
      primary: true,
      hint: { kind: 'spin', offset: [0, 0, 0.028], size: 0.015 },
      onRotate: (d) => {
        // 巻ける向きは片方だけ（ラチェット）
        if (d < 0) {
          this.tension = clamp01(this.tension - d * 0.085);
          this._windClicks += -d * 5.2;
          if (this._windClicks > 1) {
            this._windClicks = 0;
            this.audio.tick({ gain: 0.24, pitch: 1.7 });
          }
        }
        this.keyAngle = (this.keyAngle || 0) + Math.min(d, 0);
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  step(dt) {
    // 巻きの残りが てんぷ の振れを決める
    const drive = smoothstep(0.0, 0.16, this.tension);
    const target = this.balanceHeld ? 0 : drive;
    this.amplitude = damp(this.amplitude, target, this.balanceHeld ? 22 : 2.2, dt);

    const running = this.amplitude > 0.06;
    if (running) {
      const prev = this.balancePhase;
      this.balancePhase += BEAT_HZ * dt * (0.85 + this.amplitude * 0.15);
      // 半周期ごとに 1 拍（がんぎ車が 1 歯すすむ）
      const beats = Math.floor(this.balancePhase * 2) - Math.floor(prev * 2);
      if (beats > 0) {
        this.beatCount += beats;
        this._pendingTicks = (this._pendingTicks || 0) + beats;
      }
      // 動いているぶんだけ時間がすすみ、ぜんまいがほどける
      this.clockTime += dt * TIME_SCALE * this.amplitude;
      this.tension = clamp01(this.tension - dt * 0.0125 * this.amplitude);
    }

    // ベル
    if (this.alarmTimer > 0) {
      this.alarmTimer -= dt;
      this.hammerPhase += dt * 26;
      this.tension = clamp01(this.tension - dt * 0.02);
    }
  }

  lateUpdate(dt) {
    // てんぷ: 位相 → 角度（振れ幅は残りの巻きで決まる）
    const swing = Math.sin(this.balancePhase * TAU) * this.amplitude * 1.15 * Math.PI;
    this.balance.rotation.z = swing;
    // ひげぜんまいは、てんぷと一緒に伸び縮みする
    const hairT = 0.5 + Math.sin(this.balancePhase * TAU) * this.amplitude * 0.42;
    if (Math.abs(hairT - (this._lastHair ?? -1)) > 0.01) {
      this._lastHair = hairT;
      this.hairspringGeo.userData.update(hairT);
    }

    // アンクル: てんぷに叩かれて、カチッと切り替わる
    const forkSide = Math.sin(this.balancePhase * TAU) > 0 ? 1 : -1;
    this._forkAngle = damp(this._forkAngle ?? 0, forkSide * 0.20 * clamp01(this.amplitude * 3), 30, dt);
    this.fork.rotation.z = this.forkBase + this._forkAngle;

    // がんぎ車: 1 拍ごとに 1 歯すすむ
    const escStep = TAU / 15;
    this._escTarget = -this.beatCount * (escStep / 2);
    this._escAngle = damp(this._escAngle ?? 0, this._escTarget, 26, dt);
    this.escapeWheel.rotation.z = this._escAngle;

    // 歯車列（がんぎ車から逆算した見た目の回転）
    const escTurns = this._escAngle / TAU;
    this.thirdWheel.rotation.z = -escTurns * (9 / 34);
    this.secondWheel.rotation.z = escTurns * (9 / 34) * (10 / 38);
    this.barrelGroup.rotation.z = -escTurns * (9 / 34) * (10 / 38) * (12 / 44);

    // ぜんまいの巻き具合
    if (Math.abs(this.tension - this._lastSpringTension) > 0.004) {
      this._lastSpringTension = this.tension;
      this.springGeo.userData.update(this.tension);
    }

    // 針
    const t = this.clockTime;
    this.secondHand.rotation.z = -((t % 60) / 60) * TAU;
    this.minuteHand.rotation.z = -((t % 3600) / 3600) * TAU;
    this.hourHand.rotation.z = -((t % 43200) / 43200) * TAU;

    // かぎ
    if (this.keyGroup) this.keyGroup.rotation.z = this.keyAngle || 0;

    // ハンマー
    const ringing = this.alarmTimer > 0;
    const hammerSwing = ringing ? Math.sin(this.hammerPhase) * 0.42 : 0;
    this.hammerGroup.rotation.z = damp(this.hammerGroup.rotation.z, hammerSwing, 30, dt);
    this.bellButton.position.y = 0.070 + 0.0530 - (this._btnPress = damp(this._btnPress, 0, 9, dt)) * 0.0026;

    this._updateSound(dt);
  }

  _updateSound(dt) {
    // チクタク
    const ticks = this._pendingTicks || 0;
    if (ticks > 0) {
      this._pendingTicks = 0;
      const strong = this.beatCount % 2 === 0;
      this.audio.tick({ gain: 0.10 + this.amplitude * 0.16, pitch: strong ? 1.0 : 1.28 });
    }
    // ベル
    if (this.alarmTimer > 0) {
      this._bellTimer = (this._bellTimer || 0) - dt;
      if (this._bellTimer <= 0) {
        this._bellTimer = 0.085;
        this.audio.bell(1180 + Math.random() * 90, { gain: 0.16, decay: 0.55 });
      }
    }
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'wind', icon: 'spring', label: 'ぜんまい', value: this.tension, color: '#e0a13a' },
      { id: 'run', icon: 'clockFace', label: 'うごき', value: this.amplitude, color: '#7cc4a8' },
    ];
  }

  reset() {
    this.tension = 0.55;
    this.clockTime = 10 * 3600 + 8 * 60 + 20;
    this.balancePhase = 0;
    this.amplitude = 0;
    this.beatCount = 0;
    this.alarmTimer = 0;
    this.keyAngle = 0;
    this._escAngle = 0;
    this.balanceHeld = false;
  }
}

/* ------------------------------------------------------------------ */

function circlePts(r, steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

/** 地板の肉抜き穴（機械らしい表情をつくる） */
function circleHoles() {
  const holes = [];
  for (const [cx, cy, r] of [
    [0.0000, 0.0300, 0.0068],
    [-0.0290, 0.0180, 0.0058],
    [0.0300, -0.0170, 0.0062],
    [0.0060, -0.0320, 0.0054],
  ]) {
    const ring = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      ring.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    holes.push(ring);
  }
  return holes;
}
