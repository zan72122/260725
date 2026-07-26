/* ============================================================================
 * activities/play.js — 🎈 あそぶ
 * ----------------------------------------------------------------------------
 * Five toys, all live at once, none of them modal:
 *
 *   ボール      flick it away → the baby crawls after it, hauls it up with a
 *               "よいしょ", and throws it back to you.
 *   つみき      tap a block to stack it. The taller the tower the wider it
 *               sways; knock it (or let it go past its own tolerance) and it
 *               comes down properly — dust, contact shadows, camera shake and a
 *               huge laugh. What you don't tidy stays scattered in the room.
 *   ふうせん    latex, buoyant, on a verlet string. Five bops in a row earns a
 *               fanfare.
 *   もっきん/たいこ  a real pentatonic scale (ド レ ミ ソ ラ) on bars whose
 *               lengths come from L ∝ 1/√f, and the baby moves to the beat.
 *   いないないばあ  tap the head → a handkerchief comes up over the face → "ばあ！"
 *
 * Guidance is icon + audio + the baby's own pointing. Nothing needs reading.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import {
  Resources, BodySet, VerletRope, RopeMesh, makeContactShadows,
  makeBlockSet, makeBall, makeBalloon, makeXylophone, makeDrum, makeToyBox,
  hitProxy, anchorPoint, anchorHasFurniture, snd
} from '../fx/toys.js';

const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);

const BLOCK_COUNT = 8;
const BLOCK_SIZE = 0.062;
const LEVEL = BLOCK_SIZE + 0.0006;

/** How wobbly a tower of n blocks is, in metres of lateral sway at the top. */
const wobbleAmp = (n) => 0.0009 * Math.pow(Math.max(0, n - 1), 1.55);

/**
 * Deterministic pseudo-random. The screenshot harness advances a fixed clock and
 * compares frames byte-for-byte, so anything that shapes the collapse has to be
 * reproducible — Math.random would make the money shot a different image every
 * run.
 */
