# MILESTONE 3.2 — BASELINE & PREFLIGHT AUDIT REPORT

- **Project Root:** `D:\XE_RC_FPV_V10`
- **Audit Timestamp:** 2026-10-18 22:37:00
- **Blender Candidate:** `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` (`VERIFIED_ON_DISK`)
- **Godot Console Executable:** `D:\XE_RC_FPV_V10\Godot_v4.7.2-stable_win64_console.exe` (`VERIFIED_ON_DISK`)
- **Godot Project:** `D:\XE_RC_FPV_V10\controller_godot` (`VERIFIED_ON_DISK`)
- **Export Preset:** `Android Quest` (`STATIC_AUDIT_PASS`)
- **Baseline Candidate APK:** `D:\XE_RC_FPV_V10\build\android\VR_City_VerticalSlice_M3_debug.staging.20261018_180537.apk` (`VERIFIED_ON_DISK`)

---

## 1. Inventory & Checksum Verification

| Target Path | Status | Size (Bytes) | Last Modified | SHA-256 (Full) |
|---|---|---:|---|---|
| `blender_scripts\build_vertical_slice.py` | `VERIFIED_ON_DISK` | 26,775 | 2026-10-18 17:28:08 | `71482fe2c4f9ae0bee0970c28b95bb9fc6c5670448c6238d209bf036542c47f3` |
| `blender_scripts\validate_vertical_slice.py` | `VERIFIED_ON_DISK` | 5,493 | 2026-10-18 17:27:29 | `3cc9cee2cec95161a50615f416bf4bab70eff7b3f9c59a753fa59b38b4b2fa2a` |
| `blender_scripts\render_visual_qa_m3_1.py` | `MISSING_ON_DISK` | 0 | N/A | `N/A` (Succeeded by M3.2 renderer) |
| `blender_scripts\preflight_audit_m3_1.py` | `MISSING_ON_DISK` | 0 | N/A | `N/A` |
| `blender_scripts\inspect_apk_contents.py` | `MISSING_ON_DISK` | 0 | N/A | `N/A` |
| `models\graybox_city_block.blend` | `VERIFIED_ON_DISK` | 155,446 | 2026-10-18 13:11:31 | `b34863605dace977beca093820962a2fce4b5cf027addc5dbe316f53de27cda3` |
| `models\vertical_slice_city_block.blend` | `VERIFIED_ON_DISK` | 200,690 | 2026-10-18 17:34:10 | `25cdc1a652f06a60c686ac239c7d3e9a5d3ba3a82b06d35eb148631998d988bb` |
| `controller_godot\models\vertical_slice_city_block.glb` | `VERIFIED_ON_DISK` | 764,244 | 2026-10-18 17:34:11 | `5183692b561b58f82fa86e23766b489d22fda1800025e17ff3c5c3bce10ddfa2` |
| `www\models\vertical_slice_city_block.glb` | `VERIFIED_ON_DISK` | 764,244 | 2026-10-18 17:34:11 | `5183692b561b58f82fa86e23766b489d22fda1800025e17ff3c5c3bce10ddfa2` |
| `controller_godot\project.godot` | `VERIFIED_ON_DISK` | 1,096 | 2026-10-18 17:22:00 | `60b857de28a04cf76388954efcff13fa65a7ec3e96c6129459074c1c819dc9f4` |
| `controller_godot\export_presets.cfg` | `VERIFIED_ON_DISK` | 11,779 | 2026-10-17 03:05:47 | `92cd24e4345552c185f84dc13f713905793f1fca4a12f19a3ceb7000555f8de8` |
| `controller_godot\scenes\vertical_slice_city.tscn` | `VERIFIED_ON_DISK` | 4,382 | 2026-10-18 17:24:43 | `3e4b8343ad2e2a1ca16ccbfe6ce7f9df97749a2ac4ba52dc494bc5da194e0951` |
| `controller_godot\scripts\vertical_slice_city.gd` | `VERIFIED_ON_DISK` | 17,245 | 2026-10-18 17:21:50 | `b3f15cd71c85204c75524abd2897129c88a04e9207b9cdb70d1ae6c6de7c6f12` |
| `controller_godot\scripts\vertical_slice_loader.gd` | `VERIFIED_ON_DISK` | 3,100 | 2026-10-18 17:24:53 | `06900ccf442c8f3bc58eda9610843ce87393cda94cfdfc0e29edbaa3066bb774` |
| `controller_godot\scripts\vertical_slice_validation.gd` | `VERIFIED_ON_DISK` | 4,356 | 2026-10-18 17:32:29 | `3cd2568e06c354d8c8720a965a3fc16653712d505a4447b9260c8ffa492e856c` |
| `controller_godot\scripts\run_m3_tests.gd` | `VERIFIED_ON_DISK` | 5,227 | 2026-10-18 17:20:24 | `e3389e22e4e54cdccd2fd9093dd20defdeb195c4a08946b9bb2165de0e8deb62` |
| `build\android\VR_City_VerticalSlice_M3_debug.staging.20261018_180537.apk` | `VERIFIED_ON_DISK` | 86,968,528 | 2026-10-18 18:06:29 | `11569a955c53e86576b3f4934bc88fb58e7c3836b905757732b7d27d2118445a` |
| `build\android\VR_City_VerticalSlice_M3_debug.apk` | `VERIFIED_ON_DISK` | 86,968,528 | 2026-10-18 17:35:41 | `11569a955c53e86576b3f4934bc88fb58e7c3836b905757732b7d27d2118445a` |

