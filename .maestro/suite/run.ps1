<#
.SYNOPSIS
    Runs the Maestro suite in .maestro/suite on Android or iOS.

.EXAMPLE
    # Whole suite on the connected Android emulator
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android

.EXAMPLE
    # Only smoke tests on iOS, HTML report
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform ios -Tags smoke -Format html

.EXAMPLE
    # One feature folder, or one test file
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Path tests/cart
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Path tests/auth/login_success.yaml

.EXAMPLE
    # Record (or re-record) the screenshot baselines for this platform
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -UpdateBaselines

.EXAMPLE
    # Also run quarantined tests (tagged flaky), which are skipped by default
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -IncludeFlaky

.EXAMPLE
    # Retry failed tests once instead of twice, or not at all
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Retries 1
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Retries 0

.EXAMPLE
    # Reinstall the app from the APK first (after dropping in a new build)
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -ReinstallApp

.EXAMPLE
    # Run inside Expo Go instead of the installed standalone APK
    powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Launch expo-go

.NOTES
    Credentials are read from .env.test and .env.test.<platform> (see
    .env.test.example), first in the repo root, then in .maestro/suite. All are
    optional; a key in a later file wins.
    Reports and artifacts land in .maestro/suite/reports/<platform>/<timestamp>/.
    Screenshot baselines live in .maestro/suite/screenshots/baseline/<platform>/.
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('android', 'ios')]
    [string]$Platform,

    # Folder or file to run, relative to .maestro/suite. Default: the whole suite
    # (tests/** via config.yaml).
    [string]$Path = '',

    [string[]]$Tags = @(),
    [string[]]$ExcludeTags = @(),

    # Device/emulator/simulator ID; omit to let Maestro pick the connected one.
    [string]$Device = '',

    [ValidateSet('junit', 'html')]
    [string]$Format = 'junit',

    [string]$EnvFile = '',

    # How subflows/app/launch.yaml starts the app: the installed com.mrh.mobilestore
    # APK (default), or inside Expo Go (needs a running dev server).
    [ValidateSet('expo-go', 'standalone')]
    [string]$Launch = 'standalone',

    # Save screenshots as new baselines instead of comparing against them.
    [switch]$UpdateBaselines,

    # Tests tagged `flaky` are quarantined: left out of normal runs so a known
    # flaky test can't fail the suite. Pass -IncludeFlaky to run them too.
    [switch]$IncludeFlaky,

    # Android + standalone: the app is installed from this APK when it isn't on
    # the device yet (one-time setup). Default: .maestro/app/android/mrh.apk.
    [string]$Apk = '',

    # Reinstall the app from the APK even if it's already installed (use after
    # dropping in a new build).
    [switch]$ReinstallApp,

    # A failed test is run again up to this many times; a test that passes is
    # never re-run. 0 turns retries off. A test that passes only on a retry is
    # reported as flaky.
    [ValidateRange(0, 5)]
    [int]$Retries = 2
)

$ErrorActionPreference = 'Stop'

if (-not $IncludeFlaky) { $ExcludeTags = @($ExcludeTags) + 'flaky' }

$suiteDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $suiteDir '..\..')).Path
if (-not $EnvFile) { $EnvFile = Join-Path $repoRoot '.env.test' }

# ── Target ────────────────────────────────────────────────────────────────────
# Running the suite folder itself lets Maestro pick up config.yaml (tests/** only).
$target = if ($Path) { Join-Path $suiteDir $Path } else { $suiteDir }
if (-not (Test-Path $target)) {
    Write-Error "Path not found: $target"
    exit 1
}

# ── Env vars from .env.test, then .env.test.<platform> ────────────────────────
# Read from the repo root, then from this folder; every file is optional and a
# key set in a later file replaces the earlier value. -EnvFile replaces the
# repo-root pair.
$envVars = @{}
$suiteEnv = Join-Path $suiteDir '.env.test'
foreach ($file in $EnvFile, "$EnvFile.$Platform", $suiteEnv, "$suiteEnv.$Platform") {
    if (-not (Test-Path $file)) { continue }
    Get-Content $file | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $value = $parts[1].Trim()
        if ($value) { $envVars[$parts[0].Trim()] = $value }
    }
}
foreach ($required in 'TEST_EMAIL', 'TEST_PASSWORD') {
    if (-not $envVars[$required]) {
        Write-Error ("$required is missing. Copy .maestro/suite/.env.test.example to " +
            "$EnvFile or $suiteEnv (or a .$Platform variant) and fill it in.")
        exit 1
    }
}

