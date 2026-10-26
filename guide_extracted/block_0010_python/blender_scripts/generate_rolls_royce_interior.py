import bpy
import math

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
    # Bên trái: Tăng âm lượng (VOL+), Giảm âm lượng (VOL-), Play/Pause YouTube
    # Bên phải: Đổi chế độ Camera kính chắn gió (CAM), Reset vị trí HUD (HUD), Cruise Control (CRUISE)
    button_configs = [
        ("SW_Btn_VolUp",      -0.135,  0.005, 0.018),
        ("SW_Btn_VolDown",    -0.135, -0.022, 0.018),
        ("SW_Btn_PlayPause",  -0.095, -0.008, 0.018),
        ("SW_Btn_CamMode",     0.095, -0.008, 0.018),
        ("SW_Btn_HudReset",    0.135,  0.005, 0.018),
        ("SW_Btn_Cruise",      0.135, -0.022, 0.018),
    ]

    for btn_name, bx, by, bz in button_configs:
        # Thân nút bấm vật lý
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