---

## 2. GLB Synchronization Status

- `controller_godot\models\vertical_slice_city_block.glb` SHA-256: `5183692b561b58f82fa86e23766b489d22fda1800025e17ff3c5c3bce10ddfa2`
- `www\models\vertical_slice_city_block.glb` SHA-256: `5183692b561b58f82fa86e23766b489d22fda1800025e17ff3c5c3bce10ddfa2`
- **Synchronization Verdict:** `VERIFIED_ON_DISK` — Both files match 100% bit-for-bit.

---

## 3. Godot Configuration Baseline

- `run/main_scene`: `"res://scenes/vertical_slice_city.tscn"` (`STATIC_AUDIT_PASS`)
- Rendering method: `gl_compatibility` (Target for standalone Meta Quest 3 OpenXR compatibility)
- OpenXR: `openxr/enabled=true`, `openxr/foveation_level=2`, `openxr/foveation_dynamic=true`
- Android preset: `"Android Quest"` confirmed in `export_presets.cfg`

---

## 4. Defect Audit Summary (Baseline Findings)

1. **Sedan Geometry & Hierarchy Defect**:
   - `Veh_Sedan_Body` lacks detailed silhouette (only 2 basic boxes).
   - Windshield/rear glass, side windows, headlights, taillights, side mirrors, and wheel rims are missing or merged into coarse blocks.
   - 4 rims are missing as separate concentric geometry.

2. **Cafe Door Hinge Pivot Defect**:
   - `Cafe_Entrance_Door_Hinged` origin is currently at the center of the door bottom, causing rotation to sweep through the door frame/wall instead of swinging cleanly on a hinge axis at the door edge.

3. **Character & Animal Pivot Defect**:
   - NPC legs have origins at the bottom (ankle) instead of hip.
   - NPC arms have origins at the bottom (wrist) instead of shoulder.
   - Dog limbs and tail lack proper joint-centered local pivots.

4. **Signboard Text Defect**:
   - Vietnamese diacritics `"CÀ PHÊ PHỐ VIỆT"` were represented by a flat box placeholder rather than actual extruded 3D glyphs using `C:\Windows\Fonts\arial.ttf`.

5. **Visual QA Defect**:
   - No actual camera render verification images exist in `docs/screenshots/milestone_3_2/`.

6. **Animation Status**:
   - Currently 0 animation clips in exported GLB; animation is partially procedural in Godot GDScript.
