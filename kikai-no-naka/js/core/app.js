/**
 * app.js — 全体のまとめ役
 *
 * レンダラー・ステージ・カメラ・入力・音・UI・機械 をつなぎ、
 * 毎フレームの流れを組み立てる。
 *
 * 1フレームの流れ:
 *   入力（イベント駆動）→ 機械の物理（固定ステップ）→ 見た目の追従
 *   → カメラ → ヒント → ポストプロセス → 描画
 */

import * as THREE from 'three';
import { View } from './view.js';
import { Stage } from './stage.js';
import { CameraRig } from './camera.js';
import { InputManager } from './input.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { AdaptiveQuality, detectTier } from './quality.js';
import { MaterialLibrary } from '../lib/materials.js';
import { Hints } from '../lib/hints.js';
import { xrayUniforms } from '../lib/xray.js';
import { MACHINES, MACHINE_BY_ID } from '../machines/index.js';
import { clamp01, ease } from '../lib/math.js';

const STORAGE_KEY = 'kikai-no-naka:v1';

export class App {
  /**
   * @param {object} refs
   * @param {HTMLCanvasElement} refs.canvas
   * @param {HTMLElement} refs.uiRoot
   * @param {HTMLElement} refs.boot
   */
  constructor(refs) {
    this.canvas = refs.canvas;
    this.uiRoot = refs.uiRoot;
    this.bootEl = refs.boot;

    this.prefs = loadPrefs();
    this.tier = this.prefs.quality === false ? 'low' : detectTier();

    this.view = new View(this.canvas, this.tier);
    this.stage = new Stage(this.view.renderer, this.tier);
    this.rig = new CameraRig(this.stage.camera);
    this.view.attach(this.stage.scene, this.stage.camera);

    this.audio = new AudioEngine();
    this.audio.enabled = this.prefs.sound !== false;
    this.audio.speechEnabled = this.prefs.speech !== false;

    this.input = new InputManager(this.canvas, this.stage.camera, this.rig);
    this.hints = new Hints(this.stage.pivot, this.stage.camera);

    this.ui = new UI(this.uiRoot, {
      select: (id) => this.setMachine(id),
      xray: (v) => this.setXray(v),
      xrayEnd: () => this.savePrefs(),
      reset: () => this.resetMachine(),
      sound: (on) => {
        this.audio.setEnabled(on);
        this.prefs.sound = on;
        this.savePrefs();
        if (on) this.audio.chime(720, { gain: 0.12 });
      },
      speech: (on) => {
        this.audio.setSpeechEnabled(on);
        this.prefs.speech = on;
        this.savePrefs();
      },
      hints: (on) => {
        this.prefs.hints = on;
        this.savePrefs();
        this.hints.setVisible(on);
        this._hintsAllowed = on;
      },
      quality: (on) => {
        this.prefs.quality = on;
        this.savePrefs();
        this.adaptive.lock();
        this.setTier(on ? detectTier() : 'low');
      },
    });

    this.adaptive = new AdaptiveQuality(this.tier, (t) => this.setTier(t, true));

    /** @type {import('../machines/base.js').Machine|null} */
    this.machine = null;
    this.materials = null;
    this._transition = null;
    this._hintsAllowed = this.prefs.hints !== false;
    this._idleForHints = 0;
    this._lastSpoken = { text: '', time: -10 };
    this._meterTimer = 0;
    this._contentRectDirty = true;
    this._clock = new THREE.Clock();
    this._running = false;
    this._xray = this.prefs.xray ?? 0;

    this._wireInput();
    this._wireWindow();

    this.ui.setMachines(MACHINES.map((M) => M.meta));
    this.ui.optSpeech.checked = this.prefs.speech !== false;
    this.ui.optHints.checked = this._hintsAllowed;
    this.ui.optQuality.checked = this.prefs.quality !== false;
    this.ui.setSound(this.prefs.sound !== false);
    this.ui.setXray(this._xray);
    this.ui.setNote(`えがき かんど: ${this.tier}`);
  }

  /* ---------------------------------------------------------------- */
  /* 入力の配線                                                        */
  /* ---------------------------------------------------------------- */

