extends Node3D
## XE RC FPV V18 — High-Fidelity 1:1 Metric Rolls-Royce Luxury Cabin, OpenXR & Verified Interaction
## Supports:
## - 1:1 Metric Scale Luxury Rolls-Royce PBR 3D Cabin (rolls_royce_cabin_v18.glb)
## - Continuous Dark Carpet Floor, Contoured Nappa Cream Seats with Fluting & Stalk Headrests
## - High-gloss Burl Walnut Veneer Fascia, Polished Mirror Chrome Trims, Piano Black Cowl
## - 360-degree round 3D steering wheel with inner chrome ring, RR crest, 6 buttons & paddle shifters
## - Dual-input steering: Thumbstick horizontal axis or direct VR grab with spring self-centering
## - Unified Draggable Telemetry HUD with glassmorphism backing, ray drag & thumbstick distance/scale
## - Dynamic Rear Parking Guidelines on Gear [R] responding in real time to steering angle
## - Multi-screen system: Front FPV Screen, Rear Camera Screen, Entertainment Hub with Quest Browser
## - Safe view-only mode on Android with explicit RC drive arming interlock

@export_group("Network — RC Vehicle")
@export var esp32_ip: String = "192.168.4.1"
@export var esp32_port: int = 4210

@export_group("Network — Front Camera")
@export var camera_ip: String = "192.168.4.102"
@export var camera_video_port: int = 4212

@export_group("Network — Optional Relay")
@export_enum("Direct UDP", "WebSocket relay") var video_source: int = 0
@export var relay_url: String = "ws://192.168.4.2:3000/ws"
@export var relay_token: String = ""

@export_group("XR Screen Placement & Comfort")
@export var auto_enter_xr: bool = true
@export var xr_screen_distance: float = 2.0
@export var xr_screen_width: float = 2.2
@export var xr_screen_aspect: float = 4.0 / 3.0
@export var xr_screen_height_offset: float = 0.05
@export var drag_smooth_speed: float = 16.0
@export var rotation_smooth_speed: float = 12.0

@export_group("Steering & ESC Calibration")
@export var axis_steer: int = 0
@export var axis_throttle: int = 2
@export var axis_brake: int = 3
@export var deadzone: float = 0.05
@export var invert_steering: bool = false
@export var neutral_us: int = 1500
@export var max_forward_us: int = 1700
@export var max_reverse_us: int = 1300
@export var full_brake_us: int = 1000

@export_group("Motion Smoothing & Timing")
@export var throttle_accel_speed: float = 1.5
@export var throttle_decel_speed: float = 3.0
@export var wheel_physical_smooth: float = 20.0
@export var wheel_spring_center_speed: float = 3.5
@export var udp_send_hz: float = 100.0

# --- Sockets & Networking ---
var udp := PacketPeerUDP.new()
var video_udp := PacketPeerUDP.new()
var ws := WebSocketPeer.new()
var udp_packet := PackedByteArray()
var udp_send_interval := 0.01
var udp_send_accumulator := 0.0

# --- Camera Frame Assembly & States ---
enum StreamState { UNCONFIGURED, DISCONNECTED, CONNECTING, STREAMING, TIMEOUT, DECODE_ERROR }
var stream_state: int = StreamState.CONNECTING
var current_frame_chunks: Dictionary = {}
var current_frame_id: int = -1
var expected_chunks: int = 0
var cam_texture: ImageTexture
var last_frame_at_ms: int = 0
var frame_count: int = 0
var dropped_frames: int = 0
var packet_count: int = 0
var ws_connect_started_ms: int = 0
var reconnect_timer: float = 0.0
var reconnect_backoff: float = 1.5

# --- XR Scene Nodes ---
var xr_interface: XRInterface
var xr_active := false
var xr_origin: XROrigin3D
var xr_camera: XRCamera3D
var left_controller: XRController3D
var right_controller: XRController3D
var left_ray: MeshInstance3D
var right_ray: MeshInstance3D
var left_reticle: MeshInstance3D
var right_reticle: MeshInstance3D

# --- XR Sentinel ---
var sentinel_mesh: MeshInstance3D
var sentinel_label: Label3D

# --- Main FPV Virtual Screen (Windshield Simulator Display) ---
enum ScreenLayoutMode { FLOATING_MOVABLE, DOCKED_DASHBOARD }
var screen_layout_mode: int = ScreenLayoutMode.FLOATING_MOVABLE
var screen_root: Node3D
var xr_screen: MeshInstance3D
var screen_frame: MeshInstance3D
var fpv_mat: StandardMaterial3D
var screen_area: Area3D
var screen_status_label: Label3D
var screen_telemetry_label: Label3D
var screen_grabbed_hand: int = -1  # -1 = none, 0 = left, 1 = right
var screen_initial_placed := false
var current_screen_dist := 2.0
var current_screen_width := 2.2
var grab_anchor_offset := Vector3.ZERO
var grab_pull_active := [false, false]
var grab_release_debounce := [0, 0]

# --- Procedural Road Simulator Elements (Inside screen_root) ---
var sim_container: Node3D
var sim_sky: MeshInstance3D
var sim_road: MeshInstance3D
var sim_lane_l: MeshInstance3D
var sim_lane_r: MeshInstance3D
var sim_lane_dashes: Array[MeshInstance3D] = []
var sim_banner_label: Label3D

# --- Rear Camera Display & Dynamic Parking Guidelines ---
var rear_screen_root: Node3D
var rear_screen_mesh: MeshInstance3D
var rear_screen_frame: MeshInstance3D
var rear_status_label: Label3D
var rear_mat: StandardMaterial3D
var rear_guide_left: MeshInstance3D
var rear_guide_right: MeshInstance3D
var rear_stop_bar: MeshInstance3D

# --- Virtual Media Center Display (Stage G) ---
var media_screen_root: Node3D
var media_screen_mesh: MeshInstance3D
var media_screen_frame: MeshInstance3D
var media_status_label: Label3D
var media_button_mesh: MeshInstance3D
var media_button_label: Label3D
var media_mat: StandardMaterial3D
var media_panel_visible := true
var media_visualizer_bars: Array[MeshInstance3D] = []

# --- Cockpit Instrument Cluster ---
var dash_cluster_root: Node3D
var dash_cluster_panel: MeshInstance3D
var dash_speed_label: Label3D
var dash_gear_label: Label3D
var dash_status_label: Label3D
var dash_steer_label: Label3D
var dash_source_label: Label3D

# --- Cockpit 3D Geometry & Rolls-Royce Wheel ---
var cockpit_root: Node3D
var wheel_column: MeshInstance3D
var wheel_pivot: Node3D
var wheel_rim_mesh: MeshInstance3D
var wheel_inner_chrome_ring: MeshInstance3D
var wheel_top_marker: MeshInstance3D
var wheel_spoke_l: MeshInstance3D
var wheel_spoke_r: MeshInstance3D
var wheel_spoke_b: MeshInstance3D
var wheel_hub: MeshInstance3D
var wheel_steer_angle: float = 0.0
var wheel_grab_start_angle: float = 0.0
var wheel_grabbed_hand: int = -1
var wheel_touch_hover := [false, false]
var pedal_clutch: MeshInstance3D
var pedal_gas: MeshInstance3D
var pedal_brake: MeshInstance3D
var gear_lever: MeshInstance3D
var gear_display: Label3D
var spirit_controller: MeshInstance3D

# --- Cockpit Dashboard Interactive Buttons ---
var engage_button_mesh: MeshInstance3D
var engage_label: Label3D
var layout_toggle_button_mesh: MeshInstance3D
var layout_toggle_label: Label3D
var mode_toggle_button_mesh: MeshInstance3D
var mode_toggle_label: Label3D
var recenter_button_mesh: MeshInstance3D
var recenter_label: Label3D
var hud_toggle_button_mesh: MeshInstance3D
var hud_toggle_label: Label3D

# --- Unified Draggable Telemetry HUD (Glassmorphism Draggable Panel) ---
var hud_panel_root: Node3D
var hud_backing_mesh: MeshInstance3D
var hud_frame_mesh: MeshInstance3D
var hud_handle_bar: MeshInstance3D
var hud_handle_label: Label3D
var hud_content_label: Label3D
var hud_telemetry_label: Label3D
var hud_grabbed_hand: int = -1
var hud_grab_offset := Vector3.ZERO
var hud_distance: float = 1.05
var hud_scale: float = 1.0
var hud_visible: bool = true
var debug_hud: Node3D
var debug_label: Label3D
var debug_hud_visible: bool = true

# --- V18 Operational & Driving Modes ---
enum AppMode { LIVE_FPV_VIEW_ONLY, LOCAL_SIMULATION, COCKPIT_INTERACTION_TEST }
var app_mode: int = AppMode.LIVE_FPV_VIEW_ONLY
var sim_speed_kmh: float = 0.0
var sim_road_offset: float = 0.0
var button_cooldown: float = 0.0

enum ControlMode { VIEW_ONLY, DESKTOP_KEYBOARD, VR_COCKPIT }
var control_mode: int = ControlMode.VIEW_ONLY
var vr_control_engaged: bool = false # Safety interlock: false = simulation only, true = sends to real RC car
var is_android: bool = false

enum GearState { P, R, N, D }
var current_gear: int = GearState.P

# Drive state values
var current_steer := 0.0
var current_throttle := 0.0
var vr_steer := 0.0
var vr_throttle := 0.0
var vr_brake := 0.0
var current_input_source: String = "TOUCH_CONTROLLER"

enum DriveState { IDLE, FORWARD, BRAKING, NEUTRAL_RESET, REVERSING }
var drive_state: int = DriveState.IDLE
var state_timer := 0.0
var was_forward_timer := 0.0

# --- Desktop UI Nodes ---
var desktop_camera_display: TextureRect
var status_label: Label
var source_label: Label
var xr_button: Button
var fullscreen_button: Button


func _ready() -> void:
	is_android = OS.has_feature("android")
	control_mode = ControlMode.VR_COCKPIT if is_android else ControlMode.DESKTOP_KEYBOARD
	udp_packet.resize(4)
	udp_send_interval = 1.0 / max(udp_send_hz, 1.0)

	var err := udp.connect_to_host(esp32_ip, esp32_port)
	if err != OK:
		push_error("Vehicle UDP connect_to_host failed: %s" % err)

	_build_world()
	_build_cockpit()
	_build_unified_hud()
	_build_desktop_ui()
	_setup_xr()
	_setup_video_source()

	if auto_enter_xr or is_android:
		_start_xr_startup_sequence()


