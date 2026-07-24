/**
 * flashlight.js — てまわしライト
 *
 * 「まわす」と「あかるくなる」がつながっていることを、体で覚えるための機械。
 *
 *   ハンドル → 大きい歯車 → 小さい歯車 → 大きい歯車 → 小さい歯車
 *            → 発電機（磁石がコイルの中で回る）→ コンデンサ（電気のバケツ）→ 豆電球
 *
 * ぜんぶ実数の状態で持っているので、
 *   - ゆっくり回すと暗い、速く回すと明るい
 *   - 手をはなしても、はずみでしばらく回りつづける
 *   - 止めても、バケツに溜まった電気の分だけ、じわーっと暗くなる
 *   - 歯車を指で押さえると、すべてがピタッと止まる
 * が、そのまま目に見える。
 *
 * 座標のきまり:
 *   本体は Y 上向きに立ち、正面は +Z。歯車はすべて Z 軸まわりに回るので、
 *   正面から見ると歯車列が「絵」として読める。
 *   ヘッド（電球のある筒）は aim グループのローカル +Y が光の向き。
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { softSprite } from '../lib/textures.js';
import { setShellDissolve } from '../lib/xray.js';
import { TAU, clamp, clamp01, damp, lerp, smoothstep } from '../lib/math.js';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* 光の筋（ボリューム風）                                              */
/* ------------------------------------------------------------------ */

const CONE_VERT = /* glsl */ `
varying vec3 vNormalL;
varying vec3 vViewL;
varying vec3 vPosL;
void main() {
  vPosL = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalL = normalize(mat3(modelMatrix) * normal);
  vViewL = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CONE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uHeight;
varying vec3 vNormalL;
varying vec3 vViewL;
varying vec3 vPosL;

float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  // 円錐の側面は、視線に対して寝ているところほど「厚み」を感じて明るくなる
  float ndv = abs(dot(normalize(vNormalL), normalize(vViewL)));
  float rim = pow(1.0 - ndv, 1.35);

  // 頂点（電球側 = -Y）が明るく、開口へ向かうほど減衰
  float t = clamp(0.5 - vPosL.y / uHeight, 0.0, 1.0);
  float along = pow(t, 2.0);

  // ほこりのきらめき
  float dust = hash13(floor(vPosL * 380.0) + floor(uTime * 5.0));
  dust = smoothstep(0.988, 1.0, dust) * 0.6;

  float a = (rim * 0.8 + 0.12) * along * uIntensity;
  a += dust * along * uIntensity * 1.6;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * (1.0 + rim * 0.8), a);
}
`;

/* ------------------------------------------------------------------ */
/* 歯車列の設計値                                                      */
/* ------------------------------------------------------------------ */

const MOD = 0.00128;
const TEETH = { g1: 30, p1: 10, g2: 26, p2: 9 };
const RATIO = (TEETH.g1 / TEETH.p1) * (TEETH.g2 / TEETH.p2);
const pitchR = (t) => (t * MOD) / 2;

/** 3 本の軸の位置。かみ合う相手との中心距離はピッチ円半径の和にする。 */
const S1 = new THREE.Vector2(0.0135, 0.0492);
const S2 = (() => {
  const d = pitchR(TEETH.g1) + pitchR(TEETH.p1);
  const a = 152 * DEG;
  return new THREE.Vector2(S1.x + Math.cos(a) * d, S1.y + Math.sin(a) * d);
})();
const S3 = (() => {
  const d = pitchR(TEETH.g2) + pitchR(TEETH.p2);
  const a = 63 * DEG;
  return new THREE.Vector2(S2.x + Math.cos(a) * d, S2.y + Math.sin(a) * d);
})();

/** 歯車が並ぶ 2 つの奥行き（かみ合う相手どうしは同じ平面） */
const Z_A = -0.0042;
const Z_B = 0.0058;

/* ------------------------------------------------------------------ */

