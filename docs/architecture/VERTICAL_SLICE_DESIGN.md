# VERTICAL SLICE DESIGN SPECIFICATION — MILESTONE 3
**Autonomous VR City Simulator**  
**Art Style:** Stylized Realistic (Modern Vietnamese / Southeast Asian Urban)  
**Primary Runtime:** Godot 4.7.2 Native OpenXR (Meta Quest 3 Standalone)  
**Date:** 2026-10-18  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Architectural & Spatial Overview

The Milestone 3 Vertical Slice represents an authentic, high-immersion urban block ($32.0\text{ m} \times 30.0\text{ m}$) designed from the ground up for 6DOF standalone VR on Meta Quest 3.

```
+-------------------------------------------------------------------------+
| NORTH PARK BUFFER (Y = +7.0 to +14.0m) : Grass Lawn, Benches, Hedges   |
+-------------------------------------------------------------------------+
| NORTH SIDEWALK (Y = +3.5 to +7.0m) : Bus Shelter, Shade Trees, Planters |
+=========================================================================+
| ROADWAY (Y = -3.5 to +3.5m, Width = 7.0m) : 2 Lanes, Zebra Crossing    |
|   <--- Westbound Lane (Z = -1.75m)     |   Eastbound Lane (Z = +1.75m) --->
+=========================================================================+
| SOUTH SIDEWALK (Y = -3.5 to -7.0m, Width = 3.5m) : Curb, Clear Walkway  |
| Buffer Zone (Y = -5.7 to -7.0m) : Outdoor Cafe Tables, Potted Plants    |
+-------------------------------------------------------------------------+
| SOUTH SHOPHOUSE STRIP (Y = -7.0 to -16.0m)                              |
|   West Building (12m) | CAFE PHO (10m) | Shophouse 2 (6.5m)             |
+-------------------------------------------------------------------------+
```

---

## 2. Metric Scale & Clearance Compliance Matrix

Every spatial dimension was generated using a strict 1:1 Metric Standard ($1\text{ BU} = 1.0\text{ m}$).

| Zone / Component | Measured Geometry | Design Standard | Clearance / Safety Margin | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Road Width** | $7.00\text{ m}$ (2 lanes $\times 3.5\text{ m}$) | Vietnamese Urban Road Standard | Ample for 2 opposing vehicles | **PASS** |
| **Sidewalk Width** | $3.50\text{ m}$ ($0.2\text{ m}$ curb + $3.3\text{ m}$ paver) | Class 1 Urban Pedestrian Standard | $2.00\text{ m}$ clear continuous walking corridor | **PASS** |
| **Curb Step Height** | $0.15\text{ m}$ ($15\text{ cm}$) | Standard urban curb step | Accessible with step-up colliders | **PASS** |
| **Cafe Entrance Doorway** | $2.70\text{ m}$ clear opening ($X \in [-1.7, 1.0]$) | Min $1.20\text{ m}$ for VR comfort | $+1.50\text{ m}$ excess comfort clearance | **PASS** |
| **Cafe Ground Floor Height** | $3.80\text{ m}$ floor-to-ceiling | Tropical shophouse high ceiling | $+1.95\text{ m}$ headroom above VR player | **PASS** |
| **Cafe Awning Projection** | $1.80\text{ m}$ over sidewalk buffer | Max $2.00\text{ m}$ municipal code | Bottom clearance $2.75\text{ m}$ above pavers | **PASS** |
| **Awning Headroom** | $2.75\text{ m}$ bottom clearance | Min $2.20\text{ m}$ controller reach | $+0.90\text{ m}$ above $1.85\text{ m}$ player capsule | **PASS** |
| **Bus Stop Shelter** | $4.20\text{ m} \times 1.60\text{ m}$, roof $2.65\text{ m}$ | Standard transit shelter | Internal bench $0.45\text{ m}$ seat height | **PASS** |
| **Tree Canopy Clearance** | Trunk height $3.20\text{ m}$ | Min $2.50\text{ m}$ walking clearance | Leaves start at $Z = 3.60\text{ m}$ (unimpeded) | **PASS** |

---

## 3. Shophouse Café ("Cà phê Phố") Detailing

The centerpiece of the vertical slice is a detailed, culturally grounded Vietnamese shophouse café:

