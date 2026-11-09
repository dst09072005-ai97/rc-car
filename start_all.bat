@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==============================================================
echo XE RC FPV V10 - METAVERSE WEBXR & DUAL TELEMETRY STATION
echo ==============================================================

if not exist "%~dp0server\node_modules" (
  echo [SETUP] Installing Node dependencies in server...
  pushd "%~dp0server"
  call npm install
  popd
)

echo [START] Launching XE RC FPV Server (HTTP: 8080, HTTPS: 8443, UDP: 4210)...
start "XE RC FPV V10 - Node Server" cmd /k "cd /d %~dp0server && npm start"

timeout /t 2 /nobreak >nul
echo [STATUS] Server launched. Run 'npm run doctor' or 'node tools/xr-doctor.js' to verify.
endlocal
