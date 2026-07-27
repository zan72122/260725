# CRITIQUE-03 — Third-pass visual review

**Reviewed:** 2026-07-27
**Frames:** `docs/shots/` — the complete 28-shot `tools/shots.json` set at 1440×900, tier 2
**Rubric:** `docs/VISUAL_RUBRIC.md` §3 (scoring), §4 (failure modes), §6 (contract constraints)
**Previous passes:** `CRITIQUE-01.md` — 1.98 / 5 · `CRITIQUE-02.md` — 2.33 / 5

---

## 0. Scope, honesty, and what this review could not do

### 0.1 No reference imagery — third time

**I have still never seen a frame of *My Universe – My Baby*, and I did not run a side-by-side.**
Outbound HTTPS is blocked and every image host in the rubric's Appendix A returns 403 at the
proxy. `docs/reference/` is empty. Every score below is against the **written** 1/3/5 anchors in
§3 and the numbered failure list in §4, and nothing else. The §5 blind A/B protocol was **not
run** and cannot be run from this environment. The verdict in §5 of this document is an inference
from the rubric's own textual characterisation of the reference (§0.3, §1), explicitly flagged as
such wherever it is used.

### 0.2 What I excluded

**The character's face reading as a small old man / gremlin** — heavy brow ridge, under-eye
hollows, nasolabial folds, the smug asymmetric smirk, the projecting chin, features too small and
too low on the cranium, the lumpy skull silhouette, mitten hands. Known, assigned to a dedicated
art-direction pass, not re-reported and not itemised in the defect list. It is still visible in
every close frame and it still costs C1, C4 and C16 marks, so I have not scored it away — but I
have not spent findings on it either. Everything I *do* report about the character is off that
list: proportion ratio, ear geometry, blush construction, eye mechanics, garment shells, wet
droplets, the spoon.

Also excluded, as before: **D10 (draw-call growth)**, accepted as withdrawn in pass two.

### 0.3 Categories and the evidence available

- **C7 (Animation)** — **scored provisionally again**, marked `*`. Stills cannot show timing,
  easing, overlap or settle. Scored only on what stills can show: pose variance across mood
  states, limb symmetry, motion cues on airborne objects.
- **C14** — assessed from icon literalism, choice count, and prompt/affordance agreement. Tap
  feedback and audio are not assessable from stills and are not scored against.
- **C3, C4** — blink stochasticity, saccades and expression *arcs* are unassessable. Scored on
  static lid/iris/brow geometry and on whether each mood renders as itself.

### 0.4 Measurement, up front

Every frame, measured directly off the PNGs. Luminance percentiles, plus a **per-channel** clip
count, because pass two's notes record a case (`51-sleep-asleep`) where 23.8% of the frame had the
red channel pinned at 255 while the luminance histogram reported 0.00% above 0.95.

| Frame | p1 | p5 | med | p95 | p99 | %<0.15 | %>0.95 | R=255 | G=255 | B=255 | mean RGB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `01-room-wide` | 0.06 | 0.17 | 0.44 | 0.66 | 0.89 | 3.8% | 0.00% | 0.00% | 0.00% | 0.00% | 149,98,89 |
| `02-room-wide-hud` | 0.06 | 0.17 | 0.45 | 0.93 | 0.99 | 3.6% | 3.26% | 3.65% | 0.10% | 0.12% | 157,111,101 |
| `03-baby-face` | 0.05 | 0.14 | 0.37 | 0.58 | 0.67 | 5.7% | 0.00% | 0.06% | 0.00% | 0.00% | 127,84,81 |
| `04-baby-face-neutral` | 0.05 | 0.16 | 0.38 | 0.57 | 0.67 | 4.3% | 0.00% | 0.08% | 0.00% | 0.00% | 128,85,82 |
| `05-baby-cry` | 0.08 | 0.17 | 0.38 | 0.57 | 0.66 | 3.5% | 0.00% | 0.06% | 0.00% | 0.00% | 137,86,80 |
| `06-baby-sleepy` | 0.05 | 0.30 | 0.62 | 0.92 | 0.95 | 2.6% | 0.78% | 1.46% | 0.00% | 0.00% | 198,148,135 |
| `07-baby-full` | 0.03 | 0.11 | 0.33 | 0.53 | 0.61 | 9.3% | 0.00% | 0.00% | 0.00% | 0.00% | 115,75,74 |
| `10-feed-bottle` | 0.01 | 0.08 | 0.41 | 0.91 | 0.99 | 10.2% | 2.70% | 3.45% | 0.10% | 0.12% | 149,104,82 |
| `11-feed-messy` | 0.01 | 0.10 | 0.40 | 0.64 | 0.69 | 8.2% | 0.00% | 0.00% | 0.00% | 0.00% | 145,90,68 |
| `12-feed-apple` | 0.01 | 0.11 | 0.54 | 0.91 | 0.99 | 7.9% | 2.74% | 3.46% | 0.10% | 0.12% | 175,120,89 |
| `20-bath-fill` | 0.03 | 0.12 | 0.42 | 0.91 | 0.99 | 8.0% | 2.54% | 2.20% | 0.10% | 2.46% | 130,107,113 |
| `21-bath-foam` | 0.01 | 0.07 | 0.36 | 0.54 | 0.66 | 11.8% | 0.00% | 0.03% | 0.00% | 0.00% | 112,79,80 |
| `22-bath-splash` | 0.05 | 0.14 | 0.41 | 0.63 | 0.69 | 5.3% | 0.02% | 0.01% | 0.00% | 0.00% | 124,98,102 |
| `23-bath-wet` | 0.01 | 0.08 | 0.33 | 0.57 | 0.67 | 13.5% | 0.00% | 0.02% | 0.00% | 0.00% | 115,73,71 |
| `24-bath-caustics` | 0.06 | 0.15 | 0.41 | 0.63 | 0.72 | 5.2% | 0.09% | 0.01% | 0.00% | 0.00% | 119,98,104 |
| `25-bath-horn` | 0.09 | 0.15 | 0.39 | 0.63 | 0.72 | 4.6% | 0.00% | 0.09% | 0.00% | 0.00% | 124,92,93 |
| `30-dress-outfit` | **0.20** | **0.38** | 0.63 | 0.94 | 1.00 | **0.5%** | 4.21% | **5.84%** | 1.79% | 1.87% | 206,154,123 |
| `31-dress-putting-on` | 0.06 | 0.13 | 0.48 | 0.70 | 0.73 | 7.3% | 0.00% | 1.48% | 0.00% | 0.00% | **177,101,61** |
| `40-play-blocks` | 0.07 | 0.18 | 0.51 | 0.94 | 0.99 | 3.1% | 4.21% | 3.66% | 0.10% | 0.12% | 166,123,117 |
| `41-play-collapse` | 0.06 | 0.17 | 0.49 | 0.86 | 0.94 | 4.1% | 0.15% | 0.02% | 0.00% | 0.00% | 160,113,108 |
| `42-play-ball` | 0.09 | 0.21 | 0.48 | 0.85 | 0.95 | 2.3% | 0.58% | 0.22% | 0.00% | 0.00% | 159,113,110 |
| `43-play-balloon` | 0.05 | 0.15 | 0.36 | 0.58 | 0.67 | 5.2% | 0.00% | 0.01% | 0.00% | 0.00% | 134,80,75 |
| `50-sleep-crib` | 0.05 | 0.17 | 0.56 | 0.93 | 0.96 | 4.2% | 2.09% | 3.46% | 0.02% | 1.21% | 181,131,110 |
| `51-sleep-asleep` | 0.07 | 0.28 | 0.53 | 0.86 | 0.88 | 2.2% | 0.00% | **0.00%** | 0.00% | 0.00% | 167,131,120 |
| `52-sleep-lamp-off` | 0.01 | 0.07 | 0.41 | 0.62 | 0.68 | 13.2% | 0.00% | 0.00% | 0.00% | 0.00% | 110,89,109 |
| `60-weather-rain` | 0.09 | **0.23** | 0.39 | **0.54** | 0.70 | 1.8% | 0.00% | 0.00% | 0.00% | 0.00% | 107,97,104 |
| `61-golden-hour` | 0.02 | 0.10 | 0.32 | 0.64 | 0.67 | 10.7% | 0.00% | 0.00% | 0.00% | 0.00% | 128,78,56 |
| `62-clutter` | 0.03 | 0.13 | 0.38 | 0.59 | 0.76 | 7.1% | 0.00% | 0.00% | 0.00% | 0.00% | 122,85,82 |

**Three things this table says.**

1. **The value-range regression is genuinely repaired.** Direct like-for-like against pass two:
   `01` p1 went 0.16 → **0.06** and %<0.15 went 0.8% → **3.8%**; `03` went 0.18 → **0.05** and
   0.4% → **5.7%**; `61` went 0.16 → **0.02** and 0.8% → **10.7%**. Twenty-four of 28 frames now
   carry a genuine near-black. This was pass two's single most expensive finding and it is closed.
2. **The per-channel red clip is closed where it mattered and survives where it doesn't.** `51`
   measures **0.00%** R=255, against the 23.8% recorded during instrumentation. The 2–6% R=255 now
   showing in `02`, `10`, `12`, `20`, `30`, `40`, `50` is spatially located almost entirely in the
   bottom third and top-left corner — i.e. **it is the cream HUD chrome, not the render.** `01`
   (HUD off) measures 0.00%; `02` (identical frame, HUD on) measures 3.65%. That is a UI colour
   choice, not a lighting failure, and I am not filing it as one.
3. **Highlights were not restored, only darks.** Fifteen of 28 frames still have **zero pixels
   above 0.95 luminance**. The C10 5-anchor asks for "real darks *and* real near-whites present in
   frame." Half the job is done. Two frames go the other way: `30-dress-outfit` is the one frame
   the fix did not reach (p1 = 0.20, 0.5% below 0.15, 5.9% clipped — pass two's exact symptom,
   preserved), and `60-weather-rain` is now the **most compressed frame in the set** (p5 0.23 →
   p95 0.54; the whole image lives in a 31-point band). Rain traded one instance of §4 #101 for
   another.

