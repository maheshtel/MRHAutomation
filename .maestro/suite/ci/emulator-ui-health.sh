#!/usr/bin/env bash
# Emulator UI health check for CI, with recovery.
#
# Makes sure the emulator's UI is usable before tests run: Android answers a UI
# tree dump (the same accessibility path Maestro uses) and no "isn't responding"
# or crash dialog has the focus. If not, it recovers step by step and checks again:
#   1. close system dialogs (CLOSE_SYSTEM_DIALOGS broadcast) and press Home
#   2. restart System UI (it restarts by itself after being crashed)
#   3. restart the whole Android framework (adb root; stop; start) and wait for it
# and exits 1 with a clear message if the UI is still broken after that.
#
# Why: on the slow Azure emulator (1 vCPU) System UI sometimes doesn't finish
# starting in time right after boot, Android shows "System UI isn't responding"
# and the screen stays blocked. Run 20261111-082835: every UI dump returned
# "null root node", Maestro saw a black screen, and all 6 tests failed at their
# first step ("Wait for Home after cold start"), plus the retries.
#
# Settings (environment variables, all optional):
#   ADB          adb binary (default: adb on PATH, else $ANDROID_HOME/platform-tools/adb)
#   DEVICE       adb serial (default: emulator-5554)
#   REPORT_FILE  also append the results to this file
#
# Exit code: 0 = UI usable (possibly after recovery), 1 = still broken.
# Works with macOS bash 3.2; uses perl for timeouts (no coreutils).

set -u

DEVICE="${DEVICE:-emulator-5554}"
REPORT_FILE="${REPORT_FILE:-}"
if [ -z "${ADB:-}" ]; then
  if command -v adb >/dev/null 2>&1; then ADB=adb; else ADB="${ANDROID_HOME:-}/platform-tools/adb"; fi
fi

log() {
  echo "$*"
  if [ -n "$REPORT_FILE" ]; then echo "$*" >> "$REPORT_FILE"; fi
}
# Run a command with a time limit in seconds (whole process group is killed; exit 142).
limit() {
  local s="$1"; shift
  perl -e '
    my $t = shift;
    my $pid = fork();
    die "fork failed: $!" unless defined $pid;
    if ($pid == 0) { setpgrp(0, 0); exec @ARGV or exit 127; }
    local $SIG{ALRM} = sub { kill "KILL", -$pid; kill "KILL", $pid; exit 142; };
    alarm $t;
    waitpid($pid, 0);
    alarm 0;
    exit($? >> 8);
  ' "$s" "$@"
}
now_s() { perl -e 'print time(), "\n"'; }
sh_() { limit "${T:-60}" "$ADB" -s "$DEVICE" shell "$@" 2>&1 | tr -d '\r'; }

# Maestro's driver holds the UiAutomation connection; uiautomator dump needs it.
release_uiautomation() {
  T=30 sh_ am force-stop dev.mobile.maestro.test >/dev/null
  T=30 sh_ am force-stop dev.mobile.maestro >/dev/null
}

# Waits (max 60 s) until adb answers again, e.g. after 'adb root' / 'adb unroot'.
adb_up() {
  local i=0
  sleep 2
  while [ $i -lt 30 ]; do
    T=10 sh_ echo ok | grep -q ok && return 0
    sleep 2; i=$((i + 1))
  done
  return 1
}

# Sets STATE to "ok" or a short description of what is wrong, and FOCUS to the
# focused window. Broken = a blocking dialog has the focus, or Android has no
# screen to read at all ("null root node": what every dump returned in the failed
# run). Other dump errors (e.g. "could not get idle state" on a busy screen) are
# reported but don't count: Maestro reads the screen in its own way and copes.
check_ui() {
  local focus dump
  T=30 sh_ input keyevent KEYCODE_WAKEUP >/dev/null    # no-op when the screen is on
  focus="$(T=30 sh_ dumpsys window | grep -E 'mCurrentFocus=' | head -n 1 | sed 's/^ *//')"
  FOCUS="${focus:-unknown}"
  case "$focus" in
    *"Not Responding"*|*"isn't responding"*) STATE="an \"isn't responding\" dialog has the focus"; return ;;
    *"Application Error"*|*"keeps stopping"*|*"has stopped"*) STATE="a crash dialog has the focus"; return ;;
  esac
  # Dump the launcher (static) rather than an app screen that may keep animating.
  T=30 sh_ input keyevent KEYCODE_HOME >/dev/null
  sleep 2
  release_uiautomation
  dump="$(T=90 sh_ 'uiautomator dump /data/local/tmp/ui-health.xml; echo "exit code $?"')"
  case "$dump" in
    *"null root node"*) STATE="Android returns no screen to read (null root node)" ;;
    *"dumped to"*) STATE="ok" ;;
    *) STATE="ok"
       log "    (UI dump did not finish: $(echo "$dump" | grep -v '^ *$' | tail -n 2 | tr '\n' ' ')- not counted as broken)" ;;
  esac
}