# ── App installed? (Android, standalone APK only) ─────────────────────────────
# Installs the APK when the app is missing, so a fresh emulator needs no manual
# setup. Does nothing when it's already installed. See scripts/ensure-app-installed.ps1.
if ($Platform -eq 'android' -and $Launch -eq 'standalone') {
    $installArgs = @{}
    if ($Device) { $installArgs['Device'] = $Device }
    if ($Apk) { $installArgs['Apk'] = $Apk }
    if ($ReinstallApp) { $installArgs['Reinstall'] = $true }
    & (Join-Path $suiteDir 'scripts\ensure-app-installed.ps1') @installArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# ── Screenshot baselines ──────────────────────────────────────────────────────
# Absolute path, so subflows/visual/check-screen.yaml finds it whatever -Path is.
$baselineDir = Join-Path $suiteDir "screenshots\baseline\$Platform"
$envVars['BASELINE_DIR'] = $baselineDir -replace '\\', '/'
$envVars['UPDATE_BASELINES'] = if ($UpdateBaselines) { 'true' } else { 'false' }

$envVars['LAUNCH_MODE'] = $Launch

# ── Output locations ──────────────────────────────────────────────────────────
# reports/<platform>/<timestamp>/
#   attempt-1/report.xml + artifacts/   first run of the selected tests
#   attempt-2/, attempt-3/              re-runs of only the tests that failed
#   report.xml                          final result per test (last attempt wins)
#   report.html                         with -Format html: summary page
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $suiteDir "reports\$Platform\$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$reportFile = Join-Path $runDir 'report.xml'

# ── One Maestro run (attempt) ─────────────────────────────────────────────────
# Every attempt writes JUnit: it's what the retry logic reads to find failures.
# --device goes before `test` (a global option): older Maestro versions don't
# accept it after `test`, newer ones accept both. `--platform` isn't passed for
# the same reason; the device already decides the platform.
function Invoke-MaestroAttempt([int]$attempt, [string[]]$targets, [bool]$useTags) {
    $dir = Join-Path $runDir "attempt-$attempt"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $out = Join-Path $dir 'report.xml'
    $a = @()
    if ($Device) { $a += @('--device', $Device) }
    $a += @('test', '--format', 'junit', '--output', $out,
        '--test-output-dir', (Join-Path $dir 'artifacts'),
        '--test-suite-name', "MRH StoreFront ($Platform)")
    if ($useTags -and $Tags.Count) { $a += "--include-tags=$($Tags -join ',')" }
    if ($useTags -and $ExcludeTags.Count) { $a += "--exclude-tags=$($ExcludeTags -join ',')" }
    foreach ($key in $envVars.Keys) { $a += @('--env', "$key=$($envVars[$key])") }
    $a += $targets
    & maestro @a | Out-Host
    return $out
}

# The test cases in a JUnit report: name, absolute test file, failed or not.
function Get-TestResults([string]$junitFile) {
    if (-not (Test-Path $junitFile)) { return @() }
    [xml]$x = Get-Content -Raw -Encoding UTF8 $junitFile
    foreach ($tc in @($x.SelectNodes('//testcase'))) {
        $file = $tc.GetAttribute('file')
        if ($file -and -not [IO.Path]::IsPathRooted($file)) { $file = Join-Path (Get-Location) $file }
        $status = $tc.GetAttribute('status')
        [pscustomobject]@{
            Name   = $tc.GetAttribute('name')
            File   = $file
            Failed = ($null -ne $tc.SelectSingleNode('failure')) -or ($status -and $status -ne 'SUCCESS')
        }
    }
}

function Test-CaseFailed($tc) {
    $status = $tc.GetAttribute('status')
    return ($null -ne $tc.SelectSingleNode('failure')) -or ($status -and $status -ne 'SUCCESS')
}

Write-Host "Maestro suite  | platform: $Platform | launch: $Launch | target: $target"
if ($Tags.Count) { Write-Host "               | tags: $($Tags -join ', ')" }
if ($UpdateBaselines) { Write-Host "               | RECORDING baselines into $baselineDir" }
Write-Host "               | retries per failed test: $Retries | report: $reportFile"

# ── Attempt 1: everything selected ────────────────────────────────────────────
$attemptReports = @(Invoke-MaestroAttempt 1 @($target) $true)
$firstCode = $LASTEXITCODE
$results = @(Get-TestResults $attemptReports[0])

if ($results.Count -eq 0) {
    # No report at all (e.g. no device, a YAML error): nothing to retry.
    Write-Host ''
    Write-Host "No test results were produced (maestro exit code $firstCode). See the output above."
    exit $(if ($firstCode) { $firstCode } else { 1 })
}

$history = @{}   # test name -> @('FAIL', 'PASS', ...), one entry per attempt
foreach ($r in $results) { $history[$r.Name] = @($(if ($r.Failed) { 'FAIL' } else { 'PASS' })) }

# ── Attempts 2..N: only the tests that are still failing ──────────────────────
for ($attempt = 2; $attempt -le $Retries + 1; $attempt++) {
    $failedFiles = @($results | Where-Object { $_.Failed -and $_.File -and (Test-Path $_.File) } |
        ForEach-Object { $_.File } | Sort-Object -Unique)
    if ($failedFiles.Count -eq 0) { break }

    Write-Host ''
    Write-Host "Retry          | attempt $attempt of $($Retries + 1): re-running $($failedFiles.Count) failed test(s)"
    $failedFiles | ForEach-Object { Write-Host "               |   $(Split-Path $_ -Leaf)" }

    $attemptReports += Invoke-MaestroAttempt $attempt $failedFiles $false
    foreach ($r in @(Get-TestResults $attemptReports[-1])) {
        $prev = $results | Where-Object { $_.Name -eq $r.Name } | Select-Object -First 1
        if (-not $prev) { continue }
        $prev.Failed = $r.Failed
        $history[$r.Name] += $(if ($r.Failed) { 'FAIL' } else { 'PASS' })
    }
}

# ── Final report: attempt 1, with each re-run test replaced by its last run ──
[xml]$final = Get-Content -Raw -Encoding UTF8 $attemptReports[0]
for ($i = 1; $i -lt $attemptReports.Count; $i++) {
    if (-not (Test-Path $attemptReports[$i])) { continue }
    [xml]$later = Get-Content -Raw -Encoding UTF8 $attemptReports[$i]
    foreach ($tc in @($later.SelectNodes('//testcase'))) {
        $old = @($final.SelectNodes('//testcase')) |
            Where-Object { $_.GetAttribute('name') -eq $tc.GetAttribute('name') } | Select-Object -First 1
        if ($old) { [void]$old.ParentNode.ReplaceChild($final.ImportNode($tc, $true), $old) }
    }
}
# Record attempts, per-attempt history and flakiness on every test case.
foreach ($tc in @($final.SelectNodes('//testcase'))) {
    $h = @($history[$tc.GetAttribute('name')])
    $props = $tc.SelectSingleNode('properties')
    if (-not $props) { $props = $final.CreateElement('properties'); [void]$tc.PrependChild($props) }
    $isFlaky = ($h.Count -gt 1 -and $h[-1] -eq 'PASS')
    foreach ($kv in @(@('attempts', "$($h.Count)"), @('history', ($h -join ' > ')), @('flaky', "$isFlaky".ToLower()))) {
        $p = $final.CreateElement('property'); $p.SetAttribute('name', $kv[0]); $p.SetAttribute('value', $kv[1])
        [void]$props.AppendChild($p)
    }
}
foreach ($suite in @($final.SelectNodes('//testsuite'))) {
    $cases = @($suite.SelectNodes('testcase'))
    $suite.SetAttribute('tests', "$($cases.Count)")
    $suite.SetAttribute('failures', "$(@($cases | Where-Object { Test-CaseFailed $_ }).Count)")
}
$final.Save($reportFile)

# ── Summary ───────────────────────────────────────────────────────────────────
$passed = @($results | Where-Object { -not $_.Failed })
$failed = @($results | Where-Object { $_.Failed })
$flaky = @($passed | Where-Object { @($history[$_.Name]).Count -gt 1 })

function Get-Status($r) {
    if ($r.Failed) { 'FAILED' } elseif (@($history[$r.Name]).Count -gt 1) { 'PASSED (flaky)' } else { 'PASSED' }
}

Write-Host ''
Write-Host '============================ Result ============================'
foreach ($r in $results) {
    $h = @($history[$r.Name])
    $tries = if ($h.Count -gt 1) { "   [$($h -join ' > ')]" } else { '' }
    Write-Host ("{0,-15} {1}{2}" -f (Get-Status $r), $r.Name, $tries)
}
Write-Host ("{0} passed ({1} flaky), {2} failed, {3} total" -f $passed.Count, $flaky.Count, $failed.Count, $results.Count)

if ($Format -eq 'html') {
    $rows = foreach ($r in $results) {
        $status = Get-Status $r
        $color = if ($r.Failed) { '#c62828' } elseif ($status -like '*flaky*') { '#ef6c00' } else { '#2e7d32' }
        $name = [Net.WebUtility]::HtmlEncode($r.Name)
        $file = [Net.WebUtility]::HtmlEncode($(if ($r.File) { Split-Path $r.File -Leaf } else { '' }))
        "<tr><td style='color:$color;font-weight:600'>$status</td><td>$name</td><td>$(@($history[$r.Name]) -join ' &rarr; ')</td><td>$file</td></tr>"
    }
    $html = @"
<!doctype html>
<html><head><meta charset="utf-8"><title>MRH StoreFront ($Platform) $stamp</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}th{background:#f5f5f5}</style>
</head><body>
<h2>MRH StoreFront ($Platform) - $stamp</h2>
<p>$($passed.Count) passed ($($flaky.Count) flaky), $($failed.Count) failed, $($results.Count) total. Retries per failed test: $Retries.</p>
<table><tr><th>Result</th><th>Test</th><th>Attempts</th><th>File</th></tr>
$($rows -join "`n")
</table>
<p>Screenshots and logs for each attempt: <code>attempt-N/artifacts/</code> next to this file.</p>
</body></html>
"@
    Set-Content -Encoding UTF8 -Path (Join-Path $runDir 'report.html') -Value $html
}

Write-Host ''
Write-Host "Report:    $reportFile"
if ($Format -eq 'html') { Write-Host "HTML:      $(Join-Path $runDir 'report.html')" }
Write-Host "Artifacts: $(Join-Path $runDir 'attempt-N\artifacts')"
exit $(if ($failed.Count) { 1 } else { 0 })
