/* ============================================================================
 * anatomy.js — procedural infant body construction
 * ----------------------------------------------------------------------------
 * The old baby was a pile of spheres and it read as a toy. This one is built
 * the way a character artist would think about it, but procedurally:
 *
 *   1. A *shape spec* describes the body as a small set of implicit volumes
 *      (round cones + ellipsoids) grouped into parts — torso, head, arms…
 *   2. Those volumes are combined with an exponential smooth-min, so the whole
 *      body is one continuous C1 implicit surface. No visible joins, ever.
 *   3. Topology and UVs come from *lofted patches* (capsule / sphere grids)
 *      whose vertices are then ray-marched onto that implicit surface. Quad
 *      grids give clean UVs and clean skin weights; the implicit surface gives
 *      the continuous silhouette and normals. Best of both worlds.
 *   4. Overlapping patches are resolved by "dominance sinking": wherever a
 *      higher-priority part owns the surface, the lower-priority patch is
 *      pushed *inside* it, so exactly one shell is ever visible and there is
 *      no z-fighting and no seam.
 *   5. A detail pass adds what actually makes a baby read as a baby: the fold
 *      lines at wrist, elbow, knee, thigh and neck, the fat rolls between
 *      them, the navel, the eye sockets, the lip line, the ear concha.
 *
 * Everything is deterministic; the whole build runs once at boot in ~50 ms.
 * ========================================================================== */

import * as THREE from 'three';

/* ------------------------------------------------------------ proportions -- */

/**
 * Infant proportions, in metres, standing, floor at y = 0.
 * Head is ~1/4 of total height with a big cranium and a tiny chin; limbs are
 * deliberately stubby (a baby's fingertips barely reach the crotch).
 */
export const PROPORTIONS = {
  height: 0.622,
  headTop: 0.6225,
  chin: 0.4605,
  eyeY: 0.5325,
  eyeX: 0.0295,
  eyeZ: 0.0505,
  eyeR: 0.0192,          // eyeball radius — oversized on purpose, it is cute
  mouthY: 0.4855,
  mouthZ: 0.0655,
  noseY: 0.5075,
  noseZ: 0.0685,
  earY: 0.5285,
  earX: 0.0735,
  shoulderY: 0.404,
  hipY: 0.262,
  chestY: 0.372,
  bellyY: 0.322,
  neckY: 0.432
};

const P = PROPORTIONS;

/* --------------------------------------------------------------- spec ----- */

/**
 * Anchor points shared by every other character module: the rig hangs bones
 * off them, the face places eyes with them, hair finds the crown with them.
 * `L` is the baby's own left, which is +X (the baby faces +Z).
 */
export function anchors() {
  const a = {
    root:      [0, 0, 0],
    hips:      [0, 0.2620, 0.0020],
    spine:     [0, 0.3150, 0.0040],
    belly:     [0, 0.3200, 0.0400],
    chest:     [0, 0.3760, 0.0040],
    neck:      [0, 0.4320, 0.0020],
    head:      [0, 0.4700, 0.0020],
    headEnd:   [0, 0.5455, 0.0000],
    crown:     [0, 0.6180, 0.0000],
    eye:       [P.eyeX, P.eyeY, P.eyeZ],
    ear:       [P.earX, P.earY, -0.0040],
    mouth:     [0, P.mouthY, P.mouthZ],
    nose:      [0, P.noseY, P.noseZ],
    shoulder:  [0.0380, 0.4040, 0.0020],
    arm:       [0.0820, 0.4010, 0.0040],
    forearm:   [0.1265, 0.3480, 0.0225],
    hand:      [0.1570, 0.3010, 0.0420],
    handEnd:   [0.1735, 0.2640, 0.0545],
    thigh:     [0.0430, 0.2620, 0.0040],
    shin:      [0.0520, 0.1680, 0.0000],
    foot:      [0.0560, 0.0660, 0.0040],
    toe:       [0.0570, 0.0260, 0.0460]
  };
  // mirrored convenience accessors: anchor('arm', +1) etc.
  return a;
}

const A = anchors();

/** Mirror a point for side = +1 (left) / -1 (right). */
function m(p, side) { return [p[0] * side, p[1], p[2]]; }

/**
 * The implicit volumes. `g` is the owning patch group, `prio` decides which
 * shell stays on the surface where two parts overlap (lower wins).
 */
/**
 * Which shell stays on the surface where two parts overlap — lower wins.
 *
 * The head outranks the torso because the *neck* belongs to the head group:
 * with it the other way round the torso patch's top cap sat on the surface all
 * the way up to the jaw, interleaving with the head shell into a ring of hard
 * triangular flaps under the chin.
 */
const PRIO = { head: 0, torso: 1, limb: 2, end: 3 };

