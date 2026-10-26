import bpy
import math
import os
import sys

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

def create_pbr_material(name, hex_color, roughness=0.5, metallic=0.0, clearcoat=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    
    # Chuyển mã Hex sang RGB tuyến tính
    h = hex_color.lstrip('#')
    rgb = tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    rgb_linear = tuple(pow(c, 2.2) for c in rgb)
    
    bsdf.inputs["Base Color"].default_value = (*rgb_linear, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
    return mat

def build_detailed_steering_wheel(mat_nappa, mat_walnut, mat_chrome, mat_piano):
    # Tâm vô lăng đặt tại ghế lái: X = -0.42m, Y = 0.25m, Z = 0.68m
    sw_loc = (-0.42, 0.25, 0.68)
    bpy.ops.object.empty_add(type='ARROWS', location=sw_loc)
    sw_pivot = bpy.context.active_object
    sw_pivot.name = "SteeringWheel_Pivot"
    # Nghiêng 23 độ so với phương thẳng đứng
    sw_pivot.rotation_euler = (math.radians(67), 0, 0)

    # 1. Vành vô lăng bọc da Nappa (Đường kính 380mm, dày 36mm)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.19, minor_radius=0.018,
        major_segments=64, minor_segments=24, location=(0, 0, 0)
    )
    sw_rim = bpy.context.active_object
    sw_rim.name = "SteeringWheel_Rim"
    sw_rim.parent = sw_pivot
    sw_rim.data.materials.append(mat_nappa)

    # 2. Bầu trung tâm & Nút Còi Vật Lý (Center Horn Button)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.068, depth=0.036, location=(0, 0, 0))
    sw_hub = bpy.context.active_object
    sw_hub.name = "SteeringWheel_Hub"
    sw_hub.parent = sw_pivot
    sw_hub.data.materials.append(mat_nappa)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.048, depth=0.012, location=(0, 0, 0.02))
    btn_horn = bpy.context.active_object
    btn_horn.name = "SW_Btn_Horn_Center"
    btn_horn.parent = sw_pivot
    btn_horn.data.materials.append(mat_piano)
    btn_horn["interactive_type"] = "push_button"
    btn_horn["travel_distance_m"] = 0.002 # Hành trình nhấn 2mm

    # 2b. Biểu tượng Rolls-Royce chính giữa còi theo ảnh wheel_car.png
    texture_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "wheel_car.png"))
    mat_badge = create_pbr_material("RR_Emblem_Mat", "#EFEFEF", roughness=0.15, metallic=0.7)
    if os.path.exists(texture_path):
        try:
            mat_badge.use_nodes = True
            nodes = mat_badge.node_tree.nodes
            links = mat_badge.node_tree.links
            bsdf = nodes.get("Principled BSDF")
            tex_node = nodes.new(type="ShaderNodeTexImage")
            tex_node.image = bpy.data.images.load(texture_path)
            links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
            if "Alpha" in tex_node.outputs and "Alpha" in bsdf.inputs:
                links.new(tex_node.outputs["Alpha"], bsdf.inputs["Alpha"])
                mat_badge.blend_method = 'BLEND'
        except Exception as e:
            print(f"Warning loading wheel_car.png into Blender: {e}")

    bpy.ops.mesh.primitive_cylinder_add(radius=0.032, depth=0.004, location=(0, 0, 0.028))
    badge = bpy.context.active_object
    badge.name = "SW_Badge_Center"
    badge.parent = sw_pivot
    badge.data.materials.append(mat_badge)

    # 3. Hai chấu ngang (Spokes) & Khung Ốp Nhựa Đen Bóng (Piano Black)
    for side, x_dir in [("Left", -1), ("Right", 1)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_dir * 0.115, -0.01, 0.005))
        spoke = bpy.context.active_object
        spoke.name = f"SW_Spoke_{side}"
        spoke.scale = (0.095, 0.048, 0.022)
        spoke.parent = sw_pivot
        spoke.data.materials.append(mat_piano)

    # Chấu dưới ốp gỗ Óc chó (Burl Walnut)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.115, 0.0))
    spoke_bottom = bpy.context.active_object
    spoke_bottom.name = "SW_Spoke_Bottom_Walnut"
    spoke_bottom.scale = (0.042, 0.095, 0.020)
    spoke_bottom.parent = sw_pivot
    spoke_bottom.data.materials.append(mat_walnut)

    # 4. CỤM NÚT BẤM VẬT LÝ TRÊN VÔ LĂNG (6 Nút chức năng có Collider 2mm)
    button_configs = [
        ("SW_Btn_VolUp",      -0.135,  0.005, 0.018),
        ("SW_Btn_VolDown",    -0.135, -0.022, 0.018),
        ("SW_Btn_PlayPause",  -0.095, -0.008, 0.018),
        ("SW_Btn_CamMode",     0.095, -0.008, 0.018),
        ("SW_Btn_HudReset",    0.135,  0.005, 0.018),
        ("SW_Btn_Cruise",      0.135, -0.022, 0.018),
    ]

    for btn_name, bx, by, bz in button_configs:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz))
        btn = bpy.context.active_object
        btn.name = btn_name
        btn.scale = (0.026, 0.018, 0.008)
        btn.parent = sw_pivot
        btn.data.materials.append(mat_chrome)
        btn["interactive_type"] = "push_button"
        btn["collider_thickness_m"] = 0.002

    # 5. LẪY CHUYỂN SỐ PHÍA SAU VÔ LĂNG (Paddle Shifters - / +)
    for p_name, x_pos in [("SW_Paddle_Minus_Left", -0.125), ("SW_Paddle_Plus_Right", 0.125)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_pos, 0.035, -0.032))
        paddle = bpy.context.active_object
        paddle.name = p_name
        paddle.scale = (0.028, 0.085, 0.006)
        paddle.parent = sw_pivot
        paddle.data.materials.append(mat_chrome)
        paddle["interactive_type"] = "paddle_shifter"

    return sw_pivot

