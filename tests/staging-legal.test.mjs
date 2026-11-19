import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  verifyLegalRules, fetchStagingRules, FIRESTORE_RELEASE, STAGING_PROJECT
} from "../scripts/check-staging-legal.mjs";
import { GUIDE_VERSION } from "../assets/souqna-guide.js";

const rules=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
test("staging legal gate validates matching agreement version in local rules",()=>{
  assert.equal(verifyLegalRules(rules),"READY");
  assert.equal(verifyLegalRules(rules,"1999-01-01"),"LEGAL_VERSION_INVALID");
  assert.equal(verifyLegalRules(rules.replaceAll(GUIDE_VERSION,"2026-01-01")),"CONSENT_VERSION_MISMATCH");
  assert.equal(verifyLegalRules(rules.replace("acceptedAt == request.time","acceptedAt == 1")),"CONSENT_TIMESTAMP_GUARD_MISSING");
  assert.equal(verifyLegalRules("allow read: if true;"),"USER_RULES_MISSING");
  assert.equal(verifyLegalRules(rules.replace('request.resource.data.stars == 0','request.resource.data.stars == 100')),"ACCOUNT_GUARD_MISSING");
});
test("read-only rules fetch uses exactly staging GET endpoints and refuses foreign releases",async()=>{
  const paths=[];
  const get=async(url,options)=>{
    paths.push({url,method:options.method,project:options.headers["x-goog-user-project"]});
    assert.equal(options.method,"GET");
    assert.equal(options.headers["x-goog-user-project"],STAGING_PROJECT);
    return {ok:true,json:async()=>url.endsWith("/"+FIRESTORE_RELEASE)?
      {rulesetName:"projects/souqna-staging/rulesets/staging-123"}:
      {name:"projects/souqna-staging/rulesets/staging-123",source:{files:[{content:rules}]}}};
  };
  assert.equal(await fetchStagingRules(get,"test-token"),rules);
  assert.equal(paths.length,2);
  assert.ok(paths[0].url.endsWith("/"+FIRESTORE_RELEASE));
  assert.ok(paths[1].url.endsWith("/projects/souqna-staging/rulesets/staging-123"));
  const foreign=async()=>({ok:true,json:async()=>({rulesetName:"projects/souqna-sweida/rulesets/production"})});
  await assert.rejects(fetchStagingRules(foreign,"test-token"),/FIRESTORE_RULESET_NOT_VERIFIED/);
});
test("failed or unauthorized Firebase Rules reads must block staging readiness",async()=>{
  const fail=async()=>({ok:false,status:403});
  await assert.rejects(fetchStagingRules(fail,"test-token"),/FIREBASE_RULES_READ_HTTP_403/);
});
