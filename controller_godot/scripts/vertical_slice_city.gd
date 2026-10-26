extends Node3D

## Autonomous VR City Simulator — Milestone 3 Vertical Slice
## Runtime Scene Controller (Godot 4.7.2 OpenXR / Stylized Realistic Urban Block)
## Features:
## - Full 1:1 Metric City Block (32m x 30m) loaded from vertical_slice_city_block.glb
## - OpenXR First-Person Pedestrian Locomotion (Smooth thumbstick move + snap turn + CharacterBody3D capsule)
## - Accessible Shophouse Cafe interior (walk-in doorway, bar counter, indoor tables)
## - Dynamic Sedan Vehicle with lane traversal & physical wheel rotation
## - 2 Animated Pedestrian NPCs (patrol walk + bus stop idle)
## - 1 Urban Street Dog (tail wag & idle)
## - Comprehensive runtime collision verification suite

@export var vr_move_speed: float = 2.2 # m/s walking speed
@export var vr_turn_angle: float = 45.0 # snap turn degrees
@export var vehicle_speed: float = 6.5 # m/s (~23.4 km/h urban speed)

# XR Nodes
var xr_interface: XRInterface
var xr_active: bool = false
var xr_origin: XROrigin3D
var xr_camera: XRCamera3D
var left_controller: XRController3D
var right_controller: XRController3D

# Player Character Body
var player_body: CharacterBody3D
var player_col_shape: CollisionShape3D

# Dynamic Objects
var visual_world: Node3D
var vehicle_node: Node3D
var vehicle_wheels: Array[Node3D] = []
var npc1_node: Node3D
var npc1_legs: Array[Node3D] = []
var npc2_node: Node3D
var dog_tail: Node3D

# Simulation State
var vehicle_pos_x: float = 2.0
var vehicle_lane_z: float = 1.75 # Eastbound road lane in Godot space (-Y in Blender)
var npc1_pos_x: float = -1.0
var npc1_dir: float = 1.0 # +1 moving east, -1 moving west
var npc1_walk_time: float = 0.0
var dog_anim_time: float = 0.0
var turn_cooldown: float = 0.0

func _ready() -> void:
	print("\n==================================================================")
	print("AUTONOMOUS VR CITY SIMULATOR — MILESTONE 3 VERTICAL SLICE RUNTIME")
	print("==================================================================")

	_setup_world_environment()
	_setup_city_model_and_colliders()
	_setup_xr_and_player()
	_find_dynamic_entity_nodes()

	# If headless or desktop debug, run deferred collision and verification suite
	if DisplayServer.get_name() == "headless" or OS.has_feature("editor"):
		call_deferred("_deferred_runtime_verification")

func _deferred_runtime_verification() -> void:
	await get_tree().physics_frame
	await get_tree().physics_frame
	_run_runtime_verification()

func _setup_world_environment() -> void:
	# 1. World Environment
	var env_node := WorldEnvironment.new()
	env_node.name = "WorldEnv"
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.48, 0.65, 0.85) # Crisp urban daylight sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.58, 0.65)
	env.ambient_light_energy = 0.90
	env_node.environment = env
	add_child(env_node)

	# 2. Key Sun DirectionalLight3D
	var sun := DirectionalLight3D.new()
	sun.name = "SunLight"
	sun.light_color = Color(1.0, 0.98, 0.92)
	sun.light_energy = 1.25
	sun.rotation_degrees = Vector3(-50.0, 35.0, 0.0)
	sun.shadow_enabled = true
	add_child(sun)

