/**
 * beater.js — あわだてき
 *
 * 「よこに まわす 力を、たてに まわす 力へ 曲げる」しくみ
 * （かさ歯車 / クラウンギヤ）を 見せる機械。
 *
 *   ハンドルを よこに まわす
 *     → 大きい 歯車（クラウンホイール）が よこの じくで まわる
 *     → その 面についた 歯が、たての じくの 小さい歯車 2つを 押す
 *     → 2つは 大きい歯車の 右と左に いるので、たがいに 逆へ まわる
 *     → 逆に まわる 2本の あわだて器が、あいだの たまごを 引っぱりあう
 *
 *   まぜるほど あわが ふえ、ふえるほど 重くなって 手ごたえが 変わる。
 *
 * さわりどころ:
 *   - ハンドルを まわす（速いほど 早く あわだつ）
 *   - あわだて器を 指で つかむと、歯車ごと ぜんぶ 止まる
 *   - ボウルの ふちを つかんで かたむける
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, TAU } from '../lib/math.js';

/** クラウンホイール（大きい歯車） */
const CROWN_R = 0.0230;
const CROWN_TEETH = 30;
const CROWN_Y = 0.1010;
const CROWN_Z = -0.0040;
/** ピニオン（小さい歯車。たての じく） */
const PIN_TEETH = 10;
const PIN_R = 0.0090;
/** ピニオンは クラウンの 少し下、左右に つく（じくが 胴を よけて 下りられる） */
const PIN_X = 0.0164;
const PIN_DY = 0.0100;
/** ギヤ比 */
const RATIO = CROWN_TEETH / PIN_TEETH;
/** あわだて器 */
const WHISK_TOP = CROWN_Y - 0.0130;
const WHISK_LEN = 0.0560;
/** ボウル */
const BOWL_R = 0.0480;
const BOWL_Y = 0.0060;

