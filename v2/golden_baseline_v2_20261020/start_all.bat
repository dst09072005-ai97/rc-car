@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==============================================================
echo XE RC V9.1 - FREE-FIRST START
echo ==============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\ensure_local_setup.ps1"
if errorlevel 2 (
  echo.
  echo Setup is incomplete. Edit config\venue.json and run:
  echo     .\PROVISION_WIFI.ps1 -Device All -ControllerPort COM5 -CameraPort COM6
  echo.
  exit /b 2
)

set "NODE_READY=0"
if not exist "%~dp0server\node_modules" (
  echo [SETUP] Installing Node dependencies with npm ci...
  pushd "%~dp0server"
  call npm ci
  if errorlevel 1 (
    echo [WARN] npm ci failed or Internet is unavailable.
    echo [WARN] Offline vehicle control does not depend on Node; continuing with Godot.
  ) else (
    set "NODE_READY=1"
  )
  popd
) else (
  set "NODE_READY=1"
)

if "%NODE_READY%"=="1" (
  echo [START] Node server...
  start "XE RC V9.1 - Node" cmd /k "cd /d %~dp0server && npm start"
  timeout /t 2 /nobreak >nul
) else (
  echo [OFFLINE] Node server skipped. Godot direct control remains available.
)

echo [START] Godot...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch_godot_window.ps1"

echo.
echo [READY] Godot launch requested.
if "%NODE_READY%"=="1" (
  echo [INFO] Public URL will appear in the Node window when Tailscale Funnel is ready.
) else (
  echo [INFO] Running without Node: keep the laptop connected to XE_RC_ESP32 for offline control.
)
endlocal
