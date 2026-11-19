import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { backupStagingRules } from "../scripts/backup-staging-rules.mjs";

const pipeline=readFileSync(new URL("../scripts/publish-staging-legal-and-hosting.ps1",import.meta.url),"utf8");

test("staging release is pinned to an exact project, legal version and clean feature branch",()=>{
  assert.match(pipeline,/\[ValidateSet\("souqna-staging"\)\]/);
  assert.match(pipeline,/\[ValidateSet\("2026-11-19"\)\]/);
  assert.match(pipeline,/\$ConfirmProject -cne \$project/);
  assert.match(pipeline,/\$ApprovedLegalVersion -cne \$version/);
  assert.match(pipeline,/feature\/legal-help-2026-11-19/);
  assert.match(pipeline,/git.exe status --porcelain/);
  assert.match(pipeline,/SOUQNA_ADMIN_EMAIL/);
});

test("staging release preflights, backs up old rules, deploys staging rules and Hosting in order",()=>{
  const tests=pipeline.indexOf('npm.cmd @("test")');
  const stagingBuild=pipeline.indexOf('"setup:staging:auto"');
  const backend=pipeline.indexOf('"check:staging:services"');
  const backup=pipeline.indexOf('"scripts/backup-staging-rules.mjs"');
  const rules=pipeline.indexOf('"firestore:rules"');
  const deployed=pipeline.indexOf('"check:staging:legal"');
  const hosting=pipeline.indexOf('"publish-staging-hosting.ps1"');
  const readiness=pipeline.indexOf('"check:staging:readiness"');
  assert.ok(tests>=0 && stagingBuild>tests && backend>stagingBuild && backup>backend);
  assert.ok(rules>backup && deployed>rules && hosting>deployed && readiness>hosting);
  assert.ok(pipeline.includes('"--project",$project'));
  assert.ok(pipeline.includes('"--config","firebase.staging.config.json"'));
  assert.ok(!pipeline.includes('"souqna-sweida"'));
  assert.ok(!pipeline.includes('"--only","functions"'));
  assert.ok(!pipeline.includes('"--only","firestore,functions"'));
});

test("backup is local, immutable, specific to staging, and rejects incomplete rules",()=>{
  const source=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
  assert.throws(()=>backupStagingRules("allow read, write: if true",new Date("2026-11-19T09:00:00Z")),/rules_version/);
  assert.throws(()=>backupStagingRules("rules_version = '2';",new Date("2026-11-19T09:00:00Z")),/not Firestore rules/);
  const dir=mkdtempSync(join(tmpdir(),"souqna-staging-rules-test-"));
  try{
    const now=new Date("2026-11-19T09:00:00.000Z");
    const p=backupStagingRules(source,now,dir);
    assert.ok(existsSync(p));
    assert.ok(basename(p).startsWith("souqna-staging-2026-11-19T09-00-00-000Z"));
    assert.equal(readFileSync(p,"utf8"),source);
    assert.throws(()=>backupStagingRules(source,now,dir),/EEXIST/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
