/* ============================================================================
 * outfit.js — clothing that deforms with the rig
 * ----------------------------------------------------------------------------
 * Every garment is built from the *same* implicit body field as the skin, just
 * evaluated at an offset iso-level. That guarantees two things you otherwise
 * fight forever: the cloth can never poke through the body, and it follows the
 * body's real shape (belly, thigh rolls) instead of being a tube around it.
 *
 * A garment's region is a soft mask; the offset tapers to zero at the mask's
 * edge, so hems sink into the skin and read as tucked-in rather than as an
 * open shell floating in space. Triangles fully outside the mask are dropped.
 *
 * Garments are SkinnedMeshes bound to the *same* skeleton as the body, so they
 * deform with it for free.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import { buildPatch, smoothstep as sstep, mirror as mir } from './anatomy.js';

/**
 * A soft slab between `a` and `b`. The ramp width matters: it is the distance
 * over which the hem taper has to drop the shell from `inflate` to just under
 * the skin, and the shells are lofted on a ~10–12 mm grid. Anything much under
 * 20 mm and the drop lands inside a single quad, i.e. a vertical wall.
 */
const band = (a, b, x, ramp = 0.020) =>
  sstep(a, a + ramp, x) * (1 - sstep(b - ramp, b, x));

/**
 * Union of two mask lobes. `Math.max` is a *crease*: the gradient jumps where
 * the two lobes cross, the hem taper inherits the kink, and the kink lands on
 * the mesh as a notch in an otherwise smooth hem. This one is smooth
 * everywhere and never exceeds 1.
 */
const uni = (a, b) => 1 - (1 - a) * (1 - b);

