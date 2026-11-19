import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
  PROJECT,CONFIG,INCLUDED_DEPLOYMENTS,releaseArguments,
  requireApplyApproval,validateReleaseFiles
} from "../scripts/release-staging.mjs";

test("manual release targets only approved staging services and has dry run as default",()=>{
  assert.equal(PROJECT,"souqna-staging");
  assert.equal(CONFIG,"firebase.staging.json");
  assert.deepEqual(INCLUDED_DEPLOYMENTS,["hosting","firestore:rules"]);
  const args=releaseArguments(false);
  assert.deepEqual(args,[
    "--config","firebase.staging.json",
    "--project","souqna-staging",
    "--only","hosting,firestore:rules","--non-interactive","--dry-run"
  ]);
  assert.equal(releaseArguments(true).includes("--dry-run"),false);
  for(const word of ["functions","storage","souqna-sweida","database","billing"])
    assert.equal(args.join(" ").includes(word),false);
});

test("no release write can happen without exact double approval",()=>{
  assert.equal(requireApplyApproval({
    argv:["node","release-staging.mjs"],
    env:{}
  }),false);
  assert.throws(()=>requireApplyApproval({
    argv:["node","release-staging.mjs","--apply"],
    env:{}
  }),/requires local environment variable/);
  assert.throws(()=>requireApplyApproval({
    argv:["node","release-staging.mjs","--apply"],
    env:{SOUQNA_STAGING_DEPLOY_APPROVED:"souqna-sweida"}
  }),/SOUQNA_STAGING_DEPLOY_APPROVED/);
  assert.throws(()=>requireApplyApproval({
    argv:["node","release-staging.mjs","--force"],
    env:{SOUQNA_STAGING_DEPLOY_APPROVED:"souqna-staging"}
  }));
  assert.equal(requireApplyApproval({
    argv:["node","release-staging.mjs","--apply"],
    env:{SOUQNA_STAGING_DEPLOY_APPROVED:"souqna-staging"}
  }),true);
});

test("release files must pin Web, Firestore and Hosting to staging and scoped market rates",()=>{
  const folder=mkdtempSync(join(tmpdir(),"souqna-release-check-"));
  const save=(filename,data)=>{
    const path=join(folder,filename);
    mkdirSync(join(folder,"scripts"),{recursive:true});
    writeFileSync(path,data);
  };
  try{
    const config={
      firestore:{rules:"firestore.staging.rules"},
      storage:{rules:"storage.rules"},
      hosting:{public:"dist"}
    };
    save("firebase.staging.json",JSON.stringify(config));
    const web={
      projectId:"souqna-staging",
      authDomain:"souqna-staging.firebaseapp.com",
      storageBucket:"souqna-staging.firebasestorage.app"
    };
    save("firebase.staging.web.local.json",JSON.stringify(web));
    save("firestore.staging.rules",[
      'match /localMarketRates/{id} {',
      '  allow create: if assignedTo("market_prices");',
      '}',
      'match /ads/{id} {',
      '  allow delete: if false;',
      '}'
    ].join("\n"));
    save("scripts/preflight-staging.mjs",'assert.notEqual(project,"souqna-sweida");');
    assert.equal(validateReleaseFiles(folder).project,"souqna-staging");
    save("firebase.staging.web.local.json",JSON.stringify({...web,projectId:"souqna-sweida"}));
    assert.throws(()=>validateReleaseFiles(folder),/mismatched Firebase Web project/);
    save("firebase.staging.web.local.json",JSON.stringify(web));
    save("firebase.staging.json",JSON.stringify({
      ...config,firestore:{rules:"firestore.rules"}
    }));
    assert.throws(()=>validateReleaseFiles(folder),/Wrong staging security rules/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test("release script contains no fallback to production or unattended deployment",()=>{
  const script=readFileSync(new URL("../scripts/release-staging.mjs",import.meta.url),"utf8");
  assert.match(script,/node\("scripts\/audit-staging-readonly\.mjs"\)/);
  assert.match(script,/node\("scripts\/preflight-staging\.mjs",PROJECT\)/);
  assert.match(script,/releaseArguments\(false\)/);
  assert.match(script,/if\(!apply\)/);
  assert.match(script,/SOUQNA_STAGING_DEPLOY_APPROVED/);
  assert.doesNotMatch(script,/--force|firebase use|--only","functions|--only","storage/);
});