export function bodySpec() {
  const prims = [];
  const cone = (g, prio, a, b, r1, r2, sharp) =>
    prims.push({ g, prio, t: 0, a, b, r1, r2, sharp });
  const ell = (g, prio, c, r, sharp) => prims.push({ g, prio, t: 1, c, r, sharp });

  /* -- torso: pelvis → belly → chest, plus buttocks and the shoulder girdle */
  ell('torso', PRIO.torso, [0, 0.2680, 0.0000], [0.0800, 0.0550, 0.0700]);      // pelvis
  ell('torso', PRIO.torso, [0, 0.3220, 0.0080], [0.0840, 0.0600, 0.0780]);      // belly
  ell('torso', PRIO.torso, [0, 0.3780, 0.0040], [0.0790, 0.0520, 0.0700]);      // ribcage
  cone('torso', PRIO.torso, [-0.0540, 0.4040, 0.0020], [0.0540, 0.4040, 0.0020], 0.0400, 0.0400); // clavicle bar
  cone('torso', PRIO.torso, [-0.0250, 0.2560, 0.0000], [0.0250, 0.2560, 0.0000], 0.0430, 0.0430); // crotch
  for (const s of [1, -1]) {
    ell('torso', PRIO.torso, m([0.0655, 0.4010, 0.0020], s), [0.0345, 0.0355, 0.0350]); // deltoid
    ell('torso', PRIO.torso, m([0.0400, 0.2580, -0.0400], s), [0.0450, 0.0420, 0.0450]); // buttock
  }

  /* -- head: big cranium, small jaw, fat cheeks, button nose, soft ears ---- */
  ell('head', PRIO.head, [0, 0.5470, -0.0025], [0.0700, 0.0755, 0.0690]);      // cranium
  ell('head', PRIO.head, [0, 0.5010, 0.0090], [0.0575, 0.0455, 0.0530]);       // jaw mass
  ell('head', PRIO.head, [0, 0.4945, 0.0400], [0.0295, 0.0235, 0.0235]);       // muzzle
  ell('head', PRIO.head, [0, 0.4735, 0.0290], [0.0250, 0.0195, 0.0235]);       // chin mass
  cone('head', PRIO.head, [-0.0310, 0.5430, 0.0440], [0.0310, 0.5430, 0.0440], 0.0155, 0.0155); // brow ridge
  cone('head', PRIO.head, [0, 0.4280, 0.0000], [0, 0.4700, 0.0040], 0.0360, 0.0340);            // neck
  for (const s of [1, -1]) {
    ell('head', PRIO.head, m([0.0415, 0.5065, 0.0300], s), [0.0280, 0.0250, 0.0255]); // cheek
    ell('head', PRIO.head, m([0.0740, 0.5285, -0.0070], s), [0.0080, 0.0235, 0.0180]); // ear
  }

  /* -- the face proper -----------------------------------------------------
   * These carry an explicit `sharp` radius. The body's global smooth-union
   * fillet is ~10 mm — the same order as a whole infant nose — so anything
   * facial added at that sharpness dissolves into the skull and the character
   * ends up with a smooth pink blank where its face should be. Each of these
   * joins the head with a 2–8 mm fillet instead.
   *
   * Everything here is sized off infant proportion, not adult: a *short*
   * philtrum, a small centred mouth, a chin that recedes rather than juts, and
   * no cheek/nose crease of any kind. Adult landmarks on a baby head is what
   * turns a face into a goblin.                                             */
  cone('head', PRIO.head, [0, 0.5320, 0.0580], [0, 0.5110, 0.0650], 0.0058, 0.0086, 210); // nasal bridge
  ell('head', PRIO.head, [0, 0.5062, 0.0702], [0.0112, 0.0100, 0.0108], 280);             // nose tip
  ell('head', PRIO.head, [0, 0.4930, 0.0676], [0.0202, 0.0054, 0.0074], 480);             // upper lip
  ell('head', PRIO.head, [0, 0.4846, 0.0672], [0.0184, 0.0068, 0.0086], 480);             // lower lip
  ell('head', PRIO.head, [0, 0.4700, 0.0500], [0.0175, 0.0125, 0.0092], 120);             // soft chin
  for (const s of [1, -1]) {
    ell('head', PRIO.head, m([0.0102, 0.5022, 0.0648], s), [0.0062, 0.0052, 0.0068], 300); // ala
  }

  /* -- limbs --------------------------------------------------------------- */
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    // upper arm tapers into a real elbow, forearm narrows into a real wrist
    cone('arm' + side, PRIO.limb, m(A.arm, s), m(A.forearm, s), 0.0360, 0.0272);
    cone('arm' + side, PRIO.limb, m(A.forearm, s), m([0.1500, 0.3090, 0.0390], s), 0.0300, 0.0196);
    // olecranon: the little knob behind the elbow that stops the arm reading
    // as a length of hosepipe
    ell('arm' + side, PRIO.limb, m([0.1300, 0.3495, 0.0060], s), [0.0128, 0.0150, 0.0110], 240);
    // wrist bone
    ell('arm' + side, PRIO.limb, m([0.1508, 0.3078, 0.0392], s), [0.0140, 0.0138, 0.0128], 300);

    ell('hand' + side, PRIO.end, m([0.1640, 0.2830, 0.0460], s), [0.0215, 0.0235, 0.0155]); // palm
    ell('hand' + side, PRIO.end, m([0.1700, 0.2660, 0.0520], s), [0.0180, 0.0140, 0.0130]); // knuckle pad
    // four little sausages. `d` fans them apart; each is a sharp round cone so
    // the smooth union leaves the webbing between them instead of a mitten.
    for (let f = 0; f < 4; f++) {
      const u = (f - 1.5) / 1.5;                     // -1 … +1, index → little
      const bx = 0.1690 + u * 0.0110, by = 0.2665 - Math.abs(u) * 0.0016;
      const tipLen = 0.0182 - Math.abs(u) * 0.0038;
      cone('hand' + side, PRIO.end,
        m([bx, by, 0.0520 + u * 0.0016], s),
        m([bx + u * 0.0052, by - tipLen, 0.0560 + u * 0.0030], s),
        0.0058 - Math.abs(u) * 0.0006, 0.0046 - Math.abs(u) * 0.0006, 500);
    }
    // thumb, set well apart and slightly opposed
    cone('hand' + side, PRIO.end, m([0.1530, 0.2800, 0.0470], s), m([0.1408, 0.2686, 0.0596], s),
      0.0086, 0.0062, 420);

    cone('leg' + side, PRIO.limb, m(A.thigh, s), m(A.shin, s), 0.0520, 0.0364);
    cone('leg' + side, PRIO.limb, m(A.shin, s), m(A.foot, s), 0.0382, 0.0232);
    ell('leg' + side, PRIO.limb, m([0.0516, 0.1732, -0.0072], s), [0.0170, 0.0180, 0.0130], 210); // kneecap
    ell('leg' + side, PRIO.limb, m([0.0548, 0.0742, 0.0000], s), [0.0210, 0.0180, 0.0186], 300); // ankle
    ell('foot' + side, PRIO.end, m([0.0560, 0.0320, -0.0060], s), [0.0240, 0.0260, 0.0240]);
    ell('foot' + side, PRIO.end, m([0.0570, 0.0255, 0.0230], s), [0.0225, 0.0185, 0.0270]);
    // five toes. Baby toes are tiny stubs — but their absence is exactly what
    // makes a CG foot read as a flipper.
    for (let f = 0; f < 5; f++) {
      const u = (f - 2) / 2;
      const tx = 0.0570 + u * 0.0128;
      const r = 0.0062 - Math.abs(u) * 0.0018;
      cone('foot' + side, PRIO.end,
        m([tx, 0.0212, 0.0400], s),
        m([tx + u * 0.0024, 0.0196, 0.0470 - Math.abs(u) * 0.0044], s),
        r, r * 0.88, 620);
    }
  }

  return prims;
}

/* ------------------------------------------------------------ SDF core ---- */

