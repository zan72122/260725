/* ============================================================================
 * activities/feed.js — 🍼 ごはん
 * ----------------------------------------------------------------------------
 * Every food has its own process, and every process leaves a trace:
 *
 *   スタイ      tap the bib hanging on the chair before you start. Skip it and
 *               the food lands on the clothes instead — which is what sends the
 *               child to きせかえ / おふろ later.
 *   ほにゅうびん drag to the mouth → cheeks pump, the milk mesh drops inside real
 *               transmissive glass, bubbles climb →「ぷはー」→ pat the back four
 *               times → げっぷ!
 *   ジュース    tap the straw to pierce the foil「プスッ」→ suck → the carton
 *               genuinely dents inward → 「ズゾゾー」 → empty pack to the bin.
 *   りんご      three bites, each one carving a crescent out of the actual
 *               geometry → core left over → bin it.
 *   バナナ      three sideways swipes peel it, the peel flopping down, and it
 *               refuses to be eaten before that.
 *   おにぎり    nori sticks to the cheek, rice grains stay around the mouth and
 *               can be picked off one at a time「ぱくっ」.
 *   クッキー    crumbs fall, dirty the tray and the clothes.
 *   おかゆ      spoon it out of the ceramic bowl; the wet surface drops.
 *   おしぼり    wipe the face clean at the end.
 *
 * Food follows the baby's eyes and「あーん」opens the mouth; a full tummy turns
 * the head away instead of failing anybody.
 *
 * Sound names requested from engine/audio.js:
 *   pop tap munch crunch chew suck gulp slurp puha burp pat peel strawStab
 *   pour squeak chime tada boing refuse bubble ding wipe trash
 * ========================================================================== */

import * as THREE from 'three';
import * as M from '../engine/materials.js';
import * as TEX from '../engine/textures.js';
import * as S from './_shared.js';

/* ------------------------------------------------------------- food table - */

const FOODS = {
  bottle: { label: 'ミルク', kind: 'suck', seconds: 4.2, burp: true, slot: 0 },
  juice: { label: 'ジュース', kind: 'suck', seconds: 3.0, needs: 'straw', residue: 'pack', slot: 1 },
  porridge: { label: 'おかゆ', kind: 'spoon', spoons: 4, slot: 2 },
  apple: { label: 'りんご', kind: 'bite', bites: 3, residue: 'core', slot: 3 },
  banana: { label: 'バナナ', kind: 'bite', bites: 3, needs: 'peel', residue: 'peel', slot: 4 },
  riceball: { label: 'おにぎり', kind: 'bite', bites: 3, rice: true, slot: 5 },
  cookie: { label: 'クッキー', kind: 'bite', bites: 3, crumbs: true, slot: 6 }
};

const FOOD_IDS = Object.keys(FOODS);

/* Tray-local slot positions (metres, relative to the tray top centre). */
const SLOTS = [
  [-0.165, 0.000, -0.050],   // bottle   (standing, back left)
  [0.170, 0.000, -0.055],   // juice    (standing, back right)
  [-0.080, 0.000, 0.075],   // porridge bowl (front left)
  [0.080, 0.000, 0.078],   // apple    (front right)
  [0.000, 0.000, -0.078],   // banana   (back centre)
  [0.175, 0.000, 0.072],   // riceball (front far right)
  [-0.180, 0.000, 0.076]    // cookie   (front far left)
];

const TRAY_Y = 0.452;        // tray top surface, chair-local
const TRAY_Z = 0.170;
const TRAY_W = 0.48;
const TRAY_D = 0.32;

const MOUTH_REACH = 0.085;   // "close enough to eat" radius
const AAN_REACH = 0.19;      // "あーん" mouth-open radius

/**
 * Which way the working highchair faces, in world radians.
 *
 * The room anchor's own yaw (2.35 rad) points the chair at the +X/−Z corner,
 * roughly a metre from two walls. Any face-to-face camera therefore has to
 * stand *inside* the corner — outside the room shell, which is where `10`,
 * `11` and `12` got their pure-black voids from. Turning the chair back into
 * the room (facing the window wall, down and across the floor) gives every
 * feed framing a metre of clean air to stand in and puts the window light on
 * the baby's face instead of on the back of his head.
 */
const FEED_YAW = -0.89;

/** Shared +Y, for aiming a prop's own axis at a target. */
const _UP = new THREE.Vector3(0, 1, 0);

/** Distance from the bottle group's origin to the tip of the teat. */
const BOTTLE_TEAT = 0.192;

export class FeedActivity {
  constructor(ctx) {
    this.ctx = ctx;
    this.trash = new S.Trash();
    this.clock = new S.Clockwork();
    this.picker = new S.Picker(ctx.renderer, ctx.camera);

    this.root = null;
    this.shotPivot = null;       // rides the baby's head; every feed framing hangs off it
    this._roomChairHidden = false;
    this.foods = {};             // id → THREE.Group
    this.item = null;            // the food currently in play
    this.held = null;            // { obj, kind } being dragged
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();

    this.bibOn = false;
    this.wipeOut = false;
    this.burpTaps = 0;
    this.patCooldown = 0;
    this.faceDirt = 0;
    this.bodyDirt = 0;
    this.crumbs = [];
    this.riceGrains = [];
    this.labels = [];
    this.request = null;
    this.time = 0;
    this._peelAnchor = null;
    this._wipeCooldown = 0;
    this._entered = false;

    this._mouth = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._vFall = new THREE.Vector3();
    this._vLocal = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._upVec = new THREE.Vector3();
    this._mat4 = new THREE.Matrix4();
    this._plane = new THREE.Plane();
    this._rand = S.rng(20260726);
  }

  /* =========================================================== building == */

  async build() {
    const ctx = this.ctx;
    this.root = new THREE.Group();
    this.root.name = 'feed-rig';
    this.trash.obj(this.root);
    S.placeAtAnchor(this.root, ctx.room?.anchor?.('highchair'), [0, 0, 0], [0, 0, 0.35]);
    // The room dresses that anchor with a *decorative* highchair of its own,
    // and it is authored facing the +X/−Z corner. Two problems follow: the
    // decorative chair sits inside ours (its tray at y 0.72 is what the old
    // `10/11/12` frames were actually looking at the underside of), and any
    // face-to-face camera in front of the baby ends up jammed into the corner
    // with the room shell behind it — which is where the black voids came
    // from. So the working chair takes the anchor's *position* and its own
    // yaw, aimed back into the open room, and the decorative one steps aside
    // for as long as this activity owns the screen.
    this.root.rotation.set(0, FEED_YAW, 0);
    const roomChair = ctx.room?.highchair;
    if (roomChair && roomChair.visible) {
      roomChair.visible = false;
      this._roomChairHidden = true;
      this.trash.fn(() => { roomChair.visible = true; this._roomChairHidden = false; });
    }
    ctx.scene.add(this.root);

    this._makeMaterials();
    this._buildChair();
    this._buildBin();
    this._buildBib();
    this._buildWipe();
    this._buildPatTarget();
    this._buildHintRing();

    this.foods.bottle = this._buildBottle();
    this.foods.juice = this._buildJuice();
    this.foods.porridge = this._buildPorridge();
    this.foods.apple = this._buildApple();
    this.foods.banana = this._buildBanana();
    this.foods.riceball = this._buildRiceball();
    this.foods.cookie = this._buildCookie();

    // The spoon lives on the rig root, not inside the bowl group, so dragging
    // it stays in one coordinate space.
    this.root.add(this.spoon);
    this.spoon.position.set(
      SLOTS[FOODS.porridge.slot][0] + 0.022, TRAY_Y + 0.046,
      TRAY_Z + SLOTS[FOODS.porridge.slot][2] + 0.030);
    this.spoon.rotation.set(0.25, -0.5, 0.2);
    this.spoonHome = {
      pos: this.spoon.position.clone(), quat: this.spoon.quaternion.clone()
    };

    for (const id of FOOD_IDS) {
      const g = this.foods[id];
      g.userData.pickId = id;
      g.userData.slot = new THREE.Vector3(
        SLOTS[FOODS[id].slot][0], TRAY_Y + SLOTS[FOODS[id].slot][1] + (g.userData.rest || 0),
        TRAY_Z + SLOTS[FOODS[id].slot][2]);
      g.position.copy(g.userData.slot);
      g.userData.homeQuat = g.quaternion.clone();
      const proxy = S.hitProxy(g.userData.hit || 0.048, 'food-hit');
      proxy.position.y = g.userData.hitY || 0;
      g.add(proxy);
      this.root.add(g);
    }

    // Pristine copies of everything that can be bitten, so a harness patch can
    // re-stage the same food without the previous shot's bites still in it.
    this.carvables = [this.apple, this.cookie, this.riceball, this.bananaFlesh];
    for (const m of this.carvables) {
      m.userData.pristine = {
        pos: S.snapshot(m.geometry),
        col: m.geometry.attributes.color
          ? Float32Array.from(m.geometry.attributes.color.array) : null
      };
    }

    this._buildShots();

    S.shade(this.root, true, true);
    // Crumbs, rice grains and tray hardware are far below the resolution of a
    // VSM map this soft — they cost a draw call each and shade nothing. GTAO
    // grounds them instead. (D10)
    S.trimShadowCasters(this.root, { minRadius: 0.055 });
    this._refreshTargets();
  }

  /* ------------------------------------------------------------- shots -- */

  /**
   * Feeding is the one activity where the subject and the prop are 25 cm
   * apart and the prop is *between* the camera and the subject. A framing
   * composed on the baby root (which sits on the seat, 40 cm below the face)
   * aims straight into the underside of the tray; a framing composed on the
   * tray loses the face. So this scene hands the rig a pivot that rides the
   * baby's head and composes every feed shot around it, with the tray falling
   * into the lower third by construction rather than by luck.
   *
   * Offsets read in the baby's own frame: +X is his left, +Y up, +Z the way
   * he is facing. `restorePresets()` in app.setActivity puts the defaults
   * back when the activity is torn down.
   */
  _buildShots() {
    const ctx = this.ctx;
    this.shotPivot = new THREE.Object3D();
    this.shotPivot.name = 'feed-shot-pivot';
    this.root.add(this.shotPivot);
    this._syncShotPivot();

    const rig = ctx.cameraRig;
    if (!rig?.overridePreset) return;
    rig.setSubject?.(this.shotPivot);

    // Face-to-face across the tray. The eye sits 0.16 m above the baby's own
    // eyeline and 0.80 m out; the aim point drops 0.10 m below it, which lands
    // the crown ~18% down from the top edge and the tray rim ~85% down —
    // face and food both whole, nothing cropped, no tray underside.
    rig.overridePreset('table', {
      space: 'subject',
      pos: [0.255, 0.160, 0.800], target: [-0.015, -0.100, 0.020],
      fov: 36, focusRange: 0.17, dof: 1.05, handheld: 0.70, roll: 0.6
    });
    // Three-quarter from the baby's right, lower and tighter: a different
    // moment, not the same shot with a different apple in it.
    rig.overridePreset('table-side', {
      space: 'subject',
      pos: [-0.395, 0.175, 0.735], target: [0.015, -0.085, 0.020],
      fov: 37, focusRange: 0.14, dof: 1.20, handheld: 0.85, roll: 0.9
    });
    // The wide "golden hour in the nursery" framing still has to contain its
    // subject: high and back, but pointed at the highchair.
    rig.overridePreset('table-wide', {
      space: 'subject',
      pos: [0.760, 0.600, 1.400], target: [0.020, -0.230, 0.030],
      fov: 38, focusRange: 0.40, dof: 0.75, handheld: 1.00, roll: 1.0
    });
    // Mess/detail framing — closer still, so food on the face reads.
    rig.overridePreset('closeup', {
      space: 'subject',
      pos: [0.220, 0.130, 0.680], target: [-0.010, -0.055, 0.010],
      fov: 34, focusRange: 0.12, dof: 1.30, handheld: 0.60, roll: 0.5
    });
    rig.overridePreset('face', {
      space: 'subject',
      pos: [0.150, 0.070, 0.470], target: [-0.010, -0.020, 0.010],
      fov: 30, focusRange: 0.10, dof: 1.35, handheld: 0.50, roll: 0.4
    });
  }

  /**
   * Park the pivot on the head, in rig-root local space. Falls back to the
   * seat plus a head's height so the very first snap is never wild.
   */
  _syncShotPivot() {
    if (!this.shotPivot) return;
    const b = this.ctx.baby;
    let head = null;
    try {
      const bone = b?.bone?.('head');
      if (bone?.isObject3D) head = bone.getWorldPosition(this._tmp2);
    } catch (e) { head = null; }
    if (!head || !Number.isFinite(head.x)) {
      this.shotPivot.position.set(0, 0.318 + 0.395, 0.005);
      return;
    }
    this.root.updateWorldMatrix(true, false);
    this.shotPivot.position.copy(this.root.worldToLocal(this._tmp.copy(head)));
  }

  _resetCarve() {
    for (const m of this.carvables) {
      const p = m.userData.pristine;
      if (!p) continue;
      m.geometry.attributes.position.array.set(p.pos);
      m.geometry.attributes.position.needsUpdate = true;
      if (p.col && m.geometry.attributes.color) {
        m.geometry.attributes.color.array.set(p.col);
        m.geometry.attributes.color.needsUpdate = true;
      }
      m.geometry.computeVertexNormals();
      m.visible = true;
    }
    this.appleCore.visible = false;
    for (const p of this.peels) { p.open = 0; this._posePeel(p); }
    this.peelCount = 0;
  }

