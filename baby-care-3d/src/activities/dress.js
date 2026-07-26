/* ============================================================================
 * activities/dress.js — 👕 きせかえ
 * ----------------------------------------------------------------------------
 * Nobody changes clothes in one frame, so neither does the baby:
 *
 *   1. Pick a garment off a real hanger in the wardrobe. The hangers turn so
 *      you can see the clothes in the round — they are 3D garments, not icons.
 *   2. あたまから すぽっ — the garment is lowered over the head and the neck
 *      hole genuinely stretches around it (wrapGeometry pushes every vertex the
 *      head touches out onto the head sphere), then snaps back.
 *   3. ひだりうで → みぎうで, one sleeve at a time.
 *   4. ボタンを パチン, one button at a time, each with real thread.
 *   5. くつした・くつ are one foot at a time, and the baby wobbles on one leg
 *      while you do it (けんけんバランス).
 *
 * Dirty clothes get a nose-pinch refusal and start the laundry chain instead:
 * washing machine (real glass door, tumbling load, suds) → drying line with
 * drips → fluffy dry → back on the hanger.
 *
 * Rain outside means the raincoat and boots are the ごせいかい; a sleepy baby
 * means the pyjamas are. Both are hinted by pointing, never by text.
 *
 * Sound names requested from engine/audio.js:
 *   pop tap whoosh snap peg stink refuse chime tada ding washer bubble drip
 *   kenken squeak sock zip
 * ========================================================================== */

import * as THREE from 'three';
import * as M from '../engine/materials.js';
import * as TEX from '../engine/textures.js';
import * as S from './_shared.js';

/* --------------------------------------------------------------- wardrobe - */

export const GARMENTS = [
  {
    id: 'onesie', label: 'ロンパース', color: 0x9fe0c8, trim: 0x5fb9a0,
    weave: 'knit', buttons: 3, sleeve: 'short', skirt: false, hood: false, kind: 'day'
  },
  {
    id: 'dress', label: 'ワンピース', color: 0xffb3cd, trim: 0xef86ad,
    weave: 'plain', buttons: 2, sleeve: 'short', skirt: true, hood: false, kind: 'day'
  },
  {
    id: 'raincoat', label: 'レインコート', color: 0xffd23f, trim: 0xdda200,
    weave: 'plain', buttons: 3, sleeve: 'long', skirt: false, hood: true, kind: 'rain', glossy: true
  },
  {
    id: 'pyjamas', label: 'パジャマ', color: 0xb9a7f0, trim: 0x8f7ad8,
    weave: 'terry', buttons: 3, sleeve: 'long', skirt: false, hood: false, kind: 'sleep'
  },
  {
    id: 'tshirt', label: 'Tシャツ', color: 0x8fd0ff, trim: 0x57a6e0,
    weave: 'plain', buttons: 0, sleeve: 'short', skirt: false, hood: false, kind: 'day'
  }
];

const RAIL_Y = 0.60;
const RAIL_SPAN = 0.46;
const HEAD_R = 0.072;          // fallback head radius when the rig will not say

/* ---------------------------------------------------- picker garment art --
 * The wardrobe rail is the real chooser — five 3D garments on hangers that the
 * raycaster already picks up. But the child needs to see a choice even when
 * the camera is not on the rail, so the same five garments also go into the
 * HUD's contextual tray as tappable tiles. Tapping a tile runs exactly the
 * same `_tapGarment()` path as tapping the hanger, so the head/sleeve/button
 * sequence is unchanged.
 *
 * The art is drawn here (rather than reusing the single `onesie` glyph) so a
 * pre-literate child can tell a dress from pyjamas from a raincoat at a
 * glance — silhouette first, colour second, no text anywhere. It follows the
 * house language from ui/icons.js: 64×64 grid, art inside the 6..58 box,
 * one linear gradient plus one white sheen, 3-unit round strokes.
 * ------------------------------------------------------------------------ */

let _svgSeq = 0;
const uid = (p) => `bc-dg-${p}-${(++_svgSeq).toString(36)}`;
const hex = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');

/** Multiply a hex colour towards black (k<1) or white (k>1, clamped). */
function shade(n, k) {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return hex((r << 16) | (g << 8) | b);
}

const SHEEN = (id) =>
  `<radialGradient id="${id}" cx="0.3" cy="0.18" r="0.75">` +
  `<stop offset="0" stop-color="#fff" stop-opacity=".55"/>` +
  `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

const GRAD = (id, a, b) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

const line = (d, c, w = 3, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" ` +
  `stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;

/**
 * Silhouettes keyed by garment id. Each is called with the garment's own
 * colours so the tile shows the *actual* garment hanging on the rail, not a
 * generic clothes symbol.
 */
const GARMENT_ART = {
  onesie(c) {
    const g = uid('on'), s = uid('sh');
    const body = 'M24 11.6h16l9.8 5.1c2.2 1.1 3 3.8 1.9 6l-2.3 4.4c-1.1 2-3.7 2.6-5.5 1.3l-2-1.3v13.2c0 5.2-3 8.4-8.1 9-1-3-1.6-5.2-1.8-7.7h-2.4c-.2 2.5-.8 4.7-1.8 7.7-5.1-.6-8.1-3.8-8.1-9V27.1l-2 1.3c-1.8 1.3-4.4.7-5.5-1.3l-2.3-4.4c-1.1-2.2-.3-4.9 1.9-6Z';
    return `<defs>${GRAD(g, c.light, c.deep)}${SHEEN(s)}</defs>
      <path d="${body}" fill="url(#${g})"/>
      <path d="M23.4 39.9h17.2c-.5 3.4-1.7 5.7-3.5 7H26.9c-1.8-1.3-3-3.6-3.5-7Z" fill="${c.trim}" opacity=".9"/>
      <circle cx="28.2" cy="44.1" r="1.9" fill="#fff"/>
      <circle cx="35.8" cy="44.1" r="1.9" fill="#fff"/>
      ${line('M24 11.6c1.6 3.4 4.4 5.1 8 5.1s6.4-1.7 8-5.1', c.trim, 3.4)}
      <path d="${body}" fill="url(#${s})"/>
      ${line('M20.4 20.5v9.4', '#fff', 3, 'opacity=".5"')}`;
  },

  dress(c) {
    const g = uid('dr'), s = uid('sh');
    const body = 'M25 11.6h14l7.9 4.1c2.1 1.1 2.9 3.7 1.8 5.8l-2 3.9c-1 2-3.5 2.7-5.3 1.5l-.6-.4 6.7 19.9c.7 2-.5 4.1-2.5 4.6-8.5 2.1-17.1 2.1-25.6 0-2.1-.5-3.3-2.6-2.6-4.6l6.7-19.9-.6.4c-1.8 1.2-4.3.5-5.3-1.5l-2-3.9c-1.1-2.1-.3-4.7 1.8-5.8Z';
    return `<defs>${GRAD(g, c.light, c.deep)}${SHEEN(s)}</defs>
      <path d="${body}" fill="url(#${g})"/>
      ${line('M22.2 28.6h19.6', c.trim, 3.4)}
      ${line('M16.4 44.8c10.4 2.5 20.8 2.5 31.2 0', c.trim, 3.2)}
      ${line('M25 11.6c1.5 3.2 4.1 4.8 7 4.8s5.5-1.6 7-4.8', c.trim, 3.4)}
      <circle cx="32" cy="22.4" r="2.1" fill="#fff" opacity=".85"/>
      <path d="${body}" fill="url(#${s})"/>
      ${line('M20.6 19.8v5.6', '#fff', 2.8, 'opacity=".5"')}`;
  },

  raincoat(c) {
    const g = uid('rc'), s = uid('sh');
    // Wide skirt, long sleeves that hang to the hip, and a hood slung across
    // the shoulders in the *same* cloth — a hood drawn in the trim colour on
    // top of the collar reads as a separate hat, which is not what a raincoat
    // looks like to anyone, least of all a four-year-old.
    const body = 'M22.4 16.6h19.2l10.6 5.5c2.2 1.2 3 3.9 1.8 6.1l-4.7 9c-1.1 2.1-3.7 2.8-5.7 1.5v11.9c0 2-1.6 3.6-3.6 3.6H24c-2 0-3.6-1.6-3.6-3.6V38.7c-2 1.3-4.6.6-5.7-1.5l-4.7-9c-1.2-2.2-.4-4.9 1.8-6.1Z';
    return `<defs>${GRAD(g, c.light, c.deep)}${SHEEN(s)}</defs>
      <path d="M32 5.8c-7.4 0-12.6 5.1-12.6 11.8 0 1.1.9 1.9 1.9 1.9h21.4c1.1 0 1.9-.9 1.9-1.9C44.6 10.9 39.4 5.8 32 5.8Z" fill="${c.deep}"/>
      <path d="M32 9.8c-4.9 0-8.7 3.3-9.5 8h19c-.8-4.7-4.6-8-9.5-8Z" fill="${c.trim}"/>
      <path d="${body}" fill="url(#${g})"/>
      ${line('M32 19.4V54.2', c.trim, 3.2)}
      <circle cx="28" cy="27.4" r="2" fill="#fff"/>
      <circle cx="28" cy="36.2" r="2" fill="#fff"/>
      <circle cx="28" cy="45" r="2" fill="#fff"/>
      ${line('M15.8 34.6 13.3 30M48.2 34.6l2.5-4.6', c.trim, 3.2)}
      <path d="${body}" fill="url(#${s})"/>
      ${line('M18.6 24.6 16.2 30', '#fff', 3, 'opacity=".5"')}`;
  },

  pyjamas(c) {
    const g = uid('pj'), g2 = uid('pj2'), s = uid('sh');
    const top = 'M24 9.6h16l9.4 4.9c2.1 1.1 2.9 3.6 1.8 5.7l-2.2 4.2c-1 2-3.5 2.6-5.3 1.4l-1.7-1.1v8.5H22v-8.5l-1.7 1.1c-1.8 1.2-4.3.6-5.3-1.4l-2.2-4.2c-1.1-2.1-.3-4.6 1.8-5.7Z';
    const legs = 'M22.6 35.4h18.8c1.4 0 2.4 1.1 2.3 2.5l-1.5 15.9c-.1 1.4-1.3 2.5-2.7 2.5h-3.6c-1.4 0-2.6-1.1-2.7-2.5L32 44.2l-1.2 9.6c-.2 1.4-1.3 2.5-2.7 2.5h-3.6c-1.4 0-2.6-1.1-2.7-2.5l-1.5-15.9c-.1-1.4.9-2.5 2.3-2.5Z';
    return `<defs>${GRAD(g, c.light, c.deep)}${GRAD(g2, c.deep, c.dark)}${SHEEN(s)}</defs>
      <path d="${legs}" fill="url(#${g2})"/>
      <path d="${top}" fill="url(#${g})"/>
      ${line('M24 9.6c1.6 3.3 4.3 5 8 5s6.4-1.7 8-5', c.trim, 3.4)}
      ${line('M21.4 34.2h21.2', c.trim, 3.4)}
      <circle cx="27" cy="20.6" r="1.9" fill="#fff" opacity=".8"/>
      <circle cx="37.4" cy="27" r="1.6" fill="#fff" opacity=".7"/>
      <circle cx="27.6" cy="44.4" r="1.7" fill="#fff" opacity=".65"/>
      <circle cx="37" cy="47.6" r="1.5" fill="#fff" opacity=".6"/>
      <path d="${top}" fill="url(#${s})"/>`;
  },

  tshirt(c) {
    const g = uid('ts'), s = uid('sh');
    const body = 'M24 13.4h16l10 5.2c2.2 1.1 3 3.8 1.9 6l-2.3 4.4c-1.1 2-3.7 2.6-5.5 1.3L42 29v18.6c0 2.4-1.9 4.4-4.4 4.4H26.4c-2.5 0-4.4-2-4.4-4.4V29l-2.1 1.3c-1.8 1.3-4.4.7-5.5-1.3l-2.3-4.4c-1.1-2.2-.3-4.9 1.9-6Z';
    return `<defs>${GRAD(g, c.light, c.deep)}${SHEEN(s)}</defs>
      <path d="${body}" fill="url(#${g})"/>
      ${line('M24 13.4c1.6 3.4 4.4 5.1 8 5.1s6.4-1.7 8-5.1', c.trim, 3.6)}
      ${line('M23.4 48.2h17.2', c.trim, 2.8, 'opacity=".7"')}
      <path d="${body}" fill="url(#${s})"/>
      ${line('M20.4 22.2v9.4', '#fff', 3, 'opacity=".5"')}`;
  }
};

/**
 * One tray tile: a 64×64 SVG string ready for `UI#setTools({ svg })`.
 * `dim` greys the tile out while the garment is in the wash — the child still
 * sees five garments, so the row never reflows, but the unavailable ones read
 * as unavailable without a word of text.
 */
