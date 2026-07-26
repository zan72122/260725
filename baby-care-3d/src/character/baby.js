/* ============================================================================
 * baby.js — the hero character
 * ----------------------------------------------------------------------------
 * Assembles anatomy + rig + face + hair + outfit into the object the rest of
 * the game talks to (see CONTRACTS.md). Also owns the surface state that
 * activities drive: dirt, wetness, foam and attachments.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import { buildAnatomy, PROPORTIONS } from './anatomy.js';
import { Rig, solveTwoBoneIK } from './rig.js';
import { Face, buildFaceMorphs } from './face.js';
import { Animator } from './anim.js';
import { Hair } from './hair.js';
import { Outfit } from './outfit.js';

const ZONES = ['face', 'hands', 'feet', 'body', 'hair'];
const UV_REPEAT = 7;                 // texture tiles per metre of skin

/** Speech-bubble vocabulary. Japanese, aimed at a four-year-old. */
const SAY = {
  hungry:  { text: 'おなか すいた', icon: '🍎', mood: 'sad' },
  full:    { text: 'おなか いっぱい', icon: '😊', mood: 'happy' },
  sleepy:  { text: 'ねむい…', icon: '🌙', mood: 'sleepy' },
  dirty:   { text: 'べたべた…', icon: '🛁', mood: 'sulk' },
  play:    { text: 'あそぼ！', icon: '🎈', mood: 'excited' },
  cold:    { text: 'さむい', icon: '❄️', mood: 'sad' },
  happy:   { text: 'うれしい！', icon: '⭐', mood: 'happy' },
  more:    { text: 'もっと！', icon: '🍼', mood: 'excited' },
  hello:   { text: 'ばあ！', icon: '👋', mood: 'giggle' },
  thanks:  { text: 'ありがと', icon: '💕', mood: 'shy' }
};

export class Baby {
  constructor({ tier = 2, state = null } = {}) {
    this.tier = tier;
    this.state = state;
    this.group = new THREE.Group();
    this.group.name = 'baby';

    this.dirt = { face: 0, hands: 0, feet: 0, body: 0, hair: 0 };
    this.foam = { face: 0, hands: 0, feet: 0, body: 0, hair: 0 };
    this.wet = 0;
    this.mood = 'neutral';
    this.attached = new Map();
    this._ikTargets = { L: null, R: null, footL: null, footR: null };
    this._t = 0;
    this._sayPending = null;
    this._built = false;
  }

  /* ------------------------------------------------------------- build --- */

  async build(ctx) {
    this.ctx = ctx;

    /* -- geometry ---------------------------------------------------------- */
    const anat = buildAnatomy({ tier: this.tier, uvRepeat: UV_REPEAT });
    this.anatomy = anat;
    this.field = anat.field;

    /* -- expression morphs must exist before the mesh is created ----------- */
    buildFaceMorphs(anat.headGeometry);

    /* -- material ---------------------------------------------------------- */
    // poreScale is in tiles-per-UV-unit and our UVs are metres, so this is
    // literally "7 texture tiles per metre of skin" → ~0.75 mm pores.
    this.skinMat = MAT.makeBabySkin({
      color: 0xffd9c4, subsurface: 0xff8a76, translucency: 0.85,
      poreScale: UV_REPEAT, seed: 23
    });

    /* -- rig + skinned meshes ---------------------------------------------- */
    this.rig = new Rig();
    this.group.add(this.rig.root);
    this.bodyMesh = this.rig.bind(anat.bodyGeometry, this.skinMat);
    this.headMesh = this.rig.bind(anat.headGeometry, this.skinMat);
    this.bodyMesh.name = 'babyBody';
    this.headMesh.name = 'babyHead';

    /* -- face -------------------------------------------------------------- */
    this.face = new Face({ tier: this.tier, headGeometry: anat.headGeometry });
    this.face.build();
    this.face.headMesh = this.headMesh;
    this.face.setSkinMaterial(this.skinMat);
    this.face.attach(this.rig.bones.head);
    this.face.setMood('neutral', 0.01);

    /* -- hair -------------------------------------------------------------- */
    this.hair = new Hair({ tier: this.tier, color: 0x8a6242 });
    this.hair.build();
    this.hair.attach(this.rig.bones.head);

    /* -- animation --------------------------------------------------------- */
    this.anim = new Animator(this.rig);
    this.anim.playPose('sit', { seconds: 0.01 });

    /* -- clothing ---------------------------------------------------------- */
    this.outfit = new Outfit({ field: this.field, rig: this.rig, tier: this.tier, uvRepeat: UV_REPEAT });
    this.setOutfit({ diaper: true, top: 'mint', bottom: false, socks: false, shoes: false, hat: false, bib: false });

    /* -- wet / foam instancing --------------------------------------------- */
    this._buildSurfaceFX(anat.surfaceSamples);

    this.rig.root.updateMatrixWorld(true);
    this.triangles = this._countTriangles();
    this._built = true;
    return this;
  }

