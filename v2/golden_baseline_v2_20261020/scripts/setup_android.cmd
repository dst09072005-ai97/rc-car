@echo off
setlocal
set "ROOT=%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\setup_android.ps1" -InstallMissing
exit /b %errorlevel%