# Checks up to N times, WAIT seconds apart; returns 0 as soon as the UI is ok.
check_ui_for() {
  local n="$1" wait="$2" i=1
  while :; do
    check_ui
    log "    check: ${STATE} (focus: ${FOCUS})"
    [ "$STATE" = "ok" ] && return 0
    [ "$i" -ge "$n" ] && return 1
    sleep "$wait"; i=$((i + 1))
  done
}

# Waits until the framework answers again after a restart (max ~10 min).
wait_framework() {
  local end=$(( $(now_s) + 600 ))
  sleep 10
  while [ "$(now_s)" -lt "$end" ]; do
    if T=20 sh_ pm path android | grep -q package \
       && [ -n "$(T=20 sh_ pidof com.android.systemui)" ]; then
      return 0
    fi
    sleep 5
  done
  return 1
}

log "Emulator UI health check on $DEVICE ($(date '+%Y-%m-%d %H:%M:%S'))"
if ! T=30 sh_ echo ok | grep -q ok; then
  log "  The emulator did not answer adb within 30s."
  if [ -n "${TF_BUILD:-}" ]; then echo "##vso[task.logissue type=error]Emulator UI health: the emulator did not answer adb within 30s"; fi
  exit 1
fi

check_ui_for 1 0 && { log "  OK: the UI is usable."; exit 0; }

# 1) Close dialogs (an ANR dialog closes on CLOSE_SYSTEM_DIALOGS, like on Home)
log "  Recovery 1/3: close system dialogs and go Home"
T=30 sh_ am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null
T=30 sh_ input keyevent KEYCODE_HOME >/dev/null
sleep 10
check_ui_for 2 15 && { log "  OK: the UI is usable again after closing dialogs."; exit 0; }

# 2) Restart System UI. It is a persistent process, so Android starts it again;
#    its "isn't responding" dialog goes away with the old process.
log "  Recovery 2/3: restart System UI"
OLD_PID="$(T=20 sh_ pidof com.android.systemui)"
T=30 sh_ am crash com.android.systemui >/dev/null
sleep 5
if [ -n "$OLD_PID" ] && [ "$(T=20 sh_ pidof com.android.systemui)" = "$OLD_PID" ]; then
  # 'am crash' not available or ignored: kill it as root ('default' images allow adb root)
  if limit 30 "$ADB" -s "$DEVICE" root 2>&1 | grep -qiE "restarting|already running as root"; then
    adb_up; T=30 sh_ kill "$OLD_PID" >/dev/null
    limit 30 "$ADB" -s "$DEVICE" unroot >/dev/null 2>&1; adb_up
  fi
fi
sleep 30
T=30 sh_ am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null
T=30 sh_ input keyevent KEYCODE_HOME >/dev/null
check_ui_for 4 20 && { log "  OK: the UI is usable again after restarting System UI."; exit 0; }

# 3) Restart the Android framework (everything above the kernel). Settings made
#    with 'settings put' and persist.* properties are kept.
log "  Recovery 3/3: restart the Android framework (this can take several minutes)"
if limit 30 "$ADB" -s "$DEVICE" root 2>&1 | grep -qiE "restarting|already running as root"; then
  adb_up
  T=60 sh_ stop >/dev/null
  sleep 3
  T=60 sh_ start >/dev/null
  limit 30 "$ADB" -s "$DEVICE" unroot >/dev/null 2>&1
  adb_up
  if wait_framework; then
    sleep 30
    T=30 sh_ input keyevent KEYCODE_HOME >/dev/null
    check_ui_for 6 20 && { log "  OK: the UI is usable again after restarting the framework."; exit 0; }
  else
    log "    the framework did not come back within 10 minutes"
  fi
else
  log "    adb root is not available on this image - cannot restart the framework"
fi

MSG="Emulator UI is not usable: ${STATE}. Recovery (close dialogs, restart System UI, restart the framework) did not help, so the tests were not started - they would all fail at their first step. Re-run the pipeline (the hosted emulator is very slow, and System UI sometimes hangs right after boot)."
log "  $MSG"
if [ -n "${TF_BUILD:-}" ]; then echo "##vso[task.logissue type=error]$MSG"; fi
exit 1
