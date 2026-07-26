/* ============================================================================
 * fx/water.js — bath water: heightfield ripple sim, refractive surface,
 *               projected caustics, tap stream and the steam veil
 * ----------------------------------------------------------------------------
 * The whole point of this file is that the water is *simulated*, not animated.
 *
 *   1. A real explicit wave equation runs on a modest grid (96×66 on tier 2)
 *      with Neumann walls, so a hand entering the water throws a ring that
 *      travels, reflects off the tub and interferes with itself.
 *   2. That heightfield drives the vertex positions AND the vertex normals of
 *      the surface mesh, so refraction, specular and the scrolling detail
 *      normals from `makeWater()` all ride the same waves.
 *   3. Refraction is genuine: MeshPhysicalMaterial transmission with ior 1.333
 *      samples the scene's transmission buffer through the *rippled* normal,
 *      which is what makes submerged legs bend at the waterline.
 *   4. Caustics are projected as light, not painted as a decal: a SpotLight
 *      parked exactly at the water surface, pointing down, carrying an
 *      animated caustic texture as its `map`. Everything below the surface —
 *      tub floor, tub walls, the baby's submerged skin, floating toys — picks
 *      them up for free, and nothing above the surface does.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import * as TEX from '../engine/textures.js';

const _v = new THREE.Vector3();

/* ------------------------------------------------------------- helpers --- */

/** Deterministic little RNG so screenshots are byte-stable between runs. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * A tube whose centreline can be re-pathed every frame without reallocating.
 * Used for the falling tap stream and for the shower hose. Frames are carried
 * along the curve by parallel transport, which is what stops the tube from
 * twisting when the path swings around.
 */
