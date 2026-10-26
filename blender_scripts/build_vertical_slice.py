# -*- coding: utf-8 -*-
"""
FILE: D:\\XE_RC_FPV_V10\\blender_scripts\\build_vertical_slice.py
Milestone 3.2: Xay dung mo hinh 3D Vertical Slice chat luong cao bang Blender 5.2 Python API.
To chuc chuan 13 Collections, 12+ PBR Materials, khac phuc triet de loi transform & pivot,
them chi tiet Sedan, cua ban le chuan, chu noi tieng Viet co dau 'CÀ PHÊ PHỐ VIỆT',
khop hong/vai NPC va chan/duoi cho canh. Xuat GLB dong bo sang Godot va Web.
"""

import bpy
import bmesh
import math
import os
import shutil
import hashlib
from mathutils import Vector, Euler, Quaternion

PROJECT_ROOT = r"D:\XE_RC_FPV_V10"
if not os.path.exists(PROJECT_ROOT):
    PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

OUTPUT_BLEND = os.path.join(PROJECT_ROOT, "models", "vertical_slice_city_block.blend")
GODOT_GLB = os.path.join(PROJECT_ROOT, "controller_godot", "models", "vertical_slice_city_block.glb")
WWW_GLB = os.path.join(PROJECT_ROOT, "www", "models", "vertical_slice_city_block.glb")

REQUIRED_COLLECTIONS = [
    "ENVIRONMENT",
    "ROAD_NETWORK",
    "ARCHITECTURE",
    "INTERIOR_CAFE",
    "PROPS",
    "VEGETATION",
    "VEHICLES",
    "CHARACTERS",
    "ANIMALS",
    "LIGHTING",
    "CAMERAS",
    "COLLISION_GUIDES",
    "EXPORT_COLLECTION",
]


def setup_clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "VerticalSlice_City_M3_2"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"

    col_map = {}
    for cname in REQUIRED_COLLECTIONS:
        c = bpy.data.collections.new(cname)
        scene.collection.children.link(c)
        col_map[cname] = c
    return scene, col_map


