# -*- coding: utf-8 -*-
"""
FILE: D:\\XE_RC_FPV_V10\\blender_scripts\\preflight_audit_m2.py
Phase 1 Preflight Audit: Đọc kiểm tra file .blend của Milestone 2 ở chế độ background
mà không ghi đè hay xóa bất kỳ dữ liệu nào. Xuất báo cáo ra docs/MILESTONE_3_PREFLIGHT.md.
"""

import bpy
import os
import hashlib
import datetime
from mathutils import Vector

PROJECT_ROOT = r"D:\XE_RC_FPV_V10"
if not os.path.exists(PROJECT_ROOT):
    PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

FILES_TO_INVENTORY = [
    r"models\calibration_gate.blend",
    r"models\graybox_city_block.blend",
    r"blender_scripts\generate_calibration_and_graybox.py",
    r"controller_godot\models\calibration_gate.glb",
    r"controller_godot\models\graybox_city_block.glb",
    r"www\models\calibration_gate.glb",
    r"www\models\graybox_city_block.glb",
    r"controller_godot\project.godot",
    r"controller_godot\scenes\city_graybox_test.tscn",
    r"controller_godot\scripts\run_graybox_collision_test.gd",
    r"build\android\XE_RC_FPV_V18.apk",
    r"build\android\XE_RC_FPV_V18_mobile.apk",
]


def sha256_of_file(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_blend_file(blend_path):
    if not os.path.exists(blend_path):
        return {"exists": False, "path": blend_path}

    bpy.ops.wm.open_mainfile(filepath=blend_path)
    scene = bpy.context.scene
    unit_settings = scene.unit_settings

    collections = [c.name for c in bpy.data.collections]
    objects_info = []
    total_polys = 0

    for obj in bpy.data.objects:
        bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box] if obj.bound_box else []
        if bbox:
            min_v = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
            max_v = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
            dims = max_v - min_v
        else:
            dims = Vector((0, 0, 0))

        poly_count = len(obj.data.polygons) if (obj.type == "MESH" and obj.data) else 0
        uv_layers = [uv.name for uv in obj.data.uv_layers] if (obj.type == "MESH" and obj.data) else []
        mats = [slot.material.name for slot in obj.material_slots if slot.material]
        total_polys += poly_count

        objects_info.append({
            "name": obj.name,
            "type": obj.type,
            "location": tuple(round(v, 3) for v in obj.location),
            "scale": tuple(round(v, 3) for v in obj.scale),
            "dims": tuple(round(v, 3) for v in dims),
            "polys": poly_count,
            "uvs": uv_layers,
            "materials": mats,
        })

    return {
        "exists": True,
        "path": blend_path,
        "unit_system": unit_settings.system,
        "scale_length": round(unit_settings.scale_length, 4),
        "collections": collections,
        "object_count": len(objects_info),
        "total_polys": total_polys,
        "objects": objects_info,
    }


def main():
    docs_dir = os.path.join(PROJECT_ROOT, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    report_path = os.path.join(docs_dir, "MILESTONE_3_PREFLIGHT.md")

    lines = [
        "# MILESTONE 3 — PREFLIGHT AUDIT REPORT",
        f"- **Timestamp:** {datetime.datetime.now().isoformat()}",
        f"- **Blender Version:** {bpy.app.version_string} (`{bpy.app.binary_path}`)",
        f"- **Project Root:** `{PROJECT_ROOT}`",
        "",
        "## 1. File Inventory & Checksum Verification",
        "| Relative Path | Status | Size (Bytes) | Last Modified | SHA-256 (First 16 chars) |",
        "|---|---|---:|---|---|",
    ]

    for rel in FILES_TO_INVENTORY:
        full_p = os.path.join(PROJECT_ROOT, rel)
        if os.path.exists(full_p):
            st = os.stat(full_p)
            mtime = datetime.datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            h = sha256_of_file(full_p)[:16]
            lines.append(f"| `{rel}` | **FOUND** | {st.st_size} | {mtime} | `{h}...` |")
        else:
            lines.append(f"| `{rel}` | **MISSING_ON_DISK** | 0 | N/A | N/A |")

    lines.append("")
    lines.append("## 2. Blender Source Inspection (`calibration_gate.blend` & `graybox_city_block.blend`)")

    for blend_rel in [r"models\calibration_gate.blend", r"models\graybox_city_block.blend"]:
        b_full = os.path.join(PROJECT_ROOT, blend_rel)
        info = inspect_blend_file(b_full)
        lines.append(f"### File: `{blend_rel}`")
        if not info["exists"]:
            lines.append("- **Status:** `MISSING_ON_DISK` — `build_vertical_slice.py` sẽ tự động dựng từ chuẩn kích thước M2/M3 mà không bị chặn.")
        else:
            lines.append(f"- **Status:** `VERIFIED_READ_ONLY`")
            lines.append(f"- **Unit System:** `{info['unit_system']}` (`scale_length = {info['scale_length']}`)")
            lines.append(f"- **Collections:** `{', '.join(info['collections'])}`")
            lines.append(f"- **Object Count:** {info['object_count']} | **Total Polygons:** {info['total_polys']}")
            lines.append("")
            lines.append("| Object Name | Type | Origin (m) | Scale | Dimensions (X,Y,Z m) | Polys | UVs | Materials |")
            lines.append("|---|---|---|---|---|---:|---|---|")
            for o in info["objects"]:
                lines.append(
                    f"| `{o['name']}` | {o['type']} | {o['location']} | {o['scale']} | {o['dims']} | {o['polys']} | {o['uvs']} | {o['materials']} |"
                )
        lines.append("")

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"[PREFLIGHT] Bao cao da duoc ghi tai: {report_path}")


if __name__ == "__main__":
    main()