/** Exact round cone (capsule with two radii). iq's formulation. */
function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const sr = rr < 0 ? -1 : (rr > 0 ? 1 : 0);
  const k = sr * rr * rr * x2;
  const sz = z < 0 ? -1 : 1;
  if (sz * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  const sy = y < 0 ? -1 : 1;
  if (sy * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Ellipsoid — iq's gradient-corrected bound; close enough to a distance. */
function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  const x0 = dx / rx, y0 = dy / ry, z0 = dz / rz;
  const k0 = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const x1 = dx / (rx * rx), y1 = dy / (ry * ry), z1 = dz / (rz * rz);
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return k0 * (k0 - 1) / k1;
}

/**
 * The blended body field.
 *
 * `k` is the smooth-union sharpness: 1/k is roughly the fillet radius. 55 gives
 * an ~18 mm fillet, which is exactly the soft "no visible joint" look of a
 * chubby infant — bony characters would want a much higher k.
 */
/**
 * Polynomial smooth-min with an explicit blend radius `r` (metres). Unlike the
 * exponential form used for the body it is per-pair, which is exactly what a
 * nose needs: joined to the skull with a 3 mm fillet while the shoulder next
 * door still gets its 10 mm one.
 */
function sminPoly(a, b, r) {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / r));
  return b + (a - b) * h - r * h * (1 - h);
}

export class BodyField {
  constructor(prims, k = 100) {
    this.prims = prims.filter(p => !p.sharp);
    this.sharp = prims.filter(p => p.sharp);
    this.all = prims;
    this.k = k;
    this.cut = 9 / k;                   // ignore prims contributing < e^-9
    this.groups = [...new Set(prims.map(p => p.g))];
    this.prio = {};
    for (const p of prims) this.prio[p.g] = p.prio;

    // bounding sphere per primitive, for the distance early-out
    for (const p of prims) {
      if (p.t === 0) {
        p.bc = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
        const hx = p.b[0] - p.bc[0], hy = p.b[1] - p.bc[1], hz = p.b[2] - p.bc[2];
        p.br = Math.hypot(hx, hy, hz) + Math.max(p.r1, p.r2);
      } else {
        p.bc = p.c;
        p.br = Math.max(p.r[0], p.r[1], p.r[2]);
      }
    }
    this._w = new Float32Array(this.groups.length);
    this._gi = {};
    this.groups.forEach((g, i) => { this._gi[g] = i; });
  }

  /** Distance of a single primitive. */
  one(p, x, y, z) {
    return p.t === 0
      ? sdRoundCone(x, y, z, p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2], p.r1, p.r2)
      : sdEllipsoid(x, y, z, p.c[0], p.c[1], p.c[2], p.r[0], p.r[1], p.r[2]);
  }

  /** Smooth union over every primitive (or only those of `only`, a Set). */
  eval(x, y, z, only = null) {
    const { prims, k, cut } = this;
    let mn = Infinity;
    const n = prims.length;
    const ds = this._ds || (this._ds = new Float64Array(n));
    let count = 0;
    for (let i = 0; i < n; i++) {
      const p = prims[i];
      if (only && !only.has(p.g)) continue;
      // cheap reject: bounding-sphere distance beyond the blend cutoff
      const bx = x - p.bc[0], by = y - p.bc[1], bz = z - p.bc[2];
      const bd = Math.sqrt(bx * bx + by * by + bz * bz) - p.br;
      if (bd > mn + cut && mn < Infinity) continue;
      const d = this.one(p, x, y, z);
      ds[count++] = d;
      if (d < mn) mn = d;
    }
    let res;
    if (!count) {
      res = 1e3;
    } else {
      let s = 0;
      for (let i = 0; i < count; i++) {
        const e = (ds[i] - mn) * k;
        if (e < 9) s += Math.exp(-e);
      }
      res = mn - Math.log(s) / k;
    }
    // facial / finger detail joins the soft body with its own tight fillet
    const sp = this.sharp;
    for (let i = 0; i < sp.length; i++) {
      const p = sp[i];
      if (only && !only.has(p.g)) continue;
      const r = 1 / p.sharp;
      const bx = x - p.bc[0], by = y - p.bc[1], bz = z - p.bc[2];
      const bd = Math.sqrt(bx * bx + by * by + bz * bz) - p.br;
      if (bd > res + r * 3) continue;
      res = sminPoly(res, this.one(p, x, y, z), r);
    }
    return res;
  }

  /** Per-group blend weights at a point (they sum to 1). */
  groupWeights(x, y, z, out) {
    const { all: prims, k } = this;
    const w = out || this._w;
    w.fill(0);
    let mn = Infinity;
    const n = prims.length;
    const ds = this._ds2 || (this._ds2 = new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const d = this.one(prims[i], x, y, z);
      ds[i] = d;
      if (d < mn) mn = d;
    }
    let s = 0;
    for (let i = 0; i < n; i++) {
      const e = (ds[i] - mn) * k;
      if (e > 9) continue;
      const v = Math.exp(-e);
      w[this._gi[prims[i].g]] += v;
      s += v;
    }
    if (s > 0) for (let i = 0; i < w.length; i++) w[i] /= s;
    return w;
  }

  /** Central-difference gradient of the blended field (= surface normal). */
  grad(x, y, z, out) {
    const e = 0.0016;
    const dx = this.eval(x + e, y, z) - this.eval(x - e, y, z);
    const dy = this.eval(x, y + e, z) - this.eval(x, y - e, z);
    const dz = this.eval(x, y, z + e) - this.eval(x, y, z - e);
    const l = Math.hypot(dx, dy, dz) || 1;
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
    return out;
  }

  /**
   * March from an interior point along `d` to the `level` isosurface.
   * Because the field is (near enough) a distance, stepping by the field value
   * converges from the inside without ever overshooting.
   */
  march(ox, oy, oz, dx, dy, dz, { only = null, level = 0, tStart = 0, tMax = 1 } = {}) {
    let t = tStart;
    for (let i = 0; i < 48; i++) {
      const d = this.eval(ox + dx * t, oy + dy * t, oz + dz * t, only) - level;
      if (d > -1e-5) break;
      t -= d;
      if (t >= tMax) return tMax;
    }
    return t;
  }
}

/* ---------------------------------------------------------- surface detail - */

/**
 * The fold lines and soft creases. Their absence is what makes a CG infant
 * look like a doll: real babies are a stack of rolls with a crease at every
 * joint. Each feature is a smooth scalar displacement applied along the
 * surface normal, evaluated from world position so it stays continuous across
 * patch boundaries.
 */
