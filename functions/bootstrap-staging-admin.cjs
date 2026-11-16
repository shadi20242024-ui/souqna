"use strict";
const assert=require("node:assert/strict");
const {hostname}=require("node:os");

const args=process.argv.slice(2);
function opt(name) {const at=args.indexOf(name);return at<0?null:args[at+1]||null}
const project=opt("--project");
const email=opt("--email");
const execute=args.includes("--execute");
const confirm=opt("--confirm");
assert.ok(typeof project==="string"&&/^[a-z][a-z0-9-]{4,40}$/.test(project),
  "Specify the isolated staging project with --project PROJECT_ID");
assert.notEqual(project,"souqna-sweida","Production project cannot be bootstrapped with this utility");
assert.notEqual(project,"souqna-preview-disabled","Preview project is not valid");
assert.ok(typeof email==="string"&&email.length<254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  "Specify an existing staging user account with --email EMAIL");
assert.ok(!args.includes("--production"),"Production bootstrapping is disabled");
console.log("SOUQNA staging owner profile setup for project:",project);
console.log("Existing Firebase Auth account required:",email);
if(!execute){
  console.log("DRY RUN ONLY. No Firebase connection and no role change.");
  process.exit(0);
}
assert.equal(confirm,"ADMIN:"+project+":"+email,
  "Execution requires explicit --confirm ADMIN:"+project+":"+email);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  "Explicit staging emulator/Google Application Credentials required");

async function main(){
const {initializeApp,applicationDefault,getApps}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore}=require("firebase-admin/firestore");
const app=getApps()[0]||initializeApp({
  ...(process.env.FIRESTORE_EMULATOR_HOST?{}:{credential:applicationDefault()}),
  projectId:project
});
const found=await getAuth(app).getUserByEmail(email);
const uid=found.uid;
const db=getFirestore(app);
const userRef=db.collection("users").doc(uid);
const auditRef=db.collection("bootstrapAudits").doc();
await db.runTransaction(async tx=>{
  const snap=await tx.get(userRef);
  assert.ok(snap.exists,"User must first complete registration in staging");
  assert.equal(snap.data().email,email,"Profile email must match Firebase Auth account");
  assert.ok(["user","admin"].includes(snap.data().role),"Unexpected role; manual audit needed");
  if(snap.data().role==="admin")return;
  tx.update(userRef,{role:"admin"});
  tx.create(auditRef,{
    operation:"initial-staging-admin",projectId:project,uid,
    email,executedFrom:hostname(),createdAt:Date.now()
  });
});
console.log("STAGING ADMIN PROFILE UPDATED for Firebase Auth UID:",uid);
console.log("No Hosting, rules or Cloud Functions deployment was performed.");

}
main().catch(error=>{console.error(error.message);process.exitCode=1});