1. **Façade & Street Level:**
   - Signage: Solid teak fascia board with 3D illuminated letters ("CÀ PHÊ PHỐ") using emissive PBR shader.
   - Canopy: Deep forest green fabric awning with steel support struts angled at $45^\circ$.
   - Windows & Entrance: Fixed clear glass display panel on right; wide open walk-in entrance on left allowing smooth VR transition from street to interior.
   - Upper Balconies & AC Units: 2nd floor balcony with black steel railing, louvered teak French doors, and exterior air conditioning compressor units with modeled exhaust fans.

2. **Interior Ground Floor (Fully Walkable):**
   - Floor: Geometric ceramic tile pavers.
   - Bar & Service Counter: Teak counter top, matte black paneling, multi-group commercial espresso machine in polished chrome, coffee bean grinder, stacked ceramic cups.
   - Seating: 3 interior wooden tables with steel pedestal bases and matching bistro chairs.
   - Lighting: 4 overhead warm pendant lamps hanging from the ceiling with emissive tungsten glow.
   - Rear Shelving: Modular backbar shelving unit holding beverage bottles and canisters.

---

## 4. Asset Geometry & Material Budget

Exhaustive headless inspection via Blender 5.2.2 LTS confirms the vertical slice model (`vertical_slice_city_block.blend`):

* **Total Mesh Objects:** 233 objects organized into 6 clean collections.
* **Total Vertices:** 5,526 vertices.
* **Total Faces / Polygons:** 4,428 faces.
* **Total PBR Materials:** 40 specialized materials:
  - Surface PBR: Asphalt, Curb concrete, Sidewalk pavers, Dark soil, Tile floor, Wood teak, Light oak.
  - Architectural: Warm café plaster, Modern gray plaster, Forest green awning, Terracotta ceramic.
  - Metallic & Frame: Black metal frame, Polished chrome, Steel bus structure, Alloy wheel rims.
  - Optical & Emissive: Storefront clear glass ($\alpha = 0.35$), Tinted vehicle glass ($\alpha = 0.55$), LED street lights, Warm cafe pendants, Headlights, Taillights, Signboard.
* **Target Standalone Performance (Meta Quest 3):**
  - Triangle budget: $\approx 8,800$ triangles (well under the 100,000 budget).
  - Draw call estimate: $< 45$ batches with Godot Compatibility renderer.
  - Frame rate target: 90 FPS locked with Foveation Level 2.

---

## 5. Dynamic Simulation Entities

1. **Urban Sedan Vehicle:**
   - Mesh breakdown: `Vehicle_Sedan_Body` + 4 separated wheels (`Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`).
   - Wheel radius: $r = 0.32\text{ m}$.
   - Wheel rotation physics: $\Delta \theta = \frac{v \cdot \Delta t}{r}$ applied per frame along local axle.
   - Speed: $6.5\text{ m/s}$ ($\approx 23.4\text{ km/h}$) eastbound lane traversal with seamless boundary looping.

2. **Pedestrian NPCs:**
   - **NPC 1 (Commuter / Student):** Stylized humanoid figure with torso, head, legs, and shoes patrolling the South Sidewalk walking corridor between $X = -8.0\text{ m}$ and $+8.0\text{ m}$ ($v = 1.2\text{ m/s}$) with sinusoidal leg swing animation.
   - **NPC 2 (Bus Passenger):** Waiting commuter at the North Bus Stop shelter.

3. **Urban Fauna:**
   - **Animal 1 (Street Dog):** Stylized golden tan dog resting near the café terrace with procedural tail-wagging animation.

---

## 6. Locomotion & Control Architecture

* **Character Rig:** `CharacterBody3D` capsule collider ($r = 0.30\text{ m}, h = 1.85\text{ m}$).
* **VR Locomotion:**
  - Left Controller Thumbstick: Smooth directional translation oriented to HMD look direction.
  - Right Controller Thumbstick: $45^\circ$ Snap Turn with $0.35\text{ s}$ debounce.
* **Desktop / Headless Fallback:**
  - `W/A/S/D` and Arrow keys for movement.
  - `Q/E` keys for snap turning.
  - Automated diagnostic suite executes automatically in headless or test mode.
