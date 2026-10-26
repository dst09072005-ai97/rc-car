# MILESTONE 3.2 — VERTICAL SLICE ART QA & VISUAL REVIEW REPORT

**Status:** `VERIFIED_ON_DISK` & `VISUALLY_REVIEWED`  
**Review Tool:** Blender 5.2.2 LTS Workbench Renderer (1280x720, Studio lighting, Material color, Cavity enabled)  
**Render Output Directory:** `docs/screenshots/milestone_3_2/`  
**Source Asset:** `models/vertical_slice_city_block.blend`  
**Target glTF Asset:** `controller_godot/models/vertical_slice_city_block.glb`  

---

## 1. Visual QA Shots & Detailed Review Findings

### Shot 01: Top-Down City Slice View (`01_top_down_city_slice.png`)
- **Camera:** `Cam_01_TopDown` at `(0.0, 0.0, 36.0)`, looking straight down at origin.
- **File Size:** 756,074 bytes.
- **Visual Review:**
  - Complete 32m x 30m city block layout visible.
  - Central two-lane asphalt road (width 7.0m) with dashed center line markings and zebra crosswalk.
  - West sidewalk (4.2m width) fronting the Shophouse cafe with outdoor tables and awning canopy.
  - East sidewalk (4.2m width) with Vietnamese bus stop canopy and street tree planters.
  - Vehicle (Sedan) properly placed on the road lane.
  - Overall scale, proportion, and street hierarchy are consistent with a realistic urban block.

### Shot 02: Exterior Front Cafe (`02_exterior_front_cafe.png`)
- **Camera:** `Cam_02_Facade_Front` at `(-1.2, 0.0, 2.2)`, looking directly at cafe facade `(-7.18, 0.0, 2.6)`.
- **File Size:** 988,189 bytes.
- **Visual Review:**
  - **Vietnamese 3D Signboard Text:** Clearly displays the diacritic extruded text `"CÀ PHÊ PHỐ VIỆT"` in front elevation, perfectly oriented facing the street (no mirroring or reversal).
  - **Entrance Door:** `Cafe_Entrance_Door_Hinged` properly pivoted at `Y = +0.80m` edge, rotated open inwards at -82°, leaving an unobstructed 1.6m clear entrance.
  - **Facade Framing:** Brick/tile pillars, wooden wainscoting, glass window panes, and upper header beam cleanly aligned without Z-fighting.

### Shot 03: First-Person Sidewalk Walkway (`03_first_person_sidewalk.png`)
- **Camera:** `Cam_03_FirstPerson_Sidewalk` at `(-5.0, -11.0, 1.65)`, eye level 1.65m looking north.
- **File Size:** 792,589 bytes.
- **Visual Review:**
  - Realistic human eye level perspective walking along the sidewalk.
  - Red/beige fabric canopy projecting overhead.
  - Outdoor cafe seating: cylindrical tables and cube stools correctly grounded.
  - Streetlights with cantilevered horizontal arms and downward lamps line the curb edge.
  - NPC commuter standing ahead naturally at scale.

### Shot 04: Interior Cafe Looking Out (`04_interior_cafe_looking_out.png`)
- **Camera:** `Cam_04_Interior_Cafe` at `(-13.0, -1.5, 1.65)`, inside cafe looking east out the doorway.
- **File Size:** 969,002 bytes.
- **Visual Review:**
  - Wooden service counter and back storage shelves visible inside.
  - Open hinged entrance door seen from inside with clear doorway opening.
  - Sidewalk, street road, and bus stop shelter visible through the open doorway.
  - Ceiling slab at Z=3.8m gives proper volumetric containment.

### Shot 05: Sedan Three-Quarter Detail (`05_sedan_three_quarter.png`)
- **Camera:** `Cam_05_Sedan_ThreeQuarter` at `(5.2, -10.5, 2.2)`, looking at sedan center `(1.75, -6.0, 0.7)`.
- **File Size:** 1,045,388 bytes.
- **Visual Review:**
  - **Vehicle Proportions:** Distinct hood (front), cabin, and trunk (rear) silhouettes replace previous monolithic box.
  - **Sloped Glass Surfaces:** Forward windshield pitched at 35° and rear window pitched at -32°. Side glass panels inset.
  - **Side Mirrors:** Left and right side mirrors mounted with realistic outward tilt.
  - **Lighting Elements:** Front headlights and rear taillight bands mounted cleanly onto body recesses.
  - **Concentric Alloy Rims:** 4 independent wheels with distinct outer rubber tires (R=0.34m) and inner concentric chrome rims (R=0.22m) centered perfectly on wheel hubs.

### Shot 06: Articulated Characters & Pet Dog (`06_characters_and_dog.png`)
- **Camera:** `Cam_06_Characters_And_Dog` at `(-2.6, -8.2, 1.4)`, looking at sidewalk character group `(-4.5, -6.0, 0.7)`.
- **File Size:** 1,009,354 bytes.
- **Visual Review:**
  - **Humanoid NPC:** Realistic proportions (height ~1.75m), separate head, torso, shoulder-jointed arms, hip-jointed legs, and shoes. Hip pivot at Z=0.78m and shoulder pivot at Z=1.34m permit procedural locomotion.
  - **Pet Dog:** Standing alert beside the commuter on the sidewalk. Four legs jointed at hip/shoulder heights, distinct head, and an upward-angled tail (35°).
  - Ground contact verified: shoes and dog paws rest cleanly on sidewalk surface (Z=0.15m) without floating or interpenetrating.

---

## 2. Summary of Art QA Checks

| QA Criterion | Status | Evidence |
|---|---|---|
| Pivot Correctness (Door, Limbs, Tail) | `PASS` | Door hinges at corner edge; limbs pivot at top joints |
| Scale & Proportion | `PASS` | Shophouse 7.2m, door 2.35m, car 4.4m, NPC 1.75m |
| Vietnamese Typographic Fidelity | `PASS` | 3D mesh `"CÀ PHÊ PHỐ VIỆT"` renders crisp and unreversed |
| Visual Clipping / Z-Fighting | `PASS` | No surface flicker; cavity highlights clean geometric boundaries |
| Material Separation | `PASS` | 25 distinct materials mapped to PBR slots in glTF |