export function buildDetail() {
  const F = [];

  /** Ring crease/bulge around a limb segment. `t` is 0..1 along it. */
  const ring = (a, b, t, width, depth, maxRad, asym = null, asymAmt = 0) =>
    F.push({ k: 'ring', a, b, t, width, depth, maxRad, asym, asymAmt });
  /** Radially-symmetric dimple with an optional raised rim. */
  const dimple = (c, radius, depth, rim = 0) => F.push({ k: 'dimple', c, radius, depth, rim });
  /** Anisotropic depression (eye sockets, lip corners). */
  const blob = (c, r, depth) => F.push({ k: 'blob', c, r, depth });
  /** Groove following a polyline (lip line, philtrum, gluteal cleft). */
  const curve = (pts, width, depth, maxRad = 0.05) => F.push({ k: 'curve', pts, width, depth, maxRad });

  for (const s of [1, -1]) {
    const arm = [m(A.arm, s), m(A.forearm, s)];
    const fore = [m(A.forearm, s), m(A.hand, s)];
    const thigh = [m(A.thigh, s), m(A.shin, s)];
    const shin = [m(A.shin, s), m(A.foot, s)];

    // upper-arm roll: crease with a soft bulge above it
    ring(arm[0], arm[1], 0.52, 0.013, 0.0032, 0.075, [0, 0, 1], -0.35);
    ring(arm[0], arm[1], 0.34, 0.020, -0.0022, 0.075);
    // elbow: crease on the inside (anterior), dimple on the outside
    ring(arm[0], arm[1], 0.99, 0.0105, 0.0054, 0.070, [0, 0, 1], 0.9);
    // wrist: the deepest crease on a baby, with the fat roll just proximal
    ring(fore[0], fore[1], 0.92, 0.0085, 0.0060, 0.055);
    ring(fore[0], fore[1], 0.76, 0.019, -0.0030, 0.060);
    // knuckle dimples — four little pits where fingers meet the palm
    for (let i = 0; i < 4; i++) {
      const u = (i - 1.5) / 1.5;
      dimple(m([0.1690 + u * 0.0110, 0.2742, 0.0545 + u * 0.0016], s), 0.0058, 0.0026);
    }
    // the clefts between the fingers, so the hand cannot read as a mitten
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) / 1.5;
      const bx = 0.1690 + u * 0.0110;
      curve([
        m([bx, 0.2712, 0.0512 + u * 0.0016], s),
        m([bx + u * 0.0026, 0.2620, 0.0546 + u * 0.0020], s),
        m([bx + u * 0.0050, 0.2528, 0.0568 + u * 0.0028], s)
      ], 0.0026, 0.0034, 0.0115);
    }
    // and between the toes
    for (let i = 0; i < 4; i++) {
      const u = (i - 1.5) / 2;
      const tx = 0.0570 + u * 0.0128;
      curve([
        m([tx, 0.0234, 0.0374], s),
        m([tx + u * 0.0022, 0.0206, 0.0452 - Math.abs(u) * 0.0040], s)
      ], 0.0022, 0.0030, 0.0090);
    }
    // thigh: the classic double roll
    ring(thigh[0], thigh[1], 0.46, 0.016, 0.0040, 0.095, [0, 0, 1], -0.25);
    ring(thigh[0], thigh[1], 0.27, 0.024, -0.0030, 0.095);
    ring(thigh[0], thigh[1], 0.66, 0.022, -0.0026, 0.095);
    // knee crease + fat pad above the kneecap
    ring(thigh[0], thigh[1], 0.99, 0.0110, 0.0055, 0.075, [0, 0, 1], 0.85);
    // ankle
    ring(shin[0], shin[1], 0.90, 0.0105, 0.0046, 0.055);
    ring(shin[0], shin[1], 0.74, 0.020, -0.0022, 0.058);
    // ear concha
    dimple(m([0.0700, 0.5290, 0.0040], s), 0.0105, 0.0042, 0.0016);
    // eye socket: a shallow anisotropic scoop so the eyeball sits *in* the face
    blob(m([P.eyeX, P.eyeY - 0.0005, P.eyeZ + 0.008], s), [0.0290, 0.0210, 0.0335], 0.0140);
    // the little pad under the eye that makes infants look sleepy-sweet
    blob(m([P.eyeX, P.eyeY - 0.0180, P.eyeZ + 0.004], s), [0.0210, 0.0075, 0.0240], -0.0022);
    // nostril — tucked under the tip, where an infant's actually are
    dimple(m([0.0058, 0.5002, 0.0700], s), 0.0034, 0.0038);
    // the faintest hint of a corner to the mouth. Anything deeper here reads
    // as a smirk, and a smirking baby is a goblin.
    dimple(m([0.0196, 0.4888, 0.0622], s), 0.0092, 0.0013);
  }

  // neck crease (the "double chin" fold) with the roll below it
  ring([0, 0.4280, 0.0000], [0, 0.4700, 0.0040], 0.55, 0.0115, 0.0038, 0.055);
  // navel
  dimple([0, 0.3185, 0.0855], 0.0090, 0.0055, 0.0016);
  // gluteal cleft
  curve([[0, 0.2870, -0.0640], [0, 0.2600, -0.0700], [0, 0.2380, -0.0560]], 0.0090, 0.0060, 0.035);
  // spine groove — very subtle, but it stops the back reading as a balloon
  curve([[0, 0.4100, -0.0640], [0, 0.3600, -0.0720], [0, 0.3100, -0.0750], [0, 0.2850, -0.0700]],
    0.0130, 0.0020, 0.040);
  // philtrum — barely 4 mm on an infant, and shallow. A long one instantly
  // ages the face by twenty years.
  curve([[0, 0.4982, 0.0762], [0, 0.4956, 0.0752]], 0.0032, 0.0020, 0.011);
  // the lip line: a short, nearly level arc. The two lip volumes already leave
  // a valley here; this cuts the seam so it survives a matte SSS shader at
  // portrait distance. No upward flick — a permanent smile is a smirk.
  const lip = [];
  for (let i = 0; i <= 14; i++) {
    const u = (i / 14) * 2 - 1;
    lip.push([u * 0.0198, 0.4888 + u * u * 0.0014, 0.0722 - u * u * 0.0086]);
  }
  curve(lip, 0.0034, 0.0036, 0.022);

  /* -- evaluator ---------------------------------------------------------- */
  return function detail(x, y, z) {
    let d = 0;
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      if (f.k === 'ring') {
        const ax = f.a[0], ay = f.a[1], az = f.a[2];
        const bx = f.b[0] - ax, by = f.b[1] - ay, bz = f.b[2] - az;
        const l2 = bx * bx + by * by + bz * bz;
        const px = x - ax, py = y - ay, pz = z - az;
        const s = (px * bx + py * by + pz * bz) / l2;
        const e = (s - f.t) * Math.sqrt(l2);
        if (Math.abs(e) > f.width * 3) continue;
        const cx = px - bx * s, cy = py - by * s, cz = pz - bz * s;
        const rad = Math.hypot(cx, cy, cz);
        if (rad > f.maxRad) continue;
        let g = Math.exp(-(e / f.width) * (e / f.width));
        g *= 1 - smoothstep(f.maxRad * 0.72, f.maxRad, rad);
        if (f.asym && rad > 1e-6) {
          const dot = (cx * f.asym[0] + cy * f.asym[1] + cz * f.asym[2]) / rad;
          g *= Math.max(0, 1 + f.asymAmt * dot);
        }
        d -= f.depth * g;
      } else if (f.k === 'dimple') {
        const dx = x - f.c[0], dy = y - f.c[1], dz = z - f.c[2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r > f.radius * 3.2) continue;
        const q = r / f.radius;
        d -= f.depth * Math.exp(-q * q);
        if (f.rim) {
          const t = (r - f.radius * 1.35) / (f.radius * 0.6);
          d += f.rim * Math.exp(-t * t);
        }
      } else if (f.k === 'blob') {
        const dx = (x - f.c[0]) / f.r[0], dy = (y - f.c[1]) / f.r[1], dz = (z - f.c[2]) / f.r[2];
        const q2 = dx * dx + dy * dy + dz * dz;
        if (q2 > 9) continue;
        d -= f.depth * Math.exp(-q2);
      } else {
        // polyline groove
        let best = Infinity;
        for (let j = 0; j < f.pts.length - 1; j++) {
          const a = f.pts[j], b = f.pts[j + 1];
          const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
          const px = x - a[0], py = y - a[1], pz = z - a[2];
          const l2 = bx * bx + by * by + bz * bz;
          let s = (px * bx + py * by + pz * bz) / l2;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const qx = px - bx * s, qy = py - by * s, qz = pz - bz * s;
          const dd = qx * qx + qy * qy + qz * qz;
          if (dd < best) best = dd;
        }
        best = Math.sqrt(best);
        if (best > f.maxRad) continue;
        const q = best / f.width;
        d -= f.depth * Math.exp(-q * q) * (1 - smoothstep(f.maxRad * 0.6, f.maxRad, best));
      }
    }
    return d;
  };
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* -------------------------------------------------------------- zones ----- */

