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
 *             each slot is either `false` (nothing worn) or a garment value
 *             that `character/outfit.js` understands: a palette name
 *             ('mint','cream','sky',…), a hex number, or `true` for "the
 *             default colour for this slot". The historical sentinel string
 *             'none' is migrated to `false` — it used to slip through the
 *             colour resolver and silently *build* a garment.
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
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);

/** Slots on the body, in the order `character/outfit.js` layers them. */
export const OUTFIT_SLOTS = ['diaper', 'top', 'bottom', 'socks', 'shoes', 'hat', 'bib'];

/** Legacy / sloppy spellings of "this slot is empty". */
const EMPTY_GARMENT = new Set(['none', 'None', 'NONE', 'off', 'null', '']);

/**
 * Coerce one outfit slot.
 *   false | null | 'none' | ''  → false   (nothing worn)
 *   true | <hex number> | name  → kept verbatim
 *   anything else / missing     → `d`, the default for that slot
 */
export function garment(v, d = false) {
  if (v === false || v === null) return false;
  if (v === true) return true;
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') return EMPTY_GARMENT.has(v.trim()) ? false : v;
  return d;
}

/**
 * The baby is never born naked. Anything that resolves to "no garment in any
 * slot" is not a state the game can start in — the dressing-up screen exists
 * to *change* clothes, not to conjure the first pair.
 */
export const DEFAULT_OUTFIT = Object.freeze({
  top: 'mint',        // palette name from character/outfit.js
  bottom: false,      // a onesie covers the hips; no separate bottoms
  socks: false,
  shoes: false,
  hat: false,
  bib: false,
  diaper: true        // always, under everything
});

export const DEFAULT_SAVE = Object.freeze({
  v: SAVE_VERSION,
  t: 0,
  meters: { food: 0.8, clean: 0.85, happy: 0.85, energy: 0.9 },
  stars: 0,
  stickers: [],
  outfit: { ...DEFAULT_OUTFIT },
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

  /* outfit — v1 stored { outfitColor:<hex int>, hat:<string> }.
     Every slot is coerced through `garment()`, so an older save that spelled
     "empty" as the string 'none' migrates to `false` instead of resolving to a
     fallback colour and dressing the baby in phantom socks and a hat. */
  if (raw.outfit && typeof raw.outfit === 'object') {
    const o = raw.outfit;
    for (const slot of OUTFIT_SLOTS) {
      // `undefined` (slot absent from an older schema) keeps the default.
      out.outfit[slot] = o[slot] === undefined
        ? out.outfit[slot]
        : garment(o[slot], out.outfit[slot]);
    }
  } else if (typeof raw.outfit === 'string' && raw.outfit) {
    // A call site once patched `{ outfit: 'onesie' }` — a bare garment id.
    out.outfit.top = raw.outfit;
  } else if (v < 2) {
    if (typeof raw.outfitColor === 'number') out.outfit.top = raw.outfitColor;
    if (typeof raw.hat === 'string') out.outfit.hat = garment(raw.hat, false);
  }

  /* Nothing worn at all is never a state we restore into. A bath or a
     mid-dressing quit can legitimately strip the baby *during* a session, but
     the next boot starts from the default outfit rather than a naked hero. */
  if (!OUTFIT_SLOTS.some((slot) => out.outfit[slot] !== false)) {
    out.outfit = { ...DEFAULT_OUTFIT };
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