  _countTriangles() {
    let n = 0;
    this.group.traverse(o => {
      if (o.isMesh && o.geometry?.index) n += o.geometry.index.count / 3;
      else if (o.isMesh && o.geometry?.attributes?.position) n += o.geometry.attributes.position.count / 3;
    });
    return Math.round(n);
  }

  /**
   * Droplets and foam are instanced and anchored to bones, so they ride the
   * skin through every pose without needing a skinned material of their own.
   */
  _buildSurfaceFX(samples) {
    const anchor = (p) => {
      let best = null, bd = Infinity;
      for (const d of this.rig.table) {
        if (!d.sig) continue;
        const dd = Math.hypot(p[0] - d.pos[0], p[1] - d.pos[1], p[2] - d.pos[2]);
        if (dd < bd) { bd = dd; best = d; }
      }
      return {
        bone: this.rig.bones[best.name],
        local: new THREE.Vector3(p[0] - best.pos[0], p[1] - best.pos[1], p[2] - best.pos[2])
      };
    };

    const N_DROPS = this.tier >= 2 ? 44 : 22;
    const dropGeo = new THREE.SphereGeometry(1, 8, 6);
    dropGeo.scale(1, 1.25, 0.55);
    this.drops = new THREE.InstancedMesh(dropGeo, MAT.makeDroplet(), N_DROPS);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.group.add(this.drops);
    this._dropState = [];
    for (let i = 0; i < N_DROPS; i++) {
      const s = samples[(i * 7 + 3) % samples.length];
      this._dropState.push({ ...anchor(s.p), n: s.n, z: s.z, life: -1, r: 0.0022, slide: 0 });
    }

    const N_FOAM = this.tier >= 2 ? 90 : 44;
    const foamGeo = new THREE.SphereGeometry(1, 7, 5);
    this.foamMesh = new THREE.InstancedMesh(foamGeo, MAT.makeFoam(), N_FOAM);
    this.foamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.foamMesh.castShadow = true;
    this.foamMesh.frustumCulled = false;
    this.foamMesh.count = 0;
    this.group.add(this.foamMesh);
    this._foamState = [];
    for (let i = 0; i < N_FOAM; i++) {
      const s = samples[(i * 11 + 5) % samples.length];
      const a = anchor(s.p);
      // push the clump out along the surface normal so it sits *on* the skin
      a.local.addScaledVector(new THREE.Vector3(...s.n), 0.006);
      this._foamState.push({
        ...a, n: s.n, z: s.z,
        r: 0.006 + ((i * 37) % 11) / 11 * 0.008,
        grow: 0, phase: (i * 0.61) % 6.28
      });
    }
    this._m4 = new THREE.Matrix4();
    this._v3 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._sc = new THREE.Vector3();
  }

  /* -------------------------------------------------------------- poses -- */

