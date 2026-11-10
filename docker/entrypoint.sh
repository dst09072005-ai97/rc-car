#!/bin/sh
set -e

echo "========================================================================"
echo "🚀 [DOCKER] Khởi động XE RC FPV V10 WebXR & Relay Server Container"
echo "========================================================================"

# Tự động tạo chứng chỉ SSL Self-Signed nếu chưa được cung cấp qua Volume
CERT_FILE="/app/tools/cert.pem"
KEY_FILE="/app/tools/key.pem"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "🔒 [SSL] Không tìm thấy chứng chỉ tools/cert.pem và tools/key.pem."
  echo "🔒 [SSL] Đang tự động tạo SSL tự ký (Self-Signed) cho WebXR & FPV Camera..."
  mkdir -p /app/tools
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=VN/ST=Hanoi/L=Hanoi/O=XE-RC-FPV/OU=WebXR/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:*.duckdns.org,DNS:vr-cam-fpv.duckdns.org,IP:127.0.0.1" \
    2>/dev/null || openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=localhost"
  echo "✅ [SSL] Đã tạo thành công SSL dev certs. Cổng HTTPS 8443 đã sẵn sàng!"
else
  echo "✅ [SSL] Tìm thấy chứng chỉ SSL sẵn có: $CERT_FILE"
fi

# Chạy lệnh được truyền vào (mặc định: node server/server.js)
exec "$@"
