[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$target = Join-Path $root "functions\reset-staging-owner-password.cjs"
$project = "souqna-staging"
$account = "shadi20242024@gmail.com"

function Assert-ExitCode([string]$action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$action failed (exit code $LASTEXITCODE). No password change was confirmed."
    }
}

function Test-SelectedClient {
    param([string]$AdcPath,[string]$ExpectedClientId)
    if (-not (Test-Path -LiteralPath $AdcPath -PathType Leaf)) { return $false }
    try {
        $adc = Get-Content -Raw -LiteralPath $AdcPath -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if ($adc.type -ne "authorized_user") { return $false }
        return ([string]$adc.client_id -ceq $ExpectedClientId)
    } catch {
        return $false
    }
}

function Get-LocalDesktopClient {
    $downloads = Join-Path $env:USERPROFILE "Downloads"
    if (-not (Test-Path -LiteralPath $downloads -PathType Container)) {
        throw "The Downloads folder was not found. Download the Desktop OAuth client JSON for souqna-staging first."
    }
    $files = @(Get-ChildItem -LiteralPath $downloads -Filter "client_secret_*.json" -File -ErrorAction Stop |
        Sort-Object LastWriteTime -Descending)
    foreach ($item in $files) {
        try {
            $json = Get-Content -Raw -LiteralPath $item.FullName -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            if ($null -eq $json.installed) { continue }
            if ($json.installed.PSObject.Properties.Name -contains "project_id") {
                if ([string]$json.installed.project_id -cne "souqna-staging") { continue }
            }
            $clientId = [string]$json.installed.client_id
            if ($clientId -match '^[A-Za-z0-9_-]+-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$') {
                return @{ path = $item.FullName; client_id = $clientId }
            }
        } catch {
            continue
        }
    }
    throw "No Desktop OAuth client JSON found in Downloads. Download it from Google Cloud > souqna-staging > Google Auth Platform > Clients. Do not send it to anyone."
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js is missing; install Node.js 22 or later."
}
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    throw "SOUQNA reset tool is missing. Update souqna-test from GitHub first."
}

Write-Host ""
Write-Host "SOUQNA STAGING - ONE-STEP OWNER RECOVERY"
Write-Host "Project: $project ONLY"
Write-Host "Account: $account"
Write-Host "No production change, service-account key, billing change, or email reset required."
Write-Host ""

if (-not $Apply) {
    & node.exe $target
    Assert-ExitCode "Local dry run"
    return
}

if (-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)) {
    throw "Google Cloud CLI (gcloud.cmd) is missing."
}

$client = Get-LocalDesktopClient
$adcPath = Join-Path $env:APPDATA "gcloud\application_default_credentials.json"
$env:GOOGLE_APPLICATION_CREDENTIALS = $null

if (-not (Test-SelectedClient -AdcPath $adcPath -ExpectedClientId $client.client_id)) {
    Write-Host "Opening Google sign-in with the downloaded SOUQNA Desktop OAuth client..." -ForegroundColor Cyan
    Write-Host "Approve the Google consent prompt in your browser. The OAuth file remains on your computer."
    & gcloud.cmd auth application-default login "--client-id-file=$($client.path)"
    Assert-ExitCode "OAuth sign-in"
    if (-not (Test-SelectedClient -AdcPath $adcPath -ExpectedClientId $client.client_id)) {
        throw "Google saved a different OAuth client. The password recovery stopped before any account change."
    }
} else {
    Write-Host "Verified: ADC already uses your Desktop OAuth client." -ForegroundColor Green
}

$adc = Get-Content -Raw -LiteralPath $adcPath | ConvertFrom-Json
if (($adc.PSObject.Properties.Name -notcontains "quota_project_id") -or ([string]$adc.quota_project_id -cne $project)) {
    Write-Host "Setting ADC quota project to $project (no billing activation)..."
    & gcloud.cmd auth application-default set-quota-project $project
    Assert-ExitCode "ADC quota project configuration"
}

if (-not (Test-Path -LiteralPath (Join-Path $root "functions\node_modules\firebase-admin") -PathType Container)) {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm.cmd is missing; install Node.js 22 or later."
    }
    Write-Host "Installing the existing Firebase Admin project dependencies..."
    & npm.cmd --prefix functions install --ignore-scripts --no-audit --no-fund
    Assert-ExitCode "Firebase dependencies installation"
}

