/**
 * train.js — きかんしゃ
 *
 * 「まっすぐ 行ったり来たり」を「ぐるぐる まわる」に かえる しくみ
 * （クランクと スライダ）を 見せる機械。
 *
 *   じょうき が シリンダーの ピストンを 前へ おす
 *     → ピストン棒 → クロスヘッド（まっすぐ しか 動けない）
 *     → メインロッド → 車輪の クランクピン（まわる）
 *     → 3つの 車輪が サイドロッドで つながっていて、いっしょに まわる
 *
 *   だいじなのは 左右の クランクピンが きっかり 90°ずれていること（quartering）。
 *   まっすぐ 伸びきった ところ（死点）では 力が かからないので、
 *   90°ずらして おくと、どちらか片方が かならず 力を出せる。
 *
 *   バルブ（弁）は 車輪より 90°先まわりして 動き、
 *   ピストンの 前と後ろに 交互に じょうきを 入れる。
 *   出ていく じょうきが 1回転に 4回「シュッ」と 鳴る。
 *
 * さわりどころ:
 *   - レバーを 引くと じょうきが 入って 走りだす（引くほど 速い）
 *   - 車輪を 指で 直接 まわせる。押さえると 全部 止まる
 *   - 汽笛の ひもを 引くと 鳴る
 *   - ボイラーの あつさは 使うと 減り、待つと また たまる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh, stretchBetween } from './base.js';
import * as G from '../lib/geometry.js';
import { ParticleField } from '../lib/particles.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, mod, TAU } from '../lib/math.js';

/** 車輪 */
const WHEEL_R = 0.0185;
/** レール面の 高さ（車輪は この上に のる） */
const RAIL_TOP = 0.0092;
const AXLE_Y = RAIL_TOP + WHEEL_R;
const WHEEL_X = [-0.0300, 0, 0.0300];
/** 動輪（メインロッドが つく）は まん中 */
const MAIN_WHEEL = 1;
const SIDE_Z = 0.0215;
/** クランクピンの 半径 */
const CRANK_R = 0.0104;
/** メインロッドの 長さ */
const ROD_LEN = 0.0380;
/** シリンダー */
const CYL_X = 0.0620;
const CYL_R = 0.0088;
/** ボイラー */
const BOILER_R = 0.0195;
const BOILER_Y = 0.0570;
/** レールの まくら木の 間隔 */
const TIE_GAP = 0.0180;
const TIES = 11;