  _makeMaterials() {
    const t = this.trash;
    const tier = this.ctx.tier ?? 2;
    this.tier = tier;

    this.mat = {
      wood: t.mat(M.makeWood({ light: 0xf2ceA0, dark: 0xa9743f, repeat: 3, seed: 3, clearcoat: 0.4 })),
      woodDark: t.mat(M.makeWood({ light: 0xd9a468, dark: 0x8a5426, repeat: 4, seed: 8 })),
      trayPlastic: t.mat(M.makePlastic({ color: 0xfdf8f1, matte: 0.30, seed: 37 })),
      rimPlastic: t.mat(M.makePlastic({ color: 0x8fd9c6, matte: 0.26, seed: 41, clearcoat: 0.7 })),
      binPlastic: t.mat(M.makePlastic({ color: 0xb9e5c9, matte: 0.34, seed: 44 })),
      ceramic: t.mat(M.makeCeramic({ color: 0xfffdf9, seed: 31 })),
      ceramicRim: t.mat(M.makeCeramic({ color: 0xffc7d8, seed: 29 })),
      metal: S.Trash.shared(M.makeMetal({ color: 0xdfe4ea, roughness: 0.18 })),
      glass: t.mat(M.makeGlass({ thickness: 0.010, roughness: 0.045, ior: 1.47 })),
      milk: t.mat(S.liquidMaterial({ color: 0xfffbf3, rough: 0.26 })),
      juiceLiquid: t.mat(S.liquidMaterial({ color: 0x8b4fbf, rough: 0.2 })),
      porridge: t.mat(S.wetFoodMaterial({ color: 0xf6e7c8, seed: 12, rough: 0.34 })),
      suds: t.mat(S.sudsMaterial({ color: 0xfffdf6, opacity: 0.82 })),
      bibCloth: t.mat(M.makeCloth({ color: 0xfff3f7, weave: 'plain', repeat: 5, seed: 7, threads: 140 })),
      bibTrim: t.mat(M.makeCloth({ color: 0xff9dbf, weave: 'knit', repeat: 4, seed: 13 })),
      terry: t.mat(M.makeTerry({ color: 0xeaf7ff, repeat: 5, seed: 71 })),
      apple: t.mat(S.fruitMaterial(tier, { seed: 5, matte: 0.30, tint: 0xff5a44, thickness: 0.018 })),
      banana: t.mat(S.fruitMaterial(tier, { seed: 9, matte: 0.44, tint: 0xffd76a, thickness: 0.012 })),
      peel: t.mat(S.fruitMaterial(tier, { seed: 17, matte: 0.40, tint: 0xffe08a, thickness: 0.006, vertexColors: true })),
      rice: t.mat(M.makePlastic({ color: 0xfffdf6, matte: 0.68, seed: 23, clearcoat: 0.35 })),
      nori: t.mat(M.makePlastic({ color: 0x24352c, matte: 0.72, seed: 27, clearcoat: 0.18 })),
      cookie: t.mat(S.fruitMaterial(tier, { seed: 33, matte: 0.72, tint: 0xb98a4e, thickness: 0.004 })),
      choc: t.mat(M.makePlastic({ color: 0x4a2c1c, matte: 0.44, seed: 47 })),
      pack: t.mat(M.makePlastic({ color: 0xffffff, matte: 0.36, seed: 51 })),
      straw: t.mat(M.makePlastic({ color: 0xffffff, matte: 0.24, seed: 53, clearcoat: 0.8 })),
      teat: t.mat(M.makePlastic({ color: 0xffd9c8, matte: 0.5, seed: 57 })),
      collar: t.mat(M.makePlastic({ color: 0xffb4c8, matte: 0.28, seed: 59 })),
      crumb: t.mat(M.makePlastic({ color: 0xc79a63, matte: 0.7, seed: 61 })),
      hint: t.mat(new THREE.MeshBasicMaterial({
        color: 0xfff0a8, transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending
      }))
    };

    // The carton print — cached in textures.js, so never disposed here.
    this.mat.pack.map = TEX.painted('feed-juice-pack', 256, (g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#8a5bd8'); grad.addColorStop(0.55, '#7442c4'); grad.addColorStop(1, '#5c30a4');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
      g.fillStyle = '#fdf6ff';
      g.fillRect(0, s * 0.60, s, s * 0.14);
      g.fillStyle = '#c9a4ff';
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.arc(s * (0.30 + (i % 3) * 0.10), s * (0.30 + Math.floor(i / 3) * 0.10), s * 0.055, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#6ea84a'; g.lineWidth = s * 0.02;
      g.beginPath(); g.moveTo(s * 0.5, s * 0.22); g.quadraticCurveTo(s * 0.58, s * 0.14, s * 0.66, s * 0.16); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(0, 0, s * 0.14, s);
    }, { srgb: true });
    this.mat.pack.color.set(0xffffff);
    this.mat.pack.needsUpdate = true;

    this.mat.straw.map = TEX.painted('feed-straw', 64, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#ff6a8a'; g.lineWidth = s * 0.22;
      for (let i = -2; i < 4; i++) {
        g.beginPath(); g.moveTo(i * s * 0.5, 0); g.lineTo(i * s * 0.5 + s * 0.5, s); g.stroke();
      }
    }, { srgb: true, repeat: 6 });
    this.mat.straw.needsUpdate = true;
  }

  /* -------------------------------------------------------------- chair -- */

  _buildChair() {
    const parts = [];
    const legTop = 0.30;

    // splayed legs with a real taper
    for (let i = 0; i < 4; i++) {
      const sx = (i & 1) ? 1 : -1, sz = (i < 2) ? 1 : -1;
      const g = new THREE.CylinderGeometry(0.011, 0.017, legTop + 0.02, 10, 1);
      parts.push([g, S.xform(
        [sx * 0.115, (legTop + 0.02) / 2, sz * 0.105 + 0.02],
        [sz * 0.09, 0, -sx * 0.09])]);
    }
    // cross braces
    parts.push([S.roundedBox(0.25, 0.014, 0.012, 0.005, 2), S.xform([0, 0.11, 0.125])]);
    parts.push([S.roundedBox(0.25, 0.014, 0.012, 0.005, 2), S.xform([0, 0.11, -0.085])]);
    // footrest
    parts.push([S.roundedBox(0.20, 0.014, 0.055, 0.006, 3), S.xform([0, 0.145, 0.135])]);
    // seat
    parts.push([S.roundedBox(0.27, 0.026, 0.25, 0.012, 4), S.xform([0, legTop + 0.013, 0.02])]);
    // back posts + slats
    parts.push([S.roundedBox(0.020, 0.30, 0.022, 0.008, 3), S.xform([-0.125, legTop + 0.16, -0.095])]);
    parts.push([S.roundedBox(0.020, 0.30, 0.022, 0.008, 3), S.xform([0.125, legTop + 0.16, -0.095])]);
    for (let i = 0; i < 3; i++) {
      parts.push([S.roundedBox(0.245, 0.026, 0.014, 0.006, 3),
      S.xform([0, legTop + 0.075 + i * 0.075, -0.095])]);
    }
    parts.push([S.roundedBox(0.27, 0.030, 0.026, 0.012, 4), S.xform([0, legTop + 0.30, -0.095])]);
    // side rails / arms
    for (const sx of [-1, 1]) {
      parts.push([S.roundedBox(0.020, 0.020, 0.24, 0.008, 3),
      S.xform([sx * 0.125, legTop + 0.115, 0.045])]);
      parts.push([S.roundedBox(0.020, 0.10, 0.020, 0.008, 3),
      S.xform([sx * 0.125, legTop + 0.065, 0.155])]);
    }

    const chair = new THREE.Mesh(this.trash.geo(S.mergeAll(parts)), this.mat.wood);
    chair.name = 'highchair';
    this.root.add(chair);
    this.chair = chair;

    // tray: plate + a raised rim with a real bevel
    const tray = new THREE.Mesh(
      this.trash.geo(S.roundedBox(TRAY_W, 0.022, TRAY_D, 0.010, 4)), this.mat.trayPlastic);
    tray.position.set(0, TRAY_Y - 0.011, TRAY_Z);
    tray.name = 'tray';
    tray.userData.pickId = 'tray';
    this.root.add(tray);
    this.tray = tray;

    const outer = S.roundedRectShape(TRAY_W, TRAY_D, 0.048);
    const inner = S.roundedRectShape(TRAY_W - 0.028, TRAY_D - 0.028, 0.040);
    outer.holes.push(new THREE.Path(inner.getPoints(24)));
    const rimGeo = S.extrudeShape(outer, 0.020, 0.0025, 18);
    rimGeo.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(this.trash.geo(rimGeo), this.mat.rimPlastic);
    rim.position.set(0, TRAY_Y + 0.004, TRAY_Z);
    this.root.add(rim);

    // a little lip at the front so nothing "falls off" the frame
    const lip = new THREE.Mesh(
      this.trash.geo(S.roundedBox(TRAY_W * 0.9, 0.016, 0.014, 0.006, 3)), this.mat.rimPlastic);
    lip.position.set(0, TRAY_Y + 0.010, TRAY_Z + TRAY_D / 2 - 0.004);
    this.root.add(lip);
  }