export class DynamicTube {
  constructor(rings, radial, radiusFn, material) {
    this.rings = rings;
    this.radial = radial;
    this.radiusFn = radiusFn;

    const vCount = (rings + 1) * (radial + 1);
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const idx = [];
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    for (let i = 0; i <= rings; i++) {
      for (let j = 0; j <= radial; j++) {
        const k = (i * (radial + 1) + j) * 2;
        uv[k] = j / radial;
        uv[k + 1] = i / rings;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);

    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;

    this._tan = new THREE.Vector3();
    this._nrm = new THREE.Vector3(0, 1, 0);
    this._bin = new THREE.Vector3();
    this._prevT = new THREE.Vector3(0, -1, 0);
    this._pts = [];
    for (let i = 0; i <= rings; i++) this._pts.push(new THREE.Vector3());
  }

  /** `pathFn(t)` writes the centreline point for t in 0..1 into `out`. */
  update(pathFn) {
    const { rings, radial } = this;
    const pts = this._pts;
    for (let i = 0; i <= rings; i++) pathFn(i / rings, pts[i]);

    const pos = this.geometry.attributes.position.array;
    const nor = this.geometry.attributes.normal.array;

    // seed the frame from a vector that is unlikely to be parallel to the path
    let nx = 1, ny = 0, nz = 0;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(rings, i + 1)];
      this._tan.subVectors(b, a);
      if (this._tan.lengthSq() < 1e-12) this._tan.set(0, -1, 0);
      this._tan.normalize();

      // parallel transport: strip the tangential part off the carried normal
      const d = nx * this._tan.x + ny * this._tan.y + nz * this._tan.z;
      nx -= this._tan.x * d; ny -= this._tan.y * d; nz -= this._tan.z * d;
      let len = Math.hypot(nx, ny, nz);
      if (len < 1e-5) {
        // degenerate — rebuild from an arbitrary perpendicular
        this._nrm.set(0, 1, 0);
        if (Math.abs(this._tan.y) > 0.9) this._nrm.set(1, 0, 0);
        this._bin.crossVectors(this._tan, this._nrm).normalize();
        nx = this._bin.x; ny = this._bin.y; nz = this._bin.z;
        len = 1;
      }
      nx /= len; ny /= len; nz /= len;

      this._nrm.set(nx, ny, nz);
      this._bin.crossVectors(this._tan, this._nrm);

      const r = this.radiusFn(t);
      const c = pts[i];
      for (let j = 0; j <= radial; j++) {
        const ang = (j / radial) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const ox = this._nrm.x * ca + this._bin.x * sa;
        const oy = this._nrm.y * ca + this._bin.y * sa;
        const oz = this._nrm.z * ca + this._bin.z * sa;
        const k = (i * (radial + 1) + j) * 3;
        pos[k] = c.x + ox * r;
        pos[k + 1] = c.y + oy * r;
        pos[k + 2] = c.z + oz * r;
        nor[k] = ox; nor[k + 1] = oy; nor[k + 2] = oz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}

/* ------------------------------------------------------- water surface --- */

const TIER_GRID = [48, 72, 96];

export class WaterSurface {
  /**
   * @param {object} ctx  the shared game context (needs `tier`, `scene`)
   * @param {object} opt
   *   parent   THREE.Object3D  — the tub group; everything lives in its space
   *   halfX/halfZ              — inner ellipse semi-axes at the rim (metres)
   *   bowlY(e)                 — inner surface height for normalised radius e
   *   minY / maxY              — surface height at level 0 and level 1
   */
  constructor(ctx, {
    parent, halfX = 0.40, halfZ = 0.27, bowlY,
    minY = 0.04, maxY = 0.22, tint = 0xc4e8f4
  }) {
    this.ctx = ctx;
    this.tier = ctx?.tier ?? 2;
    this.parent = parent;
    this.halfX = halfX;
    this.halfZ = halfZ;
    this.bowlY = bowlY || (() => 0);
    this.minY = minY;
    this.maxY = maxY;

    this.level = 0;
    this.levelTarget = 0;
    this.baseY = minY;
    this.time = 0;
    this.temperature = 0.5;

    /* --- grid ---------------------------------------------------------- */
    const long = TIER_GRID[Math.max(0, Math.min(2, this.tier))];
    const spanX = halfX * 2.04, spanZ = halfZ * 2.04;
    this.nx = long;
    this.nz = Math.max(24, Math.round(long * (spanZ / spanX)));
    this.dx = spanX / (this.nx - 1);
    this.dz = spanZ / (this.nz - 1);

    const n = this.nx * this.nz;
    this.cur = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.lift = new Float32Array(n);
    this.floor = new Float32Array(n);
    this.eRad = new Float32Array(n);
    this.solid = new Uint8Array(n);

    /* --- wave constants ------------------------------------------------ */
    // c = sqrt(g·h) for ~15 cm of water ≈ 1.2 m/s. Slightly under-cranked so
    // the CFL condition holds with a comfortable margin on the coarse grids.
    this.waveSpeed = 1.05;
    this.damping = 1.15;                 // per second
    this.maxSub = this.tier >= 2 ? 4 : (this.tier === 1 ? 3 : 2);
    const inv = 1 / (this.dx * this.dx) + 1 / (this.dz * this.dz);
    this.kMax = 0.9 / inv;               // stability ceiling for k = (c·dt)²
    this._acc = 0;

    this._buildGeometry();
    this._buildMaterial(tint);

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'bath-water';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;     // shadows on a refractive sheet read as dirt
    this.mesh.renderOrder = 4;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);

    this._buildCaustics();
    this._writeSurface();
  }

  /* ------------------------------------------------------------ build --- */

  _buildGeometry() {
    const { nx, nz, halfX, halfZ } = this;
    const spanX = halfX * 2.04, spanZ = halfZ * 2.04;
    const n = nx * nz;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const aFloor = new Float32Array(n);

    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const i = z * nx + x;
        const px = -spanX * 0.5 + x * this.dx;
        const pz = -spanZ * 0.5 + z * this.dz;
        const e = Math.sqrt((px / halfX) * (px / halfX) + (pz / halfZ) * (pz / halfZ));
        this.eRad[i] = e;
        this.solid[i] = e >= 0.985 ? 1 : 0;
        // Beyond the rim the "floor" is pushed sky-high so those vertices are
        // always discarded — that is what trims the sheet to the tub's mouth.
        const f = e <= 1 ? this.bowlY(e) : this.bowlY(1) + (e - 1) * 3.0;
        this.floor[i] = f;
        aFloor[i] = f;
        pos[i * 3] = px;
        pos[i * 3 + 1] = this.minY;
        pos[i * 3 + 2] = pz;
        nor[i * 3 + 1] = 1;
        uv[i * 2] = (px / halfX) * 0.5 + 0.5;
        uv[i * 2 + 1] = (pz / halfZ) * 0.5 + 0.5;
      }
    }

