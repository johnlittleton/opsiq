#!/bin/sh
set -e

echo "[OpsIQ] Installing Node dependencies"
npm ci

echo "[OpsIQ] Building web assets"
npm run build:react

echo "[OpsIQ] Syncing Capacitor iOS"
npx cap sync ios

echo "[OpsIQ] Installing CocoaPods"
cd ios/App
pod install
