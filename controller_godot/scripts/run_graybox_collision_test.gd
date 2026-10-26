extends SceneTree

func _init() -> void:
	call_deferred("run_tests")

func run_tests() -> void:
	print("\n==================================================================")
	print("GODOT 4.7.2 RUNTIME COLLISION & CORRIDOR VERIFICATION SUITE")
	print("==================================================================")
	
	var scene_res = load("res://scenes/city_graybox_test.tscn") as PackedScene
	if scene_res == null:
		printerr("FAIL: Cannot load res://scenes/city_graybox_test.tscn")
		quit(1)
		return
		
	var scene_inst = scene_res.instantiate()
	root.add_child(scene_inst)
	
	await process_frame
	await physics_frame
	
	print("\n--- RUNNING PHYSICS COLLISION & CLEARANCE CHECKS ---")
	var player = scene_inst.find_child("VRPlayerCharacter", true, false) as CharacterBody3D
	if player == null:
		printerr("FAIL: VRPlayerCharacter not found in scene!")
		quit(1)
		return
		
	var passed_tests = 0
	var total_tests = 3
	
	# TEST 1: Clear pedestrian corridor traversal
	var test1_motion := Vector3(10.0, 0.0, 0.0)
	var test1_hit = player.test_move(player.global_transform, test1_motion)
	if not test1_hit:
		print("Test [1]: Sidewalk 2.0m Corridor Traversal (10m walking) -> NO OBSTRUCTION (PASS)")
		passed_tests += 1
	else:
		printerr("Test [1]: Sidewalk 2.0m Corridor Traversal -> BLOCKED (FAIL)")
		
	# TEST 2: Intentional wall collision test
	var test2_motion := Vector3(0.0, 0.0, 3.0)
	var col_info := KinematicCollision3D.new()
	var test2_hit = player.test_move(player.global_transform, test2_motion, col_info)
	if test2_hit:
		var hit_collider = col_info.get_collider()
		print("Test [2]: Intentional Wall Collision Test -> COLLISION DETECTED with ", hit_collider.name, " (PASS)")
		print("          Collision Point = ", col_info.get_position(), " | Normal = ", col_info.get_normal())
		passed_tests += 1
	else:
		printerr("Test [2]: Intentional Wall Collision Test -> WALL WALK-THROUGH BUG (FAIL)")
		
	# TEST 3: Overhead Awning Clearance Test
	var test3_motion := Vector3(0.0, 0.50, 0.0)
	var test3_hit = player.test_move(player.global_transform, test3_motion)
	if not test3_hit:
		print("Test [3]: Overhead Awning Clearance (0.81m headroom) -> NO HEAD COLLISION (PASS)")
		passed_tests += 1
	else:
		printerr("Test [3]: Overhead Awning Clearance -> HEADROOM BLOCKED (FAIL)")
		
	print("\n==================================================================")
	print("PHYSICS TEST SUMMARY: Passed ", passed_tests, " / ", total_tests, " Collision Tests.")
	print("==================================================================")
	
	scene_inst.queue_free()
	quit(0 if passed_tests == total_tests else 1)
