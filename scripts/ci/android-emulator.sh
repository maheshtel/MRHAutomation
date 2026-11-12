#!/usr/bin/env bash
# Headless Android emulator for CI, split in two so the boot overlaps with
# other pipeline work (dependency install, APK download):
#
#   android-emulator.sh start [api-level] [device-profile]   create the AVD, boot it in the background
#   android-emulator.sh wait                                  block until booted, tune it for automation
#   android-emulator.sh install <apk>                         install the app once, permissions granted
#   android-emulator.sh stop
#
# Works on Linux (needs /dev/kvm) and macOS (needs Hypervisor.framework);
# picks the x86_64 or arm64-v8a system image to match the host CPU.
# `wait` exports ANDROID_UDID to the pipeline.
set -euo pipefail

cmd="${1:?start|wait|install|stop}"
api_level="${2:-34}"
device_profile="${3:-pixel_6}"

sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:?ANDROID_HOME or ANDROID_SDK_ROOT must be set}}"
adb="$sdk/platform-tools/adb"
emulator="$sdk/emulator/emulator"
suite_dir="$(cd "$(dirname "$0")/../.." && pwd)"
emulator_log="$suite_dir/logs/emulator.log"
boot_timeout_s="${EMULATOR_BOOT_TIMEOUT:-600}"

log() { echo "[emulator] $*"; }
fail() { echo "##vso[task.logissue type=error]$*"; exit 1; }

# sdkmanager / avdmanager need Java 17+. Hosted images ship several JDKs.
export JAVA_HOME="${JAVA_HOME_17_X64:-${JAVA_HOME_17_arm64:-${JAVA_HOME:-}}}"

case "$(uname -m)" in
  arm64 | aarch64) abi="arm64-v8a" ;;
  *) abi="x86_64" ;;
esac
image="system-images;android-${api_level};google_apis;${abi}"
avd_name="e2e_api${api_level}_${abi}"

sdk_tool() {
  local tool
  tool="$(ls "$sdk"/cmdline-tools/*/bin/"$1" 2>/dev/null | sort | tail -1)"
  [[ -n "$tool" ]] || fail "$1 not found under $sdk/cmdline-tools"
  echo "$tool"
}

