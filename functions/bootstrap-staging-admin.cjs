"use strict";
const assert=require("node:assert/strict");
const {hostname}=require("node:os");

const args=process.argv.slice(2);
function opt(name){const at=args.indexOf(name);return at<0?null:args[at+1]||null}
const project=opt("--project");
const email=opt("--email");
const providedUid=opt("--uid");
const execute=args.includes("--execute");
const confirm=opt("--confirm");
const verifiedInConsole=args.includes("--verified-in-console");

assert.ok(typeof project==="string"&&/^[a-z][a-z0-9-]{4,40}$/.test(project),
  "Specify the isolated staging project with --project PROJECT_ID");
assert.notEqual(project,"souqna-sweida","Production project cannot be bootstrapped with this utility");
assert.notEqual(project,"souqna-preview-disabled","Preview project is not valid");
assert.ok(typeof email==="string"&&email.length<254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  "Specify an existing staging user account with --email EMAIL");
assert.ok(!args.includes("--production"),"Production bootstrapping is disabled");

if(providedUid!==null){
  assert.equal(project,"souqna-staging",
    "Manual UID bootstrap is restricted to the verified souqna-staging project");
  assert.match(providedUid,/^[a-zA-Z0-9_-]{8,128}$/,
    "Provide the exact Firebase Authentication User UID (not email or document auto-ID)");
}
const expectedConfirmation="ADMIN:"+project+":"+email+(providedUid?":"+providedUid:"");
console.log("SOUQNA staging owner profile setup for project:",project);
console.log("Existing Firebase Auth account required:",email);
if(providedUid){
  console.log("User UID provided for Firebase Console verification:",providedUid);
  console.log("IMPORTANT: --uid mode cannot independently read Firebase Auth. Verify UID and email");
  console.log("match in SOUQNA Staging > Authentication > Users before continuing.");
}
if(!execute){
  console.log("DRY RUN ONLY. No Firebase connection and no role change.");
  process.exit(0);
}

assert.equal(confirm,expectedConfirmation,
  "Execution requires explicit --confirm "+expectedConfirmation);
if(providedUid){
  assert.ok(verifiedInConsole,
    "Manual UID path requires --verified-in-console after cross-checking Auth UID/email");
}
assert.ok(process.env.FIRESTORE_EMULATOR_HOST||
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  "Explicit staging emulator/Google Application Credentials required");

async function main(){
  const {initializeApp,applicationDefault}=require("firebase-admin/app");
  const {getFirestore}=require("firebase-admin/firestore");
  const app=initializeApp({
    ...(process.env.FIRESTORE_EMULATOR_HOST?{}:{credential:applicationDefault()}),
    projectId:project
  });
  // Ordinary path verifies the Auth user via the Identity Toolkit API.
  // Local gcloud end-user ADC sometimes cannot call Firebase Authentication.
  // In the explicitly acknowledged --uid path, the owner verifies the exact UID
  // and email visually in Firebase Console; Firestore UID/email still must agree.
  let uid=providedUid;
  if(!uid){
    const {getAuth}=require("firebase-admin/auth");
    const found=await getAuth(app).getUserByEmail(email);
    uid=found.uid;
  }
  const db=getFirestore(app);
  const userRef=db.collection("users").doc(uid);
  const auditRef=db.collection("bootstrapAudits").doc();
  let wasAdmin=false;
  await db.runTransaction(async tx=>{
    const snap=await tx.get(userRef);
    assert.ok(snap.exists,"User profile for this exact Auth UID not found in staging Firestore");
    const profile=snap.data();
    assert.equal(profile.email,email,
      "The Firestore profile email must match the selected Authentication user");
    assert.ok(["user","admin"].includes(profile.role),
      "Unexpected role; manual audit needed");
    if(profile.role==="admin"){wasAdmin=true;return;}
    tx.update(userRef,{role:"admin"});
    tx.create(auditRef,{
      operation:"initial-staging-admin",projectId:project,uid,email,
      verificationMethod:providedUid?"owner-confirmed-firebase-console-uid":"firebase-auth-admin-api",
      executedFrom:hostname(),createdAt:Date.now()
    });
  });
  console.log(wasAdmin?"STAGING ADMIN ALREADY ACTIVE":"STAGING ADMIN PROFILE UPDATED",
    "for Firebase Auth UID:",uid);
  console.log("No Hosting, rules or Cloud Functions deployment was performed.");
}
main().catch(error=>{console.error("STAGING ADMIN FAILED:",error.message);process.exitCode=1});
