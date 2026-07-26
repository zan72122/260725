/* ============================================================================
 * app.js — application shell
 * ----------------------------------------------------------------------------
 * Owns the scene graph, the camera rig, the frame loop and the harness API.
 * Gameplay lives in scenes registered through `registerActivity`; this file
 * knows nothing about feeding or bathing beyond "show me activity X".
 * ========================================================================== */

import * as THREE from 'three';
import { RenderPipeline, detectTier, TIER } from './engine/render.js';
import { LightingRig, MOODS } from './engine/lighting.js';
import { CameraRig } from './engine/camera.js';
import { Room } from './world/room.js';
import { Baby } from './character/baby.js';
import { PhysicsWorld } from './engine/physics.js';
import { FX } from './engine/fx.js';
import { Audio } from './engine/audio.js';
import { UI } from './ui/ui.js';
import { State } from './game/state.js';
import { ACTIVITIES } from './activities/index.js';

const HARNESS = new URLSearchParams(location.search).has('harness');

class App {
  constructor() {
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.activity = null;
    this.activityName = '';
    this.time = 0;
    this._paused = false;
  }

  async init() {
    const canvas = document.getElementById('game-canvas');
    this.tier = detectTier();

    this.camera = new THREE.PerspectiveCamera(
      38, window.innerWidth / window.innerHeight, 0.1, 60);
    this.camera.position.set(0, 1.55, 3.5);

    this.pipeline = new RenderPipeline(canvas, this.scene, this.camera, this.tier);
    this.renderer = this.pipeline.renderer;

    this.lighting = new LightingRig(this.renderer, this.scene);
    this.lighting.apply('day');

    this.cameraRig = new CameraRig(this.camera, this.pipeline);

    this.physics = new PhysicsWorld();
    this.fx = new FX(this.scene, this.tier);
    this.audio = new Audio();
    this.state = new State();

    this.room = new Room({ tier: this.tier, fx: this.fx });
    this.scene.add(this.room.group);

    this.baby = new Baby({ tier: this.tier, state: this.state });
    this.scene.add(this.baby.group);

    // Every `space:'subject'` camera preset is composed around this transform
    // unless an activity claims the rig with cameraRig.setSubject().
    this.cameraRig.setDefaultSubject(this.baby.group);

    this.ui = new UI({ app: this });
    await this.ui.init();

    this.ctx = {
      app: this,
      scene: this.scene,
      camera: this.camera,
      cameraRig: this.cameraRig,
      renderer: this.renderer,
      pipeline: this.pipeline,
      lighting: this.lighting,
      physics: this.physics,
      fx: this.fx,
      audio: this.audio,
      ui: this.ui,
      state: this.state,
      room: this.room,
      baby: this.baby,
      tier: this.tier
    };

    // Soft particles need scene depth. Feed them the *resolved* depth target,
    // never the composer's shared attachment — sampling that would recreate
    // the feedback loop the resolve pass exists to break.
    this.fx.setDepthTexture?.(
      this.pipeline.depthResolve.texture, this.camera.near, this.camera.far);

    this.room.build(this.ctx);
    await this.baby.build(this.ctx);

    // The saved / default outfit is authoritative, not whatever baby.build()
    // happened to hardcode. Push it once now and subscribe so every later
    // change — a dress-up pick, a load(), the harness' reset() — reaches the
    // rig. `State.setOutfit` is a diff and stays silent on a no-op, so the
    // write-back from `Baby.setOutfit` cannot loop.
    this.baby.setOutfit(this.state.outfit);
    this.state.on('outfit', ({ outfit }) => this.baby.onState({ outfit }));

    this._bindInput(canvas);

    // Warm the shader cache so the first real frame never hitches.
    this.renderer.compile(this.scene, this.camera);

    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);

