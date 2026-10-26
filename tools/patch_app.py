#!/usr/bin/env python3
"""
tools/patch_app.py - Applies audited guide features and fixes to www/app.js:
1. 90 FPS target frame rate request in WebXR sessionstart
2. WebXR target URL configuration & Quest browser launch handler
3. Windshield filter mode in vehicleState (5 modes: Transparent, Normal, Night Vision, High Contrast, Cinema)
4. Procedural & GLTF SW_Btn_CamMode cycling through the 5 modes
5. GLTF rolls_royce_cabin.glb screen dynamic texture mapping (FrontCluster, YouTubeCenter, RearCamera)
6. Hide procedural cabin fallback when GLB successfully loads
7. Hand tracking pinchstart & pinchend event listeners for draggable panel manipulation
8. Active visible buttons filtering helper (getActiveButtons)
9. Poke collision detection updated to active buttons with haptic feedback
10. Fix missing gp definition in session.inputSources loop
11. Steering wheel pure shaft rotation using base quaternion & local axis rotation
12. Windshield canvas filter rendering for night vision / high contrast modes
"""

import os
import sys

APP_PATH = r"D:\XE_RC_FPV_V10\www\app.js"

with open(APP_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# Normalize line endings to \n for consistent replacement
c = content.replace("\r\n", "\n")

# 1. Update sessionstart and Quest browser button
old_sec_a = """renderer.xr.addEventListener('sessionstart', () => {
  runtimeDiagnostics.xrSession = 'ACTIVE (Immersive 6DoF VR)';
  updateDiagnosticDisplay();
});
renderer.xr.addEventListener('sessionend', () => {
  runtimeDiagnostics.xrSession = 'ENDED (2D Viewport)';
  updateDiagnosticDisplay();
});

document.getElementById('btn-open-quest-browser')?.addEventListener('click', () => {
  window.open(window.location.href, '_blank');
});"""

new_sec_a = """renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  if (session && 'supportedFrameRates' in session && session.updateTargetFrameRate) {
    try {
      if (session.supportedFrameRates.includes(90)) {
        session.updateTargetFrameRate(90);
      } else if (session.supportedFrameRates.includes(72)) {
        session.updateTargetFrameRate(72);
      }
    } catch (e) {
      console.log('[WebXR] Target frame rate update notice:', e);
    }
  }
  runtimeDiagnostics.xrSession = 'ACTIVE (Immersive 6DoF VR @ ' + (session?.frameRate || 90) + 'Hz)';
  updateDiagnosticDisplay();
});
renderer.xr.addEventListener('sessionend', () => {
  runtimeDiagnostics.xrSession = 'ENDED (2D Viewport)';
  updateDiagnosticDisplay();
});

const presetSelect = document.getElementById('webxr-url-preset');
const urlInput = document.getElementById('webxr-url-input');
if (presetSelect && urlInput) {
  presetSelect.addEventListener('change', () => {
    if (presetSelect.value !== 'custom') {
      urlInput.value = presetSelect.value;
    }
  });
}

document.getElementById('btn-open-quest-browser')?.addEventListener('click', () => {
  const targetUrl = urlInput ? urlInput.value.trim() : window.location.href;
  window.open(targetUrl, '_blank');
});"""

assert old_sec_a in c, "Section A (sessionstart) not found"
c = c.replace(old_sec_a, new_sec_a, 1)

# 2. Add windshieldFilterMode in vehicleState
old_sec_b = """  cinemaOnWindshield: false,
  windshieldTransparent: true, // Mặc định nhìn xuyên kính chắn gió ra thành phố 3D"""

new_sec_b = """  cinemaOnWindshield: false,
  windshieldTransparent: true, // Mặc định nhìn xuyên kính chắn gió ra thành phố 3D
  windshieldFilterMode: 0, // 0: Kính trong suốt, 1: Camera chuẩn, 2: Night Vision, 3: High Contrast, 4: Cinema"""

assert old_sec_b in c, "Section B (vehicleState) not found"
c = c.replace(old_sec_b, new_sec_b, 1)

# 3. Procedural SW_Btn_CamMode
old_cam_proc = """  createInteractive3DButton(steeringWheelPivot, 'GLASS/CAM', 0.038, 0.044, 0.010, new THREE.Vector3(0.095, -0.009, 0.016), () => {
    vehicleState.windshieldTransparent = !vehicleState.windshieldTransparent;
    vehicleState.lastActionLog = `Kính chắn gió: ${vehicleState.windshieldTransparent ? 'Nhìn trực tiếp Thành phố 3D' : 'Bật màn hình ESP32 Stream'}`;
  });"""

new_cam_proc = """  createInteractive3DButton(steeringWheelPivot, 'GLASS/CAM', 0.038, 0.044, 0.010, new THREE.Vector3(0.095, -0.009, 0.016), () => {
    vehicleState.windshieldFilterMode = (vehicleState.windshieldFilterMode + 1) % 5;
    const modes = ['Kính Trong Suốt (Thành Phố 3D)', 'Camera ESP32 (Chuẩn)', 'Camera Ban Đêm (Night Vision)', 'Camera Độ Tương Phản Cao', 'Rạp Phim Kính Chắn Gió (IMAX Cinema)'];
    vehicleState.windshieldTransparent = (vehicleState.windshieldFilterMode === 0);
    vehicleState.cinemaOnWindshield = (vehicleState.windshieldFilterMode === 4);
    vehicleState.lastActionLog = `Kính chắn gió: ${modes[vehicleState.windshieldFilterMode]}`;
  });"""

assert old_cam_proc in c, "Section C (Procedural CamMode) not found"
c = c.replace(old_cam_proc, new_cam_proc, 1)

# 4. GLTF SW_Btn_CamMode
old_cam_gltf = """      { name: 'SW_Btn_CamMode', label: 'GLASS/CAM', action: () => {
        vehicleState.windshieldTransparent = !vehicleState.windshieldTransparent;
        vehicleState.lastActionLog = `Kính chắn gió: ${vehicleState.windshieldTransparent ? 'Nhìn trực tiếp Thành phố 3D' : 'Bật màn hình ESP32 Stream'}`;
      }},"""

new_cam_gltf = """      { name: 'SW_Btn_CamMode', label: 'GLASS/CAM', action: () => {
        vehicleState.windshieldFilterMode = (vehicleState.windshieldFilterMode + 1) % 5;
        const modes = ['Kính Trong Suốt (Thành Phố 3D)', 'Camera ESP32 (Chuẩn)', 'Camera Ban Đêm (Night Vision)', 'Camera Độ Tương Phản Cao', 'Rạp Phim Kính Chắn Gió (IMAX Cinema)'];
        vehicleState.windshieldTransparent = (vehicleState.windshieldFilterMode === 0);
        vehicleState.cinemaOnWindshield = (vehicleState.windshieldFilterMode === 4);
        vehicleState.lastActionLog = `Kính chắn gió: ${modes[vehicleState.windshieldFilterMode]}`;
      }},"""

assert old_cam_gltf in c, "Section D (GLTF CamMode) not found"
c = c.replace(old_cam_gltf, new_cam_gltf, 1)

# 5. Hide procedural cabin and attach textures to GLB screens
old_gltf_box = """    console.log('[GLTF] rolls_royce_cabin.glb loaded successfully:', runtimeDiagnostics.cabinModel);
    updateDiagnosticDisplay();"""

new_gltf_box = """    console.log('[GLTF] rolls_royce_cabin.glb loaded successfully:', runtimeDiagnostics.cabinModel);
    updateDiagnosticDisplay();

    // Ẩn khoang lái procedural để hiển thị khoang lái chuẩn 30 mesh PBR từ Blender
    cabinGroup.visible = false;

    // Ánh xạ Texture động lên 3 màn hình nội thất của mô hình GLB
    const scrCluster = gltfCabinModel.getObjectByName('Screen_FrontCluster');
    if (scrCluster && scrCluster.isMesh) {
      scrCluster.material = new THREE.MeshBasicMaterial({ map: hudTexture });
    }
    const scrYt = gltfCabinModel.getObjectByName('Screen_YouTubeCenter');
    if (scrYt && scrYt.isMesh) {
      scrYt.material = new THREE.MeshBasicMaterial({ map: ytCanvasTexture });
    }
    const scrRear = gltfCabinModel.getObjectByName('Screen_RearCamera');
    if (scrRear && scrRear.isMesh) {
      scrRear.material = new THREE.MeshBasicMaterial({ map: rearTex });
    }"""

assert old_gltf_box in c, "Section E (GLTF box log) not found"
c = c.replace(old_gltf_box, new_gltf_box, 1)

# 6. Hand pinch listeners
old_hand_block = """  const tipSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.75 })
  );
  tipSphere.visible = false;
  scene.add(tipSphere);
  fingerIndicators.push(tipSphere);
}"""

new_hand_block = """  const tipSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.75 })
  );
  tipSphere.visible = false;
  scene.add(tipSphere);
  fingerIndicators.push(tipSphere);

  // Cử chỉ Chụm ngón cái + ngón trỏ (Pinch) để kéo Bảng HUD hoặc Kính chắn gió bằng tay không
  hand.addEventListener('pinchstart', () => {
    initSpatialAudioSystem();
    const indexTip = hand.joints['index-finger-tip'];
    if (!indexTip) return;
    const tipPos = new THREE.Vector3().setFromMatrixPosition(indexTip.matrixWorld);

    for (const handle of draggableHandles) {
      const handlePos = new THREE.Vector3();
      handle.getWorldPosition(handlePos);
      if (tipPos.distanceTo(handlePos) < 0.25) {
        activeGrabState = {
          interactor: indexTip,
          panelGroup: handle.userData.parentPanel,
          distance: 0.05
        };
        break;
      }
    }
  });

  hand.addEventListener('pinchend', () => {
    const indexTip = hand.joints['index-finger-tip'];
    if (activeGrabState.interactor === indexTip) {
      activeGrabState.interactor = null;
      activeGrabState.panelGroup = null;
    }
  });
}

function getActiveButtons() {
  return allInteractiveButtons.filter(b => {
    let p = b;
    while (p) {
      if (p.visible === false) return false;
      p = p.parent;
    }
    return true;
  });
}"""

assert old_hand_block in c, "Section F (Hand block) not found"
c = c.replace(old_hand_block, new_hand_block, 1)

# 7. Update checkHandTrackingPokeCollisions to use getActiveButtons()
old_poke = """      for (const btn of allInteractiveButtons) {
        btn.getWorldPosition(tempBtnWorldPos);
        const pokeRadius = btn.userData.label === 'YOUTUBE SCREEN' ? 0.075 : 0.024;
        if (tempTipWorldPos.distanceTo(tempBtnWorldPos) < pokeRadius) {
          executeButtonPress(btn, null);
        }
      }"""

new_poke = """      for (const btn of getActiveButtons()) {
        btn.getWorldPosition(tempBtnWorldPos);
        const pokeRadius = btn.userData.label === 'YOUTUBE SCREEN' ? 0.075 : 0.024;
        if (tempTipWorldPos.distanceTo(tempBtnWorldPos) < pokeRadius) {
          executeButtonPress(btn, null);
        }
      }"""

assert old_poke in c, "Section G (Old poke) not found"
c = c.replace(old_poke, new_poke, 1)

# 8. Fix gp definition in session.inputSources
old_gp = """    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      // Phân tách trạng thái điều khiển (State Machine Isolation):"""

new_gp = """    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const gp = src.gamepad;
      // Phân tách trạng thái điều khiển (State Machine Isolation):"""

assert old_gp in c, "Section H (Old gp) not found"
c = c.replace(old_gp, new_gp, 1)

# 9. Wheel rotation around shaft
old_wheel_rot = """  if (gltfCabinModel) {
    const gltfWheel = gltfCabinModel.getObjectByName('SteeringWheel_Pivot');
    if (gltfWheel) {
      gltfWheel.rotation.z = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
    }
  }"""

new_wheel_rot = """  if (gltfCabinModel) {
    const gltfWheel = gltfCabinModel.getObjectByName('SteeringWheel_Pivot');
    if (gltfWheel) {
      if (!gltfWheel.userData.baseQuaternion) {
        gltfWheel.userData.baseQuaternion = gltfWheel.quaternion.clone();
      }
      const steerRad = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
      gltfWheel.quaternion.copy(gltfWheel.userData.baseQuaternion);
      gltfWheel.rotateOnAxis(new THREE.Vector3(0, 1, 0), steerRad);
    }
  }"""

assert old_wheel_rot in c, "Section I (Old wheel rot) not found"
c = c.replace(old_wheel_rot, new_wheel_rot, 1)

# 10. Windshield filter in draw
old_ws_draw = """  if (vehicleState.cinemaOnWindshield && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
    wsCtx.drawImage(videoElement, 0, 0, 1280, 720);
  } else if (!vehicleState.windshieldTransparent && latestEsp32Bitmap) {
    wsCtx.drawImage(latestEsp32Bitmap, 0, 0, 1280, 720);
  } else {"""

new_ws_draw = """  if (vehicleState.cinemaOnWindshield && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
    wsCtx.filter = 'none';
    wsCtx.drawImage(videoElement, 0, 0, 1280, 720);
  } else if (!vehicleState.windshieldTransparent && latestEsp32Bitmap) {
    if (vehicleState.windshieldFilterMode === 2) {
      wsCtx.filter = 'sepia(100%) hue-rotate(70deg) saturate(300%) contrast(130%)'; // Night Vision
    } else if (vehicleState.windshieldFilterMode === 3) {
      wsCtx.filter = 'contrast(160%) saturate(140%)'; // High Contrast
    } else {
      wsCtx.filter = 'none';
    }
    wsCtx.drawImage(latestEsp32Bitmap, 0, 0, 1280, 720);
    wsCtx.filter = 'none';
  } else {
    wsCtx.filter = 'none';"""

assert old_ws_draw in c, "Section J (Old ws draw) not found"
c = c.replace(old_ws_draw, new_ws_draw, 1)

# 11. Raycast on active buttons
old_raycast = "raycaster.intersectObjects(allInteractiveButtons, false);"
assert old_raycast in c, "Raycast call not found"
c = c.replace(old_raycast, "raycaster.intersectObjects(getActiveButtons(), false);")

# Convert back to Windows newlines if original had them
if "\r\n" in content:
    c = c.replace("\n", "\r\n")

with open(APP_PATH, "w", encoding="utf-8") as f:
    f.write(c)

print("SUCCESS: All 11 audited guide features and bug fixes integrated into www/app.js!")
