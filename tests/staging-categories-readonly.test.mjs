import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCategories, fetchCategories } from "../scripts/check-staging-categories.mjs";
import { REQUIRED_CATEGORIES } from "../scripts/upgrade-staging-categories.mjs";

const config={
  projectId:"souqna-staging",
  authDomain:"souqna-staging.firebaseapp.com",
  apiKey:"testStagingPublicWebKey1234567"
};
const record=([id,name_ar,order],active=true)=>({
  name:"projects/souqna-staging/databases/(default)/documents/categories/"+id,
  fields:{
    name_ar:{stringValue:name_ar},
    order:{integerValue:String(order)},
    active:{booleanValue:active}
  }
});
const stub=documents=>async(url,options)=>{
  assert.equal(options.method,"GET","Category check must not write");
  const request=new URL(url);
  assert.equal(request.origin,"https://firestore.googleapis.com");
  assert.ok(request.pathname.includes("/souqna-staging/"));
  return {ok:true,status:200,json:async()=>({documents})};
};
test("ten live category records are considered ready",async()=>{
  const report=await fetchCategories(config,stub(REQUIRED_CATEGORIES.map(c=>record(c))));
  assert.equal(report.active,10);
  assert.equal(report.expected,10);
  assert.equal(report.ready,true);
  assert.deepEqual(report.extra,[]);
});
test("original eight seed records are not mistaken for ten enabled categories",()=>{
  const report=evaluateCategories(REQUIRED_CATEGORIES.slice(0,8).map(c=>record(c)));
  assert.equal(report.active,8);
  assert.equal(report.ready,false);
  assert.deepEqual(report.categories.filter(c=>c.status==="MISSING").map(c=>c.id),
    ["fashion","lost_found"]);
});
test("inactive category is reported without changing its state",async()=>{
  const entries=REQUIRED_CATEGORIES.map((c,i)=>record(c,i!==8));
  const report=await fetchCategories(config,stub(entries));
  assert.equal(report.active,9);
  assert.equal(report.ready,false);
  assert.equal(report.categories[8].status,"INACTIVE");
  assert.equal(entries[8].fields.active.booleanValue,false);
});
test("inspector refuses production configuration and inaccessible staging",async()=>{
  await assert.rejects(fetchCategories({...config,projectId:"souqna-sweida"},stub([])),/souqna-staging/);
  await assert.rejects(fetchCategories({...config,authDomain:"souqna-sweida.firebaseapp.com"},stub([])),/domain/);
  await assert.rejects(fetchCategories(config,async()=>({ok:false,status:403})),/HTTP 403/);
  await assert.rejects(fetchCategories(config,async()=>{throw Error("network")}),/Could not reach/);
});
test("empty Firestore list is safely treated as all missing",async()=>{
  const report=await fetchCategories(config,async()=>({ok:true,status:200,json:async()=>({})}));
  assert.equal(report.active,0);
  assert.equal(report.categories.length,10);
  assert.equal(report.ready,false);
});
