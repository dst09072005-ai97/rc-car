$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$tools = @("node","npm","pio","git","java")
foreach($t in $tools){ if(Get-Command $t -ErrorAction SilentlyContinue){Write-Host "[OK] $t -> $((Get-Command $t).Source)"} else {Write-Host "[MISS] $t"} }
foreach($t in @("adb","godot","tailscale")){ if(Get-Command $t -ErrorAction SilentlyContinue){Write-Host "[OK] $t -> $((Get-Command $t).Source)"} else {Write-Host "[MISS] $t"} }
if(Test-Path ".\config\venue.json"){Write-Host "[WARN] This V10 tree uses controller_godot config, not a provisioning secret."}
Write-Host "[PASS] V10 Windows toolchain check complete."
Pop-Location
