# Module contracts — read before touching anything

This project is built by several people working in parallel. These interfaces
are **fixed**. If you need a change, add to them; never rename or remove.

## Ground rules

- ES modules only. `import * as THREE from 'three'` (import map in `index.html`
  maps `three` → `vendor/three/three.module.js` and `three/addons/` →
  `vendor/three/addons/`).
- No binary assets. Textures come from `src/engine/textures.js`, materials from
  `src/engine/materials.js`. If you need a new surface, add a generator there.
- Three.js r180 API: `outputColorSpace`, `colorSpace`, `SRGBColorSpace`.
  Do **not** use `outputEncoding` / `sRGBEncoding` / `Geometry`.
- Every mesh that should receive the key light sets `castShadow` and
  `receiveShadow` appropriately. Shadow type is VSM.
- Units are metres. The baby is ~0.62 m tall standing; floor is y = 0.
- Target: 60 fps on tier 2, 30 fps on tier 0. Keep draw calls under ~180.
- Japanese UI copy, aimed at a 4-year-old. No fail states, no timers.

## `ctx` — passed to everything

```js
ctx = {
  app, scene, camera, cameraRig, renderer, pipeline, lighting,
  physics, fx, audio, ui, state, room, baby, tier
}
```

## `src/engine/camera.js`

```js
export class CameraRig {
  constructor(camera, pipeline)
  goTo(presetNameOrObject, seconds = 1.2)   // eased dolly
  nudge(dx, dy)                              // small parallax offset
  shake(strength, seconds)
  get focusRange()                           // DOF range for the active preset
  update(dt)
  addPreset(name, { space, pos:[x,y,z], target:[x,y,z], fov, focusRange })

  // --- subject-relative framing ---
  setDefaultSubject(object3D)   // app.js: the baby root, at boot
  setSubject(object3D, { yaw })  // an activity claims the rig; null = default
  overridePreset(name, def)      // scoped: dropped by restorePresets()
  restorePresets()               // app.js calls this between activities
  resolved()                     // { pos, target } in world space, right now
}
```
Built-in presets: `wide`, `closeup`, `face`, `crib`, `crib-face`, `tub`,
`table`, `floor`, `overhead`, `title`.

**Presets are offsets, not world positions.** A preset with `space: 'subject'`
(every character framing) stores `pos`/`target` as offsets in the subject's
own frame — position plus *yaw only*, so a subject that pitches or rolls can
never tip the horizon — and they are re-resolved every frame. `+X` is the
subject's left, `+Y` is up from its origin (a baby root sits on the floor),
`+Z` is the direction it faces. `space: 'world'` presets stay absolute and are
used for framings that compose the *set* rather than the character (`wide`,
`title`). `addPreset` defaults to `'world'`, so handing over an anchor's world
position still does what it always did.

An activity that lives away from the origin does not need to re-author
anything: `setSubject()` is enough. It should only `overridePreset()` when the
*composition* genuinely differs — a standing baby instead of a seated one
(`dress`), or a baby lying inside a cot whose rails would occlude the default
angle (`sleep`). `app.setActivity` calls `restorePresets()` + `setSubject(null)`
between scenes, so overrides never leak into the next activity.

## `src/engine/physics.js`

Small, dependency-free rigid-body + verlet solver. Enough for balls, blocks,
cloth and hair — no external engine.

```js
export class PhysicsWorld {
  step(dt)
  addBody(mesh, { shape:'sphere'|'box', radius, size, mass, restitution, friction })
  removeBody(handle)
  addPlane(normal, constant, { restitution, friction })
  addCloth(mesh, opts)     // verlet grid pinned by opts.pins
  addRope(points, opts)
  raycast(origin, dir, maxDist)
  setGravity(v3)
}
```
Bodies expose `{ position, velocity, quaternion, angularVelocity, asleep }`
and are integrated into the mesh transform each `step`.

## `src/engine/fx.js`

```js
export class FX {
  constructor(scene, tier)
  burst(kind, worldPos, count, opts)   // 'confetti'|'sparkle'|'bubble'|'steam'|
                                       // 'splash'|'crumb'|'heart'|'zzz'|'dust'|'star'
  emitter(kind, opts)                  // returns { position, rate, stop(), }
  ribbon(from, to, opts)               // trailing arc, used for pours & swipes
  decal(kind, mesh, uv, opts)          // stains, dirt, foam patches
  clear()
  update(dt)
}
```

## `src/engine/audio.js`

