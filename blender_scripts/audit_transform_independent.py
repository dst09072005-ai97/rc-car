# -*- coding: utf-8 -*-
"""
FILE: D:\\XE_RC_FPV_V10\\blender_scripts\\audit_transform_independent.py
Independent transform specification audit against actual Blender world landmarks.
"""

import bpy
from mathutils import Vector

specs = {
    'Veh_Sedan_Body': {
        'parent': None,
        'origin': Vector((1.750, -6.000, 0.320)),
        'dims': Vector((1.820, 4.400, 0.460)),
        'tol': 0.05
    },
    'Veh_Sedan_Wheel_FL': {
        'parent': 'Veh_Sedan_Body',
        'origin': Vector((0.830, -4.620, 0.340)),
        'dims': Vector((0.240, 0.680, 0.680)),
        'tol': 0.05
    },
    'Veh_Sedan_Rim_FL': {
        'parent': 'Veh_Sedan_Wheel_FL',
        'origin': Vector((0.830, -4.620, 0.340)),
        'dims': Vector((0.250, 0.440, 0.440)),
        'tol': 0.05
    },
    'Cafe_Entrance_Door_Hinged': {
        'parent': None,
        'origin': Vector((-7.180, 0.800, 0.150)),
        'tol': 0.05
    },
    'Cafe_Signboard_Text_VI': {
        'parent': None,
        'origin': Vector((-6.780, 0.000, 3.650)),
        'tol': 0.05
    },
    'NPC_01_Commuter': {
        'parent': None,
        'origin': Vector((-4.800, -6.000, 0.150)),
        'tol': 0.05
    },
    'NPC_01_Commuter_Leg_L': {
        'parent': 'NPC_01_Commuter',
        'origin': Vector((-4.910, -6.000, 0.930)),
        'tol': 0.05
    },
    'NPC_01_Commuter_Arm_L': {
        'parent': 'NPC_01_Commuter',
        'origin': Vector((-5.070, -6.000, 1.490)),
        'tol': 0.05
    },
    'Animal_Dog_01': {
        'parent': None,
        'origin': Vector((-4.200, -6.000, 0.250)),
        'dims': Vector((0.240, 0.560, 0.220)),
        'tol': 0.05
    },
    'Animal_Dog_01_Tail': {
        'parent': 'Animal_Dog_01',
        'origin': Vector((-4.200, -6.280, 0.470)),
        'tol': 0.05
    },
    'Animal_Dog_01_Leg_FL': {
        'parent': 'Animal_Dog_01',
        'origin': Vector((-4.280, -5.800, 0.250)),
        'tol': 0.05
    }
}

def run_audit():
    print("=== INDEPENDENT SPECIFICATION AUDIT ===")
    all_pass = True
    for name, req in specs.items():
        obj = bpy.data.objects.get(name)
        if not obj:
            print(f"[FAIL] {name}: MISSING")
            all_pass = False
            continue
        actual_parent = obj.parent.name if obj.parent else None
        actual_origin = obj.matrix_world.translation
        dev = (actual_origin - req['origin']).length
        p_ok = (actual_parent == req['parent'])
        o_ok = dev <= req['tol']
        
        status_p = "OK" if p_ok else "FAIL"
        status_o = "OK" if o_ok else "FAIL"
        
        print(f"{name}: Parent={actual_parent} (Expected={req['parent']}) [{status_p}]")
        print(f"   Origin=({actual_origin.x:.3f}, {actual_origin.y:.3f}, {actual_origin.z:.3f}) Dev={dev:.4f}m [{status_o}]")
        if not (p_ok and o_ok):
            all_pass = False

    print("OVERALL SPEC AUDIT:", "PASS" if all_pass else "FAIL")
    return all_pass

if __name__ == "__main__":
    run_audit()
