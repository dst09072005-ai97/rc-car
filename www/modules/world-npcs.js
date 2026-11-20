/** Traffic, NPC cabin occupants and city emergency scenes. */

export function sealSidewalkGapsAcrossAllBlocks(ctx) {
  const {
    cityBlocks, matSidewalk,
  } = ctx;
  cityBlocks.forEach((block) => {
    block.children.forEach((child) => {
      // Mở rộng tấm vỉa hè góc phố từ 22x22 lên 23.2x23.2 để nối liền mạch giữa các ô phố (xóa rãnh đen 2m)
      if (child.isMesh && child.material === matSidewalk && child.geometry?.parameters?.width === 22) {
        child.scale.set(23.2 / 22, 1, 23.2 / 22);
        child.position.x = Math.sign(child.position.x) * 22.4;
        child.position.z = Math.sign(child.position.z) * 22.4;
      }
    });
  });
}

export function install4WayOxyzTrafficLightsOnAllBlocks(ctx) {
  const {
    THREE, cityBlocks, matPiano, matPole, trafficLights, xAxisTrafficLightMats,
    zAxisTrafficLightMats,
  } = ctx;
  const redAxisMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const greenAxisMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
  const blueAxisMat = new THREE.MeshBasicMaterial({ color: 0x00bbf9 });

  cityBlocks.forEach((block) => {
    // 1. Tạo Cụm Trục Tọa Độ OXYZ Tham Chiếu gắn trên đỉnh cột đèn giao thông ngã tư
    const oxyzGizmo = new THREE.Group();
    oxyzGizmo.position.set(10.5, 4.9, -10.5);
    const axX = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), redAxisMat);
    axX.rotation.z = -Math.PI / 2;
    axX.position.x = 0.6;
    const axY = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), greenAxisMat);
    axY.position.y = 0.6;
    const axZ = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), blueAxisMat);
    axZ.rotation.x = Math.PI / 2;
    axZ.position.z = 0.6;
    oxyzGizmo.add(axX, axY, axZ);
    block.add(oxyzGizmo);

    // 2. Thêm 2 Cột Đèn Giao Thông dành riêng cho hướng Đông - Tây (Trục X) tại (-10.5, -10.5) và (10.5, 10.5)
    // để xe chạy hướng Đông/Tây nhìn thấy đúng mặt đèn Đỏ/Vàng/Xanh đối diện với đèn pha của mình!
    [
      { x: -10.5, z: -10.5, rotY: -Math.PI / 2 }, // Mặt đèn hướng về -X (Đón xe đi hướng Đông +X)
      { x: 10.5, z: 10.5, rotY: Math.PI / 2 }     // Mặt đèn hướng về +X (Đón xe đi hướng Tây -X)
    ].forEach((cfg) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(cfg.x, 0, cfg.z);
      pGroup.rotation.y = cfg.rotY;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), matPole);
      pole.position.y = 2.3;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.05, 0.25), matPiano);
      box.position.set(0, 4.2, 0.15);

      const rMat = new THREE.MeshBasicMaterial({ color: 0x330808 });
      const yMat = new THREE.MeshBasicMaterial({ color: 0x332600 });
      const gMat = new THREE.MeshBasicMaterial({ color: 0x00ff55 });

      const rB = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), rMat);
      rB.position.set(0, 4.5, 0.26);
      const yB = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), yMat);
      yB.position.set(0, 4.2, 0.26);
      const gB = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), gMat);
      gB.position.set(0, 3.9, 0.26);

      pGroup.add(pole, box, rB, yB, gB);
      block.add(pGroup);
      xAxisTrafficLightMats.push({ redMat: rMat, yellowMat: yMat, greenMat: gMat });
    });
  });

  // Phân loại các đèn giao thông cũ vào nhóm Trục Z
  trafficLights.forEach((tl) => zAxisTrafficLightMats.push(tl));
}

export function enhance3DArchitecturalAndVehicleDetails(ctx) {
  const {
    THREE, cityBlocks, v125TrafficVehicles,
  } = ctx;
  const glassFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
  const glowingWindowMat = new THREE.MeshBasicMaterial({ color: 0xffe599 });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.1 });

  // 1. Nâng cấp chi tiết 3D cho các công trình trên bản đồ (Thêm hệ khung cửa sổ lưới 3D, viền đèn Neon kiến trúc, Sân đỗ trực thăng Bệnh viện)
  cityBlocks.forEach((block) => {
    block.children.forEach((lot) => {
      if (!lot.isGroup || Math.abs(lot.position.y - 0.24) > 0.05) return;

      lot.children.forEach((bldg) => {
        if (!bldg.isMesh || bldg.geometry?.type !== 'BoxGeometry') return;
        const bw = bldg.geometry.parameters.width || 0;
        const bh = bldg.geometry.parameters.height || 0;
        const bd = bldg.geometry.parameters.depth || 0;

        // Thêm mái gờ kiến trúc (Architectural Roof Parapet) & Dải đèn LED hắt sáng mặt tiền cho các tòa nhà/cửa hàng
        if (bw >= 8.5 && bh >= 4.0) {
          const parapet = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.45, 0.35, bd + 0.45), glassFrameMat);
          parapet.position.set(bldg.position.x, bldg.position.y + bh / 2 + 0.15, bldg.position.z);

          const ledTrim = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.5, 0.08, bd + 0.5), neonCyanMat);
          ledTrim.position.set(bldg.position.x, bldg.position.y + bh / 2 - 0.05, bldg.position.z);
          lot.add(parapet, ledTrim);

          // Thêm các ô cửa sổ 3D có khung nổi trên 4 mặt đứng của tòa nhà
          const floors = Math.min(4, Math.floor(bh / 2.6));
          for (let f = 0; f < floors; f++) {
            const wy = 1.6 + f * 2.4;
            for (let wx = -bw * 0.3; wx <= bw * 0.3; wx += bw * 0.3) {
              const winF = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, bd + 0.12), glowingWindowMat);
              winF.position.set(bldg.position.x + wx, wy, bldg.position.z);
              lot.add(winF);
            }
          }
        }
      });
    });
  });

  // 2. Nâng cấp chi tiết 3D cho tất cả Ô tô NPC (Thêm Lưới tản nhiệt mạ Chrome, Cản thể thao, Đèn hậu LED kéo dài & Gương chiếu hậu 2 bên)
  v125TrafficVehicles.forEach((veh) => {
    const vd = veh.userData;
    if (vd.category === 'CAR' || vd.category === 'POLICE') {
      // Lưới tản nhiệt trước (3D Front Grille)
      const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.06), chromeMat);
      grille.position.set(0, 0.48, -2.26);

      // Dải đèn hậu LED chạy ngang đuôi xe (Full-width LED Taillight Bar)
      const ledTailBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.72, 0.10, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xff1133 })
      );
      ledTailBar.position.set(0, 0.62, 2.25);

      // Cặp gương chiếu hậu 2 bên cửa trước
      [-1.02, 1.02].forEach((mx) => {
        const sideMirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.12), chromeMat);
        sideMirror.position.set(mx, 0.82, -0.55);
        veh.add(sideMirror);
      });

      veh.add(grille, ledTailBar);
    }
  });
}

export function fixTrafficLightOrientationsAndGasStationPlacement(ctx) {
  const {
    cityBlocks, createTrafficLightPole,
  } = ctx;
  cityBlocks.forEach((block) => {
    // 1. Xoay lại các cột đèn giao thông trong mỗi ô phố để mặt đèn (Red/Yellow/Green ở +Z cục bộ)
    // luôn hướng trực diện vào mắt người lái xe đang tiến tới ngã tư từ cả 4 phía!
    block.children.forEach((child) => {
      if (child.isGroup && child.position.x === 10.5 && child.position.z === -10.5) {
        child.rotation.y = 0; // Nhìn về +Z (Đón làn xe đi từ +Z về -Z)
      } else if (child.isGroup && child.position.x === -10.5 && child.position.z === 10.5) {
        child.rotation.y = Math.PI; // Nhìn về -Z (Đón làn xe đi từ -Z về +Z)
      }
    });

    // Bổ sung thêm 2 cột đèn giao thông cho trục đường Đông - Tây (Trục X) xoay đúng góc ±Math.PI/2
    const tlEast = createTrafficLightPole(10.5, 10.5, Math.PI / 2);
    const tlWest = createTrafficLightPole(-10.5, -10.5, -Math.PI / 2);
    block.add(tlEast, tlWest);
  });
}

export function equipNpcsWithHandbagsShoppingBagsAndSocialGroups(ctx) {
  const {
    THREE, createSpeechBubbleSprite, register3DTarget, robberNpcsList, sidewalkNpcs,
    startPlayerVsRobberFightCutscene,
  } = ctx;
  const bagColors = [0xd90429, 0xd4af37, 0x7209b7, 0x0077b6, 0x2a9d8f];
  const socialDialogues = [
    '☕ Đồ uống ở tiệm Cafe này thơm quá!',
    '🛍️ Mình vừa mua được túi xách mới ở Boutique!',
    '🥐 Bánh sừng bò ở tiệm bánh mới ra lò ngon tuyệt!',
    '🌸 Hoa tươi ở tiệm Flora hôm nay rực rỡ thật!',
    '💬 Cuối tuần đi dạo công viên thích ghê!'
  ];

  sidewalkNpcs.forEach((npc, idx) => {
    const nd = npc.userData;

    // 1. Trang bị Túi xách đeo vai / Túi mua đồ (Handbag / Shopping Bag) 3D cho các NPC
    const bagGroup = new THREE.Group();
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.012, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a2314 })
    );
    const bagBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.24),
      new THREE.MeshStandardMaterial({ color: bagColors[idx % bagColors.length], roughness: 0.3 })
    );
    bagBody.position.set(0, -0.14, 0);
    bagGroup.add(strap, bagBody);
    bagGroup.position.set(0.26, 0.92, 0.05);
    if (nd.rightArm) nd.rightArm.add(bagGroup);

    // 2. Phân bổ một số cặp NPC đứng/ngồi tại bàn Cafe, Quán ăn, Công viên để ăn uống & nói chuyện với nhau
    if (idx >= 10) {
      nd.isSocializingAtPoi = true;
      const pairIdx = Math.floor((idx - 10) / 2);
      const isLeftPartner = (idx % 2 === 0);
      const spotX = pairIdx % 2 === 0 ? -18.5 : 18.5;
      const spotZ = pairIdx < 1 ? -18.5 : 18.5;

      npc.position.set(spotX + (isLeftPartner ? -0.65 : 0.65), 0.24, spotZ);
      npc.rotation.y = isLeftPartner ? Math.PI / 2 : -Math.PI / 2;

      const chatBubble = createSpeechBubbleSprite(socialDialogues[idx % socialDialogues.length], '#1e293b', '#00ff88');
      chatBubble.position.set(0, 2.05, 0);
      chatBubble.visible = true;
      npc.add(chatBubble);
      nd.socialChatBubble = chatBubble;
    }

    // 3. Cấu hình các NPC Ăn Cướp (Cướp tiền & Cướp Chó/Mèo trên đường)
    if (nd.role === 'THIEF' && !nd.isSocializingAtPoi) {
      // Bao tải đựng tiền ($) và lồng bắt trộm Chó/Mèo trên tay tên cướp
      const lootSack = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.5 })
      );
      lootSack.position.set(-0.26, 0.88, 0.18);
      npc.add(lootSack);

      const robberAlert = createSpeechBubbleSprite(
        '🦹♂️ CƯỚP TIỀN & BẮT TRỘM CHÓ MÈO ĐÂY! [BẤM LASER / PHÍM H ĐỂ ĐÁNH BẮT CƯỚP]',
        '#660708',
        '#ffbe0b'
      );
      robberAlert.scale.set(2.1, 0.40, 1);
      robberAlert.position.set(0, 2.15, 0);
      robberAlert.visible = true;
      npc.add(robberAlert);
      nd.robberAlert = robberAlert;
      nd.stolenPetRef = null;
      robberNpcsList.push(npc);

      // Khi người chơi bấm Tia Laser hoặc click vào tên cướp -> Nhảy vào đánh nhau tay đôi với tên cướp!
      npc.traverse((child) => {
        if (child.isMesh) {
          register3DTarget(child, () => startPlayerVsRobberFightCutscene(npc));
        }
      });
    }
  });
}

export function buildSpecializedVehicleInteriors(ctx) {
  const {
    THREE, createSpeechBubbleSprite, interiorVariants, matChrome, matPiano,
    specializedInteriorGroup,
  } = ctx;
  // 1. Nội thất XE BUS: Vô lăng lớn nằm ngang, Máy quẹt thẻ vé xe Bus, Tay vịn cột vàng, Gương cầu lồi quan sát khoang hành khách
  const busWheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 16, 36), matPiano);
  busWheel.rotation.x = THREE.MathUtils.degToRad(-65);
  busWheel.position.set(-0.42, 0.72, -0.22);
  const ticketMachine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), new THREE.MeshStandardMaterial({ color: 0xffbe0b }));
  ticketMachine.position.set(-0.08, 0.75, -0.35);
  const handrailPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 10), new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.6 }));
  handrailPole.position.set(0.15, 0.95, -0.25);
  const busSign = createSpeechBubbleSprite('🚌 KHOANG LÁI XE BUS THÀNH PHỐ (MÁY SOÁT VÉ & CỬA TỰ ĐỘNG)', '#003566', '#ffd60a');
  busSign.scale.set(0.75, 0.16, 1);
  busSign.position.set(0, 1.38, -0.45);
  busSign.visible = false;
  interiorVariants.BUS.add(busWheel, ticketMachine, handrailPole, busSign);

  // 2. Nội thất XE CỨU HỎA: Bảng điều khiển Bơm Nước Áp Lực Cao, Nút Còi Hụ 114, Bộ đàm chỉ huy Đỏ
  const pumpConsole = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.25), new THREE.MeshStandardMaterial({ color: 0xd90429 }));
  pumpConsole.position.set(0.0, 0.74, -0.34);
  const pressureGauge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), matChrome);
  pressureGauge.rotation.x = Math.PI / 2;
  pressureGauge.position.set(-0.1, 0.82, -0.21);
  const fireNotice = createSpeechBubbleSprite('🚒 BUỒNG CHỈ HUY XE CỨU HỎA 114 (ÁP LỰC VÒI RỒNG: 100%)', '#780000', '#ffbe0b');
  fireNotice.scale.set(0.75, 0.16, 1);
  fireNotice.position.set(0, 1.38, -0.45);
  fireNotice.visible = false;
  interiorVariants.FIRETRUCK.add(pumpConsole, pressureGauge, fireNotice);

  // 3. Nội thất XE CẤP CỨU: Máy theo dõi nhịp tim ECG, Hộp sơ cứu Chữ Thập Đỏ, Băng ca Y tế phía sau
  const ecgMonitor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.20, 0.08), new THREE.MeshStandardMaterial({ color: 0x00f5d4 }));
  ecgMonitor.position.set(0.05, 0.82, -0.34);
  const medKit = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
  medKit.position.set(0.0, 0.58, 0.25);
  const ambNotice = createSpeechBubbleSprite('🚑 KHOANG Y TẾ XE CẤP CỨU 115 (MÁY MONITOR & BĂNG CA)', '#0077b6', '#00ff88');
  ambNotice.scale.set(0.75, 0.16, 1);
  ambNotice.position.set(0, 1.38, -0.45);
  ambNotice.visible = false;
  interiorVariants.AMBULANCE.add(ecgMonitor, medKit, ambNotice);

  // 4. Nội thất XE TẢI HẠNG NẶNG: Cần số sàn 12 cấp cao, Dây giật còi hơi trên trần, Đồng hồ áp suất khí nén
  const tallGearStick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 8), matChrome);
  tallGearStick.position.set(-0.12, 0.58, -0.15);
  const truckNotice = createSpeechBubbleSprite('🚚 CABIN XE TẢI HẠNG NẶNG (CÒI HƠI & HỘP SỐ 12 CẤP)', '#1e293b', '#00bbf9');
  truckNotice.scale.set(0.75, 0.16, 1);
  truckNotice.position.set(0, 1.38, -0.45);
  truckNotice.visible = false;
  interiorVariants.TRUCK.add(tallGearStick, truckNotice);

  Object.values(interiorVariants).forEach((grp) => {
    grp.visible = false;
    specializedInteriorGroup.add(grp);
  });
}

export function addPillionPassengersToTwoWheelers(ctx) {
  const {
    THREE, allTrafficVehicles, createSafetyHelmetMesh,
  } = ctx;
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
  const jacketColors = [0xff758f, 0x00bbf9, 0xffbe0b, 0x06d6a0];

  allTrafficVehicles.forEach((veh, idx) => {
    const vd = veh.userData;
    if (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE') {
      // Tạo NPC ngồi sau (Pillion Passenger) ôm eo hoặc ngồi yên sau xe máy / xe đạp
      const pillion = new THREE.Group();
      const pTorso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.13, 0.36, 8, 10),
        new THREE.MeshStandardMaterial({ color: jacketColors[idx % jacketColors.length] })
      );
      pTorso.position.set(0, 1.04, 0.38);
      const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 10), skinMat);
      pHead.position.set(0, 1.40, 0.38);
      const pHelmet = createSafetyHelmetMesh(0xff758f, vd.category === 'MOTORBIKE');
      pHelmet.position.set(0, 1.44, 0.38);

      // 2 tay người ngồi sau vòng ra trước giữ eo người lái
      [-0.16, 0.16].forEach((ax) => {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.32, 6, 8), skinMat);
        arm.position.set(ax, 1.0, 0.22);
        arm.rotation.x = Math.PI / 2.2;
        pillion.add(arm);
      });

      pillion.add(pTorso, pHead, pHelmet);
      pillion.visible = (idx % 2 === 0); // 50% xe 2 bánh có sẵn người ngồi sau
      veh.add(pillion);
      vd.pillionPassengerMesh = pillion;
    }
  });
}

export function setupBusStopQueuesAndTaxiFleet(ctx) {
  const {
    THREE, allTrafficVehicles, busStopWaitingQueues, cityBusesList, createSpeechBubbleSprite,
    scene, taxiVehiclesList,
  } = ctx;
  // 1. Tạo nhóm hành khách NPC đứng đợi tại các Trạm Xe Bus
  const stopZCoords = [-34, 0, 34];
  stopZCoords.forEach((sz, sIdx) => {
    const waitingGroup = new THREE.Group();
    waitingGroup.position.set(-10.8, 0.24, sz);
    const waitingNpcs = [];
    for (let w = 0; w < 3; w++) {
      const passenger = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.40, 8, 10),
        new THREE.MeshStandardMaterial({ color: [0xff758f, 0x00bbf9, 0xffd166][(sIdx + w) % 3] })
      );
      body.position.y = 0.65;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
      head.position.y = 1.05;
      passenger.add(body, head);
      passenger.position.set(0, 0, (w - 1) * 0.85);
      passenger.rotation.y = Math.PI / 2;
      waitingGroup.add(passenger);
      waitingNpcs.push(passenger);
    }
    const queueLabel = createSpeechBubbleSprite('🚏 Hành khách đang đợi lên Xe Bus / Vẫy Taxi', '#003566', '#00ff88');
    queueLabel.scale.set(1.6, 0.34, 1);
    queueLabel.position.set(0, 1.65, 0);
    queueLabel.visible = true;
    waitingGroup.add(queueLabel);
    scene.add(waitingGroup);
    busStopWaitingQueues.push({ worldPos: new THREE.Vector3(-10.8, 0.24, sz), waitingNpcs, respawnTimer: 0 });
  });

  // 2. Trang bị Cửa Xe Mở Tự Động & Bộ Đếm Số Lượng Hành Khách cho Xe Bus (Max 14 khách) và Xe Taxi (Max 3 khách)
  cityBusesList.forEach((bus) => {
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-1.18, 1.05, -2.1);
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.55, 0.95),
      new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.4 })
    );
    doorPanel.position.set(0, 0, 0.47);
    doorPivot.add(doorPanel);
    bus.add(doorPivot);

    bus.userData.transitDoorPivot = doorPivot;
    bus.userData.maxPassengers = 14; // Sức chứa tối đa của Xe Bus
    bus.userData.currentPassengers = 4;
    bus.userData.transitStopCooldown = 0;
    bus.userData.transitBoardingTimer = 0;
  });

  allTrafficVehicles.forEach((veh, idx) => {
    if (veh.userData.category === 'CAR' && idx % 2 === 1) {
      // Biến các xe CAR lẻ thành Xe Taxi Đón Khách (Có mào TAXI phát sáng & Cửa mở đón tối đa 3 khách)
      const taxiRoofSign = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.20, 0.24),
        new THREE.MeshBasicMaterial({ color: 0xffd60a })
      );
      taxiRoofSign.position.set(0, 1.38, 0);
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-0.96, 0.52, -0.45);
      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.88), new THREE.MeshStandardMaterial({ color: 0xffd60a }));
      doorMesh.position.set(0, 0, 0.44);
      doorPivot.add(doorMesh);
      veh.add(taxiRoofSign, doorPivot);

      veh.userData.isTaxi = true;
      veh.userData.modelName = 'Taxi Thành Phố';
      veh.userData.transitDoorPivot = doorPivot;
      veh.userData.maxPassengers = 3; // Sức chứa tối đa của Xe Taxi (3 ghế hành khách)
      veh.userData.currentPassengers = 1;
      veh.userData.transitStopCooldown = 0;
      veh.userData.transitBoardingTimer = 0;
      taxiVehiclesList.push(veh);
    }
  });
}

