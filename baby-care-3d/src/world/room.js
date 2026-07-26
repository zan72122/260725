/* ============================================================================
 * room.js — the nursery
 * ----------------------------------------------------------------------------
 * A 5.4 × 5.0 × 2.78 m room with three walls; the fourth is open to the camera.
 * Everything is metres, the floor is y = 0, and the baby is 0.62 m tall, so
 * every piece of furniture here is at real nursery scale.
 *
 * Two decisions worth knowing about:
 *
 *  - The architecture receives shadows but never casts them. A sealed box that
 *    casts would black out the whole room, because the key light lives outside
 *    it; the window light is *drawn* instead (window.js), which is both cheaper
 *    and far more controllable than relying on a shadow map.
 *  - Draw calls are spent per material, not per prop. Walls, trim, ceiling and
 *    floor are four calls between them; spindles, books, bunting, toys, leaves,
 *    basket staves and every contact shadow in the room are instanced.
 *
 * Budget check at the bottom of build().
 * ========================================================================== */

import * as THREE from 'three';
import { contactShadow } from '../engine/lighting.js';
import * as P from './props.js';
import { WindowUnit } from './window.js';

/* ------------------------------------------------------------ dimensions -- */

const RW = 5.4;          // width  (x: -2.7 .. 2.7)
const RD = 5.0;          // depth  (z: -2.8 .. 2.2)
const RH = 2.78;         // wall height
const WALL = 0.14;       // wall thickness
const X0 = -RW / 2, X1 = RW / 2;
const Z0 = -2.8, Z1 = Z0 + RD;

const DOOR = { x: 1.78, w: 0.88, h: 2.06 };
const WIN = { z: -0.5, w: 1.46, h: 1.36, sill: 0.96 };

/* --------------------------------------------------------------- profiles -- */

// Skirting: a plain modern ogee. x = projection from the wall, y = height.
const SKIRTING = [
  [0, 0], [0.022, 0], [0.022, 0.062], [0.013, 0.078], [0.017, 0.090],
  [0.009, 0.104], [0.009, 0.116], [0, 0.116]
];
// Picture rail, at 1.98 m — the height that makes a room feel designed.
const RAIL = [
  [0, 0], [0.026, 0.005], [0.026, 0.018], [0.013, 0.032], [0.011, 0.044], [0, 0.044]
];

export class Room {
  constructor({ tier = 2, fx = null } = {}) {
    this.tier = tier;
    this.fx = fx;
    this.group = new THREE.Group();
    this.group.name = 'Room';
    this.time = 0;
    this.mood = 'day';
    this.weather = 'clear';
    this.lampOn = false;
    this._anchors = new Map();
    this._pick = [];
    this._shadowField = new P.ShadowField();
  }

  /* ============================================================== build === */

  build(ctx) {
    this.ctx = ctx;
    this.M = P.palette();

    this._buildArchitecture();
    this._buildWindow(ctx);
    this._buildFurniture();
    this._buildDressing();
    this._buildClutter();
    this._buildLights();
    this._buildAnchors();

    this._trimShadowCasters();

    this.shadows = this._shadowField.build();
    this.group.add(this.shadows);

    this.setWeather('clear');
    this.setCurtains(1);
    this.setLamp(false, true);
    this.setMood('day');
    return this.group;
  }

  /* ----------------------------------------------------- architecture --- */

