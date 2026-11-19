import assert from "node:assert/strict";
import {test} from "node:test";
import {assessStagingModerationRules,assessStagingModerationAccess,OWNER_EMAIL} from "../scripts/check-staging-moderation-access.mjs";
import {readFileSync} from "node:fs";

const local=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
const account={uid:"owner123456",email:OWNER_EMAIL,disabled:false};
const profile={role:"admin",email:OWNER_EMAIL};
test("source rules include strict admin-only moderation audit read",()=>{
  assert.equal(assessStagingModerationRules(local),"ADMIN_READ_RULE_PRESENT");
  assert.equal(assessStagingModerationAccess({source:local,account,profile}).status,
    "ELIGIBLE_BY_RULES_NOT_BROWSER_VERIFIED");
});
test("old rules with no audit read report deployed mismatch, not a user role problem",()=>{
  const stale=local.replace(/match \/moderationAudit\/\{id\}\s*\{\s*allow read: if isAdmin\(\);/,
    "match /moderationAudit/{id} { allow read: if false;");
  assert.equal(assessStagingModerationRules(stale),"MODERATION_AUDIT_ADMIN_READ_RULE_MISSING");
  assert.deepEqual(assessStagingModerationAccess({source:stale,account,profile}),{
    status:"DEPLOYED_RULES_OUTDATED",rules:"MODERATION_AUDIT_ADMIN_READ_RULE_MISSING"
  });
});
test("profile role, account and email state are distinguished without writes",()=>{
  assert.equal(assessStagingModerationAccess({source:local,account:null,profile}).status,"AUTH_USER_NOT_READY");
  assert.equal(assessStagingModerationAccess({source:local,account,profile:null}).status,"FIRESTORE_ADMIN_PROFILE_MISSING");
  assert.equal(assessStagingModerationAccess({source:local,account,profile:{role:"user"}}).status,"ADMIN_ROLE_NOT_ACTIVE");
  const result=assessStagingModerationAccess({source:local,account,
    profile:{role:"admin",email:"shadi20242024@gmail.om"}});
  assert.equal(result.status,"ELIGIBLE_BY_RULES_NOT_BROWSER_VERIFIED");
  assert.equal(result.profileEmailMatchesAuth,false);
});
