[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("souqna-staging")]
    [string]$ConfirmProject,
    [Parameter(Mandatory = $true)]
    [ValidateSet("2026-11-19")]
    [string]$ApprovedLegalVersion
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = "souqna-staging"
$version = "2026-11-19"
if ($ConfirmProject -cne $project -or $ApprovedLegalVersion -cne $version) {
    throw "The exact staging project and reviewed legal version must be approved."
}
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Invoke-Verified {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed (exit $LASTEXITCODE). Staging release stopped."
    }
}

foreach ($command in @("git.exe","node.exe","npm.cmd","npx.cmd")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command is required for a verified release on Windows."
    }
}
if (-not $env:SOUQNA_ADMIN_EMAIL) {
    throw "Set SOUQNA_ADMIN_EMAIL for the existing staging administrator. Never send passwords."
}
if (($env:GCLOUD_PROJECT -and $env:GCLOUD_PROJECT -cne $project) -or
    ($env:GOOGLE_CLOUD_PROJECT -and $env:GOOGLE_CLOUD_PROJECT -cne $project)) {
    throw "Cloud project environment must not target another project."
}
if ($env:FIRESTORE_EMULATOR_HOST -or $env:FIREBASE_AUTH_EMULATOR_HOST -or $env:FIREBASE_EMULATOR_HUB) {
    throw "Unset emulator variables before checking live staging."
}
$branch = (& git.exe rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -cne "feature/legal-help-2026-11-19") {
    throw "Check out feature/legal-help-2026-11-19 before starting the Staging legal release."
}
$status = & git.exe status --porcelain
if ($LASTEXITCODE -ne 0 -or $status) {
    throw "The checkout must be clean before publishing staging."
}
Write-Host "SOUQNA Staging release: verified project $project; legal version $version."
Write-Host "Installing project dependencies; no cloud changes..."
Invoke-Verified npm.cmd @("install","--ignore-scripts","--no-audit","--no-fund")
Invoke-Verified npm.cmd @("install","--prefix","functions","--ignore-scripts","--no-audit","--no-fund")
Write-Host "Running tests and emulator checks before any deployment..."
Invoke-Verified npm.cmd @("test")
Write-Host "Building isolated Staging release and checking Web App configuration..."
Invoke-Verified npm.cmd @("run","setup:staging:auto")
Invoke-Verified npm.cmd @("run","verify:staging")
Write-Host "Validating existing Staging backend/admin/categories..."
Invoke-Verified npm.cmd @("run","check:staging:services")
Invoke-Verified npm.cmd @("run","diagnose:staging:admin")
Invoke-Verified npm.cmd @("run","check:staging:categories")
Write-Host "Backing up the CURRENT deployed Staging rules to the ignored local artifacts directory..."
Invoke-Verified node.exe @("scripts/backup-staging-rules.mjs")

$rulesPublished = $false
try {
    Write-Host "Deploying Firestore security rules ONLY to souqna-staging..."
    Invoke-Verified npx.cmd @("firebase","deploy","--only","firestore:rules","--project",$project,
        "--config","firebase.staging.config.json","--non-interactive")
    $rulesPublished = $true
    Write-Host "Verifying the deployed legal consent version via read-only Firebase Rules API..."
    Invoke-Verified npm.cmd @("run","check:staging:legal")
    Write-Host "Publishing Hosting ONLY using the existing audited staging gate..."
    & (Join-Path $PSScriptRoot "publish-staging-hosting.ps1") -ConfirmProject $project
    if (-not $?) { throw "Hosting script did not finish successfully." }
    Write-Host "Checking full Staging readiness (including live Hosting and consent)..."
    Invoke-Verified npm.cmd @("run","check:staging:readiness")
    Write-Host "SOUQNA STAGING LEGAL AND HOSTING RELEASE VERIFIED. Production was untouched."
}
catch {
    if ($rulesPublished) {
        Write-Warning "The STAGING Firestore rules have been deployed, but Hosting/verification failed."
        Write-Warning "Older staging registration pages may now be incompatible with the rules."
        Write-Warning "Inspect the error and fix Hosting; the previous rules are saved under artifacts/staging-rules-backups/."
        Write-Warning "No production rollback or automatic weakening of security rules was attempted."
    }
    throw
}
