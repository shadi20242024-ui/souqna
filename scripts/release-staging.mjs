import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";

export const PROJECT="souqna-staging";
export const CONFIG="firebase.staging.json";
export const WEB_CONFIG="firebase.staging.web.local.json";
export const INCLUDED_DEPLOYMENTS=Object.freeze(["hosting","firestore:rules"]);

const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));

export function releaseArguments(apply=false){
  return [
    "--config",CONFIG,
    "--project",PROJECT,
    "--only",INCLUDED_DEPLOYMENTS.join(","),
    "--non-interactive",
    ...(apply?[]:["--dry-run"])
  ];
}
export function validateReleaseFiles(root=ROOT){
  const fb=JSON.parse(readFileSync(join(root,CONFIG),"utf8"));
  const cfgPath=join(root,WEB_CONFIG);
  assert.ok(existsSync(cfgPath),
    "No registered staging Web configuration. Run npm run setup:staging:auto.");
  const web=JSON.parse(readFileSync(cfgPath,"utf8"));
  assert.equal(web.projectId,PROJECT,"Refusing mismatched Firebase Web project.");
  assert.equal(web.authDomain,PROJECT+".firebaseapp.com","Staging Firebase Auth domain differs.");
  assert.ok([
    PROJECT+".appspot.com",PROJECT+".firebasestorage.app"
  ].includes(web.storageBucket),"Staging Storage bucket differs.");
  assert.equal(fb.hosting?.public,"dist","Unexpected Hosting output folder.");
  assert.equal(fb.firestore?.rules,"firestore.staging.rules","Wrong staging security rules.");
  assert.equal(fb.storage?.rules,"storage.rules","Unexpected Storage rules file.");
  const rules=readFileSync(join(root,fb.firestore.rules),"utf8");
  assert.match(rules,/match \/localMarketRates\/\{id\}/,
    "Staging local-market prices permission rules are missing.");
  assert.match(rules,/assignedTo\("market_prices"\)/,
    "Staging market moderator scope is missing.");
  assert.match(rules,/match \/ads\/\{id\} \{[\s\S]*?allow delete: if false;/,
    "Direct staging ad deletion must remain disabled.");
  const code=readFileSync(join(root,"scripts/preflight-staging.mjs"),"utf8");
  assert.ok(code.includes("souqna-sweida"),"Production isolation guard is missing.");
  return {project:PROJECT,hosting:fb.hosting.public,rules:fb.firestore.rules};
}

function runLocal(label,program,args,{cwd=ROOT}={}){
  const done=spawnSync(program,args,{
    cwd,encoding:"utf8",timeout:600000,
    env:process.env,windowsHide:true
  });
  if(done.stdout)process.stdout.write(done.stdout);
  if(done.stderr)process.stderr.write(done.stderr);
  if(done.error)throw new Error(label+" failed: "+done.error.message);
  assert.equal(done.status,0,label+" failed; release stopped.");
}

export function requireApplyApproval({argv=process.argv,env=process.env}={}){
  if(argv.length===2)return false;
  assert.deepEqual(argv.slice(2),["--apply"],
    "Use no argument for read-only preview or --apply for explicitly approved staging deployment.");
  assert.equal(env.SOUQNA_STAGING_DEPLOY_APPROVED,"souqna-staging",
    "Release requires local environment variable SOUQNA_STAGING_DEPLOY_APPROVED=souqna-staging.");
  return true;
}

async function main(){
  const apply=requireApplyApproval();
  validateReleaseFiles();
  const node=(file,...params)=>runLocal(file,process.execPath,[join(ROOT,file),...params]);
  node("scripts/build-hosting.mjs","staging",join(ROOT,WEB_CONFIG));
  node("scripts/preflight-staging.mjs",PROJECT);
  // This audit checks real staging Auth, Firestore, Storage and ALL required callables.
  // Failure includes missing permissions and inactive cloud functions, and blocks release.
  node("scripts/audit-staging-readonly.mjs");
  // A failed local security test stops even a dry run.
  runLocal("Staging price permission emulator tests",process.execPath,[
    join(ROOT,"node_modules/firebase-tools/lib/bin/firebase.js"),
    "emulators:exec","--config",CONFIG,"--project","demo-souqna-market-prices",
    "--only","auth,firestore",
    "node --test tests/market-prices-rules.test.mjs"
  ]);
  const firebase=join(ROOT,"node_modules/firebase-tools/lib/bin/firebase.js");
  assert.ok(existsSync(firebase),"Install dependencies with npm install before deploying.");
  // Validation pass: never creates a live deployment.
  runLocal("Staging deployment dry run",process.execPath,[firebase,"deploy",...releaseArguments(false)]);
  if(!apply){
    console.log("SOUQNA STAGING RELEASE PREVIEW PASSED. Nothing was deployed.");
    console.log("An actual deployment additionally requires --apply and explicit local approval.");
    return;
  }
  // No functions, storage rules, data writes, production project or billing actions.
  runLocal("Explicit staging Hosting and Firestore rules deployment",
    process.execPath,[firebase,"deploy",...releaseArguments(true)]);
  console.log("Staging Hosting and Firestore rules deployment command completed.");
  console.log("No Cloud Functions, Storage rules, real data or production project were targeted.");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{
    console.error("SOUQNA STAGING RELEASE STOPPED:",error.message);
    process.exitCode=1;
  });
}
