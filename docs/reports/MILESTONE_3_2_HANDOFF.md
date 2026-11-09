# MILESTONE 3.2 — HANDOFF & RELEASE READINESS REPORT

**Project:** XE RC FPV V10 / VR City Vertical Slice  
**Milestone:** 3.2 — Vertical Slice 3D Quality, Transform Integrity & Quest 3 Readiness  
**Target Root:** `D:\XE_RC_FPV_V10`  
**Execution Mode:** Implementation Mode, Evidence-Driven, Source-Preserving  
**Status:** `READY_FOR_LOCAL_USER_EXPORT`  

---

## 1. Executive Summary & Verification Evidence

All pipeline phases required by Milestone 3.2 have been successfully executed and verified against actual disk files:

1. **Safety & Baseline Preservation (`docs/MILESTONE_3_2_BASELINE.md`):**
   - Timestamped backups created in `backups/m3_2_20261018/`.
   - Core project files (`project.godot`, `export_presets.cfg`, `server/server.js`, `www/app.js`, `models/calibration_gate.blend`, etc.) remained 100% untouched.

2. **3D Quality & Transform Defects Corrected (`blender_scripts/build_vertical_slice.py`):**
   - **Cafe Entrance Door:** Corrected to hinge edge pivot (`Y = +0.80m`), rotated open inwards at -82°.
   - **Vietnamese 3D Signboard:** Extruded 3D diacritic text `"CÀ PHÊ PHỐ VIỆT"` with emission material, correctly oriented facing the street.
   - **Vehicle Modeling Details:** Replaced monolithic block with shaped sedan: hood, trunk, cabin, sloped windshield (35°), rear glass (-32°), side windows, side mirrors L/R, headlights, taillights, 4 independent rubber tires, and 4 concentric alloy rims (`Veh_Sedan_Rim_FL/FR/RL/RR`).
   - **Articulated Humanoids & Dog:** NPC hips pivoted at `Z=0.78m` (TOP_CENTER), shoulders at `Z=1.34m`. Dog positioned near commuter on west sidewalk with articulated legs, head, and tail.

3. **Visual Review Evidence (`docs/screenshots/milestone_3_2/`):**
   - 6 QA screenshot views rendered via Blender 5.2 Workbench (1280x720):
     - `01_top_down_city_slice.png` (756,074 bytes)
     - `02_exterior_front_cafe.png` (988,189 bytes)
     - `03_first_person_sidewalk.png` (792,589 bytes)
     - `04_interior_cafe_looking_out.png` (969,002 bytes)
     - `05_sedan_three_quarter.png` (1,045,388 bytes)
     - `06_characters_and_dog.png` (1,009,354 bytes)
   - Detailed visual inspection logged in `docs/VERTICAL_SLICE_ART_QA_M3_2.md`.

4. **glTF Binary Validation & Asset Registry (`docs/GLB_VALIDATION_REPORT_M3_2.md`):**
   - SHA-256 Hash of exported GLB: `4bef67b3b0c6f3de135360600aeca04a053c6465a12b16b8aed49451a3309579`.
   - Single-source sync between `controller_godot/models/` and `www/models/` verified (`PASS`).
   - 34 required milestone nodes verified present (134 total nodes, 25 materials).
   - `docs/ASSET_REGISTRY.csv` updated non-destructively with entry `AST_M3_2_001`.

5. **Godot Runtime Headless Test (`docs/GODOT_RUNTIME_VALIDATION_M3_2.md`):**
   - Headless execution with `--xr-mode off` verified: GLB instantiation (`PASS`), required entity hierarchy (`PASS`), vehicle & NPC physics simulation step (`PASS`), cafe door passage collider (`PASS`), door edge hinge pivot (`PASS`).

---

## 2. Command for User to Build APK

As mandated by engineering safety rules, APK export on the local machine must be triggered by the user in their VS Code terminal.

### Copy and Run This PowerShell Command:

```powershell
& "D:\XE_RC_FPV_V10\Godot_v4.7.2-stable_win64_console.exe" --headless --path "D:\XE_RC_FPV_V10\controller_godot" --export-debug "Android Quest" "D:\XE_RC_FPV_V10\build\android\VR_City_VerticalSlice_M3_2_debug.apk"
```

### Post-Build Verification:
Once the command finishes, verify that the new APK exists and check its size:
```powershell
Get-Item "D:\XE_RC_FPV_V10\build\android\VR_City_VerticalSlice_M3_2_debug.apk" | Select-Object Name, Length, LastWriteTime
```