func _setup_city_model_and_colliders() -> void:
	# 1. Instantiate Vertical Slice Visual GLB
	var glb_res := load("res://models/vertical_slice_city_block.glb") as PackedScene
	if glb_res:
		visual_world = glb_res.instantiate()
		visual_world.name = "VisualCityBlock"
		add_child(visual_world)
		print("[Scene] Successfully instantiated visual GLB: vertical_slice_city_block.glb")
	else:
		push_error("[Scene] CRITICAL: Cannot load res://models/vertical_slice_city_block.glb")

	# 2. Physical Colliders (StaticBody3D)
	# Note: In GLTF/Godot: Blender Y (South/North) maps to Godot -Z / +Z
	# Blender South (Y: -3.5 to -16.0m) -> Godot +Z (Z: 3.5 to 16.0m)
	# Blender North (Y: +3.5 to +14.0m) -> Godot -Z (Z: -3.5 to -14.0m)
	var static_world := StaticBody3D.new()
	static_world.name = "CityStaticColliders"
	add_child(static_world)

	# A. Ground & Sidewalk Surfaces
	# Road surface (32m x 0.10m x 7.0m, centered at Z=0, Y=-0.05m)
	_add_box_col(static_world, "Col_Road", Vector3(32.0, 0.10, 7.0), Vector3(0, -0.05, 0))
	# South Sidewalk Pavers (32m x 0.15m x 3.3m at Z=5.35m, Y=0.075m)
	_add_box_col(static_world, "Col_South_Sidewalk", Vector3(32.0, 0.15, 3.3), Vector3(0, 0.075, 5.35))
	# North Sidewalk Pavers (32m x 0.15m x 3.3m at Z=-5.35m, Y=0.075m)
	_add_box_col(static_world, "Col_North_Sidewalk", Vector3(32.0, 0.15, 3.3), Vector3(0, 0.075, -5.35))
	# Park Grass Lawn (32m x 0.20m x 7.0m at Z=-10.5m, Y=0.10m)
	_add_box_col(static_world, "Col_Park_Ground", Vector3(32.0, 0.20, 7.0), Vector3(0, 0.10, -10.5))

	# B. Shophouse Cafe Walls (Accessible Ground Floor Interior)
	# West Wall (thickness 0.2m, depth 9.0m, height 3.8m, at X=-3.9m, Z=11.5m, Y=2.05m)
	_add_box_col(static_world, "Col_Cafe_Wall_West", Vector3(0.20, 3.80, 9.0), Vector3(-3.90, 2.05, 11.5))
	# East Wall (thickness 0.2m, depth 9.0m, height 3.8m, at X=5.9m, Z=11.5m, Y=2.05m)
	_add_box_col(static_world, "Col_Cafe_Wall_East", Vector3(0.20, 3.80, 9.0), Vector3(5.90, 2.05, 11.5))
	# Rear Wall (South wall, at Z=15.9m, width 10.0m, height 3.8m)
	_add_box_col(static_world, "Col_Cafe_Wall_Rear", Vector3(10.0, 3.80, 0.20), Vector3(1.0, 2.05, 15.90))

	# Front Façade Pillars & Windows (leaving Door passage open at X in [-1.7, 1.0]):
	# Left Pillar (X=-3.6m, Z=7.05m, width 0.8m)
	_add_box_col(static_world, "Col_Cafe_Pillar_Left", Vector3(0.80, 3.80, 0.30), Vector3(-3.60, 2.05, 7.05))
	# Right Pillar (X=5.6m, Z=7.05m, width 0.8m)
	_add_box_col(static_world, "Col_Cafe_Pillar_Right", Vector3(0.80, 3.80, 0.30), Vector3(5.60, 2.05, 7.05))
	# Right Storefront Glass Window (X=3.125m, Z=7.05m, width 4.15m, height 2.6m)
	_add_box_col(static_world, "Col_Cafe_Window_Right", Vector3(4.15, 2.60, 0.10), Vector3(3.125, 1.45, 7.05))
	# Left Fixed Glass Panel (X=-2.45m, Z=7.05m, width 1.50m)
	_add_box_col(static_world, "Col_Cafe_Window_Left", Vector3(1.50, 2.60, 0.10), Vector3(-2.45, 1.45, 7.05))
	# Entrance Lintel Beam above door (Y: 2.85 to 3.8m)
	_add_box_col(static_world, "Col_Cafe_Door_Lintel", Vector3(8.40, 0.95, 0.30), Vector3(1.0, 3.475, 7.05))

	# Cafe Bar Counter (inside cafe at X=3.6m, Z=9.8m, Y=0.675m)
	_add_box_col(static_world, "Col_Cafe_Bar_Counter", Vector3(3.70, 1.05, 1.00), Vector3(3.60, 0.675, 9.80))

	# C. Adjacent Buildings
	# West Commercial Building (12m x 11.5m x 9m at X=-10.0m, Z=11.5m, Y=5.90m)
	_add_box_col(static_world, "Col_West_Building", Vector3(12.0, 11.5, 9.0), Vector3(-10.0, 5.90, 11.5))
	# East Shophouse 2 (6.5m x 9.5m x 9m at X=12.75m, Z=11.5m, Y=4.90m)
	_add_box_col(static_world, "Col_Shophouse2", Vector3(6.5, 9.5, 9.0), Vector3(12.75, 4.90, 11.5))

	# D. Street Props & Obstacles
	# Outdoor Cafe Tables (Z = 6.1m, radius 0.40m, height 0.75m)
	_add_cylinder_col(static_world, "Col_Outdoor_Table_0", 0.40, 0.75, Vector3(-1.5, 0.525, 6.10))
	_add_cylinder_col(static_world, "Col_Outdoor_Table_1", 0.40, 0.75, Vector3(3.5, 0.525, 6.10))
	# Planter Boxes on North Sidewalk (Z = -5.60m, size 1.5m x 0.30m x 1.5m)
	for tx in [1.0, 6.0, 11.0]:
		_add_box_col(static_world, "Col_Tree_Planter_" + str(tx), Vector3(1.50, 0.30, 1.50), Vector3(tx, 0.30, -5.60))
	# Bus Stop Shelter Glass Back Panel (Z = -6.0m, size 3.5m x 2.1m x 0.1m)
	_add_box_col(static_world, "Col_Bus_Shelter_Back", Vector3(3.50, 2.10, 0.10), Vector3(-4.0, 1.20, -6.0))