func _exit_tree() -> void:
	if video_udp:
		video_udp.close()
	if udp:
		udp.close()
	if ws:
		ws.close()


func _process(delta: float) -> void:
	# Passive XR watchdog: enter XR once when OpenXR runtime becomes initialized
	# CRITICAL: Never call xr_interface.initialize() inside _process!
	if (is_android or auto_enter_xr) and not xr_active:
		if xr_interface and xr_interface.is_initialized():
			enter_xr()

	if button_cooldown > 0.0:
		button_cooldown = max(0.0, button_cooldown - delta)

	_poll_video()
	_poll_websocket()
	_update_road_simulation(delta)
	_update_camera_state(delta)
	_update_rays_and_screen_interaction(delta)
	_update_unified_hud(delta)
	_update_diagnostics_hud(delta)
	_update_desktop_ui(delta)


func _physics_process(delta: float) -> void:
	if control_mode == ControlMode.VR_COCKPIT:
		_process_vr_cockpit_drive(delta)
	else:
		_process_desktop_drive(delta)


# ==============================================================================
# WORLD & ENVIRONMENT SETUP (STAGE 1 & 2)
# ==============================================================================

func _build_world() -> void:
	# World Environment — non-pitch-black, soft lighting
	var env := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.08, 0.09, 0.12, 1.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.32, 0.35, 0.42)
	environment.ambient_light_energy = 0.85
	env.environment = environment
	add_child(env)

	# Directional key light for depth, luxury reflections and form
	var sun := DirectionalLight3D.new()
	sun.name = "SunLight"
	sun.light_color = Color(1.0, 0.98, 0.95)
	sun.light_energy = 1.15
	sun.rotation_degrees = Vector3(-45, 30, 0)
	add_child(sun)

	# Garage ground plane (gives spatial grounding)
	var floor_mesh := MeshInstance3D.new()
	floor_mesh.name = "GarageFloor"
	var plane := PlaneMesh.new()
	plane.size = Vector2(24.0, 24.0)
	floor_mesh.mesh = plane
	var floor_mat := StandardMaterial3D.new()
	floor_mat.albedo_color = Color(0.18, 0.20, 0.24)
	floor_mat.roughness = 0.85
	floor_mesh.material_override = floor_mat
	floor_mesh.position = Vector3(0, 0, 0)
	add_child(floor_mesh)

	# XR Origin & Camera
	xr_origin = XROrigin3D.new()
	xr_origin.name = "XROrigin3D"
	add_child(xr_origin)

	xr_camera = XRCamera3D.new()
	xr_camera.name = "XRCamera3D"
	xr_origin.add_child(xr_camera)

	# Controllers
	left_controller = XRController3D.new()
	left_controller.name = "LeftHand"
	left_controller.tracker = &"left_hand"
	left_controller.pose = &"aim"
	xr_origin.add_child(left_controller)

	right_controller = XRController3D.new()
	right_controller.name = "RightHand"
	right_controller.tracker = &"right_hand"
	right_controller.pose = &"aim"
	xr_origin.add_child(right_controller)

	# Visual Rays & Reticles
	left_ray = _create_pointer_ray("LeftRay")
	left_controller.add_child(left_ray)
	left_reticle = _create_reticle("LeftReticle")
	add_child(left_reticle)

	right_ray = _create_pointer_ray("RightRay")
	right_controller.add_child(right_ray)
	right_reticle = _create_reticle("RightReticle")
	add_child(right_reticle)

	# FPV Virtual Screen Root
	screen_root = Node3D.new()
	screen_root.name = "ScreenRoot"
	current_screen_dist = xr_screen_distance
	current_screen_width = xr_screen_width
	screen_root.position = Vector3(0, xr_screen_height_offset, -current_screen_dist)
	add_child(screen_root)

	var screen_h: float = current_screen_width / xr_screen_aspect

	# Phase B: High-contrast unshaded XR Sentinel Mesh (guaranteed render visibility)
	sentinel_mesh = MeshInstance3D.new()
	sentinel_mesh.name = "XRSentinelMesh"
	var sent_box := BoxMesh.new()
	sent_box.size = Vector3(1.10, 0.14, 0.02)
	sentinel_mesh.mesh = sent_box
	var sent_mat := StandardMaterial3D.new()
	sent_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sent_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	sent_mat.albedo_color = Color(0.0, 0.85, 1.0) # Luminous cyan
	sentinel_mesh.material_override = sent_mat
	sentinel_mesh.position = Vector3(0, screen_h * 0.5 + 0.12, 0.02)
	screen_root.add_child(sentinel_mesh)

	sentinel_label = Label3D.new()
	sentinel_label.name = "SentinelLabel"
	sentinel_label.text = "★ XR RENDER TEST: PASS [V18 OK] ★"
	sentinel_label.font_size = 28
	sentinel_label.modulate = Color(0.02, 0.05, 0.12)
	sentinel_label.outline_size = 0
	sentinel_label.double_sided = true
	sentinel_label.position = Vector3(0, 0, 0.015)
	sentinel_mesh.add_child(sentinel_label)

	# Visible Bezel / Frame Mesh (guarantees screen outline is visible in 3D VR space)
	screen_frame = MeshInstance3D.new()
	screen_frame.name = "ScreenFrame"
	var frame_quad := QuadMesh.new()
	frame_quad.size = Vector2(current_screen_width + 0.06, screen_h + 0.06)
	screen_frame.mesh = frame_quad
	var frame_mat := StandardMaterial3D.new()
	frame_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	frame_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	frame_mat.albedo_color = Color(0.25, 0.65, 0.95) # Luminous cyan frame
	screen_frame.material_override = frame_mat
	screen_frame.position = Vector3(0, 0, -0.003)
	screen_root.add_child(screen_frame)

	# Inner Screen Display Mesh
	xr_screen = MeshInstance3D.new()
	xr_screen.name = "FPVScreen"
	var quad := QuadMesh.new()
	quad.size = Vector2(current_screen_width, screen_h)
	xr_screen.mesh = quad

	fpv_mat = StandardMaterial3D.new()
	fpv_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fpv_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	fpv_mat.albedo_color = Color(0.14, 0.16, 0.20)
	fpv_mat.emission_enabled = true
	fpv_mat.emission = Color(0.10, 0.12, 0.16)
	xr_screen.material_override = fpv_mat
	screen_root.add_child(xr_screen)

	# Screen Interaction Area
	screen_area = Area3D.new()
	screen_area.name = "ScreenInteractionArea"
	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(current_screen_width, screen_h, 0.1)
	col.shape = box
	screen_area.add_child(col)
	screen_root.add_child(screen_area)

	# Screen Status Label (High contrast, bold, visible from any angle)
	screen_status_label = Label3D.new()
	screen_status_label.name = "ScreenStatusLabel"
	screen_status_label.text = "NO CAMERA SIGNAL\n[CONNECTING TO CAMERA]"
	screen_status_label.font_size = 56
	screen_status_label.modulate = Color(1.0, 0.6, 0.1)
	screen_status_label.outline_size = 10
	screen_status_label.outline_color = Color(0, 0, 0, 1)
	screen_status_label.position = Vector3(0, 0.08, 0.02)
	screen_status_label.double_sided = true
	screen_root.add_child(screen_status_label)

	# Screen Telemetry Sub-Label (In-headset diagnostics directly under status)
	screen_telemetry_label = Label3D.new()
	screen_telemetry_label.name = "ScreenTelemetryLabel"
	screen_telemetry_label.text = "XE RC FPV V18 Cockpit | Awaiting Camera Feed..."
	screen_telemetry_label.font_size = 24
	screen_telemetry_label.modulate = Color(0.4, 0.85, 1.0)
	screen_telemetry_label.outline_size = 6
	screen_telemetry_label.outline_color = Color(0, 0, 0, 1)
	screen_telemetry_label.position = Vector3(0, -screen_h * 0.5 + 0.14, 0.02)
	screen_telemetry_label.double_sided = true
	screen_root.add_child(screen_telemetry_label)

	# --- Procedural Road Simulator Fallback (Stage 2) ---
	sim_container = Node3D.new()
	sim_container.name = "ProceduralRoadSimulator"
	sim_container.position = Vector3(0, 0, 0.005)
	screen_root.add_child(sim_container)

	# Asphalt Plane
	var road_mesh := MeshInstance3D.new()
	road_mesh.name = "SimAsphalt"
	var r_plane := QuadMesh.new()
	r_plane.size = Vector2(current_screen_width * 0.95, screen_h * 0.85)
	road_mesh.mesh = r_plane
	var r_mat := StandardMaterial3D.new()
	r_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	r_mat.albedo_color = Color(0.12, 0.13, 0.16)
	road_mesh.material_override = r_mat
	road_mesh.position = Vector3(0, -screen_h * 0.05, 0)
	sim_container.add_child(road_mesh)
	sim_road = road_mesh

	# Solid Left & Right Shoulder Lines
	var line_mat := StandardMaterial3D.new()
	line_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	line_mat.albedo_color = Color(0.9, 0.92, 0.95)

	sim_lane_l = _create_box("SimLaneL", Vector3(0.025, screen_h * 0.82, 0.005), Vector3(-current_screen_width * 0.42, -screen_h * 0.05, 0.002), line_mat)
	sim_container.add_child(sim_lane_l)

	sim_lane_r = _create_box("SimLaneR", Vector3(0.025, screen_h * 0.82, 0.005), Vector3(current_screen_width * 0.42, -screen_h * 0.05, 0.002), line_mat)
	sim_container.add_child(sim_lane_r)

	# Dashed Yellow Center Line Segments
	var dash_mat := StandardMaterial3D.new()
	dash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dash_mat.albedo_color = Color(1.0, 0.85, 0.15)

	sim_lane_dashes.clear()
	for i in range(5):
		var dash := _create_box("SimDash_%d" % i, Vector3(0.025, 0.14, 0.005), Vector3(0, -screen_h * 0.35 + i * 0.22, 0.002), dash_mat)
		sim_container.add_child(dash)
		sim_lane_dashes.append(dash)

	# Simulation Mode Banner Label
	sim_banner_label = Label3D.new()
	sim_banner_label.name = "SimBannerLabel"
	sim_banner_label.text = "LOCAL SIMULATION — NOT LIVE CAMERA\nDrive in VR Cockpit with Touch Controllers"
	sim_banner_label.font_size = 28
	sim_banner_label.modulate = Color(1.0, 0.75, 0.2)
	sim_banner_label.outline_size = 8
	sim_banner_label.outline_color = Color(0, 0, 0, 1)
	sim_banner_label.position = Vector3(0, screen_h * 0.28, 0.01)
	sim_banner_label.double_sided = true
	sim_container.add_child(sim_banner_label)


