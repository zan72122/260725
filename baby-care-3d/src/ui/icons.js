/* ============================================================================
 * icons.js — hand-authored vector icon art for the HUD
 * ----------------------------------------------------------------------------
 * No emoji, no external assets. Every mark below is drawn on a 64×64 grid with
 * one shared visual language:
 *
 *   · soft rounded geometry, nothing sharper than ~3px radius
 *   · 2–3 flat tones per object plus one subtle linear gradient
 *   · a single soft inner highlight (white, 35–60% opacity) top-left
 *   · consistent stroke weight (3 units, round caps + joins)
 *   · consistent optical size: art lives inside the 6..58 box, mass centred
 *
 * Every icon is a *function returning an SVG string*, so callers can drop it
 * into `innerHTML` and re-tint or animate it from CSS. Colours are emitted as
 * `var(--ic-x, #fallback)` — set `--ic-a/--ic-b/--ic-c` on any ancestor to
 * re-theme an icon without touching this file.
 * ========================================================================== */

/* ------------------------------------------------------------- plumbing --- */

let _seq = 0;
/** Unique gradient/clip ids — many copies of one icon can share a document. */
const uid = (p) => `bc-${p}-${(++_seq).toString(36)}`;

/** Themeable colour token with a baked-in fallback. */
const T = (key, fallback) => `var(--ic-${key}, ${fallback})`;

function svg(name, inner, opts = {}) {
  const { size, className = '', style = '', label = '' } = opts;
  const dim = size ? ` width="${size}" height="${size}"` : '';
  const a11y = label
    ? ` role="img" aria-label="${label}"`
    : ' aria-hidden="true" focusable="false"';
  const cls = ('ic ic-' + name + ' ' + className).trim();
  return (
    `<svg class="${cls}" viewBox="0 0 64 64"${dim} xmlns="http://www.w3.org/2000/svg"` +
    `${a11y}${style ? ` style="${style}"` : ''}>${inner}</svg>`
  );
}

/** Linear gradient in objectBoundingBox space. stops = [[offset, color, opacity?]] */
function lg(id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
  const s = stops
    .map(([o, c, op]) =>
      `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`)
    .join('');
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
}

/** Radial "sheen" gradient — white centre fading out, used for glassy tops. */
function sheen(id, cx = 0.32, cy = 0.24, r = 0.8) {
  return (
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".75"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
  );
}

