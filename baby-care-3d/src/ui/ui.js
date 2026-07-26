/* ============================================================================
 * ui.js — HUD, prompts, praise, world labels, sticker album
 * ----------------------------------------------------------------------------
 * The whole UI is DOM (the 3D layer stays clean) and every symbol is vector art
 * from icons.js — no emoji anywhere. Nothing here reads text to progress: the
 * icons, animation and audio carry the meaning, the words are decoration for
 * the grown-ups.
 *
 * Everything time-based is driven from `update(dt)` rather than setTimeout, so
 * the screenshot harness (which advances a fixed clock) sees the same frames a
 * real player would.
 * ========================================================================== */

import * as THREE from 'three';
import {
  icon, sticker as stickerArt, paw,
  STICKER_IDS, STICKER_NAMES, ACTIVITY_ICON
} from './icons.js';
import { LOW, METERS } from '../game/state.js';

/** Mood palette per activity — re-themes the HUD along with the lighting. */
const ACTIVITY_MOOD = {
  feed: 'golden',
  bath: 'evening',
  dress: 'day',
  play: 'golden',
  sleep: 'night'
};

const ACTIVITY_LABEL = {
  feed: 'ごはん', bath: 'おふろ', dress: 'きせかえ', play: 'あそぶ', sleep: 'ねんね'
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp01 = (v) => Math.min(1, Math.max(0, typeof v === 'number' && isFinite(v) ? v : 0));

export class UI {
  constructor({ app }) {
    this.app = app;
    this.state = app.state;
    this.harness = new URLSearchParams(location.search).has('harness');

    this.activity = '';
    this.started = false;

    this._time = 0;
    this._timers = [];        // { t, fn }
    this._labels = [];        // world-anchored DOM labels
    this._flights = [];       // stars flying to the counter
    this._trails = [];        // fading trail dots
    this._needAcc = 0;
    this._pendingStars = null;
    this._newStickers = 0;
    this._audioUnlocked = false;
    this._v = new THREE.Vector3();
  }

  /* ============================================================== init == */

  async init() {
    const els = this.els = {
      hud: $('#hud'),
      title: $('#title-screen'),
      start: $('#start-btn'),
      meters: {},
      starBox: $('#star-box'),
      starCount: $('#star-count'),
      soundBtn: $('#sound-btn'),
      bookBtn: $('#book-btn'),
      bookPip: $('#book-pip'),
      actBar: $('#act-bar'),
      acts: {},
      ctxTray: $('#ctx-tray'),
      prompt: $('#prompt'),
      promptText: $('#prompt-text'),
      promptIcon: $('#prompt .prompt__icon'),
      toastLayer: $('#toast-layer'),
      labelLayer: $('#label-layer'),
      fxLayer: $('#fx-layer'),
      album: $('#album'),
      albumPages: $('#album-pages'),
      albumBar: $('#album-bar'),
      albumCount: $('#album-count'),
      albumClose: $('#album-close')
    };

    for (const m of $$('.meter')) els.meters[m.dataset.meter] = m;
    for (const a of $$('.act', els.actBar)) els.acts[a.dataset.act] = a;

    this.paintIcons(document);
    this._buildAlbum();
    this._bind();

    /* Mirror the saved profile onto the HUD. */
    for (const name of METERS) this._paintMeter(name, this.state.meters[name]);
    this._paintStars(this.state.stars, false);
    this._paintSound();
    this._refreshAlbum();
    this._refreshNeeds(true);

    this._bindState();

    /* Frame the baby inside the title screen's soft reveal window. */
    try { this.app.cameraRig?.goTo?.('title', 0); } catch { /* preset optional */ }

    /* The harness only hides the title screen; keep the HUD in step with it. */
    this._titleObserver = new MutationObserver(() => {
      const hidden = els.title?.classList.contains('hidden');
      els.hud.classList.toggle('is-on', !!hidden);
      if (hidden) this.started = true;
    });
    if (els.title) this._titleObserver.observe(els.title, { attributes: true, attributeFilter: ['class'] });

    addEventListener('pagehide', () => this.state.flush?.());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.state.flush?.(); });
    addEventListener('resize', () => { this._layoutLabels(); });

    return this;
  }

  /** Replace every `[data-icon="name"]` placeholder with real vector art. */
  paintIcons(root = document) {
    for (const el of $$('[data-icon]', root)) {
      if (el.dataset.painted === '1') continue;
      el.innerHTML = icon(el.dataset.icon);
      el.dataset.painted = '1';
    }
  }

  /* ------------------------------------------------------------ wiring -- */

  _bind() {
    const press = (el, fn) => {
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('is-press');
        this._unlockAudio();
        fn(e);
      };
      const up = () => el.classList.remove('is-press');
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      /* Keyboard / assistive tech still work through click. */
      el.addEventListener('click', (e) => { e.preventDefault(); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
      });
    };

    if (this.els.start) press(this.els.start, () => this.startGame());

    for (const [name, btn] of Object.entries(this.els.acts)) {
      press(btn, () => this.pickActivity(name));
    }

    if (this.els.soundBtn) press(this.els.soundBtn, () => {
      this.state.setMuted(!this.state.muted);
      if (!this.state.muted) this._sfx('tap');
    });

    if (this.els.bookBtn) press(this.els.bookBtn, () => this.openAlbum());
    if (this.els.albumClose) press(this.els.albumClose, () => this.closeAlbum());
    if (this.els.album) {
      this.els.album.addEventListener('pointerdown', (e) => {
        if (e.target === this.els.album) this.closeAlbum();
      });
    }
  }

  _bindState() {
    const s = this.state;
    s.on('meter', ({ name, value }) => { this._paintMeter(name, value); this._refreshNeeds(); });
    s.on('star', ({ stars, delta }) => {
      if (delta <= 0) { this._paintStars(stars, false); return; }
      /* While stars are in the air the counter ticks up as each one lands. */
      if (this._flights.length) return;
      /* Otherwise give ui.star() a beat to launch a flight before snapping. */
      this._cancelStarSync?.();
      this._cancelStarSync = this.after(0.3, () => {
        this._cancelStarSync = null;
        if (!this._flights.length) this._paintStars(this.state.stars, true);
      });
    });
    s.on('sticker', ({ id }) => this._onStickerUnlocked(id));
    s.on('muted', () => this._paintSound());
    s.on('reset', () => {
      this._refreshAlbum();
      this._refreshNeeds(true);
      this._paintStars(s.stars, false);
    });
  }

  /* ============================================================= frame == */

  update(dt) {
    if (!(dt > 0)) dt = 0;
    this._time += dt;

    /* Needs drift on the same clock as the render loop — but only once the
       child is actually playing, never while the title screen is up. */
    if (this.started) this.state.update?.(dt);

    /* Scheduled work (toast lifetimes, celebration beats, …). */
    if (this._timers.length) {
      for (let i = this._timers.length - 1; i >= 0; i--) {
        const t = this._timers[i];
        t.t -= dt;
        if (t.t <= 0) { this._timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } }
      }
    }

    this._layoutLabels();
    this._stepFlights(dt);

    this._needAcc += dt;
    if (this._needAcc > 0.4) { this._needAcc = 0; this._refreshNeeds(); }
  }

  /** Run `fn` after `seconds` of game time. */
  after(seconds, fn) {
    const t = { t: Math.max(0, seconds), fn };
    this._timers.push(t);
    return () => { const i = this._timers.indexOf(t); if (i >= 0) this._timers.splice(i, 1); };
  }

  /* =========================================================== title === */

  startGame() {
    if (this.started) return;
    this.started = true;
    this._unlockAudio();
    this._sfx('start');
    this.els.title?.classList.add('hidden');
    this.els.hud.classList.add('is-on');
    const p = this.app.setActivity?.('play');
    if (p && typeof p.catch === 'function') p.catch((err) => console.error('[ui] first activity failed', err));
    this.after(1.1, () => this.prompt('あかちゃんと あそぼう！', { icon: 'balloon' }));
  }

  showTitle() {
    this.started = false;
    this.els.title?.classList.remove('hidden');
    this.els.hud.classList.remove('is-on');
  }

  /* ======================================================== activities == */

  /** A care button was pressed. */
  pickActivity(name) {
    this._sfx('tap');
    /* Clear the previous scene's chrome *before* the switch, so whatever the
       incoming activity sets up in enter() survives. */
    this.clearTools();
    this.hidePrompt();
    this.clearLabels();
    this.setActivity(name);
    const p = this.app.setActivity?.(name);
    if (p && typeof p.catch === 'function') p.catch((err) => console.error('[ui] activity failed', err));
  }

  /** Reflect the active activity (also called back by App#setActivity). */
  setActivity(name) {
    if (this.activity === name) return;
    this.activity = name;
    for (const [key, btn] of Object.entries(this.els.acts)) {
      btn.classList.toggle('is-active', key === name);
    }
    this.setMood(ACTIVITY_MOOD[name] || 'day');
  }

  /** Drop every transient hint (prompt, tools, world labels) at once. */
  clearAll() {
    this.clearTools();
    this.hidePrompt();
    this.clearLabels();
  }

  /** Re-theme the HUD palette. 'day' | 'golden' | 'evening' | 'night' */
  setMood(name) {
    document.body.dataset.mood = name || 'day';
  }

  /** Canvas pointer stream from App#_bindInput. */
  onPointer(p) {
    if (!p) return;
    this._lastPointer = { x: p.x, y: p.y };
    if (p.type === 'down') this._unlockAudio();
  }

  /* ============================================================ meters == */

  /**
   * Set a need. Writes through to State (which clamps, saves and re-emits),
   * so `ui.meter('food', 1)` is a complete "the baby is full" statement.
   */
  meter(name, value) {
    if (!METERS.includes(name)) return;
    this.state.setMeter(name, value);
    this._paintMeter(name, this.state.meters[name]);
  }

  _paintMeter(name, value) {
    const el = this.els?.meters?.[name];
    if (!el) return;
    const v = clamp01(value);
    el.style.setProperty('--v', v.toFixed(3));
    el.classList.toggle('is-low', v < LOW);
  }

  /** Badge the care buttons whose need is running low. */
  _refreshNeeds(force = false) {
    const needy = new Set(this.state.needyActivities?.() || []);
    for (const [key, btn] of Object.entries(this.els.acts)) {
      const want = needy.has(key);
      if (force || btn.classList.contains('is-needy') !== want) {
        btn.classList.toggle('is-needy', want);
      }
    }
  }

  /* ============================================================= stars == */

  /**
   * Award stars. `from` may be a THREE.Object3D, a THREE.Vector3, a screen
   * point {x,y} or nothing (the last touch / screen centre is used), and the
   * star arcs from there into the counter.
   *
   *   ui.star()                       → +1 from the last touch
   *   ui.star(3, { from: baby.group })→ +3 arcing off the baby
   *   ui.star(12, { absolute: true }) → set the counter to 12 (debug/harness)
   */
  star(n = 1, opts = {}) {
    if (opts.absolute) { this.state.setStars(n); return this.state.stars; }

    const value = Math.max(0, Math.round(Number(n) || 0));
    if (!value) return this.state.stars;

    /* Some callers (activities/_shared.js `award()`) patch State first and then
       hand us the new *total*; others hand us a delta. If the number we were
       given is exactly the total State just moved to, it is an echo — animate
       it, but do not double-count. */
    const echo = value === this.state.stars && this.state.starChangedWithin?.(0.6);
    const delta = echo ? Math.max(1, this.state.lastStarDelta || 1) : value;

    this._sfx('star');
    this._flyStar(opts.from ?? opts.at, delta);
    if (!echo) this.state.addStars(delta);
    return this.state.stars;
  }

  /** Absolute setter, kept separate from the award animation. */
  setStars(total) { this.state.setStars(total); }

  _paintStars(total, bump) {
    const el = this.els?.starCount;
    if (!el) return;
    el.textContent = String(total);
    if (!bump) return;
    const box = this.els.starBox;
    box.classList.remove('is-bump');
    void box.offsetWidth;
    box.classList.add('is-bump');
  }

  _flyStar(from, delta) {
    const target = this._elCenter(this.els.starBox?.querySelector('.star-box__icon'));
    const p0 = this._toScreen(from) || this._lastPointer || { x: innerWidth / 2, y: innerHeight * 0.45 };
    this._cancelStarSync?.();
    this._cancelStarSync = null;
    if (this.harness || !target) {
      this.after(0.02, () => this._paintStars(this.state.stars, true));
      return;
    }

    /* One star per point, staggered and jittered so a batch reads as a burst. */
    const n = Math.min(delta, 5);
    const lift = Math.max(90, innerHeight * 0.16);
    for (let i = 0; i < n; i++) {
      const jx = (i - (n - 1) / 2) * 26;
      const jy = (i % 2 ? -1 : 1) * i * 12;
      const el = document.createElement('div');
      el.className = 'star-fly';
      el.innerHTML = icon('star');
      el.style.transform = `translate(${p0.x + jx}px, ${p0.y + jy}px) scale(0)`;
      this.els.fxLayer.appendChild(el);

      const start = { x: p0.x + jx, y: p0.y + jy };
      this._flights.push({
        el, t: 0, dur: 0.92, trail: 0, delay: i * 0.13,
        p0: start,
        c: {
          x: (start.x + target.x) / 2 + jx,
          y: Math.min(start.y, target.y) - lift - i * 14
        },
        p1: target
      });
    }
  }

  _stepFlights(dt) {
    for (let i = this._flights.length - 1; i >= 0; i--) {
      const f = this._flights[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      const e = u * u * (3 - 2 * u);               // smoothstep
      const iv = 1 - e;
      const x = iv * iv * f.p0.x + 2 * iv * e * f.c.x + e * e * f.p1.x;
      const y = iv * iv * f.p0.y + 2 * iv * e * f.c.y + e * e * f.p1.y;
      const scale = 1.25 - 0.6 * e;
      f.el.style.transform = `translate(${x}px, ${y}px) rotate(${e * 420}deg) scale(${scale})`;

      f.trail -= dt;
      if (f.trail <= 0 && u < 0.92) {
        f.trail = 0.045;
        this._spawnTrail(x, y);
      }

      if (u >= 1) {
        f.el.remove();
        this._flights.splice(i, 1);
        /* Each landing star ticks the counter up by one. */
        const shown = parseInt(this.els.starCount?.textContent, 10) || 0;
        const next = this._flights.length ? Math.min(this.state.stars, shown + 1) : this.state.stars;
        this._pendingStars = null;
        this._paintStars(next, true);
        this._sfx('chime');
      }
    }

    for (let i = this._trails.length - 1; i >= 0; i--) {
      const t = this._trails[i];
      t.t += dt;
      const u = t.t / 0.5;
      if (u >= 1) { t.el.remove(); this._trails.splice(i, 1); continue; }
      t.el.style.opacity = String(1 - u);
      t.el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${1 - u * 0.7})`;
    }
  }

  _spawnTrail(x, y) {
    const el = document.createElement('div');
    el.className = 'star-trail';
    el.style.transform = `translate(${x}px, ${y}px)`;
    this.els.fxLayer.appendChild(el);
    this._trails.push({ el, x, y, t: 0 });
  }

  /* ========================================================== stickers == */

  /**
   * Unlock (or re-show) a sticker. Accepts an id from STICKER_IDS or an index.
   * Returns the sticker id, or null when the id is unknown.
   */
  sticker(id) {
    const key = typeof id === 'number' ? STICKER_IDS[id] : id;
    if (!key || !STICKER_IDS.includes(key)) return null;
    if (!this.state.hasSticker(key)) this.state.unlockSticker(key);   // fires _onStickerUnlocked
    else this._markNewSticker(key);
    return key;
  }

  _onStickerUnlocked(id) {
    this._refreshAlbum();
    this._markNewSticker(id);
    this._newStickers++;
    this.els.bookBtn?.classList.add('has-new');
    if (this.els.bookPip) this.els.bookPip.textContent = String(this._newStickers);
    if (this.harness) return;

    this._sfx('tada');
    this.toast('あたらしい シール！', { icon: 'star', seconds: 2.4 });
    this.after(1.5, () => this.openAlbum());
  }

  _markNewSticker(id) {
    const slot = this.els.albumPages?.querySelector(`.slot[data-id="${id}"]`);
    if (!slot) return;
    for (const s of $$('.slot.is-new', this.els.albumPages)) s.classList.remove('is-new');
    void slot.offsetWidth;
    slot.classList.add('is-new');
  }

  _buildAlbum() {
    const pages = this.els.albumPages;
    if (!pages) return;
    pages.innerHTML = '';
    for (const id of STICKER_IDS) {
      const slot = document.createElement('div');
      slot.className = 'slot is-locked';
      slot.dataset.id = id;
      slot.innerHTML =
        `<div class="slot__art">${paw()}</div>` +
        `<span class="slot__name">?</span>`;
      pages.appendChild(slot);
    }
  }

  _refreshAlbum() {
    const pages = this.els.albumPages;
    if (!pages) return;
    const owned = new Set(this.state.stickers);
    for (const slot of $$('.slot', pages)) {
      const id = slot.dataset.id;
      const has = owned.has(id);
      slot.classList.toggle('is-unlocked', has);
      slot.classList.toggle('is-locked', !has);
      const art = slot.querySelector('.slot__art');
      const name = slot.querySelector('.slot__name');
      const want = has ? 'art' : 'paw';
      if (slot.dataset.render !== want) {
        art.innerHTML = has ? stickerArt(id) : paw();
        slot.dataset.render = want;
      }
      name.textContent = has ? (STICKER_NAMES[id] || '') : '?';
    }
    const total = STICKER_IDS.length;
    const got = this.state.stickers.length;
    if (this.els.albumBar) this.els.albumBar.style.width = ((got / total) * 100).toFixed(1) + '%';
    if (this.els.albumCount) this.els.albumCount.textContent = `${got} / ${total}`;
  }

  openAlbum() {
    if (!this.els.album) return;
    this._refreshAlbum();
    this.els.album.classList.add('is-open');
    this._newStickers = 0;
    this.els.bookBtn?.classList.remove('has-new');
    this._sfx('chime');
  }

  closeAlbum() {
    this.els.album?.classList.remove('is-open');
    for (const s of $$('.slot.is-new', this.els.albumPages)) s.classList.remove('is-new');
    this._sfx('tap');
  }

  /* ====================================================== prompt/toast == */

  /**
   * The gentle "what to do next" hint. Slides in with a bobbing arrow and
   * stays until the step is done (or `seconds` elapse).
   */
  prompt(text, { icon: iconName = 'heart', seconds = 0, arrow = true } = {}) {
    const el = this.els.prompt;
    if (!el) return;
    this.els.promptText.textContent = text || '';
    if (this.els.promptIcon) {
      this.els.promptIcon.innerHTML = icon(iconName) || icon('heart');
    }
    el.querySelector('.prompt__arrow')?.style.setProperty('display', arrow ? '' : 'none');
    el.classList.add('is-on');
    this._promptTimer?.();
    this._promptTimer = seconds > 0 ? this.after(seconds, () => this.hidePrompt()) : null;
    this._sfx('pop');
  }

  hidePrompt() {
    this._promptTimer?.();
    this._promptTimer = null;
    this.els.prompt?.classList.remove('is-on');
  }

  /** Praise. Springs in at the top, floats away by itself. */
  toast(text, { icon: iconName = 'check', seconds = 1.8 } = {}) {
    const layer = this.els.toastLayer;
    if (!layer) return null;
    while (layer.children.length > 2) layer.firstElementChild.remove();

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast__icon">${icon(iconName) || icon('check')}</span><span>${escapeHtml(text)}</span>`;
    layer.appendChild(el);

    this.after(Math.max(0.4, seconds), () => {
      el.classList.add('is-out');
      this.after(0.42, () => el.remove());
    });
    return el;
  }

  /* ======================================================= world labels = */

  /**
   * A DOM label pinned to a 3D object, re-projected every frame.
   *   const hint = ui.worldLabel(tapTarget, 'ここをタップ', { icon: 'arrowDown' });
   *   hint.remove();
   */
  worldLabel(object3D, text, opts = {}) {
    const {
      offset = [0, 0.18, 0],
      icon: iconName = null,
      seconds = 0,
      bob = true,
      className = ''
    } = opts;

    const el = document.createElement('div');
    el.className = 'wlabel ' + className;
    const inner = document.createElement('span');
    inner.className = bob ? 'wlabel__bob' : '';
    inner.innerHTML =
      (iconName ? `<span class="wlabel__icon">${icon(iconName)}</span>` : '') +
      `<span>${escapeHtml(text || '')}</span>`;
    el.appendChild(inner);
    this.els.labelLayer.appendChild(el);

    const handle = {
      el,
      object: object3D,
      offset: offset.slice(),
      visible: true,
      setText: (t) => { inner.lastElementChild.textContent = t; return handle; },
      show: () => { handle.visible = true; return handle; },
      hide: () => { handle.visible = false; el.classList.remove('is-on'); return handle; },
      remove: () => {
        const i = this._labels.indexOf(handle);
        if (i >= 0) this._labels.splice(i, 1);
        el.remove();
      }
    };

    this._labels.push(handle);
    this._layoutLabels();
    requestAnimationFrame(() => el.classList.add('is-on'));
    if (seconds > 0) this.after(seconds, () => handle.remove());
    return handle;
  }

  clearLabels() {
    for (const l of [...this._labels]) l.remove();
  }

  _layoutLabels() {
    if (!this._labels.length) return;
    const cam = this.app.camera;
    const canvas = this.app.renderer?.domElement;
    if (!cam || !canvas) return;
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;

    for (const l of this._labels) {
      const p = this._v;
      const o = l.object;
      if (!o) continue;
      if (typeof o.getWorldPosition === 'function') o.getWorldPosition(p);
      else if (o.isVector3 || (typeof o.x === 'number' && typeof o.z === 'number')) p.set(o.x, o.y, o.z);
      else continue;
      p.x += l.offset[0]; p.y += l.offset[1]; p.z += l.offset[2];
      p.project(cam);

      const behind = p.z > 1;
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-p.y * 0.5 + 0.5) * h;
      const off = behind || x < -80 || y < -80 || x > w + 80 || y > h + 80;
      /* left/top position it; the CSS transform does the centring + pop-in. */
      l.el.style.left = x.toFixed(1) + 'px';
      l.el.style.top = y.toFixed(1) + 'px';
      l.el.classList.toggle('is-on', l.visible && !off);
    }
  }

  /* ========================================================= tool tray == */

  /**
   * Contextual tools for an activity (foods, clothes, bath toys …).
   *   ui.setTools([{ id:'bottle', icon:'bottle' }, { id:'apple', icon:'apple' }],
   *               (id, el) => …)
   */
  setTools(items = [], onPick) {
    const tray = this.els.ctxTray;
    if (!tray) return;
    tray.innerHTML = '';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-btn' + (item.selected ? ' is-selected' : '');
      btn.dataset.id = item.id;
      if (item.label) btn.setAttribute('aria-label', item.label);
      if (item.color) btn.style.background = item.color;
      btn.innerHTML = item.svg || icon(item.icon || 'star');
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('is-press');
        this._unlockAudio();
        this._sfx('tap');
        for (const b of $$('.ctx-btn', tray)) b.classList.toggle('is-selected', b === btn);
        onPick?.(item.id, btn);
      });
      const up = () => btn.classList.remove('is-press');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      tray.appendChild(btn);
    }
    this.els.hud.classList.toggle('has-tools', tray.children.length > 0);
  }

  selectTool(id) {
    for (const b of $$('.ctx-btn', this.els.ctxTray)) b.classList.toggle('is-selected', b.dataset.id === id);
  }

  clearTools() {
    if (this.els.ctxTray) this.els.ctxTray.innerHTML = '';
    this.els.hud?.classList.remove('has-tools');
  }

  /* ============================================================== misc == */

  /** Show or hide the whole HUD (also used by the screenshot harness). */
  setHud(visible) {
    if (!this.els?.hud) return;
    this.els.hud.classList.toggle('is-on', !!visible);
    this.els.hud.classList.toggle('is-off', !visible);
  }

  _paintSound() {
    const muted = !!this.state.muted;
    const holder = this.els.soundBtn?.firstElementChild;
    if (holder) holder.innerHTML = icon(muted ? 'speakerOff' : 'speakerOn');
    this.els.soundBtn?.setAttribute('aria-label', muted ? 'おとを だす' : 'おとを けす');
    try { this.app.audio?.setMuted?.(muted); } catch { /* audio may not be up yet */ }
  }

  _unlockAudio() {
    if (this._audioUnlocked) return;
    this._audioUnlocked = true;
    try { this.app.audio?.unlock?.(); } catch { /* ignore */ }
    try { this.app.audio?.setMuted?.(!!this.state.muted); } catch { /* ignore */ }
  }

  _sfx(name, opts) {
    if (this.harness) return;
    try { this.app.audio?.play?.(name, opts); } catch { /* sounds are optional */ }
  }

  /** Screen-space centre of a DOM element. */
  _elCenter(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Convert an Object3D / Vector3 / screen point into screen pixels. */
  _toScreen(src) {
    if (!src) return null;
    if (typeof src.x === 'number' && typeof src.y === 'number' && src.z === undefined) {
      return { x: src.x, y: src.y };                       // already a screen point
    }
    const cam = this.app.camera;
    const canvas = this.app.renderer?.domElement;
    if (!cam || !canvas) return null;
    const p = this._v;
    if (typeof src.getWorldPosition === 'function') src.getWorldPosition(p);
    else if (typeof src.z === 'number') p.set(src.x, src.y, src.z);
    else return null;
    p.project(cam);
    return {
      x: (p.x * 0.5 + 0.5) * (canvas.clientWidth || innerWidth),
      y: (-p.y * 0.5 + 0.5) * (canvas.clientHeight || innerHeight)
    };
  }
}

/* Labels come from game code, but never trust a string with innerHTML. */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export { ACTIVITY_ICON, ACTIVITY_LABEL };
export default UI;
