import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { categoryDecisions, REQUIRED_CATEGORIES, parseOptions } from "../scripts/upgrade-staging-categories.mjs";

const names=["cars","real_estate","electronics","furniture","jobs","services","misc","community","fashion","lost_found"];
test("approved ten category IDs match the exact photographic tiles",()=>{
  assert.deepEqual(REQUIRED_CATEGORIES.map(x=>x[0]),names);
  assert.equal(new Set(names).size,10);
  assert.ok(REQUIRED_CATEGORIES.every(([,label,order])=>label.length>2&&Number.isSafeInteger(order)));
});
test("category upgrade only creates missing items and activates inactive ones",()=>{
  const snapshots=REQUIRED_CATEGORIES.map(([,name],i)=>({
    exists:i<8,
    data:()=>({name_ar:name,active:i===1?false:true,order:i+1,otherProperty:"retained"})
  }));
  const actions=categoryDecisions(snapshots);
  assert.equal(actions.filter(x=>x.action==="create").length,2);
  assert.deepEqual(actions.filter(x=>x.action==="create").map(x=>x.id),["fashion","lost_found"]);
  assert.deepEqual(actions.filter(x=>x.action==="activate").map(x=>x.id),["real_estate"]);
  assert.deepEqual(actions.filter(x=>x.action==="keep").length,7);
  assert.deepEqual(actions[8].data,{name_ar:"أزياء",order:9,active:true});
  assert.deepEqual(actions[9].data,{name_ar:"مفقودات",order:10,active:true});
});
test("dry-run is staging-only and never requires credentials",()=>{
  assert.deepEqual(parseOptions(["--project","souqna-staging"]),{execute:false,inspect:false,project:"souqna-staging"});
  assert.throws(()=>parseOptions(["--project","souqna-sweida"]),/Only/);
  assert.throws(()=>parseOptions(["--project","souqna-staging","--execute"]),/--confirm/);
  assert.throws(()=>parseOptions(["--project","souqna-staging","--execute","--confirm","wrong"]),/--confirm/);
  assert.deepEqual(parseOptions(["--project","souqna-staging","--execute","--confirm","ACTIVATE-CATEGORIES:souqna-staging"]).execute,true);
  const result=spawnSync(process.execPath,["scripts/upgrade-staging-categories.mjs","--project","souqna-staging"],{
    encoding:"utf8",env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:"",GCLOUD_PROJECT:"",GOOGLE_CLOUD_PROJECT:""}
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/DRY RUN/);
  assert.match(result.stdout,/10/);
});