func _setup_xr_and_player() -> void:
	# 1. Player CharacterBody3D (Capsule collider: Radius = 0.30m, Height = 1.85m)
	player_body = CharacterBody3D.new()
	player_body.name = "VRPlayerPedestrian"
	# Start on South Sidewalk clear corridor (X = -2.0m, Y = 0.15m, Z = 4.70m)
	player_body.position = Vector3(-2.0, 0.15, 4.70)
	add_child(player_body)

	player_col_shape = CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.30
	capsule.height = 1.85
	player_col_shape.shape = capsule
	player_col_shape.position = Vector3(0, 0.925, 0)
	player_body.add_child(player_col_shape)

	# 2. XROrigin3D & Camera Rig
	xr_origin = XROrigin3D.new()
	xr_origin.name = "XROrigin3D"
	player_body.add_child(xr_origin)

	xr_camera = XRCamera3D.new()
	xr_camera.name = "XRCamera3D"
	xr_camera.position = Vector3(0, 1.68, 0) # Eye level
	xr_origin.add_child(xr_camera)

	# Left Controller (Locomotion)
	left_controller = XRController3D.new()
	left_controller.name = "LeftHandController"
	left_controller.tracker = "left_hand"
	left_controller.pose = "aim"
	xr_origin.add_child(left_controller)

	# Right Controller (Snap Turn)
	right_controller = XRController3D.new()
	right_controller.name = "RightHandController"
	right_controller.tracker = "right_hand"
	right_controller.pose = "aim"
	xr_origin.add_child(right_controller)

	# Check and initialize OpenXR
	xr_interface = XRServer.find_interface("OpenXR")
	if xr_interface and xr_interface.is_initialized():
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
		get_viewport().use_xr = true
		xr_active = true
		print("[XR] OpenXR interface successfully initialized.")
	else:
		print("[XR] OpenXR not active. Operating in desktop / headless simulator mode.")

func _find_dynamic_entity_nodes() -> void:
	if not visual_world:
		return
	# Locate Sedan vehicle nodes
	for child in visual_world.get_children():
		if child.name.begins_with("Vehicle_Sedan"):
			vehicle_node = child
		elif child.name.begins_with("Wheel_"):
			vehicle_wheels.append(child)
		elif child.name.begins_with("NPC_Pedestrian_1"):
			npc1_node = child
			if "Leg" in child.name:
				npc1_legs.append(child)
		elif child.name.begins_with("NPC_Pedestrian_2"):
			npc2_node = child
		elif child.name == "Animal_Dog_Tail":
			dog_tail = child

func _process(delta: float) -> void:
	_update_vehicle_simulation(delta)
	_update_npc_simulation(delta)
	_update_dog_animation(delta)

func _physics_process(delta: float) -> void:
	_process_player_locomotion(delta)

