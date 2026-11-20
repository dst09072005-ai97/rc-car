/** Garage bays, vehicle selection, paint and bodywork. */

export function addPinkColorsAndHarmonizePbrMaterials(ctx) {
  const {
    CAR_PAINT_PALETTE, allTrafficVehicles, hemiLight, mainShadowLight, matChrome, matGlass,
    renderer, scene,
  } = ctx;
  if (typeof CAR_PAINT_PALETTE !== 'undefined') {
    CAR_PAINT_PALETTE.push(
      { hex: 0xff758f, name: 'Hồng Rose Quartz' },
      { hex: 0xffafcc, name: 'Hồng Pastel Sakura' }
    );
  }

  // Cân bằng ánh sáng & độ phơi sáng để các lớp phủ PBR hòa trộn dịu mắt, tươi sáng nhưng không bị tối hay chói
  renderer.toneMappingExposure = 1.26;
  hemiLight.intensity = 1.45;
  hemiLight.color.setHex(0xdbeafe);
  hemiLight.groundColor.setHex(0x334155);
  mainShadowLight.intensity = 1.85;

  const pleasantPastelPalette = [
    0xff758f, // Hồng Rose Quartz
    0xffafcc, // Hồng Pastel
    0x72efdd, // Xanh Mint dịu
    0x90e0ef, // Xanh Sky Pastel
    0xffd166, // Vàng Kem ấm
    0xc77dff, // Tím Lavender dịu
    0xf4a261, // Cam Đào nhẹ
    0xa8dadc  // Xanh Ngọc nhạt
  ];

  let colorIdx = 0;
  scene.traverse((obj) => {
    if (obj.isMesh && obj.material && !obj.userData.isVolumetricBeam) {
      const mat = obj.material;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // Giảm bớt metalness quá cao gây đen sẫm bề mặt vào ban đêm, giữ lớp bóng phủ (clearcoat) vừa phải
        if (mat.metalness > 0.72 && mat !== matChrome) {
          mat.metalness = 0.35;
        }
        if (mat.roughness < 0.18 && mat !== matGlass && mat !== matChrome) {
          mat.roughness = 0.26;
        }
        if (mat.clearcoat !== undefined) {
          mat.clearcoat = 0.65;
          mat.clearcoatRoughness = 0.18;
        }
        mat.needsUpdate = true;
      }
    }
  });

  // Phối thêm màu Hồng và gam màu Pastel dễ nhìn cho một số xe lưu thông trên đường
  allTrafficVehicles.forEach((veh, idx) => {
    if (veh.userData.category === 'CAR' && idx % 2 === 0) {
      const softHex = pleasantPastelPalette[colorIdx % pleasantPastelPalette.length];
      colorIdx++;
      veh.traverse((c) => {
        if (c.isMesh && c.material && c.material.clearcoat !== undefined) {
          c.material.color.setHex(softHex);
          c.material.metalness = 0.32;
          c.material.roughness = 0.24;
        }
      });
    }
  });
}