/** Distance to a mirrored segment, used by the sleeve/leg masks. */
function segDist(p, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  let t = ((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / (l2 || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + bx * t), p[1] - (a[1] + by * t), p[2] - (a[2] + bz * t));
}

/* ------------------------------------------------------------ garments ---- */

/* ── The layer stack ────────────────────────────────────────────────────────
 *
 * Garment shells cannot see each other. Each is lofted from the *skin* field
 * and displaced outward by its own `inflate`, so the only thing keeping the
 * nappy inside the shorts and the shirt outside both is this table. It has to
 * be authored, and it has to leave real clearance, because a shell is not flat
 * at its authored level: `buildPatch`'s dominance sink can drop a vertex up to
 * `floorLevel` (3.2 mm) below it, so two layers only 3.6 mm apart interleave
 * over every fillet and armpit and shred into overlapping scraps. That is what
 * `50`/`51`/`52` were showing — the pyjama top (14.8), the pyjama bottoms
 * (7.2) and the nappy (11.2) all live in the hip band, 3.6 mm apart, three
 * shells fighting for the same surface.
 *
 *   skin      0.0
 *   socks     4.5   feet + ankle
 *   hat       6.2   head only, no neighbour
 *   nappy     7.6   torso + crotch  ┐ mutually exclusive: `set()` culls the
 *   bottom    7.6   hips + thighs   ┘ nappy whenever bottoms are worn
 *   shoes    12.2   over the socks              (+7.7)
 *   top      14.8   over nappy / bottoms        (+7.2)
 *   bib      21.5   outermost; nothing over it  (+6.7)
 *
 * Every pair that can be worn together on the same patch is ≥ 6.7 mm apart —
 * twice the deepest sink — so no two shells can ever swap places.
 *
 * ── Hem quality ────────────────────────────────────────────────────────────
 *
 * A hem is where the shell tapers from `inflate` down through the skin, and
 * the triangles that straddle the surface are cut by it into the scalloped
 * fringe this file keeps growing comments about. The fringe cannot be removed,
 * only made small: a scallop is exactly one quad wide. The `top` reads clean
 * at 400 % because it is lofted at 8–11 mm quads; every other slot was at
 * 0.62–0.72 LOD, i.e. 16–28 mm quads, and showed the same construction as a
 * ragged tear. So every slot is now lofted to the same ~8–11 mm grid the shirt
 * uses, and every mask ramp is at least twice a quad wide.
 * ------------------------------------------------------------------------ */

/**
 * name → { groups, inflate, mask(x,y,z), material(), lod }
 * `mask` returns 1 where the garment is solid and fades to 0 at the hem.
 */
export const GARMENTS = {
  top: {
    groups: ['torso', 'armL', 'armR'],
    inflate: 0.0148,
    // the shirt is the garment that gets closest to the camera and the one
    // whose hems cross the most curvature, and a hem's silhouette is only ever
    // as smooth as the quad it crosses
    lod: 1.26,
    mask: (x, y, z) => {
      // the collar sits low and wide, well clear of the head shell's own rim —
      // an overlapping neckline leaves the two surfaces fighting and shows as
      // a ring of hard flaps under the chin
      // …and it is a *torso* band, so it has to stop before the elbow. The
      // sleeve patches are lofted round the arms and see this mask too: without
      // the lateral limit the y-band alone declares the whole arm clothed down
      // to the wrist, and the "sleeve" then ends wherever the arm patch runs
      // out rather than where the garment does — an open, untapered rim of
      // end-cap triangles folding over the hand.
      const bodyM = band(0.2430, 0.4390, y) * (1 - sstep(0.0980, 0.1240, Math.abs(x)));
      // short sleeves: a capsule around the top of each upper arm
      let sl = 0;
      for (const s of [1, -1]) {
        const d = segDist([x, y, z], mir([0.0700, 0.4060, 0.0040], s), mir([0.1120, 0.3600, 0.0180], s));
        // …bounded above, so the capsule's own end cap cannot loft a sliver of
        // sleeve up beside the collar, where the body band has already stopped
        sl = Math.max(sl, (1 - sstep(0.030, 0.054, d)) * (1 - sstep(0.4180, 0.4440, y)));
      }
      // neck hole
      const neck = 1 - Math.exp(-(((x) ** 2 + ((y - 0.4300) / 0.70) ** 2 + ((z - 0.004) / 1.0) ** 2) / (0.0398 ** 2)));
      return Math.max(bodyM, sl) * Math.max(0, neck);
    },
    // A knit at 120 threads × 8 repeats is a 1 mm rib: below a pixel at any
    // sane framing, so it aliases into a shimmering moiré instead of reading
    // as fabric. ~5 mm ribs read as knit and hold still.
    material: (c) => MAT.makeCloth({
      color: c, weave: 'knit', threads: 64, repeat: 3, sheen: 0.95,
      seed: 21, normalScale: 0.5
    })
  },
  bottom: {
    groups: ['torso', 'legL', 'legR'],
    /* Level 7.6 mm — the same level as the nappy, which `set()` culls whenever
     * bottoms are worn. They cover the same body, so putting one *inside* the
     * other (7.2 under 11.2, as it was) is both wrong — a nappy goes under the
     * shorts, not over them — and unbuildable: 4 mm of clearance is less than
     * the sink depth, so the two shells took turns being outside.             */
    inflate: 0.0076,
    lod: 1.26,
    mask: (x, y, z) => {
      const hip = band(0.2020, 0.3140, y, 0.024);
      // the seat: shorts have to close under the body, or the child is bare
      // from any angle that sees between the legs
      const seat = 1 - sstep(0.058, 0.092, Math.hypot(x * 0.74, (y - 0.2320) * 1.00, (z + 0.004) * 0.70));
      let leg = 0;
      for (const s of [1, -1]) {
        const d = segDist([x, y, z], mir([0.0420, 0.2640, 0.0040], s), mir([0.0470, 0.2060, 0.0020], s));
        // …and a *lower* bound, or the leg capsule's own end cap carries the
        // shorts down the shin to the ankle and straight through the socks
        leg = Math.max(leg, (1 - sstep(0.042, 0.068, d)) * sstep(0.1600, 0.1900, y));
      }
      return uni(uni(hip, seat), leg);
    },
    material: (c) => MAT.makeCloth({
      color: c, weave: 'plain', threads: 70, repeat: 3.5, seed: 33, normalScale: 0.5
    })
  },
  diaper: {
    groups: ['torso', 'legL', 'legR'],
    /* Level 7.6 mm, under the shirt (14.8) with 7.2 mm of clearance.
     *
     * The mask is the modesty guarantee for the whole product. It used to be a
     * waistband plus a small lozenge centred at y = 0.256 that stopped at
     * y ≈ 0.24 — and the shirt's own hem starts at y = 0.243, so between them
     * they left a 60 mm bare band right across the crotch, front and back.
     * That is what `30-dress-outfit` was rendering. The pad now runs down past
     * the leg join (y ≈ 0.168) and closes round the top of each thigh, so the
     * child is covered from every angle with or without a shirt.              */
    inflate: 0.0076,
    lod: 1.34,
    mask: (x, y, z) => {
      // waistband, all the way round, sitting just under the navel
      const waist = band(0.2160, 0.3120, y, 0.024);
      // the pad: a fat lozenge front-to-back through the crotch
      const pad = 1 - sstep(0.055, 0.091, Math.hypot(x * 0.78, (y - 0.2280) * 0.95, (z + 0.006) * 0.72));
      // and a cuff round the top of each thigh, so the pad closes on the leg
      // rather than ending in mid-air over it
      let cuff = 0;
      for (const s of [1, -1]) {
        const d = segDist([x, y, z], mir([0.0380, 0.2560, 0.0040], s), mir([0.0430, 0.2140, 0.0020], s));
        // No upper bound: the waistband already covers everything above the
        // hip, and a mask edge *inside* a covered region is not free — it makes
        // the leg shell taper away right where the torso shell has retracted
        // out of the hip socket, and the two of them together leave a hole in
        // the side of the nappy with bare skin showing through it.
        cuff = Math.max(cuff, (1 - sstep(0.046, 0.074, d)) * sstep(0.1740, 0.2020, y));
      }
      return uni(uni(waist, pad), cuff);
    },
    // a nappy is non-woven and smooth; a plain weave is both truer and an
    // order of magnitude cheaper to synthesise than a terry pile
    material: () => MAT.makeCloth({
      color: 0xfffdf8, weave: 'plain', threads: 80, repeat: 3,
      sheen: 0.85, roughness: 0.97, seed: 45, normalScale: 0.4
    })
  },
  socks: {
    groups: ['footL', 'footR', 'legL', 'legR'],
    inflate: 0.0045,
    lod: 1.15,
    mask: (x, y, z) => 1 - sstep(0.078, 0.116, y),
    material: (c) => MAT.makeCloth({
      color: c, weave: 'knit', threads: 48, repeat: 4, seed: 57, normalScale: 0.5
    })
  },
  shoes: {
    groups: ['footL', 'footR'],
    // 7.7 mm outside the socks: a shoe is the outer layer on the foot and the
    // sock cuff has to read *inside* it, not through it
    inflate: 0.0122,
    lod: 0.95,
    mask: (x, y, z) => 1 - sstep(0.046, 0.074, y),
    material: (c) => MAT.makePlastic({ color: c, matte: 0.55, clearcoat: 0.7, seed: 63 })
  },
  hat: {
    groups: ['head'],
    inflate: 0.0062,
    lod: 1.1,
    mask: (x, y, z) => sstep(0.5480, 0.5780, y + z * 0.16),
    material: (c) => MAT.makeCloth({ color: c, weave: 'knit', threads: 80, repeat: 9, seed: 71 })
  },
  bib: {
    groups: ['torso'],
    /* ── Why the bib rendered nothing ─────────────────────────────────────
     * It was `inflate: 0.0068`. Every garment here is displaced outward from
     * the *skin*, not from whatever is already worn — so a 6.8 mm bib sat
     * 8 mm underneath the 14.8 mm `top`, fully enclosed by it, in the one
     * scene (`feed`) where a bib is always worn over a shirt. Measured at
     * runtime the mesh was built (371 triangles), visible, parented, and
     * every vertex was outside the skin (mean +3.0 mm) — and every one of
     * them was inside the shirt (mean +8.9 mm).
     *
     * The stack has to be authored explicitly, because the shells cannot see
     * each other — see the table at the head of this section. A bib is the
     * outermost layer on the torso; nothing goes over it.                   */
    inflate: 0.0215,
    lod: 1.2,
    mask: (x, y, z) => {
      if (z < 0.006) return 0;
      // a bib silhouette: a broad rounded shield, wider at the top than the
      // bottom, with a scooped neck opening
      const w = 0.070 - 0.016 * sstep(0.360, 0.410, 0.770 - y);
      const r = Math.hypot(x / w, (y - 0.3820) / 0.062);
      const neck = sstep(0.026, 0.058, Math.hypot(x / 0.9, (y - 0.4330) / 0.72));
      // The bib stands 26 mm proud of the skin once the hem bury is counted,
      // and this ramp is the whole distance it has to fall. At 0.82→1.02 of a
      // ~62 mm radius that was 12 mm — a 65° wall on an 11 mm grid, i.e. a
      // ring of edge-on scraps all the way round the shield.
      return (1 - sstep(0.74, 1.06, r)) * neck;
    },
    material: (c) => MAT.makeTerry({ color: c, repeat: 8, seed: 71 })
  }
};

const PALETTE = {
  cream: 0xfff4e4, mint: 0xbdf0dc, sky: 0xa8d8ff, peach: 0xffcbb0,
  lemon: 0xffe89a, rose: 0xffb6cc, lilac: 0xd6c2ff, white: 0xfffdf8,
  denim: 0x6f8fc4, red: 0xf06060, grey: 0xd8d2cc
};

function resolveColor(v, fallback) {
  if (v === true || v == null) return fallback;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return PALETTE[v] ?? fallback;
  if (typeof v === 'object' && v.color != null) return resolveColor(v.color, fallback);
  return fallback;
}

/* -------------------------------------------------------------- Outfit ---- */

export class Outfit {
  constructor({ field, rig, tier = 2, uvRepeat = 7 } = {}) {
    this.field = field;
    this.rig = rig;
    this.tier = tier;
    this.uvRepeat = uvRepeat;
    this.items = {};                    // name → { mesh, color }
    this.group = new THREE.Group();
    this.group.name = 'outfit';
    this.state = {};
    this.triangles = 0;
  }

  /** Build (or fetch) one garment mesh. */
  _make(name, color) {
    const key = name + ':' + color;
    if (this.items[key]) return this.items[key];
    const def = GARMENTS[name];
    if (!def) return null;

    const q = def.lod * (this.tier >= 2 ? 1 : this.tier === 1 ? 0.8 : 0.62);
    const patches = [];
    for (const g of def.groups) {
      const spec = SHELL_PATCHES[g];
      if (!spec) continue;
      patches.push(buildPatch(this.field, {
        group: g,
        axis: spec.axis, star: spec.star, center: spec.center,
        segs: Math.max(8, Math.round(spec.segs * q)),
        rings: Math.max(5, Math.round(spec.rings * q)),
        capStart: spec.capStart, capEnd: spec.capEnd,
        tMax: spec.tMax, uvRepeat: this.uvRepeat,
        /* The garment is built *on the skin*, at iso-0, with exactly the same
         * margins and sinks the body itself uses — and is then pushed out along
         * the surface normal by `detail`. It is not marched to an offset
         * iso-level, and the difference is the whole bug.
         *
         * Marching to iso-`inflate` looks equivalent and is not. The patch
         * machinery resolves overlaps by *retracting* a shell into its own
         * volume and sinking it under whichever neighbour won — which works
         * because the neighbouring patch is right there covering it. Both of
         * those are distances measured from the skin, so at iso-`inflate` they
         * are all mis-scaled: the sink's "don't go deeper than the flesh you
         * stand on" guard reads a depth of zero (the shell is *outside* the
         * body) and collapses to 0.8 mm, so losing shells stay on the surface
         * and interleave; the retraction, meanwhile, leaves neighbouring
         * vertices 100 mm apart. Add a hem taper worth 30 mm of normal
         * displacement on an 11 mm grid and every boundary becomes a ring of
         * edge-on triangles diving through the body — the shard fringe.
         *
         * Offsetting the finished skin shell instead keeps every one of those
         * relationships intact: both shells are displaced along the *same*
         * field gradient by the same amount, so a loser sunk 3 mm under the
         * winner is still 3 mm under it afterwards, and a hem that tapers to
         * zero offset is still exactly on the skin.                          */
        inflate: 0,
        margin: 0.035, sinkDepth: 0.005,
        detail: (x, y, z) => {
          const mk = def.mask(x, y, z);
          // …and the last millimetres go *under* the skin, so the ragged
          // triangle boundary the mask trim leaves is buried rather than
          // showing as a fringe of hard flat scraps around every hem.
          return def.inflate * mk - 0.0045 * (1 - mk);
        },
        // Retraction can still park a vertex tens of millimetres inside the
        // body, and once the shell above it is `inflate` proud the triangle
        // reaching down to it is long enough to surface on the way. The floor
        // says: hide under the skin by all means, never dive through the body.
        floorLevel: -0.0032,
        collapse: spec.collapse
      }));
    }
    if (!patches.length) return null;

    // merge + trim to the mask
    let nv = 0;
    for (const p of patches) nv += p.pos.length / 3;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const nG = this.field.groups.length;
    const parts = new Float32Array(nv * nG);
    const idx = [];
    let vo = 0;
    for (const p of patches) {
      pos.set(p.pos, vo * 3); nor.set(p.nor, vo * 3); uv.set(p.uv, vo * 2);
      if (p.parts) parts.set(p.parts, vo * nG);
      const n = p.pos.length / 3;

      /* Trimming.
       *
       * The one rule that matters: *never cut an edge that is still above the
       * skin.* Every triangle buildPatch produced is a legal piece of shell;
       * the ones we do not want have already been driven under the skin by the
       * mask taper and by buildPatch's dominance sink, and are therefore
       * invisible. Deleting those is free. Deleting anything else leaves a raw
       * open boundary at whatever height it happened to be — which is exactly
       * the picket fence of hard flaps this whole file keeps growing comments
       * about.
       *
       * So: drop what the mask has finished tapering, drop what is wholly
       * buried, and keep everything else.                                     */
      const mk = new Float32Array(n);
      const ev = new Float32Array(n);
      for (let v = 0; v < n; v++) {
        const x = p.pos[v * 3], y = p.pos[v * 3 + 1], z = p.pos[v * 3 + 2];
        mk[v] = def.mask(x, y, z);
        ev[v] = this.field.eval(x, y, z);
      }
      const edge = (u, v) => Math.hypot(
        p.pos[u * 3] - p.pos[v * 3], p.pos[u * 3 + 1] - p.pos[v * 3 + 1], p.pos[u * 3 + 2] - p.pos[v * 3 + 2]);
      const cand = [], lens = [];
      for (let i = 0; i < p.idx.length; i += 3) {
        const a = p.idx[i], b = p.idx[i + 1], c = p.idx[i + 2];
        if ((mk[a] + mk[b] + mk[c]) / 3 <= 0.02) continue;
        // wholly under the skin: it can only ever z-fight with the body
        if (ev[a] < -0.0004 && ev[b] < -0.0004 && ev[c] < -0.0004) continue;
        cand.push(a, b, c);
        lens.push(Math.max(edge(a, b), edge(b, c), edge(c, a)));
      }
      /* The last safety net, and the one that has to be aimed carefully.
       *
       * The thing it exists to catch is a triangle that *chords across a
       * concavity* — the crotch, the armpit, the neck — and surfaces through
       * the far side. Cutting on edge length alone (> 2.3 × the median) looks
       * like a proxy for that and is not: a loft's end cap legitimately
       * carries triangles two or three times the body quads, and on the nappy
       * that rule was silently deleting the entire seat. Measured, it removed
       * 370 of 2296 covered surface samples — a hole across the buttocks and
       * the crotch, i.e. the modesty guarantee, cut by a heuristic.
       *
       * What actually distinguishes a chord is that it *bulges away from the
       * surface*: sample the field at the centroid and it sits far outside the
       * plane its own vertices are standing on. A big cap quad does not — its
       * centroid is at most a sagitta out. So test that directly, and keep a
       * loose absolute ceiling for anything genuinely enormous.               */
      const sorted = Float64Array.from(lens).sort();
      const med = sorted.length ? sorted[sorted.length >> 1] : 0.012;
      const limit = Math.max(med * 4.0, 0.055);
      for (let i = 0; i < lens.length; i++) {
        if (lens[i] > limit) continue;
        const a = cand[i * 3], b = cand[i * 3 + 1], c = cand[i * 3 + 2];
        if (lens[i] > med * 1.8) {
          // Two ways an oversized triangle is illegitimate, and only two.
          // Either its corners stand at very different heights above the skin —
          // it is a *hem* triangle stretched across the taper, and it rasterises
          // as a flap standing off the collar or the sleeve — or its centroid
          // bulges away from the surface, which means it chords a concavity.
          // An oversized triangle that is neither is an end-cap quad doing its
          // job (the nappy's seat is made of them) and must be kept.
          if (Math.max(ev[a], ev[b], ev[c]) - Math.min(ev[a], ev[b], ev[c]) > 0.005) continue;
          const cx = (p.pos[a * 3] + p.pos[b * 3] + p.pos[c * 3]) / 3;
          const cy = (p.pos[a * 3 + 1] + p.pos[b * 3 + 1] + p.pos[c * 3 + 1]) / 3;
          const cz = (p.pos[a * 3 + 2] + p.pos[b * 3 + 2] + p.pos[c * 3 + 2]) / 3;
          if (this.field.eval(cx, cy, cz) - (ev[a] + ev[b] + ev[c]) / 3 > 0.006) continue;
        }
        idx.push(a + vo, b + vo, c + vo);
      }
      vo += n;
    }
    if (!idx.length) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    // Clothing needs the same part masks the skin uses, or the arm bones will
    // grab the shirt's ribcage exactly the way they used to grab the skin.
    geo.userData.parts = parts;
    geo.userData.partNames = this.field.groups;
    // drop the vertices no surviving triangle references
    const clean = mergeUsed(geo);
    clean.computeBoundingSphere();

    const mat = def.material(color);
    // Front faces only. Every hem now tapers to *below* the skin surface, so
    // there is no open edge left to see through — and back faces at a hem are
    // exactly what was catching the key light as a fan of bright shards.
    mat.side = THREE.FrontSide;
    const mesh = this.rig.bind(clean, mat);
    mesh.name = 'outfit:' + name;
    mesh.visible = false;
    this.triangles += clean.index.count / 3;
    this.items[key] = { mesh, name, color, mat };
    return this.items[key];
  }

  /**
   * `{ top:'mint', bottom:false, diaper:true, socks:'cream', shoes:null,
   *    hat:false, bib:'rose' }` — anything omitted keeps its current state.
   *
   * The whole outfit is re-resolved on every call, not just the slots named:
   * two of the rules below (modesty, and culling the nappy under bottoms) are
   * relations *between* slots, so taking the shorts off has to be able to put
   * the nappy back.
   */
  set(desc = {}) {
    for (const name of Object.keys(GARMENTS)) {
      if (name in desc) this.state[name] = desc[name];
    }
    return this._resolve();
  }

  /** Is this slot asking to be worn? */
  static _on(v) { return !(v === false || v === null || v === undefined); }

  /**
   * Turn `this.state` into visible meshes, applying the two rules the stack
   * table at the top of this file describes.
   */
  _resolve() {
    const defaults = {
      top: 0xbdf0dc, bottom: 0xa8d8ff, diaper: 0xfffdf8,
      socks: 0xfff4e4, shoes: 0xff9ec4, hat: 0xffe89a, bib: 0xffb6cc
    };
    const on = (n) => Outfit._on(this.state[n]);

    /* Modesty. This is a children's product and the character is never
     * undressed below the waist — not in an activity, not at a camera preset,
     * and not in the default state. `30-dress-outfit` shipped a bare-crotched
     * child through two review passes because the rule lived in whichever
     * call site happened to remember it; it lives here now, where every path
     * into the rig has to go through it. Bath and nappy-change legitimately
     * strip the clothes — they do not get to strip the nappy.               */
    if (!on('bottom') && !on('diaper')) this.state.diaper = true;

    /* The nappy and the bottoms share a shell level (7.6 mm) because they
     * cover the same body. Only one of them can be outermost there, and the
     * nappy is the one nobody can see, so it is the one that goes. Rendering
     * both put two same-level shells over the hips, which is half of what
     * shredded the pyjama in `50`/`51`/`52`.                                */
    const culled = on('bottom') ? 'diaper' : null;

    for (const name of Object.keys(GARMENTS)) {
      // hide every variant of this garment first
      for (const k in this.items) if (this.items[k].name === name) this.items[k].mesh.visible = false;
      if (name === culled || !on(name)) continue;
      const item = this._make(name, resolveColor(this.state[name], defaults[name]));
      if (item) item.mesh.visible = true;
    }
    return this;
  }

  /** Current visible garment meshes (for wetness / stains). */
  visible() {
    return Object.values(this.items).filter(i => i.mesh.visible);
  }

  setWet(a) {
    for (const i of Object.values(this.items)) MAT.applyWetness(i.mat, a);
  }

  dispose() {
    for (const k in this.items) {
      this.items[k].mesh.geometry.dispose();
      this.items[k].mat.dispose?.();
      this.items[k].mesh.parent?.remove(this.items[k].mesh);
    }
    this.items = {};
  }
}

/** Compact a geometry down to the vertices its indices actually use. */
function mergeUsed(geo) {
  const idx = geo.index.array;
  const map = new Int32Array(geo.attributes.position.count).fill(-1);
  let n = 0;
  for (let i = 0; i < idx.length; i++) if (map[idx[i]] < 0) map[idx[i]] = n++;
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, U = geo.attributes.uv.array;
  const p = new Float32Array(n * 3), nn = new Float32Array(n * 3), u = new Float32Array(n * 2);
  for (let i = 0; i < map.length; i++) {
    const j = map[i];
    if (j < 0) continue;
    p[j * 3] = P[i * 3]; p[j * 3 + 1] = P[i * 3 + 1]; p[j * 3 + 2] = P[i * 3 + 2];
    nn[j * 3] = N[i * 3]; nn[j * 3 + 1] = N[i * 3 + 1]; nn[j * 3 + 2] = N[i * 3 + 2];
    u[j * 2] = U[i * 2]; u[j * 2 + 1] = U[i * 2 + 1];
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  const ni = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) ni[i] = map[idx[i]];
  out.setIndex(new THREE.BufferAttribute(ni, 1));
  const src = geo.userData.parts;
  if (src) {
    const nG = geo.userData.partNames.length;
    const dst = new Float32Array(n * nG);
    for (let i = 0; i < map.length; i++) {
      const j = map[i];
      if (j < 0) continue;
      for (let g = 0; g < nG; g++) dst[j * nG + g] = src[i * nG + g];
    }
    out.userData.parts = dst;
    out.userData.partNames = geo.userData.partNames;
  }
  geo.dispose();
  return out;
}

/**
 * Loft descriptions reused by the garment shells. Kept here (rather than
 * exported from anatomy) so clothing can use a coarser topology than skin.
 */
export const SHELL_PATCHES = {
  torso: {
    axis: [[0, 0.2520, -0.0020], [0, 0.3050, 0.0060], [0, 0.3620, 0.0060], [0, 0.4300, 0.0010]],
    segs: 54, rings: 44, capStart: 14, capEnd: 3, tMax: 0.24
  },
  head: {
    star: true, center: [0, 0.5330, 0.0060], segs: 46, rings: 34, tMax: 0.22,
    collapse: { from: 0.86, to: [0, 0.4400, 0.0040] }
  },
  armL: { axis: [[0.0820, 0.4010, 0.0040], [0.1265, 0.3480, 0.0225], [0.1570, 0.3010, 0.0420]], segs: 36, rings: 32, capStart: 2, capEnd: 2, tMax: 0.14 },
  armR: { axis: [[-0.0820, 0.4010, 0.0040], [-0.1265, 0.3480, 0.0225], [-0.1570, 0.3010, 0.0420]], segs: 36, rings: 32, capStart: 2, capEnd: 2, tMax: 0.14 },
  legL: { axis: [[0.0430, 0.2620, 0.0040], [0.0520, 0.1680, 0.0000], [0.0560, 0.0660, 0.0040]], segs: 26, rings: 26, capStart: 2, capEnd: 2, tMax: 0.16 },
  legR: { axis: [[-0.0430, 0.2620, 0.0040], [-0.0520, 0.1680, 0.0000], [-0.0560, 0.0660, 0.0040]], segs: 26, rings: 26, capStart: 2, capEnd: 2, tMax: 0.16 },
  footL: { axis: [[0.0560, 0.0345, -0.0170], [0.0570, 0.0270, 0.0400]], segs: 20, rings: 15, capStart: 5, capEnd: 5, tMax: 0.10 },
  footR: { axis: [[-0.0560, 0.0345, -0.0170], [-0.0570, 0.0270, 0.0400]], segs: 20, rings: 15, capStart: 5, capEnd: 5, tMax: 0.10 },
  handL: { axis: [[0.1580, 0.2940, 0.0435], [0.1720, 0.2620, 0.0540]], segs: 18, rings: 14, capStart: 4, capEnd: 5, tMax: 0.10 },
  handR: { axis: [[-0.1580, 0.2940, 0.0435], [-0.1720, 0.2620, 0.0540]], segs: 18, rings: 14, capStart: 4, capEnd: 5, tMax: 0.10 }
};

export { PALETTE };
