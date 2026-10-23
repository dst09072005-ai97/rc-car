[CmdletBinding()]
param(
    [string]$ApkPath = "$PSScriptRoot\..\build\android\XE_RC_FPV_V18.apk",
    [string]$ExpectedPackage = "com.xercfpv.v10",
    [string]$ExpectedVersionCode = "18",
    [string]$ExpectedVersionName = "18.0.0"
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message, [int]$Code = 1) {
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    exit $Code
}

function Pass([string]$Message) {
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

Write-Host "=== VALIDATING APK: $ApkPath ==="

# 1. Assert APK file exists and is not empty
if (-not (Test-Path -LiteralPath $ApkPath)) {
    Fail "Target APK file does not exist: $ApkPath" 1
}

$apkItem = Get-Item -LiteralPath $ApkPath
if ($apkItem.Length -le 1000000) {
    Fail "Target APK file is unexpectedly small ($($apkItem.Length) bytes): $ApkPath" 1
}
Pass "APK file exists: $($apkItem.FullName) ($([Math]::Round($apkItem.Length / 1MB, 2)) MB)"

# 2. Locate aapt.exe in Android SDK
$androidHome = $env:ANDROID_HOME
if ([string]::IsNullOrWhiteSpace($androidHome)) { $androidHome = $env:ANDROID_SDK_ROOT }
if ([string]::IsNullOrWhiteSpace($androidHome)) { $androidHome = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }

$aaptCandidates = Get-ChildItem -Path (Join-Path $androidHome 'build-tools') -Filter 'aapt.exe' -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending

if (-not $aaptCandidates -or $aaptCandidates.Count -eq 0) {
    Fail "aapt.exe not found under $androidHome\build-tools. Android build-tools must be installed." 1
}
$aapt = $aaptCandidates[0].FullName
Pass "Found aapt: $aapt"

# 3. Run aapt dump badging with fail-closed checks
$badgingOutput = & $aapt dump badging $ApkPath 2>&1
$aaptExit = $LASTEXITCODE

if ($aaptExit -ne 0) {
    Fail "aapt dump badging failed with exit code $aaptExit`nOutput: $badgingOutput" 1
}

if ([string]::IsNullOrWhiteSpace($badgingOutput)) {
    Fail "aapt dump badging returned empty/null output. Verification cannot proceed." 1
}

# 4. Parse and verify package metadata
$packageLine = $badgingOutput | Select-String -Pattern "^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'" | Select-Object -First 1
if (-not $packageLine) {
    Fail "Could not parse package declaration line from aapt dump badging output." 1
}

$match = [regex]::Match($packageLine.ToString(), "package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'")
if (-not $match.Success) {
    Fail "Regex match failed on package line: $($packageLine.ToString())" 1
}

$actualPackage = $match.Groups[1].Value
$actualVersionCode = $match.Groups[2].Value
$actualVersionName = $match.Groups[3].Value

Write-Host "Detected Package:     $actualPackage"
Write-Host "Detected VersionCode: $actualVersionCode"
Write-Host "Detected VersionName: $actualVersionName"

if ($actualPackage -ne $ExpectedPackage) {
    Fail "Package mismatch! Expected '$ExpectedPackage', got '$actualPackage'" 1
}
Pass "Package name matches: $actualPackage"

if ($actualVersionCode -ne $ExpectedVersionCode) {
    Fail "VersionCode mismatch! Expected '$ExpectedVersionCode', got '$actualVersionCode'" 1
}
Pass "VersionCode matches: $actualVersionCode"

if ($actualVersionName -ne $ExpectedVersionName) {
    Fail "VersionName mismatch! Expected '$ExpectedVersionName', got '$actualVersionName'" 1
}
Pass "VersionName matches: $actualVersionName"

# 5. Verify required OpenXR native libraries in arm64-v8a
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkItem.FullName)
try {
    $entryNames = $zip.Entries | ForEach-Object { $_.FullName }

    $requiredLibs = @(
        "lib/arm64-v8a/libopenxr_loader.so",
        "lib/arm64-v8a/libgodotopenxrvendors.so"
    )

    foreach ($lib in $requiredLibs) {
        if ($entryNames -contains $lib) {
            Pass "Found native library: $lib"
        } else {
            Fail "Required native library missing from APK: $lib" 1
        }
    }

    $hasActionMap = $entryNames | Where-Object { $_ -like "*openxr_action_map*" }
    if ($hasActionMap) {
        Pass "Found OpenXR action map in APK: $($hasActionMap[0])"
    } else {
        Fail "OpenXR action map resource missing from APK assets." 1
    }
} finally {
    $zip.Dispose()
}

Write-Host "=== ALL STATIC APK CHECKS PASSED FOR V$ExpectedVersionCode ($ExpectedVersionName) ===" -ForegroundColor Green
exit 0
