#!/usr/bin/env bash
# Emulator speed check for CI.
#
# Measures how fast the Android emulator responds and exits 1 when it is far too
# slow for UI tests. On the Azure hosted Mac the emulator sometimes runs so slowly
# (1 vCPU, software rendering) that every test fails one after another with
# timeouts, "Device server died" and missing elements, and the job burns an hour.
# Example (run 20261110-143332): a tab tap took 2.5 min, Home took up to 3 min
# after a cold start, and inputText hung for 120 s twice.
#
# What it measures (over adb only, nothing is installed):
#   1. adb answers at all (`adb shell echo`, 30 s limit).
#   2. App cold start (process start -> first frame), from the "Displayed" line
#      Android logs for the launch. `am start -W` alone is not enough: when the
#      launch is slower than Android's own launch timeout it returns
#      "Status: timeout" without a TotalTime (run 2026-11-10 16:04: the check
#      reported "no answer" although the app was up, and stopped a usable run).
#      A cold start that can't be measured is reported, but never fails the job.
#   3. UI tree dump: `uiautomator dump`, median of SAMPLES runs. That is the same
#      accessibility path Maestro's driver uses for every tap and assertion. It
#      dumps the launcher's home screen, not the app: the launcher is static,
#      while an app screen that keeps animating can make uiautomator wait for
#      "idle" even on a healthy emulator.
# If a value is over its limit, it waits RECHECK_WAIT seconds (a short spike
# after boot is normal) and measures again. It fails only if it is still over.
# The measured values are printed on every run, so the limits can be tuned.
#
# Settings (environment variables, all optional):
#   ADB                     adb binary (default: adb on PATH, else $ANDROID_HOME/platform-tools/adb)
#   DEVICE                  adb serial (default: emulator-5554)
#   APP_ID                  package to cold-start (default: com.mrh.mobilestore)
#   MAX_UI_DUMP_SECONDS     limit for the median UI dump (default 20; 0 = don't check)
#   MAX_COLD_START_SECONDS  limit for the app cold start (default 150; 0 = don't check).
#                           Below the 180 s the tests wait for Home (launch-standalone.yaml).
#   SAMPLES                 UI dumps per measurement (default 3)
#   RECHECK_WAIT            seconds before the second measurement (default 60)
#   REPORT_FILE             also append the results to this file
#
# Exit code: 0 = fast enough (or nothing to check), 1 = too slow or not answering.
# Works with macOS bash 3.2; uses perl for timeouts and timing (no coreutils).

set -u

DEVICE="${DEVICE:-emulator-5554}"
APP_ID="${APP_ID:-com.mrh.mobilestore}"
MAX_DUMP="${MAX_UI_DUMP_SECONDS:-20}"
MAX_START="${MAX_COLD_START_SECONDS:-150}"
SAMPLES="${SAMPLES:-3}"
RECHECK_WAIT="${RECHECK_WAIT:-60}"
REPORT_FILE="${REPORT_FILE:-}"
if [ -z "${ADB:-}" ]; then
  if command -v adb >/dev/null 2>&1; then ADB=adb; else ADB="${ANDROID_HOME:-}/platform-tools/adb"; fi
fi

log() {
  echo "$*"
  if [ -n "$REPORT_FILE" ]; then echo "$*" >> "$REPORT_FILE"; fi
}
# Run a command with a time limit in seconds. The command runs in its own process
# group, and the whole group is killed when it runs over (exit 142), so nothing is
# left holding the output pipe open. (Plain `alarm; exec` does not survive exec on
# every platform, e.g. Git Bash on Windows.)
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
now_ms() { perl -MTime::HiRes=time -e 'printf("%d\n", time() * 1000)'; }
adbs() { "$ADB" -s "$DEVICE" "$@"; }
# 12345 -> "12.3s"; -2 -> "not measured"
fmt() {
  case "$1" in
    -2) echo "not measured" ;;
    -1) echo "n/a" ;;
    *) awk -v ms="$1" 'BEGIN { printf("%.1fs", ms / 1000) }' ;;
  esac
}

fail() {
  local cpus msg
  cpus="$( (sysctl -n hw.logicalcpu || nproc) 2>/dev/null | head -n 1)"
  msg="Emulator too slow for UI tests: $1. Stopped here instead of letting every test time out one after another. Host logical CPUs: ${cpus:-?} (with fewer than 6 the emulator runs on 1 vCPU). Re-run the pipeline (another hosted machine may be less busy) or use an agent with 6+ cores. Limits: pipeline parameters maxUiDumpSeconds / maxColdStartSeconds (0 = off)."
  log "$msg"
  if [ -n "${TF_BUILD:-}" ]; then echo "##vso[task.logissue type=error]$msg"; fi
  exit 1
}