/**
 * Per-vertex zone masks used by setDirt()/setFoam(): (face, hands, feet, body).
 * Soft gaussians rather than hard regions, so grime fades naturally at the
 * edges instead of stopping at an invisible border.
 */
export function zoneWeights(x, y, z, out) {
  const g = (dx, dy, dz, r) => Math.exp(-((dx * dx + dy * dy + dz * dz) / (r * r)));
  // face — mouth, cheeks, chin: where food ends up
  const face = Math.min(1,
    g(x, y - 0.4980, z - 0.0480, 0.062) +
    0.6 * g(x, y - 0.5320, z - 0.0300, 0.070));
  let hands = 0, feet = 0;
  for (const s of [1, -1]) {
    hands = Math.max(hands, g(x - 0.1660 * s, y - 0.2750, z - 0.0480, 0.052));
    feet = Math.max(feet, g(x - 0.0565 * s, y - 0.0300, z - 0.0100, 0.060));
  }
  const body = Math.max(0, (1 - face) * (1 - hands) * (1 - feet) *
    (1 - smoothstep(0.452, 0.500, y)));
  out[0] = face; out[1] = hands; out[2] = feet; out[3] = body;
  return out;
}

/* -------------------------------------------------------------- lofting --- */

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Parallel-transported frames along an axis polyline. Parallel transport (as
 * opposed to a fixed up-vector) is what stops the UV shell twisting when a
 * limb axis bends.
 */
function axisFrames(pts, ref) {
  const n = pts.length;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    T.push(normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
  }
  let n0 = [ref[0], ref[1], ref[2]];
  const d0 = n0[0] * T[0][0] + n0[1] * T[0][1] + n0[2] * T[0][2];
  n0 = normalize3([n0[0] - T[0][0] * d0, n0[1] - T[0][1] * d0, n0[2] - T[0][2] * d0]);
  N.push(n0); B.push(normalize3(cross3(T[0], n0)));
  for (let i = 1; i < n; i++) {
    const prev = N[i - 1];
    const d = prev[0] * T[i][0] + prev[1] * T[i][1] + prev[2] * T[i][2];
    const nn = normalize3([prev[0] - T[i][0] * d, prev[1] - T[i][1] * d, prev[2] - T[i][2] * d]);
    N.push(nn); B.push(normalize3(cross3(T[i], nn)));
  }
  return { T, N, B };
}

/** Resample an axis polyline to `n` evenly spaced points (by arc length). */
function resample(pts, n) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    seg.push(d); total += d;
  }
  const out = [];
  for (let j = 0; j < n; j++) {
    let want = (j / (n - 1)) * total, i = 0;
    while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
    const t = seg[i] > 0 ? want / seg[i] : 0;
    out.push([
      pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
      pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
      pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t
    ]);
  }
  return out;
}

/**
 * Build one lofted patch and project it onto the blended body surface.
 *
 * Returns raw typed arrays plus per-vertex ownership, so the caller can merge
 * several patches into one geometry.
 */
