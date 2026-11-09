# ==============================================================================
# TỰ ĐỘNG GIA HẠN CHỨNG CHỈ LET'S ENCRYPT DUCKDNS
# Chạy script này bất kỳ lúc nào để kiểm tra và gia hạn trước khi hết hạn
# ==============================================================================

$FullDomain = "vr-cam-fpv.duckdns.org"

try {
    Import-Module Posh-ACME -ErrorAction Stop
    $renewResult = Submit-Renewal -Domain $FullDomain -ErrorAction SilentlyContinue
    if ($renewResult) {
        Copy-Item $renewResult.FullChainFile "tools\cert.pem" -Force
        Copy-Item $renewResult.KeyFile "tools\key.pem" -Force
        Write-Host "✅ Đã gia hạn chứng chỉ thành công cho $FullDomain!" -ForegroundColor Green
    } else {
        $cert = Get-PACertificate -Domain $FullDomain
        Write-Host "ℹ️ Chứng chỉ hiện tại vẫn còn hạn: $($cert.ValidTo)" -ForegroundColor Cyan
    }
} catch {
    Write-Warning "Lỗi gia hạn: $($_.Exception.Message)"
}
