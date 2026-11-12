#!/usr/bin/env bash
# iOS simulator for CI, split in two so the boot overlaps with other pipeline
# work (dependency install, app and WebDriverAgent download):
#
#   ios-simulator.sh start "<device name>" [ios-version]   pick/create the simulator, start booting it
#   ios-simulator.sh wait                                   block until booted, tune it for automation
#   ios-simulator.sh stop
#
# With no version, the newest installed iOS runtime is used.
# `start` exports IOS_UDID, IOS_PLATFORM_VERSION and IOS_DEVICE_NAME.
set -euo pipefail

cmd="${1:?start|wait|stop}"

log() { echo "[simulator] $*"; }
fail() { echo "##vso[task.logissue type=error]$*"; exit 1; }

# Pipeline variables set by `start` reach later steps as environment variables.
udid_from_env() {
  [[ -n "${IOS_UDID:-}" && "${IOS_UDID}" != '$('* ]] || fail "IOS_UDID is not set — run 'ios-simulator.sh start' first"
  echo "$IOS_UDID"
}

start() {
  local device_name="${2:-iPhone 16}"
  local requested_version="${3:-}"

  local runtime runtime_id runtime_version udid
  runtime="$(xcrun simctl list runtimes --json | WANT="$requested_version" node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const all = JSON.parse(s).runtimes.filter((r) => r.isAvailable && r.platform === "iOS");
      const want = process.env.WANT;
      const byVersion = (a, b) => a.version.localeCompare(b.version, undefined, { numeric: true });
      const pick = want
        ? all.find((r) => r.version === want || r.version.startsWith(want + "."))
        : all.sort(byVersion).pop();
      if (!pick) {
        console.error("No matching iOS runtime. Installed: " + all.map((r) => r.version).join(", "));
        process.exit(1);
      }
      console.log(pick.identifier + "|" + pick.version);
    });
  ')"
  runtime_id="${runtime%%|*}"
  runtime_version="${runtime##*|}"
  log "Runtime: $runtime_id (iOS $runtime_version)"

  udid="$(xcrun simctl list devices "$runtime_id" --json | DEVICE="$device_name" node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const devices = Object.values(JSON.parse(s).devices).flat();
      const d = devices.find((x) => x.name === process.env.DEVICE && x.isAvailable);
      console.log(d ? d.udid : "");
    });
  ')"

  if [[ -z "$udid" ]]; then
    local device_type
    device_type="$(xcrun simctl list devicetypes --json | DEVICE="$device_name" node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const t = JSON.parse(s).devicetypes.find((x) => x.name === process.env.DEVICE);
        if (!t) { console.error("Unknown device type: " + process.env.DEVICE); process.exit(1); }
        console.log(t.identifier);
      });
    ')"
    log "Creating simulator '$device_name'"
    udid="$(xcrun simctl create "$device_name" "$device_type" "$runtime_id")"
  fi

  # Must be set before boot: XCUITest types through the software keyboard,
  # which a connected hardware keyboard hides.
  defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false || true

  log "Booting $device_name ($udid) in the background"
  # simctl boot returns once the boot has started; `wait` blocks on bootstatus.
  # No Simulator.app window is opened (headless).
  xcrun simctl boot "$udid" 2>/dev/null || true

  echo "##vso[task.setvariable variable=IOS_UDID]$udid"
  echo "##vso[task.setvariable variable=IOS_PLATFORM_VERSION]$runtime_version"
  echo "##vso[task.setvariable variable=IOS_DEVICE_NAME]$device_name"
}

wait_ready() {
  local udid start_ts
  udid="$(udid_from_env)"
  start_ts=$(date +%s)
  xcrun simctl bootstatus "$udid" -b >/dev/null
  log "Booted (waited $(( $(date +%s) - start_ts ))s)"

  # Automation-friendly simulator: reduced motion (shorter animations), no
  # keyboard onboarding / predictive bar, no autocorrect rewriting typed text.
  xcrun simctl spawn "$udid" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true || true
  xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool true || true
  xcrun simctl spawn "$udid" defaults write com.apple.Preferences KeyboardAutocorrection -bool false || true
  xcrun simctl spawn "$udid" defaults write com.apple.Preferences KeyboardPrediction -bool false || true
  xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 || true

  log "Ready: $udid"
}

case "$cmd" in
  start) start "$@" ;;
  wait) wait_ready ;;
  stop) xcrun simctl shutdown all >/dev/null 2>&1 || true ;;
  *) fail "Unknown command '$cmd' (start|wait|stop)" ;;
esac
