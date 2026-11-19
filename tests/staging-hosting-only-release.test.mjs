import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const script=readFileSync(new URL("../scripts/publish-staging-frontend-only.ps1",import.meta.url),"utf8");
test("staging Hosting script refuses production and dirty checkouts",()=>{
 assert.match(script,/\$project = "souqna-staging"/);
 assert.match(script,/ValidateSet\("souqna-staging"\)/);
 assert.match(script,/feature\/legal-help-2026-11-19/);
 assert.match(script,/git\.exe status --porcelain/);
 assert.match(script,/FIRESTORE_EMULATOR_HOST/);
 assert.match(script,/GOOGLE_CLOUD_PROJECT/);
 assert.doesNotMatch(script,/--only","functions/);
 assert.doesNotMatch(script,/--only","firestore/);
 assert.doesNotMatch(script,/souqna-sweida/);
});
test("staging Hosting publish requires explicit approval, live legal and admin checks",()=>{
 assert.match(script,/\[switch\]\$Publish/);
 assert.match(script,/ConfirmProject -cne \$project/);
 assert.match(script,/PUBLISH-STAGING-HOSTING/);
 assert.match(script,/run","verify:staging/);
 assert.match(script,/run","check:staging:legal/);
 assert.match(script,/run","diagnose:staging:admin/);
 assert.match(script,/run","check:staging:categories/);
 assert.match(script,/firebase","deploy","--only","hosting","--project",\$project/);
 assert.match(script,/run","check:staging:hosting/);
 assert.match(script,/run","check:staging:guide-assets/);
 assert.ok(script.indexOf('if (-not $Publish) {')<script.indexOf('Invoke-Verified npx.cmd @("firebase","deploy"'));
});
