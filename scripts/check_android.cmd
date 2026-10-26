@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
set "GODOT=%ROOT%\godot.exe"
if not exist "%GODOT%" set "GODOT=godot"
set "SDK=%ANDROID_HOME%"
if "%SDK%"=="" set "SDK=%ANDROID_SDK_ROOT%"
if "%SDK%"=="" set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "OK=1"

echo [INFO] XE RC FPV V10.1.1 Android prerequisite check

"%GODOT%" --version >nul 2>&1
if errorlevel 1 (
  echo [MISS] Godot 4.7.2 executable
  set "OK=0"
) else (
  for /f "delims=" %%V in ('"%GODOT%" --version 2^>nul') do echo [OK] Godot %%V
)

if exist "%SDK%\platform-tools\adb.exe" (
  echo [OK] Android platform-tools: %SDK%\platform-tools
) else (
  echo [MISS] Android platform-tools: %SDK%\platform-tools
  set "OK=0"
)

set "BT="
for /d %%D in ("%SDK%\build-tools\*") do if exist "%%~fD\apksigner.bat" set "BT=%%~fD"
if defined BT (
  echo [OK] Android Build-Tools: %BT%
) else (
  echo [MISS] Android Build-Tools/apksigner
  set "OK=0"
)

if exist "%APPDATA%\Godot\export_templates\4.7.2.stable\android_debug.apk" (
  echo [OK] Godot 4.7.2 Android debug export template
) else (
  echo [MISS] Godot 4.7.2 Android export template
  echo [NEXT] Godot ^> Editor ^> Manage Export Templates... ^> Install Selected Templates
  set "OK=0"
)

java -version >nul 2>&1
if errorlevel 1 (
  echo [MISS] Java
  set "OK=0"
) else (
  for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /C:"version"') do echo [OK] Java %%V
)

if "%OK%"=="1" (
  echo [PASS] Android prerequisites are ready.
  exit /b 0
)

echo [ACTION] Fix the [MISS] items above, then run this check again.
exit /b 2