    if (HARNESS) installHarness(this);
    return this;
  }

  /* ------------------------------------------------------------- input -- */

  _bindInput(canvas) {
    const send = (type, e) => {
      const t = e.touches?.[0] || e.changedTouches?.[0] || e;
      const p = { x: t.clientX, y: t.clientY, type, raw: e };
      this.ui.onPointer?.(p);
      this.activity?.onPointer?.(p);
    };
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture?.(e.pointerId); send('down', e); });
    canvas.addEventListener('pointermove', e => send('move', e));
    canvas.addEventListener('pointerup', e => send('up', e));
    canvas.addEventListener('pointercancel', e => send('up', e));
    document.addEventListener('visibilitychange', () => {
      this._paused = document.hidden;
      if (!document.hidden) this.clock.getDelta();
    });
  }

  /* ------------------------------------------------------- activities --- */

  async setActivity(name) {
    if (this.activityName === name) return;
    const def = ACTIVITIES[name];
    if (!def) throw new Error('unknown activity: ' + name);

    if (this.activity) {
      await this.activity.exit?.();
      this.activity.dispose?.();
      this.activity = null;
      this._auditDispose();
    }

    // Hand the camera back before the next scene claims it: any preset the
    // outgoing activity re-composed around its own props is dropped, and
    // subject-space presets fall back to the baby root.
    this.cameraRig.restorePresets();
    this.cameraRig.setSubject(null);

    this.activityName = name;
    this._preBuild = this._resourceSnapshot();
    const inst = new def.Class(this.ctx);
    await inst.build?.();
    await inst.enter?.();
    this.activity = inst;

    this.lighting.transitionTo(def.mood || 'day', HARNESS ? 0.001 : 1.4);
    this.cameraRig.goTo(def.camera || 'wide', HARNESS ? 0 : 1.2);
    this.ui.setActivity(name);
  }

  /* ---------------------------------------------- build/dispose auditing - */

  /**
   * Cheap census of everything an activity can leak: GPU objects the renderer
   * is holding and nodes still hanging off the scene graph. `dispose()` is
   * only correct if every one of these returns to what it was before
   * `build()` ran, so `setActivity` samples them either side of the teardown
   * and files the delta on `app.leakLog` (and warns in the console).
   *
   * `renderer.info.render.*` is deliberately *not* used here: it is per-frame
   * and depends on which camera is live, so it says nothing about ownership.
   */
  _resourceSnapshot() {
    let nodes = 0;
    this.scene.traverse(() => nodes++);
    const m = this.renderer.info.memory;
    return {
      name: this.activityName,
      nodes,
      geometries: m.geometries,
      textures: m.textures,
      programs: this.renderer.info.programs?.length ?? 0
    };
  }

  /** Compare the post-dispose census against the one taken before build(). */
  _auditDispose() {
    const before = this._preBuild;
    if (!before) return;
    this._preBuild = null;
    const after = this._resourceSnapshot();
    const delta = {
      activity: before.name,
      nodes: after.nodes - before.nodes,
      geometries: after.geometries - before.geometries,
      textures: after.textures - before.textures
    };
    (this.leakLog ||= []).push(delta);
    // Geometry/texture counts may legitimately settle a little higher the
    // first time a scene runs — materials.js and textures.js memoise shared
    // surfaces on demand — but the scene graph must come back to exactly the
    // size it was, every time. Anything left hanging off it is a hard leak.
    if (delta.nodes !== 0) {
      console.warn(`activity "${before.name}" left ${delta.nodes} scene nodes behind on dispose`);
    }
  }

  /* ------------------------------------------------------------- frame -- */

  step(dt) {
    this.time += dt;
    this.lighting.update(dt);
    this.pipeline.setGrade(this.lighting.currentGrade());
    this.cameraRig.update(dt);
    this.physics.step(dt);
    this.room.update(dt, this.ctx);
    this.baby.update(dt, this.ctx);
    this.activity?.update?.(dt);
    this.fx.update(dt);
    this.ui.update(dt);
    this.lighting.aimAt(this.baby.focusPoint());
    this.pipeline.focusOn(this.baby.focusPoint(), this.cameraRig.focusRange);
  }

  _loop() {
    if (this._paused) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this._harnessDriven) return;   // harness advances the clock itself
    this.step(dt);
    this.pipeline.render(dt);
  }
}

