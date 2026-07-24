/**
 * gacha.js — ガチャ
 *
 * 「まわすと 1こだけ 出てくる」ふしぎの、たねあかしをする機械。
 *
 *   ハンドル → 中の 円ばん が 1まわり
 *   → 円ばんに あいた ポケット が 山の下を通るとき、カプセルが 1こ だけ 落ちこむ
 *   → そのまま 半周 はこばれて、出口の 上で ポケットが 下を向き、
 *     カプセルが すべり台を ころがって、ふた の うしろ へ
 *
 * さわりどころ:
 *   - ハンドルを 1回まわすと、かならず 1こ だけ 出る
 *   - たまを 指で つつくと、山が くずれて ころがる
 *   - ふたを あけて、出てきた カプセルを さわると、パカッと あいて 中身が でる
 */

import * as THREE from 'three';
import { Machine, group, hitCylinder, hitProxy, hitSphere, mesh } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, ease, lerp, makeRandom, TAU } from '../lib/math.js';

const GLOBE_Y = 0.1130;
const GLOBE_R = 0.0470;
const CAP_R = 0.0090;
/** 玉が入れる内側の半径 */
const INNER_R = GLOBE_R - CAP_R - 0.0012;
/** じょうご の 上端と、円ばん の 高さ */
const FUNNEL_TOP = GLOBE_Y - 0.0130;
const DISC_Y = 0.0700;
const POCKET_R = 0.0175;
const CAP_COLORS = [0xf2634f, 0x4fb6e0, 0xf2c04f, 0x8fd06a, 0xd489c8, 0xffa15c];
const TOY_COLORS = [0xffd45e, 0xff7a6a, 0x7ad4f0, 0xa4e07a];

