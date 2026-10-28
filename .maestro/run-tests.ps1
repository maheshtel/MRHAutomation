# Usage: powershell -NoProfile -File .maestro/run-tests.ps1 [-Flow <path>] [-Format <format>] [-Output <path>]
param(
    [string]$Flow   = ".maestro/flows",
    [string]$Format = "junit",
    [string]$Output = ""
)

# Load .env.test and build --env args for maestro
$envArgs = @()
if (Test-Path ".env.test") {
    Get-Content ".env.test" | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key   = $parts[0].Trim()
        $value = $parts[1].Trim()
        $envArgs += "--env"
        $envArgs += "$key=$value"
    }
}

# Create reports directory
$reportDir = "test-results"
if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir | Out-Null }

# Set default output based on format
if (-not $Output) {
    if ($Format -eq "html") {
        $Output = "build/report.html"
    } else {
        $Output = "$reportDir/maestro-report.xml"
    }
}

# Ensure output directory exists
$outputDir = Split-Path $Output -Parent
if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

& maestro test @envArgs --format $Format --output $Output $Flow
exit $LASTEXITCODE