export function garmentTile(spec, dim = false) {
  const draw = GARMENT_ART[spec.id] || GARMENT_ART.onesie;
  const c = {
    light: shade(spec.color, 1.1),
    deep: hex(spec.color),
    dark: shade(spec.color, 0.8),
    trim: hex(spec.trim)
  };
  const style = dim ? ' style="opacity:.42;filter:saturate(.25)"' : '';
  return `<svg class="ic ic-garment ic-garment-${spec.id}" viewBox="0 0 64 64" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"${style}>` +
    `${draw(c)}</svg>`;
}

export class DressActivity {
  constructor(ctx) {
    this.ctx = ctx;
    this.trash = new S.Trash();
    this.clock = new S.Clockwork();
    this.picker = new S.Picker(ctx.renderer, ctx.camera);

    this.root = null;
    this.garments = [];          // { spec, group, hanger, state, parts... }
    this.dressing = null;        // { g, step, buttonsDone }
    this.laundry = null;         // { g, phase, t }
    this.footStep = 0;           // 0..4 : sockL sockR shoeL shoeR
    this.hop = { t: 0, side: 0 };
    this.labels = [];
    this.time = 0;
    this.worn = null;
    this.recommend = null;

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._rand = S.rng(19730914);
    this._entered = false;
  }

  /* =========================================================== building == */

  async build() {
    const ctx = this.ctx;
    this.root = new THREE.Group();
    this.root.name = 'dress-rig';
    this.trash.obj(this.root);
    S.placeAtAnchor(this.root, ctx.room?.anchor?.('wardrobe'), [0, 0, 0], [0, 0, -0.2]);
    ctx.scene.add(this.root);

    this._makeMaterials();
    this._buildPodium();
    this._buildWardrobe();
    this._buildWasher();
    this._buildLine();
    this._buildBasket();
    this._buildMirror();
    this._buildFootwear();
    this._buildStink();

    for (let i = 0; i < GARMENTS.length; i++) {
      const entry = this._buildGarment(GARMENTS[i]);
      entry.railX = -RAIL_SPAN / 2 + (i / (GARMENTS.length - 1)) * RAIL_SPAN;
      entry.group.position.set(entry.railX, RAIL_Y - 0.115, -0.16);
      entry.hanger.position.set(entry.railX, RAIL_Y, -0.16);
      this.garments.push(entry);
      this.root.add(entry.group);
      this.root.add(entry.hanger);
    }

    // whatever the baby was wearing starts dirty if the last meal was messy
    const bodyDirt = ctx.state?.dirt?.body ?? 0;
    if (bodyDirt > 0.25) this._setGarmentState(this.garments[0], 'dirty');

    S.shade(this.root, true, true);
    this.targets = [this.root];
    if (ctx.baby?.group) this.targets.push(ctx.baby.group);
  }

  _makeMaterials() {
    const t = this.trash;
    this.tier = this.ctx.tier ?? 2;
    this.mat = {
      wood: t.mat(M.makeWood({ light: 0xf3d3ad, dark: 0xb07f4a, repeat: 2, seed: 3 })),
      woodPale: t.mat(M.makeWood({ light: 0xfdeada, dark: 0xd9b78c, repeat: 3, seed: 12, clearcoat: 0.5 })),
      carpet: t.mat(M.makeCarpet({ color: 0xffd7e6, repeat: 2, seed: 19 })),
      metal: S.Trash.shared(M.makeMetal({ color: 0xd7dde4, roughness: 0.2 })),
      chrome: S.Trash.shared(M.makeMetal({ color: 0xf0f3f6, roughness: 0.08 })),
      applianceBody: t.mat(M.makePaint({ color: 0xf7fafc, gloss: 0.6, seed: 43 })),
      applianceTrim: t.mat(M.makePlastic({ color: 0xa9cfe2, matte: 0.26, seed: 39 })),
      glass: t.mat(M.makeGlass({ thickness: 0.012, roughness: 0.05, ior: 1.5 })),
      drum: t.mat(M.makePlastic({ color: 0x59707e, matte: 0.5, seed: 45 })),
      suds: t.mat(S.sudsMaterial({ color: 0xfffdfa, opacity: 0.88 })),
      rope: t.mat(M.makeCloth({ color: 0xe7d3ae, weave: 'plain', repeat: 8, seed: 6 })),
      basket: t.mat(M.makeWood({ light: 0xe8c79a, dark: 0xa87a45, repeat: 6, seed: 15 })),
      sock: t.mat(M.makeCloth({ color: 0xb5f0d6, weave: 'knit', repeat: 5, seed: 24 })),
      shoe: t.mat(M.makePlastic({ color: 0xe2564c, matte: 0.3, seed: 26, clearcoat: 0.8 })),
      boot: t.mat(M.makePlastic({ color: 0xffd23f, matte: 0.18, seed: 28, clearcoat: 1 })),
      sole: t.mat(M.makePlastic({ color: 0xfdfdfd, matte: 0.55, seed: 30 })),
      thread: t.mat(M.makeCloth({ color: 0xfffdf8, weave: 'plain', repeat: 12, seed: 31 })),
      stink: t.mat(new THREE.MeshBasicMaterial({
        color: 0x9fd77a, transparent: true, opacity: 0.5, depthWrite: false
      })),
      hint: t.mat(new THREE.MeshBasicMaterial({
        color: 0xfff0a8, transparent: true, opacity: 0.5, depthWrite: false,
        blending: THREE.AdditiveBlending
      }))
    };
  }

  /* ---------------------------------------------------------- furniture -- */

