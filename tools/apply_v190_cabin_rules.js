const fs = require('fs');

const appPath = 'app.js';
let content = fs.readFileSync(appPath, 'utf8');

// 1. Ẩn các bảng tên lơ lửng trong buồng lái busSign, fireNotice, ambNotice
content = content.replace(
  /const busSign = createSpeechBubbleSprite\('🚌 KHOANG LÁI XE BUS THÀNH PHỐ[^\n]*\n\s*busSign\.scale\.set[^\n]*\n\s*busSign\.position\.set[^\n]*\n\s*busSign\.visible = true;/g,
  `const busSign = createSpeechBubbleSprite('🚌 KHOANG LÁI XE BUS THÀNH PHỐ (MÁY SOÁT VÉ & CỬA TỰ ĐỘNG)', '#003566', '#ffd60a');
  busSign.scale.set(0.75, 0.16, 1);
  busSign.position.set(0, 1.38, -0.45);
  busSign.visible = false;`
);

content = content.replace(
  /const fireNotice = createSpeechBubbleSprite\('🚒 BUỒNG CHỈ HUY XE CỨU HỎA 114[^\n]*\n\s*fireNotice\.scale\.set[^\n]*\n\s*fireNotice\.position\.set[^\n]*\n\s*fireNotice\.visible = true;/g,
  `const fireNotice = createSpeechBubbleSprite('🚒 BUỒNG CHỈ HUY XE CỨU HỎA 114 (ÁP LỰC VÒI RỒNG: 100%)', '#780000', '#ffbe0b');
  fireNotice.scale.set(0.75, 0.16, 1);
  fireNotice.position.set(0, 1.38, -0.45);
  fireNotice.visible = false;`
);

content = content.replace(
  /const ambNotice = createSpeechBubbleSprite\('🚑 KHOANG Y TẾ XE CẤP CỨU 115[^\n]*\n\s*ambNotice\.scale\.set[^\n]*\n\s*ambNotice\.position\.set[^\n]*\n\s*ambNotice\.visible = true;/g,
  `const ambNotice = createSpeechBubbleSprite('🚑 KHOANG Y TẾ XE CẤP CỨU 115 (MÁY MONITOR & BĂNG CA)', '#0077b6', '#00ff88');
  ambNotice.scale.set(0.75, 0.16, 1);
  ambNotice.position.set(0, 1.38, -0.45);
  ambNotice.visible = false;`
);

// 2. Ẩn tagBubble của activeNpcChauffeurMesh
content = content.replace(
  /const tagBubble = createSpeechBubbleSprite\('👨✈️ Tài xế NPC đang chở bạn[^\n]*\n\s*tagBubble\.scale\.set[^\n]*\n\s*tagBubble\.position\.set[^\n]*\n\s*tagBubble\.visible = true;/g,
  `const tagBubble = createSpeechBubbleSprite('👨✈️ Tài xế NPC đang chở bạn (Bấm [Đổi Lái] để cầm lái)', '#0f172a', '#00ff88');
    tagBubble.scale.set(0.75, 0.16, 1);
    tagBubble.position.set(0, 1.24, 0);
    tagBubble.visible = false;`
);

// 3. Cô lập hoàn toàn vòi rồng xe cứu hỏa updateFiretruckRoofTurretWaterCannon
const oldWaterCannonFn = `function updateFiretruckRoofTurretWaterCannon(dt, elapsed) {
  const isOnRoofTurret = (state.playerMode === 'DRIVING' && state.activeSpecialSeatKey === 'ROOF_TURRET');

  if (isOnRoofTurret && firetruckRoofTurretPivot) {
    // Vòi rồng xoay 360° trái/phải và nâng/hạ theo đúng hướng mắt nhìn thứ 1 của người chơi!
    firetruckRoofTurretPivot.rotation.y = state.eyeLookYaw || 0;
    firetruckRoofTurretPivot.rotation.x = THREE.MathUtils.clamp(state.eyeLookPitch || 0, -0.5, 0.65);
  }

  const shouldSpray = manualWaterSprayActive || (isOnRoofTurret && (keys.w || holdState.gas || state.hornActive));`;

const newWaterCannonFn = `function updateFiretruckRoofTurretWaterCannon(dt, elapsed) {
  const isFiretruck = (state.playerMode === 'DRIVING' && state.currentBoardedType === 'FIRETRUCK');
  if (!isFiretruck) {
    manualWaterSprayActive = false;
    if (typeof manualTurretWaterDrops !== 'undefined') {
      for (const drop of manualTurretWaterDrops) {
        if (drop && drop.mesh) drop.mesh.visible = false;
      }
    }
    return;
  }

  const isOnRoofTurret = (state.activeSpecialSeatKey === 'ROOF_TURRET');

  if (isOnRoofTurret && firetruckRoofTurretPivot) {
    // Vòi rồng xoay 360° trái/phải và nâng/hạ theo đúng hướng mắt nhìn thứ 1 của người chơi!
    firetruckRoofTurretPivot.rotation.y = state.eyeLookYaw || 0;
    firetruckRoofTurretPivot.rotation.x = THREE.MathUtils.clamp(state.eyeLookPitch || 0, -0.5, 0.65);
  }

  const shouldSpray = isFiretruck && (manualWaterSprayActive || (isOnRoofTurret && (keys.w || holdState.gas || state.hornActive)));`;

if (content.includes(oldWaterCannonFn.replace(/\n/g, '\r\n'))) {
  content = content.replace(oldWaterCannonFn.replace(/\n/g, '\r\n'), newWaterCannonFn.replace(/\n/g, '\r\n'));
} else if (content.includes(oldWaterCannonFn)) {
  content = content.replace(oldWaterCannonFn, newWaterCannonFn);
}

// 4. Khóa nút bấm xịt nước trên UI nếu không phải Xe Cứu Hỏa
const oldSprayBtn = `const sprayBtnEl = document.getElementById('btn-spray-water-cannon');
if (sprayBtnEl) {
  sprayBtnEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    if (state.activeSpecialSeatKey !== 'ROOF_TURRET') {
      switchToSpecialVehicleSeat('ROOF_TURRET');
    }
    manualWaterSprayActive = true;
    state.lastActionLog = '💦 ĐANG BẮN VÒI RỒNG ÁP LỰC CAO TỪ NÓC XE CỨU HỎA! Xoay góc nhìn để điều hướng dòng nước!';
  });`;

const newSprayBtn = `const sprayBtnEl = document.getElementById('btn-spray-water-cannon');
if (sprayBtnEl) {
  sprayBtnEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    if (state.currentBoardedType !== 'FIRETRUCK') {
      manualWaterSprayActive = false;
      state.lastActionLog = '⚠️ Vòi rồng xịt nước chỉ hoạt động trên Xe Cứu Hỏa!';
      return;
    }
    if (state.activeSpecialSeatKey !== 'ROOF_TURRET') {
      switchToSpecialVehicleSeat('ROOF_TURRET');
    }
    manualWaterSprayActive = true;
    state.lastActionLog = '💦 ĐANG BẮN VÒI RỒNG ÁP LỰC CAO TỪ NÓC XE CỨU HỎA! Xoay góc nhìn để điều hướng dòng nước!';
  });`;

if (content.includes(oldSprayBtn.replace(/\n/g, '\r\n'))) {
  content = content.replace(oldSprayBtn.replace(/\n/g, '\r\n'), newSprayBtn.replace(/\n/g, '\r\n'));
} else if (content.includes(oldSprayBtn)) {
  content = content.replace(oldSprayBtn, newSprayBtn);
}

// 5. Thay thế khối boardAnyNpcVehicleV160 và các hàm liên quan sang hệ thống V190 Master Cabin Seating
const targetBlockStart = '// --- 20.6. SỬA LỖI LÊN / XUỐNG XE NPC:';
const targetBlockEnd = '  // Gắn lại các nút Lên/Xuống xe trên UI để gọi đúng hàm mới';

const idxStart = content.indexOf(targetBlockStart);
const idxEnd = content.indexOf(targetBlockEnd);

if (idxStart !== -1 && idxEnd !== -1) {
  const replacementV190 = `// --- 20.6. V190 MASTER ENGINE: QUY TẮC KHOANG CABIN XE GÓC NHÌN GHẾ LÁI / GHẾ PHỤ
  //           VÀ CÁCH LY CHỨC NĂNG RIÊNG CHO MỌI LOẠI XE (4 BÁNH ĐẾN 2 BÁNH)
  //           1. LÊN XE NPC: VÀO NGAY GHẾ LÁI (seatIndex = 0), NPC ẨN 100%, NHÌN THẤY 85% VÔ LĂNG,
  //              KÍNH HẬU CỬA + GIỮA, TÁP-LÔ YOUTUBE, KÍNH CHẮN GIÓ & TRẦN NÓC KHÔNG BỊ VƯỚNG BẢNG TÊN.
  //           2. ĐỔI SANG GHẾ PHỤ: NPC MỚI ĐƯỢC SPAWN RA NGAY GHẾ LÁI ĐỂ CHỞ BẠN (TỰ LÁI NPC).
  //           3. XUỐNG XE: NPC TỰ ĐỘNG HIỆN RA NGAY GHẾ LÁI XE NPC (KHÔNG CÓ NPC NÀO Ở GIỮA CABIN).
  //           4. KHOANG CABIN GHẾ PHỤ ĐẶC BIỆT CHO TỪNG LOẠI XE (BUS, CỨU HỎA, CẤP CỨU, CẢNH SÁT, TAXI, XE MÁY, XE ĐẠP).
  //           5. CHỨC NĂNG TỪNG XE (PHUN NƯỚC, CÒI HÚ, CỬA BUS) ĐƯỢC CÁCH LY 100% ĐÚNG XE.
  let abandonedNpcCarRecord = null;

  const VEHICLE_CABIN_RULES = {
    ROLLS_ROYCE: {
      driver:    { name: 'Ghế Lái Rolls-Royce Ghost Bespoke', pos: new THREE.Vector3(-0.42, 0.0, 0.14), pitch: -0.135, yaw: 0 },
      passenger: { name: 'Ghế Phụ Rolls-Royce (Bên cạnh)',   pos: new THREE.Vector3(0.42, 0.0, 0.14), pitch: -0.11, yaw: 0 },
      vipLeft:   { name: 'Ghế VIP Sau Trái',                 pos: new THREE.Vector3(-0.42, 0.04, 1.02), pitch: -0.06, yaw: 0 },
      vipRight:  { name: 'Ghế VIP Sau Phải',                 pos: new THREE.Vector3(0.42, 0.04, 1.02), pitch: -0.06, yaw: 0 }
    },
    CAR: {
      driver:    { name: 'Ghế Lái Ô Tô / Taxi',              pos: new THREE.Vector3(-0.38, 0.0, 0.12), pitch: -0.135, yaw: 0 },
      passenger: { name: 'Ghế Phụ Ô Tô / Taxi',              pos: new THREE.Vector3(0.38, 0.0, 0.12), pitch: -0.11, yaw: 0 }
    },
    POLICE: {
      driver:    { name: 'Ghế Lái Cảnh Sát Tuần Tra',        pos: new THREE.Vector3(-0.42, 0.04, 0.12), pitch: -0.135, yaw: 0 },
      passenger: { name: 'Ghế Phụ Tác Chiến (Laptop Radar)', pos: new THREE.Vector3(0.42, 0.04, 0.12), pitch: -0.11, yaw: -0.08 }
    },
    AMBULANCE: {
      driver:    { name: 'Ghế Lái Cấp Cứu 115',              pos: new THREE.Vector3(-0.46, 0.14, 0.08), pitch: -0.14, yaw: 0 },
      passenger: { name: 'Ghế Phụ Bác Sĩ Cấp Cứu',           pos: new THREE.Vector3(0.46, 0.14, 0.08), pitch: -0.11, yaw: 0 },
      leftRow:   { name: 'Băng Ghế Y Tế Thùng Xe',           pos: new THREE.Vector3(-0.68, 0.30, 1.25), pitch: -0.07, yaw: -0.25 },
      rightRow:  { name: 'Ghế Bác Sĩ Kế Máy Monitor',        pos: new THREE.Vector3(0.68, 0.30, 1.25), pitch: -0.07, yaw: 0.25 },
      rearEnd:   { name: 'Ghế Cuối Thùng Cấp Cứu',           pos: new THREE.Vector3(0.0, 0.34, 2.38), pitch: -0.05, yaw: 0 }
    },
    FIRETRUCK: {
      driver:     { name: 'Ghế Chỉ Huy Lái Xe Cứu Hỏa',      pos: new THREE.Vector3(-0.50, 1.48, -2.15), pitch: -0.14, yaw: 0 },
      passenger:  { name: 'Ghế Phụ Cứu Hỏa',                 pos: new THREE.Vector3(0.50, 1.48, -2.15), pitch: -0.12, yaw: 0 },
      roofTurret: { name: 'Đài Nóc Vòi Rồng Phun Nước',      pos: new THREE.Vector3(0.0, 2.55, -1.50), pitch: 0.0, yaw: 0 },
      rearEnd:    { name: 'Khoang Thiết Bị Bơm Cứu Hỏa',     pos: new THREE.Vector3(0.0, 1.42, 1.65), pitch: -0.06, yaw: 0 }
    },
    BUS: {
      driver:    { name: 'Ghế Tài Xế Xe Bus',                pos: new THREE.Vector3(-0.52, 0.24, -0.05), pitch: -0.13, yaw: 0 },
      passenger: { name: 'Ghế Phụ Đầu Xe Bus',               pos: new THREE.Vector3(0.52, 0.24, -0.05), pitch: -0.10, yaw: 0 },
      leftRow:   { name: 'Ghế Dãy Trái Xe Bus',              pos: new THREE.Vector3(-0.68, 0.32, 0.95), pitch: -0.06, yaw: -0.12 },
      rightRow:  { name: 'Ghế Dãy Phải Xe Bus',              pos: new THREE.Vector3(0.68, 0.32, 0.95), pitch: -0.06, yaw: 0.12 },
      rearEnd:   { name: 'Ghế Cuối Dãy Xe Bus',              pos: new THREE.Vector3(0.0, 0.42, 2.85), pitch: -0.04, yaw: 0 }
    },
    TRUCK: {
      driver:    { name: 'Ghế Lái Đầu Kéo Xe Tải',           pos: new THREE.Vector3(-0.42, 0.22, -0.05), pitch: -0.135, yaw: 0 },
      passenger: { name: 'Ghế Phụ Xe Tải',                  pos: new THREE.Vector3(0.42, 0.22, -0.05), pitch: -0.11, yaw: 0 },
      leftRow:   { name: 'Ghế Dãy Trái Thùng Tải',           pos: new THREE.Vector3(-0.78, 0.24, 1.35), pitch: -0.06, yaw: -0.2 },
      rightRow:  { name: 'Ghế Dãy Phải Thùng Tải',           pos: new THREE.Vector3(0.78, 0.24, 1.35), pitch: -0.06, yaw: 0.2 },
      rearEnd:   { name: 'Ghế Cuối Thùng Xe Tải',            pos: new THREE.Vector3(0.0, 0.28, 2.75), pitch: -0.05, yaw: 0 }
    },
    MOTORBIKE: {
      driver:    { name: 'Cầm Lái Ghi-Đông Xe Máy',          pos: new THREE.Vector3(-0.42, 0.12, 0.08), pitch: -0.16, yaw: 0 },
      passenger: { name: 'Yên Sau Xe Máy (Ghế Phụ)',         pos: new THREE.Vector3(-0.42, 0.24, 0.52), pitch: -0.10, yaw: 0 }
    },
    BICYCLE: {
      driver:    { name: 'Cầm Lái Ghi-Đông Xe Đạp',          pos: new THREE.Vector3(-0.42, 0.10, 0.06), pitch: -0.16, yaw: 0 },
      passenger: { name: 'Gác-Ba-Ga Yên Sau Xe Đạp',         pos: new THREE.Vector3(-0.42, 0.22, 0.50), pitch: -0.10, yaw: 0 }
    }
  };

  // Hàm thiết lập vị trí ngồi, góc chúi base pitch & trạng thái hiển thị NPC theo đúng rules
  window.applyUnifiedCabinSeat = function(category, seatRole) {
    const catRules = VEHICLE_CABIN_RULES[category] || VEHICLE_CABIN_RULES.CAR;
    const seatConfig = catRules[seatRole] || catRules.driver;

    const isDriver = (seatRole === 'driver');
    state.seatIndex = isDriver ? 0 : 1;
    state.activeSpecialSeatKey = seatRole === 'roofTurret' ? 'ROOF_TURRET' : 'DRIVER';

    // Cập nhật tọa độ SEAT_POSITIONS
    SEAT_POSITIONS[0].pos.copy(catRules.driver.pos);
    if (catRules.passenger) SEAT_POSITIONS[1].pos.copy(catRules.passenger.pos);

    // Gắn driverSeatMount vào vị trí chuẩn của ghế
    driverSeatMount.position.copy(seatConfig.pos);

    // Đặt cameraRig công thái học tại vị trí ngồi tự nhiên
    cameraRig.position.set(0, -0.06, 0.05);

    // Góc chúi chuẩn (base pitch) để nhìn thấy 85% vô lăng và kính hậu
    state.baseCabinPitch = seatConfig.pitch;
    state.eyeLookPitch = 0;
    state.eyeLookYaw = seatConfig.yaw || 0;

    cameraRig.rotation.order = 'YXZ';
    cameraRig.rotation.y = state.eyeLookYaw;
    cameraRig.rotation.x = state.baseCabinPitch;

    if (!renderer.xr.isPresenting) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = state.eyeLookYaw;
      camera.rotation.x = state.baseCabinPitch;
    }

    // RULE BẮT BUỘC VỀ NPC LÁI XE:
    // 1. Khi ở Ghế Lái: NPC BẮT BUỘC ẨN (không để bất kỳ NPC nào ở ghế lái hay giữa xe)!
    // 2. Khi đổi sang Ghế Phụ: NPC mới được spawn ra ngay Ghế Lái để lái xe chở người chơi!
    if (isDriver) {
      activeNpcChauffeurMesh.visible = false;
    } else {
      activeNpcChauffeurMesh.visible = true;
      activeNpcChauffeurMesh.position.copy(catRules.driver.pos);
    }

    // Ẩn tuyệt đối mọi bảng tên npc lơ lửng chắn kính chắn gió
    if (typeof tagBubble !== 'undefined' && tagBubble) tagBubble.visible = false;

    // Ẩn toàn bộ khách ảo của Rolls-Royce khi sang xe khác hoặc khi ngồi đè lên ghế
    if (typeof passengerAvatars !== 'undefined') {
      passengerAvatars.forEach((p) => {
        p.visible = (category === 'ROLLS_ROYCE' && state.seatIndex !== p.userData?.guestInfo?.seatIdx);
      });
    }

    // Cách ly tính năng xịt nước: Chỉ cho phép xịt khi đang ngồi Nóc Vòi Xịt của Xe Cứu Hỏa
    if (seatRole !== 'roofTurret' || category !== 'FIRETRUCK') {
      manualWaterSprayActive = false;
      if (typeof manualTurretWaterDrops !== 'undefined') {
        manualTurretWaterDrops.forEach((d) => { if (d && d.mesh) d.mesh.visible = false; });
      }
    }

    state.lastActionLog = isDriver
      ? \`🛞 [Ghế Lái - 85% Vô Lăng]: Đang cầm lái [\${seatConfig.name}]! Thấy rõ vô-lăng, kính hậu, táp-lô YouTube & kính lái!\`
      : \`💺 [Ghế Phụ]: Đang ngồi [\${seatConfig.name}]! Tài xế NPC đã xuất hiện ở ghế lái để chở bạn đi!\`;
  };

  // Cập nhật giao diện thanh chọn ghế & chức năng riêng biệt đúng 100% từng loại xe
  window.updateVehicleCockpitBarForCategory = function(category) {
    const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
    if (!hvBar) return;

    if (state.playerMode !== 'DRIVING') {
      hvBar.style.display = 'none';
      return;
    }

    hvBar.style.display = 'flex';
    hvBar.classList.remove('active-bus-bar', 'active-fire-bar', 'active-heavy-bar');

    let html = '';
    if (category === 'BUS') {
      html = \`
        <button id="btn-seat-driver-cab" class="hv-btn" style="background:#9b5de5;color:#fff;">🛞 Ghế Lái Bus</button>
        <button id="btn-seat-front-pass" class="hv-btn" style="background:#00f5d4;color:#000;">💺 Ghế Phụ Đầu Xe</button>
        <button id="btn-seat-left-row" class="hv-btn" style="background:#00bbf9;color:#000;">💺 Ghế Dãy Trái</button>
        <button id="btn-seat-right-row" class="hv-btn" style="background:#4cd964;color:#000;">💺 Ghế Dãy Phải</button>
        <button id="btn-seat-rear-end" class="hv-btn" style="background:#ffd60a;color:#000;">🚌 Ghế Cuối Dãy</button>
      \`;
    } else if (category === 'FIRETRUCK') {
      html = \`
        <button id="btn-seat-driver-cab" class="hv-btn" style="background:#9b5de5;color:#fff;">🛞 Ghế Lái Chỉ Huy</button>
        <button id="btn-seat-front-pass" class="hv-btn" style="background:#00f5d4;color:#000;">💺 Ghế Phụ Cứu Hỏa</button>
        <button id="btn-fire-roof-turret" class="hv-btn" style="background:#ff4d6d;color:#fff;">🚒 Nóc Vòi Xịt</button>
        <button id="btn-spray-water-cannon" class="hv-btn" style="background:#00f5d4;color:#000;">💦 BẮN VÒI NƯỚC (GIỮ)</button>
        <button id="btn-turret-siren-wail" class="hv-btn" style="background:#ffd60a;color:#000;">🚨 Còi Hú 114</button>
      \`;
    } else if (category === 'AMBULANCE') {
      html = \`
        <button id="btn-seat-driver-cab" class="hv-btn" style="background:#9b5de5;color:#fff;">🛞 Ghế Lái 115</button>
        <button id="btn-seat-front-pass" class="hv-btn" style="background:#00f5d4;color:#000;">💺 Ghế Phụ Bác Sĩ</button>
        <button id="btn-seat-left-row" class="hv-btn" style="background:#00bbf9;color:#000;">🏥 Băng Ghế Y Tế</button>
        <button id="btn-seat-rear-end" class="hv-btn" style="background:#ffd60a;color:#000;">🚑 Ghế Cuối Thùng</button>
      \`;
    } else if (category === 'POLICE') {
      html = \`
        <button id="btn-seat-driver-cab" class="hv-btn" style="background:#9b5de5;color:#fff;">🛞 Ghế Lái Tuần Tra</button>
        <button id="btn-seat-front-pass" class="hv-btn" style="background:#00e5ff;color:#000;">💺 Ghế Phụ Tác Chiến (Radar)</button>
      \`;
    } else if (category === 'MOTORBIKE' || category === 'BICYCLE') {
      const isMoto = category === 'MOTORBIKE';
      html = \`
        <button id="btn-seat-driver-cab" class="hv-btn" style="background:#9b5de5;color:#fff;">\${isMoto ? '🏍️ Cầm Lái Xe Máy' : '🚲 Cầm Lái Xe Đạp'}</button>
        <button id="btn-seat-front-pass" class="hv-btn" style="background:#00f5d4;color:#000;">🛵 Yên Sau (Ghế Phụ)</button>
      \`;
    } else {
      html = \`
        <button id="btn-seat-driver-cab" class="hv-btn" style="background:#9b5de5;color:#fff;">🛞 Ghế Lái</button>
        <button id="btn-seat-front-pass" class="hv-btn" style="background:#00f5d4;color:#000;">💺 Ghế Phụ</button>
      \`;
    }

    hvBar.innerHTML = html;

    // Gắn sự kiện chuyển ghế cho các nút
    document.getElementById('btn-seat-driver-cab')?.addEventListener('click', () => window.applyUnifiedCabinSeat(category, 'driver'));
    document.getElementById('btn-seat-front-pass')?.addEventListener('click', () => window.applyUnifiedCabinSeat(category, 'passenger'));
    document.getElementById('btn-seat-left-row')?.addEventListener('click', () => window.applyUnifiedCabinSeat(category, 'leftRow'));
    document.getElementById('btn-seat-right-row')?.addEventListener('click', () => window.applyUnifiedCabinSeat(category, 'rightRow'));
    document.getElementById('btn-seat-rear-end')?.addEventListener('click', () => window.applyUnifiedCabinSeat(category, 'rearEnd'));

    if (category === 'FIRETRUCK') {
      document.getElementById('btn-fire-roof-turret')?.addEventListener('click', () => window.applyUnifiedCabinSeat(category, 'roofTurret'));
      const sprayEl = document.getElementById('btn-spray-water-cannon');
      if (sprayEl) {
        sprayEl.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          initAudio();
          manualWaterSprayActive = true;
          state.lastActionLog = '💦 ĐANG BẮN VÒI RỒNG ÁP LỰC CAO TỪ NÓC XE CỨU HỎA!';
        });
        window.addEventListener('pointerup', () => { manualWaterSprayActive = false; });
      }
      document.getElementById('btn-turret-siren-wail')?.addEventListener('click', () => {
        if (typeof toggleFiretruckTurretWailSiren === 'function') toggleFiretruckTurretWailSiren();
      });
    }
  };

  window.boardAnyNpcVehicleV160 = function(veh) {
    if (!veh || !veh.userData) return;
    initAudio();

    if (abandonedNpcCarRecord && abandonedNpcCarRecord.veh === veh) {
      abandonedNpcCarRecord = null;
    }

    if (state.boardedNpcVehicleRef && state.boardedNpcVehicleRef !== veh) {
      state.boardedNpcVehicleRef.visible = true;
      state.boardedNpcVehicleRef.userData.isBoardedByPlayer = false;
    }

    const vd = veh.userData;
    state.boardedNpcVehicleRef = veh;
    state.currentBoardedType = vd.category || 'CAR';
    vd.isBoardedByPlayer = true;

    vehicleRoot.position.copy(veh.position);
    state.headingRad = vd.headingRad ?? veh.rotation.y;
    vehicleRoot.rotation.y = state.headingRad;
    veh.visible = false;

    const isTwoWheel = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
    setCarBodyVisibilityForTwoWheelMode(isTwoWheel);
    rebuildDistinctInteriorByVehicleCategory(state.currentBoardedType, vd.interiorTheme);

    if (vd.interiorTheme?.bodyHex) {
      matBodyPaint.color.setHex(vd.interiorTheme.bodyHex);
    }

    // RULE 1: KHI LÊN XE NPC, MẶC ĐỊNH VÀO NGAY GHẾ LÁI (seatIndex = 0)!
    // NPC ẨN 100%, nhìn thấy 85% vô lăng & kính hậu, YouTube táp-lô, không vướng bảng tên!
    window.applyUnifiedCabinSeat(state.currentBoardedType, 'driver');

    if (state.playerMode !== 'DRIVING') {
      state.playerMode = 'DRIVING';
      state.doorsOpen = false;
      state.engineRunning = true;
      avatarBodyMesh.visible = false;
      driverSeatMount.add(cameraRig);
      cameraRig.position.set(0, -0.06, 0.05);
      roofBeaconGroup.visible = false;
    }

    window.updateVehicleCockpitBarForCategory(state.currentBoardedType);
  };

  // Ghi đè hàm boardAnyNpcVehicle cũ
  window.boardAnyNpcVehicle = window.boardAnyNpcVehicleV160;

  // Khi bấm nút Đổi Lái / Ghế Phụ (Nút C hoặc UI): Hoán đổi giữa Ghế Lái và Ghế Phụ
  const origSwapSeat = swapSeatOrTakeDriverControl;
  window.swapSeatOrTakeDriverControl = function() {
    if (state.boardedNpcVehicleRef) {
      const cat = state.currentBoardedType || 'CAR';
      // Nếu đang cầm lái (seatIndex === 0) -> chuyển sang ghế phụ để NPC lái chở bạn đi!
      // Nếu đang ở ghế phụ -> chuyển về ghế lái để tự cầm lái, NPC ẩn đi!
      if (state.seatIndex === 0) {
        window.applyUnifiedCabinSeat(cat, 'passenger');
      } else {
        window.applyUnifiedCabinSeat(cat, 'driver');
      }
      return;
    }
    origSwapSeat();
  };

  const btnSwapEl = document.getElementById('btn-swap-driver');
  if (btnSwapEl) {
    const clonedSwap = btnSwapEl.cloneNode(true);
    btnSwapEl.parentNode.replaceChild(clonedSwap, btnSwapEl);
    clonedSwap.addEventListener('click', () => window.swapSeatOrTakeDriverControl());
  }

  // Khi người chơi xuống xe khỏi xe NPC (enterOrExitCarWithBlink):
  // 1. NPC chở bạn sẽ TỰ ĐỘNG HIỆN RA Ở GHẾ LÁI xe NPC tại đúng vị trí đó!
  // 2. Không để bất kỳ NPC nào ở giữa khoang cabin xe!
  // 3. Khóa toàn bộ súng phun nước, còi hú và reset khoang xe.
  const prevEnterOrExitV160 = window.enterOrExitCarWithBlink;
  window.enterOrExitCarWithBlink = function() {
    if (state.playerMode === 'DRIVING' && state.boardedNpcVehicleRef) {
      const npcVeh = state.boardedNpcVehicleRef;
      const vd = npcVeh.userData;
      const playerWasDriving = (state.seatIndex === 0);

      // Đặt chiếc xe NPC hiện lại ngay tại vị trí vừa dừng
      npcVeh.position.copy(vehicleRoot.position);
      vd.headingRad = state.headingRad;
      vd.targetHeadingRad = state.headingRad;
      npcVeh.rotation.set(0, state.headingRad, 0);
      npcVeh.visible = true;
      vd.isBoardedByPlayer = false;

      // ĐẢM BẢO NPC TỰ ĐỘNG HIỆN RA NGAY Ở KHOANG GHẾ LÁI XE NPC KHI BẠN XUỐNG XE!
      if (vd.cabinDriverMesh) vd.cabinDriverMesh.visible = true;
      if (vd.chauffeurMesh) vd.chauffeurMesh.visible = true;

      // Ẩn NPC chauffeur trong khoang xe của người chơi
      activeNpcChauffeurMesh.visible = false;
      if (typeof tagBubble !== 'undefined' && tagBubble) tagBubble.visible = false;

      // Khóa và reset toàn bộ chức năng đặc biệt
      manualWaterSprayActive = false;
      if (typeof manualTurretWaterDrops !== 'undefined') {
        manualTurretWaterDrops.forEach((d) => { if (d && d.mesh) d.mesh.visible = false; });
      }
      turretSirenActive = false;
      if (typeof turretSirenGain !== 'undefined' && turretSirenGain && audioCtx) {
        turretSirenGain.gain.setValueAtTime(0, audioCtx.currentTime);
      }

      state.boardedNpcVehicleRef = null;
      state.currentBoardedType = 'ROLLS_ROYCE';
      state.activeSpecialSeatKey = 'DRIVER';
      setCarBodyVisibilityForTwoWheelMode(false);
      rebuildDistinctInteriorByVehicleCategory('ROLLS_ROYCE');

      const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
      if (hvBar) hvBar.style.display = 'none';

      // Đặt người chơi bước xuống đứng cạnh chiếc xe NPC vừa đi
      state.playerMode = 'ON_FOOT';
      state.doorsOpen = false;
      state.velocityMs = 0;
      state.speedKmh = 0;
      avatarBodyMesh.visible = true;
      roofBeaconGroup.visible = true;

      const stepOutOffset = new THREE.Vector3(1.85, 0.24, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), vd.headingRad);
      state.avatarPos.copy(npcVeh.position).add(stepOutOffset);
      playerAvatarGroup.position.copy(state.avatarPos);
      playerAvatarGroup.add(cameraRig);
      cameraRig.position.set(0, 0.52, 0);
      cameraRig.rotation.set(0, 0, 0);
      if (!renderer.xr.isPresenting) camera.rotation.set(0, 0, 0);

      // Đưa chiếc Rolls-Royce riêng của bạn về vị trí đỗ cạnh nhà
      if (typeof HOME_CAR_SPAWN_POS !== 'undefined') {
        vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
        vehicleRoot.rotation.y = 0;
      }

      if (playerWasDriving) {
        vd.waitPlayerReturnTimer = 5.0;
        vd.activeSpeed = 0;
        if (vd.hornBadge) vd.hornBadge.visible = true;
        abandonedNpcCarRecord = { veh: npcVeh, timer: 5.0 };
        state.lastActionLog = \`⏱️ Bạn vừa xuống xe [\${vd.modelName}]. NPC đã xuất hiện ở ghế lái, đợi 5 giây rồi tự chạy tiếp!\`;
      } else {
        vd.waitPlayerReturnTimer = 0;
        state.lastActionLog = \`👋 Bạn đã xuống xe [\${vd.modelName}]. Tài xế NPC trong ghế lái đang tiếp tục hành trình!\`;
      }
      return;
    }

    prevEnterOrExitV160();
  };
`;

  content = content.slice(0, idxStart) + replacementV190 + '\n  ' + content.slice(idxEnd);
} else {
  console.error('Target block not found!');
  process.exit(1);
}

// 6. Gắn vào hook render cuối cùng để giữ vững góc nhìn buồng lái 85% vô lăng
const renderHookTarget = 'resolveVehicleNpcCollisions(dt);';
const renderHookAdd = `resolveVehicleNpcCollisions(dt);

      // V190: Duy trì góc nhìn buồng lái công thái học thấy 85% vô lăng & kính hậu khi lái xe
      if (state.playerMode === 'DRIVING') {
        const cat = state.currentBoardedType || 'CAR';
        const catRule = VEHICLE_CABIN_RULES[cat] || VEHICLE_CABIN_RULES.CAR;
        const bPitch = (state.seatIndex === 0)
          ? (catRule.driver?.pitch ?? -0.135)
          : (catRule.passenger?.pitch ?? -0.10);
        state.baseCabinPitch = bPitch;

        if (!rendererInst.xr.isPresenting) {
          const compPitch = (typeof tilt360State !== 'undefined' && tilt360State && tilt360State.computedPitch) ? tilt360State.computedPitch : 0;
          camera.rotation.x = bPitch + (state.eyeLookPitch || 0) + compPitch;
          cameraRig.rotation.x = bPitch + (state.eyeLookPitch || 0);
        }
      }`;

if (content.includes(renderHookTarget)) {
  content = content.replace(renderHookTarget, renderHookAdd);
}

// 7. Cập nhật playSmartVehicleHornSound để hỗ trợ đầy đủ các loại xe đặc biệt
const hornTarget = `function playSmartVehicleHornSound(category) {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  if (category === 'BICYCLE') {`;

const newHornCode = `function playSmartVehicleHornSound(category) {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  if (category === 'FIRETRUCK') {
    [185, 240].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 950;
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.56);
    });
    return;
  } else if (category === 'AMBULANCE') {
    [440, 554].forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);
      g.gain.setValueAtTime(0.16, now + idx * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.18);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.19);
    });
    return;
  } else if (category === 'POLICE') {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(1150, now + 0.28);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
    return;
  } else if (category === 'BUS') {
    [260, 320].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 850;
      g.gain.setValueAtTime(0.16, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.46);
    });
    return;
  } else if (category === 'BICYCLE') {`;

if (content.includes(hornTarget.replace(/\n/g, '\r\n'))) {
  content = content.replace(hornTarget.replace(/\n/g, '\r\n'), newHornCode.replace(/\n/g, '\r\n'));
} else if (content.includes(hornTarget)) {
  content = content.replace(hornTarget, newHornCode);
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('Successfully applied V190 Master Cabin Rules patch!');