  _buildBin() {
    const bin = new THREE.Group();
    bin.name = 'bin';
    const body = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0], [0.058, 0], [0.062, 0.006], [0.070, 0.10], [0.074, 0.145], [0.070, 0.150]
    ], 24)), this.mat.binPlastic);
    bin.add(body);

    const lid = new THREE.Group();
    const lidTop = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0.012], [0.040, 0.014], [0.066, 0.008], [0.076, 0.000], [0.076, -0.010]
    ], 24)), this.mat.rimPlastic);
    lid.add(lidTop);
    lid.position.set(0, 0.152, -0.070);
    lid.userData.hinge = true;
    bin.add(lid);
    this.binLid = lid;

    const pedal = new THREE.Mesh(
      this.trash.geo(S.roundedBox(0.05, 0.010, 0.030, 0.004, 2)), this.mat.metal);
    pedal.position.set(0, 0.012, 0.062);
    bin.add(pedal);

    bin.position.set(0.34, 0, TRAY_Z + 0.10);
    bin.userData.pickId = 'bin';
    const binHit = S.hitProxy(0.11, 'bin-hit');
    binHit.position.y = 0.09;
    bin.add(binHit);
    this.root.add(bin);
    this.bin = bin;
    this.binOpen = 0;
  }

  _buildBib() {
    // A real cloth panel cut to a bib silhouette, kept as a grid so the verlet
    // solver can still run over it while it hangs on the chair.
    const segX = 8, segY = 9;
    const geo = this.trash.geo(S.clothPanel(0.15, 0.17, segX, segY,
      v => 0.45 + 0.55 * Math.sin(Math.min(1, v * 1.25) * Math.PI * 0.62)));
    const bib = new THREE.Mesh(geo, this.mat.bibCloth);
    bib.material.side = THREE.DoubleSide;
    bib.name = 'bib';

    const group = new THREE.Group();
    group.add(bib);
    const collar = new THREE.Mesh(
      this.trash.geo(new THREE.TorusGeometry(0.037, 0.008, 8, 22)), this.mat.bibTrim);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.088, 0);
    group.add(collar);

    // draped over the left rim of the tray, hanging clear of every food slot
    group.position.set(-TRAY_W / 2 - 0.005, 0.468, TRAY_Z + 0.02);
    group.rotation.set(0.12, 0.30, -1.15);
    group.userData.pickId = 'bib';
    group.add(S.hitProxy(0.10, 'bib-hit'));
    this.root.add(group);
    this.bib = group;
    this.bibPanel = bib;
    this.bibBase = S.snapshot(geo);
    this.bibCloth = S.makeCloth(this.ctx, bib, {
      segX, segY, pins: S.topRow(segX), gravity: -2.4, wind: 0.35, stiffness: 0.85
    });
    this.trash.fn(() => this.bibCloth?.release());
  }

  _buildWipe() {
    const group = new THREE.Group();
    const roll = new THREE.Mesh(
      this.trash.geo(new THREE.CylinderGeometry(0.017, 0.017, 0.055, 16, 1)), this.mat.terry);
    roll.rotation.z = Math.PI / 2;
    group.add(roll);
    // the little rolled edge, so it reads as an おしぼり and not a sausage
    const edge = new THREE.Mesh(
      this.trash.geo(new THREE.TorusGeometry(0.0165, 0.0035, 6, 20)), this.mat.terry);
    edge.rotation.y = Math.PI / 2;
    edge.position.x = 0.026;
    group.add(edge);

    group.position.set(0.185, TRAY_Y + 0.017, TRAY_Z + 0.105);
    group.userData.pickId = 'wipe';
    group.add(S.hitProxy(0.055, 'wipe-hit'));
    this.root.add(group);
    this.wipeRoll = group;

    // the unfolded cloth that appears in the child's "hand"
    const segX = 5, segY = 5;
    const cgeo = this.trash.geo(S.clothPanel(0.10, 0.10, segX, segY));
    const cloth = new THREE.Mesh(cgeo, this.mat.terry);
    cloth.material.side = THREE.DoubleSide;
    cloth.visible = false;
    cloth.castShadow = true;
    this.root.add(cloth);
    this.wipeCloth = cloth;
    this.wipeSim = S.makeCloth(this.ctx, cloth, {
      segX, segY, pins: [0, segX], gravity: -3.2, wind: 0.5, stiffness: 0.8
    });
    this.trash.fn(() => this.wipeSim?.release());
  }

  /** Invisible, generous target that follows the baby's back for burping. */
  _buildPatTarget() {
    const t = S.hitProxy(0.085, 'back');
    t.userData.pickId = 'back';
    // Invisible geometry, but it rides a very visible back — so the HUD is
    // allowed to aim a prompt arrow at it. See UI#_targetOnScreen.
    t.userData.promptAnchor = true;
    t.visible = false;
    this.root.add(t);
    this.patTarget = t;
  }

  _buildHintRing() {
    const geo = this.trash.geo(new THREE.RingGeometry(0.032, 0.046, 32));
    geo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(geo, this.mat.hint);
    ring.visible = false;
    ring.renderOrder = 2;
    this.root.add(ring);
    this.hintRing = ring;
  }

  /* --------------------------------------------------------- the bottle -- */

  _buildBottle() {
    const g = new THREE.Group();
    g.name = 'bottle';

    const glass = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0], [0.026, 0], [0.0305, 0.006], [0.0315, 0.020], [0.0315, 0.086],
      [0.0300, 0.098], [0.0250, 0.112], [0.0205, 0.122], [0.0200, 0.130], [0.0195, 0.134]
    ], 32)), this.mat.glass);
    glass.renderOrder = 3;
    g.add(glass);

    // moulded measure ticks
    const ticks = [];
    for (let i = 0; i < 4; i++) {
      const w = i % 2 ? 0.010 : 0.016;
      ticks.push([S.roundedBox(w, 0.0025, 0.003, 0.001, 1),
      S.xform([0.0, 0.024 + i * 0.017, 0.031], [0, 0, 0])]);
    }
    const tickMesh = new THREE.Mesh(this.trash.geo(S.mergeAll(ticks)), this.mat.collar);
    g.add(tickMesh);

    // milk — a genuine volume whose surface stays level when the bottle tilts
    const mgeo = new THREE.CylinderGeometry(0.0288, 0.0268, 0.088, 28, 1, false);
    mgeo.translate(0, 0.006 + 0.044, 0);
    this.trash.geo(mgeo);
    const milk = new THREE.Mesh(mgeo, this.mat.milk);
    g.add(milk);
    this.milk = milk;
    this.milkTopY = 0.006 + 0.088;
    this.milkBottomY = 0.006;
    this.milkTop = [];
    this.milkCap = [];
    const pos = mgeo.attributes.position, nor = mgeo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - this.milkTopY) < 1e-5) {
        this.milkTop.push(i);
        if (nor.getY(i) > 0.9) this.milkCap.push(i);
      }
    }
    this.milkBase = S.snapshot(mgeo);
    this.milkLevel = 1;

    // bubbles that climb through the milk while sucking
    const bgeo = this.trash.geo(new THREE.SphereGeometry(0.0042, 10, 8));
    const bubbles = new THREE.InstancedMesh(bgeo, this.mat.suds, 10);
    bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bubbles.frustumCulled = false;
    bubbles.count = 10;
    g.add(bubbles);
    this.bubbles = bubbles;
    this.bubbleState = [];
    for (let i = 0; i < 10; i++) {
      this.bubbleState.push({ y: -1, x: 0, z: 0, s: 0, v: 0 });
    }
    this._syncBubbles();
    bubbles.visible = false;

    const collar = new THREE.Mesh(this.trash.geo(S.lathe([
      [0.0195, 0.128], [0.0235, 0.130], [0.0240, 0.146], [0.0215, 0.150], [0.0180, 0.150]
    ], 28)), this.mat.collar);
    g.add(collar);

    // bulb → neck → rounded tip, the way a real silicone teat is moulded
    const teat = new THREE.Mesh(this.trash.geo(S.lathe([
      [0.0175, 0.1480], [0.0198, 0.1545], [0.0192, 0.1625], [0.0140, 0.1700],
      [0.0092, 0.1765], [0.0074, 0.1840], [0.0082, 0.1905], [0.0068, 0.1955],
      [0.0038, 0.1988], [0, 0.2000]
    ], 26)), this.mat.teat);
    this.mat.teat.transmission = this.tier >= 1 ? 0.35 : 0;
    this.mat.teat.thickness = 0.006;
    this.mat.teat.ior = 1.41;
    g.add(teat);

    g.userData.rest = 0;
    g.userData.hit = 0.062;
    g.userData.hitY = 0.085;
    return g;
  }

  _syncBubbles() {
    const m = this._mat4;
    for (let i = 0; i < this.bubbleState.length; i++) {
      const b = this.bubbleState[i];
      m.makeScale(b.s, b.s, b.s);
      m.setPosition(b.x, b.y, b.z);
      this.bubbles.setMatrixAt(i, m);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  /** level 0..1 — moves real vertices, and keeps the surface world-horizontal. */
  _setMilk(level) {
    this.milkLevel = S.clamp(level, 0, 1);
    const geo = this.milk.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const base = this.milkBase;
    const k = this.milkBottomY + 0.088 * this.milkLevel;

    this.milk.updateWorldMatrix(true, false);
    const q = this.milk.getWorldQuaternion(this._quat).invert();
    const up = this._upVec.set(0, 1, 0).applyQuaternion(q);
    const uy = Math.abs(up.y) < 0.25 ? 0.25 * Math.sign(up.y || 1) : up.y;

    for (const i of this.milkTop) {
      const x = base[i * 3], z = base[i * 3 + 2];
      let y = (k - x * up.x - z * up.z) / uy;
      y = S.clamp(y, this.milkBottomY + 0.002, this.milkTopY);
      pos.setY(i, y);
    }
    for (const i of this.milkCap) nor.setXYZ(i, up.x, up.y, up.z);
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    this.milk.visible = this.milkLevel > 0.02;
  }

  /* ----------------------------------------------------------- the pack -- */

  _buildJuice() {
    const g = new THREE.Group();
    g.name = 'juice';

    const geo = S.roundedBox(0.055, 0.086, 0.042, 0.004, 7);
    // fold the top into a gable, the way a real carton is heat-sealed
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.014) {
        const t = S.smoothstep(0.014, 0.043, y);
        pos.setZ(i, pos.getZ(i) * (1 - 0.86 * t));
        pos.setX(i, pos.getX(i) * (1 - 0.06 * t));
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    this.trash.geo(geo);

    const pack = new THREE.Mesh(geo, this.mat.pack);
    g.add(pack);
    this.pack = pack;
    this.packBase = S.snapshot(geo);

    // foil disc where the straw goes in
    const foil = new THREE.Mesh(
      this.trash.geo(new THREE.CircleGeometry(0.006, 14)), this.mat.metal);
    foil.rotation.x = -Math.PI / 2;
    foil.position.set(0.015, 0.0435, 0);
    g.add(foil);
    this.packFoil = foil;

    const strawGeo = this.trash.geo(S.tube([
      [0, -0.030, 0], [0, 0.012, 0], [0.0005, 0.030, 0.001],
      [0.004, 0.044, 0.002], [0.011, 0.050, 0.002]
    ], 0.0028, 26, 8));
    const straw = new THREE.Mesh(strawGeo, this.mat.straw);
    straw.position.set(0.030, 0.062, 0.028);
    straw.rotation.z = -0.55;
    straw.userData.pickId = 'straw';
    straw.add(S.hitProxy(0.045, 'straw-hit'));
    g.add(straw);
    this.straw = straw;
    this.strawIn = false;
    this.packDent = 0;

    g.userData.rest = 0.043;
    g.userData.hit = 0.055;
    return g;
  }

  /** 0..1 — the pack really deforms, it does not just scale. */
  _setPackDent(t) {
    this.packDent = S.clamp(t, 0, 1);
    const geo = this.pack.geometry;
    const pos = geo.attributes.position;
    const base = this.packBase;
    const k = this.packDent;
    for (let i = 0; i < pos.count; i++) {
      let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      // the two wide faces cave in around a pair of thumb-print centres
      if (Math.abs(z) > 0.010) {
        const face = Math.sign(z);
        const d1 = Math.hypot(x - 0.008, y + 0.005);
        const d2 = Math.hypot(x + 0.012, y - 0.018);
        const push = k * (0.0145 * Math.exp(-Math.pow(d1 / 0.022, 2)) +
          0.0095 * Math.exp(-Math.pow(d2 / 0.018, 2)));
        z -= face * Math.min(push, Math.abs(z) - 0.004);
      }
      // narrow sides pinch, whole carton settles down
      x *= 1 - 0.10 * k * S.smoothstep(-0.04, 0.02, y);
      y = y > -0.030 ? y - 0.010 * k * S.smoothstep(-0.03, 0.043, y) : y;
      // crinkles
      const cr = Math.sin(y * 260 + x * 90) * 0.0006 * k;
      pos.setXYZ(i, x + cr, y, z + cr * 0.5);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /* ---------------------------------------------------------- porridge --- */

  _buildPorridge() {
    const g = new THREE.Group();
    g.name = 'porridge';

    const bowl = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0], [0.020, 0], [0.026, 0.003], [0.034, 0.012], [0.043, 0.026],
      [0.048, 0.038], [0.050, 0.044], [0.0465, 0.044], [0.045, 0.038],
      [0.040, 0.026], [0.032, 0.012], [0.024, 0.005], [0, 0.005]
    ], 32)), this.mat.ceramic);
    g.add(bowl);
    const band = new THREE.Mesh(
      this.trash.geo(new THREE.TorusGeometry(0.0478, 0.0028, 8, 30)), this.mat.ceramicRim);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.0405;
    g.add(band);

    // the porridge itself: a lumpy, wet disc that drops as it is eaten
    const pgeo = new THREE.CircleGeometry(0.042, 40, 0, Math.PI * 2);
    pgeo.rotateX(-Math.PI / 2);
    const ppos = pgeo.attributes.position;
    for (let i = 0; i < ppos.count; i++) {
      const x = ppos.getX(i), z = ppos.getZ(i);
      const r = Math.hypot(x, z) / 0.042;
      const lump = TEX.fbm(x * 14 + 0.5, z * 14 + 0.5, 10, 3, 11) - 0.5;
      ppos.setY(i, 0.0035 * (1 - r * r) + lump * 0.0022 * (1 - r));
    }
    ppos.needsUpdate = true;
    pgeo.computeVertexNormals();
    this.trash.geo(pgeo);
    const food = new THREE.Mesh(pgeo, this.mat.porridge);
    food.position.y = 0.030;
    g.add(food);
    this.porridge = food;
    this.porridgeLevel = 1;

    // spoon: real bowl + real handle
    const spoon = new THREE.Group();
    const bowlGeo = new THREE.SphereGeometry(0.0135, 20, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58);
    bowlGeo.scale(1, 0.52, 1.45);
    bowlGeo.rotateX(Math.PI);
    const spoonBowl = new THREE.Mesh(this.trash.geo(bowlGeo), this.mat.metal);
    spoon.add(spoonBowl);
    const handle = new THREE.Mesh(this.trash.geo(S.tube([
      [0, 0.0015, -0.017], [0, 0.004, -0.035], [0, 0.010, -0.052], [0, 0.016, -0.064]
    ], 0.0035, 16, 8)), this.mat.metal);
    spoon.add(handle);
    const scoop = new THREE.Mesh(
      this.trash.geo(new THREE.SphereGeometry(0.0105, 14, 10)), this.mat.porridge);
    scoop.scale.set(1, 0.45, 1.35);
    scoop.position.y = 0.0015;
    scoop.visible = false;
    spoon.add(scoop);
    this.spoonScoop = scoop;

    spoon.userData.pickId = 'spoon';
    spoon.add(S.hitProxy(0.055, 'spoon-hit'));
    this.spoon = spoon;                 // parented to the rig root in build()

    g.userData.rest = 0;
    g.userData.hit = 0.062;
    g.userData.hitY = 0.03;
    return g;
  }

  _setPorridge(level) {
    this.porridgeLevel = S.clamp(level, 0, 1);
    this.porridge.position.y = 0.014 + 0.016 * this.porridgeLevel;
    this.porridge.scale.setScalar(0.55 + 0.45 * this.porridgeLevel);
    this.porridge.visible = this.porridgeLevel > 0.02;
  }

  /* ------------------------------------------------------------- apple --- */

  _buildApple() {
    const g = new THREE.Group();
    g.name = 'apple';
    const R = 0.034;
    const geo = new THREE.SphereGeometry(1, 72, 48);
    const pos = geo.attributes.position;
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      n.fromBufferAttribute(pos, i).normalize();
      const th = Math.acos(S.clamp(n.y, -1, 1));          // 0 at the stem
      const phi = Math.atan2(n.z, n.x);
      let r = 1;
      r -= 0.30 * Math.exp(-Math.pow(th / 0.40, 2));      // stem well
      r -= 0.14 * Math.exp(-Math.pow((Math.PI - th) / 0.46, 2));  // calyx well
      r *= 1 + 0.030 * Math.cos(5 * phi);                 // five soft lobes
      r *= 1 + 0.035 * Math.sin(th * 2.2);                // wider below the middle
      n.multiplyScalar(r * R);
      n.y *= 1.04;
      pos.setXYZ(i, n.x, n.y, n.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    // red with a sun-blushed yellow cheek and freckles
    S.paintVertexColors(geo, (x, y, z, i, c) => {
      const u = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2);
      const blush = S.smoothstep(0.15, 0.75, Math.cos(Math.atan2(z, x) - 0.7) * 0.5 + 0.5);
      const freckle = TEX.fbm(u * 3, y * 12 + 0.5, 24, 2, 7);
      c.setHex(0xc9202b).lerp(new THREE.Color(0xf2b23a), blush * 0.55);
      c.lerp(new THREE.Color(0xfff2c0), Math.max(0, freckle - 0.62) * 0.7);
      c.multiplyScalar(0.94 + 0.12 * S.smoothstep(-R, R, y));
    });
    this.trash.geo(geo);
    const apple = new THREE.Mesh(geo, this.mat.apple);
    g.add(apple);
    this.apple = apple;

    const stem = new THREE.Mesh(this.trash.geo(S.tube([
      [0, R * 0.62, 0], [0.001, R * 0.85, 0.002], [0.004, R * 1.05, 0.004], [0.008, R * 1.18, 0.004]
    ], 0.0022, 12, 6)), this.mat.woodDark);
    g.add(stem);

    const leafGeo = new THREE.PlaneGeometry(0.016, 0.028, 4, 6);
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i), y = lp.getY(i);
      const w = 1 - Math.pow(Math.abs(y / 0.014), 1.6);
      lp.setX(i, x * Math.max(0.05, w));
      lp.setZ(i, Math.abs(x) * 0.35 + y * 0.12);
    }
    lp.needsUpdate = true;
    leafGeo.computeVertexNormals();
    this.trash.geo(leafGeo);
    const leafMat = this.trash.mat(M.makeCloth({ color: 0x6fae4a, weave: 'plain', repeat: 2, seed: 21 }));
    leafMat.side = THREE.DoubleSide;
    leafMat.sheen = 0.5;
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(0.016, R * 1.10, 0.004);
    leaf.rotation.set(-0.5, 0.4, -0.9);
    g.add(leaf);

    // the core, hidden until the apple has been eaten down
    const core = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, -R * 0.95], [0.008, -R * 0.88], [0.011, -R * 0.5], [0.0075, 0], [0.011, R * 0.5],
      [0.009, R * 0.85], [0.004, R * 0.95], [0, R * 0.96]
    ], 22)), this.trash.mat(M.makePlastic({ color: 0xf6ecd2, matte: 0.55, seed: 63 })));
    core.visible = false;
    g.add(core);
    const coreSkinGeo = this.trash.geo(S.lathe([
      [0.0112, -R * 0.62], [0.0125, -R * 0.3], [0.0125, R * 0.3], [0.0112, R * 0.62]
    ], 22));
    S.paintVertexColors(coreSkinGeo, (x, y, z, i, c) => c.setHex(0xc9202b));
    const coreSkin = new THREE.Mesh(coreSkinGeo, this.mat.apple);
    core.add(coreSkin);
    this.appleCore = core;

    g.userData.rest = R * 0.92;
    g.userData.hit = 0.050;
    this.appleBites = 0;
    return g;
  }

  /* ------------------------------------------------------------ banana --- */

  _buildBanana() {
    const g = new THREE.Group();
    g.name = 'banana';
    const L = 0.105;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -L * 0.5, 0.012),
      new THREE.Vector3(0, -L * 0.2, -0.004),
      new THREE.Vector3(0, L * 0.15, -0.010),
      new THREE.Vector3(0, L * 0.45, -0.002),
      new THREE.Vector3(0, L * 0.52, 0.004)
    ]);
    const segT = 30, segA = 18;
    const radiusAt = t => 0.0125 * (0.35 + 0.65 * Math.sin(Math.pow(S.clamp(t, 0, 1), 0.8) * Math.PI)) + 0.0025;

    // flesh: a lofted tube with a faintly triangular cross-section
    const flesh = this._loftBanana(curve, segT, segA, t => radiusAt(t) * 0.80, 0.10);
    S.paintVertexColors(flesh, (x, y, z, i, c) => {
      c.setHex(0xfff3d2).multiplyScalar(0.96 + 0.06 * Math.sin(y * 60));
    });
    this.trash.geo(flesh);
    const fleshMesh = new THREE.Mesh(flesh, this.mat.banana);
    g.add(fleshMesh);
    this.bananaFlesh = fleshMesh;

    // three peel strips
    this.peels = [];
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2 - 0.03;
      const geo = this._loftBanana(curve, segT, 10, radiusAt, 0.10, a0, a0 + Math.PI * 2 / 3 + 0.06);
      S.paintVertexColors(geo, (x, y, z, i, c) => {
        const t = S.smoothstep(-L * 0.5, L * 0.55, y);
        c.setHex(0xf5cf24).lerp(new THREE.Color(0xd7a412), Math.pow(1 - t, 3) * 0.9);
        c.lerp(new THREE.Color(0xfff0a0), Math.max(0, Math.sin(x * 90) * 0.12));
      });
      this.trash.geo(geo);
      const mesh = new THREE.Mesh(geo, this.mat.peel);
      mesh.material.side = THREE.DoubleSide;
      g.add(mesh);
      this.peels.push({
        mesh, base: S.snapshot(geo), open: 0,
        axis: new THREE.Vector3(
          -Math.sin(a0 + Math.PI / 3), 0, Math.cos(a0 + Math.PI / 3)).normalize()
      });
    }
    this.bananaHinge = new THREE.Vector3(0, L * 0.5, 0.004);

    const tip = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0], [0.004, 0.002], [0.005, 0.010], [0.003, 0.016], [0, 0.018]
    ], 14)), this.mat.woodDark);
    tip.position.set(0, L * 0.50, 0.004);
    g.add(tip);

    this.peelCount = 0;
    this.bananaBites = 0;
    // Lying on its side, not standing on its stem. Built along +Y, so it needs
    // a quarter turn to rest on the tray — without it the banana balanced
    // vertically on a 4 mm tip in the middle of the tray, which is the
    // "levitating banana" every feed frame has carried since pass one.
    g.rotation.set(0, 0.62, Math.PI * 0.5);
    g.userData.rest = 0.017;
    g.userData.hit = 0.055;
    return g;
  }

  /**
   * Loft a tube along `curve` between two angles. Returns a grid geometry so
   * the peel strips can be re-posed vertex by vertex when they flop open.
   */
  _loftBanana(curve, segT, segA, radiusFn, ridge = 0, a0 = 0, a1 = Math.PI * 2) {
    const closed = a1 - a0 >= Math.PI * 1.999;
    const cols = closed ? segA : segA + 1;
    const verts = [], norms = [], uvs = [], idx = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const N = new THREE.Vector3(1, 0, 0), B = new THREE.Vector3();
    for (let i = 0; i <= segT; i++) {
      const t = i / segT;
      curve.getPointAt(t, P);
      curve.getTangentAt(t, T);
      N.set(1, 0, 0).sub(T.clone().multiplyScalar(T.x)).normalize();
      B.crossVectors(T, N).normalize();
      const r = radiusFn(t);
      for (let j = 0; j < cols; j++) {
        const a = a0 + (a1 - a0) * (closed ? j / segA : j / segA);
        // gently triangular section — bananas are not cylinders
        const rr = r * (1 + ridge * Math.cos(3 * a));
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        verts.push(
          P.x + N.x * x + B.x * y,
          P.y + N.y * x + B.y * y,
          P.z + N.z * x + B.z * y);
        const nx = N.x * Math.cos(a) + B.x * Math.sin(a);
        const ny = N.y * Math.cos(a) + B.y * Math.sin(a);
        const nz = N.z * Math.cos(a) + B.z * Math.sin(a);
        norms.push(nx, ny, nz);
        uvs.push(j / (cols - 1 || 1), t);
      }
    }
    for (let i = 0; i < segT; i++) {
      for (let j = 0; j < (closed ? segA : segA); j++) {
        const a = i * cols + j;
        const b = i * cols + ((j + 1) % cols);
        const c = (i + 1) * cols + ((j + 1) % cols);
        const d = (i + 1) * cols + j;
        idx.push(a, b, d, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Re-pose one peel strip: hinged at the stem, curling more towards the tip. */
  _posePeel(p) {
    const geo = p.mesh.geometry;
    const pos = geo.attributes.position;
    const base = p.base;
    const H = this.bananaHinge;
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < pos.count; i++) {
      v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      const s = S.clamp((H.y - v.y) / 0.105, 0, 1);              // 0 at the hinge
      // splayed open and drooping, not flipped over the top
      const ang = p.open * (0.45 + 0.80 * S.smoothstep(0, 0.6, s));
      q.setFromAxisAngle(p.axis, ang);
      v.sub(H).applyQuaternion(q).add(H);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /* ---------------------------------------------------------- rice ball -- */

  _buildRiceball() {
    const g = new THREE.Group();
    g.name = 'riceball';
    const R = 0.030;
    // A rounded disc of revolution whose radius is then modulated by a
    // three-lobed term: closed flat faces, softly rounded edges, and the
    // rounded-triangle silhouette of a hand-pressed onigiri.
    // Monotonic from the centre outwards: a profile that dips back at radius 0
    // puts a dimple in the middle of the face and the lathe fan shades as a star.
    const geo = S.lathe([
      [0, -0.0158], [0.006, -0.0157], [0.012, -0.0155], [0.018, -0.0151],
      [0.0225, -0.0143], [0.0265, -0.0121], [0.0292, -0.0073], [0.0300, -0.0020],
      [0.0300, 0.0020], [0.0292, 0.0073], [0.0265, 0.0121], [0.0225, 0.0143],
      [0.018, 0.0151], [0.012, 0.0155], [0.006, 0.0157], [0, 0.0158]
    ], 52);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const phi = Math.atan2(v.z, v.x);
      const tri = 1 + 0.26 * Math.cos(3 * (phi - Math.PI / 2));
      pos.setXYZ(i, v.x * tri, v.y, v.z * tri);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    // A lathe leaves `segments` coincident vertices at each pole; averaging
    // their normals per-vertex fans a star across the middle of the flat face,
    // so the axial normal is written back by hand.
    const fixPoles = () => {
      const n = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        if (Math.hypot(pos.getX(i), pos.getZ(i)) > 1e-4) continue;
        n.setXYZ(i, 0, Math.sign(pos.getY(i)) || 1, 0);
      }
      n.needsUpdate = true;
    };
    fixPoles();
    // Rice grains ride along the surface normal, and the noise is sampled from
    // the *position*, not the uv — the ring of coincident vertices at each pole
    // carries different uvs, and sampling those tears them apart into a star.
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const w = TEX.worley(0.5 + pos.getX(i) * 7, 0.5 + pos.getZ(i) * 7, 42, 5);
      // Half a millimetre: worley cells have creases along their boundaries, so
      // a deep displacement reads as a golf ball rather than pressed rice. The
      // grain itself comes from the material; this is only the irregularity.
      const rr = Math.hypot(pos.getX(i), pos.getZ(i));
      const bump = Math.pow(1 - w.f1, 2.2) * 0.00055 * S.smoothstep(0.001, 0.010, rr);
      pos.setXYZ(i,
        pos.getX(i) + nrm.getX(i) * bump,
        pos.getY(i) + nrm.getY(i) * bump,
        pos.getZ(i) + nrm.getZ(i) * bump);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    fixPoles();
    geo.rotateX(-Math.PI / 2);         // flat faces now front/back
    S.paintVertexColors(geo, (x, y, z, i, c) => {
      c.setHex(0xfffdf5).multiplyScalar(0.93 + 0.09 * (TEX.fbm(x * 30 + 0.5, y * 30 + 0.5, 20, 2, 3)));
    });
    this.trash.geo(geo);
    const rice = new THREE.Mesh(geo, this.mat.rice);
    g.add(rice);
    this.riceball = rice;

    // Nori: a band lifted off the rice ball's own surface, so it wraps the
    // bottom of the triangle exactly the way a konbini onigiri does instead of
    // sitting on it like a brick.
    const noriGeo = geo.clone();
    noriGeo.scale(1.022, 1.022, 1.06);
    const npos = noriGeo.attributes.position;
    const src = noriGeo.index.array;
    const keep = [];
    const yTop = -R * 0.16;
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      // centroid test, with a gentle wave so the edge reads as torn nori
      const cy = (npos.getY(a) + npos.getY(b) + npos.getY(c)) / 3;
      const cx = (npos.getX(a) + npos.getX(b) + npos.getX(c)) / 3;
      if (cy < yTop + Math.sin(cx * 120) * 0.0010) keep.push(a, b, c);
    }
    noriGeo.setIndex(keep);
    noriGeo.deleteAttribute('color');
    this.trash.geo(noriGeo);
    const nori = new THREE.Mesh(noriGeo, this.mat.nori);
    nori.material.side = THREE.DoubleSide;
    g.add(nori);

    // a stray flake that will end up on the cheek
    const flakeGeo = this.trash.geo(new THREE.PlaneGeometry(0.017, 0.012, 3, 3));
    const fp = flakeGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 120) * 0.0012);
    fp.needsUpdate = true;
    flakeGeo.computeVertexNormals();
    const flake = new THREE.Mesh(flakeGeo, this.mat.nori);
    flake.material.side = THREE.DoubleSide;
    flake.visible = false;
    this.root.add(flake);
    this.noriFlake = flake;

    g.userData.rest = R * 0.55;
    g.userData.hit = 0.048;
    this.riceballBites = 0;
    return g;
  }

  /* ------------------------------------------------------------ cookie --- */

  _buildCookie() {
    const g = new THREE.Group();
    g.name = 'cookie';
    const R = 0.026;
    // A lathe rather than a cylinder: the caps get real radial subdivision, so
    // the crumb surface has somewhere to live and a bite has something to cut.
    const geo = S.lathe([
      [0, -0.0043], [0.006, -0.00425], [0.012, -0.0042], [0.018, -0.0041],
      [0.023, -0.0038], [0.0253, -0.0030], [0.0260, -0.0014],
      [0.0260, 0.0014], [0.0253, 0.0032], [0.023, 0.0042], [0.018, 0.0046],
      [0.012, 0.0048], [0.006, 0.00492], [0, 0.00495]
    ], 56);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.z, v.x);
      const rr = Math.hypot(v.x, v.z);
      // hand-cut wobbly edge
      const wob = 1 + 0.045 * Math.sin(a * 7 + 0.6) + 0.03 * Math.sin(a * 3 - 1.1);
      // crumbly, cratered surface
      const w = TEX.worley((v.x / R) * 0.5 + 0.5, (v.z / R) * 0.5 + 0.5, 11, 13);
      const crumb = (Math.pow(1 - w.f1, 2.4) - 0.32) * 0.0019;
      const fine = (TEX.fbm(v.x * 40 + 0.5, v.z * 40 + 0.5, 24, 2, 29) - 0.5) * 0.0007;
      pos.setXYZ(i, v.x * wob, v.y + Math.sign(v.y || 1) * (crumb + fine), v.z * wob);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    S.paintVertexColors(geo, (x, y, z, i, c) => {
      const bake = TEX.fbm(x * 22 + 0.5, z * 22 + 0.5, 14, 3, 19);
      c.setHex(0xd8a869).lerp(new THREE.Color(0xb07f45), bake * 0.65);
      if (y < 0) c.multiplyScalar(0.9);
    });
    this.trash.geo(geo);
    const cookie = new THREE.Mesh(geo, this.mat.cookie);
    g.add(cookie);
    this.cookie = cookie;

    // chocolate chips, merged so the whole biscuit stays two draw calls
    const chips = [];
    const rand = S.rng(4);
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R * 0.72;
      const s = 0.0035 + rand() * 0.0022;
      const cg = new THREE.SphereGeometry(s, 8, 6);
      const cp = cg.attributes.position;
      for (let k = 0; k < cp.count; k++) {
        cp.setXYZ(k, cp.getX(k) * (0.8 + rand() * 0.5),
          cp.getY(k) * 0.75, cp.getZ(k) * (0.8 + rand() * 0.5));
      }
      cg.computeVertexNormals();
      chips.push([cg, S.xform(
        [Math.cos(a) * rr, (i % 2 ? 1 : -1) * 0.0042, Math.sin(a) * rr],
        [rand(), rand(), rand()])]);
    }
    const chipMesh = new THREE.Mesh(this.trash.geo(S.mergeAll(chips)), this.mat.choc);
    g.add(chipMesh);

    g.rotation.x = -0.06;
    g.userData.rest = 0.006;
    g.userData.hit = 0.046;
    this.cookieBites = 0;
    return g;
  }

  /* ============================================================= enter === */

  async enter() {
    const ctx = this.ctx;
    this._entered = true;

    // Seat the baby. The transform is restored verbatim on exit.
    if (ctx.baby?.group) {
      this._babyHome = {
        pos: ctx.baby.group.position.clone(),
        quat: ctx.baby.group.quaternion.clone()
      };
      this.root.updateWorldMatrix(true, false);
      const seat = this._tmp.set(0, 0.318, 0.005).applyMatrix4(this.root.matrixWorld);
      ctx.baby.group.position.copy(seat);
      ctx.baby.group.quaternion.copy(this.root.quaternion);
    }
    try { ctx.baby?.playPose?.('sit', { seconds: 0.5 }); } catch (e) { /* rig may differ */ }

    // The app snaps the camera the instant enter() returns, so the pivot the
    // framings hang off has to already be on the head the baby *now* has.
    try { ctx.baby?.group?.updateMatrixWorld?.(true); } catch (e) { /* ignore */ }
    this._syncShotPivot();
    this.ctx.cameraRig?.setSubject?.(this.shotPivot);

    S.mood(ctx, 'excited');
    S.babySay(ctx, 'hungry');

    this._setMilk(1);
    this._setPorridge(1);
    this._setPackDent(0);
    this.bibOn = false;
    this.bib.visible = true;

    this._pickRequest();
    this._advise();
    S.play(ctx, 'chime');
    this.clock.after(1.4, () => S.mood(ctx, 'neutral'));
  }

  /* ============================================================== exit === */

  /**
   * Kept synchronous on purpose: app.setActivity() awaits exit() and the
   * screenshot harness drives update() by hand, so an animated exit would
   * simply never advance. Restore state, hand the traces to the shared model,
   * and let the fade live in the camera/lighting transition instead.
   */
  async exit() {
    const ctx = this.ctx;
    this._entered = false;
    ctx.cameraRig?.setSubject?.(null);
    S.hideSay(ctx);
    this.promptTarget = null;
    S.lookAt(ctx, null);
    for (const l of this.labels) S.dropLabel(ctx, l);
    this.labels.length = 0;

    // traces persist across scenes
    S.setDirt(ctx, 'face', this.faceDirt);
    S.setDirt(ctx, 'body', this.bodyDirt);
    try {
      ctx.state?.patch?.({
        dirt: { ...(ctx.state.dirt || {}), face: this.faceDirt, body: this.bodyDirt }
      });
    } catch (e) { /* state may not track dirt yet */ }
    try { ctx.baby?.setOutfit?.({ bib: null }); } catch (e) { /* ignore */ }

    if (this._babyHome && ctx.baby?.group) {
      ctx.baby.group.position.copy(this._babyHome.pos);
      ctx.baby.group.quaternion.copy(this._babyHome.quat);
    }
  }

  dispose() {
    const ctx = this.ctx;
    this.suckLoop?.stop?.();
    this.suckLoop = null;
    for (const l of this.labels) S.dropLabel(ctx, l);
    this.labels.length = 0;
    for (const c of this.crumbs) {
      if (c.body) { try { ctx.physics?.removeBody?.(c.body); } catch (e) { /* gone */ } }
    }
    this.crumbs.length = 0;
    for (const r of this.riceGrains) {
      try { ctx.baby?.detach?.(r.mesh); } catch (e) { /* ignore */ }
      r.mesh.parent?.remove(r.mesh);
    }
    this.riceGrains.length = 0;
    // `detach` unhooks it from the head bone but leaves it parented wherever
    // the rig dropped it — and by then it is no longer under `this.root`, so
    // `trash.flush()` never sees it. That is the whole of the "feed left 2
    // scene nodes behind" warning (N13): the nori flake and its hit proxy.
    try { ctx.baby?.detach?.(this.noriFlake); } catch (e) { /* ignore */ }
    this.noriFlake?.parent?.remove(this.noriFlake);
    this.clock.clear();
    this.trash.flush();
    this.foods = {};
    this.item = null;
    this.held = null;
  }

  /* ============================================================= input === */

  /** The baby is included so rice grains stuck to the cheek stay tappable. */
  _refreshTargets() {
    this.targets = [this.root];
    if (this.ctx.baby?.group) this.targets.push(this.ctx.baby.group);
  }

  /**
   * 手前優先ピック. A real mesh always beats an invisible hit proxy, and the
   * tray counts as background, so tapping a crowded tray picks the thing the
   * child can actually see — while a near miss still lands on the generous
   * proxy instead of doing nothing.
   */
  _pick(p) {
    const hits = this.picker.cast(p, this.targets);
    let best = null;
    for (const h of hits) {
      const node = S.owner(h.object, 'pickId');
      if (!node) continue;
      const id = node.userData.pickId;
      const rank = (h.object.userData?.proxy ? 1 : 0) + (id === 'tray' ? 4 : 0);
      if (!best || rank < best.rank) best = { hit: h, node, id, rank };
      if (best.rank === 0) break;
    }
    return best;
  }

  onPointer(p) {
    if (!this.root || !this._entered) return;
    if (p.type === 'down') this._down(p);
    else if (p.type === 'move') this._move(p);
    else this._up(p);
  }

  _down(p) {
    const ctx = this.ctx;
    const best = this._pick(p);
    const hit = best?.hit || this.picker.first(p, this.targets);
    if (!hit) return;
    const node = best?.node;
    const id = best?.id;

    // Wiping wins over everything — it is the "undo" a child reaches for.
    if (this.wipeOut) { this._wipeAt(p, hit); return; }

    if (id === 'bib' && !this.bibOn) { this._wearBib(); return; }
    if (id === 'wipe') { this._takeWipe(); return; }
    if (id === 'back' && this.phase === 'burp') { this._pat(); return; }
    if (id === 'grain') { this._eatGrain(node); return; }
    if (id === 'nori') { this._takeNori(); return; }

    if (id === 'straw' && !this.strawIn) { this._pierceStraw(); return; }

    if (id === 'spoon') { this._grab(this.spoon, 'spoon', hit.point); return; }

    if (id && FOODS[id]) {
      const group = this.foods[id];
      // leftovers (core / peel / empty pack) are dragged to the bin, not eaten
      if (this.item?.id === id && this.item.state === 'residue') {
        this._grab(group, id, hit.point);
        return;
      }
      if (this.item && this.item.id !== id && this.item.state !== 'idle'
        && this.item.state !== 'gone') return;
      if (id === 'banana' && this.peelCount < 3) {
        this._peelAnchor = { x: p.x, y: p.y };
        S.say(ctx, 'よこに スーッ で かわを むこう', 'hand');
        return;
      }
      if (id === 'porridge') { this._grab(this.spoon, 'spoon', hit.point); return; }
      if (id === 'juice' && !this.strawIn) { this._pierceStraw(); return; }
      this._grab(group, id, hit.point);
      return;
    }

    if (id === 'bin' && this.item?.state === 'residue') { this._binIt(); return; }

    // tapping the baby is always allowed, and always kind
    if (hit.object && this._isBaby(hit.object)) {
      S.mood(ctx, 'giggle');
      S.burst(ctx, 'heart', hit.point, 3);
      S.play(ctx, 'giggle');
    }
  }

  _move(p) {
    const ctx = this.ctx;
    if (this.wipeOut) { this._wipeAt(p, null); return; }

    if (this._peelAnchor && this.peelCount < 3) {
      const dx = p.x - this._peelAnchor.x;
      if (Math.abs(dx) > 44) {
        this._peelAnchor = { x: p.x, y: p.y };
        this._peelOnce();
      }
      return;
    }

    if (!this.held) return;
    const pt = this.picker.onPlane(p, this.dragPlane, this._tmp2);
    if (!pt) return;
    this.held.obj.position.copy(this.root.worldToLocal(pt.add(this.dragOffset)));
    this._clampToStage(this.held.obj.position);
  }

  _up(p) {
    this._peelAnchor = null;
    if (this.wipeOut) { this._stowWipe(); return; }
    if (!this.held) return;
    const held = this.held;
    this.held = null;

    this._mouthLocal(this._tmp);
    const d = held.obj.position.distanceTo(this._tmp);

    if (this.item?.state === 'residueHeld') {
      const toBin = held.obj.position.distanceTo(this.bin.position);
      if (toBin < 0.20) { this._binIt(); }
      else { this.item.state = 'residue'; this.binOpenTarget = 0; this._returnFood(held.kind); }
      return;
    }

    if (held.kind === 'spoon') {
      if (d < MOUTH_REACH + 0.03 && this.spoonScoop.visible) this._feedSpoon();
      else if (this.porridgeLevel > 0.02 && this._overBowl(held.obj.position)) this._scoop();
      else this._returnSpoon();
      return;
    }

    if (d > MOUTH_REACH + 0.045) { this._returnFood(held.kind); return; }
    this._offer(held.kind);
  }

  _isBaby(object3D) {
    const babyRoot = this.ctx.baby?.group;
    if (!babyRoot) return false;
    let o = object3D;
    while (o) { if (o === babyRoot) return true; o = o.parent; }
    return false;
  }

  _grab(obj, kind, worldPoint) {
    this.held = { obj, kind };
    obj.getWorldPosition(this._vLocal);
    this.picker.dragPlane(this._vLocal, this.dragPlane);
    this.dragOffset.copy(this._vLocal).sub(worldPoint || this._vLocal);
    if (kind !== 'spoon') {
      const leftover = this.item?.id === kind &&
        (this.item.state === 'residue' || this.item.state === 'residueHeld');
      this.item = this.item?.id === kind ? this.item : this._newItem(kind);
      this.item.state = leftover ? 'residueHeld' : 'held';
      if (leftover) this.binOpenTarget = 1;
    }
    S.play(this.ctx, 'tap');
    this.hintRing.visible = false;
    this._advise();
  }

  _newItem(id) {
    return { id, food: FOODS[id], obj: this.foods[id], state: 'held', bites: 0, t: 0 };
  }

  _clampToStage(v) {
    v.x = S.clamp(v.x, -0.42, 0.42);
    v.y = S.clamp(v.y, TRAY_Y - 0.02, 0.86);
    v.z = S.clamp(v.z, -0.10, TRAY_Z + 0.24);
  }

  /** Mouth position in rig-local space. `this._mouth` keeps the world one. */
  _mouthLocal(out) {
    this.root.updateWorldMatrix(true, false);
    S.bonePos(this.ctx, 'mouth', this._fallbackMouth(), this._mouth);
    out.copy(this._mouth);
    this.root.worldToLocal(out);
    return out;
  }

  /** Chair-local (0, 0.545, 0.055) if the rig cannot tell us where the mouth is. */
  _fallbackMouth() {
    this.root.updateWorldMatrix(true, false);
    return this._vFall.set(0, 0.545, 0.055).applyMatrix4(this.root.matrixWorld);
  }

  /* ============================================================ actions == */

  _wearBib() {
    const ctx = this.ctx;
    this.bibOn = true;
    const from = this.bib.position.clone();
    S.bonePos(ctx, 'head', this._fallbackMouth(), this._mouth);
    const to = this.root.worldToLocal(this._mouth.clone());
    to.y -= 0.075; to.z += 0.03;
    S.play(ctx, 'whoosh');
    this.clock.tween(0.5, t => {
      this.bib.position.lerpVectors(from, to, t);
      this.bib.rotation.x = 0.25 + t * 0.35;
      this.bib.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.12);
    }, {
      ease: S.EASE.cubicOut,
      onDone: () => {
        this.bib.visible = false;
        try { ctx.baby?.setOutfit?.({ bib: 'star' }); } catch (e) { /* ignore */ }
        S.play(ctx, 'chime');
        S.burst(ctx, 'sparkle', this._mouth, 8);
        S.mood(ctx, 'happy');
        this.clock.after(1.2, () => S.mood(ctx, 'neutral'));
        this._advise();
      }
    });
  }

  _takeWipe() {
    this.wipeOut = true;
    this.wipeCloth.visible = true;
    this.wipeRoll.visible = false;
    S.play(this.ctx, 'tap');
    S.say(this.ctx, 'おくちを ふきふき', 'hand');
  }

  _stowWipe() {
    this.wipeOut = false;
    this.wipeCloth.visible = false;
    this.wipeRoll.visible = true;
    this._advise();
  }

  _wipeAt(p, hit) {
    const ctx = this.ctx;
    const plane = this._wipePlane();
    const pt = this.picker.onPlane(p, plane, this._tmp2);
    if (pt) {
      this.root.updateWorldMatrix(true, false);
      this.wipeCloth.position.copy(this.root.worldToLocal(pt));
      const pin = this.wipeSim;
      if (pin?.mini) {
        pin.mini.setPin(0, new THREE.Vector3(-0.05, 0.05, 0));
        pin.mini.setPin(5, new THREE.Vector3(0.05, 0.05, 0));
      }
    }
    if (this._wipeCooldown > 0) return;
    this._mouthLocal(this._tmp);
    if (this.wipeCloth.position.distanceTo(this._tmp) > 0.10) return;
    this._wipeCooldown = 0.22;

    const before = this.faceDirt;
    this.faceDirt = Math.max(0, this.faceDirt - 0.22);
    S.setDirt(ctx, 'face', this.faceDirt);
    S.play(ctx, 'wipe');
    S.burst(ctx, 'sparkle', this._mouth, 3);
    if (this.riceGrains.length) this._eatGrain(null, true);
    if (before > 0.02 && this.faceDirt <= 0.02) {
      S.mood(ctx, 'shy');
      S.play(ctx, 'chime');
      S.burst(ctx, 'star', this._mouth, 8);
      S.award(ctx, 1);
      S.bumpMeter(ctx, 'clean', 0.08);
      this.clock.after(1.2, () => S.mood(ctx, 'neutral'));
    }
  }

  _wipePlane() {
    S.bonePos(this.ctx, 'mouth', this._fallbackMouth(), this._mouth);
    return this.picker.dragPlane(this._mouth, this._plane);
  }

  _pierceStraw() {
    const ctx = this.ctx;
    if (this.strawIn) return;
    this.strawIn = true;
    const from = this.straw.position.clone();
    const fromRot = this.straw.rotation.z;
    S.play(ctx, 'strawStab');
    this.clock.tween(0.32, t => {
      this.straw.position.lerpVectors(from, this._tmp.set(0.015, 0.030, 0), t);
      this.straw.rotation.z = S.lerp(fromRot, -0.10, t);
    }, {
      ease: S.EASE.back,
      onDone: () => {
        S.burst(ctx, 'sparkle', this.straw.getWorldPosition(new THREE.Vector3()), 5);
        S.play(ctx, 'pop');
        this.packFoil.scale.setScalar(0.75);
        this._advise();
      }
    });
  }

  _peelOnce() {
    const ctx = this.ctx;
    if (this.peelCount >= 3) return;
    const p = this.peels[this.peelCount];
    this.peelCount++;
    S.play(ctx, 'peel');
    this.clock.tween(0.45, t => { p.open = t; this._posePeel(p); }, {
      ease: S.EASE.cubicOut,
      onDone: () => {
        if (this.peelCount >= 3) {
          S.play(ctx, 'chime');
          S.burst(ctx, 'sparkle', this.foods.banana.getWorldPosition(new THREE.Vector3()), 8);
          S.mood(ctx, 'excited');
          this.clock.after(1.1, () => S.mood(ctx, 'neutral'));
        }
        this._advise();
      }
    });
    S.burst(ctx, 'sparkle', this.foods.banana.getWorldPosition(new THREE.Vector3()), 3);
  }

  /* ------------------------------------------------------------ eating -- */

  _offer(id) {
    const ctx = this.ctx;
    const food = FOODS[id];

    if (S.meter(ctx, 'food') >= 0.96) { this._refuse(id); return; }
    if (id === 'banana' && this.peelCount < 3) { this._refuse(id, 'peel'); return; }
    if (id === 'juice' && !this.strawIn) { this._refuse(id, 'straw'); return; }

    this.item = this.item?.id === id ? this.item : this._newItem(id);
    if (food.kind === 'suck') this._startSuck();
    else this._startBite();
  }

  _refuse(id, why) {
    const ctx = this.ctx;
    S.play(ctx, 'refuse');
    S.mood(ctx, why ? 'surprised' : 'sulk');
    S.gesture(ctx, why ? ['point'] : ['shiver', 'point']);
    if (!why) S.babySay(ctx, 'full');
    S.say(ctx, why === 'peel' ? 'かわを むいてね'
      : why === 'straw' ? 'ストローを さしてね'
        : 'おなか いっぱい みたい', why ? 'hand' : 'heart');
    this._returnFood(id);
    this.clock.after(1.6, () => { S.mood(ctx, 'neutral'); this._advise(); });
  }

  _returnFood(id) {
    const obj = this.foods[id];
    const from = obj.position.clone();
    const fromQ = obj.quaternion.clone();
    S.play(this.ctx, 'boing');
    this.clock.tween(0.42, t => {
      obj.position.lerpVectors(from, obj.userData.slot, t);
      obj.quaternion.slerpQuaternions(fromQ, obj.userData.homeQuat, t);
      obj.position.y += Math.sin(t * Math.PI) * 0.03;
    }, {
      ease: S.EASE.cubicOut,
      onDone: () => {
        if (this.item?.id === id && this.item.state === 'held') this.item.state = 'idle';
        this._advise();
      }
    });
  }

  _startBite() {
    const it = this.item;
    it.state = 'eating';
    it.t = 0.18;
    S.mood(this.ctx, 'yum');
    S.lookAt(this.ctx, null);
  }

  _doBite() {
    const ctx = this.ctx;
    const it = this.item;
    it.bites++;
    S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);

    // Carve a real crescent out of the mesh. The bite sphere sits just outside
    // the surface on the side facing the mouth, so every vertex it swallows is
    // pushed onto its shell — a genuine scooped-out bite, teeth marks and all.
    this._carveOnly(it.id, it.bites);

    S.play(ctx, it.id === 'cookie' ? 'crunch' : 'munch');
    try { ctx.baby?.gesture?.('suck'); } catch (e) { /* rig may differ */ }
    S.burst(ctx, 'crumb', this._mouth, it.food.crumbs ? 10 : 4);
    S.mood(ctx, 'yum');

    if (it.food.crumbs) { this._dropCrumbs(3); this._soil(0.10, 0.09); }
    else if (it.id === 'riceball') { this._riceOnFace(); this._soil(0.10, 0.05); }
    else this._soil(0.07, 0.04);

    if (it.bites >= it.food.bites) this._finishSolid();
  }

  _finishSolid() {
    const ctx = this.ctx;
    const it = this.item;
    const obj = it.obj;

    if (it.id === 'apple') {
      this.apple.visible = false;
      this.appleCore.visible = true;
      S.burst(ctx, 'sparkle', obj.getWorldPosition(new THREE.Vector3()), 6);
      it.state = 'residue';
      this._toTray(obj);
      this._askForBin();
    } else if (it.id === 'banana') {
      this.bananaFlesh.visible = false;
      it.state = 'residue';
      this._toTray(obj);
      this._askForBin();
    } else {
      it.state = 'gone';
      const from = obj.scale.clone();
      this.clock.tween(0.3, t => obj.scale.copy(from).multiplyScalar(1 - t), {
        onDone: () => { obj.visible = false; }
      });
    }
    this._reward(it.id);
  }

  _toTray(obj) {
    const from = obj.position.clone();
    const to = obj.userData.slot.clone();
    to.y += 0.01;
    this.clock.tween(0.5, t => {
      obj.position.lerpVectors(from, to, t);
      obj.position.y += Math.sin(t * Math.PI) * 0.05;
      obj.rotation.z += 0.06;
    }, { ease: S.EASE.cubicOut });
  }

  _askForBin() {
    S.say(this.ctx, 'ゴミばこに ポイ してね', 'hand');
    this.hintRing.visible = true;
    this.hintRing.position.copy(this.bin.position).add(new THREE.Vector3(0, 0.16, 0));
    S.gesture(this.ctx, ['point']);
    this.bin.getWorldPosition(this._tmp);
    S.lookAt(this.ctx, this._tmp);
  }

  _binIt() {
    const ctx = this.ctx;
    const it = this.item;
    if (!it) return;
    const obj = it.obj;
    const from = obj.position.clone();
    const to = this.bin.position.clone().add(new THREE.Vector3(0, 0.20, 0));
    this.binOpenTarget = 1;
    S.play(ctx, 'whoosh');
    this.clock.tween(0.55, t => {
      obj.position.lerpVectors(from, to, t);
      obj.position.y += Math.sin(t * Math.PI) * 0.09;
      obj.rotation.x += 0.12;
      if (t > 0.8) obj.scale.setScalar(1 - (t - 0.8) * 4.5);
    }, {
      ease: S.EASE.inOut,
      onDone: () => {
        obj.visible = false;
        obj.scale.setScalar(1);
        this.binOpenTarget = 0;
        this.hintRing.visible = false;
        S.play(ctx, 'trash');
        S.play(ctx, 'tada');
        S.burst(ctx, 'star', this.bin.getWorldPosition(new THREE.Vector3()).setY(0.28), 10);
        S.mood(ctx, 'happy');
        S.gesture(ctx, ['clap']);
        S.award(ctx, 1);
        S.say(ctx, 'ポイ できたね！ えらい！', 'star');
        it.state = 'gone';
        this.clock.after(1.6, () => { S.mood(ctx, 'neutral'); this._advise(); });
      }
    });
  }

  /* ------------------------------------------------------------ sucking -- */

  _startSuck() {
    const ctx = this.ctx;
    const it = this.item;
    it.state = 'sucking';
    it.t = 0;
    it.total = it.food.seconds;
    it.gulp = 0.5;
    this.phase = 'suck';
    S.mood(ctx, 'yum');
    try { ctx.baby?.gesture?.('suck'); } catch (e) { /* rig may differ */ }
    this.suckLoop = S.loop(ctx, 'suck', { gain: 0.5 });
  }

  /**
   * Park the bottle with its *teat* at the mouth.
   *
   * The teat is the top of the lathe, 0.192 m from the group origin. Placing
   * that origin near the mouth — which is what this did for two review passes
   * — therefore hangs the teat a hand's width *above* the lips and stands the
   * whole 20 cm body across the face, occluding an eye from every angle. Aim
   * the bottle's own axis at the mouth instead and the body hangs back under
   * the chin, where a baby actually holds it and where it cannot cover
   * anything that matters.
   *
   * `k` (0..1 drained) tips it gradually, the way a real bottle is raised as
   * it empties. `_setMilk` keeps the surface world-horizontal through it.
   */
  _seatBottle(k, snap = true, dt = 0) {
    const obj = this.foods.bottle;
    if (!obj) return;
    this._mouthLocal(this._tmp);
    // Leaning forward as well as down: hung straight below the chin the body
    // ends up inside the chest, and the shot's whole brief is the glass and
    // the milk level. 0.10 m of forward offset puts it clear of the shirt.
    const dir = this._vFall.set(0.34, 0.78 - 0.10 * k, -0.52 + 0.10 * k).normalize();
    obj.quaternion.setFromUnitVectors(_UP, dir);
    this._tmp2.copy(this._tmp).addScaledVector(dir, -BOTTLE_TEAT);
    if (snap) obj.position.copy(this._tmp2);
    else obj.position.lerp(this._tmp2, Math.min(1, dt * 10));
  }

  _updateSuck(dt) {
    const ctx = this.ctx;
    const it = this.item;
    // A harness-staged pose holds its progress: the shot list warms the clock
    // for a few seconds, and a bottle that kept draining would be empty by the
    // time the frame is taken.
    if (!it.frozen) it.t += dt;
    const k = S.clamp(it.t / it.total, 0, 1);

    // lock the vessel to the mouth
    this._mouthLocal(this._tmp);
    const obj = it.obj;
    if (it.id === 'bottle') {
      this._seatBottle(k, false, dt);
      this._setMilk(1 - k);
      this._pumpBubbles(dt, k);
    } else {
      obj.position.lerp(this._tmp2.copy(this._tmp).add(
        new THREE.Vector3(0.008, -0.062, 0.055)), Math.min(1, dt * 10));
      obj.rotation.set(-0.12, 0, 0.06);
      this._setPackDent(k);
    }

    if (it.frozen) return;

    it.gulp -= dt;
    if (it.gulp <= 0) {
      it.gulp = 0.55;
      S.play(ctx, it.id === 'bottle' ? 'suck' : 'gulp');
      try { ctx.baby?.gesture?.('suck'); } catch (e) { /* rig may differ */ }
      if (this._rand() < 0.3) this._soil(0.06, 0.08);
      S.bumpMeter(ctx, 'food', 0.03);
    }

    if (k >= 1) {
      this.suckLoop?.stop?.();
      this.suckLoop = null;
      if (it.id === 'bottle') this._finishBottle();
      else this._finishJuice();
    }
  }

  _pumpBubbles(dt, k) {
    const surface = this.milkBottomY + 0.088 * (1 - k);
    let any = false;
    for (const b of this.bubbleState) {
      if (b.s <= 0) {
        if (this._rand() < dt * 4.5) {
          const a = this._rand() * Math.PI * 2, r = this._rand() * 0.020;
          b.x = Math.cos(a) * r; b.z = Math.sin(a) * r;
          b.y = this.milkBottomY + 0.004;
          b.s = 0.5 + this._rand() * 0.8;
          b.v = 0.035 + this._rand() * 0.05;
        }
        continue;
      }
      any = true;
      b.y += b.v * dt;
      b.s *= 1 + dt * 0.4;
      if (b.y > surface - 0.004) {
        b.s = 0;
        b.y = -1;
      }
    }
    this.bubbles.visible = any;
    this._syncBubbles();
  }

  _finishBottle() {
    const ctx = this.ctx;
    const it = this.item;
    it.state = 'done';                  // stop _updateSuck re-entering
    S.play(ctx, 'puha');
    S.mood(ctx, 'happy');
    S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);
    S.burst(ctx, 'steam', this._mouth, 3);
    this.bubbles.visible = false;
    this._reward('bottle');
    this._returnFood('bottle');
    this.clock.after(0.5, () => {
      this.phase = 'burp';
      this.burpTaps = 0;
      S.say(ctx, 'せなかを とんとん してあげてね', 'hand');
      S.mood(ctx, 'neutral');
      this.hintRing.visible = true;
      S.gesture(ctx, ['point']);
      this._patLabel = S.worldLabel(ctx, this.patTarget, 'とんとん', { icon: 'hand' });
      if (this._patLabel) this.labels.push(this._patLabel);
    });
  }

  _pat() {
    const ctx = this.ctx;
    if (this.patCooldown > 0) return;
    this.patCooldown = 0.24;
    this.burpTaps++;
    S.play(ctx, 'pat');
    this.patTarget.getWorldPosition(this._tmp);
    S.burst(ctx, 'sparkle', this._tmp, 2);
    try { ctx.baby?.gesture?.('kick'); } catch (e) { /* rig may differ */ }
    if (this.burpTaps >= 4) this._burp();
  }

  _burp() {
    const ctx = this.ctx;
    this.phase = '';
    this.hintRing.visible = false;
    if (this._patLabel) { S.dropLabel(ctx, this._patLabel); this._patLabel = null; }
    S.play(ctx, 'burp');
    S.gesture(ctx, ['burp']);
    S.mood(ctx, 'surprised');
    S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);
    S.burst(ctx, 'steam', this._mouth, 6);
    S.burst(ctx, 'star', this._mouth, 6);
    S.award(ctx, 1);
    S.bumpMeter(ctx, 'happy', 0.08);
    this.clock.after(0.7, () => {
      S.mood(ctx, 'giggle');
      S.play(ctx, 'giggle');
      this.clock.after(1.3, () => { S.mood(ctx, 'neutral'); this._advise(); });
    });
  }

  _finishJuice() {
    const ctx = this.ctx;
    this.item.state = 'done';           // stop _updateSuck re-entering
    S.play(ctx, 'slurp');
    S.mood(ctx, 'surprised');
    this._setPackDent(1);
    this.clock.after(0.75, () => {
      if (!this.item) return;
      this.item.state = 'residue';
      this._toTray(this.foods.juice);
      this._reward('juice');
      this._askForBin();
    });
  }

  /* -------------------------------------------------------------- spoon -- */

  _overBowl(local) {
    const bowl = this.foods.porridge.position;
    return Math.hypot(local.x - bowl.x, local.z - bowl.z) < 0.075;
  }

  _scoop() {
    const ctx = this.ctx;
    if (this.porridgeLevel <= 0.02) { this._returnSpoon(); return; }
    this.spoonScoop.visible = true;
    S.play(ctx, 'pour');
    S.burst(ctx, 'splash', this.spoon.getWorldPosition(new THREE.Vector3()), 3);
    S.say(ctx, 'おくちへ どうぞ', 'hand');
    this.item = this._newItem('porridge');
    this.item.state = 'held';
  }

  _feedSpoon() {
    const ctx = this.ctx;
    this.spoonScoop.visible = false;
    this._setPorridge(this.porridgeLevel - 1 / FOODS.porridge.spoons);
    S.play(ctx, 'munch');
    S.mood(ctx, 'yum');
    S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);
    // a little dribble down the chin
    const to = this._mouth.clone().add(new THREE.Vector3(0, -0.045, 0.01));
    S.ribbon(ctx, this._mouth.clone(), to, { color: 0xf6e7c8, width: 0.008, seconds: 0.6 });
    S.burst(ctx, 'crumb', this._mouth, 3);
    this._soil(0.12, 0.07);
    S.bumpMeter(ctx, 'food', 0.06);
    this._returnSpoon();
    if (this.porridgeLevel <= 0.02) this._reward('porridge');
    else this.clock.after(0.6, () => this._advise());
  }

  _returnSpoon() {
    const from = this.spoon.position.clone();
    const fromQ = this.spoon.quaternion.clone();
    this.clock.tween(0.4, t => {
      this.spoon.position.lerpVectors(from, this.spoonHome.pos, t);
      this.spoon.quaternion.slerpQuaternions(fromQ, this.spoonHome.quat, t);
    }, { ease: S.EASE.cubicOut });
  }

  /* -------------------------------------------------- traces & rewards --- */

  /** Food goes somewhere. With a bib it lands on the bib, without it, on you. */
  _soil(faceAmount, bodyAmount) {
    const ctx = this.ctx;
    this.faceDirt = S.clamp(this.faceDirt + faceAmount, 0, 1);
    S.setDirt(ctx, 'face', this.faceDirt);
    if (this.bibOn) {
      if (this._rand() < 0.45) {
        S.decal(ctx, 'stain', this.tray, this._trayUV(this._rand(), this._rand()),
          { size: 0.05, color: 0xc98b4a, opacity: 0.5 });
      }
      return;
    }
    this.bodyDirt = S.clamp(this.bodyDirt + bodyAmount, 0, 1);
    S.setDirt(ctx, 'body', this.bodyDirt);
    if (this.bodyDirt > 0.3 && !this._toldAboutClothes) {
      this._toldAboutClothes = true;
      S.toast(ctx, 'おふくが よごれちゃった', { icon: 'shirt', seconds: 2.4 });
    }
  }

  _trayUV(u, v) {
    return new THREE.Vector2(S.clamp(u, 0.05, 0.95), S.clamp(v, 0.05, 0.95));
  }

  _dropCrumbs(n) {
    const ctx = this.ctx;
    S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);
    for (let i = 0; i < n && this.crumbs.length < 14; i++) {
      const g = new THREE.SphereGeometry(0.0022 + this._rand() * 0.0026, 6, 5);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        p.setXYZ(k, p.getX(k) * (0.7 + this._rand() * 0.7),
          p.getY(k) * (0.6 + this._rand() * 0.5), p.getZ(k) * (0.7 + this._rand() * 0.7));
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(this.trash.geo(g), this.mat.crumb);
      m.castShadow = true;
      m.position.copy(this.root.worldToLocal(this._mouth.clone()));
      m.position.x += (this._rand() - 0.5) * 0.05;
      m.position.z += 0.01 + this._rand() * 0.02;
      this.root.add(m);
      // Crumbs stay in the rig's own frame — a solver body would be simulated
      // in world space and the tray would no longer catch them.
      this.crumbs.push({
        mesh: m, vy: 0, vx: (this._rand() - 0.5) * 0.12,
        vz: this._rand() * 0.12, body: null, rest: false
      });
      this.trash.obj(m);
    }
  }

  _riceOnFace() {
    const ctx = this.ctx;
    for (let i = 0; i < 2 && this.riceGrains.length < 7; i++) {
      const g = new THREE.SphereGeometry(0.0028, 8, 6);
      g.scale(1, 0.62, 0.68);
      const m = new THREE.Mesh(this.trash.geo(g), this.mat.rice);
      m.castShadow = true;
      m.userData.pickId = 'grain';
      m.add(S.hitProxy(0.022, 'grain-hit'));
      const a = (this._rand() - 0.5) * 1.5;
      const off = new THREE.Vector3(Math.sin(a) * 0.026, -0.008 - this._rand() * 0.016,
        0.028 + this._rand() * 0.004);
      let attached = false;
      try {
        if (ctx.baby?.attach) { ctx.baby.attach(m, 'head'); attached = true; }
      } catch (e) { attached = false; }
      if (attached) {
        m.position.copy(off);
      } else {
        this.root.add(m);
        S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);
        m.position.copy(this.root.worldToLocal(this._mouth.clone())).add(off);
      }
      m.rotation.set(this._rand(), this._rand(), this._rand());
      this.riceGrains.push({ mesh: m, attached });
      this.trash.obj(m);
    }
    if (!this.noriFlake.visible && this._rand() < 0.75) {
      this.noriFlake.visible = true;
      this.noriFlake.userData.pickId = 'nori';
      if (!this.noriFlake.children.length) this.noriFlake.add(S.hitProxy(0.03, 'nori-hit'));
      let ok = false;
      try { if (ctx.baby?.attach) { ctx.baby.attach(this.noriFlake, 'head'); ok = true; } } catch (e) { ok = false; }
      if (ok) {
        this.noriFlake.position.set(0.030, -0.004, 0.024);
        this.noriFlake.rotation.set(0.1, -0.65, 0.35);
      } else {
        S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);
        this.noriFlake.position.copy(this.root.worldToLocal(this._mouth.clone()))
          .add(new THREE.Vector3(0.032, 0.012, 0.026));
        this.noriFlake.rotation.set(0.1, -0.6, 0.35);
      }
    }
  }

  _eatGrain(node, silent = false) {
    const ctx = this.ctx;
    const i = node ? this.riceGrains.findIndex(r => r.mesh === node) : this.riceGrains.length - 1;
    if (i < 0) return;
    const r = this.riceGrains.splice(i, 1)[0];
    r.mesh.getWorldPosition(this._tmp);
    try { ctx.baby?.detach?.(r.mesh); } catch (e) { /* ignore */ }
    r.mesh.parent?.remove(r.mesh);
    if (!silent) {
      S.play(ctx, 'munch');
      S.play(ctx, 'giggle');
      S.burst(ctx, 'heart', this._tmp, 2);
      S.mood(ctx, 'giggle');
      this.clock.after(0.9, () => S.mood(ctx, 'neutral'));
    } else {
      S.burst(ctx, 'sparkle', this._tmp, 2);
    }
  }

  _takeNori() {
    const ctx = this.ctx;
    this.noriFlake.getWorldPosition(this._tmp);
    try { ctx.baby?.detach?.(this.noriFlake); } catch (e) { /* ignore */ }
    this.noriFlake.visible = false;
    this.noriFlake.userData.pickId = undefined;
    S.play(ctx, 'pop');
    S.play(ctx, 'giggle');
    S.mood(ctx, 'giggle');
    S.burst(ctx, 'sparkle', this._tmp, 4);
    this.clock.after(1.0, () => S.mood(ctx, 'neutral'));
  }

  _reward(id) {
    const ctx = this.ctx;
    const matched = this.request === id;
    S.bonePos(ctx, 'mouth', this._fallbackMouth(), this._mouth);
    S.mood(ctx, 'happy');
    S.play(ctx, 'happy');
    S.burst(ctx, 'heart', this._mouth, matched ? 10 : 5);
    S.bumpMeter(ctx, 'food', 0.20);
    S.bumpMeter(ctx, 'happy', 0.05);
    if (matched) {
      S.burst(ctx, 'confetti', this._mouth, 14);
      S.play(ctx, 'tada');
      S.award(ctx, 2);
    } else {
      S.award(ctx, 1);
    }
    this.clock.after(1.4, () => {
      S.mood(ctx, 'neutral');
      this._pickRequest();
      this._advise();
    });
  }

  _pickRequest() {
    const avail = FOOD_IDS.filter(id => this.foods[id]?.visible !== false);
    this.request = avail.length ? avail[Math.floor(this._rand() * avail.length)] : null;
    if (!this.request) return;
    S.babySay(this.ctx, 'hungry');
    S.gesture(this.ctx, ['point']);
  }

  /* ---------------------------------------------------------- guidance --- */

  /**
   * A prompt is a promise that the thing it names is on screen and can be
   * tapped right now. `promptTarget` is what UI#prompt reads to aim its arrow,
   * and UI#prompt drops any prompt whose target is off-screen or hidden — so
   * every branch here has to hand over the *actual* object it is talking
   * about, and a branch with nothing to point at has to say something that
   * names no object at all.
   */
  _advise() {
    const ctx = this.ctx;
    if (!this._entered) return;

    const step = this._adviseStep();
    // Handed over explicitly rather than left for the HUD to read off
    // `activity.promptTarget`: app.setActivity only publishes `app.activity`
    // *after* enter() returns, so the first prompt of the scene would
    // otherwise be the one prompt in the game with no target.
    this.promptTarget = step.target || null;
    try {
      ctx.ui?.prompt?.(step.text, { icon: step.icon, target: step.target || null });
    } catch (e) { /* the HUD is optional */ }

    if (step.ring) {
      this.hintRing.visible = true;
      this.hintRing.position.copy(step.ring);
      this.hintRing.position.y = TRAY_Y + 0.014;
    } else {
      this.hintRing.visible = false;
    }
  }

  /** The one thing the child should do next, and the object it lives on. */
  _adviseStep() {
    if (this.phase === 'burp') {
      return { text: 'せなかを とんとん', icon: 'hand', target: this.patTarget };
    }
    if (this.item?.state === 'residue') {
      const obj = this.foods[this.item.id];
      return { text: 'ゴミばこに ポイ してね', icon: 'hand', target: this.bin, ring: obj?.position };
    }
    if (!this.bibOn && this.bib?.visible) {
      return {
        text: 'まずは スタイを つけよう', icon: 'hand', target: this.bib,
        ring: this._tmp.set(this.bib.position.x, 0, this.bib.position.z)
      };
    }
    // Mid-meal: the food is already at the mouth, so the thing to name is the
    // food, not a bib that is on and no longer tappable.
    const held = this.item && this.foods[this.item.id];
    if (held?.visible !== false && (this.item?.state === 'sucking' || this.item?.state === 'eating')) {
      const kind = FOODS[this.item.id]?.kind;
      return {
        text: kind === 'suck' ? 'ごくごく…おいしいね' : 'もぐもぐ、おいしいね',
        icon: 'heart', target: held
      };
    }
    if (this.faceDirt > 0.45 && this.wipeRoll?.visible !== false) {
      return { text: 'おしぼりで おかおを ふこう', icon: 'hand', target: this.wipeRoll, ring: this.wipeRoll.position };
    }
    const want = this.request && this.foods[this.request];
    if (want && want.visible !== false) {
      return {
        text: 'たべものを もっていって「あーん」', icon: 'heart',
        target: want, ring: want.position
      };
    }
    // Nothing specific is tappable — so name nothing specific.
    return { text: 'ゆっくり たべようね', icon: 'heart', target: null };
  }

  /* ============================================================= frame === */

  update(dt) {
    if (!this.root) return;
    this.time += dt;
    this.clock.update(dt);
    this.patCooldown = Math.max(0, this.patCooldown - dt);
    this._wipeCooldown = Math.max(0, this._wipeCooldown - dt);
    this._syncShotPivot();

    // the baby's eyes follow whatever is being carried
    if (this.held) {
      this.held.obj.getWorldPosition(this._tmp);
      S.lookAt(this.ctx, this._tmp);
      this._mouthLocal(this._tmp2);
      const d = this.held.obj.position.distanceTo(this._tmp2);
      const near = d < AAN_REACH && S.meter(this.ctx, 'food') < 0.96;
      if (near !== this._aan) {
        this._aan = near;
        if (near) {
          S.mood(this.ctx, 'yum');
          this._aanLabel = S.worldLabel(this.ctx, this.held.obj, 'あーん', { icon: 'mouth' });
          if (this._aanLabel) this.labels.push(this._aanLabel);
          S.play(this.ctx, 'boing', { gain: 0.3 });
        } else {
          S.mood(this.ctx, 'neutral');
          if (this._aanLabel) { S.dropLabel(this.ctx, this._aanLabel); this._aanLabel = null; }
        }
      }
    } else if (this._aan) {
      this._aan = false;
      if (this._aanLabel) { S.dropLabel(this.ctx, this._aanLabel); this._aanLabel = null; }
    }

    const it = this.item;
    if (it) {
      if (it.state === 'eating') {
        this._mouthLocal(this._tmp);
        this._tmp.y -= 0.012; this._tmp.z += 0.045;
        it.obj.position.lerp(this._tmp, Math.min(1, dt * 9));
        it.t -= dt;
        if (it.t <= 0 && it.state === 'eating') { it.t = 0.6; this._doBite(); }
      } else if (it.state === 'sucking') {
        this._updateSuck(dt);
      }
    }

    // pat target rides the baby's back
    if (this.phase === 'burp') {
      this._vFall.set(0, 0.48, -0.06).applyMatrix4(this.root.matrixWorld);
      S.bonePos(this.ctx, 'back', this._vFall, this._tmp);
      this._tmp.y -= 0.02;
      this.patTarget.position.copy(this.root.worldToLocal(this._tmp));
      this.hintRing.position.copy(this.patTarget.position);
      this.hintRing.position.y -= 0.02;
    }

    // bin lid
    const want = this.binOpenTarget || 0;
    this.binOpen += (want - this.binOpen) * Math.min(1, dt * 8);
    this.binLid.rotation.x = -this.binOpen * 1.15;

    // gentle idle life on the props
    if (this.hintRing.visible) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 4.2);
      this.hintRing.scale.setScalar(0.9 + p * 0.22);
      this.mat.hint.opacity = 0.28 + p * 0.34;
    }
    if (this.bib.visible) this.bib.rotation.z = Math.sin(this.time * 1.6) * 0.05;

    // cloth
    this.bibCloth?.update(dt);
    if (this.wipeOut) this.wipeSim?.update(dt);

    // crumbs that the engine solver is not carrying
    for (const c of this.crumbs) {
      if (c.body || c.rest) continue;
      c.vy -= 2.6 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      const floor = TRAY_Y + 0.004;
      if (c.mesh.position.y <= floor) {
        c.mesh.position.y = floor;
        c.rest = true;
        this._crumbLanded(c);
      }
    }

    // rice grains that could not be attached to the rig follow the mouth
    if (this.riceGrains.length) {
      let any = false;
      for (const r of this.riceGrains) if (!r.attached) { any = true; break; }
      if (any) {
        S.bonePos(this.ctx, 'mouth', this._fallbackMouth(), this._tmp);
        this.root.worldToLocal(this._tmp);
        for (const r of this.riceGrains) {
          if (r.attached) continue;
          if (!r.offset) r.offset = r.mesh.position.clone().sub(this._tmp);
          r.mesh.position.copy(this._tmp).add(r.offset);
        }
      }
    }

  }

  _crumbLanded(c) {
    const local = c.mesh.position;
    const u = S.clamp((local.x + TRAY_W / 2) / TRAY_W, 0.03, 0.97);
    const v = S.clamp((local.z - TRAY_Z + TRAY_D / 2) / TRAY_D, 0.03, 0.97);
    S.decal(this.ctx, 'crumb', this.tray, new THREE.Vector2(u, v),
      { size: 0.03, color: 0xb07f45, opacity: 0.45 });
  }

  /* ======================================================== harness API == */

  /**
   * Harness patches: { food, progress, messy }.
   *   food     — 'bottle'|'juice'|'porridge'|'apple'|'banana'|'riceball'|'cookie'
   *   progress — 0..1 through that food's own process
   *   messy    — true to apply the full set of traces
   * Anything else in the patch is ignored so the room/baby can share it.
   */
  onState(patch) {
    if (!patch || !this.root) return;
    if (patch.bib !== undefined && patch.bib && !this.bibOn) {
      this.bibOn = true;
      this.bib.visible = false;
      try { this.ctx.baby?.setOutfit?.({ bib: 'star' }); } catch (e) { /* ignore */ }
    }
    if (patch.food) this._stageFood(patch.food, patch.progress ?? 0.5);
    else if (patch.progress !== undefined && this.item) this._stageFood(this.item.id, patch.progress);
    if (patch.messy !== undefined) this._stageMess(!!patch.messy);
  }

  _stageFood(id, progress) {
    if (!FOODS[id]) return;
    const ctx = this.ctx;
    const k = S.clamp(progress, 0, 1);
    this.clock.clear();
    this.held = null;
    this.phase = '';
    this.hintRing.visible = false;

    // reset every food to its slot first so shots never inherit each other
    for (const fid of FOOD_IDS) {
      const g = this.foods[fid];
      g.visible = true;
      g.position.copy(g.userData.slot);
      g.quaternion.copy(g.userData.homeQuat);
      g.scale.setScalar(1);
    }
    this._resetCarve();
    this.spoon.position.copy(this.spoonHome.pos);
    this.spoon.quaternion.copy(this.spoonHome.quat);
    this.spoonScoop.visible = false;
    this.bubbles.visible = false;
    for (const b of this.bubbleState) { b.s = 0; b.y = -1; }
    this._syncBubbles();
    // Staging *is* mid-meal, whatever the progress value: the bib went on
    // before the first mouthful. Leaving it hanging on the tray rim put a
    // 30 cm pink collar across the near side of every three-quarter framing,
    // and left the guidance stuck on "put the bib on" over a baby two bites
    // into an apple.
    this.bibOn = true;
    this.bib.visible = false;
    try { ctx.baby?.setOutfit?.({ bib: 'star' }); } catch (e) { /* ignore */ }
    this.item = this._newItem(id);
    this.item.frozen = true;          // hold the pose through the harness warm
    this.request = id;

    this._mouthLocal(this._tmp);
    const obj = this.foods[id];
    const food = FOODS[id];

    if (id === 'bottle') {
      this._seatBottle(k, true);
      this.item.state = 'sucking';
      this.item.t = k * food.seconds;
      this.item.total = food.seconds;
      this.item.gulp = 0.4;
      this._setMilk(1 - k);
      for (let i = 0; i < 5; i++) {
        const b = this.bubbleState[i];
        const a = i * 1.9, r = 0.008 + i * 0.003;
        b.x = Math.cos(a) * r; b.z = Math.sin(a) * r;
        b.y = this.milkBottomY + 0.008 + i * 0.012;
        b.s = 0.7 + i * 0.1; b.v = 0.04;
      }
      this.bubbles.visible = true;
      this._syncBubbles();
      S.mood(ctx, 'yum');
      try { ctx.baby?.gesture?.('suck'); } catch (e) { /* rig may differ */ }
    } else if (id === 'juice') {
      this.strawIn = true;
      this.straw.position.set(0.015, 0.030, 0);
      this.straw.rotation.z = -0.10;
      this._setPackDent(k);
      obj.position.copy(this._tmp).add(new THREE.Vector3(0.008, -0.062, 0.055));
      obj.rotation.set(-0.12, 0, 0.06);
      this.item.state = 'sucking';
      this.item.t = k * food.seconds;
      this.item.total = food.seconds;
      this.item.gulp = 0.4;
      S.mood(ctx, 'yum');
    } else if (id === 'porridge') {
      this._setPorridge(1 - k);
      this.spoonScoop.visible = k < 0.98;
      this.spoon.position.copy(this._tmp).add(new THREE.Vector3(0.012, -0.030, 0.062));
      this.spoon.rotation.set(-0.55, 0, 0.35);
      this.item.state = 'held';
      S.mood(ctx, 'yum');
    } else if (id === 'banana') {
      const peels = Math.min(3, Math.floor(k * 4));
      for (let i = 0; i < peels; i++) { this.peels[i].open = 1; this._posePeel(this.peels[i]); }
      this.peelCount = peels;
      const bites = Math.max(0, Math.round((k - 0.6) / 0.4 * food.bites));
      for (let i = this.item.bites; i < bites; i++) { this.item.bites = i + 1; this._carveOnly(id, i + 1); }
      obj.position.copy(this._tmp).add(new THREE.Vector3(0.02, -0.02, 0.05));
      obj.rotation.set(0.2, 0, 0.5);
      this.item.state = bites > 0 ? 'eating' : 'held';
    } else {
      const bites = Math.min(food.bites, Math.round(k * food.bites));
      for (let i = 0; i < bites; i++) { this.item.bites = i + 1; this._carveOnly(id, i + 1); }
      if (id === 'apple' && bites >= food.bites) {
        this.apple.visible = false; this.appleCore.visible = true;
      }
      obj.position.copy(this._tmp).add(new THREE.Vector3(0.018, -0.010, 0.048));
      obj.rotation.set(0.15, 0.4, 0.25);
      this.item.state = 'eating';
      this.item.t = 999;                       // hold the pose for the shot
      if (id === 'cookie') this._dropCrumbs(5);
      if (id === 'riceball') this._riceOnFace();
      S.mood(ctx, 'yum');
    }
    S.lookAt(ctx, null);
    // A staged pose is a *different moment* from the one enter() left on
    // screen, so the guidance has to be re-derived. Without this the harness
    // shots kept enter()'s "put the bib on" over a baby who is already wearing
    // one and already mid-bottle.
    this._advise();
  }

  /**
   * The geometry half of a bite: carve a crescent out of the real mesh.
   *
   * The direction walks down the food bite by bite, the reach is *measured*
   * against the current (already partly eaten) surface, and the sphere centre
   * is parked just outside it so the projection always scoops inward.
   */
  _carveOnly(id, biteIndex) {
    const target = id === 'apple' ? this.apple : id === 'cookie' ? this.cookie
      : id === 'riceball' ? this.riceball : this.bananaFlesh;
    const rice = id === 'riceball';
    // An onigiri is bitten at the corners, not through the flat face — a
    // sphere tangent to that face would scoop out half the rice ball.
    const dir = rice
      ? new THREE.Vector3(
        0.30 * Math.sin(biteIndex * 2.3), 0.95 - 0.28 * biteIndex, 0.34).normalize()
      : new THREE.Vector3(
        0.35 + 0.3 * Math.sin(biteIndex * 2.1), 0.30 - 0.25 * biteIndex, 0.80).normalize();
    const biteR = id === 'apple' ? 0.020 : id === 'cookie' ? 0.015
      : rice ? 0.016 : 0.011;
    const reach = S.surfaceReach(target, dir, id === 'banana' ? 0.9 : 0.55);
    const centre = dir.multiplyScalar(reach + biteR * 0.58);
    if (id === 'banana') centre.y += 0.026 - biteIndex * 0.022;
    const flesh = id === 'apple' ? 0xfdf3d8 : id === 'cookie' ? 0xe8cfa3
      : rice ? 0xfffdf6 : 0xfff6de;
    S.carveBite(target, centre, biteR, {
      teeth: 6, toothDepth: 0.075, flesh, seed: 11 + biteIndex * 7
    });
  }

  _stageMess(on) {
    const ctx = this.ctx;
    if (!on) {
      this.faceDirt = 0; this.bodyDirt = 0;
      S.setDirt(ctx, 'face', 0);
      S.setDirt(ctx, 'body', 0);
      return;
    }
    this.faceDirt = 0.75;
    this.bodyDirt = this.bibOn ? 0.25 : 0.6;
    S.setDirt(ctx, 'face', this.faceDirt);
    S.setDirt(ctx, 'body', this.bodyDirt);
    S.setDirt(ctx, 'hands', 0.4);
    this._riceOnFace();
    this._dropCrumbs(6);
    for (let i = 0; i < 5; i++) {
      S.decal(ctx, 'stain', this.tray,
        new THREE.Vector2(0.2 + this._rand() * 0.6, 0.2 + this._rand() * 0.6),
        { size: 0.04 + this._rand() * 0.05, color: 0xc98b4a, opacity: 0.55 });
    }
    // crumbs already on the tray, settled
    for (const c of this.crumbs) {
      if (c.rest) continue;
      c.mesh.position.y = TRAY_Y + 0.004;
      c.rest = true;
      this._crumbLanded(c);
    }
  }
}