func _create_pointer_ray(ray_name: String) -> MeshInstance3D:
	var ray := MeshInstance3D.new()
	ray.name = ray_name
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.002
	cyl.bottom_radius = 0.002
	cyl.height = 2.5
	cyl.radial_segments = 6
	ray.mesh = cyl
	ray.position = Vector3(0, 0, -1.25)
	ray.rotation_degrees = Vector3(-90, 0, 0)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.3, 0.8, 1.0, 0.6)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ray.material_override = mat
	return ray


func _create_reticle(reticle_name: String) -> MeshInstance3D:
	var ret := MeshInstance3D.new()
	ret.name = reticle_name
	var sphere := SphereMesh.new()
	sphere.radius = 0.018
	sphere.height = 0.036
	ret.mesh = sphere
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.9, 0.2, 0.8)
	ret.material_override = mat
	ret.visible = false
	return ret


# ==============================================================================
# LUXURY ROLLS-ROYCE PBR COCKPIT 3D GEOMETRY (STAGE 3)
# ==============================================================================

func _build_cockpit() -> void:
	cockpit_root = Node3D.new()
	cockpit_root.name = "CockpitRoot"
	cockpit_root.position = Vector3(0, 0, 0)
	add_child(cockpit_root)

	# --- Luxury Rolls-Royce PBR Material Palette ---
	# 1. Nappa Cream Leather (#DFD1BE)
	var mat_cream := StandardMaterial3D.new()
	mat_cream.albedo_color = Color(0.87, 0.82, 0.74)
	mat_cream.roughness = 0.60
	mat_cream.specular = 0.20

	# 2. Burl Walnut Veneer (#3A2314) with Deep Mirror Clearcoat
	var mat_walnut := StandardMaterial3D.new()
	mat_walnut.albedo_color = Color(0.23, 0.14, 0.08)
	mat_walnut.roughness = 0.15
	mat_walnut.clearcoat_enabled = true
	mat_walnut.clearcoat = 1.0
	mat_walnut.clearcoat_roughness = 0.10

	# 3. Polished Chrome (#E8E8E8)
	var mat_chrome := StandardMaterial3D.new()
	mat_chrome.albedo_color = Color(0.91, 0.91, 0.91)
	mat_chrome.metallic = 1.0
	mat_chrome.roughness = 0.08

	# 4. Piano Black (#0F0F0F)
	var mat_piano := StandardMaterial3D.new()
	mat_piano.albedo_color = Color(0.06, 0.06, 0.06)
	mat_piano.metallic = 0.25
	mat_piano.roughness = 0.12

	# 5. Dark Cabin Carpet (#1A1A1D)
	var mat_carpet := StandardMaterial3D.new()
	mat_carpet.albedo_color = Color(0.10, 0.10, 0.11)
	mat_carpet.roughness = 0.95

	# 6. Technical Dark Accent
	var mat_accent := StandardMaterial3D.new()
	mat_accent.albedo_color = Color(0.20, 0.21, 0.25)
	mat_accent.roughness = 0.45

	# Secondary Screens Materials (Unshaded for Crisp Video Feeds)
	rear_mat = StandardMaterial3D.new()
	rear_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rear_mat.albedo_color = Color(0.06, 0.08, 0.12)

	media_mat = StandardMaterial3D.new()
	media_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	media_mat.albedo_color = Color(0.08, 0.10, 0.14)

	# --- Load and Instantiate 1:1 Metric High-Fidelity Rolls-Royce Cabin 3D Model ---
	var cabin_scene := load("res://models/rolls_royce_cabin_v18.glb") as PackedScene
	if cabin_scene:
		var cabin_instance := cabin_scene.instantiate()
		cabin_instance.name = "RollsRoyceCabinV18"
		cockpit_root.add_child(cabin_instance)
		wheel_pivot = cabin_instance.find_child("SteeringWheel_Pivot", true, false) as Node3D
		pedal_gas = cabin_instance.find_child("Pedal_Throttle", true, false) as MeshInstance3D
		pedal_brake = cabin_instance.find_child("Pedal_Brake", true, false) as MeshInstance3D
		gear_lever = cabin_instance.find_child("Gear_Lever_Stalk", true, false) as MeshInstance3D
		spirit_controller = cabin_instance.find_child("Spirit_Rotary_ChromeRing", true, false) as MeshInstance3D
		print("[Cockpit] Rolls-Royce V18 Cabin GLB instantiated successfully.")
	else:
		push_error("[Cockpit] CRITICAL: rolls_royce_cabin_v18.glb failed to load!")

	# --- Center Console Gear Position Display ---
	gear_display = Label3D.new()
	gear_display.name = "GearDisplay"
	gear_display.text = "GEAR: [P] R N D"
	gear_display.font_size = 20
	gear_display.modulate = Color(0.2, 0.85, 1.0)
	gear_display.position = Vector3(0.38, -0.48, -0.22)
	cockpit_root.add_child(gear_display)

	# --- Cockpit Instrument Cluster (Directly Behind Wheel Glass Binnacle at X=0.0) ---
	dash_cluster_root = Node3D.new()
	dash_cluster_root.name = "InstrumentCluster"
	dash_cluster_root.position = Vector3(0.0, -0.36, -0.44)
	dash_cluster_root.rotation_degrees = Vector3(-8, 0, 0)
	cockpit_root.add_child(dash_cluster_root)

	dash_speed_label = Label3D.new()
	dash_speed_label.name = "DashSpeedLabel"
	dash_speed_label.text = "SPEED: 0 KM/H | POWER: 0%"
	dash_speed_label.font_size = 22
	dash_speed_label.modulate = Color(0.2, 1.0, 0.4)
	dash_speed_label.position = Vector3(0.0, 0.045, 0.015)
	dash_cluster_root.add_child(dash_speed_label)

	dash_gear_label = Label3D.new()
	dash_gear_label.name = "DashGearLabel"
	dash_gear_label.text = "GEAR: [P] R N D"
	dash_gear_label.font_size = 20
	dash_gear_label.modulate = Color(0.3, 0.85, 1.0)
	dash_gear_label.position = Vector3(0.0, 0.015, 0.015)
	dash_cluster_root.add_child(dash_gear_label)

	dash_steer_label = Label3D.new()
	dash_steer_label.name = "DashSteerLabel"
	dash_steer_label.text = "STEER: 0°"
	dash_steer_label.font_size = 18
	dash_steer_label.modulate = Color(0.95, 0.95, 0.95)
	dash_steer_label.position = Vector3(0.0, -0.015, 0.015)
	dash_cluster_root.add_child(dash_steer_label)

	dash_status_label = Label3D.new()
	dash_status_label.name = "DashStatusLabel"
	dash_status_label.text = "CAM: CONNECTING | MODE: LIVE VIEW"
	dash_status_label.font_size = 15
	dash_status_label.modulate = Color(1.0, 0.75, 0.2)
	dash_status_label.position = Vector3(0.0, -0.045, 0.015)
	dash_cluster_root.add_child(dash_status_label)

	# --- Dashboard Interactive Controls (Left Dashboard Walnut Fascia at X=-0.32) ---
	engage_button_mesh = _create_box("EngageButton", Vector3(0.18, 0.036, 0.02), Vector3(-0.32, -0.30, -0.46), mat_piano)
	engage_button_mesh.rotation_degrees = Vector3(-8, 14, 0)
	cockpit_root.add_child(engage_button_mesh)

	engage_label = Label3D.new()
	engage_label.name = "EngageLabel"
	engage_label.text = "RC: [VIEW-ONLY]\nQuest 3 Safety Active" if is_android else "RC: [STANDBY - SAFE]\nAim & trigger to ENGAGE"
	engage_label.font_size = 14
	engage_label.modulate = Color(1.0, 0.7, 0.2)
	engage_label.position = Vector3(0.0, 0.0, 0.012)
	engage_button_mesh.add_child(engage_label)

	layout_toggle_button_mesh = _create_box("LayoutToggleButton", Vector3(0.18, 0.036, 0.02), Vector3(-0.32, -0.35, -0.46), mat_piano)
	layout_toggle_button_mesh.rotation_degrees = Vector3(-8, 14, 0)
	cockpit_root.add_child(layout_toggle_button_mesh)

	layout_toggle_label = Label3D.new()
	layout_toggle_label.name = "LayoutToggleLabel"
	layout_toggle_label.text = "LAYOUT: [FLOATING]\nAim & trigger to dock"
	layout_toggle_label.font_size = 14
	layout_toggle_label.modulate = Color(0.3, 0.85, 1.0)
	layout_toggle_label.position = Vector3(0.0, 0.0, 0.012)
	layout_toggle_button_mesh.add_child(layout_toggle_label)

	mode_toggle_button_mesh = _create_box("ModeToggleButton", Vector3(0.18, 0.036, 0.02), Vector3(-0.32, -0.40, -0.46), mat_piano)
	mode_toggle_button_mesh.rotation_degrees = Vector3(-8, 14, 0)
	cockpit_root.add_child(mode_toggle_button_mesh)

	mode_toggle_label = Label3D.new()
	mode_toggle_label.name = "ModeToggleLabel"
	mode_toggle_label.text = "MODE: [LIVE FPV]\nAim & trigger to change"
	mode_toggle_label.font_size = 14
	mode_toggle_label.modulate = Color(0.2, 1.0, 0.5)
	mode_toggle_label.position = Vector3(0.0, 0.0, 0.012)
	mode_toggle_button_mesh.add_child(mode_toggle_label)

	recenter_button_mesh = _create_box("RecenterButton", Vector3(0.18, 0.036, 0.02), Vector3(-0.32, -0.45, -0.46), mat_piano)
	recenter_button_mesh.rotation_degrees = Vector3(-8, 14, 0)
	cockpit_root.add_child(recenter_button_mesh)

	recenter_label = Label3D.new()
	recenter_label.name = "RecenterLabel"
	recenter_label.text = "RECENTER COCKPIT\nAim & trigger to snap"
	recenter_label.font_size = 14
	recenter_label.modulate = Color(0.9, 0.8, 0.3)
	recenter_label.position = Vector3(0.0, 0.0, 0.012)
	recenter_button_mesh.add_child(recenter_label)

	hud_toggle_button_mesh = _create_box("HUDToggleButton", Vector3(0.18, 0.036, 0.02), Vector3(-0.32, -0.50, -0.46), mat_piano)
	hud_toggle_button_mesh.rotation_degrees = Vector3(-8, 14, 0)
	cockpit_root.add_child(hud_toggle_button_mesh)

	hud_toggle_label = Label3D.new()
	hud_toggle_label.name = "HUDToggleLabel"
	hud_toggle_label.text = "HUD PANEL: [ON]\nAim & trigger to toggle"
	hud_toggle_label.font_size = 14
	hud_toggle_label.modulate = Color(0.2, 0.9, 1.0)
	hud_toggle_label.position = Vector3(0.0, 0.0, 0.012)
	hud_toggle_button_mesh.add_child(hud_toggle_label)

	# --- Rear Camera Display & Dynamic Reverse Parking Guidelines (Stage 4) ---
	rear_screen_root = Node3D.new()
	rear_screen_root.name = "RearCameraDisplay"
	rear_screen_root.position = Vector3(0.22, -0.36, -0.44)
	rear_screen_root.rotation_degrees = Vector3(-8, 10, 0)
	cockpit_root.add_child(rear_screen_root)

	rear_screen_frame = MeshInstance3D.new()
	rear_screen_frame.name = "RearScreenFrame"
	var r_frame_quad := QuadMesh.new()
	r_frame_quad.size = Vector2(0.36, 0.22)
	rear_screen_frame.mesh = r_frame_quad
	rear_screen_frame.material_override = mat_piano
	rear_screen_root.add_child(rear_screen_frame)

	rear_screen_mesh = MeshInstance3D.new()
	rear_screen_mesh.name = "RearScreen"
	var r_quad := QuadMesh.new()
	r_quad.size = Vector2(0.34, 0.20)
	rear_screen_mesh.mesh = r_quad
	rear_screen_mesh.material_override = rear_mat
	rear_screen_mesh.position = Vector3(0, 0, 0.002)
	rear_screen_root.add_child(rear_screen_mesh)

	rear_status_label = Label3D.new()
	rear_status_label.name = "RearStatusLabel"
	rear_status_label.text = "REAR CAMERA — REVERSE ASSIST\n[192.168.4.102:4213]\nGear: [P] | Dynamic Lines Ready"
	rear_status_label.font_size = 13
	rear_status_label.modulate = Color(0.4, 0.85, 1.0)
	rear_status_label.outline_size = 4
	rear_status_label.position = Vector3(0, 0.02, 0.01)
	rear_screen_root.add_child(rear_status_label)

	# Dynamic Parking Guidelines (Green/Yellow/Red Curved Trajectory Lines)
	var guide_green_mat := StandardMaterial3D.new()
	guide_green_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	guide_green_mat.albedo_color = Color(0.1, 0.95, 0.3)

	var stop_red_mat := StandardMaterial3D.new()
	stop_red_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	stop_red_mat.albedo_color = Color(0.95, 0.15, 0.15)

	rear_guide_left = _create_box("RearGuideLeft", Vector3(0.010, 0.14, 0.004), Vector3(-0.10, -0.02, 0.01), guide_green_mat)
	rear_screen_root.add_child(rear_guide_left)

	rear_guide_right = _create_box("RearGuideRight", Vector3(0.010, 0.14, 0.004), Vector3(0.10, -0.02, 0.01), guide_green_mat)
	rear_screen_root.add_child(rear_guide_right)

	rear_stop_bar = _create_box("RearStopBar", Vector3(0.18, 0.010, 0.004), Vector3(0.0, -0.08, 0.01), stop_red_mat)
	rear_screen_root.add_child(rear_stop_bar)

	# --- Virtual Media Center Display & Animated Visualizer (Stage 5) ---
	media_screen_root = Node3D.new()
	media_screen_root.name = "MediaCenterDisplay"
	media_screen_root.position = Vector3(0.66, -0.36, -0.46)
	media_screen_root.rotation_degrees = Vector3(-8, -12, 0)
	cockpit_root.add_child(media_screen_root)

	media_screen_frame = MeshInstance3D.new()
	media_screen_frame.name = "MediaScreenFrame"
	var m_frame_quad := QuadMesh.new()
	m_frame_quad.size = Vector2(0.44, 0.28)
	media_screen_frame.mesh = m_frame_quad
	media_screen_frame.material_override = mat_piano
	media_screen_root.add_child(media_screen_frame)

	media_screen_mesh = MeshInstance3D.new()
	media_screen_mesh.name = "MediaScreen"
	var m_quad := QuadMesh.new()
	m_quad.size = Vector2(0.42, 0.26)
	media_screen_mesh.mesh = m_quad
	media_screen_mesh.material_override = media_mat
	media_screen_mesh.position = Vector3(0, 0, 0.002)
	media_screen_root.add_child(media_screen_mesh)

	media_status_label = Label3D.new()
	media_status_label.name = "MediaStatusLabel"
	media_status_label.text = "ENTERTAINMENT & MEDIA\n[YOUTUBE / BROWSER HUB]\nGodot Android Web Audio Player"
	media_status_label.font_size = 14
	media_status_label.modulate = Color(0.5, 0.85, 1.0)
	media_status_label.outline_size = 4
	media_status_label.position = Vector3(0, 0.04, 0.01)
	media_screen_root.add_child(media_status_label)

	# 8-Bar Procedural Animated Spectrum Visualizer
	media_visualizer_bars.clear()
	var bar_mat := StandardMaterial3D.new()
	bar_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bar_mat.albedo_color = Color(0.1, 0.8, 1.0)

	for b in range(8):
		var bar := _create_box("MediaBar_%d" % b, Vector3(0.022, 0.05, 0.004), Vector3(-0.14 + b * 0.040, -0.04, 0.008), bar_mat)
		media_screen_root.add_child(bar)
		media_visualizer_bars.append(bar)

	media_button_mesh = _create_box("MediaLaunchButton", Vector3(0.30, 0.045, 0.03), Vector3(0.0, -0.09, 0.015), mat_piano)
	media_screen_root.add_child(media_button_mesh)

	media_button_label = Label3D.new()
	media_button_label.name = "MediaButtonLabel"
	media_button_label.text = "[ ▶ OPEN QUEST BROWSER ]"
	media_button_label.font_size = 16
	media_button_label.modulate = Color(1.0, 0.35, 0.35)
	media_button_label.position = Vector3(0.0, 0.0, 0.020)
	media_button_mesh.add_child(media_button_label)


