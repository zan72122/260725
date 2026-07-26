/* ============================================================================
 * activities/sleep.js — 🌙 ねんね
 * ----------------------------------------------------------------------------
 * The whole scene is about one thing: watching a child fall asleep, in six
 * stages you can read from across the room.
 *
 *   したく    🪥 仕上げみがき (real plaque you scrub off, then a "ぺっ" rinse)
 *             → 🌙 パジャマ → 🪟 カーテン → 💡 でんき.
 *             The room has to be dark. Leave the lamp on and the baby will
 *             point at it until you do something about it.
 *   えほん    a board book with pages that bend as they turn; every page makes
 *             the eyelids heavier.
 *   とんとん  slow and even. Too fast and the eyes snap straight open.
 *   くまさん  tucked into the arms.
 *   ながれぼし once asleep, outside the window.
 *
 * The lighting is the hero: one warm practical with a real falloff, moonlight
 * through the glass, and a star lamp turning slowly across the ceiling.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import * as TEX from '../engine/textures.js';
import {
  Resources, RopeMesh, makeCrib, makeMattress, makePillow, makeTeddy,
  makePictureBook, makeToothbrush, makeTeeth, roundedBoxGeometry,
  hitProxy, anchorPoint, snd
} from '../fx/toys.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

/* Stage thresholds — the readable spine of the whole activity. */
const STAGES = [
  { at: 0.00, name: 'awake' },
  { at: 0.14, name: 'yawn' },
  { at: 0.30, name: 'rub' },
  { at: 0.47, name: 'drowsy' },
  { at: 0.68, name: 'nodding' },
  { at: 0.90, name: 'asleep' }
];

/** A lit room caps how sleepy the baby is willing to get. */
const LIGHT_CAP = 0.62;

const PAT_MIN = 380;    // ms — faster than this and the eyes fly open
const PAT_MAX = 1500;   // ms — slower than this is just a stray tap

/* ========================================================================== *
 * A compact verlet cloth. Used when ctx.physics.addCloth is unavailable, and
 * always as the place where the quilt's own constraints (baby collision, the
 * animated pull-up pins, the mattress floor) are applied.
 * ========================================================================== */

class SoftGrid {
  constructor(positions, nx, nz, { iterations = 6, gravity = -3.6, damping = 0.982 } = {}) {
    this.n = positions.length / 3;
    this.nx = nx;
    this.nz = nz;
    this.cur = Float32Array.from(positions);
    this.prev = Float32Array.from(positions);
    this.pinned = new Map();
    this.iterations = iterations;
    this.gravity = gravity;
    this.damping = damping;

    // structural + shear rest lengths, straight from the rest pose
    this.links = [];
    const idx = (c, r) => r * (nx + 1) + c;
    const push = (a, b) => {
      const d = Math.hypot(
        this.cur[a * 3] - this.cur[b * 3],
        this.cur[a * 3 + 1] - this.cur[b * 3 + 1],
        this.cur[a * 3 + 2] - this.cur[b * 3 + 2]
      );
      this.links.push(a, b, d);
    };
    for (let r = 0; r <= nz; r++) {
      for (let c = 0; c <= nx; c++) {
        if (c < nx) push(idx(c, r), idx(c + 1, r));
        if (r < nz) push(idx(c, r), idx(c, r + 1));
        if (c < nx && r < nz) {
          push(idx(c, r), idx(c + 1, r + 1));
          push(idx(c + 1, r), idx(c, r + 1));
        }
      }
    }
  }

  pin(i, x, y, z) { this.pinned.set(i, [x, y, z]); }
  unpin(i) { this.pinned.delete(i); }

  step(dt) {
    const d = Math.min(dt, 1 / 45);
    const g = this.gravity * d * d;
    for (let i = 0; i < this.n; i++) {
      const p = this.pinned.get(i);
      if (p) {
        this.cur[i * 3] = p[0]; this.cur[i * 3 + 1] = p[1]; this.cur[i * 3 + 2] = p[2];
        this.prev[i * 3] = p[0]; this.prev[i * 3 + 1] = p[1]; this.prev[i * 3 + 2] = p[2];
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        const x = this.cur[j];
        this.cur[j] += (x - this.prev[j]) * this.damping + (k === 1 ? g : 0);
        this.prev[j] = x;
      }
    }
    for (let it = 0; it < this.iterations; it++) this.relax();
  }

