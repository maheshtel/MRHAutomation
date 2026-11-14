#!/usr/bin/env bash
# Compile WebDriverAgent for iOS simulators ONCE, before the tests, so Appium
# only launches it (`usePrebuiltWDA` → xcodebuild test-without-building).
#
# Why: left to Appium, WDA is compiled inside the first session. On hosted
# macOS agents that compile can outlast wdaLaunchTimeout, and the session dies
# with "We were not able to retrieve the /status response from the
# WebDriverAgent server". Here it runs in its own step, with its own timeout,
# and any compile error lands in the step log and logs/wda-build.log.
#
#   build-wda.sh <derived-data-dir>
#
# Reuses a build restored from the pipeline cache. Exports
# IOS_WDA_DERIVED_DATA_PATH.
set -euo pipefail

out="${1:?derived data directory required}"
suite_dir="$(cd "$(dirname "$0")/../.." && pwd)"
build_log="$suite_dir/logs/wda-build.log"
mkdir -p "$(dirname "$build_log")"

log() { echo "[wda] $*"; }
fail() { echo "##vso[task.logissue type=error]$*"; exit 1; }

# The xcuitest driver ships its own WebDriverAgent copy (version-matched).
project="$(find "$suite_dir/node_modules" -maxdepth 5 -type d \
  -path '*appium-webdriveragent/WebDriverAgent.xcodeproj' | head -1)"
[[ -n "$project" ]] || fail "WebDriverAgent.xcodeproj not found under node_modules (npm ci missing?)"
log "Project: $project"
log "$(xcodebuild -version | tr '\n' ' ')"

if compgen -G "$out/Build/Products/*.xctestrun" >/dev/null; then
  log "Using cached build in $out"
else
  log "Compiling WebDriverAgent (build-for-testing, generic iOS Simulator)…"
  start=$(date +%s)
  if ! xcodebuild build-for-testing \
      -project "$project" \
      -scheme WebDriverAgentRunner \
      -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$out" \
      CODE_SIGNING_ALLOWED=NO \
      COMPILER_INDEX_STORE_ENABLE=NO \
      GCC_TREAT_WARNINGS_AS_ERRORS=NO \
      >"$build_log" 2>&1; then
    grep -E "error:|\*\* BUILD" "$build_log" | tail -40 || tail -60 "$build_log"
    fail "WebDriverAgent build failed — see the lines above and logs/wda-build.log"
  fi
  log "Compiled in $(( $(date +%s) - start ))s"
fi

compgen -G "$out/Build/Products/*.xctestrun" >/dev/null \
  || fail "Build finished but no .xctestrun was produced in $out/Build/Products"
log "Ready: $(ls "$out"/Build/Products/*.xctestrun)"
echo "##vso[task.setvariable variable=IOS_WDA_DERIVED_DATA_PATH]$out"
