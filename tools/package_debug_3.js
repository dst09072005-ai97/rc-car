const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('[DEBUG_3 PACKAGER] Bắt đầu quét mã nguồn đóng gói debug_3.zip...');

const rootDir = path.resolve(__dirname, '..');
const downloadDir = path.join(rootDir, 'download');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

const targetZipPath = path.join(downloadDir, 'debug_3.zip');
const adminDownloadsPath = path.join('C:\\Users\\ADMIN\\Downloads', 'debug_3.zip');

const excludeDirs = new Set([
  'node_modules',
  '.git',
  '.gradle',
  'build',
  'intermediates',
  'backups',
  'backup_v17_pre_v18',
  'download',
  'meta_quest_3',
  'oculus-go-adb-driver-2.0',
  '.kiln',
  '.serena',
  '.codegraph',
  '__pycache__',
  '.idea',
  '.vscode'
]);

const excludeExts = new Set([
  '.apk',
  '.aab',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.aar',
  '.jar',
  '.class',
  '.wasm',
  '.pem',
  '.key',
  '.crt',
  '.blend1',
  '.glb',
  '.gltf',
  '.bin',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg'
]);

const includeExts = new Set([
  '.java',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.css',
  '.xml',
  '.json',
  '.gradle',
  '.properties',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.py',
  '.ino',
  '.cpp',
  '.c',
  '.h',
  '.txt',
  '.svg',
  '.md',
  '.gd'
]);

const collectedFiles = [];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) {
        continue;
      }
      walk(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (excludeExts.has(ext)) {
        continue;
      }
      if (includeExts.has(ext) || entry.name === 'Dockerfile' || entry.name === '.gitignore') {
        const stats = fs.statSync(fullPath);
        // Bỏ qua các file rác hoặc file quá 5MB
        if (stats.size > 5 * 1024 * 1024) continue;
        collectedFiles.push({
          fullPath,
          relPath,
          size: stats.size
        });
      }
    }
  }
}

walk(rootDir);

console.log(`[DEBUG_3 PACKAGER] Tìm thấy ${collectedFiles.length} file mã nguồn hợp lệ.`);
const totalRawBytes = collectedFiles.reduce((acc, f) => acc + f.size, 0);
console.log(`[DEBUG_3 PACKAGER] Tổng dung lượng thô: ${(totalRawBytes / (1024 * 1024)).toFixed(2)} MB.`);

// Lưu danh sách file phục vụ PowerShell Zip
const fileListPath = path.join(__dirname, 'debug_3_file_list.txt');
const fileListContent = collectedFiles.map(f => `${f.fullPath}\t${f.relPath}`).join('\n');
fs.writeFileSync(fileListPath, fileListContent, 'utf8');

console.log('[DEBUG_3 PACKAGER] Đang tiến hành nén ZIP...');

const psScript = `
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = "${targetZipPath.replace(/\\/g, '\\\\')}"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$lines = Get-Content "${fileListPath.replace(/\\/g, '\\\\')}"
$zipArchive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

$count = 0
foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split("\`t")
    $full = $parts[0]
    $rel = $parts[1]
    if (Test-Path $full) {
        $entryName = $rel.Replace("\\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $full, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $count++
    }
}
$zipArchive.Dispose()

$targetAdmin = "${adminDownloadsPath.replace(/\\/g, '\\\\')}"
try {
    Copy-Item $zipPath $targetAdmin -Force
    Write-Host "COPIED_TO_DOWNLOADS: OK"
} catch {
    Write-Host "COPIED_TO_DOWNLOADS: FAIL: $_"
}
`;

fs.writeFileSync(path.join(__dirname, 'create_zip_3.ps1'), psScript, 'utf8');

try {
  const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(__dirname, 'create_zip_3.ps1')}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  console.log(out.trim());
} catch (err) {
  console.error('[DEBUG_3 PACKAGER] Lỗi khi chạy PowerShell nén zip:', err.message);
  process.exit(1);
}

const statsZip = fs.statSync(targetZipPath);
console.log(`[DEBUG_3 PACKAGER] ✅ Đã tạo thành công debug_3.zip: ${(statsZip.size / (1024 * 1024)).toFixed(2)} MB`);
console.log(`[DEBUG_3 PACKAGER] 📍 Vị trí 1: ${targetZipPath}`);
if (fs.existsSync(adminDownloadsPath)) {
  const statsAdmin = fs.statSync(adminDownloadsPath);
  console.log(`[DEBUG_3 PACKAGER] 📍 Vị trí 2 (Thư mục Download của bạn): ${adminDownloadsPath} (${(statsAdmin.size / (1024 * 1024)).toFixed(2)} MB)`);
}
