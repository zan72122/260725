/**
 * lock.js — なんきんじょう（かぎ）
 *
 * 「かぎの ギザギザ」が なにをしているのかを、そのまま見せる機械。
 *
 *   かぎを さしこむ → ギザギザの 高さのぶんだけ、下のピンが おしあげられる
 *   → 5本の さかいめ（シヤーライン）が ぴったり そろうと、
 *     内側のつつ（プラグ）がまわせるようになる
 *   → まわすと カムが かんぬきを ひっこめて、つるが バネで ポンッと あがる
 *
 * さわりどころ:
 *   - かぎを ゆっくり さしこむと、ピンが 1本ずつ ぴょこぴょこ 上下する
 *   - そろっていないと、つつは ちょっとしか まわらない（ぶつかる）
 *   - ピンを 1本 指で 押さえると、いくら さしても あかない
 *   - あいた つるを 押しさげると、また しまる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, ease, lerp, TAU } from '../lib/math.js';

/** プラグ（内側のつつ）の中心 */
const PLUG_Y = 0.0300;
const PLUG_R = 0.0095;
/** さかいめ（プラグの上端）。ここに ピンの つぎめ が そろえば まわる。 */
const SHEAR = PLUG_R;
/** かぎ穴の底 */
const KEYWAY = -0.0072;
/** かぎの背（ギザギザが無いところ）の高さ */
const LAND = 0.0024;

/** ピンの位置（X）と、下ピンの長さ */
const PINS = [
  { x: 0.0160, len: 0.0088 },
  { x: 0.0060, len: 0.0110 },
  { x: -0.0040, len: 0.0074 },
  { x: -0.0140, len: 0.0126 },
  { x: -0.0240, len: 0.0098 },
];
/** かぎが 奥まで 入ったときの、かぎグループの X */
const KEY_IN_X = 0.0450;
const KEY_OUT_X = KEY_IN_X + 0.0500;
/** V字の 切りこみ の 半分の幅 */
const CUT_HALF = 0.0036;