func _create_box(node_name: String, size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	var box := BoxMesh.new()
	box.size = size
	mi.mesh = box
	mi.position = pos
	mi.material_override = mat
	return mi


# ==============================================================================
# UNIFIED DRAGGABLE TELEMETRY HUD (STAGE 6)
# ==============================================================================

func _build_unified_hud() -> void:
	hud_panel_root = Node3D.new()
	hud_panel_root.name = "UnifiedDraggableHUD"
	hud_panel_root.position = Vector3(-0.75, 1.05, -0.95)
	hud_panel_root.rotation_degrees = Vector3(0, 22, 0)
	add_child(hud_panel_root)

	# Glassmorphism Backing Mesh (Dark Translucent Quad)
	hud_backing_mesh = MeshInstance3D.new()
	hud_backing_mesh.name = "HUDBacking"
	var back_quad := QuadMesh.new()
	back_quad.size = Vector2(0.64, 0.48)
	hud_backing_mesh.mesh = back_quad
	var back_mat := StandardMaterial3D.new()
	back_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	back_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	back_mat.albedo_color = Color(0.04, 0.06, 0.10, 0.78)
	back_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	hud_backing_mesh.material_override = back_mat
	hud_panel_root.add_child(hud_backing_mesh)

	# Glowing Cyan Frame Mesh
	hud_frame_mesh = MeshInstance3D.new()
	hud_frame_mesh.name = "HUDFrame"
	var f_quad := QuadMesh.new()
	f_quad.size = Vector2(0.66, 0.50)
	hud_frame_mesh.mesh = f_quad
	var f_mat := StandardMaterial3D.new()
	f_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	f_mat.albedo_color = Color(0.15, 0.65, 0.95, 0.85)
	f_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	f_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	hud_frame_mesh.material_override = f_mat
	hud_frame_mesh.position = Vector3(0, 0, -0.002)
	hud_panel_root.add_child(hud_frame_mesh)

	# Top Grab Handle Bar (Luminous Cyan Grab Bar)
	hud_handle_bar = MeshInstance3D.new()
	hud_handle_bar.name = "HUDHandleBar"
	var bar_box := BoxMesh.new()
	bar_box.size = Vector3(0.60, 0.035, 0.02)
	hud_handle_bar.mesh = bar_box
	var bar_mat := StandardMaterial3D.new()
	bar_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bar_mat.albedo_color = Color(0.0, 0.85, 1.0)
	hud_handle_bar.material_override = bar_mat
	hud_handle_bar.position = Vector3(0, 0.22, 0.01)
	hud_panel_root.add_child(hud_handle_bar)

	hud_handle_label = Label3D.new()
	hud_handle_label.name = "HUDHandleLabel"
	hud_handle_label.text = "☰ DRAG HUD  |  Stick-Y: Distance  |  Stick-X: Scale"
	hud_handle_label.font_size = 18
	hud_handle_label.modulate = Color(0.02, 0.05, 0.12)
	hud_handle_label.position = Vector3(0, 0, 0.012)
	hud_handle_bar.add_child(hud_handle_label)

	# Main Telemetry Content Label
	hud_content_label = Label3D.new()
	hud_content_label.name = "HUDContentLabel"
	hud_content_label.text = "XE RC FPV V18 | ROLLS-ROYCE CABIN\nTelemetry initializing..."
	hud_content_label.font_size = 20
	hud_content_label.modulate = Color(0.9, 0.95, 1.0)
	hud_content_label.outline_size = 3
	hud_content_label.outline_color = Color(0, 0, 0, 1)
	hud_content_label.position = Vector3(0, 0.02, 0.01)
	hud_panel_root.add_child(hud_content_label)

	# Bind diagnostic HUD aliases to the unified telemetry HUD
	debug_hud = hud_panel_root
	debug_label = hud_content_label
	debug_hud_visible = hud_visible


# ==============================================================================
# SCREEN PLACEMENT, RECENTERING & VR INTERACTION
# ==============================================================================

func _reset_screen_position() -> void:
	if not xr_camera or not screen_root:
		return
	var cam_pos := xr_camera.global_position
	var fwd := -xr_camera.global_transform.basis.z
	var fwd_flat := Vector3(fwd.x, 0.0, fwd.z)
	if fwd_flat.length_squared() < 0.01:
		fwd_flat = Vector3(0, 0, -1)
	else:
		fwd_flat = fwd_flat.normalized()

	var target_pos := cam_pos + fwd_flat * current_screen_dist
	target_pos.y = cam_pos.y + xr_screen_height_offset
	screen_root.global_position = target_pos

	var yaw: float = atan2(-fwd_flat.x, -fwd_flat.z)
	screen_root.rotation = Vector3(0, yaw, 0)
	screen_initial_placed = true


func _recenter_cockpit() -> void:
	if not xr_camera or not cockpit_root:
		return
	var cam_pos := xr_camera.global_position
	# Offset cockpit_root so driver eye origin (0, 0, 0) aligns with HMD
	cockpit_root.global_position = cam_pos
	if screen_layout_mode == ScreenLayoutMode.DOCKED_DASHBOARD and screen_root:
		screen_root.global_position = cam_pos + Vector3(0.0, 0.25, -2.0)
	print("[Cockpit] Recentered cockpit to HMD position: ", cam_pos)


func _update_rays_and_screen_interaction(delta: float) -> void:
	if not xr_active:
		left_reticle.visible = false
		right_reticle.visible = false
		return

	if not screen_initial_placed and xr_camera:
		_reset_screen_position()

	_process_controller_ray(0, left_controller, left_ray, left_reticle, delta)
	_process_controller_ray(1, right_controller, right_ray, right_reticle, delta)


func _process_controller_ray(hand_id: int, ctrl: XRController3D, ray: MeshInstance3D, reticle: MeshInstance3D, delta: float) -> void:
	if not ctrl or not ctrl.get_is_active():
		ray.visible = false
		reticle.visible = false
		if screen_grabbed_hand == hand_id:
			screen_grabbed_hand = -1
		if wheel_grabbed_hand == hand_id:
			wheel_grabbed_hand = -1
		if hud_grabbed_hand == hand_id:
			hud_grabbed_hand = -1
		return

	ray.visible = true
	var ray_origin := ctrl.global_position
	var ray_dir := -ctrl.global_transform.basis.z.normalized()

	# Check ray intersection with main FPV screen plane
	var screen_plane := Plane(screen_root.global_transform.basis.z, screen_root.global_position)
	var hit: Variant = screen_plane.intersects_ray(ray_origin, ray_dir)
	var is_hovering_screen := false

	if hit != null:
		var local_hit: Vector3 = screen_root.to_local(hit)
		var half_w: float = current_screen_width * 0.5
		var half_h: float = (current_screen_width / xr_screen_aspect) * 0.5
		if abs(local_hit.x) <= half_w and abs(local_hit.y) <= half_h:
			is_hovering_screen = true
			reticle.visible = true
			reticle.global_position = hit

	# Check ray intersection with Unified HUD panel plane
	var is_hovering_hud := false
	if hud_panel_root and hud_visible:
		var hud_plane := Plane(hud_panel_root.global_transform.basis.z, hud_panel_root.global_position)
		var hud_hit: Variant = hud_plane.intersects_ray(ray_origin, ray_dir)
		if hud_hit != null:
			var local_hud_hit: Vector3 = hud_panel_root.to_local(hud_hit)
			if abs(local_hud_hit.x) <= 0.35 and abs(local_hud_hit.y) <= 0.28:
				is_hovering_hud = true
				reticle.visible = true
				reticle.global_position = hud_hit

	if not is_hovering_screen and not is_hovering_hud and screen_grabbed_hand != hand_id and hud_grabbed_hand != hand_id:
		reticle.visible = false

	# Optical Hand Tracking Pinch & Controller Grip/Trigger with Hysteresis & Debounce
	var grip_val: float = ctrl.get_float("grip")
	var trig_val: float = ctrl.get_float("trigger")
	var pull_raw: float = maxf(grip_val, trig_val)
	if grab_pull_active[hand_id]:
		if pull_raw < 0.38:
			grab_release_debounce[hand_id] += 1
			if grab_release_debounce[hand_id] >= 2:
				grab_pull_active[hand_id] = false
		else:
			grab_release_debounce[hand_id] = 0
	else:
		if pull_raw > 0.62:
			grab_pull_active[hand_id] = true
			grab_release_debounce[hand_id] = 0
	var is_pulling: bool = grab_pull_active[hand_id]

	# --- Steering Wheel 3D Grabbing ---
	var dist_to_wheel: float = ray_origin.distance_to(wheel_pivot.global_position) if wheel_pivot else 999.0
	if dist_to_wheel < 0.30:
		wheel_touch_hover[hand_id] = true
		if is_pulling and wheel_grabbed_hand == -1:
			wheel_grabbed_hand = hand_id
			var local_hand := wheel_pivot.to_local(ray_origin)
			wheel_grab_start_angle = atan2(local_hand.y, local_hand.x) - wheel_steer_angle
	else:
		wheel_touch_hover[hand_id] = false

	if wheel_grabbed_hand == hand_id:
		if is_pulling and wheel_pivot:
			var local_hand := wheel_pivot.to_local(ray_origin)
			var cur_angle := atan2(local_hand.y, local_hand.x)
			wheel_steer_angle = clamp(cur_angle - wheel_grab_start_angle, -PI * 0.5, PI * 0.5)
			vr_steer = clamp(-wheel_steer_angle / (PI * 0.5), -1.0, 1.0)
		else:
			wheel_grabbed_hand = -1

	# --- Unified HUD Dragging & Resizing ---
	if hud_visible and hud_panel_root and wheel_grabbed_hand != hand_id:
		if hud_grabbed_hand == -1 and is_hovering_hud and is_pulling:
			hud_grabbed_hand = hand_id
			hud_grab_offset = hud_panel_root.global_position - (ray_origin + ray_dir * hud_distance)

		if hud_grabbed_hand == hand_id:
			if is_pulling:
				var stick := ctrl.get_vector2("primary")
				if abs(stick.y) > 0.1:
					hud_distance = clamp(hud_distance - stick.y * 0.02, 0.5, 2.5)
				if abs(stick.x) > 0.1:
					hud_scale = clamp(hud_scale + stick.x * 0.02, 0.6, 2.0)
					hud_panel_root.scale = Vector3.ONE * hud_scale

				var target_hud_pos := ray_origin + ray_dir * hud_distance + hud_grab_offset
				var smooth_hud: float = 1.0 - exp(-drag_smooth_speed * delta)
				hud_panel_root.global_position = hud_panel_root.global_position.lerp(target_hud_pos, smooth_hud)

				if xr_camera:
					var to_cam := (xr_camera.global_position - hud_panel_root.global_position)
					var target_yaw := atan2(to_cam.x, to_cam.z)
					var smooth_rot: float = 1.0 - exp(-rotation_smooth_speed * delta)
					hud_panel_root.rotation.y = lerp_angle(hud_panel_root.rotation.y, target_yaw, smooth_rot)
				reticle.visible = true
				reticle.global_position = hud_panel_root.global_position
			else:
				hud_grabbed_hand = -1

	# --- Main Screen Dragging & Sizing (Movable Layout Only) ---
	if screen_layout_mode == ScreenLayoutMode.FLOATING_MOVABLE and wheel_grabbed_hand != hand_id and hud_grabbed_hand != hand_id:
		if screen_grabbed_hand == -1 and is_hovering_screen and is_pulling:
			screen_grabbed_hand = hand_id
			grab_anchor_offset = screen_root.global_position - (ray_origin + ray_dir * current_screen_dist)

		if screen_grabbed_hand == hand_id:
			if is_pulling:
				var stick := ctrl.get_vector2("primary")
				if abs(stick.y) > 0.1:
					current_screen_dist = clamp(current_screen_dist - stick.y * 0.02, 1.2, 4.0)
				if abs(stick.x) > 0.1:
					current_screen_width = clamp(current_screen_width + stick.x * 0.02, 1.4, 3.5)
					_apply_screen_size()

				var target_pos := ray_origin + ray_dir * current_screen_dist + grab_anchor_offset
				var smooth_pos: float = 1.0 - exp(-drag_smooth_speed * delta)
				screen_root.global_position = screen_root.global_position.lerp(target_pos, smooth_pos)

				if xr_camera:
					var to_cam := (xr_camera.global_position - screen_root.global_position)
					var target_yaw := atan2(to_cam.x, to_cam.z)
					var smooth_rot: float = 1.0 - exp(-rotation_smooth_speed * delta)
					screen_root.rotation.y = lerp_angle(screen_root.rotation.y, target_yaw, smooth_rot)

				reticle.visible = true
				reticle.global_position = screen_root.global_position
			else:
				screen_grabbed_hand = -1

	# Reset screen position button (B/Y button)
	if ctrl.is_button_pressed("by_button"):
		_reset_screen_position()

	# --- Cockpit Interactive Ray Triggers with Debounce ---
	if trig_val > 0.65 and button_cooldown <= 0.0 and not is_hovering_screen and not is_hovering_hud and screen_grabbed_hand != hand_id and wheel_grabbed_hand != hand_id and hud_grabbed_hand != hand_id:
		if _is_ray_pointing_at(ray_origin, ray_dir, engage_button_mesh):
			_toggle_rc_engage()
			button_cooldown = 0.4
		elif _is_ray_pointing_at(ray_origin, ray_dir, layout_toggle_button_mesh):
			_toggle_screen_layout()
			button_cooldown = 0.4
		elif _is_ray_pointing_at(ray_origin, ray_dir, mode_toggle_button_mesh):
			_toggle_app_mode()
			button_cooldown = 0.4
		elif _is_ray_pointing_at(ray_origin, ray_dir, recenter_button_mesh):
			_recenter_cockpit()
			button_cooldown = 0.4
		elif _is_ray_pointing_at(ray_origin, ray_dir, hud_toggle_button_mesh):
			_toggle_hud_visibility()
			button_cooldown = 0.4
		elif _is_ray_pointing_at(ray_origin, ray_dir, media_button_mesh):
			_launch_quest_browser()
			button_cooldown = 0.5


func _is_ray_pointing_at(ray_origin: Vector3, ray_dir: Vector3, target_mesh: Node3D, max_dist: float = 2.0, max_angle_cos: float = 0.94) -> bool:
	if not target_mesh:
		return false
	var to_mesh := target_mesh.global_position - ray_origin
	if to_mesh.length() > max_dist:
		return false
	return ray_dir.dot(to_mesh.normalized()) > max_angle_cos


func _apply_screen_size() -> void:
	var screen_h: float = current_screen_width / xr_screen_aspect
	var quad := xr_screen.mesh as QuadMesh
	if quad:
		quad.size = Vector2(current_screen_width, screen_h)
	var frame_quad := screen_frame.mesh as QuadMesh if screen_frame else null
	if frame_quad:
		frame_quad.size = Vector2(current_screen_width + 0.06, screen_h + 0.06)
	var col_shape := screen_area.get_node_or_null("CollisionShape3D")
	if col_shape:
		var box := col_shape.shape as BoxShape3D
		if box:
			box.size = Vector3(current_screen_width, screen_h, 0.1)


func _toggle_screen_layout() -> void:
	if screen_layout_mode == ScreenLayoutMode.FLOATING_MOVABLE:
		screen_layout_mode = ScreenLayoutMode.DOCKED_DASHBOARD
		if layout_toggle_label:
			layout_toggle_label.text = "LAYOUT: [DOCKED]\nAim & trigger to float"
			layout_toggle_label.modulate = Color(0.3, 1.0, 0.5)
		if screen_root:
			var base_pos := cockpit_root.global_position if cockpit_root else Vector3.ZERO
			screen_root.global_position = base_pos + Vector3(0.0, 1.25, -2.0)
			screen_root.rotation = Vector3.ZERO
	else:
		screen_layout_mode = ScreenLayoutMode.FLOATING_MOVABLE
		if layout_toggle_label:
			layout_toggle_label.text = "LAYOUT: [FLOATING]\nAim & trigger to dock"
			layout_toggle_label.modulate = Color(0.3, 0.85, 1.0)
		_reset_screen_position()


func _toggle_app_mode() -> void:
	app_mode = (app_mode + 1) % 3
	var mode_names := ["LIVE FPV", "SIMULATION", "INTERACTION TEST"]
	var mode_colors := [Color(0.2, 1.0, 0.5), Color(1.0, 0.75, 0.2), Color(0.3, 0.85, 1.0)]
	if mode_toggle_label:
		mode_toggle_label.text = "MODE: [%s]\nAim & trigger to change" % mode_names[app_mode]
		mode_toggle_label.modulate = mode_colors[app_mode]
	print("[AppMode] Switched to mode: ", mode_names[app_mode])


func _toggle_hud_visibility() -> void:
	hud_visible = not hud_visible
	debug_hud_visible = hud_visible
	if hud_panel_root:
		hud_panel_root.visible = hud_visible
	if hud_toggle_label:
		hud_toggle_label.text = "HUD PANEL: [ON]\nAim & trigger to toggle" if hud_visible else "HUD PANEL: [OFF]\nAim & trigger to toggle"
		hud_toggle_label.modulate = Color(0.2, 0.9, 1.0) if hud_visible else Color(0.6, 0.6, 0.6)


func _launch_quest_browser() -> void:
	print("[Media] Launching Quest Browser for YouTube...")
	OS.shell_open("https://www.youtube.com")


func _toggle_rc_engage() -> void:
	if is_android:
		vr_control_engaged = false
		if engage_label:
			engage_label.text = "RC: [VIEW-ONLY]\nQuest 3 Safety Lock Active"
			engage_label.modulate = Color(0.9, 0.3, 0.3)
		return

	vr_control_engaged = not vr_control_engaged
	if vr_control_engaged:
		engage_label.text = "RC: [LIVE TRANSMIT]\nControls drive REAL RC CAR!"
		engage_label.modulate = Color(0.2, 1.0, 0.3)
	else:
		engage_label.text = "RC: [STANDBY - SAFE]\nAim & trigger to ENGAGE"
		engage_label.modulate = Color(1.0, 0.7, 0.2)


# ==============================================================================
# PROCEDURAL ROAD SIMULATOR & CAMERA DIAGNOSTICS (STAGE 2 & 4)
# ==============================================================================

func _update_road_simulation(delta: float) -> void:
	var is_sim_active: bool = (app_mode == AppMode.LOCAL_SIMULATION or (cam_texture == null and app_mode != AppMode.COCKPIT_INTERACTION_TEST))
	if sim_container:
		sim_container.visible = is_sim_active

	if not is_sim_active:
		return

	# Animate dashed center lines down the road based on simulated vehicle speed
	var speed_mps: float = (sim_speed_kmh / 3.6)
	sim_road_offset += speed_mps * delta * 0.35
	if sim_road_offset > 0.22:
		sim_road_offset = fmod(sim_road_offset, 0.22)

	var screen_h: float = current_screen_width / xr_screen_aspect
	for i in range(sim_lane_dashes.size()):
		var base_y: float = -screen_h * 0.35 + float(i) * 0.22
		var cur_y: float = base_y - sim_road_offset
		if cur_y < -screen_h * 0.40:
			cur_y += float(sim_lane_dashes.size()) * 0.22
		sim_lane_dashes[i].position.y = cur_y
		# Slight curve with steering
		sim_lane_dashes[i].position.x = -vr_steer * 0.08 * (1.0 - float(i) * 0.15)

	if sim_banner_label:
		sim_banner_label.text = "LOCAL SIMULATION — NOT LIVE CAMERA\nSpeed: %d km/h | Steer: %d°" % [int(sim_speed_kmh), int(vr_steer * 45.0)]


func _setup_video_source() -> void:
	if video_source == 0:
		var err := video_udp.bind(camera_video_port)
		if err != OK:
			push_error("Camera UDP bind failed: %s" % err)
			stream_state = StreamState.DISCONNECTED
			return
		_send_camera_hello()
		stream_state = StreamState.CONNECTING
	else:
		var target_url := relay_url
		if relay_token.strip_edges() != "":
			target_url += ("&" if "?" in target_url else "?") + "token=" + relay_token.uri_encode()
		ws_connect_started_ms = Time.get_ticks_msec()
		var err := ws.connect_to_url(target_url)
		if err != OK:
			push_error("WebSocket connect failed: %s" % err)
			stream_state = StreamState.DISCONNECTED
		else:
			stream_state = StreamState.CONNECTING


func _send_camera_hello() -> void:
	video_udp.set_dest_address(camera_ip, camera_video_port)
	video_udp.put_packet("HELLO".to_utf8_buffer())


func _poll_video() -> void:
	if video_source == 0:
		while video_udp.get_available_packet_count() > 0:
			var packet := video_udp.get_packet()
			_consume_fragment(packet)
	else:
		if ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
			return
		while ws.get_available_packet_count() > 0:
			var packet := ws.get_packet()
			_accept_complete_jpeg(packet)


func _poll_websocket() -> void:
	if video_source != 1:
		return
	ws.poll()


func _consume_fragment(packet: PackedByteArray) -> void:
	if packet.size() < 4:
		return
	var f_id := int(packet[0])
	var chunk_idx := int(packet[1])
	var total := int(packet[2])

	if total <= 0 or total > 255 or chunk_idx >= total:
		return

	if f_id != current_frame_id:
		if current_frame_id >= 0 and current_frame_chunks.size() < expected_chunks:
			dropped_frames += 1
		current_frame_chunks.clear()
		current_frame_id = f_id
		expected_chunks = total

	current_frame_chunks[chunk_idx] = packet.slice(3)
	if current_frame_chunks.size() != expected_chunks:
		return

	var jpeg := PackedByteArray()
	for i in range(expected_chunks):
		if not current_frame_chunks.has(i):
			dropped_frames += 1
			current_frame_chunks.clear()
			return
		jpeg.append_array(current_frame_chunks[i])

	current_frame_chunks.clear()
	_accept_complete_jpeg(jpeg)


func _accept_complete_jpeg(jpeg: PackedByteArray) -> void:
	if jpeg.size() < 16:
		return
	var image := Image.new()
	var err := image.load_jpg_from_buffer(jpeg)
	if err != OK:
		dropped_frames += 1
		stream_state = StreamState.DECODE_ERROR
		return
	_update_frame(image)


func _update_frame(image: Image) -> void:
	if cam_texture == null or cam_texture.get_size() != Vector2(image.get_width(), image.get_height()):
		cam_texture = ImageTexture.create_from_image(image)
	else:
		cam_texture.update(image)

	desktop_camera_display.texture = cam_texture
	if fpv_mat:
		fpv_mat.albedo_texture = cam_texture
		fpv_mat.emission_texture = cam_texture
		fpv_mat.albedo_color = Color.WHITE
		fpv_mat.emission_enabled = true

	last_frame_at_ms = Time.get_ticks_msec()
	frame_count += 1
	stream_state = StreamState.STREAMING


func _update_camera_state(delta: float) -> void:
	var now := Time.get_ticks_msec()
	var age: int = now - last_frame_at_ms if last_frame_at_ms > 0 else -1

	if last_frame_at_ms == 0:
		stream_state = StreamState.CONNECTING
		reconnect_timer -= delta
		if reconnect_timer <= 0.0:
			if video_source == 0:
				_send_camera_hello()
			reconnect_timer = reconnect_backoff
			reconnect_backoff = min(reconnect_backoff * 1.5, 8.0)
	elif age > 2000:
		stream_state = StreamState.TIMEOUT
		reconnect_timer -= delta
		if reconnect_timer <= 0.0:
			if video_source == 0:
				_send_camera_hello()
			reconnect_timer = 2.0
	else:
		stream_state = StreamState.STREAMING
		reconnect_backoff = 1.5

	# Update virtual screen overlay label
	if screen_status_label:
		if app_mode == AppMode.LOCAL_SIMULATION:
			screen_status_label.visible = false
		else:
			match stream_state:
				StreamState.STREAMING:
					screen_status_label.visible = false
				StreamState.CONNECTING:
					screen_status_label.visible = true
					screen_status_label.modulate = Color(1.0, 0.6, 0.2)
					screen_status_label.text = "NO CAMERA SIGNAL\n[CONNECTING TO CAMERA]\n%s:%d | Pkts: %d" % [camera_ip, camera_video_port, packet_count]
				StreamState.TIMEOUT:
					screen_status_label.visible = true
					screen_status_label.modulate = Color(1.0, 0.2, 0.2)
					screen_status_label.text = "NO CAMERA SIGNAL\n[TIMEOUT — %d ms ago]\nDrops: %d | Re-handshaking..." % [age, dropped_frames]
				StreamState.DECODE_ERROR:
					screen_status_label.visible = true
					screen_status_label.modulate = Color(1.0, 0.1, 0.4)
					screen_status_label.text = "NO CAMERA SIGNAL\n[JPEG DECODE ERROR]\nPkts: %d | Drops: %d" % [packet_count, dropped_frames]
				StreamState.DISCONNECTED:
					screen_status_label.visible = true
					screen_status_label.modulate = Color(0.9, 0.3, 0.3)
					screen_status_label.text = "NO CAMERA SIGNAL\n[CAMERA DISCONNECTED]"
				StreamState.UNCONFIGURED:
					screen_status_label.visible = true
					screen_status_label.modulate = Color(0.7, 0.7, 0.7)
					screen_status_label.text = "NO CAMERA SIGNAL\n[CAMERA SOURCE NOT CONFIGURED]"

	# In-headset telemetry sub-label
	if screen_telemetry_label:
		var xr_ok := xr_interface != null and xr_interface.is_initialized()
		var cam_pos := xr_camera.global_position if xr_camera else Vector3.ZERO
		screen_telemetry_label.text = "XE RC FPV V18 Cockpit | XR: %s | FPS: %.0f | Frames: %d | HMD: (%.2f, %.2f, %.2f)" % [
			"OK" if (xr_ok and xr_active) else ("INIT" if xr_ok else "NONE"),
			Engine.get_frames_per_second(), frame_count,
			cam_pos.x, cam_pos.y, cam_pos.z
		]

	# Update Cockpit Instrument Cluster
	if dash_speed_label:
		dash_speed_label.text = "SPEED: %d KM/H | POWER: %d%%" % [int(abs(sim_speed_kmh)), int(vr_throttle * 100.0)]
	if dash_gear_label:
		var g_names := ["P", "R", "N", "D"]
		dash_gear_label.text = "GEAR: [%s]" % g_names[current_gear]
	if dash_steer_label:
		dash_steer_label.text = "STEER: %d°" % int(vr_steer * 45.0)
	if dash_status_label:
		var mode_names := ["LIVE VIEW", "SIMULATION", "INTERACTION"]
		var stream_names := ["UNCONF", "DISCONN", "CONN", "STREAMING", "TIMEOUT", "ERR"]
		var s_name: String = stream_names[stream_state] if stream_state < stream_names.size() else "UNKNOWN"
		dash_status_label.text = "CAM: %s | MODE: %s" % [s_name, mode_names[app_mode]]

	# Update Dynamic Reverse Parking Guidelines on Rear Screen
	if rear_status_label:
		if current_gear == GearState.R:
			rear_status_label.text = "REAR CAMERA — REVERSE GEAR [R]\nDynamic Parking Guidelines: ACTIVE (Steer: %d°)" % int(vr_steer * 45.0)
			rear_status_label.modulate = Color(0.2, 1.0, 0.4)
		else:
			rear_status_label.text = "REAR CAMERA — REVERSE ASSIST\n[192.168.4.102:4213]\nGear: [%s] | Reverse Inactive" % ["P", "R", "N", "D"][current_gear]
			rear_status_label.modulate = Color(0.4, 0.85, 1.0)

	if rear_guide_left and rear_guide_right and rear_stop_bar:
		var steer_curve: float = vr_steer * 0.035
		rear_guide_left.rotation_degrees.z = -vr_steer * 15.0
		rear_guide_right.rotation_degrees.z = -vr_steer * 15.0
		rear_guide_left.position.x = -0.11 - steer_curve
		rear_guide_right.position.x = 0.11 - steer_curve
		rear_stop_bar.position.x = -steer_curve * 1.5

	# Animate Media Spectrum Visualizer Bars
	var ticks: float = float(Time.get_ticks_msec()) * 0.005
	for b in range(media_visualizer_bars.size()):
		var bar := media_visualizer_bars[b]
		var val: float = (sin(ticks + float(b) * 0.85) * 0.5 + 0.5) * 0.08 + 0.02
		bar.scale.y = val / 0.06
		bar.position.y = -0.04 + val * 0.5


# ==============================================================================
# COCKPIT & VEHICLE DRIVE ROUTING (STAGE 7)
# ==============================================================================

func _process_vr_cockpit_drive(delta: float) -> void:
	var target_steer := 0.0
	var target_throttle := 0.0
	var target_brake := 0.0

	if xr_active and right_controller and right_controller.get_is_active():
		# Steering via 3D wheel grab or thumbstick
		if wheel_grabbed_hand != -1:
			target_steer = vr_steer
		else:
			var r_stick := right_controller.get_vector2("primary")
			if abs(r_stick.x) > deadzone:
				target_steer = r_stick.x
			elif left_controller and left_controller.get_is_active():
				var l_stick := left_controller.get_vector2("primary")
				if abs(l_stick.x) > deadzone:
					target_steer = l_stick.x

		# Pedals via Triggers: Right = Gas, Left = Brake
		target_throttle = right_controller.get_float("trigger")
		if left_controller and left_controller.get_is_active():
			target_brake = left_controller.get_float("trigger")

		# Gear shift on AX button press
		if right_controller.is_button_pressed("ax_button") and button_cooldown <= 0.0:
			_cycle_gear()
			button_cooldown = 0.35
	else:
		var pads := Input.get_connected_joypads()
		if pads.size() > 0:
			var raw_steer := Input.get_joy_axis(pads[0], axis_steer)
			if abs(raw_steer) > deadzone:
				target_steer = raw_steer
			var raw_gas := Input.get_joy_axis(pads[0], axis_throttle)
			target_throttle = clamp((raw_gas + 1.0) * 0.5, 0.0, 1.0) if raw_gas != 0.0 else 0.0

	# Smooth virtual steering and pedals
	if wheel_grabbed_hand == -1:
		wheel_steer_angle = move_toward(wheel_steer_angle, 0.0, delta * wheel_spring_center_speed * 1.5)
		if abs(target_steer) > deadzone:
			vr_steer = lerp(vr_steer, clamp(target_steer, -1.0, 1.0), delta * wheel_physical_smooth)
			wheel_steer_angle = -vr_steer * (PI * 0.5)
		else:
			vr_steer = move_toward(vr_steer, 0.0, delta * wheel_spring_center_speed)

	vr_throttle = move_toward(vr_throttle, clamp(target_throttle, 0.0, 1.0), throttle_accel_speed * delta)
	vr_brake = move_toward(vr_brake, clamp(target_brake, 0.0, 1.0), throttle_decel_speed * delta)

	# Calculate Simulated Vehicle Speed Physics
	match current_gear:
		GearState.P:
			sim_speed_kmh = move_toward(sim_speed_kmh, 0.0, delta * 60.0)
		GearState.N:
			sim_speed_kmh = move_toward(sim_speed_kmh, 0.0, delta * 8.0)
		GearState.D:
			if vr_brake > 0.05:
				sim_speed_kmh = move_toward(sim_speed_kmh, 0.0, delta * (80.0 * vr_brake + 20.0))
			elif vr_throttle > 0.02:
				sim_speed_kmh = move_toward(sim_speed_kmh, vr_throttle * 220.0, delta * 35.0)
			else:
				sim_speed_kmh = move_toward(sim_speed_kmh, 0.0, delta * 12.0)
		GearState.R:
			if vr_brake > 0.05:
				sim_speed_kmh = move_toward(sim_speed_kmh, 0.0, delta * (70.0 * vr_brake + 20.0))
			elif vr_throttle > 0.02:
				sim_speed_kmh = move_toward(sim_speed_kmh, -vr_throttle * 35.0, delta * 18.0)
			else:
				sim_speed_kmh = move_toward(sim_speed_kmh, 0.0, delta * 10.0)

	# Animate Virtual 3D Steering Wheel & Pedals
	if wheel_pivot:
		wheel_pivot.rotation_degrees.z = -vr_steer * 90.0
	if pedal_gas:
		pedal_gas.rotation_degrees.x = vr_throttle * 20.0
	if pedal_brake:
		pedal_brake.rotation_degrees.x = vr_brake * 20.0
	if gear_lever:
		var gear_pitch: float = [-15.0, -5.0, 5.0, 15.0][current_gear]
		gear_lever.rotation_degrees.x = gear_pitch

	# Calculate Pulse widths for vehicle ESC & Steering servo
	var steer_angle := int(90.0 - vr_steer * 45.0) if not invert_steering else int(90.0 + vr_steer * 45.0)
	var throttle_us := neutral_us

	match current_gear:
		GearState.P, GearState.N:
			throttle_us = neutral_us
		GearState.D:
			if vr_brake > 0.1:
				throttle_us = full_brake_us
			elif vr_throttle > 0.05:
				throttle_us = int(lerp(float(neutral_us), float(max_forward_us), vr_throttle))
		GearState.R:
			if vr_brake > 0.1:
				throttle_us = full_brake_us
			elif vr_throttle > 0.05:
				throttle_us = int(lerp(float(neutral_us), float(max_reverse_us), vr_throttle))

	# Only send packets to real RC vehicle if safety interlock is explicitly ENGAGED and NOT Android
	udp_send_accumulator += delta
	if udp_send_accumulator >= udp_send_interval:
		udp_send_accumulator -= udp_send_interval
		if vr_control_engaged and not is_android:
			udp_packet.encode_u16(0, steer_angle)
			udp_packet.encode_u16(2, throttle_us)
			udp.put_packet(udp_packet)
			packet_count += 1


func _cycle_gear() -> void:
	current_gear = (current_gear + 1) % 4
	_update_gear_display()


func _update_gear_display() -> void:
	if not gear_display:
		return
	var text := "GEAR: "
	text += "[P] " if current_gear == GearState.P else "P "
	text += "[R] " if current_gear == GearState.R else "R "
	text += "[N] " if current_gear == GearState.N else "N "
	text += "[D] " if current_gear == GearState.D else "D "
	gear_display.text = text


func _process_desktop_drive(delta: float) -> void:
	var target_steer := 0.0
	var target_throttle := 0.0
	var gas_percent := 0.0
	var brake_percent := 0.0

	var pads := Input.get_connected_joypads()
	if pads.size() > 0:
		var device_id := pads[0]
		var raw_steer := Input.get_joy_axis(device_id, axis_steer)
		if abs(raw_steer) > deadzone:
			target_steer = raw_steer

		var raw_gas := Input.get_joy_axis(device_id, axis_throttle)
		var raw_brake := Input.get_joy_axis(device_id, axis_brake)
		gas_percent = clamp((raw_gas + 1.0) / 2.0, 0.0, 1.0) if raw_gas != 0.0 else 0.0
		brake_percent = clamp((raw_brake + 1.0) / 2.0, 0.0, 1.0) if raw_brake != 0.0 else 0.0
	else:
		target_steer = float(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) - float(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT))
		gas_percent = 1.0 if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP) else 0.0
		brake_percent = 1.0 if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN) else 0.0

	if gas_percent > 0.0:
		drive_state = DriveState.FORWARD
		was_forward_timer = 1.5
		target_throttle = gas_percent
	elif brake_percent > 0.0:
		match drive_state:
			DriveState.BRAKING:
				state_timer -= delta
				if state_timer <= 0.0:
					drive_state = DriveState.NEUTRAL_RESET
					state_timer = 0.18
			DriveState.NEUTRAL_RESET:
				state_timer -= delta
				if state_timer <= 0.0:
					drive_state = DriveState.REVERSING
					current_throttle = -brake_percent
			DriveState.REVERSING:
				target_throttle = -brake_percent
			_:
				if was_forward_timer > 0.0:
					drive_state = DriveState.BRAKING
					state_timer = 0.25
					current_throttle = -1.0
				else:
					drive_state = DriveState.REVERSING
					target_throttle = -brake_percent
	else:
		drive_state = DriveState.IDLE
		target_throttle = 0.0
		was_forward_timer = max(0.0, was_forward_timer - delta)

	current_steer = lerp(current_steer, target_steer, delta * wheel_physical_smooth)
	if drive_state == DriveState.BRAKING:
		current_throttle = -1.0
	elif drive_state == DriveState.NEUTRAL_RESET:
		current_throttle = 0.0
	else:
		var accel: bool = abs(target_throttle) > abs(current_throttle)
		var rate: float = throttle_accel_speed if accel else throttle_decel_speed
		current_throttle = move_toward(current_throttle, target_throttle, rate * delta)

	var steer_angle := int(90.0 + current_steer * 45.0) if invert_steering else int(90.0 - current_steer * 45.0)
	var throttle_us := neutral_us
	match drive_state:
		DriveState.BRAKING:
			throttle_us = full_brake_us
		DriveState.REVERSING:
			throttle_us = int(lerp(float(neutral_us), float(max_reverse_us), clamp(abs(current_throttle), 0.0, 1.0)))
		_:
			if current_throttle > 0.0:
				throttle_us = int(lerp(float(neutral_us), float(max_forward_us), clamp(current_throttle, 0.0, 1.0)))

	udp_send_accumulator += delta
	if udp_send_accumulator >= udp_send_interval:
		udp_send_accumulator -= udp_send_interval
		udp_packet.encode_u16(0, steer_angle)
		udp_packet.encode_u16(2, throttle_us)
		udp.put_packet(udp_packet)
		packet_count += 1