export function buildBespokeBodykitAndInteriorAccents(ctx) {
  const {
    SEAT_POSITIONS, THREE, bespokeExteriorTrimGroup, matAmbientTrim, matPiano, matTwoToneAccent,
  } = ctx;
  // 1. Tấm ốp Nắp Capo 2 tông màu (Two-Tone Bespoke Hood Inlay)
  ctx.luxuryHoodInlayMesh = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.02, 1.48), matTwoToneAccent);
  ctx.luxuryHoodInlayMesh.position.set(0, 0.776, -1.45);
  ctx.luxuryHoodInlayMesh.visible = false;
  bespokeExteriorTrimGroup.add(ctx.luxuryHoodInlayMesh);

  // 2. Ốp lườn hông khí động học 2 bên thân xe (Bespoke Side Skirts)
  ctx.sideSkirtLeftMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 3.85), matTwoToneAccent);
  ctx.sideSkirtLeftMesh.position.set(-0.98, 0.24, 0.05);
  ctx.sideSkirtRightMesh = ctx.sideSkirtLeftMesh.clone();
  ctx.sideSkirtRightMesh.position.x = 0.98;
  bespokeExteriorTrimGroup.add(ctx.sideSkirtLeftMesh, ctx.sideSkirtRightMesh);

  // 3. Cánh gió thể thao GT phía sau cốp (Hiển thị tùy theo mẫu phối màu)
  ctx.sportRearWingMesh = new THREE.Group();
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.045, 0.28), matTwoToneAccent);
  wingBlade.position.set(0, 0.96, 2.25);
  [-0.55, 0.55].forEach((wx) => {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.16), matPiano);
    strut.position.set(wx, 0.85, 2.25);
    ctx.sportRearWingMesh.add(strut);
  });
  ctx.sportRearWingMesh.add(wingBlade);
  ctx.sportRearWingMesh.visible = false;
  bespokeExteriorTrimGroup.add(ctx.sportRearWingMesh);

  // 4. Dải viền LED Ambient & Gối tựa đầu thêu nổi bên trong nội thất ghế ngồi
  const dashTrimLine = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.022, 0.025), matAmbientTrim);
  dashTrimLine.position.set(0, 0.71, -0.39);
  bespokeExteriorTrimGroup.add(dashTrimLine);

  SEAT_POSITIONS.forEach((sp) => {
    const pillow = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.14, 8, 10), matTwoToneAccent);
    pillow.rotation.z = Math.PI / 2;
    pillow.position.set(sp.pos.x, 0.78, sp.pos.z + 0.16);
    bespokeExteriorTrimGroup.add(pillow);
  });
}