def build_rolls_royce_cabin():
    clear_scene()
    
    # 1. Khởi tạo Vật liệu PBR chuẩn thông số
    mat_nappa = create_pbr_material("Nappa_Leather_Cream", "#DFD1BE", roughness=0.45)
    mat_walnut = create_pbr_material("Burl_Walnut_Wood", "#3A2314", roughness=0.08, clearcoat=1.0)
    mat_chrome = create_pbr_material("Chrome_Trim", "#E8E8E8", roughness=0.1, metallic=1.0)
    mat_piano = create_pbr_material("Piano_Black", "#0F0F0F", roughness=0.05)
    mat_carpet = create_pbr_material("Dark_Carpet", "#1A1A1D", roughness=0.85)

    # 2. Sàn xe & Khung Cabin (2.6m x 1.95m x 1.35m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.02))
    floor = bpy.context.active_object
    floor.name = "Cabin_Floor"
    floor.scale = (1.95, 2.60, 0.04)
    floor.data.materials.append(mat_carpet)

    # Bệ trung tâm (Center Console: Rộng 280mm, Cao 450mm)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.05, 0.225))
    console = bpy.context.active_object
    console.name = "Center_Console"
    console.scale = (0.28, 1.30, 0.45)
    console.data.materials.append(mat_nappa)

    # Ốp gỗ mặt trên Center Console
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.20, 0.46))
    console_wood = bpy.context.active_object
    console_wood.name = "Center_Console_Wood"
    console_wood.scale = (0.24, 0.55, 0.02)
    console_wood.data.materials.append(mat_walnut)

    # 3. Bảng Táp-lô (Dashboard)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.65, 0.68))
    dash = bpy.context.active_object
    dash.name = "Dashboard_Main"
    dash.scale = (1.90, 0.42, 0.32)
    dash.data.materials.append(mat_nappa)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.45, 0.68))
    dash_wood = bpy.context.active_object
    dash_wood.name = "Dashboard_Walnut_Trim"
    dash_wood.scale = (1.86, 0.04, 0.16)
    dash_wood.data.materials.append(mat_walnut)

    # 4. Vô lăng chuẩn tỷ lệ (chi tiết có nút bấm & lẫy số theo wheel_car.png)
    build_detailed_steering_wheel(mat_nappa, mat_walnut, mat_chrome, mat_piano)

    # 5. Ghế Tài & Ghế Phụ
    for side, x_pos in [("Driver", -0.41), ("Passenger", 0.41)]:
        # Đệm ngồi
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_pos, -0.20, 0.32))
        seat_base = bpy.context.active_object
        seat_base.name = f"Seat_{side}_Base"
        seat_base.scale = (0.56, 0.53, 0.14)
        seat_base.data.materials.append(mat_nappa)
        
        # Lưng ghế
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_pos, -0.45, 0.72))
        seat_back = bpy.context.active_object
        seat_back.name = f"Seat_{side}_Back"
        seat_back.scale = (0.54, 0.12, 0.78)
        seat_back.rotation_euler = (math.radians(-12), 0, 0)
        seat_back.data.materials.append(mat_nappa)

    # 6. Cụm 3 Bàn đạp (60mm x 110mm)
    pedal_names = [("Clutch", -0.54), ("Brake", -0.42), ("Throttle", -0.30)]
    for p_name, px in pedal_names:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, 0.52, 0.12))
        pedal = bpy.context.active_object
        pedal.name = f"Pedal_{p_name}"
        pedal.scale = (0.06, 0.02, 0.11)
        pedal.rotation_euler = (math.radians(-25), 0, 0)
        pedal.data.materials.append(mat_chrome)

    # 7. Các Màn hình trong khoang lái
    # Màn hình sau vô lăng (310mm x 130mm)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(-0.42, 0.42, 0.73))
    scr_front = bpy.context.active_object
    scr_front.name = "Screen_FrontCluster"
    scr_front.scale = (0.31, 0.13, 1.0)
    scr_front.rotation_euler = (math.radians(80), 0, 0)
    scr_front.data.materials.append(mat_piano)

    # Màn hình giải trí trung tâm (350mm x 180mm)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.0, 0.42, 0.73))
    scr_yt = bpy.context.active_object
    scr_yt.name = "Screen_YouTubeCenter"
    scr_yt.scale = (0.35, 0.18, 1.0)
    scr_yt.rotation_euler = (math.radians(80), 0, 0)
    scr_yt.data.materials.append(mat_piano)

    # Màn hình phụ bên phải - Camera lùi (260mm x 110mm)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.42, 0.42, 0.73))
    scr_rear = bpy.context.active_object
    scr_rear.name = "Screen_RearCamera"
    scr_rear.scale = (0.26, 0.11, 1.0)
    scr_rear.rotation_euler = (math.radians(80), 0, 0)
    scr_rear.data.materials.append(mat_piano)

    print("Hoàn tất dựng nội thất Rolls-Royce tỷ lệ 1:1!")

if __name__ == "__main__":
    build_rolls_royce_cabin()
    out_dir = os.path.join(os.path.dirname(__file__), "..", "www", "models")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "rolls_royce_cabin.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB')
    print(f"Exported successfully to {out_path}")