# ==============================================================================
# UNIFIED HUD & DESKTOP UI
# ==============================================================================

func _update_unified_hud(_delta: float) -> void:
	if not hud_panel_root or not hud_content_label or not hud_visible:
		return

	var hmd_pos := xr_camera.global_position if xr_camera else Vector3.ZERO
	var l_active := left_controller.get_is_active() if left_controller else false
	var r_active := right_controller.get_is_active() if right_controller else false
	var mode_names := ["LIVE FPV", "LOCAL SIMULATION", "COCKPIT TEST"]
	var stream_names := ["UNCONF", "DISCONN", "CONN", "STREAMING", "TIMEOUT", "ERR"]
	var s_name: String = stream_names[stream_state] if stream_state < stream_names.size() else "UNKNOWN"

	var txt := "=== XE RC FPV V18 TELEMETRY ===\n"
	txt += "MODE: %s | GEAR: [%s]\n" % [mode_names[app_mode], ["P", "R", "N", "D"][current_gear]]
	txt += "SPEED: %d KM/H | STEER: %d° | PWR: %d%%\n" % [int(abs(sim_speed_kmh)), int(vr_steer * 45.0), int(vr_throttle * 100.0)]
	txt += "CAMERA: %s | PACKETS: %d\n" % [s_name, packet_count]
	txt += "SAFETY: %s\n" % ("LOCKED VIEW-ONLY (Android)" if is_android else ("ENGAGED" if vr_control_engaged else "STANDBY (Safe)"))
	txt += "HMD: (%.2f, %.2f, %.2f) | FPS: %.0f\n" % [hmd_pos.x, hmd_pos.y, hmd_pos.z, Engine.get_frames_per_second()]
	txt += "TOUCH: L[%s] R[%s] | WHEEL: %s" % [
		"OK" if l_active else "--",
		"OK" if r_active else "--",
		"GRABBED" if wheel_grabbed_hand != -1 else "FREE"
	]

	hud_content_label.text = txt


