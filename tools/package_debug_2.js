const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

console.log('[DEBUG_2 PACKAGER] Bắt đầu chuẩn bị đóng gói debug_2.zip...');

const rootDir = path.resolve(__dirname, '..');
const downloadDir = path.join(rootDir, 'download');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

const targetZipPath = path.join(downloadDir, 'debug_2.zip');
const adminDownloadsPath = path.join('C:\\Users\\ADMIN\\Downloads', 'debug_2.zip');

const excludeDirs = new Set([
  'node_modules',
  '.git',
  '.kiln',
  '.serena',
  '.pytest_cache',
  'build',
  'backups',
  'backup_v17_pre_v18',
  'oculus-go-adb-driver-2.0',
  'download'
]);

const includeExts = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.xml',
  '.json',
  '.css',
  '.md',
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
  '.txt'
]);

const collectedFiles = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
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
      if (includeExts.has(ext)) {
        collectedFiles.push({
          fullPath,
          relPath,
          size: fs.statSync(fullPath).size
        });
      }
    }
  }
}

walk(rootDir);

console.log(`[DEBUG_2 PACKAGER] Tìm thấy ${collectedFiles.length} file mã nguồn hợp lệ (xml, html, js, json, css, md, v.v.).`);

let totalRawBytes = collectedFiles.reduce((acc, f) => acc + f.size, 0);
console.log(`[DEBUG_2 PACKAGER] Tổng dung lượng chưa nén: ${(totalRawBytes / (1024 * 1024)).toFixed(2)} MB.`);

// Sử dụng PowerShell System.IO.Compression.ZipFile qua danh sách file để tạo zip chuẩn Windows/Quest/Linux
const fileListPath = path.join(__dirname, 'debug_2_file_list.txt');
const fileListContent = collectedFiles.map(f => `${f.fullPath}\t${f.relPath}`).join('\n');
fs.writeFileSync(fileListPath, fileListContent, 'utf8');

console.log(`[DEBUG_2 PACKAGER] Đã lập danh sách file tại: ${fileListPath}`);