export function buildFireStationAndFireEffectAssets(ctx) {
  const {
    FIRE_STATION_BAY_POS, THREE, activeFireIncidentGroup, allTrafficVehicles,
    createSafetyHelmetMesh, createSpeechBubbleSprite, fireCrowdSpectators, firefighterCrewMeshes,
    flameLayerMeshes, matChrome, scene, waterStreamParticles,
  } = ctx;
  // 1. Xây Bãi Đỗ Trạm Cứu Hỏa 114 cố định tại (24.5, 0.24, -14.0)
  const station = new THREE.Group();
  station.position.copy(FIRE_STATION_BAY_POS);
  const bayRoof = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.4, 11.5),
    new THREE.MeshStandardMaterial({ color: 0xb80c09, roughness: 0.3 })
  );
  bayRoof.position.y = 4.5;
  [-3.8, 3.8].forEach((px) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.5, 11.0), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
    pillar.position.set(px, 2.25, 0);
    station.add(pillar);
  });
  const stSign = createSpeechBubbleSprite('🚒 TRẠM CỨU HỎA 114 (BÃI ĐỖ XE CỨU HỎA TRỰC CHIẾN)', '#780000', '#ffd60a');
  stSign.scale.set(2.2, 0.42, 1);
  stSign.position.set(0, 5.4, 0);
  stSign.visible = true;
  station.add(bayRoof, stSign);
  scene.add(station);

  // Đưa toàn bộ Xe Cứu Hỏa về đỗ cố định tại Trạm Cứu Hỏa khi chưa có cháy!
  const firetrucks = allTrafficVehicles.filter((v) => v.userData.category === 'FIRETRUCK');
  firetrucks.forEach((ft) => {
    ft.userData.isInterceptingHijacker = true; // Tách khỏi vòng lặp chạy vô nghĩa trên đường!
    ft.position.copy(FIRE_STATION_BAY_POS);
    ft.rotation.y = 0;
    ft.userData.activeSpeed = 0;
    ctx.fireIncidentState.truckRef = ft;
  });

  // 2. Tạo Ngọn Lửa 3D Đa Lớp Chân Thật (Lõi trắng vàng, tầng lửa cam, tầng lửa đỏ + Cột khói đen +PointLight lửa bập bùng)
  const fireColors = [0xffffff, 0xffd60a, 0xff5400, 0xd90429, 0x2b2d42];
  for (let f = 0; f < 14; f++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.45 + (f % 3) * 0.35, 1.8 + (f % 4) * 0.85, 10),
      new THREE.MeshBasicMaterial({
        color: fireColors[f % fireColors.length],
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending
      })
    );
    cone.position.set((Math.random() - 0.5) * 2.2, 0.9 + (f % 3) * 0.5, (Math.random() - 0.5) * 2.2);
    activeFireIncidentGroup.add(cone);
    flameLayerMeshes.push(cone);
  }
  const fireLight = new THREE.PointLight(0xff5400, 18, 28, 1.5);
  fireLight.position.set(0, 2.5, 0);
  activeFireIncidentGroup.add(fireLight);

  // 3. Tạo 2 NPC Lính Cứu Hỏa cầm Vòi Rồng + Tia Nước Xịt Chữa Cháy 3D
  for (let ff = 0; ff < 2; ff++) {
    const fman = new THREE.Group();
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.44, 8, 10), new THREE.MeshStandardMaterial({ color: 0xd90429 }));
    suit.position.y = 1.05;
    const helm = createSafetyHelmetMesh(0xffd60a, true);
    helm.position.y = 1.52;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.75, 8), matChrome);
    nozzle.rotation.x = Math.PI / 2 - 0.35;
    nozzle.position.set(0, 1.15, -0.45);
    fman.add(suit, helm, nozzle);
    fman.position.set(ff === 0 ? -1.2 : 1.2, 0, 5.2);
    fman.visible = false;
    activeFireIncidentGroup.add(fman);
    firefighterCrewMeshes.push(fman);
  }

  // Luồng hạt nước (Water Jet Stream) phun từ vòi rồng của xe và lính cứu hỏa vào đám cháy
  const waterMat = new THREE.MeshBasicMaterial({ color: 0x90e0ef, transparent: true, opacity: 0.85 });
  for (let w = 0; w < 22; w++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), waterMat);
    drop.visible = false;
    activeFireIncidentGroup.add(drop);
    waterStreamParticles.push({ mesh: drop, progress: w / 22 });
  }

  // 4. Tạo Đám Đông 6 NPC đứng quanh đám cháy: 3 người Hoảng Loạn chạy vung tay + 3 người Giơ Điện Thoại Quay Phim!
  for (let c = 0; c < 6; c++) {
    const spec = new THREE.Group();
    const isFilming = (c % 2 === 0);
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.42, 8, 10),
      new THREE.MeshStandardMaterial({ color: [0xff758f, 0x00bbf9, 0xffbe0b, 0x72efdd, 0xc77dff, 0xf4a261][c] })
    );
    body.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    head.position.y = 1.46;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 6, 8), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    armL.position.set(-0.22, 1.1, 0);
    const armR = armL.clone();
    armR.position.x = 0.22;

    if (isFilming) {
      // Chiếc điện thoại Smartphone phát sáng trên tay phải NPC đang quay phim đám cháy
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.02), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
      phone.position.set(0, -0.22, -0.12);
      armR.add(phone);
    }

    const bubble = createSpeechBubbleSprite(
      isFilming ? '📱 [Đang Quay Video]: Trời ơi cháy lớn quá! Livestream ngay!' : '😱 [Hoảng Loạn]: Cứu hỏa ơi!! Cháy nhà rồi bà con ơi!!',
      isFilming ? '#003566' : '#780000',
      '#ffd60a'
    );
    bubble.scale.set(1.65, 0.34, 1);
    bubble.position.set(0, 1.95, 0);
    bubble.visible = true;

    const angle = (c / 6) * Math.PI * 2;
    spec.position.set(Math.cos(angle) * 4.2, 0, Math.sin(angle) * 4.2);
    spec.lookAt(0, 0, 0);
    spec.add(body, head, armL, armR, bubble);
    spec.userData = { armL, armR, isFilming, baseAngle: angle };
    activeFireIncidentGroup.add(spec);
    fireCrowdSpectators.push(spec);
  }
}

export function setupHospitalAmbulanceAndStretcher(ctx) {
  const {
    HOSPITAL_BAY_POS, THREE, allTrafficVehicles, createSpeechBubbleSprite, stretcherRescueGroup,
  } = ctx;
  // Đưa các Xe Cấp Cứu về đỗ cố định tại Bãi Đỗ Bệnh Viện khi chưa có tai nạn
  const ambulances = allTrafficVehicles.filter((v) => v.userData.category === 'AMBULANCE');
  ambulances.forEach((amb, idx) => {
    amb.userData.isInterceptingHijacker = true; // Không chạy lang thang vô hạn trên đường
    amb.position.set(HOSPITAL_BAY_POS.x + idx * 3.0, 0, HOSPITAL_BAY_POS.z);
    amb.rotation.y = 0;
    amb.userData.hornBadge.visible = false;
    if (idx === 0) ctx.ambulanceDispatchState.ambulanceRef = amb;
  });

  // Dựng Mô hình Băng Ca Cứu Thương 3D (Stretcher) + Nạn nhân nằm trên băng ca + 2 Nhân viên Y tế đẩy băng ca
  const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 1.95), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
  bedFrame.position.y = 0.65;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.10, 1.85), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
  mattress.position.y = 0.74;
  // Nạn nhân nằm trên băng ca
  const patientBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.95, 8, 10), new THREE.MeshStandardMaterial({ color: 0x00bbf9 }));
  patientBody.rotation.x = Math.PI / 2;
  patientBody.position.set(0, 0.92, 0);

  // 2 Nhân viên y tế mặc áo Blouse trắng đẩy đầu và cuối băng ca
  [-1.15, 1.15].forEach((pz) => {
    const medic = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 8, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    medic.position.set(0, 0.95, pz);
    stretcherRescueGroup.add(medic);
  });

  const stLabel = createSpeechBubbleSprite('🚑 [Cấp Cứu 115]: Đang đưa nạn nhân lên Băng Ca vào Xe Cấp Cứu về Bệnh Viện!', '#0077b6', '#00ff88');
  stLabel.scale.set(2.0, 0.38, 1);
  stLabel.position.set(0, 1.85, 0);
  stLabel.visible = true;
  stretcherRescueGroup.add(bedFrame, mattress, patientBody, stLabel);
}

export function equipPoliceCarsWithSecondOfficer(ctx) {
  const {
    THREE, createSpeechBubbleSprite, policeCarsList,
  } = ctx;
  policeCarsList.forEach((pCar) => {
    // Bổ sung Sĩ Quan Cảnh Sát số 2 (Chuyên trách lái phương tiện vi phạm/tai nạn về Đồn Cảnh Sát)
    const officer2 = new THREE.Group();
    const uniMat = new THREE.MeshStandardMaterial({ color: 0x0a2463 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 8, 10), uniMat);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    head.position.y = 1.50;
    const badge = createSpeechBubbleSprite('👮‍♂️ [Cảnh Sát #2]: Tôi sẽ tịch thu & lái chiếc xe vi phạm này về Đồn Cảnh Sát!', '#0a2463', '#ffd60a');
    badge.scale.set(1.85, 0.36, 1);
    badge.position.set(0, 2.02, 0);
    badge.visible = true;
    officer2.add(torso, head, badge);
    officer2.position.set(-1.4, 0, 0);
    officer2.visible = false;
    pCar.add(officer2);
    pCar.userData.secondOfficerNpc = officer2;
  });
}

export function spawnJoggersAndParkPhotographers(ctx) {
  const {
    THREE, cityJoggersList, createSpeechBubbleSprite, matPiano, parkPhotographersList, scene,
  } = ctx;
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d });

  // 1. Tạo 4 NPC Chạy Bộ Thể Dục (Joggers) vòng quanh vỉa hè thành phố
  for (let j = 0; j < 4; j++) {
    const jogger = new THREE.Group();
    const trackSuit = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.42, 8, 10),
      new THREE.MeshStandardMaterial({ color: [0x06d6a0, 0xff758f, 0x00bbf9, 0xffbe0b][j] })
    );
    trackSuit.position.y = 1.04;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 10), skinMat);
    head.position.y = 1.48;
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.018, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    headband.rotation.x = Math.PI / 2;
    headband.position.y = 1.53;

    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.48, 6, 8), matPiano);
    legL.position.set(-0.08, 0.42, 0);
    const legR = legL.clone();
    legR.position.x = 0.08;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 6, 8), skinMat);
    armL.position.set(-0.22, 1.1, 0);
    const armR = armL.clone();
    armR.position.x = 0.22;

    const badge = createSpeechBubbleSprite('🏃‍♂️ Đang chạy bộ thể dục quanh thành phố!', '#1b4332', '#06d6a0');
    badge.scale.set(1.4, 0.3, 1);
    badge.position.set(0, 1.95, 0);
    badge.visible = true;

    jogger.add(trackSuit, head, headband, legL, legR, armL, armR, badge);
    jogger.position.set(12.6, 0.24, (j - 1.5) * 18);
    jogger.userData = { legL, legR, armL, armR, headingRad: j % 2 === 0 ? 0 : Math.PI, phase: j * 2, turnCooldown: 0 };
    scene.add(jogger);
    cityJoggersList.push(jogger);
  }

  // 2. Tạo Cặp Đôi NPC Đứng Chụp Hình (Có hiệu ứng đèn Flash nháy sáng) trên vỉa hè Công viên & Khu mua sắm
  const photoSpots = [
    new THREE.Vector3(16.5, 0.24, -16.5),
    new THREE.Vector3(-16.5, 0.24, 16.5)
  ];
  photoSpots.forEach((spot, sIdx) => {
    const pairGroup = new THREE.Group();
    pairGroup.position.copy(spot);

    // Người chụp ảnh cầm máy ảnh DSLR / Điện thoại có đèn Flash
    const photographer = new THREE.Group();
    const pBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 8, 10), new THREE.MeshStandardMaterial({ color: 0x3a86ff }));
    pBody.position.y = 1.02;
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), skinMat);
    pHead.position.y = 1.46;
    const cameraBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), matPiano);
    cameraBox.position.set(0, 1.38, 0.22);
    const flashBulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    flashBulb.position.set(0, 1.42, 0.32);
    const pLabel = createSpeechBubbleSprite('📸 1.. 2.. 3.. Cười lên nào! *Tách!*', '#1e293b', '#ffd60a');
    pLabel.scale.set(1.5, 0.32, 1);
    pLabel.position.set(0, 1.92, 0);
    pLabel.visible = true;
    photographer.add(pBody, pHead, cameraBox, flashBulb, pLabel);

    // Người mẫu NPC đứng tạo dáng (Vẫy tay chữ V) đối diện
    const modelNpc = new THREE.Group();
    const mBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 8, 10), new THREE.MeshStandardMaterial({ color: 0xff758f }));
    mBody.position.y = 1.02;
    const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), skinMat);
    mHead.position.y = 1.46;
    const mArmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 6, 8), skinMat);
    mArmR.position.set(0.22, 1.25, 0);
    modelNpc.add(mBody, mHead, mArmR);
    modelNpc.position.set(0, 0, 2.2);
    modelNpc.rotation.y = Math.PI;

    pairGroup.add(photographer, modelNpc);
    scene.add(pairGroup);
    parkPhotographersList.push({ flashBulb, modelArm: mArmR, timer: sIdx * 1.5 });
  });
}

export function buildFull3DCabinsForLargeVehicles(ctx) {
  const {
    THREE, createCockpit3DButton, interiorVariants, manualTurretWaterDrops, matChrome, matGlass,
    scene, state,
  } = ctx;
  const busSeatMat = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.45 });
  const busSeatCushionMat = new THREE.MeshStandardMaterial({ color: 0xffbe0b, roughness: 0.5 });
  const handrailMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.6, roughness: 0.25 });
  const cabinWallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
  const medicBenchMat = new THREE.MeshStandardMaterial({ color: 0x06d6a0, roughness: 0.4 });
  const truckWoodBenchMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.65 });

  // =========================================================================
  // A. KHOANG NỘI THẤT 3D XE BUS (2 DÃY GHẾ DÀI TRÁI/PHẢI + BĂNG GHẾ CUỐI DÃY XE)
  // =========================================================================
  if (interiorVariants.BUS) {
    // Sàn xe Bus dài từ z = -1.5m đến z = +3.6m
    const busFloor = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.08, 5.2), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    busFloor.position.set(0, 0.18, 1.05);
    interiorVariants.BUS.add(busFloor);

    // Dựng 2 dãy ghế dài bên Trái (x = -0.76) và bên Phải (x = +0.76) dọc theo lối đi giữa
    [-0.76, 0.76].forEach((rowX) => {
      // Bệ đỡ dãy ghế dài
      const longBenchBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 3.6), busSeatMat);
      longBenchBase.position.set(rowX, 0.36, 1.15);
      const longBackrest = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.52, 3.6), busSeatCushionMat);
      longBackrest.position.set(rowX + (rowX > 0 ? 0.24 : -0.24), 0.72, 1.15);
      interiorVariants.BUS.add(longBenchBase, longBackrest);

      // Các đệm chia khoang ghế dọc theo dãy
      for (let sz = -0.35; sz <= 2.65; sz += 0.75) {
        const divider = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.06), handrailMat);
        divider.position.set(rowX, 0.56, sz);
        interiorVariants.BUS.add(divider);
      }

      // Thanh tay vịn dọc trên trần xe + Tay nắm treo cho khách đứng
      const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 4.2, 8), handrailMat);
      topRail.rotation.x = Math.PI / 2;
      topRail.position.set(rowX * 0.65, 1.62, 1.2);
      interiorVariants.BUS.add(topRail);
    });

    // Băng ghế ngang 5 chỗ ở CUỐI DÃY XE BUS (z = +3.25m, cao hơn sàn 1 bậc để nhìn bao quát toàn bộ khoang xe!)
    const rearBenchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.44, 0.62), busSeatMat);
    rearBenchSeat.position.set(0, 0.44, 3.25);
    const rearBenchBack = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.62, 0.12), busSeatCushionMat);
    rearBenchBack.position.set(0, 0.88, 3.52);
    // Vách kính sau cùng của xe Bus
    const rearBusFrame = new THREE.Mesh(new THREE.BoxGeometry(2.24, 1.65, 0.08), cabinWallMat);
    rearBusFrame.position.set(0, 1.05, 3.62);
    const rearWindowCutout = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.75), matGlass);
    rearWindowCutout.position.set(0, 1.32, 3.57);
    rearWindowCutout.rotation.y = Math.PI;
    interiorVariants.BUS.add(rearBenchSeat, rearBenchBack, rearBusFrame, rearWindowCutout);
  }

  // =========================================================================
  // B. KHOANG NỘI THẤT XE CỨU HỎA + ĐÀI NGỒI NÓC VÒI XỊT NƯỚC (ROOF TURRET SEAT)
  // =========================================================================
  if (interiorVariants.FIRETRUCK) {
    // 2 Dãy ghế lính cứu hỏa kèm bình dưỡng khí SCBA màu vàng sau lưng
    [-0.68, 0.68].forEach((rx) => {
      const crewBench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 2.2), new THREE.MeshStandardMaterial({ color: 0x9e2a2b }));
      crewBench.position.set(rx, 0.38, 1.15);
      const scbaTank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 12), handrailMat);
      scbaTank.position.set(rx, 0.82, 1.15);
      interiorVariants.FIRETRUCK.add(crewBench, scbaTank);
    });

    // ĐÀI CHỈ HUY & GHẾ NGỒI TRÊN NÓC VÒI XỊT NƯỚC (Đặt tại y = 1.65m .. 2.35m trên nóc xe Cứu hỏa)
    const roofPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.75, 0.12, 16), matChrome);
    roofPlatform.position.set(0, 1.62, -0.45);
    const turretSeat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.46), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    turretSeat.position.set(0, 1.84, -0.25);

    // Khớp xoay 360° của Súng Phun Nước Vòi Rồng (Nằm ngay trước mặt người ngồi trên nóc xe cứu hỏa!)
    ctx.firetruckRoofTurretPivot.position.set(0, 2.18, -0.68);
    const cannonBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.95, 12), matChrome);
    cannonBarrel.rotation.x = Math.PI / 2 - 0.15;
    cannonBarrel.position.set(0, 0.08, -0.38);
    const nozzleTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xd90429 }));
    nozzleTip.rotation.x = -Math.PI / 2 + 0.15;
    nozzleTip.position.set(0, 0.15, -0.86);

    // Nút 3D gắn ngay trên thân Vòi Rồng để bấm Tia Laser xịt nước trực tiếp
    createCockpit3DButton(
      ctx.firetruckRoofTurretPivot,
      '💦 XỊT VÒI RỒNG',
      0.22, 0.055, 0.02,
      new THREE.Vector3(0, 0.22, -0.15),
      '#00bbf9',
      () => {
        ctx.manualWaterSprayActive = !ctx.manualWaterSprayActive;
        state.lastActionLog = ctx.manualWaterSprayActive
          ? '💦 Đang BẬT Vòi Rồng Xịt Nước trên nóc Xe Cứu Hỏa! Xoay góc nhìn để hướng vòi nước vào đám cháy!'
          : '🛑 Đã khóa van Vòi Rồng trên nóc Xe Cứu Hỏa.';
      }
    );

    ctx.firetruckRoofTurretPivot.add(cannonBarrel, nozzleTip);
    interiorVariants.FIRETRUCK.add(roofPlatform, turretSeat, ctx.firetruckRoofTurretPivot);

    // Tạo 28 hạt nước áp lực cao bắn ra trực tiếp từ đầu Vòi Rồng trên nóc xe của người chơi
    const jetMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 28; i++) {
      const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), jetMat);
      pMesh.visible = false;
      scene.add(pMesh);
      manualTurretWaterDrops.push({ mesh: pMesh, t: i / 28 });
    }
  }

  // =========================================================================
  // C. CABIN THÙNG NGỒI PHÍA SAU CỦA XE CẤP CỨU (AMBULANCE BOX CABIN)
  // =========================================================================
  if (interiorVariants.AMBULANCE) {
    // Băng ghế dài bên Trái cho nhân viên y tế / người nhà bệnh nhân (Squad Bench)
    const leftMedicBench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 2.4), medicBenchMat);
    leftMedicBench.position.set(-0.75, 0.40, 1.35);
    // Tủ thiết bị y tế & ghế ngồi bên Phải
    const rightCabinet = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 2.4), cabinWallMat);
    rightCabinet.position.set(0.75, 0.40, 1.35);
    // Băng ca chính giữa thùng xe cấp cứu
    const centerStretcher = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.48, 1.75), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
    centerStretcher.position.set(0, 0.44, 1.35);
    // Ghế ngồi Y Sĩ ở Cuối Dãy Thùng Cấp Cứu (z = +2.55m) nhìn thẳng dọc theo băng ca lên cửa sổ thông Cabin trước
    const rearMedicSeat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 0.52), medicBenchMat);
    rearMedicSeat.position.set(0, 0.44, 2.55);
    interiorVariants.AMBULANCE.add(leftMedicBench, rightCabinet, centerStretcher, rearMedicSeat);
  }

  // =========================================================================
  // D. CABIN THÙNG NGỒI PHÍA SAU CỦA XE TẢI (TRUCK TROOP/CARGO BOX CABIN)
  // =========================================================================
  if (interiorVariants.TRUCK) {
    // 2 Dãy ghế gỗ/thép gấp dọc 2 bên vách thùng xe tải + Băng ghế cuối thùng
    [-0.82, 0.82].forEach((tx) => {
      const troopBench = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.40, 3.2), truckWoodBenchMat);
      troopBench.position.set(tx, 0.40, 1.45);
      const sideRibWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 3.2), new THREE.MeshStandardMaterial({ color: 0x475569 }));
      sideRibWall.position.set(tx + (tx > 0 ? 0.26 : -0.26), 0.95, 1.45);
      interiorVariants.TRUCK.add(troopBench, sideRibWall);
    });
    const rearTruckBench = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.44, 0.55), truckWoodBenchMat);
    rearTruckBench.position.set(0, 0.44, 2.95);
    interiorVariants.TRUCK.add(rearTruckBench);
  }
}

