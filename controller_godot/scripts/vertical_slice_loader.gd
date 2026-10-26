# FILE: D:\XE_RC_FPV_V10\controller_godot\scripts\vertical_slice_loader.gd
extends Node3D

## Autonomous VR City Simulator — Milestone 3.3
## OpenXR Immersive Runtime Bootstrap & Vertical Slice Controller
## Target: Meta Quest 3 Standalone / Godot 4.7.2 OpenXR

const GLB_PATH := "res://models/vertical_slice_city_block.glb"

@export var vr_move_speed: float = 2.2 # m/s walking speed
@export var vr_turn_angle: float = 45.0 # snap turn degrees

# XR Architecture State
var xr_interface: XRInterface = null
var xr_active: bool = false
var turn_cooldown: float = 0.0

# Player & XR Rig Nodes
var player_body: CharacterBody3D = null
var xr_origin: XROrigin3D = null
var xr_camera: XRCamera3D = null
var left_controller: XRController3D = null
var right_controller: XRController3D = null

# World & Dynamic Entities
var city_instance: Node3D = null
var sedan_body: Node3D = null
var sedan_wheels: Array[Node3D] = []
var npc_01: Node3D = null
var npc_02: Node3D = null
var dog_01: Node3D = null

var sedan_dir: float = -1.0
var sedan_speed: float = 4.5
var npc1_dir: float = -1.0
var npc2_dir: float = 1.0
var npc_speed: float = 1.45
var dog_angle: float = 0.0

func _ready() -> void:
	print("\n==================================================================")
	print("XR_BOOTSTRAP: START — Autonomous VR City Milestone 3.3")
	print("==================================================================")
	
	_bootstrap_openxr()
	_verify_and_bind_xr_rig()
	_load_world_model()
	
	print("XR_BOOTSTRAP: RUNTIME_READY (xr_active=", xr_active, ", viewport_use_xr=", get_viewport().use_xr, ")")
	print("==================================================================\n")

func _bootstrap_openxr() -> void:
	xr_interface = XRServer.find_interface("OpenXR")
	if xr_interface:
		print("XR_BOOTSTRAP: XR_INTERFACE_FOUND: OpenXR")
		
		# Check if engine already auto-initialized OpenXR during boot
		if xr_interface.is_initialized():
			print("XR_BOOTSTRAP: OPENXR_ALREADY_INITIALIZED_BY_ENGINE")
		else:
			print("XR_BOOTSTRAP: INITIALIZING_OPENXR_EXPLICITLY...")
			var init_result: bool = xr_interface.initialize()
			print("XR_BOOTSTRAP: INITIALIZE_RESULT: ", init_result)
		
		if xr_interface.is_initialized():
			print("XR_BOOTSTRAP: OPENXR_INITIALIZED")
			DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
			get_viewport().use_xr = true
			xr_active = true
			print("XR_BOOTSTRAP: VIEWPORT_USE_XR_ENABLED: ", get_viewport().use_xr)
		else:
			if OS.get_name() == "Android":
				push_error("XR_BOOTSTRAP: OPENXR_INITIALIZATION_FAILED: is_initialized() is false on Android/Quest")
				print("XR_BOOTSTRAP: FATAL_XR_NOT_AVAILABLE")
			else:
				print("XR_BOOTSTRAP: DESKTOP_PREVIEW_MODE (OpenXR not initialized on desktop/headless host)")
	else:
		if OS.get_name() == "Android":
			push_error("XR_BOOTSTRAP: OPENXR_INITIALIZATION_FAILED: OpenXR interface not found on Android")
			print("XR_BOOTSTRAP: FATAL_XR_NOT_AVAILABLE")
		else:
			print("XR_BOOTSTRAP: DESKTOP_PREVIEW_MODE (No OpenXR interface on desktop/headless host)")

func _verify_and_bind_xr_rig() -> void:
	player_body = get_node_or_null("PlayerBody") as CharacterBody3D
	xr_origin = get_node_or_null("PlayerBody/XROrigin3D") as XROrigin3D
	xr_camera = get_node_or_null("PlayerBody/XROrigin3D/XRCamera3D") as XRCamera3D
	left_controller = get_node_or_null("PlayerBody/XROrigin3D/LeftHandController") as XRController3D
	right_controller = get_node_or_null("PlayerBody/XROrigin3D/RightHandController") as XRController3D
	
	if xr_camera and xr_origin and player_body:
		print("XR_BOOTSTRAP: CAMERA_RIG_VERIFIED: ", xr_camera.get_path())
	else:
		push_warning("XR_BOOTSTRAP: WARNING_INCOMPLETE_CAMERA_RIG: player_body=", player_body != null, " xr_origin=", xr_origin != null, " xr_camera=", xr_camera != null)

func _load_world_model() -> void:
	print("XR_BOOTSTRAP: LOADING_WORLD_MODEL: ", GLB_PATH)
	if ResourceLoader.exists(GLB_PATH):
		var packed: PackedScene = load(GLB_PATH)
		if packed:
			city_instance = packed.instantiate()
			city_instance.name = "VerticalSliceModelRoot"
			add_child(city_instance)
			_bind_dynamic_entities()
			print("XR_BOOTSTRAP: WORLD_LOADED: ", GLB_PATH)
		else:
			push_error("XR_BOOTSTRAP: FAILED_TO_INSTANTIATE_GLB: " + GLB_PATH)
	else:
		push_warning("XR_BOOTSTRAP: GLB_FILE_NOT_FOUND: " + GLB_PATH)

