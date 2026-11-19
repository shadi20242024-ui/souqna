import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const ps=readFileSync(new URL("../scripts/reset-staging-owner-password.ps1",import.meta.url),"utf8");
const cmd=readFileSync(new URL("../Reset-SOUQNA-Password.cmd",import.meta.url),"utf8");
const js=readFileSync(new URL("../functions/reset-staging-owner-password.cjs",import.meta.url),"utf8");

test("one-click recovery requires real local Desktop OAuth credentials and never chooses production",()=>{
  assert.match(ps,/function Get-LocalDesktopClient/);
  assert.match(ps,/client_secret_\*\.json/);
  assert.match(ps,/\.installed\.client_id/);
  assert.match(ps,/function Test-SelectedClient/);
  assert.match(ps,/auth application-default login "--client-id-file=/);
  assert.match(ps,/set-quota-project \$project/);
  assert.match(ps,/\$project = "souqna-staging"/);
  assert.doesNotMatch(ps, /souqna-sweida/);
  assert.match(cmd,/reset-staging-owner-password\.ps1" -Apply/);
});
test("recovery verifies existing owner account READ-ONLY before requesting secret, and never bypasses authorization",()=>{
  assert.match(ps,/& node\.exe \$target --check-auth/);
  assert.match(js,/if\(checkOnly\)/);
  assert.match(js,/await getVerifiedOwner\(getAuth\(app\)\)/);
  assert.match(ps,/--inspect-auth-users/);
  assert.match(ps,/Type the CORRECT Gmail address displayed above to approve the email correction/);
  assert.match(ps,/\$candidate -cne "shadi20242024@gmail.om"/);
  assert.match(ps,/\$enteredEmail -cne \$account/);
  assert.match(ps,/\$env:SOUQNA_STAGING_REPAIR_EMAIL = \$account/);
  assert.match(ps,/\$env:SOUQNA_STAGING_REPAIR_EMAIL = \$null/);
  assert.match(ps,/Type the six-character UID suffix displayed above/);
  assert.match(ps,/SOUQNA_STAGING_CONFIRMED_OWNER_UID/);
  assert.match(js,/await auth\.updateUser\(user\.uid,\{password\}\)/);
  assert.ok(ps.indexOf("& node.exe $target --check-auth") < ps.indexOf('Read-Host "New password"'));
  assert.ok(ps.indexOf("Test-SelectedClient") < ps.indexOf("& node.exe $target --check-auth"));
  assert.match(ps,/Read-Host "New password" -AsSecureString/);
  assert.match(ps,/Read-Host "Confirm new password" -AsSecureString/);
  assert.match(ps,/ZeroFreeBSTR/);
  assert.doesNotMatch(ps,/service-account.*json|--impersonate-service-account/);
  assert.doesNotMatch(ps,/Write-Host \$first|Write-Output \$first/);
});