**One measurement the previous passes did not take: colour temperature.** Mean R:G ratio —
`01-room-wide` (day) **1.52**, `61-golden-hour` (golden) **1.64**, `31-dress-putting-on` **1.75**,
`43` 1.68, `07` 1.53, `62` 1.44. Twelve of the 28 frames are graded to within 0.2 of the same
warm-orange. There is **no neutral daylight anywhere in the build** — `day` is already sunset, so
`golden` has nowhere to go and is separated only by its shadows. `52` (110,89,109) and `60`
(107,97,104) are the only two frames with a different temperature, and `60` is desaturated rather
than cool. This is filed as **P8**.

---

## 1. Verification

Verdicts are against **what renders**, not what the source says.

### 1.1 The claims made for this fix wave

| Claim | Verdict | Verified in | Notes |
|---|---|---|---|
| **Garment shards — `buildPatch` iso-0 / sink-depth-guard fix** | **PARTIAL — and the partial is the headline failure of this pass** | fixed in `03`,`04`,`07`,`40`,`42`,`62` · **not fixed** in `24`,`25`,`31`,`50`,`51`,`52`,`06` | The *play* t-shirt's neckline is genuinely repaired: at 400% (`03`, crop 460–1160 × 490–720) the collar is one clean continuous soft-shaded edge with no shard fringe. That is a real fix and it should be protected. It did not reach the other slots. **`50-sleep-crib`** at 400% (600–1000 × 150–660) shows the pyjama as *three* overlapping translucent shells with torn scalloped boundaries at (150–260, 500–680) and (250–500, 1180–1300 crop), plus a splinter of geometry standing proud of the surface at (600–680, 480–780 crop). **`51`** and **`52`** show the pyjama shredding *through* the blanket as jagged pale-green patches. **`24`** and **`25`** show the same failure on the **nude** body — hard skin-coloured plates with radiating spike fringes at both shoulders (`24` at (555–620, 470–560) and (890–960, 490–620)), which means the shell system is producing shards on a baby that is not wearing anything. **`31`** shows pale shards at (545–580, 305–340) and (720–760, 340–390). Sleeve hems in `03`/`43` still show hard polygonal steps even where the collar is clean. |
| **Blush — geometry authored on the wrong side of the surface** | **FIXED, badly constructed** | `03`,`05`,`07`,`11`,`12`,`24`,`40`,`52` | Blush renders. Pass two could find none at 400% at amplitude 1.0; it is now unmissable. But it is a **hard-edged flat ellipse with no falloff** — see `52` at (760–850, 360–450 in the 340–700 × 300–560 crop), a pink disc with a crisp boundary sitting on the cheek like a sticker, exactly §4 #61's neighbour. And in `05-baby-cry` there are **three** of them on one face: both cheeks plus a fourth patch on the nose bridge / inner brow at (770–800, 350–375), where no blush belongs. Amplitude fixed, placement and falloff not. |
| **Bib — entirely inside the shirt** | **FIXED** | `10`,`11`,`12`,`61` | The bib is outside the shirt, reads as a bib, has a neck strap, and carries a distinct texture from the shirt. Real fix. Two notes, not regressions: the bib is a flat patch with no visible thickness at its edge, and its pink stipple texture at the `11` framing reads closer to cured meat than to towelling. |
| **`setDirt` — `amount` inside a smoothstep** | **NOT FIXED IN FRAME** | `11`,`12` | The threshold bug may well be gone from `materials.js`, but the shot that exists to prove it does not. `11-feed-messy`'s own manifest note is *"Food on the face + bib stains, tight on the face and the spoon."* The face is **clean** at 400%. The bib is **clean**. The only dirt in the frame is three brown stain decals on the *tray* at (490–540, 730–760), (500–560, 840–870) and (590–620, 725–745). This is now the same class of defect pass two filed against blush: closed in code, invisible in the image. |
| **Ears — global 10 mm fillet eating the 8 mm ellipsoid** | **FIXED** | `03`,`04`,`07`,`11`,`23`,`24` | Ears read in silhouette at the `face` preset: `03` at (935–965, 330–390), `04` at (940–970, 335–390), `24` at (900–925, 260–310), and both ears visible in `23` at (630–650, 195–235) and (785–810, 190–230). Same treatment the nose got, correctly applied. **What was not delivered:** the C2 5-anchor names thin-part translucency at the ear explicitly, and the ear in `03` is fully opaque with the key raking across it — no warm transmission at all. |
| **Foam faceting — displacement aliasing, 28.2° normal disagreement** | **FIXED — best fix in the pass** | `21`,`25` | At 400% (`25`, 600–1000 × 80–300) the foam is soft, matte, finely grained, clustered into a connected mass with genuine size variation between clumps, and its contact with the scalp softens rather than cutting. No faceting, no hard silhouettes, no uniform sizing. This is the one FX in the build that meets the C12 3-anchor outright and is reaching toward 4. Protect it. |
| **Levitating foam — `Box3.setFromObject` on a skinned mesh** | **FIXED** | `21` | Nothing at (650–890, 75–185). The airspace above the tub is empty. |
| **The mattress "N" — `zzz` glyph at a random billboard roll** | **PARTIAL — cosmetic only** | `52` | It is now the correct letter and the correct orientation. It is still **a translucent white sans-serif capital "Z", laid flat on the mattress beside the head**, at (395–450, 330–395), with a soft drop shadow, no alpha attack or decay, no size hierarchy, and no billboard to camera — it reads as a letter printed on the bedsheet. §4 **#85** ("emoji or glyph sprites used as particles") is verbatim, and the C12 1/5 anchor names "literal glyph quads" as its example. It is additionally §4 **#129** — Latin text in a Japanese-language game for pre-literate children. Clamping the roll fixed the symptom and left the cause. |
| **Value range — 2:1 ambient-to-key, no black point** | **FIXED** (with two exceptions) | measured, all 28 | See §0.4. Twenty-four of 28 frames now carry a true near-black. `30-dress-outfit` was missed entirely (p1 = 0.20) and `60-weather-rain` is newly compressed at the other end. Highlights were not restored — 15 frames have zero pixels above 0.95. |
| **`51-sleep-asleep` per-channel red clip (23.8%)** | **FIXED** | `51`, measured | 0.00% R=255, 0.00% G, 0.00% B. Verified per channel, not by luminance. |
| **Feed framing — a second decorative highchair, rig sat inside it** | **FIXED — largest single win of the pass** | `10`,`11`,`12` | The duplicate highchair is gone, the camera is above the tray, and face + food are both whole and readable in all three. `10` (bottle, straw, tray spread), `11` (tight, bottle with real glass transmission and a milk volume), `12` (apple with a bite taken out of the real geometry, plus a knocked-over cup) are **visibly distinct from one another** — pass two measured `10` vs `12` at a mean difference of 2.1/255; they now differ by more than 40. Three unusable frames became three good ones. |
| **Prompt arrow — aim lived in a CSS keyframe cancelled by `animations:'disabled'`** | **PARTIAL** | `02`,`40`,`12`,`50` aim · `20`,`30` have none | The arrow now points somewhere other than down: `02` ↙ toward the ball at (490–545, 705–755), `40` ↘ toward the block tower, `12` ↗ toward the baby, `50` ← toward the crib. Real fix. But `20-bath-fill` and `30-dress-outfit` render prompts with **no arrow at all**, so the affordance pointer is present in four frames and absent in two, and there is no visible rule. The bubble also relocates between top-left (`40`), top-right (`10`, `02`) and bottom-left (`12`, `30`) with no evident logic. |
| **`setWeather('rain')` never reached the lighting rig** | **PARTIAL** | `60` | The grade arrived: mean RGB moved from `01`'s 149,98,89 to **107,97,104** — near-neutral, desaturated, the sun shaft gone from the wall, no cast shadows. That is a genuinely different lighting state and §4 #45 is retired. **But there is no rain.** The window at (110–500, 20–300) shows a dry tree, a dry house and clear glass. No droplets, no streaks, no runnels, nothing outside. The frame's own manifest note is "Rain on the glass, overcast grade" — half delivered. And the overcast state is now the most value-compressed frame in the build. |

### 1.2 Outstanding pass-one D-series

Only items pass two left open or partial are listed.