# Maestro's driver (an instrumentation) holds the UiAutomation connection while it
# runs, and `uiautomator dump` can't connect until it stops. The next Maestro
# session starts the driver again, so stopping it here is safe.
release_uiautomation() {
  adbs shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
  adbs shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
}

# Prints the cold start time in ms; -1 = app not installed, -2 = could not be
# measured (no "Displayed" line and no TotalTime within the time limit).
cold_start_ms() {
  local comp since out t deadline msg
  comp="$(limit 60 "$ADB" -s "$DEVICE" shell cmd package resolve-activity --brief \
    -c android.intent.category.LAUNCHER "$APP_ID" 2>/dev/null | tr -d '\r' | tail -n 1)"
  case "$comp" in */*) ;; *) echo "-1"; return ;; esac
  # Device clock, so the log can be read from this launch on ("MM-DD hh:mm:ss.000").
  since="$(limit 30 "$ADB" -s "$DEVICE" shell 'date +%m-%d_%H:%M:%S.000' 2>/dev/null | tr -d '\r' | tail -n 1)"
  since="${since/_/ }"
  deadline=$(( $(now_ms) / 1000 + MAX_START + 30 ))
  # -W waits for the first frame or Android's launch timeout, whichever is first.
  out="$(limit $(( MAX_START + 30 )) "$ADB" -s "$DEVICE" shell am start -W -S -n "$comp" 2>&1 | tr -d '\r')"
  msg="    am start: $(echo "$out" | grep -E '^(Status|LaunchState|TotalTime|WaitTime):' | tr '\n' ' ')"
  echo "$msg" >&2
  if [ -n "$REPORT_FILE" ]; then echo "$msg" >> "$REPORT_FILE"; fi
  # The "Displayed <app>/<activity> ...: +30s661ms" line is the cold start time.
  # It can come after `am start` has given up, so poll for it until the deadline.
  t=""
  case "$since" in
    [0-9][0-9]-[0-9][0-9]" "*)
      while :; do
        t="$(limit 30 "$ADB" -s "$DEVICE" shell "logcat -d -t '$since' -s ActivityTaskManager:I" 2>/dev/null \
          | displayed_ms "$APP_ID" | tail -n 1)"
        if [ -n "$t" ] || [ "$(( $(now_ms) / 1000 ))" -ge "$deadline" ]; then break; fi
        sleep 3
      done ;;
  esac
  if [ -z "$t" ]; then
    t="$(echo "$out" | sed -n 's/^TotalTime: *\([0-9][0-9]*\).*/\1/p' | head -n 1)"
  fi
  if [ -n "$t" ]; then echo "$t"; else echo "-2"; fi
}
# Reads logcat on stdin and prints the time in ms of each "Displayed <app>/..." line
# ("+850ms", "+30s661ms", "+1m2s345ms").
displayed_ms() {
  perl -ne 'BEGIN { $a = shift @ARGV }
    if (/Displayed \Q$a\E\/\S+.*?\+(?:(\d+)m(?!s))?(?:(\d+)s)?(?:(\d+)ms)?/) {
      print((($1 || 0) * 60000 + ($2 || 0) * 1000 + ($3 || 0)), "\n");
    }' "$1"
}

# Prints how long one UI tree dump took in ms. A dump that ran into the time limit
# (or took longer than the limit and then failed) counts with the time it took. A
# dump that failed quickly prints -2 (not measured), e.g. when another UiAutomation
# client such as an Appium UiAutomator2 server holds the connection ("Killed").
ui_dump_ms() {
  local t0 t1 out msg
  t0="$(now_ms)"
  out="$(limit $(( MAX_DUMP + 30 )) "$ADB" -s "$DEVICE" shell 'uiautomator dump /data/local/tmp/speed-check.xml; echo "exit code $?"' 2>&1 | tr -d '\r')"
  t1="$(now_ms)"
  case "$out" in
    *"dumped to"*) echo $(( t1 - t0 )); return ;;
  esac
  if [ $(( t1 - t0 )) -ge $(( MAX_DUMP * 1000 )) ]; then echo $(( t1 - t0 )); return; fi
  msg="    UI dump failed after $(fmt $(( t1 - t0 ))): $(echo "$out" | grep -v '^ *$' | tr '\n' ' ')"
  echo "$msg" >&2
  if [ -n "$REPORT_FILE" ]; then echo "$msg" >> "$REPORT_FILE"; fi
  echo "-2"
}

