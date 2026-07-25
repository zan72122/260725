/**
 * camera.js — カメラ
 *
 * 「1つの輪を まわすと、6枚の羽根が いっせいに 動いて 穴の 大きさが 変わる」
 * しくみ（しぼり / アイリス）を 見せる機械。
 *
 *   しぼりリング を まわす
 *     → 6枚の 羽根が それぞれ 自分の ピンを 中心に 同じだけ まわる
 *     → かさなり かたが 変わって、まん中の 穴が じわーっと 大きく／小さくなる
 *     → 通れる 光の 量が 変わる（穴の 面積ぶん）
 *
 *   シャッターボタンを おすと、
 *     ミラーが はね上がり → まくが 開いて → フィルムに 光が あたる → 閉じる。
 *   まきあげレバーを 引くと、フィルムが 1 こま 進み、ばねが たまる。
 *
 * さわりどころ:
 *   - しぼりリングを まわす（穴の 大きさが なめらかに 変わる）
 *   - ピントリングを まわすと レンズが 前後する
 *   - まきあげレバーを 引く → シャッターボタンが おせるようになる
 *   - 羽根を 1枚 指で つまむと、そこだけ 動かない
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, TAU } from '../lib/math.js';

const BODY_W = 0.0960;
const BODY_H = 0.0600;
const BODY_D = 0.0330;
const BODY_Y = 0.0300;
/** レンズの 中心 */
const LENS_X = 0.0080;
const LENS_Y = BODY_Y + 0.0020;
const LENS_Z = BODY_D / 2;
/** しぼりの 羽根 */
const BLADES = 6;
const PIVOT_R = 0.0150;
const TIP_R = 0.0128;
/** フィルム面 */
const FILM_Z = -BODY_D / 2 + 0.0030;