| # | P2 | **P3** | Verified in | Notes |
|---|---|---|---|---|
| **D1** (camera frames the prop, not the subject) | PARTIAL | **FIXED** | `10`,`11`,`12`,`20`,`43`,`61` | All six recovered. `43` is now a genuine balloon closeup with the string run visible to its anchor; `61` has the baby in the highchair with the light falling on it; `20` shows the baby. |
| **D2 / N23** (crib rails bisect the sleeper) | PARTIAL | **PARTIAL** | `50`,`52` bars · `51`,`06` worse | `51` clears the rails but replaces them with something worse (see P1). `52` still frames the subject through a full cage — near rail across (0–1440, 640–780), verticals at x≈100–320 and 1180–1440. `06` has hard vertical **rail shadows** striping the baby's face at (555–585, 240–580) and (630–660, 300–560), which in a still read as dirt on the skin. |
| **D3** (eye convergence) | PARTIAL | **PARTIAL** | `04`,`24` | At 400% in `04`: the frame-right iris is turned inward toward the nose, the frame-left iris is centred. One eye converges and one does not, so the pair still disagrees. In `24` both irises sit left of centre together. Neither hero portrait looks at the camera. |
| **D4** (ears) | PARTIAL | **FIXED** | see §1.1 | The dashed white line across the jaw is also gone; what remains in `04` is a soft horizontal shading band at the jaw/neck at (690–880, 470–495) and in `05` a hard black stroke under the chin at (745–830, 480–500). |
| **D5** (blush invisible) | NOT FIXED | **FIXED** | see §1.1 | Construction quality filed fresh as **P4**. |
| **D7** (`asleep` lids) | PARTIAL | **PARTIAL** | `51`,`52` fixed · `06` not | **`asleep` now closes the lids.** `51` at (510–600, 270–310) and (520–620, 355–405), `52` confirmed at 400% — two closed lid mounds. This was pass two's "single worst thing in the frame" and it is gone. `sleepy` (`06`) still renders with two fully open eyes, visible sclera and full irises. Two of twelve moods became one. New at 400% in `52`: each closed lid is split by a hard vertical seam down its centre, so the shut eye reads as two halves of a walnut. |
| **D8 / N12** (bare crotch on the customisation screen) | PARTIAL | **NOT FIXED** | `30` | The top's hem cuts across at (570–780, 470–520) and there is **nothing below it**. `31` — the *other* dress frame — has a diaper on at (575–800, 415–500), so the asset exists and the default state is wrong. This is the one defect in the set I would call a ship blocker on grounds other than craft. |
| **D9 / N1** (hair emitting horns) | NOT FIXED | **FIXED** | `23` | No horns. Nothing originates below the eyeline. The salmon chest slab is also gone. The system now emits **nothing at all** in all 28 frames — see C5. |
| **D16 / N11** (prompts naming absent targets) | PARTIAL | **PARTIAL** | `02`,`10`,`11`,`12`,`20` fixed · `50` not | Five of six corrected. **`50-sleep-crib` still reads 「はみがき しようね」("let's brush teeth") inside the *sleep* activity, with no toothbrush anywhere in frame**, and the restored arrow now confidently points at a sleeping baby. Same string, same frame, second pass unfixed. |
| **D17 / N12** (dress screen shape language) | PARTIAL | **PARTIAL** | `30` | Shape language **fixed** — at 400% the five garment tiles (960–1380 × 630–740) are the same rounded-square, same shadow, same fill as the activity row, and the icons are custom, glossy and literal (onesie, dress, raincoat, pyjamas, tee). They have moved off the character's legs to the right side. Still **10 simultaneous choices**, over the §4 #130 limit. |
| **D18 / N10** (contact shadows outside `bath.js`) | NOT FIXED | **FIXED** | `62`,`61`,`42`,`07` | At 400% in `62` (240–700 × 600–800) the block stack, the loose blocks, the ball and the xylophone all carry a tight dark core at the contact softening outward. `07` and `42` have a real dark core under the seated body. `61` grounds the highchair with a long raking cast shadow on the floor **and** the wall. This was a Tier-1 defect for two passes and it is closed. |
| **D19** (block/body intersection) | PARTIAL | **NOT FIXED** | `41` | The green block at (725–805, 548–625) is still buried in the chest with a hard cut line at (735–790, 585–620). |
| **D20** (golden hour indistinguishable) | NOT FIXED | **PARTIAL** | `61` | **Raking shadows have arrived** — the highchair casts a long, correctly-shaped shadow on the wall at (1040–1330, 190–500) and the window blind stripes the whole floor. That is the fix. But `golden` measures R:G 1.64 against `day`'s 1.52 — it is only 8% warmer than the frame it is supposed to contrast with, because `day` is already sunset. And the shaft has no volume: there is no beam, no falloff, and **no dust motes**, which the frame's own manifest note asks for by name. |
| **D24 / N18** (bullseye rug) | NOT FIXED | **NOT FIXED** | `01`,`05`,`07`,`40`,`42`,`43`,`60`,`62` | Unchanged. A hard-edged concentric ellipse with a salt-and-pepper stipple, no pile thickness at the rim, no fringe, no ruck. It occupies 40–50% of `05`, `07`, `42` and `43`. `23`'s bathmat, with real thickness, a folded flap and a tufted fringe, is still in the same build showing what the fix looks like. |
| **D25** (rug reads as compression noise at closeup) | NOT FIXED | **NOT FIXED** | `05`,`07`,`42` | Unchanged. |
| **D35 / N22** (balloon form and string) | PARTIAL | **PARTIAL** | `43` improved · `01`,`40`,`62` not · `42` not | `43` is a real improvement: the string now runs to a visible anchor on the drum at (285–300, 685–700). But the string is **dead straight with zero slack or catenary**, and the balloon's silhouette comes to a **point at the top** as well as at the neck — a lemon, not a balloon. In `01`, `40` and `62` the string still terminates in mid-air on the rug with no knot. In `42` the balloon still renders edge-on as a hard dark-red shard at (585–645, 400–500), immediately behind the ball, both of them over the baby's face. |
| **D37** (tub shell through the stand) | NOT FIXED | **FIXED** | `21`,`23` | The tub now sits on the stand with the rails reading in front and behind correctly. |
| **D42** (boneless limbs, mitten hands) | NOT FIXED | on the assigned list | — | Not re-reported. |
| **D43** (brows as decals) | PARTIAL | **NOT FIXED** | `25`,`05` | At 400% in `25` the brows are two flat dark-grey rounded rectangles of uniform width with hard edges — stick-on decals. In `05` one brow renders as a thin dark arc and the other is absent entirely. |
| **D50 / N24** (both arms doing the same thing) | PARTIAL | **NOT FIXED** | `21`,`24`,`25` | Arms perfectly mirrored in all three bath frames. §4 #63. |

### 1.3 Pass-two N-series

| # | Verdict | Verified in | Notes |
|---|---|---|---|
| **N1** hair horns | **FIXED** | `23` | See D9. |
| **N2** eyeball as a stuck-on sphere | **PARTIAL** | `04` at 400% | The skin now wraps the eyeball with a soft blend rather than a boolean rim, and there is no stair-stepped junction. Genuine improvement. What remains: **no lower lid at all** — the sclera runs straight into the cheek; no lash, no lid crease; the upper sclera carries a **hard-edged flat blue-grey band** in both eyes that reads as painted rather than as a lid shadow; the iris is a featureless dark disc with no limbal ring and no visible pupil boundary; and **both catchlights sit on the outer sclera edge, off the cornea**, rather than over the iris. |
| **N3** `asleep`/`sleepy` lids | **PARTIAL** | `51`,`52` yes · `06` no | See D7. |
| **N4** feed camera under the tray | **FIXED** | `10`,`11`,`12` | Room-shell voids gone too. `10`'s upper-left region at (0–330, 0–330) is now a legible dark doorway with a lit floor beyond, not a pure-black hole. |
| **N5** `setWet` as patent leather | **FIXED** | `21`,`22`,`23`,`24`,`25` | The skin is matte and warm in all five. No clearcoat, no blown cranium. What replaced it is filed fresh as **P5** — the droplets. |
| **N6** `setWeather('rain')` | **PARTIAL** | `60` | See §1.1. |
| **N7** compressed value range | **FIXED** (2 exceptions) | measured | See §0.4. `30` and `60` are the exceptions. |
| **N8** foam as faceted rocks / levitating | **FIXED** | `21`,`25` | See §1.1. |
| **N9** `star` FX as a glyph quad | **FIXED, into absence** | `41` | The hard five-pointed clip-art clusters are gone. What is there instead is two small soft sparkles on the *dresser* at (1265–1290, 508–530) and (1180–1200, 590–610), still nowhere near the collapsing tower. The manifest asks `41` for "motion, contact, dust" — there is no dust, no impact burst, and no motion cue of any kind on six airborne blocks. |
| **N10** contact shadows | **FIXED** | `62`,`61`,`42`,`07` | See D18. |
| **N11** prompts naming absent targets | **PARTIAL** | `50` | See D16. |
| **N12** customisation screen | **PARTIAL** | `30` | Tiles fixed. Bare crotch **not** fixed. The wardrobe now has panel mouldings but is still a flat blurred slab over ~60% of frame with no handle, no hinge, no opening and no contents. The **unexplained chrome hook at (1200–1440, 480–800) is still there**, still the highest-contrast object in the frame, and still the first thing the eye lands on — in `31` too. |
| **N13** node leak on dispose | **PARTIAL** | `console.log` | Was `feed` 1 + `feed` 2 + `dress` 2. Now `feed` 1 + `dress` 2. Reduced, not empty. |
| **N14** capital "N" on the mattress | **PARTIAL** | `52` | See §1.1. Right letter, wrong medium. |
| **N15** opaque unrefractive water | **PARTIAL — large win, incomplete** | `22`,`24` yes · `20` no | **`22-bath-splash` and `24-bath-caustics` now have genuinely transparent water**: the tub floor is visible through it, submerged toys read clearly, and there is a waterline where the body enters at (640–900, 590–640). That is a real fix and it transforms two frames. Not fixed: `20-bath-fill`'s surface is still a flat opaque lavender disc; the caustics in `24` are still white chalk-doodle loops **on the surface** at (390–500, 555–590) rather than focused light on the tub floor; the submerged legs are still not visible and not refracted in either frame; there is no steam in `20` despite the brief. The tap impact is filed fresh as **P9**. |
| **N16** stray unparented geometry | **PARTIAL** | mixed | **Gone:** the levitating banana (`11`/`12` — it now lies on the tray), the pink chest slab (`23`), the room-shell voids (`10`/`11`/`12`), the dashed jaw line, the hollow-ring tears. **Still present:** the black cable across the mattress (`06` at (1180–1350, 175–200), `50` at (960–1090, 600–625), `52` at (790–830, 690–780)); the grey ovoid behind the tub (`23` at (395–560, 225–355)); the chrome hook (`30`, `31`). **New:** see P1, P2, P9, and the stray dark line across the floorboards in `43` at (0–170, 555–585). |
| **N17** no ears | **FIXED** | see §1.1 | |
| **N18** bullseye rug | **NOT FIXED** | see D24 | |
| **N19** no skin surface information at 400% | **NOT FIXED** | `04` | At 400% the cheek, forehead and jaw are completely blank — no pore, no freckle, no roughness breakup, no albedo detail. Only dither noise. §4 #19, #20. |
| **N20** face reads as a small adult | on the assigned list | — | Not re-reported. |
| **N21** flat light shafts, no dust motes | **PARTIAL** | `61` shadows yes · motes no | The raking shadows arrived (D20). The volumetric shaft and the dust motes did not — I can find no drifting motes in `61`'s beam. The white specks scattered across the *walls* in `01`, `41`, `42`, `62` are a different thing and read as sensor grain on a matte surface, not as motes in air. |
| **N22** balloon form and string | **PARTIAL** | see D35 | |
| **N23** crib rails | **PARTIAL** | see D2 | |
| **N24** mirrored arms | **NOT FIXED** | `21`,`24`,`25` | |
| **N25** duplicate framings | **PARTIAL** | measured | `10` vs `12` now differ by >40/255 (was 2.1). `43` has its own camera. But `01`, `60` and `62` are still the identical wide framing — `01` vs `62` measures a mean difference of 16.3/255, which is the clutter and nothing else. |
| **N26** unbevelled edges on activity props | **PARTIAL** | `23`,`52` | The highchair tray's curved front is fixed and now reads smooth in `10`/`11`/`12`. The wastebasket rim (`23`, 100–360 × 375–430) and the lampshade rim (`52`) are still hard bands. |

