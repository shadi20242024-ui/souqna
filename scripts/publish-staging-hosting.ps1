[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("souqna-staging")]
    [string]$ConfirmProject
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = "souqna-staging"
if ($ConfirmProject -cne $project) {
    throw "Only souqna-staging may be published."
}
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Invoke-Verified {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program verification or deployment failed with code $LASTEXITCODE. No production project was targeted."
    }
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw "Node.js is required." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm is required." }
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { throw "npx is required." }
if (-not $env:SOUQNA_ADMIN_EMAIL) {
    throw "SOUQNA_ADMIN_EMAIL must identify the existing administrator of souqna-staging. No passwords are required."
}
if ($env:GCLOUD_PROJECT -and $env:GCLOUD_PROJECT -ne $project) { throw "GCLOUD_PROJECT is not souqna-staging." }
if ($env:GOOGLE_CLOUD_PROJECT -and $env:GOOGLE_CLOUD_PROJECT -ne $project) { throw "GOOGLE_CLOUD_PROJECT is not souqna-staging." }
if ($env:FIRESTORE_EMULATOR_HOST -or $env:FIREBASE_AUTH_EMULATOR_HOST) {
    throw "Real staging publishing is forbidden while local Firebase emulator variables are set."
}

Write-Host "SOUQNA: installing local dependencies..."
Invoke-Verified npm.cmd @("install","--ignore-scripts","--no-audit","--no-fund")
Invoke-Verified npm.cmd @("install","--prefix","functions","--ignore-scripts","--no-audit","--no-fund")
Write-Host "SOUQNA: retrieving registered staging Web App without changing Firebase..."
Invoke-Verified npm.cmd @("run","setup:staging:auto")
Write-Host "SOUQNA: running isolated staging preflight..."
Invoke-Verified npm.cmd @("run","verify:staging")
Write-Host "SOUQNA: checking Cloud Functions and real administrator permissions..."
Invoke-Verified npm.cmd @("run","check:staging:services")
Invoke-Verified npm.cmd @("run","diagnose:staging:admin")
Write-Host "SOUQNA: verifying deployed Firestore consent rules BEFORE changing Hosting..."
Invoke-Verified npm.cmd @("run","check:staging:legal")
Write-Host "SOUQNA: publishing Hosting ONLY to the isolated test project..."
Invoke-Verified npx.cmd @("firebase","deploy","--only","hosting","--project",$project,"--config","firebase.staging.config.json","--non-interactive")
Write-Host "SOUQNA: checking actual public staging website..."
Invoke-Verified npm.cmd @("run","check:staging:hosting")
Write-Host "SOUQNA STAGING HOSTING PUBLISHED AND VERIFIED. Production souqna-sweida was not targeted."