  _wireInput() {
    this.input.onAnyInput = () => {
      this._idleForHints = 0;
      this.audio.unlock();
    };

    this.input.onGrabStart = (handle, point) => {
      this.hints.markTouched(handle.id);
      if (handle.label && point) {
        this.hints.say(handle.label, point, { duration: handle.type === 'pluck' ? 1.1 : 2.2 });
        this._maybeSpeak(handle.label);
      }
    };

    this.input.onDoubleTap = () => {
      this.rig.home();
    };

    this.input.onBackgroundTap = () => {
      this.hints.hideBubbles();
    };
  }

  _maybeSpeak(text) {
    const now = performance.now() / 1000;
    if (text === this._lastSpoken.text && now - this._lastSpoken.time < 2.4) return;
    this._lastSpoken = { text, time: now };
    this.audio.speak(text);
  }

  _wireWindow() {
    const onResize = () => {
      this._contentRectDirty = true;
      this.resize();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(onResize, 60);
      setTimeout(onResize, 320);
    });
    window.visualViewport?.addEventListener('resize', onResize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.audio.suspend();
        this._running = false;
      } else {
        this.audio.resume();
        if (!this._running) this.start();
      }
    });

    // ページ全体のスクロールやピンチを止める（iOS 対策）
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  }

  /* ---------------------------------------------------------------- */
  /* 機械の入れ替え                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * @param {string} id
   * @param {boolean} immediate
   */
  setMachine(id, immediate = false) {
    const Cls = MACHINE_BY_ID.get(id) || MACHINES[0];
    if (this.machine && this.machine.constructor === Cls) return;

    const previous = this.machine;
    if (previous) {
      this._transition = { t: 0, out: previous, outMaterials: this.materials, in: null };
      this.stage.pivot.remove(previous.root);
      this._pendingDispose = { machine: previous, materials: this.materials };
    }

    this.audio.clearVoices();
    this.hints.clear();

    const materials = new MaterialLibrary({ tier: this.tier });
    const machine = new Cls({
      materials,
      audio: this.audio,
      stage: this.stage,
      tier: this.tier,
    });
    machine.build();
    machine.setXray(this._xray);
    // 「ポンッ」と何かが飛び出したら、カメラを少し揺らす
    machine.onPop = () => this.rig.kick(0.9);

    this.materials = materials;
    this.machine = machine;
    this.stage.pivot.add(machine.root);

    // 見た目の設定
    const meta = Cls.meta;
    this.stage.setBackdropTheme(meta.backdrop, immediate);
    this.stage.setContactShadow(machine.footprint.w, machine.footprint.d, machine.footprint.opacity);
    if (meta.bloom) this.view.setBloom(meta.bloom);
    else this.view.setBloom({ strength: 0.30, radius: 0.45, threshold: 1.0 });

    // 入力とヒント
    this.input.setInteractives(machine.handles.map((h) => ({ object: h.object, handle: h })));
    this._buildHints(machine);

    this.rig.setTarget(machine.center, immediate);
    this.rig.home(immediate);
    this._contentRectDirty = true;
    this.resize();

    this.ui.setActiveMachine(id);
    this.ui.setMeters(machine.meters());

    this.prefs.machine = id;
    this.savePrefs();

    if (!immediate) {
      this._transition = this._transition || { t: 0, out: null, outMaterials: null };
      this._transition.in = machine;
      machine.root.scale.setScalar(0.55);
      this.audio.chime(660, { gain: 0.13 });
    }
  }

  _buildHints(machine) {
    for (const h of machine.handles) {
      if (!h.hint) continue;
      this.hints.add(h.id, {
        kind: h.hint.kind,
        anchor: h.hint.anchor || h.object,
        offset: h.hint.offset,
        axis: h.hint.axis || h.axis,
        size: h.hint.size,
        color: h.hint.color ?? machine.constructor.meta.accent,
        reverse: h.hint.reverse,
      });
    }
    this.hints.setVisible(this._hintsAllowed);
  }

  resetMachine() {
    if (!this.machine) return;
    this.machine.reset();
    this.rig.home();
    this.audio.chime(560, { gain: 0.12 });
    this.hints.reoffer();
    this.hints.setVisible(this._hintsAllowed);
  }

  setXray(v) {
    this._xray = clamp01(v);
    xrayUniforms.uXray.value = this._xray;
    this.machine?.setXray(this._xray);
    this.prefs.xray = this._xray;
  }

  setTier(tier, fromAdaptive = false) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.view.setTier(tier);
    this.stage.setTier(tier);
    this.ui.setNote(`えがき かんど: ${tier}${fromAdaptive ? '（じどう ちょうせい）' : ''}`);
    // マテリアルの作り直しが要るので、機械を組み直す
    const id = this.machine?.constructor.meta.id;
    if (id) {
      const keepXray = this._xray;
      this._disposeCurrent();
      this.machine = null;
      this.setMachine(id, true);
      this.setXray(keepXray);
    }
  }

  _disposeCurrent() {
    if (this.machine) {
      this.stage.pivot.remove(this.machine.root);
      this.machine.dispose();
    }
    this.materials?.dispose();
    this.materials = null;
  }

  /* ---------------------------------------------------------------- */
  /* サイズ                                                            */
  /* ---------------------------------------------------------------- */

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.view.setSize(w, h);
    this.ui.layout(w, h);
    this.input.updateRect();
    this._contentRect = this.ui.contentRect(w, h);
    if (this.machine) {
      this.rig.frame(this.machine.radius, this._contentRect, w, h, 1.08);
    }
    this._contentRectDirty = false;
  }

  /* ---------------------------------------------------------------- */
  /* ループ                                                            */
  /* ---------------------------------------------------------------- */

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.getDelta();
    const loop = () => {
      if (!this._running) return;
      this._frame = requestAnimationFrame(loop);
      this.frame();
    };
    this._frame = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._frame);
  }

  frame() {
    const dt = Math.min(this._clock.getDelta(), 0.05);
    const t = this._clock.elapsedTime;
    this.adaptive.sample(dt);

    xrayUniforms.uTime.value = t;

    // 機械の更新
    if (this.machine) this.machine.tick(dt);

    // 入れ替えの演出
    this._updateTransition(dt);

    // カメラ
    this.rig.update(dt, { interacting: this.input.isInteracting });
    this.stage.update(dt);
    this.hints.update(dt);

    // 案内マークの出し直し
    this._idleForHints += dt;
    if (this._hintsAllowed && this._idleForHints > 20) {
      this._idleForHints = -30; // しばらく出したら、また待つ
      this.hints.reoffer();
    }

    // メーターは目に追える速さで十分
    this._meterTimer -= dt;
    if (this._meterTimer <= 0 && this.machine) {
      this._meterTimer = 1 / 14;
      this.ui.updateMeterValues(this.machine.meters());
    }

    this.view.render(t);
  }

  _updateTransition(dt) {
    const tr = this._transition;
    if (!tr) return;
    tr.t += dt / 0.42;
    const k = Math.min(1, tr.t);

    if (tr.out) {
      const s = 1 - ease.inOutCubic(k) * 0.55;
      tr.out.root.scale.setScalar(s);
      tr.out.root.position.y = -ease.inOutCubic(k) * 0.06;
    }
    if (tr.in) {
      const s = 0.55 + ease.outBack(clamp01((k - 0.18) / 0.82)) * 0.45;
      tr.in.root.scale.setScalar(Math.min(1, s));
      tr.in.root.position.y = (1 - clamp01((k - 0.18) / 0.82)) * -0.02;
    }

    if (k >= 1) {
      if (this._pendingDispose) {
        this._pendingDispose.machine.dispose();
        this._pendingDispose.materials?.dispose();
        this._pendingDispose = null;
      }
      if (tr.in) {
        tr.in.root.scale.setScalar(1);
        tr.in.root.position.y = 0;
      }
      this._transition = null;
    }
  }

  /* ---------------------------------------------------------------- */

  savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      /* プライベートモードなどでは保存しない */
    }
  }

  /** 起動時の最初の 1 回 */
  async boot() {
    const first = this.prefs.machine && MACHINE_BY_ID.has(this.prefs.machine) ? this.prefs.machine : MACHINES[0].meta.id;
    this.setMachine(first, true);
    this.setXray(this._xray);
    this.resize();

    // シェーダのコンパイルを先に済ませて、最初のフレームのカクつきを防ぐ
    await new Promise((r) => setTimeout(r, 0));
    try {
      this.view.renderer.compile(this.stage.scene, this.stage.camera);
    } catch {
      /* compile が使えなくても致命的ではない */
    }
    this.start();
  }
}

/* ------------------------------------------------------------------ */

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* 読めなければ既定値 */
  }
  return {};
}
