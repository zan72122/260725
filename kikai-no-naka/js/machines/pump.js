/**
 * pump.js — みずポンプ
 *
 * 「みず」がどうやって上がってくるのかを、弁のはたらきごと見せる機械。
 *
 *   レバー → ピストン → 上に引くと 下の弁があいて 水を吸いあげる
 *                     → 下に押すと ピストンの弁があいて 水が上へ通る
 *          → 次に上げたとき、その水が 口から出る
 *
 * さわりどころ:
 *   - レバーを上下すると、パイプの中を水が のぼっていくのが見える
 *   - 下の弁を指で押さえて開けっぱなしにすると、いくらこいでも水が出ない
 *   - 出た水は うけ皿から タンクへもどるので、なくならない
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { ParticleField } from '../lib/particles.js';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../lib/math.js';

const TANK_X = -0.046;
const TANK_R = 0.0300;
const TANK_H = 0.0620;
const PUMP_X = 0.0300;
const PUMP_R = 0.0165;
const PUMP_BOTTOM = 0.0130;
const PUMP_TOP = 0.0880;
const PIVOT_Y = 0.1010;
const BASIN_X = 0.0700;

export class Pump extends Machine {
  static meta = {
    id: 'pump',
    name: 'みずポンプ',
    sub: 'みずが のぼる',
    accent: 0x3aa9d8,
    backdrop: {
      top: '#f2fbff',
      middle: '#dff0fa',
      bottom: '#bfd8e8',
      glow: '#d8f2ff',
      glowStrength: 0.15,
    },
    bloom: { strength: 0.30, radius: 0.52, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="18" width="14" height="22" rx="3" fill="#bfe6f7" stroke="#2b7b9e" stroke-width="2.2"/>
      <rect x="8" y="26" width="10" height="12" rx="2" fill="#4fb6e0"/>
      <rect x="26" y="14" width="10" height="26" rx="3" fill="#e0685a" stroke="#8d3328" stroke-width="2.2"/>
      <path d="M36 20h6l-2 6" stroke="#8d3328" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <path d="M26 12h14" stroke="#8d3328" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M40 26c0 2.6-2 4-2 6a2 2 0 0 0 4 0c0-2-2-3.4-2-6Z" fill="#4fb6e0"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.leverAngle = 0.30;   // レバーの角度（+ で下、- で上）
    this.pistonY = 0;         // シリンダ内のピストン位置 0..1
    this.pistonVel = 0;
    this.prime = 0;           // パイプに満ちている水 0..1
    this.tankLevel = 0.82;    // タンクの水 0..1
    this.basinLevel = 0;      // うけ皿の水 0..1
    this.flow = 0;            // 口から出ている量
    this.footValveHeld = false;
    this.footValveOpen = 0;
    this.pistonValveOpen = 0;
    this._dripTimer = 0;
    this._squeak = 0;

    this.radius = 0.098;
    this.center = new THREE.Vector3(0.004, 0.058, 0);
    this.footprint = { w: 0.175, d: 0.085, opacity: 0.32 };
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.20, -0.35, -1.0),
      center: this.center,
      span: 0.115,
      noiseScale: 12,
    });

    this.mats = {
      tankGlass: M.shell('glass', { strength: 0.94, thickness: 0.004 }),
      pumpBody: M.shell('paint', { color: 0xe0685a, roughness: 0.34 }),
      pumpTrim: M.shell('paint', { color: 0x8d3328, roughness: 0.38 }),
      base: M.shell('wood', { seed: 33, light: '#c8a273', dark: '#8d6539' }),
      basin: M.shell('paint', { color: 0xf3d98f, roughness: 0.32 }),

      water: M.plain('water'),
      waterFlow: M.plain('water', { color: 0x8fdcf7 }),
      // 水の道すじをふさぐ筒は、すけすけの対象にして中が見えるようにする
      pipe: M.shell('coated', { color: 0x9aa6b2, roughness: 0.4 }),
      pipeInner: M.shell('coated', { color: 0x8b96a2, roughness: 0.45 }),
      brass: M.part('brass'),
      steel: M.part('steel', { color: 0xdbe1e7, roughness: 0.2 }),
      rod: M.part('steel', { color: 0xe4e9ee, roughness: 0.14 }),
      leather: M.part('rubber', { color: 0x6d4b2f }),
      valve: M.part('brass', { color: 0xefc978 }),
      handle: M.part('paint', { color: 0x2f8fc0, clearcoat: 0.9, roughness: 0.24 }),
      grip: M.part('softPlastic', { color: 0xffd45e }),
    };

    this._buildBase();
    this._buildTank();
    this._buildPipes();
    this._buildPump();
    this._buildLever();
    this._buildBasin();
    this._buildDroplets();

    this.setXray(0);
  }

  /* --- 台 ------------------------------------------------------------- */

  _buildBase() {
    const g = group({ name: 'base' });
    mesh(new G.RoundedBoxGeometry(0.178, 0.0100, 0.086, 4, 0.0040), this.mats.base, {
      parent: g, pos: [0.004, 0.0050, 0],
    });
    mesh(G.roundedPlate(0.170, 0.078, 0.0016, 0.004), this.mats.pumpTrim, {
      parent: g, pos: [0.004, 0.0102, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    this.addShell(g);
  }

  /* --- タンク ---------------------------------------------------------- */

  _buildTank() {
    const g = group({ name: 'tank', pos: [TANK_X, 0.0100, 0] });

    // ガラスの円筒
    const glass = mesh(
      G.pipe(TANK_R, TANK_R - 0.0022, TANK_H, { segments: 52, chamfer: 0.0008 }),
      this.mats.tankGlass,
      { parent: g, pos: [0, TANK_H / 2, 0], cast: false },
    );
    glass.renderOrder = 24;
    // 底
    mesh(G.chamferedCylinder(TANK_R, 0.0032, 0.0008, 48), this.mats.tankGlass, {
      parent: g, pos: [0, 0.0016, 0], cast: false,
    });
    // 口のリング
    mesh(G.ring(TANK_R + 0.0022, TANK_R - 0.0030, 0.0044, 52), this.mats.pumpTrim, {
      parent: g, pos: [0, TANK_H - 0.0010, 0], cast: false,
    });

    this.addShell(g);
    this.tankGroup = g;

    // 中の水（高さをアニメーションさせる）
    const waterGeo = G.chamferedCylinder(TANK_R - 0.0026, 1.0, 0.0004, 48);
    const water = new THREE.Mesh(waterGeo, this.mats.water);
    water.castShadow = false;
    water.receiveShadow = false;
    water.renderOrder = 12;
    g.add(water);
    this.tankWater = water;
  }

  /* --- 配管 ------------------------------------------------------------ */

  _buildPipes() {
    const g = group({ name: 'pipes' });

    // タンク底 → ポンプ下部
    const y = 0.0100 + 0.0075;
    const pipeGeo = G.pipe(0.0066, 0.0050, PUMP_X - TANK_X, { segments: 26, chamfer: 0.0006 });
    const p = mesh(pipeGeo, this.mats.pipe, {
      parent: g, pos: [(TANK_X + PUMP_X) / 2, y, 0], cast: false,
    });
    p.rotation.z = Math.PI / 2;
    this.shellMeshes.push(p);
    p.userData.castShadowDefault = false;

    // 中を流れる水（prime に応じて長さが伸びる）
    const innerGeo = G.chamferedCylinder(0.0046, 1.0, 0.0002, 20);
    const inner = new THREE.Mesh(innerGeo, this.mats.waterFlow);
    inner.rotation.z = -Math.PI / 2;
    inner.castShadow = false;
    inner.receiveShadow = false;
    inner.renderOrder = 11;
    g.add(inner);
    this.pipeWater = inner;
    this.pipeWaterY = y;

    // 下の弁（足弁）
    const fv = group({ parent: g, pos: [TANK_X + 0.0130, y, 0] });
    this.footValveGroup = fv;
    const fvBody = mesh(G.ring(0.0074, 0.0044, 0.0030, 24), this.mats.pipe, { parent: fv, rot: [0, 0, Math.PI / 2], cast: false });
    this.shellMeshes.push(fvBody);
    fvBody.userData.castShadowDefault = false;
    const flap = group({ parent: fv, pos: [0.0022, 0, 0] });
    this.footFlap = flap;
    mesh(G.chamferedCylinder(0.0044, 0.0012, 0.0003, 20), this.mats.valve, {
      parent: flap, pos: [0.0000, -0.0010, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });
    mesh(new G.RoundedBoxGeometry(0.0012, 0.0026, 0.0060, 2, 0.0004), this.mats.valve, {
      parent: fv, pos: [0.0022, 0.0034, 0], cast: false,
    });

    hitSphere(fv, 0.0115, [0, 0, 0]);
    this.handle({
      id: 'footValve',
      label: 'したの べん',
      type: 'grab',
      object: fv,
      hint: { kind: 'hold', offset: [0, 0.014, 0.010], size: 0.011 },
      onGrab: () => {
        this.footValveHeld = true;
      },
      onRelease: () => {
        this.footValveHeld = false;
      },
    });

    this.addGuts(g);
  }

  /* --- ポンプ本体 ------------------------------------------------------- */

  _buildPump() {
    const shell = group({ name: 'pumpShell', pos: [PUMP_X, 0, 0] });

    // 鋳物の胴（外装）
    mesh(
      G.lathe(
        [
          [0.0230, PUMP_BOTTOM - 0.0030],
          [0.0230, PUMP_BOTTOM + 0.0020],
          [0.0180, PUMP_BOTTOM + 0.0060],
          [0.0168, PUMP_TOP - 0.0180],
          [0.0192, PUMP_TOP - 0.0090],
          [0.0192, PUMP_TOP],
          [0.0150, PUMP_TOP + 0.0026],
          [0, PUMP_TOP + 0.0030],
        ],
        { segments: 44, center: false },
      ),
      this.mats.pumpBody,
      { parent: shell },
    );
    // フランジ
    mesh(G.ring(0.0250, 0.0180, 0.0044, 44), this.mats.pumpTrim, {
      parent: shell, pos: [0, PUMP_BOTTOM - 0.0008, 0], cast: false,
    });

    // 口（スパウト）
    const spoutPts = [
      new THREE.Vector3(0.0140, PUMP_TOP - 0.0140, 0),
      new THREE.Vector3(0.0250, PUMP_TOP - 0.0130, 0),
      new THREE.Vector3(0.0330, PUMP_TOP - 0.0180, 0),
      new THREE.Vector3(0.0372, PUMP_TOP - 0.0270, 0),
    ];
    mesh(G.tubeFromPoints(spoutPts, 0.0062, { radialSegments: 18 }), this.mats.pumpBody, { parent: shell });
    mesh(G.ring(0.0074, 0.0050, 0.0034, 22), this.mats.pumpTrim, {
      parent: shell, pos: [0.0374, PUMP_TOP - 0.0292, 0], cast: false,
    });
    this.spoutTip = new THREE.Vector3(PUMP_X + 0.0374, PUMP_TOP - 0.0300, 0);

    this.addShell(shell);
    this.pumpShell = shell;

    /* --- シリンダの中身 --- */
    const guts = group({ name: 'pumpGuts', pos: [PUMP_X, 0, 0] });

    // シリンダの内壁
    const liner = mesh(
      G.pipe(0.0128, 0.0116, PUMP_TOP - PUMP_BOTTOM - 0.004, { segments: 32, chamfer: 0.0005 }),
      this.mats.pipeInner,
      { parent: guts, pos: [0, (PUMP_TOP + PUMP_BOTTOM) / 2, 0], cast: false },
    );
    this.shellMeshes.push(liner);
    liner.userData.castShadowDefault = false;

    // シリンダ内の水
    const colGeo = G.chamferedCylinder(0.0112, 1.0, 0.0003, 28);
    const col = new THREE.Mesh(colGeo, this.mats.waterFlow);
    col.castShadow = false;
    col.receiveShadow = false;
    col.renderOrder = 11;
    guts.add(col);
    this.cylinderWater = col;

    // ピストン
    const piston = group({ parent: guts });
    this.pistonGroup = piston;
    mesh(G.chamferedCylinder(0.0112, 0.0062, 0.0008, 28), this.mats.brass, { parent: piston, cast: false });
    mesh(G.ring(0.0118, 0.0096, 0.0022, 28), this.mats.leather, { parent: piston, pos: [0, 0.0018, 0], cast: false });
    // ピストンの弁
    const pv = group({ parent: piston, pos: [0, 0.0034, 0] });
    this.pistonValve = pv;
    mesh(G.chamferedCylinder(0.0052, 0.0012, 0.0003, 20), this.mats.valve, { parent: pv, cast: false });
    mesh(G.chamferedCylinder(0.0010, 0.0060, 0.0002, 10), this.mats.steel, {
      parent: piston, pos: [0, 0.0050, 0], cast: false,
    });

    hitCylinder(piston, 0.014, 0.014, [0, 0.002, 0]);
    this.handle({
      id: 'pistonValve',
      label: 'ピストン',
      type: 'grab',
      object: piston,
      label2: 'ピストン',
    });

    // ピストン棒（長さは毎フレーム、ピストンとレバーの間に合わせて伸縮させる）
    const rod = mesh(G.chamferedCylinder(0.0026, 1.0, 0.0004, 16), this.mats.rod, {
      parent: guts, pos: [0, PUMP_TOP, 0], cast: false,
    });
    this.pistonRod = rod;

    this.addGuts(guts);
    this.pumpGuts = guts;
  }

  /* --- レバー ---------------------------------------------------------- */

  _buildLever() {
    const pivot = group({ pos: [PUMP_X, PIVOT_Y, 0] });
    this.root.add(pivot);
    this.leverPivot = pivot;

    // 支柱（外装）
    const post = group({ pos: [PUMP_X, 0, 0] });
    mesh(new G.RoundedBoxGeometry(0.0130, 0.0180, 0.0100, 3, 0.0030), this.mats.pumpTrim, {
      parent: post, pos: [0, PIVOT_Y - 0.0060, 0],
    });
    this.addShell(post);

    // 腕
    const armOutline = [
      new THREE.Vector2(-0.0180, -0.0044),
      new THREE.Vector2(0.0560, -0.0038),
      new THREE.Vector2(0.0560, 0.0038),
      new THREE.Vector2(-0.0180, 0.0044),
    ];
    mesh(G.extrudeOutline(armOutline, [], 0.0072, { corner: 0.0040, bevel: 0.0008 }), this.mats.handle, {
      parent: pivot,
    });
    // 握り
    const grip = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0060, 0.0006],
          [0.0072, 0.0034],
          [0.0068, 0.0150],
          [0.0056, 0.0176],
          [0, 0.0180],
        ],
        { segments: 26, center: false },
      ),
      this.mats.grip,
      { parent: pivot, pos: [0.0560, 0, 0] },
    );
    grip.rotation.z = -Math.PI / 2;

    // ピストン棒とつながるリンク
    const link = mesh(G.chamferedCylinder(0.0024, 0.0130, 0.0004, 14), this.mats.rod, {
      parent: pivot, pos: [-0.0160, -0.0060, 0], cast: false,
    });
    this.leverLink = link;

    hitSphere(pivot, 0.0155, [0.0560, 0, 0]);
    hitCylinder(pivot, 0.0085, 0.055, [0.0290, 0, 0], [0, 0, Math.PI / 2]);

    this.handle({
      id: 'lever',
      label: 'レバー',
      type: 'rotate',
      object: pivot,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot,
      primary: true,
      gain: 1,
      hint: { kind: 'pull', anchor: pivot, offset: [0.056, 0.030, 0], size: 0.013, axis: new THREE.Vector3(0, 1, 0) },
      onRotate: (d) => {
        this.leverAngle = clamp(this.leverAngle + d, -0.40, 0.40);
      },
    });
  }

  /* --- うけ皿 ---------------------------------------------------------- */

  _buildBasin() {
    const g = group({ name: 'basin', pos: [BASIN_X, 0.0100, 0] });

    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0250, 0],
          [0.0270, 0.0030],
          [0.0280, 0.0180],
          [0.0258, 0.0186],
          [0.0250, 0.0044],
          [0, 0.0040],
        ],
        { segments: 40, center: false },
      ),
      this.mats.basin,
      { parent: g },
    );
    this.addShell(g);

    // 皿の水
    const geo = G.chamferedCylinder(0.0244, 1.0, 0.0003, 40);
    const w = new THREE.Mesh(geo, this.mats.water);
    w.castShadow = false;
    w.receiveShadow = false;
    w.renderOrder = 12;
    g.add(w);
    this.basinWater = w;

    // タンクへもどす管
    const returnPipe = G.tubeFromPoints(
      [
        [BASIN_X, 0.0128, -0.0230],
        [BASIN_X - 0.010, 0.0120, -0.0380],
        [0.000, 0.0110, -0.0420],
        [TANK_X + 0.006, 0.0300, -0.0350],
        [TANK_X + 0.002, TANK_H - 0.004, -0.0180],
      ],
      0.0044,
      { radialSegments: 12 },
    );
    const rp = mesh(returnPipe, this.mats.pipe, { parent: this.root, cast: false });
    void rp;

    /* 口から出る水の流れ */
    const streamGeo = G.chamferedCylinder(0.0052, 1.0, 0.0002, 18);
    const stream = new THREE.Mesh(streamGeo, this.mats.waterFlow);
    stream.castShadow = false;
    stream.receiveShadow = false;
    stream.renderOrder = 13;
    this.root.add(stream);
    this.streamMesh = stream;
  }

  _buildDroplets() {
    const scale = this.ctx.tier === 'low' ? 0.4 : this.ctx.tier === 'mid' ? 0.7 : 1;
    this.drops = new ParticleField({
      count: Math.round(280 * scale),
      color: 0x9fe0f8,
      color2: 0xffffff,
      opacity: 0.7,
      stretch: 0.045,
      width: 0.0038,
      minLength: 0.004,
      softness: 2.0,
      bounds: 0.4,
      seed: 909,
    });
    this.root.add(this.drops.object);
    this._dropAcc = 0;
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  step(dt) {
    // レバーの角度 → ピストンの高さ（0 = 下、1 = 上）
    const target = clamp01(0.5 - this.leverAngle * 1.25);
    const prevY = this.pistonY;
    this.pistonY = damp(this.pistonY, target, 18, dt);
    this.pistonVel = (this.pistonY - prevY) / Math.max(dt, 1e-4);

    // 弁のうごき
    const up = this.pistonVel > 0.05;
    const down = this.pistonVel < -0.05;
    const footTarget = this.footValveHeld ? 1 : up ? 1 : 0;
    this.footValveOpen = damp(this.footValveOpen, footTarget, 24, dt);
    this.pistonValveOpen = damp(this.pistonValveOpen, down ? 1 : 0, 24, dt);

    // 吸い上げ: 上に引くとき、下の弁がちゃんと閉じたり開いたりして初めて水が上がる
    if (up && !this.footValveHeld && this.tankLevel > 0.02) {
      this.prime = clamp01(this.prime + this.pistonVel * 0.85 * dt * 6);
    }
    if (this.footValveHeld) {
      // 押さえられていると、吸っても水が戻ってしまう
      this.prime = clamp01(this.prime - 1.4 * dt);
    }
    this.prime = clamp01(this.prime - 0.035 * dt);

    // 出水: 上げるストロークで、ピストンより上の水が押し出される
    let out = 0;
    if (up && this.prime > 0.62 && !this.footValveHeld) {
      out = this.pistonVel * (this.prime - 0.6) * 2.6;
    }
    this.flow = damp(this.flow, Math.max(0, out), 14, dt);

    const moved = this.flow * 0.055 * dt;
    this.tankLevel = clamp01(this.tankLevel - moved);
    this.basinLevel = clamp01(this.basinLevel + moved * 1.35);

    // うけ皿からタンクへ、いつも少しずつ戻る
    const drain = Math.min(this.basinLevel, 0.075 * dt);
    this.basinLevel -= drain;
    this.tankLevel = clamp01(this.tankLevel + drain * 0.74);

    // レバーはゆっくり中立へ戻る（バネ）
    if (Math.abs(this.pistonVel) < 0.02) {
      this.leverAngle = damp(this.leverAngle, 0.30, 0.9, dt);
    }
  }

  lateUpdate(dt) {
    // レバーとピストン
    this.leverPivot.rotation.z = -this.leverAngle;
    const yBottom = PUMP_BOTTOM + 0.010;
    const yTop = PUMP_TOP - 0.016;
    const py = lerp(yBottom, yTop, this.pistonY);
    this.pistonGroup.position.y = py;
    // ピストン棒はレバーの先端までを結ぶ
    const rodTop = PIVOT_Y - 0.0060 - Math.sin(this.leverAngle) * 0.0160;
    const rodLen = Math.max(0.004, rodTop - (py + 0.0030));
    this.pistonRod.scale.y = rodLen;
    this.pistonRod.position.y = py + 0.0030 + rodLen / 2;

    // 弁のひらき
    this.footFlap.rotation.z = -this.footValveOpen * 1.05;
    this.pistonValve.position.y = 0.0034 + this.pistonValveOpen * 0.0028;

    // 水面
    const tankH = 0.0026 + this.tankLevel * (TANK_H - 0.006);
    this.tankWater.scale.y = tankH;
    this.tankWater.position.y = tankH / 2 + 0.0022;
    // ゆらぎ
    this.tankWater.position.x = Math.sin(this.time * 3.1) * this.flow * 0.0006;

    const basinH = 0.0006 + this.basinLevel * 0.0150;
    this.basinWater.scale.y = basinH;
    this.basinWater.position.y = basinH / 2 + 0.0034;

    // パイプの中の水（タンク側から伸びていく）
    const pipeLen = (PUMP_X - TANK_X) * clamp01(this.prime * 1.15);
    this.pipeWater.scale.y = Math.max(0.0004, pipeLen);
    this.pipeWater.position.set(TANK_X + pipeLen / 2, this.pipeWaterY, 0);
    this.pipeWater.visible = pipeLen > 0.002;

    // シリンダの中の水（下から満ちてくる）
    const colTop = lerp(PUMP_BOTTOM + 0.004, PUMP_TOP - 0.006, clamp01((this.prime - 0.25) / 0.75));
    const colH = Math.max(0.0004, colTop - (PUMP_BOTTOM + 0.004));
    this.cylinderWater.scale.y = colH;
    this.cylinderWater.position.y = PUMP_BOTTOM + 0.004 + colH / 2;
    this.cylinderWater.visible = this.prime > 0.26;

    // 口から出る水
    const streamLen = clamp(this.flow * 0.30, 0, 0.052);
    this.streamMesh.visible = streamLen > 0.003;
    if (this.streamMesh.visible) {
      this.streamMesh.scale.set(0.6 + this.flow * 0.5, streamLen, 0.6 + this.flow * 0.5);
      this.streamMesh.position.set(this.spoutTip.x, this.spoutTip.y - streamLen / 2, 0);
    }

    this._updateDrops(dt);
    this._updateSound();
  }

  _updateDrops(dt) {
    // しぶき
    this._dropAcc += this.flow * 55 * dt;
    while (this._dropAcc >= 1) {
      this._dropAcc -= 1;
      const x = this.spoutTip.x + (Math.random() - 0.5) * 0.010;
      const z = (Math.random() - 0.5) * 0.010;
      this.drops.emit(
        [x, this.spoutTip.y - 0.004, z],
        [(Math.random() - 0.5) * 0.05, -0.20 - Math.random() * 0.2, (Math.random() - 0.5) * 0.05],
        0.5 + Math.random() * 0.3,
        0.5 + Math.random() * 0.7,
      );
    }
    // うけ皿からのはね返り
    this._dripTimer -= dt;
    if (this.flow > 0.15 && this._dripTimer <= 0) {
      this._dripTimer = 0.055 + Math.random() * 0.05;
      const a = Math.random() * TAU;
      this.drops.emit(
        [BASIN_X + Math.cos(a) * 0.006, 0.0100 + 0.006, Math.sin(a) * 0.006],
        [Math.cos(a) * 0.10, 0.16 + Math.random() * 0.10, Math.sin(a) * 0.10],
        0.42,
        0.45,
      );
      if (Math.random() < 0.4) this.audio.drop({ gain: 0.05 + this.flow * 0.06, freq: 520 + Math.random() * 240 });
    }

    const basinY = 0.0100 + 0.0034 + this.basinLevel * 0.015;
    this.drops.update(dt, (i, px, py, pz, vx, vy, vz, out) => {
      out[0] = vx * 0.995;
      out[1] = vy - 0.9 * dt;
      out[2] = vz * 0.995;
      // 皿にあたったら止める
      if (py < basinY && Math.abs(px - BASIN_X) < 0.026) {
        out[0] *= 0.2;
        out[1] = Math.abs(out[1]) * 0.06;
        out[2] *= 0.2;
      }
    });
  }

  _updateSound() {
    const gurgle = this.audio.voice('pumpFlow', { source: 'noise', filter: 'lowpass', freq: 700, Q: 1.2 });
    gurgle.set({ level: clamp01(this.flow) * 0.16, freq: 500 + this.flow * 900, smooth: 0.09 });

    const suck = this.audio.voice('pumpSuck', { source: 'noise', filter: 'bandpass', freq: 300, Q: 3 });
    const moving = clamp01(Math.abs(this.pistonVel) * 0.7);
    suck.set({ level: moving * 0.07, freq: 240 + this.prime * 380, smooth: 0.07 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'tank', icon: 'drop', label: 'タンクの みず', value: this.tankLevel, color: '#3aa9d8' },
      { id: 'prime', icon: 'gauge', label: 'パイプの みず', value: this.prime, color: '#63c9a0' },
    ];
  }

  reset() {
    this.leverAngle = 0.30;
    this.pistonY = 0;
    this.prime = 0;
    this.tankLevel = 0.82;
    this.basinLevel = 0;
    this.flow = 0;
    this.footValveHeld = false;
    this.drops?.killAll();
  }

  dispose() {
    this.drops?.dispose();
    super.dispose();
  }
}
