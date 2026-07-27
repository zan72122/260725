# CRITIQUE-02 — Second-pass visual review

**Reviewed:** 2026-07-27
**Frames:** `docs/shots/` — the complete 28-shot `tools/shots.json` set at 1440×900, tier 2
**Rubric:** `docs/VISUAL_RUBRIC.md` §3 (scoring), §4 (failure modes), §6 (contract constraints)
**Previous pass:** `docs/CRITIQUE-01.md` — 1.98 / 5, defects D1–D50

---

## 0. Scope, honesty, and what this review could not do

### 0.1 No reference imagery was available — again

**I have still never seen a frame of *My Universe – My Baby*, and I did not run a side-by-side.**
Outbound HTTPS is blocked; every image host in the rubric's Appendix A returns 403 at the
proxy. `docs/reference/` is empty. Every score below is against the **written** 1/3/5 anchors
in §3 and the numbered failure list in §4, and nothing else. The §5 blind A/B protocol was
**not run** and cannot be run from this environment. The verdict in §5 of this document is an
inference from the rubric's own textual characterisation of the reference, explicitly flagged
as such.

### 0.2 What I excluded

- **Garment shredding into polygonal shards at hems and necklines** (visible in `03`, `04`,
  `05`, `07`, `06`, `23`, `30`, `40`, `50`, `51`) — known and assigned. Not reported, not
  scored against. Where it prevented me assessing something else I say so.
- **D10 (draw-call growth)** — accepted as withdrawn. I did not re-litigate it. One small
  related observation is filed fresh as **N13** because it comes from this run's own log, not
  from the withdrawn measurement.

### 0.3 Categories and the evidence available

- **C7 (Animation)** — **scored provisionally again.** Stills cannot show timing, easing,
  overlap or settle. I scored only what stills *can* show (pose variance across mood states,
  limb symmetry, motion cues on airborne objects) plus one code check. Marked `*` in the table.
- **C12 (Particle & FX)** — **scored this pass**, as instructed. Particles are now clearly
  emitting in eight frames, so the category is assessable.
- **C14** — assessed from icon literalism, choice count, and prompt/affordance agreement.
  Tap feedback and audio cannot be assessed from stills; not scored against.

### 0.4 One measured finding, up front

Luminance percentiles, measured directly off the PNGs:

| Frame | p1 | p5 | median | p95 | p99 | % < 0.15 | % > 0.95 |
|---|---|---|---|---|---|---|---|
| `01-room-wide` | 0.16 | 0.29 | 0.52 | 0.67 | 0.76 | 0.8% | **0.00%** |
| `61-golden-hour` | 0.16 | 0.27 | 0.46 | 0.67 | 0.76 | 0.8% | **0.00%** |
| `60-weather-rain` | 0.13 | 0.25 | 0.45 | 0.61 | 0.67 | 1.2% | **0.00%** |
| `03-baby-face` | 0.18 | 0.27 | 0.49 | 0.67 | 0.72 | 0.4% | **0.00%** |
| `31-dress-putting-on` | 0.18 | 0.29 | 0.60 | 0.75 | 0.77 | 0.5% | 0.00% |
| `30-dress-outfit` | 0.25 | 0.40 | 0.64 | 0.94 | 1.00 | 0.1% | 4.11% |
| `40-play-blocks` | 0.16 | 0.29 | 0.54 | 0.93 | 0.99 | 0.8% | 3.12% |
| `50-sleep-crib` | 0.06 | 0.19 | 0.58 | 0.91 | 0.96 | 3.4% | 2.37% |
| `52-sleep-lamp-off` | **0.02** | **0.10** | 0.42 | 0.62 | 0.68 | **8.9%** | 0.00% |

