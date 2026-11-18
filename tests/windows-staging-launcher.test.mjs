import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const script=readFileSync(new URL("../scripts/start-staging.ps1",import.meta.url),"utf8");
test("Windows staging launcher verifies the exact staging bundle",()=>{
  assert.ok(script.includes('Invoke-Checked npm.cmd @("run", "setup:staging:auto")'));
  assert.ok(script.includes('Invoke-Checked npm.cmd @("run", "verify:staging")'));
  assert.ok(script.includes('"--project", "souqna-staging"'));
  assert.ok(!script.includes("souqna-sweida"));
});
test("Cloud readiness warnings cannot prevent local browser preview",()=>{
  assert.ok(script.includes("& npm.cmd run check:staging:services"));
  assert.ok(script.includes("& npm.cmd run check:staging:hosting"));
  assert.ok(script.includes('Write-Warning "Staging cloud functions are not verified.'));
  assert.ok(script.includes("LOCAL SOUQNA Staging at http://127.0.0.1:5000"));
  assert.ok(script.includes('Invoke-Checked npx.cmd @('));
});
