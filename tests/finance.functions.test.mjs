import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import {
  getFirestore, connectFirestoreEmulator, collection, addDoc, doc,
  getDoc, setDoc, updateDoc
} from "firebase/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";

const PROJECT = "demo-souqna-rules";

test("SOUQNA server finance: permission, cost integrity, idempotence and ledgers", async t => {
  const env=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{rules:readFileSync("firestore.rules","utf8")}
  });
  const apps=[], makeClient=async (label,email)=>{
    const app=initializeApp({
      apiKey:"emulator-key",authDomain:PROJECT+".firebaseapp.com",projectId:PROJECT
    },"finance-"+label+"-"+Date.now());
    apps.push(app);
    const auth=getAuth(app);
    connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
    const credential=await createUserWithEmailAndPassword(auth,email,"FinanceTest2026!");
    const db=getFirestore(app);connectFirestoreEmulator(db,"127.0.0.1",8080);
    const fn=getFunctions(app,"us-central1");
    connectFunctionsEmulator(fn,"127.0.0.1",5001);
    return {uid:credential.user.uid,db,call:httpsCallable(fn,"souqnaFinance")};
  };
  t.after(async()=>{
    for(const app of apps)await deleteApp(app);
    await env.cleanup();
  });
  const owner=await makeClient("owner","admin-fin-"+Date.now()+"@example.test");
  const customer=await makeClient("customer","customer-fin-"+Date.now()+"@example.test");
  await env.withSecurityRulesDisabled(async context=>{
    const seed=context.firestore();
    await Promise.all([
      setDoc(doc(seed,"users",owner.uid),{name:"مدير",email:"admin-fin@example.test",role:"admin",stars:0}),
      setDoc(doc(seed,"users",customer.uid),{name:"مشتري",email:"buyer-fin@example.test",role:"user",stars:0}),
      setDoc(doc(seed,"plans","fin_gold"),{name:"ذهبية",stars:20,days:30,active:true}),
      setDoc(doc(seed,"packages","fin_feature"),{stars:10,days:7,active:true}),
      setDoc(doc(seed,"stores","fin_store"),{name:"متجر سوقنا",ownerId:customer.uid,status:"approved"}),
      setDoc(doc(seed,"ads","fin_ad"),{title:"عرض تجريبي",ownerId:customer.uid,status:"approved"})
    ]);
  });

  let orderRef;
  await t.test("Only owner can verify star top-up and duplicate requests credit once", async()=>{
    orderRef=await addDoc(collection(customer.db,"starOrders"),{
      userId:customer.uid,userName:"مشتري",stars:100,status:"pending",createdAt:Date.now()
    });
    await assert.rejects(()=>customer.call({action:"approveTopup",id:orderRef.id}));
    await assertFails(updateDoc(doc(owner.db,"users",customer.uid),{stars:99999}));
    const outcomes=await Promise.allSettled([
      owner.call({action:"approveTopup",id:orderRef.id}),
      owner.call({action:"approveTopup",id:orderRef.id})
    ]);
    assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
    assert.equal((await getDoc(doc(owner.db,"users",customer.uid))).data().stars,100);
    assert.equal((await getDoc(doc(owner.db,"transactions","topup_"+orderRef.id))).data().amount,100);
    assert.equal((await getDoc(orderRef)).data().status,"done");
    await assert.rejects(()=>owner.call({action:"approveTopup",id:orderRef.id}));
  });

  await t.test("Store subscription charges actual server-side plan price",async()=>{
    const sub=await addDoc(collection(customer.db,"subs"),{
      userId:customer.uid,storeId:"fin_store",storeName:"متجر سوقنا",
      planId:"fin_gold",stars:1,days:1,status:"pending",createdAt:Date.now()
    });
    await assert.rejects(()=>customer.call({action:"approveSubscription",id:sub.id}));
    const result=await owner.call({action:"approveSubscription",id:sub.id});
    assert.equal(result.data.ok,true);
    assert.equal((await getDoc(doc(owner.db,"users",customer.uid))).data().stars,80);
    assert.ok((await getDoc(doc(owner.db,"stores","fin_store"))).data().planUntil>Date.now());
    assert.equal((await getDoc(doc(owner.db,"transactions","sub_"+sub.id))).data().amount,-20);
    await assert.rejects(()=>owner.call({action:"approveSubscription",id:sub.id}));
  });

  await t.test("Featured ads charge package price, not user-submitted amount",async()=>{
    const promo=await addDoc(collection(customer.db,"promos"),{
      userId:customer.uid,adId:"fin_ad",pkgId:"fin_feature",
      stars:1,days:1,status:"pending",createdAt:Date.now()
    });
    await owner.call({action:"approvePromotion",id:promo.id});
    assert.equal((await getDoc(doc(owner.db,"users",customer.uid))).data().stars,70);
    assert.ok((await getDoc(doc(owner.db,"ads","fin_ad"))).data().featuredUntil>Date.now());
    assert.equal((await getDoc(doc(owner.db,"transactions","promo_"+promo.id))).data().amount,-10);
    await assert.rejects(()=>owner.call({action:"approvePromotion",id:promo.id}));
  });

  await t.test("Paid sponsor banners only become public after owner approval",async()=>{
    const request=await addDoc(collection(customer.db,"sponsorRequests"),{
      userId:customer.uid,userName:"مشتري",
      company:"شركة اختبار",title:"عرض أسبوع",desc:"حملة ترويجية",
      phone:"963999999999",img:"",days:7,status:"pending",createdAt:Date.now()
    });
    await assertFails(setDoc(doc(owner.db,"sponsors","forged"),{
      company:"مزيف",title:"مخالف",requestId:request.id,active:true
    }));
    await assert.rejects(()=>customer.call({action:"approveSponsor",id:request.id}));
    await owner.call({action:"approveSponsor",id:request.id});
    const banner=await getDoc(doc(owner.db,"sponsors","booking_"+request.id));
    assert.equal(banner.data().active,true);
    assert.ok(banner.data().to>Date.now());
    assert.equal((await getDoc(request)).data().status,"approved");
    await assert.rejects(()=>owner.call({action:"approveSponsor",id:request.id}));
  });

  await t.test("Manual corrections require a reason and never make balance negative",async()=>{
    await assert.rejects(()=>owner.call({action:"adjustBalance",userId:customer.uid,delta:-10000,note:"اختبار تخفيض",operationId:"manual-neg"}));
    await assert.rejects(()=>owner.call({action:"adjustBalance",userId:customer.uid,delta:5,note:"x",operationId:"manual-short"}));
    await assert.rejects(()=>customer.call({action:"adjustBalance",userId:customer.uid,delta:5000,note:"محاولة تزوير",operationId:"manual-bypass"}));
    await owner.call({action:"adjustBalance",userId:customer.uid,delta:-5,note:"تسوية يدوية محاسبية",operationId:"manual-settlement"});
    await assert.rejects(()=>owner.call({action:"adjustBalance",userId:customer.uid,delta:-5,note:"تسوية يدوية محاسبية",operationId:"manual-settlement"}));
    assert.equal((await getDoc(doc(owner.db,"users",customer.uid))).data().stars,65);
  });

  await t.test("Rejection is atomic and irreversible in the browser",async()=>{
    const order=await addDoc(collection(customer.db,"starOrders"),{
      userId:customer.uid,userName:"مشتري",stars:3,status:"pending",createdAt:Date.now()
    });
    await owner.call({action:"rejectTopup",id:order.id});
    assert.equal((await getDoc(order)).data().status,"rejected");
    await assert.rejects(()=>owner.call({action:"approveTopup",id:order.id}));
    await assert.rejects(()=>owner.call({action:"rejectTopup",id:order.id}));
    assert.equal((await getDoc(doc(owner.db,"users",customer.uid))).data().stars,65);
  });
});