  _buildArchitecture() {
    const M = this.M;

    /* --- floor ---------------------------------------------------------- */
    const floorGeo = new THREE.PlaneGeometry(RW, RD, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate(0, 0, Z0 + RD / 2);
    const floor = new THREE.Mesh(floorGeo, M.floor);
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.group.add(floor);
    this.floor = floor;

    /* --- walls ----------------------------------------------------------
     * Each wall is an extruded Shape, so the window and the door are real
     * holes with real reveals rather than boxes butted together.            */
    const wallShape = (len, holes) => {
      const s = new THREE.Shape();
      s.moveTo(-len / 2, 0);
      s.lineTo(len / 2, 0);
      s.lineTo(len / 2, RH);
      s.lineTo(-len / 2, RH);
      s.closePath();
      for (const h of holes || []) {
        const p = new THREE.Path();
        p.moveTo(h.a, h.b);
        p.lineTo(h.a + h.w, h.b);
        p.lineTo(h.a + h.w, h.b + h.h);
        p.lineTo(h.a, h.b + h.h);
        p.closePath();
        s.holes.push(p);
      }
      return new THREE.ExtrudeGeometry(s, {
        depth: WALL, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004,
        bevelSegments: 1, steps: 1, curveSegments: 1
      });
    };

    // back wall: extrudes toward -z once pushed back, so the front cap is the
    // room-side face at z = Z0
    const back = wallShape(RW, [{
      a: DOOR.x - DOOR.w / 2 - 0, b: 0.001, w: DOOR.w, h: DOOR.h
    }]);
    back.translate(0, 0, Z0 - WALL);

    // left wall: authored along world z, then yawed so its back cap faces +x
    const left = wallShape(RD, [{
      a: WIN.z - (Z0 + RD / 2) - WIN.w / 2, b: WIN.sill, w: WIN.w, h: WIN.h
    }]);
    left.rotateY(-Math.PI / 2);
    left.translate(X0, 0, Z0 + RD / 2);

    const right = wallShape(RD, []);
    right.rotateY(Math.PI / 2);
    right.translate(X1, 0, Z0 + RD / 2);

    const walls = new THREE.Mesh(P.mergeAll([back, left, right]), M.wall);
    walls.receiveShadow = true;
    walls.castShadow = false;      // see the header note
    walls.name = 'walls';
    this.group.add(walls);
    this.walls = walls;

    /* --- ceiling with a cove and a shallow tray -------------------------- */
    const inset = 0.55;
    const ring = new THREE.Shape();
    ring.moveTo(X0, Z0); ring.lineTo(X1, Z0); ring.lineTo(X1, Z1); ring.lineTo(X0, Z1); ring.closePath();
    const hole = new THREE.Path();
    hole.moveTo(X0 + inset, Z0 + inset);
    hole.lineTo(X1 - inset, Z0 + inset);
    hole.lineTo(X1 - inset, Z1 - inset);
    hole.lineTo(X0 + inset, Z1 - inset);
    hole.closePath();
    ring.holes.push(hole);
    const soffit = new THREE.ShapeGeometry(ring);
    soffit.rotateX(Math.PI / 2);          // face down
    soffit.translate(0, RH, 0);

    const tray = new THREE.PlaneGeometry(RW - inset * 2, RD - inset * 2);
    tray.rotateX(Math.PI / 2);
    tray.translate(0, RH + 0.10, Z0 + RD / 2);

    // cove: a concave sweep from the soffit up into the tray
    const coveShape = new THREE.Shape();
    coveShape.moveTo(0, 0);
    coveShape.lineTo(0, 0.10);
    coveShape.quadraticCurveTo(0.03, 0.03, 0.085, 0);
    coveShape.closePath();
    // each basis is (profile-out, up, run) and is kept right-handed so the
    // extrusion's normals stay outward
    const coveRuns = [
      { len: RW, basis: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], pos: [X1, RH, Z0 + inset] },
      { len: RW, basis: [[0, 0, -1], [0, 1, 0], [1, 0, 0]], pos: [X0, RH, Z1 - inset] },
      { len: RD, basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], pos: [X0 + inset, RH, Z0] },
      { len: RD, basis: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], pos: [X1 - inset, RH, Z1] }
    ];
    const coves = [];
    for (const r of coveRuns) {
      const g = new THREE.ExtrudeGeometry(coveShape, {
        depth: r.len, bevelEnabled: false, steps: 1, curveSegments: 5
      });
      // the profile is authored (x = into the room, y = up) and extruded along
      // its own +z; makeBasis drops each run onto the right edge of the tray
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...r.basis[0]), new THREE.Vector3(...r.basis[1]), new THREE.Vector3(...r.basis[2]));
      m.setPosition(r.pos[0], r.pos[1], r.pos[2]);
      g.applyMatrix4(m);
      coves.push(g);
    }

    const ceiling = new THREE.Mesh(P.mergeAll([soffit, tray, ...coves]), M.ceiling);
    ceiling.receiveShadow = true;
    ceiling.name = 'ceiling';
    this.group.add(ceiling);
    this.ceiling = ceiling;

    /* --- skirting, picture rail, door casing ----------------------------- */
    const trim = [];
    const run = (profile, len, basis, pos) => {
      const g = P.extrudeProfile(profile, len, { bevel: 0.0012, curve: 2 });
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...basis[0]), new THREE.Vector3(...basis[1]), new THREE.Vector3(...basis[2]));
      m.setPosition(pos[0], pos[1], pos[2]);
      g.applyMatrix4(m);
      return g;
    };
    // profile x = projection into the room, y = height, extruded along +z;
    // every basis is right-handed, so the back-wall runs travel -x
    const B_BACK = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];   // faces +z, runs -x
    const B_LEFT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];    // faces +x, runs +z
    const B_RIGHT = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]; // faces -x, runs -z

    // skirting is interrupted by the doorway, so the back wall gets two runs
    const doorL = DOOR.x - DOOR.w / 2, doorR = DOOR.x + DOOR.w / 2;
    trim.push(run(SKIRTING, doorL - X0, B_BACK, [doorL, 0, Z0]));
    trim.push(run(SKIRTING, X1 - doorR, B_BACK, [X1, 0, Z0]));
    trim.push(run(SKIRTING, RD, B_LEFT, [X0, 0, Z0]));
    trim.push(run(SKIRTING, RD, B_RIGHT, [X1, 0, Z1]));
    trim.push(run(RAIL, RW, B_BACK, [X1, 1.98, Z0]));
    trim.push(run(RAIL, RD, B_LEFT, [X0, 1.98, Z0]));
    trim.push(run(RAIL, RD, B_RIGHT, [X1, 1.98, Z1]));

    // door architrave
    const CASE = [[0, 0], [0.024, 0.006], [0.026, 0.030], [0.016, 0.048], [0.014, 0.070], [0, 0.074]];
    const band = 0.074;
    const cm = (len, basis, pos) => {
      const g = P.extrudeProfile(CASE, len, { bevel: 0.0012, curve: 2 });
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...basis[0]), new THREE.Vector3(...basis[1]), new THREE.Vector3(...basis[2]));
      m.setPosition(pos[0], pos[1], pos[2]);
      g.applyMatrix4(m);
      return g;
    };
    // (x = band away from the opening, y = projection into the room, z = run)
    trim.push(cm(DOOR.h + band, [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [doorL, 0, Z0]));
    trim.push(cm(DOOR.h + band, [[1, 0, 0], [0, 0, 1], [0, -1, 0]], [doorR, DOOR.h + band, Z0]));
    trim.push(cm(DOOR.w + band * 2, [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [doorL - band, DOOR.h, Z0]));

    const trimMesh = new THREE.Mesh(P.mergeAll(trim), M.trim);
    trimMesh.receiveShadow = true;
    trimMesh.castShadow = true;
    trimMesh.name = 'trim';
    this.group.add(trimMesh);

    /* --- what you see through the doorway -------------------------------- */
    const hallD = 1.1;
    const hall = [];
    hall.push(P.rbox(DOOR.w + 0.3, DOOR.h + 0.3, 0.04, [DOOR.x, (DOOR.h + 0.3) / 2, Z0 - WALL - hallD], [0, 0, 0], 0.004, 1));
    for (const sx of [-1, 1]) {
      hall.push(P.rbox(0.04, DOOR.h + 0.3, hallD, [DOOR.x + sx * (DOOR.w / 2 + 0.13), (DOOR.h + 0.3) / 2, Z0 - WALL - hallD / 2], [0, 0, 0], 0.004, 1));
    }
    hall.push(P.rbox(DOOR.w + 0.3, 0.04, hallD, [DOOR.x, DOOR.h + 0.28, Z0 - WALL - hallD / 2], [0, 0, 0], 0.004, 1));
    hall.push(P.rbox(DOOR.w + 0.3, 0.02, hallD, [DOOR.x, 0.005, Z0 - WALL - hallD / 2], [0, 0, 0], 0.004, 1));
    const hallMesh = new THREE.Mesh(P.mergeAll(hall), M.dark);
    hallMesh.receiveShadow = true;
    hallMesh.name = 'hall';
    this.group.add(hallMesh);

    const door = P.buildDoorLeaf(M, { w: DOOR.w - 0.02, h: DOOR.h - 0.03 });
    door.position.set(doorL + 0.01, 0.012, Z0 - WALL + 0.01);
    door.rotation.y = 0.62;        // stood open, because a nursery door always is
    this.group.add(door);
    this.door = door;
    this._pick.push(door.children[0]);
  }

  /* ---------------------------------------------------------- window --- */

  _buildWindow(ctx) {
    const unit = new WindowUnit({
      tier: this.tier, palette: this.M, width: WIN.w, height: WIN.h, wall: WALL
    });
    unit.build(ctx);
    unit.group.position.set(X0, WIN.sill + WIN.h / 2, WIN.z);
    unit.group.rotation.y = Math.PI / 2;    // local +z (room side) -> world +x
    this.group.add(unit.group);
    this.window = unit;
  }

  /* -------------------------------------------------------- furniture --- */

  _place(obj, x, y, z, ry = 0) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    this.group.add(obj);
    if (obj.userData.pick) this._pick.push(...obj.userData.pick);
    return obj;
  }

  _buildFurniture() {
    const M = this.M;
    const S = this._shadowField;

    /* --- cot, with the mobile clamped to its far post -------------------- */
    this.crib = this._place(P.buildCrib(M), -1.45, 0, -2.28);
    S.add(-1.45, -2.28, 0.70, 0.40, { opacity: 0.55, softness: 0.75 });
    this.mobile = this._place(P.buildMobile(M), -2.02, 0.78, -2.56, 0.35);

    /* --- changing dresser ------------------------------------------------ */
    this.dresser = this._place(P.buildDresser(M), 0.15, 0, -2.52);
    S.add(0.15, -2.52, 0.56, 0.30, { opacity: 0.55, softness: 0.9 });

    this.nightlight = this._place(P.buildNightlight(M), 0.56, 0.905, -2.40, 0.4);

    /* --- wardrobe -------------------------------------------------------- */
    this.wardrobe = this._place(P.buildWardrobe(M), 2.41, 0, -1.55, -Math.PI / 2);
    S.add(2.41, -1.55, 0.32, 0.56, { opacity: 0.58, softness: 0.95 });

    /* --- shelf (with its books, teddy, rings and lamp) ------------------- */
    this.shelf = this._place(P.buildShelf(M), 0.10, 1.24, -2.66);
    this.lamp = this.shelf.userData.lamp;

    /* --- toy box --------------------------------------------------------- */
    this.toybox = this._place(P.buildToyBox(M), -2.30, 0, 1.05, Math.PI / 2);
    S.add(-2.30, 1.05, 0.26, 0.40, { opacity: 0.5, softness: 0.8 });

    /* --- high chair and play table --------------------------------------- */
    this.highchair = this._place(P.buildHighchair(M), 1.72, 0, -0.35, 2.35);
    S.add(1.72, -0.35, 0.26, 0.26, { opacity: 0.45, softness: 0.55 });

    this.table = this._place(P.buildPlayTable(M), 1.45, 0, 0.78, 0.4);
    S.add(1.45, 0.78, 0.33, 0.33, { opacity: 0.42, softness: 0.6 });
    S.add(1.02, 0.95, 0.16, 0.16, { opacity: 0.35, softness: 0.5 });
    S.add(1.86, 0.60, 0.16, 0.16, { opacity: 0.35, softness: 0.5 });

    /* --- laundry basket, plant, pouffe ----------------------------------- */
    this.basket = this._place(P.buildBasket(M), 1.02, 0, -2.36, 0.5);
    S.add(1.02, -2.36, 0.27, 0.27, { opacity: 0.5, softness: 0.7 });

    this.plant = this._place(P.buildPlant(M), 2.25, 0, 1.42, 0.9);
    S.add(2.25, 1.42, 0.30, 0.30, { opacity: 0.45, softness: 0.6 });

    this.pouffe = this._place(P.buildPouffe(M), -1.62, 0, 0.62, 0.3);
    S.add(-1.62, 0.62, 0.32, 0.32, { opacity: 0.42, softness: 1.1 });

    /* --- rug ------------------------------------------------------------- */
    this.rug = P.buildRug(M, { radius: 1.18 });
    this.rug.position.set(0.05, 0, 0.35);
    this.group.add(this.rug);
    // the rug's own soft occlusion, wider and much fainter than a prop's
    S.add(0.05, 0.35, 1.30, 1.30, { opacity: 0.16, softness: 2.4, y: 0.002 });
  }

  /* --------------------------------------------------------- dressing --- */

  _buildDressing() {
    const M = this.M;
    const wallZ = Z0 + 0.022;

    // pictures over the cot, hung a degree or two off true
    this.pictures = P.buildPictures(M, [
      { x: -0.40, y: 0.06, w: 0.44, h: 0.34, art: 0, tilt: 0.018 },
      { x: 0.10, y: 0.20, w: 0.30, h: 0.38, art: 3, tilt: -0.030 },
      { x: 0.11, y: -0.22, w: 0.34, h: 0.26, art: 2, tilt: 0.012 }
    ]);
    this.pictures.position.set(-1.42, 1.52, wallZ);
    this.group.add(this.pictures);
    this._pick.push(...(this.pictures.userData.pick || []));

    // a fourth picture on the right-hand wall, seen edge-on from the camera
    this.picture2 = P.buildPictures(M, [{ x: 0, y: 0, w: 0.34, h: 0.42, art: 1, tilt: -0.02 }]);
    this.picture2.position.set(X1 - 0.022, 1.60, 0.35);
    this.picture2.rotation.y = -Math.PI / 2;
    this.group.add(this.picture2);

    this.clock = P.buildClock(M, { r: 0.125 });
    this.clock.position.set(1.02, 1.66, wallZ + 0.01);
    this.group.add(this.clock);

    // bunting slung across the back-left corner
    this.bunting = P.buildBunting(M, [X0 + 0.05, 2.32, -1.60], [0.62, 2.14, wallZ + 0.02], {
      n: 12, sag: 0.26
    });
    this.group.add(this.bunting);
  }

  /* ---------------------------------------------------------- clutter --- */

  _buildClutter() {
    // hand-placed so nothing ever lands inside a piece of furniture
    const spots = [
      [-0.62, 0.92], [0.52, 1.18], [-1.22, 0.10], [0.92, 0.62], [-0.28, -0.38],
      [0.38, -0.18], [1.08, 1.42], [-1.58, 1.44], [0.70, -0.92], [-0.86, -1.05]
    ];
    this._clutterRig = P.buildClutter(this.M, spots, { seed: 77 });
    this._clutterRig.group.position.set(0, 0, 0);
    this.group.add(this._clutterRig.group);
    this._pick.push(...this._clutterRig.meshes);

    // one shared blob under the mess, from the engine's own contact shadow
    this._clutterShadow = contactShadow(1.7, 0.0, 2.6);
    this._clutterShadow.position.set(0.0, 0.006, 0.35);
    this.group.add(this._clutterShadow);
  }

  /* ----------------------------------------------------------- lights --- */

  _buildLights() {
    // A soft bounce sitting just inside the window. The global rig owns the
    // key; this only fills the reveal and the wall beside it, which is what
    // makes the opening read as a hole rather than a poster.
    this.windowBounce = new THREE.PointLight(0xdfeeff, 1.6, 4.6, 2);
    this.windowBounce.position.set(X0 + 0.45, WIN.sill + WIN.h * 0.55, WIN.z);
    this.windowBounce.castShadow = false;
    this.group.add(this.windowBounce);

    this.nightGlow = new THREE.PointLight(0xffb877, 0, 1.6, 2);
    this.nightGlow.position.set(0.56, 0.96, -2.40);
    this.group.add(this.nightGlow);

    // the shelf lamp drives the rig's own "practical" so it lights the baby
    const p = this.ctx?.lighting?.practical;
    if (p) {
      this.group.updateMatrixWorld(true);
      this.lamp.getWorldPosition(p.position);
      p.position.y += 0.20;
      p.distance = 3.4;
      p.decay = 2;
    }
  }

  /* ---------------------------------------------------------- anchors --- */

  _buildAnchors() {
    const A = (name, x, y, z, ry = 0) => {
      const o = new THREE.Object3D();
      o.name = 'anchor:' + name;
      o.position.set(x, y, z);
      o.rotation.y = ry;
      this.group.add(o);
      this._anchors.set(name, o);
      return o;
    };
    A('crib', -1.45, 0.52, -2.28);                  // mattress top
    A('tub', -0.92, 0.0, 0.98, 0.25);               // sits in the window light
    A('highchair', 1.72, 0.0, -0.35, 2.35);
    A('playmat', 0.05, 0.02, 0.40);
    A('wardrobe', 2.41, 0.0, -1.55, -Math.PI / 2);
    A('window', X0 + 0.10, WIN.sill + WIN.h / 2, WIN.z, Math.PI / 2);
    A('shelf', 0.10, 1.26, -2.60);
    A('toybox', -2.30, 0.45, 1.05, Math.PI / 2);
    A('rug', 0.05, 0.015, 0.35);
    A('table', 1.45, 0.44, 0.78, 0.4);
  }

  /**
   * Every shadow caster is a second draw call, in a VSM map soft enough that a
   * teddy on a shelf contributes nothing but noise. Anything small, high up or
   * already grounded by a contact blob is dropped from the shadow pass; GTAO
   * in the post stack supplies the small-scale contact darkening instead.
   * This is worth ~30 draw calls a frame.
   */
  _trimShadowCasters() {
    const NO_CAST = new Set([
      'doorKnob', 'mobileArm', 'mobileHub', 'mobileCharms', 'dresserKnobs',
      'changingBolsters', 'nightlightFoot', 'wardrobeHandle', 'wardrobeClothes',
      'books', 'bookPages', 'teddyBody', 'ringBase', 'rings', 'lampBase',
      'lampStem', 'toyboxPull', 'stools', 'basketStaves', 'basketHoops',
      'basketLiner', 'plantSoil', 'plantLeaves', 'pouffeSeams', 'pictureFrames',
      'pictureArt', 'clockCase', 'clockHand', 'cribPiping', 'highchairPad',
      'curtainRings', 'buntingFlags', 'buntingCord', 'snowLedge'
    ]);
    this.group.traverse(o => {
      if ((o.isMesh || o.isPoints) && NO_CAST.has(o.name)) o.castShadow = false;
    });
  }

  /* ================================================================ api === */

  anchor(name) {
    return this._anchors.get(name) || null;
  }

  pickables() {
    // meshes only: a Group in the list is silently ignored by a non-recursive
    // raycast, which is exactly the kind of bug that eats an afternoon
    return [...this._pick, ...(this.window ? this.window.pickables() : []), this.rug, this.floor]
      .filter(o => o && (o.isMesh || o.isPoints));
  }

  /** 'day' | 'golden' | 'evening' | 'night' — room-side dressing only; the
   *  global light rig is the app's business. */
  setMood(name) {
    if (!['day', 'golden', 'evening', 'night'].includes(name)) return;
    this.mood = name;
    this.window?.setMood(name);
    const night = name === 'night';
    const evening = name === 'evening';
    // contact shadows have to soften as the key light does, or props start to
    // look stuck-on at night
    this.shadows?.userData.setGlobal(night ? 0.45 : evening ? 0.78 : 1);
    this._bounceBase = { day: 1.75, golden: 1.55, evening: 0.75, night: 0.30 }[name];
    // nobody leaves a nursery dark: the lamps come on by themselves after dark
    if (!this._lampForced) this.setLamp(night || evening, true);
  }

  setWeather(name) {
    if (!['clear', 'rain', 'snow'].includes(name)) return;
    this.weather = name;
    this.window?.setWeather(name);
    // an overcast sky is a bigger, softer, cooler source: dimmer bounce, but
    // spread wider so the room still reads as daylit
    this._bounceScale = name === 'rain' ? 0.55 : name === 'snow' ? 0.8 : 1;
    this._bounceRange = name === 'clear' ? 4.6 : 5.6;
  }

  /** 0 = curtains drawn across, 1 = pulled fully back. */
  setCurtains(open) {
    this.curtains = THREE.MathUtils.clamp(open, 0, 1);
    this.window?.setCurtains(this.curtains);
  }

  setLamp(on, auto = false) {
    this.lampOn = !!on;
    if (!auto) this._lampForced = true;
    this.lamp?.userData.setOn(this.lampOn);
    this.nightlight?.userData.setOn(this.lampOn);
    this.nightGlow.intensity = this.lampOn ? 0.55 : 0;
    const p = this.ctx?.lighting?.practical;
    if (p) {
      this._practicalBase = this.lampOn ? 3.2 : 0;
      p.intensity = this._practicalBase;
    }
  }

  /**
   * Scatter toys on the floor, or tidy them away.
   *   clutter(true)  — everything out      clutter(false) — everything away
   *   clutter(n)     — exactly n toys out
   */
  clutter(add) {
    const n = this._clutterRig.set(add);
    return n;
  }

  onState(patch = {}) {
    if (patch.weather) this.setWeather(patch.weather);
    if (patch.timeOfDay && ['day', 'golden', 'evening', 'night'].includes(patch.timeOfDay)) {
      this.setMood(patch.timeOfDay);
      // an explicit state change should move the whole rig, not just the room
      this.ctx?.lighting?.transitionTo?.(patch.timeOfDay, 1.4);
    }
    if (patch.mess !== undefined) this.clutter(patch.mess);
    if (patch.curtains !== undefined) this.setCurtains(patch.curtains);
    if (patch.lamp !== undefined) this.setLamp(patch.lamp);
  }

  reset() {
    this._lampForced = false;
    this.clutter(false);
    this.setCurtains(1);
    this.setWeather('clear');
    this.setMood('day');
    this.setLamp(false, true);
    this.window?.setWeather('clear', true);
    this.window?.setMood('day', true);
    this.window?.setCurtains(1, true);
  }

  /* =============================================================== tick === */

  update(dt, ctx) {
    this.time += dt;
    const t = this.time;

    this.window?.update(dt, ctx);

    // mobile: a slow spin with a touch of bob, never a constant rate — the eye
    // reads perfectly linear motion as machinery
    const spin = this.mobile.userData.spin;
    spin.rotation.y = t * 0.30 + Math.sin(t * 0.7) * 0.10;
    spin.position.y = 0.60 + Math.sin(t * 0.85) * 0.006;
    spin.rotation.z = Math.sin(t * 0.6) * 0.02;

    this.bunting.userData.update(t);

    // clock: starts at ten past ten and runs 30× so it is visibly alive
    const mins = 610 + t * 0.5;
    this.clock.userData.minute.rotation.z = -(mins % 60) / 60 * Math.PI * 2;
    this.clock.userData.hour.rotation.z = -((mins % 720) / 720) * Math.PI * 2;

    // toys settling in or being tidied away
    if (this._clutterRig.update(dt)) {
      let v = 0;
      for (const toy of this._clutterRig.toys) v = Math.max(v, toy.v);
      this._clutterShadow.userData.setOpacity(v * 0.20);
    }

    /* --- the window's bounce light tracks the sky it is bouncing --------- */
    const k = 1 - Math.exp(-dt * 2.2);
    const target = (this._bounceBase ?? 1.6) * (this._bounceScale ?? 1)
      * (this.window ? 0.55 + 0.55 * this.window.shaftStrength() : 1);
    this.windowBounce.intensity += (target - this.windowBounce.intensity) * k;
    this.windowBounce.distance += ((this._bounceRange ?? 4.6) - this.windowBounce.distance) * k;
    if (this.window) this.windowBounce.color.lerp(this.window.skyTint(), k * 0.6);

    // a practical lamp that sits at one exact intensity looks like a uniform
    const p = ctx?.lighting?.practical;
    if (p && this._practicalBase) {
      p.intensity = this._practicalBase * (1 + Math.sin(t * 6.3) * 0.012 + Math.sin(t * 11.7) * 0.008);
    }
  }

  dispose() {
    this.window?.dispose();
    this.group.traverse(o => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
      else o.material?.dispose?.();
    });
    this.group.clear();
  }
}