export function removeIntersectionGlitchesAndFixCarSpawn(ctx) {
  const {
    FIRE_STATION_BAY_POS, HOME_CAR_SPAWN_POS, HOME_SPAWN_POS, HOSPITAL_BAY_POS, cityBlocks,
    playerAvatarGroup, remoteCarMeshes, scene, state, vehicleRoot,
  } = ctx;
  // 1. Xóa các mái che đỏ (groundCanopy) bị treo lơ lửng ở các tòa nhà ẩn và xóa cục hộp đen car_guest_1 giữa đường
  cityBlocks.forEach((block) => {
    const toClean = [];
    block.children.forEach((c) => {
      if (c.isMesh && Math.abs(c.position.y - 3.6) < 0.2 && c.geometry?.parameters?.width > 13.5) {
        toClean.push(c);
      }
    });
    toClean.forEach((c) => block.remove(c));
  });

  if (typeof remoteCarMeshes !== 'undefined') {
    for (const [carId, mesh] of remoteCarMeshes.entries()) {
      if (carId === 'car_guest_1') {
        scene.remove(mesh);
        remoteCarMeshes.delete(carId);
      }
    }
  }

  // 2. Dời Trạm Cứu Hỏa và Bệnh Viện lùi sâu vào trong lô đất vỉa hè (x = ±22.5, z = ±22.5) để KHÔNG nằm trên lòng đường z = -14!
  FIRE_STATION_BAY_POS.set(22.5, 0, -22.5);
  HOSPITAL_BAY_POS.set(-22.5, 0, 22.5);
  scene.children.forEach((obj) => {
    if (obj.isGroup && Math.abs(obj.position.x - 24.5) < 1.0 && Math.abs(obj.position.z - (-14.0)) < 1.0) {
      obj.position.copy(FIRE_STATION_BAY_POS);
    }
  });
  if (ctx.fireIncidentState && ctx.fireIncidentState.truckRef) {
    ctx.fireIncidentState.truckRef.position.set(22.5, 0, -16.2);
  }

  // 3. Dời vị trí đỗ xe Rolls-Royce của người chơi tới vịnh đỗ sạch sẽ (-8.2, 0, -18.5), cách xa hoàn toàn cột đèn (-10.6, -13.5)!
  HOME_CAR_SPAWN_POS.set(-8.2, 0, -18.5);
  HOME_SPAWN_POS.set(-12.8, 0, -18.5);
  if (state.playerMode === 'ON_FOOT' && Math.abs(state.speedKmh) < 0.5) {
    vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
    state.avatarPos.copy(HOME_SPAWN_POS);
    playerAvatarGroup.position.copy(state.avatarPos);
  }
}

export function rebuildBusStopsAt5LampMidpointWithSeatedPassengers(ctx) {
  const {
    THREE, busStopWaitingQueues, cityBlocks, createFullLimbedHumanNpc, createSpeechBubbleSprite,
    createStreetLampWithRefraction, matGlass, matNappa, matWalnut,
  } = ctx;
  // Xóa các hàng đợi xe bus cũ nằm sai trên vạch qua đường
  busStopWaitingQueues.forEach((q) => {
    q.waitingNpcs.forEach((n) => {
      if (n.parent) n.parent.remove(n);
    });
  });
  busStopWaitingQueues.length = 0;

  // Dọc theo mỗi tuyến đường vỉa hè (từ z = -30 đến z = -14), đặt 5 Cột Đèn Đường tại:
  // z1 = -30, z2 = -26, z3 = -22, z4 = -18, z5 = -14.
  // Trung bình cộng khoảng cách của 5 cột đèn chính xác là: (-30 + -26 + -22 + -18 + -14) / 5 = -22.0m!
  const lampZCoords = [-30, -26, -22, -18, -14];
  const midpointBusStopZ = lampZCoords.reduce((acc, val) => acc + val, 0) / lampZCoords.length; // = -22.0m

  cityBlocks.forEach((block, bIdx) => {
    // Xóa trạm xe bus cũ nằm ở z = 0 (ngay lối băng qua đường)
    const oldStops = block.children.filter((c) => c.isGroup && Math.abs(c.position.x - (-11.2)) < 0.5 && Math.abs(c.position.z) < 1.0);
    oldStops.forEach((s) => block.remove(s));

    // Đặt 5 cột đèn dọc vỉa hè ở x = -10.8m
    if (bIdx === Math.floor(cityBlocks.length / 2)) {
      lampZCoords.forEach((lz) => {
        const lamp = createStreetLampWithRefraction(-10.8, lz, false);
        block.add(lamp);
      });
    }

    // Dựng Trạm Xe Bus 3D có Mái Vòm + Bệ Ghế Ngồi tại đúng Trung Bình Cộng của 5 cột đèn (x = -11.6, z = -22.0)
    const shelter = new THREE.Group();
    shelter.position.set(-11.6, 0.24, midpointBusStopZ);

    const platformBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 4.8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    platformBase.position.y = 0.07;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 4.6), new THREE.MeshStandardMaterial({ color: 0x0077b6 }));
    roof.position.y = 2.55;
    const glassBack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 4.4), matGlass);
    glassBack.position.set(-0.92, 1.3, 0);

    // Bệ ghế ngồi dài (Bench Seat) cho hành khách ngồi đợi xe Bus
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 3.4), matWalnut);
    benchSeat.position.set(-0.45, 0.26, 0);
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.45, 3.4), matNappa);
    benchBack.position.set(-0.72, 0.62, 0);
    shelter.add(platformBase, roof, glassBack, benchSeat, benchBack);

    // Đặt 3 NPC có ĐỦ TAY CHÂN & MẶT LEGO đang NGỒI trên bệ ghế đợi Xe Bus (Quay mặt ra lòng đường +X)
    const seatedWaiters = [];
    [-1.05, 0, 1.05].forEach((wz, wIdx) => {
      const seatedNpc = createFullLimbedHumanNpc(
        [0xff758f, 0x00bbf9, 0xffd166][wIdx],
        [0x1d3557, 0x2b2d42, 0x3d405b][wIdx],
        bIdx + wIdx,
        true // Tư thế ngồi có đùi + bắp chân trên bệ ghế!
      );
      seatedNpc.position.set(-0.42, 0.06, wz);
      seatedNpc.rotation.y = Math.PI / 2;
      shelter.add(seatedNpc);
      seatedWaiters.push(seatedNpc);
    });

    // Bảng tên Trạm Xe Bus gắn sát mép mái trạm (không bay lơ lửng)
    const busBoard = createSpeechBubbleSprite('🚏 TRẠM XE BUS (TRUNG BÌNH CỘNG 5 CỘT ĐÈN)', '#003566', '#00ff88');
    busBoard.scale.set(1.65, 0.34, 1);
    busBoard.position.set(0.2, 2.82, 0);
    busBoard.visible = true;
    shelter.add(busBoard);

    block.add(shelter);

    const worldStopPos = new THREE.Vector3(
      block.position.x - 11.2,
      0.24,
      block.position.z + midpointBusStopZ
    );
    busStopWaitingQueues.push({
      blockRef: block,
      localZ: midpointBusStopZ,
      worldPos: worldStopPos,
      waitingNpcs: seatedWaiters,
      respawnTimer: 0
    });
  });
}

export function rebuildGrannyModelsWithReal3DScooterAndFullLimbs(ctx) {
  const {
    THREE, createFullLimbedHumanNpc, createSpeechBubbleSprite, grannyObstacles, matChrome,
    matTireRubber, matWalnut,
  } = ctx;
  if (typeof grannyObstacles === 'undefined' || grannyObstacles.length < 2) return;

  // 1. Dựng lại Bà Già Đi Bộ Chống Gậy (Đủ 2 tay, 2 chân, tóc búi bạc, mặt Lego)
  const gWalker = grannyObstacles[0];
  gWalker.clear();
  const walkerNpc = createFullLimbedHumanNpc(0x7b2cbf, 0x2b2d42, 3, false, 0.94);
  const hairBun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
  hairBun.position.set(0, 1.52, -0.08);
  const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.88, 8), matWalnut);
  cane.position.set(0.24, 0.44, 0.18);
  const b1 = createSpeechBubbleSprite('👵 Ái chà! Xe tông trúng bà già đi bộ rồi! Gọi cấp cứu 115 mau!', '#590d22', '#ffd60a');
  b1.scale.set(1.8, 0.36, 1);
  b1.position.set(0, 1.92, 0);
  b1.visible = true;
  gWalker.add(walkerNpc, hairBun, cane, b1);
  gWalker.visible = false;

  // 2. Dựng lại Bà Già Chạy Xe Máy 3D Chân Thật (Xóa hoàn toàn khối hộp vàng vuông vức trong Ảnh 4!)
  const gMoto = grannyObstacles[1];
  gMoto.clear();
  const scooterPaint = new THREE.MeshPhysicalMaterial({ color: 0xff758f, roughness: 0.2, clearcoat: 0.8 });
  // 2 Bánh xe tròn + Yếm trước bo cong + Thân xe Vespa + Ghi-đông + Đèn pha tròn
  [-0.55, 0.55].forEach((wz) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 18), matTireRubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.26, wz);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.15, 14), matChrome);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(0, 0.26, wz);
    gMoto.add(w, rim);
  });
  const frontShield = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.48, 10, 14), scooterPaint);
  frontShield.position.set(0, 0.62, -0.42);
  frontShield.rotation.x = 0.22;
  const rearSeatBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.52, 10, 14), scooterPaint);
  rearSeatBody.rotation.x = Math.PI / 2;
  rearSeatBody.position.set(0, 0.52, 0.15);
  const hBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 8), matChrome);
  hBar.rotation.z = Math.PI / 2;
  hBar.position.set(0, 0.92, -0.36);

  // Bà già ngồi trên xe máy có đủ 2 tay nắm ghi-đông và 2 chân đặt trên sàn để chân!
  const motoGrannyNpc = createFullLimbedHumanNpc(0xf4a261, 0x1d3557, 2, true, 0.95);
  motoGrannyNpc.position.set(0, 0.26, -0.02);
  const b2 = createSpeechBubbleSprite('🛵👵 Ối làng nước ơi! Tông bà già chạy xe Vespa rồi!', '#590d22', '#00e5ff');
  b2.scale.set(1.8, 0.36, 1);
  b2.position.set(0, 1.98, 0);
  b2.visible = true;
  gMoto.add(frontShield, rearSeatBody, hBar, motoGrannyNpc, b2);
  gMoto.visible = false;
}

export function upgradeAmbulanceGlassAndAddLegsToAllBikeRiders(ctx) {
  const {
    THREE, allTrafficVehicles, matChrome,
  } = ctx;
  const glossyWindshieldMat = new THREE.MeshPhysicalMaterial({
    color: 0x091326,
    roughness: 0.05,
    metalness: 0.35,
    clearcoat: 1.0
  });
  const frameBlackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
  const emsGreenMat = new THREE.MeshStandardMaterial({ color: 0x06d6a0, roughness: 0.25 });
  const emsRedMat = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.25 });

  // 1. Nâng cấp toàn bộ Xe Cấp Cứu: Kính chắn gió đen bóng có viền khung đen, cửa sổ hông, cửa sổ sau, sọc Y tế Đỏ + Xanh Ngọc nổi bật
  allTrafficVehicles.filter((v) => v.userData.category === 'AMBULANCE').forEach((amb) => {
    // Kính chắn gió trước nổi bật rõ ràng như các xe ô tô NPC
    const frontGlassFrame = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.78, 0.08), frameBlackMat);
    frontGlassFrame.position.set(0, 1.52, -2.12);
    frontGlassFrame.rotation.x = 0.28;
    const frontGlassPane = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.68, 0.10), glossyWindshieldMat);
    frontGlassPane.position.copy(frontGlassFrame.position);
    frontGlassPane.rotation.copy(frontGlassFrame.rotation);

    // Kính cửa sổ ghế tài xế & ghế phụ 2 bên hông + Kính khoang cấp cứu phía sau
    [-1.09, 1.09].forEach((sx) => {
      const cabSideWin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.92), glossyWindshieldMat);
      cabSideWin.position.set(sx, 1.50, -1.55);
      const medSideWin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 1.45), glossyWindshieldMat);
      medSideWin.position.set(sx, 1.62, 0.55);
      const greenBelt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 3.42), emsGreenMat);
      greenBelt.position.set(sx, 0.74, 0.55);
      amb.add(cabSideWin, medSideWin, greenBelt);
    });

    // 2 Ô kính cửa sau xe cấp cứu + Nóc sơn Đỏ Y Tế nổi bật
    const rearDoubleWin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.58, 0.08), glossyWindshieldMat);
    rearDoubleWin.position.set(0, 1.62, 2.28);
    const redRoofCap = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.12, 3.40), emsRedMat);
    redRoofCap.position.set(0, 2.26, 0.55);

    amb.add(frontGlassFrame, frontGlassPane, rearDoubleWin, redRoofCap);
  });

  // 2. Bổ sung ĐỦ 2 CHÂN NGỒI GẬP ĐẦU GỐI GÁC LÊN BÀN ĐẠP / GÁC CHÂN cho tất cả NPC lái Xe Máy, Moto & Xe Đạp
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.5 });

  allTrafficVehicles.forEach((veh, idx) => {
    const vd = veh.userData;
    if (vd.category === 'MOTORBIKE' || vd.category === 'BICYCLE') {
      // Bổ sung 2 chân (Đùi + Bắp chân + Giày) cho Người Lái chính (nếu chưa có chân)
      if (vd.category === 'MOTORBIKE') {
        [-0.17, 0.17].forEach((lx) => {
          const riderThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.26, 6, 8), pantsMat);
          riderThigh.rotation.x = Math.PI / 2.6;
          riderThigh.position.set(lx, 0.72, -0.02);

          const riderCalf = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 6, 8), pantsMat);
          riderCalf.rotation.x = -0.25;
          riderCalf.position.set(lx, 0.46, -0.14);

          const riderBoot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.18), shoeMat);
          riderBoot.position.set(lx, 0.30, -0.20);

          // Thanh gác chân (Footpeg) bằng hợp kim
          const footpeg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 8), matChrome);
          footpeg.rotation.z = Math.PI / 2;
          footpeg.position.set(lx, 0.28, -0.16);

          veh.add(riderThigh, riderCalf, riderBoot, footpeg);
        });
      }

      // Bổ sung ĐỦ 2 CHÂN cho Người Ngồi Sau (Pillion Passenger) trên Xe Máy / Xe Đạp
      if (vd.pillionPassengerMesh) {
        [-0.18, 0.18].forEach((px) => {
          const pThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.22, 6, 8), pantsMat);
          pThigh.rotation.x = Math.PI / 2.8;
          pThigh.position.set(px, 0.72, 0.32);

          const pCalf = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.25, 6, 8), pantsMat);
          pCalf.position.set(px, 0.48, 0.24);

          const pShoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.16), shoeMat);
          pShoe.position.set(px, 0.32, 0.20);

          vd.pillionPassengerMesh.add(pThigh, pCalf, pShoe);
        });
        // Ngẫu nhiên 50% xe chở 2 người, 50% xe chạy 1 mình như ngoài đời
        vd.pillionPassengerMesh.visible = (idx % 2 === 0);
      }
    }
  });
}

