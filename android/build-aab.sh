#!/usr/bin/env bash
# Builds nexus.aab (Android App Bundle) for Google Play, without Gradle.
# Needs: JDK 17+, aapt2, dalvik-exchange, and bundletool (downloaded on first run).
#   sudo apt-get install -y openjdk-21-jdk-headless aapt dalvik-exchange
#
# Signing comes from environment variables, so no secret is ever stored in the repo:
#   NEXUS_KEYSTORE            path to your upload keystore (.jks / .p12)
#   NEXUS_KEYSTORE_PASSWORD   keystore password
#   NEXUS_KEY_ALIAS           key alias
#   NEXUS_KEY_PASSWORD        key password (defaults to the keystore password)
# Without them the script stops. For a throw-away test build only, set ALLOW_DEBUG_SIGNING=1
# to sign with the public debug keystore. Play will reject (and you must never upload) that file.
#
# Output: android/build/nexus.aab
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
B=build-aab
OUT=build
VERSION_CODE="${VERSION_CODE:-$(date +%y%m%d%H)}"
VERSION_NAME="${VERSION_NAME:-4.0.$VERSION_CODE}"
JAR="${ANDROID_JAR:-$HOME/.cache/nexus/android-34.jar}"
BT_VERSION="${BUNDLETOOL_VERSION:-1.18.2}"
BT="${BUNDLETOOL_JAR:-$HOME/.cache/nexus/bundletool-$BT_VERSION.jar}"

# --- signing: decide before doing any work ---
if [ -n "${NEXUS_KEYSTORE:-}" ]; then
  : "${NEXUS_KEYSTORE_PASSWORD:?Set NEXUS_KEYSTORE_PASSWORD}"
  : "${NEXUS_KEY_ALIAS:?Set NEXUS_KEY_ALIAS}"
  [ -f "$NEXUS_KEYSTORE" ] || { echo "Keystore not found: $NEXUS_KEYSTORE" >&2; exit 1; }
  KS="$NEXUS_KEYSTORE"; KSP="$NEXUS_KEYSTORE_PASSWORD"; KA="$NEXUS_KEY_ALIAS"; KKP="${NEXUS_KEY_PASSWORD:-$NEXUS_KEYSTORE_PASSWORD}"
  SIGNED_WITH="release key"
elif [ "${ALLOW_DEBUG_SIGNING:-}" = "1" ]; then
  KS=debug.keystore; KSP=android; KA=nexus; KKP=android
  SIGNED_WITH="DEBUG key (test only, Play will reject this)"
else
  echo "No release key. Set NEXUS_KEYSTORE, NEXUS_KEYSTORE_PASSWORD and NEXUS_KEY_ALIAS (see top of this file)." >&2
  echo "For a test-only build run: ALLOW_DEBUG_SIGNING=1 bash android/build-aab.sh" >&2
  exit 1
fi

fetch() { # url file
  mkdir -p "$(dirname "$2")"; [ -s "$2" ] || curl -fsSL -o "$2" "$1"
}
fetch https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar "$JAR"
fetch "https://github.com/google/bundletool/releases/download/$BT_VERSION/bundletool-all-$BT_VERSION.jar" "$BT"

rm -rf "$B"; mkdir -p "$B/assets/icons" "$B/assets/fonts" "$B/gen" "$B/classes" "$B/res" "$B/flat" "$OUT"
cp "$ROOT"/*.html "$ROOT"/*.js "$ROOT"/*.css "$ROOT"/*.webmanifest "$B/assets/"
cp "$ROOT"/icons/* "$B/assets/icons/"
cp "$ROOT"/fonts/* "$B/assets/fonts/"
cp -r res/* "$B/res/"
for d in mdpi hdpi xhdpi xxhdpi; do mkdir -p "$B/res/mipmap-$d"; cp "$ROOT/icons/icon-192.png" "$B/res/mipmap-$d/ic_launcher.png"; done
mkdir -p "$B/res/mipmap-xxxhdpi"; cp "$ROOT/icons/icon-512.png" "$B/res/mipmap-xxxhdpi/ic_launcher.png"

# 1. resources -> protobuf format, which bundles need (an APK uses the binary format)
aapt2 compile --dir "$B/res" -o "$B/flat/"
aapt2 link --proto-format -o "$B/base.apk" -I "$JAR" --manifest AndroidManifest.xml \
  -A "$B/assets" --java "$B/gen" --auto-add-overlay \
  --min-sdk-version 24 --target-sdk-version 36 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  "$B"/flat/*.flat

# 2. code
javac --release 8 -encoding UTF-8 -Xlint:-options -cp "$JAR" -d "$B/classes" $(find src "$B/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=24 --output="$B/classes.dex" "$B/classes"

# 3. lay the base module out the way bundletool expects
M="$B/module"; mkdir -p "$M/manifest" "$M/dex"
( cd "$M" && unzip -q ../base.apk )
mv "$M/AndroidManifest.xml" "$M/manifest/AndroidManifest.xml"
cp "$B/classes.dex" "$M/dex/classes.dex"
( cd "$M" && rm -f ../base.zip && zip -qr -X ../base.zip . )

# 4. bundle, then sign
rm -f "$OUT/nexus.aab"
java -jar "$BT" build-bundle --modules="$B/base.zip" --output="$OUT/nexus.aab"
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KS" -storepass "$KSP" -keypass "$KKP" "$OUT/nexus.aab" "$KA" >/dev/null
jarsigner -verify "$OUT/nexus.aab" | head -1
java -jar "$BT" validate --bundle="$OUT/nexus.aab"
echo "Built $(pwd)/$OUT/nexus.aab ($VERSION_NAME), signed with $SIGNED_WITH"
