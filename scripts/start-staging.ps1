[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipCloudCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed. Install a supported current Node.js version, then run this launcher again."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm is missing. Repair your Node.js installation."
}

$nodeMajor = [int](& node.exe -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) {
    throw "Node.js 22 or later is required. Installed version is $nodeMajor."
}
Write-Host "SOUQNA: installing local project dependencies..."
Invoke-Checked npm.cmd @("install", "--ignore-scripts", "--no-audit", "--no-fund")
Invoke-Checked npm.cmd @("install", "--prefix", "functions", "--ignore-scripts", "--no-audit", "--no-fund")

$adc = Join-Path $env:APPDATA "gcloud\application_default_credentials.json"
if (-not (Test-Path $adc) -and -not $env:GOOGLE_APPLICATION_CREDENTIALS) {
    if (-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)) {
        throw "Google Cloud CLI is required for the first setup. Install gcloud, then run this launcher again."
    }
    Write-Host "Opening Google Cloud sign-in for the staging project only..."
    Invoke-Checked gcloud.cmd @("auth", "application-default", "login")
}
Write-Host "SOUQNA: loading the existing souqna-staging Firebase Web App..."
Invoke-Checked npm.cmd @("run", "setup:staging:auto")
Write-Host "SOUQNA: verifying the isolated staging bundle..."
Invoke-Checked npm.cmd @("run", "verify:staging")

if (-not $SkipTests) {
    Write-Host "SOUQNA: verifying admin, moderation and hosting isolation..."
    Invoke-Checked npm.cmd @("run", "test:admin")
    Invoke-Checked npm.cmd @("run", "test:build-isolation")
}

if (-not $SkipCloudCheck) {
    Write-Host "SOUQNA: checking real staging backend availability (read only)..."
    Invoke-Checked npm.cmd @("run", "check:staging:services")
} else {
    Write-Warning "Cloud services were not checked. Moderation and payments may be unavailable."
}

Write-Host "Starting SOUQNA Staging at http://127.0.0.1:5000"
Write-Host "Press Ctrl+C to stop. No deployment or billing action will be performed."
Invoke-Checked npx.cmd @(
    "firebase", "emulators:start",
    "--only", "hosting",
    "--project", "souqna-staging",
    "--config", "firebase.staging.config.json"
)
