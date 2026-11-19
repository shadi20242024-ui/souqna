import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { fetchStagingRules, STAGING_PROJECT } from "./check-staging-legal.mjs";

export const OWNER_EMAIL="shadi20242024@gmail.com";

export function assessStagingModerationRules(source) {
  assert.ok(typeof source==="string" && source.length>10,"Firestore rules source is required.");
  const start=source.indexOf("match /moderationAudit/{id}");
  if(start===-1)return "MODERATION_AUDIT_RULE_MISSING";
  const end=source.indexOf("match /",start+8);
  const section=source.slice(start,end===-1?undefined:end);
  if(!/allow\s+read\s*:\s*if\s+isAdmin\(\)\s*;/.test(section))
    return "MODERATION_AUDIT_ADMIN_READ_RULE_MISSING";
  if(!/function\s+isAdmin\(\)\s*\{\s*return\s+hasRole\("admin"\)\s*;?\s*\}/.test(source))
    return "ADMIN_ROLE_FUNCTION_NOT_VERIFIED";
  if(!/function\s+hasRole\(role\)/.test(source) || !/get\(currentUserPath\(\)\)\.data\.role\s*==\s*role/.test(source))
    return "ADMIN_ROLE_LOOKUP_NOT_VERIFIED";
  return "ADMIN_READ_RULE_PRESENT";
}

export function assessStagingModerationAccess({source,account,profile}){
  const rules=assessStagingModerationRules(source);
  if(!account || account.disabled)return {status:"AUTH_USER_NOT_READY",rules};
  if(!profile)return {status:"FIRESTORE_ADMIN_PROFILE_MISSING",rules};
  if(profile.role!=="admin")return {status:"ADMIN_ROLE_NOT_ACTIVE",rules};
  if(rules!=="ADMIN_READ_RULE_PRESENT")return {status:"DEPLOYED_RULES_OUTDATED",rules};
  return {
    status: "ELIGIBLE_BY_RULES_NOT_BROWSER_VERIFIED",
    rules,
    profileEmailMatchesAuth: String(profile.email||"").trim().toLowerCase()===String(account.email||"").trim().toLowerCase()
  };
}

async function main(){
  assert.equal(process.argv.length,2,"Read-only check takes no arguments.");
  for(const name of ["FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST","FIREBASE_EMULATOR_HUB"]){
    assert.ok(!process.env[name],"Unset emulator variables before checking real staging.");
  }
  for(const name of ["GOOGLE_CLOUD_PROJECT","GCLOUD_PROJECT","GCP_PROJECT"]){
    if(process.env[name])assert.equal(process.env[name],STAGING_PROJECT,name+" mismatch.");
  }
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const {initializeApp,applicationDefault,deleteApp}=require("firebase-admin/app");
  const {getAuth}=require("firebase-admin/auth");
  const {getFirestore}=require("firebase-admin/firestore");
  const credentials=applicationDefault();
  const app=initializeApp({credential:credentials,projectId:STAGING_PROJECT},
    "souqna-staging-moderation-read-only");
  try{
    const token=(await credentials.getAccessToken()).access_token;
    const source=await fetchStagingRules(fetch,token);
    const auth=getAuth(app);
    let account=null;
    try{account=await auth.getUserByEmail(OWNER_EMAIL);}
    catch(e){if(e?.code!=="auth/user-not-found")throw e;}
    const profile=account ? await getFirestore(app).collection("users").doc(account.uid).get():null;
    const result=assessStagingModerationAccess({
      source,
      account,
      profile:profile?.exists?profile.data():null
    });
    console.log("SOUQNA STAGING MODERATION READ CHECK:",result.status);
    console.log("DEPLOYED_RULES:",result.rules);
    if(result.profileEmailMatchesAuth===false)
      console.log("PROFILE_EMAIL_MISMATCH: Authentication and users/UID emails differ. Do not modify roles.");
    console.log("This checks deployed rules and a user profile, not the browser permission result.");
    console.log("READ ONLY. No Firebase rules, account, or Firestore records changed.");
    if(result.status!=="ELIGIBLE_BY_RULES_NOT_BROWSER_VERIFIED")process.exitCode=2;
  }finally{await deleteApp(app);}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(e=>{
    console.error("STAGING MODERATION DIAGNOSTIC FAILED:",
      String(e?.code||e?.message||"unknown").replace(/[\r\n]/g," ").slice(0,180));
    process.exitCode=1;
  });
}
