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

    this.group.add(this._shadowField.build());
    this.shadows = this.group.children[this.group.children.length - 1];

    this.setMood('day');
    this.setWeather('clear');
    this.setCurtains(1);
    this.setLamp(false);
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
    // profile x = projection into the room, y = height, extruded along +z
    const B_BACK = [[0, 0, 1], [0, 1, 0], [1, 0, 0]];    // faces +z, runs +x
    const B_LEFT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];    // faces +x, runs +z
    const B_RIGHT = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]; // faces -x, runs -z

    // skirting is interrupted by the doorway, so the back wall gets two runs
    const doorL = DOOR.x - DOOR.w / 2, doorR = DOOR.x + DOOR.w / 2;
    trim.push(run(SKIRTING, doorL - X0, B_BACK, [X0, 0, Z0]));
    trim.push(run(SKIRTING, X1 - doorR, B_BACK, [doorR, 0, Z0]));
    trim.push(run(SKIRTING, RD, B_LEFT, [X0, 0, Z0]));
    trim.push(run(SKIRTING, RD, B_RIGHT, [X1, 0, Z1]));
    trim.push(run(RAIL, RW, B_BACK, [X0, 1.98, Z0]));
    trim.push(run(RAIL, RD, B_LEFT, [X0, 1.98, Z0]));
    trim.push(run(RAIL, RD, B_RIGHT, [X1, 1.98, Z1]));

    // door architrave
    const CASE = [[0, 0], [0.024, 0.006], [0.026, 0.030], [0.016, 0.048], [0.014, 0.070], [0, 0.074]];
    const band = 0.074;
    const caseBasis = (xa, ya, za) => [xa, ya, za];
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
