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

    this.room.build(this.ctx);
    await this.baby.build(this.ctx);

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
    }
    this.activityName = name;
    const inst = new def.Class(this.ctx);
    await inst.build?.();
    await inst.enter?.();
    this.activity = inst;

    this.lighting.transitionTo(def.mood || 'day', HARNESS ? 0.001 : 1.4);
    this.cameraRig.goTo(def.camera || 'wide', HARNESS ? 0 : 1.2);
    this.ui.setActivity(name);
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

    /** Advance the simulation by `seconds` of fixed 60Hz steps. */
    async warm(seconds) {
      const dt = 1 / 60;
      const n = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < n; i++) {
        app.step(dt);
        // Render every 6th step so transmission/env probes stay converged
        // without paying full post-processing cost for the whole warm-up.
        if (i % 6 === 0) app.pipeline.render(dt);
      }
    },

    /** Render a few settled frames so TAA-ish passes and bloom stabilise. */
    async settle() {
      for (let i = 0; i < 4; i++) {
        app.pipeline.render(1 / 60);
        await raf();
      }
    },

    stats() {
      const info = app.renderer.info;
      return {
        tier: app.tier,
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
