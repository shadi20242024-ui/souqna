"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");

if(!process.env.FIRESTORE_EMULATOR_HOST){
  throw new Error("FIRESTORE_EMULATOR_HOST is required. This suite must not access production.");
}
const app=initializeApp({projectId:"demo-souqna"});
const db=getFirestore(app);
const transactionDb={
  collection(name){return db.collection(name);},
  runTransaction(callback){return db.runTransaction(async transaction=>await callback(transaction));}
};
class HttpsError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
const dependencies={
  "firebase-functions/v2/https":{onCall:(_config,handler)=>handler,HttpsError},
  "firebase-admin/app":{initializeApp:()=>app},
  "firebase-admin/firestore":{getFirestore:()=>transactionDb,FieldValue}
};
const sandbox={
  module:{exports:{}},
  exports:{},
  require(name){
    assert(Object.hasOwn(dependencies,name),"Unexpected dependency: "+name);
    return dependencies[name];
  },
  Date,Number,Math,Promise
};
sandbox.exports=sandbox.module.exports;
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname,"..","index.js"),"utf8"),
  sandbox,{filename:"functions/index.js"}
);
const handlers=sandbox.module.exports;
const admin={uid:"admin",token:{admin:true}};
const staff={uid:"staff",token:{admin:false}};
const ordinary={uid:"bob",token:{admin:false}};
const call=(handler,data,auth=admin)=>handlers[handler]({auth,data});
const document=(collection,id)=>db.collection(collection).doc(id);
async function seed(){
  const entries=[
    ["users","alice",{name:"Alice",email:"alice@example.com",role:"user",stars:100}],
    ["users","bob",{name:"Bob",email:"bob@example.com",role:"user",stars:0}],
    ["users","charlie",{name:"Charlie",email:"charlie@example.com",role:"user",stars:0}],
    ["users","admin",{name:"Admin",email:"admin@example.com",role:"admin",stars:0}],
    ["users","staff",{name:"Moderator",email:"staff@example.com",role:"moderator",stars:0}],
    ["starOrders","topup1",{userId:"alice",stars:20,status:"pending"}],
    ["packages","promo15",{stars:15,days:7,active:true}],
    ["plans","gold",{stars:25,days:30,active:true}],
    ["ads","ad1",{ownerId:"alice",title:"Approved Ad",status:"approved"}],
    ["ads","pendingAd",{ownerId:"alice",title:"Pending Ad",status:"pending"}],
    ["stores","shop1",{ownerId:"alice",name:"Approved Shop",status:"approved"}],
    ["stores","pendingShop",{ownerId:"alice",name:"Pending Shop",status:"pending"}],
    ["promos","promo1",{userId:"alice",adId:"ad1",pkgId:"promo15",stars:15,days:7,status:"pending"}],
    ["subs","sub1",{userId:"alice",storeId:"shop1",planId:"gold",stars:25,days:30,status:"pending"}],
    ["sorders","service1",{userId:"alice",serviceName:"Design Service",status:"new"}]
  ];
  const batch=db.batch();
  for(const [collection,id,data] of entries)batch.set(document(collection,id),data);
  await batch.commit();
}
const read=async(collection,id)=>(await document(collection,id).get()).data();
test("real Firestore emulator transactions: approval, debit, audit, moderation and notifications",async t=>{
  await seed();
  try {
    await t.test("star top-up credits exactly once",async()=>{
      assert.equal((await call("approveStarOrder",{orderId:"topup1"})).status,"done");
      assert.equal((await read("users","alice")).stars,120);
      assert.equal((await call("approveStarOrder",{orderId:"topup1"})).status,"already_processed");
      assert.equal((await read("users","alice")).stars,120);
      assert.equal((await read("transactions","star_credit_topup1")).amount,20);
      assert.equal((await read("notifs","star_credit_topup1")).userId,"alice");
      await assert.rejects(call("rejectStarOrder",{requestId:"topup1"}),e=>e.code==="failed-precondition");
    });
    await t.test("advertisement promotion charges authoritative price once",async()=>{
      assert.equal((await call("approvePromotion",{requestId:"promo1"})).status,"done");
      assert.equal((await read("users","alice")).stars,105);
      assert.ok((await read("ads","ad1")).featuredUntil>Date.now());
      assert.equal((await call("approvePromotion",{requestId:"promo1"})).status,"already_processed");
      assert.equal((await read("users","alice")).stars,105);
    });
    await t.test("store subscription charges authoritative price once",async()=>{
      assert.equal((await call("approveSubscription",{requestId:"sub1"})).status,"done");
      assert.equal((await read("users","alice")).stars,80);
      assert.equal((await read("stores","shop1")).plan,"gold");
      assert.equal((await call("approveSubscription",{requestId:"sub1"})).status,"already_processed");
      assert.equal((await read("users","alice")).stars,80);
    });
    await t.test("manual adjustment is idempotent and cannot overdraw",async()=>{
      const data={userId:"alice",delta:-5,reason:"Manual adjustment",mutationId:"1234567890abcdef"};
      assert.equal((await call("adjustUserStars",data)).balance,75);
      assert.equal((await call("adjustUserStars",data)).status,"already_processed");
      assert.equal((await read("users","alice")).stars,75);
      await assert.rejects(call("adjustUserStars",{...data,delta:-500,mutationId:"fedcba0987654321"}),e=>e.code==="failed-precondition");
      assert.equal((await read("users","alice")).stars,75);
      assert.equal((await read("transactions","manual_1234567890abcdef")).balanceAfter,75);
    });
    await t.test("role changes are audited and cannot grant admin",async()=>{
      const data={userId:"charlie",role:"editor",mutationId:"rolechange123456"};
      assert.equal((await call("changeUserRole",data)).status,"done");
      assert.equal((await read("users","charlie")).role,"editor");
      assert.equal((await call("changeUserRole",data)).status,"already_processed");
      assert.equal((await read("auditLogs","role_rolechange123456")).previousRole,"user");
      await assert.rejects(call("changeUserRole",{...data,role:"admin",mutationId:"newrole1234567890"}),e=>e.code==="invalid-argument");
    });
    await t.test("moderation notifies owner and final states are protected",async()=>{
      assert.equal((await call("moderateAdvertisement",{recordId:"pendingAd",decision:"approved"})).status,"approved");
      assert.equal((await call("moderateAdvertisement",{recordId:"pendingAd",decision:"approved"})).status,"already_processed");
      assert.equal((await read("notifs","moderated_ads_pendingAd")).userId,"alice");
      assert.equal((await call("moderateStore",{recordId:"pendingShop",decision:"approved"})).status,"approved");
      assert.equal((await read("stores","pendingShop")).status,"approved");
      await assert.rejects(call("moderateAdvertisement",{recordId:"pendingAd",decision:"rejected"}),e=>e.code==="failed-precondition");
    });
    await t.test("service orders require staff and notify in same transaction",async()=>{
      await assert.rejects(call("updateServiceOrder",{orderId:"service1",status:"progress"},ordinary),e=>e.code==="permission-denied");
      assert.equal((await call("updateServiceOrder",{orderId:"service1",status:"progress"},staff)).status,"progress");
      assert.equal((await call("updateServiceOrder",{orderId:"service1",status:"progress"},staff)).status,"already_processed");
      assert.equal((await call("updateServiceOrder",{orderId:"service1",status:"done"},staff)).status,"done");
      assert.equal((await read("sorders","service1")).status,"done");
      assert.equal((await read("notifs","service_order_service1_done")).userId,"alice");
      await assert.rejects(call("updateServiceOrder",{orderId:"service1",status:"rejected",reason:"Not available"},staff),e=>e.code==="failed-precondition");
    });
  } finally {
    await deleteApp(app);
  }
});
