[CmdletBinding()]
param(
    [switch]$InstallMissing
)
$ErrorActionPreference = 'Stop'

function Fail([string]$Message, [int]$Code = 1) {
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    exit $Code
}

$androidHome = $env:ANDROID_HOME
if ([string]::IsNullOrWhiteSpace($androidHome)) { $androidHome = $env:ANDROID_SDK_ROOT }
if ([string]::IsNullOrWhiteSpace($androidHome)) { $androidHome = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$androidHome = [IO.Path]::GetFullPath($androidHome)

if (-not (Test-Path (Join-Path $androidHome 'platform-tools\adb.exe'))) {
    Fail "Android SDK / platform-tools not found at $androidHome. Install Platform-Tools in Android Studio SDK Manager." 1
}

$javaHome = $env:JAVA_HOME
if ([string]::IsNullOrWhiteSpace($javaHome)) {
    try {
        $javaHomeLine = & java -XshowSettings:properties -version 2>&1 |
            Select-String -Pattern '^\s*java\.home\s*=' | Select-Object -First 1
        if ($javaHomeLine) {
            $javaHome = ($javaHomeLine.ToString() -split '=', 2)[1].Trim()
        }
    } catch {}
}
if ([string]::IsNullOrWhiteSpace($javaHome)) {
    $javac = Get-Command javac -ErrorAction SilentlyContinue
    if ($javac) {
        $candidate = Split-Path $javac.Source -Parent
        $javaHome = Split-Path $candidate -Parent
    }
}
if ([string]::IsNullOrWhiteSpace($javaHome) -or -not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) {
    Fail "JDK 17 path could not be determined. Set JAVA_HOME to the JDK root." 1
}

$settingsDir = Join-Path $env:APPDATA 'Godot'
$settingsPath = Join-Path $settingsDir 'editor_settings-4.7.tres'
New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null

$sdk = $androidHome.Replace('\','/')
$jdk = ([IO.Path]::GetFullPath($javaHome)).Replace('\','/')

if (Test-Path -LiteralPath $settingsPath) {
    $text = [IO.File]::ReadAllText($settingsPath)
} else {
    $text = "[gd_resource type=""EditorSettings"" format=3]`r`n`r`n[resource]`r`n"
}

function Set-GodotSetting([string]$Text, [string]$Key, [string]$Value) {
    $line = "$Key = `"$Value`""
    $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*=.*$'
    if ([regex]::IsMatch($Text, $pattern)) {
        return [regex]::Replace($Text, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line })
    }
    return $Text.TrimEnd("`r","`n") + "`r`n$line`r`n"
}

$text = Set-GodotSetting $text 'export/android/android_sdk_path' $sdk
$text = Set-GodotSetting $text 'export/android/java_sdk_path' $jdk
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($settingsPath, $text, $utf8)

Write-Host "[OK] Godot Android settings configured"
Write-Host "     SDK : $androidHome"
Write-Host "     JDK : $jdk"

$buildTools = Get-ChildItem -Directory (Join-Path $androidHome 'build-tools') -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'apksigner.bat') } |
    Sort-Object Name -Descending | Select-Object -First 1

$sdkManager = Join-Path $androidHome 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
    $sdkManager = Get-ChildItem -Directory (Join-Path $androidHome 'cmdline-tools') -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'bin\sdkmanager.bat' } |
        Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $buildTools) {
    Write-Host '[MISSING] Android Build-Tools (apksigner)'
    if ($InstallMissing -and $sdkManager) {
        Write-Host '[INFO] Installing Godot 4.7 Android SDK requirements...'
        & $sdkManager --sdk_root=$androidHome 'platform-tools' 'build-tools;35.0.1' 'platforms;android-35' 'cmdline-tools;latest' 'cmake;3.10.2.4988404' 'ndk;28.1.13356709'
        if ($LASTEXITCODE -ne 0) { Fail 'sdkmanager failed. Finish package installation in Android Studio SDK Manager.' 2 }
        $buildTools = Get-ChildItem -Directory (Join-Path $androidHome 'build-tools') -ErrorAction SilentlyContinue |
            Where-Object { Test-Path (Join-Path $_.FullName 'apksigner.bat') } |
            Sort-Object Name -Descending | Select-Object -First 1
    }
}

if (-not $buildTools) {
    Write-Host '[NEXT] Install Android SDK Build-Tools 35.0.1 in Android Studio SDK Manager.'
    exit 2
}

Write-Host "[OK] Build-Tools : $($buildTools.Name)"
Write-Host '[PASS] Android SDK/JDK prerequisites are ready.'
