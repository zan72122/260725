/**
 * sewing.js — ミシン
 *
 * 「まわる」が「上下」に変わり、それが「ぬう」になるまでを見せる機械。
 *
 *   はずみ車 → 上の軸 → クランク → はりぼう（上下）
 *                     → 天びん（糸を引きあげる）
 *            → ベルト → 下の軸 → かま（はりの 2ばい で まわり、糸の わ を すくう）
 *                              → おくり歯（ぬのを すこしずつ 送る）
 *
 * さわりどころ:
 *   - はずみ車をまわすと、はりが上下し、ぬのが進み、ぬい目ができていく
 *   - はりを指で押さえると、すべて止まる
 *   - おさえを上げると、おくり歯が ぬのを つかめなくなり、進まなくなる
 *   - つまみをまわすと、ぬい目のあいだが 広がったり せまくなったりする
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh, stretchBetween } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { fabricNormal } from '../lib/textures.js';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../lib/math.js';

const DEG = Math.PI / 180;

const BED_Y = 0.0155;      // 針板の高さ
const ARM_Y = 0.0810;      // 上の軸の高さ
const HEAD_X = -0.0480;    // はりの位置
const LOWER_Y = 0.0060;    // 下の軸
const STITCH_MAX = 28;

export class Sewing extends Machine {
  static meta = {
    id: 'sewing',
    name: 'ミシン',
    sub: 'まわると ぬえる',
    accent: 0x4f7fbf,
    backdrop: {
      top: '#f5f8fd',
      middle: '#e6ecf6',
      bottom: '#c9d4e4',
      glow: '#e2ecff',
      glowStrength: 0.14,
    },
    bloom: { strength: 0.26, radius: 0.5, threshold: 1.1 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M8 30h32v6a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3v-6Z" fill="#7fa6d8" stroke="#2f4d7a" stroke-width="2.2"/>
      <path d="M30 8h8a3 3 0 0 1 3 3v19h-8V13H14v-5h16Z" fill="#9fc0e8" stroke="#2f4d7a" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M15 13v11" stroke="#2f4d7a" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M15 24v6" stroke="#e0553f" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="41" cy="20" r="4.6" fill="#f2c04f" stroke="#2f4d7a" stroke-width="2"/>
      <path d="M10 34h6M20 34h6M30 34h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.angle = 0;
    this.omega = 0;
    this.stitchLen = 0.5;    // つまみ 0..1 → 0.0016..0.0058 m
    this.travel = 0;         // ぬのが進んだ距離
    this.footUp = 0;         // おさえ 0（下）..1（上）
    this.footTarget = 0;
    this.held = false;
    this.driving = false;
    this._driveTimer = 0;
    this._lastRev = 0;
    this._stitchCursor = 0;

    this.radius = 0.098;
    this.center = new THREE.Vector3(-0.004, 0.050, 0.002);
    this.footprint = { w: 0.16, d: 0.075, opacity: 0.34 };

    this.root.rotation.y = -14 * DEG;

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.18, -0.30, -1.0),
      center: this.center,
      span: 0.120,
      noiseScale: 12,
    });

    this.mats = {
      body: M.shell('paint', { color: 0x9fc0e8, roughness: 0.26 }),
      bodyDeep: M.shell('paint', { color: 0x2f4d7a, roughness: 0.32 }),
      bed: M.shell('steel', { color: 0xdfe6ec, roughness: 0.24, brushed: 'linear' }),

      base: M.part('wood', { seed: 21, light: '#c8a273', dark: '#8d6539' }),
      shaft: M.part('steel', { color: 0xdde3e9, roughness: 0.16 }),
      crank: M.part('brass', { color: 0xe0b055 }),
      rod: M.part('coated', { color: 0xa7b3c0, roughness: 0.36 }),
      needleBar: M.part('steel', { color: 0xe4e9ee, roughness: 0.12 }),
      needle: M.part('steel', { color: 0xf0f4f8, roughness: 0.08 }),
      hook: M.part('steel', { color: 0xcfd8e0, roughness: 0.18 }),
      feed: M.part('coated', { color: 0x8b96a2, roughness: 0.4 }),
      belt: M.part('rubber', { color: 0x2f3237 }),
      wheel: M.part('paint', { color: 0x2f4d7a, clearcoat: 0.9, roughness: 0.24 }),
      knob: M.part('softPlastic', { color: 0xf2c04f }),
      dial: M.part('knurled', { color: 0xd8dee5, metalness: 0.6, repeat: 3 }),
      spoolThread: M.part('plastic', { color: 0xe0553f, roughness: 0.5 }),
      thread: M.part('plastic', { color: 0xe0553f, roughness: 0.55 }),
      cloth: M.part('fabric', { color: 0xe8a9b8 }),
      stitch: M.part('plastic', { color: 0xc74a36, roughness: 0.5 }),
      presser: M.part('steel', { color: 0xd6dde4, roughness: 0.2 }),
    };

    this._buildFrame();
    this._buildUpperShaft();
    this._buildNeedle();
    this._buildLower();
    this._buildCloth();
    this._buildThread();
    this._buildWheel();
    this._buildDial();

    this.setXray(0);
  }

  /* --- 外装 ------------------------------------------------------------ */

  _buildFrame() {
    const g = group({ name: 'frame' });

    // 木の台
    mesh(new G.RoundedBoxGeometry(0.168, 0.0120, 0.078, 4, 0.0044), this.mats.base, {
      parent: g, pos: [0, 0.0060, 0],
    });

    // ベッド（針板のある平らな部分）
    mesh(new G.RoundedBoxGeometry(0.150, 0.0130, 0.062, 4, 0.0050), this.mats.body, {
      parent: g, pos: [-0.004, 0.0122 + 0.0065, 0],
    });
    mesh(G.roundedPlate(0.062, 0.056, 0.0018, 0.005, { bevel: 0.0004 }), this.mats.bed, {
      parent: g, pos: [-0.040, BED_Y + 0.0002, 0], rot: [Math.PI / 2, 0, 0],
    });

    // 右の柱
    mesh(new G.RoundedBoxGeometry(0.034, 0.078, 0.050, 4, 0.0090), this.mats.body, {
      parent: g, pos: [0.052, BED_Y + 0.0390, 0],
    });
    // 上のアーム
    mesh(new G.RoundedBoxGeometry(0.108, 0.026, 0.032, 4, 0.0090), this.mats.body, {
      parent: g, pos: [-0.004, ARM_Y, 0],
    });
    // ヘッド（はりのある左端）
    mesh(new G.RoundedBoxGeometry(0.030, 0.048, 0.034, 4, 0.0080), this.mats.body, {
      parent: g, pos: [HEAD_X, ARM_Y - 0.0130, 0],
    });
    // 帯のアクセント
    mesh(new G.RoundedBoxGeometry(0.110, 0.0060, 0.0336, 3, 0.0026), this.mats.bodyDeep, {
      parent: g, pos: [-0.004, ARM_Y + 0.0122, 0], cast: false,
    });

    this.addShell(g);
  }

  /* --- 上の軸まわり ---------------------------------------------------- */

  _buildUpperShaft() {
    const s = group({ name: 'upper', pos: [0, ARM_Y, 0] });
    this.upperShaft = s;

    const axle = mesh(G.chamferedCylinder(0.0030, 0.128, 0.0004, 16), this.mats.shaft, {
      parent: s, pos: [0.006, 0, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });
    void axle;

    // はりぼう を動かすクランク
    const crankDisc = mesh(G.chamferedCylinder(0.0090, 0.0044, 0.0006, 26), this.mats.crank, {
      parent: s, pos: [HEAD_X, 0, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });
    void crankDisc;
    const pin = group({ parent: s, pos: [HEAD_X, 0, 0] });
    this.needleCrank = pin;
    mesh(G.chamferedCylinder(0.0016, 0.0060, 0.0003, 12), this.mats.shaft, {
      parent: pin, pos: [0.0034, 0.0062, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });

    // 天びん（糸を引きあげるレバー）のクランク
    const takeUpPivot = new THREE.Vector3(HEAD_X + 0.0030, ARM_Y + 0.0040, 0.0140);
    this.takeUpPivot = takeUpPivot;
    const lever = group({ pos: takeUpPivot.toArray() });
    this.takeUpLever = lever;
    this.root.add(lever);
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0034, -0.0030),
          new THREE.Vector2(0.0180, -0.0022),
          new THREE.Vector2(0.0180, 0.0022),
          new THREE.Vector2(-0.0034, 0.0030),
        ],
        [],
        0.0018,
        { corner: 0.0022, bevel: 0.0004 },
      ),
      this.mats.rod,
      { parent: lever, cast: false },
    );
    mesh(G.ring(0.0034, 0.0016, 0.0018, 16), this.mats.crank, {
      parent: lever, pos: [0.0180, 0, 0], cast: false,
    });

    this.addGuts(s);
  }

  /* --- はりぼうと はり ------------------------------------------------- */

  _buildNeedle() {
    const bar = group({ pos: [HEAD_X, 0, 0] });
    this.root.add(bar);
    this.needleBarGroup = bar;

    mesh(G.chamferedCylinder(0.0028, 0.0340, 0.0004, 16), this.mats.needleBar, {
      parent: bar, pos: [0, 0, 0], cast: false,
    });
    // はりを留める金具
    mesh(new G.RoundedBoxGeometry(0.0068, 0.0060, 0.0060, 2, 0.0012), this.mats.rod, {
      parent: bar, pos: [0, -0.0180, 0], cast: false,
    });
    // はり
    mesh(
      G.lathe(
        [
          [0.0011, 0],
          [0.0011, 0.0110],
          [0.0006, 0.0128],
          [0, 0.0132],
        ],
        { segments: 14, center: false },
      ),
      this.mats.needle,
      { parent: bar, pos: [0, -0.0210, 0], rot: [Math.PI, 0, 0], cast: false },
    );

    // 連接棒（クランクピン ↔ はりぼう）
    const rodGeo = G.chamferedCylinder(0.0018, 1.0, 0.0002, 12);
    this.needleRod = mesh(rodGeo, this.mats.rod, { parent: this.root, cast: false });

    // おさえ（ぬのを押さえる足）
    const foot = group({ pos: [HEAD_X, 0, 0] });
    this.root.add(foot);
    this.presserFoot = foot;
    mesh(G.chamferedCylinder(0.0020, 0.0300, 0.0003, 12), this.mats.presser, {
      parent: foot, pos: [0, 0.0080, -0.0090], cast: false,
    });
    mesh(new G.RoundedBoxGeometry(0.0130, 0.0028, 0.0090, 2, 0.0010), this.mats.presser, {
      parent: foot, pos: [0.0016, -0.0074, -0.0060], cast: false,
    });
    mesh(new G.RoundedBoxGeometry(0.0044, 0.0032, 0.0130, 2, 0.0010), this.mats.presser, {
      parent: foot, pos: [0, -0.0074, 0], cast: false,
    });

    hitProxy(bar, new THREE.BoxGeometry(0.014, 0.044, 0.014), { pos: [0, -0.006, 0] });
    this.handle({
      id: 'needle',
      label: 'はり',
      type: 'grab',
      object: bar,
      hint: { kind: 'hold', offset: [0, 0.004, 0.020], size: 0.011 },
      onGrab: () => {
        this.held = true;
        if (Math.abs(this.omega) > 2) this.audio.click({ gain: 0.34, bright: 800 });
      },
      onRelease: () => {
        this.held = false;
      },
    });

    hitProxy(foot, new THREE.BoxGeometry(0.020, 0.020, 0.024), { pos: [0, -0.004, -0.004] });
    this.handle({
      id: 'presser',
      label: 'おさえ',
      type: 'slide',
      object: foot,
      axis: new THREE.Vector3(0, 1, 0),
      hint: { kind: 'pull', offset: [0.014, 0.014, 0], size: 0.011, axis: new THREE.Vector3(0, 1, 0) },
      getValue: () => this.footUp,
      onSlide: (delta, ctx) => {
        this.footTarget = clamp01(ctx.value0 + delta / 0.012);
      },
      onTap: () => {
        this.footTarget = this.footUp > 0.5 ? 0 : 1;
      },
    });
  }

  /* --- 下の軸・かま・おくり歯 ------------------------------------------ */

  _buildLower() {
    const g = group({ name: 'lower' });

    // ベルト車（上と下）
    const pulley = (y, r) => {
      const p = group({ parent: g, pos: [0.0520, y, 0] });
      mesh(G.pipe(r, r * 0.30, 0.0060, { segments: 26, chamfer: 0.0006 }), this.mats.crank, {
        parent: p, rot: [0, 0, Math.PI / 2], cast: false,
      });
      return p;
    };
    this.pulleyTop = pulley(ARM_Y, 0.0110);
    this.pulleyBottom = pulley(LOWER_Y, 0.0110);

    // ベルト（2本の帯）
    for (const dz of [-0.0110, 0.0110]) {
      mesh(new G.RoundedBoxGeometry(0.0030, ARM_Y - LOWER_Y, 0.0044, 2, 0.0012), this.mats.belt, {
        parent: g, pos: [0.0520 + dz * 0, (ARM_Y + LOWER_Y) / 2, dz], cast: false,
      });
    }

    // 下の軸
    const lower = group({ parent: g, pos: [0, LOWER_Y, 0] });
    this.lowerShaft = lower;
    const axle = mesh(G.chamferedCylinder(0.0026, 0.120, 0.0004, 14), this.mats.shaft, {
      parent: lower, pos: [0.004, 0, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });
    void axle;

    // かま（はりの 2ばい で まわる）
    const hook = group({ parent: g, pos: [HEAD_X, LOWER_Y + 0.0016, 0] });
    this.hookGroup = hook;
    mesh(G.pipe(0.0092, 0.0064, 0.0052, { segments: 28, chamfer: 0.0005 }), this.mats.hook, {
      parent: hook, rot: [0, 0, Math.PI / 2], cast: false,
    });
    // くちばし（糸のわ を すくう突起）
    mesh(new G.RoundedBoxGeometry(0.0044, 0.0026, 0.0022, 2, 0.0006), this.mats.hook, {
      parent: hook, pos: [0, 0.0088, 0], rot: [0, 0, 0.5], cast: false,
    });
    // ボビン
    mesh(G.pipe(0.0052, 0.0014, 0.0044, { segments: 20, chamfer: 0.0004 }), this.mats.spoolThread, {
      parent: hook, rot: [0, 0, Math.PI / 2], cast: false,
    });
    // かま を まわす歯車
    mesh(
      G.gearGeometry({ teeth: 20, module: 0.0009, thickness: 0.0022, bore: 0.0014, hub: 0.0026, hubHeight: 0.0008 }),
      this.mats.crank,
      { parent: hook, pos: [0.0064, 0, 0], rot: [0, 0, Math.PI / 2], cast: false },
    );

    // おくり歯
    const feed = group({ pos: [HEAD_X, 0, 0] });
    this.root.add(feed);
    this.feedDog = feed;
    const barGeo = new G.RoundedBoxGeometry(0.0180, 0.0030, 0.0044, 2, 0.0008);
    mesh(barGeo, this.mats.feed, { parent: feed, pos: [0, 0, -0.0042], cast: false });
    mesh(barGeo.clone(), this.mats.feed, { parent: feed, pos: [0, 0, 0.0042], cast: false });
    for (let i = 0; i < 7; i++) {
      const x = -0.0072 + i * 0.0024;
      for (const dz of [-0.0042, 0.0042]) {
        mesh(new G.RoundedBoxGeometry(0.0012, 0.0026, 0.0040, 1, 0.0003), this.mats.feed, {
          parent: feed, pos: [x, 0.0026, dz], rot: [0, 0, -0.34], cast: false,
        });
      }
    }

    this.addGuts(g);
  }

  /* --- ぬの と ぬい目 --------------------------------------------------- */

  _buildCloth() {
    const c = group({ pos: [HEAD_X, BED_Y + 0.0018, 0] });
    this.root.add(c);
    this.clothGroup = c;

    const clothGeo = G.roundedPlate(0.145, 0.048, 0.0022, 0.004, { bevel: 0.0004 });
    const clothMat = this.mats.cloth;
    // 布目のテクスチャをスクロールさせて「ずっと流れている」ように見せる
    clothMat.normalMap = fabricNormal({ size: 256, pitch: 26, strength: 1.0 });
    clothMat.normalMap = clothMat.normalMap.clone();
    clothMat.normalMap.repeat.set(9, 3);
    clothMat.normalMap.needsUpdate = true;
    clothMat.normalScale = new THREE.Vector2(0.6, 0.6);
    this.clothNormal = clothMat.normalMap;

    const cloth = mesh(clothGeo, clothMat, { parent: c, pos: [0.030, 0, 0], rot: [Math.PI / 2, 0, 0] });
    cloth.castShadow = false;
    this.clothMesh = cloth;

    // ぬい目（プールして使いまわす）
    this.stitches = [];
    const stitchGeo = new G.RoundedBoxGeometry(0.0030, 0.0009, 0.0013, 1, 0.0004);
    for (let i = 0; i < STITCH_MAX; i++) {
      const m = new THREE.Mesh(stitchGeo, this.mats.stitch);
      m.castShadow = false;
      m.receiveShadow = false;
      m.visible = false;
      c.add(m);
      this.stitches.push({ mesh: m, at: 0, alive: false });
    }

    hitProxy(c, new THREE.BoxGeometry(0.10, 0.010, 0.040), { pos: [0.030, 0, 0] });
    this.handle({
      id: 'cloth',
      label: 'ぬの',
      type: 'slide',
      object: c,
      axis: new THREE.Vector3(1, 0, 0),
      getValue: () => this.travel,
      onSlide: (delta, ctx) => {
        this.travel = ctx.value0 + delta;
      },
    });
  }

  /* --- 糸 --------------------------------------------------------------- */

  _buildThread() {
    const g = group({ name: 'thread' });

    // 糸巻き（アームの上）
    const spool = group({ parent: g, pos: [0.0180, ARM_Y + 0.0180, 0] });
    mesh(G.chamferedCylinder(0.0016, 0.0220, 0.0003, 12), this.mats.shaft, {
      parent: spool, pos: [0, -0.0020, 0], cast: false,
    });
    mesh(
      G.lathe(
        [
          [0.0022, -0.0075],
          [0.0074, -0.0075],
          [0.0062, -0.0058],
          [0.0062, 0.0058],
          [0.0074, 0.0075],
          [0.0022, 0.0075],
        ],
        { segments: 24, center: false },
      ),
      this.mats.spoolThread,
      { parent: spool, cast: false },
    );
    this.spoolTop = new THREE.Vector3(0.0180, ARM_Y + 0.0245, 0);

    // 糸調子（ダイヤル）
    this.tensionPos = new THREE.Vector3(HEAD_X + 0.0180, ARM_Y + 0.0010, 0.0168);
    mesh(G.ring(0.0056, 0.0016, 0.0044, 20), this.mats.dial, {
      parent: g, pos: this.tensionPos.toArray(), rot: [Math.PI / 2, 0, Math.PI / 2], cast: false,
    });

    // 糸のみちすじ（4本の細い棒を毎フレーム張り直す）
    const seg = G.chamferedCylinder(0.00042, 1.0, 0.0001, 6);
    this.threadSegs = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(seg, this.mats.thread);
      m.castShadow = false;
      m.receiveShadow = false;
      g.add(m);
      this.threadSegs.push(m);
    }

    this.addGuts(g);
  }

  /* --- はずみ車 --------------------------------------------------------- */

  _buildWheel() {
    const w = group({ pos: [0.0730, ARM_Y, 0] });
    this.root.add(w);
    this.wheelGroup = w;

    const rim = mesh(
      G.lathe(
        [
          [0.0060, -0.0070],
          [0.0230, -0.0070],
          [0.0250, -0.0048],
          [0.0250, 0.0048],
          [0.0230, 0.0070],
          [0.0060, 0.0070],
          [0.0060, 0.0030],
          [0.0200, 0.0030],
          [0.0200, -0.0030],
          [0.0060, -0.0030],
        ],
        { segments: 40, center: false },
      ),
      this.mats.wheel,
      { parent: w },
    );
    rim.rotation.z = Math.PI / 2;

    // 握りのつまみ
    const knob = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0042, 0.0004],
          [0.0050, 0.0026],
          [0.0046, 0.0080],
          [0, 0.0086],
        ],
        { segments: 22, center: false },
      ),
      this.mats.knob,
      { parent: w, pos: [0.0080, 0, -0.0170] },
    );
    knob.rotation.z = -Math.PI / 2;

    hitCylinder(w, 0.028, 0.030, [0.004, 0, 0], [0, 0, Math.PI / 2]);
    this.handle({
      id: 'wheel',
      label: 'はずみぐるま',
      type: 'rotate',
      object: w,
      axisObject: this.root,
      axis: new THREE.Vector3(1, 0, 0),
      pivot: w,
      primary: true,
      hint: { kind: 'spin', axis: new THREE.Vector3(1, 0, 0), axisWorld: false, offset: [0.026, 0, 0], size: 0.028 },
      onRotate: (d, ctx) => {
        this.angle += d;
        this.omega = clamp(ctx.velocity, -34, 34);
        this.driving = true;
        this._driveTimer = 0.13;
      },
      onFling: (v) => {
        this.omega = clamp(v, -28, 28);
        this.driving = false;
      },
      onTap: () => {
        this.omega += 6 * (this.omega >= 0 ? 1 : -1);
      },
    });
  }

  /* --- ぬい目の長さつまみ ---------------------------------------------- */

  _buildDial() {
    const d = group({ pos: [0.0520, BED_Y + 0.0300, 0.0262] });
    this.root.add(d);

    mesh(G.ring(0.0116, 0.0064, 0.0026, 28), this.mats.bodyDeep, {
      parent: d, rot: [Math.PI / 2, 0, 0], cast: false,
    });
    const spin = group({ parent: d, pos: [0, 0, 0.0014] });
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0082, 0],
          [0.0090, 0.0022],
          [0.0090, 0.0052],
          [0.0074, 0.0066],
          [0, 0.0070],
        ],
        { segments: 28, center: false },
      ),
      this.mats.dial,
      { parent: spin, rot: [-Math.PI / 2, 0, 0] },
    );
    mesh(new G.RoundedBoxGeometry(0.0020, 0.0076, 0.0014, 1, 0.0005), this.mats.knob, {
      parent: spin, pos: [0, 0.0046, 0.0056], cast: false,
    });
    this.dialSpin = spin;

    hitSphere(d, 0.0140, [0, 0, 0.004]);
    this.handle({
      id: 'stitchDial',
      label: 'ぬいめの ながさ',
      type: 'rotate',
      object: d,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: d,
      gain: 0.6,
      hint: { kind: 'spin', offset: [0, 0, 0.024], size: 0.014 },
      onRotate: (delta) => {
        this.stitchLen = clamp01(this.stitchLen - delta * 0.28);
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  get stitchDistance() {
    return lerp(0.0016, 0.0058, this.stitchLen);
  }

  step(dt) {
    this._driveTimer = Math.max(0, this._driveTimer - dt);
    if (this._driveTimer === 0) this.driving = false;

    if (this.held) {
      this.omega = damp(this.omega, 0, 40, dt);
      if (Math.abs(this.omega) < 0.05) this.omega = 0;
    } else if (!this.driving) {
      this.omega -= Math.sign(this.omega) * Math.min(Math.abs(this.omega), 1.5 * dt);
      this.omega -= this.omega * 0.05 * Math.abs(this.omega) * dt;
      this.angle += this.omega * dt;
    }

    this.footUp = damp(this.footUp, this.footTarget, 12, dt);

    // おくり歯が上がっているあいだだけ、ぬのが進む
    const feedPhase = Math.sin(this.angle + 1.9);
    const engaged = feedPhase > 0 ? feedPhase : 0;
    const grip = engaged * (1 - this.footUp);
    const dAngle = this.omega * dt;
    this.travel += (dAngle / TAU) * this.stitchDistance * grip * 2.2;

    // はりが いちばん下を通ったら、ぬい目 が 1 つ できる
    const rev = Math.floor((this.angle + Math.PI) / TAU);
    if (rev !== this._lastRev) {
      const dir = rev > this._lastRev ? 1 : -1;
      this._lastRev = rev;
      if (dir > 0 && this.footUp < 0.6) this._addStitch();
      this._needlePunch = 1;
    }
  }

  _addStitch() {
    const s = this.stitches[this._stitchCursor];
    this._stitchCursor = (this._stitchCursor + 1) % this.stitches.length;
    s.at = this.travel;
    s.alive = true;
    s.mesh.visible = true;
    this.audio.tick({ gain: 0.12, pitch: 1.1 });
  }

  /* ---------------------------------------------------------------- */

  lateUpdate(dt) {
    const a = this.angle;

    this.wheelGroup.rotation.x = a;
    this.upperShaft.rotation.x = a;
    this.needleCrank.rotation.x = a;
    this.pulleyTop.rotation.x = a;
    this.pulleyBottom.rotation.x = a;
    this.lowerShaft.rotation.x = a;
    this.hookGroup.rotation.x = -a * 2;

    // はりぼう（スライダ・クランク）
    const crankR = 0.0062;
    const pinY = ARM_Y + Math.cos(a) * crankR;
    const pinZ = Math.sin(a) * crankR;
    const barY = ARM_Y - 0.0210 + Math.cos(a) * crankR * 1.0;
    this.needleBarGroup.position.y = barY;
    this._a.set(HEAD_X + 0.0034, pinY, pinZ);
    this._b.set(HEAD_X, barY + 0.0170, 0);
    stretchBetween(this.needleRod, this._a, this._b);

    // 天びん（糸を引きあげる）
    this.takeUpLever.rotation.x = Math.sin(a + 0.9) * 0.62;

    // おくり歯（上下 + 前後の だ円）
    const fx = -Math.cos(a + 1.9) * 0.0032;
    const fy = BED_Y - 0.0034 + Math.max(0, Math.sin(a + 1.9)) * 0.0042;
    this.feedDog.position.set(HEAD_X + fx, fy, 0);

    // おさえ
    this.presserFoot.position.y = BED_Y + 0.0062 + this.footUp * 0.0100;

    // ぬの（布目をスクロールさせて、流れているように見せる）
    this.clothNormal.offset.x = -this.travel * 26;

    // ぬい目
    for (const s of this.stitches) {
      if (!s.alive) continue;
      const x = this.travel - s.at;
      if (x > 0.070 || x < -0.020) {
        s.alive = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.set(x, 0.0014, 0);
    }

    // つまみ
    this.dialSpin.rotation.z = -this.stitchLen * 2.4 + 1.2;

    this._updateThread();
    this._updateSound(dt);
  }

  _updateThread() {
    // 糸巻き → 糸調子 → 天びんの穴 → はりの上 → はりの目
    const eye = this._a.set(0.0180, 0, 0);
    this.takeUpLever.localToWorld(eye);
    this.root.worldToLocal(eye);

    const pts = [
      this.spoolTop,
      this.tensionPos,
      eye.clone(),
      new THREE.Vector3(HEAD_X + 0.0010, this.needleBarGroup.position.y + 0.0060, 0.0060),
      new THREE.Vector3(HEAD_X, this.needleBarGroup.position.y - 0.0300, 0),
    ];
    for (let i = 0; i < this.threadSegs.length; i++) {
      stretchBetween(this.threadSegs[i], pts[i], pts[i + 1]);
    }
  }

  _updateSound(dt) {
    const speed = Math.abs(this.omega);
    const whir = this.audio.voice('sewWhir', { source: 'noise', filter: 'bandpass', freq: 500, Q: 3 });
    const spin = clamp01(speed / 16);
    whir.set({ level: spin * 0.10, freq: 380 + speed * 60, smooth: 0.06 });
    void dt;
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'speed', icon: 'gear', label: 'はやさ', value: clamp01(Math.abs(this.omega) / 16), color: '#4f7fbf' },
      { id: 'stitch', icon: 'spring', label: 'ぬいめ', value: this.stitchLen, color: '#c74a36' },
    ];
  }

  reset() {
    this.angle = 0;
    this.omega = 0;
    this.travel = 0;
    this.footTarget = 0;
    this.stitchLen = 0.5;
    this._lastRev = 0;
    for (const s of this.stitches) {
      s.alive = false;
      s.mesh.visible = false;
    }
  }
}
