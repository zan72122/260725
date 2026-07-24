/**
 * sharpener.js — えんぴつけずり
 *
 * 「けずる」がどうやって起きているのかを見せる機械。
 *
 *   ハンドル → 遊星のキャリア → 2本のらせん刃が、えんぴつの まわりを
 *   まわりながら、自分でも まわる（内歯車のなかを ころがるから）
 *   → 木がうすく けずれて、くるくるの かすになって 下の ひきだしへ おちる
 *
 * さわりどころ:
 *   - えんぴつを 押しこんでから ハンドルを まわす
 *   - 刃を 指で 押さえると、ぜんぶ 止まる
 *   - ひきだしを ひっぱると、けずりかすが こぼれる
 *   - とがりきると 刃が から回りして、それ以上は けずれない（本物と同じ）
 *   - えんぴつを ぜんぶ 抜くと、あたらしい えんぴつに かわる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../lib/math.js';

const DEG = Math.PI / 180;

/** えんぴつの軸は X 方向。左（-X）から差しこみ、右（+X）にハンドル。 */
const AXIS_Y = 0.0430;
const MOD = 0.00126;
const RING_TEETH = 30;
const PLANET_TEETH = 15;
const RING_PITCH_R = (RING_TEETH * MOD) / 2;
const PLANET_PITCH_R = (PLANET_TEETH * MOD) / 2;
const CARRIER_R = RING_PITCH_R - PLANET_PITCH_R;

/** えんぴつの色（ぜんぶ抜くと順にかわる） */
const PENCIL_COLORS = [0xf2a63b, 0x5ab7e0, 0x8fd06a, 0xe0709a];

