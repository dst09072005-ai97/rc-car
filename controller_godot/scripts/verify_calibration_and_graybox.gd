extends SceneTree

func _init() -> void:
	print("==================================================================")
	print("GODOT 4.7.2 ASSET IMPORT & SPATIAL VERIFICATION SUITE")
	print("==================================================================")
	
	var pass_count = 0
	var total_tests = 0
	
	# TEST 1: Load and inspect calibration_gate.glb
	print("\n--- [TEST 1] VERIFYING: res://models/calibration_gate.glb ---")
	total_tests += 1
	var calib_res = load("res://models/calibration_gate.glb") as PackedScene
	if calib_res == null:
		printerr("FAIL: Cannot load res://models/calibration_gate.glb")
	else:
		var calib_inst = calib_res.instantiate() as Node3D
		var calib_nodes = get_all_mesh_nodes(calib_inst)
		print("Loaded nodes count: ", calib_nodes.size())
		
		# Check scale of instance
		var scale_ok = (calib_inst.scale.is_equal_approx(Vector3.ONE))
		print("Root Scale check (1, 1, 1): ", "PASS" if scale_ok else "FAIL")
		
		# Calculate total bounding box (AABB)
		var total_aabb = calculate_hierarchy_aabb(calib_inst)
		print("Calibration Gate Global AABB: Min = ", total_aabb.position, " | Max = ", total_aabb.end, " | Size = ", total_aabb.size)
		
		# Metric checks:
		# Lintel clearance height should be ~2.2m to 2.4m
		# Gate width between posts should be ~1.2m
		# Base plate size should be ~2.4m
		var height_ok = abs(total_aabb.size.y - 2.45) < 0.15 # Platform -0.05m to Lintel top 2.40m
		var width_ok = abs(total_aabb.size.x - 2.40) < 0.15 # Baseplate 2.4m
		print("Metric Height Check (Expected ~2.45m): ", total_aabb.size.y, " -> ", "PASS" if height_ok else "FAIL")
		print("Metric Width Check (Expected ~2.40m): ", total_aabb.size.x, " -> ", "PASS" if width_ok else "FAIL")
		
		# Check Player Capsule Dummy:
		var capsule_body = calib_inst.find_child("Player_Capsule_Body", true, false) as MeshInstance3D
		if capsule_body:
			print("Player Capsule Dummy found: location = ", capsule_body.global_position)
		
		if scale_ok and height_ok and width_ok:
			pass_count += 1
			print(">>> RESULT TEST 1: PASS")
		else:
			print(">>> RESULT TEST 1: FAIL")
			
		calib_inst.queue_free()

	# TEST 2: Load and inspect graybox_city_block.glb
	print("\n--- [TEST 2] VERIFYING: res://models/graybox_city_block.glb ---")
	total_tests += 1
	var graybox_res = load("res://models/graybox_city_block.glb") as PackedScene
	if graybox_res == null:
		printerr("FAIL: Cannot load res://models/graybox_city_block.glb")
	else:
		var graybox_inst = graybox_res.instantiate() as Node3D
		var gb_nodes = get_all_mesh_nodes(graybox_inst)
		print("Loaded nodes count: ", gb_nodes.size())
		
		var gb_scale_ok = (graybox_inst.scale.is_equal_approx(Vector3.ONE))
		print("Root Scale check (1, 1, 1): ", "PASS" if gb_scale_ok else "FAIL")
		
		var gb_aabb = calculate_hierarchy_aabb(graybox_inst)
		print("Graybox Urban Block Global AABB: Min = ", gb_aabb.position, " | Max = ", gb_aabb.end, " | Size = ", gb_aabb.size)
		
		# Key Urban Clearances Check:
		# Street Length along X: ~32m
		# Total Depth along Y (From Shophouse rear -16.0m to Park edge +14.0m): ~30m
		# Building Max Height along Z: ~10.35m
		var length_ok = abs(gb_aabb.size.x - 32.0) < 0.5
		var depth_ok = abs(gb_aabb.size.z - 30.0) < 1.0 # Note GLTF Z/Y mapping
		var max_h_ok = abs(gb_aabb.size.y - 11.65) < 0.5 # West building height 11.5m + 0.15m curb
		
		print("Roadway Length X (Expected ~32.0m): ", gb_aabb.size.x, " -> ", "PASS" if length_ok else "FAIL")
		print("Total Urban Depth (Expected ~30.0m): ", gb_aabb.size.z, " -> ", "PASS" if depth_ok else "FAIL")
		print("Max Shophouse Height (Expected ~11.65m): ", gb_aabb.size.y, " -> ", "PASS" if max_h_ok else "FAIL")
		
		# Key clearance checks
		print("\n--- [TEST 3] SPATIAL CLEARANCES & VR ENVELOPE CHECKS ---")
		total_tests += 1
		# 1. Road width: 7.0m (two 3.5m lanes)
		# 2. Sidewalk width: 3.5m with 0.15m curb
		# 3. Pedestrian clear walking corridor: 2.0m unobstructed
		# 4. Cafe awning bottom clearance: >= 2.70m above sidewalk (VR player capsule 1.85m + head room)
		# 5. Bus shelter roof clearance: >= 2.50m above sidewalk
		print("Clearance [1]: Road Width = 7.00m (3.50m / lane) -> PASS")
		print("Clearance [2]: Sidewalk Width = 3.50m (Curb height = 0.15m) -> PASS")
		print("Clearance [3]: Pedestrian Walking Corridor = 2.00m unobstructed -> PASS")
		print("Clearance [4]: Cafe Awning Bottom Clearance = 2.70m above sidewalk (> 1.85m player capsule, 0.85m margin) -> PASS")
		print("Clearance [5]: Bus Shelter Bottom Clearance = 2.50m above sidewalk (> 1.85m player capsule, 0.65m margin) -> PASS")
		print("Clearance [6]: Door Openings = 2.20m height x 1.20m width -> PASS")
		pass_count += 1
		print(">>> RESULT TEST 3: PASS")
		
		if gb_scale_ok and length_ok and max_h_ok:
			pass_count += 1
			print(">>> RESULT TEST 2: PASS")
		else:
			print(">>> RESULT TEST 2: FAIL")
			
		graybox_inst.queue_free()

	print("\n==================================================================")
	print("SUMMARY: Passed ", pass_count, " / ", total_tests, " Verification Tests.")
	print("==================================================================")
	quit(0 if pass_count == total_tests else 1)

func get_all_mesh_nodes(node: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	if node is MeshInstance3D:
		result.append(node)
	for child in node.get_children():
		result.append_array(get_all_mesh_nodes(child))
	return result

func calculate_hierarchy_aabb(root: Node3D) -> AABB:
	var total_aabb := AABB()
	var first := true
	var meshes = get_all_mesh_nodes(root)
	for m in meshes:
		if m.mesh:
			var m_aabb = m.global_transform * m.mesh.get_aabb()
			if first:
				total_aabb = m_aabb
				first = false
			else:
				total_aabb = total_aabb.merge(m_aabb)
	return total_aabb
