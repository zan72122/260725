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

const band = (a, b, x) => sstep(a, a + 0.012, x) * (1 - sstep(b - 0.012, b, x));

/** Distance to a mirrored segment, used by the sleeve/leg masks. */
function segDist(p, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  let t = ((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / (l2 || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + bx * t), p[1] - (a[1] + by * t), p[2] - (a[2] + bz * t));
}

/* ------------------------------------------------------------ garments ---- */

/**
 * name → { groups, inflate, mask(x,y,z), material(), lod }
 * `mask` returns 1 where the garment is solid and fades to 0 at the hem.
 */
export const GARMENTS = {
  top: {
    groups: ['torso', 'armL', 'armR'],
    inflate: 0.0148,
    lod: 0.92,
    mask: (x, y, z) => {
      // the collar sits low and wide, well clear of the head shell's own rim —
      // an overlapping neckline leaves the two surfaces fighting and shows as
      // a ring of hard flaps under the chin
      const bodyM = band(0.2430, 0.4235, y);
      // short sleeves: a capsule around the top of each upper arm
      let sl = 0;
      for (const s of [1, -1]) {
        const d = segDist([x, y, z], mir([0.0700, 0.4060, 0.0040], s), mir([0.1080, 0.3640, 0.0160], s));
        sl = Math.max(sl, 1 - sstep(0.030, 0.052, d));
      }
      // neck hole
      const neck = 1 - Math.exp(-(((x) ** 2 + ((y - 0.4330) / 0.72) ** 2 + ((z - 0.004) / 1.0) ** 2) / (0.042 ** 2)));
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
    inflate: 0.0072,
    lod: 0.7,
    mask: (x, y, z) => {
      const hip = band(0.2200, 0.3080, y);
      let leg = 0;
      for (const s of [1, -1]) {
        const d = segDist([x, y, z], mir([0.0420, 0.2640, 0.0040], s), mir([0.0470, 0.2020, 0.0020], s));
        leg = Math.max(leg, (1 - sstep(0.044, 0.062, d)) * (1 - sstep(0.268, 0.290, y)));
      }
      return Math.max(hip, leg);
    },
    material: (c) => MAT.makeCloth({
      color: c, weave: 'plain', threads: 70, repeat: 3.5, seed: 33, normalScale: 0.5
    })
  },
  diaper: {
    groups: ['torso', 'legL', 'legR'],
    inflate: 0.0112,
    lod: 0.62,
    mask: (x, y, z) => {
      // fat at the back and between the legs, tapering at the waist
      const wais = band(0.2320, 0.3020, y);
      const bulk = 1 - sstep(0.048, 0.082, Math.hypot(x * 0.85, (y - 0.2560) * 1.3, (z + 0.010) * 0.85));
      return Math.max(wais * 0.9, bulk);
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
    inflate: 0.0048,
    lod: 0.66,
    mask: (x, y, z) => 1 - sstep(0.088, 0.112, y),
    material: (c) => MAT.makeCloth({
      color: c, weave: 'knit', threads: 48, repeat: 4, seed: 57, normalScale: 0.5
    })
  },
  shoes: {
    groups: ['footL', 'footR'],
    inflate: 0.0075,
    lod: 0.7,
    mask: (x, y, z) => 1 - sstep(0.052, 0.070, y),
    material: (c) => MAT.makePlastic({ color: c, matte: 0.55, clearcoat: 0.7, seed: 63 })
  },
  hat: {
    groups: ['head'],
    inflate: 0.0055,
    lod: 0.72,
    mask: (x, y, z) => sstep(0.5560, 0.5760, y + z * 0.16),
    material: (c) => MAT.makeCloth({ color: c, weave: 'knit', threads: 80, repeat: 9, seed: 71 })
  },
  bib: {
    groups: ['torso'],
    inflate: 0.0068,
    lod: 0.8,
    mask: (x, y, z) => {
      if (z < 0.010) return 0;
      const r = Math.hypot(x / 0.062, (y - 0.3880) / 0.058);
      const neck = sstep(0.030, 0.052, Math.hypot(x / 0.9, (y - 0.4340) / 0.75));
      return (1 - sstep(0.85, 1.05, r)) * neck;
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
        inflate: def.inflate,
        // Taper the offset to zero at the hem, then keep going: the last
        // millimetres of a garment have to end up *under* the skin, or the
        // ragged triangle boundary left by the mask trim shows as a fringe of
        // hard flat shards around every neckline and cuff.
        detail: (x, y, z) => {
          const mk = def.mask(x, y, z);
          return -def.inflate * (1 - mk) - 0.0105 * (1 - sstep(0.28, 0.70, mk));
        },
        // an 8 mm-proud shell needs a correspondingly deep dominance sink, or
        // the torso and sleeve shells interleave at the shoulder into a fan of
        // hard pale shards
        margin: 0.030, sinkDepth: 0.013,
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
      for (let i = 0; i < p.idx.length; i += 3) {
        const a = p.idx[i] + vo, b = p.idx[i + 1] + vo, c = p.idx[i + 2] + vo;
        // averaged rather than "any vertex survives": a max test leaves a
        // sawtooth of single triangles hanging past every hem
        let sum = 0;
        for (const v of [a, b, c]) sum += def.mask(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        if (sum / 3 > 0.30) idx.push(a, b, c);
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
   */
  set(desc = {}) {
    const defaults = {
      top: 0xbdf0dc, bottom: 0xa8d8ff, diaper: 0xfffdf8,
      socks: 0xfff4e4, shoes: 0xff9ec4, hat: 0xffe89a, bib: 0xffb6cc
    };
    for (const name of Object.keys(GARMENTS)) {
      if (!(name in desc)) continue;
      const v = desc[name];
      this.state[name] = v;
      // hide every variant of this garment first
      for (const k in this.items) if (this.items[k].name === name) this.items[k].mesh.visible = false;
      if (v === false || v === null || v === undefined) continue;
      const item = this._make(name, resolveColor(v, defaults[name]));
      if (item) item.mesh.visible = true;
    }
    // a nappy is always under the bottoms, never over them
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
    segs: 40, rings: 34, capStart: 6, capEnd: 3, tMax: 0.24
  },
  head: {
    star: true, center: [0, 0.5330, 0.0060], segs: 46, rings: 34, tMax: 0.22,
    collapse: { from: 0.86, to: [0, 0.4400, 0.0040] }
  },
  armL: { axis: [[0.0820, 0.4010, 0.0040], [0.1265, 0.3480, 0.0225], [0.1570, 0.3010, 0.0420]], segs: 22, rings: 22, capStart: 2, capEnd: 2, tMax: 0.14 },
  armR: { axis: [[-0.0820, 0.4010, 0.0040], [-0.1265, 0.3480, 0.0225], [-0.1570, 0.3010, 0.0420]], segs: 22, rings: 22, capStart: 2, capEnd: 2, tMax: 0.14 },
  legL: { axis: [[0.0430, 0.2620, 0.0040], [0.0520, 0.1680, 0.0000], [0.0560, 0.0660, 0.0040]], segs: 26, rings: 26, capStart: 2, capEnd: 2, tMax: 0.16 },
  legR: { axis: [[-0.0430, 0.2620, 0.0040], [-0.0520, 0.1680, 0.0000], [-0.0560, 0.0660, 0.0040]], segs: 26, rings: 26, capStart: 2, capEnd: 2, tMax: 0.16 },
  footL: { axis: [[0.0560, 0.0345, -0.0170], [0.0570, 0.0270, 0.0400]], segs: 20, rings: 15, capStart: 5, capEnd: 5, tMax: 0.10 },
  footR: { axis: [[-0.0560, 0.0345, -0.0170], [-0.0570, 0.0270, 0.0400]], segs: 20, rings: 15, capStart: 5, capEnd: 5, tMax: 0.10 },
  handL: { axis: [[0.1580, 0.2940, 0.0435], [0.1720, 0.2620, 0.0540]], segs: 18, rings: 14, capStart: 4, capEnd: 5, tMax: 0.10 },
  handR: { axis: [[-0.1580, 0.2940, 0.0435], [-0.1720, 0.2620, 0.0540]], segs: 18, rings: 14, capStart: 4, capEnd: 5, tMax: 0.10 }
};

export { PALETTE };
