#!/usr/bin/env bash
# Download the app under test into apps/ and export its path to the pipeline.
#
#   download-app.sh android <apk-url>       -> apps/app-under-test.apk
#   download-app.sh ios     <app-zip-url>   -> apps/ios/<Name>.app (unzipped)
#
# Private blob container? Put a read-only SAS token in the secret variable
# APP_SAS_TOKEN (with or without the leading "?"); it is appended to the URL
# and never printed.
#
# Exports ANDROID_APP_PATH or IOS_APP_PATH (absolute) as pipeline variables.
set -euo pipefail

platform="${1:?platform (android|ios) required}"
url="${2:?app URL required}"

suite_dir="$(cd "$(dirname "$0")/../.." && pwd)"
apps_dir="$suite_dir/apps"
mkdir -p "$apps_dir"

log() { echo "[download-app] $*"; }

token="${APP_SAS_TOKEN:-}"
# A token pasted into the Library with a stray space / newline breaks the URL.
token="$(printf '%s' "$token" | tr -d '[:space:]')"
token="${token#\?}"
# An undefined pipeline variable arrives literally as "$(APP_SAS_TOKEN)".
[[ "$token" == '$('* ]] && token=""
download_url="$url"
if [[ -n "$token" ]]; then
  [[ "$url" == *\?* ]] && download_url="$url&$token" || download_url="$url?$token"
fi

fetch() {
  # --retry-all-errors also retries on transient 5xx / connection resets.
  curl --fail --silent --show-error --location \
    --retry 4 --retry-delay 3 --retry-all-errors --connect-timeout 30 \
    --output "$1" "$download_url"
}

# Why a download failed, in words: asks the server once more for the status
# and Azure's error text (the token stays in the URL, never printed). Runs
# only after a failed download, so a working one is unaffected.
explain_download_failure() {
  local status
  status="$(curl --silent --head --location --connect-timeout 30 "$download_url" 2>/dev/null \
    | tr -d '\r' | grep -E '^HTTP/' | tail -1)"
  log "Server answered: ${status:-no response} (SAS token supplied: $([[ -n "$token" ]] && echo yes || echo no))"
  local hint
  case "$status" in
    *" 409 "*Public\ access*) hint="This storage account allows no anonymous downloads. Put a read SAS token for it in the secret variable APP_SAS_TOKEN (variable group mrh-e2e)." ;;
    *" 403 "*) hint="The storage account rejected the request: APP_SAS_TOKEN is wrong, expired, lacks Read, belongs to another storage account, or was made for one file only (sr=b, e.g. Generate SAS on mrh.apk), which works for no other file: use a container SAS (sr=c) on the container (or the account may be disabled — see the text above)." ;;
    *" 404 "*) hint="No such file: check the container and file name in the URL parameter." ;;
    *) hint="See the server answer above." ;;
  esac
  echo "##vso[task.logissue type=error]App download failed: ${status%.}. $hint"
}

start=$(date +%s)
log "Downloading $url"

if [[ "$platform" == android ]]; then
  target="$apps_dir/app-under-test.apk"
  fetch "$target" || { explain_download_failure; exit 1; }
  # An APK is a zip: "PK" magic bytes. Catches HTML error pages saved as .apk.
  [[ "$(head -c 2 "$target")" == PK ]] || { log "Downloaded file is not an APK"; exit 1; }
  echo "##vso[task.setvariable variable=ANDROID_APP_PATH]$target"
else
  archive="$(mktemp -d)/app.zip"
  fetch "$archive" || { explain_download_failure; exit 1; }
  extract_dir="$apps_dir/ios"
  rm -rf "$extract_dir" && mkdir -p "$extract_dir"
  # ditto keeps the bundle's symlinks and permissions intact (unzip can break
  # framework symlinks); unzip is the fallback off macOS.
  if command -v ditto >/dev/null; then
    ditto -x -k "$archive" "$extract_dir"
  else
    unzip -q "$archive" -d "$extract_dir"
  fi
  rm -f "$archive"

  # The bundle name varies (e.g. "MountainRose 3.app"), so find it.
  target="$(find "$extract_dir" -maxdepth 3 -type d -name '*.app' -not -path '*/__MACOSX/*' | sed -n 1p)"
  [[ -n "$target" ]] || { log "No .app bundle inside the zip"; exit 1; }

  # A device (iPhoneOS) build cannot be installed on a simulator.
  if command -v plutil >/dev/null; then
    platform_name="$(plutil -extract CFBundleSupportedPlatforms.0 raw -o - "$target/Info.plist" 2>/dev/null || true)"
    if [[ -n "$platform_name" && "$platform_name" != iPhoneSimulator ]]; then
      log "##vso[task.logissue type=error]$target is a '$platform_name' build. Simulators need an iPhoneSimulator build (EAS: \"ios\": { \"simulator\": true })."
      exit 1
    fi
  fi
  echo "##vso[task.setvariable variable=IOS_APP_PATH]$target"
fi

size=$(du -sh "$target" | cut -f1)
log "Ready: $target ($size, $(( $(date +%s) - start ))s)"