/* ------------------------------------------------------------- harness --- */

/**
 * Deterministic control surface used by tools/shoot.mjs and by the visual
 * critic loop. Nothing here runs in a normal play session.
 */
function installHarness(app) {
  app._harnessDriven = true;
  let frame = 0;

  const raf = () => new Promise(r => requestAnimationFrame(() => r()));

  const G = {
    ready: false,
    app,

    async reset() {
      // Tear the live activity down *first*, and force the rebuild below.
      // `baby.reset()` puts the character back at the world origin, but only
      // an activity's `enter()` knows where that activity wants it — so
      // resetting while `setActivity('play')` was a no-op used to leave the
      // baby at the origin with the play props still out on the rug, and every
      // shot that followed inherited that mismatch.
      if (app.activity) {
        await app.activity.exit?.();
        app.activity.dispose?.();
        app.activity = null;
        app._auditDispose();
      }
      app.activityName = '';
      app.cameraRig.restorePresets();
      app.cameraRig.setSubject(null);

      app.state.reset();
      app.time = 0;
      app.baby.reset?.();
      app.room.reset?.();
      app.fx.clear();
      await this.setScene('play');
    },

    async setScene(name) {
      await app.setActivity(name);
    },

    async setState(patch) {
      app.state.patch(patch);
      app.activity?.onState?.(patch);
      app.baby.onState?.(patch);
      app.room.onState?.(patch);
    },

    async setCamera(preset) {
      app.cameraRig.goTo(preset, 0);
    },

    setHud(v) {
      document.getElementById('hud')?.classList.toggle('harness-hidden', !v);
      document.getElementById('title-screen')?.classList.add('hidden');
    },

    /**
     * Advance the simulation by `seconds` of fixed 60Hz steps.
     *
     * Simulation is cheap; rendering under SwiftShader is not (~0.7 s/frame).
     * A still only needs the *final* frame to be right, so we simulate the
     * whole warm-up but render only near the end — once to let transmission
     * and env probes resolve against a settled scene, then the final state.
     */
    async warm(seconds) {
      const dt = 1 / 60;
      const n = Math.max(1, Math.round(seconds / dt));
      const renderAt = new Set([Math.max(0, n - 10), n - 1]);
      for (let i = 0; i < n; i++) {
        app.step(dt);
        if (renderAt.has(i)) app.pipeline.render(dt);
      }
    },

    /** Render a settled frame so bloom and transmission stabilise. */
    async settle() {
      for (let i = 0; i < 2; i++) {
        app.pipeline.render(1 / 60);
        await raf();
      }
    },

    /** Everything `app.setActivity` recorded about build/dispose symmetry. */
    leaks() { return (app.leakLog || []).slice(); },

    stats() {
      const info = app.renderer.info;
      let nodes = 0;
      app.scene.traverse(() => nodes++);
      return {
        tier: app.tier,
        nodes,
        calls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        programs: app.renderer.info.programs?.length ?? 0
      };
    }
  };

  window.__GAME__ = G;
  requestAnimationFrame(() => { G.ready = true; });
}

/* ---------------------------------------------------------------- boot --- */

const app = new App();
window.__APP__ = app;

app.init().then(() => {
  document.getElementById('boot-error')?.remove();
}).catch(err => {
  console.error(err);
  const el = document.createElement('pre');
  el.id = 'boot-error';
  el.style.cssText = 'position:fixed;inset:0;z-index:999;background:#300;color:#fdd;padding:16px;font:12px monospace;white-space:pre-wrap;overflow:auto';
  el.textContent = 'BOOT ERROR\n' + (err.stack || err.message);
  document.body.appendChild(el);
});

export { app };
