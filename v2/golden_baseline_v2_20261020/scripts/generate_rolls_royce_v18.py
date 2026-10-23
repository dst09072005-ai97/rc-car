"""
generate_rolls_royce_v18.py
Automated 1:1 Metric Scale 3D Rolls-Royce Luxury Cabin Generator for Blender 5.2 LTS.
Creates high-fidelity continuous interior geometry with PBR materials based on asset_3d.png and guide.txt,
and exports directly to controller_godot/models/rolls_royce_cabin_v18.glb.
"""

import bpy
import math
import os

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

def create_pbr_material(name, hex_color, roughness=0.5, metallic=0.0, clearcoat=0.0, transmission=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    
    # Convert Hex to Linear sRGB
    h = hex_color.lstrip('#')
    rgb = tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    rgb_linear = tuple(pow(c, 2.2) for c in rgb)
    
    if "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = (*rgb_linear, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    
    # Blender 4.x / 5.x uses 'Coat Weight', older versions use 'Clearcoat'
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.05
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
        
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    elif "Transmission" in bsdf.inputs:
        bsdf.inputs["Transmission"].default_value = transmission
        
    return mat

def map_coords(loc, rot=(0,0,0), parent=None):
    if parent is not None and getattr(parent, "name", "") == "SteeringWheel_Pivot":
        return loc, rot
    # In Godot: X is Right, Y is Up, Z is Backward (-Z is Forward)
    # In Blender: X is Right, Y is Forward (-Y is Backward), Z is Up
    # Blender glTF exporter maps: gltf_X = blender_X, gltf_Y = blender_Z, gltf_Z = -blender_Y
    # To get gltf_Z = loc[1] (Godot Z): blender_Y = -loc[1]
    bloc = (loc[0], -loc[1], loc[2])
    brot = (-rot[0], -rot[1], rot[2])
    return bloc, brot

def add_box(name, size, loc, mat, rot=(0,0,0), parent=None):
    bloc, brot = map_coords(loc, rot, parent)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=bloc, rotation=brot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    if parent:
        obj.parent = parent
    if mat:
        obj.data.materials.append(mat)
    # Apply smooth shading
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def add_cylinder(name, radius, depth, loc, mat, rot=(0,0,0), segments=32, parent=None):
    bloc, brot = map_coords(loc, rot, parent)
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=segments, location=bloc, rotation=brot)
    obj = bpy.context.active_object
    obj.name = name
    if parent:
        obj.parent = parent
    if mat:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def add_torus(name, major_rad, minor_rad, loc, mat, rot=(0,0,0), major_seg=48, minor_seg=16, parent=None):
    bloc, brot = map_coords(loc, rot, parent)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_rad,
        minor_radius=minor_rad,
        major_segments=major_seg,
        minor_segments=minor_seg,
        location=bloc,
        rotation=brot
    )
    obj = bpy.context.active_object
    obj.name = name
    if parent:
        obj.parent = parent
    if mat:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def build_rolls_royce_cabin():
    clear_scene()
    
    # ---------------------------------------------------------
    # 1. PBR MATERIALS PALETTE (Matching asset_3d.png & guide.txt)
    # ---------------------------------------------------------
    mat_cream = create_pbr_material("Nappa_Leather_Cream", "#DFD1BE", roughness=0.45)
    mat_walnut = create_pbr_material("Burl_Walnut_Wood", "#3A2314", roughness=0.08, clearcoat=1.0)
    mat_chrome = create_pbr_material("Chrome_Trim", "#E8E8E8", roughness=0.08, metallic=1.0)
    mat_piano = create_pbr_material("Piano_Black", "#0F0F0F", roughness=0.05, metallic=0.25)
    mat_carpet = create_pbr_material("Dark_Carpet", "#1A1A1D", roughness=0.90)
    mat_screen = create_pbr_material("Screen_Display_Glass", "#06080C", roughness=0.05, metallic=0.1)

    # Master Cabin Root Empty (Driver Eye Reference at 0, 0, 0)
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    cabin_root = bpy.context.active_object
    cabin_root.name = "RollsRoyce_Cabin_Root"

    # ---------------------------------------------------------
    # 2. CONTINUOUS CABIN FLOOR & FOOTWELL (Floor at Y = -1.15m)
    # ---------------------------------------------------------
    # Main floor carpet (X: -0.55m to +1.30m, Z: -0.90m to +1.75m)
    floor_center_x = 0.38
    floor_width = 1.95
    floor_length = 2.70
    floor_center_z = 0.40
    floor_y = -1.15
    add_box("Cabin_Floor", (floor_width, floor_length, 0.04), (floor_center_x, floor_center_z, floor_y), mat_carpet, rot=(0,0,0), parent=cabin_root)

    # Footwell sloping toe-board at front (Z = -0.95m)
    add_box("Footwell_ToeBoard", (floor_width * 0.95, 0.35, 0.04), (floor_center_x, -0.95, floor_y + 0.12), mat_carpet, rot=(math.radians(35), 0, 0), parent=cabin_root)

    # ---------------------------------------------------------
    # 3. PEDALS & DRIVER FOOTREST (Directly under Driver Feet)
    # ---------------------------------------------------------
    # Driver dead pedal / footrest (Left)
    add_box("Pedal_Footrest", (0.08, 0.18, 0.03), (-0.22, -0.82, floor_y + 0.14), mat_piano, rot=(math.radians(30), 0, 0), parent=cabin_root)
    add_box("Pedal_Footrest_Chrome", (0.07, 0.16, 0.01), (-0.22, -0.82, floor_y + 0.155), mat_chrome, rot=(math.radians(30), 0, 0), parent=cabin_root)

    # Brake pedal (Wide rectangular ribbed metal)
    add_box("Pedal_Brake", (0.09, 0.13, 0.03), (-0.06, -0.78, floor_y + 0.16), mat_piano, rot=(math.radians(25), 0, 0), parent=cabin_root)
    add_box("Pedal_Brake_ChromeRibs", (0.08, 0.11, 0.01), (-0.06, -0.78, floor_y + 0.175), mat_chrome, rot=(math.radians(25), 0, 0), parent=cabin_root)

    # Accelerator pedal (Tall organ-style pedal)
    add_box("Pedal_Throttle", (0.06, 0.18, 0.03), (0.10, -0.78, floor_y + 0.15), mat_piano, rot=(math.radians(25), 0, 0), parent=cabin_root)
    add_box("Pedal_Throttle_ChromeRibs", (0.05, 0.16, 0.01), (0.10, -0.78, floor_y + 0.165), mat_chrome, rot=(math.radians(25), 0, 0), parent=cabin_root)

    # ---------------------------------------------------------
    # 4. FRONT SEATS (Driver X=0.0, Passenger X=0.76)
    # ---------------------------------------------------------
    for side_name, seat_x in [("Driver", 0.0), ("Passenger", 0.76)]:
        seat_empty = bpy.data.objects.new(f"Seat_{side_name}_Rig", None)
        bpy.context.scene.collection.objects.link(seat_empty)
        seat_empty.location = (seat_x, 0, 0)
        seat_empty.parent = cabin_root

        # Plinth / Seat base frame
        add_box(f"Seat_{side_name}_Plinth", (0.54, 0.52, 0.22), (0, -0.05, floor_y + 0.13), mat_piano, parent=seat_empty)
        # Chrome adjustment control panel on outer side
        ctrl_x = -0.28 if side_name == "Driver" else 0.28
        add_box(f"Seat_{side_name}_AdjustControls", (0.02, 0.22, 0.06), (ctrl_x, -0.05, floor_y + 0.20), mat_chrome, parent=seat_empty)

        # Seat Cushion Main (with longitudinal fluting/quilting)
        add_box(f"Seat_{side_name}_CushionMain", (0.42, 0.50, 0.14), (0, -0.04, floor_y + 0.31), mat_cream, parent=seat_empty)
        # Side thigh bolsters
        add_box(f"Seat_{side_name}_BolsterLeft", (0.08, 0.52, 0.18), (-0.23, -0.04, floor_y + 0.35), mat_cream, parent=seat_empty)
        add_box(f"Seat_{side_name}_BolsterRight", (0.08, 0.52, 0.18), (0.23, -0.04, floor_y + 0.35), mat_cream, parent=seat_empty)
        # Fluting grooves
        for f in range(-2, 3):
            add_box(f"Seat_{side_name}_Flute_{f}", (0.045, 0.44, 0.02), (f * 0.075, -0.04, floor_y + 0.385), mat_cream, parent=seat_empty)

        # Backrest (tilted back 12 degrees)
        back_y = floor_y + 0.74
        back_z = 0.22
        back_rot = (math.radians(-12), 0, 0)
        add_box(f"Seat_{side_name}_BackrestMain", (0.44, 0.14, 0.68), (0, back_z, back_y), mat_cream, rot=back_rot, parent=seat_empty)
        # Torso side bolsters
        add_box(f"Seat_{side_name}_BackBolsterL", (0.08, 0.18, 0.66), (-0.24, back_z - 0.02, back_y), mat_cream, rot=back_rot, parent=seat_empty)
        add_box(f"Seat_{side_name}_BackBolsterR", (0.08, 0.18, 0.66), (0.24, back_z - 0.02, back_y), mat_cream, rot=back_rot, parent=seat_empty)
        # Backrest fluting
        for f in range(-2, 3):
            add_box(f"Seat_{side_name}_BackFlute_{f}", (0.045, 0.02, 0.58), (f * 0.075, back_z - 0.065, back_y), mat_cream, rot=back_rot, parent=seat_empty)

        # Headrest on Dual Chrome Stalks
        hr_z = back_z + 0.08
        hr_y = back_y + 0.44
        add_box(f"Seat_{side_name}_Headrest", (0.28, 0.14, 0.20), (0, hr_z, hr_y), mat_cream, rot=back_rot, parent=seat_empty)
        add_cylinder(f"Seat_{side_name}_StalkL", 0.010, 0.10, (-0.07, hr_z - 0.01, hr_y - 0.12), mat_chrome, rot=back_rot, parent=seat_empty)
        add_cylinder(f"Seat_{side_name}_StalkR", 0.010, 0.10, (0.07, hr_z - 0.01, hr_y - 0.12), mat_chrome, rot=back_rot, parent=seat_empty)

    # ---------------------------------------------------------
    # 5. CENTER CONSOLE & CONTROLS (X = 0.38m, between front seats)
    # ---------------------------------------------------------
    con_x = 0.38
    con_y = floor_y + 0.55
    con_z = -0.10
    # Lower console structure
    add_box("Center_Console_Base", (0.28, 1.40, 0.42), (con_x, con_z, floor_y + 0.23), mat_piano, parent=cabin_root)
    # Leather side flanks
    add_box("Center_Console_FlankL", (0.03, 1.40, 0.44), (con_x - 0.14, con_z, floor_y + 0.24), mat_cream, parent=cabin_root)
    add_box("Center_Console_FlankR", (0.03, 1.40, 0.44), (con_x + 0.14, con_z, floor_y + 0.24), mat_cream, parent=cabin_root)

    # Top Burl Walnut Veneer Fascia
    add_box("Center_Console_Walnut_Fascia", (0.24, 0.85, 0.03), (con_x, con_z - 0.25, con_y), mat_walnut, parent=cabin_root)
    # Twin Chrome Accent Trim lines
    add_box("Center_Console_ChromeTrimL", (0.012, 0.85, 0.01), (con_x - 0.11, con_z - 0.25, con_y + 0.016), mat_chrome, parent=cabin_root)
    add_box("Center_Console_ChromeTrimR", (0.012, 0.85, 0.01), (con_x + 0.11, con_z - 0.25, con_y + 0.016), mat_chrome, parent=cabin_root)

    # Spirit of Ecstasy Rotary Controller Dial (Iconic Rolls-Royce feature)
    rotary_loc = (con_x, con_z - 0.15, con_y + 0.025)
    add_cylinder("Spirit_Rotary_ChromeRing", 0.042, 0.024, rotary_loc, mat_chrome, parent=cabin_root)
    add_cylinder("Spirit_Rotary_PianoTop", 0.034, 0.028, (rotary_loc[0], rotary_loc[1], rotary_loc[2] + 0.002), mat_piano, parent=cabin_root)
    add_box("Spirit_Rotary_Crest", (0.018, 0.018, 0.005), (rotary_loc[0], rotary_loc[1], rotary_loc[2] + 0.018), mat_chrome, parent=cabin_root)

    # Gear Selector Stalk & Walnut Knob
    gear_loc = (con_x, con_z - 0.42, con_y + 0.04)
    add_cylinder("Gear_Lever_Stalk", 0.012, 0.09, gear_loc, mat_chrome, rot=(math.radians(15), 0, 0), parent=cabin_root)
    add_box("Gear_Lever_Knob", (0.045, 0.055, 0.035), (gear_loc[0], gear_loc[1] - 0.01, gear_loc[2] + 0.05), mat_walnut, parent=cabin_root)

    # Rear Armrest / Storage Compartment with Split Lid
    armrest_z = con_z + 0.35
    add_box("Center_Console_ArmrestL", (0.11, 0.48, 0.10), (con_x - 0.06, armrest_z, con_y + 0.04), mat_cream, parent=cabin_root)
    add_box("Center_Console_ArmrestR", (0.11, 0.48, 0.10), (con_x + 0.06, armrest_z, con_y + 0.04), mat_cream, parent=cabin_root)

    # ---------------------------------------------------------
    # 6. DASHBOARD & WINDSHIELD COWL (Continuous luxury architecture)
    # ---------------------------------------------------------
    dash_y = floor_y + 0.72
    dash_z = -0.66
    dash_w = 1.90
    # Main Dashboard Upper Cowl (Curved brow)
    add_box("Dashboard_Upper_Cowl", (dash_w, 0.44, 0.22), (floor_center_x, dash_z, dash_y + 0.12), mat_piano, parent=cabin_root)

    # Full-width Burl Walnut Veneer Fascia
    add_box("Dashboard_Walnut_Fascia", (dash_w * 0.98, 0.03, 0.18), (floor_center_x, dash_z + 0.21, dash_y + 0.04), mat_walnut, parent=cabin_root)
    # Chrome horizontal framing trims
    add_box("Dashboard_ChromeTrim_Top", (dash_w * 0.98, 0.015, 0.015), (floor_center_x, dash_z + 0.22, dash_y + 0.135), mat_chrome, parent=cabin_root)
    add_box("Dashboard_ChromeTrim_Bottom", (dash_w * 0.98, 0.015, 0.015), (floor_center_x, dash_z + 0.22, dash_y - 0.055), mat_chrome, parent=cabin_root)

    # Lower Dashboard in Cream Nappa Leather
    add_box("Dashboard_Lower_Leather", (dash_w * 0.96, 0.28, 0.22), (floor_center_x, dash_z + 0.10, dash_y - 0.16), mat_cream, parent=cabin_root)

    # Iconic Circular Chrome Bullseye AC Vents
    # 4 Center Vents
    for v in range(4):
        vx = con_x - 0.165 + v * 0.11
        add_cylinder(f"Vent_Center_{v}", 0.026, 0.02, (vx, dash_z + 0.225, dash_y - 0.005), mat_chrome, rot=(math.radians(90), 0, 0), parent=cabin_root)
        add_cylinder(f"Vent_Center_Core_{v}", 0.018, 0.022, (vx, dash_z + 0.225, dash_y - 0.005), mat_piano, rot=(math.radians(90), 0, 0), parent=cabin_root)
    # Far Left Vent (Driver side) & Far Right Vent (Passenger side)
    add_cylinder("Vent_Outer_Left", 0.030, 0.02, (-0.46, dash_z + 0.225, dash_y + 0.02), mat_chrome, rot=(math.radians(90), 0, 0), parent=cabin_root)
    add_cylinder("Vent_Outer_Right", 0.030, 0.02, (1.22, dash_z + 0.225, dash_y + 0.02), mat_chrome, rot=(math.radians(90), 0, 0), parent=cabin_root)

    # Climate Control Dial Stack in Center Console
    add_box("Climate_Control_Panel", (0.24, 0.02, 0.08), (con_x, dash_z + 0.20, dash_y - 0.11), mat_piano, parent=cabin_root)
    for c in [-0.07, 0.0, 0.07]:
        add_cylinder(f"Climate_Dial_{c}", 0.016, 0.015, (con_x + c, dash_z + 0.21, dash_y - 0.11), mat_chrome, rot=(math.radians(90), 0, 0), parent=cabin_root)

    # Instrument Cluster Glass (Driver Front)
    add_box("Cluster_Glass_Binnacle", (0.36, 0.015, 0.15), (0.0, dash_z + 0.22, dash_y + 0.05), mat_screen, rot=(math.radians(-8), 0, 0), parent=cabin_root)
    # Center & Passenger Glass Display
    add_box("Center_Display_Glass", (0.75, 0.015, 0.14), (con_x + 0.38, dash_z + 0.22, dash_y + 0.05), mat_screen, parent=cabin_root)

    # ---------------------------------------------------------
    # 7. 360-DEGREE ROLLS-ROYCE STEERING WHEEL ASSEMBLY
    # ---------------------------------------------------------
    # Placed directly in front of driver (X=0.0, Y=-0.42m, Z=-0.45m), tilted 22 degrees
    sw_pivot = bpy.data.objects.new("SteeringWheel_Pivot", None)
    bpy.context.scene.collection.objects.link(sw_pivot)
    sw_pivot.location = (0.0, 0.45, -0.42)
    sw_pivot.rotation_euler = (math.radians(68), 0, 0) # 22 deg tilt from vertical
    sw_pivot.parent = cabin_root

    # Steering Column
    add_cylinder("Steering_Column", 0.032, 0.40, (0.0, -0.58, -0.48), mat_piano, rot=(math.radians(68), 0, 0), parent=cabin_root)

    # 1. Continuous 360-degree Torus Outer Rim (380mm diameter, Cream Nappa leather)
    sw_rim = add_torus("SteeringWheel_Rim", 0.19, 0.018, (0, 0, 0), mat_cream, major_seg=64, minor_seg=24, parent=sw_pivot)

    # 2. Concentric Inner Chrome Horn Ring (Iconic Vintage / Luxury Rolls-Royce detail)
    sw_inner_ring = add_torus("SteeringWheel_InnerChromeRing", 0.138, 0.005, (0, 0, 0.003), mat_chrome, major_seg=64, minor_seg=16, parent=sw_pivot)

    # 3. Central Hub & Horn Button with Chrome Outer Bezel
    sw_hub_bezel = add_cylinder("SteeringWheel_HubBezel", 0.068, 0.032, (0, 0, 0), mat_chrome, parent=sw_pivot)
    sw_hub_face = add_cylinder("SteeringWheel_HubFace", 0.055, 0.035, (0, 0, 0.002), mat_piano, parent=sw_pivot)
    # Central RR Monogram Crest
    sw_crest = add_box("SteeringWheel_RRCrest", (0.024, 0.024, 0.006), (0, 0, 0.021), mat_chrome, parent=sw_pivot)

    # Top Center 12 o'clock Chrome Alignment Marker
    add_box("SteeringWheel_TopMarker", (0.014, 0.024, 0.018), (0, 0.19, 0), mat_chrome, parent=sw_pivot)

    # 4. 3 Distinct Spokes
    # Left Horizontal Spoke
    add_box("SW_Spoke_Left", (0.095, 0.048, 0.020), (-0.115, -0.010, 0.004), mat_piano, parent=sw_pivot)
    add_box("SW_Spoke_Left_Chrome", (0.095, 0.012, 0.022), (-0.115, 0.015, 0.004), mat_chrome, parent=sw_pivot)

    # Right Horizontal Spoke
    add_box("SW_Spoke_Right", (0.095, 0.048, 0.020), (0.115, -0.010, 0.004), mat_piano, parent=sw_pivot)
    add_box("SW_Spoke_Right_Chrome", (0.095, 0.012, 0.022), (0.115, 0.015, 0.004), mat_chrome, parent=sw_pivot)

    # Bottom Spoke in Burl Walnut with Chrome Trim
    add_box("SW_Spoke_Bottom_Walnut", (0.042, 0.095, 0.020), (0, -0.115, 0.0), mat_walnut, parent=sw_pivot)
    add_box("SW_Spoke_Bottom_ChromeL", (0.008, 0.095, 0.022), (-0.021, -0.115, 0.0), mat_chrome, parent=sw_pivot)
    add_box("SW_Spoke_Bottom_ChromeR", (0.008, 0.095, 0.022), (0.021, -0.115, 0.0), mat_chrome, parent=sw_pivot)

    # 5. Physical 3D Buttons on Steering Wheel Spokes
    # Left Spoke: VOL+, VOL-, Play/Pause
    add_box("SW_Btn_VolUp", (0.024, 0.016, 0.008), (-0.135, 0.006, 0.018), mat_chrome, parent=sw_pivot)
    add_box("SW_Btn_VolDown", (0.024, 0.016, 0.008), (-0.135, -0.020, 0.018), mat_chrome, parent=sw_pivot)
    add_box("SW_Btn_PlayPause", (0.022, 0.016, 0.008), (-0.095, -0.007, 0.018), mat_chrome, parent=sw_pivot)

    # Right Spoke: CAM, HUD, Cruise
    add_box("SW_Btn_CamMode", (0.022, 0.016, 0.008), (0.095, -0.007, 0.018), mat_chrome, parent=sw_pivot)
    add_box("SW_Btn_HudReset", (0.024, 0.016, 0.008), (0.135, 0.006, 0.018), mat_chrome, parent=sw_pivot)
    add_box("SW_Btn_Cruise", (0.024, 0.016, 0.008), (0.135, -0.020, 0.018), mat_chrome, parent=sw_pivot)

    # 6. Paddle Shifters behind wheel (Left - and Right +)
    add_box("SW_Paddle_Minus_Left", (0.026, 0.085, 0.008), (-0.125, 0.035, -0.028), mat_chrome, parent=sw_pivot)
    add_box("SW_Paddle_Plus_Right", (0.026, 0.085, 0.008), (0.125, 0.035, -0.028), mat_chrome, parent=sw_pivot)

    # ---------------------------------------------------------
    # 8. DOOR PANELS (Driver Left X=-0.48m, Passenger Right X=1.24m)
    # ---------------------------------------------------------
    for side, dx, is_driver in [("Driver", -0.48, True), ("Passenger", 1.24, False)]:
        door_empty = bpy.data.objects.new(f"Door_{side}_Rig", None)
        bpy.context.scene.collection.objects.link(door_empty)
        door_empty.location = (dx, 0, 0)
        door_empty.parent = cabin_root

        # Door Main Card
        add_box(f"Door_{side}_Card", (0.08, 1.65, 0.72), (0, 0.20, floor_y + 0.45), mat_cream, parent=door_empty)
        # Upper Sill
        add_box(f"Door_{side}_UpperSill", (0.10, 1.65, 0.08), (0, 0.20, floor_y + 0.81), mat_cream, parent=door_empty)
        # Middle Burl Walnut Wood Veneer Trim Insert
        add_box(f"Door_{side}_WalnutTrim", (0.025, 1.55, 0.14), (-0.03 if is_driver else 0.03, 0.20, floor_y + 0.70), mat_walnut, parent=door_empty)
        add_box(f"Door_{side}_ChromeTrim", (0.015, 1.55, 0.012), (-0.035 if is_driver else 0.035, 0.20, floor_y + 0.63), mat_chrome, parent=door_empty)

        # Padded Armrest with Window Switch Panel
        add_box(f"Door_{side}_Armrest", (0.09, 0.55, 0.08), (-0.02 if is_driver else 0.02, 0.05, floor_y + 0.52), mat_cream, parent=door_empty)
        # Chrome Door Release Latch / Handle
        add_box(f"Door_{side}_HandleBezel", (0.015, 0.12, 0.06), (-0.04 if is_driver else 0.04, -0.15, floor_y + 0.68), mat_chrome, parent=door_empty)

        # Circular Speaker Grille with Chrome Bezel
        add_cylinder(f"Door_{side}_Speaker", 0.065, 0.015, (-0.035 if is_driver else 0.035, -0.32, floor_y + 0.40), mat_chrome, rot=(0, math.radians(90), 0), parent=door_empty)
        add_cylinder(f"Door_{side}_Speaker_Core", 0.052, 0.020, (-0.036 if is_driver else 0.036, -0.32, floor_y + 0.40), mat_piano, rot=(0, math.radians(90), 0), parent=door_empty)

        # Lower Map / Storage Pocket
        add_box(f"Door_{side}_Pocket", (0.06, 0.65, 0.18), (-0.02 if is_driver else 0.02, 0.25, floor_y + 0.22), mat_cream, parent=door_empty)

    # ---------------------------------------------------------
    # 9. PILLARS & ROOF HEADLINER (Full Enclosure)
    # ---------------------------------------------------------
    # A-Pillars (Framing Windshield)
    add_box("APillar_Left", (0.08, 0.08, 0.75), (-0.46, -0.52, floor_y + 0.98), mat_cream, rot=(math.radians(24), math.radians(-10), 0), parent=cabin_root)
    add_box("APillar_Right", (0.08, 0.08, 0.75), (1.22, -0.52, floor_y + 0.98), mat_cream, rot=(math.radians(24), math.radians(10), 0), parent=cabin_root)

    # Windshield Upper Header Bar
    add_box("Windshield_Upper_Header", (1.78, 0.10, 0.07), (floor_center_x, -0.42, floor_y + 1.34), mat_cream, parent=cabin_root)
    # Interior Rearview Mirror
    add_cylinder("Rearview_Mirror_Stalk", 0.008, 0.07, (floor_center_x, -0.44, floor_y + 1.28), mat_chrome, parent=cabin_root)
    add_box("Rearview_Mirror_Housing", (0.24, 0.035, 0.075), (floor_center_x, -0.46, floor_y + 1.23), mat_piano, parent=cabin_root)

    # Roof Headliner (Full Ceiling from windshield to rear window)
    add_box("Roof_Headliner", (1.80, 2.30, 0.04), (floor_center_x, 0.55, floor_y + 1.38), mat_cream, parent=cabin_root)

    # B-Pillars with Seatbelt Buckle Fittings
    add_box("BPillar_Left", (0.09, 0.14, 1.20), (-0.48, 0.40, floor_y + 0.75), mat_cream, parent=cabin_root)
    add_box("BPillar_Right", (0.09, 0.14, 1.20), (1.24, 0.40, floor_y + 0.75), mat_cream, parent=cabin_root)
    add_box("Seatbelt_Buckle_L", (0.03, 0.06, 0.08), (-0.44, 0.38, floor_y + 0.95), mat_chrome, parent=cabin_root)
    add_box("Seatbelt_Buckle_R", (0.03, 0.06, 0.08), (1.20, 0.38, floor_y + 0.95), mat_chrome, parent=cabin_root)

    # ---------------------------------------------------------
    # 10. REAR CABIN (Rear Bench Seat, Headrests & Rear Shelf)
    # ---------------------------------------------------------
    rear_z = 1.30
    # Rear Seat Base Cushion
    add_box("Rear_Bench_Cushion", (1.68, 0.54, 0.18), (floor_center_x, rear_z, floor_y + 0.32), mat_cream, parent=cabin_root)
    # Rear Seat Backrest (tilted 14 degrees)
    add_box("Rear_Bench_Backrest", (1.68, 0.16, 0.68), (floor_center_x, rear_z + 0.28, floor_y + 0.72), mat_cream, rot=(math.radians(-14), 0, 0), parent=cabin_root)
    # 3 Rear Headrests
    for rx in [floor_center_x - 0.52, floor_center_x, floor_center_x + 0.52]:
        add_box(f"Rear_Headrest_{rx:.2f}", (0.26, 0.12, 0.18), (rx, rear_z + 0.36, floor_y + 1.12), mat_cream, rot=(math.radians(-14), 0, 0), parent=cabin_root)
        add_cylinder(f"Rear_Headrest_StalkL_{rx:.2f}", 0.008, 0.08, (rx - 0.06, rear_z + 0.35, floor_y + 1.02), mat_chrome, parent=cabin_root)
        add_cylinder(f"Rear_Headrest_StalkR_{rx:.2f}", 0.008, 0.08, (rx + 0.06, rear_z + 0.35, floor_y + 1.02), mat_chrome, parent=cabin_root)

    # Rear Center Armrest
    add_box("Rear_Center_Armrest", (0.24, 0.44, 0.12), (floor_center_x, rear_z - 0.02, floor_y + 0.44), mat_cream, parent=cabin_root)

    # Rear Center AC Console between front seats
    add_box("Rear_AC_Console", (0.24, 0.18, 0.32), (con_x, 0.58, floor_y + 0.38), mat_piano, parent=cabin_root)
    add_box("Rear_AC_Walnut", (0.22, 0.02, 0.18), (con_x, 0.67, floor_y + 0.44), mat_walnut, parent=cabin_root)
    add_cylinder("Rear_Vent_L", 0.022, 0.015, (con_x - 0.055, 0.68, floor_y + 0.46), mat_chrome, rot=(math.radians(90), 0, 0), parent=cabin_root)
    add_cylinder("Rear_Vent_R", 0.022, 0.015, (con_x + 0.055, 0.68, floor_y + 0.46), mat_chrome, rot=(math.radians(90), 0, 0), parent=cabin_root)

    # Rear Parcel Shelf
    add_box("Rear_Parcel_Shelf", (1.70, 0.42, 0.05), (floor_center_x, rear_z + 0.48, floor_y + 0.88), mat_carpet, parent=cabin_root)

    print("Rolls-Royce V18 Luxury Cabin geometry generated successfully!")

if __name__ == "__main__":
    out_dir = r"D:\XE_RC_FPV_V10\controller_godot\models"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "rolls_royce_cabin_v18.glb")
    
    build_rolls_royce_cabin()
    
    print(f"Exporting GLB to: {out_path}")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=False,
        export_apply=False,
        export_cameras=False,
        export_lights=False
    )
    print(f"GLB Export completed: {os.path.getsize(out_path)} bytes")
