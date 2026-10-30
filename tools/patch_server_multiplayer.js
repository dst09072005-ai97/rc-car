const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '../server.js');
const mirrorFile = path.join(__dirname, '../server/server.js');

let code = fs.readFileSync(serverFile, 'utf8');

// 1. Fix setInterval ws.readyState bug in server.js
code = code.replace(
  /setInterval\(\(\) => \{\r?\n\s+broadcastWorldState\(\);\r?\n\s+if \(latestEsp32CamFramePacket && ws\.readyState === WebSocket\.OPEN\) \{\r?\n\s+try \{ ws\.send\(latestEsp32CamFramePacket\); \} catch \(e\) \{\}\r?\n\s+\}\r?\n\}, 50\);/,
  'setInterval(() => {\r\n  broadcastWorldState();\r\n}, 50);'
);

// 2. Fix Seat assignment in connection handler
const targetSeatStart = '// Ghế tài xế (seat 0) có trống không?';
const targetSeatEnd = "const assignedOwnCarId = 'car_host';";

const seatBlockIndex = code.indexOf(targetSeatStart);
const seatBlockEndIndex = code.indexOf(targetSeatEnd);

if (seatBlockIndex !== -1 && seatBlockEndIndex !== -1) {
  // Find players.set(...) after assignedOwnCarId
  const playersSetIndex = code.indexOf('players.set(playerId, {', seatBlockEndIndex);
  const playersSetEndIndex = code.indexOf('});', playersSetIndex) + 3;

  const newSeatBlock = `// Phân quyền thiết bị: Nhận diện Laptop Admin, Kính VR Meta Quest, Điện thoại Mobile
    const isQuestVR = /Quest|OculusBrowser|Pacific|VR|Headset/i.test(ua);
    const isMobileDevice = !isQuestVR && /Mobile|Android|iPhone|iPad/i.test(ua);
    const isLocalhostAdmin = Boolean(clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1'));

    // Kiểm tra ghế lái (Seat 0) có trống hoặc người giữ cũ đã mất kết nối không:
    const isDriverSeatFree = (seat0OccupantId === null || !players.has(seat0OccupantId));
    let assignedSeat = 0;

    if (isDriverSeatFree) {
      // Ghế lái đang trống: Thiết bị đầu tiên kết nối (Kính Quest 1, Điện thoại hoặc Laptop) nhận Ghế Lái (Seat 0)
      assignedSeat = 0;
    } else {
      // Ghế lái ĐÃ CÓ NGƯỜI ĐANG LÁI (Ví dụ: Kính Quest 1 hoặc Player chính):
      // Khi có thêm Kính Meta Quest thứ 2 hoặc Điện thoại kết nối:
      // TUYỆT ĐỐI KHÔNG CƯỚP GHẾ LÁI hoặc giáng chức tài xế! Phân bổ an toàn vào Ghế Phụ (Seat 1, 2, 3)
      const openSeat = [1, 2, 3].find((s) => !hostCar || !hostCar.occupants[s]);
      assignedSeat = (openSeat !== undefined) ? openSeat : 1;
    }
    const isHostPlayer = (assignedSeat === 0);

    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    const assignedOwnCarId = 'car_host';

    players.set(playerId, {
      playerId,
      ws,
      clientIp,
      isQuestVR,
      isMobileDevice,
      isLocalhostAdmin,
      name: isHostPlayer
        ? (isQuestVR ? 'Kính Meta Quest 3 [Tài Xế]' : (isMobileDevice ? 'Điện Thoại [Tài Xế]' : 'Laptop Admin [Tài Xế]'))
        : (isQuestVR ? \`Kính Quest Ghế Phụ #\${assignedSeat}\` : (isMobileDevice ? \`Điện Thoại Ghế Phụ #\${assignedSeat}\` : \`Khách Ghế #\${assignedSeat}\`)),
      ownCarId: 'car_host',
      inCarId: 'car_host',
      seatIndex: assignedSeat,
      isHost: isHostPlayer,
      leaningOut: false,
      x: 0.65,
      z: 1.15,
      yaw: 0
    });`;

  code = code.substring(0, seatBlockIndex) + newSeatBlock + code.substring(playersSetEndIndex);
  console.log('[SUCCESS] Replaced seat assignment block');
} else {
  console.warn('[FAILED] Could not find seat block delimiters');
}

// 3. Update WELCOME message to pass role flags & send latestEsp32CamFramePacket if available
const welcomeRegex = /ws\.send\(JSON\.stringify\({\r?\n\s+type: 'WELCOME',[\s\S]*?}\)\);/;
const newWelcome = `ws.send(JSON.stringify({
      type: 'WELCOME',
      playerId,
      ownCarId: assignedOwnCarId,
      isHost: isHostPlayer,
      seatIndex: assignedSeat,
      isDriver: (assignedSeat === 0),
      isQuestVR,
      isMobileDevice,
      isLocalhostAdmin,
      cars: Array.from(cars.values())
    }));

    if (latestEsp32CamFramePacket && ws.readyState === WebSocket.OPEN) {
      try { ws.send(latestEsp32CamFramePacket); } catch (e) {}
    }`;
