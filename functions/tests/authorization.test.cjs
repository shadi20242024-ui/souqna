"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

class HttpsError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
let transactionCount=0;
const callableOptions=[];
const firestore={
  collection(name){return {doc(id){return {name,id};}};},
  runTransaction(){transactionCount++;throw new Error("Transactions must not run on invalid input");}
};
const modules={
  "firebase-functions/v2/https":{onCall:(options,handler)=>{callableOptions.push(options);return handler;},HttpsError},
  "firebase-admin/app":{initializeApp(){}},
  "firebase-admin/firestore":{getFirestore:()=>firestore,FieldValue:{serverTimestamp:()=>({})}}
};
const sandbox={module:{exports:{}},exports:{},require(name){
  assert(Object.hasOwn(modules,name),"Unexpected dependency: "+name);
  return modules[name];
},Date,Number,Math,Promise};
sandbox.exports=sandbox.module.exports;
vm.runInNewContext(fs.readFileSync("index.js","utf8"),sandbox,{filename:"functions/index.js"});
const handlers=sandbox.module.exports;
const financial=["approveStarOrder","approvePromotion","approveSubscription",
  "rejectStarOrder","rejectPromotion","rejectSubscription"];
const moderation=["moderateAdvertisement","moderateStore"];
const administration=["adjustUserStars","changeUserRole"];
for(const name of [...financial,...moderation,...administration]){
  test(name+" denies unauthenticated callers",async()=>{
    await assert.rejects(handlers[name]({data:{requestId:"test",orderId:"test",recordId:"test",decision:"approved"}}),e=>e.code==="permission-denied");
  });
  test(name+" denies malformed authentication without token claims",async()=>{
    await assert.rejects(handlers[name]({auth:{uid:"broken"},data:{requestId:"test",orderId:"test",recordId:"test",decision:"approved"}}),e=>e.code==="permission-denied");
  });
  test(name+" denies non-admin users",async()=>{
    await assert.rejects(handlers[name]({auth:{uid:"member",token:{admin:false}},data:{requestId:"test",orderId:"test",recordId:"test",decision:"approved"}}),e=>e.code==="permission-denied");
  });
  test(name+" rejects invalid IDs before Firestore",async()=>{
    await assert.rejects(handlers[name]({auth:{uid:"admin",token:{admin:true}},data:{requestId:"../unsafe",orderId:"../unsafe",recordId:"../unsafe",userId:"../unsafe",decision:"approved"}}),e=>e.code==="invalid-argument");
  });
}
for(const name of moderation){
  test(name+" rejects invalid moderation decisions",async()=>{
    await assert.rejects(handlers[name]({auth:{uid:"admin",token:{admin:true}},data:{recordId:"valid-id",decision:"delete"}}),e=>e.code==="invalid-argument");
  });
}
test("invalid inputs never enter Firestore transactions",()=>assert.equal(transactionCount,0));

test("all ten callables require App Check and use the configured region",()=>{
  assert.equal(callableOptions.length,10);
  for(const options of callableOptions){
    assert.equal(options.region,"europe-west1");
    assert.equal(options.enforceAppCheck,true);
  }
});

test("manual stars rejects zero adjustments",async()=>{
  await assert.rejects(handlers.adjustUserStars({
    auth:{uid:"root",token:{admin:true}},
    data:{userId:"member",delta:0,reason:"Valid reason",mutationId:"1234567890abcdef"}
  }),e=>e.code==="invalid-argument");
});
test("manual stars rejects adjustments beyond limit",async()=>{
  await assert.rejects(handlers.adjustUserStars({
    auth:{uid:"root",token:{admin:true}},
    data:{userId:"member",delta:-100001,reason:"Valid reason",mutationId:"1234567890abcdef"}
  }),e=>e.code==="invalid-argument");
});
test("manual stars requires a stable mutation ID",async()=>{
  await assert.rejects(handlers.adjustUserStars({
    auth:{uid:"root",token:{admin:true}},
    data:{userId:"member",delta:2,reason:"Valid reason",mutationId:"short"}
  }),e=>e.code==="invalid-argument");
});
test("role assignments cannot grant an admin role",async()=>{
  await assert.rejects(handlers.changeUserRole({
    auth:{uid:"root",token:{admin:true}},
    data:{userId:"member",role:"admin",mutationId:"1234567890abcdef"}
  }),e=>e.code==="invalid-argument");
});
test("admin cannot alter their own staff role",async()=>{
  await assert.rejects(handlers.changeUserRole({
    auth:{uid:"root",token:{admin:true}},
    data:{userId:"root",role:"editor",mutationId:"1234567890abcdef"}
  }),e=>e.code==="failed-precondition");
});