export class Flashlight extends Machine {
  static meta = {
    id: 'light',
    name: 'ライト',
    sub: 'まわすと ひかる',
    accent: 0x3fc0a9,
    backdrop: {
      top: '#fdf7ea',
      middle: '#f5e6cd',
      bottom: '#dcc7a6',
      glow: '#ffe4ac',
      glowStrength: 0.13,
    },
    bloom: { strength: 0.36, radius: 0.52, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="15" y="9" width="19" height="30" rx="5.5" fill="#7ddccb" stroke="#2f6d63" stroke-width="2.4"/>
      <path d="M15 18.5 6.5 12v12l8.5-5Z" fill="#ffd45e" stroke="#7a5a12" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="24.5" cy="26" r="6" fill="#fff6d6" stroke="#2f6d63" stroke-width="2.2"/>
      <circle cx="24.5" cy="26" r="2" fill="#f2a63b"/>
      <path d="M38 24h5M36.5 18l4.6-2.2M36.5 30l4.6 2.2" stroke="#f2a63b" stroke-width="2.6" stroke-linecap="round"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.angle = 0;      // クランク軸の角度
    this.omega = 0;      // クランク軸の角速度（rad/s）
    this.charge = 0;     // コンデンサに溜まった電気 0..1
    this.brightness = 0; // 実際の明るさ 0..1
    this.switchOn = true;
    this.holdCount = 0;  // 指で押さえられている部品の数
    this.driving = false;
    this._driveTimer = 0;
    this._clickPhase = 0;
    this._switchPress = 0;

    this.radius = 0.083;
    this.center = new THREE.Vector3(-0.013, 0.068, 0.004);
    this.footprint = { w: 0.104, d: 0.076, opacity: 0.36 };
  }

  get ratio() {
    return RATIO;
  }

  /* ---------------------------------------------------------------- */
  /* 組み立て                                                          */
  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    // すけすけの波は、機械ぜんたいを下から上へ通り抜ける
    // 波は「手前の上」から始まり、奥・下へ抜けていく。
    // こうするとスライダーを少し動かしただけで前板が消え、すぐ歯車が顔を出す。
    setShellDissolve({
      dir: new THREE.Vector3(-0.10, -0.36, -1.0),
      center: this.center,
      span: 0.115,
      noiseScale: 13,
    });

    this.mats = {
      body: M.shell('paint', { color: 0x6ecfbd, roughness: 0.26 }),
      trim: M.shell('paint', { color: 0x1d6d64, roughness: 0.32 }),
      headShell: M.shell('paint', { color: 0xf6c344, roughness: 0.26 }),
      lens: M.shell('glass', { strength: 0.92, thickness: 0.003 }),
      bezel: M.shell('steel', { color: 0xdfe5ea, roughness: 0.2 }),

      plate: M.part('coated', { color: 0xa9b6c4, roughness: 0.44 }),
      post: M.part('brass', { color: 0xc9974a }),
      gearBrass: M.part('brass'),
      gearBrass2: M.part('brass', { color: 0xe8bb62 }),
      gearSteel: M.part('steel', { color: 0xd8dee5 }),
      gearSteel2: M.part('steel', { color: 0xc4ccd4 }),
      shaft: M.part('steel', { color: 0xdde3e9, roughness: 0.18 }),
      crankPaint: M.part('paint', { color: 0xf2634f, clearcoat: 0.95, roughness: 0.22 }),
      knob: M.part('softPlastic', { color: 0xffd45e }),
      copper: M.part('copper'),
      magnetN: M.part('plastic', { color: 0xe8503f, roughness: 0.3 }),
      magnetS: M.part('plastic', { color: 0x4f8fd6, roughness: 0.3 }),
      laminate: M.part('coated', { color: 0x8f9aa6, roughness: 0.52 }),
      pcb: M.part('pcb'),
      capBody: M.part('plastic', { color: 0x2b3542, roughness: 0.28 }),
      capBand: M.part('plastic', { color: 0xe6edf4, roughness: 0.36 }),
      reflector: M.part('chrome'),
      bulb: M.part('emissive', { color: 0x2a2418, emissive: 0xfff0c0, emissiveIntensity: 0 }),
      bulbGlass: M.part('glass', { strength: 0.85, thickness: 0.0015 }),
      rubber: M.plain('rubber'),
      switchCap: M.part('softPlastic', { color: 0xff8a5c }),
      wireRed: M.part('cable', { color: 0xd94f43 }),
      wireBlue: M.part('cable', { color: 0x3f7fc4 }),
    };

    this._buildBody();
    this._buildFrame();
    this._buildGearTrain();
    this._buildGenerator();
    this._buildCircuit();
    this._buildHead();
    this._buildCrank();
    this._buildSwitch();

    this.setXray(0);
  }

  /* --- 外装 --------------------------------------------------------- */

