@echo off
setlocal
set "ROOT=%~dp0.."
set "GODOT=%ROOT%\godot.exe"
if not exist "%GODOT%" set "GODOT=godot"
if not exist "%ROOT%\controller_godot\project.godot" (
  echo [FAIL] Godot project missing.
  exit /b 1
)

call "%ROOT%\scripts\setup_android.cmd"
if errorlevel 1 exit /b %errorlevel%

if not exist "%APPDATA%\Godot\export_templates\4.7.2.stable\android_debug.apk" (
  echo [FAIL] Godot 4.7.2 Android export templates are missing.
  echo [NEXT] Run: .\scripts\install_godot_android_templates.cmd
  exit /b 2
)

if not exist "%ROOT%\build\android" mkdir "%ROOT%\build\android"

"%GODOT%" --headless --path "%ROOT%\controller_godot" --check-only --script "res://scripts/rc_fpv_v10.gd"
if errorlevel 1 (
  echo [FAIL] GDScript parse check failed.
  exit /b 1
)

rem Godot 4.7 may refresh per-user editor settings during headless initialization.
rem Re-apply the Android paths immediately before export.
call "%ROOT%\scripts\setup_android.cmd"
if errorlevel 1 exit /b %errorlevel%

"%GODOT%" --headless --path "%ROOT%\controller_godot" --export-debug "Android Quest" "%ROOT%\build\android\XE_RC_FPV_V18.apk"
if errorlevel 1 (
  echo [FAIL] Android export failed.
  exit /b 1
)

echo [INFO] Running fail-closed APK static validation...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\validate_apk.ps1" -ApkPath "%ROOT%\build\android\XE_RC_FPV_V18.apk" -ExpectedVersionCode "18" -ExpectedVersionName "18.0.0"
if errorlevel 1 (
  echo [FAIL] APK validation failed.
  exit /b 1
)

echo [PASS] Android APK exported and verified:
echo        %ROOT%\build\android\XE_RC_FPV_V18.apk
exit /b 0
