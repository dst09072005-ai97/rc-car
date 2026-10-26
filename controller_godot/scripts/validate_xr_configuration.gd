@tool
extends SceneTree

## Automated Headless Validation Suite — Milestone 3.3
## OpenXR Configuration, Scene Rig, Asset Integrity & Startup Gate Validation

const TARGET_MAIN_SCENE := "res://scenes/vertical_slice_city.tscn"
const TARGET_GLB_PATH := "res://models/vertical_slice_city_block.glb"

var failures: Array[String] = []
var pass_count: int = 0

func _init() -> void:
	print("==================================================================")
	print("AUTOMATED HEADLESS XR CONFIGURATION VALIDATION — MILESTONE 3.3")
	print("==================================================================")

	_check_project_settings()
	_check_scene_hierarchy()
	_check_glb_model()
	_check_startup_script_gate()
	_report_and_exit()

func _check_project_settings() -> void:
	print("\n[Gate 1] Project Settings & OpenXR Configuration:")

	# 1. Main scene configuration
	var main_scene: String = ProjectSettings.get_setting("application/run/main_scene", "")
	if main_scene == TARGET_MAIN_SCENE:
		_record_pass("Main scene correctly set to: " + main_scene)
	else:
		_record_fail("application/run/main_scene is '" + main_scene + "', expected: " + TARGET_MAIN_SCENE)

	# 2. OpenXR enabled
	var openxr_enabled: bool = ProjectSettings.get_setting("xr/openxr/enabled", false)
	if openxr_enabled:
		_record_pass("xr/openxr/enabled is TRUE")
	else:
		_record_fail("xr/openxr/enabled is FALSE or missing")

	# 3. View configuration is stereo (1 or "Stereo")
	var view_config = ProjectSettings.get_setting("xr/openxr/view_configuration", -1)
	if str(view_config) == "1" or str(view_config).to_lower().contains("stereo"):
		_record_pass("xr/openxr/view_configuration is Stereo (value: " + str(view_config) + ")")
	else:
		_record_fail("xr/openxr/view_configuration is " + str(view_config) + ", expected 1 (Stereo)")

	# 4. Form factor is HMD (0 or "HMD")
	var form_factor = ProjectSettings.get_setting("xr/openxr/form_factor", -1)
	if str(form_factor) == "0" or str(form_factor).to_lower().contains("hmd") or str(form_factor).to_lower().contains("head"):
		_record_pass("xr/openxr/form_factor is HMD (value: " + str(form_factor) + ")")
	else:
		_record_fail("xr/openxr/form_factor is " + str(form_factor) + ", expected 0 (HMD)")

	# 5. Shaders enabled
	var shaders_enabled: bool = ProjectSettings.get_setting("xr/shaders/enabled", false)
	if shaders_enabled:
		_record_pass("xr/shaders/enabled is TRUE")
	else:
		_record_fail("xr/shaders/enabled is FALSE or missing")

