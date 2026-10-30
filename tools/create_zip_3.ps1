
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = "D:\\XE_RC_FPV_V10\\download\\debug_3.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$lines = Get-Content "D:\\XE_RC_FPV_V10\\tools\\debug_3_file_list.txt"
$zipArchive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

$count = 0
foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split("`t")
    $full = $parts[0]
    $rel = $parts[1]
    if (Test-Path $full) {
        $entryName = $rel.Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $full, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $count++
    }
}
$zipArchive.Dispose()

$targetAdmin = "C:\\Users\\ADMIN\\Downloads\\debug_3.zip"
try {
    Copy-Item $zipPath $targetAdmin -Force
    Write-Host "COPIED_TO_DOWNLOADS: OK"
} catch {
    Write-Host "COPIED_TO_DOWNLOADS: FAIL: $_"
}
