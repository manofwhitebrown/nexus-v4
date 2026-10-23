#!/usr/bin/env bash
# Builds nexus.apk without Gradle.
# Needs: JDK 17+, aapt, apksigner, zipalign, dalvik-exchange
#   sudo apt-get install -y openjdk-21-jdk-headless aapt apksigner zipalign dalvik-exchange
# Output: android/build/nexus.apk, signed with android/debug.keystore so new versions install over old ones.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
B=build
VERSION_CODE="${VERSION_CODE:-$(date +%y%m%d%H)}"
VERSION_NAME="${VERSION_NAME:-4.0.$VERSION_CODE}"
JAR="${ANDROID_JAR:-$HOME/.cache/nexus/android-34.jar}"

if [ ! -s "$JAR" ]; then
  mkdir -p "$(dirname "$JAR")"
  curl -fsSL -o "$JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
fi

rm -rf "$B"; mkdir -p "$B/assets/icons" "$B/assets/fonts" "$B/gen" "$B/classes" "$B/res"
# The whole web app is bundled, so Nexus works offline inside the Android app.
cp "$ROOT"/*.html "$ROOT"/*.js "$ROOT"/*.css "$ROOT"/*.webmanifest "$B/assets/"
cp "$ROOT"/icons/* "$B/assets/icons/"
cp "$ROOT"/fonts/* "$B/assets/fonts/"
cp -r res/* "$B/res/"
for d in mdpi hdpi xhdpi xxhdpi; do mkdir -p "$B/res/mipmap-$d"; cp "$ROOT/icons/icon-192.png" "$B/res/mipmap-$d/ic_launcher.png"; done
mkdir -p "$B/res/mipmap-xxxhdpi"; cp "$ROOT/icons/icon-512.png" "$B/res/mipmap-xxxhdpi/ic_launcher.png"

aapt package -f -m -J "$B/gen" -M AndroidManifest.xml -S "$B/res" -A "$B/assets" -I "$JAR" \
  --min-sdk-version 24 --target-sdk-version 36 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -F "$B/app.unsigned.apk"
javac --release 8 -encoding UTF-8 -Xlint:-options -cp "$JAR" -d "$B/classes" $(find src "$B/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=24 --output="$B/classes.dex" "$B/classes"
( cd "$B" && aapt add app.unsigned.apk classes.dex >/dev/null )
zipalign -f -p 4 "$B/app.unsigned.apk" "$B/app.aligned.apk"
apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias nexus \
  --out "$B/nexus.apk" "$B/app.aligned.apk"
apksigner verify "$B/nexus.apk"
echo "Built $(pwd)/$B/nexus.apk ($VERSION_NAME)"
