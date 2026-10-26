#!/usr/bin/env bash
set -e

echo "1. Đóng gói mã nguồn thành file RollsRoyce_VR_Quest3_Simulator.zip..."
zip -r RollsRoyce_VR_Quest3_Simulator.zip blender_scripts www capacitor.config.json package.json || true

echo "2. Khởi tạo dự án Android APK cho Meta Quest 3..."
npm install
npx cap add android || true
npx cap sync android

echo "3. Biên dịch file APK..."
cd android && ./gradlew assembleDebug
echo "Hoàn tất! File APK nằm tại: android/app/build/outputs/apk/debug/app-debug.apk"
echo "Cài vào kính Meta Quest 3 bằng lệnh: adb install -r android/app/build/outputs/apk/debug/app-debug.apk"