export function buildPatch(field, opts) {
  const {
    group, segs, rings, star = false, center = [0, 0, 0],
    axis = null, capStart = 4, capEnd = 4,
    ref = [0, 0, 1], uvRepeat = 7, inflate = 0, collapse = null,
    margin = 0.035, sinkDepth = 0.005, detail = null,
    tMax = 0.42, uvOffsetV = 0, focus = null, tube = null
  } = opts;

  /**
   * Sample-density warp. `focus = { theta:[c, s], phi:[c, s] }` bunches samples
   * around a parametric centre `c` with strength `s` (density there rises by
   * 1/(1-s)). Used to spend the head's triangles on the face — a nostril is
   * 4 mm across and a uniform sphere grid dense enough to resolve it would put
   * the same density on the back of the skull, where nothing happens.
   */
  const warp = (t, c, s) => {
    if (!s) return t;
    const f = u => u - (s / (2 * Math.PI)) * Math.sin(2 * Math.PI * (u - c));
    return f(t) - f(0);
  };
  const wT = focus?.theta || [0, 0], wP = focus?.phi || [0, 0];

  const only = new Set([group]);
  const gi = field.groups.indexOf(group);
  const prioSelf = field.prio[group];
  const nGroups = field.groups.length;
  const gw = new Float32Array(nGroups);

  let R;                       // ring count (inclusive)
  let origins = null, dirs = null;
  if (star) {
    R = rings;
  } else {
    const body = resample(axis, Math.max(2, rings + 1));
    const fr = axisFrames(body, ref);
    R = capStart + rings + capEnd;
    origins = []; dirs = [];
    for (let j = 0; j <= R; j++) {
      let alpha, idx;
      if (j < capStart) { alpha = Math.PI - (Math.PI / 2) * (j / capStart); idx = 0; }
      else if (j <= capStart + rings) { alpha = Math.PI / 2; idx = j - capStart; }
      else { alpha = (Math.PI / 2) * (1 - (j - capStart - rings) / capEnd); idx = body.length - 1; }
      origins.push({ o: body[idx], T: fr.T[idx], N: fr.N[idx], B: fr.B[idx], alpha });
    }
  }

  const nv = (R + 1) * (segs + 1);
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const own = new Float32Array(nv);
  const parts = new Float32Array(nv * nGroups);
  const gnrm = [0, 0, 0];
  const tmp = [0, 0, 0];

  // pass 1 — project every vertex
  for (let j = 0; j <= R; j++) {
    for (let i = 0; i <= segs; i++) {
      const phi = i / segs;
      const vi = j * (segs + 1) + i;
      let ox, oy, oz, dx, dy, dz;
      if (star) {
        const tw = warp(j / R, wT[0], wT[1]);
        const theta = Math.PI * tw;
        const psi = warp(phi, wP[0], wP[1]) * Math.PI * 2 - Math.PI / 2;   // seam at the back of the head
        const st = Math.sin(theta);
        ox = center[0]; oy = center[1]; oz = center[2];
        dx = st * Math.cos(psi); dy = Math.cos(theta); dz = st * Math.sin(psi);
        if (tube) {
          // The jaw→neck junction is *concave*, so it is not star-shaped about
          // the head's centre: rays there either graze the jaw or slip past it
          // into the neck, and two adjacent rings land centimetres apart. That
          // is what produced the ring of hard triangular flaps under the chin.
          // Below `tube.from` the ray origin slides down the neck axis and the
          // direction rotates to purely radial, turning the bottom of the star
          // patch into an ordinary cylindrical loft, which the neck *is*.
          const k = smoothstep(tube.from, tube.to, tw);
          const k2 = smoothstep(tube.to, 1.0, tw);
          ox += (tube.a[0] - center[0]) * k + (tube.b[0] - tube.a[0]) * k2;
          oy += (tube.a[1] - center[1]) * k + (tube.b[1] - tube.a[1]) * k2;
          oz += (tube.a[2] - center[2]) * k + (tube.b[2] - tube.a[2]) * k2;
          const rx = Math.cos(psi), rz = Math.sin(psi);
          dx += (rx - dx) * k; dy += (0 - dy) * k; dz += (rz - dz) * k;
          const l = Math.hypot(dx, dy, dz) || 1;
          dx /= l; dy /= l; dz /= l;
        }
      } else {
        const f = origins[j];
        const psi = phi * Math.PI * 2 + Math.PI;       // seam at the back of the limb
        const sa = Math.sin(f.alpha), ca = Math.cos(f.alpha);
        const cp = Math.cos(psi), sp = Math.sin(psi);
        ox = f.o[0]; oy = f.o[1]; oz = f.o[2];
        dx = sa * (cp * f.N[0] + sp * f.B[0]) + ca * f.T[0];
        dy = sa * (cp * f.N[1] + sp * f.B[1]) + ca * f.T[1];
        dz = sa * (cp * f.N[2] + sp * f.B[2]) + ca * f.T[2];
      }
      // `inflate` is an *outward* offset: the iso-level of a signed distance
      // field is positive outside the surface. (Getting this sign wrong builds
      // a garment shell a few millimetres *inside* the skin, which then shows
      // only as hard-edged scraps wherever the skin happens to be retracted.)
      const tOwn = field.march(ox, oy, oz, dx, dy, dz, { only, level: inflate, tMax });
      const tUni = field.march(ox, oy, oz, dx, dy, dz, { level: inflate, tStart: tOwn, tMax });

      // How much of this direction do we actually own? Sample the blend
      // weights at the provisional surface point first.
      const probe = Math.min(tUni, tOwn + margin);
      field.groupWeights(ox + dx * probe, oy + dy * probe, oz + dz * probe, gw);
      const gi0 = gi, nG = nGroups;
      // Retraction ignores priority: whoever owns the surface owns it. (The
      // torso is top priority but must still keep out of the hands, which hang
      // right beside the hips.) Priority only breaks ties later.
      let wAny = 0;
      for (let g = 0; g < nG; g++) if (g !== gi0 && gw[g] > wAny) wAny = gw[g];
      // 0 while we are winning or level (we must keep covering the fillet),
      // rising to 1 only once another part clearly owns this surface.
      const rel0 = Math.max(0, (wAny - gw[gi0]) / (wAny + gw[gi0] + 1e-6));

      // Where a higher-priority part owns the surface, retract to our *own*
      // volume instead of skimming along theirs. This matters enormously once
      // the rig moves: a shell parked just under a neighbour's skin is invisible
      // in bind pose but flies out as a sheet the moment its bone rotates.
      const mEff = margin * (1 - smoothstep(0.06, 0.42, rel0));
      const lim = tOwn + mEff;
      // Because the smooth union is never inside a member volume, t <= tUni
      // always holds, so a clamped vertex can never pierce a neighbour.
      const t = tUni > lim ? lim : tUni;
      const deficit = tUni - t;

      let px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      field.grad(px, py, pz, gnrm);
      field.groupWeights(px, py, pz, gw);

      // dominance: how much of this point belongs to us vs. a higher-priority
      // part. Only the loser moves, so exactly one shell stays on the surface.
      const wSelf = gw[gi];
      let wHi = 0;
      for (let g = 0; g < nGroups; g++) {
        if (g === gi) continue;
        if (field.prio[field.groups[g]] < prioSelf && gw[g] > wHi) wHi = gw[g];
      }
      const rel = wHi > 0 ? wHi / (wHi + wSelf + 1e-6) : 0;
      // Two sinks. The tie sink is tiny — just enough that two shells sharing
      // the surface never z-fight. The clamp sink dives a shell steeply inward
      // once it has left its own domain, so its triangles cannot chord across
      // a concave fillet (the neck / armpit) and surface through the far side.
      // …but never push a vertex further in than it is deep, or a shell that
      // is already near the middle of a limb would exit through the far side.
      const depth = Math.max(0, -field.eval(px, py, pz));
      const sink = Math.min(
        sinkDepth * smoothstep(0.34, 0.74, rel) + Math.min(0.030, deficit * 1.6),
        depth * 0.7 + 0.0008);
      const det = detail ? detail(px, py, pz) : 0;
      const push = det - sink;
      px += gnrm[0] * push; py += gnrm[1] * push; pz += gnrm[2] * push;

      if (collapse) {
        // Bottom of a star patch: rather than let the shell tear its way out
        // through a neighbour, funnel it inside the body. The radial shrink
        // runs ahead of the vertical one so the last rings tuck *down the
        // neck* as a narrowing tube; pulling straight at a point instead
        // splays them into a ring of triangular flaps over the collarbone.
        const cw = smoothstep(collapse.from, 1.0, star ? warp(j / R, wT[0], wT[1]) : j / R);
        if (cw > 0) {
          const keep = 1 - cw;
          px = collapse.to[0] + (px - collapse.to[0]) * keep;
          pz = collapse.to[2] + (pz - collapse.to[2]) * keep;
          py += (collapse.to[1] - py) * cw * cw;
        }
      }
      pos[vi * 3] = px; pos[vi * 3 + 1] = py; pos[vi * 3 + 2] = pz;
      nor[vi * 3] = gnrm[0]; nor[vi * 3 + 1] = gnrm[1]; nor[vi * 3 + 2] = gnrm[2];
      own[vi] = wSelf;
      // remember which anatomical part this skin belongs to — the skinning
      // solver uses it to keep arm bones off the ribcage
      for (let g = 0; g < nGroups; g++) parts[vi * nGroups + g] = gw[g];
    }
  }

  // pass 2 — UVs in metres, with the u wrap forced to an integer number of
  // texture tiles so the seam is mathematically invisible.
  let circ = 0, rowsCounted = 0;
  for (let j = 1; j < R; j++) {
    let c = 0;
    for (let i = 0; i < segs; i++) {
      const a = (j * (segs + 1) + i) * 3, b = (j * (segs + 1) + i + 1) * 3;
      c += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
    }
    circ += c; rowsCounted++;
  }
  circ = rowsCounted ? circ / rowsCounted : 0.2;
  const U = Math.max(1, Math.round(circ * uvRepeat)) / uvRepeat;

  const vAt = new Float32Array(R + 1);
  vAt[0] = uvOffsetV;
  for (let j = 1; j <= R; j++) {
    let d = 0;
    for (let i = 0; i <= segs; i++) {
      const a = ((j - 1) * (segs + 1) + i) * 3, b = (j * (segs + 1) + i) * 3;
      d += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
    }
    vAt[j] = vAt[j - 1] + d / (segs + 1);
  }
  for (let j = 0; j <= R; j++) {
    for (let i = 0; i <= segs; i++) {
      const vi = j * (segs + 1) + i;
      uv[vi * 2] = (i / segs) * U;
      uv[vi * 2 + 1] = vAt[j];
    }
  }

  // pass 3 — indices, skipping the degenerate rows at poles
  const idx = [];
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      const degTop = (star && j === 0);
      const degBot = (star && j === R - 1);
      if (!degTop) idx.push(a, b, a + 1);
      if (!degBot) idx.push(b, b + 1, a + 1);
    }
  }

  // The winding of a capsule loft flips depending on the handedness of the
  // transported frame, so rather than reasoning about it we measure it: take a
  // mid-patch triangle and compare its geometric normal with the field
  // gradient we already know points outward.
  {
    const mid = Math.floor(idx.length / 6) * 3;
    const a = idx[mid] * 3, b = idx[mid + 1] * 3, c = idx[mid + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nor[a] + ny * nor[a + 1] + nz * nor[a + 2] < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
  }

  return { pos, nor, uv, own, parts, idx: new Uint32Array(idx), segs, rings: R, group };
}

