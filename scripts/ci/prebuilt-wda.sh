#!/usr/bin/env bash
# Fetch Appium's prebuilt WebDriverAgentRunner for iOS simulators (matching the
# installed xcuitest driver) so sessions skip the 3-5 min xcodebuild compile.
#
#   prebuilt-wda.sh <outdir>
#
# Exports IOS_PREBUILT_WDA_PATH. If the download fails the variable is left
# unset and Appium falls back to building WDA itself (slower, still works).
set -uo pipefail

outdir="${1:?output directory required}"
suite_dir="$(cd "$(dirname "$0")/../.." && pwd)"

log() { echo "[wda] $*"; }

find_runner() { find "$outdir" -maxdepth 3 -type d -name 'WebDriverAgentRunner*.app' 2>/dev/null | head -1; }

runner="$(find_runner)"
if [[ -z "$runner" ]]; then
  script="$suite_dir/node_modules/appium-xcuitest-driver/scripts/download-wda.mjs"
  if [[ ! -f "$script" ]]; then
    log "##vso[task.logissue type=warning]$script not found; Appium will build WDA itself"
    exit 0
  fi
  log "Downloading prebuilt simulator WDA"
  mkdir -p "$outdir"
  if ! node "$script" --outdir "$outdir" --platform iOS --kind sim; then
    log "##vso[task.logissue type=warning]Prebuilt WDA download failed; Appium will build WDA itself"
    exit 0
  fi
  runner="$(find_runner)"
else
  log "Using cached prebuilt WDA"
fi

if [[ -n "$runner" ]]; then
  log "WDA: $runner"
  echo "##vso[task.setvariable variable=IOS_PREBUILT_WDA_PATH]$runner"
else
  log "##vso[task.logissue type=warning]No WebDriverAgentRunner .app in $outdir; Appium will build WDA itself"
fi