def create_pbr_material(name, base_color, roughness=0.5, metallic=0.0, alpha=1.0, emission_color=(0,0,0), emission_strength=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (base_color[0], base_color[1], base_color[2], 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Alpha" in bsdf.inputs and alpha < 1.0:
            bsdf.inputs["Alpha"].default_value = alpha
            mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else "OPAQUE"
        if emission_strength > 0.0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (emission_color[0], emission_color[1], emission_color[2], 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def build_pbr_library():
    return {
        "Asphalt": create_pbr_material("MAT_Asphalt", (0.13, 0.15, 0.17), roughness=0.82, metallic=0.0),
        "RoadMarking": create_pbr_material("MAT_RoadMarking", (0.94, 0.94, 0.90), roughness=0.45, metallic=0.0),
        "SidewalkTiles": create_pbr_material("MAT_SidewalkTiles", (0.48, 0.50, 0.52), roughness=0.65, metallic=0.0),
        "ConcreteCurb": create_pbr_material("MAT_Concrete", (0.58, 0.60, 0.62), roughness=0.75, metallic=0.0),
        "WallWarm": create_pbr_material("MAT_PaintedWall_Warm", (0.92, 0.86, 0.76), roughness=0.58, metallic=0.0),
        "Brick": create_pbr_material("MAT_Brick_Terracotta", (0.68, 0.30, 0.22), roughness=0.72, metallic=0.0),
        "Wood": create_pbr_material("MAT_Wood_Teak", (0.36, 0.22, 0.11), roughness=0.40, metallic=0.0),
        "Glass": create_pbr_material("MAT_Glass_Clear", (0.70, 0.88, 0.96), roughness=0.06, metallic=0.05, alpha=0.35),
        "MetalDark": create_pbr_material("MAT_Metal_Brushed", (0.18, 0.20, 0.24), roughness=0.25, metallic=0.85),
        "Chrome": create_pbr_material("MAT_Metal_Chrome", (0.88, 0.90, 0.94), roughness=0.10, metallic=0.95),
        "Rubber": create_pbr_material("MAT_Rubber_Tire", (0.08, 0.08, 0.09), roughness=0.88, metallic=0.0),
        "AwningRed": create_pbr_material("MAT_Fabric_Awning", (0.75, 0.14, 0.16), roughness=0.78, metallic=0.0),
        "SignGold": create_pbr_material("MAT_Sign_Emissive", (1.0, 0.84, 0.25), roughness=0.30, metallic=0.3, emission_color=(1.0, 0.84, 0.25), emission_strength=1.5),
        "TaillightRed": create_pbr_material("MAT_Taillight_Emissive", (0.95, 0.08, 0.08), roughness=0.20, metallic=0.1, emission_color=(0.95, 0.08, 0.08), emission_strength=2.0),
        "HeadlightWhite": create_pbr_material("MAT_Headlight_Emissive", (0.95, 0.98, 1.0), roughness=0.15, metallic=0.1, emission_color=(0.95, 0.98, 1.0), emission_strength=2.5),
        "Grass": create_pbr_material("MAT_Plant_Grass", (0.18, 0.42, 0.22), roughness=0.85, metallic=0.0),
        "LeafDark": create_pbr_material("MAT_Plant_LeafDark", (0.14, 0.38, 0.18), roughness=0.55, metallic=0.0),
        "LeafBright": create_pbr_material("MAT_Plant_LeafBright", (0.28, 0.56, 0.24), roughness=0.52, metallic=0.0),
        "Flower": create_pbr_material("MAT_Plant_Flower", (0.92, 0.32, 0.48), roughness=0.60, metallic=0.0),
        "CarPaintBlue": create_pbr_material("MAT_CarPaint_Sedan", (0.07, 0.32, 0.65), roughness=0.18, metallic=0.70),
        "NpcShirt1": create_pbr_material("MAT_NPC_Shirt_Teal", (0.12, 0.58, 0.55), roughness=0.65, metallic=0.0),
        "NpcShirt2": create_pbr_material("MAT_NPC_Shirt_Coral", (0.88, 0.36, 0.28), roughness=0.65, metallic=0.0),
        "NpcPants": create_pbr_material("MAT_NPC_Pants_Navy", (0.13, 0.17, 0.26), roughness=0.72, metallic=0.0),
        "Skin": create_pbr_material("MAT_Character_Skin", (0.90, 0.72, 0.56), roughness=0.60, metallic=0.0),
        "DogCoat": create_pbr_material("MAT_Animal_DogCoat", (0.80, 0.54, 0.22), roughness=0.62, metallic=0.0),
    }


def link_to_collection(obj, target_col, export_col=None):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    target_col.objects.link(obj)
    if export_col is not None and export_col != target_col:
        export_col.objects.link(obj)


def finalize_mesh_uv_and_normals(obj, bevel_width=0.0):
    bpy.context.view_layer.objects.active = obj
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel_width > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=bm.edges,
            offset=bevel_width,
            segments=2,
            profile=0.5,
            affect="EDGES",
        )
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        for loop in face.loops:
            co = loop.vert.co
            if abs(n.z) >= abs(n.x) and abs(n.z) >= abs(n.y):
                loop[uv_layer].uv = (co.x * 0.5, co.y * 0.5)
            elif abs(n.x) >= abs(n.y):
                loop[uv_layer].uv = (co.y * 0.5, co.z * 0.5)
            else:
                loop[uv_layer].uv = (co.x * 0.5, co.z * 0.5)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def create_box_with_pivot(name, size_xyz, loc_xyz, pivot_pos='BOTTOM_CENTER', mat=None, col=None, export_col=None, bevel=0.01):
    sx, sy, sz = size_xyz
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        if pivot_pos == 'BOTTOM_CENTER':
            v.co.z = (v.co.z + 0.5) * sz
        elif pivot_pos == 'TOP_CENTER':
            v.co.z = (v.co.z - 0.5) * sz
        elif pivot_pos == 'HINGE_EDGE_Y_MAX':
            v.co.y = (v.co.y - 0.5) * sy
            v.co.z = (v.co.z + 0.5) * sz
        elif pivot_pos == 'CENTER':
            v.co.z *= sz
    bm.to_mesh(mesh)
    bm.free()
    obj.location = Vector(loc_xyz)
    if mat:
        obj.data.materials.append(mat)
    link_to_collection(obj, col, export_col)
    finalize_mesh_uv_and_normals(obj, bevel_width=bevel)
    return obj


def create_cylinder_part(name, radius, depth, loc_xyz, rot_euler, mat, col, export_col, origin_at_bottom=False):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=radius, radius2=radius, depth=depth)
    if origin_at_bottom:
        for v in bm.verts:
            v.co.z += depth * 0.5
    bm.to_mesh(mesh)
    bm.free()
    obj.location = Vector(loc_xyz)
    obj.rotation_euler = Euler(rot_euler, "XYZ")
    if mat:
        obj.data.materials.append(mat)
    link_to_collection(obj, col, export_col)
    finalize_mesh_uv_and_normals(obj, bevel_width=0.0)
    return obj


def build_road_and_sidewalk(cols, mats):
    rc = cols["ROAD_NETWORK"]
    ec = cols["EXPORT_COLLECTION"]

    create_box_with_pivot("Road_Asphalt_Main", (7.0, 30.0, 0.08), (0, 0, -0.08), 'BOTTOM_CENTER', mats["Asphalt"], rc, ec, bevel=0.0)
    create_box_with_pivot("Sidewalk_West", (3.5, 30.0, 0.15), (-5.25, 0, 0.0), 'BOTTOM_CENTER', mats["SidewalkTiles"], rc, ec, bevel=0.01)
    create_box_with_pivot("Sidewalk_East", (3.5, 30.0, 0.15), (5.25, 0, 0.0), 'BOTTOM_CENTER', mats["SidewalkTiles"], rc, ec, bevel=0.01)
    create_box_with_pivot("Curb_West", (0.22, 30.0, 0.16), (-3.61, 0, 0.0), 'BOTTOM_CENTER', mats["ConcreteCurb"], rc, ec, bevel=0.015)
    create_box_with_pivot("Curb_East", (0.22, 30.0, 0.16), (3.61, 0, 0.0), 'BOTTOM_CENTER', mats["ConcreteCurb"], rc, ec, bevel=0.015)

    for idx, y_pos in enumerate([-12.0, -6.0, 0.0, 6.0, 12.0]):
        create_box_with_pivot(f"Road_CenterDash_{idx:02d}", (0.16, 2.6, 0.004), (0, y_pos, 0.002), 'BOTTOM_CENTER', mats["RoadMarking"], rc, ec, bevel=0.0)

    for s_idx, x_pos in enumerate([-2.6, -1.6, -0.6, 0.6, 1.6, 2.6]):
        create_box_with_pivot(f"Road_Crosswalk_Zebra_{s_idx:02d}", (0.55, 2.2, 0.004), (x_pos, -8.5, 0.002), 'BOTTOM_CENTER', mats["RoadMarking"], rc, ec, bevel=0.0)


def build_vietnamese_shophouse_cafe(cols, mats):
    ac = cols["ARCHITECTURE"]
    ic = cols["INTERIOR_CAFE"]
    pc = cols["PROPS"]
    ec = cols["EXPORT_COLLECTION"]

    # 1. San & Tuong ngoai Shop
    create_box_with_pivot("Cafe_Floor_Slab", (7.5, 10.0, 0.15), (-10.75, 0.0, 0.0), 'BOTTOM_CENTER', mats["Brick"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_Wall_Back", (0.28, 10.0, 7.2), (-14.36, 0.0, 0.15), 'BOTTOM_CENTER', mats["WallWarm"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_Wall_South", (7.5, 0.28, 7.2), (-10.75, -4.86, 0.15), 'BOTTOM_CENTER', mats["WallWarm"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_Wall_North", (7.5, 0.28, 7.2), (-10.75, 4.86, 0.15), 'BOTTOM_CENTER', mats["WallWarm"], ac, ec, bevel=0.01)

    # 2. Mat tien & Cot da
    create_box_with_pivot("Cafe_Facade_Pillar_South", (0.35, 0.45, 3.8), (-7.18, -4.5, 0.15), 'BOTTOM_CENTER', mats["Brick"], ac, ec, bevel=0.02)
    create_box_with_pivot("Cafe_Facade_Pillar_CenterS", (0.35, 0.35, 3.8), (-7.18, -0.95, 0.15), 'BOTTOM_CENTER', mats["Brick"], ac, ec, bevel=0.02)
    create_box_with_pivot("Cafe_Facade_Pillar_CenterN", (0.35, 0.35, 3.8), (-7.18, 0.95, 0.15), 'BOTTOM_CENTER', mats["Brick"], ac, ec, bevel=0.02)
    create_box_with_pivot("Cafe_Facade_Pillar_North", (0.35, 0.45, 3.8), (-7.18, 4.5, 0.15), 'BOTTOM_CENTER', mats["Brick"], ac, ec, bevel=0.02)

    # Cua so kinh mat tien
    create_box_with_pivot("Cafe_GlassWindow_South", (0.06, 3.2, 2.6), (-7.18, -2.7, 0.55), 'BOTTOM_CENTER', mats["Glass"], ac, ec, bevel=0.0)
    create_box_with_pivot("Cafe_GlassWindow_North", (0.06, 3.2, 2.6), (-7.18, 2.7, 0.55), 'BOTTOM_CENTER', mats["Glass"], ac, ec, bevel=0.0)
    create_box_with_pivot("Cafe_LowWall_South", (0.25, 3.2, 0.40), (-7.18, -2.7, 0.15), 'BOTTOM_CENTER', mats["Wood"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_LowWall_North", (0.25, 3.2, 0.40), (-7.18, 2.7, 0.15), 'BOTTOM_CENTER', mats["Wood"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_Facade_HeaderBeam", (0.32, 9.6, 1.4), (-7.18, 0.0, 2.55), 'BOTTOM_CENTER', mats["WallWarm"], ac, ec, bevel=0.01)

    # 3. Cua ban le chuan (Origin tai dung truc ban le goc Y = +0.80m, quay mo vao trong -82 do)
    door_obj = create_box_with_pivot(
        "Cafe_Entrance_Door_Hinged",
        (0.08, 1.40, 2.35),
        (-7.18, 0.80, 0.15),
        'HINGE_EDGE_Y_MAX',  # Hinge pivot tai mep Y=+0.80m
        mats["Wood"], ac, ec, bevel=0.01
    )
    door_obj.rotation_euler = Euler((0, 0, math.radians(-82)), "XYZ")

    # 4. Mai hien & Bang hieu tieng Viet co dau 'CÀ PHÊ PHỐ VIỆT'
    awning = create_box_with_pivot("Cafe_Awning_Canopy", (1.45, 9.4, 0.18), (-6.45, 0.0, 2.85), 'BOTTOM_CENTER', mats["AwningRed"], ac, ec, bevel=0.02)
    awning.rotation_euler = Euler((0, math.radians(12), 0), "XYZ")

    create_box_with_pivot("Cafe_Signboard_Frame", (0.22, 6.8, 0.85), (-6.95, 0.0, 3.25), 'BOTTOM_CENTER', mats["Wood"], ac, ec, bevel=0.02)
    create_box_with_pivot("Cafe_Signboard_Face_VI", (0.06, 6.4, 0.65), (-6.82, 0.0, 3.35), 'BOTTOM_CENTER', mats["WallWarm"], ac, ec, bevel=0.01)

    # 3D Font tieng Viet co dau:
    font_path = r"C:\Windows\Fonts\arial.ttf"
    if os.path.exists(font_path):
        v_font = bpy.data.fonts.load(font_path)
        tdata = bpy.data.curves.new("SignTextCurve", type='FONT')
        tdata.font = v_font
        tdata.body = "CÀ PHÊ PHỐ VIỆT"
        tdata.size = 0.38
        tdata.extrude = 0.03
        tdata.align_x = 'CENTER'
        tdata.align_y = 'CENTER'
        tobj = bpy.data.objects.new("Cafe_Signboard_Text_VI", tdata)
        tobj.location = Vector((-6.78, 0.0, 3.65))
        tobj.rotation_euler = Euler((math.radians(90), 0, math.radians(90)), "XYZ")
        link_to_collection(tobj, ac, ec)
        bpy.context.view_layer.objects.active = tobj
        tobj.select_set(True)
        bpy.ops.object.convert(target='MESH')
        tobj.data.materials.append(mats["SignGold"])
        finalize_mesh_uv_and_normals(tobj)

    # Tang 2 Shophouse
    create_box_with_pivot("Cafe_UpperFloor_Facade", (0.30, 9.6, 3.4), (-7.18, 0.0, 3.95), 'BOTTOM_CENTER', mats["WallWarm"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_UpperFloor_Balcony", (1.1, 8.8, 0.18), (-6.6, 0.0, 3.95), 'BOTTOM_CENTER', mats["ConcreteCurb"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_UpperFloor_Railing", (0.08, 8.8, 0.95), (-6.1, 0.0, 4.13), 'BOTTOM_CENTER', mats["MetalDark"], ac, ec, bevel=0.01)
    create_box_with_pivot("Cafe_Roof_Slab", (8.0, 10.4, 0.35), (-10.75, 0.0, 7.35), 'BOTTOM_CENTER', mats["Brick"], ac, ec, bevel=0.02)

    # 5. Noi that Cafe
    create_box_with_pivot("Cafe_Interior_Ceiling", (7.2, 9.6, 0.15), (-10.75, 0.0, 3.80), 'BOTTOM_CENTER', mats["WallWarm"], ic, ec, bevel=0.0)
    create_box_with_pivot("Cafe_Interior_ServiceCounter", (1.1, 4.2, 1.05), (-12.5, 1.8, 0.15), 'BOTTOM_CENTER', mats["Wood"], ic, ec, bevel=0.02)
    create_box_with_pivot("Cafe_Interior_CounterTop", (1.25, 4.35, 0.08), (-12.5, 1.8, 1.20), 'BOTTOM_CENTER', mats["ConcreteCurb"], ic, ec, bevel=0.01)
    create_box_with_pivot("Cafe_Interior_BackShelf", (0.45, 3.8, 2.2), (-14.0, 1.8, 0.45), 'BOTTOM_CENTER', mats["Wood"], ic, ec, bevel=0.01)

    table_coords = [(-10.2, -2.4, ic), (-12.4, -2.4, ic), (-6.1, -2.8, pc), (-6.1, 2.8, pc)]
    for t_idx, (tx, ty, target_c) in enumerate(table_coords):
        create_cylinder_part(f"Cafe_Table_Top_{t_idx:02d}", 0.48, 0.05, (tx, ty, 0.85), (0, 0, 0), mats["Wood"], target_c, ec)
        create_cylinder_part(f"Cafe_Table_Leg_{t_idx:02d}", 0.05, 0.70, (tx, ty, 0.15), (0, 0, 0), mats["MetalDark"], target_c, ec, origin_at_bottom=True)
        for c_off in [-0.65, 0.65]:
            create_box_with_pivot(f"Cafe_Chair_Seat_{t_idx:02d}_{c_off:+.1f}", (0.42, 0.42, 0.45), (tx, ty + c_off, 0.15), 'BOTTOM_CENTER', mats["Wood"], target_c, ec, bevel=0.01)


def build_bus_stop_and_street_lights(cols, mats):
    pc = cols["PROPS"]
    lc = cols["LIGHTING"]
    ec = cols["EXPORT_COLLECTION"]

    bx, by = 5.8, 4.0
    create_cylinder_part("BusStop_Pillar_South", 0.07, 2.55, (bx, by - 1.8, 0.15), (0, 0, 0), mats["MetalDark"], pc, ec, origin_at_bottom=True)
    create_cylinder_part("BusStop_Pillar_North", 0.07, 2.55, (bx, by + 1.8, 0.15), (0, 0, 0), mats["MetalDark"], pc, ec, origin_at_bottom=True)
    create_box_with_pivot("BusStop_Roof_Canopy", (1.6, 4.2, 0.12), (bx - 0.35, by, 2.70), 'BOTTOM_CENTER', mats["MetalDark"], pc, ec, bevel=0.02)
    create_box_with_pivot("BusStop_BackGlass", (0.06, 3.5, 2.1), (bx + 0.35, by, 0.35), 'BOTTOM_CENTER', mats["Glass"], pc, ec, bevel=0.0)
    create_box_with_pivot("BusStop_Bench", (0.48, 2.4, 0.45), (bx, by, 0.15), 'BOTTOM_CENTER', mats["Wood"], pc, ec, bevel=0.015)
    create_box_with_pivot("BusStop_RouteBoard", (0.12, 0.65, 1.95), (bx - 0.85, by - 2.3, 0.15), 'BOTTOM_CENTER', mats["SignGold"], pc, ec, bevel=0.01)

    for l_idx, (lx, ly) in enumerate([(-3.85, -10.0), (-3.85, 8.0), (3.85, -6.0), (3.85, 11.0)]):
        arm_dir = 1.0 if lx < 0 else -1.0
        create_cylinder_part(f"StreetLight_Pole_{l_idx:02d}", 0.08, 5.2, (lx, ly, 0.15), (0, 0, 0), mats["MetalDark"], lc, ec, origin_at_bottom=True)
        create_box_with_pivot(f"StreetLight_Arm_{l_idx:02d}", (1.1, 0.10, 0.10), (lx + arm_dir * 0.45, ly, 5.25), 'BOTTOM_CENTER', mats["MetalDark"], lc, ec, bevel=0.01)
        create_box_with_pivot(f"StreetLight_Lamp_{l_idx:02d}", (0.35, 0.22, 0.08), (lx + arm_dir * 0.85, ly, 5.18), 'BOTTOM_CENTER', mats["SignGold"], lc, ec, bevel=0.01)


def build_park_and_vegetation_clusters(cols, mats):
    vc = cols["VEGETATION"]
    ec = cols["EXPORT_COLLECTION"]

    create_box_with_pivot("Park_Grass_Lawn", (8.0, 28.0, 0.16), (11.0, 0.0, 0.0), 'BOTTOM_CENTER', mats["Grass"], vc, ec, bevel=0.01)
    create_box_with_pivot("Park_Walking_Path", (1.8, 28.0, 0.17), (8.5, 0.0, 0.0), 'BOTTOM_CENTER', mats["SidewalkTiles"], vc, ec, bevel=0.01)

    # Cum 1
    t1x, t1y = 11.5, -7.5
    create_box_with_pivot("Planter_Box_01", (2.2, 2.2, 0.42), (t1x, t1y, 0.16), 'BOTTOM_CENTER', mats["Brick"], vc, ec, bevel=0.02)
    create_cylinder_part("Tree_Layered_Trunk_01", 0.22, 2.6, (t1x, t1y, 0.42), (0, 0, 0), mats["Wood"], vc, ec, origin_at_bottom=True)
    create_cylinder_part("Tree_Layered_CanopyA_01", 1.85, 0.85, (t1x, t1y, 2.7), (0, 0, 0), mats["LeafDark"], vc, ec, origin_at_bottom=True)
    create_cylinder_part("Tree_Layered_CanopyB_01", 1.35, 0.75, (t1x, t1y, 3.6), (0, 0, 0), mats["LeafBright"], vc, ec, origin_at_bottom=True)

    # Cum 2
    t2x, t2y = 12.2, 1.5
    create_box_with_pivot("Planter_Box_02", (2.4, 2.4, 0.42), (t2x, t2y, 0.16), 'BOTTOM_CENTER', mats["Brick"], vc, ec, bevel=0.02)
    create_cylinder_part("Tree_Dome_Trunk_02", 0.26, 2.9, (t2x, t2y, 0.42), (0, 0.05, 0), mats["Wood"], vc, ec, origin_at_bottom=True)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.95, location=(t2x, t2y, 3.9))
    dome_crown = bpy.context.active_object
    dome_crown.name = "Tree_Dome_Crown_02"
    dome_crown.data.materials.append(mats["LeafBright"])
    link_to_collection(dome_crown, vc, ec)
    finalize_mesh_uv_and_normals(dome_crown)

    # Cum 3
    t3x, t3y = 11.2, 9.2
    create_box_with_pivot("Planter_Box_03", (2.0, 3.6, 0.38), (t3x, t3y, 0.16), 'BOTTOM_CENTER', mats["ConcreteCurb"], vc, ec, bevel=0.02)
    for b_idx, by_off in enumerate([-1.0, 0.0, 1.0]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.68, location=(t3x, t3y + by_off, 0.75))
        shrub = bpy.context.active_object
        shrub.name = f"Shrub_Bush_{b_idx:02d}"
        shrub.data.materials.append(mats["LeafDark"] if b_idx % 2 == 0 else mats["Flower"])
        link_to_collection(shrub, vc, ec)
        finalize_mesh_uv_and_normals(shrub)


def build_sample_sedan_with_separated_wheels(cols, mats):
    vc = cols["VEHICLES"]
    ec = cols["EXPORT_COLLECTION"]

    # Than xe chinh (Veh_Sedan_Body tai X=+1.75m, Y=-6.0m tren mat duong)
    car_root = create_box_with_pivot("Veh_Sedan_Body", (1.82, 4.40, 0.46), (1.75, -6.0, 0.32), 'BOTTOM_CENTER', mats["CarPaintBlue"], vc, ec, bevel=0.04)

    # Mui xe phia truoc (Hood)
    hood = create_box_with_pivot("Veh_Sedan_Hood", (1.78, 1.35, 0.22), (0.0, 1.45, 0.44), 'BOTTOM_CENTER', mats["CarPaintBlue"], vc, ec, bevel=0.03)
    hood.parent = car_root

    # Cop xe phia sau (Trunk)
    trunk = create_box_with_pivot("Veh_Sedan_Trunk", (1.78, 1.05, 0.26), (0.0, -1.60, 0.44), 'BOTTOM_CENTER', mats["CarPaintBlue"], vc, ec, bevel=0.03)
    trunk.parent = car_root

    # Cabin & Noc xe (Roof)
    cabin = create_box_with_pivot("Veh_Sedan_Cabin", (1.56, 2.10, 0.54), (0.0, -0.05, 0.44), 'BOTTOM_CENTER', mats["CarPaintBlue"], vc, ec, bevel=0.04)
    cabin.parent = car_root

    # Kinh chan gio truoc (Windshield sloped)
    windshield = create_box_with_pivot("Veh_Sedan_Windshield", (1.52, 0.06, 0.52), (0.0, 0.95, 0.48), 'BOTTOM_CENTER', mats["Glass"], vc, ec, bevel=0.01)
    windshield.rotation_euler = Euler((math.radians(35), 0, 0), "XYZ")
    windshield.parent = car_root

    # Kinh sau (Rear Glass sloped)
    rear_glass = create_box_with_pivot("Veh_Sedan_RearGlass", (1.52, 0.06, 0.48), (0.0, -1.05, 0.50), 'BOTTOM_CENTER', mats["Glass"], vc, ec, bevel=0.01)
    rear_glass.rotation_euler = Euler((math.radians(-32), 0, 0), "XYZ")
    rear_glass.parent = car_root

    # Kinh hong (Side Windows L/R)
    for s_lbl, s_x in [("L", -0.79), ("R", 0.79)]:
        side_glass = create_box_with_pivot(f"Veh_Sedan_SideGlass_{s_lbl}", (0.04, 1.85, 0.38), (s_x, -0.05, 0.56), 'BOTTOM_CENTER', mats["Glass"], vc, ec, bevel=0.01)
        side_glass.parent = car_root

    # Guong chieu hau (Mirrors L/R)
    for m_lbl, m_x, rot_z in [("L", -0.96, math.radians(-12)), ("R", 0.96, math.radians(12))]:
        mirror = create_box_with_pivot(f"Veh_Sedan_Mirror_{m_lbl}", (0.16, 0.22, 0.12), (m_x, 0.75, 0.62), 'BOTTOM_CENTER', mats["CarPaintBlue"], vc, ec, bevel=0.02)
        mirror.rotation_euler = Euler((0, 0, rot_z), "XYZ")
        mirror.parent = car_root

    # Den pha truoc (Headlights) & Den hau do (Taillights)
    headlights = create_box_with_pivot("Veh_Sedan_Lights_Front", (1.68, 0.08, 0.14), (0.0, 2.20, 0.22), 'BOTTOM_CENTER', mats["HeadlightWhite"], vc, ec, bevel=0.01)
    headlights.parent = car_root

    taillights = create_box_with_pivot("Veh_Sedan_Lights_Rear", (1.68, 0.08, 0.14), (0.0, -2.20, 0.26), 'BOTTOM_CENTER', mats["TaillightRed"], vc, ec, bevel=0.01)
    taillights.parent = car_root

    # 4 Banh xe tach roi doc lap (Lop cao su R=0.34m) + 4 Vanh Lazang hop kim dong tam (R=0.22m)
    wheel_specs = [
        ("Veh_Sedan_Wheel_FL", "Veh_Sedan_Rim_FL", (-0.92, 1.38, 0.02)),
        ("Veh_Sedan_Wheel_FR", "Veh_Sedan_Rim_FR", (0.92, 1.38, 0.02)),
        ("Veh_Sedan_Wheel_RL", "Veh_Sedan_Rim_RL", (-0.92, -1.38, 0.02)),
        ("Veh_Sedan_Wheel_RR", "Veh_Sedan_Rim_RR", (0.92, -1.38, 0.02)),
    ]
    for w_name, rim_name, w_rel_pos in wheel_specs:
        w_obj = create_cylinder_part(
            w_name,
            radius=0.34,
            depth=0.24,
            loc_xyz=w_rel_pos,
            rot_euler=(0, math.radians(90), 0),
            mat=mats["Rubber"],
            col=vc,
            export_col=ec,
            origin_at_bottom=False
        )
        w_obj.parent = car_root

        rim_obj = create_cylinder_part(
            rim_name,
            radius=0.22,
            depth=0.25,
            loc_xyz=(0, 0, 0),  # Dong tam tuyet doi voi banh xe
            rot_euler=(0, 0, 0),
            mat=mats["Chrome"],
            col=vc,
            export_col=ec,
            origin_at_bottom=False
        )
        rim_obj.parent = w_obj


def build_two_articulated_npcs_and_one_dog(cols, mats):
    cc = cols["CHARACTERS"]
    anc = cols["ANIMALS"]
    ec = cols["EXPORT_COLLECTION"]

    npc_configs = [
        ("NPC_01_Commuter", (-4.8, -6.0, 0.15), mats["NpcShirt1"]),
        ("NPC_02_Visitor", (4.6, -2.0, 0.15), mats["NpcShirt2"]),
    ]
    for npc_name, npc_pos, shirt_mat in npc_configs:
        root = create_box_with_pivot(npc_name, (0.38, 0.24, 0.02), npc_pos, 'BOTTOM_CENTER', mats["NpcPants"], cc, ec, bevel=0.0)
        torso = create_box_with_pivot(f"{npc_name}_Torso", (0.40, 0.24, 0.56), (0, 0, 0.78), 'BOTTOM_CENTER', shirt_mat, cc, ec, bevel=0.03)
        torso.parent = root
        head = create_box_with_pivot(f"{npc_name}_Head", (0.24, 0.24, 0.28), (0, 0, 1.38), 'BOTTOM_CENTER', mats["Skin"], cc, ec, bevel=0.04)
        head.parent = root

        # Khop hong (Hip pivot tai Z=0.78m) - chan mo rong xuong duoi
        for side_lbl, sx in [("L", -0.11), ("R", 0.11)]:
            leg = create_box_with_pivot(f"{npc_name}_Leg_{side_lbl}", (0.14, 0.16, 0.70), (sx, 0, 0.78), 'TOP_CENTER', mats["NpcPants"], cc, ec, bevel=0.02)
            leg.parent = root
            shoe = create_box_with_pivot(f"{npc_name}_Shoe_{side_lbl}", (0.15, 0.26, 0.08), (sx, 0.04, 0.0), 'BOTTOM_CENTER', mats["Rubber"], cc, ec, bevel=0.01)
            shoe.parent = root

        # Khop vai (Shoulder pivot tai Z=1.34m) - tay mo rong xuong duoi
        for side_lbl, ax in [("L", -0.27), ("R", 0.27)]:
            arm = create_box_with_pivot(f"{npc_name}_Arm_{side_lbl}", (0.11, 0.12, 0.54), (ax, 0, 1.34), 'TOP_CENTER', mats["Skin"], cc, ec, bevel=0.02)
            arm.parent = root

    # Cho canh: than, dau, duoi co truc pivot rieng, 4 chan co khop (dat canh NPC_01 tren via he tay)
    dog_root = create_box_with_pivot("Animal_Dog_01", (0.24, 0.56, 0.22), (-4.2, -6.0, 0.25), 'BOTTOM_CENTER', mats["DogCoat"], anc, ec, bevel=0.03)
    dog_head = create_box_with_pivot("Animal_Dog_01_Head", (0.22, 0.24, 0.22), (0, 0.30, 0.16), 'BOTTOM_CENTER', mats["DogCoat"], anc, ec, bevel=0.03)
    dog_head.parent = dog_root

    dog_tail = create_box_with_pivot("Animal_Dog_01_Tail", (0.06, 0.24, 0.06), (0, -0.28, 0.22), 'TOP_CENTER', mats["DogCoat"], anc, ec, bevel=0.01)
    dog_tail.parent = dog_root
    dog_tail.rotation_euler = Euler((math.radians(35), 0, 0), "XYZ")

    for leg_name, lx, ly in [("FL", -0.08, 0.20), ("FR", 0.08, 0.20), ("BL", -0.08, -0.20), ("BR", 0.08, -0.20)]:
        d_leg = create_box_with_pivot(f"Animal_Dog_01_Leg_{leg_name}", (0.07, 0.07, 0.18), (lx, ly, 0.0), 'TOP_CENTER', mats["DogCoat"], anc, ec, bevel=0.01)
        d_leg.parent = dog_root


def setup_qa_cameras(cols):
    cam_col = cols["CAMERAS"]
    cam_targets = [
        ("Cam_01_TopDown", (0.0, 0.0, 36.0), (0.0, 0.0, 0.0)),
        ("Cam_02_Facade_Front", (-1.2, 0.0, 2.2), (-7.18, 0.0, 2.6)),
        ("Cam_03_FirstPerson_Sidewalk", (-5.0, -11.0, 1.65), (-5.0, 0.0, 1.65)),
        ("Cam_04_Interior_Cafe", (-13.0, -1.5, 1.65), (-7.5, 0.5, 1.65)),
        ("Cam_05_Sedan_ThreeQuarter", (5.2, -10.5, 2.2), (1.75, -6.0, 0.7)),
        ("Cam_06_Characters_And_Dog", (-2.6, -8.2, 1.4), (-4.5, -6.0, 0.7)),
    ]
    for c_name, c_loc, t_pos in cam_targets:
        c_data = bpy.data.cameras.new(name=c_name)
        c_data.lens = 28.0
        c_obj = bpy.data.objects.new(name=c_name, object_data=c_data)
        c_obj.location = Vector(c_loc)
        # Tinh toan rotation huong thang ve muc tieu bang track quaternion
        dir_vec = Vector(t_pos) - Vector(c_loc)
        if dir_vec.length > 0.001:
            rot_quat = dir_vec.to_track_quat('-Z', 'Y')
            c_obj.rotation_euler = rot_quat.to_euler()
        link_to_collection(c_obj, cam_col)


def setup_lighting(cols):
    lc = cols["LIGHTING"]
    light_data = bpy.data.lights.new(name="Sun_Daylight_Main", type="SUN")
    light_data.energy = 3.5
    light_obj = bpy.data.objects.new(name="Sun_Daylight_Main", object_data=light_data)
    light_obj.location = Vector((12.0, -15.0, 22.0))
    light_obj.rotation_euler = Euler((math.radians(48), math.radians(18), math.radians(32)), "XYZ")
    link_to_collection(light_obj, lc)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(os.path.dirname(OUTPUT_BLEND), exist_ok=True)
    os.makedirs(os.path.dirname(GODOT_GLB), exist_ok=True)
    os.makedirs(os.path.dirname(WWW_GLB), exist_ok=True)

    scene, cols = setup_clean_scene()
    mats = build_pbr_library()

    build_road_and_sidewalk(cols, mats)
    build_vietnamese_shophouse_cafe(cols, mats)
    build_bus_stop_and_street_lights(cols, mats)
    build_park_and_vegetation_clusters(cols, mats)
    build_sample_sedan_with_separated_wheels(cols, mats)
    build_two_articulated_npcs_and_one_dog(cols, mats)
    setup_lighting(cols)
    setup_qa_cameras(cols)

    bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
    print(f"[BLENDER M3.2] Da luu file nguon tai: {OUTPUT_BLEND}")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in cols["EXPORT_COLLECTION"].objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=GODOT_GLB,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
    )

    shutil.copy2(GODOT_GLB, WWW_GLB)
    h_godot = sha256_file(GODOT_GLB)
    h_www = sha256_file(WWW_GLB)
    assert h_godot == h_www, "SHA-256 mismatch giua Godot GLB va WWW GLB!"
    print(f"[EXPORT M3.2] Xuat GLB thanh cong! SHA-256 = {h_godot}")


if __name__ == "__main__":
    main()
