import bpy
import mathutils

print("=== INSPECTING VERTICAL SLICE BLEND ===")
print("File:", bpy.data.filepath)
total_verts = 0
total_faces = 0
mesh_objs = []
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        total_verts += len(obj.data.vertices)
        total_faces += len(obj.data.polygons)
        mesh_objs.append(obj.name)

print(f"Total Mesh Objects: {len(mesh_objs)}")
print(f"Total Vertices: {total_verts}")
print(f"Total Faces/Polygons: {total_faces}")
print(f"Total Materials: {len(bpy.data.materials)}")
for m in bpy.data.materials:
    print(f" - Material: {m.name}")
print("\nCollections:")
for c in bpy.data.collections:
    print(f" - Collection '{c.name}': {len(c.objects)} objects")
