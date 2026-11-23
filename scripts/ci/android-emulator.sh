#!/usr/bin/env bash
# Headless Android emulator for CI, split in two so the boot overlaps with
# other pipeline work (dependency install, APK download):
#
#   android-emulator.sh start [api-level] [device-profile]   create the AVD, boot it in the background
#   android-emulator.sh wait                                  block until booted, tune it for automation
#   android-emulator.sh install <apk>                         install the app once, permissions granted
#   android-emulator.sh collect                               dump device logs (after a failed run)
#   android-emulator.sh stop
#
# Works on Linux (needs /dev/kvm) and macOS (needs Hypervisor.framework);
# picks the x86_64 or arm64-v8a system image to match the host CPU.
# `wait` exports ANDROID_UDID to the pipeline.
set -euo pipefail

cmd="${1:?start|wait|install|collect|stop}"
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

# adb with a time limit. On a starved emulator one `adb shell` can block
# indefinitely, and a loop's deadline is only checked BETWEEN adb calls: on
# 2026-11-23 the boot wait ran 40 min, far past its own deadline. perl's
# alarm survives exec (perl ships with macOS and Ubuntu; coreutils `timeout`
# is not on macOS). Exit status 142 = the limit was hit.
adb_within() {
  local secs="$1"
  shift
  perl -e 'alarm shift @ARGV; exec @ARGV or die "exec $ARGV[0]: $!\n"' "$secs" "$adb" "$@"
}

# sdkmanager / avdmanager need Java 17+. Hosted images ship several JDKs.
export JAVA_HOME="${JAVA_HOME_17_X64:-${JAVA_HOME_17_arm64:-${JAVA_HOME:-}}}"

case "$(uname -m)" in
  arm64 | aarch64) abi="arm64-v8a" ;;
  *) abi="x86_64" ;;
esac
# System image flavour (EMULATOR_IMAGE_TAG). Both have Google Play services,
# which the app needs (Firebase, notifications).
#   google_apis  full phone image (default, proven in CI).
#   google_atd   Google's "Automated Test Device" image for CI: SystemUI,
#                Settings, bundled apps and many background services removed
#                (~110 vs ~155 packages). Google measured 33-55% shorter test
#                runs. Its hardware rendering is off, so screenshots and screen
#                recordings may show a solid colour; UiAutomator2 reads the
#                accessibility tree, so the tests themselves are unaffected.
#                Not yet run in this pipeline: opt-in until a CI run proves it.
image_tag="${EMULATOR_IMAGE_TAG:-google_apis}"
image="system-images;android-${api_level};${image_tag};${abi}"
avd_name="e2e_api${api_level}_${image_tag}_${abi}"

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
  [[ -d "$sdk/system-images/android-${api_level}/${image_tag}/${abi}" ]] || packages+=("$image")
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

# Evidence for a slow or stuck boot, printed live to the step log: an agent
# that stops responding never uploads logs/ (2026-11-23: "Final logs are
# missing"), but the console lines it already printed are visible.
emulator_log_shown=0
boot_progress() {
  local elapsed="$1" state boot pid usage swap total
  state="$(adb_within 10 get-state 2>/dev/null | tr -d '\r' || true)"
  boot="$(adb_within 10 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  pid="$(pgrep -f qemu-system | sed -n 1p || true)"
  usage="$([[ -n "$pid" ]] && ps -o %cpu=,rss= -p "$pid" | awk '{printf "%s%% CPU, %d MB", $1, $2 / 1024}' || true)"
  swap="$(sysctl -n vm.swapusage 2>/dev/null || free -m 2>/dev/null | awk '/Swap/ {print "swap used " $3 " MB"}' || true)"
  log "+${elapsed}s adb=${state:-none} boot_completed=${boot:-?} emulator=[${usage:-not running}] load=[$(uptime | sed 's/.*load averages*: //')] ${swap}"
  # New emulator.log lines (minus the long adb key lines).
  total="$(wc -l <"$emulator_log" 2>/dev/null | tr -d ' ' || echo 0)"
  if (( total > emulator_log_shown )); then
    sed -n "$(( emulator_log_shown + 1 )),${total}p" "$emulator_log" \
      | grep -vi 'pubkey\|public key' | sed 's/^/  [emulator.log] /' || true
    emulator_log_shown="$total"
  fi
}

