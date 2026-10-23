const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== ENVIRONMENT AUDIT FOR MILESTONE 3 ===');

const blenderPaths = [
  'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
  'C:\\Program Files (x86)\\Blender Foundation\\Blender\\blender.exe',
  'D:\\Blender\\blender.exe'
];

let foundBlender = null;
for (const p of blenderPaths) {
  if (fs.existsSync(p)) {
    foundBlender = p;
    break;
  }
}

if (!foundBlender) {
  try {
    const whereOut = execSync('where blender', { encoding: 'utf-8' }).trim();
    if (whereOut) foundBlender = whereOut.split(/\r?\n/)[0].trim();
  } catch(e) {}
}

console.log('Blender executable:', foundBlender || 'NOT FOUND IN COMMON PATHS');

if (foundBlender) {
  try {
    const ver = execSync(`"${foundBlender}" --version`, { encoding: 'utf-8' });
    console.log('Blender Version Output:\n' + ver.trim());
  } catch(e) {
    console.log('Blender version error:', e.message);
  }
}

const godotPath = 'D:\\XE_RC_FPV_V10\\Godot_v4.7.2-stable_win64_console.exe';
console.log('Godot 4.7.2 executable exists:', fs.existsSync(godotPath));

console.log('\n--- Checking Models Directory ---');
const modelsDir = 'D:\\XE_RC_FPV_V10\\models';
if (fs.existsSync(modelsDir)) {
  const files = fs.readdirSync(modelsDir);
  for (const f of files) {
    const stat = fs.statSync(path.join(modelsDir, f));
    console.log(` - ${f} (${stat.size} bytes)`);
  }
} else {
  console.log('models directory not found!');
}

console.log('\n--- Checking Blender Scripts Directory ---');
const scriptsDir = 'D:\\XE_RC_FPV_V10\\blender_scripts';
if (fs.existsSync(scriptsDir)) {
  const files = fs.readdirSync(scriptsDir);
  for (const f of files) {
    const stat = fs.statSync(path.join(scriptsDir, f));
    console.log(` - ${f} (${stat.size} bytes)`);
  }
}

console.log('\n--- Checking Build APKs ---');
const apkDir = 'D:\\XE_RC_FPV_V10\\build\\android';
if (fs.existsSync(apkDir)) {
  const files = fs.readdirSync(apkDir);
  for (const f of files) {
    const stat = fs.statSync(path.join(apkDir, f));
    console.log(` - ${f} (${stat.size} bytes)`);
  }
}

console.log('\n--- Checking Docs Directory ---');
const docsDir = 'D:\\XE_RC_FPV_V10\\docs';
if (fs.existsSync(docsDir)) {
  const files = fs.readdirSync(docsDir);
  for (const f of files) {
    console.log(` - ${f}`);
  }
} else {
  console.log('docs directory does not exist yet. Will create.');
}