**Summary of verification:**
**16 FIXED · 21 PARTIAL · 8 NOT FIXED.**
Four fixes landed cleanly and are the reason the score moved: the feed camera, contact shadows,
the value range, and the foam. Three claimed fixes are cosmetic rather than causal (the "Z", the
blush construction, the rain grade without rain). One claimed fix — `setDirt` — cannot be seen at
all in the frame that exists to demonstrate it. And **the garment-shard fix reached one slot out
of seven**, which is the single largest gap between what was reported and what renders.

---

## 2. Per-shot critique — all 28 frames

### `01-room-wide` — establishing, play/wide/day
The best it has ever been, and the value-range repair is the reason: p1 = 0.06 against pass two's
0.16, with 3.8% genuine shadow. The window blind now casts a long soft shape across the floor and
the rug; the crib, dresser, chair and pouf are all grounded. Bunting, mobile, clock, outlet, light
switch, chair rail, tilted pictures, leaning books, a basket with contents — the architecture is
commercial-grade. Against it: the frame is **graded sunset-orange** (mean 149,98,89) in a state
called `day`, so there is nowhere left for `golden` to go. The rug is the same hard-edged
concentric bullseye. The balloon at (440–500, 540–660) is a point-topped lemon whose straight
string dies in mid-air on the rug at (470, 680). The white specks scattered across the *walls* at
(990, 430), (1140, 300) and (490, 470) read as sensor grain, not as dust in air. There is a dark
red smear on the floorboards at (740–790, 452–462) with no explanation. The baby occupies about
2% of the frame and is not the brightest thing in it — the window is.

