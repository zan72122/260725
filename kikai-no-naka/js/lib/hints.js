/**
 * hints.js — 「ここをさわってね」を言葉なしで伝える
 *
 * 4歳児は説明文を読まない。だから案内はすべて 3D の中に置く。
 *   - まわすところには、軸まわりのぐるっとした矢印
 *   - 押すところには、上から降りてくる矢印と広がる輪
 *   - 引くところには、往復する両矢印
 *   - つかんで止めるところには、脈打つ輪
 * さわった瞬間に消え、しばらく放っておくとまた出てくる。
 *
 * 部品の名前は、さわったときだけ、ひらがなの吹き出しで出す。
 */

import * as THREE from 'three';
import { labelTexture } from './textures.js';
import { TAU, clamp01, damp, ease, smoothstep } from './math.js';

/* ------------------------------------------------------------------ */
/* 案内マーク用のマテリアル                                            */
/* ------------------------------------------------------------------ */

const CUE_VERT = /* glsl */ `
varying vec2 vUvC;
varying vec3 vPosC;
void main() {
  vUvC = uv;
  vPosC = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CUE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uFlow;
varying vec2 vUvC;

void main() {
  // 進行方向へ流れる光の帯
  float f = fract(vUvC.x * 1.0 - uTime * uFlow);
  float band = smoothstep(0.42, 0.0, abs(f - 0.5)) * 0.85 + 0.35;
  float edge = smoothstep(0.0, 0.35, vUvC.y) * smoothstep(1.0, 0.65, vUvC.y);
  float a = uOpacity * band * (0.55 + edge * 0.45);
  gl_FragColor = vec4(uColor * (1.0 + band * 0.7), a);
}
`;

function cueMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uFlow: { value: 0.55 },
    },
    vertexShader: CUE_VERT,
    fragmentShader: CUE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
}

/* 広がる輪（タップ／ホールドの合図） */
const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUvC;

float ringAt(float d, float t) {
  float r = mix(0.20, 0.98, t);
  float w = mix(0.16, 0.05, t);
  return smoothstep(w, 0.0, abs(d - r)) * (1.0 - t);
}