wait_ready() {
  local start_ts now next_report=0
  start_ts=$(date +%s)
  local deadline=$(( start_ts + boot_timeout_s ))

  # Booted = boot_completed AND the package manager answers (installs fail
  # until it does). Both checks are time-limited and share one deadline.
  # `grep >/dev/null`, not `grep -q`: -q exits early and, under pipefail, the
  # writer's SIGPIPE would turn a match into a failure.
  until adb_within 15 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -x 1 >/dev/null \
    && adb_within 30 shell pm path android 2>/dev/null | grep package >/dev/null; do
    now=$(date +%s)
    if (( now >= next_report )); then
      boot_progress $(( now - start_ts ))
      next_report=$(( now + 30 ))
    fi
    if (( now > deadline )); then
      tail -50 "$emulator_log" || true
      fail "Emulator did not boot within ${boot_timeout_s}s (progress lines above)"
    fi
    if ! pgrep -f "qemu-system|emulator.*-avd" >/dev/null; then
      tail -50 "$emulator_log" || true
      fail "Emulator process exited during boot"
    fi
    sleep 3
  done
  log "Booted in $(( $(date +%s) - start_ts ))s after this step started"
  boot_progress $(( $(date +%s) - start_ts ))

  # Automation-friendly device: no animations (deterministic waits), screen
  # always on and unlocked, no install verification (faster 130 MB installs),
  # no first-run hints or spell-check popups.
  adb_within 60 shell "
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
  # Room for a whole run's device log (the emulator's default is 2 MB, a few
  # minutes): `collect` dumps it after a failed run.
  adb_within 20 logcat -G 16M >/dev/null 2>&1 || true

  local udid
  udid="$(adb_within 10 devices | awk 'NR>1 && $2=="device" {print $1; exit}' || true)"
  [[ -n "$udid" ]] || fail "No emulator listed by adb devices"
  log "Ready: $udid (API $(adb_within 10 shell getprop ro.build.version.sdk | tr -d '\r'))"
  # One snapshot of what the device is busy with right after boot. The emulator
  # drops to 1 virtual core on hosts with < 6 logical cores (emulator.log), so
  # post-boot work (dexopt, Play services) competes directly with the installs.
  log "Guest CPUs: $(adb_within 10 shell nproc 2>/dev/null | tr -d '\r'); host load: $(uptime | sed 's/.*load averages*: //')"
  adb_within 20 shell top -b -n 1 -m 8 2>/dev/null | tr -d '\r' || true
  echo "##vso[task.setvariable variable=ANDROID_UDID]$udid"
}

install_app() {
  local apk="${2:?apk path required}"
  local start_ts
  start_ts=$(date +%s)
  # -r replace, -g grant runtime permissions, -t allow test-only builds.
  # Bounded below the step's 10 min timeout, so a stuck install fails with a
  # message (and the test step then falls back to Appium installing).
  adb_within 540 install -r -g -t "$apk" \
    || fail "adb install did not finish (exit $?; 142 = still running after 540 s)"
  log "Installed $(basename "$apk") in $(( $(date +%s) - start_ts ))s"
  # Tells the test step to drive the installed app by package name. Without
  # it the test step hands Appium the APK and every session reinstalls it
  # (enforceAppInstall): on the hosted Mac's 1-vCPU emulator that reinstall
  # outlasted Appium's 240 s install timeout twice per session (2026-11-23).
  echo "##vso[task.setvariable variable=ANDROID_APP_PREINSTALLED]true"
}

# Device-side evidence after a failed run (the iOS pipeline's simulator log
# equivalent): the device log, the system's "isn't responding" / crash
# records, and what is using the CPU now. Appium's own logcat stream is off
# (skipLogcatCapture), so this is the only copy. Every call is bounded.
collect() {
  local dir="$suite_dir/logs/device"
  mkdir -p "$dir"
  adb_within 120 logcat -d -v threadtime -b main,system,crash,events >"$dir/logcat.txt" 2>&1 || true
  adb_within 60 shell dumpsys dropbox --print system_app_anr system_app_crash data_app_anr data_app_crash \
    >"$dir/anr-and-crashes.txt" 2>&1 || true
  adb_within 20 shell top -b -n 1 -s 2 -o PID,%CPU,RES,ARGS >"$dir/top.txt" 2>&1 || true
  adb_within 20 shell cat /proc/loadavg /proc/meminfo >"$dir/load-and-memory.txt" 2>&1 || true
  ls -la "$dir"
}

case "$cmd" in
  start) start ;;
  wait) wait_ready ;;
  install) install_app "$@" ;;
  collect) collect ;;
  stop) adb_within 30 emu kill >/dev/null 2>&1 || true ;;
  *) fail "Unknown command '$cmd' (start|wait|install|collect|stop)" ;;
esac