const stroke = (d, c, w = 3, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;

/* ============================================================ care icons == */

/** 哺乳瓶 — feeding bottle. */
export function bottle(o) {
  const g = uid('bt'), s = uid('sh'), m = uid('mk'), c = uid('cl');
  const glass = T('a', '#dff1ff');
  const milk = T('b', '#fff4dc');
  const cap = T('c', '#ffc4d8');
  return svg('bottle', `<defs>
    ${lg(g, [[0, glass], [1, '#a9d7f5']])}
    ${lg(m, [[0, milk], [1, '#ffd79a']])}
    ${sheen(s, 0.28, 0.2, 0.75)}
    <clipPath id="${c}"><path d="M20 27c0-5.4 3.8-8.6 12-8.6s12 3.2 12 8.6v22.6C44 55.8 39.7 59 32 59s-12-3.2-12-9.4Z"/></clipPath>
  </defs>
  <path d="M26.6 15.4C24.4 9.6 27 4.6 32 4.6s7.6 5 5.4 10.8Z" fill="${cap}"/>
  <path d="M28.6 8.6c.6-1.7 1.8-2.7 3.4-2.9" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7" fill="none"/>
  <rect x="21.5" y="13.6" width="21" height="7.4" rx="3.6" fill="#ffffff"/>
  <rect x="21.5" y="13.6" width="21" height="7.4" rx="3.6" fill="${cap}" opacity=".35"/>
  <path d="M20 27c0-5.4 3.8-8.6 12-8.6s12 3.2 12 8.6v22.6C44 55.8 39.7 59 32 59s-12-3.2-12-9.4Z" fill="url(#${g})"/>
  <g clip-path="url(#${c})">
    <path d="M18 37.5c3.4-2.6 6.2 2 9.6.3 3.6-1.8 6 2 9.4.2 3-1.6 5.4 1.4 9 .1V61H18Z" fill="url(#${m})"/>
    <circle cx="27" cy="47" r="2.4" fill="#fff" opacity=".55"/>
    <circle cx="35.5" cy="52" r="1.6" fill="#fff" opacity=".45"/>
  </g>
  <path d="M20 27c0-5.4 3.8-8.6 12-8.6s12 3.2 12 8.6v22.6C44 55.8 39.7 59 32 59s-12-3.2-12-9.4Z" fill="url(#${s})"/>
  ${stroke('M25 27.5v18', '#ffffff', 3.4, 'opacity=".65"')}
  ${stroke('M39.5 28h3M39.5 34h3M39.5 40h3', '#7fb6dc', 2.2, 'opacity=".8"')}`, o);
}

/** おふろ — bathtub with foam. */
export function bathtub(o) {
  const g = uid('tb'), w = uid('wt'), s = uid('sh');
  const tub = T('a', '#ffffff');
  const water = T('b', '#8fd8ff');
  return svg('bathtub', `<defs>
    ${lg(g, [[0, tub], [1, '#dfeaf5']])}
    ${lg(w, [[0, water], [1, '#3fa9e8']])}
    ${sheen(s, 0.3, 0.15, 0.7)}
  </defs>
  <circle cx="45.5" cy="14" r="5.4" fill="#ffffff" opacity=".95"/>
  <circle cx="43.6" cy="12.2" r="1.7" fill="#bfe9ff"/>
  <circle cx="54.5" cy="20.5" r="3.4" fill="#ffffff" opacity=".9"/>
  <circle cx="37" cy="9.5" r="3" fill="#ffffff" opacity=".8"/>
  ${stroke('M10 27V17c0-3.3 2.7-6 6-6h6', '#b9c9d8', 3.4)}
  <path d="M7 27h50a2 2 0 0 1 2 2c0 12.7-9 21.5-27 21.5S5 41.7 5 29a2 2 0 0 1 2-2Z" fill="url(#${g})"/>
  <path d="M9.6 31.5c2.9-2.4 5.4 1.6 8.6.2 3.4-1.5 5.6 2 8.8.4 3.2-1.6 5.4 1.6 8.6.2 3.3-1.5 5.6 1.8 8.8.3 2.6-1.2 4.2.4 6-.6-1.6 9.2-8.6 14.6-18.4 14.6S11.4 40.9 9.6 31.5Z" fill="url(#${w})"/>
  <path d="M7 27h50a2 2 0 0 1 2 2c0 12.7-9 21.5-27 21.5S5 41.7 5 29a2 2 0 0 1 2-2Z" fill="url(#${s})"/>
  ${stroke('M14 51.5 12 58M50 51.5 52 58', '#c8d6e2', 3.6)}`, o);
}

/** きせかえ — onesie / romper. */
export function onesie(o) {
  const g = uid('on'), s = uid('sh');
  const cloth = T('a', '#ffe27a');
  const trim = T('b', '#ff9ec2');
  return svg('onesie', `<defs>
    ${lg(g, [[0, cloth], [1, '#ffbf4d']])}
    ${sheen(s, 0.28, 0.2, 0.7)}
  </defs>
  <path d="M25 12.5c.6-1.6 2.4-2.4 4-1.8 1.3 2.6 4.5 2.6 6 0 1.6-.6 3.4.2 4 1.8l9.6 4.8c2.3 1.2 3.2 4 2 6.3l-2.4 4.6c-1 2-3.6 2.6-5.4 1.3L41 27.6v13.8c0 5-3 8-8.2 8-1-3.2-1.6-5.4-1.8-7.8h-2c-.2 2.4-.8 4.6-1.8 7.8-5.2 0-8.2-3-8.2-8V27.6l-1.8 1.6c-1.8 1.3-4.4.7-5.4-1.3l-2.4-4.6c-1.2-2.3-.3-5.1 2-6.3Z" fill="url(#${g})"/>
  <path d="M25 12.5c.6-1.6 2.4-2.4 4-1.8 1.3 2.6 4.5 2.6 6 0 1.6-.6 3.4.2 4 1.8" fill="none" stroke="${trim}" stroke-width="3" stroke-linecap="round"/>
  <path d="M23 41h18c-.4 3.2-1.4 5.4-3 6.6H26c-1.6-1.2-2.6-3.4-3-6.6Z" fill="${trim}" opacity=".85"/>
  <circle cx="28" cy="45" r="1.9" fill="#fff"/>
  <circle cx="36" cy="45" r="1.9" fill="#fff"/>
  <path d="M25 12.5c.6-1.6 2.4-2.4 4-1.8 1.3 2.6 4.5 2.6 6 0 1.6-.6 3.4.2 4 1.8l9.6 4.8c2.3 1.2 3.2 4 2 6.3l-2.4 4.6c-1 2-3.6 2.6-5.4 1.3L41 27.6v13.8c0 5-3 8-8.2 8-1-3.2-1.6-5.4-1.8-7.8h-2c-.2 2.4-.8 4.6-1.8 7.8-5.2 0-8.2-3-8.2-8V27.6l-1.8 1.6c-1.8 1.3-4.4.7-5.4-1.3l-2.4-4.6c-1.2-2.3-.3-5.1 2-6.3Z" fill="url(#${s})"/>
  ${stroke('M24.5 20.5v10', '#fff', 3, 'opacity=".55"')}`, o);
}

/** あそぶ — balloon. */
export function balloon(o) {
  const g = uid('bl'), s = uid('sh');
  const skin = T('a', '#ff8fb4');
  return svg('balloon', `<defs>
    ${lg(g, [[0, '#ffc0d6'], [0.45, skin], [1, '#e2588c']], 0.2, 0, 0.85, 1)}
    ${sheen(s, 0.3, 0.24, 0.72)}
  </defs>
  <path d="M32 4c9.4 0 16.4 8 16.4 18.2C48.4 33.6 40.4 42.4 32 46c-8.4-3.6-16.4-12.4-16.4-23.8C15.6 12 22.6 4 32 4Z" fill="url(#${g})"/>
  <path d="M32 4c9.4 0 16.4 8 16.4 18.2C48.4 33.6 40.4 42.4 32 46c-8.4-3.6-16.4-12.4-16.4-23.8C15.6 12 22.6 4 32 4Z" fill="url(#${s})"/>
  <path d="M29 45.6h6l-1.6 4.2h-2.8Z" fill="#e2588c"/>
  ${stroke('M32 49.8c3.6 3 -3 5.4.6 8.4 1.8 1.6 1 3.2-.6 3.8', T('b', '#ffb8ce'), 2.6)}
  ${stroke('M23.5 15c-1.6 2.4-2.2 5.4-2 8.4', '#fff', 3.4, 'opacity=".6"')}`, o);
}

/** ねんね — crescent moon. */
export function moon(o) {
  const g = uid('mn'), s = uid('sh');
  const face = T('a', '#ffe9a8');
  return svg('moon', `<defs>
    ${lg(g, [[0, '#fff6d6'], [1, face]], 0.2, 0, 0.9, 1)}
    ${sheen(s, 0.3, 0.2, 0.6)}
  </defs>
  <g transform="rotate(-18 32 33)">
    <path d="M32 8a25 25 0 1 0 0 50 20 20 0 1 1 0-50Z" fill="url(#${g})"/>
    <path d="M32 8a25 25 0 1 0 0 50 20 20 0 1 1 0-50Z" fill="url(#${s})"/>
    <ellipse cx="17" cy="26" rx="4.2" ry="3.4" fill="#f2cf7e" opacity=".55"/>
    <ellipse cx="22" cy="42" rx="3" ry="2.4" fill="#f2cf7e" opacity=".45"/>
  </g>
  <path d="M50 12.5 51.4 16l3.6 1.4-3.6 1.4L50 22.4l-1.4-3.6L45 17.4l3.6-1.4Z" fill="${T('b', '#ffd76e')}"/>
  <path d="M45.5 33.5 46.4 36l2.6 1-2.6 1-.9 2.6-1-2.6-2.5-1 2.5-1Z" fill="${T('b', '#ffd76e')}" opacity=".8"/>`, o);
}

/** ⭐ — reward star. */
export function star(o) {
  const g = uid('st'), s = uid('sh');
  const gold = T('a', '#ffd24d');
  const d = 'M32 9 38.5 24.1 54.8 25.6 42.5 36.4 46.1 52.4 32 44 17.9 52.4 21.5 36.4 9.2 25.6 25.5 24.1Z';
  return svg('star', `<defs>
    ${lg(g, [[0, '#fff0a8'], [0.5, gold], [1, '#f5a623']])}
    ${sheen(s, 0.32, 0.24, 0.62)}
  </defs>
  <path d="${d}" fill="url(#${g})" stroke="url(#${g})" stroke-width="6" stroke-linejoin="round"/>
  <path d="${d}" fill="url(#${s})" stroke="url(#${s})" stroke-width="6" stroke-linejoin="round"/>
  ${stroke('M27.5 20.5 32 14', '#fff', 3.2, 'opacity=".7"')}`, o);
}

/** りんご — apple (おなか meter). */
export function apple(o) {
  const g = uid('ap'), s = uid('sh');
  const skin = T('a', '#ff7d7d');
  return svg('apple', `<defs>
    ${lg(g, [[0, '#ff9e9e'], [0.55, skin], [1, '#d8425b']], 0.25, 0, 0.85, 1)}
    ${sheen(s, 0.3, 0.28, 0.7)}
  </defs>
  <path d="M32 19.5c-5.4-6-17.4-4.6-19.6 7-2 10.8 6.4 29 13.4 29 2.6 0 3.6-1.8 6.2-1.8s3.6 1.8 6.2 1.8c7 0 15.4-18.2 13.4-29-2.2-11.6-14.2-13-19.6-7Z" fill="url(#${g})"/>
  <path d="M32 19.5c-5.4-6-17.4-4.6-19.6 7-2 10.8 6.4 29 13.4 29 2.6 0 3.6-1.8 6.2-1.8s3.6 1.8 6.2 1.8c7 0 15.4-18.2 13.4-29-2.2-11.6-14.2-13-19.6-7Z" fill="url(#${s})"/>
  ${stroke('M32 19c-.8-4.6-1.8-7.6-3-9.6', T('c', '#a4693f'), 3.4)}
  <path d="M33 16.5c.6-6 5.6-9.6 11.4-9.6.6 6-3.6 10.8-11.4 10Z" fill="${T('b', '#7ed39a')}"/>
  ${stroke('M21 27.5c-2.6 2.6-3.8 6.4-3.4 10', '#fff', 4, 'opacity=".45"')}`, o);
}

/** シールずかん — sticker album. */
export function book(o) {
  const g = uid('bk'), s = uid('sh');
  const cover = T('a', '#9ad6ff');
  return svg('book', `<defs>
    ${lg(g, [[0, '#c2e8ff'], [1, cover]])}
    ${sheen(s, 0.3, 0.2, 0.7)}
  </defs>
  <path d="M18 9h30a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6H18Z" fill="#fffdf6"/>
  <path d="M20 12h26a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H20Z" fill="#f0e6d6" opacity=".65"/>
  <path d="M10 12a4 4 0 0 1 4-4h32a5 5 0 0 1 5 5v38a5 5 0 0 1-5 5H14a4 4 0 0 1-4-4Z" fill="url(#${g})"/>
  <path d="M10 12a4 4 0 0 1 4-4h5v48h-5a4 4 0 0 1-4-4Z" fill="#000" opacity=".12"/>
  <path d="M32.5 20 36 27.4l8 1.1-5.8 5.5 1.4 8-7.1-3.9-7.1 3.9 1.4-8L21 28.5l8-1.1Z" fill="#fff" opacity=".92"/>
  <path d="M42 8h7v17l-3.5-3.6L42 25Z" fill="${T('b', '#ff9ec2')}"/>
  <path d="M10 12a4 4 0 0 1 4-4h32a5 5 0 0 1 5 5v38a5 5 0 0 1-5 5H14a4 4 0 0 1-4-4Z" fill="url(#${s})"/>`, o);
}

/* ============================================================ ui icons === */

/** Sound on. */
export function speakerOn(o) {
  const g = uid('sp');
  const body = T('a', '#7c8ea8');
  return svg('speaker-on', `<defs>${lg(g, [[0, '#a9bbd2'], [1, body]])}</defs>
  <path d="M14 25.5h7.6l9.6-8.6c1.7-1.5 4.3-.3 4.3 2v42.2c0 0 0 0 0 0" fill="none"/>
  <path d="M14 25h7.8l9.4-8.5c1.7-1.6 4.5-.3 4.5 2v27c0 2.3-2.8 3.6-4.5 2L21.8 39H14a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Z" fill="url(#${g})"/>
  <path d="M21.8 25 31.2 16.5c1.7-1.6 4.5-.3 4.5 2v6.5Z" fill="#fff" opacity=".28"/>
  ${stroke('M42.5 24.5a11 11 0 0 1 0 15', T('b', '#ffb74d'), 3.6)}
  ${stroke('M49.5 18.5a20 20 0 0 1 0 27', T('b', '#ffb74d'), 3.6, 'opacity=".75"')}`, o);
}

/** Sound off. */
export function speakerOff(o) {
  const g = uid('sp');
  const body = T('a', '#a8b2c0');
  return svg('speaker-off', `<defs>${lg(g, [[0, '#c6cedb'], [1, body]])}</defs>
  <path d="M14 25h7.8l9.4-8.5c1.7-1.6 4.5-.3 4.5 2v27c0 2.3-2.8 3.6-4.5 2L21.8 39H14a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Z" fill="url(#${g})"/>
  <path d="M21.8 25 31.2 16.5c1.7-1.6 4.5-.3 4.5 2v6.5Z" fill="#fff" opacity=".28"/>
  ${stroke('M43 25.5 55 37.5M55 25.5 43 37.5', T('b', '#ff8aa0'), 4)}`, o);
}

/** Home / back to the room. */
export function home(o) {
  const g = uid('hm'), s = uid('sh');
  const wall = T('a', '#ffd9a8');
  return svg('home', `<defs>
    ${lg(g, [[0, '#fff0d8'], [1, wall]])}
    ${sheen(s, 0.3, 0.3, 0.7)}
  </defs>
  <path d="M12 30h40v22a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5Z" fill="url(#${g})"/>
  <path d="M29.9 8.8a3.2 3.2 0 0 1 4.2 0L57 28.4c1.7 1.4.7 4.1-1.5 4.1H8.5c-2.2 0-3.2-2.7-1.5-4.1Z" fill="${T('b', '#ff8fa8')}"/>
  <path d="M29.9 8.8a3.2 3.2 0 0 1 4.2 0l3 2.6H26.9Z" fill="#fff" opacity=".3"/>
  <path d="M25.5 57V44.5c0-3.6 2.8-6 6.5-6s6.5 2.4 6.5 6V57Z" fill="${T('c', '#a8dcff')}"/>
  <circle cx="35.5" cy="48.5" r="1.7" fill="#fff" opacity=".85"/>
  <path d="M12 30h40v22a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5Z" fill="url(#${s})"/>`, o);
}

/** Success check, inside a soft badge. */
export function check(o) {
  const g = uid('ck');
  return svg('check', `<defs>${lg(g, [[0, T('a', '#8ee6a8')], [1, '#3fbf7a']])}</defs>
  <circle cx="32" cy="32" r="25" fill="url(#${g})"/>
  <path d="M32 7a25 25 0 0 0-19.4 40.8A25 25 0 0 1 47.6 13.6 24.9 24.9 0 0 0 32 7Z" fill="#fff" opacity=".22"/>
  ${stroke('M20 33.5 28.5 42 45 23.5', '#fff', 6.5)}`, o);
}

/** Attention badge — a vector "!" (no glyphs). */
export function exclamation(o) {
  const g = uid('ex');
  return svg('exclamation', `<defs>${lg(g, [[0, T('a', '#ff8d92')], [1, '#f0455f']])}</defs>
  <circle cx="32" cy="32" r="25" fill="url(#${g})"/>
  <path d="M32 7a25 25 0 0 0-19.4 40.8A25 25 0 0 1 47.6 13.6 24.9 24.9 0 0 0 32 7Z" fill="#fff" opacity=".22"/>
  <rect x="28" y="15" width="8" height="22" rx="4" fill="#fff"/>
  <circle cx="32" cy="45.5" r="4.6" fill="#fff"/>`, o);
}

/** Small close cross for overlays. */
export function close(o) {
  const g = uid('cl');
  return svg('close', `<defs>${lg(g, [[0, T('a', '#ffb3c8')], [1, '#f0708f']])}</defs>
  <circle cx="32" cy="32" r="25" fill="url(#${g})"/>
  <path d="M32 7a25 25 0 0 0-19.4 40.8A25 25 0 0 1 47.6 13.6 24.9 24.9 0 0 0 32 7Z" fill="#fff" opacity=".22"/>
  ${stroke('M23 23 41 41M41 23 23 41', '#fff', 6.5)}`, o);
}

/** Play triangle for the title button. */
export function play(o) {
  return svg('play', `<path d="M20 14.6c0-2.6 2.8-4.2 5-2.9l26.4 15.4a3.4 3.4 0 0 1 0 5.8L25 48.3c-2.2 1.3-5-.3-5-2.9Z" fill="${T('a', '#ffffff')}"/>
  <path d="M20 14.6c0-2.6 2.8-4.2 5-2.9l4.6 2.7L21 44.4l-1 1Z" fill="#fff" opacity=".35"/>`, o);
}

/** Bobbing hint arrow (points down at a target). */
export function arrowDown(o) {
  const g = uid('ar');
  return svg('arrow-down', `<defs>${lg(g, [[0, T('a', '#ffe27a')], [1, '#ffab3d']])}</defs>
  <path d="M26 8h12a4 4 0 0 1 4 4v18h6.4c2.7 0 4.1 3.2 2.3 5.2L34.9 55.4a4 4 0 0 1-5.8 0L13.3 35.2c-1.8-2-.4-5.2 2.3-5.2H22V12a4 4 0 0 1 4-4Z" fill="url(#${g})"/>
  ${stroke('M27.5 13v18', '#fff', 3, 'opacity=".55"')}`, o);
}

/** Chevron used by the sticker-book pager. */
export function chevron(o = {}) {
  const dir = o.dir === 'left' ? -1 : 1;
  return svg('chevron', `<g transform="translate(32 32) scale(${dir} 1) translate(-32 -32)">
    ${stroke('M25 14 43 32 25 50', T('a', '#ff8fb4'), 7)}
  </g>`, o);
}

/* ------------------------------------------------------- meter symbols --- */

/** きれい — soap droplet with a sparkle. */
export function bubble(o) {
  const g = uid('bb'), s = uid('sh');
  return svg('bubble', `<defs>
    ${lg(g, [[0, T('a', '#bfeaff')], [1, '#3fa9e8']], 0.25, 0, 0.85, 1)}
    ${sheen(s, 0.3, 0.3, 0.7)}
  </defs>
  <path d="M32 6c0 0 18 20.6 18 32A18 18 0 0 1 14 38C14 26.6 32 6 32 6Z" fill="url(#${g})"/>
  <path d="M32 6c0 0 18 20.6 18 32A18 18 0 0 1 14 38C14 26.6 32 6 32 6Z" fill="url(#${s})"/>
  <ellipse cx="24.5" cy="40" rx="4.4" ry="6" fill="#fff" opacity=".45" transform="rotate(-20 24.5 40)"/>
  <path d="M48 10.5 49.4 15 54 16.4 49.4 17.8 48 22.4 46.6 17.8 42 16.4 46.6 15Z" fill="${T('b', '#ffffff')}" opacity=".9"/>`, o);
}

/** ごきげん — smiling face. */
export function smile(o) {
  const g = uid('sm'), s = uid('sh');
  return svg('smile', `<defs>
    ${lg(g, [[0, T('a', '#ffe27a')], [1, '#ffb02e']])}
    ${sheen(s, 0.3, 0.24, 0.7)}
  </defs>
  <circle cx="32" cy="32" r="25" fill="url(#${g})"/>
  <circle cx="32" cy="32" r="25" fill="url(#${s})"/>
  <ellipse cx="23" cy="28" rx="3.2" ry="3.6" fill="#7a4a1e"/>
  <ellipse cx="41" cy="28" rx="3.2" ry="3.6" fill="#7a4a1e"/>
  <circle cx="24" cy="26.8" r="1.1" fill="#fff" opacity=".9"/>
  <circle cx="42" cy="26.8" r="1.1" fill="#fff" opacity=".9"/>
  ${stroke('M23.5 39c2.4 3.6 5.4 5.4 8.5 5.4s6.1-1.8 8.5-5.4', '#7a4a1e', 3.4)}
  <ellipse cx="17.5" cy="35.5" rx="4" ry="2.6" fill="#ff8fa8" opacity=".5"/>
  <ellipse cx="46.5" cy="35.5" rx="4" ry="2.6" fill="#ff8fa8" opacity=".5"/>`, o);
}

/** げんき — energy bolt. */
export function spark(o) {
  const g = uid('sk');
  return svg('spark', `<defs>${lg(g, [[0, T('a', '#d7b6ff')], [1, '#8b5cf6']])}</defs>
  <path d="M36.6 5.6c1.9-.6 3.8 1 3.4 3l-2.7 14.2h8.5c2.4 0 3.8 2.7 2.4 4.6L29.6 57c-1.5 2-4.7.7-4.3-1.8l3-16.6h-9c-2.4 0-3.8-2.7-2.4-4.7Z" fill="url(#${g})"/>
  <path d="M36.6 5.6c1.9-.6 3.8 1 3.4 3l-2.7 14.2-6.2 3.4 2.2-15.8Z" fill="#fff" opacity=".35"/>`, o);
}

/** Heart — praise flourish. */
export function heart(o) {
  const g = uid('ht'), s = uid('sh');
  return svg('heart', `<defs>
    ${lg(g, [[0, T('a', '#ff9ec2')], [1, '#ef4f86']])}
    ${sheen(s, 0.3, 0.24, 0.7)}
  </defs>
  <path d="M32 55C10.5 41 6.5 30 12.4 21.9 17.2 15.4 27 16.2 32 24c5-7.8 14.8-8.6 19.6-2.1C57.5 30 53.5 41 32 55Z" fill="url(#${g})"/>
  <path d="M32 55C10.5 41 6.5 30 12.4 21.9 17.2 15.4 27 16.2 32 24c5-7.8 14.8-8.6 19.6-2.1C57.5 30 53.5 41 32 55Z" fill="url(#${s})"/>
  ${stroke('M18.5 24.5c-2.6 1.6-3.8 4.6-3.4 7.6', '#fff', 3.4, 'opacity=".55"')}`, o);
}

/** Locked sticker silhouette — a soft paw print. */
export function paw(o) {
  const c = T('a', '#d8c9e4');
  return svg('paw', `<ellipse cx="32" cy="42" rx="14" ry="11.5" fill="${c}"/>
  <ellipse cx="18" cy="26.5" rx="6" ry="7.5" fill="${c}" transform="rotate(-18 18 26.5)"/>
  <ellipse cx="27" cy="19.5" rx="5.6" ry="7.4" fill="${c}"/>
  <ellipse cx="37" cy="19.5" rx="5.6" ry="7.4" fill="${c}"/>
  <ellipse cx="46" cy="26.5" rx="6" ry="7.5" fill="${c}" transform="rotate(18 46 26.5)"/>`, o);
}

/* ========================================================== animal art === */
/* Shared construction so the whole set reads as one sticker sheet:          */
/*   head mass → ears/extras → face → blush → white die-cut backing.         */

const eye = (x, y, r = 3.3, c = '#4a3243') =>
  `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.12}" fill="${c}"/>` +
  `<circle cx="${x + r * 0.36}" cy="${y - r * 0.46}" r="${r * 0.34}" fill="#fff" opacity=".92"/>`;

const blush = (x, y, c = '#ff9db8') =>
  `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3" fill="${c}" opacity=".55"/>`;

const mouth = (d, c = '#4a3243', w = 2.4) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const nose = (x, y, rx = 3.4, ry = 2.6, c = '#4a3243') =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}"/>`;

