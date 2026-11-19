import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script=readFileSync(new URL("../scripts/publish-staging-hosting.ps1",import.meta.url),"utf8");

test("staging Hosting publish requires explicit exact project and owner",()=>{
  assert.match(script,/\[ValidateSet\("souqna-staging"\)\]/);
  assert.match(script,/\$ConfirmProject -cne \$project/);
  assert.match(script,/SOUQNA_ADMIN_EMAIL/);
  assert.match(script,/diagnose:staging:admin/);
  assert.match(script,/check:staging:services/);
  assert.match(script,/check:staging:legal/);
});
test("publishing command cannot target production or deploy functions",()=>{
  assert.ok(script.includes('"--only","hosting","--project",$project'));
  assert.ok(script.includes('"firebase.staging.config.json"'));
  assert.ok(!script.includes('"--only","functions"'));
  assert.ok(!script.includes('"souqna-sweida"'));
  const serviceCheck=script.indexOf('"check:staging:services"');
  const adminCheck=script.indexOf('"diagnose:staging:admin"');
  const legalCheck=script.indexOf('"check:staging:legal"');
  const publish=script.indexOf('"firebase","deploy"');
  assert.ok(serviceCheck>=0&&adminCheck>serviceCheck&&legalCheck>adminCheck&&publish>legalCheck);
  assert.ok(script.includes('"check:staging:hosting"'));
});
