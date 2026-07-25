/**
 * escalator.js — エスカレーター
 *
 * 「同じ かたちの ものが たくさん、輪になって まわっている」ことと、
 * 「レールの 高さの ちがいで、段が 平らになったり 階段になったりする」ことを
 * 見せる機械。
 *
 *   ふみ板は いつも 水平のまま はこばれる。
 *   坂の ところでは、となりの ふみ板との あいだに 高さの さが できるので
 *   「かいだん」に なる。
 *   のりばと おりばでは レールが 水平に なるので、高さの さが 0 になり、
 *   同じ ふみ板が すーっと 平らな ゆかに 変わる。
 *
 *   下の 段は さかさまに なって もどっていく。ぐるっと ひと回り する 輪。
 *
 * さわりどころ:
 *   - ダイヤルで はやさを 変える（逆にも まわる）
 *   - ふみ板を 指で 押さえると、輪ぜんたいが 止まる
 *   - のぼっている 人形を つまんで、どこにでも のせられる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, mod, smoothstep, TAU } from '../lib/math.js';

/** ふみ板の 数 */
const STEPS = 16;
const STEP_W = 0.0300;
const TREAD_D = 0.0176;
const RISER_H = 0.0135;
/** 幅（左右） */
const HALF_W = 0.0170;

/**
 * ふみ板の じくが 通る 道（閉じた 輪）。
 * 上の 面が「のる がわ」、下の 面が「もどり」。
 */
const TRACK = [
  [-0.0800, 0.0250], [-0.0470, 0.0250],   // のりば（水平）
  [0.0430, 0.0820], [0.0790, 0.0820],     // 坂 → おりば（水平）
  [0.0930, 0.0740], [0.0930, 0.0610],     // 上の おりかえし
  [0.0760, 0.0560], [0.0420, 0.0560],
  [-0.0470, 0.0110], [-0.0800, 0.0110],   // もどり
  [-0.0940, 0.0150], [-0.0940, 0.0210],   // 下の おりかえし
];
/** レールが 水平な ところ（ここで 段が 平らになる） */
const FLAT_A = [-0.0800, -0.0470];
const FLAT_B = [0.0430, 0.0790];