export class Train extends Machine {
  static meta = {
    id: 'train',
    name: 'きかんしゃ',
    sub: 'いったりきたり が まわる',
    accent: 0x2f7d5c,
    backdrop: {
      top: '#eef7f2',
      middle: '#dceee5',
      bottom: '#bcd8c9',
      glow: '#d8f2e4',
      glowStrength: 0.13,
    },
    bloom: { strength: 0.30, radius: 0.5, threshold: 1.0 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="18" width="30" height="12" rx="5" fill="#2f7d5c" stroke="#1c4d38" stroke-width="2.4"/>
      <rect x="6" y="10" width="11" height="10" rx="2.5" fill="#3d9a72" stroke="#1c4d38" stroke-width="2.4"/>
      <rect x="30" y="8" width="7" height="8" rx="1.6" fill="#1c4d38"/>
      <circle cx="13" cy="34" r="5.4" fill="#e8b463" stroke="#8d5f22" stroke-width="2.4"/>
      <circle cx="29" cy="34" r="5.4" fill="#e8b463" stroke="#8d5f22" stroke-width="2.4"/>
      <path d="M13 34h16" stroke="#8d5f22" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M4 42h40" stroke="#8a8f96" stroke-width="2.6" stroke-linecap="round"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.angle = 0.4;      // 車輪の 回転角
    this.speed = 0;        // rad/s
    this.throttle = 0;     // レバー 0..1
    this.pressure = 0.85;  // ボイラーの あつさ 0..1
    this.wheelHeld = false;
    this.distance = 0;     // 走った 長さ（まくら木を 流すのに 使う）
    this.whistle = 0;
    this._chuff = -1;
    this._puff = 0;

    this.radius = 0.112;
    this.center = new THREE.Vector3(0.004, 0.055, 0);
    this.footprint = { w: 0.17, d: 0.075, opacity: 0.30 };

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.06, -0.32, -1.0),
      center: this.center,
      span: 0.125,
      noiseScale: 12,
    });

    this.mats = {
      boiler: M.shell('paint', { color: 0x2f7d5c, roughness: 0.24, clearcoat: 0.9 }),
      cab: M.shell('paint', { color: 0x3d9a72, roughness: 0.26, clearcoat: 0.8 }),
      smokebox: M.shell('coated', { color: 0x3a4048, roughness: 0.44 }),
      band: M.shell('brass', { color: 0xd9a94e }),

      frame: M.part('paint', { color: 0xb03a2e, roughness: 0.30 }),
      wheel: M.part('paint', { color: 0xe8b463, roughness: 0.28, clearcoat: 0.8 }),
      tyre: M.part('steel', { color: 0xb9c2cb, roughness: 0.22 }),
      rod: M.part('steel', { color: 0xdbe2e9, roughness: 0.16 }),
      rodPin: M.part('brass', { color: 0xe6c377 }),
      cyl: M.part('coated', { color: 0x4d5560, roughness: 0.40 }),
      piston: M.part('chrome', { color: 0xe8eef4 }),
      valve: M.part('copper', { color: 0xd08a55 }),
      fire: M.part('emissive', { color: 0xff7a33, emissive: 0xff5a1e, emissiveIntensity: 5.5 }),
      lever: M.part('paint', { color: 0xe0685a, roughness: 0.24 }),
      brass: M.part('brass', { color: 0xe0b657 }),
      rail: M.plain('steel', { color: 0xa8b0b8, roughness: 0.30 }),
      tie: M.plain('wood', { seed: 61, light: '#9c7d55', dark: '#65492c' }),
      ballast: M.plain('coated', { color: 0xc9bda6, roughness: 0.85 }),
    };

    this._buildTrack();
    this._buildFrame();
    this._buildBoiler();
    this._buildWheels();
    this._buildCylinder();
    this._buildRods();
    this._buildCab();
    this._buildSteam();

    this.setXray(0);
  }

  /* --- せんろ ------------------------------------------------------------ */

  _buildTrack() {
    const g = group({ name: 'track' });
    this.root.add(g);

    // バラスト
    mesh(new G.RoundedBoxGeometry(0.2000, 0.0040, 0.0700, 3, 0.0016), this.mats.ballast, {
      parent: g, pos: [0, -0.0018, 0], cast: false,
    });

    // まくら木（流れる）
    this.tieMeshes = [];
    const tie = new G.RoundedBoxGeometry(0.0070, 0.0036, 0.0620, 2, 0.0012);
    for (let i = 0; i < TIES; i++) {
      const m = mesh(tie, this.mats.tie, { parent: g, pos: [0, 0.0018, 0], cast: false });
      this.tieMeshes.push(m);
    }

    // レール
    for (const sz of [-1, 1]) {
      mesh(
        G.extrudeOutline(
          [
            new THREE.Vector2(-0.0034, 0), new THREE.Vector2(0.0034, 0),
            new THREE.Vector2(0.0034, 0.0008), new THREE.Vector2(0.0012, 0.0018),
            new THREE.Vector2(0.0012, 0.0034), new THREE.Vector2(0.0030, 0.0044),
            new THREE.Vector2(0.0030, 0.0056), new THREE.Vector2(-0.0030, 0.0056),
            new THREE.Vector2(-0.0030, 0.0044), new THREE.Vector2(-0.0012, 0.0034),
            new THREE.Vector2(-0.0012, 0.0018), new THREE.Vector2(-0.0034, 0.0008),
          ],
          [],
          0.2000,
          { corner: 0.0004, bevel: 0.0003, curveSegments: 2 },
        ),
        this.mats.rail,
        { parent: g, pos: [0, 0.0036, sz * SIDE_Z], rot: [0, Math.PI / 2, 0], cast: false },
      );
    }
  }

  /* --- だいわく ---------------------------------------------------------- */

  _buildFrame() {
    const g = group({ name: 'frame' });
    this.root.add(g);

    for (const sz of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.1420, 0.0080, 0.0032, 2, 0.0012), this.mats.frame, {
        parent: g, pos: [0.0020, AXLE_Y + 0.0110, sz * 0.0140], cast: false,
      });
    }
    // 前後の はり
    for (const x of [-0.0560, 0.0660]) {
      mesh(new G.RoundedBoxGeometry(0.0060, 0.0090, 0.0330, 2, 0.0014), this.mats.frame, {
        parent: g, pos: [x, AXLE_Y + 0.0100, 0], cast: false,
      });
    }
    // バッファ（前の あて板）
    mesh(new G.RoundedBoxGeometry(0.0050, 0.0230, 0.0420, 3, 0.0018), this.mats.frame, {
      parent: g, pos: [0.0770, AXLE_Y + 0.0060, 0],
    });
  }

  /* --- ボイラー ---------------------------------------------------------- */

  _buildBoiler() {
    const g = group({ name: 'boiler' });

    // 胴
    const body = mesh(G.chamferedCylinder(BOILER_R, 0.0740, 0.0016, 36), this.mats.boiler, {
      parent: g, pos: [0.0080, BOILER_Y, 0],
    });
    body.rotation.z = Math.PI / 2;
    // 帯
    for (const x of [-0.0180, 0.0080, 0.0330]) {
      const b = mesh(G.ring(BOILER_R + 0.0012, BOILER_R - 0.0010, 0.0034, 34), this.mats.band, {
        parent: g, pos: [x, BOILER_Y, 0], cast: false,
      });
      b.rotation.z = Math.PI / 2;
    }
    // けむりばこ（前の 黒い ところ）
    const sb = mesh(G.chamferedCylinder(BOILER_R + 0.0014, 0.0180, 0.0016, 36), this.mats.smokebox, {
      parent: g, pos: [0.0530, BOILER_Y, 0],
    });
    sb.rotation.z = Math.PI / 2;
    mesh(new THREE.SphereGeometry(BOILER_R + 0.0010, 24, 14, 0, TAU, 0, Math.PI / 2), this.mats.smokebox, {
      parent: g, pos: [0.0620, BOILER_Y, 0], rot: [0, 0, -Math.PI / 2],
    });

    // えんとつ
    mesh(
      G.lathe(
        [
          [0, 0], [0.0072, 0], [0.0070, 0.0060], [0.0064, 0.0140],
          [0.0092, 0.0160], [0.0094, 0.0186], [0.0074, 0.0188], [0, 0.0190],
        ],
        { segments: 24, center: false },
      ),
      this.mats.smokebox,
      { parent: g, pos: [0.0520, BOILER_Y + BOILER_R - 0.0020, 0] },
    );
    this.stackTop = new THREE.Vector3(0.0520, BOILER_Y + BOILER_R + 0.0170, 0);

    // じょうきドーム と 安全弁
    mesh(
      G.lathe([[0, 0], [0.0088, 0], [0.0090, 0.0034], [0.0074, 0.0072], [0.0040, 0.0092], [0, 0.0096]], { segments: 22, center: false }),
      this.mats.band,
      { parent: g, pos: [0.0200, BOILER_Y + BOILER_R - 0.0030, 0] },
    );
    mesh(
      G.lathe([[0, 0], [0.0052, 0], [0.0050, 0.0028], [0.0030, 0.0060], [0, 0.0062]], { segments: 18, center: false }),
      this.mats.band,
      { parent: g, pos: [-0.0040, BOILER_Y + BOILER_R - 0.0026, 0], cast: false },
    );

    this.addShell(g);

    /* --- 火（ボイラーの 中身。すけると 見える） --- */
    const guts = group({ name: 'firebox' });
    this.root.add(guts);
    // 煙管（けむりが 通る 管）
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const r = BOILER_R * 0.52;
      const t = mesh(G.chamferedCylinder(0.0022, 0.0660, 0.0003, 8), this.mats.brass, {
        parent: guts, pos: [0.0080, BOILER_Y + Math.sin(a) * r, Math.cos(a) * r], cast: false, receive: false,
      });
      t.rotation.z = Math.PI / 2;
    }
    // 火室（うしろで 赤く 光る）
    this.fireMesh = mesh(new G.RoundedBoxGeometry(0.0150, 0.0130, 0.0200, 3, 0.0030), this.mats.fire, {
      parent: guts, pos: [-0.0230, BOILER_Y - 0.0090, 0], cast: false, receive: false,
    });
  }

  /* --- 車輪 -------------------------------------------------------------- */

  _buildWheels() {
    const g = group({ name: 'wheels' });
    this.root.add(g);

    this.wheelGroups = [];   // [side][i]  side 0 = 手前(+Z), 1 = 奥(-Z)
    const wheelGeo = G.spokedWheel({
      rimR: WHEEL_R, rimW: 0.0056, rimT: 0.0040, hubR: 0.0044, hubW: 0.0080,
      spokes: 10, spokeR: 0.0011, flange: 0.0020,
    });
    const tyreGeo = G.pipe(WHEEL_R + 0.0002, WHEEL_R - 0.0012, 0.0058, { segments: 44, chamfer: 0.0004 });
    tyreGeo.rotateX(Math.PI / 2);

    for (let s = 0; s < 2; s++) {
      const row = [];
      const sz = s === 0 ? 1 : -1;
      for (let i = 0; i < WHEEL_X.length; i++) {
        const w = group({ parent: g, pos: [WHEEL_X[i], AXLE_Y, sz * SIDE_Z] });
        row.push(w);
        mesh(wheelGeo, this.mats.wheel, { parent: w, cast: false });
        mesh(tyreGeo, this.mats.tyre, { parent: w, cast: false });
        // クランクピン（外側へ 出っぱる）
        mesh(G.chamferedCylinder(0.0022, 0.0080, 0.0004, 12), this.mats.rodPin, {
          parent: w, pos: [CRANK_R, 0, sz * 0.0044], rot: [Math.PI / 2, 0, 0], cast: false,
        });
        // つりあいおもり（クランクピンの 反対がわ）
        const cw = mesh(
          G.extrudeOutline(
            [
              new THREE.Vector2(-0.0118, -0.0034), new THREE.Vector2(-0.0034, -0.0104),
              new THREE.Vector2(0.0034, -0.0104), new THREE.Vector2(0.0118, -0.0034),
            ],
            [], 0.0032, { corner: 0.0026, bevel: 0.0005 },
          ),
          this.mats.tyre,
          { parent: w, pos: [0, 0, sz * 0.0014], cast: false },
        );
        cw.rotation.z = 0;
      }
      this.wheelGroups.push(row);
    }

    // 車軸
    for (let i = 0; i < WHEEL_X.length; i++) {
      const ax = mesh(G.chamferedCylinder(0.0026, SIDE_Z * 2, 0.0004, 14), this.mats.rod, {
        parent: g, pos: [WHEEL_X[i], AXLE_Y, 0], cast: false,
      });
      ax.rotation.x = Math.PI / 2;
    }

    // 手前の 動輪を 直接 まわせる
    const main = this.wheelGroups[0][MAIN_WHEEL];
    hitCylinder(main, WHEEL_R + 0.004, 0.016, [0, 0, 0.004], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'wheel',
      label: 'どうりん',
      type: 'rotate',
      object: main,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: main,
      primary: true,
      hint: { kind: 'spin', offset: [0, 0, 0.026], size: 0.020 },
      onRotate: (d) => {
        this.angle += d;
        this.distance += d * WHEEL_R;
        this.speed = 0;
        this._chuffCheck();
      },
      onFling: (v) => {
        this.speed = clamp(v, -26, 26);
      },
      onGrab: () => {
        this.wheelHeld = true;
      },
      onRelease: () => {
        this.wheelHeld = false;
      },
    });
  }

  /* --- シリンダーとバルブ ------------------------------------------------ */

  _buildCylinder() {
    const g = group({ name: 'cylinder' });
    this.root.add(g);

    for (const sz of [1, -1]) {
      // シリンダーの 胴（すけすけ対象にして、中の ピストンを 見せる）
      const body = mesh(G.pipe(CYL_R, CYL_R - 0.0014, 0.0300, { segments: 26, chamfer: 0.0006 }),
        this.M.shell('coated', { color: 0x4d5560, roughness: 0.40 }),
        { parent: g, pos: [CYL_X, AXLE_Y, sz * SIDE_Z], cast: false });
      body.rotation.z = Math.PI / 2;
      // ふた
      for (const dx of [-0.0150, 0.0150]) {
        const cap = mesh(G.chamferedCylinder(CYL_R + 0.0014, 0.0028, 0.0006, 26), this.mats.cyl, {
          parent: g, pos: [CYL_X + dx, AXLE_Y, sz * SIDE_Z], cast: false,
        });
        cap.rotation.z = Math.PI / 2;
      }
      // じょうき室（上の 箱。中で バルブが すべる）
      mesh(new G.RoundedBoxGeometry(0.0300, 0.0090, 0.0140, 2, 0.0022), this.mats.cyl, {
        parent: g, pos: [CYL_X, AXLE_Y + CYL_R + 0.0056, sz * SIDE_Z], cast: false,
      });
    }

    // ピストン と バルブ（手前がわ だけ 動かす。奥は 90°ずれた 見た目のまま）
    this.pistonMeshes = [];
    this.valveMeshes = [];
    this.crossheadGroups = [];
    for (let s = 0; s < 2; s++) {
      const sz = s === 0 ? 1 : -1;

      const p = mesh(G.chamferedCylinder(CYL_R - 0.0020, 0.0060, 0.0006, 22), this.mats.piston, {
        parent: g, pos: [CYL_X, AXLE_Y, sz * SIDE_Z], cast: false,
      });
      p.rotation.z = Math.PI / 2;
      this.pistonMeshes.push(p);

      const v = mesh(new G.RoundedBoxGeometry(0.0110, 0.0046, 0.0090, 2, 0.0012), this.mats.valve, {
        parent: g, pos: [CYL_X, AXLE_Y + CYL_R + 0.0056, sz * SIDE_Z], cast: false,
      });
      this.valveMeshes.push(v);

      // クロスヘッド（まっすぐ しか 動けない すべり子）
      const ch = group({ parent: g, pos: [CYL_X - 0.0230, AXLE_Y, sz * SIDE_Z] });
      this.crossheadGroups.push(ch);
      mesh(new G.RoundedBoxGeometry(0.0080, 0.0110, 0.0060, 2, 0.0016), this.mats.piston, {
        parent: ch, cast: false,
      });
      // ピストン棒
      mesh(G.chamferedCylinder(0.0018, 0.0300, 0.0003, 10), this.mats.piston, {
        parent: ch, pos: [0.0150, 0, 0], rot: [0, 0, Math.PI / 2], cast: false,
      });
      // すべり棒（クロスヘッドの レール）
      for (const dy of [-0.0072, 0.0072]) {
        mesh(new G.RoundedBoxGeometry(0.0340, 0.0022, 0.0038, 1, 0.0008), this.mats.rod, {
          parent: g, pos: [CYL_X - 0.0300, AXLE_Y + dy, sz * SIDE_Z], cast: false,
        });
      }
    }
  }

  /* --- ロッド ------------------------------------------------------------ */

  _buildRods() {
    const g = group({ name: 'rods' });
    this.root.add(g);

    // メインロッド と サイドロッド は 毎フレーム 2点に 張り直す
    const rodGeo = G.extrudeOutline(
      [
        new THREE.Vector2(-0.0030, -0.5), new THREE.Vector2(0.0030, -0.5),
        new THREE.Vector2(0.0030, 0.5), new THREE.Vector2(-0.0030, 0.5),
      ],
      [], 0.0034, { corner: 0.0028, bevel: 0.0006 },
    );

    this.mainRods = [];
    this.sideRods = [];  // [side][0] = 前-中, [side][1] = 中-後
    for (let s = 0; s < 2; s++) {
      this.mainRods.push(mesh(rodGeo, this.mats.rod, { parent: g, cast: false }));
      this.sideRods.push([
        mesh(rodGeo, this.mats.rod, { parent: g, cast: false }),
        mesh(rodGeo, this.mats.rod, { parent: g, cast: false }),
      ]);
    }
    // バルブを 動かす 偏心ロッド
    this.eccRods = [
      mesh(rodGeo, this.mats.valve, { parent: g, cast: false }),
      mesh(rodGeo, this.mats.valve, { parent: g, cast: false }),
    ];
  }

  /* --- うんてんだい ------------------------------------------------------ */

  _buildCab() {
    const g = group({ name: 'cab' });

    const CAB_X = -0.0430;
    // ゆか と 屋根
    mesh(new G.RoundedBoxGeometry(0.0360, 0.0040, 0.0480, 2, 0.0014), this.mats.cab, {
      parent: g, pos: [CAB_X, AXLE_Y + 0.0140, 0],
    });
    mesh(new G.RoundedBoxGeometry(0.0420, 0.0044, 0.0520, 3, 0.0018), this.mats.cab, {
      parent: g, pos: [CAB_X, 0.0880, 0],
    });
    // 横の かべ（まどつき）
    for (const sz of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0360, 0.0180, 0.0040, 2, 0.0014), this.mats.cab, {
        parent: g, pos: [CAB_X, AXLE_Y + 0.0230, sz * 0.0240],
      });
      for (const dx of [-0.0090, 0.0090]) {
        mesh(new G.RoundedBoxGeometry(0.0130, 0.0180, 0.0040, 2, 0.0014), this.mats.cab, {
          parent: g, pos: [CAB_X + dx, 0.0770, sz * 0.0240], cast: false,
        });
      }
      mesh(new G.RoundedBoxGeometry(0.0360, 0.0060, 0.0040, 2, 0.0014), this.mats.cab, {
        parent: g, pos: [CAB_X, 0.0850, sz * 0.0240], cast: false,
      });
    }
    // 後ろの かべ
    mesh(new G.RoundedBoxGeometry(0.0040, 0.0420, 0.0480, 2, 0.0014), this.mats.cab, {
      parent: g, pos: [CAB_X - 0.0170, AXLE_Y + 0.0350, 0],
    });

    this.addShell(g);

    /* --- レバーと 汽笛（中身） --- */
    const guts = group({ name: 'cabGuts' });
    this.root.add(guts);

    // じょうき レバー（引くと 開く）
    const lever = group({ parent: guts, pos: [CAB_X + 0.0130, 0.0710, 0.0090] });
    this.leverGroup = lever;
    mesh(new G.RoundedBoxGeometry(0.0044, 0.0230, 0.0044, 2, 0.0014), this.mats.lever, {
      parent: lever, pos: [0, 0.0100, 0], cast: false,
    });
    mesh(new THREE.SphereGeometry(0.0044, 14, 10), this.mats.brass, {
      parent: lever, pos: [0, 0.0220, 0], cast: false,
    });
    mesh(G.ring(0.0110, 0.0092, 0.0028, 22), this.mats.brass, {
      parent: guts, pos: [CAB_X + 0.0130, 0.0710, 0.0090], cast: false,
    });

    hitSphere(lever, 0.0110, [0, 0.0180, 0]);
    this.handle({
      id: 'throttle',
      label: 'じょうき レバー',
      type: 'rotate',
      object: lever,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: lever,
      gain: 0.9,
      hint: { kind: 'pull', offset: [0, 0.030, 0.014], size: 0.011 },
      onRotate: (d) => {
        this.throttle = clamp01(this.throttle + d * 1.1);
      },
    });

    // 汽笛
    const wh = group({ parent: guts, pos: [-0.0170, BOILER_Y + BOILER_R + 0.0030, 0] });
    this.whistleGroup = wh;
    mesh(
      G.lathe([[0, 0], [0.0040, 0], [0.0038, 0.0090], [0.0050, 0.0100], [0.0046, 0.0116], [0, 0.0118]], { segments: 18, center: false }),
      this.mats.brass,
      { parent: wh, cast: false },
    );
    hitSphere(wh, 0.0100, [0, 0.0060, 0]);
    this.handle({
      id: 'whistle',
      label: 'きてき',
      type: 'press',
      object: wh,
      hint: { kind: 'pull', offset: [0, 0.020, 0.012], size: 0.010 },
      onPress: () => {
        this.whistleHeld = true;
        this.audio.chime(880, { gain: 0.14 });
      },
      onRelease: () => {
        this.whistleHeld = false;
      },
    });
  }

  /* --- じょうき ---------------------------------------------------------- */

  _buildSteam() {
    const scale = this.tier === 'low' ? 0.4 : this.tier === 'mid' ? 0.7 : 1;
    this.steam = new ParticleField({
      count: Math.round(340 * scale),
      color: 0xffffff,
      color2: 0xdfe9f2,
      opacity: 0.30,
      stretch: 0.05,
      width: 0.0110,
      minLength: 0.0110,
      softness: 2.2,
      bounds: 0.5,
      seed: 7171,
    });
    this.root.add(this.steam.object);
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  /** その側の クランク角。奥がわは きっかり 90°ずれている（quartering） */
  _crankAngle(side) {
    return this.angle + (side === 0 ? 0 : Math.PI / 2);
  }

  /** 1回転に 4回 「シュッ」と 鳴らす */
  _chuffCheck() {
    const q = Math.floor(mod(this.angle, TAU) / (Math.PI / 2));
    if (q !== this._chuff) {
      if (this._chuff >= 0) {
        const v = clamp01(Math.abs(this.speed) / 18);
        this.audio.tick({ gain: 0.06 + v * 0.20, pitch: 0.34 + v * 0.20 });
        this._puff = 1;
      }
      this._chuff = q;
    }
  }

  step(dt) {
    // ボイラーの あつさ: 使うと 減り、待つと たまる
    const use = this.throttle * clamp01(Math.abs(this.speed) / 6 + 0.35);
    this.pressure = clamp01(this.pressure + (0.13 - use * 0.30) * dt);

    if (!this.wheelHeld) {
      // 引っぱる力は「レバーの 開き × あつさ」。速くなるほど 効きが 落ちる。
      const pull = this.throttle * this.pressure * 62;
      const drag = 1.5 + Math.abs(this.speed) * 0.30;
      this.speed += (pull - drag * this.speed) * dt;
      this.speed = clamp(this.speed, -26, 26);
    } else {
      this.speed = damp(this.speed, 0, 30, dt);
    }

    this.angle += this.speed * dt;
    this.distance += this.speed * dt * WHEEL_R;
    this._chuffCheck();

    this._puff = Math.max(0, this._puff - dt * 5);
    this.whistle = damp(this.whistle, this.whistleHeld ? 1 : 0, 12, dt);
  }

  lateUpdate(dt) {
    const a0 = this._crankAngle(0);
    const a1 = this._crankAngle(1);

    /* 車輪 */
    for (let s = 0; s < 2; s++) {
      const a = s === 0 ? a0 : a1;
      for (const w of this.wheelGroups[s]) w.rotation.z = a;
    }

    /* ロッド類 */
    for (let s = 0; s < 2; s++) {
      const a = s === 0 ? a0 : a1;
      const sz = (s === 0 ? 1 : -1) * (SIDE_Z + 0.0058);
      const cs = Math.cos(a);
      const sn = Math.sin(a);

      // クランクピンの 位置
      const pin = (i) => this._a.set(WHEEL_X[i] + cs * CRANK_R, AXLE_Y + sn * CRANK_R, sz);

      // メインロッド: 動輪の ピン ←→ クロスヘッド
      const py = sn * CRANK_R;
      const dx = Math.sqrt(Math.max(ROD_LEN * ROD_LEN - py * py, 1e-6));
      const chX = WHEEL_X[MAIN_WHEEL] + cs * CRANK_R + dx;
      this.crossheadGroups[s].position.x = chX;

      this._a.set(WHEEL_X[MAIN_WHEEL] + cs * CRANK_R, AXLE_Y + py, sz);
      this._b.set(chX, AXLE_Y, sz);
      stretchBetween(this.mainRods[s], this._a, this._b);

      // サイドロッド: 3つの ピンを つなぐ（どのピンも 同じ 角度）
      const p0 = pin(0).clone();
      const p1 = pin(1).clone();
      const p2 = pin(2).clone();
      stretchBetween(this.sideRods[s][0], p0, p1);
      stretchBetween(this.sideRods[s][1], p1, p2);

      // ピストン は クロスヘッドと 同じだけ 動く
      this.pistonMeshes[s].position.x = chX + 0.0230;

      // バルブ は 車輪より 90°先まわり（前と後ろに 交互に じょうきを 入れる）
      const va = a + Math.PI / 2;
      const vx = CYL_X + Math.cos(va) * 0.0044;
      this.valveMeshes[s].position.x = vx;
      // 偏心ロッド
      this._a.set(WHEEL_X[MAIN_WHEEL] + Math.cos(va) * 0.0060, AXLE_Y + Math.sin(va) * 0.0060, sz);
      this._b.set(vx - 0.0055, AXLE_Y + CYL_R + 0.0056, sz);
      stretchBetween(this.eccRods[s], this._a, this._b);
    }

    /* まくら木を 流す */
    const span = TIE_GAP * TIES;
    for (let i = 0; i < TIES; i++) {
      const x = mod(i * TIE_GAP - this.distance * 5.5, span) - span / 2;
      this.tieMeshes[i].position.x = x;
    }

    /* レバー・汽笛・火 */
    this.leverGroup.rotation.z = lerp(0.55, -0.55, this.throttle);
    this.whistleGroup.scale.setScalar(1 + this.whistle * 0.06);
    this.fireMesh.material.emissiveIntensity = 2.0 + this.pressure * 5.0 + this._puff * 1.4;

    this._updateSteam(dt);
    this._updateSound();
  }

  _updateSteam(dt) {
    const v = clamp01(Math.abs(this.speed) / 16);
    // えんとつ から 出る けむり。シュッ の たびに どっと 出る。
    const n = Math.round((0.6 + v * 2.2 + this._puff * 6) * (this.tier === 'low' ? 0.4 : 1));
    for (let i = 0; i < n; i++) {
      const j = (Math.random() - 0.5) * 0.006;
      this.steam.emit(
        [this.stackTop.x + j, this.stackTop.y, this.stackTop.z + j],
        [0.02 + Math.random() * 0.03, 0.10 + v * 0.22 + this._puff * 0.18, (Math.random() - 0.5) * 0.03],
        1.1 + Math.random() * 0.7,
        0.8 + Math.random() * 0.9,
      );
    }
    // 汽笛の けむり
    if (this.whistle > 0.2) {
      this.steam.emit(
        [-0.0170, BOILER_Y + BOILER_R + 0.0140, 0],
        [0.05 + Math.random() * 0.05, 0.10, (Math.random() - 0.5) * 0.05],
        0.7, 0.5,
      );
    }
    this.steam.update(dt, (i, px, py, pz, vx, vy, vz, out) => {
      out[0] = vx * 0.985 + 0.05 * dt;   // ゆっくり 後ろへ ながれる
      out[1] = vy * 0.975 + 0.02 * dt;
      out[2] = vz * 0.985;
    });
  }

  _updateSound() {
    const v = clamp01(Math.abs(this.speed) / 20);
    const roll = this.audio.voice('trainRoll', { source: 'noise', filter: 'bandpass', freq: 180, Q: 3 });
    roll.set({ level: v * 0.09, freq: 150 + v * 260, smooth: 0.1 });

    const wh = this.audio.voice('trainWhistle', { source: 'saw', filter: 'bandpass', freq: 900, Q: 8, detune: 12 });
    wh.set({ level: this.whistle * 0.09, freq: 780, smooth: 0.05 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'speed', icon: 'gauge', label: 'はやさ', value: clamp01(Math.abs(this.speed) / 22), color: '#2f7d5c' },
      { id: 'steam', icon: 'heat', label: 'じょうき', value: this.pressure, color: '#e07a3f' },
    ];
  }

  reset() {
    this.angle = 0.4;
    this.speed = 0;
    this.throttle = 0;
    this.pressure = 0.85;
    this.distance = 0;
    this.whistleHeld = false;
  }
}