export function upgradeAllLandmarksWithWallSignsDoorsCinemasAndLivelyPlazas(ctx) {
  const {
    THREE, cityBlocks, createFullLimbedHumanNpc, createWallMountedSignboardMesh, matChrome,
    matWalnut, streetBandPerformers,
  } = ctx;
  const WALL_SIGN_HEIGHT_2_5X_NPC = 4.15; // Chiều cao NPC = 1.66m -> 2.5 * 1.66m = 4.15m chuẩn xác!
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.2 });
  const doorGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55, roughness: 0.1 });
  const redCarpetMat = new THREE.MeshStandardMaterial({ color: 0xb80c09, roughness: 0.8 });

  let poiGlobalIndex = 0;

  cityBlocks.forEach((block, bIdx) => {
    block.children.forEach((poi) => {
      if (!poi.isGroup || Math.abs(poi.position.y - 0.24) > 0.08) return;
      poiGlobalIndex++;

      // Xác định hướng mặt tiền (Front Facade) quay ra trục đường chính gần nhất (Z hoặc X)
      const faceDirZ = poi.position.z < 0 ? 1 : -1;

      // 1. Ẩn các Sprite bảng hiệu bay lơ lửng trên trời và gắn BẢNG HIỆU HỘP ĐÈN 3D SÁT VÁCH TƯỜNG ở độ cao y = 4.15m (2.5x NPC)!
      let detectedTitle = '🏢 ĐỊA ĐIỂM THÀNH PHỐ';
      poi.children.forEach((ch) => {
        if (ch.isSprite) {
          ch.visible = false; // Tắt sprite bay lơ lửng
        }
      });

      const buildingTitles = [
        '⛲ CÔNG VIÊN ĐÀI PHUN NƯỚC',
        '☕ TIỆM CAFE SÂN VƯỜN LE PARIS',
        '🌸 TIỆM HOA TƯƠI FLORA',
        '🎬 RẠP CHIẾU PHIM CGV IMAX 3D',
        '👗 BOUTIQUE THỜI TRANG VIP',
        '🍽️ NHÀ HÀNG BISTRO ẨM THỰC',
        '🛒 SIÊU THỊ FRESH SUPERMARKET',
        '🏥 BỆNH VIỆN ĐA KHOA QUỐC TẾ',
        '🚓 ĐỒN CẢNH SÁT TRUNG TÂM',
        '🏬 TRUNG TÂM THƯƠNG MẠI DIAMOND',
        '🎬 RẠP CHIẾU PHIM LOTTE CINEMA',
        '🏡 KHU PHỐ NHÀ DÂN & CỬA HIỆU'
      ];
      detectedTitle = buildingTitles[poiGlobalIndex % buildingTitles.length];

      // Tìm khối tường chính của địa điểm để gắn sát Bảng Hiệu Tường (y = 4.15m) & Cửa Chính Ra Vào (y = 0 .. 2.6m)
      const mainBox = poi.children.find((ch) => ch.isMesh && ch.geometry?.type === 'BoxGeometry' && ch.geometry.parameters.height >= 3.5);
      const frontWallZ = mainBox
        ? mainBox.position.z + faceDirZ * (mainBox.geometry.parameters.depth / 2 + 0.09)
        : faceDirZ * 4.4;

      const wallSign = createWallMountedSignboardMesh(detectedTitle, '#0f172a', '#ffd60a');
      wallSign.position.set(0, WALL_SIGN_HEIGHT_2_5X_NPC, frontWallZ);
      poi.add(wallSign);

      // 2. Lắp CỬA RA VÀO / CỔNG CHÍNH ĐƯỢC TRANG TRÍ (Khung cổng vàng, 2 cánh cửa kính, mái đón, thảm đỏ, 2 chậu cây cảnh)
      //    giúp người chơi nhìn vào biết ngay mặt nào là Mặt Trước (Front Entrance) và Mặt Sau của địa điểm!
      if (mainBox) {
        const entranceGroup = new THREE.Group();
        entranceGroup.position.set(0, 0, frontWallZ);

        const doorArch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.75, 0.22), doorFrameMat);
        doorArch.position.y = 1.38;
        const leftGlassDoor = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2.45, 0.26), doorGlassMat);
        leftGlassDoor.position.set(-0.56, 1.25, 0);
        const rightGlassDoor = leftGlassDoor.clone();
        rightGlassDoor.position.x = 0.56;

        // Mái hiên đón khách trên cửa chính + Thảm đỏ chào mừng + 2 Đèn tường ấm áp
        const marqueeCanopy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 1.35), new THREE.MeshStandardMaterial({ color: 0x9e2a2b }));
        marqueeCanopy.position.set(0, 2.85, faceDirZ * 0.55);
        const welcomeMat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 1.8), redCarpetMat);
        welcomeMat.position.set(0, 0.02, faceDirZ * 0.85);

        [-1.55, 1.55].forEach((px) => {
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0xd4a373 }));
          pot.position.set(px, 0.22, faceDirZ * 0.45);
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), new THREE.MeshStandardMaterial({ color: 0x2d6a4f }));
          bush.position.set(px, 0.65, faceDirZ * 0.45);
          entranceGroup.add(pot, bush);
        });

        entranceGroup.add(doorArch, leftGlassDoor, rightGlassDoor, marqueeCanopy, welcomeMat);
        poi.add(entranceGroup);
      }

      // 3. Nếu là RẠP CHIẾU PHIM (CGV / LOTTE CINEMA): Trang trí Poster Phim lớn phát sáng, Quầy Bắp Rang Bơ & Khán giả xếp hàng
      if (detectedTitle.includes('RẠP CHIẾU PHIM') && mainBox) {
        mainBox.material = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.3 });
        const posterScreen = createWallMountedSignboardMesh('🍿 ĐANG CHIẾU: SIÊU XE ĐẠI CHIẾN 3D (IMAX)', '#780000', '#00e5ff');
        posterScreen.scale.set(1.25, 1.35, 1);
        posterScreen.position.set(0, 2.35, frontWallZ + faceDirZ * 0.08);
        poi.add(posterScreen);

        // Quầy Bắp Rang Bơ (Popcorn Stand) + 2 Khán giả NPC đứng mua vé xem phim trước rạp
        const popcornCart = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.35, 0.75), new THREE.MeshStandardMaterial({ color: 0xffbe0b }));
        popcornCart.position.set(-2.6, 0.68, frontWallZ + faceDirZ * 1.2);
        const fan1 = createFullLimbedHumanNpc(0xff758f, 0x1e293b, 1, false, 0.96);
        fan1.position.set(-1.3, 0, frontWallZ + faceDirZ * 1.4);
        fan1.rotation.y = faceDirZ > 0 ? Math.PI : 0;
        const fan2 = createFullLimbedHumanNpc(0x00bbf9, 0x334155, 4, false, 0.96);
        fan2.position.set(1.3, 0, frontWallZ + faceDirZ * 1.4);
        fan2.rotation.y = faceDirZ > 0 ? Math.PI : 0;
        poi.add(popcornCart, fan1, fan2);
      }

      // 4. Lấp đầy các bàn dù Cafe / Nhà hàng đang trống trơn (trong Ảnh 6) bằng các CẶP ĐÔI NPC NGỒI GHẾ UỐNG CAFE & TRÒ CHUYỆN!
      poi.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry?.type === 'CylinderGeometry' && Math.abs(ch.position.y - 0.78) < 0.05) {
          const tx = ch.position.x;
          const tz = ch.position.z;
          // Thêm 2 ghế tựa + 2 Cốc Cafe trên mặt bàn + Cặp đôi Nam/Nữ ngồi đối diện nhau trò chuyện
          [-0.68, 0.68].forEach((sideX, cIdx) => {
            const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.42), matWalnut);
            chair.position.set(tx + sideX, 0.22, tz);
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            cup.position.set(tx + sideX * 0.35, 0.86, tz);

            const coupleNpc = createFullLimbedHumanNpc(
              cIdx === 0 ? 0xff758f : 0x0077b6,
              0x1e293b,
              cIdx + 1,
              true, // Tư thế ngồi ghế có đủ đùi + bắp chân + mặt Lego
              0.94
            );
            coupleNpc.position.set(tx + sideX, 0.02, tz);
            coupleNpc.rotation.y = sideX < 0 ? Math.PI / 2 : -Math.PI / 2;
            poi.add(chair, cup, coupleNpc);
          });
        }
      });
    });

    // 5. KHAI THÁC KHOẢNG TRỐNG QUANH CÁC ĐỊA ĐIỂM TRONG MỖI Ô PHỐ:
    //    - Xe Bán Kem Tươi + Người bán & Khách ăn kem
    //    - Sân khấu Ca Hát Đường Phố (Nhạc công & Ca sĩ + Khán giả vỗ tay)
    //    - Trẻ em cầm bóng bay chạy nhảy đuổi bắt vui chơi
    if (bIdx % 2 === 0) {
      // A. XE BÁN KEM TƯƠI (ICE CREAM CART) & TỤ TẬP ĂN KEM
      const iceCreamSpot = new THREE.Group();
      iceCreamSpot.position.set(14.8, 0.24, -14.8);
      const cartBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 0.9), new THREE.MeshStandardMaterial({ color: 0xffafcc }));
      cartBody.position.y = 0.55;
      const cartUmbrella = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0x00bbf9 }));
      cartUmbrella.position.set(0, 2.05, 0);
      const vendor = createFullLimbedHumanNpc(0xffffff, 0x0077b6, 1, false, 0.95);
      vendor.position.set(0, 0, -0.75);
      const customer1 = createFullLimbedHumanNpc(0xffbe0b, 0x2b2d42, 0, false, 0.92);
      customer1.position.set(-0.6, 0, 0.85);
      customer1.rotation.y = Math.PI;
      const icSign = createWallMountedSignboardMesh('🍦 XE KEM TƯƠI & TỤ TẬP ĂN UỐNG', '#ff4d6d', '#ffffff');
      icSign.scale.set(0.45, 0.45, 1);
      icSign.position.set(0, 2.55, 0);
      iceCreamSpot.add(cartBody, cartUmbrella, vendor, customer1, icSign);
      block.add(iceCreamSpot);
    } else {
      // B. SÂN KHẤU CA HÁT ĐƯỜNG PHỐ (BUSKING LIVE MUSIC)
      const stageSpot = new THREE.Group();
      stageSpot.position.set(-14.8, 0.24, 14.8);
      const carpet = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x7209b7 }));
      const singer = createFullLimbedHumanNpc(0xff006e, 0x111827, 2, false, 0.96); // Mặt Lego miệng chữ O đang hát
      const micStand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 1.35, 8), matChrome);
      micStand.position.set(0, 0.68, 0.35);
      const listener1 = createFullLimbedHumanNpc(0x06d6a0, 0x1e293b, 1, false, 0.94);
      listener1.position.set(-0.9, 0, 1.45);
      listener1.rotation.y = Math.PI;
      const listener2 = createFullLimbedHumanNpc(0xffd166, 0x1e293b, 4, false, 0.94);
      listener2.position.set(0.9, 0, 1.45);
      listener2.rotation.y = Math.PI;
      const musicSign = createWallMountedSignboardMesh('🎤🎸 GIAO LƯU CA HÁT ĐƯỜNG PHỐ', '#3a0ca3', '#00f5d4');
      musicSign.scale.set(0.48, 0.45, 1);
      musicSign.position.set(0, 2.45, 0);
      stageSpot.add(carpet, singer, micStand, listener1, listener2, musicSign);
      block.add(stageSpot);
      streetBandPerformers.push({ singer, listener1, listener2 });
    }
  });
}

export function setupDogWalkersPlayingKidsAnd7SecPhotoRotation(ctx) {
  const {
    THREE, createFullLimbedHumanNpc, createSpeechBubbleSprite, dogWalkerUnits, matChrome,
    parkPhotographersList, playingChildrenUnits, rotatingSocialWanderers, scene,
  } = ctx;
  // 1. Xóa các cặp chụp hình cụt chân đứng đơ cũ trong parkPhotographersList và thay bằng Cặp Đôi Đủ Tay Chân Di Chuyển Mỗi 7 Giây!
  parkPhotographersList.forEach((pg) => {
    if (pg.flashBulb && pg.flashBulb.parent && pg.flashBulb.parent.parent) {
      scene.remove(pg.flashBulb.parent.parent);
    }
  });
  parkPhotographersList.length = 0;

  const tourWaypoints = [
    new THREE.Vector3(-15.5, 0.24, -15.5),
    new THREE.Vector3(15.5, 0.24, -15.5),
    new THREE.Vector3(15.5, 0.24, 15.5),
    new THREE.Vector3(-15.5, 0.24, 15.5)
  ];

  for (let p = 0; p < 2; p++) {
    const tourGroup = new THREE.Group();
    const startWp = p * 2;
    tourGroup.position.copy(tourWaypoints[startWp]);

    const cameraman = createFullLimbedHumanNpc(0x3a86ff, 0x1e293b, 4, false, 0.96);
    const flashBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
    );
    flashBulb.position.set(0, 1.38, 0.28);
    cameraman.add(flashBulb);

    const modelGirl = createFullLimbedHumanNpc(0xff758f, 0xffffff, 1, false, 0.94);
    modelGirl.position.set(0, 0, 1.85);
    modelGirl.rotation.y = Math.PI;

    const statusSign = createSpeechBubbleSprite('📸 [Hoạt cảnh 7s]: Đang chụp hình kỷ niệm -> Chuẩn bị dạo sang địa điểm kế tiếp!', '#1e293b', '#00ff88');
    statusSign.scale.set(1.75, 0.35, 1);
    statusSign.position.set(0, 2.02, 0.9);
    statusSign.visible = true;

    tourGroup.add(cameraman, modelGirl, statusSign);
    scene.add(tourGroup);

    rotatingSocialWanderers.push({
      group: tourGroup,
      cameraman,
      modelGirl,
      flashBulb,
      waypoints: tourWaypoints,
      wpIndex: startWp,
      mode: 'POSING_7S', // 'POSING_7S' (kéo dài đúng 7.0 giây) -> 'WALKING_TO_NEXT'
      timer: 7.0
    });
  }

  // 2. Tạo 3 NPC DẮT CHÓ ĐI DẠO (Có dây xích 3D nối từ tay NPC tới vòng cổ chú Chó 4 chân chạy lon ton phía trước)
  const dogFurMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.6 });
  for (let d = 0; d < 3; d++) {
    const walkerUnit = new THREE.Group();
    const owner = createFullLimbedHumanNpc([0x06d6a0, 0xffbe0b, 0xc77dff][d], 0x1e293b, d, false, 0.96);

    // Chú chó cưng 4 chân đi phía trước chủ 1.25m
    const petDog = new THREE.Group();
    const dBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 8, 10), dogFurMat);
    dBody.rotation.x = Math.PI / 2;
    dBody.position.y = 0.28;
    const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), dogFurMat);
    dHead.position.set(0, 0.40, 0.24);
    const dogLegs = [];
    [[-0.07, -0.14], [0.07, -0.14], [-0.07, 0.14], [0.07, 0.14]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 6, 6), dogFurMat);
      leg.position.set(lx, 0.12, lz);
      petDog.add(leg);
      dogLegs.push(leg);
    });
    petDog.add(dBody, dHead);
    petDog.position.set(0, 0, 1.25);

    // Dây xích dắt chó (Leash) nối từ tay phải chủ tới cổ chú chó
    const leashGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.22, 0.85, 0.1),
      new THREE.Vector3(0, 0.36, 1.15)
    ]);
    const leashLine = new THREE.Line(leashGeo, new THREE.LineBasicMaterial({ color: 0xff4d6d, linewidth: 2 }));

    const walkTag = createSpeechBubbleSprite('🐕🚶 Đang dắt cún cưng đi dạo mát!', '#1b4332', '#ffd60a');
    walkTag.scale.set(1.4, 0.3, 1);
    walkTag.position.set(0, 1.92, 0.5);
    walkTag.visible = true;

    walkerUnit.add(owner, petDog, leashLine, walkTag);
    walkerUnit.position.set(d % 2 === 0 ? -13.2 : 13.2, 0.24, (d - 1) * 22);
    scene.add(walkerUnit);
    dogWalkerUnits.push({ group: walkerUnit, owner, petDog, dogLegs, dir: d % 2 === 0 ? 1 : -1, phase: d * 1.7 });
  }

  // 3. Tạo Nhóm TRẺ EM (Con Nít scale = 0.65) cầm Bóng Bay đa sắc chạy nhảy đuổi bắt vui đùa ở các khoảng sân rộng
  const kidSpotCenters = [
    new THREE.Vector3(-16.0, 0.24, -4.0),
    new THREE.Vector3(16.0, 0.24, 6.0)
  ];
  kidSpotCenters.forEach((center, kIdx) => {
    for (let c = 0; c < 3; c++) {
      const kid = createFullLimbedHumanNpc(
        [0xff758f, 0x00f5d4, 0xffd166][c],
        0x0077b6,
        1, // Mặt Lego cười tươi lộ răng
        false,
        0.64 // Chiều cao trẻ em
      );
      // Quả bóng bay (Balloon) buộc trên tay trẻ em
      const balloonString = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.65, 6), matChrome);
      balloonString.position.set(0, 0.32, 0);
      const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshStandardMaterial({ color: [0xff006e, 0x00bbf9, 0xffbe0b][c], roughness: 0.2 })
      );
      balloon.position.set(0, 0.68, 0);
      kid.userData.rightArm.add(balloonString, balloon);

      if (c === 0) {
        const kidBubble = createSpeechBubbleSprite('🎈👧👦 [Trẻ Em Vui Chơi]: Đuổi bắt vui quá các bạn ơi! Haha!', '#7209b7', '#ffd60a');
        kidBubble.scale.set(1.5, 0.32, 1);
        kidBubble.position.set(0, 1.35, 0);
        kidBubble.visible = true;
        kid.add(kidBubble);
      }

      scene.add(kid);
      playingChildrenUnits.push({
        mesh: kid,
        center: center.clone(),
        angle: (c / 3) * Math.PI * 2 + kIdx,
        radius: 1.85,
        phase: c * 2.1
      });
    }
  });
}

export function setupKidnapperRobberAndChildDrama(ctx) {
  const {
    createFullLimbedHumanNpc, createSpeechBubbleSprite, kidnapperDramaUnit, scene,
  } = ctx;
  if (typeof createFullLimbedHumanNpc !== 'function') return;

  // 1. Tên Cướp Bắt Cóc Trẻ Em (Áo khoác đen kín, quần đen, mặt Lego giận dữ, nón trùm)
  const robber = createFullLimbedHumanNpc(0x1a1a1a, 0x111111, 4, false, 1.05);
  const robberBubble = createSpeechBubbleSprite('🦹‍♂️ CƯỚP ĐÂY! Đứng lại đứa bé kia! Bắt cóc tống tiền!', '#4a0e17', '#ff4d6d');
  robberBubble.scale.set(1.7, 0.35, 1);
  robberBubble.position.set(0, 2.05, 0);
  robberBubble.visible = true;
  robber.add(robberBubble);
  robber.userData.role = 'KIDNAPPER';
  robber.userData.bubble = robberBubble;
  robber.userData.headingRad = 0;
  robber.userData.baseY = 0.24;
  robber.position.set(13.2, 0.24, 6.0);
  scene.add(robber);

  // 2. Em Bé Bị Cướp Rượt Đuổi (Scale nhỏ 0.62, áo vàng tươi, quần xanh, mặt khóc sợ hãi, cầm bóng bay)
  const child = createFullLimbedHumanNpc(0xffbe0b, 0x0077b6, 3, false, 0.62);
  const childBubble = createSpeechBubbleSprite('👶 CỨU BÉ VỚI! Có kẻ bắt cóc rượt đuổi em!', '#2b0938', '#ffd60a');
  childBubble.scale.set(1.5, 0.32, 1);
  childBubble.position.set(0, 1.45, 0);
  childBubble.visible = true;
  child.add(childBubble);
  child.userData.role = 'KIDNAPPED_CHILD';
  child.userData.bubble = childBubble;
  child.userData.headingRad = 0;
  child.userData.baseY = 0.24;
  child.position.set(13.2, 0.24, 9.2); // Chạy trước tên cướp 3.2m
  scene.add(child);

  kidnapperDramaUnit.robber = robber;
  kidnapperDramaUnit.child = child;
}

