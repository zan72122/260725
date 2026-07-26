# VISUAL_RUBRIC.md — Quality Bar & Scoring Rubric

**Project:** baby-care-3d (Three.js)
**Explicit quality target:** *My Universe – My Baby* (Microids / Smart Tale Games, 2020)
**Purpose:** This is the single source of truth for every visual quality decision on this project. The critic agent scores against Section 3, hunts with Section 4, and compares with Section 5.

**Last updated:** 2026-07-26

---

## 0. Provenance, honesty, and how to use this document

### 0.1 Research limitations — READ THIS FIRST

This document was compiled under a hard constraint: **all outbound HTTPS in the authoring environment was blocked by egress policy.** `store.steampowered.com`, `microids.com`, `nintendo.com`, `metacritic.com`, `opencritic.com`, review sites, YouTube, and even Wikipedia all returned `403` at the proxy (`connect_rejected: gateway answered 403 to CONNECT`). Only an indexed web-search tool was available, which returns titles, URLs, and machine-summarised page text.

**Consequence: the author of this document has never seen a frame of *My Universe – My Baby*.** Everything in Section 1 is therefore tagged:

- **[SOURCED]** — directly supported by a citation below.
- **[INFERRED]** — a reasoned deduction from production context (budget tier, engine, platform, release date, genre convention). Plausible, not verified.
- **[UNKNOWN]** — explicitly flagged as not established. Do not treat as fact.

**The critic agent MUST re-verify Section 1 at review time** by fetching the reference URLs in Appendix A, which will work from an unrestricted environment. If a claim tagged `[INFERRED]` turns out to be wrong, fix this document — do not quietly score against a fiction.

### 0.2 Reference imagery — which route was taken

**Route taken: textual descriptions + URLs (fallback route).** No imagery was downloaded, because no image host was reachable. `docs/reference/` exists but is empty apart from a README.

The repository root `.gitignore` **already** excludes `baby-care-3d/docs/reference/` (line 6, pre-existing). That is correct and sufficient — no additional ignore file was added. If a human later drops press screenshots or frame-grabs into that directory, they will not be committed. Reference frames from a commercial game are copyrighted; retaining them locally for private critique is defensible fair-use-adjacent practice, redistributing them in a git repo is not.

Appendix A lists the exact URLs a critic should fetch at review time, with what to look for in each.

### 0.3 The critical honesty note about the reference

Do not read "*My Universe – My Baby* is the target" as "it is excellent." It is not. The evidence is split and the split is informative:

| Source | Score | What it was measuring |
|---|---|---|
| TheXboxHub | **40 / 100** | Overall craft & value. "A tutorial that never ends"; "devoid of excitement, realism or enjoyment." [SOURCED] |
| Metacritic (Switch/XB1) | **effectively unrated** — 1 critic review, insufficient for a metascore | Mainstream press largely ignored it. [SOURCED] |
| Family Friendly Gaming | **Graphics 90%** | Wholesomeness + "does it work," not craft. [SOURCED] |
| ChristCenteredGamer | **Graphics 8/10**, "3D modelling very detailed and all around very impressive" | Same generous frame. [SOURCED] |
| *My Universe – Interior Designer* (sibling title) | **Steam "Mostly Negative," ~20% positive** | Series quality tier. [SOURCED] |

**Read this as:** the reference is a competent, low-budget, licensed-adjacent family title. It clears the "it is a real 3D game that ships on console" bar — which is genuinely higher than most hobby web projects ever reach — and fails almost every bar above that. The two outlets that praised its graphics are outlets that praise nearly all wholesome family software; the one outlet applying mainstream craft standards gave it a 40.

**Therefore the strategic read for this project:**
- **The bar is LOW on:** animation richness, facial expression range, FX craft, set-dressing density, lighting sophistication, post-processing, particle work, material variety, UI personality. These are where a focused solo effort can *beat* the reference outright, and should target 4–5/5.
- **The bar is GENUINELY HIGH on:** the things that require production scale — a complete rigged and skinned character with a real skeleton, a full customization system (baby + outfits + room), five distinct furnished environments, 30+ distinct activities, a working photo mode, consistent art direction across all of it, and 30fps-locked stability on Switch hardware. [SOURCED — all feature claims from Microids/store copy] A web project will not out-scale this. It must out-*craft* it in a tight scope.
- **Beating it in a blind A/B on a single still frame is an achievable goal.** Beating it on breadth of content is not, and is not the goal here.

### 0.4 Scoring mechanics

- 16 categories, each scored **1–5 integers only**. 2 and 4 are interpolations between the written anchors — a 4 means "clearly past the 3 anchor, missing at least one thing the 5 anchor demands."
- **Never award a 5 you cannot justify against a named comparable.** A 5 means "would win, or at minimum credibly draw, a blind side-by-side against *My Universe – My Baby*."
- Score the **build as rendered**, not the intent, not the code, not the roadmap.
- Suggested weights are given per category. The weighted mean is the headline number. Report the unweighted per-category table too — the weights are for prioritisation, the table is for diagnosis.
- **Any category scoring 1 or 2 caps the headline score at 3.4** regardless of weighted mean. One catastrophic category (e.g. emoji used as in-world art) poisons the whole frame; averaging hides that.

---

## 1. Reference analysis — *My Universe – My Baby*

**Developer:** Smart Tale Games SAS. **Publisher:** Microids. **Released:** 9 July 2020 (EU) / 18 August 2020 (NA). **Platforms:** Nintendo Switch, PS4, Xbox One, PC/Mac. **Target age:** stated as 4–5 and up; raise a baby from birth to age 2. [SOURCED]

*Note: the brief attributes the game to Magic Pockets. Magic Pockets developed other* My Universe *entries (e.g. School Teacher); My Baby was Smart Tale Games.* [SOURCED] *This does not change the quality target, but get the attribution right in any external writing.*

### 1.1 Character proportions and stylisation

