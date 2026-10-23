$ErrorActionPreference = "Stop"
$godotVersion = "4.7+"
$version = "5.1.0-stable"
$url = "https://github.com/GodotVR/godot_openxr_vendors/releases/download/$version/godotopenxrvendorsaddon.zip"
$tmp = Join-Path $env:TEMP "godot-openxr-vendors.zip"
$dest = Join-Path (Split-Path $PSScriptRoot -Parent) "controller_godot"
Write-Host "Downloading OpenXR Vendors $version for Godot $godotVersion..."
Invoke-WebRequest -Uri $url -OutFile $tmp
$extract = Join-Path $env:TEMP "godot-openxr-vendors-v10"
if(Test-Path $extract){Remove-Item $extract -Recurse -Force}
Expand-Archive $tmp $extract -Force
$addons = Get-ChildItem $extract -Recurse -Directory | Where-Object {$_.Name -eq "addons"} | Select-Object -First 1
if(-not $addons){ throw "addons directory not found in vendor package" }
Copy-Item (Join-Path $addons.FullName "*") (Join-Path $dest "addons") -Recurse -Force
Write-Host "[PASS] Installed OpenXR Vendors addon into controller_godot/addons"
