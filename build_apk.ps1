param(
    [string]$OutputApkName = 'XE_RC_FPV_V17.apk'
)

$ErrorActionPreference = 'Continue'
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host 'BAT DAU MO FIREWALL, BUILD APK VA KHOI CHAY SERVER V125' -ForegroundColor Green
Write-Host '==============================================================' -ForegroundColor Cyan

# 1. Tu dong mo khoa Windows Firewall cho cong 8080, 8443, 4210
Write-Host '[1/5] Dang mo cong ket noi 8080, 8443, 4210 tren Windows Firewall...' -ForegroundColor Yellow
try {
    netsh advfirewall firewall delete rule name='RollsRoyceVR_Ports' *> $null
    netsh advfirewall firewall add rule name='RollsRoyceVR_Ports' dir=in action=allow protocol=TCP localport=8080,8443 profile=any *> $null
    netsh advfirewall firewall add rule name='RollsRoyceVR_UDP' dir=in action=allow protocol=UDP localport=4210 profile=any *> $null
} catch {}

# 2. Lay dia chi IP Wi-Fi LAN that (192.168.x.x)
$WifiIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -match 'Wi-Fi|WLAN|Wireless|Ethernet' -and
    $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Tailscale' -and
    $_.IPAddress -match '^(192\.168|10\.|172\.)'
} | Select-Object -First 1).IPAddress

if (-not $WifiIp) {
    $WifiIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -match '^192\.168\.'
    } | Select-Object -First 1).IPAddress
}
if (-not $WifiIp) { $WifiIp = 'localhost' }

# 3. Dong bo ma nguon va Build ghi de APK
if (Test-Path "$RootDir\android\gradlew.bat") {
    Write-Host '[2/5] Dang dong bo tai nguyen Web vao Android...' -ForegroundColor Yellow
    if (Test-Path "$RootDir\node_modules\.bin\cap.cmd") {
        & "$RootDir\node_modules\.bin\cap.cmd" copy android
    } elseif (Test-Path "$RootDir\android\app\src\main\assets\public") {
        Copy-Item -Path "$RootDir\www\*" -Destination "$RootDir\android\app\src\main\assets\public\" -Recurse -Force
    }

    Write-Host "[3/5] Dang bien dich APK moi va ghi de $OutputApkName..." -ForegroundColor Yellow
    Push-Location "$RootDir\android"
    .\gradlew.bat assembleDebug
    Pop-Location

    $BuiltApk = "$RootDir\android\app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $BuiltApk) {
        Copy-Item -Path $BuiltApk -Destination "$RootDir\$OutputApkName" -Force
        Write-Host "DA GHI DE THANH CONG: $RootDir\$OutputApkName" -ForegroundColor Green
    }
}

# 4. Cai de APK qua ADB neu kinh Quest 3 dang cam cap
$AdbCmd = Get-Command adb -ErrorAction SilentlyContinue
if ($AdbCmd -and (Test-Path "$RootDir\$OutputApkName")) {
    $Devices = & adb devices | Select-String "\tdevice$"
    if ($Devices) {
        Write-Host "[4/5] Dang cai de $OutputApkName len kinh Meta Quest 3..." -ForegroundColor Cyan
        & adb install -r -d "$RootDir\$OutputApkName"
    }
}

# Hien thi ma QR truc quan tren terminal
node tools/show_qr.js

# 5. Khoi chay Node Server
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "[5/5] Dang khoi chay Server tai IP Wi-Fi LAN: $WifiIp..." -ForegroundColor Yellow

$ServerDir = if (Test-Path "$RootDir\server\server.js") { "$RootDir\server" } else { $RootDir }
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$ServerDir'; node server.js"

Start-Sleep -Seconds 2

$WebUrl       = 'http://' + $WifiIp + ':8080'
$MobileLanUrl = 'http://' + $WifiIp + ':8080/?mode=passenger_mobile'
$QuestVrUrl   = 'https://' + $WifiIp + ':8443/?vr=immersive'
$QuestHttpUrl = 'http://' + $WifiIp + ':8080/?vr=immersive'

Write-Host ''
Write-Host '======================================================================' -ForegroundColor Green
Write-Host ("1. WEB PC (16:9):                         " + $WebUrl) -ForegroundColor Cyan
Write-Host ("2. MA QR DIEN THOAI GHE PHU (WI-FI LAN):  " + $MobileLanUrl) -ForegroundColor Yellow
Write-Host ("3. KINH META QUEST 3 (HTTPS WebXR):       " + $QuestVrUrl) -ForegroundColor Magenta
Write-Host ("4. KINH META QUEST 3 (HTTP Du Phong):     " + $QuestHttpUrl) -ForegroundColor Green
Write-Host '======================================================================' -ForegroundColor Green

# Tu dong tao duong dan HTTPS chinh chu Cloudflare (Co chung chi SSL hop le 100% tren Chrome, khong bao gio bao Web khong an toan!)
$CloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($CloudflaredCmd) {
    Write-Host '[Cloudflare] Dang tao duong dan HTTPS chinh chu (Khong canh bao Chrome)...' -ForegroundColor Cyan
    Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cloudflared tunnel --url http://localhost:8080'
}


