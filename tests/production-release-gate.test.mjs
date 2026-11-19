import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { readProductionRules, saveRulesBackup, PROJECT, RELEASE } from "../scripts/production-rules.mjs";
import { inspectProductionFunctions, FUNCTIONS } from "../scripts/check-production-services.mjs";

const script=readFileSync(new URL("../scripts/release-production.ps1",import.meta.url),"utf8");
const source=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");

test("production PowerShell release is explicit opt-in for exact project, branch, sha and signed-off gates",()=>{
  assert.match(script,/\[ValidateSet\("souqna-sweida"\)\]/);
  assert.match(script,/\[ValidatePattern\("\^\[a-f0-9\]\{40\}\$"\)\]/);
  assert.match(script,/\[switch\]\$Publish/);
  assert.match(script,/\$branch -cne "main"/);
  assert.match(script,/\$sha -cne \$ApprovedCommit/);
  assert.match(script,/git.exe status --porcelain/);
  assert.match(script,/if\(-not \$Publish\)/);
  assert.match(script,/SOUQNA_APPROVE_LIVE_WRITE/);
  assert.match(script,/SOUQNA_PRODUCTION_BUILD_APPROVED/);
  assert.match(script,/preflight:launch/);
});

test("all write commands target production explicitly and are strictly after backup and launch gate",()=>{
  const order=["preflight:launch","backup:production:rules",'if(-not $Publish)','SOUQNA_APPROVE_LIVE_WRITE',
    '"functions:souqnaFinance,functions:souqnaMarketplace,functions:souqnaModeration"',
    'check:production:services','"firestore:rules"','check:production:legal','"hosting"','check:production:hosting'];
  let last=-1;
  for(const item of order){const index=script.indexOf(item);assert.ok(index>last,item+" must come later");last=index;}
  assert.equal((script.match(/"firebase","deploy"/g)||[]).length,3);
  assert.equal((script.match(/"--project",\$project/g)||[]).length,3);
  assert.ok(!script.includes('"souqna-staging"'));
  assert.ok(script.includes('pause new manual payments')||script.includes('Pause new manual payments'));
});

test("production deployed Firestore rules are fetched read-only from exact production release",async()=>{
  const seen=[];
  const ruleset="projects/souqna-sweida/rulesets/stable123";
  const fetcher=async(url,options)=>{
    seen.push(url);
    assert.equal(options.method,"GET");
    assert.equal(options.headers["x-goog-user-project"],PROJECT);
    return {ok:true,json:async()=>url.endsWith(RELEASE)?{rulesetName:ruleset}:
      {name:ruleset,source:{files:[{content:source}]}}};
  };
  assert.equal(await readProductionRules(fetcher,"test-token"),source);
  assert.equal(seen.length,2);
  assert.ok(seen.every(url=>url.startsWith("https://firebaserules.googleapis.com/v1/projects/souqna-sweida/")));
  await assert.rejects(()=>readProductionRules(async()=>({ok:true,json:async()=>({rulesetName:"projects/souqna-staging/rulesets/1"})}),"test"),/NOT_VERIFIED/);
  await assert.rejects(()=>readProductionRules(async()=>({ok:false,status:403}),"test"),/HTTP_403/);
});

test("immutable production rules snapshot saves only locally and never overwrites an existing file",()=>{
  const dir=mkdtempSync(join(tmpdir(),"souqna-production-rules-"));
  try{
    const now=new Date("2026-11-19T11:15:00.000Z");
    const file=saveRulesBackup(source,now,dir);
    assert.ok(existsSync(file));
    assert.ok(basename(file).startsWith("souqna-sweida-2026-11-19T11-15"));
    assert.equal(readFileSync(file,"utf8"),source);
    assert.throws(()=>saveRulesBackup(source,now,dir),/EEXIST/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("production callable-function status uses read-only calls and exact project",async()=>{
  const seen=[];
  const result=await inspectProductionFunctions(async(url,options)=>{
    seen.push(url);
    assert.equal(options.method,"GET");
    assert.equal(options.headers["x-goog-user-project"],"souqna-sweida");
    return {ok:true,json:async()=>({name:url.split("/v2/")[1],state:"ACTIVE"})};
  },"test-token");
  assert.equal(result.length,FUNCTIONS.length);
  assert.ok(result.every(x=>x.status==="ACTIVE"));
  assert.ok(seen.every(url=>url.includes("/projects/souqna-sweida/locations/us-central1/functions/")));
  const fail=await inspectProductionFunctions(async()=>({ok:false,status:403}),"test-token");
  assert.ok(fail.every(x=>x.status==="HTTP_403"));
});
