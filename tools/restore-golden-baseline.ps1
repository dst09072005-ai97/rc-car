# PowerShell Restore Script for Golden Baseline V190 (2026-10-19)
$backupDir = "$PSScriptRoot\..\backups\golden_baseline_stable_v190_20261019"
$rootDir = "$PSScriptRoot\.."

Write-Host "🔄 Đang khôi phục Golden Baseline từ $backupDir ..." -ForegroundColor Cyan

Copy-Item "$backupDir\www\app.js" "$rootDir\www\app.js" -Force
Copy-Item "$backupDir\www\youtube-dom-extractor.js" "$rootDir\www\youtube-dom-extractor.js" -Force
Copy-Item "$backupDir\www\index.html" "$rootDir\www\index.html" -Force
Copy-Item "$backupDir\server\server.js" "$rootDir\server\server.js" -Force
Copy-Item "$backupDir\AndroidManifest.xml" "$rootDir\android\app\src\main\AndroidManifest.xml" -Force
Copy-Item "$backupDir\android\res\xml\config.xml" "$rootDir\android\app\src\main\res\xml\config.xml" -Force
Copy-Item "$backupDir\android\res\xml\file_paths.xml" "$rootDir\android\app\src\main\res\xml\file_paths.xml" -Force
Copy-Item "$backupDir\android\res\values\strings.xml" "$rootDir\android\app\src\main\res\values\strings.xml" -Force
Copy-Item "$backupDir\android\res\values\styles.xml" "$rootDir\android\app\src\main\res\values\styles.xml" -Force

Copy-Item "$backupDir\www\app.js" "$rootDir\android\app\src\main\assets\public\app.js" -Force
Copy-Item "$backupDir\www\youtube-dom-extractor.js" "$rootDir\android\app\src\main\assets\public\youtube-dom-extractor.js" -Force
Copy-Item "$backupDir\www\index.html" "$rootDir\android\app\src\main\assets\public\index.html" -Force

node "$rootDir\tools\xr-doctor.js"
Write-Host "✅ Khôi phục thành công Golden Baseline V190!" -ForegroundColor Green