/* ----------------------------------------------------------- assembly ----- */

function mergePatches(patches, field) {
  let nv = 0, ni = 0;
  for (const p of patches) { nv += p.pos.length / 3; ni += p.idx.length; }
  const nG = field.groups.length;
  const parts = new Float32Array(nv * nG);
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const zone = new Float32Array(nv * 4);
  const own = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const p of patches) {
    pos.set(p.pos, vo * 3);
    nor.set(p.nor, vo * 3);
    uv.set(p.uv, vo * 2);
    own.set(p.own, vo);
    if (p.parts) parts.set(p.parts, vo * nG);
    for (let i = 0; i < p.idx.length; i++) idx[io + i] = p.idx[i] + vo;
    vo += p.pos.length / 3; io += p.idx.length;
  }
  const z = [0, 0, 0, 0];
  for (let i = 0; i < nv; i++) {
    zoneWeights(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], z);
    zone[i * 4] = z[0]; zone[i * 4 + 1] = z[1]; zone[i * 4 + 2] = z[2]; zone[i * 4 + 3] = z[3];
  }
  return { pos, nor, uv, zone, own, idx, parts, groups: field.groups };
}

/**
 * Mesh normals from the triangles, then blended back toward the analytic
 * field gradient wherever the patch is not the dominant owner. That blend is
 * the "shared smooth normal pass": overlapping shells shade *identically*, so
 * the transition between them cannot be seen even though the geometry is not
 * literally welded.
 */