  relax() {
    const L = this.links;
    for (let i = 0; i < L.length; i += 3) {
      const a = L[i], b = L[i + 1], rest = L[i + 2];
      const ax = a * 3, bx = b * 3;
      const dx = this.cur[bx] - this.cur[ax];
      const dy = this.cur[bx + 1] - this.cur[ax + 1];
      const dz = this.cur[bx + 2] - this.cur[ax + 2];
      const len = Math.hypot(dx, dy, dz) || 1e-6;
      const corr = (len - rest) / len;
      const aFree = this.pinned.has(a) ? 0 : 1;
      const bFree = this.pinned.has(b) ? 0 : 1;
      const total = aFree + bFree;
      if (!total) continue;
      const ka = (corr * aFree) / total;
      const kb = (corr * bFree) / total;
      this.cur[ax] += dx * ka; this.cur[ax + 1] += dy * ka; this.cur[ax + 2] += dz * ka;
      this.cur[bx] -= dx * kb; this.cur[bx + 1] -= dy * kb; this.cur[bx + 2] -= dz * kb;
    }
    for (const [i, p] of this.pinned) {
      this.cur[i * 3] = p[0]; this.cur[i * 3 + 1] = p[1]; this.cur[i * 3 + 2] = p[2];
    }
  }
}

/* ========================================================================== *
 * SleepActivity
 * ========================================================================== */

export class SleepActivity {
  constructor(ctx) {
    this.ctx = ctx;
    this.res = new Resources();
    this.group = new THREE.Group();
    this.group.name = 'sleep-activity';

    this.t = 0;
    this.pickables = [];

    this._ndc = new THREE.Vector2();
    this._ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    this.sleepiness = 0.05;
    this.stage = 0;
    this.asleep = false;
    this.asleepAt = -1;

    this.todo = { teeth: false, pajama: false, curtains: false, lamp: false };
    this.lampOn = true;
    this.curtains = 0;          // 0 = closed, 1 = open (Room.setCurtains(open))
    this.brushing = false;
    this.brushDrag = false;

    this.bookOpen = false;
    this.bookPagesRead = 0;

    this.patTimes = [];
    this.lastPatAt = 0;

    this.teddyGiven = false;
    this.coverAmount = 0.15;    // how far the quilt is pulled up
    this.coverTarget = 0.15;

    this._headOffset = { x: 0, z: 0 };
    this._babyRestore = null;
    this._masked = [];
    this._timers = [];
    this._pointTimer = 5;
    this._hintTimer = 3.0;
    this._blinkTimer = 2.0;
    this._gestureTimer = 4.0;
    this._zzzTimer = 0;
    this._snoreTimer = 0;
    this._starTimer = 1e9;
  }

  /* ------------------------------------------------------------- build --- */

  async build() {
    const ctx = this.ctx;
    const res = this.res;

    ctx.scene.add(this.group);
    res.root(this.group);
    res.onDispose(() => this.group.clear());

    const cribPos = anchorPoint(ctx, 'crib', [0, 0, -0.06]);
    cribPos.y = 0;
    this.cribPos = cribPos;

    // If the room already dressed the crib anchor, park its meshes for the
    // duration — this scene needs bedding it can actually simulate.
    this._maskAnchor('crib');

    this._buildCrib();
    this._buildBedding();
    this._buildNightstand();
    this._buildLighting();
    this._buildSky();
    this._buildProps();

    res.claim(this.group);
  }

  _maskAnchor(name) {
    const a = this.ctx.room?.anchor?.(name);
    if (!a?.isObject3D) return;
    a.traverse((o) => {
      if (o !== a && o.isMesh && o.visible) {
        this._masked.push(o);
        o.visible = false;
      }
    });
    this.res.onDispose(() => {
      for (const o of this._masked) o.visible = true;
      this._masked.length = 0;
    });
  }