export class Gacha extends Machine {
  static meta = {
    id: 'gacha',
    name: 'ガチャ',
    sub: '1こだけ でてくる',
    accent: 0xef6f8a,
    backdrop: {
      top: '#fff4f7',
      middle: '#fbe6ec',
      bottom: '#e4c4ce',
      glow: '#ffe0ea',
      glowStrength: 0.14,
    },
    bloom: { strength: 0.30, radius: 0.52, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="17" r="13" fill="#fde3ea" stroke="#b3506a" stroke-width="2.4"/>
      <circle cx="20" cy="15" r="3.4" fill="#f2634f"/>
      <circle cx="28" cy="14" r="3.4" fill="#4fb6e0"/>
      <circle cx="24" cy="21" r="3.4" fill="#f2c04f"/>
      <path d="M10 30h28v10a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V30Z" fill="#ef6f8a" stroke="#b3506a" stroke-width="2.4"/>
      <rect x="18" y="34" width="12" height="7" rx="2" fill="#fde3ea" stroke="#b3506a" stroke-width="2"/>
      <circle cx="13" cy="34" r="2.6" fill="#f2c04f" stroke="#8a6320" stroke-width="1.8"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /* --- 状態 ---------------------------------------------------- */
    this.angle = 0;        // ハンドル（＝円ばん）の角度
    this.omega = 0;
    this.driving = false;
    this._driveTimer = 0;
    this.door = 0;         // ふたの開き 0..1
    this.doorTarget = 0;
    /** @type {any[]} */
    this.caps = [];
    /** ポケットが運んでいる玉 */
    this.carried = null;
    this._lastQuad = 0;
    this._delivered = [];

    this.radius = 0.092;
    this.center = new THREE.Vector3(0, 0.086, 0.004);
    this.footprint = { w: 0.11, d: 0.10, opacity: 0.34 };

    this.rand = makeRandom(2468);
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.10, -0.35, -1.0),
      center: this.center,
      span: 0.120,
      noiseScale: 12,
    });

    this.mats = {
      globe: M.shell('glass', { opacity: 0.16 }),
      cabinet: M.shell('paint', { color: 0xef6f8a, roughness: 0.28 }),
      cabinetDeep: M.shell('paint', { color: 0xb3506a, roughness: 0.32 }),
      cap: M.shell('paint', { color: 0xf2c04f, roughness: 0.30 }),
      doorGlass: M.shell('glass', { opacity: 0.20 }),

      disc: M.part('plastic', { color: 0xf6efe2, roughness: 0.4 }),
      frame: M.part('coated', { color: 0x8f9aa6, roughness: 0.42 }),
      chute: M.part('plastic', { color: 0xdfe6ec, roughness: 0.36 }),
      shaft: M.part('steel', { color: 0xd8dee5, roughness: 0.18 }),
      gear: M.part('brass', { color: 0xe0b055 }),
      crank: M.part('softPlastic', { color: 0xffd45e }),
      crankArm: M.part('paint', { color: 0x3f4a58, clearcoat: 0.9, roughness: 0.24 }),
      tray: M.part('plastic', { color: 0xf6efe2, roughness: 0.45 }),
      rubber: M.plain('rubber'),
    };

    // カプセルの色ごとのマテリアル
    this.capMats = CAP_COLORS.map((c) => this.M.part('plastic', { color: c, roughness: 0.26 }));
    this.capClear = this.M.part('glass', { opacity: 0.26 });
    this.toyMats = TOY_COLORS.map((c) => this.M.part('softPlastic', { color: c }));

    this._buildCabinet();
    this._buildMechanism();
    this._buildCapsules();
    this._buildCrank();
    this._buildDoor();

    this.setXray(0);
  }

  /* --- 本体 ------------------------------------------------------------ */

  _buildCabinet() {
    const g = group({ name: 'cabinet' });

    // 台
    mesh(new G.RoundedBoxGeometry(0.0860, 0.0560, 0.0760, 5, 0.0090), this.mats.cabinet, {
      parent: g, pos: [0, 0.0300, 0],
    });
    mesh(new G.RoundedBoxGeometry(0.0880, 0.0090, 0.0780, 4, 0.0038), this.mats.cabinetDeep, {
      parent: g, pos: [0, 0.0058, 0],
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mesh(
          G.lathe([[0, 0], [0.0056, 0], [0.0060, 0.0014], [0.0044, 0.0026], [0, 0.0028]], { segments: 16, center: false }),
          this.mats.rubber,
          { parent: g, pos: [sx * 0.034, 0.0002, sz * 0.030], rot: [Math.PI, 0, 0], cast: false },
        );
      }
    }

    // 首（じょうご の 外側）
    mesh(
      G.lathe(
        [
          [0.0420, 0.0560],
          [0.0450, 0.0600],
          [0.0450, 0.0660],
          [0.0300, 0.0700],
          [0.0300, 0.0560],
        ],
        { segments: 44, center: false },
      ),
      this.mats.cabinetDeep,
      { parent: g },
    );

    // ガラスの たま
    const globe = mesh(
      G.lathe(sphereShellProfile(GLOBE_R, 0.0020, 0.0660 - GLOBE_Y, 26), { segments: 52, center: false }),
      this.mats.globe,
      { parent: g, pos: [0, GLOBE_Y, 0], cast: false },
    );
    globe.renderOrder = 24;

    // 上のふた
    mesh(
      G.lathe(
        [
          [0, 0.0140],
          [0.0100, 0.0130],
          [0.0180, 0.0080],
          [0.0205, 0.0000],
          [0.0205, -0.0030],
          [0.0170, -0.0034],
          [0.0150, 0.0030],
          [0, 0.0110],
        ],
        { segments: 34, center: false },
      ),
      this.mats.cap,
      { parent: g, pos: [0, GLOBE_Y + GLOBE_R - 0.0090, 0] },
    );

    this.addShell(g);
    this.cabinetGroup = g;

    // たまを つつく（山を くずす）
    hitProxy(g, new THREE.SphereGeometry(GLOBE_R, 14, 12), { pos: [0, GLOBE_Y, 0] });
    this.handle({
      id: 'globe',
      label: 'たま',
      type: 'press',
      object: g,
      onPress: () => this._shake(),
    });
  }

  /* --- 中の しくみ ------------------------------------------------------ */

  _buildMechanism() {
    const m = group({ name: 'mech' });

    // じょうご（内側の すりばち）
    const funnel = mesh(
      G.lathe(
        [
          [0.0190, DISC_Y + 0.0030],
          [0.0400, FUNNEL_TOP],
          [0.0415, FUNNEL_TOP + 0.0020],
          [0.0205, DISC_Y + 0.0030],
        ],
        { segments: 44, center: false },
      ),
      this.mats.chute,
      { parent: m, cast: false },
    );
    funnel.receiveShadow = true;

    // まわる 円ばん（ポケットが 1つ あいている）
    const disc = group({ parent: m, pos: [0, DISC_Y, 0] });
    this.discGroup = disc;
    const holes = [];
    const ring = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      ring.push(new THREE.Vector2(POCKET_R + Math.cos(a) * 0.0104, Math.sin(a) * 0.0104));
    }
    holes.push(ring);
    const discOutline = [];
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU;
      discOutline.push(new THREE.Vector2(Math.cos(a) * 0.0300, Math.sin(a) * 0.0300));
    }
    const discGeo = G.extrudeOutline(discOutline, holes, 0.0050, { bevel: 0.0006, curveSegments: 8 });
    discGeo.rotateX(-Math.PI / 2);
    mesh(discGeo, this.mats.disc, { parent: disc, cast: false });
    // ポケットの ふち（見つけやすいように 色をつける）
    mesh(new THREE.TorusGeometry(0.0104, 0.0012, 8, 22), this.mats.gear, {
      parent: disc, pos: [POCKET_R, 0.0028, 0], rot: [Math.PI / 2, 0, 0], cast: false,
    });

    // 軸と歯車
    const axle = mesh(G.chamferedCylinder(0.0028, 0.0400, 0.0004, 14), this.mats.shaft, {
      parent: m, pos: [0, DISC_Y - 0.0180, 0], cast: false,
    });
    void axle;
    mesh(
      G.gearGeometry({ teeth: 22, module: 0.0011, thickness: 0.0032, bore: 0.0028, hub: 0.0050, hubHeight: 0.0012, spokes: 4 }),
      this.mats.gear,
      { parent: disc, pos: [0, -0.0130, 0], cast: false },
    );

    // すべり台（出口 → ふたの うしろ）
    const chutePts = [
      new THREE.Vector3(0, DISC_Y - 0.0040, POCKET_R),
      new THREE.Vector3(0, DISC_Y - 0.0180, POCKET_R + 0.0060),
      new THREE.Vector3(0, DISC_Y - 0.0330, POCKET_R + 0.0090),
      new THREE.Vector3(0, DISC_Y - 0.0420, POCKET_R + 0.0060),
    ];
    this.chutePath = chutePts;
    const chuteGeo = G.tubeFromPoints(chutePts, 0.0125, { radialSegments: 16, tension: 0.5 });
    const chute = mesh(chuteGeo, this.mats.chute, { parent: m, cast: false });
    chute.material = this.mats.chute;
    chute.renderOrder = 2;

    // 受け皿
    mesh(
      G.lathe(
        [
          [0, 0],
          [0.0180, 0],
          [0.0190, 0.0030],
          [0.0190, 0.0120],
          [0.0172, 0.0124],
          [0.0172, 0.0034],
          [0, 0.0030],
        ],
        { segments: 30, center: false },
      ),
      this.mats.tray,
      { parent: m, pos: [0, 0.0170, 0.0270], cast: false },
    );

    // 受け皿の カプセル を さわると、パカッと あく
    const trayHit = group({ parent: m, pos: [0, 0.0230, 0.0280] });
    hitProxy(trayHit, new THREE.BoxGeometry(0.040, 0.024, 0.030), {});
    this.handle({
      id: 'tray',
      label: 'カプセル',
      type: 'grab',
      object: trayHit,
      onGrab: () => this._openOne(),
    });

    this.addGuts(m);
  }

  /** いちばん新しい、まだ あいていない カプセル を あける */
  _openOne() {
    for (let i = this._delivered.length - 1; i >= 0; i--) {
      const c = this._delivered[i];
      if (c.state === 'tray') {
        c.state = 'open';
        this.audio.click({ gain: 0.42, bright: 2800 });
        this.audio.chime(920, { gain: 0.12 });
        return;
      }
    }
    this.audio.tick({ gain: 0.1, pitch: 1.4 });
  }

  /* --- カプセル -------------------------------------------------------- */

  _buildCapsules() {
    const n = this.ctx.tier === 'low' ? 14 : this.ctx.tier === 'mid' ? 20 : 26;
    const holder = group();
    this.root.add(holder);
    this.capHolder = holder;

    const topGeo = G.capsuleHalf(CAP_R, 'top', 22);
    const botGeo = G.capsuleHalf(CAP_R, 'bottom', 22);

    for (let i = 0; i < n; i++) {
      const g = group({ parent: holder });
      const mat = this.capMats[i % this.capMats.length];
      const top = mesh(topGeo, mat, { parent: g, cast: false });
      const bot = mesh(botGeo, this.capClear, { parent: g, cast: false });
      bot.renderOrder = 6;

      // 中身の おもちゃ
      const toy = this._makeToy(i);
      toy.visible = false;
      g.add(toy);

      // 山の中に ばらまく
      const a = this.rand() * TAU;
      const rr = this.rand() * (INNER_R - 0.004);
      const p = new THREE.Vector3(
        Math.cos(a) * rr,
        GLOBE_Y - 0.020 + this.rand() * 0.030,
        Math.sin(a) * rr,
      );
      this.caps.push({
        group: g, top, bot, toy,
        pos: p,
        vel: new THREE.Vector3(0, 0, 0),
        spin: new THREE.Vector3(this.rand() * 2 - 1, this.rand() * 2 - 1, this.rand() * 2 - 1),
        rot: new THREE.Euler(this.rand() * TAU, this.rand() * TAU, this.rand() * TAU),
        state: 'globe',   // globe | pocket | chute | tray | open
        t: 0,
        openAmt: 0,
      });
    }
  }

  _makeToy(i) {
    const g = new THREE.Group();
    const mat = this.toyMats[i % this.toyMats.length];
    const kind = i % 4;
    let geo;
    if (kind === 0) {
      geo = G.extrudeOutline(G.starPoints(0.0056, 0.0026, 5), [], 0.0028, { corner: 0.0006, bevel: 0.0005 });
    } else if (kind === 1) {
      geo = G.extrudeOutline(G.heartPoints(0.0062), [], 0.0028, { corner: 0.0006, bevel: 0.0005 });
    } else if (kind === 2) {
      geo = new THREE.TorusGeometry(0.0042, 0.0018, 10, 20);
    } else {
      geo = new THREE.SphereGeometry(0.0050, 16, 12);
    }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    g.add(m);
    return g;
  }

  _shake() {
    for (const c of this.caps) {
      if (c.state !== 'globe') continue;
      c.vel.x += (this.rand() - 0.5) * 0.22;
      c.vel.y += this.rand() * 0.16;
      c.vel.z += (this.rand() - 0.5) * 0.22;
    }
    this.audio.tick({ gain: 0.2, pitch: 0.8 });
  }

  /* --- ハンドル -------------------------------------------------------- */

  _buildCrank() {
    const c = group({ pos: [0, 0.0320, 0.0402] });
    this.root.add(c);
    this.crankGroup = c;

    mesh(G.ring(0.0140, 0.0058, 0.0040, 30), this.mats.cabinetDeep, {
      parent: c, pos: [0, 0, -0.0022], cast: false,
    });
    // 十字のノブ（本物っぽい形）
    for (let i = 0; i < 2; i++) {
      mesh(new G.RoundedBoxGeometry(0.0250, 0.0068, 0.0090, 3, 0.0026), this.mats.crankArm, {
        parent: c, rot: [0, 0, (i * Math.PI) / 2],
      });
    }
    mesh(
      G.lathe([[0, 0], [0.0072, 0], [0.0068, 0.0026], [0.0044, 0.0044], [0, 0.0046]], { segments: 22, center: false }),
      this.mats.crank,
      { parent: c, pos: [0, 0, 0.0044], rot: [-Math.PI / 2, 0, 0] },
    );
    // 軸
    const shaft = mesh(G.chamferedCylinder(0.0028, 0.0500, 0.0004, 14), this.mats.shaft, {
      parent: c, pos: [0, 0, -0.0250], rot: [Math.PI / 2, 0, 0], cast: false,
    });
    void shaft;
    mesh(
      G.gearGeometry({ teeth: 22, module: 0.0011, thickness: 0.0032, bore: 0.0028, hub: 0.0046, hubHeight: 0.0012 }),
      this.mats.gear,
      { parent: c, pos: [0, 0, -0.0420], rot: [Math.PI / 2, 0, 0], cast: false },
    );

    hitCylinder(c, 0.0180, 0.024, [0, 0, 0.004], [Math.PI / 2, 0, 0]);
    this.handle({
      id: 'crank',
      label: 'ハンドル',
      type: 'rotate',
      object: c,
      axisObject: this.root,
      axis: new THREE.Vector3(0, 0, 1),
      pivot: c,
      primary: true,
      hint: { kind: 'spin', offset: [0, 0, 0.028], size: 0.020 },
      onRotate: (d, ctx) => {
        // まわせる向きは 1 方向だけ（本物と同じ）
        if (d >= 0) return;
        this.angle += d;
        this.omega = clamp(ctx.velocity, -24, 0);
        this.driving = true;
        this._driveTimer = 0.14;
      },
      onFling: (v) => {
        this.omega = clamp(v, -18, 0);
        this.driving = false;
      },
      onTap: () => {
        this.omega = Math.min(this.omega, -7);
      },
    });
  }

  /* --- ふた ------------------------------------------------------------ */

  _buildDoor() {
    const d = group({ pos: [0, 0.0180, 0.0384] });
    this.root.add(d);
    this.doorGroup = d;

    mesh(G.roundedPlate(0.0340, 0.0260, 0.0022, 0.0040, { bevel: 0.0005 }), this.mats.doorGlass, {
      parent: d, pos: [0, 0.0090, 0], cast: false,
    });
    mesh(new G.RoundedBoxGeometry(0.0380, 0.0060, 0.0060, 2, 0.0018), this.mats.cabinetDeep, {
      parent: d, pos: [0, 0.0225, 0.0010], cast: false,
    });

    hitProxy(d, new THREE.BoxGeometry(0.040, 0.032, 0.016), { pos: [0, 0.010, 0.004] });
    this.handle({
      id: 'door',
      label: 'とりだしぐち',
      type: 'press',
      object: d,
      hint: { kind: 'pull', offset: [0, 0.006, 0.024], size: 0.012, axis: new THREE.Vector3(0, 0, 1) },
      onPress: () => {
        this.doorTarget = 1;
        this.audio.click({ gain: 0.4, bright: 1700 });
      },
      onRelease: () => {
        this.doorTarget = 0;
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  step(dt) {
    this._driveTimer = Math.max(0, this._driveTimer - dt);
    if (this._driveTimer === 0) this.driving = false;

    if (!this.driving) {
      this.omega -= Math.sign(this.omega) * Math.min(Math.abs(this.omega), 3.2 * dt);
      this.angle += this.omega * dt;
    }
    this.door = damp(this.door, this.doorTarget, 12, dt);

    this._stepPocket();
    this._stepCapsules(dt);
  }

  /** 円ばんのポケットが、いまどこにいるか */
  _pocketPos(out) {
    const a = this.angle;
    return out.set(Math.cos(a) * POCKET_R, DISC_Y + 0.0010, Math.sin(a) * POCKET_R);
  }

  _stepPocket() {
    const p = this._pocketPos(this._tmp);
    // 山の下（-Z がわ）を通るときに 1こ すくう
    const inLoadZone = p.z < -POCKET_R * 0.55;
    const inDropZone = p.z > POCKET_R * 0.55;

    if (!this.carried && inLoadZone) {
      let best = null;
      let bestD = 0.020;
      for (const c of this.caps) {
        if (c.state !== 'globe') continue;
        const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z) + Math.max(0, c.pos.y - DISC_Y) * 1.4;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) {
        best.state = 'pocket';
        this.carried = best;
        this.audio.tick({ gain: 0.14, pitch: 0.9 });
      }
    }

    if (this.carried && inDropZone) {
      this.carried.state = 'chute';
      this.carried.t = 0;
      this.carried = null;
      this.audio.drop({ gain: 0.16, freq: 380 });
    }
  }

  _stepCapsules(dt) {
    const pocket = this._pocketPos(this._tmp2);

    for (const c of this.caps) {
      if (c.state === 'pocket') {
        c.pos.lerp(pocket, 1 - Math.exp(-26 * dt));
        c.rot.y += 1.4 * dt;
        continue;
      }
      if (c.state === 'chute') {
        c.t = Math.min(1, c.t + dt * 1.5);
        const path = this.chutePath;
        const seg = c.t * (path.length - 1);
        const i = Math.min(path.length - 2, Math.floor(seg));
        const f = seg - i;
        c.pos.lerpVectors(path[i], path[i + 1], f);
        c.rot.x += 6 * dt;
        if (c.t >= 1) {
          c.state = 'tray';
          this._delivered.push(c);
          this.audio.drop({ gain: 0.22, freq: 620 });
        }
        continue;
      }
      if (c.state === 'tray' || c.state === 'open') {
        // 受け皿の中で ならぶ
        const idx = this._delivered.indexOf(c);
        const tx = ((idx % 3) - 1) * 0.0110;
        const tz = 0.0270 + Math.floor(idx / 3) * 0.0100;
        c.pos.lerp(this._tmp.set(tx, 0.0210, tz), 1 - Math.exp(-8 * dt));
        c.rot.x = damp(c.rot.x, 0, 6, dt);
        c.rot.z = damp(c.rot.z, 0, 6, dt);
        if (c.state === 'open') c.openAmt = damp(c.openAmt, 1, 8, dt);
        continue;
      }

      // 玉の中: 重力 + 減衰
      c.vel.y -= 0.60 * dt;
      c.vel.multiplyScalar(1 - 1.4 * dt);
      c.pos.addScaledVector(c.vel, dt);
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      c.rot.z += c.spin.z * dt;
      this._constrain(c);
    }

    // 玉どうしの おしくらまんじゅう
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.caps.length; i++) {
        const a = this.caps[i];
        if (a.state !== 'globe') continue;
        for (let j = i + 1; j < this.caps.length; j++) {
          const b = this.caps[j];
          if (b.state !== 'globe') continue;
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const dz = b.pos.z - a.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          const min = CAP_R * 2;
          if (d2 > min * min || d2 < 1e-9) continue;
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.y -= ny * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.y += ny * push;
          b.pos.z += nz * push;
        }
      }
      for (const c of this.caps) if (c.state === 'globe') this._constrain(c);
    }
  }

  /** 玉を、ガラス球と じょうご の内側に とじこめる */
  _constrain(c) {
    const p = c.pos;
    // ガラス球
    const dy = p.y - GLOBE_Y;
    const len = Math.hypot(p.x, dy, p.z);
    if (len > INNER_R) {
      const k = INNER_R / len;
      p.x *= k;
      p.y = GLOBE_Y + dy * k;
      p.z *= k;
      c.vel.multiplyScalar(0.55);
    }
    // じょうご（下に行くほど すぼまる）
    if (p.y < FUNNEL_TOP) {
      const t = clamp01((p.y - (DISC_Y + CAP_R)) / (FUNNEL_TOP - (DISC_Y + CAP_R)));
      const maxR = lerp(POCKET_R + 0.0040, Math.sqrt(Math.max(0, INNER_R * INNER_R - (FUNNEL_TOP - GLOBE_Y) ** 2)), t);
      const rad = Math.hypot(p.x, p.z);
      if (rad > maxR && rad > 1e-6) {
        const k = maxR / rad;
        p.x *= k;
        p.z *= k;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
      }
    }
    // 円ばんの上（ポケットの上だけは 落ちられる）
    const floor = DISC_Y + CAP_R * 0.72;
    if (p.y < floor) {
      const pocket = this._pocketPos(this._tmp);
      const overPocket = Math.hypot(p.x - pocket.x, p.z - pocket.z) < 0.0090;
      if (!overPocket) {
        p.y = floor;
        if (c.vel.y < 0) c.vel.y *= -0.18;
        c.vel.x *= 0.86;
        c.vel.z *= 0.86;
        c.spin.multiplyScalar(0.9);
      } else if (p.y < DISC_Y - 0.004) {
        p.y = DISC_Y - 0.004;
      }
    }
  }

  /* ---------------------------------------------------------------- */

  lateUpdate(dt) {
    this.crankGroup.rotation.z = this.angle;
    this.discGroup.rotation.y = -this.angle;
    this.doorGroup.rotation.x = -this.door * 0.85;

    for (const c of this.caps) {
      c.group.position.copy(c.pos);
      c.group.rotation.copy(c.rot);
      // ふたが あくと パカッと ひらく
      const o = c.openAmt;
      c.top.position.y = o * 0.0130;
      c.top.rotation.z = o * 0.7;
      c.bot.position.y = -o * 0.0010;
      c.toy.visible = o > 0.03;
      c.toy.position.y = o * 0.0050;
      c.toy.rotation.y += dt * 1.6 * o;
      c.toy.scale.setScalar(0.4 + ease.outBack(clamp01(o)) * 0.6);
    }

    this._updateSound();
  }

  _updateSound() {
    const rattle = this.audio.voice('gachaRattle', { source: 'noise', filter: 'bandpass', freq: 1400, Q: 2 });
    const speed = clamp01(Math.abs(this.omega) / 12);
    rattle.set({ level: speed * 0.10, freq: 900 + speed * 1400, smooth: 0.05 });
  }

  /* ---------------------------------------------------------------- */

  meters() {
    const left = this.caps.filter((c) => c.state === 'globe').length;
    return [
      { id: 'left', icon: 'gauge', label: 'のこり', value: left / Math.max(1, this.caps.length), color: '#ef6f8a' },
      { id: 'got', icon: 'note', label: 'とれた', value: clamp01(this._delivered.length / 6), color: '#f2c04f' },
    ];
  }

  reset() {
    this.angle = 0;
    this.omega = 0;
    this.door = 0;
    this.doorTarget = 0;
    this.carried = null;
    this._delivered.length = 0;
    for (const c of this.caps) {
      const a = this.rand() * TAU;
      const rr = this.rand() * (INNER_R - 0.004);
      c.pos.set(Math.cos(a) * rr, GLOBE_Y - 0.020 + this.rand() * 0.030, Math.sin(a) * rr);
      c.vel.set(0, 0, 0);
      c.state = 'globe';
      c.openAmt = 0;
      c.t = 0;
    }
  }
}

/* ------------------------------------------------------------------ */

/** 球のからを、下側を切りとった プロファイルで作る */
function sphereShellProfile(R, wall, cutY, steps) {
  const pts = [];
  const a0 = Math.asin(clamp(cutY / R, -1, 1));
  for (let i = 0; i <= steps; i++) {
    const a = lerp(a0, Math.PI / 2, i / steps);
    pts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  const inner = R - wall;
  for (let i = steps; i >= 0; i--) {
    const a = lerp(a0, Math.PI / 2, i / steps);
    pts.push([Math.cos(a) * inner, Math.sin(a) * inner]);
  }
  return pts;
}