export function populateAllNpcVehiclesWithVisibleOccupants(ctx) {
  const {
    THREE, allTrafficVehicles, attachOccupancyCounterBadge, createVisibleCabinOccupantMesh,
    matChrome, matClearCabinGlass,
  } = ctx;
  const passengerColors = [0xff758f, 0x00bbf9, 0xffd166, 0x06d6a0, 0xc77dff, 0xf4a261, 0x90e0ef, 0xffafcc];

  allTrafficVehicles.forEach((veh, vIdx) => {
    const vd = veh.userData;
    const cat = vd.category;

    // 1. Chuyển tất cả các khối kính Cabin (vốn đang bị màu đen đặc 0x101926 hoặc 0x0f172a) thành Kính Trong Suốt!
    veh.traverse((child) => {
      if (child.isMesh && child.position.y > 0.82 && child.geometry) {
        const isCabinMesh =
          (child.geometry.type === 'CylinderGeometry' && Math.abs(child.position.y - 1.0) < 0.15) ||
          (child.geometry.type === 'BoxGeometry' && child.position.y >= 0.95 && child.material !== matChrome);

        if (isCabinMesh && cat !== 'BUS' && cat !== 'FIRETRUCK' && cat !== 'TRUCK' && cat !== 'AMBULANCE') {
          child.material = matClearCabinGlass;
          child.renderOrder = 2;
        }
      }
    });

    // =========================================================================
    // A. XE CẢNH SÁT (POLICE CAR): 2 Sĩ Quan Cảnh Sát ghế trước + 1 Ghế Tội Phạm phía sau
    // =========================================================================
    if (cat === 'POLICE') {
      const cabinInterior = new THREE.Group();
      const officerDriver = createVisibleCabinOccupantMesh(0x0a2463, 'POLICE', 0, true);
      officerDriver.position.set(-0.42, 0.56, -0.22);

      const officerPartner = createVisibleCabinOccupantMesh(0x0a2463, 'POLICE', 4, false);
      officerPartner.position.set(0.42, 0.56, -0.22);

      // Ghế sau dành cho Tội phạm bị bắt (chỉ hiện khi xe cảnh sát vừa bắt trộm/cướp)
      const arrestedSuspect = createVisibleCabinOccupantMesh(0x222222, 'CITIZEN', 2, false);
      arrestedSuspect.position.set(0.0, 0.56, 0.48);
      arrestedSuspect.visible = false;

      cabinInterior.add(officerDriver, officerPartner, arrestedSuspect);
      veh.add(cabinInterior);

      vd.cabinDriverMesh = officerDriver;
      vd.cabinPartnerMesh = officerPartner;
      vd.cabinSuspectMesh = arrestedSuspect;
      attachOccupancyCounterBadge(veh, '🚓 Cảnh Sát: 2 Sĩ Quan Tuần Tra', '#00bbf9', 1.72);
    }

    // =========================================================================
    // B. XE TAXI (TAXI): 1 Tài xế cố định + 3 Ghế Hành Khách (Ẩn/Hiện theo đúng số khách thực tế 0..3)
    // =========================================================================
    else if (vd.isTaxi) {
      const cabinInterior = new THREE.Group();
      const taxiDriver = createVisibleCabinOccupantMesh(0xf8f9fa, 'CITIZEN', 1, true);
      taxiDriver.position.set(-0.42, 0.56, -0.22);
      cabinInterior.add(taxiDriver);

      const seatCoords = [
        [0.42, 0.56, -0.22], // Ghế phụ trước
        [-0.42, 0.56, 0.45], // Ghế sau trái
        [0.42, 0.56, 0.45]   // Ghế sau phải
      ];
      const paxMeshes = [];
      seatCoords.forEach(([sx, sy, sz], pIdx) => {
        const pax = createVisibleCabinOccupantMesh(
          passengerColors[(vIdx + pIdx) % passengerColors.length],
          'CITIZEN',
          pIdx + 1,
          false
        );
        pax.position.set(sx, sy, sz);
        cabinInterior.add(pax);
        paxMeshes.push(pax);
      });

      veh.add(cabinInterior);
      vd.cabinPassengerMeshes = paxMeshes;
      // Khởi tạo số khách ban đầu khác nhau (có chiếc đang trống 0 khách, có chiếc chở 1-2 khách)
      vd.currentPassengers = vIdx % 3;
      vd.maxPassengers = 3;
      vd.nextStopMode = vd.currentPassengers > 0 ? 'DROPOFF' : 'PICKUP';
      attachOccupancyCounterBadge(veh, `🚕 Taxi [Khách: ${vd.currentPassengers}/3]`, '#ffd60a', 1.72);
    }

    // =========================================================================
    // C. XE Ô TÔ CÁ NHÂN (CAR): 1 Tài xế + Ngẫu nhiên 0..3 Người đi cùng (1 đến 4 người/xe)
    // =========================================================================
    else if (cat === 'CAR') {
      const cabinInterior = new THREE.Group();
      const carDriver = createVisibleCabinOccupantMesh(
        passengerColors[vIdx % passengerColors.length],
        'CITIZEN',
        vIdx,
        true
      );
      carDriver.position.set(-0.42, 0.56, -0.22);
      cabinInterior.add(carDriver);

      const extraCount = vIdx % 4; // 0, 1, 2 hoặc 3 hành khách đi cùng tài xế
      const seatCoords = [
        [0.42, 0.56, -0.22],
        [-0.42, 0.56, 0.45],
        [0.42, 0.56, 0.45]
      ];
      for (let p = 0; p < extraCount; p++) {
        const [sx, sy, sz] = seatCoords[p];
        const pax = createVisibleCabinOccupantMesh(
          passengerColors[(vIdx + p + 2) % passengerColors.length],
          'CITIZEN',
          p,
          false
        );
        pax.position.set(sx, sy, sz);
        cabinInterior.add(pax);
      }

      veh.add(cabinInterior);
      const totalPeople = 1 + extraCount;
      attachOccupancyCounterBadge(veh, `🚗 Ô tô [${totalPeople}/4 Người trong xe]`, '#4cd964', 1.68);
    }

    // =========================================================================
    // D. XE BUS THÀNH PHỐ (BUS): Mở khung kính trong suốt 2 bên sườn + 1 Tài xế + 12 Ghế Hành Khách 3D
    // =========================================================================
    else if (cat === 'BUS') {
      // Thu thấp phần thùng đặc bên dưới xuống y = 0.72m và biến toàn bộ tầng cửa sổ (y = 1.05..2.35m) thành kính trong suốt!
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry?.type === 'BoxGeometry') {
          const h = ch.geometry.parameters.height;
          if (h > 1.2) {
            ch.scale.y = 0.52;
            ch.position.y = 0.68;
          } else if (ch.position.y > 1.8) {
            ch.material = matClearCabinGlass;
            ch.renderOrder = 2;
          }
        }
      });

      // Khung lồng kính trong suốt bao quanh khoang hành khách Xe Bus + Trần xe Bus
      const glassGreenhouse = new THREE.Mesh(new THREE.BoxGeometry(2.32, 1.25, 7.45), matClearCabinGlass);
      glassGreenhouse.position.set(0, 1.68, 0);
      glassGreenhouse.renderOrder = 2;
      const busRoofCap = new THREE.Mesh(
        new THREE.BoxGeometry(2.36, 0.14, 7.55),
        new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.3 })
      );
      busRoofCap.position.set(0, 2.34, 0);

      // Đèn LED chiếu sáng trong khoang Xe Bus để ban đêm nhìn từ ngoài vào thấy rõ từng hàng ghế và từng hành khách!
      const busInteriorLight = new THREE.PointLight(0xfff3b0, 6, 9, 1.2);
      busInteriorLight.position.set(0, 2.1, 0);
      veh.add(glassGreenhouse, busRoofCap, busInteriorLight);

      const busOccupantsGroup = new THREE.Group();
      // 1 Tài xế Xe Bus ngồi ở đầu xe (z = -3.15)
      const busDriver = createVisibleCabinOccupantMesh(0x00bbf9, 'CITIZEN', 0, true);
      busDriver.position.set(-0.68, 1.02, -3.15);
      busOccupantsGroup.add(busDriver);

      // 12 Hành khách ngồi dọc 2 bên cửa sổ (6 hàng x 2 bên Trái/Phải)
      const busPaxMeshes = [];
      const rowZPositions = [-2.1, -1.15, -0.2, 0.75, 1.7, 2.65];
      rowZPositions.forEach((rz, rIdx) => {
        [-0.74, 0.74].forEach((rx, sideIdx) => {
          const pIdx = rIdx * 2 + sideIdx;
          const pax = createVisibleCabinOccupantMesh(
            passengerColors[pIdx % passengerColors.length],
            'CITIZEN',
            pIdx,
            false
          );
          pax.position.set(rx, 1.02, rz);
          busOccupantsGroup.add(pax);
          busPaxMeshes.push(pax);
        });
      });

      veh.add(busOccupantsGroup);
      vd.cabinPassengerMeshes = busPaxMeshes;
      vd.maxPassengers = 12;
      vd.currentPassengers = vIdx === 0 ? 8 : 3; // Chiếc đông khách (8/12), chiếc thưa khách (3/12)
      vd.nextStopMode = vIdx === 0 ? 'DROPOFF' : 'PICKUP';
      attachOccupancyCounterBadge(
        veh,
        `🚌 Xe Bus [Khách: ${vd.currentPassengers}/12 + 1 Tài Xế]`,
        '#ffd60a',
        2.95
      );
    }

    // =========================================================================
    // E. XE CỨU HỎA, XE CẤP CỨU & XE TẢI: Mở kính Cabin đầu kéo & Đặt Tài xế + Phụ xe bên trong
    // =========================================================================
    else if (cat === 'FIRETRUCK' || cat === 'AMBULANCE' || cat === 'TRUCK') {
      // Tạo buồng kính Cabin trong suốt ở đầu xe và đặt 2 NPC (Tài xế + Đồng đội) ngồi bên trong
      const cabZ = cat === 'TRUCK' ? -2.35 : (cat === 'FIRETRUCK' ? -2.1 : -1.65);
      const cabY = cat === 'AMBULANCE' ? 1.02 : 1.18;
      const role = cat === 'FIRETRUCK' ? 'FIREFIGHTER' : (cat === 'AMBULANCE' ? 'MEDIC' : 'CITIZEN');
      const shirtHex = cat === 'FIRETRUCK' ? 0xd90429 : (cat === 'AMBULANCE' ? 0xffffff : 0x0077b6);

      // Làm trong suốt khối Cabin trên để thấy rõ người ngồi lái bên trong
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.position.z < -1.2 && ch.position.y > 0.85) {
          ch.material = matClearCabinGlass;
          ch.renderOrder = 2;
        }
      });

      const cabDriver = createVisibleCabinOccupantMesh(shirtHex, role, 0, true);
      cabDriver.position.set(-0.52, cabY, cabZ);
      const cabCoDriver = createVisibleCabinOccupantMesh(shirtHex, role, 1, false);
      cabCoDriver.position.set(0.52, cabY, cabZ);

      veh.add(cabDriver, cabCoDriver);
      vd.cabinDriverMesh = cabDriver;
      vd.cabinPartnerMesh = cabCoDriver;

      const labelMap = {
        FIRETRUCK: '🚒 Cứu Hỏa [Đội: 2 Chiến Sĩ trong Cabin]',
        AMBULANCE: '🚑 Cấp Cứu [1 Tài Xế + 1 Bác Sĩ Y Khoa]',
        TRUCK: '🚚 Xe Tải [1 Tài Xế + 1 Phụ Xe Logistics]'
      };
      attachOccupancyCounterBadge(veh, labelMap[cat], '#00f5d4', 2.95);
    }
  });
}

export function rebuildAllNpcVehiclesWithRollsRoyceStyleOpenInteriors(ctx) {
  const {
    THREE, allTrafficVehicles, createFullSeatedNpcWithInteriorSeat, matChrome, matCrystalGlassV160,
    matNpcDashWalnut, matNpcSeatBusBlue, matNpcSeatCream,
  } = ctx;
  const shirtPalette = [0xff758f, 0x00bbf9, 0xffd166, 0x06d6a0, 0xc77dff, 0xf4a261, 0x4cc9f0, 0xffafcc];

  allTrafficVehicles.forEach((veh, vIdx) => {
    const vd = veh.userData;
    const cat = vd.category;

    // Xóa các nhóm cabin cũ của V155 (nếu có) để dựng mới hoàn chỉnh cả Nội Thất + Ghế + Táp-lô + NPC
    const oldGroups = [];
    veh.children.forEach((ch) => {
      if (ch.isGroup && ch !== vd.angryDriverNpc && ch !== vd.transitDoorPivot && !vd.wheels?.includes(ch)) {
        if (!ch.userData?.isWheelGroup) oldGroups.push(ch);
      }
    });
    oldGroups.forEach((g) => veh.remove(g));

    // =========================================================================
    // 1. ĐỐI VỚI Ô TÔ NPC, XE TAXI & XE CẢNH SÁT (Dựng khoang mở giống hệt Rolls-Royce của người chơi!)
    // =========================================================================
    if (cat === 'CAR' || cat === 'POLICE') {
      let bodyColorMat = new THREE.MeshPhysicalMaterial({ color: 0x0077b6, roughness: 0.2, metalness: 0.3, clearcoat: 0.8 });

      // Tìm khối lowerHull đặc (dài 4.45m, cao 0.48m ở y = 0.52) đang lấp kín bụng xe và hạ thấp nó xuống làm Sàn Xe (y = 0.24m)!
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry) {
          const p = ch.geometry.parameters || {};
          if (ch.geometry.type === 'BoxGeometry' && p.depth >= 4.0 && p.height >= 0.4) {
            bodyColorMat = ch.material;
            // Hạ mỏng xuống làm Sàn Gầm Xe (Underbody) để mở toang khoang Cabin ở giữa!
            ch.scale.y = 0.32;
            ch.position.y = 0.24;
          }
          // Biến khối vòm kính Cabin trên thành kính pha lê siêu trong suốt (hoặc ẩn khối hộp đen suvRearCabin chắn tầm nhìn)
          else if (ch.geometry.type === 'CylinderGeometry' && ch.position.y > 0.8) {
            ch.material = matCrystalGlassV160;
            ch.renderOrder = 3;
          } else if (ch.geometry.type === 'BoxGeometry' && ch.position.y > 0.85 && p.depth > 1.2 && p.height > 0.35) {
            ch.material = matCrystalGlassV160;
            ch.renderOrder = 3;
          } else if (ch.geometry.type === 'BoxGeometry' && Math.abs(ch.position.y - 0.51) < 0.08 && p.depth < 2.2) {
            // Hạ thấp cánh cửa hông (pDoors) xuống ngang đùi để nhìn từ ngang hông thấy trọn vẹn ghế da & người ngồi trong xe!
            ch.scale.y = 0.55;
            ch.position.y = 0.38;
          }
        }
      });

      const interiorCabin = new THREE.Group();
      interiorCabin.userData.isV160Interior = true;

      // Dựng Nắp Capo trước (z = -1.55) & Cốp sau (z = +1.65) tách rời như xe Rolls-Royce của bạn
      const frontHood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.36, 1.35), bodyColorMat);
      frontHood.position.set(0, 0.50, -1.52);
      const rearTrunk = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.38, 1.15), bodyColorMat);
      rearTrunk.position.set(0, 0.51, 1.65);

      // 2 Thành cửa hông thấp (y = 0.44m) để lộ toàn bộ không gian ghế ngồi bên trong
      [-0.92, 0.92].forEach((sx) => {
        const lowDoorWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 1.95), bodyColorMat);
        lowDoorWall.position.set(sx, 0.42, 0.08);
        // Cột A mạ Chrome giống xe của bạn
        const pillarA = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.68, 10), matChrome);
        pillarA.position.set(sx * 0.96, 0.92, -0.72);
        pillarA.rotation.x = THREE.MathUtils.degToRad(24);
        interiorCabin.add(lowDoorWall, pillarA);
      });

      // Táp-lô bọc da + Ốp gỗ Óc Chó + Màn hình giải trí phát sáng + Bệ tỳ tay giữa xe (Giống hệt xe của bạn!)
      const dashTopRoll = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 1.68, 10, 14), matNpcSeatCream);
      dashTopRoll.rotation.z = Math.PI / 2;
      dashTopRoll.position.set(0, 0.68, -0.68);

      const dashWalnutBoard = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.18, 0.14), matNpcDashWalnut);
      dashWalnutBoard.position.set(0, 0.58, -0.62);

      const centerDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide })
      );
      centerDisplay.position.set(0, 0.68, -0.54);

      const centerConsole = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 1.35, 10, 12), matNpcSeatCream);
      centerConsole.rotation.x = Math.PI / 2;
      centerConsole.position.set(0, 0.34, 0.15);

      // Đèn trần chiếu sáng nội thất giúp nhìn rõ cả ban ngày lẫn ban đêm
      const cabinLight = new THREE.PointLight(0xfff5d6, 3.5, 4.5, 1.2);
      cabinLight.position.set(0, 1.15, 0.1);

      interiorCabin.add(frontHood, rearTrunk, dashTopRoll, dashWalnutBoard, centerDisplay, centerConsole, cabinLight);

      // Dựng 4 Vị Trí Ghế Da 3D + NPC Ngồi Bên Trong:
      // [0]: Tài xế (-0.42, 0.30, -0.10) | [1]: Ghế phụ trước (0.42, 0.30, -0.10)
      // [2]: Ghế sau trái (-0.42, 0.32, 0.68) | [3]: Ghế sau phải (0.42, 0.32, 0.68)
      const seatCoords = [
        [-0.42, 0.30, -0.10],
        [0.42, 0.30, -0.10],
        [-0.42, 0.32, 0.68],
        [0.42, 0.32, 0.68]
      ];

      const role = cat === 'POLICE' ? 'POLICE' : (vd.isTaxi ? 'TAXI_DRIVER' : 'CITIZEN');
      const driverShirt = cat === 'POLICE' ? 0x0a2463 : (vd.isTaxi ? 0xf8f9fa : shirtPalette[vIdx % shirtPalette.length]);

      // Ghế 0: Tài xế luôn có dáng ngồi lái xe (Tay cầm vô lăng, chân đạp ga)
      const driverUnit = createFullSeatedNpcWithInteriorSeat({
        shirtHex: driverShirt,
        roleType: role,
        exprIdx: vIdx,
        isDriver: true,
        seatMat: matNpcSeatCream
      });
      driverUnit.position.set(...seatCoords[0]);
      interiorCabin.add(driverUnit);
      vd.v160DriverUnit = driverUnit;

      // 3 Ghế Hành Khách (Ghế 1, 2, 3): Luôn hiển thị Ghế Da 3D, còn phần người ngồi (`humanBody`) bật/tắt theo đúng số người thực tế!
      const passengerUnits = [];
      for (let s = 1; s <= 3; s++) {
        const pRole = (cat === 'POLICE' && s === 1) ? 'POLICE' : 'CITIZEN';
        const pShirt = (cat === 'POLICE' && s === 1)
          ? 0x0a2463
          : ((cat === 'POLICE' && s >= 2) ? 0x222222 : shirtPalette[(vIdx + s) % shirtPalette.length]);

        const paxUnit = createFullSeatedNpcWithInteriorSeat({
          shirtHex: pShirt,
          roleType: pRole,
          exprIdx: vIdx + s,
          isDriver: false,
          seatMat: matNpcSeatCream
        });
        paxUnit.position.set(...seatCoords[s]);
        interiorCabin.add(paxUnit);
        passengerUnits.push(paxUnit);
      }
      vd.v160PassengerUnits = passengerUnits;

      // Thiết lập số người hợp lý cho từng loại xe:
      if (cat === 'POLICE') {
        // Xe Cảnh Sát: Ghế trước có 2 Sĩ quan (Tài xế + Cảnh sát phụ), 2 ghế sau trống (chỉ hiện khi bắt được tội phạm)
        passengerUnits[0].userData.humanBody.visible = true;  // Cảnh sát phụ
        passengerUnits[1].userData.humanBody.visible = false; // Ghế sau trái (Tội phạm)
        passengerUnits[2].userData.humanBody.visible = false; // Ghế sau phải trống
      } else if (vd.isTaxi) {
        // Xe Taxi: Khởi tạo chiếc trống (0 khách), chiếc có 1 hoặc 2 khách
        vd.currentPassengers = vIdx % 3;
        vd.maxPassengers = 3;
        vd.v160TransitPhase = vd.currentPassengers > 0 ? 'DROPOFF_NEXT' : 'PICKUP_NEXT';
        passengerUnits.forEach((u, idx) => {
          u.userData.humanBody.visible = (idx < vd.currentPassengers);
        });
      } else {
        // Ô tô cá nhân: Phân bổ rõ ràng xe 1 người (chỉ tài xế), xe 2 người (cặp đôi), xe 3-4 người (gia đình)
        const paxCount = vIdx % 4; // 0, 1, 2 hoặc 3 khách đi cùng tài xế
        vd.fixedPersonalPaxCount = paxCount;
        passengerUnits.forEach((u, idx) => {
          u.userData.humanBody.visible = (idx < paxCount);
        });
      }

      veh.add(interiorCabin);
    }

    // =========================================================================
    // 2. ĐỐI VỚI XE BUS THÀNH PHỐ: Mở kính sườn toàn phần từ mặt sàn, dựng Buồng Lái Bus
    //    (Tài xế ngồi ghế cao vặn vô lăng lớn, chân đạp bàn đạp) + 10 Ghế Hành Khách 3D
    // =========================================================================
    else if (cat === 'BUS') {
      // Thu gọn phần gầm dưới xuống y = 0.46m để lộ hoàn toàn sàn xe Bus (y = 0.55m), chân ghế, chân người ngồi và buồng lái!
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry?.type === 'BoxGeometry') {
          const h = ch.geometry.parameters.height;
          if (h > 1.0 && ch.material !== matCrystalGlassV160) {
            if (ch.position.y < 1.3) {
              ch.scale.y = 0.28;
              ch.position.y = 0.48;
            } else {
              // Toàn bộ phần thân trên của Bus chuyển sang Kính Pha Lê Trong Suốt!
              ch.material = matCrystalGlassV160;
              ch.renderOrder = 3;
            }
          }
        }
      });

      const busInterior = new THREE.Group();
      busInterior.userData.isV160Interior = true;

      // Sàn nội thất xe Bus màu xám sáng để làm nổi bật các ghế ngồi và bước chân NPC
      const busFloorDeck = new THREE.Mesh(
        new THREE.BoxGeometry(2.26, 0.08, 7.55),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 })
      );
      busFloorDeck.position.set(0, 0.66, 0);

      // Táp-lô Buồng Lái Xe Bus ở đầu xe (z = -3.45m) + Hộp soát vé tự động
      const busDash = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.42, 0.38), matNpcDashWalnut);
      busDash.position.set(0, 0.88, -3.52);
      const fareBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.55, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xffd60a })
      );
      fareBox.position.set(0.25, 0.95, -3.15);

      // 2 Đèn trần chiếu sáng rực rỡ dọc khoang Xe Bus
      [-1.8, 1.8].forEach((lz) => {
        const bLight = new THREE.PointLight(0xfff8e7, 4.5, 8.0, 1.2);
        bLight.position.set(0, 2.15, lz);
        busInterior.add(bLight);
      });

      // TÀI XẾ XE BUS: Ngồi trên bệ ghế cao ở đầu xe (-0.68, 0.78, -3.05), 2 tay vươn nắm Vô lăng Bus nghiêng, 2 chân đạp bàn đạp!
      const busDriverPedestal = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.16, 0.56),
        new THREE.MeshStandardMaterial({ color: 0x1e293b })
      );
      busDriverPedestal.position.set(-0.68, 0.74, -3.05);

      const busDriverUnit = createFullSeatedNpcWithInteriorSeat({
        shirtHex: 0x00bbf9,
        pantsHex: 0x0f172a,
        roleType: 'BUS_DRIVER',
        exprIdx: 0,
        isDriver: true,
        seatMat: matNpcSeatCream,
        scale: 1.06
      });
      busDriverUnit.position.set(-0.68, 0.82, -3.02);
      busInterior.add(busFloorDeck, busDash, fareBox, busDriverPedestal, busDriverUnit);
      vd.v160DriverUnit = busDriverUnit;

      // Dựng 10 Ghế Hành Khách 3D (5 hàng x 2 dãy Trái/Phải) dọc theo khoang xe Bus:
      // Khi khách xuống xe, phần người (`humanBody`) ẩn đi để lộ rõ chiếc ghế xanh-vàng trống trơn!
      const busSeatUnits = [];
      const rowZList = [-1.85, -0.80, 0.25, 1.30, 2.35];
      rowZList.forEach((rz, rIdx) => {
        [-0.74, 0.74].forEach((rx, sIdx) => {
          const seatIdx = rIdx * 2 + sIdx;
          const paxUnit = createFullSeatedNpcWithInteriorSeat({
            shirtHex: shirtPalette[seatIdx % shirtPalette.length],
            roleType: 'CITIZEN',
            exprIdx: seatIdx + 1,
            isDriver: false,
            seatMat: matNpcSeatBusBlue,
            scale: 1.0
          });
          paxUnit.position.set(rx, 0.70, rz);
          busInterior.add(paxUnit);
          busSeatUnits.push(paxUnit);
        });
      });

      vd.v160PassengerUnits = busSeatUnits;
      vd.maxPassengers = 10;
      // Chiếc Bus #1 bắt đầu với 6 khách (sẽ trả bớt xuống còn 2 khách ở trạm đầu), Chiếc Bus #2 bắt đầu thưa khách (chỉ 2 khách!)
      vd.currentPassengers = vIdx === 0 ? 6 : 2;
      vd.v160TransitPhase = vIdx === 0 ? 'DROPOFF_TO_SPARSE' : 'SPARSE_CRUISE';
      vd.v160StopCooldown = 0;

      veh.add(busInterior);
    }

    // =========================================================================
    // 3. ĐỐI VỚI XE CẤP CỨU, XE CỨU HỎA & XE TẢI: Mở kính Cabin đầu xe & Dựng Táp-lô + Ghế + Tài xế cầm Vô lăng
    // =========================================================================
    else if (cat === 'AMBULANCE' || cat === 'FIRETRUCK' || cat === 'TRUCK') {
      const cabZ = cat === 'TRUCK' ? -2.25 : (cat === 'FIRETRUCK' ? -2.05 : -1.65);
      const cabFloorY = cat === 'AMBULANCE' ? 0.68 : 0.82;
      const role = cat === 'FIRETRUCK' ? 'FIREFIGHTER' : (cat === 'AMBULANCE' ? 'MEDIC' : 'BUS_DRIVER');
      const shirtHex = cat === 'FIRETRUCK' ? 0xd90429 : (cat === 'AMBULANCE' ? 0x06d6a0 : 0xffbe0b);

      // Biến các mảng tường chắn ngang đầu Cabin thành kính trong suốt để nhìn xuyên thấy Tài xế & Vô lăng
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.position.z < -1.1 && ch.position.y > 0.75 && ch.material !== matChrome) {
          ch.material = matCrystalGlassV160;
          ch.renderOrder = 3;
        }
      });

      const heavyCabInterior = new THREE.Group();
      heavyCabInterior.userData.isV160Interior = true;

      const cabDash = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.28), matNpcDashWalnut);
      cabDash.position.set(0, cabFloorY + 0.28, cabZ - 0.42);
      const cabLight = new THREE.PointLight(0xfff5d6, 3.5, 4.0, 1.2);
      cabLight.position.set(0, cabFloorY + 0.85, cabZ);

      const hDriver = createFullSeatedNpcWithInteriorSeat({
        shirtHex,
        roleType: role,
        exprIdx: 0,
        isDriver: true,
        seatMat: matNpcSeatCream
      });
      hDriver.position.set(-0.48, cabFloorY, cabZ);

      const hPartner = createFullSeatedNpcWithInteriorSeat({
        shirtHex,
        roleType: role,
        exprIdx: 1,
        isDriver: false,
        seatMat: matNpcSeatCream
      });
      hPartner.position.set(0.48, cabFloorY, cabZ);

      heavyCabInterior.add(cabDash, cabLight, hDriver, hPartner);
      veh.add(heavyCabInterior);
      vd.v160DriverUnit = hDriver;
      vd.v160PassengerUnits = [hPartner];
    }
  });
}

