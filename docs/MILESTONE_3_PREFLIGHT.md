# MILESTONE 3 — PREFLIGHT AUDIT REPORT
- **Timestamp:** 2026-10-18T17:34:03.297960
- **Blender Version:** 5.2.2 LTS (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`)
- **Project Root:** `D:\XE_RC_FPV_V10`

## 1. File Inventory & Checksum Verification
| Relative Path | Status | Size (Bytes) | Last Modified | SHA-256 (First 16 chars) |
|---|---|---:|---|---|
| `models\calibration_gate.blend` | **FOUND** | 144145 | 2026-10-18 13:11:26 | `68935d6bbee7e23b...` |
| `models\graybox_city_block.blend` | **FOUND** | 155446 | 2026-10-18 13:11:31 | `b34863605dace977...` |
| `blender_scripts\generate_calibration_and_graybox.py` | **FOUND** | 19735 | 2026-10-18 13:11:16 | `29eabbfd0feaec06...` |
| `controller_godot\models\calibration_gate.glb` | **FOUND** | 354228 | 2026-10-18 13:11:31 | `3b9b8a4485a5ab4e...` |
| `controller_godot\models\graybox_city_block.glb` | **FOUND** | 386060 | 2026-10-18 13:11:31 | `506bd48a628b5f07...` |
| `www\models\calibration_gate.glb` | **FOUND** | 354228 | 2026-10-18 13:11:31 | `3b9b8a4485a5ab4e...` |
| `www\models\graybox_city_block.glb` | **FOUND** | 386060 | 2026-10-18 13:11:32 | `506bd48a628b5f07...` |
| `controller_godot\project.godot` | **FOUND** | 1096 | 2026-10-18 17:22:00 | `60b857de28a04cf7...` |
| `controller_godot\scenes\city_graybox_test.tscn` | **FOUND** | 188 | 2026-10-18 13:19:21 | `cc5b9d9de2401aa1...` |
| `controller_godot\scripts\run_graybox_collision_test.gd` | **FOUND** | 2620 | 2026-10-18 13:20:47 | `0c80b41b61d58620...` |
| `build\android\XE_RC_FPV_V18.apk` | **FOUND** | 86572783 | 2026-10-18 13:18:53 | `f6287b1c5fd6f873...` |
| `build\android\XE_RC_FPV_V18_mobile.apk` | **FOUND** | 90316399 | 2026-10-18 13:35:57 | `769a8c2a4fd40bd1...` |

## 2. Blender Source Inspection (`calibration_gate.blend` & `graybox_city_block.blend`)
### File: `models\calibration_gate.blend`
- **Status:** `VERIFIED_READ_ONLY`
- **Unit System:** `METRIC` (`scale_length = 1.0`)
- **Collections:** ``
- **Object Count:** 26 | **Total Polygons:** 2401

| Object Name | Type | Origin (m) | Scale | Dimensions (X,Y,Z m) | Polys | UVs | Materials |
|---|---|---|---|---|---:|---|---|
| `Axis_X_Arrow` | MESH | (0.925, 0.0, 0.025) | (1.0, 1.0, 1.0) | (0.15, 0.12, 0.12) | 33 | ['UVMap'] | ['Mat_Axis_X_Red'] |
| `Axis_X_Shaft` | MESH | (0.425, 0.0, 0.025) | (1.0, 1.0, 1.0) | (0.85, 0.05, 0.05) | 34 | ['UVMap'] | ['Mat_Axis_X_Red'] |
| `Axis_Y_Arrow` | MESH | (0.0, 0.925, 0.025) | (1.0, 1.0, 1.0) | (0.12, 0.15, 0.12) | 33 | ['UVMap'] | ['Mat_Axis_Y_Green'] |
| `Axis_Y_Shaft` | MESH | (0.0, 0.425, 0.025) | (1.0, 1.0, 1.0) | (0.05, 0.85, 0.05) | 34 | ['UVMap'] | ['Mat_Axis_Y_Green'] |
| `Axis_Z_Arrow` | MESH | (0.0, 0.0, 0.925) | (1.0, 1.0, 1.0) | (0.12, 0.12, 0.15) | 33 | ['UVMap'] | ['Mat_Axis_Z_Blue'] |
| `Axis_Z_Shaft` | MESH | (0.0, 0.0, 0.425) | (1.0, 1.0, 1.0) | (0.05, 0.05, 0.85) | 34 | ['UVMap'] | ['Mat_Axis_Z_Blue'] |
| `Calibration_BasePlate` | MESH | (0.0, 0.0, -0.025) | (1.0, 1.0, 1.0) | (2.4, 2.4, 0.05) | 6 | ['UVMap'] | ['Mat_Gate_Metal'] |
| `Gate_Left_Post` | MESH | (-0.7, 0.0, 1.2) | (1.0, 1.0, 1.0) | (0.2, 0.2, 2.4) | 6 | ['UVMap'] | ['Mat_Gate_Metal'] |
| `Gate_Right_Post` | MESH | (0.7, 0.0, 1.2) | (1.0, 1.0, 1.0) | (0.2, 0.2, 2.4) | 6 | ['UVMap'] | ['Mat_Gate_Metal'] |
| `Gate_Top_Lintel` | MESH | (0.0, 0.0, 2.3) | (1.0, 1.0, 1.0) | (1.6, 0.2, 0.2) | 6 | ['UVMap'] | ['Mat_Gate_Metal'] |
| `Player_Capsule_Body` | MESH | (0.0, 0.0, 0.925) | (1.0, 1.0, 1.0) | (0.6, 0.6, 1.25) | 34 | ['UVMap'] | ['Mat_Player_Envelope'] |
| `Player_Capsule_Bottom` | MESH | (0.0, 0.0, 0.3) | (1.0, 1.0, 1.0) | (0.6, 0.6, 0.6) | 512 | ['UVMap'] | ['Mat_Player_Envelope'] |
| `Player_Capsule_Top` | MESH | (0.0, 0.0, 1.55) | (1.0, 1.0, 1.0) | (0.6, 0.6, 0.6) | 512 | ['UVMap'] | ['Mat_Player_Envelope'] |
| `Player_Eye_Level_Marker` | MESH | (0.0, 0.0, 1.68) | (1.0, 1.0, 1.0) | (0.56, 0.56, 0.015) | 34 | ['UVMap'] | ['Mat_Eye_Level_Disc'] |
| `Player_Left_Controller_Sphere` | MESH | (-0.28, 0.25, 1.05) | (1.0, 1.0, 1.0) | (0.14, 0.14, 0.14) | 512 | ['UVMap'] | ['Mat_Controller_Sphere'] |
| `Player_Right_Controller_Sphere` | MESH | (0.28, 0.25, 1.05) | (1.0, 1.0, 1.0) | (0.14, 0.14, 0.14) | 512 | ['UVMap'] | ['Mat_Controller_Sphere'] |
| `Tick_050m_Knee_L` | MESH | (-0.7, 0.0, 0.5) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_050m_Knee_R` | MESH | (0.7, 0.0, 0.5) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_100m_Waist_L` | MESH | (-0.7, 0.0, 1.0) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_100m_Waist_R` | MESH | (0.7, 0.0, 1.0) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_168m_EyeLevel_L` | MESH | (-0.7, 0.0, 1.68) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_168m_EyeLevel_R` | MESH | (0.7, 0.0, 1.68) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_185m_HeadCrown_L` | MESH | (-0.7, 0.0, 1.85) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_185m_HeadCrown_R` | MESH | (0.7, 0.0, 1.85) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_220m_LintelClearance_L` | MESH | (-0.7, 0.0, 2.2) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |
| `Tick_220m_LintelClearance_R` | MESH | (0.7, 0.0, 2.2) | (1.0, 1.0, 1.0) | (0.05, 0.22, 0.02) | 6 | ['UVMap'] | ['Mat_Accent_Yellow'] |

### File: `models\graybox_city_block.blend`
- **Status:** `VERIFIED_READ_ONLY`
- **Unit System:** `METRIC` (`scale_length = 1.0`)
- **Collections:** ``
- **Object Count:** 64 | **Total Polygons:** 2322

| Object Name | Type | Origin (m) | Scale | Dimensions (X,Y,Z m) | Polys | UVs | Materials |
|---|---|---|---|---|---:|---|---|
| `Alley_Curb_Ramp` | MESH | (7.75, -3.7, 0.04) | (1.0, 1.0, 1.0) | (3.5, 0.4, 0.08) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `Alleyway_Paving` | MESH | (7.75, -11.5, 0.075) | (1.0, 1.0, 1.0) | (3.5, 9.0, 0.15) | 6 | ['UVMap'] | ['Mat_Sidewalk_Paver'] |
| `Bus_Glass_Back` | MESH | (-5.5, 6.5, 1.35) | (1.0, 1.0, 1.0) | (3.6, 0.08, 2.0) | 6 | ['UVMap'] | ['Mat_Tinted_Glass'] |
| `Bus_Post_1` | MESH | (-7.3, 5.3, 1.4) | (1.0, 1.0, 1.0) | (0.08, 0.08, 2.5) | 34 | ['UVMap'] | ['Mat_Bus_Shelter_Steel'] |
| `Bus_Post_2` | MESH | (-3.7, 5.3, 1.4) | (1.0, 1.0, 1.0) | (0.08, 0.08, 2.5) | 34 | ['UVMap'] | ['Mat_Bus_Shelter_Steel'] |
| `Bus_Post_3` | MESH | (-7.3, 6.5, 1.4) | (1.0, 1.0, 1.0) | (0.08, 0.08, 2.5) | 34 | ['UVMap'] | ['Mat_Bus_Shelter_Steel'] |
| `Bus_Post_4` | MESH | (-3.7, 6.5, 1.4) | (1.0, 1.0, 1.0) | (0.08, 0.08, 2.5) | 34 | ['UVMap'] | ['Mat_Bus_Shelter_Steel'] |
| `Bus_Shelter_Roof` | MESH | (-5.5, 5.9, 2.7) | (1.0, 1.0, 1.0) | (4.2, 1.6, 0.1) | 6 | ['UVMap'] | ['Mat_Bus_Shelter_Steel'] |
| `Bus_Waiting_Bench` | MESH | (-5.5, 6.1, 0.375) | (1.0, 1.0, 1.0) | (2.4, 0.45, 0.45) | 6 | ['UVMap'] | ['Mat_Shophouse_WoodTrim'] |
| `Cafe_Awning_Canopy` | MESH | (1.0, -6.1, 2.85) | (1.0, 1.0, 1.0) | (9.6, 1.8, 0.08) | 6 | ['UVMap'] | ['Mat_Cafe_Awning_Fabric'] |
| `Cafe_Chair_0_0` | MESH | (-1.95, -6.1, 0.375) | (1.0, 1.0, 1.0) | (0.35, 0.35, 0.45) | 6 | ['UVMap'] | ['Mat_Cafe_Furniture_Wood'] |
| `Cafe_Chair_0_1` | MESH | (-1.05, -6.1, 0.375) | (1.0, 1.0, 1.0) | (0.35, 0.35, 0.45) | 6 | ['UVMap'] | ['Mat_Cafe_Furniture_Wood'] |
| `Cafe_Chair_1_0` | MESH | (3.05, -6.1, 0.375) | (1.0, 1.0, 1.0) | (0.35, 0.35, 0.45) | 6 | ['UVMap'] | ['Mat_Cafe_Furniture_Wood'] |
| `Cafe_Chair_1_1` | MESH | (3.95, -6.1, 0.375) | (1.0, 1.0, 1.0) | (0.35, 0.35, 0.45) | 6 | ['UVMap'] | ['Mat_Cafe_Furniture_Wood'] |
| `Cafe_Glass_Storefront` | MESH | (1.0, -6.95, 1.95) | (1.0, 1.0, 1.0) | (8.8, 0.15, 3.0) | 6 | ['UVMap'] | ['Mat_Tinted_Glass'] |
| `Cafe_Ground_Wall` | MESH | (1.0, -11.5, 2.05) | (1.0, 1.0, 1.0) | (10.0, 9.0, 3.8) | 6 | ['UVMap'] | ['Mat_Shophouse_Plaster'] |
| `Cafe_Table_Leg_0` | MESH | (-1.5, -6.1, 0.5) | (1.0, 1.0, 1.0) | (0.08, 0.08, 0.7) | 34 | ['UVMap'] | ['Mat_Shophouse_WoodTrim'] |
| `Cafe_Table_Leg_1` | MESH | (3.5, -6.1, 0.5) | (1.0, 1.0, 1.0) | (0.08, 0.08, 0.7) | 34 | ['UVMap'] | ['Mat_Shophouse_WoodTrim'] |
| `Cafe_Table_Top_0` | MESH | (-1.5, -6.1, 0.88) | (1.0, 1.0, 1.0) | (0.8, 0.8, 0.04) | 34 | ['UVMap'] | ['Mat_Cafe_Furniture_Wood'] |
| `Cafe_Table_Top_1` | MESH | (3.5, -6.1, 0.88) | (1.0, 1.0, 1.0) | (0.8, 0.8, 0.04) | 34 | ['UVMap'] | ['Mat_Cafe_Furniture_Wood'] |
| `Cafe_Upper_Floors` | MESH | (1.0, -11.5, 7.15) | (1.0, 1.0, 1.0) | (10.0, 9.0, 6.4) | 6 | ['UVMap'] | ['Mat_Shophouse_Plaster'] |
| `Cafe_Wood_Signboard` | MESH | (1.0, -6.9, 3.7) | (1.0, 1.0, 1.0) | (9.2, 0.25, 0.5) | 6 | ['UVMap'] | ['Mat_Shophouse_WoodTrim'] |
| `Lamp_Arm_0` | MESH | (-10.0, 3.15, 5.55) | (1.0, 1.0, 1.0) | (0.1, 1.304, 0.213) | 34 | ['UVMap'] | ['Mat_Street_Lamp'] |
| `Lamp_Arm_1` | MESH | (8.0, 3.15, 5.55) | (1.0, 1.0, 1.0) | (0.1, 1.304, 0.213) | 34 | ['UVMap'] | ['Mat_Street_Lamp'] |
| `Lamp_Fixture_0` | MESH | (-10.0, 2.5, 5.5) | (1.0, 1.0, 1.0) | (0.35, 0.5, 0.15) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `Lamp_Fixture_1` | MESH | (8.0, 2.5, 5.5) | (1.0, 1.0, 1.0) | (0.35, 0.5, 0.15) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `Lamp_Pole_0` | MESH | (-10.0, 3.75, 2.9) | (1.0, 1.0, 1.0) | (0.16, 0.16, 5.5) | 34 | ['UVMap'] | ['Mat_Street_Lamp'] |
| `Lamp_Pole_1` | MESH | (8.0, 3.75, 2.9) | (1.0, 1.0, 1.0) | (0.16, 0.16, 5.5) | 34 | ['UVMap'] | ['Mat_Street_Lamp'] |
| `North_Curb_Stone` | MESH | (0.0, 3.6, 0.075) | (1.0, 1.0, 1.0) | (32.0, 0.2, 0.15) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `North_Sidewalk_Pavers` | MESH | (0.0, 5.35, 0.075) | (1.0, 1.0, 1.0) | (32.0, 3.3, 0.15) | 6 | ['UVMap'] | ['Mat_Sidewalk_Paver'] |
| `Park_Bench_Wood` | MESH | (3.5, 8.5, 0.425) | (1.0, 1.0, 1.0) | (1.8, 0.5, 0.45) | 6 | ['UVMap'] | ['Mat_Cafe_Furniture_Wood'] |
| `Park_Grass_Ground` | MESH | (0.0, 10.5, 0.1) | (1.0, 1.0, 1.0) | (32.0, 7.0, 0.2) | 6 | ['UVMap'] | ['Mat_Park_Grass'] |
| `Road_Asphalt_Surface` | MESH | (0.0, 0.0, -0.025) | (1.0, 1.0, 1.0) | (32.0, 7.0, 0.05) | 6 | ['UVMap'] | ['Mat_Road_Asphalt'] |
| `Road_Yellow_Dash_-1` | MESH | (-3.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Road_Yellow_Dash_-2` | MESH | (-7.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Road_Yellow_Dash_-3` | MESH | (-11.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Road_Yellow_Dash_-4` | MESH | (-15.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Road_Yellow_Dash_0` | MESH | (1.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Road_Yellow_Dash_1` | MESH | (5.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Road_Yellow_Dash_2` | MESH | (9.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Road_Yellow_Dash_3` | MESH | (13.0, 0.0, 0.003) | (1.0, 1.0, 1.0) | (2.0, 0.15, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_Yellow'] |
| `Shophouse2_Body` | MESH | (12.75, -11.5, 4.9) | (1.0, 1.0, 1.0) | (6.5, 9.0, 9.5) | 6 | ['UVMap'] | ['Mat_Shophouse_Plaster'] |
| `Shophouse2_Door` | MESH | (11.0, -6.95, 1.25) | (1.0, 1.0, 1.0) | (1.2, 0.15, 2.2) | 6 | ['UVMap'] | ['Mat_Shophouse_WoodTrim'] |
| `South_Curb_Stone` | MESH | (0.0, -3.6, 0.075) | (1.0, 1.0, 1.0) | (32.0, 0.2, 0.15) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `South_Sidewalk_Pavers` | MESH | (0.0, -5.35, 0.075) | (1.0, 1.0, 1.0) | (32.0, 3.3, 0.15) | 6 | ['UVMap'] | ['Mat_Sidewalk_Paver'] |
| `Tree_Canopy_0` | MESH | (1.0, 5.6, 3.35) | (1.0, 1.0, 1.0) | (2.7, 2.7, 2.7) | 512 | ['UVMap'] | ['Mat_Tree_Foliage'] |
| `Tree_Canopy_1` | MESH | (6.0, 5.6, 3.35) | (1.0, 1.0, 1.0) | (2.7, 2.7, 2.7) | 512 | ['UVMap'] | ['Mat_Tree_Foliage'] |
| `Tree_Canopy_2` | MESH | (11.0, 5.6, 3.35) | (1.0, 1.0, 1.0) | (2.7, 2.7, 2.7) | 512 | ['UVMap'] | ['Mat_Tree_Foliage'] |
| `Tree_Planter_Box_0` | MESH | (1.0, 5.6, 0.15) | (1.0, 1.0, 1.0) | (1.4, 1.4, 0.3) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `Tree_Planter_Box_1` | MESH | (6.0, 5.6, 0.15) | (1.0, 1.0, 1.0) | (1.4, 1.4, 0.3) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `Tree_Planter_Box_2` | MESH | (11.0, 5.6, 0.15) | (1.0, 1.0, 1.0) | (1.4, 1.4, 0.3) | 6 | ['UVMap'] | ['Mat_Sidewalk_Curb'] |
| `Tree_Trunk_0` | MESH | (1.0, 5.6, 1.75) | (1.0, 1.0, 1.0) | (0.24, 0.24, 3.2) | 34 | ['UVMap'] | ['Mat_Tree_Bark'] |
| `Tree_Trunk_1` | MESH | (6.0, 5.6, 1.75) | (1.0, 1.0, 1.0) | (0.24, 0.24, 3.2) | 34 | ['UVMap'] | ['Mat_Tree_Bark'] |
| `Tree_Trunk_2` | MESH | (11.0, 5.6, 1.75) | (1.0, 1.0, 1.0) | (0.24, 0.24, 3.2) | 34 | ['UVMap'] | ['Mat_Tree_Bark'] |
| `West_Building_Body` | MESH | (-10.0, -11.5, 5.9) | (1.0, 1.0, 1.0) | (12.0, 9.0, 11.5) | 6 | ['UVMap'] | ['Mat_Shophouse_Plaster'] |
| `West_Building_Entrance` | MESH | (-6.5, -6.95, 1.35) | (1.0, 1.0, 1.0) | (2.0, 0.2, 2.4) | 6 | ['UVMap'] | ['Mat_Tinted_Glass'] |
| `Zebra_Stripe_0` | MESH | (-6.5, -3.0, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
| `Zebra_Stripe_1` | MESH | (-6.5, -2.15, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
| `Zebra_Stripe_2` | MESH | (-6.5, -1.3, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
| `Zebra_Stripe_3` | MESH | (-6.5, -0.45, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
| `Zebra_Stripe_4` | MESH | (-6.5, 0.4, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
| `Zebra_Stripe_5` | MESH | (-6.5, 1.25, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
| `Zebra_Stripe_6` | MESH | (-6.5, 2.1, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
| `Zebra_Stripe_7` | MESH | (-6.5, 2.95, 0.003) | (1.0, 1.0, 1.0) | (2.8, 0.45, 0.005) | 6 | ['UVMap'] | ['Mat_Road_Marking_White'] |
