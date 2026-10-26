const fs = require("node:fs");
const path = require("node:path");

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
if (!pkg.dependencies.express || !pkg.dependencies.ws || !pkg.dependencies.qrcode) {
  throw new Error("Missing relay dependencies");
}
const serverText = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
for (const token of ["4212", "HELLO", "/stream", "/ws", "latest-frame", "MAX_FRAME_BYTES", "QRCode"]) {
  if (!serverText.includes(token)) throw new Error(`Missing contract token: ${token}`);
}
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
for (const token of ["mjpeg", "xrCanvas", "vrButton", "qrButton"]) {
  if (!html.includes(token)) throw new Error(`Missing HTML token: ${token}`);
}
const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
for (const token of ["requestSession", "immersive-vr", "/stream", "/ws", "streamUrl"]) {
  if (!js.includes(token)) throw new Error(`Missing viewer token: ${token}`);
}
console.log("[PASS] V10 relay/viewer contracts");