func _process_player_locomotion(delta: float) -> void:
	if not player_body:
		return

	var input_dir := Vector2.ZERO

	# 1. OpenXR Controller Input (Left Thumbstick for Move)
	if xr_active and left_controller:
		var thumb_vec: Vector2 = left_controller.get_vector2("primary")
		if thumb_vec.length() > 0.15:
			input_dir.x = thumb_vec.x
			input_dir.y = -thumb_vec.y # Forward is -Y in 2D stick

	# 2. Desktop Keyboard Fallback (WASD / Arrows)
	if input_dir == Vector2.ZERO:
		if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
			input_dir.y -= 1.0
		if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
			input_dir.y += 1.0
		if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
			input_dir.x -= 1.0
		if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
			input_dir.x += 1.0

	# 3. Snap Turn (Right Controller Thumbstick X or Q/E keys)
	if turn_cooldown > 0.0:
		turn_cooldown = max(0.0, turn_cooldown - delta)
	else:
		var turn_input := 0.0
		if xr_active and right_controller:
			var right_vec: Vector2 = right_controller.get_vector2("primary")
			if abs(right_vec.x) > 0.6:
				turn_input = -sign(right_vec.x)
		if turn_input == 0.0:
			if Input.is_key_pressed(KEY_Q):
				turn_input = 1.0
			elif Input.is_key_pressed(KEY_E):
				turn_input = -1.0

		if turn_input != 0.0:
			player_body.rotate_y(deg_to_rad(turn_input * vr_turn_angle))
			turn_cooldown = 0.35 # Debounce snap turn

	# 4. Apply Velocity with Camera Heading Orientation
	var cam_forward := -xr_camera.global_transform.basis.z
	cam_forward.y = 0.0
	cam_forward = cam_forward.normalized()
	var cam_right := xr_camera.global_transform.basis.x
	cam_right.y = 0.0
	cam_right = cam_right.normalized()

	var move_vec := (cam_right * input_dir.x + cam_forward * (-input_dir.y)).normalized()
	player_body.velocity.x = move_vec.x * vr_move_speed
	player_body.velocity.z = move_vec.z * vr_move_speed

	# Gravity
	if not player_body.is_on_floor():
		player_body.velocity.y -= 9.8 * delta
	else:
		player_body.velocity.y = 0.0

	player_body.move_and_slide()

func _update_vehicle_simulation(delta: float) -> void:
	# Move vehicle along X axis (Eastbound road lane)
	vehicle_pos_x += vehicle_speed * delta
	if vehicle_pos_x > 18.0:
		vehicle_pos_x = -18.0

	# Update visual position of vehicle body and wheels
	var dx := vehicle_speed * delta
	var wheel_radius := 0.32
	var wheel_rot_delta := dx / wheel_radius

	if vehicle_node:
		vehicle_node.position.x = vehicle_pos_x
	for wheel in vehicle_wheels:
		wheel.rotate_x(wheel_rot_delta)

func _update_npc_simulation(delta: float) -> void:
	# NPC 1 patrols along South sidewalk (X between -8.0 and +8.0)
	npc1_pos_x += npc1_dir * 1.2 * delta
	if npc1_pos_x > 8.0:
		npc1_pos_x = 8.0
		npc1_dir = -1.0
	elif npc1_pos_x < -8.0:
		npc1_pos_x = -8.0
		npc1_dir = 1.0

	if npc1_node:
		npc1_node.position.x = npc1_pos_x
	npc1_walk_time += delta * 6.0
	for leg in npc1_legs:
		leg.rotation.x = sin(npc1_walk_time) * 0.35

func _update_dog_animation(delta: float) -> void:
	if dog_tail:
		dog_anim_time += delta * 8.0
		dog_tail.rotation.y = sin(dog_anim_time) * 0.40

# --- HELPER FUNCTIONS FOR COLLIDERS ---
func _add_box_col(parent: StaticBody3D, col_name: String, size: Vector3, pos: Vector3) -> CollisionShape3D:
	var cs := CollisionShape3D.new()
	cs.name = col_name
	var box := BoxShape3D.new()
	box.size = size
	cs.shape = box
	cs.position = pos
	parent.add_child(cs)
	return cs

func _add_cylinder_col(parent: StaticBody3D, col_name: String, radius: float, height: float, pos: Vector3) -> CollisionShape3D:
	var cs := CollisionShape3D.new()
	cs.name = col_name
	var cyl := CylinderShape3D.new()
	cyl.radius = radius
	cyl.height = height
	cs.shape = cyl
	cs.position = pos
	parent.add_child(cs)
	return cs