export class Escalator extends Machine {
  static meta = {
    id: 'escalator',
    name: 'エスカレーター',
    sub: 'だんが たいらに なる',
    accent: 0x3f8fbf,
    backdrop: {
      top: '#f0f7fb',
      middle: '#dcecf5',
      bottom: '#b9d3e2',
      glow: '#d6ecf8',
      glowStrength: 0.13,
    },
    bloom: { strength: 0.26, radius: 0.5, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M6 38h10v-6h8v-6h8v-6h10" fill="none" stroke="#3f8fbf" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M6 30 30 10h8" fill="none" stroke="#8ab6d0" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="30" cy="17" r="3.4" fill="#e0685a"/>
      <rect x="4" y="40" width="40" height="4" rx="2" fill="#8a939c"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.pos = 0;        // 輪の 上の 送り（弧長）
    this.speed = 0.030;  // m/s
    this.dial = 0.55;    // ダイヤル 0..1（0.5 で 止まる）
    this.held = false;

    this.radius = 0.104;
    this.center = new THREE.Vector3(0.002, 0.052, 0);
    this.footprint = { w: 0.20, d: 0.055, opacity: 0.28 };

    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.05, -0.34, -1.0),
      center: this.center,
      span: 0.135,
      noiseScale: 11,
    });

    this.mats = {
      truss: M.shell('paint', { color: 0x7fb4d2, roughness: 0.26, clearcoat: 0.8 }),
      skirt: M.shell('coated', { color: 0xdfe8ee, roughness: 0.36 }),
      glassPanel: M.shell('glass', { color: 0xd8ecf7, opacity: 0.16 }),

      tread: M.part('coated', { color: 0xb9c3cc, roughness: 0.34 }),
      treadTop: M.part('coated', { color: 0x8d99a4, roughness: 0.40 }),
      riser: M.part('steel', { color: 0xcfd7de, roughness: 0.22 }),
      wheel: M.part('softPlastic', { color: 0xe0b657 }),
      rail: M.part('darkSteel', { color: 0x6a747e }),
      handrail: M.part('rubber', { color: 0x2e3339 }),
      chain: M.part('steel', { color: 0xbcc5cd, roughness: 0.24 }),
      motor: M.part('paint', { color: 0xe0685a, roughness: 0.28 }),
      gear: M.part('brass', { color: 0xd9a94e }),
      dial: M.part('knurled', { color: 0x8d959e }),
      dialMark: M.part('paint', { color: 0xe0553f }),
      doll: M.part('plastic', { color: 0xf4d9b5, roughness: 0.5 }),
      dollA: M.part('plastic', { color: 0x4f9fd6, roughness: 0.45 }),
      dollB: M.part('plastic', { color: 0xe0553f, roughness: 0.45 }),
      dollC: M.part('plastic', { color: 0x6fae74, roughness: 0.45 }),
      base: M.plain('coated', { color: 0xcfc9bc, roughness: 0.85 }),
    };

    /* 道を つくる */
    const pts = TRACK.map(([x, y]) => new THREE.Vector3(x, y, 0));
    this.path = G.closedPath(pts);
    this.stepGap = this.path.length / STEPS;
    // それぞれの 頂点までの 弧長（区間の 見わけに 使う）
    this._buildPhase(pts);

    this._buildTruss();
    this._buildRails();
    this._buildSteps();
    this._buildDrive();
    this._buildDolls();

    this.setXray(0);
  }

  /**
   * 「いま 輪の どのあたりか」から、ふみ板の 向き（0 = 上むき、π = さかさま）を
   * 決めるための 表を つくる。上の 面と 下の 面の 境目で なめらかに ひっくり返す。
   */
  _buildPhase(pts) {
    const n = pts.length;
    const cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + pts[i].distanceTo(pts[(i + 1) % n]));
    // 上の 面は 頂点 0..3、上の おりかえしは 4..5、下は 6..9、下の おりかえしは 10..11
    this.sTopEnd = cum[4];
    this.sRetStart = cum[6];
    this.sRetEnd = cum[9];
    this.sLen = cum[n];
  }

  /** 弧長 s での ふみ板の 回転（ラジアン） */
  _flip(s) {
    const t = mod(s, this.sLen);
    if (t < this.sTopEnd) return 0;
    if (t < this.sRetStart) return Math.PI * smoothstep(this.sTopEnd, this.sRetStart, t);
    if (t < this.sRetEnd) return Math.PI;
    return Math.PI + Math.PI * smoothstep(this.sRetEnd, this.sLen, t);
  }

  /* --- わく ------------------------------------------------------------- */

  _buildTruss() {
    const g = group({ name: 'truss' });

    // 台
    mesh(new G.RoundedBoxGeometry(0.2100, 0.0060, 0.0640, 3, 0.0020), this.mats.base, {
      parent: this.root, pos: [0, 0.0030, 0], cast: false,
    });

    // 左右の 側板（ここが すけると 中の 輪が 見える）
    for (const sz of [-1, 1]) {
      // 上のふちは レールより 少し 低くする。
      // 高いと、ふみ板が 側板に かくれて 何も 見えなくなる。
      const outline = [
        new THREE.Vector2(-0.0990, 0.0060),
        new THREE.Vector2(0.0990, 0.0060),
        new THREE.Vector2(0.0990, 0.0780),
        new THREE.Vector2(0.0480, 0.0780),
        new THREE.Vector2(-0.0420, 0.0210),
        new THREE.Vector2(-0.0990, 0.0210),
      ];
      const side = mesh(G.extrudeOutline(outline, [], 0.0032, { corner: 0.0060, bevel: 0.0008 }), this.mats.skirt, {
        parent: g, pos: [0, 0, sz * (HALF_W + 0.0044)],
      });
      side.name = 'side';

      // 手すりの 支柱と ガラス
      mesh(
        G.extrudeOutline(
          [
            new THREE.Vector2(-0.0940, 0.0380), new THREE.Vector2(-0.0430, 0.0380),
            new THREE.Vector2(0.0470, 0.0950), new THREE.Vector2(0.0930, 0.0950),
            new THREE.Vector2(0.0930, 0.1230), new THREE.Vector2(0.0470, 0.1230),
            new THREE.Vector2(-0.0430, 0.0660), new THREE.Vector2(-0.0940, 0.0660),
          ],
          [], 0.0020, { corner: 0.0060, bevel: 0.0005 },
        ),
        this.mats.glassPanel,
        { parent: g, pos: [0, 0, sz * (HALF_W + 0.0074)], cast: false },
      );
    }

    // 手すり（ゴムの 帯）
    this.handrails = [];
    for (const sz of [-1, 1]) {
      const pts = [
        new THREE.Vector3(-0.0960, 0.0700, sz * (HALF_W + 0.0074)),
        new THREE.Vector3(-0.0430, 0.0700, sz * (HALF_W + 0.0074)),
        new THREE.Vector3(0.0470, 0.1270, sz * (HALF_W + 0.0074)),
        new THREE.Vector3(0.0950, 0.1270, sz * (HALF_W + 0.0074)),
      ];
      mesh(G.tubeFromPoints(pts, 0.0034, { radialSegments: 8, curveType: 'centripetal', tension: 0.1 }), this.mats.handrail, {
        parent: g, cast: false,
      });
    }

    this.addShell(g);
  }

  /* --- レール ------------------------------------------------------------ */

  _buildRails() {
    const g = group({ name: 'rails' });
    this.root.add(g);

    // ふみ板の じくが 走る レール（輪の かたちが そのまま 見える）
    for (const sz of [-1, 1]) {
      const pts = TRACK.map(([x, y]) => new THREE.Vector3(x, y, sz * (HALF_W - 0.0020)));
      pts.push(pts[0].clone());
      mesh(G.tubeFromPoints(pts, 0.0016, { radialSegments: 6, curveType: 'centripetal', tension: 0.02 }), this.mats.rail, {
        parent: g, cast: false, receive: false,
      });
    }
  }

  /* --- ふみ板 ------------------------------------------------------------ */

  _buildSteps() {
    const g = group({ name: 'steps' });
    this.root.add(g);

    const treadGeo = new G.RoundedBoxGeometry(TREAD_D, 0.0030, STEP_W, 2, 0.0010);
    const cleatGeo = new G.RoundedBoxGeometry(0.0014, 0.0016, STEP_W - 0.0030, 1, 0.0005);
    const riserGeo = new G.RoundedBoxGeometry(0.0026, RISER_H, STEP_W, 2, 0.0008);
    const wheelGeo = G.chamferedCylinder(0.0030, 0.0022, 0.0005, 12);

    this.stepGroups = [];
    for (let i = 0; i < STEPS; i++) {
      const s = group({ parent: g });
      this.stepGroups.push(s);

      // ふみ面
      mesh(treadGeo, this.mats.tread, { parent: s, pos: [0, 0.0040, 0], cast: false });
      // みぞ（すべり止め）
      for (let k = 0; k < 7; k++) {
        mesh(cleatGeo, this.mats.treadTop, {
          parent: s, pos: [-TREAD_D / 2 + 0.0022 + k * 0.0022, 0.0062, 0], cast: false, receive: false,
        });
      }
      // けあげ（前の たて板）
      mesh(riserGeo, this.mats.riser, {
        parent: s, pos: [TREAD_D / 2 + 0.0010, 0.0040 - RISER_H / 2, 0], cast: false,
      });
      // じくと 車輪
      for (const sz of [-1, 1]) {
        const w = mesh(wheelGeo, this.mats.wheel, {
          parent: s, pos: [0, 0, sz * (HALF_W - 0.0020)], rot: [Math.PI / 2, 0, 0], cast: false,
        });
        w.name = 'roller';
      }
      const ax = mesh(G.chamferedCylinder(0.0012, HALF_W * 2, 0.0002, 8), this.mats.chain, {
        parent: s, cast: false,
      });
      ax.rotation.x = Math.PI / 2;

      hitProxy(s, new THREE.BoxGeometry(TREAD_D + 0.006, 0.014, STEP_W), { pos: [0, 0.004, 0] });
      this.handle({
        id: `step${i}`,
        label: 'だん',
        type: 'grab',
        object: s,
        primary: i === 4,
        hint: i === 4 ? { kind: 'hold', offset: [0, 0.016, 0], size: 0.012 } : undefined,
        onGrab: () => {
          this.held = true;
          this.audio.click({ gain: 0.24, bright: 900 });
        },
        onRelease: () => {
          this.held = false;
        },
      });
    }
  }

  /* --- モーターと ダイヤル ----------------------------------------------- */

  _buildDrive() {
    const g = group({ name: 'drive' });
    this.root.add(g);

    // 上の 端の 駆動歯車
    const drum = group({ parent: g, pos: [0.0930, 0.0675, 0] });
    this.drumGroup = drum;
    for (const sz of [-1, 1]) {
      const gear = mesh(
        G.gearGeometry({ teeth: 14, module: 0.0013, thickness: 0.0034, bore: 0.0022, hub: 0.0040, hubHeight: 0.0010, spokes: 4 }),
        this.mats.gear,
        { parent: drum, pos: [0, 0, sz * (HALF_W - 0.0020)], cast: false },
      );
      gear.rotation.x = Math.PI / 2;
      gear.rotation.z = 0;
    }
    const ax = mesh(G.chamferedCylinder(0.0018, HALF_W * 2, 0.0003, 10), this.mats.chain, { parent: drum, cast: false });
    ax.rotation.x = Math.PI / 2;

    // モーター
    const motor = mesh(G.chamferedCylinder(0.0110, 0.0260, 0.0016, 22), this.mats.motor, {
      parent: g, pos: [0.0700, 0.0700, 0], cast: false,
    });
    motor.rotation.x = Math.PI / 2;
    this.motorMesh = motor;
    mesh(G.chamferedCylinder(0.0034, 0.0180, 0.0006, 12), this.mats.chain, {
      parent: g, pos: [0.0820, 0.0700, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });

    // はやさダイヤル（のりばの わき）
    const dial = group({ parent: g, pos: [-0.0870, 0.0450, HALF_W + 0.0110] });
    this.dialGroup = dial;
    mesh(G.chamferedCylinder(0.0110, 0.0060, 0.0014, 26), this.mats.dial, {
      parent: dial, rot: [Math.PI / 2, 0, 0],
    });
    mesh(new G.RoundedBoxGeometry(0.0026, 0.0080, 0.0034, 1, 0.0008), this.mats.dialMark, {
      parent: dial, pos: [0, 0.0060, 0.0016], cast: false,
    });

    hitCylinder(dial, 0.0170, 0.0160, [0, 0, 0], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'dial',
      label: 'はやさ',
      type: 'rotate',
      object: dial,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: dial,
      primary: true,
      gain: 0.7,
      hint: { kind: 'spin', offset: [0, 0, 0.018], size: 0.014 },
      onRotate: (d) => {
        this.dial = clamp01(this.dial + d * 0.30);
      },
    });
  }

  /* --- のる 人形 --------------------------------------------------------- */

  _buildDolls() {
    const g = group({ name: 'dolls' });
    this.root.add(g);

    const coats = [this.mats.dollA, this.mats.dollB, this.mats.dollC];
    this.dolls = [];
    for (let i = 0; i < 3; i++) {
      const d = group({ parent: g });
      const h = 0.0170 + i * 0.0022;
      mesh(G.chamferedCylinder(0.0056, h, 0.0010, 18), coats[i], {
        parent: d, pos: [0, h / 2, 0], cast: false,
      });
      mesh(new THREE.SphereGeometry(0.0052, 14, 10), this.mats.doll, {
        parent: d, pos: [0, h + 0.0044, 0], cast: false,
      });
      this.dolls.push({ node: d, step: 3 + i * 4, sway: i * 1.7 });
    }
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  step(dt) {
    // ダイヤル 0.5 で 止まる。左右で 向きが 変わる。
    const want = (this.dial - 0.5) * 2 * 0.062;
    this.speed = damp(this.speed, this.held ? 0 : want, 6, dt);
    this.pos += this.speed * dt;
  }

  lateUpdate(dt) {
    const path = this.path;

    for (let i = 0; i < STEPS; i++) {
      const s = i * this.stepGap + this.pos;
      path.at(s, this._p);
      const st = this.stepGroups[i];
      st.position.copy(this._p);
      // ふみ面は いつも 水平。もどりの あいだだけ さかさま。
      st.rotation.z = this._flip(s);
    }

    // 人形は ふみ板の 上に のる
    for (const d of this.dolls) {
      const st = this.stepGroups[d.step % STEPS];
      d.node.position.copy(st.position);
      d.node.position.y += 0.0055;
      // もどりの あいだは 見えない
      const s = (d.step % STEPS) * this.stepGap + this.pos;
      const flip = this._flip(s);
      d.node.visible = flip < 0.6;
      d.node.rotation.z = Math.sin(this.time * 1.6 + d.sway) * 0.03;
    }

    // 駆動歯車と モーター
    this.drumGroup.rotation.z = -this.pos / 0.0091;
    this.motorMesh.rotation.y = this.pos * 40;
    this.dialGroup.rotation.z = lerp(2.3, -2.3, this.dial);

    this._updateSound();
  }

  _updateSound() {
    const v = clamp01(Math.abs(this.speed) / 0.062);
    const hum = this.audio.voice('escHum', { source: 'saw', filter: 'lowpass', freq: 320, Q: 1.4, detune: 9 });
    hum.set({ level: v * 0.05, freq: 96 + v * 42, filterFreq: 300 + v * 460, smooth: 0.12 });

    const rattle = this.audio.voice('escStep', { source: 'noise', filter: 'bandpass', freq: 700, Q: 3 });
    rattle.set({ level: v * 0.045, freq: 520 + v * 420, smooth: 0.1 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'speed', icon: 'gauge', label: 'はやさ', value: clamp01(Math.abs(this.speed) / 0.062), color: '#3f8fbf' },
      { id: 'riders', icon: 'spring', label: 'のっている', value: this.dolls.filter((d) => d.node.visible).length / 3, color: '#e0685a' },
    ];
  }

  reset() {
    this.pos = 0;
    this.speed = 0.030;
    this.dial = 0.55;
    this.held = false;
  }
}