  _buildPodium() {
    const base = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0], [0.26, 0], [0.28, 0.012], [0.275, 0.040], [0.26, 0.050], [0, 0.050]
    ], 40)), this.mat.woodPale);
    base.position.set(0, 0, 0.40);
    this.root.add(base);
    const topGeo = this.trash.geo(new THREE.CircleGeometry(0.255, 40));
    topGeo.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(topGeo, this.mat.carpet);
    top.position.set(0, 0.0505, 0.40);
    top.receiveShadow = true;
    this.root.add(top);
    this.podium = base;
  }

  _buildWardrobe() {
    const W = 0.64, H = 0.88, D = 0.30, z = -0.16;
    const parts = [];
    parts.push([S.roundedBox(W, 0.024, D, 0.008, 3), S.xform([0, H, z])]);            // top
    parts.push([S.roundedBox(W, 0.020, D, 0.008, 3), S.xform([0, 0.012, z])]);        // base
    parts.push([S.roundedBox(0.024, H, D, 0.008, 3), S.xform([-W / 2, H / 2, z])]);
    parts.push([S.roundedBox(0.024, H, D, 0.008, 3), S.xform([W / 2, H / 2, z])]);
    parts.push([S.roundedBox(W, H, 0.016, 0.006, 3), S.xform([0, H / 2, z - D / 2])]); // back
    parts.push([S.roundedBox(W - 0.05, 0.018, D - 0.04, 0.006, 3), S.xform([0, 0.30, z])]); // shelf
    for (const sx of [-1, 1]) {                                                        // feet
      parts.push([S.roundedBox(0.05, 0.035, 0.05, 0.010, 2), S.xform([sx * (W / 2 - 0.05), -0.016, z + D / 2 - 0.05])]);
      parts.push([S.roundedBox(0.05, 0.035, 0.05, 0.010, 2), S.xform([sx * (W / 2 - 0.05), -0.016, z - D / 2 + 0.05])]);
    }
    const cabinet = new THREE.Mesh(this.trash.geo(S.mergeAll(parts)), this.mat.wood);
    this.root.add(cabinet);
    this.wardrobe = cabinet;

    const rail = new THREE.Mesh(
      this.trash.geo(new THREE.CylinderGeometry(0.006, 0.006, W - 0.05, 12)), this.mat.chrome);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, RAIL_Y, z);
    this.root.add(rail);

    // Two doors, hinged at the outer edges. The panel reaches *inwards* from
    // its hinge to the middle of the cabinet, and swings forward and outwards.
    this.doors = [];
    for (const sx of [-1, 1]) {
      const door = new THREE.Group();
      const panel = new THREE.Mesh(
        this.trash.geo(S.roundedBox(W / 2 - 0.012, H - 0.05, 0.018, 0.006, 3)), this.mat.woodPale);
      panel.position.set(-sx * (W / 4 - 0.006), 0, 0);
      door.add(panel);
      const knob = new THREE.Mesh(
        this.trash.geo(new THREE.SphereGeometry(0.011, 14, 10)), this.mat.chrome);
      knob.position.set(-sx * (W / 2 - 0.052), 0, 0.014);
      door.add(knob);
      door.position.set(sx * (W / 2 - 0.012), H / 2, z + D / 2);
      this.root.add(door);
      this.doors.push({ group: door, sx, open: 0 });
    }
    this.doorTarget = 0;
  }

  _buildWasher() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      this.trash.geo(S.roundedBox(0.34, 0.36, 0.32, 0.020, 5)), this.mat.applianceBody);
    body.position.y = 0.18;
    g.add(body);
    const topPlate = new THREE.Mesh(
      this.trash.geo(S.roundedBox(0.35, 0.018, 0.33, 0.008, 3)), this.mat.applianceTrim);
    topPlate.position.y = 0.367;
    g.add(topPlate);

    // control dial + lamp
    const dial = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0], [0.020, 0], [0.022, 0.006], [0.018, 0.012], [0, 0.013]
    ], 20)), this.mat.applianceTrim);
    dial.rotation.x = -Math.PI / 2;
    dial.position.set(-0.09, 0.315, 0.161);
    g.add(dial);
    this.washDial = dial;
    const lampGeo = this.trash.geo(new THREE.CircleGeometry(0.008, 16));
    const lampMat = this.trash.mat(new THREE.MeshBasicMaterial({ color: 0x3ad07a }));
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0.02, 0.315, 0.1615);
    g.add(lamp);
    this.washLamp = lamp;
    this.washLampMat = lampMat;

    // drum: an open cylinder you can see into through the glass
    const drum = new THREE.Group();
    const shell = new THREE.Mesh(
      this.trash.geo(new THREE.CylinderGeometry(0.105, 0.105, 0.20, 32, 1, true)), this.mat.drum);
    shell.rotation.x = Math.PI / 2;
    shell.material.side = THREE.DoubleSide;
    drum.add(shell);
    const backGeo = this.trash.geo(new THREE.CircleGeometry(0.105, 32));
    const back = new THREE.Mesh(backGeo, this.mat.drum);
    back.position.z = -0.10;
    drum.add(back);
    const baffles = [];                                 // three lifters, one call
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      baffles.push([S.roundedBox(0.024, 0.028, 0.16, 0.006, 2),
      S.xform([Math.cos(a) * 0.088, Math.sin(a) * 0.088, -0.01], [0, 0, a])]);
    }
    drum.add(new THREE.Mesh(this.trash.geo(S.mergeAll(baffles)), this.mat.applianceTrim));
    // the load itself — crumpled cloth that really tumbles
    this.load = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.SphereGeometry(0.030 + i * 0.004, 14, 10);
      const p = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const n = TEX.fbm(v.x * 8 + 0.5, v.y * 8 + 0.5, 7, 3, 5 + i) - 0.5;
        v.multiplyScalar(1 + n * 0.55);
        p.setXYZ(k, v.x, v.y * 0.8, v.z);
      }
      geo.computeVertexNormals();
      this.trash.geo(geo);
      const m = new THREE.Mesh(geo, this.mat.sock);
      const a = (i / 3) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.02 + i * 0.02);
      m.visible = false;
      drum.add(m);
      this.load.push(m);
    }
    // suds inside the drum
    const sudGeo = this.trash.geo(new THREE.SphereGeometry(0.016, 10, 8));
    const suds = new THREE.InstancedMesh(sudGeo, this.mat.suds, 16);
    suds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    suds.frustumCulled = false;
    suds.visible = false;
    drum.add(suds);
    this.sudsMesh = suds;
    this.sudsState = [];
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 16; i++) {
      const a = this._rand() * Math.PI * 2, r = this._rand() * 0.085;
      const st = {
        x: Math.cos(a) * r, y: Math.sin(a) * r, z: -0.06 + this._rand() * 0.10,
        s: 0.3 + this._rand() * 0.8, phase: this._rand() * Math.PI * 2
      };
      this.sudsState.push(st);
      mtx.makeScale(0, 0, 0);
      suds.setMatrixAt(i, mtx);
    }
    suds.instanceMatrix.needsUpdate = true;

    drum.position.set(0, 0.19, -0.02);
    g.add(drum);
    this.drum = drum;

    // Door: metal ring + real glass. The group origin sits on the hinge at the
    // right-hand edge so the door swings instead of spinning on the spot.
    const door = new THREE.Group();
    const HINGE = 0.145;
    const ring = new THREE.Mesh(this.trash.geo(S.lathe([
      [0.100, 0], [0.128, 0.004], [0.132, 0.016], [0.126, 0.026],
      [0.104, 0.028], [0.100, 0.020]
    ], 36)), this.mat.chrome);
    ring.rotation.x = Math.PI / 2;
    ring.position.x = -HINGE;
    door.add(ring);
    const glassGeo = this.trash.geo(S.lathe([
      [0, 0.020], [0.060, 0.018], [0.092, 0.010], [0.104, 0.000], [0.104, 0.006]
    ], 32));
    const glass = new THREE.Mesh(glassGeo, this.mat.glass);
    glass.rotation.x = Math.PI / 2;
    glass.position.x = -HINGE;
    glass.renderOrder = 3;
    door.add(glass);
    const handle = new THREE.Mesh(
      this.trash.geo(S.roundedBox(0.020, 0.060, 0.018, 0.007, 3)), this.mat.applianceTrim);
    handle.position.set(-HINGE - 0.128, 0, 0.006);
    door.add(handle);
    door.position.set(HINGE, 0.19, 0.152);
    g.add(door);
    this.washDoor = door;
    this.washDoorOpen = 0;
    this.washDoorTarget = 0;

    g.position.set(0.60, 0, 0.16);
    g.rotation.y = -0.55;
    g.userData.pickId = 'washer';
    const proxy = S.hitProxy(0.22, 'washer-hit');
    proxy.position.set(0, 0.2, 0.05);
    g.add(proxy);
    this.root.add(g);
    this.washer = g;
  }

  _buildLine() {
    const g = new THREE.Group();
    const postProfile = [
      [0, 0], [0.026, 0], [0.020, 0.02], [0.013, 0.10], [0.011, 0.72], [0.014, 0.74], [0, 0.745]
    ];
    g.add(new THREE.Mesh(this.trash.geo(S.mergeAll([
      [S.lathe(postProfile, 16), S.xform([-0.26, 0, 0])],
      [S.lathe(postProfile, 16), S.xform([0.26, 0, 0])]
    ])), this.mat.woodPale));
    // a proper catenary, not a straight bar
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector3(-0.26 + t * 0.52, 0.735 - Math.sin(t * Math.PI) * 0.035, 0));
    }
    const rope = new THREE.Mesh(this.trash.geo(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0035, 6)), this.mat.rope);
    g.add(rope);
    this.lineCurve = new THREE.CatmullRomCurve3(pts);

    this.pegs = [];
    for (const t of [0.34, 0.66]) {
      const peg = new THREE.Mesh(
        this.trash.geo(S.roundedBox(0.010, 0.026, 0.014, 0.003, 2)), this.mat.applianceTrim);
      const p = this.lineCurve.getPointAt(t);
      peg.position.copy(p);
      peg.visible = false;
      g.add(peg);
      this.pegs.push(peg);
    }

    g.position.set(0.70, 0, -0.20);
    g.rotation.y = -0.85;
    this.root.add(g);
    this.line = g;
  }

  _buildBasket() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.trash.geo(S.lathe([
      [0, 0], [0.10, 0], [0.105, 0.006], [0.125, 0.11], [0.130, 0.125], [0.124, 0.128],
      [0.119, 0.115], [0.099, 0.010], [0, 0.008]
    ], 26)), this.mat.basket);
    g.add(body);
    const hoops = [];
    for (let i = 0; i < 3; i++) {
      hoops.push([new THREE.TorusGeometry(0.105 + i * 0.008, 0.0035, 6, 26),
      S.xform([0, 0.025 + i * 0.042, 0], [Math.PI / 2, 0, 0])]);
    }
    g.add(new THREE.Mesh(this.trash.geo(S.mergeAll(hoops)), this.mat.woodPale));
    g.position.set(-0.40, 0, 0.46);
    g.userData.pickId = 'basket';
    const bh = S.hitProxy(0.14, 'basket-hit');
    bh.position.y = 0.07;
    g.add(bh);
    this.root.add(g);
    this.basket = g;
  }

  _buildMirror() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.trash.geo(S.mergeAll([
      new THREE.TorusGeometry(0.155, 0.018, 12, 36),
      [S.lathe([[0, 0], [0.075, 0], [0.070, 0.014], [0.016, 0.06], [0.013, 0.455], [0, 0.465]], 18),
      S.xform([0, -0.620, 0])]
    ])), this.mat.woodPale));
    const glassGeo = this.trash.geo(new THREE.CircleGeometry(0.152, 36));
    const glass = new THREE.Mesh(glassGeo, this.mat.chrome);
    glass.position.z = -0.004;
    g.add(glass);
    g.position.set(-0.58, 0.62, 0.02);
    g.rotation.y = 0.78;
    this.root.add(g);
    this.mirror = g;
  }

  _buildFootwear() {
    const make = (kind, side) => {
      const g = new THREE.Group();
      const sx = side === 0 ? -1 : 1;
      if (kind === 'sock') {
        const geo = this.trash.geo(S.lathe([
          [0, 0], [0.017, 0.002], [0.019, 0.010], [0.018, 0.030], [0.020, 0.040],
          [0.019, 0.048], [0, 0.050]
        ], 20));
        const sock = new THREE.Mesh(geo, this.mat.sock);
        g.add(sock);
        const cuff = new THREE.Mesh(this.trash.geo(
          new THREE.TorusGeometry(0.019, 0.004, 8, 20)), this.mat.sock);
        cuff.rotation.x = Math.PI / 2;
        cuff.position.y = 0.046;
        g.add(cuff);
        const toe = new THREE.Mesh(this.trash.geo(new THREE.SphereGeometry(0.017, 14, 10)),
          this.mat.sock);
        toe.scale.set(1, 0.72, 1.5);
        toe.position.set(0, 0.010, sx * 0.004 + 0.010);
        g.add(toe);
      } else {
        const boot = kind === 'boot';
        const mat = boot ? this.mat.boot : this.mat.shoe;
        const upper = new THREE.Mesh(this.trash.geo(S.lathe([
          [0, 0.006], [0.020, 0.008], [0.022, 0.020], [0.021, boot ? 0.070 : 0.034],
          [0.023, boot ? 0.078 : 0.040], [0, boot ? 0.080 : 0.042]
        ], 20)), mat);
        g.add(upper);
        const toe = new THREE.Mesh(this.trash.geo(new THREE.SphereGeometry(0.020, 16, 12)), mat);
        toe.scale.set(1, 0.62, 1.55);
        toe.position.set(0, 0.014, 0.014);
        g.add(toe);
        const soleGeo = this.trash.geo(S.roundedBox(0.042, 0.010, 0.062, 0.004, 3));
        const sole = new THREE.Mesh(soleGeo, this.mat.sole);
        sole.position.set(0, 0.005, 0.008);
        g.add(sole);
        if (!boot) {
          const strap = new THREE.Mesh(this.trash.geo(
            new THREE.TorusGeometry(0.021, 0.0035, 6, 20, Math.PI)), this.mat.sole);
          strap.rotation.set(Math.PI / 2, 0, 0);
          strap.position.y = 0.030;
          g.add(strap);
        }
      }
      g.userData.pickId = 'foot:' + kind + ':' + side;
      const fh = S.hitProxy(0.055, 'foot-hit');
      fh.position.y = 0.02;
      g.add(fh);
      g.visible = false;
      this.root.add(g);
      return g;
    };
    this.socks = [make('sock', 0), make('sock', 1)];
    this.shoes = [make('shoe', 0), make('shoe', 1)];
    this.boots = [make('boot', 0), make('boot', 1)];
    // resting place: a little pile at the foot of the wardrobe
    const rest = [[-0.20, 0.03], [-0.13, 0.05], [0.13, 0.05], [0.20, 0.03]];
    const all = [...this.socks, ...this.shoes];
    for (let i = 0; i < all.length; i++) {
      all[i].position.set(rest[i][0], 0.0, 0.06 + rest[i][1]);
      all[i].rotation.y = (i % 2 ? 1 : -1) * 0.4;
    }
    for (let i = 0; i < 2; i++) {
      this.boots[i].position.set(rest[i + 2][0], 0, 0.06 + rest[i + 2][1]);
      this.boots[i].rotation.y = (i ? 1 : -1) * 0.4;
    }
  }

  /** Three wavy green ribbons for the「くさい！」moment. */
  _buildStink() {
    const g = new THREE.Group();
    this.stinkWaves = [];
    for (let i = 0; i < 3; i++) {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(new THREE.Vector3(Math.sin(t * 6 + i) * 0.014, t * 0.11, 0));
      }
      const mesh = new THREE.Mesh(this.trash.geo(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts), 16, 0.0035, 5)), this.mat.stink);
      mesh.position.x = (i - 1) * 0.028;
      g.add(mesh);
      this.stinkWaves.push(mesh);
    }
    g.visible = false;
    this.root.add(g);
    this.stink = g;
  }

  /* ---------------------------------------------------------- garments --- */

  _buildGarment(spec) {
    const group = new THREE.Group();
    group.name = 'garment-' + spec.id;
    group.userData.pickId = 'garment:' + spec.id;

    const cloth = this.trash.mat(M.makeCloth({
      color: spec.color, weave: spec.weave, repeat: spec.weave === 'terry' ? 5 : 6,
      seed: 7, threads: spec.weave === 'knit' ? 90 : 140,
      sheen: spec.glossy ? 0.35 : 0.95
    }));
    cloth.side = THREE.DoubleSide;
    if (spec.glossy) { cloth.clearcoat = 0.9; cloth.clearcoatRoughness = 0.2; cloth.roughness = 0.45; }
    const trim = this.trash.mat(M.makeCloth({
      color: spec.trim, weave: 'knit', repeat: 4, seed: 11, threads: 70
    }));
    trim.side = THREE.DoubleSide;

    // ---- body: a lathe grid so it can be stretched over the head ----------
    // Baby proportions: ~0.16 m long, 0.062 m at the widest, and a neck hole
    // (0.034) deliberately smaller than the head so it has to stretch.
    const profile = new THREE.SplineCurve([
      new THREE.Vector2(0.0615, -0.088), new THREE.Vector2(0.0635, -0.080),
      new THREE.Vector2(0.0590, -0.062), new THREE.Vector2(0.0560, -0.035),
      new THREE.Vector2(0.0570, -0.010), new THREE.Vector2(0.0600, 0.014),
      new THREE.Vector2(0.0612, 0.032), new THREE.Vector2(0.0580, 0.048),
      new THREE.Vector2(0.0480, 0.062), new THREE.Vector2(0.0380, 0.070),
      new THREE.Vector2(0.0340, 0.0745)
    ]).getPoints(26);
    const bodyGeo = this.trash.geo(new THREE.LatheGeometry(profile, 40));
    const body = new THREE.Mesh(bodyGeo, cloth);
    group.add(body);

    // ---- ribbed hem, neck band and shoulder seam -------------------------
    const bands = [];
    bands.push([new THREE.TorusGeometry(0.0625, 0.0050, 8, 36), S.xform([0, -0.0845, 0], [Math.PI / 2, 0, 0])]);
    bands.push([new THREE.TorusGeometry(0.0345, 0.0045, 8, 28), S.xform([0, 0.0740, 0], [Math.PI / 2, 0, 0])]);
    const bandMesh = new THREE.Mesh(this.trash.geo(S.mergeAll(bands)), trim);
    group.add(bandMesh);

    // visible topstitching around the yoke — just proud of the cloth
    const stitchPts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      stitchPts.push(new THREE.Vector3(Math.cos(a) * 0.0592, 0.046, Math.sin(a) * 0.0592));
    }
    const stitch = new THREE.Mesh(this.trash.geo(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(stitchPts, true), 64, 0.0013, 4, true)), trim);
    group.add(stitch);

    // ---- sleeves ---------------------------------------------------------
    const sleeves = [];
    const long = spec.sleeve === 'long';
    const len = long ? 0.072 : 0.036;
    for (const sx of [-1, 1]) {
      const s = new THREE.Group();
      const tubeGeo = this.trash.geo(new THREE.CylinderGeometry(0.026, 0.021, len, 20, 4, true));
      const tubeMesh = new THREE.Mesh(tubeGeo, cloth);
      tubeMesh.position.y = -len / 2;
      s.add(tubeMesh);
      const cuff = new THREE.Mesh(this.trash.geo(
        new THREE.TorusGeometry(0.0215, 0.0048, 8, 20)), trim);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -len;
      s.add(cuff);
      s.position.set(sx * 0.053, 0.036, 0);
      s.rotation.z = sx * 0.95;
      s.userData.baseQuat = s.quaternion.clone();
      s.userData.side = sx < 0 ? 0 : 1;
      group.add(s);
      sleeves.push(s);
    }

    // ---- placket + buttons with real thread -------------------------------
    let placket = null;
    const buttons = [];
    if (spec.buttons > 0) {
      // The placket follows the body's own profile, offset a couple of
      // millimetres out, so it lies on the cloth instead of standing off it
      // like a bolted-on plate.
      placket = new THREE.Group();
      const front = profile
        .filter(p => p.y > -0.048 && p.y < 0.058)
        .map(p => new THREE.Vector2(p.x + 0.0016, p.y));
      placket.add(new THREE.Mesh(
        this.trash.geo(new THREE.LatheGeometry(front, 14, -0.36, 0.72)), cloth));
      const edgePts = front.map(p => new THREE.Vector2(p.x + 0.0012, p.y));
      placket.add(new THREE.Mesh(
        this.trash.geo(new THREE.LatheGeometry(edgePts, 3, -0.372, 0.028)), trim));
      group.add(placket);

      // Each button is two draw calls: the disc (with its four sewing holes
      // sunk into it) and the crossed white thread over the top.
      const holeRings = [];
      for (let i = 0; i < spec.buttons; i++) {
        const b = new THREE.Group();
        const discParts = [[S.lathe([
          [0, 0], [0.0048, 0.0004], [0.0055, 0.0016], [0.0050, 0.0028], [0, 0.0030]
        ], 18), S.xform([0, 0, 0], [Math.PI / 2, 0, 0])]];
        for (let h = 0; h < 4; h++) {
          const hx = (h % 2 ? 1 : -1) * 0.0018, hy = (h < 2 ? 1 : -1) * 0.0018;
          discParts.push([new THREE.CylinderGeometry(0.0006, 0.0006, 0.004, 6),
          S.xform([hx, hy, 0], [Math.PI / 2, 0, 0])]);
        }
        const disc = new THREE.Mesh(this.trash.geo(S.mergeAll(discParts)), trim);
        b.add(disc);
        const threadGeo = this.trash.geo(S.mergeAll([
          [new THREE.CylinderGeometry(0.0004, 0.0004, 0.0051, 5),
          S.xform([0, 0, 0.0018], [0, 0, Math.PI / 4])],
          [new THREE.CylinderGeometry(0.0004, 0.0004, 0.0051, 5),
          S.xform([0, 0, 0.0018], [0, 0, -Math.PI / 4])]
        ]));
        b.add(new THREE.Mesh(threadGeo, this.mat.thread));
        // Undone: sitting off to the side of its hole, tilted to stay flat
        // against the curve of the placket. Done up: right in the hole.
        const y = 0.030 - i * 0.028;
        const R = 0.0632;
        b.userData.closed = new THREE.Vector3(-0.010, y, Math.sqrt(R * R - 0.010 * 0.010));
        b.userData.closedRotY = Math.asin(-0.010 / R);
        b.userData.open = new THREE.Vector3(0.019, y, Math.sqrt(R * R - 0.019 * 0.019));
        b.userData.openRotY = Math.asin(0.019 / R);
        b.position.copy(b.userData.open);
        b.rotation.y = b.userData.openRotY;
        b.userData.pickId = 'button:' + spec.id + ':' + i;
        b.add(S.hitProxy(0.026, 'button-hit'));
        group.add(b);
        buttons.push(b);
        holeRings.push([new THREE.TorusGeometry(0.0052, 0.0013, 6, 14),
        S.xform([-0.010, y, 0.0622], [0, b.userData.closedRotY, 0])]);
      }
      const holeMesh = new THREE.Mesh(this.trash.geo(S.mergeAll(holeRings)), trim);
      group.add(holeMesh);
    }

    // ---- loose parts on the physics solver --------------------------------
    let skirt = null, skirtSim = null;
    if (spec.skirt) {
      const segX = 26, segY = 6;
      const geo = this.trash.geo(new THREE.PlaneGeometry(0.393, 0.085, segX, segY));
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {                 // roll the panel into a skirt
        const a = (pos.getX(i) / 0.393) * Math.PI * 2;
        const y = pos.getY(i);
        const r = 0.0662 + (0.0425 - y) * 0.22;
        pos.setXYZ(i, Math.sin(a) * r, y - 0.086, Math.cos(a) * r);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      skirt = new THREE.Mesh(geo, cloth);
      group.add(skirt);
      skirtSim = S.makeCloth(this.ctx, skirt, {
        segX, segY, pins: S.topRow(segX), gravity: -2.6, wind: 0.5, stiffness: 0.9
      });
      this.trash.fn(() => skirtSim?.release());
    }

    let hood = null, hoodSim = null;
    if (spec.hood) {
      const segX = 10, segY = 8;
      const geo = this.trash.geo(S.clothPanel(0.105, 0.10, segX, segY,
        v => 0.55 + 0.45 * Math.sin(Math.min(1, v * 1.1) * Math.PI * 0.8)));
      geo.rotateX(0.25);
      geo.translate(0, 0.052, -0.048);
      hood = new THREE.Mesh(geo, cloth);
      group.add(hood);
      hoodSim = S.makeCloth(this.ctx, hood, {
        segX, segY, pins: S.topRow(segX), gravity: -2.2, wind: 0.4, stiffness: 0.75
      });
      this.trash.fn(() => hoodSim?.release());
    }

    // hanger: bent wire with a hook, all one draw call
    const hanger = new THREE.Group();
    hanger.add(new THREE.Mesh(this.trash.geo(S.mergeAll([
      S.tube([[-0.062, -0.030, 0], [-0.030, -0.006, 0], [0, 0.000, 0],
      [0.030, -0.006, 0], [0.062, -0.030, 0]], 0.0022, 26, 6),
      [new THREE.CylinderGeometry(0.0018, 0.0018, 0.122, 8),
      S.xform([0, -0.030, 0], [0, 0, Math.PI / 2])],
      [new THREE.TorusGeometry(0.011, 0.0020, 6, 18, Math.PI * 1.5),
      S.xform([0, 0.011, 0], [0, 0, -Math.PI / 2])]
    ])), this.mat.chrome));
    hanger.userData.pickId = 'garment:' + spec.id;
    const hh = S.hitProxy(0.075, 'hanger-hit');
    hh.position.y = -0.06;
    hanger.add(hh);
    group.add(S.hitProxy(0.085, 'garment-hit'));

    const entry = {
      spec, group, hanger, body, bodyBase: S.snapshot(bodyGeo),
      sleeves, buttons, placket, skirt, skirtSim, hood, hoodSim,
      cloth, trim, state: 'clean', spin: this._rand() * Math.PI * 2, wet: 0,
      detail: [stitch, ...buttons]
    };
    // On the weakest tier the millimetre details only appear once the garment
    // is actually being put on, where the camera is close enough to see them.
    if (this.tier === 0) this._setDetail(entry, false);
    return entry;
  }

  _setDetail(entry, on) {
    for (const d of entry.detail) d.visible = on;
  }

  /* ============================================================= enter === */

  async enter() {
    const ctx = this.ctx;
    this._entered = true;

    if (ctx.baby?.group) {
      this._babyHome = {
        pos: ctx.baby.group.position.clone(),
        quat: ctx.baby.group.quaternion.clone()
      };
      this.root.updateWorldMatrix(true, false);
      const stand = this._v.set(0, 0.051, 0.40).applyMatrix4(this.root.matrixWorld);
      ctx.baby.group.position.copy(stand);
      ctx.baby.group.quaternion.copy(this.root.quaternion);
      ctx.baby.group.rotation.z = 0;
    }
    try { ctx.baby?.playPose?.('stand', { seconds: 0.6 }); } catch (e) { /* rig may differ */ }
    S.mood(ctx, 'happy');

    this.doorTarget = 1;
    S.play(ctx, 'zip');

    // 天気・ねむけ連動のおすすめ
    const weather = ctx.state?.weather || 'clear';
    const energy = S.meter(ctx, 'energy');
    this.recommend = weather === 'rain' ? 'raincoat' : (energy < 0.35 ? 'pyjamas' : null);
    if (this.recommend) {
      const g = this.garments.find(x => x.spec.id === this.recommend);
      if (g) {
        S.gesture(ctx, ['point']);
        g.group.getWorldPosition(this._v);
        S.lookAt(ctx, this._v);
        const l = S.worldLabel(ctx, g.group, weather === 'rain' ? 'あめの ひ' : 'おやすみ',
          { icon: weather === 'rain' ? 'rain' : 'moon' });
        if (l) this.labels.push(l);
      }
    }
    this._syncOutfitToBaby();
    this._refreshPicker();
    this._advise();
    this.clock.after(1.6, () => S.mood(ctx, 'neutral'));
  }

  /* ======================================================= outfit picker == */

  /**
   * Push whatever the save says the baby is wearing back onto the rig on the
   * way in. `State` is the record of the outfit; the dressing room is the one
   * screen where a mismatch between the two would be obvious.
   */
  _syncOutfitToBaby() {
    const ctx = this.ctx;
    const outfit = ctx.state?.outfit;
    if (!outfit) return;
    // Light up the tile the baby is already wearing. State records the cloth
    // *colour*, the rail records specs, so match on that.
    if (typeof outfit.top === 'number') {
      this.worn = this.garments.find(g => g.spec.color === outfit.top) || this.worn;
    }
    if (!ctx.baby?.setOutfit) return;
    try { ctx.baby.setOutfit({ ...outfit }); } catch (e) { /* rig may differ */ }
  }

  /**
   * Mirror the five hangers into the HUD's contextual tray.
   *
   * The wardrobe rail is the real chooser and stays tappable, but it is not
   * always on camera, and a prompt that says "choose an outfit" with nothing
   * on screen to tap is worse than no prompt at all. Tiles route straight into
   * `_tapGarment()`, so a tap on a tile and a tap on a hanger are the same
   * event as far as the rest of this file is concerned.
   *
   * The tray is pulled while a garment is actually going on (head → sleeves →
   * buttons → socks → shoes): during those steps the only thing worth tapping
   * is the baby, and leaving five dead tiles up would teach the child that
   * tapping does nothing.
   */
  _refreshPicker() {
    const ui = this.ctx?.ui;
    if (!ui?.setTools) return;
    if (!this._entered || this.dressing || this.footStep > 0) {
      ui.clearTools?.();
      return;
    }
    const items = this.garments.map((entry) => {
      const busy = entry.state !== 'clean';
      return {
        id: entry.spec.id,
        label: entry.spec.label,          // screen-reader only; never rendered
        svg: garmentTile(entry.spec, busy),
        selected: this.worn === entry
      };
    });
    ui.setTools(items, (id) => this._tapGarment(id));
  }

  async exit() {
    const ctx = this.ctx;
    this._entered = false;
    ctx.ui?.clearTools?.();
    S.hideSay(ctx);
    S.lookAt(ctx, null);
    for (const l of this.labels) S.dropLabel(ctx, l);
    this.labels.length = 0;

    // Never leave the baby half-dressed when the scene changes.
    if (this.dressing) {
      this._applyOutfit(this.dressing.g);
      this._resetGarment(this.dressing.g);
      this.dressing = null;
    }
    if (this._babyHome && ctx.baby?.group) {
      ctx.baby.group.position.copy(this._babyHome.pos);
      ctx.baby.group.quaternion.copy(this._babyHome.quat);
      ctx.baby.group.rotation.z = 0;
    }
  }

  dispose() {
    const ctx = this.ctx;
    ctx.ui?.clearTools?.();
    for (const l of this.labels) S.dropLabel(ctx, l);
    this.labels.length = 0;
    this.washLoop?.stop?.();
    this.washLoop = null;
    this.clock.clear();
    this.trash.flush();
    this.garments.length = 0;
    this.dressing = null;
    this.laundry = null;
  }

  /* ============================================================= input === */

  /** 手前優先ピック: a visible mesh wins over an invisible generous proxy. */
  _pick(p) {
    const hits = this.picker.cast(p, this.targets);
    let best = null;
    for (const h of hits) {
      const node = S.owner(h.object, 'pickId');
      if (!node) continue;
      const rank = h.object.userData?.proxy ? 1 : 0;
      if (!best || rank < best.rank) best = { hit: h, node, id: node.userData.pickId, rank };
      if (best.rank === 0) break;
    }
    return best;
  }

  onPointer(p) {
    if (!this.root || !this._entered) return;
    if (p.type !== 'down') return;
    const best = this._pick(p);
    const hit = best?.hit || this.picker.first(p, this.targets);
    if (!hit) return;
    const id = best?.id || '';

    if (id.startsWith('button:')) {
      // a button tapped while the garment is still on its hanger just picks it
      if (this.dressing) { this._tapButton(id); }
      else { this._tapGarment(id.split(':')[1]); }
      return;
    }
    if (id.startsWith('foot:')) { this._tapFootwear(id); return; }
    if (id.startsWith('garment:')) { this._tapGarment(id.slice(8)); return; }
    if (id === 'washer') {
      S.burst(this.ctx, 'bubble', this.washer.getWorldPosition(this._v).setY(0.34), 4);
      S.play(this.ctx, 'bubble');
      return;
    }

    // during dressing, tapping the baby advances the current step
    if (this.dressing) {
      const d = this.dressing;
      if (d.step === 'head') { this._startHeadPass(); return; }
      // forgiving: tapping either arm works, the prompt just asks for one first
      if (d.step === 'armL') { this._doSleeve(0); return; }
      if (d.step === 'armR') { this._doSleeve(1); return; }
    }
    if (this.footStep > 0 && this.footStep < 4 && this._isBaby(hit.object)) {
      this._doFoot(this.footStep % 2);
      return;
    }
    if (this._isBaby(hit.object)) {
      S.mood(this.ctx, 'giggle');
      S.play(this.ctx, 'giggle');
      S.burst(this.ctx, 'heart', hit.point, 3);
      this.clock.after(1.0, () => S.mood(this.ctx, 'neutral'));
    }
  }

  _isBaby(object3D) {
    const babyRoot = this.ctx.baby?.group;
    if (!babyRoot) return false;
    let o = object3D;
    while (o) { if (o === babyRoot) return true; o = o.parent; }
    return false;
  }

  /* ========================================================== selection == */

  _tapGarment(gid) {
    const ctx = this.ctx;
    const entry = this.garments.find(g => g.spec.id === gid);
    if (!entry || this.dressing) return;
    if (entry.state === 'dirty') { this._refuseDirty(entry); return; }
    if (entry.state === 'washing' || entry.state === 'drying') {
      S.play(ctx, 'refuse');
      S.say(ctx, 'まだ かわいてないよ', 'drop');
      return;
    }
    this._startDressing(entry);
  }

  /* ---------------------------------------------------- くさい！→ 洗濯 --- */

  _refuseDirty(entry) {
    const ctx = this.ctx;
    if (this.laundry) { S.say(ctx, 'いま せんたくちゅう', 'bubble'); return; }
    S.play(ctx, 'stink');
    S.play(ctx, 'refuse');
    S.mood(ctx, 'sulk');
    // the nose-pinch, with a fallback for rigs that spell it differently
    S.gesture(ctx, ['pinch-nose', 'nose', 'rub-eyes', 'shiver']);
    S.babySay(ctx, 'stinky');

    entry.group.getWorldPosition(this._v);
    this.stink.position.copy(this.root.worldToLocal(this._v.clone()));
    this.stink.visible = true;
    this.stinkT = 0;
    S.burst(ctx, 'dust', this._v, 6, { color: 0x9fd77a });
    S.say(ctx, 'くさい！ せんたく しよう', 'washer');

    this.clock.after(0.9, () => this._startWash(entry));
  }

  _startWash(entry) {
    const ctx = this.ctx;
    this._setGarmentState(entry, 'washing');
    this.laundry = { g: entry, phase: 'toBasket', t: 0 };
    this.washDoorTarget = 1;
    entry.from = entry.group.position.clone();
    S.play(ctx, 'whoosh');
  }

  _laundryUpdate(dt) {
    const ctx = this.ctx;
    const job = this.laundry;
    if (!job) return;
    const entry = job.g;
    job.t += dt;

    if (job.phase === 'toBasket') {
      const k = S.clamp(job.t / 0.7, 0, 1);
      const to = this._v.copy(this.basket.position).setY(0.10);
      entry.group.position.lerpVectors(entry.from, to, S.EASE.cubicOut(k));
      entry.group.position.y += Math.sin(k * Math.PI) * 0.10;
      entry.group.rotation.z = k * 2.4;
      entry.group.scale.setScalar(1 - k * 0.25);
      if (k >= 1) {
        job.phase = 'toWasher';
        job.t = 0;
        entry.from = entry.group.position.clone();
        S.play(ctx, 'pop');
      }
    } else if (job.phase === 'toWasher') {
      const k = S.clamp(job.t / 0.8, 0, 1);
      this.washer.getWorldPosition(this._v2);
      const to = this.root.worldToLocal(this._v2.clone());
      to.y += 0.19; to.z += 0.10;
      entry.group.position.lerpVectors(entry.from, to, S.EASE.inOut(k));
      entry.group.position.y += Math.sin(k * Math.PI) * 0.14;
      entry.group.rotation.z += dt * 6;
      entry.group.scale.setScalar(0.75 - k * 0.5);
      if (k >= 1) {
        entry.group.visible = false;
        for (const m of this.load) m.visible = true;
        job.phase = 'wash';
        job.t = 0;
        this.washDoorTarget = 0;
        this.sudsMesh.visible = true;
        this.washLampMat.color.setHex(0x3ad07a);
        this.washLoop = S.loop(ctx, 'washer', { gain: 0.35 });
        S.play(ctx, 'ding');
      }
    } else if (job.phase === 'wash') {
      const k = S.clamp(job.t / 4.5, 0, 1);
      this.drum.rotation.z -= dt * (7 + Math.sin(job.t * 2.4) * 4);
      this.washer.position.y = Math.abs(Math.sin(job.t * 26)) * 0.0035;
      this.washDial.rotation.z = -job.t * 0.6;
      this._sudsUpdate(dt, Math.sin(k * Math.PI));
      if (this._rand() < dt * 3) {
        this.washer.getWorldPosition(this._v);
        S.burst(ctx, 'bubble', this._v.setY(0.36), 2);
      }
      if (k >= 1) {
        this.washLoop?.stop?.();
        this.washLoop = null;
        this.washer.position.y = 0;
        this.sudsMesh.visible = false;
        for (const m of this.load) m.visible = false;
        this.washDoorTarget = 1;
        job.phase = 'toLine';
        job.t = 0;
        S.play(ctx, 'ding');
        S.say(ctx, 'ものほしに ほそう', 'sun');
        entry.group.visible = true;
        entry.group.scale.setScalar(0.4);
        this.washer.getWorldPosition(this._v2);
        entry.from = this.root.worldToLocal(this._v2.clone().setY(0.20));
        entry.group.position.copy(entry.from);
        this._setGarmentState(entry, 'drying');
        entry.wet = 1;
      }
    } else if (job.phase === 'toLine') {
      const k = S.clamp(job.t / 0.9, 0, 1);
      const to = this._lineSpot(this._v);
      entry.group.position.lerpVectors(entry.from, to, S.EASE.inOut(k));
      entry.group.position.y += Math.sin(k * Math.PI) * 0.12;
      entry.group.scale.setScalar(0.4 + k * 0.6);
      entry.group.rotation.z *= 0.9;
      if (k >= 1) {
        job.phase = 'dry';
        job.t = 0;
        for (const p of this.pegs) p.visible = true;
        S.play(ctx, 'peg');
      }
    } else if (job.phase === 'dry') {
      const k = S.clamp(job.t / 6.0, 0, 1);
      entry.wet = 1 - k;
      entry.group.rotation.z = Math.sin(this.time * 1.4) * 0.06 * (0.4 + entry.wet);
      // wet cloth is darker, heavier and drips
      const c = entry.cloth.color;
      c.copy(entry.baseColor).lerp(new THREE.Color(0x6b7d8c), entry.wet * 0.45);
      entry.cloth.roughness = S.lerp(0.95, 0.25, entry.wet);
      entry.cloth.sheen = S.lerp(1.0, 0.2, entry.wet);
      if (entry.wet > 0.15 && this._rand() < dt * (2.5 * entry.wet)) {
        entry.group.getWorldPosition(this._v);
        this._v.y -= 0.055;
        S.play(ctx, 'drip', { gain: 0.25 });
        S.burst(ctx, 'splash', this._v, 1);
        S.ribbon(ctx, this._v.clone(), this._v.clone().setY(this._v.y - 0.25),
          { color: 0xbfe6ff, width: 0.004, seconds: 0.5 });
      }
      if (k >= 1) {
        entry.cloth.color.copy(entry.baseColor);
        entry.cloth.roughness = 0.95;
        entry.cloth.sheen = entry.spec.glossy ? 0.35 : 0.95;
        for (const p of this.pegs) p.visible = false;
        this._setGarmentState(entry, 'clean');
        this.laundry = null;
        entry.group.getWorldPosition(this._v);
        S.burst(ctx, 'sparkle', this._v, 10);
        S.play(ctx, 'chime');
        S.say(ctx, 'ふわふわに かわいたよ！', 'star');
        S.award(ctx, 1);
        S.bumpMeter(ctx, 'clean', 0.06);
        this._returnToRail(entry);
      }
    }
  }

  _lineSpot(out) {
    this.line.updateWorldMatrix(true, false);
    const p = this.lineCurve.getPointAt(0.5);
    out.copy(p).applyMatrix4(this.line.matrixWorld);
    return this.root.worldToLocal(out).add(new THREE.Vector3(0, -0.10, 0));
  }

  _returnToRail(entry) {
    const from = entry.group.position.clone();
    const to = new THREE.Vector3(entry.railX, RAIL_Y - 0.115, -0.16);
    this.clock.tween(0.8, t => {
      entry.group.position.lerpVectors(from, to, t);
      entry.group.position.y += Math.sin(t * Math.PI) * 0.10;
      entry.group.rotation.z *= 0.92;
      entry.group.scale.setScalar(1);
    }, { ease: S.EASE.inOut, onDone: () => { entry.group.rotation.z = 0; this._advise(); } });
  }

  _setGarmentState(entry, state) {
    const was = entry.state;
    entry.state = state;
    if (was !== state) this._refreshPicker();
    if (!entry.baseColor) entry.baseColor = entry.cloth.color.clone();
    if (state === 'dirty') {
      entry.cloth.color.copy(entry.baseColor).lerp(new THREE.Color(0x6a5a3a), 0.35);
      entry.cloth.roughness = 1.0;
      entry.cloth.sheen = 0.3;
      if (!entry.stainDecals) {
        entry.stainDecals = true;
        for (let i = 0; i < 4; i++) {
          S.decal(this.ctx, 'stain', entry.body,
            new THREE.Vector2(0.15 + this._rand() * 0.7, 0.2 + this._rand() * 0.5),
            { size: 0.05, color: 0x8a6a3a, opacity: 0.7 });
        }
      }
    } else if (state === 'clean') {
      entry.cloth.color.copy(entry.baseColor);
      entry.cloth.roughness = 0.95;
      entry.cloth.sheen = entry.spec.glossy ? 0.35 : 0.95;
    }
  }

  /* ========================================================== dressing === */

  _startDressing(entry) {
    const ctx = this.ctx;
    this.dressing = { g: entry, step: 'head', buttonsDone: 0 };
    this._refreshPicker();          // pulls the tray: now the baby is the target
    this._setDetail(entry, true);
    entry.group.userData.railHome = entry.group.position.clone();
    try { ctx.baby?.setOutfit?.({ top: null, bottom: null }); } catch (e) { /* ignore */ }

    // sleeves start tucked; buttons start open
    for (const s of entry.sleeves) s.scale.set(1, 0.12, 1);
    for (const b of entry.buttons) {
      b.position.copy(b.userData.open);
      b.rotation.y = b.userData.openRotY;
    }

    // float the garment above the head
    this._headWorld(this._v);
    const target = this.root.worldToLocal(this._v.clone());
    target.y += 0.20;
    const from = entry.group.position.clone();
    S.play(ctx, 'pop');
    S.mood(ctx, 'excited');
    this.clock.tween(0.6, t => {
      entry.group.position.lerpVectors(from, target, t);
      entry.group.rotation.y = S.lerp(0, 0, t);
    }, {
      ease: S.EASE.cubicOut,
      onDone: () => {
        S.say(ctx, 'あたまから すぽっ！', 'hand');
        this.clock.after(0.15, () => this._startHeadPass());
      }
    });
  }

  /**
   * The すぽっ pass. Every frame the garment's own vertices are pushed out of
   * the head sphere, so the neck opening stretches, drags over the crown and
   * snaps closed again behind it.
   */
  _startHeadPass() {
    const ctx = this.ctx;
    const d = this.dressing;
    if (!d || d.step !== 'head' || d.running) return;
    d.running = true;
    const entry = d.g;
    const from = entry.group.position.clone();
    this._chestWorld(this._v);
    const to = this.root.worldToLocal(this._v.clone());
    S.play(ctx, 'whoosh');
    this.clock.tween(1.05, t => {
      entry.group.position.lerpVectors(from, to, t);
      this._deformOverHead(entry, 1);
      // a squash on the way through sells the resistance
      const squash = Math.sin(S.clamp((t - 0.15) / 0.55, 0, 1) * Math.PI);
      entry.group.scale.set(1 + squash * 0.06, 1 - squash * 0.05, 1 + squash * 0.06);
    }, {
      ease: S.EASE.inOut,
      onDone: () => {
        entry.group.scale.setScalar(1);
        S.restore(entry.body.geometry, entry.bodyBase);
        S.play(ctx, 'pop');
        S.mood(ctx, 'giggle');
        S.play(ctx, 'giggle');
        this._chestWorld(this._v);
        S.burst(ctx, 'sparkle', this._v, 6);
        d.step = 'armL';
        d.running = false;
        this.worn = entry;
        S.say(ctx, 'ひだりうでを とおそう', 'hand');
        this.clock.after(1.0, () => S.mood(ctx, 'neutral'));
      }
    });
  }

  _deformOverHead(entry, blend) {
    this._headWorld(this._v);
    entry.group.updateWorldMatrix(true, false);
    const local = entry.group.worldToLocal(this._v.clone());
    S.wrapGeometry(entry.body.geometry, entry.bodyBase,
      [{ centre: local, radius: this._headRadius(), softness: 1.15 }], { blend });
  }

  _doSleeve(side) {
    const ctx = this.ctx;
    const d = this.dressing;
    if (!d) return;
    const want = d.step === 'armL' ? 0 : d.step === 'armR' ? 1 : -1;
    if (want < 0) return;
    const entry = d.g;
    const s = entry.sleeves.find(x => x.userData.side === want) || entry.sleeves[want];
    if (!s || s.userData.done) return;
    s.userData.done = true;
    S.play(ctx, 'whoosh');
    S.play(ctx, 'squeak');
    this.clock.tween(0.5, t => {
      s.scale.set(1, S.lerp(0.12, 1, t), 1);
      // a little shimmy as the arm finds its way through the cuff
      s.rotation.x = Math.sin(t * Math.PI * 3) * (1 - t) * 0.16;
    }, {
      ease: S.EASE.cubicOut,
      onDone: () => {
        s.rotation.x = 0;
        s.getWorldPosition(this._v);
        S.burst(ctx, 'sparkle', this._v, 4);
        if (d.step === 'armL') {
          d.step = 'armR';
          S.say(ctx, 'みぎうでも とおそう', 'hand');
        } else {
          if (entry.buttons.length) {
            d.step = 'buttons';
            S.say(ctx, 'ボタンを パチン！', 'hand');
            this._pulseButton(entry.buttons[0]);
          } else {
            this._finishDressing();
          }
        }
      }
    });
  }

  _tapButton(pickId) {
    const ctx = this.ctx;
    const d = this.dressing;
    if (!d || d.step !== 'buttons') return;
    const [, gid, idxStr] = pickId.split(':');
    if (gid !== d.g.spec.id) return;
    const idx = parseInt(idxStr, 10);
    if (idx !== d.buttonsDone) {
      // gently redirect rather than refuse
      this._pulseButton(d.g.buttons[d.buttonsDone]);
      S.play(ctx, 'boing');
      return;
    }
    const entry = d.g;
    const b = entry.buttons[idx];
    d.buttonsDone++;
    const from = b.position.clone();
    S.play(ctx, 'snap');
    S.play(ctx, 'pop');
    const fromRot = b.rotation.y;
    this.clock.tween(0.32, t => {
      b.position.lerpVectors(from, b.userData.closed, t);
      b.rotation.y = S.lerp(fromRot, b.userData.closedRotY, t);
      b.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.45);
    }, {
      ease: S.EASE.back,
      onDone: () => {
        b.scale.setScalar(1);
        b.getWorldPosition(this._v);
        S.burst(ctx, 'sparkle', this._v, 3);
        if (d.buttonsDone >= entry.buttons.length) {
          this._finishDressing();
        } else {
          this._pulseButton(entry.buttons[d.buttonsDone]);
        }
      }
    });
  }

  _pulseButton(b) {
    if (!b) return;
    this.pulseTarget = b;
    const l = S.worldLabel(this.ctx, b, 'パチン', { icon: 'hand' });
    if (l) { this.labels.push(l); this.clock.after(2.2, () => S.dropLabel(this.ctx, l)); }
  }

  _finishDressing() {
    const ctx = this.ctx;
    const d = this.dressing;
    if (!d) return;
    const entry = d.g;
    this.dressing = null;
    this.pulseTarget = null;

    this._applyOutfit(entry);
    const matched = this.recommend && this.recommend === entry.spec.id;
    S.mood(ctx, matched ? 'excited' : 'happy');
    S.gesture(ctx, ['clap']);
    S.play(ctx, 'tada');
    this._chestWorld(this._v);
    S.burst(ctx, 'sparkle', this._v, 12);
    if (matched) {
      S.burst(ctx, 'confetti', this._v, 16);
      S.say(ctx, 'きょうに ぴったり！', 'star');
      S.award(ctx, 2);
    } else {
      S.say(ctx, 'にあってる！', 'star');
      S.award(ctx, 1);
    }
    S.bumpMeter(ctx, 'happy', 0.10);

    // the garment prop hands over to the rig's own outfit and goes back home
    this.clock.tween(0.35, t => {
      entry.group.scale.setScalar(1 - t * 0.15);
      entry.cloth.opacity = 1 - t;
    }, {
      onDone: () => {
        this._resetGarment(entry);
        this.clock.after(0.4, () => this._startFootwear());
      }
    });
    entry.cloth.transparent = true;
  }

  /**
   * Hand the chosen garment over to the rig's own clothing.
   *
   * Colours, not ids: `character/outfit.js` resolves a slot to a palette name
   * or a hex number, and an unknown string ('onesie', 'shorts') silently falls
   * back to a stock colour — so the baby ended up in a stock mint top whatever
   * the child picked. Passing `spec.color` puts the garment they actually
   * chose on the body. The nappy stays on underneath; a baby out of the bath
   * and into clothes still wears one.
   */
  _applyOutfit(entry) {
    const ctx = this.ctx;
    const spec = entry.spec;
    const outfit = {
      top: spec.color,
      bottom: spec.skirt ? spec.color : spec.trim,
      diaper: true
    };
    try { ctx.baby?.setOutfit?.(outfit); }
    catch (e) { /* rig may differ; the prop still told the story */ }
    // `Baby#setOutfit` already writes through to State, but say it explicitly
    // so the save is correct even on a build where the rig refused the call.
    // (It must be an object — `patch({ outfit: 'onesie' })` used to replace the
    // whole slot map with a string and leave the baby with nothing to wear.)
    try { ctx.state?.patch?.({ outfit }); } catch (e) { /* ignore */ }
    this.worn = entry;
    this._refreshPicker();
  }

  _resetGarment(entry) {
    if (this.tier === 0) this._setDetail(entry, false);
    entry.cloth.transparent = false;
    entry.cloth.opacity = 1;
    entry.group.scale.setScalar(1);
    entry.group.rotation.set(0, 0, 0);
    entry.group.position.copy(entry.group.userData.railHome ||
      new THREE.Vector3(entry.railX, RAIL_Y - 0.115, -0.16));
    S.restore(entry.body.geometry, entry.bodyBase);
    for (const s of entry.sleeves) { s.scale.set(1, 1, 1); s.userData.done = false; }
    for (const b of entry.buttons) {
      b.position.copy(b.userData.closed);
      b.rotation.y = b.userData.closedRotY;
      b.scale.setScalar(1);
    }
  }

  /* ------------------------------------------------- socks & shoes ------- */

  _startFootwear() {
    const ctx = this.ctx;
    this.footStep = 1;
    const rain = this.worn?.spec.kind === 'rain';
    const pair = rain ? this.boots : this.shoes;
    for (const s of this.socks) s.visible = true;
    for (const s of pair) s.visible = true;
    S.say(ctx, 'くつしたを かたあしずつ', 'hand');
    S.gesture(ctx, ['point']);
    this.socks[0].getWorldPosition(this._v);
    S.lookAt(ctx, this._v);
  }

  _tapFootwear(pickId) {
    const [, kind, sideStr] = pickId.split(':');
    const side = parseInt(sideStr, 10);
    if (this.footStep === 0) { this._startFootwear(); }
    const expectSock = this.footStep <= 2;
    if ((kind === 'sock') !== expectSock) {
      S.play(this.ctx, 'boing');
      S.say(this.ctx, expectSock ? 'さきに くつしたね' : 'つぎは くつ！', 'hand');
      return;
    }
    this._doFoot(side);
  }

  _doFoot(side) {
    const ctx = this.ctx;
    if (this.footStep < 1 || this.footStep > 4) return;
    const isSock = this.footStep <= 2;
    const rain = this.worn?.spec.kind === 'rain';
    const set = isSock ? this.socks : (rain ? this.boots : this.shoes);
    const item = set[side] || set[0];
    if (item.userData.on) return;
    item.userData.on = true;

    // けんけんバランス — the standing wobble while one foot is in the air
    this.hop.t = 1.0;
    this.hop.side = side;
    S.play(ctx, 'kenken');
    S.play(ctx, isSock ? 'sock' : 'pop');

    const from = item.position.clone();
    this._footWorld(side, this._v);
    const to = this.root.worldToLocal(this._v.clone());
    this.clock.tween(0.55, t => {
      item.position.lerpVectors(from, to, t);
      item.position.y += Math.sin(t * Math.PI) * 0.12;
      item.rotation.y = S.lerp(item.rotation.y, 0, t * 0.4);
    }, {
      ease: S.EASE.cubicOut,
      onDone: () => {
        item.getWorldPosition(this._v);
        S.burst(ctx, 'sparkle', this._v, 5);
        this.footStep++;
        if (this.footStep === 3) {
          S.play(ctx, 'chime');
          S.say(ctx, 'つぎは くつを はこう', 'hand');
        } else if (this.footStep > 4) {
          this._finishFootwear();
        } else {
          S.say(ctx, 'はんたいの あんよも', 'hand');
        }
      }
    });
  }

  _finishFootwear() {
    const ctx = this.ctx;
    const rain = this.worn?.spec.kind === 'rain';
    // 'boots' is not a colour the outfit palette knows; yellow wellies to match
    // the raincoat, red shoes otherwise.
    const shoes = rain ? 0xffd23f : 'red';
    try { ctx.baby?.setOutfit?.({ socks: 'cream', shoes }); } catch (e) { /* ignore */ }
    for (const s of [...this.socks, ...this.shoes, ...this.boots]) {
      s.visible = false;
      s.userData.on = false;
    }
    S.play(ctx, 'tada');
    S.mood(ctx, 'happy');
    S.gesture(ctx, ['clap']);
    this._chestWorld(this._v);
    S.burst(ctx, 'confetti', this._v, 14);
    S.say(ctx, 'じょうずに はけました！', 'star');
    S.award(ctx, 1);
    S.bumpMeter(ctx, 'happy', 0.06);
    this.footStep = 0;
    this.clock.after(1.8, () => { S.mood(ctx, 'neutral'); this._advise(); });
  }

  /* ------------------------------------------------------- rig helpers --- */

  _headWorld(out) {
    this.root.updateWorldMatrix(true, false);
    this._v3.set(0, 0.051 + 0.545, 0.40).applyMatrix4(this.root.matrixWorld);
    return S.bonePos(this.ctx, 'head', this._v3, out);
  }

  _chestWorld(out) {
    this.root.updateWorldMatrix(true, false);
    this._v3.set(0, 0.051 + 0.395, 0.40).applyMatrix4(this.root.matrixWorld);
    return S.chestPos(this.ctx, this._v3, out);
  }

  _footWorld(side, out) {
    this.root.updateWorldMatrix(true, false);
    const sx = side === 0 ? -0.032 : 0.032;
    this._v3.set(sx, 0.051 + 0.030, 0.40).applyMatrix4(this.root.matrixWorld);
    return S.bonePos(this.ctx, side === 0 ? 'leftFoot' : 'rightFoot', this._v3, out);
  }

  _headRadius() {
    const ctx = this.ctx;
    try {
      const h = ctx.baby?.bone?.('head');
      if (h?.geometry?.boundingSphere) return h.geometry.boundingSphere.radius;
    } catch (e) { /* fall through */ }
    return HEAD_R;
  }

  /* ---------------------------------------------------------- guidance --- */

  _advise() {
    const ctx = this.ctx;
    if (!this._entered) return;
    // Guidance and the tray always move together: whenever the prompt changes,
    // what is tappable has changed too.
    this._refreshPicker();
    if (this.dressing) return;
    if (this.laundry) { S.say(ctx, 'せんたくを みてみよう', 'washer'); return; }
    if (this.footStep > 0) { S.say(ctx, 'あんよを タップしてね', 'hand'); return; }
    if (this.recommend) {
      S.say(ctx, ctx.state?.weather === 'rain'
        ? 'あめだから…なにを きる？' : 'ねむそう…なにを きる？', 'heart');
    } else {
      S.say(ctx, 'すきな おようふくを えらんでね', 'heart');
    }
  }

  /* ============================================================= frame === */

  update(dt) {
    if (!this.root) return;
    this.time += dt;
    this.clock.update(dt);

    // wardrobe doors
    const dOpen = this.doorTarget;
    for (const d of this.doors) {
      d.open += (dOpen - d.open) * Math.min(1, dt * 3.2);
      d.group.rotation.y = d.sx * d.open * 2.05;
    }

    // hangers turn so the clothes can be seen in the round
    for (const g of this.garments) {
      if (this.dressing?.g === g || this.laundry?.g === g) continue;
      const chosen = this.recommend === g.spec.id;
      g.spin += dt * (chosen ? 0.9 : 0.45);
      g.group.rotation.y = Math.sin(g.spin) * (chosen ? 0.9 : 0.55);
      g.hanger.rotation.y = g.group.rotation.y;
      const bob = chosen ? Math.sin(this.time * 3 + g.spin) * 0.006 : 0;
      g.group.position.y = RAIL_Y - 0.115 + bob;
      g.hanger.position.y = RAIL_Y + bob;
    }

    // (the head pass re-solves the cloth inside its own tween, every frame)

    // washing machine
    this._laundryUpdate(dt);
    this.washDoorOpen += (this.washDoorTarget - this.washDoorOpen) * Math.min(1, dt * 4);
    this.washDoor.rotation.y = this.washDoorOpen * 2.1;
    if (this.laundry?.phase === 'wash') {
      for (let i = 0; i < this.load.length; i++) {
        const m = this.load[i];
        const a = this.drum.rotation.z * (0.9 + i * 0.07) + i * 2.1;
        const r = 0.055 + Math.sin(this.time * 3 + i) * 0.012;
        m.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.03 + i * 0.025);
        m.rotation.set(a * 0.7, a * 0.4, a);
      }
    }

    // cloth
    for (const g of this.garments) {
      if (g.skirtSim) g.skirtSim.update(dt);
      if (g.hoodSim) g.hoodSim.update(dt);
    }

    // stink waves
    if (this.stink.visible) {
      this.stinkT += dt;
      for (let i = 0; i < this.stinkWaves.length; i++) {
        const w = this.stinkWaves[i];
        w.position.y = ((this.stinkT * 0.35 + i * 0.2) % 1) * 0.16;
        w.rotation.y = Math.sin(this.time * 3 + i) * 0.5;
      }
      this.mat.stink.opacity = 0.5 * Math.max(0, 1 - this.stinkT / 2.2);
      if (this.stinkT > 2.2) this.stink.visible = false;
    }

    // けんけん wobble on the baby while a foot is off the floor
    if (this.hop.t > 0) {
      this.hop.t -= dt;
      const b = this.ctx.baby?.group;
      if (b) {
        const k = S.clamp(this.hop.t, 0, 1);
        b.rotation.z = Math.sin(this.time * 15) * 0.05 * k;
        if (this.hop.t <= 0) b.rotation.z = 0;
      }
    }

    // the button we are waiting for gets a little heartbeat
    if (this.pulseTarget) {
      const p = 1 + Math.sin(this.time * 7) * 0.14;
      this.pulseTarget.scale.setScalar(p);
    }
  }

  /* ======================================================== harness API == */

  /**
   * Harness patches: { step } plus the optional extras this scene understands.
   *   step    — 'wardrobe' | 'head' | 'armL' | 'armR' | 'buttons' | 'socks'
   *             | 'shoes' | 'wash' | 'dry' | 'done'
   *   outfit  — garment id to stage with ('onesie'|'dress'|'raincoat'|
   *             'pyjamas'|'tshirt')
   *   dirty   — mark the staged garment dirty
   *   weather — 'rain' switches the recommendation to the raincoat
   */
  onState(patch) {
    if (!patch || !this.root) return;
    if (patch.weather) {
      this.recommend = patch.weather === 'rain' ? 'raincoat' : this.recommend;
    }
    const entry = patch.outfit
      ? this.garments.find(g => g.spec.id === patch.outfit)
      : (this.worn || this.garments[0]);
    if (patch.dirty !== undefined && entry) {
      this._setGarmentState(entry, patch.dirty ? 'dirty' : 'clean');
    }
    if (patch.step) this._stageStep(patch.step, entry);
  }

  _stageStep(step, entry) {
    const ctx = this.ctx;
    this.clock.clear();
    this.doorTarget = 1;
    for (const d of this.doors) { d.open = 1; d.group.rotation.y = d.sx * 2.05; }
    if (this.dressing) { this._resetGarment(this.dressing.g); this.dressing = null; }
    for (const g of this.garments) if (g.state !== 'dirty') this._resetGarment(g);
    for (const s of [...this.socks, ...this.shoes, ...this.boots]) {
      s.visible = false; s.userData.on = false;
    }
    this.footStep = 0;
    this.laundry = null;
    this.hop.t = 0;
    if (ctx.baby?.group) ctx.baby.group.rotation.z = 0;

    const g = entry || this.garments[0];

    if (step === 'wardrobe' || step === 'pick') { this._advise(); return; }

    if (step === 'head') {
      this.dressing = { g, step: 'head', buttonsDone: 0, running: false };
      this._setDetail(g, true);
      for (const s of g.sleeves) s.scale.set(1, 0.12, 1);
      for (const b of g.buttons) { b.position.copy(b.userData.open); b.rotation.y = b.userData.openRotY; }
      g.group.userData.railHome = new THREE.Vector3(g.railX, RAIL_Y - 0.115, -0.16);
      // Park it where the stretch reads best: the neck opening (local +0.074)
      // sitting on the crown, so the band is taut around the head and the body
      // hangs below it — not the whole garment inflated like a balloon.
      this._headWorld(this._v);
      const head = this.root.worldToLocal(this._v.clone());
      g.group.position.set(head.x, head.y - 0.058, head.z);
      g.group.scale.set(1.04, 0.97, 1.04);
      this._deformOverHead(g, 1);
      S.mood(ctx, 'surprised');
      try { ctx.baby?.setOutfit?.({ top: null }); } catch (e) { /* ignore */ }
      S.say(ctx, 'あたまから すぽっ！', 'hand');
      return;
    }

    // everything past the head pass wants the garment settled on the chest
    this._chestWorld(this._v);
    const chest = this.root.worldToLocal(this._v.clone());
    g.group.position.copy(chest);
    g.group.scale.setScalar(1);
    S.restore(g.body.geometry, g.bodyBase);

    if (step === 'armL' || step === 'armR') {
      this.dressing = { g, step, buttonsDone: 0, running: false };
      this._setDetail(g, true);
      g.sleeves[0].scale.set(1, step === 'armR' ? 1 : 0.12, 1);
      g.sleeves[1].scale.set(1, 0.12, 1);
      for (const b of g.buttons) { b.position.copy(b.userData.open); b.rotation.y = b.userData.openRotY; }
      S.say(ctx, step === 'armL' ? 'ひだりうでを とおそう' : 'みぎうでも とおそう', 'hand');
    } else if (step === 'buttons') {
      this.dressing = { g, step: 'buttons', buttonsDone: 1, running: false };
      this._setDetail(g, true);
      for (const s of g.sleeves) s.scale.set(1, 1, 1);
      if (g.buttons.length) {
        g.buttons[0].position.copy(g.buttons[0].userData.closed);
        g.buttons[0].rotation.y = g.buttons[0].userData.closedRotY;
        for (let i = 1; i < g.buttons.length; i++) {
          g.buttons[i].position.copy(g.buttons[i].userData.open);
          g.buttons[i].rotation.y = g.buttons[i].userData.openRotY;
        }
        this._pulseButton(g.buttons[1] || g.buttons[0]);
      }
      S.say(ctx, 'ボタンを パチン！', 'hand');
    } else if (step === 'socks' || step === 'shoes') {
      this._applyOutfit(g);
      this._resetGarment(g);
      this.worn = g;
      this.footStep = step === 'socks' ? 1 : 3;
      const rain = g.spec.kind === 'rain';
      const pair = rain ? this.boots : this.shoes;
      for (const s of this.socks) s.visible = true;
      for (const s of pair) s.visible = true;
      if (step === 'shoes') {
        for (let i = 0; i < 2; i++) {
          this.socks[i].userData.on = true;
          this._footWorld(i, this._v);
          this.socks[i].position.copy(this.root.worldToLocal(this._v.clone()));
        }
        try { ctx.baby?.setOutfit?.({ socks: 'cream' }); } catch (e) { /* ignore */ }
      }
      S.say(ctx, step === 'socks' ? 'くつしたを かたあしずつ' : 'つぎは くつを はこう', 'hand');
      this.hop.t = 1.0;
    } else if (step === 'wash' || step === 'dry') {
      this._setGarmentState(g, step === 'wash' ? 'washing' : 'drying');
      g.from = g.group.position.clone();
      // start each staged phase early enough that a few seconds of harness
      // warm-up still lands inside it
      this.laundry = { g, phase: step === 'wash' ? 'wash' : 'dry', t: step === 'wash' ? 0.6 : 1.6 };
      if (step === 'wash') {
        g.group.visible = false;
        for (const m of this.load) m.visible = true;
        this.sudsMesh.visible = true;
        this.washDoorTarget = 0;
        this.washDoorOpen = 0;
        this._sudsUpdate(0.016, 1);
      } else {
        g.wet = 0.65;
        g.group.visible = true;
        g.group.scale.setScalar(1);
        g.group.position.copy(this._lineSpot(this._v));
        for (const p of this.pegs) p.visible = true;
        this.washDoorTarget = 1;
      }
    } else if (step === 'done') {
      this._applyOutfit(g);
      this._resetGarment(g);
      try { ctx.baby?.setOutfit?.({ socks: 'cream', shoes: g.spec.kind === 'rain' ? 0xffd23f : 'red' }); }
      catch (e) { /* ignore */ }
      S.mood(ctx, 'happy');
      this._advise();
    }
    this._refreshPicker();
  }

  _sudsUpdate(dt, amount) {
    const m = this._mtx ||= new THREE.Matrix4();
    for (let i = 0; i < this.sudsState.length; i++) {
      const s = this.sudsState[i];
      const wob = Math.sin(this.time * 2.4 + s.phase);
      const scale = s.s * amount * (0.8 + wob * 0.2);
      m.makeScale(scale, scale, scale);
      m.setPosition(
        s.x + wob * 0.008,
        s.y + Math.cos(this.time * 1.8 + s.phase) * 0.008,
        s.z);
      this.sudsMesh.setMatrixAt(i, m);
    }
    this.sudsMesh.instanceMatrix.needsUpdate = true;
  }
}
