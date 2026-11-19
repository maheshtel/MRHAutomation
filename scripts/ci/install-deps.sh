#!/usr/bin/env bash
# `npm ci` for CI agents that does not break on the XCUITest driver's native
# add-on (@appium/coresim, the simulator control library).
#
# Why: coresim's install script runs `node-gyp-build`. Only an Apple-silicon
# (darwin-arm64) binary ships prebuilt; on an Intel Mac it compiles from source
# with GCC_TREAT_WARNINGS_AS_ERRORS=YES, so any new compiler warning on the
# agent's Xcode fails the whole `npm ci`. Here:
#   1. npm ci with install scripts off (also skips the unused Edge/Firefox
#      driver downloads that WebdriverIO pulls in),
#   2. the scripts that matter are run explicitly (esbuild, appium),
#   3. coresim: use the prebuild when the agent matches it, otherwise compile
#      it with warnings allowed, and print the compiler errors if that fails.
#
#   install-deps.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
log() { echo "[deps] $*"; }
fail() { echo "##vso[task.logissue type=error]$*"; exit 1; }

os="$(uname -s)"
arch="$(uname -m)"
xcode=""
if [[ "$os" == Darwin ]]; then xcode=", $(xcodebuild -version 2>/dev/null | sed -n 1p)"; fi
log "Agent: $os $arch, node $(node -v)$xcode"

npm ci --no-audit --no-fund --prefer-offline --ignore-scripts --loglevel=error
npm rebuild esbuild appium --foreground-scripts

[[ "$os" == Darwin ]] || { log "Not macOS — the iOS add-on is not needed"; exit 0; }
[[ "${SKIP_IOS_ADDON:-}" != true ]] || { log "Android run — the iOS add-on is not needed"; exit 0; }

prebuild_arch="$arch"
[[ "$arch" == x86_64 ]] && prebuild_arch=x64

while IFS= read -r dir; do
  if compgen -G "$dir/prebuilds/darwin-$prebuild_arch/*.node" >/dev/null; then
    log "coresim: using the prebuilt darwin-$prebuild_arch binary ($dir)"
    continue
  fi
  log "coresim: no darwin-$prebuild_arch prebuild — compiling from source (warnings allowed)"
  sed -i '' 's/"GCC_TREAT_WARNINGS_AS_ERRORS": "YES"/"GCC_TREAT_WARNINGS_AS_ERRORS": "NO"/' "$dir/binding.gyp"
  build_log="logs/coresim-build.log"
  mkdir -p logs
  if ! (cd "$dir" && npm run install --foreground-scripts) >"$build_log" 2>&1; then
    grep -E "error:|Error:|gyp ERR" "$build_log" | sed -n 1,40p || tail -60 "$build_log"
    fail "Building @appium/coresim failed on a $arch Mac — see the lines above. An Apple-silicon (arm64) agent would use the prebuilt binary instead."
  fi
  compgen -G "$dir/build/Release/*.node" >/dev/null || fail "coresim compiled but produced no .node file"
  log "coresim: compiled ($dir/build/Release)"
done < <(find node_modules -type d -path '*node_modules/@appium/coresim' -prune)