# Sets START_MS, DUMP_MS, DUMPS, LOAD.
measure() {
  START_MS="-1"; DUMP_MS="-1"; DUMPS=""
  if [ "$MAX_START" != "0" ] && [ -n "$APP_ID" ]; then START_MS="$(cold_start_ms)"; fi
  if [ "$MAX_DUMP" != "0" ]; then
    adbs shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
    sleep 3
    local i=0
    while [ "$i" -lt "$SAMPLES" ]; do
      DUMPS="$DUMPS $(ui_dump_ms)"
      i=$(( i + 1 ))
    done
    # Median of the dumps that worked; -2 (not measured, never fails) if none did.
    local ok n
    ok="$(echo $DUMPS | tr ' ' '\n' | grep -v '^-' | sort -n)"
    n="$(echo "$ok" | grep -c .)"
    if [ "$n" -gt 0 ]; then
      DUMP_MS="$(echo "$ok" | sed -n "$(( (n + 1) / 2 ))p")"
    else
      DUMP_MS="-2"
    fi
  fi
  LOAD="$(limit 30 "$ADB" -s "$DEVICE" shell cat /proc/loadavg 2>/dev/null | tr -d '\r' | cut -d ' ' -f 1-3)"
}

report() {
  local dumps="" d
  for d in $DUMPS; do dumps="$dumps $(fmt "$d")"; done
  log "  [$1] app cold start: $(fmt "$START_MS") (limit $( [ "$MAX_START" = 0 ] && echo off || echo "${MAX_START}s"))"
  log "  [$1] UI tree dump:   median $(fmt "$DUMP_MS") of [${dumps# }] (limit $( [ "$MAX_DUMP" = 0 ] && echo off || echo "${MAX_DUMP}s"))"
  log "  [$1] load average (1/5/15 min): ${LOAD:-n/a}"
}

# Returns 0 when a value is over its limit, with the reasons in REASONS.
too_slow() {
  REASONS=""
  # Only a measured value fails the check: "not measured" (-2) is reported, not
  # treated as slow, so a measuring problem can never stop a usable run.
  if [ "$MAX_START" != "0" ]; then
    if [ "$START_MS" -gt $(( MAX_START * 1000 )) ]; then
      REASONS="$REASONS; app cold start took $(fmt "$START_MS") (limit ${MAX_START}s)"
    fi
  fi
  if [ "$MAX_DUMP" != "0" ] && [ "$DUMP_MS" -gt $(( MAX_DUMP * 1000 )) ]; then
    REASONS="$REASONS; a UI tree dump (what Maestro does for every step) took $(fmt "$DUMP_MS") (limit ${MAX_DUMP}s)"
  fi
  REASONS="${REASONS#; }"
  [ -n "$REASONS" ]
}

log "Emulator speed check on $DEVICE ($(date '+%Y-%m-%d %H:%M:%S'))"

if ! limit 30 "$ADB" -s "$DEVICE" shell echo ok 2>/dev/null | grep -q ok; then
  fail "the emulator did not answer adb within 30s"
fi
# First make sure the UI is usable at all (recovers a hung System UI); timing a
# broken UI would say nothing. See emulator-ui-health.sh.
if ! ADB="$ADB" DEVICE="$DEVICE" REPORT_FILE="$REPORT_FILE" bash "$(dirname "$0")/emulator-ui-health.sh"; then
  exit 1
fi

if [ "$MAX_START" = "0" ] && [ "$MAX_DUMP" = "0" ]; then
  log "  Both limits are 0 (off) - nothing to check."
  exit 0
fi

release_uiautomation
measure
report "check 1"
if [ "$START_MS" = "-1" ] && [ "$MAX_START" != "0" ]; then
  log "  ($APP_ID is not installed, so its cold start was not measured)"
fi
if [ "$START_MS" = "-2" ]; then
  log "  (no launch time in the log within $(( MAX_START + 30 ))s - not counted; the tests' own launch wait applies)"
fi

if too_slow; then
  log "  Over the limit: $REASONS"
  log "  Waiting ${RECHECK_WAIT}s and measuring again (a short spike after boot is normal)..."
  sleep "$RECHECK_WAIT"
  measure
  report "check 2"
  if too_slow; then fail "$REASONS"; fi
fi

log "  OK: the emulator is fast enough for the UI tests."
exit 0