function rnd(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
/** Above this the tower can give way on its own. */
const AUTO_COLLAPSE_HEIGHT = 7;

/**
 * tools/shots.json warms `41-play-collapse` for 5.2 s after the state patch, so
 * a harness-driven collapse is deliberately staged to fire late: the tower gets
 * to stand and shiver first, and the frame lands mid-fall with dust in the air.
 */
const HARNESS_COLLAPSE_LEAD = 4.55;

const RALLY_GOAL = 5;

export class PlayActivity {
  constructor(ctx) {
    this.ctx = ctx;
    this.res = new Resources();
    this.group = new THREE.Group();
    this.group.name = 'play-activity';

    this.t = 0;
    this.pickables = [];

    this._ndc = new THREE.Vector2();
    this._ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this.blocks = [];          // { mesh, entry, state, level, tidyDelay }
    this.towerHeight = 0;
    this.collapseAt = -1;
    this.collapseArmed = false;
    this.tidying = false;

    this.ballState = 'rest';   // rest | rolling | chased | held | thrown
    this.ballHold = 0;
    this.playerRolled = false;
    this.ballStillFor = 0;

    this.rally = 0;
    this.rallyBest = 0;
    this.balloonState = 'idle';

    this.dance = 0;
    this.peek = null;
    this.hintTimer = 4.5;
    this.hintIndex = 0;
    this.tried = { ball: false, blocks: false, balloon: false, music: false, peek: false };

    this._babyRestore = null;
    this._flick = null;
  }

  /* ------------------------------------------------------------- build --- */

  async build() {
    const ctx = this.ctx;
    const res = this.res;

    ctx.scene.add(this.group);
    res.root(this.group);
    res.onDispose(() => { this.group.clear(); });

    // Everything is placed in absolute world coordinates: the physics solver
    // writes world positions straight into mesh.position, so the activity root
    // has to stay at the identity.
    let home = anchorPoint(ctx, 'playmat', [0, 0, 0.16]);
    if (home.lengthSq() < 1e-6) home = anchorPoint(ctx, 'rug', [0, 0, 0.16]);
    home.y = 0;
    this.home = home;

    this.bodies = new BodySet(ctx, { floorY: home.y });
    res.onDispose(() => this.bodies.dispose());

    /* --- contact shadows (blocks + ball + toybox + balloon) --------------- */
    this.shadows = makeContactShadows(res, BLOCK_COUNT + 6, { opacity: 0.55 });
    this.group.add(this.shadows.mesh);

    /* --- つみき ---------------------------------------------------------- */
    const set = makeBlockSet(res, { count: BLOCK_COUNT, size: BLOCK_SIZE, seed: 5 });
    this.towerBase = home.clone().add(new THREE.Vector3(0.28, 0, 0.09));
    this.pilePoints = [];
    for (let i = 0; i < BLOCK_COUNT; i++) {
      const mesh = set.blocks[i];
      const a = (i / BLOCK_COUNT) * Math.PI * 2 + 0.7;
      const p = home.clone().add(new THREE.Vector3(
        0.44 + Math.cos(a) * 0.085,
        BLOCK_SIZE / 2,
        0.26 + Math.sin(a) * 0.075
      ));
      this.pilePoints.push(p.clone());
      mesh.position.copy(p);
      mesh.rotation.y = a;
      this.group.add(mesh);
      const entry = this.bodies.add(mesh, {
        shape: 'box',
        size: [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE],
        mass: 0.09, restitution: 0.16, friction: 0.82
      });
      this.bodies.place(entry, p, mesh.quaternion, true);
      this.blocks.push({ mesh, entry, state: 'idle', level: -1, tidyDelay: 0, home: p.clone() });
      this.pickables.push(mesh);
    }

    /* --- おもちゃばこ ---------------------------------------------------- */
    if (!anchorHasFurniture(ctx, 'toybox')) {
      this.toyBox = makeToyBox(res, {});
      const tp = anchorPoint(ctx, 'toybox', [home.x + 0.72, 0, home.z - 0.20]);
      this.toyBox.group.position.copy(tp);
      this.toyBox.group.rotation.y = -0.35;
      this.group.add(this.toyBox.group);
      this.pickables.push(this.toyBox.group);
      this.boxMouth = tp.clone().add(new THREE.Vector3(0, 0.16, 0));
    } else {
      // The room already owns a toy box — just borrow its position and put a
      // generous invisible target over it.
      const tp = anchorPoint(ctx, 'toybox', [home.x + 0.72, 0, home.z - 0.20]);
      const proxy = hitProxy(res, 0.24, 'toybox');
      proxy.position.copy(tp).add(new THREE.Vector3(0, 0.12, 0));
      this.group.add(proxy);
      this.pickables.push(proxy);
      this.boxMouth = tp.clone().add(new THREE.Vector3(0, 0.16, 0));
    }

    /* --- ボール ---------------------------------------------------------- */
    this.ball = makeBall(res, { radius: 0.068 });
    this.ballHome = home.clone().add(new THREE.Vector3(-0.14, 0.068, 0.40));
    this.ball.group.position.copy(this.ballHome);
    this.group.add(this.ball.group);
    this.ballEntry = this.bodies.add(this.ball.group, {
      shape: 'sphere', radius: 0.068, mass: 0.12, restitution: 0.46, friction: 0.5
    });
    this.bodies.place(this.ballEntry, this.ballHome, null, true);
    this.pickables.push(this.ball.group);

    /* --- ふうせん + ひも -------------------------------------------------- */
    this.balloon = makeBalloon(res, { radius: 0.112, color: 0xff8fae });
    this.balloonPos = home.clone().add(new THREE.Vector3(-0.04, 0.66, 0.24));
    this.balloonVel = new THREE.Vector3();
    this.balloon.group.position.copy(this.balloonPos);
    this.group.add(this.balloon.group);
    this.pickables.push(this.balloon.group);
    this._buildString();

    /* --- もっきん / たいこ ------------------------------------------------ */
    this.xylo = makeXylophone(res, {});
    this.xylo.group.position.copy(home).add(new THREE.Vector3(-0.46, 0, -0.02));
    this.xylo.group.rotation.y = 0.55;
    this.group.add(this.xylo.group);
    for (const b of this.xylo.bars) this.pickables.push(b.mesh);

    this.drum = makeDrum(res, { radius: 0.082 });
    this.drum.group.position.copy(home).add(new THREE.Vector3(-0.60, 0, 0.26));
    this.drum.group.rotation.y = -0.3;
    this.group.add(this.drum.group);
    this.pickables.push(this.drum.group);

    /* --- いないいないばあ の ハンカチ -------------------------------------- */
    this._buildHanky();

    /* --- head target for peekaboo ---------------------------------------- */
    this.headTarget = hitProxy(res, 0.085, 'head');
    this.group.add(this.headTarget);
    this.pickables.push(this.headTarget);

    res.claim(this.group);
  }

  _buildString() {
    const res = this.res;
    const ctx = this.ctx;
    const N = 12;
    const knot = this.balloonPos.clone().add(new THREE.Vector3(0, -0.112 * 1.44, 0));
    const pts = [];
    for (let i = 0; i < N; i++) {
      pts.push(knot.clone().add(new THREE.Vector3(0, -0.030 * i, 0)));
    }

    this.ropeMesh = new RopeMesh(res, N, { radius: 0.0022, color: 0xfff2f6 });
    this.group.add(this.ropeMesh.mesh);

    // Prefer the engine solver; keep an identical local verlet as the fallback
    // so the string never disappears if the rope API shape differs.
    this.ropeHandle = null;
    this.ropeLocal = null;
    try {
      this.ropeHandle = ctx.physics?.addRope?.(pts, {
        segments: N, stiffness: 0.9, damping: 0.02, pins: [0], gravity: -3.2
      }) || null;
    } catch (e) { this.ropeHandle = null; }

    this.ropePoints = this._ropePoints(this.ropeHandle);
    if (!this.ropePoints) {
      this.ropeLocal = new VerletRope(pts, { gravity: -3.2, damping: 0.986, iterations: 9 });
      this.ropePoints = this.ropeLocal.points;
      this.ropeHandle = null;
    }
    res.onDispose(() => {
      if (this.ropeHandle) {
        try {
          if (this.ctx.physics?.removeRope) this.ctx.physics.removeRope(this.ropeHandle);
          else this.ctx.physics?.removeBody?.(this.ropeHandle);
        } catch (e) { /* ignore */ }
      }
    });
  }

  /** The rope contract doesn't fix the handle shape — find its point list. */
  _ropePoints(handle) {
    if (!handle) return null;
    for (const key of ['points', 'nodes', 'particles', 'positions']) {
      const v = handle[key];
      if (Array.isArray(v) && v.length > 1 && v[0] && typeof v[0].x === 'number') return v;
    }
    return null;
  }

  _buildHanky() {
    const res = this.res;
    const geo = res.geo(new THREE.PlaneGeometry(0.15, 0.13, 8, 7));
    const pos = geo.attributes.position;
    const rest = pos.array.slice();
    const mat = res.mat(MAT.makeCloth({
      color: 0xfff0f5, weave: 'plain', threads: 150, repeat: 2, seed: 71, sheen: 1.0, roughness: 0.94
    }));
    mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.visible = false;
    this.group.add(mesh);
    this.hanky = { mesh, geo, rest, phase: 0 };
  }

  /* ------------------------------------------------------------- enter --- */

  async enter() {
    const ctx = this.ctx;

    // Park the baby in the middle of the play mat, facing the camera.
    const b = ctx.baby;
    if (b?.group) {
      this._babyRestore = {
        pos: b.group.position.clone(),
        rot: b.group.rotation.clone()
      };
      b.group.position.set(this.home.x - 0.06, this.home.y, this.home.z - 0.10);
      b.group.rotation.set(0, 0.12, 0);
    }
    b?.playPose?.('sit', { seconds: 0.5 });
    b?.setMood?.('happy');
    b?.lookAt?.(this.ball.group.position);

    ctx.room?.clutter?.(false);
    ctx.audio?.unlock?.();
    snd(ctx, 'chime');
    ctx.ui?.prompt?.('ボールを ころころ！', { icon: 'ball' });

    // Give the ball a tiny settle so it is never floating on the first frame.
    this.bodies.wake(this.ballEntry);
  }

  async exit() {
    const ctx = this.ctx;
    ctx.ui?.hidePrompt?.();
    ctx.baby?.lookAt?.(null);

    // The mess is a trace that follows you into the rest of the game.
    const scattered = this.blocks.filter((b) => b.state === 'loose').length;
    if (scattered > 0) {
      ctx.room?.clutter?.(true);
      ctx.state?.patch?.({ toysOut: scattered });
    } else {
      ctx.room?.clutter?.(false);
      ctx.state?.patch?.({ toysOut: 0 });
    }
  }

  dispose() {
    const ctx = this.ctx;
    if (this._babyRestore && ctx.baby?.group) {
      ctx.baby.group.position.copy(this._babyRestore.pos);
      ctx.baby.group.rotation.copy(this._babyRestore.rot);
      this._babyRestore = null;
    }
    ctx.baby?.lookAt?.(null);
    ctx.ui?.hidePrompt?.();

    this.pickables.length = 0;
    this.blocks.length = 0;
    this.res.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }

  /* ------------------------------------------------------------- state --- */

  onState(patch) {
    if (!patch) return;

    if (typeof patch.stack === 'number') this._buildTower(clamp(patch.stack | 0, 0, BLOCK_COUNT));

    if (patch.toy === 'blocks') {
      if (this.towerHeight === 0) this._buildTower(4);
      this.ctx.baby?.lookAt?.(this._towerTop());
      this.ctx.ui?.prompt?.('つみきを ぽん！', { icon: 'blocks' });
      this.tried.blocks = true;
    } else if (patch.toy === 'ball') {
      this._kickBall();
      this.ctx.ui?.prompt?.('ボールを ころころ！', { icon: 'ball' });
      this.tried.ball = true;
    } else if (patch.toy === 'balloon') {
      this._bopBalloon(0.9);
      this.ctx.ui?.prompt?.('ふうせん ぽーん！', { icon: 'balloon' });
      this.tried.balloon = true;
    }

    if (patch.collapse === true) {
      if (this.towerHeight < 2) this._buildTower(6);
      this.collapseAt = this.t + HARNESS_COLLAPSE_LEAD;
      this.collapseArmed = true;
    } else if (patch.collapse === false) {
      this.collapseArmed = false;
      this.collapseAt = -1;
    }

    if (patch.clutter === true) this._scatterBlocks();
    else if (patch.clutter === false && this.blocks.some((b) => b.state === 'loose')) this._tidyUp(true);
  }

  /* ----------------------------------------------------------- pointer --- */

  onPointer(p) {
    if (!p) return;
    if (p.type === 'down') this._down(p);
    else if (p.type === 'move') this._move(p);
    else if (p.type === 'up') this._up(p);
  }

  _pick(p) {
    const el = this.ctx.renderer?.domElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    this._ndc.set(
      ((p.x - r.left) / r.width) * 2 - 1,
      -((p.y - r.top) / r.height) * 2 + 1
    );
    this._ray.setFromCamera(this._ndc, this.ctx.camera);
    const hits = this._ray.intersectObjects(this.pickables, true);
    if (!hits.length) return null;
    // Nearest wins, then walk up for the tagged owner — "you hit what you see".
    for (const h of hits) {
      let o = h.object;
      while (o && o !== this.group) {
        if (o.userData?.tag) return { tag: o.userData.tag, object: o, hit: h };
        o = o.parent;
      }
    }
    return null;
  }

  _down(p) {
    const ctx = this.ctx;
    ctx.audio?.unlock?.();
    const got = this._pick(p);
    if (!got) return;

    switch (got.tag) {
      case 'ball':
        if (this.ballState === 'held') return;
        this._flick = { x: p.x, y: p.y, t: this.t };
        return;
      case 'block':
        this._blockTap(got.object);
        return;
      case 'toybox':
        this._tidyUp(false);
        return;
      case 'balloon':
        this._bopBalloon(1);
        return;
      case 'xylo':
        this._strikeBar(got.object.userData.index ?? 0);
        return;
      case 'drum':
        this._hitDrum(got.hit?.point);
        return;
      case 'head':
        this._peekaboo();
        return;
      default:
        return;
    }
  }

  _move() { /* the flick is resolved on release */ }

  _up(p) {
    if (!this._flick) return;
    const f = this._flick;
    this._flick = null;
    const el = this.ctx.renderer?.domElement;
    const w = el ? el.clientWidth : 1000;
    const h = el ? el.clientHeight : 700;
    const dx = (p.x - f.x) / (w * 0.28);
    const dy = (p.y - f.y) / (h * 0.28);
    const power = Math.hypot(dx, dy);

    if (power < 0.16) {
      // a tap alone gives it a friendly little hop
      this._kickBall(0.55, new THREE.Vector3(0, 0, 1));
    } else {
      const dir = this._floorDir(dx, dy);
      this._kickBall(clamp(power, 0.35, 1.6), dir);
    }
  }

  /** Screen-space drag → a direction on the floor, from the camera's own basis. */
  _floorDir(dx, dy) {
    const cam = this.ctx.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    right.y = 0;
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    return right.multiplyScalar(dx).addScaledVector(fwd, -dy).normalize();
  }

  /* -------------------------------------------------------------- ball --- */

  _kickBall(power = 1, dir = null) {
    const ctx = this.ctx;
    const d = dir ? dir.clone() : this._floorDir(0.2, -0.9);
    d.y = 0;
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize();

    this._releaseBall();
    this.bodies.wake(this.ballEntry);
    const b = this.ballEntry.body;
    b.velocity.set(d.x * 1.55 * power, 0.35 * power, d.z * 1.55 * power);
    this.ballState = 'rolling';
    this.playerRolled = true;
    this.ballStillFor = 0;
    this.tried.ball = true;
    this.ball.hit(0.28);
    snd(ctx, 'whoosh', { gain: 0.5 });
    ctx.baby?.lookAt?.(this.ball.group.position);
    ctx.fx?.burst?.('dust', this.ball.group.position.clone().setY(0.01), 5, { spread: 0.1 });
  }

  _releaseBall() {
    if (this.ballState === 'held') {
      this.ballState = 'rolling';
    }
  }

  _ballUpdate(dt) {
    const ctx = this.ctx;
    const body = this.ballEntry.body;
    const pos = this.ball.group.position;
    const floor = this.home.y + this.ball.radius;

    if (this.ballState === 'held') {
      const hand = ctx.baby?.handWorldPos?.('right') || ctx.baby?.headWorldPos?.();
      const target = hand ? hand.clone().add(new THREE.Vector3(0, 0.05, 0.02)) : pos;
      pos.lerp(target, Math.min(1, dt * 11));
      body.position.copy(pos);
      body.velocity?.set(0, 0, 0);
      body.asleep = true;

      this.ballHold -= dt;
      if (this.ballHold <= 0) this._throwBack();
      return;
    }

    // Rolling contact: derive the spin from the linear velocity so the print on
    // the ball genuinely rotates with the surface it is running on.
    const v = body.velocity;
    if (v && pos.y <= floor + 0.006) {
      this._v.copy(UP).cross(v).multiplyScalar(1 / this.ball.radius);
      if (body.angularVelocity) body.angularVelocity.lerp(this._v, Math.min(1, dt * 14));
    }

    // squash on floor impact
    if (v) {
      const wasFalling = this._ballPrevVy ?? 0;
      if (wasFalling < -0.5 && v.y > -0.05 && pos.y <= floor + 0.01) {
        this.ball.hit(clamp(-wasFalling * 0.35, 0.1, 0.9));
        snd(ctx, 'bounce', { gain: clamp(-wasFalling * 0.3, 0.1, 0.6) });
        ctx.fx?.burst?.('dust', pos.clone().setY(this.home.y + 0.005), 3, { spread: 0.06 });
      }
      this._ballPrevVy = v.y;
    }

    // keep it in the play area — a soft wall, never a fail
    const limit = 1.35;
    this._v2.copy(pos).sub(this.home);
    this._v2.y = 0;
    if (this._v2.length() > limit && v) {
      this._v2.normalize();
      const away = this._v2.dot(v);
      if (away > 0) v.addScaledVector(this._v2, -away * 1.6);
    }

    const speed = v ? Math.hypot(v.x, v.z) : 0;
    const baby = ctx.baby;
    const babyPos = baby?.group?.position;

    if (this.ballState === 'rolling') {
      if (speed > 0.25) baby?.lookAt?.(pos);
      if (speed < 0.12) this.ballStillFor += dt; else this.ballStillFor = 0;
      const far = babyPos ? babyPos.distanceTo(pos) : 0;
      if (this.playerRolled && this.ballStillFor > 0.55 && far > 0.20) {
        this.ballState = 'chased';
        baby?.playPose?.('crawl', { loop: true });
        baby?.setMood?.('excited');
        baby?.lookAt?.(pos);
        snd(ctx, 'giggle', { gain: 0.5 });
      }
    } else if (this.ballState === 'chased' && babyPos) {
      baby?.lookAt?.(pos);
      this._v.copy(pos).sub(babyPos);
      this._v.y = 0;
      const dist = this._v.length();
      if (dist > 0.17) {
        this._v.normalize();
        babyPos.addScaledVector(this._v, dt * 0.42);
        const want = Math.atan2(this._v.x, this._v.z);
        baby.group.rotation.y = this._angleLerp(baby.group.rotation.y, want, dt * 5);
      } else {
        // よいしょ — picked up
        this.ballState = 'held';
        this.ballHold = 1.05;
        this.playerRolled = false;
        baby?.playPose?.('sit', { seconds: 0.4 });
        baby?.setMood?.('happy');
        baby?.gesture?.('reach');
        baby?.say?.('yoisho');
        snd(ctx, 'yoisho');
        ctx.fx?.burst?.('sparkle', pos.clone(), 5);
        if (body.velocity) body.velocity.set(0, 0, 0);
        body.asleep = true;
      }
    }
  }

  _throwBack() {
    const ctx = this.ctx;
    const baby = ctx.baby;
    const from = this.ball.group.position.clone();
    // aim back toward the player: the camera's floor position, softened
    const cam = ctx.camera.position.clone();
    cam.y = this.home.y;
    const dir = cam.sub(from.clone().setY(this.home.y));
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();

    this.bodies.wake(this.ballEntry);
    const b = this.ballEntry.body;
    b.asleep = false;
    b.velocity.set(dir.x * 1.15, 1.5, dir.z * 1.15);
    if (b.angularVelocity) b.angularVelocity.set(-dir.z * 8, 0, dir.x * 8);
    this.ballState = 'thrown';
    this.ball.hit(0.2);

    baby?.playPose?.('sit', { seconds: 0.3 });
    baby?.setMood?.('giggle');
    baby?.gesture?.('clap');
    snd(ctx, 'whoosh', { gain: 0.6 });
    snd(ctx, 'giggle');
    ctx.fx?.burst?.('star', from, 6);
    ctx.fx?.burst?.('heart', from, 3);
    this._bumpHappy(0.06);
    this._star(1);
    this._after(0.3, () => { if (this.ballState === 'thrown') this.ballState = 'rolling'; });
  }

  /* ------------------------------------------------------------ blocks --- */

  _towerTop() {
    return this.towerBase.clone().setY(this.home.y + this.towerHeight * LEVEL);
  }

  _blockTap(mesh) {
    const rec = this.blocks.find((b) => b.mesh === mesh || b.mesh === mesh.parent);
    if (!rec) return;
    this.tried.blocks = true;

    if (rec.state === 'tower') {
      // knock the tower over on purpose — the best button in the game
      this._collapse('tap');
      return;
    }
    if (rec.state === 'flying' || rec.state === 'tidy' || rec.state === 'stored') return;

    if (this.towerHeight >= BLOCK_COUNT) { this._collapse('tap'); return; }

    rec.state = 'flying';
    rec.level = this.towerHeight;
    rec.flyT = 0;
    rec.flyFrom = rec.mesh.position.clone();
    rec.flyQ = rec.mesh.quaternion.clone();
    this.towerHeight++;
    rec.entry.body.asleep = true;
    snd(this.ctx, 'pop', { rate: 1 + rec.level * 0.05 });
    this.ctx.baby?.lookAt?.(this._towerTop());
  }

  _blocksUpdate(dt) {
    const ctx = this.ctx;
    const amp = wobbleAmp(this.towerHeight);
    const sway = Math.sin(this.t * 2.4) * amp;
    const sway2 = Math.sin(this.t * 3.7 + 1.1) * amp * 0.55;

    for (const rec of this.blocks) {
      if (rec.state === 'flying') {
        rec.flyT = Math.min(1, rec.flyT + dt * 2.2);
        const e = rec.flyT * rec.flyT * (3 - 2 * rec.flyT);
        const target = this.towerBase.clone().setY(this.home.y + BLOCK_SIZE / 2 + rec.level * LEVEL);
        this._v.copy(rec.flyFrom).lerp(target, e);
        this._v.y += Math.sin(e * Math.PI) * 0.13;      // a proper arc, not a slide
        rec.mesh.position.copy(this._v);
        this._q.identity();
        rec.mesh.quaternion.slerp(this._q, Math.min(1, dt * 8));
        rec.entry.body.position.copy(this._v);
        rec.entry.body.quaternion?.copy(rec.mesh.quaternion);
        rec.entry.body.asleep = true;
        if (rec.flyT >= 1) {
          rec.state = 'tower';
          snd(ctx, 'wood', { rate: 1 + rec.level * 0.06 });
          ctx.fx?.burst?.('dust', target.clone().setY(target.y - BLOCK_SIZE / 2), 4, { spread: 0.05 });
          ctx.cameraRig?.shake?.(0.03 + rec.level * 0.008, 0.12);
          if (this.towerHeight >= 5) {
            ctx.baby?.setMood?.('excited');
            ctx.baby?.gesture?.('clap');
            snd(ctx, 'tada', { gain: 0.5 });
            this._star(1);
            this._bumpHappy(0.05);
          }
        }
      } else if (rec.state === 'tower') {
        // The sway is authored, not simulated: a dependency-free solver can't
        // hold a stack this tall steady, so the tower is driven while it stands
        // and handed to the solver the instant it goes.
        const k = rec.level;
        const lean = Math.pow((k + 1) / Math.max(1, this.towerHeight), 1.4);
        const x = this.towerBase.x + sway * lean * (k + 1);
        const z = this.towerBase.z + sway2 * lean * (k + 1);
        const y = this.home.y + BLOCK_SIZE / 2 + k * LEVEL;
        rec.mesh.position.set(x, y, z);
        rec.mesh.rotation.set(-sway2 * lean * 2.2, rec.mesh.rotation.y, sway * lean * 2.2);
        rec.entry.body.position.copy(rec.mesh.position);
        rec.entry.body.quaternion?.copy(rec.mesh.quaternion);
        rec.entry.body.asleep = true;
      } else if (rec.state === 'tidy') {
        rec.tidyDelay -= dt;
        if (rec.tidyDelay > 0) continue;
        rec.flyT = Math.min(1, (rec.flyT ?? 0) + dt * 1.5);
        const e = rec.flyT * rec.flyT * (3 - 2 * rec.flyT);
        this._v.copy(rec.flyFrom).lerp(this.boxMouth, e);
        this._v.y += Math.sin(e * Math.PI) * 0.22;
        rec.mesh.position.copy(this._v);
        rec.mesh.rotation.y += dt * 6;
        rec.entry.body.position.copy(this._v);
        rec.entry.body.asleep = true;
        if (rec.flyT >= 1) {
          rec.state = 'stored';
          rec.mesh.visible = false;
          snd(ctx, 'pop', { rate: 1.2 });
          ctx.fx?.burst?.('sparkle', this.boxMouth.clone(), 4);
          this._checkTidyDone();
        }
      } else if (rec.state === 'loose') {
        // every landing gets its own knock + puff: that is what makes a
        // collapse read as eight separate impacts rather than one event
        const v = rec.entry.body.velocity;
        const vy = v ? v.y : 0;
        if ((rec.prevVy ?? 0) < -0.9 && vy > -0.15
          && rec.mesh.position.y < this.home.y + BLOCK_SIZE * 1.2) {
          const p = rec.mesh.position.clone().setY(this.home.y + 0.008);
          ctx.fx?.burst?.('dust', p, 5, { spread: 0.09 });
          snd(ctx, 'wood', { rate: 0.75 + (rec.mesh.userData.index % 4) * 0.09, gain: 0.55 });
        }
        rec.prevVy = vy;
        // once the body has come to rest, it stays put as clutter
        if (rec.entry.body.asleep && rec.mesh.position.y > this.home.y + BLOCK_SIZE) {
          rec.mesh.position.y = this.home.y + BLOCK_SIZE / 2;
        }
      }
    }

    // A tower past its tolerance can let go on its own — never at 5 or 6, so a
    // deliberately-built tower survives long enough to be admired.
    if (!this.tidying && this.towerHeight >= AUTO_COLLAPSE_HEIGHT
      && rnd(Math.floor(this.t * 7) + this.towerHeight) < dt * 0.9) {
      this._collapse('own weight');
    }
    if (this.collapseArmed && this.collapseAt >= 0 && this.t >= this.collapseAt) {
      this.collapseArmed = false;
      this.collapseAt = -1;
      this._collapse('harness');
    }
  }

  /**
   * The collapse, staged:
   *   0 ms   anticipation is already running (the sway grows with height)
   *   0 ms   every standing block is handed to the solver with an outward,
   *          upward impulse scaled by how high it stood, plus tumbling spin
   *   0 ms   a ring of dust punches out of the base, camera shake, ガッシャーン
   *  120 ms  the baby registers the surprise
   *  420 ms  and then thinks it is the funniest thing ever
   */
  _collapse(reason) {
    const ctx = this.ctx;
    const standing = this.blocks.filter((b) => b.state === 'tower' || b.state === 'flying');
    if (!standing.length) return;

    const base = this.towerBase.clone().setY(this.home.y);
    const push = new THREE.Vector3();

    for (const rec of standing) {
      const k = Math.max(0, rec.level);
      const height = (k + 1) / Math.max(1, this.towerHeight);
      push.copy(rec.mesh.position).sub(base);
      push.y = 0;
      if (push.lengthSq() < 1e-6) push.set(Math.cos(k * 2.1), 0, Math.sin(k * 2.1));
      push.normalize();
      // the top of the stack travels furthest — that's what makes it read
      const speed = 0.35 + height * 1.5;
      this.bodies.wake(rec.entry);
      const seed = rec.mesh.userData.index ?? k;
      this.bodies.impulse(
        rec.entry,
        new THREE.Vector3(push.x * speed, 0.5 + height * 1.3, push.z * speed),
        new THREE.Vector3(
          (rnd(seed * 3 + 1) - 0.5) * 14 * height,
          (rnd(seed * 3 + 2) - 0.5) * 10,
          (rnd(seed * 3 + 3) - 0.5) * 14 * height
        )
      );
      rec.state = 'loose';
      rec.level = -1;
      rec.flyT = 0;
      rec.prevVy = 0;
    }
    this.towerHeight = 0;

    ctx.fx?.burst?.('dust', base.clone().setY(this.home.y + 0.012), 26, { spread: 0.34, rise: 0.2 });
    ctx.fx?.burst?.('dust', base.clone().setY(this.home.y + 0.10), 12, { spread: 0.2 });
    ctx.fx?.burst?.('star', base.clone().setY(this.home.y + 0.24), 8);
    ctx.cameraRig?.shake?.(0.42, 0.42);
    snd(ctx, 'crash');
    snd(ctx, 'wood', { rate: 0.8, gain: 0.8 });

    ctx.baby?.setMood?.('surprised');
    ctx.baby?.lookAt?.(base.clone().setY(this.home.y + 0.1));
    this._after(0.12, () => ctx.cameraRig?.shake?.(0.16, 0.3));
    // a second wave of dust as the tumbling blocks meet the floor
    this._after(0.5, () => {
      ctx.fx?.burst?.('dust', base.clone().setY(this.home.y + 0.02), 16, { spread: 0.42 });
    });
    this._after(0.42, () => {
      ctx.baby?.setMood?.('giggle');
      ctx.baby?.gesture?.('clap');
      snd(ctx, 'laugh');
      ctx.fx?.burst?.('heart', ctx.baby?.headWorldPos?.() || base, 6);
    });
    this._after(1.0, () => { snd(ctx, 'laugh', { rate: 1.12, gain: 0.7 }); });
    this._after(1.6, () => {
      ctx.ui?.prompt?.('おかたづけ しよう', { icon: 'toybox' });
      ctx.baby?.gesture?.('point');
      ctx.baby?.lookAt?.(this.boxMouth);
    });

    this._bumpHappy(0.12);
    this._star(1);
    void reason;
  }

  _buildTower(n) {
    // Reset everything to a known state, then stand `n` blocks up, settled.
    for (const rec of this.blocks) {
      rec.state = 'idle';
      rec.level = -1;
      rec.flyT = 0;
      rec.mesh.visible = true;
      this.bodies.place(rec.entry, rec.home, null, true);
      rec.mesh.rotation.set(0, rec.home.x * 3.1, 0);
    }
    this.towerHeight = 0;
    for (let k = 0; k < n; k++) {
      const rec = this.blocks[k];
      rec.state = 'tower';
      rec.level = k;
      const p = this.towerBase.clone().setY(this.home.y + BLOCK_SIZE / 2 + k * LEVEL);
      rec.mesh.rotation.set(0, (k % 2 ? 0.06 : -0.05), 0);
      this.bodies.place(rec.entry, p, rec.mesh.quaternion, true);
    }
    this.towerHeight = n;
    this.tidying = false;
  }

  _scatterBlocks() {
    for (let i = 0; i < this.blocks.length; i++) {
      const rec = this.blocks[i];
      const a = (i / this.blocks.length) * Math.PI * 2 + 0.4;
      const r = 0.20 + (i % 3) * 0.11;
      const p = this.home.clone().add(new THREE.Vector3(
        Math.cos(a) * r + 0.16, BLOCK_SIZE / 2, Math.sin(a) * r * 0.7 + 0.14));
      rec.state = 'loose';
      rec.level = -1;
      rec.mesh.visible = true;
      rec.mesh.rotation.set(0, a * 1.7, 0);
      this.bodies.place(rec.entry, p, rec.mesh.quaternion, true);
    }
    this.towerHeight = 0;
    this.ctx.room?.clutter?.(true);
  }

  _tidyUp(silent) {
    const loose = this.blocks.filter((b) => b.state === 'loose' || b.state === 'idle');
    if (!loose.length) {
      if (!silent) snd(this.ctx, 'tap');
      return;
    }
    this.tidying = true;
    loose.forEach((rec, i) => {
      rec.state = 'tidy';
      rec.flyT = 0;
      rec.tidyDelay = i * 0.14;
      rec.flyFrom = rec.mesh.position.clone();
      rec.entry.body.asleep = true;
    });
    if (!silent) {
      snd(this.ctx, 'chime');
      this.ctx.ui?.prompt?.('おかたづけ じょうず！', { icon: 'star' });
      this.ctx.baby?.setMood?.('happy');
      this.ctx.baby?.lookAt?.(this.boxMouth);
    }
  }

  _checkTidyDone() {
    if (this.blocks.some((b) => b.state === 'tidy')) return;
    if (!this.blocks.every((b) => b.state === 'stored')) return;
    const ctx = this.ctx;
    this.tidying = false;
    ctx.room?.clutter?.(false);
    ctx.state?.patch?.({ toysOut: 0 });
    snd(ctx, 'tada');
    ctx.fx?.burst?.('confetti', this.boxMouth.clone(), 18);
    ctx.baby?.setMood?.('happy');
    ctx.baby?.gesture?.('clap');
    ctx.ui?.prompt?.('ぴかぴかに なったね！', { icon: 'star' });
    this._star(2);
    this._bumpHappy(0.1);
    // Blocks come back out after a beat so play never dead-ends.
    this._after(2.2, () => {
      for (const rec of this.blocks) {
        if (rec.state !== 'stored') continue;
        rec.state = 'idle';
        rec.mesh.visible = true;
        this.bodies.place(rec.entry, rec.home, null, true);
      }
    });
  }

  /* ----------------------------------------------------------- balloon --- */

  _bopBalloon(force = 1) {
    const ctx = this.ctx;
    this.tried.balloon = true;
    this.balloonVel.y = 1.45 * force;
    this.balloonVel.x += (Math.random() - 0.5) * 0.55 * force;
    this.balloonVel.z += (Math.random() - 0.5) * 0.35 * force;
    this.balloon.bump(0.5 + force * 0.5);
    this.rally++;
    this.rallyBest = Math.max(this.rallyBest, this.rally);
    snd(ctx, 'bounce', { rate: 1 + this.rally * 0.04 });
    ctx.fx?.burst?.('sparkle', this.balloonPos.clone(), 3);
    ctx.baby?.lookAt?.(this.balloonPos);

    if (this.rally > 0 && this.rally % RALLY_GOAL === 0) {
      snd(ctx, 'tada');
      ctx.fx?.burst?.('confetti', this.balloonPos.clone(), 16);
      ctx.baby?.setMood?.('excited');
      ctx.baby?.gesture?.('clap');
      ctx.ui?.prompt?.('すごい！ ' + this.rally + 'かい つづいたよ', { icon: 'balloon' });
      this._star(1);
      this._bumpHappy(0.07);
    }
  }

  _balloonUpdate(dt) {
    const p = this.balloonPos;
    const v = this.balloonVel;

    // Buoyant drag, not rigid physics: helium lift, heavy quadratic air drag,
    // and a slow wander so it never hangs dead in the air.
    const lift = 0.62;
    v.y += (lift - 0.85) * dt * 9.8 * 0.16;
    const drift = 0.055;
    v.x += Math.sin(this.t * 0.83 + 1.2) * drift * dt;
    v.z += Math.cos(this.t * 0.61) * drift * dt;

    const sp = v.length();
    if (sp > 1e-5) {
      const drag = 1.9 * sp + 0.9;
      v.addScaledVector(v, -Math.min(0.9, drag * dt));
    }

    p.addScaledVector(v, dt);

    const ceil = this.home.y + 1.30;
    const rest = this.home.y + 0.30;
    if (p.y > ceil) { p.y = ceil; v.y = Math.min(0, v.y) * 0.4; this.balloon.bump(0.3); }
    if (p.y < rest) {
      p.y = rest;
      if (v.y < -0.05) { this.balloon.bump(0.4); snd(this.ctx, 'pofu', { gain: 0.4 }); }
      v.y = 0;
      if (this.rally > 0) this.rally = 0;
    }
    this._v2.copy(p).sub(this.home);
    this._v2.y = 0;
    if (this._v2.length() > 0.75) {
      this._v2.normalize();
      const away = this._v2.dot(v);
      if (away > 0) v.addScaledVector(this._v2, -away * 1.5);
    }

    this.balloon.group.position.copy(p);
    this.balloon.group.rotation.z = clamp(-v.x * 0.28, -0.4, 0.4);
    this.balloon.group.rotation.x = clamp(v.z * 0.28, -0.4, 0.4);
    this.balloon.update(dt, this.t);

    // string: the knot is pinned to the balloon, the rest hangs
    this.balloon.group.updateMatrixWorld(true);
    this.balloon.knotAnchor.getWorldPosition(this._v);
    if (this.ropeLocal) {
      this.ropeLocal.pin(0, this._v);
      this.ropeLocal.step(dt);
    } else if (this.ropeHandle) {
      if (typeof this.ropeHandle.pin === 'function') this.ropeHandle.pin(0, this._v);
      else if (this.ropePoints) this.ropePoints[0].copy(this._v);
    }
    if (this.ropePoints) this.ropeMesh.update(this.ropePoints);
  }

  /* --------------------------------------------------------- がっき --- */

  _strikeBar(index) {
    const ctx = this.ctx;
    const bar = this.xylo.bars[index];
    if (!bar) return;
    this.tried.music = true;
    this.xylo.strike(index, 1);
    // one synthesised note, pitched by ratio against the base sample
    snd(ctx, 'xylo', { rate: bar.note.freq / 523.25, gain: 0.7 });
    snd(ctx, 'note', { rate: bar.note.freq / 523.25, gain: 0.5 });
    const p = new THREE.Vector3();
    bar.mesh.getWorldPosition(p);
    ctx.fx?.burst?.('sparkle', p.clone().setY(p.y + 0.03), 3);
    this._beaterTo(index);
    this._feelRhythm();
  }

  _hitDrum(point) {
    const ctx = this.ctx;
    this.tried.music = true;
    const centre = new THREE.Vector3();
    this.drum.group.getWorldPosition(centre);
    const rim = point ? clamp(centre.distanceTo(point) / this.drum.radius, 0, 1) : 0.2;
    this.drum.hit(1 - rim * 0.5);
    snd(ctx, rim > 0.6 ? 'drumRim' : 'drum', { rate: 1 - rim * 0.25, gain: 0.8 });
    ctx.fx?.burst?.('dust', centre.clone().setY(this.home.y + this.drum.shellH + 0.01), 4, { spread: 0.1 });
    ctx.cameraRig?.shake?.(0.035, 0.12);
    this._feelRhythm();
  }

  _beaterTo(index) {
    const bar = this.xylo.bars[index];
    if (!bar) return;
    this.beaterAnim = {
      t: 0,
      from: this.xylo.beater.position.clone(),
      to: new THREE.Vector3(bar.mesh.position.x, 0.075, bar.mesh.position.z)
    };
  }

  _feelRhythm() {
    this.dance = 2.4;
    this._bumpHappy(0.015);
    this.ctx.baby?.setMood?.('happy');
  }

  _musicUpdate(dt) {
    this.xylo.update(dt);
    this.drum.update(dt);

    if (this.beaterAnim) {
      const a = this.beaterAnim;
      a.t = Math.min(1, a.t + dt * 3.4);
      // up, over, and down onto the bar
      const e = a.t < 0.55 ? a.t / 0.55 : 1;
      this._v.copy(a.from).lerp(a.to, e * e * (3 - 2 * e));
      this._v.y += Math.sin(Math.min(1, a.t / 0.55) * Math.PI) * 0.07;
      this.xylo.beater.position.copy(this._v);
      this.xylo.beater.rotation.z = Math.PI / 2 - Math.sin(a.t * Math.PI) * 0.5;
      if (a.t >= 1) this.beaterAnim = null;
    }

    const baby = this.ctx.baby;
    if (this.dance > 0) {
      this.dance -= dt;
      if (baby?.group && this.ballState !== 'chased' && !this.peek) {
        baby.group.rotation.z = Math.sin(this.t * 7.2) * 0.075;
        baby.group.position.y = this.home.y + Math.abs(Math.sin(this.t * 7.2)) * 0.012;
      }
      if (this.dance <= 0 && baby?.group) {
        baby.group.rotation.z = 0;
        baby.group.position.y = this.home.y;
      }
    }
  }

  /* -------------------------------------------------- いないいないばあ --- */

  _peekaboo() {
    if (this.peek) return;
    const ctx = this.ctx;
    this.tried.peek = true;
    const head = ctx.baby?.headWorldPos?.() || this.home.clone().setY(0.5);
    this.peek = { phase: 'hide', t: 0, head: head.clone() };
    this.hanky.mesh.visible = true;
    ctx.baby?.setMood?.('shy');
    snd(ctx, 'whoosh', { gain: 0.4 });
    ctx.ui?.prompt?.('いない いない…', { icon: 'peekaboo' });
  }

  _peekUpdate(dt) {
    if (!this.peek) return;
    const ctx = this.ctx;
    const pk = this.peek;
    pk.t += dt;
    const head = ctx.baby?.headWorldPos?.() || pk.head;
    pk.head.lerp(head, Math.min(1, dt * 12));

    const mesh = this.hanky.mesh;
    const rest = pk.head.clone().add(new THREE.Vector3(0.16, -0.14, 0.12));
    const cover = pk.head.clone().add(new THREE.Vector3(0, 0.012, 0.075));

    let k = 0;
    if (pk.phase === 'hide') {
      k = Math.min(1, pk.t / 0.32);
      if (pk.t > 0.95) {
        pk.phase = 'reveal';
        pk.t = 0;
        snd(ctx, 'baa');
        snd(ctx, 'laugh');
        ctx.baby?.setMood?.('giggle');
        ctx.baby?.gesture?.('clap');
        ctx.fx?.burst?.('confetti', head.clone(), 18);
        ctx.fx?.burst?.('heart', head.clone(), 6);
        ctx.ui?.prompt?.('ばあ！', { icon: 'peekaboo' });
        ctx.cameraRig?.shake?.(0.06, 0.2);
        this._bumpHappy(0.1);
        this._star(1);
      }
    } else {
      k = 1 - Math.min(1, pk.t / 0.28);
      if (pk.t > 0.9) {
        this.peek = null;
        mesh.visible = false;
        ctx.baby?.setMood?.('happy');
        return;
      }
    }

    const e = k * k * (3 - 2 * k);
    mesh.position.copy(rest).lerp(cover, e);
    mesh.rotation.set(-0.25 + e * 0.25, 0, (1 - e) * 0.6);
    mesh.scale.setScalar(0.75 + e * 0.35);

    // the cloth ripples as it is whipped away
    const pos = this.hanky.geo.attributes.position;
    const rest0 = this.hanky.rest;
    for (let i = 0; i < pos.count; i++) {
      const x = rest0[i * 3], y = rest0[i * 3 + 1];
      pos.array[i * 3] = x;
      pos.array[i * 3 + 1] = y;
      pos.array[i * 3 + 2] = Math.sin(x * 26 + this.t * 9) * 0.008 * (1 - e)
        + Math.cos(y * 20 - this.t * 7) * 0.005;
    }
    pos.needsUpdate = true;
    this.hanky.geo.computeVertexNormals();
  }

  /* -------------------------------------------------------------- misc --- */

  _angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, t);
  }

  _after(seconds, fn) {
    (this._timers ||= []).push({ at: this.t + seconds, fn });
  }

  _bumpHappy(d) {
    const ctx = this.ctx;
    const meters = ctx.state?.meters;
    const next = clamp((meters?.happy ?? 0.6) + d, 0, 1);
    if (meters) meters.happy = next;
    ctx.state?.patch?.({ meters: { ...(meters || {}), happy: next } });
    ctx.ui?.meter?.('happy', next);
  }

  _star(n) { this.ctx.ui?.star?.(n); }

  _hintUpdate(dt) {
    this.hintTimer -= dt;
    if (this.hintTimer > 0) return;
    this.hintTimer = 11;

    const ctx = this.ctx;
    const loose = this.blocks.filter((b) => b.state === 'loose').length;
    const options = [];
    if (loose >= 3) options.push({ text: 'おかたづけ しよう', icon: 'toybox', look: this.boxMouth });
    if (!this.tried.ball) options.push({ text: 'ボールを ころころ！', icon: 'ball', look: this.ball.group.position });
    if (!this.tried.blocks) options.push({ text: 'つみきを ぽん！', icon: 'blocks', look: this.towerBase });
    if (!this.tried.balloon) options.push({ text: 'ふうせん ぽーん！', icon: 'balloon', look: this.balloonPos });
    if (!this.tried.music) options.push({ text: 'たたいて おとを だそう', icon: 'music', look: this.xylo.group.position });
    if (!this.tried.peek) options.push({ text: 'あたまを ちょん！', icon: 'peekaboo', look: ctx.baby?.headWorldPos?.() });
    if (!options.length) {
      options.push({ text: 'なにで あそぶ？', icon: 'play', look: this.balloonPos });
    }
    const pick = options[this.hintIndex++ % options.length];
    ctx.ui?.prompt?.(pick.text, { icon: pick.icon });
    if (pick.look) {
      ctx.baby?.lookAt?.(pick.look.clone ? pick.look.clone() : pick.look);
      ctx.baby?.gesture?.('point');
    }
  }

  /* ------------------------------------------------------------ update --- */

  update(dt) {
    if (!this.bodies) return;
    this.t += dt;

    if (this._timers) {
      for (let i = this._timers.length - 1; i >= 0; i--) {
        if (this.t >= this._timers[i].at) {
          const fn = this._timers[i].fn;
          this._timers.splice(i, 1);
          try { fn(); } catch (e) { /* never break the frame */ }
        }
      }
    }

    this.bodies.update(dt);
    this.ball.update(dt);
    this._ballUpdate(dt);
    this._blocksUpdate(dt);
    this._balloonUpdate(dt);
    this._musicUpdate(dt);
    this._peekUpdate(dt);
    this._hintUpdate(dt);

    // keep the peekaboo target glued to the baby's head
    const head = this.ctx.baby?.headWorldPos?.();
    if (head) this.headTarget.position.copy(head);

    /* --- contact shadows -------------------------------------------------- */
    const sh = this.shadows;
    sh.begin();
    for (const rec of this.blocks) {
      if (!rec.mesh.visible) continue;
      sh.add(rec.mesh.position, BLOCK_SIZE * 0.5, this.home.y, rec.state === 'tower' ? 0.85 : 1);
    }
    sh.add(this.ball.group.position, this.ball.radius, this.home.y, 1);
    sh.add(this.balloonPos, this.balloon.radius * 0.8, this.home.y, 0.55);
    if (this.toyBox) sh.add(this.toyBox.group.position, 0.17, this.home.y, 0.8);
    sh.add(this.xylo.group.position, 0.14, this.home.y, 0.7);
    sh.add(this.drum.group.position, 0.09, this.home.y, 0.85);
    sh.end();
  }
}

export default PlayActivity;
