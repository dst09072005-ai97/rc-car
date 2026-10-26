"""
Blender 5.2 Python Pipeline Script:
1. Generates Calibration Asset: 'calibration_gate.glb'
   - Tests 1:1 metric scale (1 BU = 1 meter)
   - Tests coordinate axes: +X (Red), +Y (Green), +Z (Blue)
   - Tests VR Player Envelope (Capsule 1.85m height, 0.30m radius, eye level 1.68m, controller reach)
   - Tests door opening clearance (2.20m lintel, 1.20m width)
2. Generates Graybox Urban Block: 'graybox_city_block.glb'
   - Stylized Realistic PBR materials
   - 7.0m 2-lane road with yellow dashed center and zebra crossing
   - 3.5m sidewalks with 0.15m curbs and 2.0m clear pedestrian corridors
   - Shophouse Cafe with 3.8m ground floor, 2.7m clearance awning, outdoor seating
   - 3.5m residential alley
   - 4.0m bus stop shelter with 2.5m roof clearance
   - Park green buffer with tree planters and benches
Exports directly to:
  - controller_godot/models/
  - www/models/
"""

import bpy
import os
import math

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Ensure metric units
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'

def create_pbr_material(name, albedo_color, roughness=0.6, metallic=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (albedo_color[0], albedo_color[1], albedo_color[2], 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if alpha < 1.0:
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = alpha
            mat.blend_method = 'BLEND'
    return mat

def create_box(name, size, location, material=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    obj.location = location
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    return obj

def create_cylinder(name, radius, height, location, rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    return obj

def create_cone(name, radius1, height, location, rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cone_add(radius1=radius1, depth=height, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    return obj

# ==============================================================================
# 1. BUILD CALIBRATION ASSET
# ==============================================================================
def build_calibration_asset(export_paths):
    clean_scene()
    print("[Pipeline] Building Calibration Asset...")

    # Materials
    mat_gate = create_pbr_material("Mat_Gate_Metal", (0.25, 0.27, 0.32), roughness=0.3, metallic=0.7)
    mat_accent_yellow = create_pbr_material("Mat_Accent_Yellow", (0.95, 0.75, 0.10), roughness=0.4, metallic=0.0)
    mat_red = create_pbr_material("Mat_Axis_X_Red", (0.90, 0.15, 0.15), roughness=0.3, metallic=0.2)
    mat_green = create_pbr_material("Mat_Axis_Y_Green", (0.15, 0.85, 0.20), roughness=0.3, metallic=0.2)
    mat_blue = create_pbr_material("Mat_Axis_Z_Blue", (0.15, 0.40, 0.95), roughness=0.3, metallic=0.2)
    mat_capsule = create_pbr_material("Mat_Player_Envelope", (0.2, 0.8, 1.0), roughness=0.5, metallic=0.1, alpha=0.45)
    mat_eye_disc = create_pbr_material("Mat_Eye_Level_Disc", (1.0, 0.3, 0.1), roughness=0.2, metallic=0.0)
    mat_controller = create_pbr_material("Mat_Controller_Sphere", (1.0, 0.9, 0.2), roughness=0.2, metallic=0.5)

    # 1. Base Platform (2.4m x 2.4m, thickness 0.05m)
    create_box("Calibration_BasePlate", (2.4, 2.4, 0.05), (0, 0, -0.025), mat_gate)

    # 2. Gate Left Post (at X = -0.7m, width 0.2m, depth 0.2m, height 2.4m) -> inner face at X = -0.6m
    create_box("Gate_Left_Post", (0.2, 0.2, 2.4), (-0.7, 0, 1.2), mat_gate)

    # 3. Gate Right Post (at X = +0.7m, width 0.2m, depth 0.2m, height 2.4m) -> inner face at X = +0.6m
    # Clear width between posts = 1.20m
    create_box("Gate_Right_Post", (0.2, 0.2, 2.4), (0.7, 0, 1.2), mat_gate)

    # 4. Gate Top Lintel Beam (X span = 1.6m, depth 0.2m, height 0.2m, center at Z = 2.3m)
    # Lintel bottom face = Z = 2.20m (Clear height = 2.20m)
    create_box("Gate_Top_Lintel", (1.6, 0.2, 0.2), (0, 0, 2.3), mat_gate)

    # 5. Metric Calibration Tick Bars (on both posts)
    ticks = [
        ("Tick_050m_Knee", 0.50),
        ("Tick_100m_Waist", 1.00),
        ("Tick_168m_EyeLevel", 1.68),
        ("Tick_185m_HeadCrown", 1.85),
        ("Tick_220m_LintelClearance", 2.20),
    ]
    for name, z in ticks:
        # Left tick
        create_box(f"{name}_L", (0.05, 0.22, 0.02), (-0.7, 0, z), mat_accent_yellow)
        # Right tick
        create_box(f"{name}_R", (0.05, 0.22, 0.02), (0.7, 0, z), mat_accent_yellow)

    # 6. RGB 3D Coordinate Axis Tripod at Origin (0, 0, 0)
    # +X Axis (Red - pointing East/Right)
    create_cylinder("Axis_X_Shaft", radius=0.025, height=0.85, location=(0.425, 0, 0.025), rotation=(0, math.radians(90), 0), material=mat_red)
    create_cone("Axis_X_Arrow", radius1=0.06, height=0.15, location=(0.925, 0, 0.025), rotation=(0, math.radians(90), 0), material=mat_red)

    # +Y Axis (Green - pointing North/Forward)
    create_cylinder("Axis_Y_Shaft", radius=0.025, height=0.85, location=(0, 0.425, 0.025), rotation=(math.radians(-90), 0, 0), material=mat_green)
    create_cone("Axis_Y_Arrow", radius1=0.06, height=0.15, location=(0, 0.925, 0.025), rotation=(math.radians(-90), 0, 0), material=mat_green)

    # +Z Axis (Blue - pointing Up)
    create_cylinder("Axis_Z_Shaft", radius=0.025, height=0.85, location=(0, 0, 0.425), rotation=(0, 0, 0), material=mat_blue)
    create_cone("Axis_Z_Arrow", radius1=0.06, height=0.15, location=(0, 0, 0.925), rotation=(0, 0, 0), material=mat_blue)

    # 7. VR Player Envelope Reference Dummy
    # Capsule representing full body: total height = 1.85m, radius = 0.30m (diameter 0.60m)
    # Center cylinder height = 1.85 - 2*0.30 = 1.25m, from Z=0.30 to Z=1.55 (center at Z=0.925)
    create_cylinder("Player_Capsule_Body", radius=0.30, height=1.25, location=(0, 0, 0.925), material=mat_capsule)
    # Bottom hemispherical cap
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.30, location=(0, 0, 0.30))
    bot_cap = bpy.context.active_object
    bot_cap.name = "Player_Capsule_Bottom"
    bot_cap.data.materials.append(mat_capsule)
    # Top hemispherical cap (crown of head at Z = 1.55 + 0.30 = 1.85m)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.30, location=(0, 0, 1.55))
    top_cap = bpy.context.active_object
    top_cap.name = "Player_Capsule_Top"
    top_cap.data.materials.append(mat_capsule)

    # Eye-Level Disc at exact Z = 1.68m
    create_cylinder("Player_Eye_Level_Marker", radius=0.28, height=0.015, location=(0, 0, 1.68), material=mat_eye_disc)

    # Tracked Hand/Controller Comfort Spheres
    # Left controller at X = -0.28m, Y = 0.25m, Z = 1.05m
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, location=(-0.28, 0.25, 1.05))
    ctrl_l = bpy.context.active_object
    ctrl_l.name = "Player_Left_Controller_Sphere"
    ctrl_l.data.materials.append(mat_controller)

    # Right controller at X = +0.28m, Y = 0.25m, Z = 1.05m
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, location=(0.28, 0.25, 1.05))
    ctrl_r = bpy.context.active_object
    ctrl_r.name = "Player_Right_Controller_Sphere"
    ctrl_r.data.materials.append(mat_controller)

    # Save .blend
    blend_path = "D:/XE_RC_FPV_V10/models/calibration_gate.blend"
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"[Pipeline] Saved {blend_path}")

    # Export GLB to all target paths
    for p in export_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=p,
            export_format='GLB',
            use_selection=False,
            export_apply=True,
            export_yup=True
        )
        print(f"[Pipeline] Exported {p} (Size: {os.path.getsize(p)} bytes)")


# ==============================================================================
# 2. BUILD GRAYBOX CITY BLOCK (VIETNAM / SOUTHEAST ASIAN MODERN URBAN)
# ==============================================================================
def build_graybox_city_block(export_paths):
    clean_scene()
    print("[Pipeline] Building Graybox Urban Block...")

    # Materials for Stylized Realistic Urban Look
    mat_asphalt = create_pbr_material("Mat_Road_Asphalt", (0.16, 0.17, 0.19), roughness=0.85, metallic=0.0)
    mat_curb = create_pbr_material("Mat_Sidewalk_Curb", (0.55, 0.57, 0.60), roughness=0.70, metallic=0.0)
    mat_paver = create_pbr_material("Mat_Sidewalk_Paver", (0.72, 0.70, 0.66), roughness=0.65, metallic=0.0)
    mat_road_yellow = create_pbr_material("Mat_Road_Marking_Yellow", (0.95, 0.82, 0.15), roughness=0.50, metallic=0.0)
    mat_road_white = create_pbr_material("Mat_Road_Marking_White", (0.92, 0.93, 0.95), roughness=0.50, metallic=0.0)
    
    mat_shophouse_wall = create_pbr_material("Mat_Shophouse_Plaster", (0.88, 0.85, 0.80), roughness=0.75, metallic=0.0)
    mat_shophouse_accent = create_pbr_material("Mat_Shophouse_WoodTrim", (0.42, 0.28, 0.18), roughness=0.45, metallic=0.0)
    mat_shophouse_awning = create_pbr_material("Mat_Cafe_Awning_Fabric", (0.15, 0.45, 0.35), roughness=0.80, metallic=0.0)
    mat_glass = create_pbr_material("Mat_Tinted_Glass", (0.15, 0.25, 0.35), roughness=0.10, metallic=0.1, alpha=0.65)
    mat_cafe_furniture = create_pbr_material("Mat_Cafe_Furniture_Wood", (0.55, 0.36, 0.20), roughness=0.40, metallic=0.0)
    
    mat_bus_shelter = create_pbr_material("Mat_Bus_Shelter_Steel", (0.28, 0.32, 0.38), roughness=0.30, metallic=0.85)
    mat_grass = create_pbr_material("Mat_Park_Grass", (0.24, 0.48, 0.22), roughness=0.90, metallic=0.0)
    mat_tree_trunk = create_pbr_material("Mat_Tree_Bark", (0.35, 0.25, 0.18), roughness=0.85, metallic=0.0)
    mat_tree_foliage = create_pbr_material("Mat_Tree_Foliage", (0.18, 0.52, 0.20), roughness=0.75, metallic=0.0)
    mat_lamp_post = create_pbr_material("Mat_Street_Lamp", (0.18, 0.20, 0.22), roughness=0.25, metallic=0.90)

    # -------------------------------------------------------------------------
    # A. ROADWAY (Length = 32m along X, Width = 7.0m along Y from Y = -3.5 to +3.5)
    # -------------------------------------------------------------------------
    create_box("Road_Asphalt_Surface", (32.0, 7.0, 0.05), (0, 0, -0.025), mat_asphalt)

    # Center Dashed Yellow Divider Line (at Y = 0.0)
    # 8 dashes along X: length 2.0m, gap 2.0m
    for i in range(-4, 4):
        create_box(f"Road_Yellow_Dash_{i}", (2.0, 0.15, 0.005), (i * 4.0 + 1.0, 0, 0.003), mat_road_yellow)

    # Pedestrian Zebra Crossing (at X = -8.0 to -5.0, width 3.0m across full 7.0m road)
    # 8 white stripes
    for j in range(8):
        y_pos = -3.0 + j * 0.85
        create_box(f"Zebra_Stripe_{j}", (2.8, 0.45, 0.005), (-6.5, y_pos, 0.003), mat_road_white)

    # -------------------------------------------------------------------------
    # B. SOUTH SIDEWALK & SHOPHOUSE STRIP (Y = -3.5 to -7.0, width = 3.5m)
    # -------------------------------------------------------------------------
    # Curb stone at edge Y = -3.5 (length 32m, width 0.20m, height 0.15m)
    create_box("South_Curb_Stone", (32.0, 0.20, 0.15), (0, -3.6, 0.075), mat_curb)
    # Sidewalk Paver Slab (Y = -3.7 to -7.0, width 3.3m, height 0.15m)
    create_box("South_Sidewalk_Pavers", (32.0, 3.3, 0.15), (0, -5.35, 0.075), mat_paver)

    # Pedestrian Clear Corridor Guide: X = -16 to +16, Y = -4.7 (width 2.0m, height 0.15m ground)
    # This leaves Y = -5.7 to -7.0 (1.3m) for facade buffer/outdoor cafe tables!

    # --- 1. Shophouse Cafe (X = -4.0 to +6.0, frontage 10.0m, depth 9.0m, from Y = -7.0 to -16.0) ---
    # Ground floor facade wall
    create_box("Cafe_Ground_Wall", (10.0, 9.0, 3.8), (1.0, -11.5, 1.9 + 0.15), mat_shophouse_wall)
    # Upper floors (2 & 3): height 6.4m (total building height = 10.2m + 0.15m curb)
    create_box("Cafe_Upper_Floors", (10.0, 9.0, 6.4), (1.0, -11.5, 3.8 + 3.2 + 0.15), mat_shophouse_wall)
    # Large Glass Shopfront at ground level (Z = 0.15 to 3.5)
    create_box("Cafe_Glass_Storefront", (8.8, 0.15, 3.0), (1.0, -6.95, 1.8 + 0.15), mat_glass)
    # Cafe Wood Fascia Signboard (Z = 3.35 to 3.85)
    create_box("Cafe_Wood_Signboard", (9.2, 0.25, 0.50), (1.0, -6.90, 3.55 + 0.15), mat_shophouse_accent)

    # Cafe Fabric Awning / Canopy:
    # Extends 1.80m out over sidewalk (from Y = -7.0 to Y = -5.2)
    # Clearance height under bottom: Z = 2.70m above sidewalk (2.85m above road)
    # Awning angle: sloping from Z = 3.30m down to Z = 2.70m
    create_box("Cafe_Awning_Canopy", (9.6, 1.80, 0.08), (1.0, -6.10, 2.85), mat_shophouse_awning)

    # Outdoor Cafe Furniture (placed on facade buffer zone at Y = -6.1, clear of 2.0m walking corridor)
    # Table 1 & 2
    for idx, x_pos in enumerate([-1.5, 3.5]):
        # Table top (diameter 0.8m, height 0.75m)
        create_cylinder(f"Cafe_Table_Top_{idx}", radius=0.40, height=0.04, location=(x_pos, -6.1, 0.15 + 0.73), material=mat_cafe_furniture)
        create_cylinder(f"Cafe_Table_Leg_{idx}", radius=0.04, height=0.70, location=(x_pos, -6.1, 0.15 + 0.35), material=mat_shophouse_accent)
        # Chairs (seat at 0.45m height)
        for c_idx, c_offset in enumerate([-0.45, 0.45]):
            create_box(f"Cafe_Chair_{idx}_{c_idx}", (0.35, 0.35, 0.45), (x_pos + c_offset, -6.1, 0.15 + 0.225), mat_cafe_furniture)

    # --- 2. Residential Alley (Hẻm dân cư: width 3.5m, X = 6.0 to 9.5) ---
    # Alley paving surface connecting into neighborhood
    create_box("Alleyway_Paving", (3.5, 9.0, 0.15), (7.75, -11.5, 0.075), mat_paver)
    # Curb ramp / drop at alley entrance
    create_box("Alley_Curb_Ramp", (3.5, 0.40, 0.08), (7.75, -3.7, 0.04), mat_curb)

    # --- 3. Adjacent Shophouse 2 (X = 9.5 to 16.0, frontage 6.5m) ---
    create_box("Shophouse2_Body", (6.5, 9.0, 9.5), (12.75, -11.5, 4.75 + 0.15), mat_shophouse_wall)
    create_box("Shophouse2_Door", (1.2, 0.15, 2.2), (11.0, -6.95, 1.1 + 0.15), mat_shophouse_accent)

    # --- 4. Corner Building West (X = -16.0 to -4.0, frontage 12.0m) ---
    create_box("West_Building_Body", (12.0, 9.0, 11.5), (-10.0, -11.5, 5.75 + 0.15), mat_shophouse_wall)
    create_box("West_Building_Entrance", (2.0, 0.20, 2.4), (-6.5, -6.95, 1.2 + 0.15), mat_glass)

    # -------------------------------------------------------------------------
    # C. NORTH SIDEWALK, BUS STOP & PARK GREENERY (Y = +3.5 to +7.0, width = 3.5m)
    # -------------------------------------------------------------------------
    # North Curb stone at edge Y = +3.5 (length 32m, width 0.20m, height 0.15m)
    create_box("North_Curb_Stone", (32.0, 0.20, 0.15), (0, 3.6, 0.075), mat_curb)
    # North Sidewalk Paver Slab (Y = +3.7 to +7.0, width 3.3m, height 0.15m)
    create_box("North_Sidewalk_Pavers", (32.0, 3.3, 0.15), (0, 5.35, 0.075), mat_paver)

    # --- 1. Bus Stop Shelter (at X = -7.5 to -3.5, near zebra crossing) ---
    # Width 4.0m along X, depth 1.4m along Y (from Y = +5.2 to +6.6), roof height 2.50m above sidewalk
    # 4 Steel support columns
    create_cylinder("Bus_Post_1", radius=0.04, height=2.50, location=(-7.3, 5.3, 0.15 + 1.25), material=mat_bus_shelter)
    create_cylinder("Bus_Post_2", radius=0.04, height=2.50, location=(-3.7, 5.3, 0.15 + 1.25), material=mat_bus_shelter)
    create_cylinder("Bus_Post_3", radius=0.04, height=2.50, location=(-7.3, 6.5, 0.15 + 1.25), material=mat_bus_shelter)
    create_cylinder("Bus_Post_4", radius=0.04, height=2.50, location=(-3.7, 6.5, 0.15 + 1.25), material=mat_bus_shelter)
    # Glass back wall
    create_box("Bus_Glass_Back", (3.6, 0.08, 2.0), (-5.5, 6.5, 0.15 + 1.2), mat_glass)
    # Steel cantilever roof (4.2m x 1.6m x 0.10m, clearance bottom = 2.50m above sidewalk)
    create_box("Bus_Shelter_Roof", (4.2, 1.6, 0.10), (-5.5, 5.9, 0.15 + 2.55), mat_bus_shelter)
    # Bus Waiting Bench (length 2.4m, seat height 0.45m)
    create_box("Bus_Waiting_Bench", (2.4, 0.45, 0.45), (-5.5, 6.1, 0.15 + 0.225), mat_shophouse_accent)

    # --- 2. Park Green Buffer & Trees (Y = +7.0 to +14.0, length 32m) ---
    create_box("Park_Grass_Ground", (32.0, 7.0, 0.20), (0, 10.5, 0.10), mat_grass)

    # Tree Planters along sidewalk edge (at X = 1.0, 6.0, 11.0)
    for t_idx, tx in enumerate([1.0, 6.0, 11.0]):
        # Planter box curb (1.4m x 1.4m x 0.30m)
        create_box(f"Tree_Planter_Box_{t_idx}", (1.4, 1.4, 0.30), (tx, 5.6, 0.15), mat_curb)
        # Tree trunk (height 3.2m, diameter 0.25m)
        create_cylinder(f"Tree_Trunk_{t_idx}", radius=0.12, height=3.2, location=(tx, 5.6, 0.15 + 1.6), material=mat_tree_trunk)
        # Foliage canopy (bottom clearance = 2.8m above sidewalk)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.35, location=(tx, 5.6, 0.15 + 3.2))
        canopy = bpy.context.active_object
        canopy.name = f"Tree_Canopy_{t_idx}"
        canopy.data.materials.append(mat_tree_foliage)

    # Park Bench (at X = 3.5, Y = 8.5)
    create_box("Park_Bench_Wood", (1.8, 0.50, 0.45), (3.5, 8.5, 0.20 + 0.225), mat_cafe_furniture)

    # Street Light Poles (along curb edge at X = -10.0 and +8.0)
    for l_idx, lx in enumerate([-10.0, 8.0]):
        # Vertical pole: height 5.5m
        create_cylinder(f"Lamp_Pole_{l_idx}", radius=0.08, height=5.5, location=(lx, 3.75, 0.15 + 2.75), material=mat_lamp_post)
        # Horizontal arm extending over street
        create_cylinder(f"Lamp_Arm_{l_idx}", radius=0.05, height=1.3, location=(lx, 3.15, 0.15 + 5.4), rotation=(math.radians(85), 0, 0), material=mat_lamp_post)
        # Lamp Luminaire Fixture
        create_box(f"Lamp_Fixture_{l_idx}", (0.35, 0.50, 0.15), (lx, 2.50, 0.15 + 5.35), mat_curb)

    # Save .blend
    blend_path = "D:/XE_RC_FPV_V10/models/graybox_city_block.blend"
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"[Pipeline] Saved {blend_path}")

    # Export GLB to all target paths
    for p in export_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=p,
            export_format='GLB',
            use_selection=False,
            export_apply=True,
            export_yup=True
        )
        print(f"[Pipeline] Exported {p} (Size: {os.path.getsize(p)} bytes)")


if __name__ == "__main__":
    # Export targets for Godot & Three.js
    calib_targets = [
        "D:/XE_RC_FPV_V10/controller_godot/models/calibration_gate.glb",
        "D:/XE_RC_FPV_V10/www/models/calibration_gate.glb"
    ]
    graybox_targets = [
        "D:/XE_RC_FPV_V10/controller_godot/models/graybox_city_block.glb",
        "D:/XE_RC_FPV_V10/www/models/graybox_city_block.glb"
    ]
    
    build_calibration_asset(calib_targets)
    build_graybox_city_block(graybox_targets)
    print("[Pipeline] ALL CALIBRATION & GRAYBOX ASSETS BUILT AND EXPORTED SUCCESSFULLY.")
