/**
 * bicycle.js — じてんしゃ
 *
 * 「前にこぐと つたわるのに、うしろにこぐと 空まわりする」しくみ
 * （フリーホイール）と、たわむ 伝動（チェーン）を 見せる機械。
 *
 *   ペダル → クランク → 大きい歯車（チェーンリング）
 *     → チェーン（曲がるので、はなれた 2つの 軸を つなげる）
 *     → 小さい歯車（後ろ）→ うしろの 車輪
 *
 *   後ろの 歯車と 車輪の あいだには つめ（ラチェット）が 入っている。
 *     前へ こぐ  → つめが 歯に かかって、車輪を 引っぱる
 *     こぐのを やめる → つめが 歯を すべって カリカリ 鳴る（車輪は そのまま まわる）
 *     うしろへ こぐ → まったく つたわらない
 *
 *   ブレーキは 摩擦。ゴムを リムに 押しつけた ぶんだけ 減っていく。
 *
 * さわりどころ:
 *   - ペダルを まわす（前にも 後ろにも まわせる）
 *   - こぐのを やめると、しばらく 走りつづける（そのあいだ カリカリ鳴る）
 *   - ブレーキレバーを にぎると ゴムが リムを はさんで 止まる
 *   - 車輪を 直接 まわす／押さえる こともできる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh, stretchBetween } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, mod, TAU } from '../lib/math.js';

const WHEEL_R = 0.0380;
const AXLE_Y = WHEEL_R;
const REAR_X = -0.0480;
const FRONT_X = 0.0520;
/** ボトムブラケット（ペダルの 軸） */
const BB_X = -0.0060;
const BB_Y = 0.0180;
/** 歯車 */
const RING_TEETH = 24;
const COG_TEETH = 10;
const CHAIN_MODULE = 0.00108;
const RING_R = (CHAIN_MODULE * RING_TEETH) / 2;
const COG_R = (CHAIN_MODULE * COG_TEETH) / 2;
/** ギヤ比: ペダル 1回転で 車輪が これだけ まわる */
const RATIO = RING_TEETH / COG_TEETH;
/** チェーンの こま数 */
const LINKS = 42;
/** 車体の 中心の z（手前がわ） */
const SIDE_Z = 0.0135;

