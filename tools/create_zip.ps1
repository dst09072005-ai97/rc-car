Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$rootDir = Split-Path -Parent $PSScriptRoot
$downloadDir = Join-Path $rootDir "download"
if (!(Test-Path $downloadDir)) {
    New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
}

$zipPath = Join-Path $downloadDir "debug_2.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$fileListPath = Join-Path $PSScriptRoot "debug_2_file_list.txt"
$lines = Get-Content $fileListPath

Write-Host "Creating zip: $zipPath..."
$zipArchive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

$count = 0
foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split("`t")
    $fullPath = $parts[0]
    $relPath = $parts[1]
    
    if (Test-Path $fullPath) {
        $entryName = $relPath.Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zipArchive,
            $fullPath,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
        $count++
        if ($count % 250 -eq 0) {
            Write-Host "Added $count / $($lines.Count) files..."
        }
    }
}

$zipArchive.Dispose()

$zipItem = Get-Item $zipPath
$zipSizeMb = [math]::Round($zipItem.Length / 1MB, 2)
Write-Host "SUCCESS! Created $zipPath ($zipSizeMb MB, $count files)"

# Copy to user's Downloads folder as well for maximum convenience
$userDownloads = "C:\Users\ADMIN\Downloads\debug_2.zip"
try {
    Copy-Item $zipPath $userDownloads -Force
    Write-Host "Copied backup to $userDownloads"
} catch {
    Write-Host "Note: Could not copy to C:\Users\ADMIN\Downloads: $_"
}