func _update_diagnostics_hud(_delta: float) -> void:
	if not hud_panel_root or not hud_content_label:
		return
	debug_hud_visible = hud_visible
	if debug_hud:
		debug_hud.visible = hud_visible


func _build_desktop_ui() -> void:
	var layer := CanvasLayer.new()
	layer.name = "DesktopUI"
	add_child(layer)

	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(root)

	desktop_camera_display = TextureRect.new()
	desktop_camera_display.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	desktop_camera_display.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	desktop_camera_display.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	desktop_camera_display.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(desktop_camera_display)

	var panel := PanelContainer.new()
	panel.position = Vector2(18, 18)
	panel.size = Vector2(500, 160)
	root.add_child(panel)

	var box := VBoxContainer.new()
	panel.add_child(box)

	status_label = Label.new()
	status_label.text = "XE RC FPV V18"
	box.add_child(status_label)

	source_label = Label.new()
	source_label.text = "Video: Initializing..."
	box.add_child(source_label)

	var buttons := HBoxContainer.new()
	box.add_child(buttons)

	xr_button = Button.new()
	xr_button.text = "Enter VR"
	xr_button.pressed.connect(enter_xr)
	buttons.add_child(xr_button)

	fullscreen_button = Button.new()
	fullscreen_button.text = "Fullscreen"
	fullscreen_button.pressed.connect(toggle_fullscreen)
	buttons.add_child(fullscreen_button)

	var reset_btn := Button.new()
	reset_btn.text = "Reset Screen"
	reset_btn.pressed.connect(_reset_screen_position)
	buttons.add_child(reset_btn)