  playPose(name, opts = {}) {
    this.anim?.playPose(name, opts);
    this.poseName = name;
    if (name === 'sleep') { this.anim.energy = 0.25; this.setMood('asleep'); }
    else if (this.anim) this.anim.energy = 1;
    return this;
  }

  gesture(name) {
    if (!this.anim) return false;
    const ok = this.anim.gesture(name);
    if (ok && name === 'yawn') this.face?.setOverlay('lidLower', 0);
    return ok;
  }

  setMood(name, seconds = 0.45) {
    this.mood = name;
    this.face?.setMood(name, seconds);
    if (name === 'asleep' && this.anim) this.anim.energy = 0.25;
    else if (name === 'sleepy' && this.anim) this.anim.energy = 0.55;
    else if (this.anim) this.anim.energy = name === 'excited' || name === 'giggle' ? 1.35 : 1;
    return this;
  }

  blink() { this.face?.blink(); }

  lookAt(worldPos) { this.face?.lookAt(worldPos); this._lookTarget = worldPos || null; }

  say(kind) {
    const d = SAY[kind] || SAY.happy;
    this._sayPending = { ...d, kind, t: 0 };
    if (d.mood) this.setMood(d.mood);
    const ui = this.ctx?.ui;
    if (ui?.worldLabel) {
      ui.worldLabel(this.rig.sockets.head, d.text, { icon: d.icon, seconds: 2.6 });
    }
    this.gesture(kind === 'hungry' || kind === 'play' ? 'point' : 'wave');
    return d;
  }

  /* ------------------------------------------------------------- state --- */

  setOutfit(desc = {}) {
    this.outfit?.set(desc);
    this.state?.patch?.({ outfit: { ...(this.state.outfit || {}), ...desc } });
    return this;
  }

  setDirt(zone, amount) {
    if (!(zone in this.dirt)) return this;
    this.dirt[zone] = THREE.MathUtils.clamp(amount, 0, 1);
    const u = this.skinMat?.userData?.uniforms;
    if (u) u.uDirt.value.set(this.dirt.face, this.dirt.hands, this.dirt.feet, this.dirt.body);
    if (this.hair) {
      const c = new THREE.Color(this.hair.color).lerp(new THREE.Color(0x5a4530), this.dirt.hair * 0.8);
      this.hair.mat.color.copy(c);
      this.hair.scalpMat.color.copy(c);
    }
    return this;
  }

  setWet(amount) {
    this.wet = THREE.MathUtils.clamp(amount, 0, 1);
    MAT.applyWetness(this.skinMat, this.wet);
    const u = this.skinMat?.userData?.uniforms;
    if (u) u.uWet.value = this.wet;
    this.outfit?.setWet(this.wet);
    this.hair?.setWet(this.wet);
    // spawn / retire droplets to match
    const want = Math.round(this.wet * this._dropState.length);
    let live = 0;
    for (const d of this._dropState) if (d.life >= 0) live++;
    for (const d of this._dropState) {
      if (live < want && d.life < 0) { d.life = 0; d.slide = 0; live++; }
      else if (live > want && d.life >= 0) { d.life = -1; live--; }
    }
    return this;
  }

  setFoam(zone, amount) {
    if (!(zone in this.foam)) return this;
    this.foam[zone] = THREE.MathUtils.clamp(amount, 0, 1);
    return this;
  }

  /* -------------------------------------------------------- attachment --- */

  bone(name) { return this.rig?.bone(name) || null; }

  attach(object3D, boneName = 'leftHand') {
    const target = this.rig?.sockets[boneName] || this.rig?.bone(boneName);
    if (!target || !object3D) return null;
    object3D.updateMatrixWorld();
    target.updateMatrixWorld(true);
    // keep the object where it visually is, then let the bone carry it
    const local = target.worldToLocal(object3D.getWorldPosition(new THREE.Vector3()));
    target.add(object3D);
    object3D.position.copy(local.multiplyScalar(0.25));   // ease it into the hand
    this.attached.set(object3D, target);
    return target;
  }