function furGrad(id, light, dark) {
  return lg(id, [[0, light], [1, dark]], 0.25, 0, 0.8, 1);
}

/* Each entry returns the *inner* SVG for a 64×64 box. */
const ANIMAL_ART = {
  dog(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#ffdcae', '#e8a95f')}</defs>
      <ellipse cx="13.5" cy="34" rx="7" ry="12" fill="#c98a44" transform="rotate(10 13.5 34)"/>
      <ellipse cx="50.5" cy="34" rx="7" ry="12" fill="#c98a44" transform="rotate(-10 50.5 34)"/>
      <circle cx="32" cy="33" r="19" fill="url(#${g})"/>
      <ellipse cx="32" cy="41" rx="11" ry="8.5" fill="#fff6e6"/>
      ${eye(25, 30)}${eye(39, 30)}
      ${nose(32, 37.5, 3.8, 3)}
      ${mouth('M32 40.5v3M32 43.5c-1.6 2-4.6 1.6-5.6-.4M32 43.5c1.6 2 4.6 1.6 5.6-.4')}
      ${blush(20, 39)}${blush(44, 39)}`;
  },
  cat(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#e8e2f6', '#b6a9d6')}</defs>
      <path d="M17 21 15 8l12 6.5Z" fill="#c8bce4"/><path d="M18.5 19.5 17.6 12l6.6 3.6Z" fill="#ffb6c8"/>
      <path d="M47 21 49 8l-12 6.5Z" fill="#c8bce4"/><path d="M45.5 19.5 46.4 12l-6.6 3.6Z" fill="#ffb6c8"/>
      <circle cx="32" cy="34" r="19" fill="url(#${g})"/>
      ${eye(25, 32)}${eye(39, 32)}
      <path d="M32 38.5a2.8 2.8 0 0 1 2.8 2.6c0 1.4-1.3 2.4-2.8 2.4s-2.8-1-2.8-2.4A2.8 2.8 0 0 1 32 38.5Z" fill="#ff9db8"/>
      ${mouth('M32 43.4v1.6M32 45c-1.4 1.8-4 1.5-4.9-.3M32 45c1.4 1.8 4 1.5 4.9-.3')}
      ${mouth('M12.5 34.5 21 36M12.5 41 21 40M51.5 34.5 43 36M51.5 41 43 40', '#a99acb', 1.8)}
      ${blush(20.5, 40)}${blush(43.5, 40)}`;
  },
  rabbit(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#ffffff', '#e2dbe8')}</defs>
      <ellipse cx="24" cy="15" rx="5.6" ry="13" fill="#f4eef7" transform="rotate(-9 24 15)"/>
      <ellipse cx="40" cy="15" rx="5.6" ry="13" fill="#f4eef7" transform="rotate(9 40 15)"/>
      <ellipse cx="24" cy="16" rx="2.8" ry="8.4" fill="#ffc0d4" transform="rotate(-9 24 16)"/>
      <ellipse cx="40" cy="16" rx="2.8" ry="8.4" fill="#ffc0d4" transform="rotate(9 40 16)"/>
      <circle cx="32" cy="39" r="17.5" fill="url(#${g})"/>
      ${eye(25.5, 37)}${eye(38.5, 37)}
      <path d="M32 42.6a2.6 2.6 0 0 1 2.6 2.4c0 1.3-1.2 2.2-2.6 2.2s-2.6-.9-2.6-2.2a2.6 2.6 0 0 1 2.6-2.4Z" fill="#ff9db8"/>
      ${mouth('M32 47.2v1.4M32 48.6c-1.3 1.6-3.6 1.3-4.4-.3M32 48.6c1.3 1.6 3.6 1.3 4.4-.3')}
      ${blush(21, 44)}${blush(43, 44)}`;
  },
  bear(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#e8c39a', '#b3804d')}</defs>
      <circle cx="16" cy="20" r="8" fill="#c9955f"/><circle cx="16" cy="20" r="4.2" fill="#f0cfae"/>
      <circle cx="48" cy="20" r="8" fill="#c9955f"/><circle cx="48" cy="20" r="4.2" fill="#f0cfae"/>
      <circle cx="32" cy="35" r="19" fill="url(#${g})"/>
      <ellipse cx="32" cy="42" rx="10.5" ry="8" fill="#f7e3cd"/>
      ${eye(25, 32)}${eye(39, 32)}
      ${nose(32, 38.5, 3.6, 2.8)}
      ${mouth('M32 41.3v2.4M32 43.7c-1.5 1.8-4.2 1.5-5.1-.4M32 43.7c1.5 1.8 4.2 1.5 5.1-.4')}
      ${blush(19.5, 39)}${blush(44.5, 39)}`;
  },
  panda(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#ffffff', '#e4e6ea')}</defs>
      <circle cx="16" cy="19" r="8" fill="#3f3a44"/>
      <circle cx="48" cy="19" r="8" fill="#3f3a44"/>
      <circle cx="32" cy="35" r="19" fill="url(#${g})"/>
      <ellipse cx="24" cy="32" rx="6.4" ry="7.4" fill="#3f3a44" transform="rotate(-14 24 32)"/>
      <ellipse cx="40" cy="32" rx="6.4" ry="7.4" fill="#3f3a44" transform="rotate(14 40 32)"/>
      ${eye(24, 32, 2.8, '#ffffff')}${eye(40, 32, 2.8, '#ffffff')}
      ${nose(32, 40, 3.4, 2.6, '#3f3a44')}
      ${mouth('M32 42.6v1.8M32 44.4c-1.4 1.7-3.9 1.4-4.7-.3M32 44.4c1.4 1.7 3.9 1.4 4.7-.3', '#3f3a44')}
      ${blush(17.5, 40)}${blush(46.5, 40)}`;
  },
  lion(id) {
    const g = uid(id), m = uid('mane');
    return `<defs>${furGrad(g, '#ffdf9e', '#f0b352')}${furGrad(m, '#f5a63c', '#d4762a')}</defs>
      <path d="M32 6c3 0 5 3 5 3s3-2 5.6-.4 2.4 4.6 2.4 4.6 3.6-.6 5 1.9-.2 5.4-.2 5.4 3.2 1.6 3 4.6-3 4.2-3 4.2 2 2.8.4 5.2-4.8 2-4.8 2 .4 3.4-2.2 4.8-5.2-.6-5.2-.6-1 3.2-4 3.6-4.8-2.2-4.8-2.2-1.8 2.6-4.8 2.2-4-3.6-4-3.6-2.6 2-5.2.6-2.2-4.8-2.2-4.8-3.2.4-4.8-2 .4-5.2.4-5.2-2.8-1.2-3-4.2 3-4.6 3-4.6-1.6-2.9-.2-5.4 5-1.9 5-1.9.2-3 2.4-4.6S27 9 27 9s2-3 5-3Z" fill="url(#${m})"/>
      <circle cx="32" cy="33" r="15.5" fill="url(#${g})"/>
      ${eye(26, 31)}${eye(38, 31)}
      ${nose(32, 37.5, 3.4, 2.6, '#8a4b2a')}
      ${mouth('M32 40v2.2M32 42.2c-1.4 1.8-4 1.5-4.9-.4M32 42.2c1.4 1.8 4 1.5 4.9-.4', '#8a4b2a')}
      ${blush(21.5, 38)}${blush(42.5, 38)}`;
  },
  frog(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#bdf0a0', '#5fbe57')}</defs>
      <circle cx="21" cy="18" r="9" fill="#8ddc74"/>
      <circle cx="43" cy="18" r="9" fill="#8ddc74"/>
      <circle cx="32" cy="37" r="18" fill="url(#${g})"/>
      <circle cx="21" cy="18" r="5.6" fill="#fff"/><circle cx="43" cy="18" r="5.6" fill="#fff"/>
      ${eye(21.8, 19, 3.2)}${eye(42.2, 19, 3.2)}
      ${mouth('M20 38c4 5.4 8 8 12 8s8-2.6 12-8', '#3f7d3a', 3)}
      <circle cx="26" cy="32" r="1.5" fill="#3f7d3a" opacity=".5"/>
      <circle cx="38" cy="32" r="1.5" fill="#3f7d3a" opacity=".5"/>
      ${blush(20, 42)}${blush(44, 42)}`;
  },
  penguin(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#5b6688', '#333c55')}</defs>
      <ellipse cx="32" cy="34" rx="19" ry="21" fill="url(#${g})"/>
      <ellipse cx="32" cy="38" rx="13" ry="16" fill="#fdf6e8"/>
      <ellipse cx="11" cy="36" rx="5" ry="11" fill="#3a4258" transform="rotate(16 11 36)"/>
      <ellipse cx="53" cy="36" rx="5" ry="11" fill="#3a4258" transform="rotate(-16 53 36)"/>
      ${eye(26, 28, 3)}${eye(38, 28, 3)}
      <path d="M32 31.5c3.4 0 5.4 2 5.4 4s-2.4 3.4-5.4 3.4-5.4-1.4-5.4-3.4 2-4 5.4-4Z" fill="#ffb02e"/>
      <path d="M26.8 35.4h10.4c-.4 2-2.6 3.5-5.2 3.5s-4.8-1.5-5.2-3.5Z" fill="#e08a1e"/>
      ${blush(21, 34)}${blush(43, 34)}
      <path d="M25 51.5c1.8 2 4 3 7 3s5.2-1 7-3c-1.4 3-4 4.5-7 4.5s-5.6-1.5-7-4.5Z" fill="#ffb02e"/>`;
  },
  elephant(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#d6dcf0', '#93a1c4')}</defs>
      <ellipse cx="13" cy="31" rx="11" ry="13" fill="#a8b4d4"/>
      <ellipse cx="51" cy="31" rx="11" ry="13" fill="#a8b4d4"/>
      <ellipse cx="13.5" cy="31" rx="7" ry="8.6" fill="#ffc4d4" opacity=".6"/>
      <ellipse cx="50.5" cy="31" rx="7" ry="8.6" fill="#ffc4d4" opacity=".6"/>
      <circle cx="32" cy="32" r="17" fill="url(#${g})"/>
      <path d="M28.5 42c0 6 1 12 3.5 14.5 2.6 2.6 6.4 1.4 7-2" fill="none" stroke="#a8b4d4" stroke-width="7" stroke-linecap="round"/>
      ${eye(25, 30, 3)}${eye(39, 30, 3)}
      ${blush(20, 37)}${blush(44, 37)}`;
  },
  fox(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#ffb26b', '#e8712f')}</defs>
      <path d="M15 27 12 8l16 9Z" fill="#e8712f"/><path d="M16.5 24 15 13l8.4 4.6Z" fill="#ffd9c0"/>
      <path d="M49 27 52 8l-16 9Z" fill="#e8712f"/><path d="M47.5 24 49 13l-8.4 4.6Z" fill="#ffd9c0"/>
      <circle cx="32" cy="34" r="18" fill="url(#${g})"/>
      <path d="M32 52c-8.6 0-15.4-5.6-17.2-13.4 4 3 8.4 3.6 11.4 1 2 3 3.8 4.4 5.8 4.4s3.8-1.4 5.8-4.4c3 2.6 7.4 2 11.4-1C47.4 46.4 40.6 52 32 52Z" fill="#fff8f0"/>
      ${eye(25, 31)}${eye(39, 31)}
      ${nose(32, 40, 3.4, 2.6)}
      ${mouth('M32 42.6v1.8M32 44.4c-1.3 1.7-3.8 1.4-4.6-.3M32 44.4c1.3 1.7 3.8 1.4 4.6-.3')}
      ${blush(20, 38)}${blush(44, 38)}`;
  },
  chick(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#fff4a8', '#ffc93c')}</defs>
      ${mouth('M32 12c-2-4 1-7 4-5', '#ffc93c', 4)}
      <circle cx="32" cy="35" r="18" fill="url(#${g})"/>
      <ellipse cx="12" cy="38" rx="5" ry="8" fill="#ffd75c" transform="rotate(18 12 38)"/>
      <ellipse cx="52" cy="38" rx="5" ry="8" fill="#ffd75c" transform="rotate(-18 52 38)"/>
      ${eye(26, 32)}${eye(38, 32)}
      <path d="M32 37.5 38 42l-6 4-6-4Z" fill="#ff9f2e"/>
      ${blush(20.5, 39)}${blush(43.5, 39)}
      ${mouth('M26 55c2-2 4-3 6-3s4 1 6 3', '#ff9f2e', 3)}`;
  },
  whale(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#8fd8ff', '#3f8fd8')}</defs>
      ${mouth('M22 15c-2-5 1-9 4-8', '#bfeaff', 3.4)}
      <circle cx="20" cy="9" r="3.2" fill="#bfeaff"/><circle cx="27" cy="6.5" r="2.2" fill="#bfeaff" opacity=".8"/>
      <path d="M13 34c0-9 8-15 19-15s19 6 19 15-8 16-19 16-19-7-19-16Z" fill="url(#${g})"/>
      <path d="M17 41c4 4.5 9 6.6 15 6.6s11-2.1 15-6.6c-1 6-7.4 9-15 9s-14-3-15-9Z" fill="#dff2ff"/>
      <path d="M50 30c4-3 8-4.6 11-4.6-1.6 3-1.6 6.6 0 10-3.4 0-7.4-1.8-11-5.4Z" fill="#3f8fd8"/>
      ${eye(24, 31, 3)}
      ${mouth('M20 39c3 2.6 6 3.6 9 3', '#2a6ba8', 2.4)}
      ${blush(18.5, 36)}`;
  },
  owl(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#d8b8f0', '#8b62c4')}</defs>
      <path d="M15 20l6-11 6 8ZM49 20l-6-11-6 8Z" fill="#8b62c4"/>
      <ellipse cx="32" cy="35" rx="19" ry="20" fill="url(#${g})"/>
      <path d="M32 20c7 0 11 4.6 11 8.6S38 36 32 36s-11-3.4-11-7.4S25 20 32 20Z" fill="#f3e7ff"/>
      <circle cx="25" cy="28.6" r="5.6" fill="#fff"/><circle cx="39" cy="28.6" r="5.6" fill="#fff"/>
      ${eye(25, 28.6, 3.2)}${eye(39, 28.6, 3.2)}
      <path d="M32 31.5 36 36l-4 3.6-4-3.6Z" fill="#ffb02e"/>
      <path d="M22 42c3 2.6 6.4 4 10 4s7-1.4 10-4c-1.4 4.6-5.4 7-10 7s-8.6-2.4-10-7Z" fill="#c9a5e8" opacity=".8"/>
      ${blush(18.5, 38)}${blush(45.5, 38)}`;
  },
  turtle(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#8fe0a8', '#3f9e6a')}</defs>
      <ellipse cx="12" cy="42" rx="6" ry="4.4" fill="#a8e8c0" transform="rotate(-18 12 42)"/>
      <ellipse cx="52" cy="42" rx="6" ry="4.4" fill="#a8e8c0" transform="rotate(18 52 42)"/>
      <circle cx="32" cy="20" r="10.5" fill="#a8e8c0"/>
      ${eye(28, 19, 2.6)}${eye(36, 19, 2.6)}
      ${mouth('M29 24.5c1.8 1.6 4.2 1.6 6 0', '#3f7d5a', 2.2)}
      <path d="M32 25c12 0 20 6.8 20 15.5S44 56 32 56s-20-6.8-20-15.5S20 25 32 25Z" fill="url(#${g})"/>
      <path d="M32 30 40 35.5 37 45h-10l-3-9.5Z" fill="#d8f5e2" opacity=".85"/>
      <circle cx="19" cy="41" r="3.4" fill="#d8f5e2" opacity=".7"/>
      <circle cx="45" cy="41" r="3.4" fill="#d8f5e2" opacity=".7"/>
      ${blush(21.5, 22)}${blush(42.5, 22)}`;
  },
  giraffe(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#ffdf9e', '#f0ab4c')}</defs>
      ${mouth('M25 14v-6M39 14v-6', '#f0ab4c', 4)}
      <circle cx="25" cy="7" r="3.2" fill="#c98a44"/><circle cx="39" cy="7" r="3.2" fill="#c98a44"/>
      <ellipse cx="32" cy="34" rx="17" ry="19" fill="url(#${g})"/>
      <circle cx="21" cy="26" r="3.6" fill="#d99b4a" opacity=".75"/>
      <circle cx="43" cy="24" r="3" fill="#d99b4a" opacity=".75"/>
      <circle cx="45" cy="35" r="3.4" fill="#d99b4a" opacity=".75"/>
      <ellipse cx="32" cy="44" rx="10" ry="7.5" fill="#ffeed0"/>
      ${eye(25, 30)}${eye(39, 30)}
      <ellipse cx="28.5" cy="42.5" rx="1.8" ry="2.4" fill="#a8703a"/>
      <ellipse cx="35.5" cy="42.5" rx="1.8" ry="2.4" fill="#a8703a"/>
      ${mouth('M28 47.5c2.4 1.8 5.6 1.8 8 0', '#a8703a', 2.4)}
      ${blush(19.5, 39)}${blush(44.5, 39)}`;
  },
  pig(id) {
    const g = uid(id);
    return `<defs>${furGrad(g, '#ffcfe0', '#f394b6')}</defs>
      <path d="M16 22 13 10l12 5Z" fill="#f394b6"/><path d="M48 22 51 10l-12 5Z" fill="#f394b6"/>
      <circle cx="32" cy="34" r="19" fill="url(#${g})"/>
      ${eye(25, 30)}${eye(39, 30)}
      <ellipse cx="32" cy="41" rx="9" ry="7" fill="#ffb0cc"/>
      <ellipse cx="28.8" cy="41" rx="1.9" ry="2.6" fill="#d96f96"/>
      <ellipse cx="35.2" cy="41" rx="1.9" ry="2.6" fill="#d96f96"/>
      ${blush(19.5, 37)}${blush(44.5, 37)}`;
  }
};