### `02-room-wide-hud` — same framing, HUD on
The UI remains the best-designed system in the build. Cream drawn from the nursery's own palette,
one radius scale, one shadow language, five literal glossy icons in one row, star slots, a mute
and a book affordance. **The prompt arrow aims again** — ↙ at (1040–1070, 105–135), toward the
ball at (490–545, 705–755) — and the prompt names something actually in frame. Two findings. At
400% the meter row (30–700 × 25–110) contains four icons of which three — apple, droplet, bolt —
are custom, glossy, gradient-shaded with modelled highlights, and the fourth, ごきげん, is a **flat
yellow circle with two black dots and a black arc**, no gloss, no highlight, hard 2px stroke. It
is the only icon in the build drawn in a different language and it reads as a system emoji whether
or not it is one. Second: the R=255 measurement in this frame (3.65%, against `01`'s 0.00%) is
entirely the HUD chrome — the cream panels are pure-white in red. That is a palette decision, and
it means the HUD is brighter than anything in the render.

### `03-baby-face` — hero portrait, happy
Blush arrived and it changes the read: two rosy patches at (620–660, 360–390) and (825–880,
350–390). The ear reads at (935–965, 330–390). The collar at 400% is one clean edge — the shard
fix landed here. The DOF holds the face and drops the crib rails behind. Against: at 400% the skin
carries **no surface information at all** — no pore, no freckle, no roughness variation, nothing
but dither. The sleeve hem at (1050–1110, 570–640) still shows hard polygonal steps, and the
fabric goes **semi-transparent** across the upper chest at (620–900, 520–560), showing skin
through the knit. Both catchlights sit at the outer edge of the sclera rather than on the cornea.
Neither eye looks at the camera in a shot whose entire purpose is the face.

### `04-baby-face-neutral` — neutral
Mechanically the most informative frame in the set and the one I zoomed hardest. The eyeball is no
longer a boolean sphere — the skin wraps it with a soft blend, which is a real fix. What the 400%
shows instead: **no lower lid anywhere** (the sclera runs straight into the cheek); a hard-edged
flat blue-grey band across the top of both sclerae that reads as paint, not as a lid shadow; an
iris that is a featureless dark disc with no limbal ring and no readable pupil; and **one eye
converged, one not** — the frame-right iris turns toward the nose while the frame-left iris sits
centred. There is a soft horizontal shading discontinuity across the jaw/neck at (690–880,
470–495). No blush at neutral, which is defensible, but it means the frame the manifest calls
"hardest to make appealing" is the one with the least going for it.

### `05-baby-cry` — tears, mouth interior, brow deformation
The lids squeeze shut, the brows move, the body arches with both arms up — the mood genuinely
reads, and against pass two the tears are no longer hollow rings. That is progress. Everything
else at 400% is worse than pass two could see. **The open mouth renders as a glossy scarlet
lozenge lying outside the mouth on the chin** at (770–820, 460–490), with the actual mouth line a
thin dark stroke beneath it — the emotional beat the whole game turns on renders as a tongue
hanging on the face. The tears are **opaque blue-grey lozenges**, one of them a flattened capital
lying across the closed right lid at (855–900, 355–385), reading as a slug rather than water. The
blush is three discs, one of them on the nose bridge at (770–800, 350–375). One brow is a thin
dark arc, the other is absent. There is a hard black stroke under the chin at (745–830, 480–500).
The garment carries a thick white feathered fringe along both shoulders at (570–640, 490–560) and
(860–980, 490–620).

### `06-baby-sleepy` — heavy lids, night lighting on skin
The worst-composed frame in the set and one of the two worst overall. **The eyes are fully open**
— visible sclera and full irises at (600–680, 250–310) and (610–690, 380–460) — in the frame whose
manifest note is "heavy lids". `sleepy` renders as its opposite, unchanged from pass two. The lamp
blows the left quarter of the frame (200–700, 100–700) to a featureless pale field; median
luminance is 0.62, the highest in the set, and p5 is 0.30, so this frame has neither shadow nor
detail. **Hard vertical crib-rail shadows stripe the baby's face** at (555–585, 240–580) and
(630–660, 300–560) — in a still they read as streaks of dirt on the skin. The pyjama and blanket
at (780–1100, 150–700) are shattered into large flat triangular facets with hard shading breaks.
The black cable is still across the mattress at (1180–1350, 175–200). The head sits in the left
third with a quarter of the frame as blank mattress and no compositional reason for it.

### `07-baby-full` — full body, proportions, silhouette, contact shadow
Contact shadow is now correct: a real dark core under the torso on the rug, softening outward.
Chub reads at the thighs and wrists. Blush on the visible cheek at (795–840, 420–455). Against:
this is the frame that exposes the **proportion** problem — measured against `30`, the head is
roughly a quarter of standing height, a **1:4 head-to-body ratio**, which is real-infant
proportion rather than the 1:2.5–3.5 the rubric's C1 anchor calls for and the 1:2.5–3 the 5-anchor
demands. The build is *under*-stylised for its genre, and that costs appeal at exactly the
silhouette level the reference is said to get right. The legs end in rounded stumps with no ankle
articulation; the rug fills 45% of the frame as undifferentiated stipple.

### `10-feed-bottle` — the fix
Transformed, and this is where the pass earns most of its score. The camera clears the tray, the
face and the whole spread — bowl, spoon, apple, cookie, juice box, banana — are readable, the bib
is on and outside the shirt, the highchair casts a large soft shadow on the wall, and the top-left
is a legible doorway instead of a black void. Against the manifest's own brief: it asks for "glass
transmission, milk volume" and the object in the baby's hand at (510–620, 430–560) is an **opaque
grey-tan cylinder** that reads as a paper cup, held mid-air over the tray rather than at the
mouth, while the mouth is occupied by a thumb. The right hand at (1000–1130, 390–460) holds a
striped straw. The right quarter of the frame is a blank tan wall. The prompt reads 「ごくごく…おいしいね」
("glug glug… tasty") over a baby that is not drinking.

### `11-feed-messy` — tight on the face and the spoon
The best-lit and best-composed feed frame, and it contains the single most alarming object in the
28. **A chrome spoon bowl is embedded in the baby's throat** at (635–720, 355–405), half-buried,
with the handle disappearing into the jaw — at 400% it is unmistakably a prop lodged inside the
neck. Beyond that: the manifest asks for "food on the face + bib stains" and the face and bib are
**clean**; the only dirt is three brown decals on the tray. The bottle at (215–370, 260–680) is
genuinely good — real glass transmission, a milk volume with a visible surface, moulded
graduations — and is the best single material in the build; it also reads oversized against the
head. The bib's pink stipple at this distance reads closer to cured meat than to towelling.

### `12-feed-apple` — two bites in
Meets its brief: the apple at (730–840, 240–350) carries a real bite taken out of the geometry,
and the frame is unmistakably a different moment from `10`. The knocked-over cup at (1140–1310,
550–660) is exactly the kind of authored disorder the C8 5-anchor asks for. The prompt bubble
carries a working ↗ arrow. Against: **no hand holds the apple** — the right arm is extended to the
right at (900–1090, 350–420), the left is down at (700–810, 540–620), and the apple hovers at the
mouth unsupported. The right half of the frame above the tray, (620–1440, 0–450), is a blank cream
wall with nothing in it.

### `20-bath-fill` — water surface, refraction, steam
The bathroom corner is well set — towel rail with a real towel, soap dispenser, sponge, wastebasket,
open chest, the tub on a proper stand. The baby is now visible at (410–680, 520–900) rather than
cropped out, so the prompt has a subject. Against, and the brief asks for all three: the water is a
**flat opaque lavender disc** with no transparency, no meniscus and no ripple; there is **no steam**;
and at 400% the tap impact at (595–700, 400–500) is an **opaque dark navy-green lens with a hard
stippled silhouette** sitting on the surface, beside a **stray hard-edged orange quad** at (640–680,
425–470) that has no referent in the scene. The stream itself is a flat ribbon with aliased edges
that stops dead at the surface with no crown and no foam. The prompt has no arrow while four other
frames do. The wastebasket interior at (30–190, 780–880) is flat black with no AO gradient.

### `21-bath-foam` — foam, bubbles, iridescence
One of the four best frames. The foam is the fix of the pass — soft, clumped, size-varied, matte,
contacting the scalp and the water without a cut line. The iridescent bubbles at (500–520, 425–440),
(760–790, 505–525) and (1030–1050, 435–455) remain excellent. Wet skin is matte and warm, not
patent leather. Against: **both arms are perfectly mirrored** (§4 #63); the water is still an
opaque plane so nothing below the surface reads; the foam mass, good as it is, still resolves into
discrete opaque blobs with dark contact lines rather than a translucent lather at its rim; and
there is a hard notch cut out of the left arm at (630–670, 420–470).

### `22-bath-splash` — splash particles, wet skin
The water is now **transparent** — the submerged body and the tub floor read through it at
(600–900, 590–660) with a real waterline. That is a genuine and large fix. The frame is also the
most colour-neutral in the set (mean 124,98,102). Against: **there is no splash.** The frame's
entire brief is splash particles and I can find none — no droplets in air, no crown, no rings,
nothing but the tap ribbon. The wet "droplets" on the body are the problem described under `24`.
The water surface at (400–700, 500–620) carries a silver sheen that reads closer to mercury than
to water.

### `23-bath-wet` — wet skin roughness, drips, towel
The horns are gone and the frame is recovered from being the set's worst. The wastebasket is solid
with a woven texture and a correct contact shadow; the bathmat has real thickness and a tufted
fringe. Against: the **drips are opaque flesh-and-grey ovoids with dark outlines stuck to the
skin** — six on the crown at (680–780, 95–135), more on the shirt and arms — which at any distance
read as blisters, not water. The **grey ovoid behind the tub at (395–560, 225–355) is still there
and still unexplained**, two passes running. The bathmat's folded flap at (620–930, 545–870) is a
large flat sheet with a hard 90° corner at (430–540, 620–660) that reads as paper. The face
carries dark scribbled marks at (620–660, 175–200) and (795–820, 195–215).

### `24-bath-caustics` — refraction, caustics, meniscus, glints
This frame contains the clearest evidence that the garment-shard fix did not land. At 400%
(520–1050 × 400–650) the torso carries a **second hard-edged shell with radiating triangular
spikes at both shoulders** — (555–620, 470–560) and (890–960, 490–620) — on a body wearing nothing
at all, plus a hard rectangular step at the neck. Against the brief: the submerged legs are not
visible and not refracted; the "caustics" are still white chalk-doodle loops **on the surface** at
(390–500, 555–590) rather than focused light on the tub floor; there is no waterline meniscus
darkening where the body enters. The blush discs at (665–700, 330–360) and (845–880, 340–370) have
crisp boundaries. Both irises sit left of centre together. The blue bottle at (595–645, 285–370)
is ambiguous — it may be resting on the far rim, but at this angle it reads as floating.

### `25-bath-horn` — lather volume, sculpted peak, iridescence
The foam at 400% is the highest-craft thing in the build: soft, finely grained, clustered into a
connected mass with genuine clump-size variation, softening rather than cutting where it meets the
scalp. Against: the brief asks for a **sculpted peak** and what renders is a rounded cap — there is
no horn. The brows are two flat dark-grey rounded rectangles of uniform width, unmistakably
decals. The same shoulder shards as `24` at (600–660, 430–540) and (900–960, 590–650). Both arms
mirrored again.

### `30-dress-outfit` — wardrobe and outfit selection
The frame with the most unfixed defects, and the only one where the value-range repair did not
land at all: p1 = 0.20, 0.5% below 0.15, 5.9% clipped — pass two's exact symptom preserved in one
place. **The baby is still bare-crotched** — the top's hem cuts at (570–780, 470–520) with nothing
below, while `31` has a diaper on, so the asset exists and the default is wrong. The **chrome hook
at (1200–1440, 480–800) is still there** and is still the first thing the eye lands on. The
wardrobe is still a flat blurred slab over ~60% of frame — panel mouldings were added, but no
handle, no hinge, no opening, no contents. The top hangs off both shoulders at (555–790, 250–300)
like a garment two sizes too big. Ten simultaneous choices, and the prompt has no arrow pointing at
the five that matter. What *did* land: the garment tiles are now one shape language with the
activity row, they are custom-drawn and literal, and they are clear of the character.

### `31-dress-putting-on` — garment mid-way over the head, cloth deformation
The frame's entire subject is cloth deformation and **the garment renders as a rigid open-ended
cone** at (575–760, 0–215) with a hard rim, no folds, no gathers and no contact with the head —
which pokes out of its side rather than through it. Unchanged from pass two. The cone is also
**cropped by the top frame edge**, so the shot's subject is cut. The frame is the most
monochromatic in the build: mean RGB 177,101,61, an R:G ratio of 1.75, with no cool anywhere.
Shards on the shoulders at (545–580, 305–340) and (720–760, 340–390). The chrome hook again. The
diaper *is* on, which makes `30` harder to excuse.

### `40-play-blocks` — block tower, wood, AO
A good frame. Six blocks stack with embossed symbols and per-instance colour variation, the prompt
arrow aims ↘ at them, the UI is at its best, the crib and dresser read well. Against: the window
bloom at (100–560, 100–400) is a **broad haze over roughly 15% of the frame**, not a
threshold-limited highlight — §4 #102. There is a **hard square specular highlight** on the
balloon at (262–278, 483–499), an aliased axis-aligned rectangle with no falloff. The balloon is
the same point-topped lemon with a string dying on the rug. The tower is pushed to the extreme
right edge with a large empty rug between it and the baby.

### `41-play-collapse` — motion, contact, dust
The mood reads as surprised and the block spread is believable. Everything the brief asks for is
missing: **no dust**, no impact burst, no motion blur, no trail, no squash on contact — six blocks
hang in mid-air completely inert, and the only FX in frame are two small sparkles on the *dresser*
at (1265–1290, 508–530), nowhere near the event. A green block is still buried in the chest at
(725–805, 548–625) with a hard cut line. Removing the clip-art stars was correct; nothing replaced
them.

### `42-play-ball` — ball and crawl pose
The ball is a proper 3D beach ball with a clean specular, and the contact shadow under the seated
body at (520–820, 700–760) is correct. But it is **directly over the baby's face** at (490–620,
405–535), and immediately behind it the balloon renders **edge-on as a hard dark-red shard** at
(585–645, 400–500) that appears to stab through the head. Two objects occluding the subject's face
in one frame, unchanged from pass two. The right 40% of the frame is empty rug and crib.

### `43-play-balloon` — translucency, string, anchor
Recovered from a 4-metre wide shot to a genuine closeup — a real camera fix, and the string now
runs to a visible anchor on the drum at (285–300, 685–700). The drum itself is a well-made prop.
Against: the string is **dead straight with zero slack** and the balloon's silhouette comes to a
**point at the top**, so it reads as a lemon rather than a balloon. On the shirt at (1210–1330,
440–540) and (1000–1080, 420–470) there are **large milky-white blown patches** — a broad specular
on cloth that reads as bleach stains, §4 #30. There is an unexplained dark line across the
floorboards at (0–170, 555–585). The baby's eyes at (1125–1175, 295–335) render as large pale
crescents that do not read as eyes at this angle.

### `50-sleep-crib` — warm practical light, blanket cloth, mood
The night HUD theme — navy with filled stars — is still the best-authored UI moment in the build.
Everything under it fails. At 400% (600–1000 × 150–660) the pyjama is **three overlapping
translucent shells with torn scalloped boundaries** at (150–260, 500–680) and (250–500, 1180–1300
in crop coordinates), with a **splinter of geometry standing proud of the chest**. The blanket is a
rigid faceted slab with hard creases and a **pure-black gap** along its base. The lamp blows the
left quarter of the frame to featureless cream and the face is unreadable inside it. The prompt
**still reads 「はみがき しようね」("let's brush teeth") in the sleep activity with no toothbrush in
frame**, and the restored arrow now points confidently at a sleeping baby. The black cable is
still on the mattress at (960–1090, 600–625).

### `51-sleep-asleep` — the money shot for lighting
**The eyes are closed.** Pass two's "single worst thing in the frame" is gone, and that deserves
saying first. What replaced it is a different failure of comparable size. A **razor-straight
vertical seam runs the full height of the frame at x ≈ 700–730** — the blanket's edge, lit as a
bright cream strip — splitting the image in two with the baby's head jammed against its left side.
At 400% the blanket is a rigid folded card with hard diamond facets that does not drape, and the
pyjama shreds **through** it as jagged pale-green patches at (1090–1240, 220–500), (760–1000,
540–720) and (880–980, 90–180). The left half of the frame is a wash of pale cream with the face
in it at almost no local contrast. The shot the manifest calls the money shot for lighting is now
the worst-looking frame in the set.

### `52-sleep-lamp-off` — moonlight only
Still the best-graded frame in the build: cool blue key against warm skin (mean 110,89,109), 13.2%
genuine shadow, crib-rail shadows on the wall, and a lovely corner of props — a star-print book, a
teddy-print box, a lamp base. The eyes are closed. Against: **a translucent white sans-serif
capital "Z" lies flat on the mattress beside the head** at (395–450, 330–395) — a literal
typographic glyph used as in-world FX art, §4 #85, in a Japanese-language product for pre-literate
children. Each closed lid is split by a hard vertical seam. There is an **unexplained dark scribble
on the sheet beside the head** at (395–425, 460–490) that reads as handwriting. The pyjama shreds
through the blanket at (680–900, 400–620) and (830–1000, 380–520). The black cable is at (790–830,
690–780). The baby is behind a full cage of rails.

### `60-weather-rain` — rain on the glass, overcast grade
The grade arrived and it is a genuinely different lighting state — desaturated, near-neutral, sun
shaft gone. **There is no rain.** The window at (110–500, 20–300) shows clear glass, a dry tree and
a dry house. And the frame is now the **most value-compressed in the build**: p5 0.23, p95 0.54,
zero pixels above 0.95, only 1.8% below 0.15 — the entire image occupies a 31-point band. That is
§4 #101 verbatim, in a frame that was supposed to demonstrate the fix for it. Nothing casts a
contact shadow: the pouf at (150–330, 500–620), the crib legs and the dresser all sit on flat
floor. The framing is identical to `01`.

### `61-golden-hour` — shaft, falloff, and a subject
The most improved frame in the set and, on its own, the best argument the build has. The baby **is
in the highchair**, the highchair casts a long correctly-shaped shadow on the wall at (1040–1330,
190–500), the window blind rakes the entire floor, and the second decorative highchair is gone.
Against: **no dust motes**, which the brief names; no volumetric shaft, only shadows on surfaces;
and `golden` measures R:G 1.64 against `day`'s 1.52, so it is only marginally warmer than the
state it should contrast with. There are roughly five **unexplained dark purple ellipses scattered
on the floorboards** at (855–880, 620–640), (770–790, 765–785), (525–545, 680–700) and (615–635,
810–830). A glass tumbler sits on the nursery floor at (780–920, 700–900) with no contact shadow
and no reason to be there. The bottom-left quarter is bare plank.

### `62-clutter` — lived-in room
Clutter is now real and, crucially, **grounded**: at 400% the block stack at (280–390, 640–740),
the loose blocks, the ball and the xylophone all carry a tight dark contact core softening
outward. Items sit off the rug on bare boards, one stack is mid-build, blocks vary in rotation,
colour and embossed symbol. This is the C8 5-anchor working. Against: it is the **identical camera
to `01` and `60`** — measured, `01` vs `62` differ by 16.3/255, which is the clutter and nothing
else. The rug is the same bullseye. The balloon string still dies in mid-air. A block is cropped
by the bottom edge at (655–720, 865–900).

---

## 3. The 16-category score table

| # | Category | W | P1 | P2 | **P3** | Δ | One-line justification |
|---|---|---|---|---|---|---|---|
| C1 | Character appeal & proportions | 10 | 2 | 2 | **2** | 0 | Ears arrived and the eye is no longer a boolean sphere, but the shell system still produces spiky plates on the **nude** torso (`24`, `25`) and three overlapping torn shells on the pyjama (`50`), so "forms are clean" is not met; and the head-to-body ratio measures ~**1:4** in `30`/`07`, under-stylised against the 1:2.5–3.5 the anchor calls for. |
| C2 | Skin shading & subsurface feel | 8 | 2 | 3 | **3** | 0 | Two real fixes — blush renders, and `setWet` no longer produces patent leather — offset by their construction: blush is a hard-edged flat disc that also lands on the nose bridge (`05`), drips are opaque outlined ovoids that read as blisters (`23`, `24`), the new ears carry no thin-part translucency (`03`), and at 400% the skin still has **zero** albedo or roughness detail (`04`). |
| C3 | Eyes & gaze | 9 | 1 | 2 | **3** | **+1** | `asleep` now closes the lids (`51`, `52`) — pass two's worst single item, closed. Held at the 3 line and no further by `sleepy` still rendering wide open (`06`), one eye converged and one not (`04`), no lower lid or lash anywhere, catchlights parked on the sclera edge rather than the cornea, and neither hero portrait looking at the camera. |
| C4 | Facial expression range | 7 | 1 | 3 | **3** | 0 | Happy, neutral, cry, surprised, yum and asleep all read with the UI hidden, and blush now participates. Held at 3 by the cry mouth rendering as a scarlet lozenge **outside** the mouth (`05`), tears as opaque blue-grey slugs, brows as flat decals of which one is missing in `05`, and `sleepy` rendering as its opposite. |
| C5 | Hair | 6 | 1 | 1 | **1** | 0 | The horns are gone, which is a genuine improvement to a 1 — but the system now emits **nothing in any of the 28 frames**, and "no hair" is the C5 1/5 anchor verbatim. The foam cap in `21`/`25` is the only thing on the head in the whole set and it is not hair. |
| C6 | Cloth & material believability | 7 | 2 | 2 | **2** | 0 | Room materials, the towel, the bathmat and especially the `11` bottle (real glass transmission, real milk volume) are 3-level or better. The **garment** is the worst material in the build: semi-transparent over the chest (`03`), blown to featureless white in patches (`43`, `50`, `51`), shredded (`24`,`25`,`31`,`50`,`51`,`52`), faceted (`06`), one diamond knit at one scale across every slot, and the blanket is a rigid card that does not drape. |
| C7 | Animation quality & secondary motion | 10 | 2\* | 3\* | **3\*** | 0 | *\*Provisional — stills only.* Pose varies genuinely with mood across `05`/`07`/`12`/`41`. Against it, and all newly checkable: arms perfectly mirrored in `21`, `24` **and** `25` (§4 #63, three passes unfixed); six airborne blocks in `41` with no motion cue, no dust and no contact deformation; and no splash whatever in `22`. Timing, easing and overlap remain unassessable. |
| C8 | Environment richness & set dressing | 8 | 3 | 3 | **4** | **+1** | Clutter is now **grounded** — every item in `62` carries a real contact core (D18/N10 closed after two passes) — and `61` adds long raking cast shadows on floor and wall that transform the set read. Short of 5 on the bullseye rug in eight frames, the blank blurred wardrobe with its unexplained chrome hook (`30`,`31`), the blank wall filling half of `12`, and `01`/`60`/`62` still being one camera. |
| C9 | Lighting & mood | 9 | 3 | 2 | **3** | **+1** | The regression is repaired on measurement: p1 0.16→0.06 in `01`, 0.4%→5.7% shadow in `03`, `51`'s 23.8% red clip gone, `rain` reaching the rig, `golden` finally raking. Held at 3 by no rim/kicker anywhere, the lamp blowing a quarter of `50`/`51`/`06` to featureless cream, `30` untouched at p1 = 0.20, and `60` newly living inside a 31-point band. |
| C10 | Colour grading & post-processing | 6 | 3 | 2 | **3** | **+1** | Darks restored, no banding, DOF holding the subject, an authored night look in `52`. Held at 3 by highlights **not** restored — 15 frames have zero pixels above 0.95 — by `30` clipping 5.9%, by bloom that is a broad haze rather than threshold-limited (`40`, `41`, `42`), and by twelve frames sharing one warm-orange temperature within 0.2 of an R:G ratio, so there is a temperature but no colour story. |
| C11 | Composition & camera | 6 | 2 | 2 | **3** | **+1** | Six frames recovered: `10`, `11`, `12` now frame face and food together and are genuinely distinct; `43` is a real closeup; `61` has its subject; `20` shows the baby. Held at 3 by `51` being bisected by a razor-straight full-height blanket seam with the head against it, `06` unreadable, `42` still putting a ball *and* a balloon shard over the face, `31` cropping its own subject, and `01`/`60`/`62` being one camera. |
| C12 | Particle & FX craft | 6 | n/a | 2 | **2** | 0 | The foam is the best FX work in the build and the star clip-art is gone — that is 3-level craft. But **a literal Latin capital "Z" is laid on the mattress in `52`**, which is the C12 1/5 anchor's own example ("literal glyph quads") and §4 #85. Alongside it: no splash in `22`, no dust in `41`, no motes in `61`, all three named by their own briefs; and tears, drips and the tap impact all render as solid geometry. Delete the Z and fix the drips and this is a 3. |
| C13 | UI/HUD visual design | 7 | 3 | 4 | **4** | 0 | Still the strongest system. The prompt arrow aims again, the dress picker is now one shape language and clear of the character, the night theme holds. Short of 5 on ten simultaneous choices in `30`, the ごきげん meter icon being the one flat non-glossy icon in an otherwise coherent set, the arrow present in four frames and absent in two, and the bubble relocating between three corners with no rule. |
| C14 | Readability for a 4-year-old | 8 | 2 | 2 | **3** | **+1** | Five of six mis-targeted prompts corrected — `20` now shows the baby, `02` names a ball that is in frame, the feed prompts have their food. The pointer is back. Held at 3 by `50` **still** telling the child to brush teeth in the sleep activity with no toothbrush, by ten choices on the dress screen, and by a Latin capital letter placed in front of a pre-literate Japanese-speaking child in `52`. |
| C15 | Polish & imperfection detail | 7 | 2 | 2 | **2** | 0 | Pass two's list genuinely shrank — horns, floating foam, levitating banana, room-shell voids, the "N", the duplicate highchair, the dashed jaw line, the ring tears all gone. A list of comparable length replaced it: a **spoon embedded in the throat** (`11`), spiky shells on a nude torso (`24`,`25`), three torn overlapping pyjama shells with a protruding splinter (`50`), a full-height blanket seam with a black gap at its base (`51`), a split closed eyelid (`52`), a scribble on the sheet (`52`), five unexplained purple floor ellipses (`61`), a stray orange quad at the tap (`20`), and the cable, the grey ovoid and the chrome hook all unmoved. |
| C16 | Overall "would a parent pay for this" | 10 | 1 | 2 | **3** | **+1** | The median frame has crossed the "competent small indie" line. `61`, `21`, `25`, `11`, `12`, `62`, `02`, `40`, `43`, `22`, `23`, `52` — twelve of 28 would sit on a store page. Held at 3, hard, by six that would repel: `51` (a shredded blanket bisecting the frame), `50` (blown-out shredded pyjama), `06` (unreadable, rail shadows striping the face), `31` (a rigid bucket, monochrome orange), `11` (a spoon in the throat), and `30` — **a bare-crotched child**, which is a shipping blocker on grounds other than craft. |

```
Weighted mean:      2.78 / 5   (16 categories, total weight 124)
Unweighted mean:    2.75 / 5
Like-for-like:      2.82 / 5   (excluding C12, on pass one's 15-category / weight-118 basis)

Pass one:           1.98 / 5
Pass two:           2.33 / 5
Delta P2 → P3:      +0.45   (+0.47 like-for-like)

Floor rule applied: yes — C5 = 1 and five categories ≤ 2 (C1, C5, C6, C12, C15),
                    capping the headline at 3.4. The weighted mean is below the
                    cap, so the cap is not binding.
HEADLINE:           2.78 / 5
```

**Top 3 highest-leverage fixes:**

1. **Finish the shell fix in the six slots it did not reach.** The `outfit.js` iso-0 rework
   demonstrably works — `03`'s collar is clean at 400%. It has not reached the pyjama, the blanket,
   the diaper, or whatever shell is producing spiked plates on a *nude* torso in `24`/`25`. This
   one system is currently holding down C1, C6 and C15 (weight 24) and it is the reason four of the
   six store-repelling frames are store-repelling. It is a bug with a known and already-solved
   root cause, not an art problem.
2. **Delete the "Z", and rebuild tears and drips as anything other than opaque solids.** Three
   small changes. The Z alone is worth a point in C12 by the anchor's own wording, and it costs
   C14 and C15 as well. The drips (`23`, `24`) and tears (`05`) are the same class of error —
   opaque outlined geometry standing in for water — and they are what stops the otherwise-fixed
   `setWet` from reading as wet.
3. **Give `day` a neutral daylight.** Twelve frames share one warm-orange grade within 0.2 of an
   R:G ratio. This is why `golden` has nowhere to go, why `31` is monochrome, and why the whole
   build reads as one continuous late afternoon. `52` and `60` prove the pipeline can hold another
   temperature. A cooler, more neutral `day` costs nothing, restores the contrast that makes
   `golden` and `night` feel authored, and lifts C9, C10 and C16 together (weight 25) without
   touching an asset.

**Single worst thing in the frame:**

In `11-feed-messy` — otherwise one of the best frames in the set — **a chrome spoon is embedded in
the baby's throat** at (635–720, 355–405), the bowl half-sunk into the neck and the handle
disappearing into the jaw. At 400% there is no reading of it other than an implement lodged inside
a child. Everything else in this review is a craft deficit or an unfinished system; that is an
image a parent would screenshot for the wrong reasons.

---

## 4. Fresh ranked defect list

Ordered by score-delta per unit of effort. Open D- and N-series items are referenced by their
original number in §1 and not repeated here; the P-series below is what this pass adds.

### Tier 1 — blocking

| # | Defect | Owner | "Fixed" looks like |
|---|---|---|---|
| **P1** | **The shell fix reached one garment slot out of seven.** `50-sleep-crib` at 400% shows the pyjama as three overlapping translucent shells with torn scalloped boundaries and a splinter of geometry standing proud of the chest; `51`/`52` show it shredding **through** the blanket as jagged pale-green patches; `24`/`25` show hard skin-coloured plates with radiating triangular spikes at both shoulders **on a nude body**; `31` shows shards at (545–580, 305–340). Meanwhile `03`'s collar at 400% is clean — the fix works, it simply was not applied. | `src/character/outfit.js` (`_make`, `SHELL_PATCHES`, `GARMENTS`), `src/character/anatomy.js` `buildPatch` | Every one of the seven outfit slots, in every activity and every pose in `shots.json`, renders a continuous shell with no shard, no flap, no protruding splinter and no second overlapping surface, verified at 400%. Nothing renders on a body wearing nothing. |
| **P2** | **A chrome spoon is embedded in the baby's throat** in `11-feed-messy` at (635–720, 355–405) — bowl half-buried in the neck, handle vanishing into the jaw. The prop is anchored to the wrong node or to a hand transform that is not being driven. | `src/activities/feed.js` prop anchoring; `src/character/rig.js` hand attach | The spoon is either in a hand, in the bowl, or on the tray, in every feed frame. No prop in any of the 28 frames intersects the character's body. |
| **P3** | **`30-dress-outfit` renders a bare-crotched child.** The top's hem cuts at (570–780, 470–520) with nothing below it, while `31` — the other frame of the same activity — has a diaper on. The default outfit state for the `dress` activity is wrong, not the asset. Ship blocker on grounds other than craft. | `src/game/state.js` default outfit; `src/activities/dress.js` | A diaper is on in every frame of every activity, in every state, unconditionally. |
| **P4** | **The `zzz` FX is a literal Latin capital "Z"** laid flat on the mattress in `52` at (395–450, 330–395), with a drop shadow and no alpha attack or decay. The billboard-roll clamp fixed the letter and left the medium. §4 #85; the C12 1/5 anchor's own example; §4 #129 in a Japanese product for pre-literate children. `src/fx/toys.js:1474` already contains a comment describing zzz "drawn as zig-zag strokes" — that path is not what renders. | `src/engine/fx.js` (`zzz` kind, `SHAPE` table); `src/activities/sleep.js` `_zzzTimer` | Sleep FX are soft drawn strokes or puffs with alpha attack/decay, size hierarchy and drift. **No typographic glyph of any alphabet appears anywhere in the 28 frames.** |
| **P5** | **Wet droplets and tears render as opaque outlined ovoids.** `23`: six flesh-and-grey beads on the crown at (680–780, 95–135) plus more on the arms and shirt, reading as blisters. `24`: the same on the chest and shoulders at 400%, each with a dark outline. `05`: tears are opaque blue-grey lozenges, one lying flat across the closed right lid at (855–900, 355–385). This is what stops the otherwise-correct `setWet` from reading as wet. | `src/fx/water.js`; `src/character/baby.js` `setWet` drip; `src/engine/materials.js` droplet material | Droplets are refractive, take the colour of what is behind them, have a bright rim and a dark core, vary in size, and elongate as they run. A blind observer says "wet", not "spotty". |
| **P6** | **`sleepy` renders with fully open eyes** in `06` at (600–680, 250–310) and (610–690, 380–460) — the frame whose manifest note is "heavy lids". `asleep` was fixed this pass and `sleepy` was not, so one of the twelve moods still renders as its opposite. | `src/character/face.js` `lidLower` binding | `sleepy` renders visibly heavy — lids down past the pupil, brows softened — and is distinguishable from both `neutral` and `asleep` at the `crib` preset with the UI hidden. |

### Tier 2 — high value, contained

| # | Defect | Owner | "Fixed" looks like |
|---|---|---|---|
| **P7** | **`51-sleep-asleep` is bisected by the blanket.** A razor-straight vertical edge with a bright cream lit face runs the full frame height at x ≈ 700–730, with the sleeping head jammed against its left side; a pure-black gap sits along the blanket's base in `50` and `52`. The blanket is a rigid faceted card that does not drape at any point. | `src/activities/sleep.js` blanket geometry; `src/engine/physics.js` `addCloth`; `src/engine/camera.js` `crib` preset | The blanket drapes over the body with soft folds and a curved, occluded edge; no straight line crosses more than a third of the frame; no black gap at any contact. |
| **P8** | **The build has one colour temperature.** Twelve frames measure an R:G mean ratio within 0.2 of each other — `01` 1.52, `07` 1.53, `43` 1.68, `61` 1.64, `31` **1.75**. `day` is graded as sunset, which is why `golden` reads only 8% warmer than it and why `31` is monochrome orange with no cool anywhere. §4 #137: no dominant/accent relationship, only a wash. | `src/engine/lighting.js` `MOODS`; `src/engine/render.js` grade | `day` measures an R:G ratio near 1.1–1.2 with a cool fill from the window side; `golden` stays where it is and now reads as a deliberate departure. No two moods are within 0.15 of each other. |
| **P9** | **The tap impact is solid geometry plus a stray polygon.** `20` at 400%: an opaque dark navy-green lens with a hard stippled silhouette sits on the water at (595–700, 400–500), beside a hard-edged orange quad at (640–680, 425–470) with no referent. The stream is a flat aliased ribbon that stops dead with no crown and no foam. `20`'s water surface is still an opaque disc, and `24`'s "caustics" are still white loops **on the surface** rather than focused light on the tub floor. | `src/fx/water.js`; `src/activities/bath.js` | The stream breaks into droplets and a foam crown at impact; a ring ripple spreads and fades; nothing at the impact point is opaque; caustics fall on the tub floor and move with the surface. |
| **P10** | **Four briefed FX simply do not fire.** `22` asks for splash particles and there are none. `41` asks for dust and there is none — only two sparkles on the dresser, far from the event. `61` asks for dust motes and there are none. `20` asks for steam and there is none. In each case the frame exists solely to demonstrate the effect. | `src/engine/fx.js` (`burst`, `emitter`), `src/activities/bath.js`, `src/activities/play.js`, `src/engine/lighting.js` shaft | Each of `20`, `22`, `41` and `61` visibly demonstrates the effect its manifest note names, at the location the event occurs. |
| **P11** | **`50-sleep-crib` still prompts 「はみがき しようね」 in the sleep activity** with no toothbrush in frame, and the newly-restored arrow now points at a sleeping baby. Second pass unfixed; the only surviving instance of N11. | `src/activities/sleep.js` prompt scheduling; `src/ui/ui.js` `prompt()` | No prompt fires for an affordance the current activity does not offer, and every prompt's pointer resolves to a visible object. |
| **P12** | **The lamp blows a quarter of the sleep frames to featureless cream.** `50` (0–400, 250–700), `51` (0–700, 0–900), `06` (200–700, 100–700) — median luminance 0.62 in `06`, the highest in the set, with p5 at 0.30. The face sits inside the wash at almost no local contrast. §4 #46, and it defeats the C9 requirement that the character be the highest-contrast element. | `src/world/props.js` lamp practical; `src/engine/lighting.js` `setLamp` | The practical has a falloff that keeps the mattress under 0.85 and the face readable; the brightest thing in frame is the lamp's own shade, not the bedding. |
| **P13** | **The garment material carries a broad specular that blows to white and goes semi-transparent.** `43` at (1210–1330, 440–540) and (1000–1080, 420–470) — large milky patches on the shirt that read as bleach stains; `03` at (620–900, 520–560) — skin visible through the knit; `50`/`51` — the pyjama blown to featureless white. §4 #30: a specular sharper than cloth ever produces. | `src/engine/materials.js` garment material; `src/engine/textures.js` knit generator | Cloth has a broad low-intensity sheen at grazing angles only, never blows past 0.9, and is fully opaque at every angle and every light level. |
| **P14** | **Blush is a hard-edged flat disc, and there is one on the nose bridge.** `52` at 400% shows a crisp elliptical boundary on the cheek; `05` carries three, the third at (770–800, 350–375) on the nose bridge / inner brow where no blush belongs. The amplitude fix landed; the falloff and the placement did not. | `src/character/face.js` blush cap placement; `src/engine/materials.js` `makeBlush` | Blush has a soft radial falloff with no visible boundary at 400%, sits only on the cheeks and the ear tips, and responds to the key direction. |

### Tier 3 — craft polish

| # | Defect | Owner | "Fixed" looks like |
|---|---|---|---|
| **P15** | **Head-to-body ratio measures ~1:4** in `30` and `07` — real-infant proportion, not the 1:2.5–3.5 the C1 anchor calls for. The build is under-stylised for its genre at exactly the silhouette level. | `src/character/anatomy.js` | Standing height 0.62 m held, with the cranium at 1:2.5–3 of it, consistent across `sit / lie / crawl / stand / held / bathe / sleep`. |
| **P16** | **No lower lid, no lash, no lid crease, and the catchlight is on the sclera.** `04` at 400%: the sclera runs straight into the cheek; a hard flat blue-grey band across the upper sclera reads as paint; the iris is a featureless dark disc with no limbal ring; both catchlights sit on the outer sclera edge, off the cornea. In `52` each closed lid is split by a hard vertical seam. | `src/character/face.js` eye/lid construction | Upper and lower lids both present and both deforming; a lash line; a limbal ring; the catchlight on the cornea over the iris. |
| **P17** | **The bullseye rug**, unchanged across three passes, in `01`,`05`,`07`,`40`,`42`,`43`,`60`,`62`, occupying 40–50% of four of them. `23`'s bathmat is in the same build and shows exactly what the fix is. | `src/world/props.js`; `src/engine/textures.js` `makeCarpet` | Pile thickness at the rim, a bound edge or fringe, an off-centre pattern with traffic flattening, a perimeter contact shadow, multi-octave breakup reading as fibre at 400%. |
| **P18** | **Bloom is a broad haze, not a threshold-limited highlight** — `40`/`41`/`42` carry a milky glow over roughly 15% of the frame around the window, washing the curtain and the wall. §4 #102. | `src/engine/render.js` bloom threshold | Bloom affects only pixels above a defined threshold; the curtain edge stays sharp; the frame's contrast outside the window is unaffected. |
| **P19** | **The balloon is a point-topped lemon on a dead-straight string.** `43` at 400% — the apex comes to a point; the string has zero slack; in `01`/`40`/`62` it terminates in mid-air with no knot; in `42` it renders edge-on as a hard shard at (585–645, 400–500) over the baby's face. `43`'s anchor to the drum is the one part that landed. | `src/activities/play.js`; `src/engine/physics.js` `addRope` | A domed apex and a knotted neck; a curved slack string driven by the verlet solver and anchored in every frame; enough radial segments never to read as a shard. |
| **P20** | **Unexplained geometry surviving from pass two, plus three new.** Still: the black cable on the mattress (`06`, `50`, `52`); the grey ovoid behind the tub (`23`, (395–560, 225–355)); the chrome hook (`30`, `31`, (1200–1440, 480–800)). New: ~5 dark purple floor ellipses (`61`); a dark scribble on the sheet beside the head (`52`, (395–425, 460–490)); a dark line across the floorboards (`43`, (0–170, 555–585)); a dark red smear on the floor (`01`, (740–790, 452–462)). | `src/world/room.js`, `src/world/props.js`, `src/activities/*.js` | Each frame survives a 400% sweep with nothing unexplained, unparented, or reading as a placeholder mark. |
| **P21** | **`60-weather-rain` has no rain**, and its grade is now the most compressed in the set (p5 0.23 → p95 0.54, zero above 0.95). The lighting half of `setWeather` landed; the FX half and the value range did not. | `src/world/room.js` `setWeather`; `src/world/window.js`; `src/engine/fx.js` | Droplets and runnels on the glass, visible rain beyond it, and a value range with a true dark and a true bright inside an overcast palette. |
| **P22** | **`01`, `60` and `62` are one camera** — measured, `01` vs `62` differ by 16.3/255, entirely the clutter. Three of 28 frames spend their budget on the same composition. | `tools/shots.json`; `src/engine/camera.js` presets | Every entry in `shots.json` produces a visibly distinct composition, not merely a distinct scene state. |
| **P23** | **The ごきげん meter icon is the one flat icon in a glossy set.** At 400% in `02` the apple, droplet and bolt are custom-drawn with gradients and modelled highlights; the smiley is a flat yellow circle with two black dots and a black arc, no gloss, hard stroke. It reads as a system emoji whether or not it is one. | `src/ui/icons.js` | All four meter icons are drawn in the same language, with the same shading treatment and the same stroke discipline. |
| **P24** | **Brows are flat decals**, unchanged: `25` at 400% shows two dark-grey rounded rectangles of uniform width; in `05` one brow is a thin arc and the other is absent. `sleepy`, `sulk`, `surprised` and `cry` all need them. | `src/character/face.js` brow geometry | Brows are geometry with tapering width and a soft root, both present in every mood, and both deforming. |
| **P25** | Residual node leak: `console.log` still reports `activity "feed" left 1 scene nodes behind on dispose` and `"dress" left 2`. Reduced from three warnings to two. | `src/activities/feed.js`, `src/activities/dress.js` `dispose()` | `tools/shoot.mjs` completes a full 28-shot run with an empty `console.log`. |
| **P26** | **`31`'s subject is cropped by the frame edge** — the garment being pulled over the head, which is the shot's entire brief, is cut at y = 0. | `tools/shots.json`; `src/engine/camera.js` `dress` preset | The garment, the head and the hands are all inside the frame with correct headroom. |

---

## 5. Verdict

### Would this now beat the reference in a blind A/B on a single still?

**On some frames, yes. On the set as a whole, still no — and the gap is now narrow enough that
it turns entirely on which frame is drawn.**

I restate that I have never seen the reference and did not run the A/B. What follows reasons
against the rubric's own written characterisation (§1, §0.3): a competent, low-budget, shipped
console family title whose stated weaknesses are flat lighting, uniform materials, sparse modular
set dressing, fixed forward gaze, a small discrete expression set and generic UI — and whose
strength is that it is a *finished, coherent product* with a complete rigged character.

**Frames I believe would now win.** `61-golden-hour` — long raking cast shadows on floor and wall,
a subject the light is actually falling on, real architectural depth. `21-bath-foam` and
`25-bath-horn` — the lather is better craft than a 2020 budget title would have attempted at all.
`62-clutter` — the density and the grounding exceed what a customisation-driven modular set
produces, which is the rubric's own predicted weakness for the reference. `02-room-wide-hud` —
the UI is drawn with more personality than §1.8 predicts of the reference. `11` and `12` — the
bottle's glass transmission and the bitten apple are specific, authored details.

**Frames I believe would draw.** `01`, `22`, `23`, `40`, `43`, `52`, `07`. Competent, warm,
correctly lit, nothing broken in them, nothing that would make a stranger stop scrolling either.

**Frames I believe would lose badly, and would lose in the worst way.** `51`, `50`, `06`, `31`,
`30`, `11`'s spoon, `42`. The rubric's read of the reference is that its baby is a *template* —
generic, symmetric, dead-eyed, but **correct**. A blind observer comparing `51` against a correct
template baby does not think "less appealing." They think *what is wrong with that one.* A sleeping
child bisected by a razor-straight cream seam, wearing three overlapping torn shells; a spoon in a
throat; a bare-crotched child on a customisation screen. These are not craft deficits — they are
images that read as broken, and a broken image loses to a boring one every time.

**So the honest answer changed shape rather than direction.** Pass two's answer was "no, but for
the first time it depends on the frame." Pass three's is: **the good frames have got better and
more numerous — twelve of 28 are now store-page viable against roughly five in pass two — and the
bad frames have not been fixed, they have been re-caused.** The blanket seam replaced the open
eyes. The spoon replaced the tray-underside camera. The spiked nude torso replaced the brown
horns. The "Z" replaced the "N". Each of those is a smaller defect than the one it replaced, which
is why the score moved; none of them is *no* defect, which is why the verdict has not.

### What changed, honestly

The headline moved 2.33 → **2.78**, the largest single-pass gain so far. Four fixes account for
almost all of it, and all four were real:

- **The feed camera.** Three unusable frames became three good ones, and they are now distinct
  from each other. This alone moved C11 and half of C16.
- **Contact shadows outside `bath.js`.** A Tier-1 defect for two passes, now closed everywhere I
  can check. It is the reason C8 moved to 4, and it lifted the perceived quality of every prop in
  the build without touching a prop.
- **The value range.** Measured, verified per channel, and repaired in 24 of 28 frames. The
  warning pass two ended on — *find what lifted the blacks and revert it* — was acted on.
- **The foam.** From the worst FX in the build to the best, and the only asset in the set I would
  describe as genuinely well-crafted rather than merely correct.

**What the pass got wrong is a pattern worth naming.** Five of the reported fixes closed the
*symptom* the previous critique could see and left the *cause* — the "Z" is still a typographic
glyph, the blush is still a decal, the rain still has no rain, `sleepy` still opens its eyes while
`asleep` was fixed beside it, and the shell rework was applied to one slot out of seven while its
own source comment explains precisely why it works. Pass two warned that under the first layer of
hard bugs there was a second layer of the same kind. There is a third, and it is thinner: these are
no longer architectural failures, they are unfinished applications of fixes that already exist in
the codebase.

**Three things to protect.**

- **The UI system** (`ui/hud.css`, `ui/icons.js`, `ui/ui.js`). Held at 4 across two passes, with
  the arrow restored and the picker rationalised. Still the best argument in the build.
- **The room and its lighting.** `61` is the best frame this project has produced. The grounding,
  the raking shadows and the architectural detail are commercial-grade and a regression here would
  cost more than anything else on this list.
- **The foam, and the `03` collar.** Both are proofs that the respective systems can produce
  correct output. Do not let either be refactored away before the other slots are brought up to
  them.

**The warning.** C5 is at 1 for the third consecutive pass and it is the only category keeping the
floor rule live. A bald baby is not a bug — it renders cleanly and it reads as a baby. But it is
the 1-anchor verbatim, and until `hair.js` produces something in *some* frame, no amount of work
elsewhere can lift the headline past 3.4. Either build soft, correctly-rooted baby hair at the
temples and nape, or accept that this category is a permanent 1 and spend the effort on C1 and C6,
which have twice the weight between them and are currently held down by a single unfinished fix.