export function setupLuxuryGarage(ctx) {
  const {
    DEFAULT_GARAGE_SPEED_RATIO, SEAT_POSITIONS, THREE, cameraRig, chassisGroup, driverSeatMount,
    initAudio, matBodyPaint, matChrome, matGlass, matNappa, matTireRubber, matWalnut,
    playEngineStarterSound, register3DTarget, roofBeaconGroup, scene,
    setCarBodyVisibilityForTwoWheelMode, state, vehicleRoot,
  } = ctx;
  // --- 21.1. HÀM VẼ BẢNG HIỆU GRAFFITI LUXURY ĐỘC BẢN MANG TÊN "TOÀN" ---
  // Sử dụng toneMapped: false + Khung nền Obsidian tối sâu + Viền Keyline 3D để:
  // - Ban đêm: Không bao giờ bị chóa trắng (bloom/glare) bởi đèn đường.
  // - Ban ngày / Hoàng hôn / Mưa: Không bao giờ bị chìm vào màu tường kem hay bầu trời sáng.
  function createToanGraffitiLuxurySignMesh(mainGraffitiText, subAddressText, widthM = 5.6, heightM = 1.65, accentTheme = 'GOLD_CYAN') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    // 1. Nền hộp Obsidian nhám chống chìm màu tường 100% trong mọi thời tiết
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 320);
    bgGrad.addColorStop(0, '#070a14');
    bgGrad.addColorStop(0.5, '#10172a');
    bgGrad.addColorStop(1, '#060911');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 320);

    // Họa tiết Graffiti Street-Art chìm phía sau (Sọc chéo & vệt sơn Splash nghệ thuật)
    ctx.save();
    ctx.globalAlpha = 0.16;
    const splashColors = accentTheme === 'GOLD_CYAN' ? ['#00f5d4', '#ffd60a', '#ff2a85'] : ['#ff2a85', '#00bbf9', '#ffd60a'];
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = splashColors[i % splashColors.length];
      ctx.beginPath();
      ctx.arc(90 + i * 68, 70 + (i % 3) * 75, 18 + (i % 4) * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 2. Khung viền kép Vàng Hoàng Gia & Neon Cyan cắt sắc nét khỏi vách tường
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 1008, 304);
    ctx.strokeStyle = accentTheme === 'GOLD_CYAN' ? '#00f5d4' : '#ff2a85';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 984, 280);

    // 3. Biểu tượng Vương miện Graffiti (King Crown) phía trên tên TOÀN
    ctx.save();
    ctx.translate(105, 58);
    ctx.rotate(-0.14);
    ctx.fillStyle = '#ffd60a';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-38, 18);
    ctx.lineTo(-46, -18);
    ctx.lineTo(-15, 2);
    ctx.lineTo(0, -26);
    ctx.lineTo(15, 2);
    ctx.lineTo(46, -18);
    ctx.lineTo(38, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 4. Vẽ chữ GRAFFITI 3D EXTRUSION cho tên "TOÀN"
    ctx.save();
    ctx.translate(512, 148);
    ctx.transform(1, -0.04, -0.16, 1, 0, 0); // Độ nghiêng Wildstyle Graffiti năng động
    ctx.font = '900 94px "Impact", "Arial Black", "Segoe UI Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Lớp 4A: Khối nổi 3D (3D Block Extrusion) đổ sâu xuống góc dưới phải
    for (let d = 14; d >= 1; d--) {
      ctx.fillStyle = d > 7 ? '#04060c' : '#1e1b4b';
      ctx.fillText(mainGraffitiText, d * 1.4, d * 1.5);
    }

    // Lớp 4B: Viền hào quang Graffiti (Outer Neon Keyline)
    ctx.strokeStyle = accentTheme === 'GOLD_CYAN' ? '#00f5d4' : '#ffbe0b';
    ctx.lineWidth = 20;
    ctx.lineJoin = 'round';
    ctx.strokeText(mainGraffitiText, 0, 0);

    // Lớp 4C: Viền đen đặc tách khối (Black Cutback Outline) giúp chữ không bao giờ bị lóa
    ctx.strokeStyle = '#05070e';
    ctx.lineWidth = 11;
    ctx.strokeText(mainGraffitiText, 0, 0);

    // Lớp 4D: Màu tô chuyển sắc Graffiti Luxury (Cyan Ngọc Lục Bảo -> Vàng 24K -> Hồng Hồng Ngọc)
    const textGrad = ctx.createLinearGradient(-380, -55, 380, 55);
    if (accentTheme === 'GOLD_CYAN') {
      textGrad.addColorStop(0.0, '#00f5d4');
      textGrad.addColorStop(0.35, '#ffffff');
      textGrad.addColorStop(0.68, '#ffd60a');
      textGrad.addColorStop(1.0, '#ff2a85');
    } else {
      textGrad.addColorStop(0.0, '#ffd60a');
      textGrad.addColorStop(0.45, '#ff758f');
      textGrad.addColorStop(0.75, '#ffffff');
      textGrad.addColorStop(1.0, '#00f5d4');
    }
    ctx.fillStyle = textGrad;
    ctx.fillText(mainGraffitiText, 0, 0);

    // Lớp 4E: Đường bóng kính phản quang trắng sắc nét ở mép trên chữ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.strokeText(mainGraffitiText, -2, -3);
    ctx.restore();

    // 5. Dải băng Địa chỉ Chính thức (Address Plate) ở phần chân bảng hiệu
    ctx.fillStyle = 'rgba(6, 12, 24, 0.94)';
    ctx.fillRect(36, 234, 952, 54);
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(36, 234, 952, 54);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 25px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(subAddressText, 512, 261);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.needsUpdate = true;

    // Tạo hộp bảng hiệu 3D có viền kim loại Vàng Gold bao quanh
    const signGroup = new THREE.Group();
    const backingBox = new THREE.Mesh(
      new THREE.BoxGeometry(widthM + 0.16, heightM + 0.16, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.2 })
    );
    // QUAN TRỌNG: toneMapped: false giúp bảng hiệu giữ nguyên màu sắc chuẩn 100%, không bị chóa trắng vào ban đêm!
    const faceMat = new THREE.MeshBasicMaterial({
      map: tex,
      toneMapped: false
    });
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), faceMat);
    faceMesh.position.z = 0.075;

    const backFaceMesh = faceMesh.clone();
    backFaceMesh.rotation.y = Math.PI;
    backFaceMesh.position.z = -0.075;

    signGroup.add(backingBox, faceMesh, backFaceMesh);
    return signGroup;
  }

  // --- 21.2. LẮP ĐẶT BẢNG HIỆU GRAFFITI "TOÀN" LÊN DINH THỰ & GARA SIÊU XE CẠNH NHÀ ---
  (function installToanGraffitiSignsOnHouseAndGarage() {
    // 1. Bảng hiệu Graffiti tại Mặt tiền Dinh Thự Nhà Của Toàn (Hướng ra vỉa hè điểm Spawn x = -16.6, z = -14.0)
    const houseSign = createToanGraffitiLuxurySignMesh(
      '★ TOÀN VILLA ★',
      '📍 ĐỊA CHỈ: SỐ 01 ĐẠI LỘ TRỌNG TOÀN • LUXURY DISTRICT',
      5.4,
      1.55,
      'GOLD_CYAN'
    );
    houseSign.position.set(-16.55, 5.55, -14.0);
    houseSign.rotation.y = Math.PI / 2; // Quay mặt bảng hiệu ra đúng hướng vỉa hè nơi bạn spawn!
    scene.add(houseSign);

    // Trụ biển số nhà Graffiti phát sáng ngay cổng bước vào nhà Toàn (x = -14.8, z = -11.2)
    const gatePillarSign = createToanGraffitiLuxurySignMesh(
      'TOÀN #01',
      '🏠 DINH THỰ NGUYỄN TRỌNG TOÀN',
      2.3,
      0.82,
      'PINK_GOLD'
    );
    gatePillarSign.position.set(-15.2, 2.35, -10.8);
    gatePillarSign.rotation.y = Math.PI / 2;
    scene.add(gatePillarSign);

    // 2. Bảng hiệu Graffiti khổng lồ trên đỉnh mặt tiền Gara Siêu Xe Của Toàn (x = -16.6, z = -26.5)
    const garageMainSign = createToanGraffitiLuxurySignMesh(
      '⚡ TOÀN GARAGE ⚡',
      '📍 ĐỊA CHỈ: SỐ 02 ĐẠI LỘ TRỌNG TOÀN • 3-BAY SUPERCAR COLLECTION',
      6.4,
      1.75,
      'PINK_GOLD'
    );
    garageMainSign.position.set(-16.5, 5.35, -26.5);
    garageMainSign.rotation.y = Math.PI / 2; // Quay mặt ra đường lớn để đứng ở nhà nhìn thấy rõ ngay!
    scene.add(garageMainSign);
  })();

  // --- 21.3. XÂY DỰNG 3 BỤC ĐỖ XE TRONG GARA CỦA TOÀN (ĐỖ CÙNG LÚC 3 MẪU XE: ROLLS-ROYCE, SPORT COUPE GT, MOTO PKL) ---
  // Tọa độ Gara cạnh nhà: Tâm ở (-22.5, 0.24, -26.5). Mở rộng mặt sàn Gara để chứa thoải mái 3 khoang đỗ xe song song.
  const GARAGE_BAYS = [
    {
      id: 'RR_GHOST',
      name: '1. Rolls-Royce Ghost V12 (Siêu Sang)',
      worldPos: new THREE.Vector3(-21.5, 0.26, -23.3),
      headingRad: -Math.PI / 2, // Mũi xe hướng thẳng ra cổng Gara (+X) sẵn sàng phóng ra đường!
      ringColor: 0xd4af37,
      speedMultiplier: DEFAULT_GARAGE_SPEED_RATIO,
      steerSens: 1.0,
      bodyHex: 0x101829,
      nappaHex: 0xdfd1be,
      woodHex: 0x3a2314
    },
    {
      id: 'SPORT_COUPE',
      name: '2. Sport Coupe GT Widebody (Siêu Xe 2 Cửa)',
      worldPos: new THREE.Vector3(-21.5, 0.26, -26.5),
      headingRad: -Math.PI / 2,
      ringColor: 0xff2a85,
      speedMultiplier: 3.8,
      steerSens: 1.35,
      bodyHex: 0xd90429,
      nappaHex: 0x111827,
      woodHex: 0xff2a85
    },
    {
      id: 'MOTO_PKL',
      name: '3. Moto PKL Sportbike R1 (1000cc 2 Bánh)',
      worldPos: new THREE.Vector3(-21.5, 0.26, -29.5),
      headingRad: -Math.PI / 2,
      ringColor: 0x00f5d4,
      speedMultiplier: 4.4,
      steerSens: 1.5,
      bodyHex: 0x00bbf9,
      nappaHex: 0x0f172a,
      woodHex: 0x00f5d4
    }
  ];

  let currentSelectedGarageVehicleId = 'RR_GHOST';
  const garageBayDisplayMeshes = new Map();

  // Phụ kiện ngoại thất gắn thêm lên vehicleRoot khi người chơi chọn lái chiếc Sport Coupe GT (Cánh gió Carbon GT + Lip cản trước)
  const sportCoupeAeroKitGroup = new THREE.Group();
  sportCoupeAeroKitGroup.visible = false;
  (function buildSportCoupeAeroKitOnPlayerChassis() {
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2, metalness: 0.8 });
    const neonTrimMat = new THREE.MeshBasicMaterial({ color: 0xff2a85, toneMapped: false });

    // Cánh gió thể thao GT Wing cỡ lớn phía sau cốp
    const gtWingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.05, 0.34), carbonMat);
    gtWingBlade.position.set(0, 1.06, 2.22);
    const wingStrutL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.22), carbonMat);
    wingStrutL.position.set(-0.55, 0.90, 2.22);
    const wingStrutR = wingStrutL.clone();
    wingStrutR.position.x = 0.55;

    // Viền LED gầm & Lip chia gió cản trước thể thao
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.06, 0.25), neonTrimMat);
    frontSplitter.position.set(0, 0.24, -2.32);

    sportCoupeAeroKitGroup.add(gtWingBlade, wingStrutL, wingStrutR, frontSplitter);
    chassisGroup.add(sportCoupeAeroKitGroup);
  })();

  // Dựng 3 mô hình xe trưng bày trên 3 bục LED trong Gara của Toàn
  function buildThreeVehiclesInToanGarage() {
    // 1. Xóa khối hộp showCar tĩnh đơn điệu của bản cũ trong Gara (nếu có)
    scene.children.forEach((obj) => {
      if (obj.isGroup && Math.abs(obj.position.x - (-22.5)) < 0.5 && Math.abs(obj.position.z - (-26.5)) < 0.5) {
        obj.children.forEach((c) => {
          if (c.isMesh && c.geometry?.parameters?.width === 4.4 && c.geometry?.parameters?.height === 1.15) {
            c.visible = false;
          }
          // Mở thông vách kính phía Nam để Gara rộng rãi đỗ đủ 3 xe
          if (c.isMesh && c.geometry?.parameters?.width === 11.5 && Math.abs(c.position.z) > 4.0) {
            c.visible = false;
          }
        });
      }
    });

    const garageCollectionRoot = new THREE.Group();
    scene.add(garageCollectionRoot);

    GARAGE_BAYS.forEach((bay) => {
      const bayGroup = new THREE.Group();
      bayGroup.position.copy(bay.worldPos);
      bayGroup.rotation.y = bay.headingRad;

      // Bục đĩa xoay trưng bày có viền LED phát sáng không chóa (toneMapped: false)
      const padCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(2.35, 2.45, 0.08, 32),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 })
      );
      padCyl.position.y = 0.04;
      const padRing = new THREE.Mesh(
        new THREE.RingGeometry(2.25, 2.42, 32),
        new THREE.MeshBasicMaterial({ color: bay.ringColor, side: THREE.DoubleSide, toneMapped: false })
      );
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.y = 0.085;
      bayGroup.add(padCyl, padRing);

      // Nhóm mô hình chiếc xe đỗ trên bục
      const displayVehicle = new THREE.Group();
      bayGroup.add(displayVehicle);

      if (bay.id === 'RR_GHOST') {
        // MẪU 1: ROLLS-ROYCE GHOST V12
        const rrPaint = new THREE.MeshPhysicalMaterial({ color: 0x101829, metalness: 0.7, roughness: 0.14, clearcoat: 1.0 });
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.52, 4.75), rrPaint);
        hull.position.y = 0.48;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.46, 2.35), matGlass);
        cabin.position.set(0, 0.96, 0.15);
        const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.46, 0.08), matChrome);
        grille.position.set(0, 0.52, -2.38);
        displayVehicle.add(hull, cabin, grille);
        [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.50], [0.95, 1.50]].forEach(([wx, wz]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.25, 20), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.37, wz);
          displayVehicle.add(w);
        });
      } else if (bay.id === 'SPORT_COUPE') {
        // MẪU 2: SIÊU XE THỂ THAO SPORT COUPE GT WIDEBODY
        const coupePaint = new THREE.MeshPhysicalMaterial({ color: 0xd90429, metalness: 0.6, roughness: 0.12, clearcoat: 1.0 });
        const carbonMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2, metalness: 0.8 });

        const lowBody = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.38, 4.45), coupePaint);
        lowBody.position.y = 0.38;
        const noseSlope = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.58, 12, 16), coupePaint);
        noseSlope.rotation.z = Math.PI / 2;
        noseSlope.position.set(0, 0.34, -2.15);

        const aeroCabin = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 1.65, 4), carbonMat);
        aeroCabin.rotation.y = Math.PI / 4;
        aeroCabin.scale.set(1.0, 0.34, 1.35);
        aeroCabin.position.set(0, 0.78, 0.08);

        // Cánh gió GT Wing sau đuôi + Sọc đôi thể thao Vàng Gold
        const gtWing = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.05, 0.30), carbonMat);
        gtWing.position.set(0, 0.94, 2.05);
        const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.18), carbonMat);
        strutL.position.set(-0.52, 0.78, 2.05);
        const strutR = strutL.clone();
        strutR.position.x = 0.52;

        const racingStripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.02, 4.42),
          new THREE.MeshBasicMaterial({ color: 0xffd60a, toneMapped: false })
        );
        racingStripe.position.set(0, 0.58, 0);

        displayVehicle.add(lowBody, noseSlope, aeroCabin, gtWing, strutL, strutR, racingStripe);
        [[-0.98, -1.35], [0.98, -1.35], [-0.98, 1.35], [0.98, 1.35]].forEach(([wx, wz]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.28, 20), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.35, wz);
          displayVehicle.add(w);
        });
      } else if (bay.id === 'MOTO_PKL') {
        // MẪU 3: MOTO PHÂN KHỐI LỚN SPORTBIKE R1 1000CC
        const motoPaint = new THREE.MeshPhysicalMaterial({ color: 0x00bbf9, metalness: 0.65, roughness: 0.15, clearcoat: 1.0 });
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.42, 12, 16), motoPaint);
        tank.rotation.x = Math.PI / 2 - 0.22;
        tank.position.set(0, 0.74, -0.12);

        const fairing = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.58, 12), motoPaint);
        fairing.rotation.x = -Math.PI / 2 + 0.24;
        fairing.position.set(0, 0.76, -0.56);

        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.52, 10), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
        tail.rotation.x = Math.PI / 2 + 0.2;
        tail.position.set(0, 0.78, 0.48);

        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 10), matChrome);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, 0.94, -0.42);

        displayVehicle.add(tank, fairing, tail, bar);
        [-0.62, 0.58].forEach((wz) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 20), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.33, wz);
          displayVehicle.add(w);
        });
      }

      // Bảng tên lơ lửng trên từng xe trong Gara (Bấm Tia Laser / Chuột vào là nhảy lên lái ngay!)
      const bayLabel = createToanGraffitiLuxurySignMesh(
        bay.id === 'RR_GHOST' ? 'ROLLS-ROYCE V12' : (bay.id === 'SPORT_COUPE' ? 'SPORT COUPE GT' : 'MOTO PKL R1'),
        `👉 BẤM ĐỂ LÁI: ${bay.name.toUpperCase()}`,
        2.5,
        0.68,
        bay.id === 'SPORT_COUPE' ? 'PINK_GOLD' : 'GOLD_CYAN'
      );
      bayLabel.position.set(0, 1.95, 0);
      displayVehicle.add(bayLabel);

      // Đăng ký mọi bộ phận của xe trưng bày vào hệ thống click 3D / Tia Laser Quest 3
      bayGroup.traverse((child) => {
        if (child.isMesh) {
          register3DTarget(child, () => window.selectAndDriveGarageVehicle(bay.id));
        }
      });

      garageCollectionRoot.add(bayGroup);
      garageBayDisplayMeshes.set(bay.id, displayVehicle);
    });

    // Ban đầu chiếc Rolls-Royce đang đỗ sẵn trước cửa nhà cho người chơi nên ẩn bản sao trong bục số 1,
    // còn chiếc Sport Coupe GT và Moto PKL R1 hiện rõ ràng trên bục số 2 và số 3 trong Gara!
    const rrDisplay = garageBayDisplayMeshes.get('RR_GHOST');
    if (rrDisplay) rrDisplay.visible = false;
  }
  buildThreeVehiclesInToanGarage();

  // --- 21.4. HÀM CHUYỂN ĐỔI & LÁI BẤT KỲ MẪU XE NÀO TRONG GARA CỦA TOÀN ---
  window.selectAndDriveGarageVehicle = function(bayId) {
    const targetBay = GARAGE_BAYS.find((b) => b.id === bayId);
    if (!targetBay) return;
    initAudio();

    // Nếu trước đó đang đi nhờ xe NPC ngoài đường thì trả xe NPC đó lại cho AI
    if (state.boardedNpcVehicleRef) {
      state.boardedNpcVehicleRef.visible = true;
      state.boardedNpcVehicleRef.userData.isBoardedByPlayer = false;
      state.boardedNpcVehicleRef = null;
    }

    // 1. Hiện lại tất cả các xe khác trên bục đỗ trong Gara của Toàn, và ẩn chiếc xe vừa được chọn lái!
    GARAGE_BAYS.forEach((b) => {
      const mesh = garageBayDisplayMeshes.get(b.id);
      if (mesh) {
        mesh.visible = (b.id !== bayId);
      }
    });

    currentSelectedGarageVehicleId = bayId;

    // 2. Đưa vehicleRoot về đúng vị trí bục xuất phát trong Gara của Toàn (mũi xe hướng thẳng ra đường lớn)
    vehicleRoot.position.set(targetBay.worldPos.x + 2.2, 0, targetBay.worldPos.z);
    state.headingRad = targetBay.headingRad; // -Math.PI / 2 (Hướng thẳng ra cổng Đông +X của Gara)
    vehicleRoot.rotation.set(0, state.headingRad, 0);

    // 3. Biến hình ngoại thất, nội thất & thông số tốc độ theo đúng mẫu xe bạn chọn
    state.rcSpeedRatio = targetBay.speedMultiplier;
    state.rcSteerSensitivity = targetBay.steerSens;
    const speedSlider = document.getElementById('slider-speed-ratio');
    const speedVal = document.getElementById('val-speed-ratio');
    if (speedSlider) speedSlider.value = String(targetBay.speedMultiplier);
    if (speedVal) speedVal.textContent = targetBay.speedMultiplier.toFixed(1);

    if (bayId === 'MOTO_PKL') {
      state.currentBoardedType = 'MOTORBIKE';
      setCarBodyVisibilityForTwoWheelMode(true);
      sportCoupeAeroKitGroup.visible = false;
      chassisGroup.scale.set(1.0, 1.0, 1.0);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.05, 0.05);
      matBodyPaint.color.setHex(targetBay.bodyHex);
    } else if (bayId === 'SPORT_COUPE') {
      state.currentBoardedType = 'CAR';
      setCarBodyVisibilityForTwoWheelMode(false);
      sportCoupeAeroKitGroup.visible = true;
      // Hạ thấp trọng tâm và mở rộng bề ngang thân xe chuẩn dáng Widebody Sport Coupe!
      chassisGroup.scale.set(1.06, 0.84, 0.95);
      SEAT_POSITIONS[0].pos.set(-0.40, -0.04, 0.12);
      matBodyPaint.color.setHex(targetBay.bodyHex);
      matNappa.color.setHex(targetBay.nappaHex);
      matWalnut.color.setHex(targetBay.woodHex);
    } else {
      // ROLLS-ROYCE GHOST V12
      state.currentBoardedType = 'ROLLS_ROYCE';
      setCarBodyVisibilityForTwoWheelMode(false);
      sportCoupeAeroKitGroup.visible = false;
      chassisGroup.scale.set(1.0, 1.0, 1.0);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.0, 0.12);
      matBodyPaint.color.setHex(targetBay.bodyHex);
      matNappa.color.setHex(targetBay.nappaHex);
      matWalnut.color.setHex(targetBay.woodHex);
    }

    // 4. Đưa người chơi ngồi vào Ghế Lái (seatIndex = 0), nổ máy sẵn sàng chạy từ Gara ra phố!
    state.seatIndex = 0;
    driverSeatMount.position.copy(SEAT_POSITIONS[0].pos);
    state.playerMode = 'DRIVING';
    state.doorsOpen = false;
    state.engineRunning = true;
    state.velocityMs = 0;
    state.speedKmh = 0;
    state.rpm = 1450;
    playEngineStarterSound();

    ctx.avatarBodyMesh.visible = false;
    driverSeatMount.add(cameraRig);
    cameraRig.position.set(0, 0, 0);
    cameraRig.rotation.set(0, 0, 0);
    roofBeaconGroup.visible = false;

    const badge = document.getElementById('func-target-badge');
    if (badge) badge.textContent = `🏆 Gara Toàn: ${targetBay.name.split('(')[0].trim()}`;

    state.lastActionLog = `🏆 [TOÀN GARAGE]: Bạn đã chọn lái [${targetBay.name}]! Đẩy nút xoay (hoặc nhấn W) để lái xe từ Gara ra đại lộ!`;
  };

  // Gắn sự kiện cho 3 nút chọn xe nhanh trong Bảng Chức Năng và phím tắt 1, 2, 3
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-garage-rr')?.addEventListener('click', () => window.selectAndDriveGarageVehicle('RR_GHOST'));
    document.getElementById('btn-garage-coupe')?.addEventListener('click', () => window.selectAndDriveGarageVehicle('SPORT_COUPE'));
    document.getElementById('btn-garage-moto')?.addEventListener('click', () => window.selectAndDriveGarageVehicle('MOTO_PKL'));
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '1') window.selectAndDriveGarageVehicle('RR_GHOST');
    if (e.key === '2') window.selectAndDriveGarageVehicle('SPORT_COUPE');
    if (e.key === '3') window.selectAndDriveGarageVehicle('MOTO_PKL');
  });
}