func _update_desktop_ui(_delta: float) -> void:
	var age: int = -1
	if last_frame_at_ms > 0:
		age = Time.get_ticks_msec() - last_frame_at_ms

	var source_str := "Direct UDP" if video_source == 0 else "WebSocket Relay"
	if status_label:
		status_label.text = "XE RC FPV V18 | Mode: %s\nFPS≈%.1f | Frames: %d | Drops: %d | Age: %dms" % [
			"VR_COCKPIT" if control_mode == ControlMode.VR_COCKPIT else "DESKTOP",
			Engine.get_frames_per_second(), frame_count, dropped_frames, age
		]
	if source_label:
		source_label.text = "Source: %s | VR: %s | RC Link: %s" % [
			source_str, "ON" if xr_active else "OFF",
			"VIEW-ONLY (Android)" if is_android else ("ENGAGED" if vr_control_engaged else "STANDBY")
		]


# ==============================================================================
# XR SETUP & LIFECYCLE
# ==============================================================================

func _setup_xr() -> void:
	xr_interface = XRServer.find_interface("OpenXR")
	if xr_interface:
		if xr_interface.is_initialized():
			print("[XR] OpenXR available and initialized.")
		else:
			var ok := xr_interface.initialize()
			print("[XR] OpenXR initial initialize() call returned: ", ok)
	else:
		print("[XR] OpenXR interface not found; desktop mode remains active.")


