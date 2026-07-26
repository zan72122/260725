/* ============================================================================
 * state.js — the one place that knows how the baby is doing
 * ----------------------------------------------------------------------------
 * Plain data + a tiny event bus. No DOM, no THREE, no gameplay rules beyond
 * "needs drift down slowly" and "5 stars earns a sticker".
 *
 * There are no fail states: a meter at 0 makes the baby ask for something and
 * puts a badge on a button. Nothing is ever lost, nothing ever times out.
 *
 * Events (State#on):
 *   'meter'   { name, value, prev }
 *   'star'    { stars, delta }
 *   'sticker' { id, index, stickers }
 *   'outfit'  { outfit, patch }
 *   'dirt'    { zone, amount, dirt }
 *   'wet'     { wet }
 *   'weather' { weather }        'timeOfDay' { timeOfDay }
 *   'muted'   { muted }          'change' { patch }   'reset' {}
 * ========================================================================== */

import { STICKER_IDS } from '../ui/icons.js';
import {
  loadSave, queueSave, writeSave, flushSave, clearSave, defaultSave,
  garment, OUTFIT_SLOTS, DEFAULT_OUTFIT
} from './save.js';

export const METERS = ['food', 'clean', 'happy', 'energy'];
export const DIRT_ZONES = ['face', 'hands', 'feet', 'body', 'hair'];
export const STARS_PER_STICKER = 5;

export { OUTFIT_SLOTS, DEFAULT_OUTFIT };

/** Which activity refills which meter — used for the "needs you" badges. */
export const METER_ACTIVITY = {
  food: 'feed',
  clean: 'bath',
  happy: 'play',
  energy: 'sleep'
};

/** Fraction drained per second. Gentle: ~13–25 minutes from full to empty. */
export const DECAY = {
  food: 1 / 800,
  clean: 1 / 1500,
  happy: 1 / 1100,
  energy: 1 / 1300
};

/** Below this a need shows a badge and the baby starts asking. */
export const LOW = 0.34;

