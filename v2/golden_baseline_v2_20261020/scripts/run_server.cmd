@echo off
setlocal
cd /d "%~dp0..\server"
if not exist node_modules (
  echo [INFO] Installing Node dependencies...
  call npm install || exit /b 1
)
call npm start
