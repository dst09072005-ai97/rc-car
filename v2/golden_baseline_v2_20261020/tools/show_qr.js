const os = require('os');
const qrcode = require('qrcode-terminal');

function getAllNetworkIps() {
  const nets = os.networkInterfaces();
  let lanIp = null;
  let publicTailscaleIp = null;

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('100.')) {
          publicTailscaleIp = net.address;
        } else if (
          net.address.startsWith('192.168.') ||
          net.address.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)
        ) {
          if (!lanIp) lanIp = net.address;
        }
      }
    }
  }
  return {
    lanIp: lanIp || publicTailscaleIp || '127.0.0.1',
    publicIp: publicTailscaleIp || lanIp || '127.0.0.1'
  };
}

const ips = getAllNetworkIps();
const lan = ips.lanIp;
const pub = ips.publicIp;

const urlIphoneLan = `http://${lan}:8080/?mode=passenger_mobile`;
const urlIphonePub = `http://${pub}:8080/?mode=passenger_mobile`;
const urlVR = `https://${lan}:8443/?vr=immersive`;

console.log('\n==========================================================');
console.log('📱 MÃ QR CHO SAFARI IPHONE / ANDROID (WI-FI LAN):');
console.log('Đường dẫn:', urlIphoneLan);
console.log('==========================================================');
qrcode.generate(urlIphoneLan, { small: true });

if (pub !== lan) {
  console.log('\n==========================================================');
  console.log('🌍 MÃ QR CHO SAFARI IPHONE / ANDROID (PUBLIC / TAILSCALE):');
  console.log('Đường dẫn:', urlIphonePub);
  console.log('==========================================================');
  qrcode.generate(urlIphonePub, { small: true });
}

console.log('\n==========================================================');
console.log('🥽 MÃ QR CHO KÍNH META QUEST 3 (IMMERSIVE VR 16:9):');
console.log('Đường dẫn:', urlVR);
console.log('==========================================================');
qrcode.generate(urlVR, { small: true });
console.log('==========================================================\n');