export class Lock extends Machine {
  static meta = {
    id: 'lock',
    name: 'かぎ',
    sub: 'ピンが そろうと あく',
    accent: 0xd2a03c,
    backdrop: {
      top: '#fbf4e6',
      middle: '#f0e2c8',
      bottom: '#d6c19c',
      glow: '#ffe6b8',
      glowStrength: 0.12,
    },
    bloom: { strength: 0.28, radius: 0.5, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M15 21v-6a9 9 0 0 1 18 0v6" stroke="#8b939c" stroke-width="4" stroke-linecap="round" fill="none"/>
      <rect x="9" y="21" width="30" height="21" rx="5" fill="#e8c069" stroke="#8a6320" stroke-width="2.4"/>
      <circle cx="24" cy="30" r="3.6" fill="#fff8e4" stroke="#8a6320" stroke-width="2"/>
      <path d="M24 33v5" stroke="#8a6320" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M17 15v-2M24 14v-3M31 15v-2" stroke="#c9cfd6" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.keyIn = 0;
    this.keyInTarget = 0;
    this.plug = 0;         // まわった量 0..1（1 = 90度）
    this.plugTarget = 0;
    this.shackle = 0;      // つるの持ち上がり 0..1
    this.pinHeld = new Array(PINS.length).fill(false);
    this.pinY = new Float32Array(PINS.length);
    this._openSound = false;

    this.radius = 0.074;
    this.center = new THREE.Vector3(0.006, 0.044, 0);
    this.footprint = { w: 0.13, d: 0.05, opacity: 0.30 };
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.15, -0.30, -1.0),
      center: this.center,
      span: 0.095,
      noiseScale: 14,
    });

    this.mats = {
      body: M.shell('brass', { color: 0xe8c069 }),
      bodyFace: M.shell('paint', { color: 0xc79a3c, roughness: 0.32 }),

      plug: M.part('brass', { color: 0xf0cf82 }),
      keyPin: M.part('brass', { color: 0xdcae54 }),
      driverPin: M.part('steel', { color: 0xd2dae1, roughness: 0.2 }),
      spring: M.part('steel', { color: 0xbcc6cf, roughness: 0.28 }),
      shackle: M.part('steel', { color: 0xcfd8e0, roughness: 0.16 }),
      bolt: M.part('coated', { color: 0x8b939c, roughness: 0.4 }),
      key: M.part('brass', { color: 0xf2d38a }),
      cam: M.part('coated', { color: 0x9aa4af, roughness: 0.4 }),
      frame: M.part('coated', { color: 0x7d8792, roughness: 0.44 }),
      frameDark: M.part('coated', { color: 0x3c434c, roughness: 0.5 }),
    };

    this._buildBody();
    this._buildShackle();
    this._buildPlug();
    this._buildPins();
    this._buildKey();

    this.setXray(0);
  }

  /* --- 本体 ------------------------------------------------------------ */

  _buildBody() {
    const g = group({ name: 'body' });

    mesh(new G.RoundedBoxGeometry(0.0700, 0.0580, 0.0230, 5, 0.0070), this.mats.body, {
      parent: g, pos: [0, PLUG_Y - 0.0010, 0],
    });
    // 正面の飾り板
    mesh(G.roundedPlate(0.0600, 0.0480, 0.0016, 0.0050, { bevel: 0.0004 }), this.mats.bodyFace, {
      parent: g, pos: [0, PLUG_Y - 0.0010, 0.0116], cast: false,
    });
    // かぎ穴のまわりのリング（右の面）
    const ring = mesh(G.ring(0.0130, 0.0098, 0.0030, 30), this.mats.bodyFace, {
      parent: g, pos: [0.0352, PLUG_Y, 0], cast: false,
    });
    ring.rotation.z = Math.PI / 2;
    // かぎ穴（みぞ）
    mesh(new G.RoundedBoxGeometry(0.0030, 0.0140, 0.0044, 1, 0.0008), this.mats.frameDark, {
      parent: g, pos: [0.0362, PLUG_Y - 0.0016, 0], cast: false,
    });

    this.addShell(g);
    this.bodyGroup = g;
  }

  /* --- つる（シャックル） ------------------------------------------------ */

  _buildShackle() {
    const s = group();
    this.root.add(s);
    this.shackleGroup = s;

    const legLen = 0.0360;
    const armR = 0.0195;
    const wire = 0.0038;

    // U 字
    const arc = new THREE.TorusGeometry(armR, wire, 10, 26, Math.PI);
    const arcMesh = mesh(arc, this.mats.shackle, { parent: s, pos: [0, 0.0620, 0] });
    arcMesh.rotation.z = 0;
    for (const sx of [-1, 1]) {
      mesh(G.chamferedCylinder(wire, legLen, 0.0006, 14), this.mats.shackle, {
        parent: s, pos: [sx * armR, 0.0620 - legLen / 2, 0],
      });
    }
    // 左あしの みぞ（かんぬき が かかる）
    mesh(G.ring(wire + 0.0008, wire - 0.0012, 0.0030, 16), this.mats.bolt, {
      parent: s, pos: [-armR, 0.0316, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });

    hitProxy(s, new THREE.BoxGeometry(0.052, 0.026, 0.014), { pos: [0, 0.070, 0] });
    this.handle({
      id: 'shackle',
      label: 'つる',
      type: 'slide',
      object: s,
      axis: new THREE.Vector3(0, 1, 0),
      getValue: () => this.shackle,
      onSlide: (delta, ctx) => {
        this.shackle = clamp01(ctx.value0 + delta / 0.026);
        if (this.shackle < 0.06) this._relock();
      },
      onTap: () => {
        if (this.shackle > 0.5) {
          this.shackle = 0;
          this._relock();
        }
      },
    });

    this.addGuts(group());
  }

  _relock() {
    if (this.plugTarget === 0 && this.plug < 0.02) return;
    this.plugTarget = 0;
    this._openSound = false;
    this.audio.click({ gain: 0.5, bright: 1400 });
  }

  /* --- プラグ（まわる つつ） -------------------------------------------- */

  _buildPlug() {
    const p = group({ pos: [0.0010, PLUG_Y, 0] });
    this.root.add(p);
    this.plugGroup = p;

    // つつ本体（上半分を かぎ穴のぶん だけ 削ったように見せる）
    const body = mesh(G.chamferedCylinder(PLUG_R, 0.0620, 0.0008, 34), this.mats.plug, {
      parent: p, cast: false,
    });
    body.rotation.z = Math.PI / 2;
    // 前面の つまみ みぞ
    const face = mesh(G.ring(PLUG_R, 0.0034, 0.0022, 30), this.mats.frame, {
      parent: p, pos: [0.0322, 0, 0], cast: false,
    });
    face.rotation.z = Math.PI / 2;

    // カム（まわると かんぬき を 引く）
    const cam = mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0060, -0.0050),
          new THREE.Vector2(0.0060, -0.0050),
          new THREE.Vector2(0.0100, 0.0034),
          new THREE.Vector2(0.0000, 0.0086),
          new THREE.Vector2(-0.0100, 0.0034),
        ],
        [],
        0.0034,
        { corner: 0.0022, bevel: 0.0005 },
      ),
      this.mats.cam,
      { parent: p, pos: [-0.0300, 0, 0], cast: false },
    );
    cam.rotation.y = Math.PI / 2;

    // かんぬき
    const bolt = group({ pos: [-0.0195, 0.0316, 0] });
    this.root.add(bolt);
    this.boltGroup = bolt;
    mesh(new G.RoundedBoxGeometry(0.0180, 0.0060, 0.0080, 2, 0.0014), this.mats.bolt, {
      parent: bolt, pos: [0.0090, 0, 0], cast: false,
    });
    mesh(G.coilSpring({ radius: 0.0026, wire: 0.0006, turns: 5, length: 0.0090, radialSegments: 6 }), this.mats.spring, {
      parent: bolt, pos: [-0.0060, 0, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });

    // つるを おしあげる バネ
    mesh(G.coilSpring({ radius: 0.0040, wire: 0.0008, turns: 6, length: 0.0140, radialSegments: 7 }), this.mats.spring, {
      parent: this.root, pos: [0.0195, 0.0330, 0], cast: false,
    });

    this.addGuts(group());
  }

  /* --- ピンとバネ -------------------------------------------------------- */

  _buildPins() {
    const g = group({ name: 'pins' });
    this.pinGroups = [];

    for (let i = 0; i < PINS.length; i++) {
      const def = PINS[i];
      const col = group({ parent: g, pos: [def.x, PLUG_Y, 0] });

      // 下ピン（かぎに のる）
      const keyPin = mesh(
        G.lathe(
          [
            [0, 0],
            [0.0028, 0.0006],
            [0.0028, def.len - 0.0004],
            [0.0022, def.len],
            [0, def.len],
          ],
          { segments: 16, center: false },
        ),
        this.mats.keyPin,
        { parent: col, cast: false },
      );
      // 上ピン（バネで おされている）
      const driver = mesh(G.chamferedCylinder(0.0028, 0.0090, 0.0006, 16), this.mats.driverPin, {
        parent: col, cast: false,
      });
      // バネ
      const spring = new THREE.Mesh(
        G.coilSpring({ radius: 0.0026, wire: 0.00042, turns: 6, length: 1.0, radialSegments: 5 }),
        this.mats.spring,
      );
      spring.castShadow = false;
      spring.receiveShadow = false;
      col.add(spring);

      // 上の あな の ふた
      mesh(G.chamferedCylinder(0.0034, 0.0022, 0.0004, 14), this.mats.frame, {
        parent: col, pos: [0, 0.0252, 0], cast: false,
      });

      this.pinGroups.push({ keyPin, driver, spring });

      hitProxy(col, new THREE.BoxGeometry(0.0090, 0.0300, 0.0110), { pos: [0, 0.0100, 0] });
      this.handle({
        id: `pin${i}`,
        label: 'ピン',
        type: 'grab',
        object: col,
        hint: i === 2 ? { kind: 'hold', offset: [0, 0.026, 0.010], size: 0.010 } : undefined,
        onGrab: () => {
          this.pinHeld[i] = true;
          this.audio.tick({ gain: 0.16, pitch: 2.2 });
        },
        onRelease: () => {
          this.pinHeld[i] = false;
        },
      });
    }

    this.addGuts(g);
  }

  /* --- かぎ -------------------------------------------------------------- */

  _buildKey() {
    const k = group({ pos: [KEY_OUT_X, PLUG_Y, 0] });
    this.root.add(k);
    this.keyGroup = k;

    // 刃（ギザギザの ある ところ）
    const outline = [];
    const tip = -0.0760;
    const shoulder = -0.0240;
    outline.push(new THREE.Vector2(tip, -0.0030));
    outline.push(new THREE.Vector2(tip + 0.0040, KEYWAY + 0.0002));
    outline.push(new THREE.Vector2(shoulder, KEYWAY + 0.0002));
    outline.push(new THREE.Vector2(shoulder, LAND));
    // 上の へり（切りこみ を たどる）
    const steps = 90;
    for (let i = steps; i >= 0; i--) {
      const u = lerp(shoulder, tip + 0.0040, i / steps);
      outline.push(new THREE.Vector2(u, keyProfile(u)));
    }
    outline.push(new THREE.Vector2(tip + 0.0020, -0.0026));

    mesh(G.extrudeOutline(outline, [], 0.0028, { corner: 0.0004, bevel: 0.0004, curveSegments: 4 }), this.mats.key, {
      parent: k,
    });

    // 持ち手（にぎり）
    const bow = group({ parent: k, pos: [0.0080, 0, 0] });
    this.keyBow = bow;
    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0100, -0.0040),
          new THREE.Vector2(-0.0020, -0.0046),
          new THREE.Vector2(0.0100, -0.0128),
          new THREE.Vector2(0.0180, -0.0026),
          new THREE.Vector2(0.0180, 0.0026),
          new THREE.Vector2(0.0100, 0.0128),
          new THREE.Vector2(-0.0020, 0.0046),
          new THREE.Vector2(-0.0100, 0.0040),
        ],
        [
          [
            new THREE.Vector2(0.0060, -0.0046),
            new THREE.Vector2(0.0130, -0.0046),
            new THREE.Vector2(0.0130, 0.0046),
            new THREE.Vector2(0.0060, 0.0046),
          ],
        ],
        0.0034,
        { corner: 0.0036, bevel: 0.0006 },
      ),
      this.mats.key,
      { parent: bow },
    );

    // 差しこむ ハンドル（刃のあたり）
    const bladeHit = group({ parent: k, pos: [-0.0140, 0, 0] });
    hitProxy(bladeHit, new THREE.BoxGeometry(0.030, 0.020, 0.016), {});
    this.handle({
      id: 'key',
      label: 'かぎ',
      type: 'slide',
      object: bladeHit,
      axis: new THREE.Vector3(-1, 0, 0),
      primary: true,
      hint: { kind: 'push', offset: [0.026, 0.014, 0], size: 0.013, axis: new THREE.Vector3(-1, 0, 0) },
      getValue: () => this.keyIn,
      onSlide: (delta, ctx) => {
        if (this.plug > 0.04) return; // まわしている あいだは 抜けない
        this.keyInTarget = clamp01(ctx.value0 + delta / (KEY_OUT_X - KEY_IN_X));
      },
      onSlideEnd: () => {
        // 奥まで 入りかけていたら、きちんと 奥まで 入れてあげる
        if (this.keyInTarget > 0.82) this.keyInTarget = 1;
      },
      onTap: () => {
        if (this.plug > 0.04) return;
        this.keyInTarget = this.keyIn > 0.5 ? 0 : 1;
      },
    });

    // まわす ハンドル（にぎりの部分）
    hitProxy(bow, new THREE.BoxGeometry(0.030, 0.030, 0.016), { pos: [0.008, 0, 0] });
    this.handle({
      id: 'turn',
      label: 'まわす',
      type: 'rotate',
      object: bow,
      axisObject: this.root,
      axis: new THREE.Vector3(1, 0, 0),
      pivot: new THREE.Vector3(0, PLUG_Y, 0),
      gain: 0.9,
      hint: { kind: 'spin', anchor: bow, axis: new THREE.Vector3(1, 0, 0), axisWorld: false, offset: [0.020, 0, 0], size: 0.020 },
      onRotate: (d) => {
        if (this.keyIn < 0.9) return;
        this.plugTarget = clamp01(this.plugTarget - d * 0.75);
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  /** ピン i の「つぎめ」の高さ。ちょうど SHEAR なら そろっている。 */
  _pinTop(i) {
    const def = PINS[i];
    const keyX = lerp(KEY_OUT_X, KEY_IN_X, this.keyIn);
    const u = def.x - keyX;
    const base = keyProfile(u);
    const held = this.pinHeld[i] ? -0.0034 : 0;
    return base + def.len + held;
  }

  get aligned() {
    for (let i = 0; i < PINS.length; i++) {
      if (Math.abs(this._pinTop(i) - SHEAR) > 0.0008) return false;
    }
    return true;
  }

  step(dt) {
    this.keyIn = damp(this.keyIn, this.keyInTarget, 15, dt);

    // そろっていなければ、ほんの少ししか まわらない
    const limit = this.aligned ? 1 : 0.055;
    const target = clamp(this.plugTarget, 0, limit);
    if (this.plugTarget > limit + 0.02 && this.plug > limit - 0.01) {
      this.plugTarget = limit; // かべに あたって 止まる
      if (!this._bumped) {
        this._bumped = true;
        this.audio.click({ gain: 0.34, bright: 700 });
      }
    } else if (this.plugTarget < limit * 0.5) {
      this._bumped = false;
    }
    this.plug = damp(this.plug, target, 16, dt);

    // まわりきったら、つるが バネで はねあがる
    if (this.plug > 0.78 && this.shackle < 0.98) {
      this.shackle = damp(this.shackle, 1, 9, dt);
      if (!this._openSound && this.shackle > 0.35) {
        this._openSound = true;
        this.audio.boing({ gain: 0.3, freq: 320, decay: 0.4 });
        this.audio.chime(760, { gain: 0.12 });
        this.onPop?.();
      }
    } else if (this.plug < 0.2 && this.shackle > 0.02 && this.shackle < 0.9) {
      this.shackle = damp(this.shackle, 0, 8, dt);
    }

    // ピンの高さ（ばらつきなく すっと 追従させる）
    for (let i = 0; i < PINS.length; i++) {
      const t = this._pinTop(i);
      this.pinY[i] = damp(this.pinY[i] || t, t, 30, dt);
    }
  }

  lateUpdate(dt) {
    const keyX = lerp(KEY_OUT_X, KEY_IN_X, this.keyIn);
    this.keyGroup.position.x = keyX;

    const ang = -this.plug * (Math.PI / 2);
    this.plugGroup.rotation.x = ang;
    this.keyGroup.rotation.x = ang;

    // ピン（下ピンの上端＝つぎめ が SHEAR にそろうと まわせる）
    for (let i = 0; i < PINS.length; i++) {
      const def = PINS[i];
      const top = this.pinY[i];
      const p = this.pinGroups[i];
      p.keyPin.position.y = top - def.len;
      p.driver.position.y = top + 0.0045;
      const springLen = Math.max(0.0016, 0.0250 - (top + 0.0090));
      p.spring.position.y = top + 0.0090 + springLen / 2;
      p.spring.scale.y = springLen;
      // そろっている ピンは 少し 光る
      const ok = Math.abs(top - SHEAR) < 0.0008;
      p.keyPin.material = ok ? this.mats.plug : this.mats.keyPin;
    }

    // かんぬき（カムに引かれて 引っこむ）
    this.boltGroup.position.x = -0.0195 + ease.inOutCubic(clamp01(this.plug * 1.15)) * 0.0092;

    // つる
    this.shackleGroup.position.y = ease.outBack(clamp01(this.shackle)) * 0.0250;

    this._updateSound(dt);
  }

  _updateSound() {
    // かぎを 出し入れ しているあいだの こすれ
    const scrape = this.audio.voice('lockScrape', { source: 'noise', filter: 'bandpass', freq: 2200, Q: 2 });
    const moving = clamp01(Math.abs(this.keyIn - (this._lastKeyIn ?? this.keyIn)) * 240);
    this._lastKeyIn = this.keyIn;
    scrape.set({ level: moving * 0.06, freq: 1800 + this.keyIn * 900, smooth: 0.04 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    let ok = 0;
    for (let i = 0; i < PINS.length; i++) if (Math.abs(this._pinTop(i) - SHEAR) < 0.0008) ok++;
    return [
      { id: 'pins', icon: 'gauge', label: 'そろったピン', value: ok / PINS.length, color: '#d2a03c' },
      { id: 'open', icon: 'spring', label: 'あきぐあい', value: this.shackle, color: '#7cb8a0' },
    ];
  }

  reset() {
    this.keyIn = 0;
    this.keyInTarget = 0;
    this.plug = 0;
    this.plugTarget = 0;
    this.shackle = 0;
    this.pinHeld.fill(false);
    this._openSound = false;
  }
}

/* ------------------------------------------------------------------ */

/**
 * かぎの 上のへり の高さ。
 * ピンの位置には V 字の 切りこみ があり、それ以外は 平ら（LAND）。
 */
function keyProfile(u) {
  const keyIn = KEY_IN_X;
  const shoulder = -0.0240;
  const tip = -0.0760;
  if (u > shoulder || u < tip) return KEYWAY; // かぎが 無いところ → ピンは 底まで 落ちる
  // 先の とがり
  if (u < tip + 0.0060) return lerp(KEYWAY, LAND, (u - tip) / 0.0060);

  let h = LAND;
  for (const def of PINS) {
    const cut = SHEAR - def.len; // ここまで 削れば ぴったり そろう
    const center = def.x - keyIn;
    const d = Math.abs(u - center);
    if (d < CUT_HALF) {
      const v = lerp(cut, LAND, d / CUT_HALF);
      h = Math.min(h, v);
    }
  }
  return h;
}
