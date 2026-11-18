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

$appDataDirectory = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME "AppData\Roaming" }
$adc = Join-Path $appDataDirectory "gcloud\application_default_credentials.json"
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
    & npm.cmd run check:staging:services
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Staging cloud functions are not verified. The local site can open, but approvals and payments may fail."
    }
    Write-Host "SOUQNA: checking all ten approved categories (read only)..."
    & npm.cmd run check:staging:categories
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Ten active categories are not verified on real Staging. Check the administrator readiness panel."
    }
    Write-Host "SOUQNA: checking public staging Hosting (read only)..."
    & npm.cmd run check:staging:hosting
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "No verified remote staging site. This launcher starts a LOCAL server only."
    }
} else {
    Write-Warning "Cloud services and public hosting were not checked; the local site is NOT proof of production readiness."
}

Write-Host "Starting LOCAL SOUQNA Staging at http://127.0.0.1:5000"
Write-Host "Press Ctrl+C to stop. No deployment or billing action will be performed."
Invoke-Checked npx.cmd @(
    "firebase", "emulators:start",
    "--only", "hosting",
    "--project", "souqna-staging",
    "--config", "firebase.staging.config.json"
)
