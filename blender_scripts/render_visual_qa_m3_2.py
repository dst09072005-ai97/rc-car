# -*- coding: utf-8 -*-
"""
FILE: D:\\XE_RC_FPV_V10\\blender_scripts\\render_visual_qa_m3_2.py
Render 6 góc nhìn QA Visual Review cho Milestone 3.2 bằng Blender Workbench.
"""

import os
import bpy

PROJECT_ROOT = r"D:\XE_RC_FPV_V10"
BLEND_FILE = os.path.join(PROJECT_ROOT, "models", "vertical_slice_city_block.blend")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "docs", "screenshots", "milestone_3_2")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# 6 camera QA đã được định nghĩa trong build_vertical_slice.py
CAMERAS = [
    ("Cam_01_TopDown", "01_top_down_city_slice.png"),
    ("Cam_02_Facade_Front", "02_exterior_front_cafe.png"),
    ("Cam_03_FirstPerson_Sidewalk", "03_first_person_sidewalk.png"),
    ("Cam_04_Interior_Cafe", "04_interior_cafe_looking_out.png"),
    ("Cam_05_Sedan_ThreeQuarter", "05_sedan_three_quarter.png"),
    ("Cam_06_Characters_And_Dog", "06_characters_and_dog.png"),
]

def render_qa_views():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    # Display / Shading settings
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True

    print("[RENDER QA M3.2] Bat dau render 6 goc nhin...")

    rendered_files = []
    for cam_name, file_name in CAMERAS:
        cam_obj = bpy.data.objects.get(cam_name)
        if not cam_obj:
            print(f"[RENDER QA M3.2] CANH BAO: Khong tim thay camera {cam_name}")
            continue

        scene.camera = cam_obj
        out_path = os.path.join(OUTPUT_DIR, file_name)
        scene.render.filepath = out_path
        bpy.ops.render.render(write_still=True)

        if os.path.exists(out_path):
            size = os.path.getsize(out_path)
            rendered_files.append((file_name, size, out_path))
            print(f"[RENDER QA M3.2] Da render: {file_name} ({size} bytes)")
        else:
            print(f"[RENDER QA M3.2] LOI: Khong tao duoc file {file_name}")

    print(f"[RENDER QA M3.2] Hoan thanh {len(rendered_files)}/6 hinh anh QA.")

if __name__ == "__main__":
    render_qa_views()
