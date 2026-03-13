#!/bin/bash
set -e

APP="dist/mac-arm64/Ghostry.app"
DMG="dist/ghostry-1.0.0.dmg"
TMP_DIR="/tmp/ghostry-dmg"
TMP_RW="/tmp/ghostry-rw.dmg"

echo "==> Re-signing app (fix Team ID mismatch)..."
codesign --force --deep -s - "$APP"

echo "==> Creating DMG..."
rm -rf "$TMP_DIR" "$TMP_RW" "$DMG"
mkdir -p "$TMP_DIR/.background"
cp -R "$APP" "$TMP_DIR/"
ln -s /Applications "$TMP_DIR/Applications"
cp build/README.txt "$TMP_DIR/"
cp build/dmg-background.png "$TMP_DIR/.background/background.png"
cp build/dmg-background@2x.png "$TMP_DIR/.background/background@2x.png"

hdiutil create -volname "Ghostry" -srcfolder "$TMP_DIR" -ov -format UDRW "$TMP_RW"
hdiutil attach "$TMP_RW"

# Remove .fseventsd
rm -rf /Volumes/Ghostry/.fseventsd 2>/dev/null || true

# Set Finder layout
/usr/bin/osascript <<'APPLESCRIPT'
tell application "Finder"
    tell disk "Ghostry"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set bounds of container window to {100, 100, 760, 500}
        set theViewOptions to the icon view options of container window
        set arrangement of theViewOptions to not arranged
        set icon size of theViewOptions to 80
        set background picture of theViewOptions to file ".background:background.png"
        set position of item "Ghostry.app" of container window to {480, 170}
        set position of item "Applications" of container window to {180, 170}
        set position of item "README.txt" of container window to {330, 330}
        set position of item ".background" of container window to {900, 900}
        close
        open
        update without registering applications
    end tell
end tell
APPLESCRIPT

sleep 2
hdiutil detach /Volumes/Ghostry
hdiutil convert "$TMP_RW" -format UDZO -o "$DMG"
rm -f "$TMP_RW"

echo "==> DMG ready: $DMG"