  /* --------------------------------------------------------- the bed ----- */

  _buildCrib() {
    const res = this.res;
    // A compact cot: the inner footprint is close to square so the baby reads
    // correctly whichever way its 'lie' pose runs.
    this.crib = makeCrib(res, { w: 0.78, d: 0.62, railH: 0.40, mattressY: 0.26 });
    this.crib.group.position.copy(this.cribPos);
    this.group.add(this.crib.group);

    this.mattress = makeMattress(res, { w: 0.72, d: 0.56, h: 0.055 });
    this.mattress.group.position.copy(this.cribPos).add(new THREE.Vector3(0, 0.26, 0));
    this.group.add(this.mattress.group);

    this.surfaceY = this.cribPos.y + 0.26 + 0.055;

    this.pillow = makePillow(res, { w: 0.20, d: 0.15, h: 0.036 });
    this.pillow.group.position.set(
      this.cribPos.x - 0.24, this.surfaceY, this.cribPos.z);
    this.pillow.group.rotation.y = 0.06;
    this.group.add(this.pillow.group);
  }

  /**
   * The quilt.
   *  · a coarse control grid is the simulated cloth (handed to ctx.physics
   *    .addCloth when the solver offers it, otherwise stepped locally);
   *  · a second grid of the same resolution is what you see, offset along the
   *    surface normal by a baked quilting relief plus the breathing swell;
   *  · a piping tube runs the whole perimeter and follows the sim every frame.
   */
  _buildBedding() {
    const res = this.res;
    const NX = 18, NZ = 14;
    this.quiltNX = NX;
    this.quiltNZ = NZ;

    const span = 0.54;
    const depth = 0.54;
    this.xFoot = this.cribPos.x + 0.32;
    this.xHeadOpen = this.cribPos.x + 0.06;    // folded down at the legs
    this.xHeadCover = this.cribPos.x - 0.20;   // pulled up over the chest

    const rest = new THREE.PlaneGeometry(span, depth, NX, NZ);
    rest.rotateX(-Math.PI / 2);
    rest.translate(this.xFoot - span / 2, this.surfaceY + 0.012, this.cribPos.z);

    // control mesh (never rendered)
    const simGeo = res.geo(rest);
    const simMesh = new THREE.Mesh(simGeo, res.shared('sim-mat',
      () => new THREE.MeshBasicMaterial({ visible: false })));
    simMesh.visible = false;
    simMesh.frustumCulled = false;
    this.group.add(simMesh);
    this.simMesh = simMesh;

    // visible quilt
    const quiltGeo = res.geo(simGeo.clone());
    const quiltMat = res.mat(MAT.makeCloth({
      color: 0xa9c6e8, weave: 'plain', threads: 150, repeat: 3, seed: 24,
      sheen: 1.0, sheenColor: 0xdce9ff, roughness: 0.95, normalScale: 1.1
    }));
    quiltMat.side = THREE.DoubleSide;
    // A diamond quilting normal map on top of the weave: at this light level the
    // seams are most of what tells you it is a quilt and not a sheet.
    quiltMat.normalMap = TEX.painted('quilt-normal', 512, (g, s) => {
      const img = g.createImageData(s, s);
      const d = img.data;
      const cells = 6;
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const u = (x / s) * cells, v = (y / s) * cells;
          // seam field: distance to the nearest diamond seam
          const a = (u + v) % 1, b = (u - v + 100) % 1;
          const da = Math.min(a, 1 - a), db = Math.min(b, 1 - b);
          const dist = Math.min(da, db);
          const k = Math.exp(-Math.pow(dist / 0.10, 2));   // groove profile
          // analytic gradient of the groove along both diagonals
          const ga = (a < 0.5 ? 1 : -1) * k * (da < db ? 1 : 0);
          const gb = (b < 0.5 ? 1 : -1) * k * (db <= da ? 1 : 0);
          let nx = (ga + gb) * 0.9;
          let ny = (ga - gb) * 0.9;
          const nz = 1;
          const len = Math.hypot(nx, ny, nz);
          const i = (y * s + x) * 4;
          d[i] = ((nx / len) * 0.5 + 0.5) * 255;
          d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
          d[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
          d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }, { srgb: false });
    quiltMat.normalScale.set(1.4, 1.4);

    const quilt = new THREE.Mesh(quiltGeo, quiltMat);
    quilt.castShadow = true;
    quilt.receiveShadow = true;
    quilt.frustumCulled = false;
    quilt.userData.tag = 'quilt';
    this.group.add(quilt);
    this.quilt = quilt;
    this.pickables.push(quilt);

    // baked quilting relief per vertex — puffs between the seams
    const count = (NX + 1) * (NZ + 1);
    this.puff = new Float32Array(count);
    for (let r = 0; r <= NZ; r++) {
      for (let c = 0; c <= NX; c++) {
        const u = c / NX * 6, v = r / NZ * 6;
        const a = (u + v) % 1, b = (u - v + 100) % 1;
        const da = Math.min(a, 1 - a), db = Math.min(b, 1 - b);
        const dist = Math.min(da, db);
        const edge = (c === 0 || c === NX || r === 0 || r === NZ) ? 0.25 : 1;
        this.puff[r * (NX + 1) + c] = clamp(dist / 0.5, 0, 1) * 0.006 * edge;
      }
    }

    // simulation
    this.sim = new SoftGrid(simGeo.attributes.position.array, NX, NZ,
      { iterations: 7, gravity: -3.8, damping: 0.982 });
    this.nativeCloth = null;
    try {
      this.nativeCloth = this.ctx.physics?.addCloth?.(simMesh, {
        segmentsX: NX, segmentsY: NZ, stiffness: 0.92, damping: 0.03,
        gravity: -3.8, pins: this._pinIndices()
      }) || null;
    } catch (e) { this.nativeCloth = null; }
    res.onDispose(() => {
      if (this.nativeCloth) {
        try {
          if (this.ctx.physics?.removeCloth) this.ctx.physics.removeCloth(this.nativeCloth);
          else this.ctx.physics?.removeBody?.(this.nativeCloth);
        } catch (e) { /* ignore */ }
      }
    });

    // piping around the whole perimeter
    this.borderIndices = [];
    const at = (c, r) => r * (NX + 1) + c;
    for (let c = 0; c <= NX; c++) this.borderIndices.push(at(c, 0));
    for (let r = 1; r <= NZ; r++) this.borderIndices.push(at(NX, r));
    for (let c = NX - 1; c >= 0; c--) this.borderIndices.push(at(c, NZ));
    for (let r = NZ - 1; r >= 1; r--) this.borderIndices.push(at(0, r));
    this.borderIndices.push(at(0, 0));

    const pipeMat = res.mat(MAT.makeCloth({
      color: 0xfdf3e4, weave: 'knit', threads: 70, repeat: 10, seed: 25, sheen: 0.9
    }));
    this.piping = new RopeMesh(res, this.borderIndices.length, {
      radius: 0.0055, sides: 6, taper: 0, material: pipeMat
    });
    this.piping.mesh.castShadow = true;
    this.group.add(this.piping.mesh);
    this._borderPoints = this.borderIndices.map(() => new THREE.Vector3());

    // colliders that stand in for the baby under the covers
    this.colliders = [
      { p: new THREE.Vector3(), r: 0.072 },   // head
      { p: new THREE.Vector3(), r: 0.082 },   // chest — this one breathes
      { p: new THREE.Vector3(), r: 0.070 }    // hips
    ];
  }

  _pinIndices() {
    const NX = this.quiltNX, NZ = this.quiltNZ;
    const out = [];
    for (let r = 0; r <= NZ; r++) { out.push(r * (NX + 1)); out.push(r * (NX + 1) + NX); }
    return out;
  }