func _bind_dynamic_entities() -> void:
	if not city_instance:
		return
	sedan_body = city_instance.find_child("Veh_Sedan_Body", true, false) as Node3D
	if sedan_body:
		for w_name in ["Veh_Sedan_Wheel_FL", "Veh_Sedan_Wheel_FR", "Veh_Sedan_Wheel_RL", "Veh_Sedan_Wheel_RR"]:
			var w := sedan_body.find_child(w_name, true, false) as Node3D
			if w:
				sedan_wheels.append(w)

	npc_01 = city_instance.find_child("NPC_01_Commuter", true, false) as Node3D
	npc_02 = city_instance.find_child("NPC_02_Visitor", true, false) as Node3D
	dog_01 = city_instance.find_child("Animal_Dog_01", true, false) as Node3D

func _physics_process(delta: float) -> void:
	_process_player_locomotion(delta)
	_process_world_simulation(delta)

func _process_player_locomotion(delta: float) -> void:
	if not player_body:
		return

	var input_dir := Vector2.ZERO

	# 1. XR Controller Input (Left Thumbstick)
	if xr_active and left_controller:
		var thumb_vec: Vector2 = left_controller.get_vector2("primary")
		if thumb_vec.length() > 0.15:
			input_dir.x = thumb_vec.x
			input_dir.y = -thumb_vec.y

	# 2. Desktop Fallback (WASD / Arrow Keys)
	if input_dir == Vector2.ZERO:
		if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
			input_dir.y -= 1.0
		if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
			input_dir.y += 1.0
		if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
			input_dir.x -= 1.0
		if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
			input_dir.x += 1.0

	# 3. Snap Turn (Right Controller Thumbstick X or Q/E)
	if turn_cooldown > 0.0:
		turn_cooldown = max(0.0, turn_cooldown - delta)
	else:
		var turn_input := 0.0
		if xr_active and right_controller:
			var right_vec: Vector2 = right_controller.get_vector2("primary")
			if abs(right_vec.x) > 0.5:
				turn_input = -sign(right_vec.x)
		if turn_input == 0.0:
			if Input.is_key_pressed(KEY_Q):
				turn_input = 1.0
			elif Input.is_key_pressed(KEY_E):
				turn_input = -1.0

		if turn_input != 0.0:
			player_body.rotate_y(deg_to_rad(turn_input * vr_turn_angle))
			turn_cooldown = 0.35

	# 4. Movement relative to Camera Heading (projected on horizontal XZ plane)
	var cam_forward := -player_body.global_transform.basis.z
	var cam_right := player_body.global_transform.basis.x
	if xr_camera:
		var f := -xr_camera.global_transform.basis.z
		f.y = 0.0
		if f.length_squared() > 0.001:
			cam_forward = f.normalized()

		var r := xr_camera.global_transform.basis.x
		r.y = 0.0
		if r.length_squared() > 0.001:
			cam_right = r.normalized()

	var move_vec := (cam_right * input_dir.x + cam_forward * (-input_dir.y))
	if move_vec.length() > 1.0:
		move_vec = move_vec.normalized()

	player_body.velocity.x = move_vec.x * vr_move_speed
	player_body.velocity.z = move_vec.z * vr_move_speed

	# Gravity
	if not player_body.is_on_floor():
		player_body.velocity.y -= 9.8 * delta
	else:
		player_body.velocity.y = 0.0

	player_body.move_and_slide()

func _process_world_simulation(delta: float) -> void:
	# 1. Sedan Kinematics along lane X = +1.75m
	if sedan_body:
		sedan_body.position.z += sedan_dir * sedan_speed * delta
		sedan_body.rotation.y = 0.0 if sedan_dir < 0.0 else PI
		var wheel_spin := (sedan_speed * delta) / 0.34
		for w in sedan_wheels:
			w.rotation.x -= wheel_spin
		if sedan_body.position.z < -12.5:
			sedan_dir = 1.0
		elif sedan_body.position.z > 12.5:
			sedan_dir = -1.0

	# 2. NPCs on sidewalk
	if npc_01:
		npc_01.position.z += npc1_dir * npc_speed * delta
		npc_01.rotation.y = 0.0 if npc1_dir < 0.0 else PI
		if npc_01.position.z < -11.5:
			npc1_dir = 1.0
		elif npc_01.position.z > 11.5:
			npc1_dir = -1.0

	if npc_02:
		npc_02.position.z += npc2_dir * npc_speed * delta
		npc_02.rotation.y = 0.0 if npc2_dir < 0.0 else PI
		if npc_02.position.z < -11.0:
			npc2_dir = 1.0
		elif npc_02.position.z > 11.0:
			npc2_dir = -1.0

	# 3. Dog in park
	if dog_01:
		dog_angle += delta * 1.2
		var next_x := 9.8 + cos(dog_angle) * 1.2
		var next_z := 3.5 + sin(dog_angle) * 1.8
		var dx := next_x - dog_01.position.x
		var dz := next_z - dog_01.position.z
		dog_01.position.x = next_x
		dog_01.position.z = next_z
		if abs(dx) + abs(dz) > 0.0001:
			dog_01.rotation.y = atan2(dx, dz)
