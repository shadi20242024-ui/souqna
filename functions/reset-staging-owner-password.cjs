"use strict";
const assert=require("node:assert/strict");

const PROJECT="souqna-staging";
const ACCOUNT_EMAIL="shadi20242024@gmail.com";
const CONFIRMATION="RESET-OWNER-PASSWORD:souqna-staging";
const args=process.argv.slice(2);
const execute=args.includes("--execute");

function requireSafeArgs(){
  const valid=args.length===0 || (
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

if(!execute){
  console.log("SOUQNA OWNER PASSWORD RESET DRY RUN");
  console.log("Target: "+PROJECT+" / "+ACCOUNT_EMAIL);
  console.log("No connection to Firebase, no password read, no user changed.");
  process.exit(0);
}

(async()=>{
  assert.equal(process.stdin.isTTY,false,
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
    const user=await auth.getUserByEmail(ACCOUNT_EMAIL);
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
  console.error("Check Google Cloud authentication/permissions for souqna-staging. No account was deleted.");
  process.exitCode=1;
});