  detach(object3D) {
    const t = this.attached.get(object3D);
    if (!t) return false;
    const w = object3D.getWorldPosition(new THREE.Vector3());
    const q = object3D.getWorldQuaternion(new THREE.Quaternion());
    t.remove(object3D);
    this.ctx?.scene?.add(object3D);
    object3D.position.copy(w);
    object3D.quaternion.copy(q);
    this.attached.delete(object3D);
    return true;
  }

  /* ----------------------------------------------------------- queries --- */

  focusPoint(out = new THREE.Vector3()) {
    const s = this.rig?.sockets?.chest;
    if (!s) return out.set(0, 0.34, 0).add(this.group.position);
    return s.getWorldPosition(out);
  }
  headWorldPos(out = new THREE.Vector3()) {
    return (this.rig?.sockets?.head || this.group).getWorldPosition(out);
  }
  mouthWorldPos(out = new THREE.Vector3()) {
    return (this.rig?.sockets?.mouth || this.group).getWorldPosition(out);
  }
  handWorldPos(side = 'left', out = new THREE.Vector3()) {
    const k = /^r/i.test(side) ? 'rightHand' : 'leftHand';
    return (this.rig?.sockets?.[k] || this.group).getWorldPosition(out);
  }

  /** Ask the arm to place its hand on a world point (null releases the IK). */
  reachFor(side, worldPos) {
    this._ikTargets[/^r/i.test(side) ? 'R' : 'L'] = worldPos ? worldPos.clone() : null;
  }
  /** Plant a foot (used by bath/crawl activities). */
  plantFoot(side, worldPos) {
    this._ikTargets[/^r/i.test(side) ? 'footR' : 'footL'] = worldPos ? worldPos.clone() : null;
  }

  /* ------------------------------------------------------------ update --- */

  update(dt, ctx) {
    if (!this._built) return;
    this._t += dt;

    this.anim.update(dt, ctx);
    this._solveIK();
    this.rig.root.updateMatrixWorld(true);

    // gestures feed additive expression overlays into the face
    for (const k in this.face.controls) this.face.setOverlay(k, this.anim.faceOverlay[k] || 0);
    // cheek jiggle rides on the puff control so soft tissue lags the head
    this.face.setOverlay('cheekPuff',
      (this.anim.faceOverlay.cheekPuff || 0) + Math.abs(this.anim.cheekJiggle || 0) * 0.35);

    this.face.update(dt, ctx);
    this.hair.update(dt, ctx);
    this._updateSurfaceFX(dt);

    if (this._sayPending) {
      this._sayPending.t += dt;
      if (this._sayPending.t > 2.8) this._sayPending = null;
    }
  }

  _solveIK() {
    const R = this.rig;
    for (const side of ['L', 'R']) {
      const t = this._ikTargets[side];
      if (!t) continue;
      // pole out to the side and behind, which is where an infant elbow lives
      const pole = R.bones['arm' + side].getWorldPosition(new THREE.Vector3());
      pole.x += (side === 'L' ? 0.22 : -0.22);
      pole.z -= 0.18;
      // Callers mean "put the *palm* here", so aim the wrist at the target
      // minus the palm socket's current offset from it.
      const sock = R.sockets[side === 'L' ? 'leftHand' : 'rightHand'];
      sock.updateWorldMatrix(true, false);
      const wrist = R.bones['hand' + side].getWorldPosition(new THREE.Vector3());
      const off = sock.getWorldPosition(new THREE.Vector3()).sub(wrist);
      solveTwoBoneIK(R.bones['arm' + side], R.bones['forearm' + side],
        R.bones['hand' + side], t.clone().sub(off), pole, 1);
    }
    for (const side of ['L', 'R']) {
      const t = this._ikTargets['foot' + side];
      if (!t) continue;
      const pole = R.bones['thigh' + side].getWorldPosition(new THREE.Vector3());
      pole.z += 0.25;
      solveTwoBoneIK(R.bones['thigh' + side], R.bones['shin' + side], R.bones['foot' + side], t, pole, 1);
    }
    R.update();
  }

