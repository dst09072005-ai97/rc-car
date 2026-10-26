import bpy
import math

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

    # 4. Vô lăng chuẩn tỷ lệ (Đường kính 380mm, dày 36mm, nghiêng 23 độ)
    # Tâm vô lăng tại ghế trái X = -0.42m, Y = 0.25m, Z = 0.68m
    sw_loc = (-0.42, 0.25, 0.68)
    bpy.ops.object.empty_add(type='ARROWS', location=sw_loc)
    sw_pivot = bpy.context.active_object
    sw_pivot.name = "SteeringWheel_Pivot"
    sw_pivot.rotation_euler = (math.radians(67), 0, 0) # Nghiêng 23 độ so với phương đứng

    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.19,
        minor_radius=0.018,
        major_segments=48,
        minor_segments=16,
        location=(0, 0, 0)
    )
    sw_rim = bpy.context.active_object
    sw_rim.name = "SteeringWheel_Rim"
    sw_rim.parent = sw_pivot
    sw_rim.data.materials.append(mat_nappa)

    # Tâm còi & Chấu vô lăng
    bpy.ops.mesh.primitive_cylinder_add(radius=0.065, depth=0.04, location=(0, 0, 0))
    sw_hub = bpy.context.active_object
    sw_hub.name = "SteeringWheel_Hub"
    sw_hub.parent = sw_pivot
    sw_hub.data.materials.append(mat_piano)

    # 5. Ghế Tài & Ghế Phụ (Rộng 560mm, Sâu 530mm, Lưng cao 780mm, Khoảng cách tâm 820mm)
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
    # Xuất tự động ra file GLB chuẩn cho Meta Quest 3
    bpy.ops.export_scene.gltf(filepath="rolls_royce_cabin.glb", export_format='GLB')