    const idx = [];
    for (let z = 0; z < nz - 1; z++) {
      for (let x = 0; x < nx - 1; x++) {
        const a = z * nx + x, b = a + 1, c = a + nx, d = c + 1;
        // keep the quad if any corner can possibly hold water
        if (this.eRad[a] > 1.02 && this.eRad[b] > 1.02 &&
            this.eRad[c] > 1.02 && this.eRad[d] > 1.02) continue;
        idx.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aFloor', new THREE.BufferAttribute(aFloor, 1));
    geo.setIndex(idx.length > 65000 ? new THREE.Uint32BufferAttribute(idx, 1)
                                   : new THREE.Uint16BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, this.maxY * 0.5, 0),
      Math.hypot(halfX, halfZ) + 0.3);
    this.geometry = geo;
  }

  _buildMaterial(tint) {
    const tier = this.tier;
    const mat = MAT.makeWater({ tint, opacity: tier === 0 ? 0.9 : 0.66 });
    this._tick = mat.userData.tick;

    mat.transmission = tier >= 2 ? 1.0 : (tier === 1 ? 0.8 : 0.0);
    mat.thickness = 0.16;
    mat.roughness = 0.04;
    mat.ior = 1.333;
    mat.attenuationDistance = 0.45;
    mat.envMapIntensity = tier >= 1 ? 1.9 : 1.2;
    mat.clearcoat = 1.0;
    mat.clearcoatRoughness = 0.02;
    mat.depthWrite = true;
    mat.side = THREE.FrontSide;
    mat.normalScale.set(0.20, 0.20);

    const u = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.55, 0.75, 0.36) },
      uSunColor: { value: new THREE.Color(0xfff0d8) },
      // Beer–Lambert coefficients per metre, exaggerated for a stylised read:
      // red dies first, which is exactly what makes deep water read as teal.
      uAbsorb: { value: new THREE.Vector3(7.2, 2.4, 1.35) },
      uAbsorbAmt: { value: 1.0 },
      uDeep: { value: new THREE.Color(0x0d5f74) },
      uGlint: { value: tier >= 1 ? 1.0 : 0.35 },
      uRim: { value: new THREE.Color(0xe8f6ff) },
      uFoam: { value: 0.0 }
    };
    this.uniforms = u;

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          attribute float aFloor;
          varying float vWDepth;
          varying vec3  vLocalPos;
        `)
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          vWDepth  = position.y - aFloor;
          vLocalPos = position;
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          varying float vWDepth;
          varying vec3  vLocalPos;
          uniform float uTime, uAbsorbAmt, uGlint, uFoam;
          uniform vec3  uSunDir, uAbsorb;
          uniform vec3  uSunColor, uDeep, uRim;
        `)
        // Trim the sheet exactly where it meets the bowl. Doing it on the
        // interpolated depth means the waterline follows the ripples, so the
        // contact line breathes instead of sitting as a dead ellipse.
        .replace('#include <clipping_planes_fragment>', /* glsl */`
          #include <clipping_planes_fragment>
          if ( vWDepth < 0.0016 ) discard;
        `)
        .replace('#include <opaque_fragment>', /* glsl */`
          #include <opaque_fragment>
          {
            float d = max( vWDepth, 0.0 );

            // --- depth absorption: deeper water is darker and more saturated
            vec3 absorb = exp( - d * uAbsorb * uAbsorbAmt );
            gl_FragColor.rgb *= absorb;
            gl_FragColor.rgb += uDeep * ( 1.0 - absorb.b ) * 0.30;
            gl_FragColor.a = clamp( gl_FragColor.a + ( 1.0 - absorb.g ) * 0.55, 0.0, 1.0 );

            // --- meniscus: the water climbs the bowl in a thin bright lip,
            //     with a soft suds rim just inside it
            float lip  = smoothstep( 0.016, 0.0,   d );
            float rim  = smoothstep( 0.045, 0.012, d );
            gl_FragColor.rgb += uRim * lip * 0.50;
            gl_FragColor.rgb += vec3( 1.0 ) * rim * ( 0.10 + uFoam * 0.35 );
            gl_FragColor.a = clamp( gl_FragColor.a + lip * 0.7 + rim * 0.25 * ( 1.0 + uFoam ), 0.0, 1.0 );

            // --- specular glints riding the ripples
            vec3 N = normalize( normal );
            vec3 V = normalize( vViewPosition );
            vec3 L = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
            vec3 H = normalize( L + V );
            float spec = pow( max( dot( N, H ), 0.0 ), 420.0 );
            float twinkle = 0.55 + 0.45 * sin( uTime * 6.5
                          + vLocalPos.x * 130.0 + vLocalPos.z * 97.0 );
            gl_FragColor.rgb += uSunColor * spec * 7.0 * twinkle * uGlint;
          }
        `);
    };
    mat.customProgramCacheKey = () => 'bath-water-v1';
    this.material = mat;
  }

  _buildCaustics() {
    if (this.tier < 1) { this.caustic = null; return; }
    const size = this.tier >= 2 ? 96 : 64;
    this.caustic = TEX.causticField({ size, seed: 5, cells: this.tier >= 2 ? 3.2 : 2.6 });
    this._causticHz = this.tier >= 2 ? 15 : 10;
    this._causticAcc = 0;
    this._causticT = 0;

    // The projector sits *at* the surface looking straight down: everything
    // under the water is inside the cone, everything above it is behind the
    // light. That single placement is what gates the effect correctly.
    const spot = new THREE.SpotLight(0xdff4ff, 0, 0.62, 1.06, 0.65, 0.55);
    spot.castShadow = false;
    spot.map = this.caustic.texture;
    spot.shadow.mapSize.set(64, 64);
    spot.shadow.camera.near = 0.015;
    spot.shadow.camera.far = 0.9;
    spot.shadow.focus = 1;
    spot.target.position.set(0, -1, 0);
    this.parent.add(spot, spot.target);
    this.causticLight = spot;
  }

  /* ------------------------------------------------------ interaction --- */

  /** Drop a gaussian dent/bump into the surface. Local (tub-space) metres. */
  disturb(x, z, radius = 0.05, amp = 0.006) {
    const { nx, nz, dx, dz, halfX, halfZ } = this;
    const cx = (x + halfX * 1.02) / dx;
    const cz = (z + halfZ * 1.02) / dz;
    const r = Math.max(1, radius / Math.min(dx, dz));
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(nx - 2, Math.ceil(cx + r));
    const z0 = Math.max(1, Math.floor(cz - r)), z1 = Math.min(nz - 2, Math.ceil(cz + r));
    const inv = 1 / (r * r);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const i = gz * nx + gx;
        if (this.solid[i]) continue;
        const ddx = gx - cx, ddz = gz - cz;
        const q = (ddx * ddx + ddz * ddz) * inv;
        if (q > 1) continue;
        const w = Math.cos(Math.sqrt(q) * Math.PI) * 0.5 + 0.5;
        this.cur[i] += amp * w;
      }
    }
  }

  /** Continuous stirring: injects velocity rather than displacement. */
  stir(x, z, radius, vel) {
    const { nx, nz, dx, dz, halfX, halfZ } = this;
    const cx = (x + halfX * 1.02) / dx;
    const cz = (z + halfZ * 1.02) / dz;
    const r = Math.max(1, radius / Math.min(dx, dz));
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(nx - 2, Math.ceil(cx + r));
    const z0 = Math.max(1, Math.floor(cz - r)), z1 = Math.min(nz - 2, Math.ceil(cz + r));
    const inv = 1 / (r * r);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const i = gz * nx + gx;
        if (this.solid[i]) continue;
        const ddx = gx - cx, ddz = gz - cz;
        const q = (ddx * ddx + ddz * ddz) * inv;
        if (q > 1) continue;
        const w = Math.cos(Math.sqrt(q) * Math.PI) * 0.5 + 0.5;
        this.prev[i] -= vel * w;
      }
    }
  }

  /** Bilinear ripple height (world Y) at a tub-local x/z. */
  heightAt(x, z) {
    const { nx, nz, dx, dz, halfX, halfZ } = this;
    let fx = (x + halfX * 1.02) / dx;
    let fz = (z + halfZ * 1.02) / dz;
    fx = Math.max(0, Math.min(nx - 1.001, fx));
    fz = Math.max(0, Math.min(nz - 1.001, fz));
    const x0 = fx | 0, z0 = fz | 0;
    const tx = fx - x0, tz = fz - z0;
    const i = z0 * nx + x0;
    const h = (this.cur[i] * (1 - tx) + this.cur[i + 1] * tx) * (1 - tz)
            + (this.cur[i + nx] * (1 - tx) + this.cur[i + nx + 1] * tx) * tz;
    return this.baseY + h;
  }

  /** Surface gradient — used to tilt floating toys with the swell. */
  slopeAt(x, z, out = new THREE.Vector2()) {
    const e = Math.max(this.dx, this.dz) * 1.5;
    out.set(
      (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e)
    );
    return out;
  }

  /** True if a tub-local point is inside the wetted area. */
  isWet(x, z) {
    const e = Math.sqrt((x / this.halfX) ** 2 + (z / this.halfZ) ** 2);
    if (e >= 0.99) return false;
    return this.baseY - this.bowlY(e) > 0.004;
  }

  get surfaceY() { return this.baseY; }
  get depth() { return Math.max(0, this.baseY - this.bowlY(0)); }

  setLevel(v, snap = false) {
    this.levelTarget = THREE.MathUtils.clamp(v, 0, 1);
    if (snap) {
      this.level = this.levelTarget;
      this.baseY = THREE.MathUtils.lerp(this.minY, this.maxY, this.level);
      this._recomputeLift();
    }
  }

  setTemperature(t) {
    this.temperature = THREE.MathUtils.clamp(t, 0, 1);
    // hot water reads warmer and slightly milkier, cold reads glassy blue
    const c = new THREE.Color().setHSL(
      THREE.MathUtils.lerp(0.545, 0.495, this.temperature),
      THREE.MathUtils.lerp(0.62, 0.40, this.temperature),
      THREE.MathUtils.lerp(0.66, 0.78, this.temperature));
    this.material.color.copy(c);
    this.material.attenuationColor.copy(c);
    this.uniforms.uDeep.value.setHSL(
      THREE.MathUtils.lerp(0.535, 0.50, this.temperature), 0.72, 0.20);
  }

  setFoamRim(v) { this.uniforms.uFoam.value = THREE.MathUtils.clamp(v, 0, 1); }

  /* ------------------------------------------------------------- step --- */

  update(dt, ctx) {
    this.time += dt;

    // ease the level so filling reads as a rising tide, not a step
    if (this.level !== this.levelTarget) {
      const d = this.levelTarget - this.level;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 0.22);
      this.level += step;
      this.baseY = THREE.MathUtils.lerp(this.minY, this.maxY, this.level);
      this._recomputeLift();
    }

    this._simulate(dt);
    this._writeSurface();

    this.uniforms.uTime.value = this.time;
    this._tick?.(this.time);

    // keep the glint pinned to the actual key light so the water and the room
    // share one sun
    const key = ctx?.lighting?.key;
    if (key) {
      _v.copy(key.position);
      if (key.target) _v.sub(key.target.position);
      if (_v.lengthSq() > 1e-6) this.uniforms.uSunDir.value.copy(_v.normalize());
      this.uniforms.uSunColor.value.copy(key.color).multiplyScalar(
        Math.min(1.2, 0.35 + key.intensity * 0.22));
    }

    this._updateCaustics(dt);
  }

  _simulate(dt) {
    const step = Math.min(dt, 1 / 20);
    const nsub = this.maxSub;
    const sdt = step / nsub;
    const k = Math.min(this.waveSpeed * this.waveSpeed * sdt * sdt, this.kMax);
    const damp = Math.max(0, 1 - this.damping * sdt);
    const ix2 = 1 / (this.dx * this.dx);
    const iz2 = 1 / (this.dz * this.dz);
    const { nx, nz, solid } = this;

    for (let s = 0; s < nsub; s++) {
      const cur = this.cur, prev = this.prev;
      for (let z = 1; z < nz - 1; z++) {
        const row = z * nx;
        for (let x = 1; x < nx - 1; x++) {
          const i = row + x;
          if (solid[i]) { prev[i] = 0; continue; }
          const hc = cur[i];
          // Neumann walls: a solid neighbour mirrors the centre, so waves
          // bounce off the tub upright instead of flipping.
          const hl = solid[i - 1] ? hc : cur[i - 1];
          const hr = solid[i + 1] ? hc : cur[i + 1];
          const hd = solid[i - nx] ? hc : cur[i - nx];
          const hu = solid[i + nx] ? hc : cur[i + nx];
          const lap = (hl + hr - 2 * hc) * ix2 + (hd + hu - 2 * hc) * iz2;
          let nv = (2 * hc - prev[i] + k * lap) * damp;
          if (nv > 0.026) nv = 0.026; else if (nv < -0.026) nv = -0.026;
          prev[i] = nv;
        }
      }
      const t = this.cur; this.cur = this.prev; this.prev = t;
    }
  }

  _recomputeLift() {
    // Surface tension pulls the water up the wall. Baking a real geometric lip
    // (rather than only shading one) means the refraction bends there too.
    const n = this.nx * this.nz;
    for (let i = 0; i < n; i++) {
      const d = this.baseY - this.floor[i];
      this.lift[i] = d > 0 ? 0.0022 * Math.exp(-d / 0.010) : 0;
    }
  }

  _writeSurface() {
    const { nx, nz, dx, dz } = this;
    const pos = this.geometry.attributes.position.array;
    const nor = this.geometry.attributes.normal.array;
    const cur = this.cur, lift = this.lift, base = this.baseY;

    for (let i = 0, n = nx * nz; i < n; i++) {
      pos[i * 3 + 1] = base + cur[i] + lift[i];
    }

    const inv2dx = 1 / (2 * dx), inv2dz = 1 / (2 * dz);
    for (let z = 0; z < nz; z++) {
      const row = z * nx;
      const zm = z > 0 ? -nx : 0, zp = z < nz - 1 ? nx : 0;
      for (let x = 0; x < nx; x++) {
        const i = row + x;
        const xm = x > 0 ? -1 : 0, xp = x < nx - 1 ? 1 : 0;
        const gx = (pos[(i + xm) * 3 + 1] - pos[(i + xp) * 3 + 1]) * inv2dx;
        const gz = (pos[(i + zm) * 3 + 1] - pos[(i + zp) * 3 + 1]) * inv2dz;
        const len = Math.sqrt(gx * gx + 1 + gz * gz);
        nor[i * 3] = gx / len;
        nor[i * 3 + 1] = 1 / len;
        nor[i * 3 + 2] = gz / len;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }

  _updateCaustics(dt) {
    if (!this.caustic) return;
    const depth = this.depth;
    const on = this.level > 0.02 && depth > 0.01;
    this.causticLight.visible = on;
    if (!on) { this.causticLight.intensity = 0; return; }

    this.causticLight.position.set(0, this.baseY + 0.05, 0);
    this.causticLight.target.position.set(0, this.baseY - depth - 0.4, 0);
    this.causticLight.target.updateMatrixWorld();
    this.causticLight.distance = depth + 0.22;
    // caustics sharpen as the water settles and fade out in shallow water
    this.causticLight.intensity = 3.4 * Math.min(1, depth / 0.09);

    this._causticAcc += dt;
    const period = 1 / this._causticHz;
    if (this._causticAcc >= period) {
      this._causticT += this._causticAcc * 1.15;
      this._causticAcc = 0;
      this.caustic.update(this._causticT, 1);
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    if (this.causticLight) {
      this.causticLight.target.removeFromParent();
      this.causticLight.removeFromParent();
      this.causticLight.dispose?.();
      this.causticLight.shadow?.dispose?.();
    }
    this.caustic?.dispose();
    this.caustic = null;
  }
}

/* --------------------------------------------------------- waterline ----- */

/**
 * The band where a body breaks the surface. A hard mesh intersection there is
 * the single most obvious "this is a polygon in a polygon" tell, so we ring
 * every submerged limb with a soft annulus: a dark wet band inside, a bright
 * meniscus lip on the contact line, and a foam scum ring just outside it.
 */
export class WaterlineRing {
  constructor(radius = 0.13) {
    const geo = new THREE.RingGeometry(0.18, 1.0, 48, 1);
    geo.rotateX(-Math.PI / 2);
    this.geometry = geo;
    this.uniforms = {
      uOpacity: { value: 0 },
      uFoam: { value: 0.35 },
      uTime: { value: 0 },
      uWet: { value: new THREE.Color(0x3a2a2c) },
      uRim: { value: new THREE.Color(0xf2fbff) }
    };
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec2 vP;
        void main() {
          vP = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vP;
        uniform float uOpacity, uFoam, uTime;
        uniform vec3 uWet, uRim;
        void main() {
          float r = length( vP );
          float a = atan( vP.y, vP.x );
          // wobble the ring so it never reads as a perfect circle
          float w = 1.0 + 0.06 * sin( a * 7.0 + uTime * 2.1 )
                        + 0.04 * sin( a * 11.0 - uTime * 1.3 );
          r /= w;
          // r runs 0.18 (the hole the limb occupies) out to 1.0
          float wet  = smoothstep( 0.62, 0.30, r );             // damp shadow band
          float lip  = smoothstep( 0.13, 0.0, abs( r - 0.58 ) );// the meniscus itself
          float foam = smoothstep( 1.00, 0.60, r ) * smoothstep( 0.55, 0.74, r );
          vec3 col = uWet * wet * 0.9 + uRim * lip * 0.9 + vec3( 1.0 ) * foam * uFoam;
          float alpha = ( wet * 0.42 + lip * 0.75 + foam * uFoam * 0.85 ) * uOpacity;
          if ( alpha < 0.004 ) discard;
          gl_FragColor = vec4( col, alpha );
        }`
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.scale.setScalar(radius);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  set(worldPos, radius, opacity, foam, time) {
    this.mesh.position.copy(worldPos);
    this.mesh.scale.setScalar(radius);
    this.uniforms.uOpacity.value = opacity;
    this.uniforms.uFoam.value = foam;
    this.uniforms.uTime.value = time;
    this.mesh.visible = opacity > 0.01;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* -------------------------------------------------------- tap stream ----- */

/**
 * A real falling column of water plus the splash-back crown where it lands.
 * The column is a `DynamicTube` re-pathed every frame, so as the tub fills the
 * stream visibly shortens.
 */
export class TapStream {
  constructor(parent, { from = new THREE.Vector3(), tier = 2 } = {}) {
    this.from = from.clone();
    this.to = from.clone();
    this.flow = 0;
    this.time = 0;

    this.uniforms = {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uColor: { value: new THREE.Color(0xd8f0ff) }
    };
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vUv = uv;
          vN = normalize( normalMatrix * normal );
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        uniform float uTime, uFlow; uniform vec3 uColor;
        float h( float x ) { return fract( sin( x * 91.7 ) * 43758.5453 ); }
        void main() {
          if ( uFlow < 0.02 ) discard;
          // streaks running down the column at speed
          float y = vUv.y * 9.0 - uTime * 5.2;
          float s = 0.55
                  + 0.45 * sin( y * 6.0 + vUv.x * 24.0 )
                  + 0.30 * sin( y * 13.0 - vUv.x * 11.0 );
          s = clamp( s * 0.6, 0.0, 1.0 );
          float fres = pow( 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) ), 1.6 );
          // the column thins and breaks up toward the bottom
          float breakUp = smoothstep( 0.15, 0.95, vUv.y );
          float a = ( 0.28 + fres * 0.62 ) * ( 0.55 + s * 0.6 );
          a *= mix( 1.0, 0.55 + 0.45 * s, breakUp );
          a *= uFlow;
          vec3 col = uColor * ( 0.75 + s * 0.9 + fres * 1.5 );
          gl_FragColor = vec4( col, clamp( a, 0.0, 1.0 ) );
        }`
    });

    const rings = tier >= 2 ? 22 : 14;
    this.tube = new DynamicTube(rings, tier >= 2 ? 12 : 8,
      (t) => 0.0125 * (1 - t * 0.42) * (0.85 + 0.15 * Math.sin(t * 21)),
      this.material);
    this.tube.mesh.renderOrder = 5;
    parent.add(this.tube.mesh);

    /* --- splash crown at the impact point ----------------------------- */
    const sGeo = new THREE.RingGeometry(0.25, 1.0, 32, 1);
    sGeo.rotateX(-Math.PI / 2);
    this.splashGeo = sGeo;
    this.splashUniforms = {
      uOpacity: { value: 0 }, uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xeaf8ff) }
    };
    this.splashMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: this.splashUniforms,
      vertexShader: /* glsl */`
        varying vec2 vP;
        void main() { vP = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */`
        varying vec2 vP; uniform float uOpacity, uTime; uniform vec3 uColor;
        void main() {
          float r = length( vP );
          float a = atan( vP.y, vP.x );
          float petal = 0.72 + 0.28 * sin( a * 9.0 + uTime * 9.0 );
          float ring = smoothstep( 0.30, 0.62, r ) * smoothstep( 1.0, 0.66, r );
          float alpha = ring * petal * uOpacity;
          if ( alpha < 0.005 ) discard;
          gl_FragColor = vec4( uColor * ( 0.8 + petal * 0.8 ), alpha );
        }`
    });
    this.splash = new THREE.Mesh(sGeo, this.splashMat);
    this.splash.renderOrder = 6;
    this.splash.visible = false;
    parent.add(this.splash);
  }

  setPath(from, to) { this.from.copy(from); this.to.copy(to); }
  setFlow(v) { this.flow = THREE.MathUtils.clamp(v, 0, 1); }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uFlow.value = this.flow;
    const on = this.flow > 0.02;
    this.tube.mesh.visible = on;
    this.splash.visible = on;
    if (!on) return;

    const from = this.from, to = this.to;
    const drop = Math.max(0.001, from.y - to.y);
    this.tube.update((t, out) => {
      // free fall: the horizontal throw is linear, the descent accelerates,
      // and a lazy wobble keeps the column from looking extruded
      const y = from.y - drop * (t * t * 0.72 + t * 0.28);
      const k = t * t * 0.72 + t * 0.28;
      out.set(
        THREE.MathUtils.lerp(from.x, to.x, k) + Math.sin(this.time * 5.4 + t * 5) * 0.0018,
        y,
        THREE.MathUtils.lerp(from.z, to.z, k) + Math.cos(this.time * 4.7 + t * 6) * 0.0018);
    });

    const s = 0.055 + Math.sin(this.time * 13) * 0.006;
    this.splash.position.copy(to).setY(to.y + 0.003);
    this.splash.scale.setScalar(s * (0.7 + this.flow * 0.6));
    this.splashUniforms.uOpacity.value = this.flow * 0.85;
    this.splashUniforms.uTime.value = this.time;
  }

  dispose() {
    this.tube.mesh.removeFromParent();
    this.tube.dispose();
    this.material.dispose();
    this.splash.removeFromParent();
    this.splashGeo.dispose();
    this.splashMat.dispose();
  }
}

/* ------------------------------------------------------------- steam ----- */

/**
 * A soft additive slab of vapour hanging over the water. Deliberately weak per
 * sprite and heavily biased to the bottom of frame: steam that actually reads
 * as heat has to *not* flatten the image behind it.
 */
export class SteamVeil {
  constructor(ctx, { parent, count = 7, radiusX = 0.34, radiusZ = 0.24 } = {}) {
    this.tier = ctx?.tier ?? 2;
    this.count = this.tier >= 2 ? count : (this.tier === 1 ? Math.max(3, count - 2) : 0);
    this.radiusX = radiusX;
    this.radiusZ = radiusZ;
    this.amount = 0;
    this.time = 0;
    this.baseY = 0;
    this.puffs = [];
    this.group = new THREE.Group();
    this.group.name = 'steam-veil';
    parent.add(this.group);
    if (!this.count) { this.texture = null; return; }

    this.texture = TEX.radialSprite({ size: 128, power: 2.6, inner: 1 });
    const rand = rng(4211);
    for (let i = 0; i < this.count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.texture,
        color: new THREE.Color(0xfff3ea),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      });
      const sp = new THREE.Sprite(mat);
      sp.renderOrder = 8;
      this.group.add(sp);
      this.puffs.push({
        sp, mat,
        t: rand(),
        speed: 0.14 + rand() * 0.13,
        ax: (rand() * 2 - 1),
        az: (rand() * 2 - 1),
        scale: 0.24 + rand() * 0.22,
        spin: (rand() * 2 - 1) * 0.6,
        drift: (rand() * 2 - 1) * 0.08
      });
    }
  }

  setAmount(v) { this.amount = THREE.MathUtils.clamp(v, 0, 1); }
  setBase(y) { this.baseY = y; }

  update(dt) {
    this.time += dt;
    for (const p of this.puffs) {
      p.t += dt * p.speed * (0.5 + this.amount);
      if (p.t >= 1) p.t -= 1;
      const life = p.t;
      const rise = life * 0.34;
      p.sp.position.set(
        p.ax * this.radiusX * (0.55 + life * 0.55) + Math.sin(this.time * 0.7 + p.drift * 9) * 0.03,
        this.baseY + 0.015 + rise,
        p.az * this.radiusZ * (0.55 + life * 0.55));
      const s = p.scale * (0.55 + life * 1.5);
      p.sp.scale.set(s, s * 0.82, 1);
      p.sp.material.rotation = p.spin * life * 2.2;
      // Fade in fast, out slow. This used to peak at 0.115 × amount, which
      // after AgX and the vignette was indistinguishable from nothing — the
      // "steam" shot had a fully-driven veil in it and rendered no steam at
      // all. Still a whisper, but now a visible one.
      const fade = Math.sin(Math.min(1, life) * Math.PI);
      p.mat.opacity = fade * 0.28 * this.amount;
    }
    this.group.visible = this.amount > 0.01;
  }

  dispose() {
    for (const p of this.puffs) p.mat.dispose();
    this.puffs.length = 0;
    this.group.removeFromParent();
  }
}