  _buildBody() {
    const g = group({ name: 'body', pos: [0, 0.0042, 0] });
    const W = 0.082;
    const H = 0.130;
    const D = 0.056;

    mesh(new G.RoundedBoxGeometry(W, H, D, 6, 0.0155), this.mats.body, {
      parent: g,
      pos: [0, H / 2, 0],
    });

    // 上下の縁どり。少しだけ外に張り出して、輪郭に段差をつくる。
    const bandGeo = new G.RoundedBoxGeometry(W + 0.0026, 0.0125, D + 0.0026, 4, 0.0062);
    mesh(bandGeo, this.mats.trim, { parent: g, pos: [0, 0.0122, 0] });
    mesh(bandGeo.clone(), this.mats.trim, { parent: g, pos: [0, H - 0.0122, 0] });

    // 正面の点検パネルの「枠」だけを付ける。
    // 中を塗りつぶさないので、すけすけにしたとき歯車がはっきり見える。
    const pw = W - 0.014;
    const ph = H - 0.038;
    const frameOuter = rectPts(pw, ph);
    const frameInner = rectPts(pw - 0.010, ph - 0.010);
    const bezelGeo = G.extrudeOutline(frameOuter, [frameInner], 0.0024, { corner: 0.008, bevel: 0.0005 });
    mesh(bezelGeo, this.mats.trim, { parent: g, pos: [0, H / 2, D / 2 - 0.0004] });

    // パネルのネジ（開けられそうに見えるのが大事）
    const screwGeo = G.screw({ headR: 0.0024, headH: 0.0011, shaftR: 0.001, shaftLen: 0.002 });
    const px = W / 2 - 0.011;
    const py0 = H / 2 - (H - 0.040) / 2 + 0.008;
    const py1 = H / 2 + (H - 0.040) / 2 - 0.008;
    let seed = 0;
    for (const sx of [-1, 1]) {
      for (const py of [py0, py1]) {
        const s = mesh(screwGeo, this.mats.bezel, {
          parent: g,
          pos: [sx * px, py, D / 2 + 0.0004],
          rot: [Math.PI / 2, 0, (seed++ % 4) * 0.7],
          cast: false,
        });
        s.receiveShadow = false;
      }
    }

    // 側面のすべり止めリブ
    const ribGeo = new G.RoundedBoxGeometry(0.003, 0.052, 0.030, 3, 0.0014);
    for (const sx of [-1, 1]) {
      for (const dy of [-0.010, 0.004, 0.018]) {
        mesh(ribGeo, this.mats.trim, { parent: g, pos: [sx * (W / 2 - 0.0004), H / 2 + dy, 0] });
      }
    }

    // 持ち手（かばんの取っ手のような形。シルエットに変化をつける）
    const handleBar = new G.RoundedBoxGeometry(0.030, 0.0052, 0.0068, 4, 0.0026);
    mesh(handleBar, this.mats.trim, { parent: g, pos: [0.006, H + 0.0122, 0] });
    const handlePost = new G.RoundedBoxGeometry(0.0058, 0.0125, 0.0062, 3, 0.0022);
    for (const dx of [-0.0115, 0.0115]) {
      mesh(handlePost, this.mats.trim, { parent: g, pos: [0.006 + dx, H + 0.0058, 0] });
    }

    // ゴム脚
    const footGeo = G.lathe(
      [
        [0, 0],
        [0.0058, 0],
        [0.0062, 0.0022],
        [0.0046, 0.0044],
        [0, 0.0046],
      ],
      { segments: 20, center: false },
    );
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(footGeo, this.mats.rubber, {
          parent: g,
          pos: [sx * 0.028, 0.0002, sz * 0.019],
          rot: [Math.PI, 0, 0],
          cast: false,
        });
      }
    }

    this.addShell(g);
    this.bodyGroup = g;
    this.bodySize = { W, H, D };
  }

  /* --- 内部フレーム -------------------------------------------------- */

  _buildFrame() {
    const f = group({ name: 'frame' });

    // 歯車を支える地板。肉抜きを入れて「板」ではなく「機械の骨」に見せる。
    const w = 0.070;
    const outline = [
      new THREE.Vector2(-w / 2, 0.024),
      new THREE.Vector2(w / 2, 0.024),
      new THREE.Vector2(w / 2, 0.104),
      new THREE.Vector2(-w / 2, 0.104),
    ];
    const holes = [];
    for (const [cx, cy, r] of [
      [-0.024, 0.033, 0.006],
      [0.024, 0.033, 0.006],
      [-0.026, 0.094, 0.0055],
      [0.027, 0.096, 0.0055],
      [0.030, 0.062, 0.005],
    ]) {
      const ring = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        ring.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      holes.push(ring);
    }
    const plate = G.extrudeOutline(outline, holes, 0.0018, { corner: 0.007, bevel: 0.0004 });
    const plateMesh = mesh(plate, this.mats.plate, { parent: f, pos: [0, 0, -0.0185] });
    plateMesh.receiveShadow = true;

    // 地板を支える真鍮の柱
    const postGeo = G.lathe(
      [
        [0, 0],
        [0.0026, 0],
        [0.0026, 0.0075],
        [0.0018, 0.008],
        [0.0018, 0.0125],
        [0, 0.0125],
      ],
      { segments: 16, center: false },
    );
    for (const [x, y] of [
      [-0.030, 0.030],
      [0.030, 0.030],
      [-0.030, 0.099],
      [0.030, 0.099],
    ]) {
      const p = mesh(postGeo, this.mats.post, { parent: f, pos: [x, y, -0.0175], cast: false });
      p.rotation.x = -Math.PI / 2;
    }

    // 軸受けのボス
    const bossGeo = G.lathe(
      [
        [0.0012, 0],
        [0.0040, 0],
        [0.0040, 0.0038],
        [0.0028, 0.0044],
        [0.0012, 0.0044],
      ],
      { segments: 20, center: false },
    );
    for (const s of [S1, S2, S3]) {
      const b = mesh(bossGeo, this.mats.plate, { parent: f, pos: [s.x, s.y, -0.0176], cast: false });
      b.rotation.x = -Math.PI / 2;
    }

    this.addGuts(f);
    this.frameGroup = f;
  }

  /* --- 歯車列 -------------------------------------------------------- */

  _buildGearTrain() {
    const guts = group({ name: 'gearTrain' });

    /* 軸1: クランクの大歯車 */
    const shaft1 = group({ parent: guts, pos: [S1.x, S1.y, 0] });
    this.shaft1 = shaft1;
    mesh(
      G.gearGeometry({
        teeth: TEETH.g1, module: MOD, thickness: 0.0044,
        bore: 0.0024, hub: 0.0058, hubHeight: 0.0020, spokes: 5,
      }),
      this.mats.gearBrass,
      { parent: shaft1, pos: [0, 0, Z_A], rot: [Math.PI / 2, 0, 0] },
    );
    const axle1 = mesh(G.chamferedCylinder(0.0021, 0.052, 0.0004, 18), this.mats.shaft, {
      parent: shaft1, pos: [0, 0, 0.008], cast: false,
    });
    axle1.rotation.x = Math.PI / 2;

    /* 軸2: 小歯車 + 大歯車 */
    const shaft2 = group({ parent: guts, pos: [S2.x, S2.y, 0] });
    this.shaft2 = shaft2;
    mesh(
      G.gearGeometry({ teeth: TEETH.p1, module: MOD, thickness: 0.0044, bore: 0.0019, hub: 0.0036, hubHeight: 0.0014 }),
      this.mats.gearSteel,
      { parent: shaft2, pos: [0, 0, Z_A], rot: [Math.PI / 2, 0, 0] },
    );
    mesh(
      G.gearGeometry({
        teeth: TEETH.g2, module: MOD, thickness: 0.0040,
        bore: 0.0019, hub: 0.0050, hubHeight: 0.0016, spokes: 4,
      }),
      this.mats.gearBrass2,
      { parent: shaft2, pos: [0, 0, Z_B], rot: [Math.PI / 2, 0, 0] },
    );
    const axle2 = mesh(G.chamferedCylinder(0.0017, 0.034, 0.0003, 16), this.mats.shaft, {
      parent: shaft2, pos: [0, 0, 0.0012], cast: false,
    });
    axle2.rotation.x = Math.PI / 2;

    /* 軸3: 小歯車 + 発電機の回転子 */
    const shaft3 = group({ parent: guts, pos: [S3.x, S3.y, 0] });
    this.shaft3 = shaft3;
    mesh(
      G.gearGeometry({ teeth: TEETH.p2, module: MOD, thickness: 0.0040, bore: 0.0016, hub: 0.0032, hubHeight: 0.0012 }),
      this.mats.gearSteel2,
      { parent: shaft3, pos: [0, 0, Z_B], rot: [Math.PI / 2, 0, 0] },
    );
    const axle3 = mesh(G.chamferedCylinder(0.0015, 0.032, 0.0003, 16), this.mats.shaft, {
      parent: shaft3, pos: [0, 0, -0.0015], cast: false,
    });
    axle3.rotation.x = Math.PI / 2;

    this.addGuts(guts);
    this.gearTrain = guts;

    /* さわれる歯車（押さえると全部止まる） */
    hitCylinder(shaft1, pitchR(TEETH.g1) + 0.001, 0.016, [0, 0, Z_A], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'gearBig',
      label: 'はぐるま',
      type: 'grab',
      object: shaft1,
      hint: { kind: 'hold', offset: [0, 0, -0.014], size: 0.010 },
      onGrab: () => this._holdGear(1),
      onRelease: () => this._holdGear(-1),
    });

    hitCylinder(shaft2, pitchR(TEETH.g2) + 0.001, 0.016, [0, 0, Z_B], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'gearMid',
      label: 'はぐるま',
      type: 'grab',
      object: shaft2,
      onGrab: () => this._holdGear(1),
      onRelease: () => this._holdGear(-1),
    });
  }

  /* --- 発電機 -------------------------------------------------------- */

  _buildGenerator() {
    const gen = group({ name: 'generator', pos: [S3.x, S3.y, -0.0038] });

    // 積層鉄心（C 字のヨークを向かい合わせ）
    const rOut = 0.0140;
    const rIn = 0.0088;
    const openA = 0.60;
    const outline = [];
    for (let i = 0; i <= 22; i++) {
      const a = lerp(openA, Math.PI - openA, i / 22);
      outline.push(new THREE.Vector2(Math.cos(a) * rOut, Math.sin(a) * rOut));
    }
    for (let i = 22; i >= 0; i--) {
      const a = lerp(openA, Math.PI - openA, i / 22);
      outline.push(new THREE.Vector2(Math.cos(a) * rIn, Math.sin(a) * rIn));
    }
    const yokeGeo = G.extrudeOutline(outline, [], 0.0074, { corner: 0.0009, bevel: 0.0004 });
    for (const flip of [0, Math.PI]) {
      mesh(yokeGeo, this.mats.laminate, { parent: gen, rot: [0, 0, flip], cast: false });
    }

    // コイル（左右）と、その端板
    const coilGeo = G.bobbinCoil({ radius: 0.0031, wire: 0.00062, turns: 13, length: 0.0094, layers: 2 });
    const cheekGeo = G.ring(0.0048, 0.0024, 0.0009, 22);
    this.coilMats = [];
    for (const sx of [-1, 1]) {
      const m = this.M.part('copper', { emissive: 0xff8a3c, emissiveIntensity: 0 });
      this.coilMats.push(m);
      const c = mesh(coilGeo, m, { parent: gen, pos: [sx * 0.0114, 0, 0], cast: false });
      c.rotation.z = Math.PI / 2;
      for (const dz of [-0.0054, 0.0054]) {
        const ch = mesh(cheekGeo, this.mats.laminate, {
          parent: gen,
          pos: [sx * 0.0114 + dz, 0, 0],
          rot: [0, 0, Math.PI / 2],
          cast: false,
        });
        ch.receiveShadow = false;
      }
    }

    // 回転子（2極の磁石）— 軸3 と一緒に回る
    const rotorGroup = group({ parent: this.shaft3, name: 'rotor', pos: [0, 0, -0.0038] });
    const halfMagnet = (angle, mat) => {
      const pts = [];
      const r = 0.0070;
      for (let i = 0; i <= 20; i++) {
        const a = lerp(-Math.PI / 2, Math.PI / 2, i / 20);
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      pts.push(new THREE.Vector2(-0.0008, -r));
      const geo = G.extrudeOutline(pts, [], 0.0070, { corner: 0.0006, bevel: 0.0003 });
      mesh(geo, mat, { parent: rotorGroup, rot: [0, 0, angle], cast: false });
    };
    halfMagnet(0, this.mats.magnetN);
    halfMagnet(Math.PI, this.mats.magnetS);
    this.rotorGroup = rotorGroup;

    hitCylinder(rotorGroup, 0.0105, 0.012, [0, 0, 0], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'rotor',
      label: 'じしゃく',
      type: 'grab',
      object: rotorGroup,
      onGrab: () => this._holdGear(1),
      onRelease: () => this._holdGear(-1),
    });

    this.addGuts(gen);
    this.generator = gen;
  }

  /* --- 回路 ---------------------------------------------------------- */

  _buildCircuit() {
    const c = group({ name: 'circuit', pos: [0, 0.0295, -0.0035] });

    mesh(G.roundedPlate(0.050, 0.016, 0.0014, 0.002, { bevel: 0.0003 }), this.mats.pcb, {
      parent: c, cast: false,
    });

    /* コンデンサ = 電気のバケツ */
    const capGroup = group({ parent: c, pos: [0.013, 0.0, 0.008], rot: [0, 0, -0.05] });
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0054, 0],
          [0.0057, 0.0013],
          [0.0057, 0.0148],
          [0.0049, 0.0160],
          [0, 0.0162],
        ],
        { segments: 28, center: false },
      ),
      this.mats.capBody,
      { parent: capGroup, cast: false },
    );
    const band = mesh(G.pipe(0.00575, 0.0052, 0.0132, { segments: 28, chamfer: 0.0002 }), this.mats.capBand, {
      parent: capGroup, pos: [0, 0.0081, 0], cast: false,
    });
    band.scale.set(0.32, 1, 1);

    // 中に溜まる電気（青く光る）
    this.chargeMat = new THREE.MeshBasicMaterial({
      color: 0x76e6ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const fill = mesh(new THREE.CylinderGeometry(0.0047, 0.0047, 1, 22, 1, false), this.chargeMat, {
      parent: capGroup, cast: false, receive: false,
    });
    fill.renderOrder = 12;
    this.chargeFill = fill;
    this.capGroup = capGroup;

    hitCylinder(capGroup, 0.0098, 0.022, [0, 0.008, 0]);
    this.handle({
      id: 'capacitor',
      label: 'でんきの タンク',
      type: 'grab',
      object: capGroup,
    });

    // 整流ブリッジ
    mesh(new G.RoundedBoxGeometry(0.0080, 0.0060, 0.0054, 3, 0.0012), this.mats.capBody, {
      parent: c, pos: [-0.010, 0.0022, 0.006], cast: false,
    });

    /* 配線 — 発電機から基板へ、基板から電球へ */
    const wireA = G.tubeFromPoints(
      [
        [-0.019, 0.0010, 0.005],
        [-0.024, 0.008, 0.003],
        [-0.027, 0.020, 0.000],
        [S3.x - 0.014, S3.y - 0.0295 + 0.001, -0.002],
      ],
      0.00078,
      { radialSegments: 6 },
    );
    mesh(wireA, this.mats.wireRed, { parent: c, cast: false });

    const wireB = G.tubeFromPoints(
      [
        [-0.017, -0.0022, 0.008],
        [-0.022, -0.004, 0.011],
        [-0.026, 0.008, 0.013],
        [S3.x + 0.013, S3.y - 0.0295 - 0.001, 0.008],
      ],
      0.00078,
      { radialSegments: 6 },
    );
    mesh(wireB, this.mats.wireBlue, { parent: c, cast: false });

    const wireUp = G.tubeFromPoints(
      [
        [0.019, 0.0038, 0.006],
        [0.028, 0.018, 0.004],
        [0.026, 0.050, 0.002],
        [0.006, 0.074, 0.000],
        [-0.017, 0.080, 0.000],
      ],
      0.00078,
      { radialSegments: 6 },
    );
    mesh(wireUp, this.mats.wireRed, { parent: c, cast: false });

    this.addGuts(c);
    this.circuit = c;
  }

  /* --- ヘッド（電球の筒） -------------------------------------------- */

  _buildHead() {
    // aim のローカル +Y が光の向きになるように回しておく
    const head = group({ name: 'head', pos: [-0.030, 0.1055, 0] });
    const aim = group({ parent: head, name: 'aim' });
    aim.rotation.z = 115 * DEG;
    this.aim = aim;

    /* 外側の筒（すけすけ対象） */
    const shellGroup = group({ name: 'headShell' });
    const barrel = G.lathe(
      [
        [0.0158, -0.0024],
        [0.0206, -0.0024],
        [0.0214, 0.0028],
        [0.0222, 0.0132],
        [0.0230, 0.0244],
        [0.0230, 0.0274],
        [0.0190, 0.0274],
        [0.0190, 0.0248],
        [0.0200, 0.0132],
        [0.0192, 0.0028],
        [0.0158, -0.0024],
      ],
      { segments: 44, center: false },
    );
    mesh(barrel, this.mats.headShell, { parent: shellGroup });

    // 口金リング
    const bezel = mesh(G.ring(0.0242, 0.0190, 0.0040, 44), this.mats.bezel, {
      parent: shellGroup, pos: [0, 0.0282, 0], cast: false,
    });
    bezel.receiveShadow = false;

    // レンズ（うっすらふくらんだガラス）
    const lens = mesh(
      G.lathe(
        [
          [0, 0.0020],
          [0.0088, 0.0018],
          [0.0152, 0.0012],
          [0.0196, 0.0002],
          [0.0196, -0.0006],
          [0, -0.0006],
        ],
        { segments: 44, center: false },
      ),
      this.mats.lens,
      { parent: shellGroup, pos: [0, 0.0268, 0], cast: false },
    );
    lens.renderOrder = 22;

    aim.add(shellGroup);
    this.addShell(head);

    /* 中身: 反射鏡と豆電球 */
    const inner = group({ name: 'headGuts' });
    mesh(G.lathe(parabolaShell(0.0182, 0.0148, 16, 0.0006), { segments: 48, center: false }), this.mats.reflector, {
      parent: inner, pos: [0, 0.0050, 0], cast: false,
    });

    const bulbY = 0.0104;
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0035, 0],
          [0.0037, 0.0028],
          [0.0031, 0.0047],
          [0.0018, 0.0057],
          [0, 0.0060],
        ],
        { segments: 22, center: false },
      ),
      this.mats.bulb,
      { parent: inner, pos: [0, bulbY, 0], cast: false },
    );
    const glass = mesh(
      G.lathe(
        [
          [0.0043, -0.0014],
          [0.0045, 0.0026],
          [0.0037, 0.0053],
          [0.0021, 0.0068],
          [0, 0.0073],
        ],
        { segments: 22, center: false },
      ),
      this.mats.bulbGlass,
      { parent: inner, pos: [0, bulbY, 0], cast: false },
    );
    glass.renderOrder = 21;

    // 口金と足
    mesh(G.chamferedCylinder(0.0032, 0.0034, 0.0006, 18), this.mats.bezel, {
      parent: inner, pos: [0, bulbY - 0.0018, 0], cast: false,
    });
    for (const dz of [-0.0018, 0.0018]) {
      mesh(G.chamferedCylinder(0.0007, 0.008, 0.0002, 8), this.mats.copper, {
        parent: inner, pos: [0, bulbY - 0.0068, dz], cast: false,
      });
    }

    aim.add(inner);
    this.addGuts(head);

    /* 光そのもの */
    const coneH = 0.30;
    this.coneMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffe6a6) },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uHeight: { value: coneH },
      },
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.092, coneH, 44, 10, true), this.coneMaterial);
    cone.rotation.z = Math.PI; // 頂点を -Y 側（電球側）へ
    cone.position.y = bulbY + coneH / 2;
    cone.renderOrder = 30;
    cone.frustumCulled = false;
    aim.add(cone);
    this.lightCone = cone;

    // 電球そのもののにじみ
    const glowMat = new THREE.SpriteMaterial({
      map: softSprite({ size: 128, power: 2.6, core: 0.1 }),
      color: 0xffe6a8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.05);
    glow.position.y = bulbY + 0.002;
    glow.renderOrder = 31;
    aim.add(glow);
    this.bulbGlow = glow;
    this.bulbGlowMaterial = glowMat;

    // 実際に周りを照らすライト
    const spot = new THREE.SpotLight(0xffe7bb, 0, 0.95, 0.44, 0.75, 1.3);
    spot.position.set(0, bulbY, 0);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.6, 0);
    aim.add(spot);
    aim.add(spotTarget);
    spot.target = spotTarget;
    if (this.tier === 'high') {
      spot.castShadow = true;
      spot.shadow.mapSize.set(512, 512);
      spot.shadow.camera.near = 0.008;
      spot.shadow.camera.far = 0.95;
      spot.shadow.bias = -0.002;
      spot.shadow.normalBias = 0.006;
    }
    this.spot = spot;
    this.headGroup = head;
  }

  /* --- クランク ------------------------------------------------------ */

  _buildCrank() {
    const crank = group({ parent: this.shaft1, name: 'crank' });
    const armR = 0.0215;
    const zArm = 0.0345;

    // 軸から前へ出るボス
    const boss = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0046, 0],
          [0.0046, 0.0042],
          [0.0034, 0.0052],
          [0, 0.0052],
        ],
        { segments: 22, center: false },
      ),
      this.mats.shaft,
      { parent: crank, pos: [0, 0, 0.029], cast: false },
    );
    boss.rotation.x = -Math.PI / 2;

    // アーム（先が少し太い、握りやすそうな形）
    const armOutline = [
      new THREE.Vector2(-0.0062, -0.0046),
      new THREE.Vector2(armR + 0.0004, -0.0042),
      new THREE.Vector2(armR + 0.0004, 0.0042),
      new THREE.Vector2(-0.0062, 0.0046),
    ];
    mesh(G.extrudeOutline(armOutline, [], 0.0038, { corner: 0.0036, bevel: 0.0006 }), this.mats.crankPaint, {
      parent: crank, pos: [0, 0, zArm],
    });

    // 握り
    const knob = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0046, 0.0004],
          [0.0056, 0.0030],
          [0.0052, 0.0090],
          [0.0058, 0.0110],
          [0.0046, 0.0134],
          [0, 0.0138],
        ],
        { segments: 26, center: false },
      ),
      this.mats.knob,
      { parent: crank, pos: [armR, 0, zArm + 0.0025] },
    );
    knob.rotation.x = -Math.PI / 2;
    this.crankKnob = knob;

    mesh(G.ring(0.0058, 0.0024, 0.0009, 22), this.mats.shaft, {
      parent: crank, pos: [armR, 0, zArm + 0.0022], rot: [Math.PI / 2, 0, 0], cast: false,
    });

    this.crankGroup = crank;

    // 指が乗りやすいよう、握りのまわりに広めの当たり判定
    hitSphere(crank, 0.0135, [armR, 0, zArm + 0.008]);
    hitCylinder(crank, 0.0080, 0.028, [armR * 0.5, 0, zArm], [Math.PI / 2, 0, 0]);

    this.handle({
      id: 'crank',
      label: 'ハンドル',
      type: 'rotate',
      object: crank,
      axisObject: this.shaft1,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: this.shaft1,
      primary: true,
      hint: { kind: 'spin', anchor: this.shaft1, offset: [0, 0, 0.050], size: 0.026 },
      onRotate: (d, ctx) => {
        this.angle += d;
        this.omega = clamp(ctx.velocity, -70, 70);
        this.driving = true;
        this._driveTimer = 0.12;
      },
      onFling: (v) => {
        this.omega = clamp(v, -60, 60);
        this.driving = false;
      },
      onTap: () => {
        this.omega += 9 * (this.omega >= 0 ? 1 : -1);
      },
    });
  }

  /* --- スイッチ ------------------------------------------------------ */

  _buildSwitch() {
    const sw = group({ pos: [-0.021, 0.0985, 0.0272] });
    const seat = mesh(
      G.lathe(
        [
          [0.0076, 0],
          [0.0076, 0.0020],
          [0.0052, 0.0030],
          [0.0040, 0.0030],
          [0.0040, 0],
        ],
        { segments: 24, center: false },
      ),
      this.mats.bezel,
      { parent: sw, cast: false },
    );
    seat.rotation.x = -Math.PI / 2;

    const cap = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0042, 0.0002],
          [0.0048, 0.0018],
          [0.0048, 0.0046],
          [0.0038, 0.0060],
          [0, 0.0062],
        ],
        { segments: 24, center: false },
      ),
      this.mats.switchCap,
      { parent: sw, pos: [0, 0, 0.0012] },
    );
    cap.rotation.x = -Math.PI / 2;
    this.switchCap = cap;

    // 中身側のスイッチ本体（外から押した力が中へ伝わっていることを見せる）
    const inner = group({ parent: sw, pos: [0, 0, -0.0068] });
    mesh(new G.RoundedBoxGeometry(0.0125, 0.0072, 0.0060, 3, 0.0012), this.mats.capBody, {
      parent: inner, cast: false,
    });
    mesh(G.chamferedCylinder(0.0018, 0.0042, 0.0004, 14), this.mats.bezel, {
      parent: inner, pos: [0, 0, 0.0044], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    for (const dx of [-0.0042, 0.0042]) {
      mesh(G.chamferedCylinder(0.0006, 0.0055, 0.0002, 8), this.mats.copper, {
        parent: inner, pos: [dx, -0.0055, 0], cast: false,
      });
    }

    hitSphere(sw, 0.0105, [0, 0, 0.004]);
    this.handle({
      id: 'switch',
      label: 'スイッチ',
      type: 'press',
      object: sw,
      hint: { kind: 'push', offset: [0, 0, 0.024], size: 0.013, axis: new THREE.Vector3(0, 0, 1) },
      onPress: () => {
        this.switchOn = !this.switchOn;
        this._switchPress = 1;
        this.audio.click({ gain: 0.5, bright: this.switchOn ? 3200 : 2000 });
      },
    });

    this.addGuts(sw);
    this.switchGroup = sw;
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  _holdGear(delta) {
    this.holdCount = Math.max(0, this.holdCount + delta);
    if (delta > 0 && Math.abs(this.omega) > 3) this.audio.click({ gain: 0.34, bright: 850 });
  }

  step(dt) {
    this._driveTimer = Math.max(0, this._driveTimer - dt);
    if (this._driveTimer === 0) this.driving = false;

    if (this.holdCount > 0) {
      // 指で押さえられている: 全部止まる
      this.omega = damp(this.omega, 0, 42, dt);
      if (Math.abs(this.omega) < 0.05) this.omega = 0;
    } else if (!this.driving) {
      // 発電の負荷（速いほど重い）+ 機械の摩擦
      const load = 0.030 * (this.switchOn ? 1.0 : 0.6);
      const friction = 0.65;
      this.omega -= this.omega * load * Math.abs(this.omega) * dt;
      this.omega -= Math.sign(this.omega) * Math.min(Math.abs(this.omega), friction * dt);
      this.angle += this.omega * dt;
    }

    // 発電量: 回転が速いほど増える
    const rotorOmega = Math.abs(this.omega) * RATIO;
    const generated = clamp01(smoothstep(2.0, 30, rotorOmega)) * 0.9;
    const draw = this.switchOn ? this.brightness * 0.155 : 0;
    const leak = 0.009;
    this.charge = clamp01(this.charge + (generated * 1.5 - draw - leak) * dt);

    // 明るさ: 電気が足りているほど明るい。豆電球なので少し遅れる。
    const target = this.switchOn ? smoothstep(0.05, 0.60, this.charge) : 0;
    this.brightness = damp(this.brightness, target, 7.5, dt);
  }

  /* ---------------------------------------------------------------- */
  /* 表示                                                              */
  /* ---------------------------------------------------------------- */

  lateUpdate(dt) {
    const a = this.angle;
    this.shaft1.rotation.z = a;
    this.shaft2.rotation.z = -a * (TEETH.g1 / TEETH.p1);
    this.shaft3.rotation.z = a * RATIO;

    const b = this.brightness;
    this.mats.bulb.emissiveIntensity = b * 6.0;
    this.mats.bulb.color.setRGB(0.16 + b * 0.5, 0.14 + b * 0.45, 0.09 + b * 0.3);
    this.bulbGlowMaterial.opacity = b * 0.85;
    this.bulbGlow.scale.setScalar(0.026 + b * 0.046);
    this.coneMaterial.uniforms.uIntensity.value = b * 0.40;
    this.coneMaterial.uniforms.uTime.value = this.time;
    this.spot.intensity = b * 3.2;

    // コイルは発電しているときに熱っぽく光る
    const gen = clamp01((Math.abs(this.omega) * RATIO) / 105);
    for (const m of this.coilMats) m.emissiveIntensity = gen * gen * 0.34;

    // コンデンサの中身
    const h = 0.0004 + this.charge * 0.0140;
    this.chargeFill.scale.set(1, h, 1);
    this.chargeFill.position.y = h / 2 + 0.0009;
    this.chargeMat.opacity = 0.32 + this.charge * 0.5;

    this._switchPress = damp(this._switchPress, 0, 9, dt);
    this.switchCap.position.z = 0.0012 - this._switchPress * 0.0018;

    this._updateSound(dt);
  }

  _updateSound(dt) {
    const speed = Math.abs(this.omega);
    const gear = this.audio.voice('lightGear', { source: 'noise', filter: 'bandpass', freq: 400, Q: 4 });
    const whine = this.audio.voice('lightWhine', { source: 'tone', type: 'triangle', freq: 200, detune: 7 });

    const spin = clamp01(speed / 22);
    gear.set({ level: spin * 0.15, freq: 320 + speed * 42, Q: 3 + spin * 5, smooth: 0.05 });
    whine.set({
      level: spin * spin * 0.05,
      freq: clamp(90 + speed * RATIO * 2.4, 60, 2200),
      smooth: 0.06,
    });

    // 歯車がかみ合う「カチカチ」
    this._clickPhase += speed * TEETH.g1 * dt;
    if (this._clickPhase > TAU) {
      this._clickPhase %= TAU;
      if (speed > 1.5 && Math.random() < 0.35) this.audio.tick({ gain: 0.028 * spin, pitch: 2.4 });
    }
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'charge', icon: 'bolt', label: 'でんき', value: this.charge, color: '#41b6e6' },
      { id: 'bright', icon: 'bulb', label: 'あかるさ', value: this.brightness, color: '#f5b731' },
    ];
  }

  reset() {
    this.angle = 0;
    this.omega = 0;
    this.charge = 0;
    this.brightness = 0;
    this.switchOn = true;
    this.holdCount = 0;
  }
}

/* ------------------------------------------------------------------ */

/** 中心原点の長方形の頂点列（角丸は extrudeOutline 側で付ける） */
function rectPts(w, h) {
  return [
    new THREE.Vector2(-w / 2, -h / 2),
    new THREE.Vector2(w / 2, -h / 2),
    new THREE.Vector2(w / 2, h / 2),
    new THREE.Vector2(-w / 2, h / 2),
  ];
}

/**
 * 放物面の反射鏡（薄い殻）のプロファイル。
 * @returns {[number, number][]} [半径, 高さ]
 */
function parabolaShell(maxR, depth, steps, thickness) {
  const pts = [];
  const a = depth / (maxR * maxR);
  for (let i = 0; i <= steps; i++) {
    const r = (maxR * i) / steps;
    pts.push([r, a * r * r]);
  }
  for (let i = steps; i >= 0; i--) {
    const r = (maxR * i) / steps;
    pts.push([r, a * r * r + thickness]);
  }
  return pts;
}
