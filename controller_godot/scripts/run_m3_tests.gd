extends SceneTree

## Godot 4.7.2 Headless Test Runner for Milestone 3 Vertical Slice
## Tests:
## 1. South Sidewalk 2.0m Clear Corridor Traversal (10m walking)
## 2. Intentional Wall Collision Blocking at Cafe Facade
## 3. Walk-in Cafe Doorway Access (Unobstructed entrance into interior)
## 4. Outdoor Cafe Table Physical Collision
## 5. Overhead Cafe Awning Vertical Clearance (Headroom)
## 6. Bus Shelter Back Glass Panel Collision

func _init() -> void:
	call_deferred("run_tests")

func run_tests() -> void:
	print("\n==================================================================")
	print("GODOT 4.7.2 RUNTIME VERTICAL SLICE (M3) VERIFICATION SUITE")
	print("==================================================================")

	var scene_res := load("res://scenes/vertical_slice_city.tscn") as PackedScene
	if scene_res == null:
		printerr("FAIL: Cannot load res://scenes/vertical_slice_city.tscn")
		quit(1)
		return

	var scene_inst := scene_res.instantiate()
	root.add_child(scene_inst)

	await process_frame
	await physics_frame
	await process_frame
	await physics_frame

	print("\n--- RUNNING PHYSICS COLLISION & CLEARANCE CHECKS ---")
	var player := scene_inst.find_child("VRPlayerPedestrian", true, false) as CharacterBody3D
	if player == null:
		printerr("FAIL: VRPlayerPedestrian not found in scene!")
		quit(1)
		return

	var passed_tests := 0
	var total_tests := 6

	# TEST 1: Sidewalk 2.0m Clear Corridor Traversal (10m walking along +X at Z=4.70m)
	player.global_position = Vector3(-5.0, 0.15, 4.70)
	var test1_motion := Vector3(10.0, 0.0, 0.0)
	var test1_hit := player.test_move(player.global_transform, test1_motion)
	if not test1_hit:
		print("Test [1]: Sidewalk 2.0m Corridor Traversal (10m walking) -> NO OBSTRUCTION (PASS)")
		passed_tests += 1
	else:
		printerr("Test [1]: Sidewalk 2.0m Corridor Traversal -> BLOCKED (FAIL)")

	# TEST 2: Intentional Wall Collision at Cafe Facade (at X=3.5m, walking toward Z=7.05m)
	player.global_position = Vector3(3.5, 0.15, 5.0)
	var test2_motion := Vector3(0.0, 0.0, 2.5)
	var col2 := KinematicCollision3D.new()
	var test2_hit := player.test_move(player.global_transform, test2_motion, col2)
	if test2_hit:
		var hit_col = col2.get_collider()
		print("Test [2]: Intentional Wall Collision -> BLOCKED by ", hit_col.name, " at ", col2.get_position(), " (PASS)")
		passed_tests += 1
	else:
		printerr("Test [2]: Intentional Wall Collision -> WALK-THROUGH BUG (FAIL)")

	# TEST 3: Walk-in Cafe Doorway Access (Doorway at X=-0.5m, walking from Z=5.0m to Z=8.5m into cafe)
	player.global_position = Vector3(-0.5, 0.15, 5.0)
	var test3_motion := Vector3(0.0, 0.0, 3.2) # Passes Z=7.05 doorway into Z=8.2 interior
	var col3 := KinematicCollision3D.new()
	var test3_hit := player.test_move(player.global_transform, test3_motion, col3)
	if not test3_hit:
		print("Test [3]: Walk-in Cafe Doorway Access (Walk into cafe interior) -> UNOBSTRUCTED (PASS)")
		passed_tests += 1
	else:
		printerr("Test [3]: Walk-in Cafe Doorway Access -> BLOCKED by ", col3.get_collider().name, " at ", col3.get_position(), " (FAIL)")

	# TEST 4: Outdoor Cafe Table Physical Collision (Table at X=-1.5m, Z=6.1m)
	player.global_position = Vector3(-1.5, 0.15, 4.70)
	var test4_motion := Vector3(0.0, 0.0, 1.8)
	var col4 := KinematicCollision3D.new()
	var test4_hit := player.test_move(player.global_transform, test4_motion, col4)
	if test4_hit:
		print("Test [4]: Outdoor Cafe Table Collision -> BLOCKED by ", col4.get_collider().name, " at ", col4.get_position(), " (PASS)")
		passed_tests += 1
	else:
		printerr("Test [4]: Outdoor Cafe Table Collision -> TABLE WALK-THROUGH (FAIL)")

	# TEST 5: Overhead Cafe Awning Vertical Clearance (Headroom check under awning at Z=5.8m)
	player.global_position = Vector3(1.0, 0.15, 5.80)
	var test5_motion := Vector3(0.0, 0.50, 0.0) # Upward jump/headroom test (player 1.85m + 0.5m = 2.35m < 2.75m awning)
	var test5_hit := player.test_move(player.global_transform, test5_motion)
	if not test5_hit:
		print("Test [5]: Overhead Awning Clearance (Headroom under awning) -> NO HEAD COLLISION (PASS)")
		passed_tests += 1
	else:
		printerr("Test [5]: Overhead Awning Clearance -> HEAD COLLISION DETECTED (FAIL)")

	# TEST 6: Bus Shelter Back Glass Panel Collision (at North Sidewalk, X=-4.0m, Z=-5.0m moving to Z=-6.5m)
	player.global_position = Vector3(-4.0, 0.15, -5.0)
	var test6_motion := Vector3(0.0, 0.0, -1.8)
	var col6 := KinematicCollision3D.new()
	var test6_hit := player.test_move(player.global_transform, test6_motion, col6)
	if test6_hit:
		print("Test [6]: Bus Shelter Back Panel Collision -> BLOCKED by ", col6.get_collider().name, " at ", col6.get_position(), " (PASS)")
		passed_tests += 1
	else:
		printerr("Test [6]: Bus Shelter Back Panel Collision -> WALK-THROUGH (FAIL)")

	print("\n==================================================================")
	print("FINAL RESULT: ", passed_tests, "/", total_tests, " TESTS PASSED.")
	print("==================================================================")

	if passed_tests == total_tests:
		print(">>> ALL M3 VERTICAL SLICE RUNTIME TESTS COMPLETED SUCCESSFULLY <<<")
		quit(0)
	else:
		printerr(">>> TEST SUITE FAILED WITH ", (total_tests - passed_tests), " FAILURES <<<")
		quit(1)