**[INFERRED, high confidence]** A cross-platform 2020 family title for 4-year-olds, built around emotional caretaking, will sit squarely on **Kindchenschema** (Lorenz's baby-schema): large cranium relative to face, high domed forehead, features clustered low in the face mask, large round eyes, full cheeks, small chin, short chubby limbs. [SOURCED — that these are the cuteness triggers and that character designers deliberately apply them]

**[INFERRED]** Expect a head-to-body ratio in the **1:2.5 to 1:3.5** range — real infants are ~1:4, and cute-stylised characters exaggerate toward 1:2.5–3. Expect visible chub rolls at wrist and ankle, a rounded belly, and no visible neck.

**[UNKNOWN]** Whether the model is a single morphing body with blendshape-driven age progression (the game ages the baby from newborn to 2 years) or discrete swapped meshes per age stage. The ageing feature is [SOURCED]; the implementation is not.

**Where this is a low bar to beat:** budget-tier character work of this vintage typically resolves the appeal problem at the *silhouette* level and stops. Sub-silhouette appeal — the asymmetry of a real toddler's face, the slight lopsidedness of a smile, the way one cheek compresses more than the other — is almost certainly absent. That is exploitable.

### 1.2 Skin shading approach

**[INFERRED, high confidence]** Unity built-in or URP forward rendering, a **Lambert/GGX opaque skin with a flat albedo tint and no subsurface transmission**. Real-time SSS on Switch in 2020, in a budget title, is very unlikely.

**[INFERRED]** Cheek blush is almost certainly **painted into the albedo texture** rather than shaded, meaning it does not respond to light direction and stays put as the head turns.

**[UNKNOWN]** Whether any wrap-lighting / half-Lambert term is used to soften the terminator.

**The bar here is LOW and this is the single highest-leverage category for this project.** A cheap and correct fake-SSS — wrap diffuse (shift and rescale N·L so the terminator wraps past 90°), a warm red-shifted shadow ramp rather than a neutral-grey one, and a thin-part translucency term on the ears — reads as *dramatically* more alive than flat Lambert and costs almost nothing in Three.js. Established practice: fake SSS is performant enough for mobile and the effect reads most strongly on ears, fingertips, nose, and cheeks; painting redness into the albedo at high-blood-flow areas reinforces it. [SOURCED]

### 1.3 Eye design

**[INFERRED, high confidence]** Large, high-contrast, near-circular eyes. The dominant budget-tier approach is a **textured sphere or a flat card with a painted iris, plus a fixed specular dot painted or geometry-parented into the highlight position.**

**[INFERRED]** Blink is likely a texture swap or a simple lid-bone rotation. Gaze is likely **fixed forward or locked to the camera**, without target-driven look-at and without the saccadic micro-movements that make eyes read as conscious.

**Where the bar is LOW:** dead, unmoving, perfectly-symmetric eyes are the most common single tell of budget character work, and the most viscerally noticeable to an adult buyer. Convergence on a near target, a slight vertical offset between the two pupils' catchlights, occasional saccades, and blink timing that varies (rather than metronomic) are all cheap and all beat the reference.

### 1.4 Colour palette and value range

**[INFERRED, high confidence]** High-key pastel: pale pinks, mint, butter yellow, powder blue, cream. Nursery-genre convention and confirmed sibling-title convention.

**[INFERRED]** The likely weakness is **compressed value range** — everything living between roughly 55% and 90% luminance with no true darks and no true whites, which reads as washed-out and flat on a good display. Budget pastel art directions habitually confuse "light" with "low-contrast."

**Comparison anchor:** *Animal Crossing: New Horizons* is explicitly noted as having a much more artistic, pastel approach to colour than its predecessors, and that this is attributed to **both** artistic choice **and** an advanced lighting system. [SOURCED] That is the key insight: ACNH's pastels read rich because the *lighting* creates the value range, not because the albedo is saturated. Pastel albedo + real value range from light = premium. Pastel albedo + flat light = cheap.

### 1.5 Lighting setup

**[INFERRED, high confidence]** A single directional key with real-time shadows, plus flat ambient or a low-cost baked/gradient ambient. Possibly baked lightmaps on static room geometry.

**[UNKNOWN]** Whether there is any bounce/GI, area-light softening, or time-of-day variation.

**Comparison anchor:** ACNH applies **shadow casting to every on-screen object, big and small**, and uses normal-mapped decals for footsteps and water ripples specifically to keep shadow behaviour consistent. [SOURCED] Universal shadow coverage — including on small props — is the tell that separates a set from a shooting stage.

**Where the bar is LOW:** three-point lighting with a warm key, a cool sky-coloured fill, and a rim/kicker to separate the baby from the wall is standard practice that budget titles routinely skip. Add a soft grounded contact shadow under every object and this category is winnable.

### 1.6 Environment density and set dressing

**[SOURCED]** Multiple distinct rooms — bedroom, kitchen, bathroom, living room — plus an outdoor walk location. Room customisation is a headline feature.

**[INFERRED]** Because rooms must be player-customisable, geometry is likely modular and prop-slot-based, which tends to produce **grid-aligned, evenly-spaced, low-density** set dressing: props sit at right angles, at regular intervals, with generous empty floor between them. Customisable rooms are almost always emptier and more orderly than art-directed ones.

**Where the bar is LOW:** a real nursery is *cluttered and asymmetric*. A blanket half-off the bed. A toy on its side. Books not flush. A slightly crooked picture frame. Layered rugs. This is the cheapest possible win against a modular-customisation-driven environment, and it is a large win, because clutter is what human eyes read as "lived in."

**Where the bar is HIGH:** five distinct fully-furnished environments is real production scale. Do not attempt to match breadth. Make one room denser than any of their five.

### 1.7 Material treatment

**[INFERRED]** Expect **uniform roughness per material** with little or no roughness/AO map variation — the single largest realism-killer in amateur and budget work. [SOURCED — that uniform gloss with no variation is a primary realism failure] Expect painted plastic-looking wood, uniform fabric, and no edge wear.

**Comparison anchor:** ACNH uses proper PBR materials — "though not always entirely accurate, as artistic intent trumps realism" — and applies **real-time anisotropic highlights to hair with primary and secondary highlights**, a technique noted as rare and normally expensive. [SOURCED] That is a AAA-first-party level of investment in one material.

**Where the bar is LOW:** distinct, correct material *families* — soft matte cotton (rough ~0.9, no clearcoat), varnished wood (rough ~0.35 with grain-modulated variation), glossy plastic toy (rough ~0.15), ceramic, brushed metal — with roughness *breakup* on each. Doing five materials properly beats doing twenty uniformly.

### 1.8 UI design language

**[INFERRED, high confidence]** Large chunky rounded buttons, icon-led with minimal text (age-appropriate necessity), a persistent need-meter HUD (hunger / hygiene / mood / energy), and console-conventional prompt glyphs.

**[UNKNOWN]** Whether the UI is diegetic, art-directed with any personality, or generic Unity-UI-with-rounded-sprites.

**Comparison anchor — the genre-defining discipline is Toca Boca's:** no scores, no levels, no text tutorials; **icon literalism**; if you tap something it moves, changes, or makes a sound; **3–5 choices per screen maximum** to bound cognitive load; shallow navigation. Sago Mini adds softer sounds and slower animations for calmer focus. [SOURCED] This is a *higher and more rigorous* bar than console family titles typically meet, and it is fully achievable in a web project.

### 1.9 Camera framing

**[INFERRED]** Fixed or lightly-orbiting per-room cameras at roughly adult standing eye height looking down at the baby, switching per activity. Minigame-driven structure ("mini-games occur one after another" [SOURCED]) implies per-activity fixed framings.

**[UNKNOWN]** FOV, whether depth of field is used at all. Budget titles of this tier typically ship with **no DoF and a wide-ish FOV**, which flattens depth and makes the room read as a diorama backdrop rather than a space.

**Where the bar is LOW:** a slightly longer lens (35–45° vertical FOV rather than 60°+), a gentle DoF that holds the baby sharp and softens the far wall, and framing that respects thirds rather than dead-centring everything, are all free and all read as "someone chose this shot."

---

## 2. Genre-leading bar — where the best comparables go beyond the reference

| Category | Reference (*My Universe – My Baby*) | Genre-leading bar | Who sets it |
|---|---|---|---|
| Character appeal | Kindchenschema applied at silhouette level | Appeal survives close-up; asymmetry and imperfection deliberately authored; character reads as an individual, not a template | ACNH villagers; Nintendogs breeds |
| Skin / fur shading | Flat opaque diffuse [INFERRED] | Believable translucency at thin parts; texture that responds to touch and motion. Nintendogs achieved convincing per-breed fur on **DS hardware**, and made it *react to touch and movement* [SOURCED] | Nintendogs |
| Eyes & gaze | Fixed forward, painted highlight [INFERRED] | Gaze targets the player and objects of interest; convergence, saccades, varied blink; eyes are the primary emotional channel | ACNH, Nintendogs |
| Expression range | Small discrete set [INFERRED] | Blended continuous emotional space; expressions that anticipate and settle rather than snap | ACNH |
| Hair | Card or solid cap [INFERRED] | Real-time anisotropic highlights with primary *and* secondary specular — explicitly rare and expensive [SOURCED] | ACNH |
| Materials | Uniform roughness [INFERRED] | PBR material families with authored roughness breakup; "artistic intent trumps realism" but the underlying model is correct [SOURCED] | ACNH |
| Animation | Functional, likely stiff [INFERRED] | Overlapping action — hair, cloth, accessory chains all trailing at mass-appropriate rates [SOURCED]; idles treated as "part of the character's presence across the entire play session" [SOURCED] | ACNH, Nintendogs |
| Environment | Modular, customisation-driven [INFERRED] | Deliberate clutter, layered props, authored asymmetry, density that implies a life lived off-screen | ACNH, Hello Kitty Island Adventure |
| Lighting | Single key + ambient [INFERRED] | Shadows on **every** object regardless of size; Rayleigh scattering for sky, Mie scattering for atmosphere and apparent scale; dynamic time-of-day and weather [SOURCED] | ACNH |
| Colour | Pastel, likely compressed value range [INFERRED] | Pastel palette whose richness comes from the lighting system, not the albedo [SOURCED] | ACNH |
| Perf-vs-fidelity | 30fps on Switch | HKIA on Unity DOTS: "visually stunning and highly performant... even on mobile with limited hardware," visuals "as good as Animal Crossing did on Switch," and shipped after explicitly fixing earlier frame-rate and muddy-visual problems [SOURCED] | Hello Kitty Island Adventure |
| Customisation | Baby, outfit, room [SOURCED] | Species, body style, eye style, mouth style, colour pattern, colour theme — each species with its own option set; players cite customisation as a primary love [SOURCED] | Hello Kitty Island Adventure |
| UI for young children | Icon-led, chunky [INFERRED] | Icon literalism, zero text, 3–5 choices per screen, shallow nav, every tap produces motion/change/sound, non-destructive design, no scores or timers [SOURCED] | Toca Boca / Sago Mini |
| Pacing & calm | Minigame-chained | Deliberately softer sound and slower animation to sustain attention and reduce overstimulation [SOURCED] | Sago Mini |

**The synthesis:** ACNH sets the *rendering* bar. Nintendogs sets the *tactile aliveness* bar. Hello Kitty Island Adventure proves the rendering bar is reachable on constrained hardware with disciplined engineering. Toca Boca/Sago Mini set the *interaction and readability* bar for the actual 4-year-old user. The reference title sets none of these bars — it sets the *scope* bar.

---

## 3. The scored rubric

16 categories. Score 1–5 integers. Weight column is for the headline weighted mean.

---

### C1 — Character appeal & proportions · weight 10

- **1/5** — Proportions read as a scaled-down adult or an undifferentiated blob. Head/body ratio arbitrary. Limbs are untapered cylinders or capsules. Silhouette is unreadable at thumbnail size. Body is a boolean union of primitives with visible intersections. No Kindchenschema logic applied.
- **3/5** — Correct baby schema at the silhouette level: big cranium, low-set features, short chubby limbs, no neck. Reads unmistakably as "baby" in silhouette at 64px. Fully symmetric. Forms are clean but generic — this is any baby, not *a* baby. Joints deform acceptably but without volume preservation.
- **5/5** — Baby schema executed with an authored *character*, not a template. Deliberate asymmetry: one ear sits slightly differently, the hair whorl is off-centre, the smile is fractionally lopsided. Volume is preserved through deformation — chub compresses at wrist and ankle creases when limbs flex. Silhouette is distinctive enough to be recognised from outline alone against three other cute-baby silhouettes. Appeal holds at close-up, not just at gameplay distance. Head/body ratio deliberately chosen (~1:2.5–3) and consistent across every pose.

### C2 — Skin shading & subsurface feel · weight 8

- **1/5** — `MeshBasicMaterial`, or `MeshStandardMaterial` with flat albedo and no roughness variation. Skin reads as painted plastic or vinyl. Shadow terminator is a hard neutral-grey line. Cheek blush is a flat decal that ignores lighting entirely.
- **3/5** — Physically-sensible standard material, roughness in a plausible skin range (~0.5–0.7), a soft terminator via wrap or half-Lambert. Warm-tinted rather than grey shadows. Blush painted into albedo and reasonably placed. Reads as "nice clay/vinyl doll" — appealing but not alive.
- **5/5** — Convincing fake-SSS: wrap diffuse with a *coloured* shadow ramp shifting toward red-orange through the terminator, not merely darkening. Thin-part translucency visible on the ears when backlit or side-lit. Albedo carries subtle painted redness at high-blood-flow zones — ears, nose, fingertips, cheeks, knees [SOURCED technique]. Roughness varies across the body (slightly glossier on the nose bridge and lower lip, matte on cheeks). A faint, tight specular that moves correctly with the light. In a blind test an observer describes it as "skin," not "plastic" or "clay."

### C3 — Eyes & gaze · weight 9

- **1/5** — Black spheres, flat discs, or emoji-derived eye art. No catchlight, or a catchlight baked into a texture that never moves. Never blinks, or blinks on a fixed metronome. Perfectly symmetric. No gaze direction — pupils are welded forward.
- **3/5** — Geometrically proper eyes with iris, pupil, and a real specular catchlight. Blinks with reasonable easing. Head or eyes track the interaction point. Symmetric and mechanically correct. Reads as attentive but not conscious.
- **5/5** — Gaze is the primary emotional channel. Eyes converge on near targets rather than staying parallel. Catchlights sit at slightly different relative positions in each eye (correct for a shared light and two differently-angled corneas). Blink timing is stochastic with occasional doubles; blinks fire on gaze-shift and on emotional beats, not only on a timer. Micro-saccades during idle. Lid shape changes with expression — the lower lid rises when smiling. A subtle corneal refraction or parallax gives the iris depth. The character appears to be *deciding where to look*.

### C4 — Facial expression range · weight 7

- **1/5** — One face. Or expression conveyed only by swapping a 2D emoji/sprite above or on the head. Transitions are instantaneous pops.
- **3/5** — 4–8 discrete named expressions (neutral, happy, sad, sleepy, surprised, crying) driven by blendshapes or bones, cross-fading smoothly. Recognisable and correctly triggered by game state. Each expression is a single fixed pose held statically while active.
- **5/5** — Continuous blended emotional space rather than a discrete list — expressions mix (sleepy-happy, about-to-cry) and vary in intensity, not just kind. Expressions have *arcs*: anticipation, peak, settle — never snapping to a pose and freezing. The whole face participates: brows, lids, cheeks (raising to squint the eye on a true smile), nose, mouth corners, chin. Asymmetric on at least some expressions. Micro-expressions during idle keep the face alive between beats. Emotion is legible with the UI hidden and no audio.

### C5 — Hair · weight 6

- **1/5** — A solid opaque cap primitive, or no hair. Uniform flat colour. Zero motion. Hard-edged intersection where it meets the scalp.
- **3/5** — Shaped hair geometry with a defined parting and a plausible hairline that blends rather than intersects. Some tonal variation root-to-tip. Anisotropic-ish highlight or at least a defined specular band. Moves as a rigid unit with the head, or has one simple secondary bone.
- **5/5** — Anisotropic highlight with **primary and secondary** specular bands that shift correctly as the head turns [SOURCED as the ACNH bar]. Strand or clump breakup at the silhouette edge — no perfectly smooth helmet outline. Soft alpha or geometry transition at the hairline; wispy baby-hair strands at the temples and nape. Secondary motion: the hair lags the head, overshoots, and settles at a mass-appropriate rate [SOURCED principle]. A cowlick or whorl that reads as authored rather than procedural. Ambient occlusion darkens where hair meets scalp.

### C6 — Cloth & material believability · weight 7

- **1/5** — Everything shares one roughness value. Fabric, wood, plastic, ceramic, and metal are visually indistinguishable apart from hue. Clothing is a rigidly-offset shell of the body mesh with hard boolean edges. No texture on any surface.
- **3/5** — Distinct material families with correct relative roughness (cotton matte, wood semi-gloss, plastic glossy, ceramic near-specular). Clothing has hems, seams, and a believable thickness at openings. Some normal or roughness map detail. Materials are internally uniform but categorically correct.
- **5/5** — Roughness *varies within* each material — worn spots on wood, fibre breakup on cotton, fingerprint haze on plastic. [SOURCED: uniform gloss with no variation is a primary realism failure.] Fabric shows a weave at close range and a soft sheen/fuzz at grazing angles. Clothing has authored folds that respond to pose, gathers at elastic points, and slight thickness visible at cuffs and collar. Bevelled edges on every hard-surface prop catching a specular line. Contact and material transitions are resolved — no naked boolean intersections anywhere in frame.

### C7 — Animation quality & secondary motion · weight 10

- **1/5** — Dead-still idle, or a single looping sine bob applied to the whole object. Linear interpolation with no easing. Poses pop. Nothing moves that isn't explicitly keyed. Loop seam is visible.
- **3/5** — Eased transitions, a breathing idle, distinct animations per activity, blended state transitions. Weight reads acceptably. Timing is competent but uniform — everything moves at the same rate with the same curve.
- **5/5** — Overlapping action throughout: head lags torso, arms lag shoulders, hair and cloth trail and settle at mass-appropriate rates [SOURCED principle]. Squash and stretch present but *subtle* — enough for bounce and life, not cartoon distortion [SOURCED caution]. Anticipation before every significant action and a settle after. Idle is treated as a first-class performance sustained across the whole session [SOURCED principle] — weight shifts, unprompted glances, a scratch, a yawn, varying breath depth. No detectable loop point. Motion is *asymmetric* — the baby does not do the same thing with both hands at the same time. At least one moment of unprompted behaviour that makes the character feel autonomous.

### C8 — Environment richness & set dressing · weight 8

- **1/5** — A box room: flat coloured walls, a floor plane, and 2–5 props floating at grid-aligned positions with visible gaps at the wall/floor junction. Wall decorations are flat quads or emoji. No skirting, no cornice, no window reveal depth. Nothing overlaps anything.
- **3/5** — A properly-built room: skirting board, window with frame depth and reveal, rug, several furniture pieces, wall art, believable scale relationships. Props sit on surfaces correctly. Reads as a real nursery. Layout is orderly and evenly distributed.
- **5/5** — Reads as *lived in*. Deliberate clutter and asymmetry: a blanket half-off, a toy on its side, books not flush on the shelf, a picture frame a degree off level, layered rugs, a basket overflowing. Density varies across the frame — dense corners and quiet negative space, composed rather than uniform. Small storytelling props imply activity that happened off-screen. Every object is grounded with contact shadow and AO. Depth layering front-to-back gives the room real volume. Surfaces have edge wear and micro-detail at close range. There is something new to notice on a second look.

### C9 — Lighting & mood · weight 9

- **1/5** — Flat ambient only, or a single unshadowed light. No cast shadows anywhere. No contact shadows. Objects appear pasted onto the background. Uniform illumination corner to corner. Lighting does not change across game states.
- **3/5** — Directional key with soft shadow maps, ambient fill, believable direction motivated by the window. Objects are grounded. Shadow softness roughly appropriate. Some state variation (day vs. night).
- **5/5** — Deliberate multi-light setup: warm key, cool sky-coloured fill from the opposite side, and a rim/kicker separating the character from the background. Shadows cast by **every** object regardless of size [SOURCED ACNH bar], with contact-hardening — tight and dark at the contact point, softening with distance. Ambient occlusion in every crevice and contact. Light has *colour* — warm key against cool shadow — creating real chromatic value range. Bounce light picks up floor and wall colour onto the character's underside. Mood shifts meaningfully and beautifully per state (nap-time is genuinely dim and warm, not just globally darkened). The character is always the brightest, highest-contrast thing in frame.

### C10 — Colour grading & post-processing · weight 6

- **1/5** — Raw linear or sRGB output, no tone mapping. Blown highlights clipping to pure white, crushed blacks. Visible banding on every gradient. Palette is arbitrary — hues chosen per-object without a governing scheme. No post-processing at all, or a single crude blur.
- **3/5** — ACES or AgX tone mapping applied [SOURCED as the two standard choices], correct colour space handling, a coherent limited palette. Dithering applied to kill gradient banding. Mild bloom on genuine highlights. Nothing clips.
- **5/5** — An authored *grade*, not just a tone map: lifted and slightly cool shadows, warm midtones, controlled highlight rolloff. Full value range — real darks and real near-whites present in frame — while remaining unmistakably a high-key pastel palette. Pastel richness comes from the lighting, not from desaturated albedo [SOURCED as the ACNH principle]. Bloom is threshold-controlled and affects only true highlights, never the whole frame. Subtle vignette focusing the eye. Zero banding — dithering/noise applied at the correct stage. Possibly a whisper of chromatic aberration or grain at the frame edge. The grade shifts with mood state as an authored look, not a brightness slider.

### C11 — Composition & camera · weight 6

- **1/5** — Subject dead-centre, camera at an arbitrary height and a distorting wide FOV. Character's head near or clipping the top edge. Tangents everywhere — shelf lines and window frames touching the silhouette. UI overlapping the character's face. No depth cue at all.
- **3/5** — Considered framing: the baby occupies a sensible portion of frame at a comfortable eye height, no bad tangents, headroom is correct, FOV isn't distorting. Camera moves are smooth and eased. Clear foreground/midground/background separation.
- **5/5** — Every framing looks *chosen*. Thirds or deliberate centring for effect. A longer lens (~35–45° vertical FOV) that flatters rather than distorts. Depth of field holding the baby sharp and softening the far wall — subtle, not a bokeh showreel. Leading lines in the set direct the eye to the character. Foreground occluders add depth on at least some shots. Camera has weight — it eases, settles, and drifts almost imperceptibly during idle rather than locking rigidly. Per-activity framings are distinct and each is individually well-composed. A still export from any moment would work as a store screenshot.

### C12 — Particle & FX craft · weight 6

- **1/5** — Emoji or flat sprites used as particles (✨, 💤, ❤️ as literal glyph quads). Particles are hard-edged, uniformly sized, uniformly coloured, spawn and die abruptly with no fade, and intersect geometry with visible hard cut lines. Emission is a symmetric burst from a point.
- **3/5** — Soft-edged custom particle textures, proper alpha fade in and out, size and rotation variance, sensible emission shapes, additive blending where appropriate. Bubbles look like bubbles. Reads as competent.
- **5/5** — FX are art-directed. Soft particles that fade near intersecting geometry — no hard cut lines against the floor or the baby [key tell]. Size, lifetime, rotation, opacity, and colour all vary across the population. Particles obey physics with drag and turbulence; they don't travel in straight lines. They pick up scene lighting rather than glowing at a fixed brightness. Bath foam has volume and clings; sparkles have a genuine hierarchy of sizes with a few hero particles among many small ones. Effects have proper attack/sustain/decay envelopes rather than uniform spawn-fade. FX read as *material* — foam, steam, dust motes in the window light — not as UI feedback stickers pasted over the 3D scene.

### C13 — UI/HUD visual design · weight 7

- **1/5** — System-emoji as button icons. Default browser controls. Inconsistent corner radii, arbitrary drop shadows, mismatched fonts. UI floats with no relationship to the art direction. Meters are raw rectangles. Elements collide with each other or with the character.
- **3/5** — Consistent custom icon set, coherent type, a defined spacing scale and corner-radius scale, a palette drawn from the game's own. Clear hierarchy. Buttons have proper pressed/hover/disabled states. Nothing overlaps. It looks like one designer made all of it.
- **5/5** — The UI has an authored *personality* consistent with the world — soft, rounded, tactile, as though made of the same materials as the nursery. Custom-drawn icons with real craft, not glyph substitutes. Micro-interactions on every element: press deforms with squash, meters fill with easing and a slight overshoot, state changes are animated not instant. Layout is composed around the character, never occluding the face. Depth handled deliberately (soft layered shadows or subtle translucency). Adapts gracefully across aspect ratios. Icon literalism throughout — every icon depicts the actual object [SOURCED Toca Boca principle]. Would pass as the UI of a published console family title.

### C14 — Readability for a 4-year-old · weight 8

*Score this as if watching an actual pre-literate child use the build.*

- **1/5** — Requires reading. Targets too small or too close together for imprecise motor control. More than ~7 choices on screen. No feedback on interaction — taps sometimes do nothing visible. Ambiguous icons. Destructive actions reachable with no undo. Important state communicated by colour alone.
- **3/5** — Icon-led with text as reinforcement only. Large well-separated targets. Every tap produces visible and audible feedback. Choices are bounded. Navigation is shallow. A child could operate it after a brief demonstration.
- **5/5** — Fully operable with zero reading, zero instruction, first try. Icon literalism — each icon *is* a picture of the thing [SOURCED]. **3–5 choices per screen maximum** [SOURCED Toca Boca discipline]. Every tap moves, changes, or sounds — nothing is ever inert [SOURCED]. Non-destructive by design: nothing can be lost or broken, no fail state, no timer, no score [SOURCED]. Targets sized for an imprecise finger with generous separation. The next affordance is always obvious from motion or highlight — the character or the object *invites* the interaction. Pacing is calm: softer sound, unhurried animation, no overstimulation [SOURCED Sago Mini principle]. State is communicated redundantly (shape + colour + motion), never colour alone.

### C15 — Polish & imperfection detail · weight 7

- **1/5** — Everything perfectly sharp-edged, perfectly symmetric, perfectly aligned, perfectly clean. Z-fighting visible. Objects float or sink through surfaces. Aliased jaggies on every edge. Textures stretched or obviously tiling. Placeholder assets still in frame.
- **3/5** — Bevelled hard edges, correct grounding, antialiasing on, no z-fighting, no visible tiling, consistent texel density. Clean and correct — but *sterile*.
- **5/5** — Imperfection is deliberately authored. Nothing is exactly axis-aligned that shouldn't be; small rotational and positional jitter throughout. Edge wear and rounding where hands and use would occur. Micro-bevels on every hard edge catching a specular line [SOURCED as a core realism requirement]. Dust and grime in crevices where AO already darkens. Slight variation between instances of the same prop — no two blocks identical in rotation or wear. Asymmetry in the character's rest pose. Fabric doesn't hang perfectly straight. The whole frame survives a 400% zoom in any region without revealing something unfinished.

### C16 — Overall "would a parent pay for this" · weight 10

*A holistic gut-check, scored last, and not the average of the others.*

- **1/5** — Reads unmistakably as a tech demo, tutorial output, or hobby project. A parent would assume it was free and would not install it. The word that comes to mind is "asset" or "prototype."
- **3/5** — Reads as a competent small indie or a decent app-store title. A parent might pay a few dollars, would not feel cheated, would not recommend it unprompted. Comparable to the mid-tier of the mobile toy-app market.
- **5/5** — Reads as a commercially shipped console/PC product. A parent seeing a single screenshot with no context would assume a studio made it and would price it in the $20–40 console family-title range. It has a visual *point of view*, not merely competence. Screenshots are store-page ready without cherry-picking. It would win, or at minimum credibly draw, a blind side-by-side against *My Universe – My Baby* on visual quality — and would clearly beat it on craft-per-frame even while conceding scope. A parent would show it to another parent.

---

### Score reporting format

The critic must output:

```
| # | Category                          | W  | Score | One-line justification |
|---|-----------------------------------|----|-------|------------------------|
| C1| Character appeal & proportions    | 10 |   ?   |                        |
... (all 16)

Weighted mean:      X.XX / 5
Unweighted mean:    X.XX / 5
Floor rule applied: yes/no  (any category ≤2 caps headline at 3.4)
HEADLINE:           X.XX / 5

Top 3 highest-leverage fixes (biggest score delta per unit of effort):
1. ...
2. ...
3. ...

Single worst thing in the frame:
...
```

---

## 4. Failure modes — the critic's checklist

Concrete, observable tells. The critic should walk this list against every frame reviewed and cite specific offences by name. **Not every item applies to every frame; an item is only a finding if it is visible.**

### 4.1 Geometry & modelling

1. Sharp, unbevelled 90° edges — nothing in the real world has them, and they catch no specular line. [SOURCED as a primary tell]
2. Visible boolean intersections — a limb pushed into a torso, a hair cap through a scalp, a prop through a wall, with a hard cut line at the junction.
3. Objects floating above their supporting surface, or sinking into it.
4. Z-fighting — flickering where two coplanar surfaces meet.
5. Faceted curves — insufficient segments on spheres and cylinders, visible polygonal silhouette on what should be round.
6. Inconsistent polygon density — a hyper-dense sphere next to an 8-sided cylinder.
7. Perfect bilateral symmetry on the character, on props, and on the room layout.
8. Everything axis-aligned and grid-snapped; no object rotated off-cardinal.
9. Wall/floor junction with no skirting board, no cornice, no transition geometry.
10. Windows with zero reveal depth — a texture on a wall rather than an opening with thickness.
11. Uniform wall thickness of zero — walls as single planes visible from the wrong side.
12. Props at identical scale repetition — three identical blocks at identical rotations.
13. Missing thickness on cloth, paper, and clothing — single-sided planes readable as infinitely thin at grazing angles.
14. Primitive-recognisable forms — the viewer can name the Three.js constructor that made each object.
15. Hard silhouette on hair — a smooth unbroken helmet outline with no strand breakup.
16. No deformation at joints — limbs pivoting as rigid segments with a visible crease or a collapsed volume at the elbow/knee.
17. Candy-wrapper twist — a forearm or wrist collapsing to near-zero volume under rotation.

### 4.2 Materials & texturing

18. One roughness value shared across all materials. [SOURCED as the single biggest realism killer]
19. Roughness with no spatial variation *within* a material — no wear, no breakup, no fingerprints.
20. Untextured flat colours on every surface — no albedo detail anywhere.
21. Everything reads as the same substance (typically "plastic" or "clay") regardless of what it depicts.
22. Metalness set to non-zero on non-metals, or metals with no environment to reflect.
23. No environment map / IBL, leaving reflective surfaces black or flatly lit.
24. Visible texture tiling with a recognisable repeat period.
25. Inconsistent texel density — one object crisp, its neighbour blurry.
26. Stretched UVs on cylinders, corners, and caps.
27. Normal maps at the wrong intensity — either invisible or looking embossed and plastic.
28. No AO map and no ambient occlusion of any kind, leaving crevices as bright as exposed surfaces.
29. Emissive used as a substitute for lighting — objects glowing to fake brightness.
30. Fabric with a specular highlight sharper than cloth ever produces.
31. Wood with no grain direction, or grain running the wrong way across a plank.
32. Skin sharing the same material response as the clothing.

### 4.3 Lighting & shadow

33. Flat uniform ambient with no directional component — the "no shadows anywhere" look.
34. Missing contact shadows / grounding AO, leaving every object pasted onto the background.
35. Missing cast shadows on small props — shadows only on the hero character. [ACNH's stated bar is shadows on **every** object]
36. Shadow with uniform softness regardless of distance from the occluder — no contact hardening.
37. Shadow acne — striping/banding on lit surfaces from bias errors.
38. Peter-panning — the shadow detached from the base of the object that casts it, from over-corrected bias.
39. Visible shadow-map edges, or shadow cascade seams crossing the frame.
40. Shadow resolution so low the edges are visibly stair-stepped.
41. Neutral grey shadows with no colour — real shadows take the colour of the fill/sky light.
42. Single light source with no fill and no rim; the character melts into the background on the shadow side. [SOURCED as a core failure]
43. Light direction unmotivated — a key from a direction with no window, lamp, or source to justify it.
44. No bounce light — the character's underside is pure black rather than picking up floor colour.
45. Lighting identical across every game state; "night" is the same setup with the exposure pulled down.
46. Blown-out clipping where the key hits — pure 255 white with no highlight detail.
47. The character is not the brightest, highest-contrast element in frame; the eye goes to a wall or a UI element instead.

### 4.4 Character, face & performance

48. Emoji or system-glyph art used for eyes, mouth, or expression. **Automatic 1/5 in the affected category.**
49. Dead-still idle — the character is motionless whenever not executing a scripted action.
50. A single sine-wave bob applied to the whole body as the entire idle.
51. Eyes that never blink, or blink on a perfect metronome.
52. Fixed forward gaze — pupils welded to the head's forward axis, no look-at.
53. No convergence — both eyes stare parallel at a near object.
54. Missing catchlight, or a catchlight painted into the texture that never moves with the light.
55. Identical catchlight position in both eyes.
56. Expression changes that pop instantly with no transition, anticipation, or settle.
57. A face where only the mouth changes — brows, lids, and cheeks static across every "expression."
58. Smiling without cheek raise or lower-lid narrowing — the classic non-Duchenne dead smile.
59. Perfectly symmetric expressions in every state.
60. Plastic skin — flat opaque diffuse with a hard neutral terminator.
61. Blush that ignores lighting entirely and stays uniformly bright in shadow.
62. No secondary motion: hair, clothing, and accessories rigidly welded to the skeleton. [SOURCED as what separates a puppet from a character]
63. All limbs moving in perfect synchrony — both arms doing exactly the same thing at exactly the same time.
64. Linear interpolation with no ease-in/ease-out; motion starts and stops instantly.
65. Visible loop seam — a detectable pop at the idle loop point.
66. No anticipation before an action and no settle after it.
67. Squash and stretch either entirely absent, or overdone into cartoon distortion. [SOURCED caution]
68. Foot sliding — feet translating while planted.
69. Poses that don't read in silhouette; limbs lost against the torso.
70. No weight — motion with no sense of mass, gravity, or inertia.

### 4.5 Environment & set dressing

71. A box room: two flat wall planes and a floor plane, nothing else structural.
72. Sparse prop count with large expanses of empty featureless floor.
73. Uniform prop distribution — objects evenly spaced with no density variation or composed clusters.
74. Everything perfectly tidy and perfectly aligned — no lived-in disorder.
75. Wall art as flat quads with no frame geometry and no thickness.
76. Emoji or clipart used as in-world decoration, posters, or toys.
77. No foreground layer — nothing between the camera and the subject to establish depth.
78. Scale errors — furniture that doesn't relate believably to the character's height.
79. No skirting, no cornice, no light switch, no power outlet, no door — none of the small architectural details that make a room a room.
80. Repeated props at identical orientation and identical wear.
81. Nothing that implies off-screen activity or a life lived in the space.
82. No storytelling detail — nothing rewarding a second look.
83. Rug or floor decal with a hard edge and no fibre, thickness, or contact shadow.
84. Background reading as a flat backdrop rather than an inhabited volume.

### 4.6 Particles & FX

85. Emoji or glyph sprites used as particles.
86. Hard-edged particles intersecting geometry with a visible cut line — no soft-particle depth fade.
87. Uniform particle size across the entire population — no hierarchy of hero and filler.
88. Uniform colour, uniform opacity, uniform rotation across all particles.
89. Particles popping in and out abruptly with no alpha fade at spawn or death.
90. Straight-line particle motion with no drag, turbulence, or noise.
91. Symmetric radial burst emission from a single point.
92. Particles unaffected by scene lighting — fixed brightness regardless of environment.
93. Additive blending everywhere, blowing out to white.
94. Particle count so low the individual sprites read as discrete objects rather than a phenomenon.
95. FX reading as UI stickers pasted over the 3D scene rather than as material occupying the space.
96. Foam/bubbles with no volume, no clinging, no interaction with the surface they sit on.
97. Effects with a uniform spawn-fade envelope rather than an authored attack/sustain/decay.

### 4.7 Post-processing, colour & rendering

98. No tone mapping — raw output with clipped highlights and crushed blacks.
99. Wrong colour space handling — washed-out or oversaturated output from mismatched sRGB/linear.
100. Visible banding on every gradient, sky, and soft shadow — no dithering applied. [SOURCED as a known Three.js issue with known fixes]
101. Compressed value range — nothing below ~50% or above ~90% luminance; the whole frame is midtones.
102. Bloom applied to the whole frame rather than threshold-limited to true highlights.
103. Aliasing — jagged silhouette edges, no AA of any kind.
104. Specular aliasing — shimmering highlights crawling on curved surfaces in motion.
105. Depth-of-field with a hard focal transition, or DoF so heavy it reads as a bug.
106. Arbitrary per-object hue choices with no governing palette.
107. Saturation used as the only tool for appeal — everything cranked, nothing muted for contrast.
108. No grade at all — the raw render output shipped as the final look.

### 4.8 Camera & composition

109. Subject dead-centred in every single shot.
110. Distorting wide FOV (60°+ vertical) making near objects balloon.
111. Bad tangents — a shelf line, window frame, or wall edge exactly grazing the character's silhouette.
112. Insufficient or excessive headroom.
113. Character's head or limbs clipped by the frame edge unintentionally.
114. Rigidly locked camera with zero drift or settle.
115. Camera moves with no easing — linear starts and stops.
116. Camera clipping through geometry, or near-plane clipping into the character.
117. UI occluding the character's face.
118. No visual hierarchy — the eye has nowhere to land.

### 4.9 UI/HUD

119. System emoji used as button icons. **Automatic 1/5 in C13.**
120. Inconsistent corner radii across elements.
121. Inconsistent drop shadows — different blur, offset, and opacity per element.
122. Multiple mismatched typefaces, or a default system font.
123. Arbitrary spacing with no underlying scale.
124. Meters as raw undecorated rectangles.
125. UI colours drawn from outside the game's palette.
126. No pressed / hover / disabled states.
127. Instant state changes with no animation.
128. UI elements overlapping each other or crowding the frame edge.
129. Text in a game for pre-literate children where an icon would serve.
130. More than 5 simultaneous choices presented. [SOURCED Toca Boca limit]
131. Icons that are abstract or metaphorical rather than literal pictures of the object. [SOURCED principle]
132. Interactive elements that produce no visible or audible response on tap. [SOURCED principle: every tap must move, change, or sound]
133. UI with no relationship to the world's art direction — generic flat-design cards over a soft 3D scene.

### 4.10 Global / holistic

134. The frame is *clean* but *sterile* — technically correct and emotionally inert.
135. Nothing in frame is imperfect, worn, tilted, or asymmetric.
136. The frame has no focal point.
137. The frame has no colour story — no dominant/accent relationship.
138. Placeholder assets, debug text, or default materials visible.
139. Any region of the frame that falls apart under 400% zoom.
140. The overall impression is "someone learning Three.js" rather than "someone shipping a product."

### 4.11 Observed in the current build as of 2026-07-26 — priority offenders

For calibration, the following were directly observed in `docs/*.png` from the existing build. These are the standing highest-priority fixes and the critic should verify each is resolved before awarding above a 2 in the relevant category:

- **#48 / #76 / #85 / #119 — system emoji used pervasively as art**: as UI button icons (🍎🛁😊⚡🍼🎈🌙), as in-world wall decoration (giraffe picture, teddy), as expression indicators floating beside the baby's head (😊), and as particles. This is the single most damaging issue in the build and currently caps C12, C13, and C8.
- **#33 / #34 / #35 — no cast shadows and no contact shadows anywhere**; every object including the baby, the tub, the crib, and the stool is pasted onto the background with no grounding.
- **#101 — severely compressed value range**; the entire frame lives in a narrow pastel midtone band with no darks and no highlights.
- **#71 / #72 / #79 — box room** with two flat wall planes, a floor, a skirting line, and a handful of widely-spaced props over large empty floor areas.
- **#14 / #21 — primitive-recognisable, uniformly-shaded forms**; every object reads as the same untextured matte substance.
- **#5 — faceted curves** visible on the tub rim and the crib rails.
- **#60 — flat plastic skin** with a hard terminator; **#61** blush is a flat unlit decal.
- **#54 — no catchlights**; eyes are closed-arc line art with no geometry.
- **#57 / #59 — mouth-and-closed-eye-arcs only**, perfectly symmetric, no brow or cheek participation.
- **#75 — wall art as flat quads**; **#83** rug as a hard-edged flat ellipse with no thickness or contact shadow.
- **#125 / #133 — flat-design UI cards** with hard white fills sitting over a soft 3D scene, with no shared art direction.
- **#117 — UI crowds the character**, and in the dress-up frame the customisation row cuts directly across the baby's body.

---

## 5. Blind A/B protocol

The purpose is to strip away the knowledge of authorship, which is the largest single source of bias in self-review.

### 5.1 Preparing the pair (done by the harness, not the critic)

1. Capture **our** frame at 1920×1080, no debug overlays, at a moment representative of normal play.
2. Obtain the **reference** frame from one of the Appendix A sources, cropped to the same aspect ratio.
3. **Normalise both** so that presentation artefacts cannot leak identity:
   - Resample both to identical pixel dimensions.
   - Strip all EXIF/metadata.
   - Re-encode both as PNG with identical settings.
   - Crop out any platform HUD, watermark, video-player chrome, or store-page furniture.
   - If one image carries visible text in a language the other does not, **crop the UI region out of both** and score UI separately in a non-blind pass. Language is an identity leak.
4. Randomise assignment to **A** and **B** with a coin flip. Record the mapping in a file the critic cannot read.
5. Present both to the critic in a single message, labelled only "Image A" and "Image B."

### 5.2 The critic's instructions

You are shown two still frames from two different baby-care games. You do not know which is which, and you must not attempt to infer it. **Do not speculate about authorship at any point in your response** — if you find yourself reasoning about which one is "ours," stop and delete that reasoning.

Answer in this exact order. Do not read ahead before answering the earlier items — first-impression data is destroyed by analysis.

**Part 1 — Snap judgement (answer in under 10 seconds of consideration each):**
1. Which image would you assume was made by a professional studio? A, B, or "cannot distinguish."
2. Which character would you rather care for? A or B. One sentence on why.
3. Which room would you rather be in? A or B.
4. If both were on a store page at the same price, which do you click? A or B.

**Part 2 — Blind category scoring:**
Score **both** images independently on all 16 rubric categories (Section 3), 1–5. Produce two full tables. Do not compare while scoring — score A completely, then score B completely.

**Part 3 — Forced discrimination:**
For each of the 16 categories, state which image wins and by how much: **decisive / clear / slight / tie**. You may not answer "tie" on more than 4 of the 16.

**Part 4 — Failure-mode audit:**
Walk Section 4 against **both** images. List every numbered failure mode you can actually observe, per image, citing the specific location in the frame ("#34, no contact shadow beneath the stool at lower-left"). Do not list a failure mode you cannot point to.

**Part 5 — The three-second test:**
Imagine each image shown to a parent for three seconds on a phone in a store listing. Write the one sentence that parent would think, for each image.

**Part 6 — Diagnosis:**
1. Name the **single most damaging visual defect** in each image.
2. Name the **single greatest strength** of each image.
3. For the weaker image overall: list the three changes that would most efficiently close the gap, ordered by score-delta-per-unit-of-effort.

**Part 7 — Confidence:**
State your confidence that a panel of ten adults would agree with your Part 1 answers: high / medium / low. If low, say what makes the pair hard to separate — that itself is a result.

### 5.3 What the harness reports afterward

After unblinding, record:
- Whether the critic's "professional studio" pick matched the reference or our build.
- The per-category delta (ours minus reference) across all 16.
- Every category where ours lost by **decisive** or **clear** — this is the work queue.
- Every category where ours won — protect these in future changes; regressions here are the most expensive kind.

### 5.4 Guardrails

- **Never run the A/B non-blind.** A non-blind comparison is worth roughly nothing.
- **Never A/B against a cherry-picked reference frame.** Use a frame that is representative of normal play, not the worst frame available.
- **Rotate reference frames** between reviews. Repeatedly beating one specific frame teaches overfitting to that frame.
- **Run the single-image rubric pass (Section 3) more often than the A/B.** The A/B is expensive and slow; the rubric is the daily driver. Use the A/B at milestones.
- If the critic identifies which image is which and says so, **the run is void.** Re-prepare with tighter normalisation.

---

## 6. Project constraints — what the critic may and may not ask for

`CONTRACTS.md` fixes several things. The critic must score within them, and must **not** raise findings that the architecture forbids. Encouragingly, the contract already exposes an API for nearly every 5/5 anchor above — in most categories the gap is *use*, not capability.

### 6.1 Hard constraints — never file these as findings

- **No binary assets.** All textures are procedurally generated in `src/engine/textures.js`; all materials come from `src/engine/materials.js`; all audio is WebAudio-synthesised. "Use a photo-sourced fabric texture" / "import a scanned wood grain" / "add an HDRI file" are **invalid findings**. The correct finding is "the procedural generator produces uniform roughness; add noise-driven breakup in `textures.js`."
- **Three.js r180 API only** — `outputColorSpace` / `colorSpace` / `SRGBColorSpace`. Never `outputEncoding`, `sRGBEncoding`, or legacy `Geometry`.
- **Shadow type is VSM.** Findings about shadow softness must be framed in VSM terms (`shadow.radius`, `blurSamples`, light-bleed reduction), not PCSS.
- **Performance budget:** 60fps on tier 2, 30fps on tier 0, **draw calls under ~180.** A finding that would blow the draw-call budget must say how it pays for itself (instancing, merged geometry, atlas) or it is not a valid finding. Tier 0 must degrade gracefully — score tier 2 for the rubric, but flag anything that would break tier 0.
- **Scale:** metres. Baby is **~0.62 m standing**, floor at y = 0. Scale-error findings must cite this.
- **Japanese UI copy, 4-year-old audience, no fail states, no timers.** These are design law, and they align with the C14 5/5 anchor — do not file "add a score" or "add a timer" as findings.

### 6.2 Category → API surface the critic should check is being exercised

| Cat | Contract surface that delivers it | The check |
|---|---|---|
| C1 | `Baby.build()`, `playPose()` | Is the 0.62 m scale respected? Does the silhouette read at each of `sit / lie / crawl / stand / held / bathe / sleep`? |
| C2 | `materials.js`, `Baby.setWet()` | Does `setWet` actually drive roughness *and* a drip, per contract? Is there a wrap/SSS term at all, or plain Standard? |
| C3 | `Baby.lookAt()` (null = **idle wander**), `Baby.blink()` | Is `lookAt(null)` producing genuine wander, or a static forward stare? Is `blink()` driven stochastically or on a fixed timer? |
| C4 | `Baby.setMood()` — **12 moods** are specified: `neutral, happy, giggle, sad, cry, sleepy, asleep, surprised, sulk, shy, excited, yum` | All 12 must be distinguishable with UI hidden and audio off. Count how many are actually implemented vs. aliased to the same face. Do they cross-fade or pop? |
| C5 | hair via `physics.js` verlet (`addRope`/`addCloth`) | Is hair rigidly parented, or is the verlet solver actually driving it? Is there any anisotropic highlight? |
| C6 | `materials.js`, `textures.js`, `Baby.setOutfit()`, `physics.addCloth()` | Do the 7 outfit slots (`top, bottom, socks, shoes, hat, bib, diaper`) read as distinct fabrics? Is any cloth simulated? |
| C7 | `playPose()`, `gesture()` — `wave, clap, point, reach, rub-eyes, yawn, kick, suck, burp, shiver, hiccup` | Are the idle-life gestures (`rub-eyes`, `yawn`, `hiccup`, `shiver`) firing *unprompted* during idle? That is the C7 5/5 "autonomous behaviour" requirement, and the API exists for it. |
| C8 | `Room.anchor()` (10 anchors), `Room.clutter(add)` | Is `clutter()` implemented and on by default? It is the single cheapest route to the C8 5/5 "lived in" anchor. Are all 10 anchors populated? |
| C9 | `Room.setMood()` — `day / golden / evening / night`, `setLamp()`, `setCurtains()`, `lighting` | Are all four moods genuinely different *setups* (key colour, direction, fill, rim), or one setup with exposure scaled? Does `setLamp` add a real practical light? |
| C10 | `pipeline` | Tone mapping present? Dithering to kill banding? Is bloom threshold-limited? |
| C11 | `CameraRig` presets: `wide, closeup, face, crib, tub, table, floor, overhead, title`; `focusRange` per preset; `nudge()`, `shake()` | Is DOF actually wired to `Baby.focusPoint()` and per-preset `focusRange`? Is each of the 9 presets *individually well-composed*, or are they arbitrary positions? Does `nudge()` give idle parallax? |
| C12 | `FX.burst()` — 10 kinds; `emitter()`, `ribbon()`, `decal()` | Are `ribbon` (pours, swipes) and `decal` (stains, dirt, foam) used, or only `burst`? Are particles soft-faded against geometry? `decal` is the answer to dirt-in-crevices (failure #29/#135). |
| C13 | `UI` — `meter()`, `star()`, `sticker()`, `toast()`, `prompt()`, `worldLabel()` | Are the 4 meters (`food, clean, happy, energy`) animated with easing? Is `worldLabel` used diegetically? Are icons custom-drawn or glyphs? |
| C14 | `UI.prompt()` / `hidePrompt()`, `ACTIVITIES` (5 top-level) | 5 activities = at the top of the Toca Boca 3–5 range; check no screen exceeds it. Is `prompt()` always giving the next affordance without text-reading? |
| C15 | `textures.js`, `materials.js` | Procedural generators are where micro-bevel highlights, wear, and per-instance variation must come from. Check for a seed/variation parameter — identical props with identical procedural output is failure #12/#80. |
| C16 | whole | — |

### 6.3 The highest-leverage observation

The contract specifies **12 moods, 11 gestures, 10 FX kinds, 9 camera presets, 10 room anchors, 4 lighting moods, 3 weather states, 7 outfit slots, and a `clutter()` toggle.** The build screenshots reviewed on 2026-07-26 exercise a small fraction of that surface. Before proposing new systems, the critic should first check **whether the systems that already exist are being called** — the fastest route from the current ~1.5/5 to a competitive score is using the API that was already designed for exactly these rubric categories.

---

## Appendix A — Reference sources for verification and imagery

No imagery could be downloaded (see §0.2). A critic operating in an unrestricted environment should fetch these at review time.

### A.1 Primary imagery — fetch these first

| URL | What to extract |
|---|---|
| `https://store.steampowered.com/app/1400760/My_Universe__My_Baby/` | The canonical screenshot set. Highest-quality stills available. **Primary source for A/B frames.** |
| `https://www.microids.com/game-my-baby/` | Publisher page; press-kit-grade assets and key art. |
| `https://www.nintendo.com/us/store/products/my-universe-my-baby-switch/` | Switch store screenshots — represents the lowest-fidelity platform, i.e. the honest baseline. |
| `https://store.playstation.com/en-us/product/UP1475-CUSA19311_00-MYBABY00000000US` | PS4 store screenshots. |
| `https://www.xbox.com/en-US/games/store/my-universe-my-baby/9NWNB9D64KMP` | Xbox store screenshots. |
| `https://www.mobygames.com/game/147992/my-universe-my-baby/` | MobyGames — usually the largest and best-catalogued screenshot archive, with credits. |

### A.2 Video — best source for animation, secondary motion, and idle quality

Stills cannot answer C7 (animation) or C3 (gaze). Use video for those.

| URL | Note |
|---|---|
| `https://www.youtube.com/watch?v=F1cjdpgrP5Y` | "My Universe My Baby Full PS4 gameplay" — long-form, unedited. **Best source for honest idle and animation assessment.** |
| `https://www.youtube.com/watch?v=xcd9dxRLPxA` | Switch gameplay — lowest-fidelity platform baseline. |
| `https://www.youtube.com/watch?v=8pCUgC-Y1xw` | Switch gameplay, alternate capture. |
| `https://www.youtube.com/watch?v=UkFY0yxzqzA` | Launch trailer (Microids / Smart Tale) — marketing-grade, i.e. the game at its most flattering. |
| `https://www.youtube.com/watch?v=CSPa3q4qIdM` | PS4 launch trailer. |
| `https://www.youtube.com/watch?v=zdolfSAeGvE` | Release trailer. |
| `https://www.youtube.com/watch?v=agRkc4lVCDI` | Game trailer (Dec 2021, New Edition). |

**When assessing from trailers, apply a discount.** Trailers are cut from best-case footage. Long-form gameplay capture is the honest reference.

### A.3 Critical reception

| URL | Note |
|---|---|
| `https://www.thexboxhub.com/my-universe-my-baby-review/` | The 40/100 mainstream-standards review. |
| `https://www.metacritic.com/game/xbox-one/my-universe-my-baby` | Confirms near-total mainstream press absence. |
| `https://opencritic.com/game/16137/my-universe-my-baby` | Aggregate. |
| `https://www.christcenteredgamer.com/reviews/pc-mac/my-universe-my-baby-switch` | The "graphics 8/10, 3D modelling very impressive" counterpoint. |
| `https://www.familyfriendlygaming.com/Reviews/2020/My%20Universe%20My%20Baby.html` | The "graphics 90%" counterpoint. |
| `https://store.steampowered.com/app/1591900/My_Universe__Interior_Designer/` | Sibling title, "Mostly Negative" — establishes the series quality tier. |

### A.4 Genre-leading comparables

| URL | Note |
|---|---|
| `https://www.resetera.com/threads/gamexplain-a-generational-leap-animal-crossing-new-horizons-early-graphics-tech-analysis-reveal-trailer.125100/` | The ACNH tech analysis cited throughout §2 — Rayleigh/Mie scattering, universal shadow casting, anisotropic hair highlights, PBR usage. **The most technically substantive source in this document.** |
| `https://en.wikipedia.org/wiki/Hello_Kitty_Island_Adventure` | HKIA background. |
| `http://www.nintendoworldreport.com/review/69822/hello-kitty-island-adventure-switch-review` | HKIA visual assessment vs. ACNH. |
| `https://www.thetechedvocate.org/the-art-style-of-nintendogs-crafting-cute-and-realistic-virtual-puppies/` | Nintendogs art-style analysis — fur, proportions, touch-reactive texture. |
| `https://sagomini.com/our-story/` | Sago Mini design philosophy. |
| `https://www.ungrammary.com/post/designing-for-kids-ux-design-tips-for-children-apps` | Children's UX principles; source of the Toca Boca icon-literalism and 3–5-choice discipline. |
| `https://www.aufaitux.com/blog/ui-ux-designing-for-children/` | Age-appropriate UI guidelines. |
| `https://en.wikipedia.org/wiki/Baby_schema` | Kindchenschema — the proportional basis for C1. |
| `https://www.pnas.org/doi/10.1073/pnas.0811620106` | Baby schema and the brain reward system — why C1 and C16 are causally linked. |
| `https://anim.works/the-12-principles-of-animation-reframed-for-games/` | Animation principles reframed for games — basis for C7. |
| `https://echoesofsomewhere.com/2023/10/16/sub-surface-scattering/` | Practical fake-SSS for real-time — basis for C2. |
| `https://marmoset.co/posts/creating-realistic-skin-toolbag-saurabh-jethani/` | Skin authoring reference — where to paint redness. |
| `https://threejs-journey.com/lessons/realistic-render` | Three.js render setup. |
| `https://discourse.threejs.org/t/tone-mapping-overview/75204` | Tone-mapping comparison — basis for C10. |
| `https://discourse.threejs.org/t/shadow-acne-banding-what-i-learned/43666` | Shadow acne and banding — failure modes #37, #100. |
| `https://sbcode.net/threejs/soft-shadows/` | Soft shadow implementation — failure mode #36. |
| `https://www.360render.com/3d-rendering/why-your-3d-product-renders-look-fake-5-common-lighting-and-material-mistakes/` | Uniform roughness and flat lighting as primary realism killers — §4.2, §4.3. |
| `https://blog.3sfarm.com/10-blender-3d-render-mistakes-and-how-to-fix-them` | General render failure modes. |

### A.5 If reference imagery is later downloaded

The repo root `.gitignore` line 6 already excludes `baby-care-3d/docs/reference/`. **Keep it that way.** Reference frames are copyrighted material retained locally for private critique only — do not commit them, do not publish them, do not include them in any artifact or build output. Note that because the whole directory is excluded, `docs/reference/README.md` is untracked too; that is acceptable, its content is reproduced in §0.2 above.
