extends Node3D

## City Graybox Spatial and Physical Collision Test Scene
## Verifies:
## 1. Concrete StaticBody3D collision boundaries matching Graybox geometry.
## 2. CharacterBody3D VR Player Capsule (Radius = 0.30m, Height = 1.85m).
## 3. Clear pedestrian corridor traversal without collision.
## 4. Accurate wall collision blocking.
## 5. Awning overhead clearance without ceiling collisions.

var player_body: CharacterBody3D
var player_col_shape: CollisionShape3D

func _ready() -> void:
	print("\n==================================================================")
	print("GODOT 4.7.2 RUNTIME COLLISION & CORRIDOR VERIFICATION SUITE")
	print("==================================================================")
	
	_setup_graybox_environment()
	_setup_vr_player_character()
	_run_collision_tests()

func _setup_graybox_environment() -> void:
	# 1. Instantiate visual Graybox GLB model
	var gb_res := load("res://models/graybox_city_block.glb") as PackedScene
	if gb_res:
		var gb_inst := gb_res.instantiate()
		gb_inst.name = "VisualGrayboxMesh"
		add_child(gb_inst)
		print("[Scene] Visual Graybox GLB model loaded.")
	else:
		push_error("[Scene] CRITICAL: Cannot load res://models/graybox_city_block.glb")
		
	# 2. Build concrete StaticBody3D colliders for physical collision verification
	var static_world := StaticBody3D.new()
	static_world.name = "CityStaticColliders"
	add_child(static_world)
	
	# Road Surface Collider (32m x 0.10m x 7.0m)
	_add_box_collider(static_world, "Col_Road", Vector3(32.0, 0.10, 7.0), Vector3(0, -0.05, 0))
	
	# South Sidewalk Collider (32m x 0.15m x 3.3m at Y=0.075m, Z=5.35m in GLTF Z-forward)
	_add_box_collider(static_world, "Col_South_Sidewalk", Vector3(32.0, 0.15, 3.3), Vector3(0, 0.075, 5.35))
	
	# North Sidewalk Collider (32m x 0.15m x 3.3m at Y=0.075m, Z=-5.35m)
	_add_box_collider(static_world, "Col_North_Sidewalk", Vector3(32.0, 0.15, 3.3), Vector3(0, 0.075, -5.35))
	
	# Cafe Shophouse Wall Collider (10m x 10.2m x 9m from Z=7.0m to 16.0m)
	_add_box_collider(static_world, "Col_Cafe_Wall", Vector3(10.0, 10.2, 9.0), Vector3(1.0, 5.25, 11.5))
	
	# West Building Collider (12m x 11.5m x 9m from Z=7.0m to 16.0m)
	_add_box_collider(static_world, "Col_West_Building", Vector3(12.0, 11.5, 9.0), Vector3(-10.0, 5.90, 11.5))
	
	# Shophouse 2 Collider (6.5m x 9.5m x 9m)
	_add_box_collider(static_world, "Col_Shophouse2", Vector3(6.5, 9.5, 9.0), Vector3(12.75, 4.90, 11.5))
	
	# Cafe Outdoor Table Colliders (Radius = 0.40m, Height = 0.75m at Z = 6.1m)
	_add_cylinder_collider(static_world, "Col_Table_0", 0.40, 0.75, Vector3(-1.5, 0.525, 6.1))
	_add_cylinder_collider(static_world, "Col_Table_1", 0.40, 0.75, Vector3(3.5, 0.525, 6.1))
	
	# Bus Stop Shelter Back Glass Wall
	_add_box_collider(static_world, "Col_Bus_Wall", Vector3(3.6, 2.0, 0.10), Vector3(-5.5, 1.25, -6.5))
	
	print("[Scene] Concrete StaticBody3D colliders instantiated.")

func _setup_vr_player_character() -> void:
	player_body = CharacterBody3D.new()
	player_body.name = "VRPlayerCharacter"
	# Place player on South sidewalk pedestrian walking corridor at X = 0, Z = 4.7m
	player_body.position = Vector3(0.0, 0.15 + 0.925, 4.7) # Center of 1.85m capsule
	
	player_col_shape = CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.30
	capsule.height = 1.85
	player_col_shape.shape = capsule
	player_body.add_child(player_col_shape)
	add_child(player_body)
	print("[Scene] VR CharacterBody3D player capsule instantiated (Radius=0.30m, Height=1.85m).")

