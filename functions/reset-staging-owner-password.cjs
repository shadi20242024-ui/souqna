"use strict";
const assert=require("node:assert/strict");

const PROJECT="souqna-staging";
const ACCOUNT_EMAIL="shadi20242024@gmail.com";
const {resolveStagingOwner}=require("./owner-auth-lookup.cjs");
const CONFIRMATION="RESET-OWNER-PASSWORD:souqna-staging";
const args=process.argv.slice(2);
const execute=args.includes("--execute");
const checkOnly=args.length===1 && args[0]==="--check-auth";

function requireSafeArgs(){
  const valid=args.length===0 || checkOnly || (
    args.length===3 &&
    args[0]==="--execute" &&
    args[1]==="--confirm" &&
    args[2]===CONFIRMATION
  );
  assert.ok(valid,"Usage: node functions/reset-staging-owner-password.cjs [--execute --confirm "+CONFIRMATION+"]");
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    !process.env.FIREBASE_EMULATOR_HUB,"Unset all Firebase emulator variables before changing the real staging account.");
  for(const env of ["GOOGLE_CLOUD_PROJECT","GCLOUD_PROJECT","GCP_PROJECT","FIREBASE_CONFIG"]){
    const value=process.env[env];
    if(!value)continue;
    if(env==="FIREBASE_CONFIG"){
      assert.ok(!value.includes("souqna-sweida"),"Production Firebase config must not be active.");
      continue;
    }
    assert.equal(value,PROJECT,env+" must match "+PROJECT);
  }
}
requireSafeArgs();

if(!execute && !checkOnly){
  console.log("SOUQNA OWNER PASSWORD RESET DRY RUN");
  console.log("Target: "+PROJECT+" / "+ACCOUNT_EMAIL);
  console.log("No connection to Firebase, no password read, no user changed.");
  process.exit(0);
}

(async()=>{
  if(checkOnly){
    const {initializeApp,applicationDefault,deleteApp}=require("firebase-admin/app");
    const {getAuth}=require("firebase-admin/auth");
    const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},"souqna-owner-password-preflight");
    try{
      const user=await resolveStagingOwner(getAuth(app),ACCOUNT_EMAIL);
      assert.equal(user.email?.toLowerCase(),ACCOUNT_EMAIL);
      assert.ok(user.uid && !user.disabled,"Staging owner account is missing or disabled.");
      console.log("SOUQNA STAGING OWNER AUTH READ CHECK: PASS");
      console.log("Existing owner account is readable. No password or account information was changed.");
    }finally{await deleteApp(app);}
    return;
  }
  assert.ok(!process.stdin.isTTY,
    "Pipe your new password through standard input; never put a password in the command line.");
  const chunks=[];
  let total=0;
  for await (const chunk of process.stdin){
    total+=chunk.length;
    assert.ok(total<=1024,"The password input exceeds the safe size limit.");
    chunks.push(chunk);
  }
  let password=Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/,"");
  assert.ok(password.length>=12 && password.length<=128 && !/[\r\n]/.test(password),
    "Choose a password with 12 to 128 characters and no line breaks.");
  const {initializeApp,applicationDefault,deleteApp}=require("firebase-admin/app");
  const {getAuth}=require("firebase-admin/auth");
  const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},"souqna-owner-password-reset");
  try{
    const auth=getAuth(app);
    const user=await resolveStagingOwner(auth,ACCOUNT_EMAIL);
    assert.equal(user.email?.toLowerCase(),ACCOUNT_EMAIL);
    assert.ok(user.uid && !user.disabled,"Owner account is missing or disabled; no changes made.");
    await auth.updateUser(user.uid,{password});
    console.log("SUCCESS: staging owner password updated for existing Firebase Auth account.");
    console.log("Account UID is unchanged. Firestore roles, documents and live production are untouched.");
  }finally{
    password="";
    await deleteApp(app);
  }
})().catch(error=>{
  // Never print request payloads, access tokens, or password-bearing error objects.
  const code=String(error?.code||"AUTH_UPDATE_FAILED").replace(/[^a-z0-9/_-]/gi,"").slice(0,80);
  console.error("SOUQNA STAGING RESET FAILED: "+code);
  if(code==="auth/internal-error"){
    console.error("Authentication API rejected the local credentials or reported an internal error.");
    console.error("Check that ADC uses the project Desktop OAuth client and that you have permission to manage staging Auth.");
  }else if(["auth/owner-email-mismatch","auth/staging-user-inventory-empty","auth/ambiguous-owner","auth/owner-scan-limit"].includes(code)){
    console.error("STAGING AUTH DIAGNOSTIC: "+String(error.message||"Account mismatch").slice(0,460));
    console.error("Firebase Authentication Console: https://console.firebase.google.com/project/souqna-staging/authentication/users");
    console.error("Do not create or delete users to bypass this check.");
  }else{
    console.error("Check Google Cloud authentication/permissions for souqna-staging.");
  }
  console.error("No account was deleted. Do not assume the password changed.");
  process.exitCode=1;
});
