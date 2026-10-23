import bpy
import mathutils

print("=== INSPECTING GRAYBOX CITY BLOCK BLEND ===")
print("Blender version:", bpy.app.version_string)
print("File:", bpy.data.filepath)

print("\n--- Collections ---")
for col in bpy.data.collections:
    print(f"Collection: {col.name} ({len(col.objects)} objects)")

print("\n--- Objects & Bounding Boxes ---")
total_verts = 0
total_faces = 0
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        bbox = [obj.matrix_world @ mathutils.Vector(corner) for corner in obj.bound_box]
        min_x = min(v.x for v in bbox)
        max_x = max(v.x for v in bbox)
        min_y = min(v.y for v in bbox)
        max_y = max(v.y for v in bbox)
        min_z = min(v.z for v in bbox)
        max_z = max(v.z for v in bbox)
        dims = obj.dimensions
        verts = len(obj.data.vertices)
        faces = len(obj.data.polygons)
        total_verts += verts
        total_faces += faces
        mats = [slot.material.name for slot in obj.material_slots if slot.material]
        print(f"Obj: {obj.name:<30} | Size: ({dims.x:.2f}, {dims.y:.2f}, {dims.z:.2f}) | Bounds X:[{min_x:.2f}, {max_x:.2f}] Y:[{min_y:.2f}, {max_y:.2f}] Z:[{min_z:.2f}, {max_z:.2f}] | Mats: {mats}")

print(f"\nTotal Mesh Objects: {len([o for o in bpy.data.objects if o.type == 'MESH'])}")
print(f"Total Vertices: {total_verts}")
print(f"Total Polygons/Faces: {total_faces}")
print(f"Total Materials: {len(bpy.data.materials)}")
for m in bpy.data.materials:
    print(f" - Material: {m.name}")
