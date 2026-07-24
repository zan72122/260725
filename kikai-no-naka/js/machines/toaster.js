/**
 * toaster.js — トースター
 *
 * 「ねつ」と「じかん」が、パンの色になって溜まっていくのが見える機械。
 *
 *   レバーを下げる → かごが下がって ラッチにかかる → 電熱線が赤くなる
 *                 → バイメタル（2枚の金属をはりあわせた板）が熱で そりかえる
 *                 → 十分そると ラッチをはずす → バネで かごが ポンッと はねあがる
 *
 * さわりどころ:
 *   - レバーを下げると、ニクロム線が だいだい色に光りはじめる
 *   - つまみをまわすと、こげ具合の目標が変わる（バイメタルの当たり位置が動く）
 *   - バイメタルを指でつまんで冷やすと、いつまでも上がらない → パンが真っ黒に
 *   - レバーを引き上げれば、いつでも途中でやめられる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { ParticleField } from '../lib/particles.js';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../lib/math.js';

const BODY_W = 0.118;
const BODY_H = 0.080;
const BODY_D = 0.072;
const CARRIAGE_TOP = 0.0;      // レバーが上のときの追加高さ
const CARRIAGE_DROP = 0.036;   // 下がる量

export class Toaster extends Machine {
  static meta = {
    id: 'toaster',
    name: 'トースター',
    sub: 'こんがり やける',
    accent: 0xf2894a,
    backdrop: {
      top: '#fdf2e4',
      middle: '#f6e2c8',
      bottom: '#dcc09a',
      glow: '#ffd6a0',
      glowStrength: 0.15,
    },
    bloom: { strength: 0.52, radius: 0.58, threshold: 1.00 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M8 20c0-3 2-5.4 4.6-6.8C15.6 11.6 19.6 11 24 11s8.4.6 11.4 2.2C38 14.6 40 17 40 20v14a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V20Z" fill="#f4d9b5" stroke="#8d5a2a" stroke-width="2.4"/>
      <rect x="15" y="16" width="18" height="3.4" rx="1.7" fill="#8d5a2a"/>
      <path d="M17 22h14M17 27h14" stroke="#f2894a" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M40 24h4v8h-4" stroke="#8d5a2a" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="44" cy="28" r="2.6" fill="#e0685a" stroke="#8d5a2a" stroke-width="2"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.lever = 0;          // 0 = 上、1 = 下
    this.leverTarget = 0;
    this.latched = false;
    this.power = 0;          // 電熱線に流れている量 0..1
    this.elementTemp = 0;    // 電熱線の温度 0..1
    this.bimetal = 0;        // バイメタルのそり 0..1
    this.bimetalHeld = false;
    this.doneness = 0;       // パンの焼け具合 0..1（1 を超えると こげる）
    this.char = 0;           // こげ 0..1
    this.dial = 0.5;         // つまみ 0..1
    this.popVel = 0;
    this.smokeAcc = 0;
    this._dingDone = false;

    this.radius = 0.086;
    this.center = new THREE.Vector3(0, 0.052, 0);
    this.footprint = { w: 0.125, d: 0.08, opacity: 0.36 };
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.15, -0.30, -1.0),
      center: this.center,
      span: 0.105,
      noiseScale: 12,
    });

    this.mats = {
      bodyShell: M.shell('paint', { color: 0xfaeedd, roughness: 0.26 }),
      bodyTrim: M.shell('paint', { color: 0xf2894a, roughness: 0.30 }),
      topPlate: M.shell('steel', { color: 0xdfe6ec, roughness: 0.26, brushed: 'linear', metalness: 0.82 }),

      frame: M.part('coated', { color: 0x8e98a4, roughness: 0.44 }),
      mica: M.part('plastic', { color: 0xe6dcc0, roughness: 0.7 }),
      wire: M.part('emissive', { color: 0x201a14, emissive: 0xff3a00, emissiveIntensity: 0, metalness: 0.6, roughness: 0.35 }),
      carriage: M.part('steel', { color: 0xd6dde4, roughness: 0.22 }),
      spring: M.part('steel', { color: 0xc4ccd4, roughness: 0.26 }),
      bimetalA: M.part('brass', { color: 0xe0b055 }),
      bimetalB: M.part('steel', { color: 0xa8b4c0, roughness: 0.3 }),
      latch: M.part('steel', { color: 0xc8d0d8, roughness: 0.24 }),
      magnet: M.part('coated', { color: 0x4a525c, roughness: 0.4 }),
      copper: M.part('copper'),
      knob: M.part('knurled', { color: 0xb9502f, metalness: 0.08, repeat: 3 }),
      leverKnob: M.part('softPlastic', { color: 0xf2634f }),
      bread: M.part('bread'),
      crust: M.part('bread', { color: 0xe8c88c }),
      rubber: M.plain('rubber'),
      cord: M.part('cable', { color: 0x3b4048 }),
    };

    this._buildBody();
    this._buildElements();
    this._buildCarriage();
    this._buildLatch();
    this._buildLever();
    this._buildDial();
    this._buildSmoke();

    this.setXray(0);
  }

  /* --- 外装 ------------------------------------------------------------ */

  _buildBody() {
    const g = group({ name: 'body', pos: [0, 0.0050, 0] });

    // 丸っこい胴
    mesh(new G.RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 6, 0.020), this.mats.bodyShell, {
      parent: g, pos: [0, BODY_H / 2, 0],
    });
    // 天板（スロットのある面）
    const slotOuter = rectPts(BODY_W - 0.010, BODY_D - 0.010);
    const slotHole = rectPts(0.072, 0.020);
    mesh(G.extrudeOutline(slotOuter, [slotHole], 0.0030, { corner: 0.014, bevel: 0.0006 }), this.mats.topPlate, {
      parent: g, pos: [0, BODY_H - 0.0012, 0], rot: [Math.PI / 2, 0, 0],
    });
    // 下の帯
    mesh(new G.RoundedBoxGeometry(BODY_W + 0.002, 0.0110, BODY_D + 0.002, 4, 0.0050), this.mats.bodyTrim, {
      parent: g, pos: [0, 0.0090, 0],
    });

    // ゴム脚
    const footGeo = G.lathe(
      [
        [0, 0],
        [0.0060, 0],
        [0.0064, 0.0020],
        [0.0048, 0.0044],
        [0, 0.0048],
      ],
      { segments: 18, center: false },
    );
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(footGeo, this.mats.rubber, {
          parent: g, pos: [sx * 0.044, 0.0002, sz * 0.024], rot: [Math.PI, 0, 0], cast: false,
        });
      }
    }

    // コード
    mesh(
      G.tubeFromPoints(
        [
          [-BODY_W / 2 + 0.004, 0.016, -0.024],
          [-0.072, 0.008, -0.036],
          [-0.104, 0.005, -0.024],
          [-0.126, 0.005, 0.004],
        ],
        0.0024,
        { radialSegments: 8 },
      ),
      this.mats.cord,
      { parent: g, cast: false },
    );

    this.addShell(g);
    this.bodyGroup = g;
  }

  /* --- 電熱線 ---------------------------------------------------------- */

  _buildElements() {
    const e = group({ name: 'elements', pos: [0, 0.0050, 0] });

    this.wireMats = [];
    // パンの両側に 2 枚ずつ
    for (const [zPos, sign] of [[-0.0180, -1], [0.0180, 1]]) {
      // 線を張るための がいし（縦の柱）。板でふさがないので、パンがよく見える。
      for (const sx of [-1, 1]) {
        mesh(new G.RoundedBoxGeometry(0.0044, 0.0460, 0.0044, 2, 0.0010), this.mats.mica, {
          parent: e, pos: [sx * 0.0420, 0.0430, zPos], cast: false,
        });
      }
      // 上下の細い受け
      for (const sy of [-1, 1]) {
        mesh(new G.RoundedBoxGeometry(0.0870, 0.0028, 0.0034, 2, 0.0008), this.mats.mica, {
          parent: e, pos: [0, 0.0430 + sy * 0.0224, zPos], cast: false,
        });
      }
      // ニクロム線
      const wireMat = this.M.part('emissive', {
        color: 0x1c1712,
        emissive: 0xff3a00,
        emissiveIntensity: 0,
        metalness: 0.55,
        roughness: 0.36,
      });
      this.wireMats.push(wireMat);
      const w = mesh(
        G.zigzagWire({ width: 0.080, height: 0.040, count: 9, wire: 0.00072, radialSegments: 6, round: 0.0035 }),
        wireMat,
        { parent: e, pos: [0, 0.0430, zPos + sign * 0.0016], cast: false },
      );
      void w;
      // 端子
      for (const sx of [-1, 1]) {
        mesh(new G.RoundedBoxGeometry(0.0050, 0.0060, 0.0034, 2, 0.0008), this.mats.frame, {
          parent: e, pos: [sx * 0.0440, 0.0210, zPos], cast: false,
        });
      }
    }

    // 側面のフレーム
    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0030, 0.052, 0.050, 2, 0.0010), this.mats.frame, {
        parent: e, pos: [sx * 0.0470, 0.0420, 0], cast: false,
      });
    }
    // 底の受け皿（くずうけ）
    mesh(G.roundedPlate(0.098, 0.056, 0.0016, 0.004), this.mats.frame, {
      parent: e, pos: [0, 0.0130, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });

    this.addGuts(e);
  }

  /* --- かご（パンをのせる） -------------------------------------------- */

  _buildCarriage() {
    const c = group({ name: 'carriage', pos: [0, 0.0050, 0] });
    this.carriageGroup = c;

    // 針金のかご
    const wireR = 0.0011;
    const bars = [];
    for (const zPos of [-0.0092, 0.0092]) {
      for (let i = 0; i < 5; i++) {
        const x = -0.030 + i * 0.015;
        bars.push(
          G.tubeFromPoints(
            [
              [x, 0.0700, zPos],
              [x, 0.0400, zPos],
              [x, 0.0370, zPos * 0.75],
            ],
            wireR,
            { radialSegments: 5 },
          ),
        );
      }
    }
    bars.push(G.tubeFromPoints([[-0.034, 0.0372, -0.0070], [0.034, 0.0372, -0.0070]], wireR, { radialSegments: 5 }));
    bars.push(G.tubeFromPoints([[-0.034, 0.0372, 0.0070], [0.034, 0.0372, 0.0070]], wireR, { radialSegments: 5 }));
    const merged = G.mergeAll(bars);
    mesh(merged, this.mats.carriage, { parent: c, cast: false });

    // 左右のガイド棒
    for (const sx of [-1, 1]) {
      mesh(G.chamferedCylinder(0.0016, 0.052, 0.0003, 12), this.mats.carriage, {
        parent: c, pos: [sx * 0.0380, 0.0450, 0], cast: false,
      });
    }
    // レバーとつながる横棒
    mesh(G.chamferedCylinder(0.0018, 0.078, 0.0003, 12), this.mats.carriage, {
      parent: c, pos: [0, 0.0370, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });

    // もどりバネ（伸び縮みが見える）
    const springGeo = G.coilSpring({ radius: 0.0052, wire: 0.00085, turns: 9, length: 1.0, radialSegments: 7 });
    const spring = new THREE.Mesh(springGeo, this.mats.spring);
    spring.castShadow = false;
    spring.receiveShadow = false;
    this.addGuts(spring);
    this.springMesh = spring;
    this.springTop = 0.0050 + 0.0640;

    // パン
    const bread = group({ parent: c, pos: [0, 0.0570, 0] });
    this.breadGroup = bread;
    const shape = [];
    const w = 0.0250;
    const h = 0.0230;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = Math.PI * t;
      shape.push(new THREE.Vector2(Math.cos(a) * w * 0.92, h * 0.34 + Math.sin(a) * h * 0.62));
    }
    shape.push(new THREE.Vector2(-w, -h * 0.2));
    shape.push(new THREE.Vector2(-w * 0.96, -h));
    shape.push(new THREE.Vector2(w * 0.96, -h));
    shape.push(new THREE.Vector2(w, -h * 0.2));
    const breadGeo = G.extrudeOutline(shape, [], 0.0125, { corner: 0.0026, bevel: 0.0012, curveSegments: 14 });
    this.breadMesh = mesh(breadGeo, this.mats.bread, { parent: bread });

    this.addGuts(c);
  }

  /* --- ラッチ（電磁石で保持） ------------------------------------------ */

  _buildLatch() {
    const l = group({ name: 'latch', pos: [0.0400, 0.0050 + 0.0250, 0] });
    this.latchGroup = l;

    // 電磁石
    mesh(new G.RoundedBoxGeometry(0.0090, 0.0130, 0.0110, 2, 0.0016), this.mats.magnet, {
      parent: l, pos: [0.0060, 0, 0], cast: false,
    });
    const coil = mesh(
      G.bobbinCoil({ radius: 0.0030, wire: 0.00055, turns: 10, length: 0.0090, layers: 2 }),
      this.mats.copper,
      { parent: l, pos: [0.0060, 0, 0], cast: false },
    );
    coil.rotation.x = Math.PI / 2;

    // かぎ爪
    const hook = group({ parent: l, pos: [-0.0020, 0, 0] });
    this.latchHook = hook;
    mesh(new G.RoundedBoxGeometry(0.0090, 0.0026, 0.0040, 2, 0.0008), this.mats.latch, {
      parent: hook, cast: false,
    });
    mesh(new G.RoundedBoxGeometry(0.0026, 0.0060, 0.0040, 2, 0.0008), this.mats.latch, {
      parent: hook, pos: [-0.0032, -0.0026, 0], cast: false,
    });

    /* --- バイメタル --- */
    const bi = group({ parent: l, pos: [0.0010, -0.0130, 0] });
    this.bimetalGroup = bi;
    const seg = 8;
    this.bimetalSegs = [];
    let parent = bi;
    for (let i = 0; i < seg; i++) {
      const s = group({ parent, pos: [0, i === 0 ? 0 : -0.0032, 0] });
      mesh(new G.RoundedBoxGeometry(0.0064, 0.0034, 0.0012, 2, 0.0004), this.mats.bimetalA, {
        parent: s, pos: [0, -0.0016, 0.0007], cast: false,
      });
      mesh(new G.RoundedBoxGeometry(0.0064, 0.0034, 0.0012, 2, 0.0004), this.mats.bimetalB, {
        parent: s, pos: [0, -0.0016, -0.0007], cast: false,
      });
      this.bimetalSegs.push(s);
      parent = s;
    }
    // 根元の留め具
    mesh(new G.RoundedBoxGeometry(0.0100, 0.0044, 0.0060, 2, 0.0010), this.mats.frame, {
      parent: bi, pos: [0, 0.0026, 0], cast: false,
    });

    hitProxy(bi, new THREE.BoxGeometry(0.016, 0.032, 0.016), { pos: [0, -0.014, 0] });
    this.handle({
      id: 'bimetal',
      label: 'バイメタル',
      type: 'grab',
      object: bi,
      hint: { kind: 'hold', offset: [0.014, -0.014, 0.014], size: 0.011 },
      onGrab: () => {
        this.bimetalHeld = true;
      },
      onRelease: () => {
        this.bimetalHeld = false;
      },
    });

    this.addGuts(l);
  }

  /* --- レバー ---------------------------------------------------------- */

  _buildLever() {
    const lv = group({ pos: [BODY_W / 2 - 0.0020, 0.0050 + 0.0640, 0] });
    this.root.add(lv);
    this.leverGroup = lv;

    // 外に出ているつまみ
    mesh(new G.RoundedBoxGeometry(0.0180, 0.0110, 0.0180, 3, 0.0044), this.mats.leverKnob, {
      parent: lv, pos: [0.0074, 0, 0],
    });
    mesh(new G.RoundedBoxGeometry(0.0090, 0.0050, 0.0060, 2, 0.0016), this.mats.carriage, {
      parent: lv, pos: [-0.0030, 0, 0], cast: false,
    });

    hitProxy(lv, new THREE.BoxGeometry(0.030, 0.026, 0.026), { pos: [0.006, 0, 0] });
    this.handle({
      id: 'lever',
      label: 'レバー',
      type: 'slide',
      object: lv,
      axis: new THREE.Vector3(0, -1, 0),
      primary: true,
      hint: { kind: 'push', offset: [0.010, 0.026, 0], size: 0.014, axis: new THREE.Vector3(0, 1, 0) },
      getValue: () => this.lever,
      onSlide: (delta, ctx) => {
        this.leverTarget = clamp01(ctx.value0 + delta / CARRIAGE_DROP);
      },
      onSlideEnd: () => {
        if (this.leverTarget > 0.85 && this.doneness < 1.4) this._latch();
        else if (!this.latched) this.leverTarget = 0;
      },
      onTap: () => {
        if (this.latched) this._release(false);
      },
    });
  }

  /* --- こげ具合のつまみ ------------------------------------------------ */

  _buildDial() {
    const d = group({ pos: [-0.0320, 0.0050 + 0.0215, BODY_D / 2 + 0.0002] });
    this.root.add(d);

    mesh(G.ring(0.0130, 0.0072, 0.0026, 32), this.mats.frame, { parent: d, rot: [Math.PI / 2, 0, 0], cast: false });
    const spin = group({ parent: d, pos: [0, 0, 0.0016] });
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0092, 0],
          [0.0100, 0.0022],
          [0.0100, 0.0056],
          [0.0084, 0.0072],
          [0, 0.0076],
        ],
        { segments: 30, center: false },
      ),
      this.mats.knob,
      { parent: spin, rot: [-Math.PI / 2, 0, 0] },
    );
    mesh(new G.RoundedBoxGeometry(0.0022, 0.0086, 0.0016, 2, 0.0006), this.mats.leverKnob, {
      parent: spin, pos: [0, 0.0052, 0.0060], cast: false,
    });
    this.dialSpin = spin;

    hitSphere(d, 0.0150, [0, 0, 0.004]);
    this.handle({
      id: 'dial',
      label: 'こげぐあい',
      type: 'rotate',
      object: d,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: d,
      gain: 0.6,
      hint: { kind: 'spin', offset: [0, 0, 0.024], size: 0.015 },
      onRotate: (delta) => {
        this.dial = clamp01(this.dial - delta * 0.28);
      },
    });
  }

  /* --- けむり ---------------------------------------------------------- */

  _buildSmoke() {
    const scale = this.ctx.tier === 'low' ? 0.4 : this.ctx.tier === 'mid' ? 0.7 : 1;
    this.smoke = new ParticleField({
      count: Math.round(160 * scale),
      color: 0xb9b0a4,
      color2: 0x8d8378,
      opacity: 0.34,
      stretch: 0.09,
      width: 0.016,
      minLength: 0.014,
      softness: 1.2,
      bounds: 0.5,
      seed: 77,
    });
    this.root.add(this.smoke.object);
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  _latch() {
    this.latched = true;
    this.leverTarget = 1;
    this._dingDone = false;
    this.audio.click({ gain: 0.55, bright: 1500 });
  }

  _release(pop = true) {
    if (!this.latched) return;
    this.latched = false;
    this.leverTarget = 0;
    if (pop) {
      this.popVel = 2.6;
      this.audio.boing({ gain: 0.34, freq: 250, decay: 0.55 });
      this.audio.bell(1420, { gain: 0.16, decay: 0.9 });
      this.onPop?.();
    } else {
      this.audio.click({ gain: 0.4, bright: 1200 });
    }
  }

  step(dt) {
    // レバー・かごの上下
    if (this.latched) {
      this.lever = damp(this.lever, 1, 22, dt);
    } else {
      // バネで戻る。ポップアップのときは勢いよく。
      this.popVel -= 34 * this.lever * dt;
      this.popVel *= Math.exp(-4.5 * dt);
      this.lever = clamp(this.lever - this.popVel * dt - (this.lever - this.leverTarget) * 9 * dt, 0, 1.06);
      if (this.lever <= 0.001 && this.popVel < 0.2) this.popVel = 0;
    }
    if (!this.latched && this.leverTarget > 0) {
      this.lever = damp(this.lever, this.leverTarget, 20, dt);
    }

    // 通電
    this.power = damp(this.power, this.latched ? 1 : 0, this.latched ? 5 : 8, dt);
    this.elementTemp = damp(this.elementTemp, this.power, this.power > 0.5 ? 0.9 : 1.6, dt);

    // バイメタルは電熱線の熱でそる。指でつまむと冷える。
    const biTarget = this.bimetalHeld ? 0.02 : this.elementTemp;
    this.bimetal = damp(this.bimetal, biTarget, this.bimetalHeld ? 2.2 : 0.30, dt);

    // 焼け具合
    if (this.latched) {
      this.doneness += this.elementTemp * 0.115 * dt;
      if (this.doneness > 1.0) this.char = clamp01(this.char + (this.doneness - 1.0) * 0.5 * dt);
    }

    // ラッチが外れる条件: バイメタルのそりが、つまみで決めた位置に届いたとき
    const trip = lerp(0.34, 0.86, this.dial);
    if (this.latched && this.bimetal > trip) this._release(true);

    // けむり
    if (this.char > 0.08) this.smokeAcc += this.char * 26 * dt;
  }

  lateUpdate(dt) {
    const y = -this.lever * CARRIAGE_DROP + CARRIAGE_TOP;
    this.carriageGroup.position.y = 0.0050 + y;
    this.leverGroup.position.y = 0.0050 + 0.0640 + y;

    // バネ（かごが下がると伸びる）
    const springLen = 0.0130 + this.lever * CARRIAGE_DROP;
    this.springMesh.position.set(-0.0400, this.springTop - springLen / 2, 0);
    this.springMesh.scale.y = springLen;

    // 電熱線の色（暗い赤 → だいだい → 明るい）
    const t = this.elementTemp;
    const glow = Math.pow(t, 1.6);
    for (const m of this.wireMats) {
      m.emissiveIntensity = glow * 7.0;
      m.emissive.setRGB(1.0, 0.10 + glow * 0.30, 0.02 + glow * 0.06);
    }

    // バイメタルのそり（各節を少しずつ曲げる）
    const bend = this.bimetal * 0.16;
    for (const s of this.bimetalSegs) s.rotation.z = bend;
    // ラッチのかぎ爪は、そったバイメタルに押されて開く
    const trip = lerp(0.34, 0.86, this.dial);
    const push = clamp01((this.bimetal - trip * 0.7) / (trip * 0.35));
    this.latchHook.position.x = -0.0020 + push * 0.0030;
    this.latchHook.rotation.z = -push * 0.22;

    // つまみ
    this.dialSpin.rotation.z = -this.dial * 2.2 + 1.1;

    // パンの色
    this._updateBread();
    this._updateSmoke(dt);
    this._updateSound();
  }

  _updateBread() {
    const d = clamp01(this.doneness);
    const c = this.char;
    // 白 → きつね色 → こげ茶 → 炭
    const col = this.mats.bread.color;
    const r = lerp(lerp(1.0, 0.80, d), 0.18, c);
    const g = lerp(lerp(0.98, 0.50, d), 0.12, c);
    const b = lerp(lerp(0.90, 0.24, d), 0.10, c);
    col.setRGB(r, g, b);
    // 焼けているあいだは、うっすら熱を持って見える
    this.mats.bread.emissive.setRGB(0.28, 0.05, 0.0);
    this.mats.bread.emissiveIntensity = this.elementTemp * 0.10 * (0.4 + d * 0.6);
  }

  _updateSmoke(dt) {
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const x = (Math.random() - 0.5) * 0.05;
      const z = (Math.random() - 0.5) * 0.012;
      this.smoke.emit(
        [x, 0.0050 + BODY_H - 0.004, z],
        [(Math.random() - 0.5) * 0.02, 0.045 + Math.random() * 0.03, (Math.random() - 0.5) * 0.02],
        1.8 + Math.random() * 1.2,
        0.5 + Math.random() * 0.9,
      );
    }
    this.smoke.setOpacity(0.10 + this.char * 0.24);
    this.smoke.update(dt, (i, px, py, pz, vx, vy, vz, out) => {
      out[0] = vx * 0.99 + Math.sin(py * 60 + this.time * 2) * 0.004 * dt * 60;
      out[1] = vy * 0.995 + 0.012 * dt;
      out[2] = vz * 0.99;
    });
  }

  _updateSound() {
    const hum = this.audio.voice('toastHum', { source: 'tone', type: 'sine', freq: 100, detune: 4 });
    hum.set({ level: this.power * 0.035, freq: 100, smooth: 0.2 });
    const hiss = this.audio.voice('toastHiss', { source: 'noise', filter: 'bandpass', freq: 2400, Q: 1.1 });
    hiss.set({ level: this.elementTemp * 0.035, freq: 1800 + this.elementTemp * 1400, smooth: 0.2 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'heat', icon: 'heat', label: 'ねつ', value: this.elementTemp, color: '#f2634f' },
      { id: 'done', icon: 'toast', label: 'やけぐあい', value: clamp01(this.doneness), color: '#d18a3a' },
    ];
  }

  reset() {
    this.lever = 0;
    this.leverTarget = 0;
    this.latched = false;
    this.power = 0;
    this.elementTemp = 0;
    this.bimetal = 0;
    this.doneness = 0;
    this.char = 0;
    this.popVel = 0;
    this.bimetalHeld = false;
    this.smoke?.killAll();
  }

  dispose() {
    this.smoke?.dispose();
    super.dispose();
  }
}

/* ------------------------------------------------------------------ */

function rectPts(w, h) {
  return [
    new THREE.Vector2(-w / 2, -h / 2),
    new THREE.Vector2(w / 2, -h / 2),
    new THREE.Vector2(w / 2, h / 2),
    new THREE.Vector2(-w / 2, h / 2),
  ];
}