start() {
  mkdir -p "$(dirname "$emulator_log")"

  # Hardware acceleration is mandatory: without it the emulator takes 10+ min
  # to boot and is too slow to test on. Fail in seconds instead.
  if [[ "$(uname -s)" == Linux && -e /dev/kvm ]]; then
    echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' \
      | sudo tee /etc/udev/rules.d/99-kvm4all.rules >/dev/null
    sudo udevadm control --reload-rules
    sudo udevadm trigger --name-match=kvm
  fi

  local sdkmanager avdmanager
  sdkmanager="$(sdk_tool sdkmanager)"
  avdmanager="$(sdk_tool avdmanager)"

  # Only touch the network for what is missing (the system image is cached
  # between runs by the pipeline).
  local packages=()
  [[ -x "$emulator" ]] || packages+=("emulator")
  [[ -x "$adb" ]] || packages+=("platform-tools")
  [[ -d "$sdk/system-images/android-${api_level}/google_apis/${abi}" ]] || packages+=("$image")
  if (( ${#packages[@]} )); then
    log "Installing: ${packages[*]}"
    yes | "$sdkmanager" --licenses >/dev/null 2>&1 || true
    "$sdkmanager" --install "${packages[@]}" >/dev/null
  else
    log "System image, emulator and platform-tools already present"
  fi

  if ! "$emulator" -accel-check >/dev/null 2>&1; then
    "$emulator" -accel-check || true
    fail "No hardware acceleration on this agent ($(uname -s) $(uname -m)): the Android emulator cannot run here. Use the other hosted image (vmImage parameter) or a self-hosted / scale-set pool with nested virtualization (agentPool parameter)."
  fi

  if ! "$emulator" -list-avds 2>/dev/null | grep -qx "$avd_name"; then
    log "Creating AVD $avd_name ($device_profile, $image)"
    echo no | "$avdmanager" create avd --force -n "$avd_name" -k "$image" -d "$device_profile" >/dev/null
    # Headless test device: no cameras/sensors/audio, room for a 130 MB APK.
    cat >> "$HOME/.android/avd/$avd_name.avd/config.ini" <<'EOF'
hw.ramSize=3072
vm.heapSize=512
disk.dataPartition.size=6G
hw.audioInput=no
hw.audioOutput=no
hw.camera.back=none
hw.camera.front=none
hw.gps=no
hw.sensors.proximity=no
hw.sensors.magnetic_field=no
hw.sensors.orientation=no
hw.sensors.temperature=no
hw.keyboard=yes
showDeviceFrame=no
EOF
  fi

  local cores
  cores="$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)"
  (( cores > 4 )) && cores=4

  log "Booting $avd_name in the background ($cores cores, log: $emulator_log)"
  "$adb" start-server >/dev/null 2>&1
  # -no-snapshot: cold boot every time (no stale state, no snapshot save on exit).
  # swiftshader_indirect: software GPU, the reliable choice on GPU-less agents.
  nohup "$emulator" -avd "$avd_name" \
    -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu swiftshader_indirect -camera-back none -camera-front none \
    -cores "$cores" -memory 3072 -netfast \
    -dns-server 8.8.8.8,1.1.1.1 \
    >"$emulator_log" 2>&1 &
  log "Emulator PID $!"
}

wait_ready() {
  local deadline=$(( $(date +%s) + boot_timeout_s ))
  local start_ts
  start_ts=$(date +%s)

  until "$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -qx 1; do
    if (( $(date +%s) > deadline )); then
      tail -50 "$emulator_log" || true
      fail "Emulator did not boot within ${boot_timeout_s}s"
    fi
    if ! pgrep -f "qemu-system|emulator.*-avd" >/dev/null; then
      tail -50 "$emulator_log" || true
      fail "Emulator process exited during boot"
    fi
    sleep 3
  done
  # boot_completed flips before the package manager answers; installs fail until it does.
  until "$adb" shell pm path android 2>/dev/null | grep -q package; do sleep 2; done
  log "Booted in $(( $(date +%s) - start_ts ))s after this step started"

  # Automation-friendly device: no animations (deterministic waits), screen
  # always on and unlocked, no install verification (faster 130 MB installs),
  # no first-run hints or spell-check popups.
  "$adb" shell "
    settings put global window_animation_scale 0;
    settings put global transition_animation_scale 0;
    settings put global animator_duration_scale 0;
    settings put global package_verifier_enable 0;
    settings put global verifier_verify_adb_installs 0;
    settings put global stay_on_while_plugged_in 7;
    settings put secure show_ime_with_hard_keyboard 0;
    settings put secure spell_checker_enabled 0;
    settings put secure immersive_mode_confirmations confirmed;
    svc power stayon true;
    input keyevent 82
  " >/dev/null 2>&1 || true

  local udid
  udid="$("$adb" devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
  [[ -n "$udid" ]] || fail "No emulator listed by adb devices"
  log "Ready: $udid (API $("$adb" shell getprop ro.build.version.sdk | tr -d '\r'))"
  echo "##vso[task.setvariable variable=ANDROID_UDID]$udid"
}

install_app() {
  local apk="${2:?apk path required}"
  local start_ts
  start_ts=$(date +%s)
  # -r replace, -g grant runtime permissions, -t allow test-only builds.
  "$adb" install -r -g -t "$apk"
  log "Installed $(basename "$apk") in $(( $(date +%s) - start_ts ))s"
}

case "$cmd" in
  start) start ;;
  wait) wait_ready ;;
  install) install_app "$@" ;;
  stop) "$adb" emu kill >/dev/null 2>&1 || true ;;
  *) fail "Unknown command '$cmd' (start|wait|install|stop)" ;;
esac