void main() {
  float d = length(vUvC - 0.5) * 2.0;
  float t = fract(uTime * 0.7);
  float a = ringAt(d, t) + ringAt(d, fract(t + 0.5)) * 0.7;
  a += smoothstep(0.22, 0.0, d) * 0.55;
  a *= uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.25, a);
}
`;

function ringMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: CUE_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/* ------------------------------------------------------------------ */
/* 個々の案内マーク                                                    */
/* ------------------------------------------------------------------ */

class Cue {
  /**
   * @param {'spin'|'push'|'pull'|'hold'} kind
   * @param {object} o
   */
  constructor(kind, o = {}) {
    this.kind = kind;
    this.object = new THREE.Group();
    this.object.renderOrder = 900;
    this.opacity = 0;
    this.targetOpacity = 0;
    this.materials = [];
    const color = o.color ?? 0xffd34e;
    const size = o.size ?? 0.02;

    if (kind === 'spin') {
      const mat = cueMaterial(color);
      mat.uniforms.uFlow.value = o.reverse ? -0.6 : 0.6;
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(size, size * 0.14, 8, 40, TAU * 0.76),
        mat,
      );
      arc.rotation.z = -TAU * 0.06;
      this.object.add(arc);
      this.materials.push(mat);

      const headMat = flatMaterial(color);
      const head = new THREE.Mesh(new THREE.ConeGeometry(size * 0.28, size * 0.5, 12), headMat);
      const a = TAU * 0.76 - TAU * 0.06;
      head.position.set(Math.cos(a) * size, Math.sin(a) * size, 0);
      head.rotation.z = a - Math.PI / 2 + Math.PI;
      this.object.add(head);
      this.materials.push(headMat);
    } else if (kind === 'push' || kind === 'pull') {
      const mat = flatMaterial(color);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.10, size * 0.10, size * 1.1, 10),
        mat,
      );
      this.object.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(size * 0.3, size * 0.52, 12), mat);
      head.position.y = -size * 0.78;
      head.rotation.z = Math.PI;
      this.object.add(head);
      if (kind === 'pull') {
        const head2 = new THREE.Mesh(new THREE.ConeGeometry(size * 0.3, size * 0.52, 12), mat);
        head2.position.y = size * 0.78;
        this.object.add(head2);
      }
      this.materials.push(mat);
      this._bob = kind === 'push' ? -1 : 1;
    } else {
      const mat = ringMaterial(color);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(size * 3.2, size * 3.2), mat);
      this.object.add(plane);
      this.materials.push(mat);
      this._billboard = plane;
    }
  }

  setOpacity(v) {
    this.opacity = v;
    for (const m of this.materials) {
      if (m.uniforms) m.uniforms.uOpacity.value = v;
      else {
        m.opacity = v * 0.9;
        m.visible = v > 0.01;
      }
    }
    this.object.visible = v > 0.01;
  }

  update(dt, time, camera) {
    this.opacity = damp(this.opacity, this.targetOpacity, 7, dt);
    this.setOpacity(this.opacity);
    for (const m of this.materials) if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
    if (this._billboard) this._billboard.quaternion.copy(camera.quaternion);
    if (this._bob !== undefined) {
      this.object.children.forEach((c) => {
        c.position.y = (c.userData.baseY ?? (c.userData.baseY = c.position.y)) + Math.sin(time * 3.2) * 0.0025 * this._bob;
      });
    }
  }

  dispose() {
    this.object.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.object.removeFromParent();
  }
}

function flatMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

/* ------------------------------------------------------------------ */
/* 吹き出しラベル                                                      */
/* ------------------------------------------------------------------ */

class Bubble {
  constructor() {
    this.material = new THREE.SpriteMaterial({
      map: null,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      opacity: 0,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 1000;
    this.sprite.visible = false;
    this.sprite.center.set(0.5, 0.06);
    this.life = 0;
    this.duration = 1.9;
    this.height = 0.052;
  }

  show(text, worldPos, { duration = 1.9, height = 0.052 } = {}) {
    const tex = labelTexture(text);
    this.material.map = tex;
    this.material.needsUpdate = true;
    this.height = height;
    const aspect = tex.userData.aspect || 3;
    this.sprite.scale.set(height * aspect, height, 1);
    this.sprite.position.copy(worldPos);
    this.life = duration;
    this.duration = duration;
    this.sprite.visible = true;
    this._t = 0;
  }

  hide() {
    this.life = Math.min(this.life, 0.22);
  }

  update(dt) {
    if (!this.sprite.visible) return;
    this.life -= dt;
    this._t += dt;
    const fadeIn = smoothstep(0, 0.16, this._t);
    const fadeOut = clamp01(this.life / 0.22);
    this.material.opacity = fadeIn * fadeOut;
    // 出るときに少しはずむ
    const pop = 1 + ease.outBack(clamp01(this._t / 0.28)) * 0 + (1 - ease.outElastic(clamp01(this._t / 0.5))) * -0.14;
    const aspect = this.material.map?.userData.aspect || 3;
    this.sprite.scale.set(this.height * aspect * pop, this.height * pop, 1);
    if (this.life <= 0) this.sprite.visible = false;
  }

  dispose() {
    this.material.dispose();
    this.sprite.removeFromParent();
  }
}

/* ------------------------------------------------------------------ */
/* まとめ役                                                            */
/* ------------------------------------------------------------------ */

export class Hints {
  /**
   * @param {THREE.Object3D} parent 機械と一緒に動く親（pivot）
   * @param {THREE.Camera} camera
   */
  constructor(parent, camera) {
    this.parent = parent;
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'hints';
    parent.add(this.root);

    /** @type {Map<string, {cue: Cue, anchor: THREE.Object3D, offset: THREE.Vector3, shown: boolean}>} */
    this.cues = new Map();
    this.bubbles = [new Bubble(), new Bubble(), new Bubble()];
    for (const b of this.bubbles) this.root.add(b.sprite);
    this._bubbleIndex = 0;
    this.time = 0;
    this._v = new THREE.Vector3();
  }

  /**
   * 案内マークを追加する。
   * @param {string} id
   * @param {object} o
   * @param {'spin'|'push'|'pull'|'hold'} o.kind
   * @param {THREE.Object3D} o.anchor 追従させる部品
   * @param {number[]} [o.offset] anchor からのローカルオフセット
   * @param {THREE.Vector3} [o.axis] spin のときの回転軸（anchor のローカル）
   */
  add(id, o) {
    const cue = new Cue(o.kind, { color: o.color, size: o.size, reverse: o.reverse });
    this.root.add(cue.object);
    const entry = {
      cue,
      anchor: o.anchor,
      offset: new THREE.Vector3(...(o.offset || [0, 0, 0])),
      axis: o.axis ? o.axis.clone().normalize() : new THREE.Vector3(0, 0, 1),
      axisWorld: !!o.axisWorld,
      done: false,
      delay: o.delay ?? 0,
    };
    this.cues.set(id, entry);
    return entry;
  }

  /** そのハンドルがさわられたので、案内を引っ込める */
  markTouched(id) {
    const e = this.cues.get(id);
    if (e) {
      e.done = true;
      e.cue.targetOpacity = 0;
    }
  }

  /** 全部の案内を出す／隠す */
  setVisible(on) {
    for (const e of this.cues.values()) {
      e.cue.targetOpacity = on && !e.done ? 1 : 0;
    }
  }

  /** しばらく放置されたら、まだ触られていない案内を出し直す */
  reoffer() {
    for (const e of this.cues.values()) {
      e.done = false;
      e.cue.targetOpacity = 1;
    }
  }

  /** 部品の名前を吹き出しで出す */
  say(text, worldPos, opts) {
    const b = this.bubbles[this._bubbleIndex];
    this._bubbleIndex = (this._bubbleIndex + 1) % this.bubbles.length;
    b.show(text, worldPos, opts);
    return b;
  }

  hideBubbles() {
    for (const b of this.bubbles) b.hide();
  }

  update(dt) {
    this.time += dt;
    const q = new THREE.Quaternion();
    for (const e of this.cues.values()) {
      const { cue, anchor } = e;
      if (anchor) {
        anchor.getWorldPosition(this._v);
        this.root.worldToLocal(this._v);
        // オフセットは anchor の向きに合わせる
        const off = e.offset.clone();
        anchor.getWorldQuaternion(q);
        off.applyQuaternion(q);
        cue.object.position.copy(this._v).add(off);
        if (cue.kind === 'spin') {
          // 軸の向きに円弧を合わせる
          const axisWorld = e.axis.clone();
          if (!e.axisWorld) axisWorld.applyQuaternion(q);
          cue.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisWorld.normalize());
        } else if (cue.kind === 'push' || cue.kind === 'pull') {
          const axisWorld = e.axis.clone();
          if (!e.axisWorld) axisWorld.applyQuaternion(q);
          cue.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisWorld.normalize());
        }
      }
      cue.update(dt, this.time, this.camera);
    }
    for (const b of this.bubbles) b.update(dt);
  }

  clear() {
    for (const e of this.cues.values()) e.cue.dispose();
    this.cues.clear();
    for (const b of this.bubbles) b.hide();
  }

  dispose() {
    this.clear();
    for (const b of this.bubbles) b.dispose();
    this.root.removeFromParent();
  }
}