export class Bicycle extends Machine {
  static meta = {
    id: 'bicycle',
    name: 'じてんしゃ',
    sub: 'まえだけ つたわる',
    accent: 0xe0685a,
    backdrop: {
      top: '#fff4ee',
      middle: '#ffe4d8',
      bottom: '#e8c2b0',
      glow: '#ffd9c4',
      glowStrength: 0.14,
    },
    bloom: { strength: 0.26, radius: 0.5, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="12" cy="31" r="9" fill="none" stroke="#4a5058" stroke-width="2.6"/>
      <circle cx="36" cy="31" r="9" fill="none" stroke="#4a5058" stroke-width="2.6"/>
      <path d="M12 31 20 17h9l7 14M20 17l5 14M29 17h5" stroke="#e0685a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="24" cy="31" r="4" fill="none" stroke="#d9a94e" stroke-width="2.4"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.crank = 0;        // ペダルの 角度
    this.crankVel = 0;
    this.wheel = 0;        // 車輪の 角度
    this.wheelVel = 0;     // rad/s
    this.chain = 0;        // チェーンの 送り（弧長）
    this.brake = 0;        // にぎり ぐあい 0..1
    this.brakeHeld = false;
    this.engaged = false;  // つめが かかっているか
    this.wheelHeld = false;
    this.distance = 0;
    this._pawl = 0;
    this._clickAt = 0;

    this.radius = 0.096;
    this.center = new THREE.Vector3(0.002, 0.042, 0);
    this.footprint = { w: 0.155, d: 0.045, opacity: 0.28 };

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.08, -0.30, -1.0),
      center: this.center,
      span: 0.112,
      noiseScale: 13,
    });

    this.mats = {
      frame: M.shell('paint', { color: 0xe0685a, roughness: 0.20, clearcoat: 1.0 }),
      frameDeep: M.shell('paint', { color: 0xb03a2e, roughness: 0.24, clearcoat: 0.9 }),
      saddle: M.shell('softPlastic', { color: 0x4a4048 }),
      hubShell: M.shell('coated', { color: 0xd8dee5, roughness: 0.34 }),

      rim: M.part('chrome', { color: 0xe4eaf0 }),
      tyre: M.part('rubber', { color: 0x3a3f46 }),
      spoke: M.part('steel', { color: 0xdbe2e9, roughness: 0.16 }),
      hub: M.part('steel', { color: 0xc8d0d8, roughness: 0.20 }),
      ring: M.part('brass', { color: 0xd9a94e }),
      cog: M.part('steel', { color: 0xb6c0c9, roughness: 0.22 }),
      chain: M.part('darkSteel', { color: 0x8d959e }),
      pawl: M.part('brass', { color: 0xefc978 }),
      pedal: M.part('softPlastic', { color: 0x33383f }),
      crankArm: M.part('coated', { color: 0xc2cad2, roughness: 0.34 }),
      pad: M.part('rubber', { color: 0x5a4038 }),
      caliper: M.part('steel', { color: 0xd0d8df, roughness: 0.20 }),
      cable: M.part('cable', { color: 0xe8ecef }),
      lever: M.part('coated', { color: 0x3a3f46, roughness: 0.36 }),
      grip: M.part('softPlastic', { color: 0xe0685a }),
      road: M.plain('coated', { color: 0xb9b2a6, roughness: 0.9 }),
      line: M.plain('paint', { color: 0xfff1cf, roughness: 0.6 }),
    };

    this._buildRoad();
    this._buildFrame();
    this._buildWheels();
    this._buildDrive();
    this._buildChain();
    this._buildBrake();

    this.setXray(0);
  }

  /* --- みち -------------------------------------------------------------- */

  _buildRoad() {
    const g = group({ name: 'road' });
    this.root.add(g);

    mesh(new G.RoundedBoxGeometry(0.2000, 0.0040, 0.0560, 3, 0.0016), this.mats.road, {
      parent: g, pos: [0, -0.0018, 0], cast: false,
    });
    // 白線（流れる）
    this.lineMeshes = [];
    const seg = new G.RoundedBoxGeometry(0.0160, 0.0022, 0.0038, 1, 0.0009);
    for (let i = 0; i < 7; i++) {
      this.lineMeshes.push(mesh(seg, this.mats.line, { parent: g, pos: [0, 0.0012, 0], cast: false }));
    }
  }

  /* --- フレーム ---------------------------------------------------------- */

  _tube(parent, a, b, r, mat) {
    const len = a.distanceTo(b);
    const m = mesh(G.chamferedCylinder(r, len, r * 0.3, 12), mat, { parent });
    m.position.copy(a).lerp(b, 0.5);
    const dir = this._a.subVectors(b, a).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return m;
  }

  _buildFrame() {
    const g = group({ name: 'frame' });

    const V = (x, y) => new THREE.Vector3(x, y, 0);
    const BB = V(BB_X, BB_Y);
    const HEAD_LO = V(0.0400, 0.0330);
    const HEAD_HI = V(0.0330, 0.0700);
    const SEAT = V(-0.0230, 0.0700);
    const REAR = V(REAR_X, AXLE_Y);
    const FRONT = V(FRONT_X, AXLE_Y);

    const R = 0.0026;
    this._tube(g, BB, HEAD_LO, R, this.mats.frame);        // ダウンチューブ
    this._tube(g, SEAT, HEAD_HI, R, this.mats.frame);      // トップチューブ
    this._tube(g, BB, SEAT, R, this.mats.frame);           // シートチューブ
    this._tube(g, HEAD_LO, HEAD_HI, R * 1.25, this.mats.frameDeep); // ヘッドチューブ
    for (const sz of [-1, 1]) {
      const bbS = V(BB_X, BB_Y); bbS.z = sz * 0.0060;
      const rearS = V(REAR_X, AXLE_Y); rearS.z = sz * 0.0040;
      const seatS = V(-0.0230, 0.0660); seatS.z = sz * 0.0040;
      this._tube(g, bbS, rearS, R * 0.72, this.mats.frame);   // チェーンステー
      this._tube(g, seatS, rearS, R * 0.72, this.mats.frame); // シートステー
      // 前フォーク
      const hS = V(0.0400, 0.0330); hS.z = sz * 0.0050;
      const fS = V(FRONT_X, AXLE_Y); fS.z = sz * 0.0040;
      this._tube(g, hS, fS, R * 0.80, this.mats.frameDeep);
    }

    // サドル
    mesh(G.chamferedCylinder(0.0026, 0.0180, 0.0006, 10), this.mats.frameDeep, {
      parent: g, pos: [-0.0230, 0.0770, 0],
    });
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0130, -0.0058), new THREE.Vector2(0.0080, -0.0044),
          new THREE.Vector2(0.0130, 0), new THREE.Vector2(0.0080, 0.0044),
          new THREE.Vector2(-0.0130, 0.0058),
        ],
        [], 0.0044, { corner: 0.0034, bevel: 0.0008 },
      ),
      this.mats.saddle,
      { parent: g, pos: [-0.0230, 0.0865, 0], rot: [Math.PI / 2, 0, 0] },
    );

    // ハンドル
    const bar = group({ parent: g, pos: [0.0310, 0.0760, 0] });
    this.barGroup = bar;
    mesh(G.chamferedCylinder(0.0022, 0.0150, 0.0004, 10), this.mats.frameDeep, {
      parent: bar, pos: [0, -0.0070, 0],
    });
    const cross = mesh(G.chamferedCylinder(0.0022, 0.0500, 0.0005, 10), this.mats.frameDeep, { parent: bar });
    cross.rotation.x = Math.PI / 2;
    for (const sz of [-1, 1]) {
      mesh(G.chamferedCylinder(0.0034, 0.0130, 0.0010, 12), this.mats.grip, {
        parent: bar, pos: [0, 0, sz * 0.0185], rot: [Math.PI / 2, 0, 0],
      });
    }

    this.addShell(g);
  }

  /* --- 車輪 -------------------------------------------------------------- */

  _buildWheels() {
    const g = group({ name: 'wheels' });
    this.root.add(g);

    const wheelGeo = G.spokedWheel({
      rimR: WHEEL_R - 0.0032, rimW: 0.0044, rimT: 0.0026, hubR: 0.0044, hubW: 0.0110,
      spokes: 16, spokeR: 0.0006, lean: 0.09,
    });
    const tyreGeo = new THREE.TorusGeometry(WHEEL_R - 0.0016, 0.0032, 10, 44);

    this.wheelGroups = [];
    for (const x of [REAR_X, FRONT_X]) {
      const w = group({ parent: g, pos: [x, AXLE_Y, 0] });
      this.wheelGroups.push(w);
      mesh(wheelGeo, this.mats.rim, { parent: w, cast: false });
      mesh(tyreGeo, this.mats.tyre, { parent: w, cast: false });
    }

    // 前輪は 直接 さわれる
    const fw = this.wheelGroups[1];
    hitCylinder(fw, WHEEL_R, 0.018, [0, 0, 0], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'frontWheel',
      label: 'まえの わ',
      type: 'rotate',
      object: fw,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: fw,
      onRotate: (d) => {
        this.wheelVel = 0;
        this.wheel += d;
        this.distance += d * WHEEL_R;
      },
      onFling: (v) => {
        this.wheelVel = clamp(v, -30, 30);
      },
      onGrab: () => { this.wheelHeld = true; },
      onRelease: () => { this.wheelHeld = false; },
    });
  }

  /* --- こぐところ と フリーホイール -------------------------------------- */

  _buildDrive() {
    const g = group({ name: 'drive' });
    this.root.add(g);

    /* チェーンリング（大きい歯車）と クランク */
    const ring = group({ parent: g, pos: [BB_X, BB_Y, SIDE_Z] });
    this.ringGroup = ring;
    mesh(
      G.gearGeometry({
        teeth: RING_TEETH, module: CHAIN_MODULE, thickness: 0.0016,
        bore: 0.0034, hub: 0.0060, hubHeight: 0.0010, spokes: 5,
      }),
      this.mats.ring,
      { parent: ring, cast: false },
    );

    // クランクアーム（手前と 奥。180°ちがい）
    this.crankGroup = group({ parent: g, pos: [BB_X, BB_Y, 0] });
    for (const [sz, phase] of [[1, 0], [-1, Math.PI]]) {
      const arm = group({ parent: this.crankGroup, rot: [0, 0, phase] });
      mesh(
        G.extrudeOutline(
          [
            new THREE.Vector2(-0.0044, -0.0038), new THREE.Vector2(0.0230, -0.0030),
            new THREE.Vector2(0.0230, 0.0030), new THREE.Vector2(-0.0044, 0.0038),
          ],
          [], 0.0030, { corner: 0.0028, bevel: 0.0006 },
        ),
        this.mats.crankArm,
        { parent: arm, pos: [0, 0, sz * (SIDE_Z + 0.0026)] },
      );
      // ペダル（つねに 水平を たもつ）
      const pd = group({ parent: arm, pos: [0.0230, 0, sz * (SIDE_Z + 0.0090)] });
      (this.pedalGroups ||= []).push({ node: pd, phase });
      mesh(new G.RoundedBoxGeometry(0.0150, 0.0032, 0.0090, 2, 0.0012), this.mats.pedal, { parent: pd });
      mesh(G.chamferedCylinder(0.0016, 0.0110, 0.0003, 8), this.mats.crankArm, {
        parent: arm, pos: [0.0230, 0, sz * (SIDE_Z + 0.0050)], rot: [Math.PI / 2, 0, 0], cast: false,
      });
    }
    // 軸
    const bb = mesh(G.chamferedCylinder(0.0034, SIDE_Z * 2 + 0.0060, 0.0006, 14), this.mats.hub, {
      parent: g, pos: [BB_X, BB_Y, 0], cast: false,
    });
    bb.rotation.x = Math.PI / 2;

    hitSphere(this.crankGroup, 0.0130, [0.0230, 0, SIDE_Z + 0.0090]);
    hitSphere(this.crankGroup, 0.0130, [-0.0230, 0, -SIDE_Z - 0.0090]);
    hitCylinder(this.crankGroup, 0.0150, 0.050, [0, 0, 0], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'pedal',
      label: 'ペダル',
      type: 'rotate',
      object: this.crankGroup,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: this.crankGroup,
      primary: true,
      hint: { kind: 'spin', offset: [0, 0, SIDE_Z + 0.020], size: 0.020 },
      onRotate: (d) => {
        this.crank += d;
        this.crankVel = 0;
        this._drive(d);
      },
      onFling: (v) => {
        this.crankVel = clamp(v, -24, 24);
      },
    });

    /* うしろの 歯車 と フリーホイール */
    const cog = group({ parent: g, pos: [REAR_X, AXLE_Y, SIDE_Z] });
    this.cogGroup = cog;
    mesh(
      G.gearGeometry({ teeth: COG_TEETH, module: CHAIN_MODULE, thickness: 0.0016, bore: 0.0030, hub: 0.0044, hubHeight: 0.0008 }),
      this.mats.cog,
      { parent: cog, cast: false },
    );
    // ラチェットの 歯（車輪がわ。歯車の 内がわで まわる）
    const ratchet = group({ parent: g, pos: [REAR_X, AXLE_Y, SIDE_Z - 0.0030] });
    this.ratchetGroup = ratchet;
    mesh(
      G.ratchetGeometry({ teeth: 14, radius: 0.0058, depth: 0.0014, thickness: 0.0018, bore: 0.0026 }),
      this.mats.hub,
      { parent: ratchet, cast: false },
    );
    // つめ（歯車と いっしょに まわる。前へ こぐと 歯に かかる）
    this.pawlGroups = [];
    for (const ph of [0, Math.PI]) {
      const pv = group({ parent: cog, pos: [Math.cos(ph) * 0.0082, Math.sin(ph) * 0.0082, -0.0030], rot: [0, 0, ph] });
      this.pawlGroups.push(pv);
      mesh(
        G.extrudeOutline(
          [
            new THREE.Vector2(-0.0014, -0.0012), new THREE.Vector2(0.0010, -0.0014),
            new THREE.Vector2(-0.0036, -0.0034), new THREE.Vector2(-0.0044, -0.0016),
          ],
          [], 0.0014, { corner: 0.0008, bevel: 0.0003 },
        ),
        this.mats.pawl,
        { parent: pv, cast: false },
      );
    }
    // ハブ（外がわ。すけると 中の つめが 見える）
    const shell = mesh(G.pipe(0.0100, 0.0090, 0.0140, { segments: 24, chamfer: 0.0004 }), this.mats.hubShell, {
      parent: g, pos: [REAR_X, AXLE_Y, SIDE_Z - 0.0030], cast: false,
    });
    shell.rotation.x = Math.PI / 2;
  }

  /* --- チェーン ---------------------------------------------------------- */

  _buildChain() {
    const g = group({ name: 'chain' });
    this.root.add(g);

    // 2つの 円に かかる ベルトの 経路を 作る
    const c1 = new THREE.Vector2(BB_X, BB_Y);      // チェーンリング
    const c2 = new THREE.Vector2(REAR_X, AXLE_Y);  // うしろの 歯車
    const r1 = RING_R + 0.0009;
    const r2 = COG_R + 0.0009;
    const d = new THREE.Vector2().subVectors(c2, c1);
    const L = d.length();
    const phi = Math.atan2(d.y, d.x);
    const alpha = Math.acos(clamp((r1 - r2) / L, -1, 1));

    /** @type {THREE.Vector3[]} */
    const pts = [];
    const push = (c, r, a) => pts.push(new THREE.Vector3(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, SIDE_Z));

    // 2つの 円の 外がわに かける ベルト。
    // 接点は どちらも φ±α に ある。あとは 両方の 円を「角度が 減る向き」で
    // なぞれば、行きと 帰りの 直線は 頂点を つなぐだけで できる。
    // （どちらか片方を 逆向きに なぞると、小さい歯車の 反対がわに 巻きついてしまう）
    for (let i = 0; i <= 22; i++) {
      push(c1, r1, lerp(phi - alpha, phi + alpha - TAU, i / 22));
    }
    for (let i = 0; i <= 10; i++) {
      push(c2, r2, lerp(phi + alpha, phi - alpha, i / 10));
    }

    this.chainPath = G.closedPath(pts);
    this.linkPitch = this.chainPath.length / LINKS;

    // こま
    const linkGeo = new G.RoundedBoxGeometry(this.linkPitch * 0.86, 0.0028, 0.0030, 1, 0.0009);
    const rollerGeo = G.chamferedCylinder(0.0011, 0.0040, 0.0003, 8);
    this.linkMeshes = [];
    this.rollerMeshes = [];
    for (let i = 0; i < LINKS; i++) {
      this.linkMeshes.push(mesh(linkGeo, this.mats.chain, { parent: g, cast: false, receive: false }));
      const r = mesh(rollerGeo, this.mats.hub, { parent: g, cast: false, receive: false });
      r.rotation.x = Math.PI / 2;
      this.rollerMeshes.push(r);
    }
    this._cp = new THREE.Vector3();
    this._ct = new THREE.Vector3();
  }

  /* --- ブレーキ ---------------------------------------------------------- */

  _buildBrake() {
    const g = group({ name: 'brake' });
    this.root.add(g);

    // キャリパー（前輪の 上）
    const cal = group({ parent: g, pos: [FRONT_X - 0.0010, AXLE_Y + WHEEL_R - 0.0040, 0] });
    this.caliperGroup = cal;
    mesh(G.chamferedCylinder(0.0022, 0.0090, 0.0004, 10), this.mats.caliper, {
      parent: cal, pos: [0, 0.0060, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    this.armGroups = [];
    for (const sz of [-1, 1]) {
      const arm = group({ parent: cal, pos: [0, 0.0060, sz * 0.0026] });
      this.armGroups.push({ node: arm, sz });
      mesh(new G.RoundedBoxGeometry(0.0040, 0.0180, 0.0028, 2, 0.0010), this.mats.caliper, {
        parent: arm, pos: [0, -0.0080, sz * 0.0028], cast: false,
      });
      // ゴム
      mesh(new G.RoundedBoxGeometry(0.0090, 0.0044, 0.0032, 2, 0.0010), this.mats.pad, {
        parent: arm, pos: [0, -0.0160, sz * 0.0044], cast: false,
      });
    }

    // レバー（ハンドルの 手前がわ）
    const lev = group({ parent: this.barGroup, pos: [0, 0, 0.0130] });
    this.leverGroup = lev;
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0018, -0.0026), new THREE.Vector2(0.0180, -0.0016),
          new THREE.Vector2(0.0180, 0.0016), new THREE.Vector2(-0.0018, 0.0026),
        ],
        [], 0.0026, { corner: 0.0016, bevel: 0.0005 },
      ),
      this.mats.lever,
      { parent: lev, pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0] },
    );

    // ワイヤ（レバーと キャリパーを つなぐ。毎フレーム 張り直す）
    this.cableMesh = mesh(G.chamferedCylinder(0.0008, 1.0, 0.0002, 6), this.mats.cable, {
      parent: g, cast: false,
    });

    hitSphere(lev, 0.0130, [0.0120, 0, 0]);
    this.handle({
      id: 'brake',
      label: 'ブレーキ',
      type: 'press',
      object: lev,
      hint: { kind: 'push', offset: [0.014, 0.010, 0.014], size: 0.011 },
      onPress: () => {
        this.brakeHeld = true;
        this.audio.click({ gain: 0.26, bright: 1500 });
      },
      onRelease: () => {
        this.brakeHeld = false;
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  /** ペダルが 動いた ぶんを 車輪へ わたす（前まわしのときだけ） */
  _drive(dCrank) {
    this.chain += dCrank * RING_R;
    const want = this.wheel + dCrank * RATIO;
    if (dCrank > 0 && want > this.wheel) {
      // つめが かかる: 車輪を 引っぱる
      const dWheel = want - this.wheel;
      this.wheel = want;
      this.distance += dWheel * WHEEL_R;
      this.wheelVel = Math.max(this.wheelVel, (dCrank * RATIO) / this.fixedStep * 0.25);
      this.engaged = true;
    } else {
      // 後ろまわし: 空まわり（車輪には なにも つたわらない）
      this.engaged = false;
    }
  }

  step(dt) {
    this.brake = damp(this.brake, this.brakeHeld ? 1 : 0, 16, dt);

    // ペダルの 空まわり（はじいたとき）
    if (Math.abs(this.crankVel) > 0.01) {
      const d = this.crankVel * dt;
      this.crank += d;
      this._drive(d);
      this.crankVel = damp(this.crankVel, 0, 2.2, dt);
    }

    // 車輪
    if (this.wheelHeld) {
      this.wheelVel = damp(this.wheelVel, 0, 26, dt);
    } else {
      const roll = 0.34;                       // ころがり抵抗
      const pad = this.brake * 16.0;           // ゴムの まさつ
      this.wheelVel = damp(this.wheelVel, 0, roll + pad, dt);
      if (Math.abs(this.wheelVel) < 0.02) this.wheelVel = 0;
      const d = this.wheelVel * dt;
      this.wheel += d;
      this.distance += d * WHEEL_R;
    }

    // こいでいないのに 車輪が まわっているあいだは、つめが 歯を すべる
    const coasting = !this.engaged && Math.abs(this.wheelVel) > 0.3;
    if (coasting) {
      this._clickAt += Math.abs(this.wheelVel) * dt * 14 / TAU;
      if (this._clickAt >= 1) {
        this._clickAt -= 1;
        this.audio.tick({ gain: 0.05 + clamp01(Math.abs(this.wheelVel) / 20) * 0.06, pitch: 2.6 });
        this._pawl = 1;
      }
    }
    this._pawl = damp(this._pawl, 0, 26, dt);
    this.engaged = false;
  }

  lateUpdate(dt) {
    /* 車輪 */
    this.wheelGroups[0].rotation.z = this.wheel;
    this.wheelGroups[1].rotation.z = this.wheel;
    this.ratchetGroup.rotation.z = this.wheel;

    /* ペダルまわり */
    this.crankGroup.rotation.z = this.crank;
    this.ringGroup.rotation.z = this.crank;
    for (const p of this.pedalGroups) {
      // ペダルは じくに 対して 自由なので、いつも 水平のまま
      p.node.rotation.z = -this.crank - p.phase;
    }
    // うしろの 歯車は チェーンで つながっているので、ペダルと 同じ 送り
    this.cogGroup.rotation.z = this.chain / COG_R;
    for (const pv of this.pawlGroups) pv.rotation.z += 0; // 位置は 親まかせ
    // つめは 歯を のりこえるとき 少し はねる
    for (let i = 0; i < this.pawlGroups.length; i++) {
      this.pawlGroups[i].children[0].rotation.z = -this._pawl * 0.55;
    }

    /* チェーン */
    const path = this.chainPath;
    for (let i = 0; i < LINKS; i++) {
      const s = i * this.linkPitch + this.chain;
      path.at(s, this._cp);
      path.tangent(s, this._ct);
      const link = this.linkMeshes[i];
      link.position.copy(this._cp);
      link.rotation.z = Math.atan2(this._ct.y, this._ct.x);
      const roller = this.rollerMeshes[i];
      roller.position.copy(this._cp).addScaledVector(this._ct, this.linkPitch * 0.5);
    }

    /* ブレーキ */
    for (const a of this.armGroups) a.node.rotation.z = -a.sz * this.brake * 0.11;
    this.leverGroup.rotation.y = this.brake * 0.42;
    // ワイヤ
    this.leverGroup.getWorldPosition(this._a);
    this.root.worldToLocal(this._a);
    this._a.x += 0.010;
    this._b.set(FRONT_X - 0.0010, AXLE_Y + WHEEL_R + 0.0030, 0);
    stretchBetween(this.cableMesh, this._a, this._b);

    /* 白線を 流す */
    const span = 0.0290 * 7;
    for (let i = 0; i < this.lineMeshes.length; i++) {
      this.lineMeshes[i].position.x = mod(i * 0.0290 - this.distance * 3.2, span) - span / 2;
    }

    this._updateSound();
  }

  _updateSound() {
    const v = clamp01(Math.abs(this.wheelVel) / 22);
    const roll = this.audio.voice('bikeRoll', { source: 'noise', filter: 'bandpass', freq: 260, Q: 2.4 });
    roll.set({ level: v * 0.055, freq: 200 + v * 420, smooth: 0.1 });

    const squeal = this.audio.voice('bikeBrake', { source: 'noise', filter: 'bandpass', freq: 2400, Q: 16 });
    squeal.set({ level: this.brake * v * 0.10, freq: 1800 + v * 1600, smooth: 0.06 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'speed', icon: 'gauge', label: 'はやさ', value: clamp01(Math.abs(this.wheelVel) / 24), color: '#e0685a' },
      { id: 'brake', icon: 'spring', label: 'ブレーキ', value: this.brake, color: '#4a5058' },
    ];
  }

  reset() {
    this.crank = 0;
    this.crankVel = 0;
    this.wheel = 0;
    this.wheelVel = 0;
    this.chain = 0;
    this.brake = 0;
    this.brakeHeld = false;
    this.distance = 0;
  }
}
