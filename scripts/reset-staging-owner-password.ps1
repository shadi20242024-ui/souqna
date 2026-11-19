[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$target = Join-Path $root "functions\reset-staging-owner-password.cjs"

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js is missing. Install Node.js 22+ and try again."
}
if (-not (Test-Path $target)) {
    throw "Missing reset tool: update the souqna-test Git branch first."
}

Write-Host ""
Write-Host "SOUQNA STAGING - OWNER PASSWORD RECOVERY"
Write-Host "Project: souqna-staging ONLY"
Write-Host "Account: shadi20242024@gmail.com"
Write-Host "No existing account will be deleted, and production will not be accessed."
Write-Host ""

if (-not $Apply) {
    & node.exe $target
    exit $LASTEXITCODE
}

Write-Host "Enter a NEW password of at least 12 characters. Input will be hidden."
$secret = Read-Host "New password" -AsSecureString
$confirmation = Read-Host "Confirm new password" -AsSecureString
$firstPtr = [IntPtr]::Zero
$secondPtr = [IntPtr]::Zero
$first = $null
$second = $null
try {
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
    $first = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
    $second = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
    if ($first -cne $second) { throw "Passwords do not match. No account was changed." }
    if ($first.Length -lt 12) { throw "New password must be at least 12 characters. No account was changed." }
    $first | & node.exe $target --execute --confirm RESET-OWNER-PASSWORD:souqna-staging
    if ($LASTEXITCODE -ne 0) { throw "Firebase refused the password update. Check the error code above and project permissions." }
} finally {
    if ($firstPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
    }
    if ($secondPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
    }
    Remove-Variable first,second,secret,confirmation,firstPtr,secondPtr -ErrorAction SilentlyContinue
}