Six of nine frames have **zero pixels above 0.95 and under 1.2% below 0.15** — the entire
image lives between roughly 27% and 67% luminance. That is §4 **#101, compressed value
range**, verbatim, and it is a **regression**: CRITIQUE-01 explicitly praised `01-room-wide`
for having "true dark under the shelf and true bright on the sunlit rug" and recorded #101 as
resolved. It is no longer resolved. Meanwhile three frames simultaneously **clip** 2–4% of
pixels to featureless white (§4 #46).

`52-sleep-lamp-off` is the proof the pipeline can do it: p1 = 0.02, 8.9% genuine shadow, a real
cool key against warm skin. It is also, not coincidentally, the best-looking frame in the set.

---

## 1. Verification of pass one — D1 to D50

Verdicts are against **what renders**, not what the code says. Several defects were reported
fixed by the agent that authored the fix; three of those are fixed in source and still broken
in frame, and I have marked them accordingly.

### Tier 1

| # | Verdict | Verified in | Notes |
|---|---|---|---|
| **D1** | **PARTIAL** | `30`, `51` fixed · `10`,`11`,`12`,`20`,`43` not | `dress` and `sleep` now frame their subject — real fix. But `10/11/12-feed-*` put the camera **under the highchair tray**: the only part of the baby visible is the top of the bald skull at (720–890, 230–300), face entirely occluded. `20-bath-fill` crops the head at the bottom edge behind the UI tiles. `43-play-balloon` — a shot whose stated brief is "balloon translucency + string" — is shot on the **wide** preset from ~4 m, balloon 90 px tall. The presets still frame the *prop*, not the subject, in `feed` and `bath`. |
| **D2** | **PARTIAL — fix introduced a new problem** | `50`,`51`,`52` | The sleep money-shot renders. But in all three sleep frames a **near-field crib rail runs diagonally across the subject** (`51` at (0–750, 590–900); `50` at (0–800, 480–720); `52` verticals at x≈650, 780, 920). The baby is behind a cage in every sleep frame. And `asleep` does not close the lids — see D7. |
| **D3** | **PARTIAL** | `03`,`04`,`07`,`24`,`25`,`30` | Real win: both irises are in the aperture in every frame, with catchlights. But **convergence is not achieved anywhere**. In `04`, `07`, `24`, `25` and `30` the frame-left iris sits hard against the outer edge of its sclera while the frame-right iris sits near centre — the two eyes disagree by a visible amount and read as wall-eyed. And in **no** face frame do the eyes look at the camera, including the two hero portraits. `face.js:823` implements per-eye vergence and `:833–834` clamps yaw to ±0.34 rad; the clamp is symmetric, so at any sideways target both eyes saturate together and vergence disappears. |
| **D4** | **PARTIAL** | `03`,`04`,`05` fixed · ears not | Nose, philtrum, lip line and mouth all read now — this is the biggest single win of the pass. But **the baby has no ears in any of the 28 frames.** `anatomy.js:139` authors an ear ellipsoid at half-extents `[0.0080, 0.0235, 0.0180]` — an 8 mm half-width — and `BodyField` still runs at `k = 100` (`anatomy.js:268`), the same ~10 mm fillet radius that ate the nose in pass one. **The identical root cause is still eating the ear.** Also new: a broken dashed white line runs across the jaw at (660–900, y≈442 and y≈465) in `03`, `04`, `05` and `07`. |
| **D5** | **NOT FIXED — fixed in source, invisible in frame** | `03`,`04`,`05`,`24`,`30` | `face.js:422–433` now sets `happy: blush 0.64`, `cry: blush 1.0`, `shy: blush 1.0`, and `face.js:987` multiplies by 1.0 instead of 0.58; `materials.js:1247` `makeBlush` is now a lit SSS material rather than `MeshBasicMaterial`. All correct. **No cheek colour is visible in any frame**, including `05-baby-cry` at blush 1.0 examined at 400%. Whatever is wrong is downstream of the amplitude. This is the clearest case in the review of a defect closed in code and not in the image. |
| **D6** | **FIXED** | `03`,`04`,`05`,`07`,`40` | The orange bloom corona is gone. The character no longer haloes. Protect this. |
| **D7** | **PARTIAL** | `03`,`04`,`05`,`41` yes · `06`,`50`,`51`,`52` no | Genuine progress: `cry` opens the jaw onto a red interior, lowers the lids, moves the brows and **changes the body pose** (arms up, head back in `05` vs seated in `07`); `surprised` reads in `41`; `happy` raises the cheeks and narrows the lower lid in `03`. Against that: **`asleep` sets `lidClose: 1.0` (`face.js:428`) and the lids do not close** — `51` at 400% shows two fully open apertures with visible sclera and iris, and the same is true in `50` and `52`; `sleepy` in `06` shows wide-open eyes. Tears at `cry: 1.0` render as **hollow transparent rings** at the inner canthi (`05`, at (760,375) and (855,320)) — they read as lens dirt, not tears. Brows in `05` are a hard-edged grey chevron on one side and a single dark speck on the other. |
| **D8** | **PARTIAL** | all character frames | A top and a diaper are on by default — the "naked in every shot" finding is retired. But in `30-dress-outfit`, the customisation screen, the baby stands **bare-crotched** with the top's hem cutting across at (600–830, 480–520) and nothing below it. |
| **D9** | **FIXED, but displaced** | `03`,`04`,`07` clean · `23`,`24`,`25` not | The grey crosshatch and teal patches are gone from the arm and hip. What replaced them is worse and is filed fresh as **N1**: in `23-bath-wet` the hair system emits **seven solid, glossy, tapered brown horns** from the crown and from directly beneath both eyes, at (575–792, 167–275). Also new in `23`: a flat unshaded salmon slab across the chest at (620–790, 292–310); in `24`/`25`, hard black shards on the torso. |
| **D10** | **WITHDRAWN** | — | Accepted. Not re-litigated. See **N13** for a small separate observation from this run's log. |

### Tier 2

| # | Verdict | Verified in | Notes |
|---|---|---|---|
| **D11** | **FIXED** | `20`,`21`,`22` | The rainbow debug bar is gone. Replaced by a green rounded chip on the tub's front face at (690–800, 715–745) — still reads as an applied sticker rather than a moulded part, but it is no longer a debug ramp. |
| **D12** | **FIXED** | `20`,`21` | No unparented sphere. |
| **D13** | **PARTIAL** | `04`,`24`,`25` | The cornea no longer obscures the iris. But a broad grey-blue veil still washes the lower sclera in `04`, and the whole eyeball now reads as a **bulging glossy marble sitting proud of the face** — see N2. |
| **D14** | **PARTIAL** | see C12 | Particles are firing. Quality is mixed and mostly poor — detail under C12 and N3/N4. |
| **D15** | **FIXED** | `03`,`04` | Crown ~115 px from the top edge, eyes near the upper third, no limb clipped. Correct now. |
| **D16** | **PARTIAL — fix removed the affordance** | `02`,`40`,`43` vs `10`,`12`,`20`,`50` | The bubble moved to frame-left and no longer occludes its target. But the directional arrow was **deleted rather than corrected**, so the prompt now names a target with no pointer at all. Worse, prompts no longer match their scene: `50-sleep-crib` reads 「はみがき しようね」("let's brush teeth") inside the *sleep* activity with no toothbrush in frame; `10`/`12` read 「スタイを つけよう」("put the bib on") with neither bib nor baby visible; `20` reads 「おふくを ぬがせてあげよう」with the baby cropped out of frame. |
| **D17** | **FIXED** | `30` | Five garment tiles, custom-drawn, literal. New problem: they stack as a second row over the character's legs, in a different shape language (circles vs rounded squares), bringing the screen to **10 simultaneous choices** — over the §4 #130 limit. |
| **D18** | **NOT FIXED** | `40`,`62`,`05`,`07`,`42` | `contactShadow()` is imported by exactly one file — `activities/bath.js` (lines 497, 1044). `world/room.js` never calls it. In `62-clutter` not one of the ~16 scattered toys casts a readable contact shadow; in `40` the block tower's base at y≈830 sits on fully-lit rug; in `05` and `40` the seated baby has no dark core where he meets the floor. There is no contact hardening anywhere in the set. |
| **D19** | **PARTIAL** | `40`,`41` | Five blocks now stack. Still lit gaps between blocks at y≈535 and y≈665 with no inter-block AO, and in `41` a green block is buried in the baby's chest at (715–800, 545–620) with a hard cut line. |
| **D20** | **NOT FIXED** | `61` | `golden` measures p95 = 0.67, identical to `day`. No long raking shadows: the pouf, both stools, the table, the chair and the basket cast essentially nothing. The light shaft is a **flat hard-edged band** on the wall with uniform intensity and no falloff. And the frame still has no subject — the manifest says scene `feed`, and there is no highchair, no food, no baby. |

### Tier 3

| # | Verdict | Verified in | Notes |
|---|---|---|---|
| **D21** | **PARTIAL** | `01`,`61` better · `10`,`20`,`23` not | Chair slats and the chest read better. The highchair tray's curved front edge (`10`/`11`/`12`, x 350–1040) still shows countable flat segments and a hard specular line; the wastebasket rim (`23`, 95–370, 380–430), the bathmat's slab edge (`23`, 420–900, 780–810) and the lampshade rim (`52`) are all unbevelled. |
| **D22** | **PARTIAL** | `61`,`05` | The same curved grain arc still recurs across planks — visible at (250–450, 640–700), (600–800, 560–620) and (1050–1250, 500–560) in `61`. |
| **D23** | **NOT FIXED** | `61` | The table top at (1000–1330, 690–820) and **both** stool tops still carry a radially symmetric starburst grain emanating from dead centre. |
| **D24** | **NOT FIXED** | `01`,`61`,`62`,`43` | Still a perfectly concentric bullseye with a hard elliptical boundary, no pile thickness at the rim, no fringe, no ruck, and no perimeter contact shadow. |
| **D25** | **NOT FIXED — worse** | `05`,`07`,`40`,`42`,`62` | The rug now occupies 40–50% of several frames and reads as uniform salt-and-pepper stipple at every distance. At the `closeup` framings in `05` and `07` it is indistinguishable from compression noise, and it is the largest surface in frame. |
| **D26** | **PARTIAL** | `23` | Now an opaque bin with a subtle weave instead of an aliased wireframe. Rim is still hard and visibly segmented; interior has no AO at the base. |
| **D27** | **NOT FIXED** | `01`,`61`,`62` | No glazing highlight on any of the three framed pictures. |
| **D28** | **FIXED** | `01`,`61`,`62` | Varied book heights, several leaning, gaps present. |
| **D29** | **FIXED** | `01`,`61`,`62` | The wire basket is now solid, lit, and has contents spilling at the rim. |
| **D30** | **PARTIAL** | `01`,`61`,`62` | The three pictures are now visibly off-level — good. The chest, the shelf, the changing mat, the towel roll and the clock are all still dead square to the wall. |
| **D31** | **PARTIAL** | `62` | One genuine 2-high stack at (285–390, 660–750), one tipped block, three items off the rug onto bare boards. The remaining ~12 still present a flat top face parallel to the floor and a face square to camera. Nothing overflows, nothing trails, nothing is half-off anything. |
| **D32** | **FIXED** | `62` vs `40` | One block family, symbol-embossed, per-instance colour variation. |
| **D33** | **PARTIAL** | `01`,`61`,`62` | An outlet at (525–540, 375–390), a light switch at (1370–1390, 255–270) and a chair rail have been added. The wall itself is still flat matte with no scuff and no paint texture beyond a white speckle noise that reads as sensor grain. |
| **D34** | **PARTIAL** | `01`,`61` | The skirting has a profiled section now. There is still no dark AO line where it meets the floor. |
| **D35** | **PARTIAL** | `01`,`02`,`40`,`41`,`43`,`62`,`05`,`42` | Material is fixed — proper latex translucency and a soft broad highlight, a real improvement. **Form and anchoring are not**: the balloon is still an inverted teardrop **point-down**, with a straight ~2 px string that terminates in mid-air on the floor with no knot, no curve and no slack. In `42-play-ball` it renders nearly edge-on as a hard red shard at (570–660, 405–580) that appears to stab the baby's head. |
| **D36** | **FIXED** | `23` | The bathmat has real thickness, a folded-over flap, and a tufted fringe along the near edge at (430–780, 800–860). Good work. The ~30 fringe tufts are identical in length, spacing and rotation. |
| **D37** | **NOT FIXED** | `21`,`23` | The tub shell still passes through the stand's top rail — `21` at (350–420, 700–780), `23` at (900–960, 350–390). |
| **D38** | **PARTIAL** | `52` yes · everything else no | `52-sleep-lamp-off` has genuinely cool blue moonlight against warm skin, with crib-rail shadows on the wall. It is the only frame in the set with real chromatic value range. `31-dress-putting-on` measures mean RGB (208, 123, 77) — a monochrome orange frame with no cool anywhere. |
| **D39** | **FIXED** | `03`,`40`,`61` | No perceptible mid-frame fringing. |
| **D40** | **FIXED** | `03`,`04` | The baby is the sharpest thing in frame and the background falls off smoothly. Good. |
| **D41** | **PARTIAL — new artefact** | `03`,`04`,`05` | The chest seam is gone. But the cranium now shows a **second lobe** — a distinct crease and bulge on the frame-right side at (945–990, 180–280) in `03` and `04`, reading as a dent in the skull — and the silhouette is still stepped at (960–1010, 400–500) in `05`. |
| **D42** | **NOT FIXED** | `07`,`30`,`31`,`21`,`24`,`25` | Arms and legs are boneless tubes with no elbow, no knee, no wrist and no ankle. Hands are mitten paddles with a thumb nub and no separated fingers; feet are lumps with no toes. Confirmed at six angles, including the full-length standing pose in `31` where it is most exposed. |
| **D43** | **PARTIAL** | `04`,`05` | Softer and less stern at rest. Still decals: the inner end of the frame-left brow in `04` terminates in a hard rectangular cut, and in `05` one brow is a streak while the other is a single dark speck. |
| **D44** | **FIXED** | `03`,`04`,`24` | `face.js:_aimCatch` aims each catchlight along the view/light half-vector clamped to the front cap, with a per-eye offset. The catchlights are small, consistent with the key direction, and differ slightly between eyes. Correct. |
| **D45** | **FIXED** | `02`,`40` | Meter icons are legible; the apple reads as an apple. |
| **D46** | **FIXED** | `02` | One radius scale. The meter panel is a single warm pill with consistent corners. |
| **D47** | **FIXED — best fix in the pass** | `02`,`40`,`50` | The UI is now cream, drawn from the nursery's own palette, with soft layered shadows — and it **themes to deep navy with filled stars at night** (`50`). That is authored personality, not just a recolour. |
| **D48** | **PARTIAL** | `02`,`30`,`43` | Bottom row now ~35 px from the edge, up from 25. In `30` two stacked tile rows still crowd the bottom and sit over the character's legs. |
| **D49** | **FIXED** | `02`,`50` | Five outlined star slots that fill in, not a numeral. Reads as a sticker album. |
| **D50** | **PARTIAL — unassessable from stills** | `05` vs `07`; `baby.js:456` | Body pose now genuinely varies with mood (`cry` is arched with arms raised; `happy` is seated). `baby.js:456` implements a stochastic idle-gesture picker, so the system exists. Whether it fires, and with what timing, cannot be judged from stills. Against it: the arms are perfectly mirrored in `21`, `25` and `41` — §4 #63. |

**Summary:** 17 FIXED · 24 PARTIAL · 8 NOT FIXED · 1 WITHDRAWN.
Three fixes introduced a new problem (D2 rails, D9 → horns, D16 arrow removed).
One is fixed in source and invisible in frame (D5).

---

## 2. Per-shot critique — all 28 frames

### `01-room-wide` — establishing, play/wide/day

The architecture is still the strongest asset in the build, and it has improved: the window
now shows a real exterior (trees, a house, sky), the three pictures are visibly off-level, the
shelf books lean at varied heights, the wire basket is solid and has contents, and an outlet
and light switch have appeared.

1. **The entire frame lives between 0.29 and 0.67 luminance with zero pixels above 0.95.**
   Wall, floor, rug, curtains, chest and skin all sit in one warm-peach midtone band. A milky
   haze veils the far corner and the rug's far edge. §4 #101 — and a regression from pass one.
2. **The light shaft is a flat quad.** The diagonal band across the back wall at
   (700–1440, 130–320) has hard straight edges and uniform intensity; it brightens the shelf
   and the pictures without falloff. It reads as an overlay, not a volume.
3. **The window is blown to featureless white** and, with the chest of drawers, is where the
   eye lands. The baby — ~9% of frame height and the same value as the rug — is not the
   brightest or highest-contrast element. §4 #47, #118.
4. **Small props cast almost nothing.** The blocks, ball, drum and xylophone on the rug have no
   readable shadow; the stools bottom-right have none. The crib does cast well. §4 #35.
5. The rug is still a hard-edged concentric bullseye with heavy stipple. §4 #83.
6. The balloon is a point-down teardrop, the most saturated object in frame, sitting directly
   in front of the subject with a 2 px string ending on the boards.
7. An unresolved thin dark curve with small coloured shapes hangs off the wall at
   (775–820, 200–270) — a mobile, but it reads as a scribble.

### `02-room-wide-hud` — same framing, HUD on

The UI is now the best-executed system in the build. Warm cream panels drawn from the room's
own palette, one consistent pill radius, larger legible icons, a five-slot star row instead of
a numeral, a speaker and book affordance, a clear lifted-yellow selected state, exactly five
activity choices.

8. **The prompt has lost its pointer.** 「ボールを ころころ！」sits at frame-left with a ball
   icon; the actual ball is a 45 px object at (500–545, 705–740) near the centre. The occlusion
   problem is fixed by moving the bubble away from the target — which also removes the only cue
   telling a pre-literate child where to look.
9. The 「ねんね」tile sits directly over the stool; the row crowds the bottom edge at ~35 px.
10. The ごきげん meter's smiley is the one metaphorical icon in an otherwise literal set.

### `03-baby-face` — hero portrait, happy

The single biggest improvement in the pass. There is a nose, a philtrum, a lip line, a closed
smile with raised cheeks and dimples, two irises with catchlights, soft-edged brows, no bloom
halo, and a genuinely good soft SSS terminator with a warm shadow ramp. DOF holds the subject.

11. **No ears.** Neither side. The head is a smooth egg.
12. **The eyes read as beady and shifty.** They are small relative to a cranium that occupies
    45% of head height — the opposite of the Kindchenschema the rubric asks for. The irises sit
    low in the aperture behind the upper lid, and both look off to frame-left at nothing. The
    two irises are at different relative positions within their apertures.
13. **A second cranial lobe.** A crease and bulge on the frame-right skull at (945–990, 180–280)
    reads as a dent, not a form.
14. **The mouth reads as a smirk, not a baby's smile** — a small pursed shape with a cool
    blue-grey cast along the lip line, low and off the centreline.
15. **No blush** at `happy` (blush 0.64).
16. **Skin has zero surface information at 400%** — no pore, no freckle, no roughness breakup,
    no albedo detail anywhere. Beautiful shading of a featureless surface. §4 #19, #20.
17. A broken dashed white line runs across the jaw at (750–880, 442–478).
18. The hair is a handful of thin dark aliased strands at the crown that read as dirt.

### `04-baby-face-neutral` — neutral

Wider-open eyes with visible sclera. This is the frame that exposes the eye construction.

19. **The eyeballs are protruding spheres sitting on the face, not in sockets.** At 400% each
    eyeball shows its own spherical terminator and a **hard boolean cut line** where it meets
    the skin — clearest on the frame-right eye's lower-right arc. The lid is a separate thin
    crescent flap laid over the top with a hard, aliased edge. This is the "googly eyes glued
    on" tell, and it is present in every frame that shows the face at scale.
20. **Divergent gaze.** The frame-left iris is hard against the outer edge of its sclera; the
    frame-right iris sits near centre. For a near target this is the wrong sign — it reads as a
    drifting eye.
21. The nose carries a grey-blue cast that reads as bruising; the nostrils are smudges.
22. The dashed white jaw line again, at (660–900, 442) and (660–900, 465).

### `05-baby-cry` — cry at 1.0

Real progress: the jaw opens onto a red interior, the lids drop, the brows move, and the **body
pose responds** — arms out and up, head tilted back. Pass one's "identical to happy" is retired.

23. **Tears render as hollow transparent rings** at the inner canthi, (760, 375) and (855, 320).
    Perfectly circular, static, unattached to a tear track. They read as lens dirt.
24. **The mouth interior is a flat crimson lozenge with straight-line polygonal facets** at
    (250–400, 750–800 in the 400% crop) — no gum, no tongue, no depth, no darkening toward the
    back. A red sticker inside a hole.
25. **The brows are inconsistent decals** — a hard-edged grey chevron on the frame-right, a
    single dark speck on the frame-left.
26. **No blush** at blush 1.0.
27. **No readable contact shadow** where the baby lies on the rug at (700–900, 780–880).
28. The rug's stipple dominates the lower two-thirds and reads as noise.

### `06-baby-sleepy` — sleep scene, sleepy mood

29. **Near-field crib rails render as translucent grey-blue bands laid across the baby's face**
    at (600–880, 340–620) — three or four vertical veils crossing the eyes and nose. Whether
    this is an intentional foreground occluder or a transparency bug, as rendered it destroys
    the shot.
30. **The eyes are wide open** in the `sleepy` mood (`lidLower: 0.92`). Nothing about the face
    reads as sleepy.
31. **A blown-out orange lamp glow occupies the frame-left third** at (0–250, 100–350),
    clipping to white with no shape or detail.
32. **A thin black cable lies across the mattress** at (1180–1350, 420–450). Stray geometry.
33. The whole frame is one amber hue — no cool fill anywhere. The teddy at frame-right is hard-
    clipped by the edge.

### `07-baby-full` — full body, play/closeup

Clothed, faced, and posed. Genuinely a character now.

34. **At this distance the eyes are two dark specks ~22 px wide on a 200 px head.** The
    character has no eye read at gameplay distance — the opposite of the large round eyes the
    rubric's C1 and C3 both call for.
35. Both irises pushed to the frame-left extreme again, looking at nothing.
36. **No elbow, no knee, no wrist, no ankle, no fingers, no toes.** Arms are smooth tubes ending
    in mitten paddles; the leg at bottom-centre is a tube ending in a lump.
37. **Contact shadow is a soft offset smudge** at (540–640, 660–780) that does not correspond to
    where the body meets the rug. No contact hardening.
38. The garment has no hem, no cuff thickness, no gathers — the sleeve simply ends.
39. Dashed white jaw line at (750–880, 465–480). Fourth confirmation.

### `10-feed-bottle` / `12-feed-apple` — feed/table

**Both frames are broken, and they are near-identical to each other** (mean per-channel
difference 2.1/255 — the shot list asks for two different states and produced one image).

40. **The camera is beneath the highchair tray, looking up at the underside of a seat cushion.**
    The only visible part of the baby is the crown of the skull at (720–890, 230–300). The face
    is entirely occluded. The tray fills the middle third.
41. **Large regions of pure black are visible where the room shell ends** — (0–330, 120–370) and
    (1090–1440, 90–250). The camera is outside the set looking into the void.
42. The bottle at (690–770, 530–660) is an opaque white cylinder with an orange teat — no glass
    transmission, no milk level, no highlight. The manifest asks for exactly those.
43. The seat cushion's diamond quilt shows a countable tile repeat and stretched UVs at the
    rounded corner (860–1030, 400–500).
44. The tray slab's curved front edge is unbevelled with countable flat segments.
45. The prompt asks the child to put a bib on. No bib is visible or tappable.

### `11-feed-messy` — feed, no HUD

Same broken camera. Two things worth recording:

46. **The food props are the best-modelled small objects in the build** — an apple with a leaf,
    a banana, a milk bottle with a visible level and a pink cap, a rimmed bowl, a cookie with
    chips, a juice carton, an egg, a teething ring. And `FX.decal` is working: crumb and stain
    blobs on the tray at (400–560, 780–830) and (740–810, 750–790).
47. **The banana floats vertically in mid-air** at (655–710, 555–760), unsupported.
48. Pale green triangular slivers of backfacing geometry at (500–720, 60–110) and
    (1130–1440, 60–190), against black.

### `20-bath-fill` — bath/tub

D11 and D12 are both confirmed fixed here.

49. **The head is cropped at the bottom edge and hidden behind the tile row** — only the back of
    the skull is visible at (480–680, 620–900).
50. **The faucet is broken geometry.** A disconnected black-banded elbow floats at
    (455–560, 175–230), and a **solid black quadrilateral shard** sits in the water below the
    stream at (595–655, 435–500) — the stream billboard rendering its backface.
51. **The water stream is a white strip with hard parallel edges** — no droplet breakup, no
    thickness variation, no splash ring where it lands, and a visible gap before the surface.
52. **The water surface is an opaque flat disc.** No transparency, no refraction, no meniscus at
    the tub wall, no ripples. No steam. The manifest asks for water surface, refraction and steam.
53. Three pink foam blobs at (760–840, 515–570) are hard-edged rounded boxes floating on the
    surface with no partial submersion. They read as erasers.
54. The tub is dead-centre with no subject; the eye has nowhere to land. §4 #109, #136.
55. **Genuinely good:** the towel on the rail at (720–960, 240–390) has real thickness, a fold
    and a nubby nap. Best-resolved fabric in the build.

### `21-bath-foam` — bath/tub, foam 0.9

The baby is in the tub and visible — a real fix over pass one's empty tub.

56. **The foam is a pile of hard-edged, faceted, low-poly rocks.** `fx/foam.js:49` builds each
    clump from `IcosahedronGeometry(1, detail)`; as rendered they read as gravel or styrofoam
    packing peanuts. Uniform grey-beige, near-uniform size, matte, hard silhouettes, no
    translucency, no clumping into a mass, no clinging film, no drips.
57. **A cloud of these rocks levitates in mid-air above the tub** at (650–890, 75–185),
    completely detached from anything. This is the single worst artefact in the frame set.
58. Foam clumps intersect the arms and torso with **hard cut lines** at (700–830, 440–540) —
    no soft-particle depth fade. §4 #86.
59. Both arms are raised in a perfectly mirrored T. §4 #63.
60. The skin is a markedly more saturated orange here than in the play frames — the character
    changes colour between scenes.
61. **Genuinely good:** the iridescent bubbles at (410–425, 470), (700–720, 455) and
    (760–790, 540) — soft, varied in size, with rim colour. The best FX element in the build.
62. The tub's near shell is a ~25%-of-frame featureless pale expanse at one roughness value.

### `22-bath-splash` — wet skin

63. **`setWet()` turns the whole body into glossy patent-leather plastic.** A blown white
    highlight caps the cranium at (720–860, 260–330) and the entire figure — including the head,
    which is above the waterline — reads as a shiny vinyl bath toy. This is the C2 **1/5 anchor
    verbatim** and it is a regression relative to the dry frames.
64. **There is no splash.** The shot exists to show splash particles. None are present — no
    airborne droplets, no crown, no ring.
65. **The waterline is a hard straight cut** where the torso meets the surface at
    (650–900, 600–640), with a torn white polygon strip at (600–860, 620–680). No meniscus, no
    wetting darkening, no refraction; submerged limbs are invisible.
66. A hard black shard under the right arm at (820–900, 570–620).
67. The clinging droplets are perfectly spherical glass beads sitting *on* the skin.

### `23-bath-wet` — towel, wet skin

**The worst frame in the build, and by a wide margin.**

68. **Seven solid, glossy, tapered brown horns radiate from the head and from directly beneath
    both eyes**, at (575–792, 167–275). They are opaque with a bright specular ridge along each.
    They are the hair system, massively over-scaled and mis-rooted. The character reads as an
    insect. See N1.
69. **The eyes are unmistakably stuck-on plastic doll eyes** — two protruding white spheres with
    brown iris discs, a hard rim where each meets the skin, no lower lid, no lash, no
    convergence.
70. **A flat, unshaded salmon slab lies across the chest** at (620–790, 292–310) with a hard
    edge. Unexplained.
71. Water droplets render as **hollow outlined rings with dithered edges** across the face and
    shoulders — the same artefact as the tears in `05`.
72. **An unexplained large grey ovoid** sits behind the baby at (410–660, 235–330).
73. The tub shell intersects the stand rail at (900–960, 350–390).
74. **Genuinely good:** the bathmat. Real thickness, a folded-over flap, and a tufted fringe at
    (430–780, 800–860). This is what D24 should look like applied to the rug.

### `24-bath-caustics` — settled water

The clearest look at the character, and the most damaging.

75. **There are no caustics.** What is on screen is a white wobbly closed loop at
    (350–520, 545–620) and a wavy white ribbon at (590–960, 620–700) — both on the *surface*,
    both reading as a chalk doodle. Caustics are focused light on the tub *floor*, and the water
    is opaque, so the floor is not visible at all. Nothing else the manifest asks for — refraction
    bending the submerged legs, a waterline meniscus, ripple glints — is present.
76. **Nasolabial folds.** Deep creases run from the nose wings to the mouth corners at
    (700–780, 340–380) and (830–880, 340–370). On an infant. Combined with the smirk and the
    small eyes, the character reads as a middle-aged man.
77. The wet plastic sheen again, with blown highlights on the cranium, shoulders and belly.
78. A blue bottle with a white strap floats in mid-air above the water at (595–640, 290–360).
79. Hard black shards on the torso at (880–960, 545–610) and (500–620, 400–450).
80. **Genuinely good:** the rubber duck at frame-right — a properly modelled body and bill.

### `25-bath-horn` — foam-horn hairstyle

81. **There is no horn.** The manifest asks for a sculpted foam peak. What renders is a helmet
    of ~20 identical grey rocks with hard faceted silhouettes, plus ~25 more scattered across
    the water at near-uniform spacing, none touching, none clumping, none clinging.
    §4 #87, #88, #96 simultaneously.
82. Both arms mirrored again. Blown highlight on the shoulder at (900–960, 420–470).
83. **Genuinely good:** the iridescent bubbles, with magenta, cyan and green rims and real size
    variance. Keep this shader.

### `30-dress-outfit` — wardrobe

The camera now frames its subject, and the outfit picker exists. Both are real fixes.

84. **The baby is bare below the hem.** Standing, front-on, in the customisation screen, with
    the top's hem cutting across at (600–830, 480–520) and nothing beneath it. This is a
    shipping blocker for a children's product.
85. **The background is a flat blurred beige wardrobe occupying ~70% of the frame** — two blank
    panels, one groove, no handle, no hinge, no depth, no interior, no hanging clothes. The
    worst background in the set, and it is on the customisation screen.
86. **An unexplained chrome hook** at (1230–1440, 480–720) with a green dot at (1300, 495). It
    is the highest-contrast object in frame after the UI and it is where the eye lands first.
87. **No key direction is discernible.** Flat, low-contrast beige throughout; no rim on the
    character, no cast shadow onto the floor or the wardrobe, no contact shadow at the feet.
    §4 #33, #34, #42.
88. **10 simultaneous choices** across two rows in two different shape languages, both sitting
    over the character's legs. §4 #130, #120, #117-adjacent.
89. The eyes are large, bulging, glossy and both pushed frame-left — the strongest googly read
    in the set.

### `31-dress-putting-on` — garment over the head

The shot exists to demonstrate cloth deformation.

90. **The garment is a rigid green cylinder jammed onto the head.** A stiff tube with a flared
    rim and three rows of dots. No drape, no stretch over the cranium, no folds, no gathers.
    §4 #13, #62. It reads as a plant pot.
91. **A pink cone protrudes from behind the head** at (700–780, 60–230), and the garment is
    clipped by the top frame edge.
92. **The frame is monochrome orange** — measured mean RGB (208, 123, 77), a 2.7:1 red-to-blue
    ratio, p99 = 0.77. Wardrobe, floor, baby and podium sit in one 20° hue band with no cool
    anywhere and no true white or dark. §4 #137, #101.
93. **No HUD, no prompt** — inconsistent with `30`.
94. No contact shadow at the feet on the podium.

### `40-play-blocks` — play/floor, HUD on

Five blocks stack, the prompt no longer occludes the tower, the blocks carry distinct embossed
symbols, and the balloon material is right. All improvements.

95. **The tower is jammed against the right edge with dead space between it and the baby**, and
    its top block tangents the crib rail.
96. **Lit gaps between blocks** at y≈535 and y≈665, with no inter-block AO or contact shadow,
    and the base at y≈830 sits on fully-lit rug.
97. **No readable contact shadow under the baby.**
98. The baby looks away to frame-left — not at the tower he is being asked to build, not at the
    camera. The gaze target does not match the activity.
99. Heavy pink haze over the wall and curtains; the window is blown; the darkest object in frame
    (the pouf) is still ~35% luminance.
100. The pouf is a smooth grey lozenge with a hard seam and no fabric texture — reads as stone.

### `41-play-collapse` — mid-collapse

The most dynamic composition in the set, and the worst FX.

101. **The star particles are opaque, hard-edged, flat, uniformly-coloured five-pointed star
     glyphs** at (900–1300, 420–780). `fx.js:248` builds them as `SHAPE == 3 // STAR5` and
     `fx.js:143` gives them `soft: 0.10, alpha: 1`. Uniform size (~30–45 px), near-uniform
     rotation, no alpha fade, no colour variance, and clustered entirely on the right side, far
     from the collapse. They read as clip-art stickers pasted over the render. This is §4 #85 in
     spirit and #87, #88, #89 literally, and it is what caps C12.
102. **No dust.** The manifest asks for dust at the impact. None.
103. **The airborne blocks are frozen with no motion cue** — no blur, no trail, no smear. One
     floats at (585–655, 320–395) with nothing to explain it.
104. A green block is buried in the baby's chest at (715–800, 545–620) with a hard cut line.
105. The baby's shadow at (640–720, 700–730) is a small smudge offset from the body —
     peter-panning. §4 #38.
106. The brows do not lift on `surprised`, though the mouth and eyes do.

### `42-play-ball` — ball + crawl pose

107. **The ball is directly in front of the baby's face**, occluding it at (490–620, 405–530).
108. **The balloon renders edge-on as a hard dark-red shard** at (570–660, 405–580), appearing to
     stab the head.
109. The pose is a sit, not a crawl — the shot does not deliver its brief.
110. **No cast shadows on the pouf, chest or crib** in this frame, unlike `01`. §4 #35.
111. An unexplained small black object at (795–825, 645–665).
112. The eyes are pushed to frame-left while the head is turned frame-right — the gaze reads
     as looking backwards through the skull.

### `43-play-balloon` — balloon translucency + string

113. **Shot on the wide preset.** The subject of the shot — the balloon — is 90 px tall and the
     string is a 2 px line. The brief cannot be judged from this framing, which is the fourth
     near-identical wide shot in the set (`01`, `43`, `60`, `62`).
114. The balloon is still point-down; the string is straight, unanchored, and terminates in
     mid-air on the boards at (465, 540).

### `50-sleep-crib` — night crib, HUD on

**The night HUD theme is the best UI work in the build** — panels flip to deep navy-plum,
stars fill in, and the whole system stays coherent. Protect this.

115. **The lamp is a pure-white blob with zero shape** at (170–330, 240–400), with a huge orange
     halo washing the left half. 2.4% of the frame is above 0.95 with no highlight detail. §4 #46.
116. **The baby's face is a pale mask with a large open black mouth** at (655–700, 415–450) and
     two dark eye slashes. It reads as a scream, not sleep.
117. **A black cable snakes across the mattress** at (990–1120, 700–840). Same stray as `06`.
118. **The prompt reads 「はみがき しようね」("let's brush teeth") inside the sleep activity**,
     with a heart icon and no toothbrush in frame.
119. Unidentifiable pink lumps at (1180–1280, 480–620), outside the blanket.
120. Near rails cross the whole frame diagonally at (0–800, 480–720) and a corner post bisects
     it vertically at x≈420.

### `51-sleep-asleep` — the money shot for lighting

121. **The `asleep` mood does not close the eyes.** At 400% the face shows two fully open
     apertures at (687–765, 363–470) with visible sclera and dark irises, each eyeball a
     protruding sphere set in a **hard-edged hole in the face** with stair-stepped aliasing
     along the rim, and a separate crescent lid flap laid over the top. `face.js:428` sets
     `lidClose: 1.0`. It is not reaching the geometry. **This is the most damaging single
     defect in the build:** the money shot is a sleeping baby with its eyes open like a doll's.
122. **The frame is drowned in one orange wash** with a blown glow at (0–170, 100–280) and no
     cool fill anywhere. "Night" is not reading as night.
123. **A near rail runs diagonally across the whole lower frame** at (0–750, 590–900), crossing
     the arm; a vertical rail at x≈510 crosses the head.
124. The face is the palest object in frame while everything else is orange — it reads porcelain,
     not warm.
125. Visible dither/grain noise across the flat mattress and skin at 400%.
126. No `zzz`, no breathing cue, no soft nightlight modelling. Nothing says "asleep".

### `52-sleep-lamp-off` — moonlight only

**The best-lit frame in the set, by a distance.** Genuine cool blue moonlight, warm skin against
it, real crib-rail shadows cast on the wall, p1 = 0.02 with 8.9% of pixels genuinely dark. This
is what the other 27 frames should look like, and it proves the pipeline can do it.

127. **A large capital letter "N" is printed on the crib mattress** at (586–642, 332–382). This
     is placeholder or debug text visible in a shipped frame. §4 **#138**.
128. The eyes are open again at (690–740, 375–435).
129. **Hard pure-black edges outline the blanket** at (760–1200, 700–870) and (830–870, 400–560)
     — a backface or wireframe artefact.
130. The moonbeam bands on the floor are hard-edged straight quads with uniform intensity — the
     same flat-overlay problem as the day shaft.
131. The lampshade is a truncated cone with a hard rim and a countable polygonal silhouette.
132. The mattress is a large flat expanse with no wrinkle, no fold, no sheet.

### `60-weather-rain` — rain on the glass, overcast grade

133. **There is no rain and there is no overcast grade.** The frame is `01-room-wide` with the
     exposure pulled down: mean RGB moves (173, 113, 95) → (149, 101, 85) — a uniform ~14%
     darkening at **identical hue**. `room.js:641–646` shows why: `setWeather('rain')` sets
     `_bounceScale = 0.55` and nothing else. No droplets on the glass, no streaks, no diffuse
     sky, and the hard sun shaft is still on the wall in the rain. This is §4 **#45** verbatim.

### `61-golden-hour` — golden shaft + dust motes, scene `feed`

134. **No subject.** The manifest says scene `feed`; there is no highchair, no food and no baby.
     Empty room, no focal point. §4 #136.
135. **`golden` is not golden.** p95 = 0.67, no long raking shadows — the pouf, both stools, the
     table, the chair and the basket cast essentially nothing.
136. **No dust motes** in the shaft. The white specks on the wall are outside it and read as noise.
137. The table top and **both** stool tops still carry a radial starburst grain from dead centre.
138. Countable floor-plank grain repeats at (250–450, 640–700), (600–800, 560–620),
     (1050–1250, 500–560).
139. The rug bullseye and its stipple dominate the lower half.

### `62-clutter` — lived-in room

Real improvement: one genuine 2-high block stack at (285–390, 660–750), a tipped block, three
items off the rug onto bare boards, and one consistent block family (D32 fixed).

140. **Not one clutter item casts a readable contact shadow.** Confirmed at the blocks
     (600–800, 690–780), the ball (500–560, 690–745), and the two blocks on bare boards at
     (1040–1090, 545–580) and (900–955, 590–625). `room.js` never calls `contactShadow()`.
141. ~12 of ~16 items still present a flat top face parallel to the floor and a face square to
     camera.
142. **Nothing is half-off anything.** No blanket trailing, no book face-down, no sock, nothing
     overflowing the basket. This is a tidy scatter of one toy class, not evidence of a life.
143. A green block is clipped by the bottom edge at (655–710, 880–900).

---

## 3. The 16-category score table

| # | Category | W | P1 | **P2** | Δ | One-line justification |
|---|---|---|---|---|---|---|
| C1 | Character appeal & proportions | 10 | 2 | **2** | 0 | Silhouette reads unmistakably as a baby and the face now has features — but there are **no ears in any frame**, the eyeballs intersect the face with a hard boolean rim, the cranium carries a second lobe, and the limbs still have no elbow, knee, wrist, finger or toe. The 3 anchor demands clean forms; these are not clean. |
| C2 | Skin shading & subsurface feel | 8 | 2 | **3** | **+1** | Dry skin now clears the 3 anchor cleanly: soft wrap terminator, warm shadow ramp, no bloom halo. Held there by zero roughness or albedo variation at 400%, no ears so no thin-part translucency, no blush at any mood, and `setWet()` rendering the whole body as glossy plastic in five frames. |
| C3 | Eyes & gaze | 9 | 1 | **2** | **+1** | Irises are in view with real key-tracking catchlights — a genuine recovery from 1. But it is not "mechanically correct": no convergence in any frame, visibly divergent in five, the eyes never look at the camera in either portrait, `asleep` lids do not close, and the eyeball is a sphere in a hole rather than in a socket. |
| C4 | Facial expression range | 7 | 1 | **3** | **+2** | Happy, neutral, cry, surprised and sleepy are now distinguishable with UI hidden, brows/lids/cheeks participate, and the **body pose responds to mood**. Held at 3 by `asleep`/`sleepy` rendering with open eyes, blush never appearing, tears rendering as hollow rings, and brows rendering asymmetrically as a bug. |
| C5 | Hair | 6 | 1 | **1** | 0 | Absent in eight frames, a handful of aliased dark strands reading as dirt in four, and in `23-bath-wet` **seven solid brown horns growing out of the face**. This is a regression, not a hold. |
| C6 | Cloth & material believability | 7 | 2 | **2** | 0 | Room material families remain distinct and correct, and the towel and bathmat are genuinely good. But every garment slot shares one diamond-knit texture at one scale with no hem, cuff, gather or thickness; the cloth-deformation shot renders a rigid bucket; the highchair cushion tiles visibly; the tub shell is one roughness over 25% of frame. |
| C7 | Animation quality & secondary motion | 10 | 2\* | **3\*** | **+1** | *\*Provisional — stills only.* Pose now varies genuinely with mood (`05` vs `07`), retiring pass one's byte-identical finding, and `baby.js:456` implements a stochastic idle-gesture scheduler. Against: arms perfectly mirrored in three frames (§4 #63) and airborne blocks in `41` frozen with no motion cue. Timing, easing and overlap remain unassessable. |
| C8 | Environment richness & set dressing | 8 | 3 | **3** | 0 | Outlet, switch, chair rail, real window view, tilted pictures, leaning books, basket contents, food props, a block cluster — all real gains. Held at 3 by the bullseye rug, the starburst grain, countable plank repeats, zero clutter shadows, and a customisation screen whose background is a blank beige wall. |
| C9 | Lighting & mood | 9 | 3 | **2** | **−1** | **Regression.** Six of nine measured frames have zero pixels above 0.95 and under 1.2% below 0.15 — §4 #101; three others clip 2–4% to featureless white — §4 #46; `rain` is `day` at 86% exposure with identical hue — §4 #45 verbatim; `golden` casts no raking shadows; small props cast nothing in `42`/`62`. `52` alone proves the capability exists. |
| C10 | Colour grading & post-processing | 6 | 3 | **2** | **−1** | Tone mapping, no banding, CA fixed, DOF holding the subject — all correct. But the 3 anchor requires "nothing clips" and three frames clip; the measured value range is the 1-anchor symptom in six; `31` is a monochrome orange frame with no colour story; dither noise is visible on flat skin at 400%. |
| C11 | Composition & camera | 6 | 2 | **2** | 0 | Headroom fixed, DOF holding the subject, `dress` and `sleep` recovered. But roughly a third of the set does not usably frame what its own manifest entry asks for: three feed frames shoot the underside of a tray with black voids, `20` crops the head behind the UI, `43` shoots a balloon closeup from 4 m, all three sleep frames bisect the subject with rails, `42` puts a ball over the face, `61` has no subject, and four frames are the same wide shot. |
| C12 | Particle & FX craft | 6 | n/a | **2** | — | Scored this pass. The iridescent bubbles are genuinely good — soft, size-varied, rim-coloured. Everything else fails: foam is faceted icosphere rocks, uniform and hard-intersecting with no soft-particle fade, with a **cloud of them levitating over the tub**; `star` is a hard-edged glyph quad at `soft: 0.10, alpha: 1` scattered as clip-art; no dust motes, no splash, no dust on impact; tears and droplets render as hollow rings; the tap stream shows a black backface. §4 #86, #87, #88, #89, #96. |
| C13 | UI/HUD visual design | 7 | 3 | **4** | **+1** | The strongest work in the build. Warm cream drawn from the world's own palette, one radius scale, custom glossy literal icons, star slots not a numeral, an outfit picker, "!" affordance badges — and a **night theme that flips the whole HUD to navy with filled stars**. That is authored personality. Short of 5 on the doubled-up ten-choice dress screen, the mixed shape language there, the edge crowding, and no assessable micro-interaction. |
| C14 | Readability for a 4-year-old | 8 | 2 | **2** | 0 | Literal icons, five activities, no score, no timer, no fail state — good bones, unchanged. But in four frames the prompt names an action whose target is **not visible or not present** (brush teeth in the sleep scene; put the bib on with no bib and no baby; undress with the baby out of frame), the directional arrow was deleted rather than corrected, and the dress screen presents ten choices. A child is being told to do things they cannot see. |
| C15 | Polish & imperfection detail | 7 | 2 | **2** | 0 | Authored imperfection has genuinely arrived — tilted pictures, leaning books, a block stack, a bathmat fringe. Against it, a fresh list of unresolved artefacts: a **capital "N" printed on the crib mattress**, brown horns on the face, a floating rock cloud, a levitating banana, black voids through the room shell, an unexplained chrome hook, a stray cable in the cot, a dashed line across the jaw in four frames, black backface shards in three. §4 #138 alone would justify a 1; the authored imperfection pulls it to 2. |
| C16 | Overall "would a parent pay for this" | 10 | 1 | **2** | **+1** | `02`, `40`, `43`, `52` and `62` would now pass as a small commercial product, and `03` is recognisably an appealing baby — an enormous move from pass one. But a parent scrolling a store page hits `23` (horns growing out of the face), `51` (the sleeping baby's eyes are open), `10`/`11`/`12` (the underside of a tray against a black void) or `31` (a bucket on the head) within four screenshots. |

```
Weighted mean:      2.33 / 5   (16 categories, total weight 124)
Unweighted mean:    2.31 / 5
Like-for-like:      2.35 / 5   (excluding C12, on pass one's 15-category / weight-118 basis)

Pass one:           1.98 / 5
Delta:              +0.35  (+0.37 like-for-like)

Floor rule applied: yes — C5 = 1 and eleven categories ≤ 2, capping the headline at 3.4.
                    The weighted mean is below the cap, so the cap is not binding.
HEADLINE:           2.33 / 5
```

**Top 3 highest-leverage fixes:**

1. **Rebuild the eye as a socket, not a stuck-on sphere, and make `lidClose` reach the
   geometry.** One construction change and one broken binding are between them costing C3
   (weight 9), most of C4's remaining headroom, and the single most damaging frame in the set
   (`51`). The eye currently intersects the face with a hard boolean rim in every close frame,
   and the `asleep` mood — set correctly at `face.js:428` — does not close it.
2. **Kill the hair system until it can be rebuilt.** In `23` it renders as seven brown horns
   growing out of the baby's face. A bald baby scores 1 in C5 and reads as *a baby*; the current
   state scores 1 in C5 and reads as *an insect*, and it poisons C1, C15 and C16 with it.
   Deleting it is a net gain today.
3. **Restore the value range.** Six frames measure zero pixels above 0.95 and under 1.2% below
   0.15. `52-sleep-lamp-off` proves the pipeline can produce a real range — it is the only frame
   with a true black and the only frame that looks expensive. Getting the other 27 to `52`'s
   histogram moves C9 and C10 together (weight 15) and lifts the perceived quality of every
   asset in the build without touching a single asset.

**Single worst thing in the frame:**

In `51-sleep-asleep` — the shot the manifest itself calls the money shot for lighting — the
sleeping baby's **eyes are open**, and at 400% they are two protruding marbles set in hard-edged
holes cut into the face, with a separate crescent of skin laid over the top as a lid. The
character is asleep and staring. Everything else on this list is a craft deficit; that one is
a horror image.

---

## 4. Fresh ranked defect list

Ordered by score-delta per unit of effort. Pass-one defects that remain open are referenced by
their original number and not repeated here.

### Tier 1 — blocking

| # | Defect | Owner | "Fixed" looks like |
|---|---|---|---|
| **N1** | **The hair system emits solid, glossy, tapered brown horns from the crown and from directly beneath both eyes** (`23-bath-wet`, (575–792, 167–275)). In `03`/`04`/`07` the same system produces a handful of thin dark aliased strands on the crown that read as dirt; in `06`/`50`/`51`/`52` it produces nothing. Three different failure modes across the set. | `src/character/hair.js` | Either soft, thin, correctly-rooted baby hair at the temples and nape that renders identically at every camera distance and in every activity — or the system disabled and the baby bald. Nothing may originate below the eyeline. |
| **N2** | **The eyeball is a sphere sitting proud of the face, not in a socket.** Visible hard boolean cut line at the sphere/skin junction with stair-stepped aliasing (`04`, `24`, `51` at 400%); the lid is a separate crescent flap laid on top with its own hard edge; no lower lid, no lash, no lid crease. Reads as googly craft eyes glued on. | `src/character/face.js` eye/lid construction; `src/character/anatomy.js` eye socket | The eyeball is recessed into a modelled socket with the skin wrapping over it; no hard junction is visible at 400% from any angle; upper and lower lids both present and both deform. |
| **N3** | **`asleep` (`lidClose: 1.0`, `face.js:428`) does not close the lids.** Confirmed open in `50`, `51`, `52`. `sleepy` (`lidLower: 0.92`) likewise renders wide open in `06`. Two of twelve moods render as their opposite. | `src/character/face.js` lid morph binding | `asleep` renders fully closed lids with a soft lower-lash line; `sleepy` renders visibly heavy. Verified in `06`, `50`, `51`, `52`. |
| **N4** | **The `feed` camera is under the highchair tray.** `10`, `11`, `12` show the underside of a seat cushion with only the crown of the skull visible at (720–890, 230–300), plus large regions of **pure black where the room shell ends** at (0–330, 120–370) and (1090–1440, 90–250). Three of 28 frames are unusable and the manifest briefs for all three (bib stains, food on the face, bite marks) are undeliverable. | `src/engine/camera.js` `table` preset; `src/activities/feed.js` | The `table` preset frames the seated baby's face and the tray together, at a height above the tray, with no room-shell void in frame. `10`, `11` and `12` are visibly different from each other. |
| **N5** | **`setWet()` renders the whole body as glossy patent-leather plastic**, including the head above the waterline, with blown highlights on the cranium, shoulders and belly (`22`, `23`, `24`, `25`). This is the C2 1/5 anchor verbatim in four frames. | `src/engine/materials.js` `makeSkin` wet path; `src/character/baby.js` `setWet` | Wet skin darkens the albedo and *tightens* the specular lobe rather than raising a broad clearcoat; wetness is masked to what is actually below the waterline plus splash zones; a blind observer describes it as "wet skin", not "plastic". |
| **N6** | **`setWeather('rain')` produces no rain and no overcast grade.** `room.js:641–646` sets only `_bounceScale = 0.55`; measured, `60` is `01` at 86% exposure with identical hue (mean RGB 173,113,95 → 149,101,85), with the hard sun shaft still on the wall. §4 #45 verbatim. | `src/world/room.js` `setWeather`; `src/engine/lighting.js` MOODS | Rain reads at a glance: droplets and streaks on the glass, the sun shaft gone, a diffuse cool sky key, a lowered and cooled grade. Not an exposure multiplier. |
| **N7** | **Compressed value range across the set.** Six of nine measured frames have **zero pixels above 0.95** and under 1.2% below 0.15, living entirely between ~0.27 and ~0.67; three others clip 2–4% to featureless white. A milky haze veils `01`, `40`, `43`, `60`, `61`, `62`. §4 #101 and #46 simultaneously. Regression from pass one. | `src/engine/render.js` grade/tonemap; `src/engine/lighting.js` MOODS; whatever produces the haze | Every frame carries a true near-black and a true near-white with detail retained at both ends. Target `52-sleep-lamp-off`'s histogram (p1 = 0.02, 8.9% below 0.15) as the reference. |

### Tier 2 — high value, contained

| # | Defect | Owner | "Fixed" looks like |
|---|---|---|---|
| **N8** | **Foam renders as faceted low-poly rocks** (`fx/foam.js:49`, `IcosahedronGeometry`) — uniform grey-beige, uniform size, matte, hard silhouettes, hard-intersecting the body with no soft-particle depth fade, no clumping, no clinging, no drips. And **a cloud of them levitates in mid-air above the tub** in `21` at (650–890, 75–185). | `src/fx/foam.js`; `src/activities/bath.js` foam anchors | Foam reads as lather: soft-edged, translucent at the rim, clumping into a connected mass with variable clump size, clinging to and softening against the body with no cut line, and never unparented from a surface. |
| **N9** | **`star` FX is a hard-edged five-pointed glyph quad** (`fx.js:248` `SHAPE == 3`, `fx.js:143` `soft: 0.10, alpha: 1`) — opaque, uniform in size and colour, no alpha fade, no rotation variance, spawned as a cluster far from the event that caused it (`41`). Reads as clip-art stickers over the render. | `src/engine/fx.js` `star` kind | Sparkles have a hierarchy of a few hero particles among many small ones, soft edges, alpha attack/decay, rotation and colour variance, and spawn at the impact point. |
| **N10** | **Zero contact shadows outside `bath.js`.** `contactShadow()` (`lighting.js:445`) is imported only by `activities/bath.js`; `world/room.js` never calls it. No clutter item in `62` grounds, the block tower in `40` floats, the seated baby in `05`/`07`/`40` has no dark core. No contact hardening anywhere in the set. | `src/world/room.js`; `src/world/props.js` `contactShadows` instancing; `src/activities/play.js` | Every object, including every clutter item and every block, has a tight dark core where it meets the floor, softening with distance from the contact. |
| **N11** | **Prompts name targets that are not visible or not present.** `50`: 「はみがき しようね」(brush teeth) inside the *sleep* activity with no toothbrush; `10`/`12`: 「スタイを つけよう」with neither bib nor baby visible; `20`: 「おふくを ぬがせて」with the baby cropped out. The directional arrow criticised in pass one was **removed rather than corrected**, so prompts now have no pointer at all. | `src/ui/ui.js` `prompt()`; `src/activities/*.js` prompt scheduling | Every prompt names something visible on screen, and carries a pointer or highlight that resolves to that object's screen-space position. No prompt fires for an affordance the current activity does not offer. |
| **N12** | **The customisation screen shows a bare-crotched baby against a blank wall.** `30`: the top's hem cuts across at (600–830, 480–520) with nothing below it; the background is a flat blurred beige wardrobe over ~70% of the frame with no handle, hinge, depth or contents; an **unexplained chrome hook** at (1230–1440, 480–720) is the first thing the eye lands on; ten simultaneous choices in two shape languages sit over the character's legs. | `src/activities/dress.js`; `src/game/state.js` default outfit; `src/ui/ui.js` picker | A diaper is always on. The wardrobe is open with hanging garments and interior depth. The hook is explained or removed. No more than five choices on screen at once, in one shape language, clear of the character. |
| **N13** | **Small residual node leak on dispose.** `docs/shots/console.log` from this very run reports `activity "feed" left 1 scene nodes behind on dispose`, `"feed" left 2`, `"dress" left 2`. Small, and unrelated to the withdrawn D10 measurement, but the warning is firing on the shipped path. | `src/activities/feed.js`, `src/activities/dress.js` `dispose()` | `shoot.mjs` completes a full 28-shot run with an empty `console.log`. |
| **N14** | **Placeholder text in a shipped frame: a capital "N" is printed on the crib mattress** in `52-sleep-lamp-off` at (586–642, 332–382). §4 #138. | `src/engine/textures.js` mattress/sheet generator; `src/world/props.js` crib | No glyph anywhere in the room's procedural textures. |
| **N15** | **Water is opaque and unrefractive.** `20`: the surface is a flat disc with no transparency, meniscus, ripple or steam. `22`/`24`: submerged limbs are invisible, the waterline is a hard cut with a torn white strip, and the "caustics" are a white chalk-doodle loop **on the surface** rather than focused light on the tub floor. The tap stream carries a **solid black backface polygon** at (595–655, 435–500) in `20`. | `src/fx/water.js`; `src/activities/bath.js` | The tub floor is visible through the water and bends; a meniscus darkens where the water meets the body and the tub wall; caustics fall on the tub floor; the stream has no backface. |
| **N16** | **Stray unparented and unexplained geometry across the set**: a levitating banana (`11`, `12` at (655–710, 555–760)); a black cable across the mattress (`06` at (1180–1350, 420–450), `50` at (990–1120, 700–840)); a grey ovoid behind the tub (`23` at (410–660, 235–330)); a floating blue bottle (`24` at (595–640, 290–360)); a flat pink slab across the chest (`23` at (620–790, 292–310)); hard black shards on the torso (`24`, `25`); a dashed white line across the jaw (`03`, `04`, `05`, `07`); pure-black room-shell voids (`10`, `11`, `12`); hard black blanket outlines (`52`). | various — `src/activities/*.js`, `src/character/*.js`, `src/world/room.js` | Nothing in any of the 28 frames is unparented, unexplained, or renders a backface. Each frame survives a 400% sweep with nothing unfinished. |

### Tier 3 — craft polish

| # | Defect | Owner | "Fixed" looks like |
|---|---|---|---|
| **N17** | **The baby has no ears.** `anatomy.js:139` authors an 8 mm half-width ear ellipsoid; `BodyField` still runs at `k = 100` (`anatomy.js:268`), a ~10 mm fillet — the same root cause that ate the nose in pass one. Also costs C2's thin-part translucency, which the 5/5 anchor names explicitly. | `src/character/anatomy.js` | Ears read in silhouette at the `face` preset and glow warm when backlit. Same treatment the nose received. |
| **N18** | **The rug is still a hard-edged concentric bullseye with salt-and-pepper stipple**, now occupying 40–50% of several frames and reading as compression noise at closeup distance. `23`'s bathmat — with real thickness, a folded flap and a tufted fringe — shows exactly what the fix looks like. | `src/world/props.js`; `src/engine/textures.js` `makeCarpet` | Visible pile thickness at the rim, a bound edge or fringe, an off-centre pattern with traffic flattening, a perimeter contact shadow, and multi-octave breakup that reads as fibre rather than noise at 400%. |
| **N19** | **Skin carries no surface information at 400%** — no pore, no freckle, no roughness breakup, no albedo detail anywhere (`04`, `05`). The shading is good; the surface it shades is blank. §4 #19, #20. | `src/engine/textures.js` skin generator; `src/engine/materials.js` `makeSkin` | Roughness varies across the body (glossier nose bridge and lower lip, matte cheeks); painted redness at ears, nose, fingertips, cheeks and knees; visible fine detail at 400%. |
| **N20** | **The face reads as a small adult, not an infant.** Deep nasolabial folds at (700–780, 340–380) in `24`; a small pursed smirk with a cool blue-grey lip line; eyes small relative to a cranium that is 45% of head height; a second cranial lobe at (945–990, 180–280) in `03`/`04`. | `src/character/anatomy.js`; `src/character/face.js` mouth morphs | Larger, rounder eyes; no nasolabial crease at any expression; a warm lip line; a single clean cranial form. Appeal holds at 400%. |
| **N21** | **Light shafts and moonbeams are flat hard-edged quads** with uniform intensity and no falloff — `01`/`43`/`60`/`61` (wall band at 700–1440, 130–320) and `52` (floor bands). No dust motes in any of them, despite `61`'s manifest entry asking for them. | `src/engine/lighting.js`; `src/engine/fx.js` `dust` emitter | Shafts have soft edges and a density falloff along their length, and carry visible drifting dust motes that pick up scene lighting. |
| **N22** | **The balloon is still point-down with a straight unanchored string** (`01`, `02`, `40`, `41`, `43`, `62`), and renders edge-on as a hard red shard in `42` at (570–660, 405–580). The material fix landed; the form fix did not. | `src/activities/play.js`; `src/engine/physics.js` `addRope` | Knot at the bottom, a curved slack string driven by the verlet solver and anchored to something, and enough radial segments that it never reads as a shard. |
| **N23** | **Near-field crib rails bisect the subject in every sleep frame** (`50`, `51`, `52`), and in `06` render as translucent bands laid across the baby's face. | `src/activities/sleep.js`; `src/engine/camera.js` `crib-face` | The camera clears the near rail entirely, or the near rail is a deliberate soft foreground occluder that never crosses the face. |
| **N24** | **Both arms do exactly the same thing at the same time** in `21`, `25` and `41`. §4 #63. | `src/character/anim.js` pose authoring | No pose in the shot set has bilaterally identical arms. |
| **N25** | **Four of 28 frames are the same wide shot** (`01`, `43`, `60`, `62`) and two are near-pixel-identical (`10` vs `12`, mean difference 2.1/255). The shot list is not covering what it claims to cover. | `tools/shots.json`; `src/activities/*.js` state setup | Every entry in `shots.json` produces a visibly distinct frame that demonstrates the thing its `note` field names. |
| **N26** | Unbevelled hard edges with countable segments remain on the highchair tray's curved front (`10`/`11`/`12`, x 350–1040), the wastebasket rim (`23`), the bathmat slab edge (`23`), and the lampshade rim (`52`). D21 partially landed; these were missed. | `src/world/props.js`; `src/activities/bath.js`, `src/activities/feed.js` | A micro-bevel on every hard edge in every activity's props, not just the room's. |

---

## 5. Verdict

### Would this now beat the reference in a blind A/B on a single still?

**No — but for the first time the answer depends on which still, and that is real progress.**

I restate that I have never seen the reference. What follows is reasoning against the rubric's
own written characterisation of it (§1, §0.3): a competent, low-budget, shipped console family
title whose weaknesses are flat lighting, uniform materials, sparse modular set dressing, fixed
forward gaze, a small discrete expression set and generic UI — and whose strength is that it is
a *finished, coherent product* with a complete rigged character.

Pass one's answer was "no, and not close," because the build was below the reference's floor:
the baby had no face, wore nothing, and was absent from four of eleven frames. **That floor has
been cleared.** The baby has a face with a nose and a mouth, wears clothes, has visible irises
with catchlights, and appears in 24 of 28 frames. On `02-room-wide-hud`, `40-play-blocks`,
`52-sleep-lamp-off` and `62-clutter` I think this build would draw or win — the UI is better
than the rubric predicts of the reference, `52`'s lighting is genuinely good, and the room's
prop density and architectural detail exceed what a customisation-driven modular set produces.

It still loses overall, on three things:

**1. The character does not survive a close-up.** The reference's stated weakness is a
*template* baby — generic, symmetric, dead-eyed, but *correct*. This build's baby is not
correct. It has no ears. Its eyeballs are spheres set in hard-edged holes with a crescent of
skin laid over them as a lid. It has nasolabial folds. Its eyes diverge. Asleep, its eyes are
open. In one frame it has brown horns growing out of its face. A blind observer would not call
this "less appealing than the other one" — they would ask what is wrong with it. That is a
different and much worse kind of loss, and the rubric's own §4 #48-class logic applies: a face
that reads as broken poisons every category downstream of it.

**2. The value range collapsed.** Pass one recorded §4 #101 as resolved and told the project to
protect it. It was not protected. Six of nine measured frames now have zero pixels above 0.95
and under 1.2% below 0.15. The rubric's §1.4 comparison anchor is precise about why this
matters: *"Pastel albedo + real value range from light = premium. Pastel albedo + flat light =
cheap."* This build has pastel albedo and, in most frames, flat light. That is the single
largest reason the wide shots read as competent rather than expensive — and `52-sleep-lamp-off`
proves it is a settings problem, not a capability problem. **This is the most expensive
regression in the pass and it should be treated as such.**

**3. A third of the shot list does not frame its own subject.** Three feed frames show the
underside of a tray against black voids. `20` crops the head behind the UI. `43` shoots a
balloon-translucency brief from four metres. `61` is an empty room. `42` puts a ball over the
face. Store-page screenshots come from this list. The reference, whatever else is true of it,
ships frames in which you can see the baby.

### What changed, honestly

The eight-agent pass moved the headline from 1.98 to **2.33**. That is a real gain and it is
concentrated exactly where pass one predicted: the bugs. Nose and mouth exist. The bloom halo is
gone. The camera recovered `dress` and `sleep`. The outfit is on. The UI went from 3 to 4 and is
now the best-designed system in the build. Those were the five hard bugs pass one named, and
four and a half of them are closed.

What pass one got wrong was assuming the art-direction gap was the *next* problem. It is, but
underneath it there is a second layer of hard bugs that pass one could not see because the first
layer was hiding them — the eye socket construction, the `lidClose` binding, the hair system,
the wet-skin material, `setWeather`, the foam geometry, the star particle shape. Those are the
same *kind* of problem as D3 and D4 were, and they will yield to the same kind of work.

**Two things to protect, and one warning.**

- **Protect the UI system** (`ui/hud.css`, `ui/icons.js`, `ui/ui.js`). It went 3 → 4 this pass,
  it has a night theme, and it is now the best argument in the build. A regression here would be
  the most expensive kind.
- **Protect the dry-skin shader.** `03` and `04` show a soft wrap terminator with a warm shadow
  ramp and no halo. That is a legitimate 3-going-on-4 and it took two passes to get.
- **The warning:** C9 and C10 both went *down* this pass, from 3 to 2, on a measurement — not a
  taste judgement. Six frames with zero pixels above 0.95 is not something the eye forgives; it
  is why `01-room-wide`, which pass one called "the best thing in the build and it is not
  close," is no longer that. Whatever was added to the pipeline between the two passes that
  produced the milky haze and lifted the blacks should be found and reverted before anything
  else in Tier 3 is attempted.