func _check_scene_hierarchy() -> void:
	print("\n[Gate 2] Scene Hierarchy & XR Camera Rig:")

	if not ResourceLoader.exists(TARGET_MAIN_SCENE):
		_record_fail("Main scene file does not exist: " + TARGET_MAIN_SCENE)
		return

	var scene_res := load(TARGET_MAIN_SCENE) as PackedScene
	if not scene_res:
		_record_fail("Could not load PackedScene: " + TARGET_MAIN_SCENE)
		return

	var root: Node = scene_res.instantiate()
	if not root:
		_record_fail("Could not instantiate scene root: " + TARGET_MAIN_SCENE)
		return

	# Find XROrigin3D and XRCamera3D
	var origins: Array[Node] = []
	var cameras: Array[Node] = []
	var non_xr_cameras: Array[Node] = []
	var static_colliders: Node = null

	_recursive_inspect(root, origins, cameras, non_xr_cameras)
	static_colliders = root.find_child("StaticColliders", true, false)

	if origins.size() == 1 and origins[0] is XROrigin3D:
		_record_pass("Unique valid XROrigin3D found: " + origins[0].name + " (Parent: " + origins[0].get_parent().name + ")")
	else:
		_record_fail("Expected exactly 1 XROrigin3D, found: " + str(origins.size()))

	if cameras.size() == 1 and cameras[0] is XRCamera3D:
		_record_pass("Unique valid XRCamera3D found: " + cameras[0].name + " (Parent: " + cameras[0].get_parent().name + ")")
	else:
		_record_fail("Expected exactly 1 XRCamera3D, found: " + str(cameras.size()))

	if non_xr_cameras.size() == 0:
		_record_pass("No conflicting desktop Camera3D nodes found in scene tree")
	else:
		_record_fail("Found conflicting non-XR Camera3D nodes: " + str(non_xr_cameras.size()))

	if static_colliders:
		_record_pass("StaticColliders node present with " + str(static_colliders.get_child_count()) + " collision shapes")
	else:
		_record_fail("StaticColliders node is missing from runtime scene")

	root.free()

func _check_glb_model() -> void:
	print("\n[Gate 3] Asset Integrity (GLB Model):")
	if ResourceLoader.exists(TARGET_GLB_PATH):
		var glb_packed := load(TARGET_GLB_PATH) as PackedScene
		if glb_packed:
			var inst := glb_packed.instantiate()
			if inst:
				_record_pass("GLB loaded and instantiated successfully: " + TARGET_GLB_PATH)
				inst.free()
			else:
				_record_fail("GLB packed scene failed to instantiate")
		else:
			_record_fail("GLB failed to load as PackedScene")
	else:
		_record_fail("GLB file not found on disk: " + TARGET_GLB_PATH)

func _check_startup_script_gate() -> void:
	print("\n[Gate 4] Startup Script OpenXR Gate:")
	var script_path := "res://scripts/vertical_slice_loader.gd"
	if not FileAccess.file_exists(script_path):
		_record_fail("Startup script not found: " + script_path)
		return

	var file := FileAccess.open(script_path, FileAccess.READ)
	var content := file.get_as_text()
	file.close()

	var required_patterns := [
		"XRServer.find_interface(\"OpenXR\")",
		"get_viewport().use_xr = true",
		"XR_BOOTSTRAP: OPENXR_INITIALIZED",
		"XR_BOOTSTRAP: CAMERA_RIG_VERIFIED",
		"XR_BOOTSTRAP: WORLD_LOADED"
	]

	var all_patterns_found := true
	for p in required_patterns:
		if not content.contains(p):
			_record_fail("Startup script missing required pattern: " + p)
			all_patterns_found = false

	if all_patterns_found:
		_record_pass("Startup script implements all required OpenXR bootstrap gates and log markers")

	print("[Device Gate Note] Physical Meta Quest 3 Hardware Execution: NOT_VERIFIED_ON_DEVICE (Headless mode verification)")

func _recursive_inspect(node: Node, origins: Array[Node], cameras: Array[Node], non_xr: Array[Node]) -> void:
	if node is XROrigin3D:
		origins.append(node)
	elif node is XRCamera3D:
		cameras.append(node)
	elif node is Camera3D:
		non_xr.append(node)

	for child in node.get_children():
		_recursive_inspect(child, origins, cameras, non_xr)

func _record_pass(msg: String) -> void:
	pass_count += 1
	print("  [PASS] ", msg)

func _record_fail(msg: String) -> void:
	failures.append(msg)
	print("  [FAIL] ", msg)

func _report_and_exit() -> void:
	print("\n==================================================================")
	print("SUMMARY: " + str(pass_count) + " passed, " + str(failures.size()) + " failed")
	if failures.size() == 0:
		print("OVERALL STATUS: PASS")
		print("==================================================================")
		quit(0)
	else:
		print("OVERALL STATUS: FAIL")
		for f in failures:
			print(" - ", f)
		print("==================================================================")
		quit(1)