code = code.replace(welcomeRegex, newWelcome);

// 4. Update CAR_SYNC to enforce that ONLY Seat 0 (Driver) or Laptop Admin can update vehicle physics
const carSyncRegex = /} else if \(data\.type === 'CAR_SYNC' && data\.carId && cars\.has\(data\.carId\)\) \{[\s\S]*?broadcastWorldState\(\);\r?\n\s+\}/;
const newCarSync = `} else if (data.type === 'CAR_SYNC' && data.carId && cars.has(data.carId)) {
          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin MỚI ĐƯỢC ĐỒNG BỘ TỌA ĐỘ VỊ TRÍ XE:
          // Người ngồi ghế phụ (Seat 1, 2, 3) tuyệt đối không được ghi đè tọa độ xe!
          const canSyncCar = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin);
          if (canSyncCar) {
            const c = cars.get(data.carId);
            c.x = clampFinite(data.x, -250, 250, c.x);
            c.z = clampFinite(data.z, -250, 250, c.z);
            c.heading = clampFinite(data.heading, -Math.PI * 4, Math.PI * 4, c.heading);
            c.speedKmh = clampFinite(data.speedKmh, -100, 350, c.speedKmh);
            c.steerDeg = clampFinite(data.steerDeg, -540, 540, c.steerDeg);
            c.doorsOpen = Boolean(data.doorsOpen);
            c.roofOpen = Boolean(data.roofOpen);
            c.turnSignal = data.turnSignal ?? c.turnSignal;
            c.driverPlayerId = playerId;
            broadcastWorldState();
          }
        }`;
code = code.replace(carSyncRegex, newCarSync);

// 5. Update ENTER_CAR so it never kicks the current driver if they are online
const enterCarRegex = /} else if \(data\.type === 'ENTER_CAR' && data\.carId && cars\.has\(data\.carId\)\) \{[\s\S]*?ws\.send\(JSON\.stringify\({\r?\n\s+type: 'SEAT_ASSIGNED'[\s\S]*?}\)\);\r?\n\s+broadcastWorldState\(\);/;
const newEnterCar = `} else if (data.type === 'ENTER_CAR' && data.carId && cars.has(data.carId)) {
          const c = cars.get(data.carId);
          // Giải phóng ghế cũ nếu có
          for (const carObj of cars.values()) {
            for (const s of [0, 1, 2, 3]) {
              if (carObj.occupants[s] === playerId) carObj.occupants[s] = null;
            }
          }
          let chosenSeat = data.preferredSeat ?? 0;
          if (c.occupants[chosenSeat] && c.occupants[chosenSeat] !== playerId) {
            // Nếu muốn vào ghế 0 nhưng ghế 0 đang có người lái đang online:
            const curOccupantId = c.occupants[0];
            const curOccupant = curOccupantId ? players.get(curOccupantId) : null;
            const isDriverOnline = Boolean(curOccupant && curOccupant.ws && curOccupant.ws.readyState === WebSocket.OPEN);
            if (chosenSeat === 0 && isDriverOnline) {
              // Bảo vệ ghế lái: Người mới vào ghế phụ còn trống tiếp theo!
              chosenSeat = [1, 2, 3].find((s) => !c.occupants[s]) ?? 1;
            } else {
              chosenSeat = [1, 2, 3, 0].find((s) => !c.occupants[s]) ?? 1;
            }
          }
          c.occupants[chosenSeat] = playerId;
          p.inCarId = c.carId;
          p.seatIndex = chosenSeat;
          p.isHost = (chosenSeat === 0);
          ws.send(JSON.stringify({
            type: 'SEAT_ASSIGNED',
            seatIndex: chosenSeat,
            isHost: p.isHost,
            isDriver: (chosenSeat === 0),
            carId: c.carId
          }));
          broadcastWorldState();`;
code = code.replace(enterCarRegex, newEnterCar);

// 6. Update CAR_CONTROL to block non-drivers from sending hardware pulses
const carControlStart = "} else if (data.type === 'CAR_CONTROL') {";
const carControlIdx = code.indexOf(carControlStart);
if (carControlIdx !== -1) {
  const insertGuard = `} else if (data.type === 'CAR_CONTROL') {
          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin MỚI ĐƯỢC PHÉP ĐIỀU KHIỂN XE THẬT:
          const canControlHardware = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin);
          if (!canControlHardware) {
            // Khách ngồi ghế phụ (Kính Quest 2, điện thoại khách) bị chặn lệnh lái/ga ra xe thật
            return;
          }`;
  code = code.replace(carControlStart, insertGuard);
  console.log('[SUCCESS] Added CAR_CONTROL guard');
}

// Write to server.js and server/server.js
fs.writeFileSync(serverFile, code, 'utf8');
fs.writeFileSync(mirrorFile, code, 'utf8');
console.log('[COMPLETE] Updated server.js and server/server.js successfully!');
