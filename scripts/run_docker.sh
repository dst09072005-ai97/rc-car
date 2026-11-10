#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

echo "========================================================================"
echo "  XE RC FPV V10 - Docker Server Launcher (Linux / macOS)"
echo "========================================================================"
echo ""

if ! command -v docker &> /dev/null; then
    echo "❌ [ERROR] Docker chưa được cài đặt hoặc chưa nằm trong PATH!"
    echo "Vui lòng cài đặt Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

echo "🚀 Đang build và khởi chạy container XE RC FPV Server..."
docker compose up -d --build

echo ""
echo "========================================================================"
echo "✅ [SUCCESS] Server đã khởi chạy thành công trong Docker!"
echo ""
echo "  - Web Dashboard / Mobile: http://localhost:8080/"
echo "  - WebXR Meta Quest 3:     https://localhost:8443/?vr=immersive"
echo "  - FPV Cam Điện Thoại:     https://localhost:8443/fpv-cam.html"
echo ""
echo "Xem logs: docker compose logs -f"
echo "Dừng lại: docker compose down"
echo "========================================================================"
