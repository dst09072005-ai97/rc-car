#!/usr/bin/env node
/**
 * Restore Golden Baseline V190 (2026-10-19)
 * Usage: node tools/restore-golden-baseline.js
 */

const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'golden_baseline_stable_v190_20261019');
const MANIFEST_FILE = path.join(BACKUP_DIR, 'MANIFEST.json');

if (!fs.existsSync(MANIFEST_FILE)) {
  console.error('❌ Không tìm thấy MANIFEST.json trong:', BACKUP_DIR);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
console.log('🔄 Đang khôi phục Golden Baseline:', manifest.baselineName);
console.log('📅 Tạo lúc:', manifest.createdAt);
console.log('📝 Ghi chú:', manifest.description);

// 1. Khôi phục các file chính
const filesToRestore = [
  { src: path.join(BACKUP_DIR, 'www', 'app.js'), dst: path.join(__dirname, '..', 'www', 'app.js') },
  { src: path.join(BACKUP_DIR, 'www', 'youtube-dom-extractor.js'), dst: path.join(__dirname, '..', 'www', 'youtube-dom-extractor.js') },
  { src: path.join(BACKUP_DIR, 'www', 'index.html'), dst: path.join(__dirname, '..', 'www', 'index.html') },
  { src: path.join(BACKUP_DIR, 'server', 'server.js'), dst: path.join(__dirname, '..', 'server', 'server.js') },
  { src: path.join(BACKUP_DIR, 'AndroidManifest.xml'), dst: path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml') },
  { src: path.join(BACKUP_DIR, 'android', 'res', 'xml', 'config.xml'), dst: path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'xml', 'config.xml') },
  { src: path.join(BACKUP_DIR, 'android', 'res', 'xml', 'file_paths.xml'), dst: path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml') },
  { src: path.join(BACKUP_DIR, 'android', 'res', 'values', 'strings.xml'), dst: path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml') },
  { src: path.join(BACKUP_DIR, 'android', 'res', 'values', 'styles.xml'), dst: path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml') }
];

filesToRestore.forEach(({ src, dst }) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  ✔ Khôi phục: ${path.relative(path.join(__dirname, '..'), dst)}`);
  } else {
    console.warn(`  ⚠ Thiếu file sao lưu: ${src}`);
  }
});

// 2. Đồng bộ sang Android assets
const androidAssetsSrc = path.join(BACKUP_DIR, 'android_assets');
const androidAssetsDst = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public');
if (fs.existsSync(androidAssetsSrc) && fs.existsSync(androidAssetsDst)) {
  filesToRestore.forEach(({ src, dst }) => {
    if (dst.includes('www')) {
      const fileName = path.basename(dst);
      const targetAndroidFile = path.join(androidAssetsDst, fileName);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, targetAndroidFile);
        console.log(`  ✔ Đồng bộ Android Asset: ${fileName}`);
      }
    }
  });
}

console.log('✅ Đã khôi phục hoàn tất 100% về phiên bản gốc ổn định!');