export class Beater extends Machine {
  static meta = {
    id: 'beater',
    name: 'あわだてき',
    sub: 'よこが たてに なる',
    accent: 0xf2b33d,
    backdrop: {
      top: '#fffaf0',
      middle: '#fdefd4',
      bottom: '#e6cfa6',
      glow: '#ffeec2',
      glowStrength: 0.14,
    },
    bloom: { strength: 0.30, radius: 0.5, threshold: 1.0 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M8 28a16 8 0 0 0 32 0" fill="#e8eef4" stroke="#7d8792" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M8 28h32" stroke="#7d8792" stroke-width="2.4"/>
      <circle cx="24" cy="12" r="7" fill="#f2b33d" stroke="#9a6d17" stroke-width="2.4"/>
      <path d="M20 19v7M28 19v7" stroke="#7d8792" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M31 12h6" stroke="#9a6d17" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="39" cy="12" r="2.6" fill="#e0685a"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.crank = 0;
    this.crankVel = 0;
    this.foam = 0;        // あわの ぐあい 0..1
    this.held = false;
    this.tilt = 0;

    this.radius = 0.100;
    this.center = new THREE.Vector3(0, 0.080, 0);
    this.footprint = { w: 0.108, d: 0.108, opacity: 0.32 };
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.10, -0.28, -1.0),
      center: this.center,
      span: 0.108,
      noiseScale: 13,
    });

    this.mats = {
      housing: M.shell('paint', { color: 0xf2b33d, roughness: 0.24, clearcoat: 0.9 }),
      housingDeep: M.shell('paint', { color: 0xc98a1e, roughness: 0.28 }),
      bowl: M.shell('glass', { color: 0xdff0fb, opacity: 0.20 }),

      crown: M.part('brass', { color: 0xd9a94e }),
      pinion: M.part('steel', { color: 0xc6ced6, roughness: 0.20 }),
      shaft: M.part('steel', { color: 0xdbe2e9, roughness: 0.16 }),
      wire: M.part('chrome', { color: 0xe8eef4 }),
      handle: M.part('softPlastic', { color: 0xe0685a }),
      grip: M.part('wood', { seed: 51, light: '#e0c08a', dark: '#a87c46' }),
      batter: M.part('water', { color: 0xf7dc8e, opacity: 0.86 }),
      foam: M.part('plastic', { color: 0xfff6e2, roughness: 0.62, clearcoat: 0.4 }),
      bubble: M.part('glass', { color: 0xfffdf4, opacity: 0.36 }),
      base: M.plain('coated', { color: 0xd8cbb4, roughness: 0.8 }),
    };

    this._buildBowl();
    this._buildBody();
    this._buildGears();
    this._buildWhisks();

    this.setXray(0);
  }

  /* --- ボウルと たね ------------------------------------------------------ */

  _buildBowl() {
    const g = group({ name: 'bowl', pos: [0, BOWL_Y, 0] });
    this.bowlGroup = g;
    this.root.add(g);

    // 台
    mesh(G.lathe([[0, 0], [BOWL_R * 0.62, 0], [BOWL_R * 0.60, 0.0034], [0, 0.0036]], { segments: 30, center: false }),
      this.mats.base, { parent: this.root, pos: [0, 0, 0], cast: false });

    // ボウル（外がわ）
    const prof = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = lerp(Math.PI, Math.PI * 0.5, t);
      prof.push([Math.abs(Math.cos(a)) * BOWL_R, (1 + Math.sin(a - Math.PI / 2)) * 0.0000 + (1 - Math.cos(a + Math.PI)) * 0]);
    }
    // 半球を 素直に 作る
    const bowlProfile = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = lerp(-Math.PI / 2, 0.16, t);
      bowlProfile.push([Math.cos(a) * BOWL_R, BOWL_R + Math.sin(a) * BOWL_R]);
    }
    bowlProfile.push([BOWL_R * 1.05, BOWL_R + Math.sin(0.16) * BOWL_R + 0.0020]);
    const shell = mesh(G.lathe(bowlProfile, { segments: 40, center: false }), this.mats.bowl, { parent: g });
    shell.renderOrder = 24;
    this.bowlShell = shell;

    // たね（中身）。まぜると かさが ふえて 白っぽくなる。
    this.batterMesh = mesh(
      G.lathe(
        (() => {
          const p = [];
          for (let i = 0; i <= 14; i++) {
            const t = i / 14;
            const a = lerp(-Math.PI / 2, -0.10, t);
            p.push([Math.cos(a) * (BOWL_R - 0.0020), BOWL_R + Math.sin(a) * (BOWL_R - 0.0020)]);
          }
          p.push([0, BOWL_R + Math.sin(-0.10) * (BOWL_R - 0.0020)]);
          return p;
        })(),
        { segments: 36, center: false },
      ),
      this.mats.batter,
      { parent: g, cast: false },
    );
    this.batterMesh.renderOrder = 20;

    // あわ（うえに たまる）
    this.foamMesh = mesh(
      G.lathe([[0, 0], [BOWL_R * 0.94, 0], [BOWL_R * 0.92, 0.0060], [BOWL_R * 0.60, 0.0092], [0, 0.0100]], { segments: 36, center: false }),
      this.mats.foam,
      { parent: g, cast: false },
    );
    this.foamMesh.renderOrder = 21;

    // あわの つぶ
    this.bubbleMeshes = [];
    const bub = new THREE.SphereGeometry(0.0044, 12, 9);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU * 3.1;
      const r = BOWL_R * (0.20 + 0.62 * ((i * 7) % 11) / 11);
      const m = mesh(bub, this.mats.bubble, {
        parent: g, pos: [Math.cos(a) * r, 0, Math.sin(a) * r], cast: false, receive: false,
      });
      m.scale.setScalar(0.6 + ((i * 5) % 7) / 7);
      m.renderOrder = 22;
      this.bubbleMeshes.push({ node: m, r, a, phase: (i / 16) * TAU });
    }

    hitProxy(g, new THREE.TorusGeometry(BOWL_R, 0.0090, 8, 26), { pos: [0, BOWL_R + 0.0060, 0], rot: [Math.PI / 2, 0, 0] });
    this.handle({
      id: 'bowl',
      label: 'ボウル',
      type: 'rotate',
      object: g,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: g,
      gain: 0.4,
      onRotate: (d) => {
        this.tilt = clamp(this.tilt + d, -0.34, 0.34);
      },
    });
  }

  /* --- 胴（ハンドルと 歯車の 家） ---------------------------------------- */

  _buildBody() {
    const g = group({ name: 'body' });

    // 歯車の 家
    mesh(new G.RoundedBoxGeometry(0.0560, 0.0300, 0.0210, 4, 0.0060), this.mats.housing, {
      parent: g, pos: [0, CROWN_Y, CROWN_Z],
    });
    // にぎり（上に のびる 棒）
    mesh(G.chamferedCylinder(0.0052, 0.0300, 0.0010, 18), this.mats.housingDeep, {
      parent: g, pos: [0, CROWN_Y + 0.0290, CROWN_Z],
    });
    mesh(
      G.lathe([[0, 0], [0.0090, 0.0010], [0.0100, 0.0060], [0.0092, 0.0180], [0.0060, 0.0210], [0, 0.0214]], { segments: 22, center: false }),
      this.mats.grip,
      { parent: g, pos: [0, CROWN_Y + 0.0430, CROWN_Z] },
    );
    // ピニオンの じくうけ
    for (const sx of [-1, 1]) {
      mesh(G.chamferedCylinder(0.0060, 0.0100, 0.0014, 16), this.mats.housing, {
        parent: g, pos: [sx * PIN_X, CROWN_Y - PIN_DY - 0.0040, CROWN_Z], cast: false,
      });
    }

    this.addShell(g);
  }

  /* --- 歯車 -------------------------------------------------------------- */

  _buildGears() {
    const g = group({ name: 'gears' });
    this.root.add(g);

    /* クラウンホイール: よこの じく（Z）で まわる。
       面（-Z がわ）に 歯が 立っていて、たての ピニオンを 押す。 */
    const crown = group({ parent: g, pos: [0, CROWN_Y, CROWN_Z] });
    this.crownGroup = crown;
    const disc = mesh(G.pipe(CROWN_R, CROWN_R - 0.0075, 0.0034, { segments: 44, chamfer: 0.0008 }), this.mats.crown, {
      parent: crown, cast: false,
    });
    disc.rotation.x = Math.PI / 2;
    // ウェブ と ハブ
    const web = mesh(G.chamferedCylinder(CROWN_R - 0.0070, 0.0018, 0.0004, 40), this.mats.crown, {
      parent: crown, cast: false,
    });
    web.rotation.x = Math.PI / 2;
    const hub = mesh(G.chamferedCylinder(0.0072, 0.0110, 0.0012, 20), this.mats.crown, { parent: crown, cast: false });
    hub.rotation.x = Math.PI / 2;
    // 面の 歯（軸方向に 立つ 小さな 板）
    const tooth = new G.RoundedBoxGeometry(0.0026, 0.0056, 0.0044, 1, 0.0008);
    for (let i = 0; i < CROWN_TEETH; i++) {
      const a = (i / CROWN_TEETH) * TAU;
      const t = mesh(tooth, this.mats.crown, {
        parent: crown,
        pos: [Math.cos(a) * (CROWN_R - 0.0038), Math.sin(a) * (CROWN_R - 0.0038), -0.0040],
        rot: [0, 0, a],
        cast: false,
      });
      t.name = 'crownTooth';
    }

    /* ハンドル */
    const crank = group({ parent: crown, pos: [0, 0, 0.0155] });
    this.crankGroup = crank;
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0044, -0.0038), new THREE.Vector2(0.0250, -0.0032),
          new THREE.Vector2(0.0250, 0.0032), new THREE.Vector2(-0.0044, 0.0038),
        ],
        [], 0.0032, { corner: 0.0030, bevel: 0.0006 },
      ),
      this.mats.handle,
      { parent: crank, pos: [0, 0, 0.0020] },
    );
    const knob = mesh(
      G.lathe([[0, 0], [0.0050, 0.0006], [0.0058, 0.0030], [0.0054, 0.0100], [0, 0.0108]], { segments: 20, center: false }),
      this.mats.grip,
      { parent: crank, pos: [0.0250, 0, 0.0044] },
    );
    knob.rotation.x = -Math.PI / 2;

    hitSphere(crank, 0.0130, [0.0250, 0, 0.0100]);
    hitCylinder(crank, 0.0100, 0.024, [0.0120, 0, 0.0060], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'crank',
      label: 'ハンドル',
      type: 'rotate',
      object: crank,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: crank,
      primary: true,
      hint: { kind: 'spin', offset: [0, 0, 0.030], size: 0.022 },
      onRotate: (d) => {
        if (this.held) return;
        this.crank += d;
        this.crankVel = 0;
        this._mix(Math.abs(d));
      },
      onFling: (v) => {
        if (!this.held) this.crankVel = clamp(v, -22, 22);
      },
    });

    /* ピニオン 2つ: たての じく。左右に いるので 逆に まわる。 */
    this.pinionGroups = [];
    for (const sx of [-1, 1]) {
      const p = group({ parent: g, pos: [sx * PIN_X, CROWN_Y - PIN_DY, CROWN_Z - 0.0060] });
      this.pinionGroups.push({ node: p, sx });
      const gear = mesh(
        G.gearGeometry({ teeth: PIN_TEETH, module: (PIN_R * 2) / PIN_TEETH, thickness: 0.0030, bore: 0.0018, hub: 0.0034, hubHeight: 0.0010 }),
        this.mats.pinion,
        { parent: p, cast: false },
      );
      gear.rotation.x = Math.PI / 2;
    }
  }

  /* --- あわだて器 -------------------------------------------------------- */

  _buildWhisks() {
    const g = group({ name: 'whisks' });
    this.root.add(g);

    this.whiskGroups = [];
    for (const sx of [-1, 1]) {
      const w = group({ parent: g, pos: [sx * PIN_X, WHISK_TOP, CROWN_Z - 0.0060] });
      this.whiskGroups.push(w);

      // じく
      mesh(G.chamferedCylinder(0.0018, 0.0170, 0.0003, 10), this.mats.shaft, {
        parent: w, pos: [0, -0.0060, 0], cast: false,
      });

      // 針金の わ（4枚）
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI;
        const pts = [];
        const N = 18;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const th = lerp(-Math.PI / 2, Math.PI / 2, t);
          // たまご形の わ
          const rr = Math.cos(th) * 0.0150 * (0.55 + 0.45 * Math.sin(t * Math.PI));
          pts.push(new THREE.Vector3(Math.cos(a) * rr, -0.0150 - (t * WHISK_LEN * 0.62), Math.sin(a) * rr));
        }
        // 下で 閉じる
        mesh(G.tubeFromPoints(pts, 0.0009, { radialSegments: 5 }), this.mats.wire, {
          parent: w, cast: false, receive: false,
        });
      }
      // 先の まとめ
      mesh(new THREE.SphereGeometry(0.0026, 12, 9), this.mats.wire, {
        parent: w, pos: [0, -0.0150 - WHISK_LEN * 0.62, 0], cast: false,
      });

      hitCylinder(w, 0.0150, WHISK_LEN * 0.7, [0, -0.0150 - WHISK_LEN * 0.31, 0]);
      this.handle({
        id: sx < 0 ? 'whiskL' : 'whiskR',
        label: 'あわだてき',
        type: 'grab',
        object: w,
        hint: sx > 0 ? { kind: 'hold', offset: [0, -0.030, 0.014], size: 0.012 } : undefined,
        onGrab: () => {
          this.held = true;
          this.crankVel = 0;
          this.audio.click({ gain: 0.24, bright: 800 });
        },
        onRelease: () => {
          this.held = false;
        },
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  /** まぜた ぶんだけ あわが ふえる。ふえるほど 効きが 落ちる。 */
  _mix(amount) {
    // あわだて器が たねに ひたっているときだけ 効く
    const depth = clamp01(1 - Math.abs(this.tilt) * 2.2);
    this.foam = clamp01(this.foam + amount * 0.016 * (1 - this.foam * 0.82) * depth);
  }

  step(dt) {
    if (Math.abs(this.crankVel) > 0.01) {
      const d = this.crankVel * dt;
      this.crank += d;
      this._mix(Math.abs(d));
      // あわが かたくなるほど 早く 止まる
      this.crankVel = damp(this.crankVel, 0, 1.5 + this.foam * 6.5, dt);
    }
    if (this.held) this.crankVel = 0;
    // あわは ゆっくり しぼむ
    this.foam = Math.max(0, this.foam - 0.004 * dt);
  }

  lateUpdate(dt) {
    this.crownGroup.rotation.z = this.crank;

    // ピニオンは 逆どうし。左右で 符号が ちがう。
    for (const p of this.pinionGroups) {
      p.node.rotation.y = -p.sx * this.crank * RATIO;
    }
    for (let i = 0; i < this.whiskGroups.length; i++) {
      const sx = i === 0 ? -1 : 1;
      this.whiskGroups[i].rotation.y = -sx * this.crank * RATIO;
    }

    // ボウルの かたむき
    this.bowlGroup.rotation.z = damp(this.bowlGroup.rotation.z, this.tilt, 10, dt);

    // たね: かさが ふえ、白っぽくなる
    const rise = 1 + this.foam * 0.10;
    this.batterMesh.scale.set(1, rise, 1);
    const c = this.batterMesh.material.color;
    c.setRGB(lerp(0.97, 1.0, this.foam), lerp(0.86, 0.98, this.foam), lerp(0.56, 0.90, this.foam));

    // あわ
    const foamY = BOWL_R * 0.42 + this.foam * 0.0180;
    this.foamMesh.position.y = foamY;
    this.foamMesh.scale.set(0.55 + this.foam * 0.5, 0.4 + this.foam * 1.5, 0.55 + this.foam * 0.5);
    this.foamMesh.visible = this.foam > 0.03;

    const spin = this.crank * RATIO * 0.4;
    for (const b of this.bubbleMeshes) {
      const a = b.a + spin;
      const r = b.r * (0.4 + this.foam * 0.7);
      b.node.position.set(Math.cos(a) * r, foamY + 0.0040 + Math.sin(b.phase + this.time * 2.2) * 0.0020, Math.sin(a) * r);
      b.node.visible = this.foam > 0.12;
    }

    this._updateSound();
  }

  _updateSound() {
    const v = clamp01(Math.abs(this.crankVel) / 14);
    const whir = this.audio.voice('beatGear', { source: 'noise', filter: 'bandpass', freq: 520, Q: 5 });
    whir.set({ level: v * 0.07, freq: 380 + v * 700 - this.foam * 160, smooth: 0.08 });

    const slosh = this.audio.voice('beatSlosh', { source: 'noise', filter: 'bandpass', freq: 900, Q: 1.6 });
    slosh.set({ level: v * (0.03 + this.foam * 0.06), freq: 700 + v * 500, smooth: 0.12 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'foam', icon: 'drop', label: 'あわ', value: this.foam, color: '#f2b33d' },
      { id: 'speed', icon: 'gauge', label: 'はやさ', value: clamp01(Math.abs(this.crankVel) / 16), color: '#e0685a' },
    ];
  }

  reset() {
    this.crank = 0;
    this.crankVel = 0;
    this.foam = 0;
    this.tilt = 0;
    this.held = false;
  }
}