# ==============================================================================
# AUTOMATED RUNTIME COLLISION & INTEGRATION VERIFICATION SUITE
# ==============================================================================
func _run_runtime_verification() -> void:
	print("\n>>> RUNNING MILESTONE 3 RUNTIME VERIFICATION SUITE <<<")
	var space_state := get_world_3d().direct_space_state
	var pass_count := 0
	var total_tests := 6

	# Test 1: South Sidewalk Corridor Clearance (Walk from X=-10m to X=+10m along Z=4.70m, Y=0.15m)
	var ray_corridor := PhysicsRayQueryParameters3D.create(
		Vector3(-10.0, 1.0, 4.70),
		Vector3(10.0, 1.0, 4.70)
	)
	if player_body:
		ray_corridor.exclude = [player_body.get_rid()]
	var hit_corridor := space_state.intersect_ray(ray_corridor)
	if hit_corridor.is_empty():
		print("  [PASS] Test 1: South Sidewalk Walking Corridor (Z=4.7m) is 100% UNIMPEDED.")
		pass_count += 1
	else:
		print("  [FAIL] Test 1: Obstruction detected on walking corridor at ", hit_corridor.position)

	# Test 2: Cafe Walk-in Entrance Accessibility (Ray from sidewalk Z=5.5m into cafe interior Z=8.5m at doorway X=-0.5m)
	var ray_door := PhysicsRayQueryParameters3D.create(
		Vector3(-0.5, 1.2, 5.5),
		Vector3(-0.5, 1.2, 8.5)
	)
	var hit_door := space_state.intersect_ray(ray_door)
	if hit_door.is_empty():
		print("  [PASS] Test 2: Cafe Entrance Doorway (X=-0.5m, Z=7.05m) is FULLY ACCESSIBLE (Walk-in unobstructed).")
		pass_count += 1
	else:
		print("  [FAIL] Test 2: Doorway blocked at ", hit_door.position)

	# Test 3: Cafe Solid Wall Blocking (Ray into West Pillar at X=-3.6m, Z=6.0m -> Z=8.0m)
	var ray_wall := PhysicsRayQueryParameters3D.create(
		Vector3(-3.6, 1.2, 6.0),
		Vector3(-3.6, 1.2, 8.0)
	)
	var hit_wall := space_state.intersect_ray(ray_wall)
	if not hit_wall.is_empty():
		print("  [PASS] Test 3: Solid Wall Blocking verified at X=%.2f, Z=%.2f." % [hit_wall.position.x, hit_wall.position.z])
		pass_count += 1
	else:
		print("  [FAIL] Test 3: Wall collision failed to trigger!")

	# Test 4: Outdoor Cafe Table Blocking (Ray at X=-1.5m, Z=5.0m -> Z=7.0m)
	var ray_table := PhysicsRayQueryParameters3D.create(
		Vector3(-1.5, 0.6, 5.0),
		Vector3(-1.5, 0.6, 7.0)
	)
	var hit_table := space_state.intersect_ray(ray_table)
	if not hit_table.is_empty():
		print("  [PASS] Test 4: Outdoor Table physical collider active at ", hit_table.position)
		pass_count += 1
	else:
		print("  [FAIL] Test 4: Table collision failed!")

	# Test 5: Ground Elevation Raycast (Downward ray at South Sidewalk)
	var ray_ground := PhysicsRayQueryParameters3D.create(
		Vector3(0.0, 2.0, 4.70),
		Vector3(0.0, -1.0, 4.70)
	)
	var hit_ground := space_state.intersect_ray(ray_ground)
	if not hit_ground.is_empty() and abs(hit_ground.position.y - 0.15) < 0.05:
		print("  [PASS] Test 5: Sidewalk ground elevation verified at Y=%.2fm (Target: 0.15m)." % hit_ground.position.y)
		pass_count += 1
	else:
		print("  [FAIL] Test 5: Sidewalk ground elevation mismatch!")

	# Test 6: Bus Shelter Obstacle Detection (Ray across bus shelter back panel at Z=-6.0m)
	var ray_bus := PhysicsRayQueryParameters3D.create(
		Vector3(-4.0, 1.2, -5.0),
		Vector3(-4.0, 1.2, -7.0)
	)
	var hit_bus := space_state.intersect_ray(ray_bus)
	if not hit_bus.is_empty():
		print("  [PASS] Test 6: Bus Shelter collider detected at ", hit_bus.position)
		pass_count += 1
	else:
		print("  [FAIL] Test 6: Bus shelter collider failed!")

	print("\nVerification Result: %d/%d Tests PASSED." % [pass_count, total_tests])
	if pass_count == total_tests:
		print(">>> ALL VERTICAL SLICE INTEGRATION TESTS PASSED <<<")