func _start_xr_startup_sequence() -> void:
	if not xr_interface:
		print("[XR] Startup sequence aborted: OpenXR interface not available.")
		return

	for i in range(12):
		if xr_interface.is_initialized():
			await get_tree().create_timer(0.3).timeout
			if not xr_active:
				enter_xr()
			return
		await get_tree().create_timer(0.25).timeout

	if not xr_active:
		if xr_interface.is_initialized():
			enter_xr()
		else:
			push_warning("[XR] Startup sequence completed: OpenXR not yet initialized. Will enter when available.")


func _recenter_xr_pose() -> void:
	if xr_interface and xr_interface.is_initialized():
		XRServer.center_on_hmd(XRServer.RESET_FULL_ROTATION, true)
	_recenter_cockpit()


func enter_xr() -> void:
	if xr_interface == null or not xr_interface.is_initialized():
		push_error("[XR] enter_xr called but OpenXR is not initialized.")
		return
	if xr_active:
		return
	xr_active = true
	get_viewport().use_xr = true
	if desktop_camera_display:
		desktop_camera_display.visible = false
	if xr_button:
		xr_button.text = "Exit VR"
		if xr_button.pressed.is_connected(enter_xr):
			xr_button.pressed.disconnect(enter_xr)
		if not xr_button.pressed.is_connected(exit_xr):
			xr_button.pressed.connect(exit_xr)
	_reset_screen_position()


func exit_xr() -> void:
	xr_active = false
	get_viewport().use_xr = false
	desktop_camera_display.visible = true
	if xr_button:
		xr_button.text = "Enter VR"
		if xr_button.pressed.is_connected(exit_xr):
			xr_button.pressed.disconnect(exit_xr)
		if not xr_button.pressed.is_connected(enter_xr):
			xr_button.pressed.connect(enter_xr)


func toggle_fullscreen() -> void:
	if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F11:
			toggle_fullscreen()
		elif event.keycode == KEY_V and xr_interface and xr_interface.is_initialized():
			if xr_active:
				exit_xr()
			else:
				enter_xr()
		elif event.keycode == KEY_R:
			_reset_screen_position()
		elif event.keycode == KEY_C:
			_recenter_cockpit()
		elif event.keycode == KEY_L:
			_toggle_screen_layout()
		elif event.keycode == KEY_M:
			_toggle_app_mode()
		elif event.keycode == KEY_H:
			_toggle_hud_visibility()
		elif event.keycode == KEY_E:
			_toggle_rc_engage()