  _updateSurfaceFX(dt) {
    const m = this._m4, v = this._v3, q = this._q, s = this._sc;

    /* droplets: slide down the skin, shrink, then vanish ------------------- */
    let n = 0;
    for (const d of this._dropState) {
      if (d.life < 0) continue;
      d.life += dt;
      d.slide = Math.min(1, d.slide + dt * (0.04 + d.life * 0.02));
      d.bone.updateWorldMatrix(true, false);
      v.copy(d.local);
      v.y -= d.slide * 0.030;
      v.applyMatrix4(d.bone.matrixWorld);
      const grow = Math.min(1, d.life * 3) * (1 - d.slide * 0.4);
      q.identity();
      s.setScalar(d.r * grow * (1 + Math.sin(this._t * 6 + d.slide * 9) * 0.06));
      m.compose(v, q, s);
      this.drops.setMatrixAt(n++, m);
      if (d.slide >= 1) { d.slide = 0; d.life = 0.01; }   // recycle to the top
    }
    this.drops.count = n;
    if (n) this.drops.instanceMatrix.needsUpdate = true;
    this.drops.visible = n > 0;

    /* foam clumps: grow into place, wobble a little ------------------------ */
    let f = 0;
    for (const st of this._foamState) {
      const zone = Math.max(
        this.foam.face * st.z[0], this.foam.hands * st.z[1],
        this.foam.feet * st.z[2], this.foam.body * st.z[3]);
      st.grow += (zone - st.grow) * Math.min(1, dt * 3.5);
      if (st.grow < 0.02) continue;
      st.bone.updateWorldMatrix(true, false);
      v.copy(st.local).applyMatrix4(st.bone.matrixWorld);
      q.identity();
      const wob = 1 + Math.sin(this._t * 2.2 + st.phase) * 0.08;
      s.setScalar(st.r * st.grow * wob);
      m.compose(v, q, s);
      this.foamMesh.setMatrixAt(f++, m);
    }
    this.foamMesh.count = f;
    if (f) this.foamMesh.instanceMatrix.needsUpdate = true;
    this.foamMesh.visible = f > 0;
  }

  /* -------------------------------------------------------------- misc --- */

  onState(patch = {}) {
    if (patch.outfit) this.setOutfit(patch.outfit);
    if (patch.dirt) for (const z of ZONES) if (z in patch.dirt) this.setDirt(z, patch.dirt[z]);
    if (typeof patch.wet === 'number') this.setWet(patch.wet);
    if (patch.mood) this.setMood(patch.mood);
    if (patch.pose) this.playPose(patch.pose);
  }

  reset() {
    for (const z of ZONES) this.setDirt(z, 0);
    for (const z of ZONES) this.setFoam(z, 0);
    this.setWet(0);
    this.setMood('neutral', 0.01);
    this.anim?.clearGestures();
    this.playPose('sit', { seconds: 0.01 });
    this.lookAt(null);
    this._ikTargets = { L: null, R: null, footL: null, footR: null };
    for (const [obj] of this.attached) this.detach(obj);
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.hair?.setWind(new THREE.Vector3(0, 0, 0), 0);
    return this;
  }

  /** Hair reacts to the dryer / an open window; strength 0 stops it. */
  setWind(dir, strength) { this.hair?.setWind(dir, strength); }

  get height() { return PROPORTIONS.height; }

  dispose() {
    this.face?.dispose();
    this.hair?.dispose();
    this.outfit?.dispose();
    this.bodyMesh?.geometry.dispose();
    this.headMesh?.geometry.dispose();
    this.skinMat?.dispose();
    this.drops?.geometry.dispose();
    this.foamMesh?.geometry.dispose();
  }
}

export default Baby;