Write-Host "Checking the existing owner account (READ ONLY)..." -ForegroundColor Cyan
$env:SOUQNA_STAGING_CONFIRMED_OWNER_EMAIL = $null
$env:SOUQNA_STAGING_CONFIRMED_OWNER_UID = $null
& node.exe $target --check-auth
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "The configured owner email was not found. Inspecting the staging user inventory (READ ONLY)..." -ForegroundColor Yellow
    $inventoryText = & node.exe $target --inspect-auth-users
    Assert-ExitCode "Read-only staging user inventory"
    $inventory = ($inventoryText -join "`n") | ConvertFrom-Json
    if ([string]$inventory.project -cne $project) {
        throw "Firebase inventory project mismatch. No password was changed."
    }
    if ($inventory.user_count -ne 1 -or $null -eq $inventory.account) {
        throw "No unique staging account was found. No password was changed. Inspect Firebase Authentication manually."
    }
    if ($inventory.account.disabled) {
        throw "The existing staging account is disabled. No password was changed."
    }
    $candidate = [string]$inventory.account.email
    $candidateUid = [string]$inventory.account.uid
    if ([string]::IsNullOrWhiteSpace($candidate) -or $candidateUid.Length -lt 8) {
        throw "Firebase returned an invalid staging account. No password was changed."
    }
    Write-Host "The single account in souqna-staging is:" -ForegroundColor Yellow
    Write-Host ("Email: " + $candidate)
    Write-Host ("UID suffix: " + $candidateUid.Substring($candidateUid.Length - 6))
    Write-Host "Verify this is YOUR account in Firebase Console > Authentication > Users." -ForegroundColor Yellow
    $enteredEmail = (Read-Host "Confirm account: type the full email displayed above").Trim()
    if ($enteredEmail -cne $candidate) {
        throw "Owner did not confirm the exact account email. No password was changed."
    }
    $enteredUidSuffix = (Read-Host "Confirm account: type the six-character UID suffix displayed above").Trim()
    if ($enteredUidSuffix -cne $candidateUid.Substring($candidateUid.Length - 6)) {
        throw "Owner did not confirm the UID. No password was changed."
    }
    $env:SOUQNA_STAGING_CONFIRMED_OWNER_EMAIL = $candidate
    $env:SOUQNA_STAGING_CONFIRMED_OWNER_UID = $candidateUid
    Write-Host "Verifying the explicitly confirmed unique staging account..." -ForegroundColor Cyan
    & node.exe $target --check-auth
    Assert-ExitCode "Confirmed owner Firebase Auth check"
}
Write-Host ""
Write-Host "Account check passed. Choose a NEW password of at least 12 characters." -ForegroundColor Green
Write-Host "You will type the password only on this computer; it will not display on screen."
$secret = Read-Host "New password" -AsSecureString
$confirmation = Read-Host "Confirm new password" -AsSecureString
$firstPtr = [IntPtr]::Zero
$secondPtr = [IntPtr]::Zero
$first = $null
$second = $null
$oldOutputEncoding = $OutputEncoding
try {
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
    $first = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
    $second = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
    if ($first -cne $second) { throw "The two passwords do not match. No account was changed." }
    if ($first.Length -lt 12 -or $first.Length -gt 128) {
        throw "Choose 12 to 128 characters. No account was changed."
    }
    if ($first -match "[\r\n]") { throw "Newline characters are not allowed. No account was changed." }
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $first | & node.exe $target --execute --confirm RESET-OWNER-PASSWORD:souqna-staging
    Assert-ExitCode "Firebase password update"
    Write-Host "Password update completed for the existing staging account." -ForegroundColor Green
} finally {
    $OutputEncoding = $oldOutputEncoding
    if ($firstPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
    }
    if ($secondPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
    }
    Remove-Variable first,second,secret,confirmation,firstPtr,secondPtr -ErrorAction SilentlyContinue
    $env:SOUQNA_STAGING_CONFIRMED_OWNER_EMAIL = $null
    $env:SOUQNA_STAGING_CONFIRMED_OWNER_UID = $null
}
