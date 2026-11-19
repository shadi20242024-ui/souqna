[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("souqna-sweida")]
  [string]$ConfirmProject,
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-f0-9]{40}$")]
  [string]$ApprovedCommit,
  [switch]$Publish
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = "souqna-sweida"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Invoke-Checked {
  param([string]$Command,[string[]]$Arguments)
  & $Command @Arguments
  if($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE. Release stopped."
  }
}

foreach($command in @("git.exe","node.exe","npm.cmd","npx.cmd")){
  if(-not (Get-Command $command -ErrorAction SilentlyContinue)){throw "Missing prerequisite: $command"}
}
$nodeMajor=[int](& node.exe -p "process.versions.node.split('.')[0]")
if($nodeMajor -lt 22){throw "Node.js 22 or later required."}
if($env:FIRESTORE_EMULATOR_HOST -or $env:FIREBASE_AUTH_EMULATOR_HOST -or $env:FIREBASE_EMULATOR_HUB){
  throw "Cannot run release checks with Firebase emulators enabled."
}
if(($env:GCLOUD_PROJECT -and $env:GCLOUD_PROJECT -cne $project) -or
   ($env:GOOGLE_CLOUD_PROJECT -and $env:GOOGLE_CLOUD_PROJECT -cne $project)){
  throw "Cloud context points to a different project."
}
$branch=(& git.exe branch --show-current).Trim()
$sha=(& git.exe rev-parse HEAD).Trim()
$status=& git.exe status --porcelain
if($LASTEXITCODE -ne 0 -or $branch -cne "main" -or $sha -cne $ApprovedCommit -or $status){
  throw "Release requires a clean main branch with HEAD exactly equal to ApprovedCommit."
}
Write-Host "SOUQNA release review: project $project, commit $sha, publish requested: $Publish"
Write-Host "No cloud writes will run until ALL checks and explicit approval have passed."

Invoke-Checked npm.cmd @("install","--package-lock=false","--ignore-scripts","--no-audit","--no-fund")
Invoke-Checked npm.cmd @("install","--prefix","functions","--package-lock=false","--ignore-scripts","--no-audit","--no-fund")
Invoke-Checked npm.cmd @("test")
$env:SOUQNA_PRODUCTION_BUILD_APPROVED = "souqna-sweida:2026-11-19"
Invoke-Checked npm.cmd @("run","build:production")
Invoke-Checked npm.cmd @("run","preflight:production")
Write-Host "Verifying actual staging plus 19 documented operator acceptance checks and all owner sign-offs..."
Invoke-Checked npm.cmd @("run","preflight:launch")
Write-Host "Taking an immutable local snapshot of CURRENT production Firestore rules..."
Invoke-Checked npm.cmd @("run","backup:production:rules")

if(-not $Publish){
  Write-Host "SOUQNA PRODUCTION PREFLIGHT COMPLETE. No cloud writes performed."
  Write-Host "To publish later, owner must approve a specific commit and explicitly use -Publish."
  return
}
if($env:SOUQNA_APPROVE_LIVE_WRITE -cne ($project+":"+$sha)){
  throw "Explicit per-commit live approval absent or mismatched."
}
Write-Host "Deploying EXACTLY the three approved callable functions to production..."
$cloudChanged=$false
try{
  # Existing users may be affected; complete this during an announced maintenance window.
  Invoke-Checked npx.cmd @("firebase","deploy","--only","functions:souqnaFinance,functions:souqnaMarketplace,functions:souqnaModeration",
    "--project",$project,"--config","firebase.json","--non-interactive")
  $cloudChanged=$true
  Invoke-Checked npm.cmd @("run","check:production:services")
  Write-Host "Deploying Firestore security rules to the exact production project..."
  Invoke-Checked npx.cmd @("firebase","deploy","--only","firestore:rules","--project",$project,
    "--config","firebase.json","--non-interactive")
  Invoke-Checked npm.cmd @("run","check:production:legal")
  Write-Host "Deploying only audited Hosting package..."
  Invoke-Checked npx.cmd @("firebase","deploy","--only","hosting","--project",$project,
    "--config","firebase.json","--non-interactive")
  Invoke-Checked npm.cmd @("run","check:production:hosting")
  Write-Host "SOUQNA PRODUCTION HOSTING AND READ-ONLY SERVICE CHECKS PASSED."
  Write-Host "Owner must STILL complete authenticated post-release registration, roles, payments, PWA and monitoring checks."
}catch{
  if($cloudChanged){
    Write-Warning "Production may have been PARTIALLY UPDATED. Pause new manual payments and review deployed functions/rules/Hosting."
    Write-Warning "Do not blindly roll back rules or replay paid operations. Use isolated backup and compatibility runbook."
  }else{
    Write-Warning "No completed Cloud Functions deployment was confirmed by this script; review logs to verify remote state."
  }
  throw
}