/** Ordered sticker set — 16 die-cut animal stickers. */
export const STICKER_IDS = [
  'dog', 'cat', 'rabbit', 'bear',
  'panda', 'lion', 'frog', 'penguin',
  'elephant', 'fox', 'chick', 'whale',
  'owl', 'turtle', 'giraffe', 'pig'
];

/** Japanese names, spoken/labelled for the album. */
export const STICKER_NAMES = {
  dog: 'いぬ', cat: 'ねこ', rabbit: 'うさぎ', bear: 'くま',
  panda: 'ぱんだ', lion: 'らいおん', frog: 'かえる', penguin: 'ぺんぎん',
  elephant: 'ぞう', fox: 'きつね', chick: 'ひよこ', whale: 'くじら',
  owl: 'ふくろう', turtle: 'かめ', giraffe: 'きりん', pig: 'ぶた'
};

/** Bare animal art (no backing) — usable inline anywhere. */
export function animal(id, o) {
  const art = ANIMAL_ART[id] || ANIMAL_ART.dog;
  return svg('animal ic-animal-' + id, art(id), o);
}

/** Die-cut sticker: white backing + drop shadow + the animal. */
export function sticker(id, o = {}) {
  const art = ANIMAL_ART[id] || ANIMAL_ART.dog;
  const s = uid('sk');
  return svg('sticker ic-sticker-' + id, `<defs>
    <radialGradient id="${s}" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0.72" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".08"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="33" r="30.5" fill="#ffffff"/>
  <circle cx="32" cy="33" r="30.5" fill="url(#${s})"/>
  <g transform="translate(32 33) scale(.88) translate(-32 -33)">${art(id)}</g>`, o);
}

/* ============================================================== registry = */

export const ICONS = {
  bottle, bathtub, onesie, balloon, moon, star, apple, book,
  speakerOn, speakerOff, home, check, exclamation, close, play,
  arrowDown, chevron, bubble, smile, spark, heart, paw
};

/** Look an icon up by name; unknown names render nothing rather than throw. */
export function icon(name, opts) {
  const fn = ICONS[name];
  return fn ? fn(opts) : '';
}

/** Meter → symbol mapping used by the HUD. */
export const METER_ICON = {
  food: 'apple',
  clean: 'bubble',
  happy: 'smile',
  energy: 'spark'
};

/** Activity → symbol mapping used by the bottom bar. */
export const ACTIVITY_ICON = {
  feed: 'bottle',
  bath: 'bathtub',
  dress: 'onesie',
  play: 'balloon',
  sleep: 'moon'
};

export default ICONS;