export class Camera extends Machine {
  static meta = {
    id: 'camera',
    name: 'カメラ',
    sub: 'はねが ひらく',
    accent: 0x4a5560,
    backdrop: {
      top: '#f2f5f8',
      middle: '#e2e8ee',
      bottom: '#c2ccd6',
      glow: '#e6eef6',
      glowStrength: 0.14,
    },
    bloom: { strength: 0.34, radius: 0.55, threshold: 0.95 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="4" y="14" width="40" height="24" rx="5" fill="#4a5560" stroke="#252b32" stroke-width="2.4"/>
      <path d="M16 14l3-5h10l3 5" fill="#4a5560" stroke="#252b32" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="24" cy="26" r="8.5" fill="#dfe7ee" stroke="#252b32" stroke-width="2.4"/>
      <circle cx="24" cy="26" r="4" fill="#7fc4e8" stroke="#252b32" stroke-width="2"/>
      <circle cx="37" cy="19" r="2" fill="#ffd45e"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.aperture = 0.72;   // 穴の 大きさ 0(閉) .. 1(開)
    this.focus = 0.5;
    this.wound = 1;         // まきあげ 0..1
    this.shutter = 0;       // まくの 開き 0..1
    this.mirror = 0;        // ミラーの はね上がり 0..1
    this.frame = 0;         // 何こま 撮ったか
    this.filmShift = 0;
    this._exposeT = -1;
    this.heldBlade = -1;

    this.radius = 0.078;
    this.center = new THREE.Vector3(0.002, BODY_Y + 0.004, 0.004);
    this.footprint = { w: 0.105, d: 0.062, opacity: 0.30 };

    // ３/４ 向きに 置く（レンズの 正面と、胴の 横が 同時に 見える）
    this.root.rotation.y = -0.42;
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.20, -0.30, -1.0),
      center: this.center,
      span: 0.095,
      noiseScale: 15,
    });

    this.mats = {
      body: M.shell('coated', { color: 0x4a5560, roughness: 0.44 }),
      grip: M.shell('knurled', { color: 0x2c333a }),
      top: M.shell('chrome', { color: 0xe4eaf0 }),
      barrel: M.shell('coated', { color: 0x39414a, roughness: 0.36 }),

      ring: M.part('knurled', { color: 0x8d959e }),
      blade: M.part('darkSteel', { color: 0x515c68, roughness: 0.26 }),
      bladePin: M.part('brass', { color: 0xd9a94e }),
      glass: M.part('glass', { color: 0xbfe4f5, opacity: 0.26 }),
      coat: M.part('emissive', { color: 0x7fc4e8, emissive: 0x2a6fa0, emissiveIntensity: 1.6 }),
      mirror: M.part('chrome', { color: 0xf0f6fa }),
      curtain: M.part('fabric', { color: 0x1e2228 }),
      film: M.part('plastic', { color: 0x6a4a2e, roughness: 0.42 }),
      filmEdge: M.part('plastic', { color: 0xc9a06a, roughness: 0.5 }),
      spool: M.part('steel', { color: 0xc6ced6, roughness: 0.22 }),
      gear: M.part('brass', { color: 0xe0b657 }),
      lever: M.part('chrome', { color: 0xdfe6ec }),
      button: M.part('paint', { color: 0xe0553f, clearcoat: 1.0, roughness: 0.18 }),
      light: M.part('lightBlob', { color: 0xfff0c0 }),
      plate: M.part('coated', { color: 0xb9c2cb, roughness: 0.40 }),
    };

    this._buildBody();
    this._buildLens();
    this._buildIris();
    this._buildBack();
    this._buildControls();

    this.setXray(0);
  }

  /* --- 胴 ---------------------------------------------------------------- */

  _buildBody() {
    const g = group({ name: 'body' });

    mesh(new G.RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 5, 0.0060), this.mats.body, {
      parent: g, pos: [0, BODY_Y, 0],
    });
    // 貼り革（前後の 帯）
    for (const sz of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(BODY_W - 0.0060, BODY_H - 0.0200, 0.0022, 3, 0.0008), this.mats.grip, {
        parent: g, pos: [0, BODY_Y - 0.0020, sz * (BODY_D / 2 + 0.0002)], cast: false,
      });
    }
    // 上下の 化粧板
    for (const sy of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(BODY_W - 0.0030, 0.0070, BODY_D - 0.0030, 3, 0.0022), this.mats.top, {
        parent: g, pos: [0, BODY_Y + sy * (BODY_H / 2 - 0.0020), 0],
      });
    }
    // ペンタ部（上の 出っぱり）
    mesh(new G.RoundedBoxGeometry(0.0300, 0.0140, BODY_D - 0.0080, 3, 0.0040), this.mats.top, {
      parent: g, pos: [LENS_X, BODY_Y + BODY_H / 2 + 0.0060, 0],
    });

    this.addShell(g);
  }

  /* --- レンズ ------------------------------------------------------------ */

  _buildLens() {
    const g = group({ name: 'lens' });
    this.root.add(g);
    this.lensGroup = g;

    // 鏡胴（すけすけ対象。中の 羽根を 見せる）
    const barrel = mesh(G.pipe(0.0230, 0.0206, 0.0260, { segments: 34, chamfer: 0.0008 }), this.mats.barrel, {
      parent: g, pos: [LENS_X, LENS_Y, LENS_Z + 0.0130],
    });
    barrel.rotation.x = Math.PI / 2;

    // 後玉だけ。羽根の うしろに 置く。
    const rear = mesh(
      G.lathe(
        [
          [0, 0.0022], [0.0100, 0.0017], [0.0180, 0.0002],
          [0.0180, -0.0002], [0.0100, -0.0017], [0, -0.0022],
        ],
        { segments: 30, center: false },
      ),
      this.mats.glass,
      { parent: g, pos: [LENS_X, LENS_Y, LENS_Z + 0.0034], rot: [Math.PI / 2, 0, 0], cast: false },
    );
    rear.renderOrder = 18;
    // 前の ふち に コーティングの 色を 細く 出す（ここも ふさがない）
    const coat = mesh(G.pipe(0.0204, 0.0180, 0.0006, { segments: 34, chamfer: 0.0002 }), this.mats.coat, {
      parent: g, pos: [LENS_X, LENS_Y, LENS_Z + 0.0250], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    coat.renderOrder = 17;

    // ピントリング と しぼりリング
    this.focusRing = group({ parent: g, pos: [LENS_X, LENS_Y, LENS_Z + 0.0220] });
    const fr = mesh(G.pipe(0.0248, 0.0228, 0.0056, { segments: 34, chamfer: 0.0006 }), this.mats.ring, {
      parent: this.focusRing, cast: false,
    });
    fr.rotation.x = Math.PI / 2;

    this.apertureRing = group({ parent: g, pos: [LENS_X, LENS_Y, LENS_Z + 0.0080] });
    const ar = mesh(G.pipe(0.0250, 0.0228, 0.0064, { segments: 34, chamfer: 0.0006 }), this.mats.ring, {
      parent: this.apertureRing, cast: false,
    });
    ar.rotation.x = Math.PI / 2;
    // しるし
    mesh(new G.RoundedBoxGeometry(0.0030, 0.0030, 0.0070, 1, 0.0008), this.mats.bladePin, {
      parent: this.apertureRing, pos: [0, 0.0250, 0], cast: false,
    });

    hitCylinder(this.apertureRing, 0.0290, 0.0100, [0, 0, 0], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'aperture',
      label: 'しぼり',
      type: 'rotate',
      object: this.apertureRing,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: this.apertureRing,
      primary: true,
      gain: 0.8,
      hint: { kind: 'spin', offset: [LENS_X, LENS_Y, LENS_Z + 0.030], size: 0.024, world: true },
      onRotate: (d) => {
        this.aperture = clamp01(this.aperture + d * 0.55);
      },
    });

    hitCylinder(this.focusRing, 0.0290, 0.0070, [0, 0, 0], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'focus',
      label: 'ピント',
      type: 'rotate',
      object: this.focusRing,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: this.focusRing,
      gain: 0.8,
      onRotate: (d) => {
        this.focus = clamp01(this.focus + d * 0.4);
      },
    });
  }

  /* --- しぼり（アイリス） ------------------------------------------------ */

  _buildIris() {
    const g = group({ parent: this.lensGroup, pos: [LENS_X, LENS_Y, LENS_Z + 0.0186] });
    this.irisGroup = g;

    const bladeGeo = G.irisBlade({ pivotR: PIVOT_R, tipR: TIP_R, width: 0.0082, thickness: 0.0004 });
    this.bladeGroups = [];
    for (let k = 0; k < BLADES; k++) {
      const th = (k / BLADES) * TAU;
      const b = group({
        parent: g,
        pos: [Math.cos(th) * PIVOT_R, Math.sin(th) * PIVOT_R, k * 0.00048 - 0.0012],
      });
      b.userData.base = th + Math.PI * 1.5;
      this.bladeGroups.push(b);
      mesh(bladeGeo, this.mats.blade, { parent: b, cast: false, receive: false });
      // ピン
      mesh(G.chamferedCylinder(0.0009, 0.0034, 0.0002, 8), this.mats.bladePin, {
        parent: g,
        pos: [Math.cos(th) * PIVOT_R, Math.sin(th) * PIVOT_R, 0.0014],
        rot: [Math.PI / 2, 0, 0], cast: false,
      });

      hitSphere(b, 0.0060, [0, 0, 0]);
      this.handle({
        id: `blade${k}`,
        label: 'はね',
        type: 'grab',
        object: b,
        onGrab: () => { this.heldBlade = k; },
        onRelease: () => { if (this.heldBlade === k) this.heldBlade = -1; },
      });
    }

    // 羽根を まとめて 動かす 輪（本物も この輪の みぞが 羽根を 引っぱる）
    const drive = mesh(G.pipe(PIVOT_R + 0.0072, PIVOT_R + 0.0054, 0.0016, { segments: 34, chamfer: 0.0003 }),
      this.mats.plate, { parent: g, pos: [0, 0, 0.0026], cast: false });
    drive.rotation.x = Math.PI / 2;
    this.irisDrive = drive;
  }

  /* --- 中身（ミラー・まく・フィルム） ------------------------------------ */

  _buildBack() {
    const g = group({ name: 'inside' });
    this.root.add(g);

    /* ミラー（ふだんは 45°。シャッターで はね上がる） */
    const mir = group({ parent: g, pos: [LENS_X, LENS_Y + 0.0090, 0.0040] });
    this.mirrorGroup = mir;
    mesh(G.roundedPlate(0.0300, 0.0220, 0.0012, 0.0020, { bevel: 0.0003 }), this.mats.mirror, {
      parent: mir, pos: [0, -0.0110, 0], cast: false,
    });
    mir.rotation.x = -Math.PI / 4;

    /* シャッターまく（上下 2枚） */
    this.curtainGroups = [];
    for (const sy of [1, -1]) {
      const c = group({ parent: g, pos: [LENS_X, LENS_Y, FILM_Z + 0.0032] });
      this.curtainGroups.push({ node: c, sy });
      mesh(G.roundedPlate(0.0330, 0.0130, 0.0010, 0.0012, { bevel: 0.0003 }), this.mats.curtain, {
        parent: c, pos: [0, sy * 0.0065, 0], cast: false,
      });
    }

    /* フィルム（横に 流れる 帯） */
    const film = group({ parent: g, pos: [0, LENS_Y, FILM_Z] });
    this.filmGroup = film;
    this.filmMeshes = [];
    const frameGeo = new G.RoundedBoxGeometry(0.0160, 0.0180, 0.0008, 1, 0.0010);
    for (let i = 0; i < 4; i++) {
      this.filmMeshes.push(mesh(frameGeo, this.mats.film, { parent: film, pos: [0, 0, 0], cast: false }));
    }
    // ふちの あな
    this.holeMeshes = [];
    const holeGeo = new G.RoundedBoxGeometry(0.0022, 0.0022, 0.0010, 1, 0.0005);
    for (let i = 0; i < 20; i++) {
      const sy = i % 2 === 0 ? 1 : -1;
      const m = mesh(holeGeo, this.mats.filmEdge, { parent: film, pos: [0, sy * 0.0104, 0.0002], cast: false });
      this.holeMeshes.push({ node: m, i: i >> 1, sy });
    }

    /* パトローネ と まきとりスプール */
    for (const [x, r] of [[-BODY_W / 2 + 0.0130, 0.0090], [BODY_W / 2 - 0.0130, 0.0070]]) {
      const sp = mesh(G.chamferedCylinder(r, 0.0230, 0.0008, 22), this.mats.spool, {
        parent: g, pos: [x, LENS_Y, FILM_Z + 0.0010], cast: false,
      });
      (this.spoolMeshes ||= []).push(sp);
    }
    // スプロケット（フィルムの あなを 送る 歯車）
    const spr = mesh(
      G.gearGeometry({ teeth: 12, module: 0.0011, thickness: 0.0180, bore: 0.0016 }),
      this.mats.gear,
      { parent: g, pos: [BODY_W / 2 - 0.0300, LENS_Y, FILM_Z + 0.0010], cast: false },
    );
    spr.rotation.x = Math.PI / 2;
    this.sprocket = spr;

    /* 光（まくが 開いているあいだ だけ 見える） */
    this.beam = mesh(
      G.lathe([[0, 0], [1, 0], [1, 1], [0, 1]], { segments: 24, center: false }),
      this.mats.light,
      { parent: g, pos: [LENS_X, LENS_Y, FILM_Z + 0.0040], rot: [Math.PI / 2, 0, 0], cast: false, receive: false },
    );
    this.beam.visible = false;
    this.beam.renderOrder = 26;
  }

  /* --- 操作部 ------------------------------------------------------------ */

  _buildControls() {
    const g = group({ name: 'controls' });
    this.root.add(g);

    const TOP = BODY_Y + BODY_H / 2 + 0.0035;

    /* まきあげレバー */
    const lev = group({ parent: g, pos: [BODY_W / 2 - 0.0130, TOP + 0.0020, 0] });
    this.windGroup = lev;
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0034, -0.0028), new THREE.Vector2(0.0230, -0.0022),
          new THREE.Vector2(0.0230, 0.0022), new THREE.Vector2(-0.0034, 0.0028),
        ],
        [], 0.0026, { corner: 0.0022, bevel: 0.0005 },
      ),
      this.mats.lever,
      { parent: lev, rot: [Math.PI / 2, 0, 0] },
    );
    mesh(G.chamferedCylinder(0.0060, 0.0040, 0.0010, 18), this.mats.lever, {
      parent: lev, pos: [0, -0.0010, 0], cast: false,
    });

    hitSphere(lev, 0.0110, [0.0180, 0, 0]);
    this.handle({
      id: 'wind',
      label: 'まきあげ',
      type: 'rotate',
      object: lev,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 1, 0),
      pivot: lev,
      gain: 0.9,
      hint: { kind: 'spin', offset: [0, 0.012, 0], size: 0.014 },
      onRotate: (d) => {
        if (this.wound >= 1) return;
        const before = this.wound;
        this.wound = clamp01(this.wound - d * 0.55);
        this.filmShift += Math.max(0, this.wound - before);
        if (Math.floor(before * 8) !== Math.floor(this.wound * 8)) {
          this.audio.tick({ gain: 0.13, pitch: 2.2 });
        }
      },
    });

    /* シャッターボタン */
    const btn = group({ parent: g, pos: [BODY_W / 2 - 0.0290, TOP + 0.0030, 0] });
    this.buttonGroup = btn;
    mesh(
      G.lathe([[0, 0], [0.0052, 0], [0.0050, 0.0026], [0.0038, 0.0038], [0, 0.0040]], { segments: 18, center: false }),
      this.mats.button,
      { parent: btn },
    );

    hitSphere(btn, 0.0100, [0, 0.0020, 0]);
    this.handle({
      id: 'shutter',
      label: 'シャッター',
      type: 'press',
      object: btn,
      hint: { kind: 'push', offset: [0, 0.016, 0], size: 0.010 },
      onPress: () => {
        this._release();
      },
    });

    /* まきもどしノブ（かざり） */
    mesh(
      G.lathe([[0, 0], [0.0060, 0], [0.0058, 0.0044], [0.0040, 0.0056], [0, 0.0058]], { segments: 18, center: false }),
      this.mats.lever,
      { parent: g, pos: [-BODY_W / 2 + 0.0130, TOP + 0.0010, 0] },
    );
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  _release() {
    if (this.wound < 0.85 || this._exposeT >= 0) {
      // まだ 巻けていない: カチッと 空うち
      this.audio.click({ gain: 0.2, bright: 1200 });
      return;
    }
    this._exposeT = 0;
    this.wound = 0;
    this.frame++;
    this.audio.click({ gain: 0.5, bright: 2600 });
  }

  /** 羽根の 角度。しぼり 1 で いちばん 開く */
  _bladeAngle() {
    return lerp(-0.86, 0.0, this.aperture);
  }

  /** 通る 光の 量（穴の 面積に 比例） */
  get light() {
    const r = clamp01(this.aperture);
    return r * r;
  }

  step(dt) {
    if (this._exposeT >= 0) {
      this._exposeT += dt;
      const T = 0.34;
      // ミラー上げ → まく開 → まく閉 → ミラー下げ
      this.mirror = clamp01(this._exposeT / 0.07);
      const t = this._exposeT;
      this.shutter = t < 0.09 ? 0 : t < 0.24 ? clamp01((t - 0.09) / 0.05) : clamp01((T - t) / 0.06);
      if (this._exposeT > T) {
        this._exposeT = -1;
        this.shutter = 0;
        this.audio.click({ gain: 0.3, bright: 1800 });
      }
    } else {
      this.mirror = damp(this.mirror, 0, 16, dt);
      this.shutter = damp(this.shutter, 0, 20, dt);
    }
  }

  lateUpdate(dt) {
    /* 羽根 */
    const a = this._bladeAngle();
    for (let k = 0; k < BLADES; k++) {
      const b = this.bladeGroups[k];
      // つままれた 羽根だけ、そこで 止まる
      const target = b.userData.base + (this.heldBlade === k ? (b.userData.stuck ??= a) : a);
      if (this.heldBlade !== k) b.userData.stuck = a;
      b.rotation.z = damp(b.rotation.z, target, 30, dt);
    }
    this.irisDrive.rotation.z = a * 1.2;

    /* レンズの くりだし（ピント） */
    this.lensGroup.position.z = lerp(0, 0.0060, this.focus);
    this.focusRing.rotation.z = this.focus * 3.4;

    /* ミラーと まく */
    this.mirrorGroup.rotation.x = lerp(-Math.PI / 4, -Math.PI / 2 + 0.06, this.mirror);
    for (const c of this.curtainGroups) {
      c.node.position.y = LENS_Y + c.sy * this.shutter * 0.0135;
    }

    /* 光 */
    const on = this.shutter > 0.02 && this.light > 0.01;
    this.beam.visible = on;
    if (on) {
      const r = 0.0030 + this.light * 0.0150;
      this.beam.scale.set(r, 0.0060, r);
      this.beam.material.opacity = 0.10 + this.light * 0.45 * this.shutter;
    }

    /* フィルム */
    const shift = this.filmShift * 0.0230;
    // 胴から はみ出す ぶんは 消す（フィルムは 中に あるもの）
    for (let i = 0; i < this.filmMeshes.length; i++) {
      const x = (i - 1.5) * 0.0210 - (shift % (0.0210 * 4)) + 0.0105;
      this.filmMeshes[i].position.x = x;
      this.filmMeshes[i].visible = Math.abs(x) < 0.0330;
    }
    for (const h of this.holeMeshes) {
      const x = (h.i - 4.5) * 0.0076 - (shift % (0.0076 * 10)) + 0.0038;
      h.node.position.x = x;
      h.node.visible = Math.abs(x) < 0.0380;
    }
    this.spoolMeshes[1].rotation.z = shift * 60;
    this.spoolMeshes[0].rotation.z = shift * 42;
    this.sprocket.rotation.y = shift * 84;

    /* レバーと ボタン */
    this.windGroup.rotation.y = lerp(0, -2.0, 1 - this.wound);
    this.buttonGroup.position.y = BODY_Y + BODY_H / 2 + 0.0065 - (this._exposeT >= 0 ? 0.0016 : 0);
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'light', icon: 'bulb', label: 'あかるさ', value: this.light, color: '#e8b463' },
      { id: 'wind', icon: 'spring', label: 'まきあげ', value: this.wound, color: '#4a5560' },
    ];
  }

  reset() {
    this.aperture = 0.72;
    this.focus = 0.5;
    this.wound = 1;
    this.shutter = 0;
    this.mirror = 0;
    this.frame = 0;
    this.filmShift = 0;
    this._exposeT = -1;
    this.heldBlade = -1;
  }
}
