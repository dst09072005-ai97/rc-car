const fs = require('fs');
const path = require('path');

[
  path.join(__dirname, '../server.js'),
  path.join(__dirname, '../server/server.js')
].forEach((filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove duplicate latestEsp32CamFramePacket
  const dupCam = `    if (latestEsp32CamFramePacket && ws.readyState === WebSocket.OPEN) {
      try { ws.send(latestEsp32CamFramePacket); } catch (e) {}
    }

    if (latestEsp32CamFramePacket && ws.readyState === WebSocket.OPEN) {
      try { ws.send(latestEsp32CamFramePacket); } catch (e) {}
    }`;

  const singleCam = `    if (latestEsp32CamFramePacket && ws.readyState === WebSocket.OPEN) {
      try { ws.send(latestEsp32CamFramePacket); } catch (e) {}
    }`;

  content = content.replace(dupCam, singleCam);

  // Remove duplicate canControlHardware
  const dupControl = `          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin MỚI ĐƯỢC PHÉP ĐIỀU KHIỂN XE THẬT:
          const canControlHardware = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin);
          if (!canControlHardware) {
            // Khách ngồi ghế phụ (Kính Quest 2, điện thoại khách) bị chặn lệnh lái/ga ra xe thật
            return;
          }
          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin MỚI ĐƯỢC PHÉP ĐIỀU KHIỂN XE THẬT:
          const canControlHardware = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin);
          if (!canControlHardware) {
            // Khách ngồi ghế phụ (Kính Quest 2, điện thoại khách) bị chặn lệnh lái/ga ra xe thật
            return;
          }`;

  const singleControl = `          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin MỚI ĐƯỢC PHÉP ĐIỀU KHIỂN XE THẬT:
          const canControlHardware = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin);
          if (!canControlHardware) {
            // Khách ngồi ghế phụ (Kính Quest 2, điện thoại khách) bị chặn lệnh lái/ga ra xe thật
            return;
          }`;

  content = content.replace(dupControl, singleControl);

  fs.writeFileSync(filePath, content, 'utf8');
});

console.log('[SUCCESS] Cleaned duplicates in server.js and server/server.js');
