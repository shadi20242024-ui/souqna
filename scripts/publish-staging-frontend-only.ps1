[CmdletBinding()]
param(
    [switch]$Publish,
    [ValidateSet("souqna-staging")]
    [string]$ConfirmProject
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = "souqna-staging"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Invoke-Verified {
    param([string]$Program,[string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed ($LASTEXITCODE). Staging Hosting release stopped."
    }
}
foreach($command in @("git.exe","node.exe","npm.cmd","npx.cmd")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Missing required program: $command"
    }
}
$branch = (& git.exe rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -cne "feature/legal-help-2026-11-19") {
    throw "Use the reviewed souqna-test branch feature/legal-help-2026-11-19."
}
$changes = & git.exe status --porcelain
if ($LASTEXITCODE -ne 0 -or $changes) {
    throw "Git checkout is not clean. Review local changes before building the published bundle."
}
foreach($name in @("FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST","FIREBASE_EMULATOR_HUB")) {
    if ([Environment]::GetEnvironmentVariable($name)) {
        throw "Firebase emulator environment variables must not be set."
    }
}
foreach($name in @("GOOGLE_CLOUD_PROJECT","GCLOUD_PROJECT","GCP_PROJECT")) {
    $value=[Environment]::GetEnvironmentVariable($name)
    if ($value -and $value -cne $project) {
        throw "$name points to a different Firebase project."
    }
}
Write-Host "SOUQNA STAGING HOSTING ONLY - pinned to $project" -ForegroundColor Cyan
Write-Host "This never deploys Functions, Firestore rules, or production."
Write-Host "WARNING: The published staging website can load before Cloud Functions become operational." -ForegroundColor Yellow
Write-Host "Advertising, paid actions and store creation may not work without a verified backend." -ForegroundColor Yellow

if ($Publish) {
    if ($ConfirmProject -cne $project) {
        throw "Publishing needs -ConfirmProject souqna-staging. No cloud change made."
    }
    $approval = (Read-Host "For a PUBLIC TEST WEBSITE only, type PUBLISH-STAGING-HOSTING").Trim()
    if ($approval -cne "PUBLISH-STAGING-HOSTING") {
        throw "Exact staging Hosting publication confirmation not provided."
    }
}else{
    Write-Host "DRY RUN: the website will be rebuilt and checked, with no cloud changes."
}

Write-Host "Retrieving the registered Staging Firebase Web App..."
Invoke-Verified npm.cmd @("run","setup:staging:auto")
Write-Host "Building isolated Staging site and verifying its configuration..."
Invoke-Verified npm.cmd @("run","verify:staging")
Write-Host "Checking live Staging legal rules before any public Hosting publication..."
Invoke-Verified npm.cmd @("run","check:staging:legal")
Write-Host "Checking administrator role and category readiness..."
$env:SOUQNA_ADMIN_EMAIL = "shadi20242024@gmail.com"
Invoke-Verified npm.cmd @("run","diagnose:staging:admin")
Invoke-Verified npm.cmd @("run","check:staging:categories")
Write-Host "All Hosting preflight gates passed." -ForegroundColor Green

if (-not $Publish) {
    Write-Host "DRY RUN COMPLETE. No deployment performed." -ForegroundColor Green
    Write-Host "To publish STAGING ONLY, use -Publish -ConfirmProject souqna-staging"
    return
}
Write-Host "Publishing ONLY dist/ to Firebase Hosting in souqna-staging..." -ForegroundColor Cyan
Invoke-Verified npx.cmd @("firebase","deploy","--only","hosting","--project",$project,
    "--config","firebase.staging.config.json","--non-interactive")
Write-Host "Verifying actual Staging site on BOTH default domains..."
Invoke-Verified npm.cmd @("run","check:staging:hosting")
Invoke-Verified npm.cmd @("run","check:staging:guide-assets")
Write-Host "SOUQNA STAGING HOSTING VERIFIED. No functions/rules were deployed." -ForegroundColor Green
Write-Host "Site: https://souqna-staging.web.app/"