```js
export class Audio {
  unlock()                       // call on first user gesture
  play(name, { rate, gain, pan } = {})
  loop(name, opts)               // returns { stop(), gain(v) }
  bgm(name, { fade })
  setMuted(v)
}
```
All sounds are WebAudio-synthesised. No files.

## `src/world/room.js`

```js
export class Room {
  constructor({ tier, fx })
  group                           // THREE.Group added to the scene
  build(ctx)
  update(dt, ctx)
  reset()
  onState(patch)
  setMood(name)                   // 'day'|'golden'|'evening'|'night'
  setWeather(name)                // 'clear'|'rain'|'snow'
  setCurtains(open)               // 0..1
  setLamp(on)
  anchor(name)                    // THREE.Object3D for prop placement:
                                  // 'crib','tub','highchair','playmat','wardrobe',
                                  // 'window','shelf','toybox','rug','table'
  clutter(add)                    // scatter/clean toys on the floor
  pickables()                     // meshes the raycaster should test
}
```

## `src/character/baby.js`

```js
export class Baby {
  constructor({ tier, state })
  group
  async build(ctx)
  update(dt, ctx)
  reset()
  focusPoint()                    // THREE.Vector3, chest height — used by DOF & lights

  // --- pose / animation ---
  playPose(name, { seconds, loop })   // 'sit','lie','crawl','stand','held','bathe','sleep'
  lookAt(worldPosOrNull)              // eye + head tracking; null = idle wander
  setMood(name)                       // 'neutral','happy','giggle','sad','cry','sleepy',
                                      // 'asleep','surprised','sulk','shy','excited','yum'
  blink()
  gesture(name)                       // 'wave','clap','point','reach','rub-eyes','yawn',
                                      // 'kick','suck','burp','shiver','hiccup'
  say(kind)                           // speech-bubble request, e.g. 'hungry'

  // --- state on the body ---
  setOutfit({ top, bottom, socks, shoes, hat, bib, diaper })
  setDirt(zone, amount)               // 'face','hands','feet','body','hair'
  setWet(amount)                      // 0..1 — drives roughness + drip
  setFoam(zone, amount)
  attach(object3D, boneName)          // 'leftHand','rightHand','mouth','head','back','lap'
  detach(object3D)
  bone(name)                          // THREE.Object3D
  headWorldPos() / mouthWorldPos() / handWorldPos(side)
}
```

## `src/ui/ui.js`

```js
export class UI {
  constructor({ app })
  async init()
  update(dt)
  setActivity(name)
  onPointer(p)
  toast(text, { icon, seconds })
  prompt(text, { icon })              // the gentle "what to do next" hint
  hidePrompt()
  meter(name, value)                  // 'food','clean','happy','energy'
  star(n)
  sticker(id)
  worldLabel(object3D, text, opts)    // floating label anchored to a mesh
  setHud(visible)
}
```

## `src/game/state.js`

```js
export class State {
  meters = { food, clean, happy, energy }   // 0..1
  outfit, dirt, wet, stars, stickers, weather, timeOfDay
  patch(obj)
  reset()
  save() / load()
  on(event, fn)   // 'meter','star','sticker','outfit','dirt'
}
```

## `src/activities/index.js`

```js
export const ACTIVITIES = {
  feed:  { Class: FeedActivity,  mood: 'golden',  camera: 'table', label: 'ごはん' },
  bath:  { Class: BathActivity,  mood: 'evening', camera: 'tub',   label: 'おふろ' },
  dress: { Class: DressActivity, mood: 'day',     camera: 'closeup', label: 'きせかえ' },
  play:  { Class: PlayActivity,  mood: 'golden',  camera: 'floor', label: 'あそぶ' },
  sleep: { Class: SleepActivity, mood: 'night',   camera: 'crib',  label: 'ねんね' }
}
```

Each activity class:

```js
class XActivity {
  constructor(ctx)
  async build()      // create meshes, add to ctx.scene
  async enter()      // animate in, set camera/mood, first prompt
  async exit()       // animate out
  dispose()          // remove + dispose everything it created
  update(dt)
  onPointer(p)       // { x, y, type:'down'|'move'|'up' }
  onState(patch)
}
```

## Harness

`index.html?harness=1` installs `window.__GAME__` (see `src/app.js`). The
screenshot tool is `node tools/shoot.mjs`; the shot list is `tools/shots.json`.
Anything you add that changes the look should get a shot entry.
