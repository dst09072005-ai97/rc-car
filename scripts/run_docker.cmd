@echo off
setlocal
cd /d "%~dp0\.."

echo ========================================================================
echo   XE RC FPV V10 - Docker Server Launcher (Windows)
echo ========================================================================
echo.

where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker chua duoc cai dat hoac chua duoc them vao PATH!
    echo Vui long cai dat Docker Desktop: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo Dang build va khoi chay container XE RC FPV Server...
docker compose up -d --build

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================================
    echo [SUCCESS] Server da khoi chay thanh cong trong Docker!
    echo.
    echo  - Web Dashboard / Mobile: http://localhost:8080/
    echo  - WebXR Meta Quest 3:     https://localhost:8443/?vr=immersive
    echo  - FPV Cam Dien Thoai:     https://localhost:8443/fpv-cam.html
    echo.
    echo Xem logs: docker compose logs -f
    echo Dung lai: docker compose down
    echo ========================================================================
) else (
    echo [FAILED] Khoi chay container that bai. Vui long kiem tra lai Docker Desktop.
)

pause