const clamp01 = (v) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class State {
  constructor({ autosave = true, decay = true } = {}) {
    const d = defaultSave();

    /** @type {{food:number, clean:number, happy:number, energy:number}} */
    this.meters = { ...d.meters };
    this.outfit = { ...d.outfit };
    this.dirt = { ...d.dirt };
    this.wet = d.wet;
    this.stars = d.stars;
    this.stickers = [];
    this.weather = d.weather;
    this.timeOfDay = d.timeOfDay;
    this.muted = d.muted;

    this.stickerIds = STICKER_IDS.slice();
    this.autosave = autosave;
    this.decayEnabled = decay;

    this._listeners = new Map();
    this._decayAcc = 0;

    /** Bookkeeping so the UI can tell "here is a delta" from "here is the new
     *  total, which I already applied" when it is handed a star count. */
    this.lastStarDelta = 0;
    this._lastStarAt = -1e9;

    this.load();
  }

  /* ----------------------------------------------------------- events -- */

  /** Subscribe. Returns an unsubscribe function. */
  on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    let set = this._listeners.get(event);
    if (!set) { set = new Set(); this._listeners.set(event, set); }
    set.add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload, this); } catch (err) { console.error('[state] listener failed for ' + event, err); }
    }
  }

  /* ------------------------------------------------------------ meters -- */

  /** Absolute set, clamped, emits 'meter' when it actually moves. */
  setMeter(name, value) {
    if (!METERS.includes(name)) return;
    const prev = this.meters[name];
    const next = clamp01(value);
    if (Math.abs(next - prev) < 1e-4) return;
    this.meters[name] = next;
    this.emit('meter', { name, value: next, prev });
    this._touch();
  }

  /** Relative change, e.g. `addMeter('food', +0.25)` after a feed. */
  addMeter(name, delta) {
    this.setMeter(name, (this.meters[name] ?? 0) + delta);
  }

  /** Lowest need right now — drives the baby's spontaneous requests. */
  lowestMeter() {
    let best = METERS[0];
    for (const m of METERS) if (this.meters[m] < this.meters[best]) best = m;
    return { name: best, value: this.meters[best], low: this.meters[best] < LOW };
  }

  /** Activity names that currently deserve an attention badge. */
  needyActivities() {
    const out = [];
    for (const m of METERS) if (this.meters[m] < LOW) out.push(METER_ACTIVITY[m]);
    if (this.dirtTotal() > 0.5 && !out.includes('bath')) out.push('bath');
    return out;
  }

  /* ------------------------------------------------------------- dirt --- */

  dirtTotal() {
    let sum = 0;
    for (const z of DIRT_ZONES) sum += this.dirt[z] || 0;
    return sum / DIRT_ZONES.length;
  }

  setDirt(zone, amount) {
    if (!DIRT_ZONES.includes(zone)) return;
    const next = clamp01(amount);
    if (Math.abs(next - this.dirt[zone]) < 1e-4) return;
    this.dirt[zone] = next;
    this.emit('dirt', { zone, amount: next, dirt: this.dirt });
    this._touch();
  }

  setWet(v) {
    const next = clamp01(v);
    if (Math.abs(next - this.wet) < 1e-4) return;
    this.wet = next;
    this.emit('wet', { wet: next });
    this._touch();
  }

  /* ------------------------------------------------------------ outfit -- */

  /**
   * Merge a partial outfit. Slots are normalised on the way in so the seven
   * slots only ever hold `false` or a value `character/outfit.js` can resolve:
   *
   *   setOutfit({ top: 'mint', hat: false })   // put a top on, take the hat off
   *   setOutfit({ top: null })                 // undress — bath.js does this
   *   setOutfit('raincoat')                    // shorthand for { top: … }
   *
   * Callers may legitimately strip every slot (the bath, mid-dressing); the
   * default outfit is a *starting* state, not a lock, so nothing is re-added
   * here. `save.js` restores it on the next boot instead.
   */
  setOutfit(patch) {
    if (typeof patch === 'string' && patch) patch = { top: patch };
    if (!patch || typeof patch !== 'object') return;
    const applied = {};
    let changed = false;
    for (const k of Object.keys(patch)) {
      if (!OUTFIT_SLOTS.includes(k)) continue;
      const v = garment(patch[k], false);
      applied[k] = v;
      if (this.outfit[k] !== v) { this.outfit[k] = v; changed = true; }
    }
    if (!changed) return;
    this.emit('outfit', { outfit: { ...this.outfit }, patch: applied });
    this._touch();
  }

  /** True while at least one slot has something in it. */
  isDressed() {
    return OUTFIT_SLOTS.some((slot) => this.outfit[slot] !== false);
  }

  /* ------------------------------------------------- stars & stickers --- */

  /**
   * Award stars. Every {@link STARS_PER_STICKER} lifetime stars unlocks the
   * next animal sticker, which is emitted separately so the UI can celebrate.
   */
  addStars(n = 1) {
    const delta = Math.max(0, Math.round(n));
    if (!delta) return this.stars;
    this.stars += delta;
    this._noteStarChange(delta);
    this.emit('star', { stars: this.stars, delta });
    this._syncStickers();
    this._touch();
    return this.stars;
  }

  /** Absolute setter (used by the harness / debug tooling). */
  setStars(total) {
    const next = Math.max(0, Math.round(total || 0));
    const delta = next - this.stars;
    if (!delta) return;
    this.stars = next;
    this._noteStarChange(delta);
    this.emit('star', { stars: this.stars, delta });
    this._syncStickers();
    this._touch();
  }

  /** Seconds since the star total last moved (Infinity if it never has). */
  starChangedWithin(seconds) {
    return (now() - this._lastStarAt) / 1000 <= seconds;
  }

  _noteStarChange(delta) {
    this.lastStarDelta = delta;
    this._lastStarAt = now();
  }

  /** Directly unlock a sticker by id (or index). Idempotent. */
  unlockSticker(idOrIndex) {
    const id = typeof idOrIndex === 'number' ? this.stickerIds[idOrIndex] : idOrIndex;
    if (!id || !this.stickerIds.includes(id) || this.stickers.includes(id)) return null;
    this.stickers.push(id);
    const index = this.stickerIds.indexOf(id);
    this.emit('sticker', { id, index, stickers: this.stickers.slice() });
    this._touch();
    return id;
  }

  hasSticker(id) { return this.stickers.includes(id); }

  /** Stars still needed for the next sticker (0 when the set is complete). */
  starsToNextSticker() {
    if (this.stickers.length >= this.stickerIds.length) return 0;
    return STARS_PER_STICKER - (this.stars % STARS_PER_STICKER);
  }

  _syncStickers() {
    const earned = Math.min(this.stickerIds.length, Math.floor(this.stars / STARS_PER_STICKER));
    while (this.stickers.length < earned) {
      const id = this.stickerIds[this.stickers.length];
      this.stickers.push(id);
      this.emit('sticker', { id, index: this.stickers.length - 1, stickers: this.stickers.slice() });
    }
  }

  /* ------------------------------------------------------------- misc --- */

  setMuted(v) {
    const next = !!v;
    if (next === this.muted) return;
    this.muted = next;
    this.emit('muted', { muted: next });
    this._touch();
  }

  setWeather(name) {
    if (!['clear', 'rain', 'snow'].includes(name) || name === this.weather) return;
    this.weather = name;
    this.emit('weather', { weather: name });
    this._touch();
  }

  setTimeOfDay(name) {
    if (!['day', 'golden', 'evening', 'night'].includes(name) || name === this.timeOfDay) return;
    this.timeOfDay = name;
    this.emit('timeOfDay', { timeOfDay: name });
    this._touch();
  }

  /* -------------------------------------------------------------- patch -- */

  /**
   * Merge an arbitrary partial state. Accepts both shapes so callers and the
   * screenshot harness can be casual:
   *   patch({ meters: { food: 0.2 } })
   *   patch({ food: 0.2, dirt: { face: 1 }, outfit: { hat: 'beanie' } })
   * Unknown keys are stored on the instance (handy scratch space for
   * activities) but are not persisted.
   */
  patch(obj) {
    if (!obj || typeof obj !== 'object') return this;

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'meters' && value && typeof value === 'object') {
        for (const [m, v] of Object.entries(value)) this.setMeter(m, v);
      } else if (METERS.includes(key)) {
        this.setMeter(key, value);
      } else if (key === 'dirt') {
        if (typeof value === 'number') { for (const z of DIRT_ZONES) this.setDirt(z, value); }
        else if (value && typeof value === 'object') { for (const [z, v] of Object.entries(value)) this.setDirt(z, v); }
      } else if (key === 'outfit') {
        // Never let `{ outfit: 'onesie' }` fall through to the scratch-space
        // branch below — that used to replace the whole slot map with a string
        // and left the character with nothing to put on.
        this.setOutfit(value);
      } else if (key === 'wet') {
        this.setWet(value);
      } else if (key === 'stars') {
        this.setStars(value);
      } else if (key === 'stickers' && Array.isArray(value)) {
        for (const id of value) this.unlockSticker(id);
      } else if (key === 'weather') {
        this.setWeather(value);
      } else if (key === 'timeOfDay') {
        this.setTimeOfDay(value);
      } else if (key === 'muted') {
        this.setMuted(value);
      } else {
        this[key] = value;
      }
    }

    this.emit('change', { patch: obj });
    return this;
  }

  /* -------------------------------------------------------------- tick -- */

  /**
   * Slow drift of the four needs. Driven from UI#update so it advances on the
   * same fixed clock the screenshot harness uses.
   */
  update(dt) {
    if (!this.decayEnabled || !(dt > 0)) return;
    this._decayAcc += dt;
    if (this._decayAcc < 0.25) return;          // coarse ticks: fewer events
    const step = this._decayAcc;
    this._decayAcc = 0;
    for (const m of METERS) {
      const v = this.meters[m];
      if (v <= 0) continue;
      this.setMeter(m, v - DECAY[m] * step);
    }
  }

  /* ------------------------------------------------------ persistence --- */

  snapshot() {
    return {
      meters: { ...this.meters },
      outfit: { ...this.outfit },
      dirt: { ...this.dirt },
      wet: this.wet,
      stars: this.stars,
      stickers: this.stickers.slice(),
      weather: this.weather,
      timeOfDay: this.timeOfDay,
      muted: this.muted
    };
  }

  save() {
    writeSave(this.snapshot());
    return this;
  }

  load() {
    const d = loadSave(this.stickerIds);
    this.meters = { ...d.meters };
    this.outfit = { ...d.outfit };
    this.dirt = { ...d.dirt };
    this.wet = d.wet;
    this.stars = d.stars;
    this.stickers = d.stickers.filter((id) => this.stickerIds.includes(id));
    this.weather = d.weather;
    this.timeOfDay = d.timeOfDay;
    this.muted = d.muted;
    this._syncStickers();
    this.emit('change', { patch: this.snapshot(), loaded: true });
    for (const m of METERS) this.emit('meter', { name: m, value: this.meters[m], prev: this.meters[m] });
    this.emit('star', { stars: this.stars, delta: 0 });
    this._announceOutfit();
    return this;
  }

  /**
   * Re-broadcast the whole outfit, unconditionally. `setOutfit` is a diff and
   * stays silent when nothing moved, which is exactly wrong after a load or a
   * reset: the character may have been undressed by the bath and needs telling
   * that it is wearing the restored set again.
   */
  _announceOutfit() {
    const outfit = { ...this.outfit };
    this.emit('outfit', { outfit, patch: outfit, restored: true });
  }

  /**
   * Fresh profile. Keeps nothing — used by the harness before every shot,
   * which is why the default outfit has to be re-applied *and* re-announced
   * here: every review still was shot straight after a `reset()`.
   */
  reset({ keepProgress = false } = {}) {
    const d = defaultSave();
    const stars = keepProgress ? this.stars : 0;
    const stickers = keepProgress ? this.stickers.slice() : [];

    this.meters = { ...d.meters };
    this.outfit = { ...d.outfit };
    this.dirt = { ...d.dirt };
    this.wet = 0;
    this.stars = stars;
    this.stickers = stickers;
    this.weather = d.weather;
    this.timeOfDay = d.timeOfDay;
    this._decayAcc = 0;

    if (!keepProgress) clearSave();
    this.emit('reset', {});
    for (const m of METERS) this.emit('meter', { name: m, value: this.meters[m], prev: this.meters[m] });
    this.emit('star', { stars: this.stars, delta: 0 });
    this._announceOutfit();
    for (const z of DIRT_ZONES) this.emit('dirt', { zone: z, amount: 0, dirt: this.dirt });
    this.emit('wet', { wet: 0 });
    this.emit('change', { patch: this.snapshot(), reset: true });
    return this;
  }

  /** Flush a pending debounced write (call on pagehide). */
  flush() { flushSave(); return this; }

  _touch() {
    if (this.autosave) queueSave(this.snapshot());
  }
}

export default State;