export class Sharpener extends Machine {
  static meta = {
    id: 'sharpener',
    name: 'えんぴつけずり',
    sub: 'くるくる けずる',
    accent: 0xe06a52,
    backdrop: {
      top: '#fdf4e6',
      middle: '#f4e3c9',
      bottom: '#dbc39f',
      glow: '#ffdcae',
      glowStrength: 0.12,
    },
    bloom: { strength: 0.28, radius: 0.5, threshold: 1.1 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="12" y="14" width="26" height="24" rx="5" fill="#e8776a" stroke="#8d3328" stroke-width="2.4"/>
      <path d="M12 22 3 24l9 2v-4Z" fill="#f2c04f" stroke="#8a6320" stroke-width="2" stroke-linejoin="round"/>
      <path d="M38 20h6v8h-6" stroke="#8d3328" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="45" cy="28" r="2.6" fill="#f2c04f" stroke="#8d3328" stroke-width="2"/>
      <circle cx="25" cy="26" r="6" fill="#fbe3d8" stroke="#8d3328" stroke-width="2.2"/>
      <path d="M14 42c3-2 5 2 8 0s5 2 8 0" stroke="#c99a63" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.angle = 0;         // ハンドルの角度
    this.omega = 0;         // ハンドルの角速度
    this.pencilIn = 0;      // えんぴつの押しこみ 0..1
    this.pencilInTarget = 0;
    this.sharpness = 0;     // とがりぐあい 0..1
    this.pencilLength = 1;  // 残りの長さ 1 → 0.62
    this.drawer = 0;        // ひきだしの引き出し 0..1
    this.held = false;
    this.driving = false;
    this._driveTimer = 0;
    this._shaveAcc = 0;
    this._clickPhase = 0;
    this._pencilColor = 0;
    this._outTimer = 0;

    this.radius = 0.076;
    this.center = new THREE.Vector3(-0.004, 0.044, 0.004);
    this.footprint = { w: 0.135, d: 0.09, opacity: 0.34 };

    // 少し斜めに置いて、歯車の面とハンドルが同時に見えるようにする
    this.root.rotation.y = -38 * DEG;
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.55, -0.35, -1.0),
      center: this.center,
      span: 0.115,
      noiseScale: 12,
    });

    this.mats = {
      body: M.shell('paint', { color: 0xe8776a, roughness: 0.28 }),
      bodyTrim: M.shell('paint', { color: 0x8d3328, roughness: 0.34 }),
      drawerGlass: M.shell('glass', { opacity: 0.22 }),
      base: M.shell('paint', { color: 0xf3d98f, roughness: 0.34 }),

      ring: M.part('coated', { color: 0x8f9aa6, roughness: 0.44 }),
      carrier: M.part('brass', { color: 0xd9a94e }),
      planet: M.part('brass', { color: 0xefc978 }),
      cutter: M.part('steel', { color: 0xdde4ea, roughness: 0.14 }),
      shaft: M.part('steel', { color: 0xd6dce2, roughness: 0.2 }),
      crank: M.part('paint', { color: 0x2f8fc0, clearcoat: 0.9, roughness: 0.22 }),
      knob: M.part('softPlastic', { color: 0xffd45e }),
      spring: M.part('steel', { color: 0xc4ccd4, roughness: 0.28 }),
      wood: M.part('plastic', { color: 0xf2a63b, roughness: 0.42 }),
      woodBare: M.part('plastic', { color: 0xf0dcae, roughness: 0.55 }),
      lead: M.part('plastic', { color: 0x33353c, roughness: 0.34 }),
      shaving: M.plain('fabric', { color: 0xf0dcae }),
      rubber: M.plain('rubber'),
    };

    this._buildBody();
    this._buildMechanism();
    this._buildPencil();
    this._buildCrank();
    this._buildDrawer();
    this._buildShavings();

    this.setXray(0);
  }

  /* --- 外装 ------------------------------------------------------------ */

  _buildBody() {
    const g = group({ name: 'body' });

    // 台
    mesh(new G.RoundedBoxGeometry(0.098, 0.0110, 0.084, 4, 0.0044), this.mats.base, {
      parent: g, pos: [0, 0.0055, 0],
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(
          G.lathe([[0, 0], [0.0056, 0], [0.0060, 0.0018], [0.0044, 0.0034], [0, 0.0036]], { segments: 16, center: false }),
          this.mats.rubber,
          { parent: g, pos: [sx * 0.040, 0.0002, sz * 0.032], rot: [Math.PI, 0, 0], cast: false },
        );
      }
    }

    // 胴
    mesh(new G.RoundedBoxGeometry(0.070, 0.058, 0.066, 5, 0.0130), this.mats.body, {
      parent: g, pos: [0, 0.0420, 0],
    });
    // 上下の縁どりと、正面の のぞき窓のわく
    mesh(new G.RoundedBoxGeometry(0.0716, 0.0090, 0.0676, 3, 0.0034), this.mats.bodyTrim, {
      parent: g, pos: [0, 0.0148, 0], cast: false,
    });
    mesh(new G.RoundedBoxGeometry(0.0716, 0.0070, 0.0676, 3, 0.0028), this.mats.bodyTrim, {
      parent: g, pos: [0, 0.0678, 0], cast: false,
    });
    const winOuter = rectPts(0.044, 0.036);
    const winInner = rectPts(0.034, 0.026);
    mesh(G.extrudeOutline(winOuter, [winInner], 0.0024, { corner: 0.006, bevel: 0.0005 }), this.mats.bodyTrim, {
      parent: g, pos: [0, 0.0430, 0.0322], cast: false,
    });
    // えんぴつを入れる ろうと
    const funnel = mesh(
      G.lathe(
        [
          [0.0086, 0],
          [0.0186, 0],
          [0.0186, 0.0044],
          [0.0086, 0.0128],
          [0.0086, 0],
        ],
        { segments: 32, center: false },
      ),
      this.mats.bodyTrim,
      { parent: g, pos: [-0.0350, AXIS_Y, 0] },
    );
    funnel.rotation.z = Math.PI / 2;

    // ハンドル側の軸受け
    mesh(G.ring(0.0110, 0.0032, 0.0060, 28), this.mats.bodyTrim, {
      parent: g, pos: [0.0352, AXIS_Y, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });

    this.addShell(g);
    this.bodyGroup = g;
  }

  /* --- 遊星機構とらせん刃 ---------------------------------------------- */

  _buildMechanism() {
    const m = group({ name: 'mechanism', pos: [0, AXIS_Y, 0] });
    this.mechanism = m;

    // 内歯車（本体に固定）
    const ring = mesh(
      G.ringGearGeometry({ teeth: RING_TEETH, module: MOD, thickness: 0.0048, outerR: 0.0262 }),
      this.mats.ring,
      { parent: m, pos: [0.0140, 0, 0], cast: false },
    );
    ring.rotation.z = Math.PI / 2;

    // キャリア（ハンドルと一緒にまわる）
    const carrier = group({ parent: m });
    this.carrier = carrier;
    const disc = mesh(
      G.lathe(
        [
          [0, -0.0018],
          [0.0170, -0.0018],
          [0.0170, 0.0018],
          [0, 0.0018],
        ],
        { segments: 32, center: false },
      ),
      this.mats.carrier,
      { parent: carrier, pos: [0.0206, 0, 0], cast: false },
    );
    disc.rotation.z = Math.PI / 2;

    // 2本のカッター（遊星）
    this.planets = [];
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * TAU;
      const p = group({
        parent: carrier,
        pos: [0, Math.cos(a) * CARRIER_R, Math.sin(a) * CARRIER_R],
      });
      // 遊星歯車
      const gear = mesh(
        G.gearGeometry({
          teeth: PLANET_TEETH, module: MOD, thickness: 0.0044,
          bore: 0.0016, hub: 0.0034, hubHeight: 0.0012,
        }),
        this.mats.planet,
        { parent: p, pos: [0.0140, 0, 0], cast: false },
      );
      gear.rotation.z = Math.PI / 2;

      // らせん刃（えんぴつ側へ伸びる）
      const cutter = mesh(
        G.helicalCutter({ r0: 0.0030, r1: 0.0082, length: 0.0250, flutes: 6, turns: 0.62, edge: 0.0009 }),
        this.mats.cutter,
        { parent: p, pos: [-0.0010, 0, 0], cast: false },
      );
      cutter.rotation.z = Math.PI / 2;
      cutter.rotation.y = 0;

      // 軸
      const shaft = mesh(G.chamferedCylinder(0.0015, 0.0440, 0.0003, 12), this.mats.shaft, {
        parent: p, pos: [0.0060, 0, 0], cast: false,
      });
      shaft.rotation.z = Math.PI / 2;

      this.planets.push(p);
    }

    // 中心軸
    const axle = mesh(G.chamferedCylinder(0.0026, 0.0520, 0.0004, 16), this.mats.shaft, {
      parent: m, pos: [0.0180, 0, 0], cast: false,
    });
    axle.rotation.z = Math.PI / 2;

    hitCylinder(carrier, 0.0180, 0.030, [0.0060, 0, 0], [0, 0, Math.PI / 2]);
    this.handle({
      id: 'cutter',
      label: 'は',
      type: 'grab',
      object: carrier,
      hint: { kind: 'hold', offset: [0.010, 0.020, 0], size: 0.011 },
      onGrab: () => {
        this.held = true;
        if (Math.abs(this.omega) > 2) this.audio.click({ gain: 0.34, bright: 900 });
      },
      onRelease: () => {
        this.held = false;
      },
    });

    this.addGuts(m);
  }

  /* --- えんぴつ -------------------------------------------------------- */

  _buildPencil() {
    const p = group({ pos: [0, AXIS_Y, 0] });
    this.root.add(p);
    this.pencilGroup = p;

    // 軸（六角）
    this.pencilBody = mesh(G.hexPrism(0.0092, 1.0, { corner: 0.0005 }), this.mats.wood, { parent: p });
    this.pencilBody.rotation.z = Math.PI / 2;

    // おしり（消しゴムと口金）
    this.pencilTail = group({ parent: p });
    mesh(G.chamferedCylinder(0.0048, 0.0068, 0.0004, 18), this.mats.spring, {
      parent: this.pencilTail, rot: [0, 0, Math.PI / 2], cast: false,
    });
    mesh(G.chamferedCylinder(0.0044, 0.0064, 0.0008, 18), this.mats.knob, {
      parent: this.pencilTail, pos: [-0.0066, 0, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });

    // とがった先（けずれるほど とがる）
    this.pencilTip = group({ parent: p });
    this.tipWood = mesh(
      G.lathe([[0.0046, 0], [0.0007, 1.0], [0, 1.0]], { segments: 24, center: false }),
      this.mats.woodBare,
      { parent: this.pencilTip, cast: false },
    );
    this.tipWood.rotation.z = Math.PI / 2;
    this.tipLead = mesh(
      G.lathe([[0.0010, 0], [0, 1.0]], { segments: 16, center: false }),
      this.mats.lead,
      { parent: this.pencilTip, cast: false },
    );
    this.tipLead.rotation.z = Math.PI / 2;

    hitCylinder(p, 0.0150, 0.060, [-0.0520, 0, 0], [0, 0, Math.PI / 2]);
    this.handle({
      id: 'pencil',
      label: 'えんぴつ',
      type: 'slide',
      object: p,
      axis: new THREE.Vector3(1, 0, 0),
      primary: true,
      hint: { kind: 'push', anchor: p, offset: [-0.062, 0.016, 0], size: 0.013, axis: new THREE.Vector3(1, 0, 0), axisWorld: false },
      getValue: () => this.pencilIn,
      onSlide: (delta, ctx) => {
        this.pencilInTarget = clamp01(ctx.value0 + delta / 0.026);
      },
      onTap: () => {
        this.pencilInTarget = this.pencilIn > 0.5 ? 0 : 1;
      },
    });
  }

  /* --- ハンドル -------------------------------------------------------- */

  _buildCrank() {
    const c = group({ pos: [0.0410, AXIS_Y, 0] });
    this.root.add(c);
    this.crankGroup = c;

    const shaft = mesh(G.chamferedCylinder(0.0030, 0.0180, 0.0004, 14), this.mats.shaft, {
      parent: c, pos: [-0.0070, 0, 0], rot: [0, 0, Math.PI / 2], cast: false,
    });
    void shaft;

    const arm = mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0070, -0.0048),
          new THREE.Vector2(0.0262, -0.0044),
          new THREE.Vector2(0.0262, 0.0044),
          new THREE.Vector2(-0.0070, 0.0048),
        ],
        [],
        0.0042,
        { corner: 0.0040, bevel: 0.0007 },
      ),
      this.mats.crank,
      { parent: c, pos: [0.0040, 0, 0] },
    );
    arm.rotation.set(0, Math.PI / 2, 0);

    const knob = mesh(
      G.lathe(
        [
          [0, 0],
          [0.0056, 0.0004],
          [0.0068, 0.0034],
          [0.0064, 0.0118],
          [0.0052, 0.0144],
          [0, 0.0150],
        ],
        { segments: 26, center: false },
      ),
      this.mats.knob,
      { parent: c, pos: [0.0064, 0, -0.0262] },
    );
    knob.rotation.z = -Math.PI / 2;

    hitSphere(c, 0.0165, [0.0130, 0, -0.0262]);
    hitCylinder(c, 0.0090, 0.030, [0.0050, 0, -0.0130], [Math.PI / 2, 0, 0]);

    this.handle({
      id: 'crank',
      label: 'ハンドル',
      type: 'rotate',
      object: c,
      axisObject: this.root,
      axis: new THREE.Vector3(1, 0, 0),
      pivot: c,
      hint: { kind: 'spin', axis: new THREE.Vector3(1, 0, 0), axisWorld: false, offset: [0.032, 0, 0], size: 0.030 },
      onRotate: (d, ctx) => {
        this.angle += d;
        this.omega = clamp(ctx.velocity, -40, 40);
        this.driving = true;
        this._driveTimer = 0.13;
      },
      onFling: (v) => {
        this.omega = clamp(v, -34, 34);
        this.driving = false;
      },
      onTap: () => {
        this.omega += 8 * (this.omega >= 0 ? 1 : -1);
      },
    });
  }

  /* --- ひきだし -------------------------------------------------------- */

  _buildDrawer() {
    const d = group({ pos: [0, 0.0128, 0] });
    this.root.add(d);
    this.drawerGroup = d;

    // 透明な箱（中の かす が見える）
    const w = 0.058;
    const dep = 0.052;
    const h = 0.0165;
    const wall = 0.0022;
    const outer = rectPts(w, dep);
    const inner = rectPts(w - wall * 2, dep - wall * 2);
    const walls = G.extrudeOutline(outer, [inner], h, { corner: 0.004, bevel: 0.0005 });
    const wallMesh = mesh(walls, this.mats.drawerGlass, { parent: d, pos: [0, h / 2, 0], cast: false });
    wallMesh.rotation.x = Math.PI / 2;
    wallMesh.renderOrder = 20;
    const floor = mesh(G.roundedPlate(w - 0.001, dep - 0.001, 0.0016, 0.004), this.mats.drawerGlass, {
      parent: d, pos: [0, 0.0010, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    floor.renderOrder = 20;
    // 取っ手
    mesh(new G.RoundedBoxGeometry(0.0220, 0.0080, 0.0060, 3, 0.0022), this.mats.bodyTrim, {
      parent: d, pos: [0, h * 0.6, dep / 2 + 0.0024],
    });

    d.traverse((o) => {
      if (o.isMesh && !o.userData.isHitProxy) {
        this.shellMeshes.push(o);
        o.userData.castShadowDefault = o.castShadow;
      }
    });

    hitProxy(d, new THREE.BoxGeometry(w, 0.024, 0.016), { pos: [0, h * 0.6, dep / 2] });
    this.handle({
      id: 'drawer',
      label: 'ひきだし',
      type: 'slide',
      object: d,
      axis: new THREE.Vector3(0, 0, 1),
      hint: { kind: 'pull', offset: [0, 0.006, 0.030], size: 0.012, axis: new THREE.Vector3(0, 0, 1), axisWorld: false },
      getValue: () => this.drawer,
      onSlide: (delta, ctx) => {
        this.drawer = clamp01(ctx.value0 + delta / 0.055);
      },
      onTap: () => {
        this.drawer = this.drawer > 0.4 ? 0 : 1;
      },
    });
  }

  /* --- けずりかす ------------------------------------------------------ */

  _buildShavings() {
    const count = this.ctx.tier === 'low' ? 14 : this.ctx.tier === 'mid' ? 20 : 28;
    this.shavings = [];
    const holder = group();
    this.root.add(holder);
    this.shavingHolder = holder;

    for (let i = 0; i < count; i++) {
      const geo = G.shavingGeometry({
        width: 0.0075 + (i % 3) * 0.0012,
        turns: 1.3 + (i % 4) * 0.22,
        r0: 0.0020,
        r1: 0.0044 + (i % 3) * 0.0006,
        samples: 22,
        seed: i * 1.7,
      });
      const m = new THREE.Mesh(geo, this.mats.shaving);
      m.castShadow = false;
      m.receiveShadow = false;
      m.visible = false;
      holder.add(m);
      this.shavings.push({
        mesh: m,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        rot: new THREE.Euler(),
        settled: false,
        alive: false,
        restZ: 0,
      });
    }
    this._shavingCursor = 0;
    this.settledCount = 0;
  }

  _emitShaving() {
    const s = this.shavings[this._shavingCursor];
    this._shavingCursor = (this._shavingCursor + 1) % this.shavings.length;
    if (s.settled) this.settledCount = Math.max(0, this.settledCount - 1);

    const a = Math.random() * TAU;
    s.pos.set(-0.0180 + Math.random() * 0.006, AXIS_Y - 0.0060, Math.cos(a) * 0.004);
    s.vel.set(-0.02 + Math.random() * 0.05, -0.02, (Math.random() - 0.5) * 0.09);
    s.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    s.rot.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
    s.settled = false;
    s.alive = true;
    s.mesh.visible = true;
    s.mesh.material = this.mats.shaving;
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  step(dt) {
    this._driveTimer = Math.max(0, this._driveTimer - dt);
    if (this._driveTimer === 0) this.driving = false;

    // ハンドル
    if (this.held) {
      this.omega = damp(this.omega, 0, 40, dt);
      if (Math.abs(this.omega) < 0.05) this.omega = 0;
    } else if (!this.driving) {
      const load = this._cutting ? 5.2 : 1.1;
      this.omega -= Math.sign(this.omega) * Math.min(Math.abs(this.omega), load * dt);
      this.omega -= this.omega * 0.05 * Math.abs(this.omega) * dt;
      this.angle += this.omega * dt;
    }

    // えんぴつの出し入れ
    this.pencilIn = damp(this.pencilIn, this.pencilInTarget, 14, dt);

    // ぜんぶ抜いたら、あたらしい えんぴつ
    if (this.pencilIn < 0.04 && this.sharpness > 0.02) {
      this._outTimer += dt;
      if (this._outTimer > 0.55) {
        this._outTimer = 0;
        this.sharpness = 0;
        this.pencilLength = 1;
        this._pencilColor = (this._pencilColor + 1) % PENCIL_COLORS.length;
        this.mats.wood.color.setHex(PENCIL_COLORS[this._pencilColor]);
        this.audio.click({ gain: 0.4, bright: 2600 });
      }
    } else {
      this._outTimer = 0;
    }

    // けずれる条件: 十分に押しこまれていて、まだ とがっていない
    const speed = Math.abs(this.omega);
    this._cutting = this.pencilIn > 0.72 && this.sharpness < 0.999 && speed > 0.6;
    if (this._cutting) {
      const rate = speed * 0.020;
      this.sharpness = clamp01(this.sharpness + rate * dt);
      this.pencilLength = Math.max(0.62, this.pencilLength - rate * 0.10 * dt);
      this._shaveAcc += speed * 1.6 * dt;
      while (this._shaveAcc >= 1) {
        this._shaveAcc -= 1;
        this._emitShaving();
      }
      if (this.sharpness >= 0.999) this.audio.chime(880, { gain: 0.10 });
    }

    this._stepShavings(dt);
  }

  _stepShavings(dt) {
    const drawerZ = this.drawer * 0.055;
    // ひきだしの内側（ローカル）
    const floorY = 0.0128 + 0.0026;
    let settled = 0;
    for (const s of this.shavings) {
      if (!s.alive) continue;
      if (s.settled) {
        settled++;
        // ひきだしと一緒に動く
        s.pos.z = s.restZ + drawerZ;
        // ひきだしを ぜんぶ 引き出すと こぼれ落ちる
        if (this.drawer > 0.82) {
          s.settled = false;
          s.vel.set((Math.random() - 0.5) * 0.05, -0.02, 0.05 + Math.random() * 0.05);
        }
        continue;
      }
      s.vel.y -= 0.55 * dt;
      s.vel.multiplyScalar(1 - 1.6 * dt);
      s.pos.addScaledVector(s.vel, dt);
      s.rot.x += s.spin.x * dt;
      s.rot.y += s.spin.y * dt;
      s.rot.z += s.spin.z * dt;

      const insideDrawer =
        Math.abs(s.pos.x) < 0.029 && Math.abs(s.pos.z - drawerZ) < 0.027 && this.drawer < 0.82;
      if (insideDrawer && s.pos.y < floorY + 0.0030 + Math.min(this.settledCount, 22) * 0.00042) {
        s.pos.y = floorY + 0.0030 + Math.min(this.settledCount, 22) * 0.00042;
        s.settled = true;
        s.restZ = s.pos.z - drawerZ;
        s.spin.set(0, 0, 0);
        if (Math.random() < 0.3) this.audio.tick({ gain: 0.02, pitch: 3.2 });
      } else if (s.pos.y < 0.0012) {
        // 床に落ちたら消える
        s.alive = false;
        s.mesh.visible = false;
      }
    }
    this.settledCount = settled;
  }

  /* ---------------------------------------------------------------- */

  lateUpdate(dt) {
    // ハンドルとキャリア
    this.crankGroup.rotation.x = this.angle;
    this.carrier.rotation.x = this.angle;
    // 遊星は、内歯車のなかを ころがるぶんだけ 自分でもまわる
    const planetSpin = -this.angle * (RING_TEETH / PLANET_TEETH - 1);
    for (const p of this.planets) p.rotation.x = planetSpin;

    // えんぴつ
    const x = lerp(-0.0300, -0.0042, this.pencilIn);
    const bodyLen = 0.078 * this.pencilLength;
    this.pencilGroup.position.x = x;
    this.pencilBody.scale.y = bodyLen;
    this.pencilBody.position.x = -bodyLen / 2 - 0.0020;
    this.pencilTail.position.x = -bodyLen - 0.0050;

    const tipLen = lerp(0.0016, 0.0135, this.sharpness);
    this.pencilTip.position.x = -0.0020;
    this.tipWood.scale.y = tipLen;
    this.tipLead.scale.y = tipLen * 0.34;
    this.tipLead.position.x = tipLen * 0.66;
    this.pencilTip.visible = this.sharpness > 0.02;

    // ひきだし
    this.drawerGroup.position.z = this.drawer * 0.055;

    // けずりかす
    for (const s of this.shavings) {
      if (!s.alive) continue;
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.copy(s.rot);
    }

    this._updateSound(dt);
  }

  _updateSound(dt) {
    const speed = Math.abs(this.omega);
    const grind = this.audio.voice('shGrind', { source: 'noise', filter: 'bandpass', freq: 900, Q: 2.2 });
    const spin = clamp01(speed / 18);
    grind.set({
      level: this._cutting ? 0.05 + spin * 0.16 : spin * 0.035,
      freq: (this._cutting ? 520 : 1400) + speed * 90,
      Q: this._cutting ? 1.6 : 3.4,
      smooth: 0.06,
    });

    this._clickPhase += speed * dt * 10;
    if (this._clickPhase > TAU) {
      this._clickPhase %= TAU;
      if (speed > 1.2 && Math.random() < 0.4) this.audio.tick({ gain: 0.025 * spin, pitch: 1.8 });
    }
  }

  /* ---------------------------------------------------------------- */

  meters() {
    return [
      { id: 'sharp', icon: 'gauge', label: 'とがりぐあい', value: this.sharpness, color: '#e0685a' },
      { id: 'chips', icon: 'toast', label: 'けずりかす', value: clamp01(this.settledCount / 16), color: '#c99a63' },
    ];
  }

  reset() {
    this.angle = 0;
    this.omega = 0;
    this.pencilIn = 0;
    this.pencilInTarget = 0;
    this.sharpness = 0;
    this.pencilLength = 1;
    this.drawer = 0;
    this.settledCount = 0;
    for (const s of this.shavings) {
      s.alive = false;
      s.settled = false;
      s.mesh.visible = false;
    }
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
