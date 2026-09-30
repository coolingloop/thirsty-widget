#!/bin/sh
# Build and smoke-test the Mac app on a Mac (Apple Silicon or Intel): sh build-mac.sh
# Output: dist/THIRSTY-mac-arm64.dmg, dist/THIRSTY-mac-x64.dmg and matching zips, ad-hoc signed.
set -e
cd "$(dirname "$0")"
npm ci
npm test
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --publish never
codesign --verify --deep --strict dist/mac-arm64/THIRSTY.app
node test/smoke-packaged.js
ls -la dist/*.dmg dist/*.zip
