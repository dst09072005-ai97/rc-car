# ==============================================================================
# XE RC FPV V10 - Production Dockerfile (Security Hardened & Multi-Protocol)
# Meta Quest 3 WebXR, Dual-Telemetry FPV RC Car, Mobile Camera Streaming
# ==============================================================================

FROM node:20-alpine AS runtime

# Thiết lập nhãn metadata
LABEL maintainer="XE RC FPV Engineering Team"
LABEL description="XE RC FPV V10 WebXR & Multi-Protocol Relay Server"
LABEL version="10.1.0"

# Cài đặt các công cụ hệ thống tối thiểu cần thiết:
# - openssl: Cấp phát SSL tự ký cho WebXR (Meta Quest Browser yêu cầu HTTPS)
# - python3, py3-pip, ffmpeg: Phục vụ yt-dlp và xử lý video stream
# - curl: Kiểm tra trạng thái container (Healthcheck)
# - tini: PID 1 init process xử lý signal và zombie processes an toàn
RUN apk update && apk add --no-cache \
    openssl \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    tini \
    && python3 -m pip install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/cache/apk/*

# Thư mục làm việc trong container
WORKDIR /app

# Đặt biến môi trường mặc định
ENV NODE_ENV=production \
    PORT=8080 \
    HTTPS_PORT=8443 \
    DUCKDNS_DOMAIN=vr-cam-fpv \
    ESP32_FRONT_CAM_IP=192.168.1.101 \
    ESP32_REAR_CAM_IP=192.168.1.102 \
    ESP32_CTRL_IP=192.168.1.100 \
    ESP32_CONTROLLER_HOST=192.168.1.238 \
    ESP32_CONTROLLER_UDP_PORT=4210

# Sao chép định nghĩa package và cài đặt dependencies sạch (không kéo mã nguồn ở bước này để tận dụng Docker Cache)
COPY package*.json ./
COPY server/package*.json ./server/

RUN npm install --omit=dev && \
    cd server && npm install --omit=dev && cd ..

# Sao chép toàn bộ mã nguồn ứng dụng (Đã được lọc qua .dockerignore để loại bỏ bí mật/certs/caches)
COPY server ./server
COPY www ./www
COPY tools ./tools
COPY config/wifi_credentials.h.example config/README.md ./config/
COPY config/.env.example ./config/.env.example
COPY docker ./docker

# Phân quyền cho user không đặc quyền (non-root node user - UID/GID 1000)
RUN chmod +x /app/docker/entrypoint.sh && \
    chown -R node:node /app

# Chuyển sang user unprivileged 'node' tuân thủ tiêu chuẩn an ninh
USER node

# Mở các cổng giao thức cần thiết:
# 8080/tcp: HTTP Web Dashboard, Mobile Passenger, WebSocket Relay
# 8443/tcp: HTTPS WebXR Meta Quest 3, Mobile FPV Cam (yêu cầu SSL)
# 4210/udp: Telemetry & Điều khiển vô lăng/ga xe RC
# 4213/udp: Nhận gói tin UDP phân mảnh từ ESP32-CAM
EXPOSE 8080/tcp 8443/tcp 4210/udp 4213/udp

# Healthcheck giám sát trạng thái máy chủ
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:8080/api/network-info || exit 1

# Sử dụng tini làm init system và khởi chạy qua entrypoint an toàn
ENTRYPOINT ["/sbin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["node", "server/server.js"]