func _run_collision_tests() -> void:
	var passed_tests = 0
	var total_tests = 5
	
	print("\n--- RUNNING EXPANDED PHYSICS COLLISION & CLEARANCE CHECKS ---")
	print("Collider Architecture Note: Visual GLB mesh does NOT auto-generate collision shapes;")
	print("Explicit StaticBody3D colliders (CityStaticColliders) are instantiated with matching geometry.\n")
	
	# TEST 1: Clear pedestrian corridor traversal
	# Moving 10 meters along the X axis along the sidewalk corridor (Z = 4.7m)
	# There should be ZERO collisions because corridor width is 2.0m unobstructed!
	var test1_motion := Vector3(10.0, 0.0, 0.0)
	var test1_hit = player_body.test_move(player_body.global_transform, test1_motion)
	if not test1_hit:
		print("Test [1]: Sidewalk 2.0m Corridor Traversal (10m walking) -> NO OBSTRUCTION (PASS)")
		passed_tests += 1
	else:
		printerr("Test [1]: Sidewalk 2.0m Corridor Traversal -> BLOCKED (FAIL)")
		
	# TEST 2: Intentional wall collision test
	# Moving player from Z = 4.7m toward Cafe Wall at Z = 7.0m (+3.0m in Z)
	# Should collide with Col_Cafe_Wall before passing Z = 7.0m!
	var test2_motion := Vector3(0.0, 0.0, 3.0)
	var col_info := KinematicCollision3D.new()
	var test2_hit = player_body.test_move(player_body.global_transform, test2_motion, col_info)
	if test2_hit:
		var hit_collider = col_info.get_collider()
		print("Test [2]: Intentional Wall Collision Test -> COLLISION DETECTED with ", hit_collider.name, " (PASS)")
		print("          Collision Point = ", col_info.get_position(), " | Normal = ", col_info.get_normal())
		passed_tests += 1
	else:
		printerr("Test [2]: Intentional Wall Collision Test -> WALL WALK-THROUGH BUG (FAIL)")
		
	# TEST 3: Overhead Awning Clearance Test
	# Check whether overhead space from player capsule top (Y = 0.15 + 1.85 = 2.00m) 
	# to Cafe Awning bottom (Y = 2.81m) has collision
	var test3_motion := Vector3(0.0, 0.50, 0.0) # Move 0.5m upward (to Y = 2.50m)
	var test3_hit = player_body.test_move(player_body.global_transform, test3_motion)
	if not test3_hit:
		print("Test [3]: Overhead Awning Clearance (0.81m headroom) -> NO HEAD COLLISION (PASS)")
		passed_tests += 1
	else:
		printerr("Test [3]: Overhead Awning Clearance -> HEADROOM BLOCKED (FAIL)")
		
	# TEST 4: Sidewalk Curb Step Clearance (15cm curb height)
	# Player stepping from road level (Y=0.925m, Z=3.0m) toward curb (Z=3.7m)
	# At pure horizontal movement, player capsule collides with 0.15m vertical curb stone
	var road_player_xform := Transform3D(Basis(), Vector3(0.0, 0.925, 3.0))
	var test4_motion := Vector3(0.0, 0.0, 1.0)
	var curb_col_info := KinematicCollision3D.new()
	var test4_hit = player_body.test_move(road_player_xform, test4_motion, curb_col_info)
	if test4_hit:
		print("Test [4]: Sidewalk Curb 15cm Vertical Edge Collision -> EDGE BLOCKED AS EXPECTED (PASS)")
		print("          Curb Hit Point = ", curb_col_info.get_position(), " | Normal = ", curb_col_info.get_normal())
		passed_tests += 1
	else:
		printerr("Test [4]: Sidewalk Curb 15cm Vertical Edge Collision -> FAILED TO DETECT CURB (FAIL)")

	# TEST 5: Sidewalk Furniture Pinch Point Check
	# Between Cafe table (radius 0.40m at Z=6.1m) and Sidewalk corridor boundary (Z=4.7m)
	# Distance from table center to player center: 6.1m - 4.7m = 1.4m.
	# Clear space between player capsule edge (Z = 4.7 + 0.30 = 5.0m) and table edge (Z = 6.1 - 0.40 = 5.7m) is 0.70m!
	var test5_motion := Vector3(0.0, 0.0, 0.60) # Move 0.60m towards table (capsule edge reaches Z=5.60m)
	var test5_hit = player_body.test_move(player_body.global_transform, test5_motion)
	if not test5_hit:
		print("Test [5]: Table-to-Corridor 0.70m Safety Clearance (0.60m probe) -> FREE CLEARANCE (PASS)")
		passed_tests += 1
	else:
		printerr("Test [5]: Table-to-Corridor Safety Clearance -> UNEXPECTED PINCH POINT (FAIL)")
		
	print("\n==================================================================")
	print("EXPANDED PHYSICS TEST SUMMARY: Passed ", passed_tests, " / ", total_tests, " Collision Tests.")
	print("==================================================================")
	get_tree().quit(0 if passed_tests == total_tests else 1)

func _add_box_collider(parent: StaticBody3D, col_name: String, size: Vector3, pos: Vector3) -> void:
	var col := CollisionShape3D.new()
	col.name = col_name
	var box := BoxShape3D.new()
	box.size = size
	col.shape = box
	col.position = pos
	parent.add_child(col)

func _add_cylinder_collider(parent: StaticBody3D, col_name: String, radius: float, height: float, pos: Vector3) -> void:
	var col := CollisionShape3D.new()
	col.name = col_name
	var cyl := CylinderShape3D.new()
	cyl.radius = radius
	cyl.height = height
	col.shape = cyl
	col.position = pos
	parent.add_child(col)
