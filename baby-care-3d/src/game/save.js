/* ============================================================================
 * save.js — versioned localStorage persistence
 * ----------------------------------------------------------------------------
 * Rules of the house:
 *   · saving must never throw (Safari private mode, quota, disabled storage)
 *   · a corrupt or older save must never wipe the child's progress — it is
 *     migrated forward field by field, and anything unreadable falls back to
 *     the default profile rather than blocking the game
 *   · there are no fail states, so nothing in here can "lose" anything either
 *
 * Schema (v3):
 * {
 *   v: 3,
 *   t: <epoch ms of last write>,
 *   meters:   { food, clean, happy, energy }          // 0..1
 *   stars:    <int>                                    // lifetime stars
 *   stickers: [<stickerId>, ...]                       // unlocked, in order
 *   outfit:   { top, bottom, socks, shoes, hat, bib, diaper }
 *   dirt:     { face, hands, feet, body, hair }        // 0..1 each
 *   wet:      0..1
 *   weather:  'clear' | 'rain' | 'snow'
 *   timeOfDay:'day' | 'golden' | 'evening' | 'night'
 *   muted:    <bool>
 * }
 * ========================================================================== */

export const SAVE_KEY = 'babycare3d.save';
export const SAVE_VERSION = 3;

/** Keys written by earlier builds of the game, newest first. */
const LEGACY_KEYS = ['babycare3d_save_v2', 'babycare3d_save_v1'];

const clamp01 = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const int = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.round(v)) : d);
const str = (v, d) => (typeof v === 'string' && v ? v : d);
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);

export const DEFAULT_SAVE = Object.freeze({
  v: SAVE_VERSION,
  t: 0,
  meters: { food: 0.8, clean: 0.85, happy: 0.85, energy: 0.9 },
  stars: 0,
  stickers: [],
  outfit: { top: 'onesie-cream', bottom: 'none', socks: 'none', shoes: 'none', hat: 'none', bib: false, diaper: true },
  dirt: { face: 0, hands: 0, feet: 0, body: 0, hair: 0 },
  wet: 0,
  weather: 'clear',
  timeOfDay: 'day',
  muted: false
});

/** Deep clone of the default profile (never hand out the frozen original). */
export function defaultSave() {
  return JSON.parse(JSON.stringify(DEFAULT_SAVE));
}

/* ------------------------------------------------------------- storage --- */

let _storage;
let _probed = false;

/** localStorage, or null when it is unavailable/blocked. Probed once. */
function storage() {
  if (_probed) return _storage;
  _probed = true;
  try {
    const s = window.localStorage;
    const probe = '__bc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    _storage = s;
  } catch {
    _storage = null;
  }
  return _storage;
}

export function isAvailable() {
  return !!storage();
}

/* ----------------------------------------------------------- migration --- */

/**
 * Bring any historical payload up to the current schema.
 * Unknown / missing fields fall back to the default profile.
 */
export function migrate(raw, stickerIds = []) {
  const out = defaultSave();
  if (!raw || typeof raw !== 'object') return out;

  const v = int(raw.v, 1);

  /* meters — v1 called the fourth meter "sleep". */
  const m = raw.meters && typeof raw.meters === 'object' ? raw.meters : {};
  out.meters.food = clamp01(m.food, out.meters.food);
  out.meters.clean = clamp01(m.clean, out.meters.clean);
  out.meters.happy = clamp01(m.happy, out.meters.happy);
  out.meters.energy = clamp01(m.energy != null ? m.energy : m.sleep, out.meters.energy);

  out.stars = int(raw.stars, 0);

  /* stickers — v1 stored a plain count; map it onto the ordered id list. */
  if (Array.isArray(raw.stickers)) {
    out.stickers = raw.stickers.filter((s) => typeof s === 'string');
  } else if (typeof raw.stickerCount === 'number') {
    out.stickers = stickerIds.slice(0, int(raw.stickerCount, 0));
  }

  /* outfit — v1 stored { outfitColor:<hex int>, hat:<string> }. */
  if (raw.outfit && typeof raw.outfit === 'object') {
    const o = raw.outfit;
    out.outfit.top = str(o.top, out.outfit.top);
    out.outfit.bottom = str(o.bottom, out.outfit.bottom);
    out.outfit.socks = str(o.socks, out.outfit.socks);
    out.outfit.shoes = str(o.shoes, out.outfit.shoes);
    out.outfit.hat = str(o.hat, out.outfit.hat);
    out.outfit.bib = bool(o.bib, out.outfit.bib);
    out.outfit.diaper = bool(o.diaper, out.outfit.diaper);
  } else if (v < 2) {
    if (typeof raw.outfitColor === 'number') out.outfit.top = 'onesie-' + raw.outfitColor.toString(16).padStart(6, '0');
    if (typeof raw.hat === 'string' && raw.hat !== 'none') out.outfit.hat = raw.hat;
  }

  if (raw.dirt && typeof raw.dirt === 'object') {
    for (const zone of Object.keys(out.dirt)) out.dirt[zone] = clamp01(raw.dirt[zone], 0);
  }

  out.wet = clamp01(raw.wet, 0);
  out.weather = ['clear', 'rain', 'snow'].includes(raw.weather) ? raw.weather : out.weather;
  out.timeOfDay = ['day', 'golden', 'evening', 'night'].includes(raw.timeOfDay) ? raw.timeOfDay : out.timeOfDay;
  out.muted = bool(raw.muted, false);
  out.t = int(raw.t, 0);
  out.v = SAVE_VERSION;
  return out;
}

/* --------------------------------------------------------------- read ---- */

/**
 * Read the profile. Always returns a complete, valid object — never null —
 * so callers never need a "no save yet" branch.
 */
export function loadSave(stickerIds = []) {
  const s = storage();
  if (!s) return defaultSave();

  let raw = null;
  try {
    const txt = s.getItem(SAVE_KEY);
    if (txt) raw = JSON.parse(txt);
  } catch {
    raw = null;
  }

  if (!raw) {
    for (const key of LEGACY_KEYS) {
      try {
        const txt = s.getItem(key);
        if (txt) { raw = JSON.parse(txt); break; }
      } catch { /* try the next legacy key */ }
    }
  }

  return migrate(raw, stickerIds);
}

/* -------------------------------------------------------------- write ---- */

let _pending = null;
let _timer = 0;

/** Immediate write. Silently no-ops when storage is unavailable. */
export function writeSave(data) {
  const s = storage();
  if (!s) return false;
  try {
    const payload = { ...data, v: SAVE_VERSION, t: Date.now() };
    s.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** Coalesced write — many small state changes cost one localStorage hit. */
export function queueSave(data, delay = 600) {
  _pending = data;
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = 0;
    const d = _pending;
    _pending = null;
    if (d) writeSave(d);
  }, delay);
}

/** Force any queued write out now (used on pagehide / visibilitychange). */
export function flushSave() {
  if (_timer) { clearTimeout(_timer); _timer = 0; }
  if (_pending) { const d = _pending; _pending = null; writeSave(d); }
}

export function clearSave() {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(SAVE_KEY);
    for (const k of LEGACY_KEYS) s.removeItem(k);
  } catch { /* nothing to do */ }
}
