<#
.SYNOPSIS
    Installs the MRH app on an Android device/emulator if it isn't installed yet.

.DESCRIPTION
    One-time setup: if com.mrh.mobilestore is already on the device, nothing
    happens. Otherwise the APK is installed with adb. run.ps1 calls this before
    every Android run with the standalone launch, so a fresh emulator is set up
    automatically; it can also be run on its own.

.EXAMPLE
    # Install if missing (default APK: .maestro/app/android/mrh.apk)
    powershell -NoProfile -File .maestro/suite/scripts/ensure-app-installed.ps1

.EXAMPLE
    # Replace the installed app with the APK (e.g. after dropping in a new build)
    powershell -NoProfile -File .maestro/suite/scripts/ensure-app-installed.ps1 -Reinstall
#>
param(
    # Device id from `adb devices`; omit to use the only/first connected device.
    [string]$Device = '',

    # APK to install. Default: .maestro/app/android/mrh.apk in the repo.
    [string]$Apk = '',

    # Install even if the app is already there (adb install -r keeps its data).
    [switch]$Reinstall
)

$ErrorActionPreference = 'Stop'
$package = 'com.mrh.mobilestore'

if (-not $Apk) {
    $Apk = Join-Path $PSScriptRoot '..\..\app\android\mrh.apk'
}

# ── adb ───────────────────────────────────────────────────────────────────────
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
    foreach ($sdk in $env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) {
        if ($sdk -and (Test-Path (Join-Path $sdk 'platform-tools\adb.exe'))) {
            $adb = Join-Path $sdk 'platform-tools\adb.exe'
            break
        }
    }
}
if (-not $adb) {
    Write-Error 'adb not found. Install the Android SDK platform-tools or add adb to PATH.'
    exit 1
}

# Runs adb and returns its output lines. Windows PowerShell turns a native
# command's stderr into errors, which would stop the script under 'Stop', so
# stderr is merged in with 'Continue' and the exit code is checked instead.
function Invoke-Adb {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $adb @args 2>&1 | ForEach-Object { "$_" }
        return [pscustomobject]@{ Lines = @($out); Code = $LASTEXITCODE }
    } finally {
        $ErrorActionPreference = $prev
    }
}

# ── Device ────────────────────────────────────────────────────────────────────
if (-not $Device) {
    $devices = @((Invoke-Adb devices).Lines | Where-Object { $_ -match '^\S+\s+device$' } |
        ForEach-Object { ($_ -split '\s+')[0] })
    if ($devices.Count -eq 0) {
        Write-Error 'No Android device connected (adb devices shows none in "device" state). Start the emulator first.'
        exit 1
    }
    $Device = $devices[0]
    if ($devices.Count -gt 1) {
        Write-Host "App install    | several devices connected, using $Device (pass -Device to choose)"
    }
}

# ── Install if missing ────────────────────────────────────────────────────────
$installed = (Invoke-Adb -s $Device shell pm path $package).Lines -match '^package:'
if ($installed -and -not $Reinstall) {
    Write-Host "App install    | $package already installed on $Device, skipping"
    exit 0
}

if (-not (Test-Path $Apk)) {
    Write-Error "$package is not installed on $Device and the APK wasn't found at: $Apk"
    exit 1
}
$Apk = (Resolve-Path $Apk).Path

$action = if ($installed) { 'Reinstalling' } else { 'Installing' }
Write-Host "App install    | $action $package on $Device from $Apk (this can take a minute)..."
$result = Invoke-Adb -s $Device install -r $Apk
if ($result.Code -ne 0 -or -not ($result.Lines -match '^Success')) {
    Write-Error ("adb install failed:`n" + ($result.Lines -join "`n"))
    exit 1
}
Write-Host "App install    | done"
exit 0