export function setupWorldServices(ctx) {
  const {
    BLOCK_SIZE, DEFAULT_RR_THEME, HOME_CAR_SPAWN_POS, HOME_SPAWN_POS, SEAT_POSITIONS, THREE,
    allTrafficVehicles, autoCenterBalancePassengerView, camera, cameraRig, chassisGroup, cityGroup,
    clock, createHornAlertSprite, createSpeechBubbleSprite, driverSeatMount, emergencyLightMeshes,
    headlightBeamMat, initAudio, matBodyPaint, matNappa, matPiano, matTireRubber, matWalnut,
    passengerAvatars, playerAvatarGroup, policeCarsList, register3DTarget, remoteCarMeshes,
    roofBeaconGroup, scene, setCarBodyVisibilityForTwoWheelMode, sidewalkNpcs, state,
    steeringWheelPivot, streetBeamMat, streetLightCones, streetPointLights,
    swapSeatOrTakeDriverControl, vehicleRoot,
  } = ctx;
  // --- 20.1. XÓA NGAY CHIẾC XE KHÁCH #2 (`car_guest_1`) ĐẬU GIỮA ĐƯỜNG KHI CHƯA CÓ NGƯỜI THỨ 2 ---
  function removeUnoccupiedGuestCarsInRoad() {
    if (typeof remoteCarMeshes !== 'undefined') {
      for (const [carId, mesh] of remoteCarMeshes.entries()) {
        if (carId === 'car_guest_1' || (mesh.position.x === -2.8 && mesh.position.z === 6.5)) {
          scene.remove(mesh);
          remoteCarMeshes.delete(carId);
        }
      }
    }
    // Ẩn mọi khối xe đen vô chủ nằm tại (-2.8, 0, 6.5)
    scene.children.forEach((obj) => {
      if (obj.isGroup && Math.abs(obj.position.x - (-2.8)) < 0.5 && Math.abs(obj.position.z - 6.5) < 0.5 && obj !== vehicleRoot) {
        obj.visible = false;
      }
    });
  }
  removeUnoccupiedGuestCarsInRoad();
  setInterval(removeUnoccupiedGuestCarsInRoad, 1500);

  // --- 20.2. KHẮC PHỤC CỘT ĐÈN CHÓA MẮT NGAY KHI SPAWN TẠI NHÀ ---
  (function fixBlindingStreetLightsNearHomeSpawn() {
    // Giảm độ gắt của toàn bộ chùm sáng cột đèn đường để ban đêm dịu mắt, trong trẻo
    if (typeof streetBeamMat !== 'undefined') {
      streetBeamMat.opacity = 0.032;
    }
    if (typeof headlightBeamMat !== 'undefined') {
      headlightBeamMat.opacity = 0.085;
    }

    // Tắt bớt các chùm sáng hình nón chồng chéo ngay trước cửa nhà người chơi (bán kính 28m quanh HOME_SPAWN_POS)
    const homeRef = typeof HOME_SPAWN_POS !== 'undefined' ? HOME_SPAWN_POS : new THREE.Vector3(-13.05, 0.24, -14.0);
    const worldPt = new THREE.Vector3();
    if (typeof streetLightCones !== 'undefined') {
      streetLightCones.forEach((cone, idx) => {
        cone.getWorldPosition(worldPt);
        if (worldPt.distanceTo(homeRef) < 28 || idx % 2 === 1) {
          cone.visible = false;
        }
      });
    }
    if (typeof streetPointLights !== 'undefined') {
      streetPointLights.forEach((pl) => {
        pl.intensity = 4.5;
        pl.distance = 16;
      });
    }
  })();

  // --- 20.3. XÂY DỰNG GARA SIÊU XE (CẠNH NHÀ), THƯ VIỆN THÀNH PHỐ & TRƯỜNG HỌC (CÓ SÂN CHƠI CHO TRẺ EM) ---
  const schoolPlaygroundCenters = [];

  function buildGarageLibraryAndSchoolInEmptySpaces() {
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x7ae2ff, transparent: true, opacity: 0.42, roughness: 0.08 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.55 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.25 });
    const warmLightMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

    // 1. GARA SIÊU XE ROLLS-ROYCE RIÊNG NGAY KHOẢNG TRỐNG BÊN CẠNH NHÀ BẠN (Tọa độ: x = -22.5, z = -26.5)
    const homeGarage = new THREE.Group();
    homeGarage.position.set(-22.5, 0.24, -26.5);

    const gFloor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.2, 9.5), darkSteelMat);
    const gBackWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 9.5), concreteMat);
    gBackWall.position.set(-5.5, 2.2, 0);
    const gSideWall1 = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.4, 0.4), concreteMat);
    gSideWall1.position.set(0, 2.2, -4.55);
    const gSideWall2 = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.4, 0.4), glassMat);
    gSideWall2.position.set(0, 2.2, 4.55);
    const gRoof = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.45, 10.2), darkSteelMat);
    gRoof.position.set(0, 4.5, 0);

    // Đèn LED trần Gara & Cầu nâng bảo dưỡng xe + Tủ đồ nghề Đỏ
    const gLedStrip1 = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.08, 0.6), warmLightMat);
    gLedStrip1.position.set(0, 4.22, -2.0);
    const gLedStrip2 = gLedStrip1.clone();
    gLedStrip2.position.z = 2.0;

    const toolCabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.8, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.5, roughness: 0.3 })
    );
    toolCabinet.position.set(-4.6, 1.0, 0);

    // Một chiếc Supercar trưng bày trong Gara cạnh nhà bạn
    const showCar = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 1.15, 2.0),
      new THREE.MeshPhysicalMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.15, clearcoat: 1.0 })
    );
    showCar.position.set(-0.5, 0.72, -1.8);

    const garageSign = createSpeechBubbleSprite('🏎️ GARA SIÊU XE GIA ĐÌNH (CẠNH NHÀ BẠN)', '#0f172a', '#ffd60a');
    garageSign.scale.set(2.2, 0.42, 1);
    garageSign.position.set(4.5, 5.3, 0);
    garageSign.visible = true;

    homeGarage.add(gFloor, gBackWall, gSideWall1, gSideWall2, gRoof, gLedStrip1, gLedStrip2, toolCabinet, showCar, garageSign);
    scene.add(homeGarage);

    // 2. THƯ VIỆN THÀNH PHỐ (CITY LIBRARY) Ở LÔ ĐẤT ĐỐI DIỆN NHÀ BẠN (x = 22.0, z = -22.0)
    const libraryGroup = new THREE.Group();
    libraryGroup.position.set(22.0, 0.24, -22.0);

    const libBase = new THREE.Mesh(new THREE.BoxGeometry(15.0, 0.6, 15.0), concreteMat);
    libBase.position.y = 0.3;
    const libHall = new THREE.Mesh(
      new THREE.BoxGeometry(13.2, 6.8, 13.2),
      new THREE.MeshStandardMaterial({ color: 0xfefae0, roughness: 0.45 })
    );
    libHall.position.y = 3.7;
    const libGlassFront = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 10.5), glassMat);
    libGlassFront.position.set(-6.62, 3.5, 0);

    // Hàng cột La Mã cổ điển trước sảnh Thư Viện
    [-4.2, -1.4, 1.4, 4.2].forEach((cz) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6.4, 14), concreteMat);
      col.position.set(-7.3, 3.5, cz);
      libraryGroup.add(col);
    });

    const libDome = new THREE.Mesh(
      new THREE.SphereGeometry(4.8, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0077b6, metalness: 0.4, roughness: 0.3 })
    );
    libDome.position.set(0, 7.1, 0);

    const libSign = createSpeechBubbleSprite('📚 THƯ VIỆN LỚN THÀNH PHỐ (CITY LIBRARY)', '#003566', '#00e5ff');
    libSign.scale.set(2.3, 0.44, 1);
    libSign.position.set(-6.5, 8.2, 0);
    libSign.visible = true;

    libraryGroup.add(libBase, libHall, libGlassFront, libDome, libSign);
    scene.add(libraryGroup);

    // 3. TRƯỜNG HỌC QUỐC TẾ & SÂN CHƠI TRẺ EM AN TOÀN (Tọa độ: x = -22.0, z = 22.0 và các ô phố)
    const schoolGroup = new THREE.Group();
    schoolGroup.position.set(-22.0, 0.24, 22.0);

    const schoolYard = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.16, 16.5),
      new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 })
    );
    schoolYard.position.y = 0.08;

    // Tòa nhà Trường học chữ L màu Vàng Kem - Mái Đỏ Tươi
    const schoolMain = new THREE.Mesh(
      new THREE.BoxGeometry(14.0, 6.4, 6.2),
      new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 })
    );
    schoolMain.position.set(0, 3.3, 4.5);

    const schoolRoof = new THREE.Mesh(
      new THREE.BoxGeometry(14.6, 0.6, 6.8),
      new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.4 })
    );
    schoolRoof.position.set(0, 6.7, 4.5);

    // Cột cờ sân trường & Cầu trượt trẻ em trong sân trường (x = -22, z = 18)
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7.5, 10), concreteMat);
    flagPole.position.set(-5.5, 3.8, -2.5);
    const flagBanner = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff0022 })
    );
    flagBanner.position.set(-4.8, 7.0, -2.5);

    const schoolSign = createSpeechBubbleSprite('🏫 TRƯỜNG HỌC QUỐC TẾ & SÂN CHƠI TRẺ EM', '#9e2a2b', '#ffd60a');
    schoolSign.scale.set(2.3, 0.44, 1);
    schoolSign.position.set(0, 8.2, 2.0);
    schoolSign.visible = true;

    schoolGroup.add(schoolYard, schoolMain, schoolRoof, flagPole, flagBanner, schoolSign);
    scene.add(schoolGroup);

    // Lưu tâm sân trường (-22, 0.3, 18.5) để đưa toàn bộ trẻ em chơi bóng vào đúng trong sân trường!
    schoolPlaygroundCenters.push(new THREE.Vector3(-22.0, 0.32, 18.2));
    schoolPlaygroundCenters.push(new THREE.Vector3(22.0, 0.32, 22.0));
  }
  buildGarageLibraryAndSchoolInEmptySpaces();

  // Di chuyển toàn bộ Trẻ Em đang chơi bóng giữa lòng đường (|x| < 10.5 hoặc |z| < 10.5) vào Sân Trường & Công Viên
  function relocateChildrenFromRoadToSchoolyard() {
    let childIdx = 0;
    scene.children.forEach((obj) => {
      if (!obj.isGroup || obj === vehicleRoot || obj === playerAvatarGroup || obj === cityGroup) return;

      // Nhận diện nhóm Trẻ em chơi bóng (có quả bóng SphereGeometry màu sắc gần mặt đất hoặc scale nhỏ)
      let hasToyBall = false;
      obj.traverse((c) => {
        if (c.isMesh && c.geometry?.type === 'SphereGeometry' && c.position.y < 0.65 && c !== obj.children[0]) {
          hasToyBall = true;
        }
      });

      const isOnAsphaltRoad = Math.abs(obj.position.x) < 10.8 || Math.abs(obj.position.z) < 10.8;
      if (hasToyBall && isOnAsphaltRoad && !allTrafficVehicles.includes(obj)) {
        const yardCenter = schoolPlaygroundCenters[childIdx % schoolPlaygroundCenters.length];
        const angle = (childIdx * 1.7) % (Math.PI * 2);
        const radius = 2.2 + (childIdx % 3) * 1.4;
        obj.position.x = yardCenter.x + Math.cos(angle) * radius;
        obj.position.z = yardCenter.z + Math.sin(angle) * radius;
        obj.position.y = 0.30;
        if (obj.userData) {
          obj.userData.safeZoneCenter = yardCenter.clone();
        }
        childIdx++;
      }
    });
  }
  relocateChildrenFromRoadToSchoolyard();

  // --- 20.4. CHỈNH SỬA CHI TIẾT MÔ HÌNH 3D XE CẤP CỨU (AMBULANCE) CHÂN THẬT (KHÔNG CÒN LÀ KHỐI TRẮNG THÔ) ---
  const detailedAmbulancesList = [];

  function upgradeAndBuildDetailed3DAmbulances() {
    const pureWhiteMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1.0 });
    const medRedMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
    const medBlueMat = new THREE.MeshBasicMaterial({ color: 0x0077ff });
    const darkTintGlass = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.25, clearcoat: 1.0 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });

    function sculptDetailedAmbulance(ambGroup) {
      // Xóa các khối hộp trắng đơn điệu cũ trong group xe cấp cứu
      const oldBoxes = ambGroup.children.filter((c) => c.isMesh && c.geometry?.type === 'BoxGeometry');
      oldBoxes.forEach((m) => ambGroup.remove(m));

      // 1. Khoang bệnh nhân phía sau (Medical Box Module) có viền bo & dải phản quang Đỏ - Xanh Y Tế
      const medBox = new THREE.Mesh(new THREE.BoxGeometry(2.18, 1.95, 3.85), pureWhiteMat);
      medBox.position.set(0, 1.38, 0.65);

      const redBeltStripe = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.22, 3.88), medRedMat);
      redBeltStripe.position.set(0, 1.05, 0.65);

      const blueUpperStripe = new THREE.Mesh(new THREE.BoxGeometry(2.21, 0.10, 3.87), medBlueMat);
      blueUpperStripe.position.set(0, 2.15, 0.65);

      // 2. Đầu Cabin lái khí động học (Aerodynamic Sprinter Cab) + Kính chắn gió nghiêng + Lưới tản nhiệt
      const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.95, 1.75), pureWhiteMat);
      cabLower.position.set(0, 0.88, -2.05);

      const cabUpper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.82, 1.15), darkTintGlass);
      cabUpper.position.set(0, 1.65, -1.75);

      const hoodSlope = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.18, 0.85), medRedMat);
      hoodSlope.position.set(0, 1.36, -2.42);
      hoodSlope.rotation.x = 0.22;

      const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.08), chromeMat);
      frontGrille.position.set(0, 0.78, -2.94);

      const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.26, 0.24), matPiano);
      frontBumper.position.set(0, 0.46, -2.92);

      // Đèn pha LED đôi + Đèn sương mù trước mũi xe Cấp Cứu
      [-0.76, 0.76].forEach((lx) => {
        const hLamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xe0fbfc }));
        hLamp.position.set(lx, 0.85, -2.94);
        const sideMirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.10), matPiano);
        sideMirror.position.set(lx * 1.42, 1.55, -2.15);
        ambGroup.add(hLamp, sideMirror);
      });

      // 3. Biểu tượng Chữ Thập Đỏ (Red Cross 3D) nổi ở cả 2 bên hông xe, trên nóc và cửa sau
      [-1.11, 1.11].forEach((sideX) => {
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.68, 0.22), medRedMat);
        crossV.position.set(sideX, 1.62, 0.85);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.68), medRedMat);
        crossH.position.set(sideX, 1.62, 0.85);

        // Ô cửa kính mờ khoang cấp cứu bên hông
        const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.58, 1.15), darkTintGlass);
        sideWin.position.set(sideX, 1.65, -0.35);
        ambGroup.add(crossV, crossH, sideWin);
      });

      // Cửa đôi phía sau (Rear Double Doors) có 2 ô kính & bậc lên xuống băng ca
      [-0.48, 0.48].forEach((rx) => {
        const rearWin = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.62, 0.05), darkTintGlass);
        rearWin.position.set(rx, 1.68, 2.58);
        ambGroup.add(rearWin);
      });
      const rearStep = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.32), chromeMat);
      rearStep.position.set(0, 0.42, 2.68);

      // 4. Dàn đèn ưu tiên Cấp Cứu trên nóc (Emergency Lightbar Đỏ - Trắng - Xanh)
      const lightbarBase = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.38), chromeMat);
      lightbarBase.position.set(0, 2.42, -1.05);
      const sirenL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.32), medRedMat);
      sirenL.position.set(-0.52, 2.48, -1.05);
      const sirenR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.32), medBlueMat);
      sirenR.position.set(0.52, 2.48, -1.05);
      emergencyLightMeshes.push({ r: sirenL, b: sirenR });

      // 5. Băng ca Cấp Cứu 3D (Medical Stretcher) có đệm cam & chân bánh xe xếp gọn phía sau xe
      const stretcherGroup = new THREE.Group();
      const matBed = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.14, 1.85),
        new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.4 })
      );
      matBed.position.y = 0.68;
      const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.65, 8), chromeMat);
      leg1.position.set(-0.26, 0.32, -0.65);
      const leg2 = leg1.clone(); leg2.position.set(0.26, 0.32, -0.65);
      const leg3 = leg1.clone(); leg3.position.set(-0.26, 0.32, 0.65);
      const leg4 = leg1.clone(); leg4.position.set(0.26, 0.32, 0.65);

      // Bệnh nhân NPC nằm trên băng ca khi đang cấp cứu
      const patientBody = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.85, 8, 10),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
      );
      patientBody.rotation.x = Math.PI / 2;
      patientBody.position.set(0, 0.86, 0);
      const patientHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xf1c27d })
      );
      patientHead.position.set(0, 0.88, -0.62);

      stretcherGroup.add(matBed, leg1, leg2, leg3, leg4, patientBody, patientHead);
      stretcherGroup.position.set(0, 0, 3.85);
      stretcherGroup.visible = false;
      ambGroup.add(stretcherGroup);

      // Bánh xe Cấp Cứu nếu chưa có
      if (!ambGroup.userData.wheels || ambGroup.userData.wheels.length === 0) {
        const wList = [];
        [[-0.98, -1.95], [0.98, -1.95], [-0.98, 1.45], [0.98, 1.45]].forEach(([wx, wz]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.28, 18), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.40, wz);
          ambGroup.add(w);
          wList.push(w);
        });
        ambGroup.userData.wheels = wList;
      }

      if (!ambGroup.userData.hornBadge) {
        const ambBadge = createHornAlertSprite('🚑 CẤP CỨU 115 KHẨN CẤP!', '#00e5ff');
        ambBadge.position.set(0, 2.95, 0);
        ambGroup.add(ambBadge);
        ambGroup.userData.hornBadge = ambBadge;
      }

      ambGroup.add(
        medBox, redBeltStripe, blueUpperStripe,
        cabLower, cabUpper, hoodSlope, frontGrille, frontBumper,
        rearStep, lightbarBase, sirenL, sirenR
      );

      ambGroup.userData.category = 'AMBULANCE';
      ambGroup.userData.modelName = 'Xe Cứu Thương 115 Sprinter';
      ambGroup.userData.stretcherGroup = stretcherGroup;
      ambGroup.userData.interiorTheme = {
        name: 'Khoang Y Tế Cấp Cứu 115 (Rộng & Vô Trùng)',
        nappaHex: 0xf1f5f9,
        woodHex: 0x0077b6,
        bodyHex: 0xffffff
      };

      ambGroup.traverse((c) => {
        if (c.isMesh && !c.userData.isVolumetricBeam) {
          register3DTarget(c, () => window.boardAnyNpcVehicleV160(ambGroup));
        }
      });

      detailedAmbulancesList.push(ambGroup);
    }

    // Tìm các xe cấp cứu hiện có trong scene hoặc tạo mới 2 chiếc Xe Cấp Cứu 3D chi tiết
    allTrafficVehicles.forEach((v) => {
      if (v.userData?.category === 'AMBULANCE' || /cấp cứu| cứu thương|ambulance/i.test(v.userData?.modelName || '')) {
        sculptDetailedAmbulance(v);
      }
    });

    if (detailedAmbulancesList.length === 0) {
      for (let i = 0; i < 2; i++) {
        const amb = new THREE.Group();
        const dir = i === 0 ? 1 : -1;
        amb.position.set(dir === 1 ? -3.2 : 3.2, 0, i === 0 ? -28 : 34);
        amb.rotation.y = dir === 1 ? Math.PI : 0;
        amb.userData = {
          category: 'AMBULANCE',
          modelName: 'Xe Cứu Thương 115 Sprinter',
          headingRad: dir === 1 ? Math.PI : 0,
          targetHeadingRad: dir === 1 ? Math.PI : 0,
          laneWidth: 3.2,
          cruiseSpeed: 12.5,
          activeSpeed: 12.5,
          crashState: 'NORMAL',
          turnCooldown: 4.0
        };
        sculptDetailedAmbulance(amb);
        scene.add(amb);
        allTrafficVehicles.push(amb);
      }
    }
  }
  upgradeAndBuildDetailed3DAmbulances();

  // --- 20.5. NỘI THẤT KHÁC BIỆT HOÀN TOÀN (ĐỘ RỘNG KHOANG, KIỂU DÁNG, TRANG BỊ & MÀU SẮC) CHO TỪNG DÒNG XE
  //           VÀ MÔ HÌNH TÀI XẾ NPC 3D NGỒI CẦM LÁI KHI BẠN ĐI NHỜ XE ---
  const customInteriorPropsGroup = new THREE.Group();
  chassisGroup.add(customInteriorPropsGroup);

  // Mô hình Tài Xế NPC 3D ngồi trong khoang xe (Ở Ghế Lái khi chở bạn, hoặc tự chuyển sang Ghế Phụ khi bạn cầm lái!)
  const activeNpcChauffeurMesh = new THREE.Group();
  let chauffeurLeftArm = null;
  let chauffeurRightArm = null;
  let chauffeurSuitMat = null;
  let chauffeurHatMesh = null;

  (function buildActiveNpcChauffeurInCockpit() {
    chauffeurSuitMat = new THREE.MeshStandardMaterial({ color: 0x0a2463, roughness: 0.45 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.45 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.38, 8, 12), chauffeurSuitMat);
    torso.position.set(0, 0.56, 0.05);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), skinMat);
    head.position.set(0, 0.96, 0.02);

    chauffeurHatMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.08, 12), chauffeurSuitMat);
    chauffeurHatMesh.position.set(0, 1.07, 0.02);

    chauffeurLeftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 8, 8), skinMat);
    chauffeurLeftArm.position.set(-0.18, 0.65, -0.14);
    chauffeurLeftArm.rotation.x = Math.PI / 2.5;

    chauffeurRightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 8, 8), skinMat);
    chauffeurRightArm.position.set(0.18, 0.65, -0.14);
    chauffeurRightArm.rotation.x = Math.PI / 2.5;

    const tagBubble = createSpeechBubbleSprite('👨✈️ Tài xế NPC đang chở bạn (Bấm [Đổi Lái] để cầm lái)', '#0f172a', '#00ff88');
    tagBubble.scale.set(0.75, 0.16, 1);
    tagBubble.position.set(0, 1.24, 0);
    tagBubble.visible = true;

    activeNpcChauffeurMesh.add(torso, head, chauffeurHatMesh, chauffeurLeftArm, chauffeurRightArm, tagBubble);
    activeNpcChauffeurMesh.visible = false;
    chassisGroup.add(activeNpcChauffeurMesh);
  })();

  function rebuildDistinctInteriorByVehicleCategory(category, customTheme) {
    // Xóa đạo cụ nội thất cũ
    while (customInteriorPropsGroup.children.length > 0) {
      customInteriorPropsGroup.remove(customInteriorPropsGroup.children[0]);
    }

    // Ẩn bớt 3 hành khách ảo cố định của Rolls-Royce khi sang xe NPC để không bị trùng lặp
    if (typeof passengerAvatars !== 'undefined') {
      passengerAvatars.forEach((p) => { p.visible = (category === 'ROLLS_ROYCE'); });
    }

    if (category === 'ROLLS_ROYCE') {
      // Trả về đúng kích thước & màu sắc nguyên bản của Rolls-Royce Ghost
      chassisGroup.scale.set(1.0, 1.0, 1.0);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.0, 0.12);
      SEAT_POSITIONS[1].pos.set(0.42, 0.0, 0.12);
      SEAT_POSITIONS[2].pos.set(-0.42, 0.04, 1.02);
      SEAT_POSITIONS[3].pos.set(0.42, 0.04, 1.02);
      matNappa.color.setHex(DEFAULT_RR_THEME.nappaHex);
      matWalnut.color.setHex(DEFAULT_RR_THEME.woodHex);
      return;
    }

    if (category === 'BUS') {
      // KHOANG XE BUS: Rộng gấp 1.38 lần, trần cao gấp 1.25 lần, tay vịn cột vàng, máy quẹt thẻ vé & dãy ghế hành khách xanh
      chassisGroup.scale.set(1.38, 1.22, 1.25);
      SEAT_POSITIONS[0].pos.set(-0.52, 0.18, -0.05);
      SEAT_POSITIONS[1].pos.set(0.52, 0.18, -0.05);
      SEAT_POSITIONS[2].pos.set(-0.52, 0.22, 1.15);
      SEAT_POSITIONS[3].pos.set(0.52, 0.22, 1.15);
      matNappa.color.setHex(0x0077b6); // Ghế nệm xanh dương Xe Bus
      matWalnut.color.setHex(0xffbe0b); // Táp-lô vàng đặc trưng Xe Bus
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x023e8a);

      const poleMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.7, roughness: 0.2 });
      [-0.28, 0.28].forEach((px) => {
        const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 10), poleMat);
        stanchion.position.set(px, 0.75, 0.35);
        customInteriorPropsGroup.add(stanchion);
      });
      const ticketBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.36, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x00f5d4 })
      );
      ticketBox.position.set(0.12, 0.65, -0.25);
      customInteriorPropsGroup.add(ticketBox);

    } else if (category === 'AMBULANCE') {
      // KHOANG XE CẤP CỨU 115: Khoang rộng 1.25x, màu Trắng Y Tế vô trùng, Tủ thuốc Chữ Thập Đỏ, Bình Oxy & Băng Ca Cam bên hông
      chassisGroup.scale.set(1.25, 1.18, 1.18);
      SEAT_POSITIONS[0].pos.set(-0.46, 0.10, 0.05);
      SEAT_POSITIONS[1].pos.set(0.46, 0.10, 0.05);
      SEAT_POSITIONS[2].pos.set(-0.46, 0.14, 1.05);
      SEAT_POSITIONS[3].pos.set(0.46, 0.14, 1.05);
      matNappa.color.setHex(0xf8fafc); // Trắng tinh y tế
      matWalnut.color.setHex(0xe63946); // Viền Đỏ Chữ Thập
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x00b4d8); // Áo blouse xanh bác sĩ cấp cứu

      const medBed = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.12, 1.15),
        new THREE.MeshStandardMaterial({ color: 0xff6b35 })
      );
      medBed.position.set(0.0, 0.52, 0.95);
      const ekgMonitor = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.18, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 })
      );
      ekgMonitor.position.set(0.22, 0.85, -0.32);
      customInteriorPropsGroup.add(medBed, ekgMonitor);

    } else if (category === 'FIRETRUCK') {
      // KHOANG XE CỨU HỎA: Rộng 1.32x, Thép đỏ công nghiệp, Bình chữa cháy mini, Đồng hồ áp suất nước & Bộ đàm chỉ huy
      chassisGroup.scale.set(1.32, 1.20, 1.20);
      SEAT_POSITIONS[0].pos.set(-0.50, 0.16, 0.05);
      SEAT_POSITIONS[1].pos.set(0.50, 0.16, 0.05);
      matNappa.color.setHex(0x2b2d42); // Ghế da chống cháy xám đen
      matWalnut.color.setHex(0xd90429); // Táp-lô thép sơn đỏ cứu hỏa
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0xd90429);

      const extinguisher = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.38, 12),
        new THREE.MeshStandardMaterial({ color: 0xff0022, metalness: 0.6 })
      );
      extinguisher.position.set(0.0, 0.52, 0.15);
      customInteriorPropsGroup.add(extinguisher);

    } else if (category === 'POLICE') {
      // KHOANG XE CẢNH SÁT TUẦN TRA: Tông Đen - Xanh Tác Chiến, Laptop Radar Cảnh Sát giữa táp-lô & Vách lưới thép
      chassisGroup.scale.set(1.06, 1.02, 1.02);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.02, 0.10);
      SEAT_POSITIONS[1].pos.set(0.42, 0.02, 0.10);
      matNappa.color.setHex(0x0f172a);
      matWalnut.color.setHex(0x1d4ed8);
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x0a2463);

      const policeLaptop = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.18, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff })
      );
      policeLaptop.position.set(0.12, 0.82, -0.28);
      policeLaptop.rotation.y = -0.35;
      customInteriorPropsGroup.add(policeLaptop);

    } else {
      // KHOANG Ô TÔ THỂ THAO / TAXI NPC: Hẹp gọn hơn Rolls-Royce (0.88x), phối màu rực rỡ theo đúng màu sơn chiếc xe NPC đó!
      chassisGroup.scale.set(0.88, 0.94, 0.92);
      SEAT_POSITIONS[0].pos.set(-0.36, -0.02, 0.10);
      SEAT_POSITIONS[1].pos.set(0.36, -0.02, 0.10);
      matNappa.color.setHex(customTheme?.nappaHex || 0xf4a261);
      matWalnut.color.setHex(customTheme?.bodyHex || 0xe63946);
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x2a9d8f);
    }
  }

  // --- 20.6. SỬA LỖI LÊN / XUỐNG XE NPC:
  //           - KHI LÊN XE NPC: NGỒI Ở GHẾ PHỤ (seatIndex = 1) VỚI GÓC NHÌN THỨ 1, TÀI XẾ NPC CHỞ BẠN ĐI!
  //           - KHI BẤM ĐỔI LÁI: BẠN SANG GHẾ LÁI (seatIndex = 0) CHỞ NPC, NPC SANG GHẾ PHỤ!
  //           - KHI XUỐNG XE: XE & NPC HIỆN LẠI NGAY TẠI CHỖ; NẾU BẠN ĐANG CẦM LÁI MÀ XUỐNG XE, ĐỢI 5 GIÂY NPC TỰ ĐỔI VỀ GHẾ LÁI CHẠY TIẾP! ---
  let abandonedNpcCarRecord = null; // Lưu xe NPC khi người chơi vừa xuống xe để đếm ngược 5 giây

  window.boardAnyNpcVehicleV160 = function(veh) {
    if (!veh || !veh.userData) return;
    initAudio();

    // Hủy bộ đếm 5 giây nếu người chơi lên lại xe
    if (abandonedNpcCarRecord && abandonedNpcCarRecord.veh === veh) {
      abandonedNpcCarRecord = null;
    }

    // Nếu trước đó đang ngồi trên 1 xe NPC khác, trả xe đó về trạng thái lưu thông bình thường
    if (state.boardedNpcVehicleRef && state.boardedNpcVehicleRef !== veh) {
      state.boardedNpcVehicleRef.visible = true;
      state.boardedNpcVehicleRef.userData.isBoardedByPlayer = false;
    }

    const vd = veh.userData;
    state.boardedNpcVehicleRef = veh;
    state.currentBoardedType = vd.category || 'CAR';
    vd.isBoardedByPlayer = true;

    // Đặt vị trí khoang xe khớp với chiếc xe NPC vừa lên
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

    // MẶC ĐỊNH LÊN GHẾ LÁI (seatIndex = 0) để người chơi tự cầm lái!
    // Có thể bấm [C] hoặc Nút B/Y trên tay cầm Quest bất kỳ lúc nào để chuyển sang ngồi Ghế Phụ.
    state.seatIndex = 0;
    driverSeatMount.position.copy(SEAT_POSITIONS[0].pos);

    if (activeNpcChauffeurMesh) {
      activeNpcChauffeurMesh.visible = false;
      activeNpcChauffeurMesh.position.copy(SEAT_POSITIONS[1].pos);
    }

    if (state.playerMode !== 'DRIVING') {
      state.playerMode = 'DRIVING';
      state.doorsOpen = false;
      state.engineRunning = true;
      ctx.avatarBodyMesh.visible = false;
      driverSeatMount.add(cameraRig);
      cameraRig.position.set(0, 0, 0);
      if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
      cameraRig.rotation.set(0, 0, 0);
      roofBeaconGroup.visible = false;
    }

    const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
    if (hvBar) {
      hvBar.classList.remove('active-bus-bar', 'active-fire-bar', 'active-heavy-bar');
      if (vd.category === 'BUS') hvBar.classList.add('active-bus-bar');
      else if (vd.category === 'FIRETRUCK') hvBar.classList.add('active-fire-bar');
      else if (vd.category === 'AMBULANCE') hvBar.classList.add('active-heavy-bar');
    }

    state.lastActionLog = `🚕 Bạn đã lên ngồi GHẾ PHỤ (Góc nhìn thứ 1) trên [${vd.modelName}]! Tài xế NPC đang chở bạn đi. Bấm [🔄 Đổi Lái / Ghế Phụ (C)] nếu muốn tự cầm lái chở NPC!`;
  };

  // Ghi đè hàm boardAnyNpcVehicle cũ
  window.boardAnyNpcVehicle = window.boardAnyNpcVehicleV160;

  // Khi bấm Đổi Lái / Ghế Phụ (Nút C hoặc nút trên màn hình): Hoán đổi vị trí giữa Bạn và Tài xế NPC!
  const origSwapSeat = swapSeatOrTakeDriverControl;
  window.swapSeatOrTakeDriverControl = function() {
    if (state.boardedNpcVehicleRef) {
      // Chuyển qua lại giữa Ghế Phụ (1 - NPC chở bạn) và Ghế Lái (0 - Bạn chở NPC)
      state.seatIndex = state.seatIndex === 0 ? 1 : 0;
      driverSeatMount.position.copy(SEAT_POSITIONS[state.seatIndex].pos);
      cameraRig.position.set(0, 0, 0);

      // NPC tự động đổi sang ghế còn lại!
      const npcSeatIdx = state.seatIndex === 0 ? 1 : 0;
      activeNpcChauffeurMesh.visible = true;
      activeNpcChauffeurMesh.position.copy(SEAT_POSITIONS[npcSeatIdx].pos);

      if (state.seatIndex !== 0) {
        if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
      }
      if (ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
        ctx.mpSocket.send(JSON.stringify({
          type: 'SWAP_SEAT',
          carId: state.activeCarId,
          targetSeatIndex: state.seatIndex
        }));
      }
      state.lastActionLog = state.seatIndex === 0
        ? `🛞 BẠN ĐANG CẦM LÁI [${state.boardedNpcVehicleRef.userData.modelName}] và chở NPC ngồi bên ghế phụ!`
        : `💺 Bạn đã nhường lại vô-lăng cho Tài xế NPC! Đã tự động cân bằng tâm ghế phụ 360°!`;
      return;
    }
    origSwapSeat();
    if (state.seatIndex !== 0) {
      if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
    }
  };

  const btnSwapEl = document.getElementById('btn-swap-driver');
  if (btnSwapEl) {
    const clonedSwap = btnSwapEl.cloneNode(true);
    btnSwapEl.parentNode.replaceChild(clonedSwap, btnSwapEl);
    clonedSwap.addEventListener('click', () => window.swapSeatOrTakeDriverControl());
  }

  // Ghi đè hàm Lên/Xuống xe (`enterOrExitCarWithBlink`) để khi xuống khỏi xe NPC:
  // 1. Hiện lại ngay chiếc xe NPC và NPC tại đúng vị trí đó (Không bao giờ bị mất xe!).
  // 2. Nếu bạn đang cầm lái (seatIndex === 0) mà xuống xe, xe NPC sẽ đứng đợi 5 giây; sau 5 giây không lên lại, NPC tự chuyển sang ghế lái và chạy đi tiếp!
  const prevEnterOrExitV160 = window.enterOrExitCarWithBlink;
  window.enterOrExitCarWithBlink = function() {
    if (state.isBlinking) return;
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

      // Đưa khoang Rolls-Royce của người chơi về lại vị trí đỗ trước nhà để không bị đè hình
      activeNpcChauffeurMesh.visible = false;
      state.boardedNpcVehicleRef = null;
      state.currentBoardedType = 'ROLLS_ROYCE';
      setCarBodyVisibilityForTwoWheelMode(false);
      rebuildDistinctInteriorByVehicleCategory('ROLLS_ROYCE');

      const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
      if (hvBar) hvBar.classList.remove('active-bus-bar', 'active-fire-bar', 'active-heavy-bar');

      // Đặt người chơi bước xuống đứng cạnh chiếc xe NPC vừa đi
      state.playerMode = 'ON_FOOT';
      state.doorsOpen = false;
      state.velocityMs = 0;
      state.speedKmh = 0;
      ctx.avatarBodyMesh.visible = true;
      roofBeaconGroup.visible = true;

      const stepOutOffset = new THREE.Vector3(1.85, 0.24, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), vd.headingRad);
      state.avatarPos.copy(npcVeh.position).add(stepOutOffset);
      playerAvatarGroup.position.copy(state.avatarPos);
      playerAvatarGroup.add(cameraRig);
      cameraRig.position.set(0, 0.52, 0);

      // Đưa chiếc Rolls-Royce riêng của bạn về vị trí đỗ cạnh nhà (hoặc cách đó 12m trên lề đường)
      if (typeof HOME_CAR_SPAWN_POS !== 'undefined') {
        vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
        vehicleRoot.rotation.y = 0;
      }

      if (playerWasDriving) {
        // Nếu người chơi đang chở NPC mà bước xuống xe: Xe NPC đứng chờ đúng 5.0 giây!
        vd.waitPlayerReturnTimer = 5.0;
        vd.activeSpeed = 0;
        if (vd.hornBadge) vd.hornBadge.visible = true;
        abandonedNpcCarRecord = { veh: npcVeh, timer: 5.0 };
        state.lastActionLog = `⏱️ Bạn vừa bước xuống khỏi [${vd.modelName}]. NPC đang ngồi ghế phụ đợi bạn 5 giây — nếu không lên lại, NPC sẽ tự sang ghế lái chạy tiếp!`;
      } else {
        vd.waitPlayerReturnTimer = 0;
        state.lastActionLog = `👋 Bạn đã xuống xe [${vd.modelName}]. Tài xế NPC đang tiếp tục hành trình!`;
      }
      return;
    }

    prevEnterOrExitV160();
  };

  const btnNpcNear = document.getElementById('btn-board-npc-vehicle');
  if (btnNpcNear) {
    const clone = btnNpcNear.cloneNode(true);
    btnNpcNear.parentNode.replaceChild(clone, btnNpcNear);
    clone.addEventListener('click', () => {
      const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
      let nearest = null;
      let minDist = Infinity;
      for (const veh of allTrafficVehicles) {
        if (!veh.visible) continue;
        const d = refPos.distanceTo(veh.position);
        if (d < minDist) { minDist = d; nearest = veh; }
      }
      if (nearest) window.boardAnyNpcVehicleV160(nearest);
    });
  }

  // --- 20.7. ĐẠO DIỄN 3 HOẠT CẢNH SỐNG ĐỘNG NGAY TRƯỚC MẮT NGƯỜI CHƠI:
  //           1. CẢNH SÁT CHẶN ĐẦU XE BẮT CƯỚP
  //           2. XE TÔNG TAI NẠN -> XE CẤP CỨU 115 TỚI ĐƯA BĂNG CA RA CỨU NGƯỜI BỊ TÔNG
  //           3. ĐÁM CHÁY BÙNG PHÁT -> XE CỨU HỎA TỚI PHUN VÒI RỒNG NƯỚC DẬP LỬA ---
  const liveFireEffectGroup = new THREE.Group();
  liveFireEffectGroup.visible = false;
  scene.add(liveFireEffectGroup);

  const waterStreamParticles = [];
  const flameCones = [];

  (function buildFireAndWaterCannonEffects() {
    // Ngọn lửa 3D nhiều tầng + Khói tại hiện trường vụ cháy
    const flameColors = [0xff2200, 0xff7700, 0xffdd00];
    for (let i = 0; i < 6; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.45 + (i % 3) * 0.25, 1.8 + (i % 2) * 0.8, 10),
        new THREE.MeshBasicMaterial({ color: flameColors[i % 3], transparent: true, opacity: 0.88 })
      );
      cone.position.set((Math.random() - 0.5) * 1.4, 0.9, (Math.random() - 0.5) * 1.4);
      liveFireEffectGroup.add(cone);
      flameCones.push(cone);
    }
    const fireBanner = createSpeechBubbleSprite('🔥 ĐÁM CHÁY KHẨN CẤP! XE CỨU HỎA 114 ĐANG PHUN VÒI RỒNG DẬP LỬA!', '#780000', '#ffd60a');
    fireBanner.scale.set(2.4, 0.45, 1);
    fireBanner.position.set(0, 3.2, 0);
    fireBanner.visible = true;
    liveFireEffectGroup.add(fireBanner);

    // Tia nước vòi rồng 3D (Water Cannon Stream) phun từ nóc Xe Cứu Hỏa vào đám cháy
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x7ae2ff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 18; i++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), waterMat);
      drop.visible = false;
      scene.add(drop);
      waterStreamParticles.push({ mesh: drop, progress: i / 18 });
    }
  })();

  let activeCityDrama = {
    type: 'NONE', // 'AMBULANCE_RESCUE' | 'FIRE_EXTINGUISH' | 'POLICE_ARREST'
    timer: 0,
    stagePos: new THREE.Vector3(),
    actorVeh: null,
    victimNpc: null
  };
  let autoDramaCooldown = 4.0; // Tự động diễn hoạt cảnh đầu tiên ngay sau 4 giây để người chơi nhìn thấy ngay!
  let dramaCycleIndex = 0;

  function computeStagePositionInFrontOfPlayer(distAhead = 22.0) {
    const basePos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
    const yaw = state.playerMode === 'DRIVING' ? state.headingRad : state.avatarYaw;
    return new THREE.Vector3(
      basePos.x - Math.sin(yaw) * distAhead,
      0,
      basePos.z - Math.cos(yaw) * distAhead
    );
  }

  window.triggerLiveAmbulanceRescueCutscene = function() {
    const amb = detailedAmbulancesList[0] || allTrafficVehicles.find((v) => v.userData.category === 'AMBULANCE');
    const victim = sidewalkNpcs[0];
    if (!amb || !victim) return;

    const stage = computeStagePositionInFrontOfPlayer(20.0);
    amb.visible = true;
    amb.position.set(stage.x + 1.8, 0, stage.z);
    amb.rotation.set(0, 0, 0);
    amb.userData.isInterceptingHijacker = true;
    if (amb.userData.hornBadge) amb.userData.hornBadge.visible = true;
    if (amb.userData.stretcherGroup) amb.userData.stretcherGroup.visible = true;

    // Đặt NPC bị tai nạn nằm ngay cạnh Băng ca sau đuôi Xe Cấp Cứu
    victim.visible = true;
    victim.position.set(stage.x + 0.9, 0.28, stage.z + 3.8);
    victim.rotation.x = -Math.PI / 2;
    if (victim.userData.helloBubble) victim.userData.helloBubble.visible = true;

    activeCityDrama = {
      type: 'AMBULANCE_RESCUE',
      timer: 9.0,
      stagePos: stage,
      actorVeh: amb,
      victimNpc: victim
    };
    state.crimeLog = '🚑 [HOẠT CẢNH CẤP CỨU 115]: Xe Cấp Cứu đã bật còi hú, hạ Băng Ca đưa NPC bị tông lên xe cấp cứu!';
    state.lastActionLog = state.crimeLog;
  };

  window.triggerLiveFiretruckExtinguishCutscene = function() {
    const ft = allTrafficVehicles.find((v) => v.userData.category === 'FIRETRUCK');
    if (!ft) return;

    const stage = computeStagePositionInFrontOfPlayer(22.0);
    liveFireEffectGroup.position.set(stage.x - 3.5, 0.2, stage.z - 2.0);
    liveFireEffectGroup.visible = true;
    liveFireEffectGroup.scale.set(1, 1, 1);

    ft.visible = true;
    ft.position.set(stage.x + 2.2, 0, stage.z + 3.5);
    ft.lookAt(liveFireEffectGroup.position.x, 0, liveFireEffectGroup.position.z);
    ft.userData.isInterceptingHijacker = true;
    if (ft.userData.hornBadge) ft.userData.hornBadge.visible = true;

    activeCityDrama = {
      type: 'FIRE_EXTINGUISH',
      timer: 9.5,
      stagePos: stage,
      actorVeh: ft,
      victimNpc: null
    };
    state.crimeLog = '🚒🔥 [HOẠT CẢNH CHỮA CHÁY 114]: Xe Cứu Hỏa đã tiếp cận đám cháy và đang phun Vòi Rồng dập lửa!';
    state.lastActionLog = state.crimeLog;
  };

  window.triggerLivePoliceArrestCutscene = function() {
    const pCar = policeCarsList[0];
    const thief = sidewalkNpcs[1] || sidewalkNpcs[0];
    if (!pCar || !thief) return;

    const stage = computeStagePositionInFrontOfPlayer(19.0);
    pCar.visible = true;
    pCar.position.set(stage.x - 1.5, 0, stage.z);
    pCar.rotation.set(0, Math.PI / 6, 0);
    pCar.userData.isInterceptingHijacker = true;
    if (pCar.userData.hornBadge) pCar.userData.hornBadge.visible = true;
    if (pCar.userData.officerNpc) pCar.userData.officerNpc.visible = true;

    thief.visible = true;
    thief.position.set(stage.x + 0.5, 0.24, stage.z + 1.2);
    thief.lookAt(pCar.position);
    if (thief.userData.helloBubble) thief.userData.helloBubble.visible = true;

    activeCityDrama = {
      type: 'POLICE_ARREST',
      timer: 8.5,
      stagePos: stage,
      actorVeh: pCar,
      victimNpc: thief
    };
    state.crimeLog = '🚓🚨 [HOẠT CẢNH BẮT CƯỚP]: Xe Cảnh Sát vừa ép lề, khống chế bắt giữ tên cướp ngay trước mắt bạn!';
    state.lastActionLog = state.crimeLog;
  };

  // Gắn trực tiếp vào 2 nút trong Bảng Chức Năng (#btn-trigger-fire-event & #btn-trigger-ambulance)
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-trigger-fire-event')?.addEventListener('click', window.triggerLiveFiretruckExtinguishCutscene);
    document.getElementById('btn-trigger-ambulance')?.addEventListener('click', window.triggerLiveAmbulanceRescueCutscene);
  });

  function updateV160MasterWorld(dt, elapsed) {
    // 1. Xử lý khi bạn đang ngồi Ghế Phụ (seatIndex !== 0) trên xe NPC: Tài xế NPC tự động lái chở bạn đi đúng làn & vần vô-lăng!
    if (state.playerMode === 'DRIVING' && state.boardedNpcVehicleRef && state.seatIndex !== 0) {
      const vd = state.boardedNpcVehicleRef.userData;
      const cruiseMs = vd.cruiseSpeed || 13.5;

      // Kiểm tra đèn đỏ phía trước để Tài xế NPC chở bạn dừng đèn đỏ đúng luật
      const gridX = Math.round(vehicleRoot.position.x / BLOCK_SIZE) * BLOCK_SIZE;
      const gridZ = Math.round(vehicleRoot.position.z / BLOCK_SIZE) * BLOCK_SIZE;
      const fwdX = -Math.sin(state.headingRad);
      const fwdZ = -Math.cos(state.headingRad);
      const distAhead = (gridX - vehicleRoot.position.x) * fwdX + (gridZ - vehicleRoot.position.z) * fwdZ;
      const isZ = Math.abs(fwdZ) >= Math.abs(fwdX);
      const lightGreen = isZ ? (ctx.currentTrafficPhase === 'GREEN') : (ctx.currentTrafficPhase === 'RED');

      if (!lightGreen && distAhead > 11.0 && distAhead < 15.8) {
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * 10);
      } else {
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, cruiseMs, dt * 4);
      }
      state.speedKmh = state.velocityMs * 3.6;

      // Giữ xe bám chuẩn tâm làn đường nhựa và tự động rẽ tại ngã tư
      const laneW = vd.laneWidth || 3.2;
      if (isZ) {
        const targetX = gridX + (fwdZ > 0 ? -laneW : laneW);
        vehicleRoot.position.x = THREE.MathUtils.lerp(vehicleRoot.position.x, targetX, dt * 5);
      } else {
        const targetZ = gridZ + (fwdX > 0 ? laneW : -laneW);
        vehicleRoot.position.z = THREE.MathUtils.lerp(vehicleRoot.position.z, targetZ, dt * 5);
      }

      const step = state.velocityMs * dt;
      vehicleRoot.position.x += fwdX * step;
      vehicleRoot.position.z += fwdZ * step;
      vehicleRoot.rotation.y = state.headingRad;

      // Hiệu ứng Tài xế NPC đánh tay lái nhịp nhàng
      if (chauffeurLeftArm && chauffeurRightArm) {
        const steerWave = Math.sin(elapsed * 3.5) * 0.22;
        chauffeurLeftArm.rotation.z = steerWave;
        chauffeurRightArm.rotation.z = steerWave;
        steeringWheelPivot.rotation.z = steerWave * 1.5;
      }
    }

    // 2. Xử lý bộ đếm 5 giây sau khi bạn xuống khỏi xe NPC (mà trước đó bạn đang cầm lái):
    if (abandonedNpcCarRecord) {
      const rec = abandonedNpcCarRecord;
      rec.timer -= dt;
      if (rec.veh && rec.veh.userData) {
        rec.veh.userData.activeSpeed = 0; // Đứng đợi người chơi 5 giây
      }
      if (rec.timer <= 0) {
        if (rec.veh && rec.veh.userData) {
          rec.veh.userData.waitPlayerReturnTimer = 0;
          rec.veh.userData.activeSpeed = rec.veh.userData.cruiseSpeed || 12.0;
          if (rec.veh.userData.hornBadge) rec.veh.userData.hornBadge.visible = false;
          state.lastActionLog = `🚗 Đã hết 5 giây chờ: NPC trên [${rec.veh.userData.modelName}] đã tự chuyển về Ghế Lái và điều khiển xe chạy tiếp!`;
        }
        abandonedNpcCarRecord = null;
      }
    }

    // 3. Cập nhật chuỗi Hoạt Cảnh Sống Động (Cấp Cứu Băng Ca, Cứu Hỏa Phun Nước, Cảnh Sát Bắt Cướp)
    if (activeCityDrama.type !== 'NONE') {
      activeCityDrama.timer -= dt;

      if (activeCityDrama.type === 'AMBULANCE_RESCUE' && activeCityDrama.actorVeh) {
        const stGroup = activeCityDrama.actorVeh.userData.stretcherGroup;
        if (stGroup) {
          // Di chuyển băng ca từ đuôi xe (z = 3.85) trượt dần vào trong khoang xe Cấp Cứu (z = 1.2)
          stGroup.position.z = THREE.MathUtils.lerp(stGroup.position.z, 1.4, dt * 0.8);
          if (activeCityDrama.victimNpc && activeCityDrama.timer < 5.5) {
            activeCityDrama.victimNpc.visible = false; // Đã được đưa lên nằm trên băng ca
          }
        }
      } else if (activeCityDrama.type === 'FIRE_EXTINGUISH' && activeCityDrama.actorVeh) {
        // Phun tia nước vòi rồng 3D từ nóc Xe Cứu Hỏa vào đám cháy và dập nhỏ ngọn lửa dần
        const startPt = activeCityDrama.actorVeh.position.clone().add(new THREE.Vector3(0, 2.5, 0));
        const endPt = liveFireEffectGroup.position.clone().add(new THREE.Vector3(0, 0.8, 0));

        waterStreamParticles.forEach((wp) => {
          wp.progress = (wp.progress + dt * 1.8) % 1.0;
          wp.mesh.visible = true;
          wp.mesh.position.lerpVectors(startPt, endPt, wp.progress);
          wp.mesh.position.y += Math.sin(wp.progress * Math.PI) * 1.6;
        });

        flameCones.forEach((fc, idx) => {
          fc.scale.y = 0.6 + Math.abs(Math.sin(elapsed * 12 + idx)) * 0.7;
        });
        const shrink = THREE.MathUtils.clamp(activeCityDrama.timer / 9.5, 0.15, 1.0);
        liveFireEffectGroup.scale.set(shrink, shrink, shrink);
      }

      if (activeCityDrama.timer <= 0) {
        // Kết thúc hoạt cảnh, trả các xe chuyên dụng về lưu thông bình thường
        if (activeCityDrama.actorVeh && activeCityDrama.actorVeh.userData) {
          activeCityDrama.actorVeh.userData.isInterceptingHijacker = false;
          if (activeCityDrama.actorVeh.userData.stretcherGroup) {
            activeCityDrama.actorVeh.userData.stretcherGroup.visible = false;
            activeCityDrama.actorVeh.userData.stretcherGroup.position.z = 3.85;
          }
          if (activeCityDrama.actorVeh.userData.officerNpc) {
            activeCityDrama.actorVeh.userData.officerNpc.visible = false;
          }
        }
        if (activeCityDrama.victimNpc) {
          activeCityDrama.victimNpc.visible = true;
          activeCityDrama.victimNpc.rotation.x = 0;
        }
        liveFireEffectGroup.visible = false;
        waterStreamParticles.forEach((wp) => { wp.mesh.visible = false; });
        activeCityDrama.type = 'NONE';
        autoDramaCooldown = 14.0;
      }
    } else {
      autoDramaCooldown -= dt;
      if (autoDramaCooldown <= 0) {
        if (dramaCycleIndex % 3 === 0) window.triggerLiveAmbulanceRescueCutscene();
        else if (dramaCycleIndex % 3 === 1) window.triggerLiveFiretruckExtinguishCutscene();
        else window.triggerLivePoliceArrestCutscene();
        dramaCycleIndex++;
      }
    }
  }

  // --- 20.8. TÍCH HỢP VÀO VÒNG LẶP RENDER CHÍNH ---
  const prevRenderHookV160 = scene.onBeforeRender;
  let lastV160Time = performance.now();

  scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
    if (typeof prevRenderHookV160 === 'function') {
      prevRenderHookV160(rendererInst, sceneInst, cameraInst);
    }
    if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

    const now = performance.now();
    const dt = Math.min((now - lastV160Time) / 1000, 0.1);
    if (dt < 0.001) return;
    lastV160Time = now;
    const elapsed = clock.getElapsedTime();

    updateV160MasterWorld(dt, elapsed);
  };
}