function finishNormals(m) {
  const nv = m.pos.length / 3;
  const acc = new Float32Array(nv * 3);
  for (let i = 0; i < m.idx.length; i += 3) {
    const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3;
    const ux = m.pos[b] - m.pos[a], uy = m.pos[b + 1] - m.pos[a + 1], uz = m.pos[b + 2] - m.pos[a + 2];
    const vx = m.pos[c] - m.pos[a], vy = m.pos[c + 1] - m.pos[a + 1], vz = m.pos[c + 2] - m.pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    acc[a] += nx; acc[a + 1] += ny; acc[a + 2] += nz;
    acc[b] += nx; acc[b + 1] += ny; acc[b + 2] += nz;
    acc[c] += nx; acc[c + 1] += ny; acc[c + 2] += nz;
  }
  for (let i = 0; i < nv; i++) {
    const o = i * 3;
    let mx = acc[o], my = acc[o + 1], mz = acc[o + 2];
    const l = Math.hypot(mx, my, mz);
    if (l > 1e-9) { mx /= l; my /= l; mz /= l; } else { mx = m.nor[o]; my = m.nor[o + 1]; mz = m.nor[o + 2]; }
    const t = smoothstep(0.45, 0.85, m.own[i]);      // 0 = trust the field
    let x = m.nor[o] + (mx - m.nor[o]) * t;
    let y = m.nor[o + 1] + (my - m.nor[o + 1]) * t;
    let z = m.nor[o + 2] + (mz - m.nor[o + 2]) * t;
    const ll = Math.hypot(x, y, z) || 1;
    m.nor[o] = x / ll; m.nor[o + 1] = y / ll; m.nor[o + 2] = z / ll;
  }
}

function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('aZone', new THREE.BufferAttribute(m.zone, 4));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  // CPU-side only: never uploaded, used by rig.computeSkinWeights()
  g.userData.parts = m.parts;
  g.userData.partNames = m.groups;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/* --------------------------------------------------------------- build ---- */

const LOD = [
  { head: [56, 40], torso: [28, 22], arm: [16, 14], hand: [18, 14], leg: [18, 16], foot: [20, 14] },
  { head: [76, 54], torso: [34, 28], arm: [20, 18], hand: [26, 20], leg: [22, 20], foot: [28, 18] },
  { head: [96, 68], torso: [44, 38], arm: [24, 24], hand: [34, 26], leg: [28, 28], foot: [34, 22] }
];

/**
 * Where the head's samples get spent. `theta` is measured from the crown, and
 * the face occupies roughly 0.42–0.80 of it; `phi` 0.5 is dead ahead. Together
 * these give the face ~3.5× the vertex density of the back of the skull.
 */
const HEAD_FOCUS = { theta: [0.62, 0.42], phi: [0.5, 0.46] };

/**
 * Build the whole body.
 *
 * The head is a separate geometry from the rest of the body for one reason:
 * expression morph targets. Keeping ~24 morph targets on ~2.5 k head vertices
 * instead of ~11 k body vertices is a 4× saving in morph texture memory for
 * zero visual difference, since nothing below the neck ever morphs.
 */
export function buildAnatomy({ tier = 2, uvRepeat = 7 } = {}) {
  const lod = LOD[Math.max(0, Math.min(2, tier))];
  const prims = bodySpec();
  const field = new BodyField(prims);
  const detail = buildDetail();
  const common = { uvRepeat, detail };

  const headPatch = buildPatch(field, {
    ...common, group: 'head', star: true,
    center: [0, 0.5330, 0.0060],
    segs: lod.head[0], rings: lod.head[1], tMax: 0.20,
    focus: HEAD_FOCUS, sinkDepth: 0.010,
    tube: { from: 0.782, to: 0.935, a: [0, 0.4700, 0.0035], b: [0, 0.4300, 0.0010] },
    collapse: { from: 0.962, to: [0, 0.4180, 0.0010] }
  });

  const bodyPatches = [
    buildPatch(field, {
      ...common, group: 'torso',
      axis: [[0, 0.2520, -0.0020], [0, 0.3050, 0.0060], [0, 0.3620, 0.0060], [0, 0.4300, 0.0010]],
      segs: lod.torso[0], rings: lod.torso[1], capStart: 6, capEnd: 3, tMax: 0.22
    })
  ];
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    bodyPatches.push(buildPatch(field, {
      ...common, group: 'arm' + side,
      axis: [m(A.arm, s), m(A.forearm, s), m(A.hand, s)],
      segs: lod.arm[0], rings: lod.arm[1], capStart: 2, capEnd: 2, tMax: 0.12
    }));
    bodyPatches.push(buildPatch(field, {
      ...common, group: 'hand' + side,
      axis: [m([0.1580, 0.2940, 0.0435], s), m([0.1720, 0.2620, 0.0540], s)],
      segs: lod.hand[0], rings: lod.hand[1], capStart: 4, capEnd: 5, tMax: 0.09
    }));
    bodyPatches.push(buildPatch(field, {
      ...common, group: 'leg' + side,
      axis: [m(A.thigh, s), m(A.shin, s), m(A.foot, s)],
      segs: lod.leg[0], rings: lod.leg[1], capStart: 2, capEnd: 2, tMax: 0.14
    }));
    bodyPatches.push(buildPatch(field, {
      ...common, group: 'foot' + side,
      axis: [m([0.0560, 0.0345, -0.0170], s), m([0.0570, 0.0270, 0.0400], s)],
      segs: lod.foot[0], rings: lod.foot[1], capStart: 5, capEnd: 5, tMax: 0.09
    }));
  }

  const headM = mergePatches([headPatch], field);
  const bodyM = mergePatches(bodyPatches, field);
  finishNormals(headM);
  finishNormals(bodyM);

  const headGeo = toGeometry(headM);
  const bodyGeo = toGeometry(bodyM);
  headGeo.name = 'babyHead';
  bodyGeo.name = 'babyBody';

  const triangles = (headM.idx.length + bodyM.idx.length) / 3;

  return {
    field, detail, prims,
    anchors: A,
    headGeometry: headGeo,
    bodyGeometry: bodyGeo,
    triangles,
    /** Evenly-spread surface points used to stick droplets and foam on. */
    surfaceSamples: sampleSurface(bodyM, headM, 240)
  };
}

function sampleSurface(bodyM, headM, count) {
  const out = [];
  const pick = (m, n) => {
    const nv = m.pos.length / 3;
    const step = Math.max(1, Math.floor(nv / n));
    for (let i = 0; i < nv; i += step) {
      out.push({
        p: [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]],
        n: [m.nor[i * 3], m.nor[i * 3 + 1], m.nor[i * 3 + 2]],
        z: [m.zone[i * 4], m.zone[i * 4 + 1], m.zone[i * 4 + 2], m.zone[i * 4 + 3]],
        own: m.own[i]
      });
    }
  };
  pick(bodyM, Math.round(count * 0.72));
  pick(headM, Math.round(count * 0.28));
  return out.filter(s => s.own > 0.6);
}

export { m as mirror, smoothstep };
