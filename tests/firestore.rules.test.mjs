import { test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, runTransaction, increment
} from "firebase/firestore";

test("SOUQNA Firestore authorization matrix", async (t) => {
  const env = await initializeTestEnvironment({
    projectId: "demo-souqna-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
  t.after(async () => { await env.cleanup(); });

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db,"users","owner"),{name:"مالك",email:"owner@example.test",role:"admin",stars:100}),
      setDoc(doc(db,"users","alice"),{name:"أليس",email:"alice@example.test",role:"user",stars:3}),
      setDoc(doc(db,"users","bob"),{name:"بوب",email:"bob@example.test",role:"user",stars:0}),
      setDoc(doc(db,"ads","public"),{title:"سيارة",ownerId:"alice",status:"approved",createdAt:1}),
      setDoc(doc(db,"ads","private"),{title:"إعلان خاص",ownerId:"alice",status:"pending",createdAt:2}),
      setDoc(doc(db,"stores","open"),{name:"متجر",ownerId:"alice",status:"approved",createdAt:1}),
      setDoc(doc(db,"stores","closed"),{name:"معلق",ownerId:"bob",status:"pending",createdAt:2}),
      setDoc(doc(db,"plans","vip"),{name:"VIP",stars:50,days:30,active:true,maxAds:100}),
      setDoc(doc(db,"sponsorRequests","pending"),{userId:"alice",userName:"أليس",status:"pending",company:"متجر",title:"حملة",phone:"963999999999",days:5,createdAt:3})
    ]);
  });

  const anon = env.unauthenticatedContext().firestore();
  const alice = env.authenticatedContext("alice").firestore();
  const bob = env.authenticatedContext("bob").firestore();
  const admin = env.authenticatedContext("owner").firestore();

  await t.test("Anonymous users can query published ads and stores", async () => {
    await assertSucceeds(getDocs(query(collection(anon,"ads"),where("status","==","approved"))));
    await assertSucceeds(getDocs(query(collection(anon,"stores"),where("status","==","approved"))));
  });
  await t.test("Anonymous users cannot query all ads or view pending ads", async () => {
    await assertFails(getDocs(collection(anon,"ads")));
    await assertFails(getDoc(doc(anon,"ads","private")));
  });
  await t.test("Account holders can access only their own non-public listings", async () => {
    await assertSucceeds(getDoc(doc(alice,"ads","private")));
    await assertFails(getDoc(doc(bob,"ads","private")));
    await assertFails(getDoc(doc(alice,"stores","closed")));
  });
  await t.test("Ordinary users cannot promote themselves to administrator", async () => {
    await assertFails(updateDoc(doc(alice,"users","alice"),{role:"admin"}));
    await assertFails(updateDoc(doc(alice,"users","alice"),{stars:9999}));
    await assertFails(setDoc(doc(alice,"users","new-admin"),{name:"x",email:"x@example.test",role:"admin",stars:0}));
  });
  await t.test("Ordinary user can create pending ad, not preapproved ad", async () => {
    await assertSucceeds(setDoc(doc(alice,"ads","alice-pending"),{
      ownerId:"alice",ownerName:"أليس",status:"pending",title:"عقار",price:150,
      cur:"$",cat:"real_estate",area:"السويداء",desc:"وصف",phone:"963999999999",
      img:"",createdAt:Date.now()
    }));
    await assertFails(setDoc(doc(alice,"ads","alice-fraud"),{
      ownerId:"alice",ownerName:"أليس",status:"approved",title:"معلن",price:150,
      cur:"$",cat:"real_estate",area:"السويداء",desc:"وصف",phone:"963999999999",
      img:"",createdAt:Date.now()
    }));
  });
  await t.test("Store owner may edit details but cannot upgrade plan", async () => {
    await assertSucceeds(updateDoc(doc(alice,"stores","open"),{desc:"تعديل وصف"}));
    await assertFails(updateDoc(doc(alice,"stores","open"),{plan:"vip",planUntil:Date.now()+30*86400000}));
    await assertFails(updateDoc(doc(bob,"stores","open"),{name:"سرقة متجر"}));
  });
  await t.test("Client cannot credit stars or write ledgers", async () => {
    await assertFails(updateDoc(doc(alice,"users","alice"),{stars:100}));
    await assertFails(setDoc(doc(alice,"transactions","fraud"),{userId:"alice",amount:100,type:"credit"}));
    await assertSucceeds(updateDoc(doc(admin,"users","alice"),{stars:5}));
    await assertSucceeds(setDoc(doc(admin,"transactions","legit"),{
      userId:"alice",amount:2,type:"credit",note:"إدارة",createdAt:Date.now()
    }));
  });
  await t.test("Users may create only their own pending sponsor requests", async () => {
    await assertSucceeds(setDoc(doc(alice,"sponsorRequests","new"),{
      userId:"alice",userName:"أليس",company:"شركة",title:"بانر",desc:"إعلان",
      phone:"963999999999",days:15,img:"",status:"pending",createdAt:Date.now()
    }));
    await assertFails(setDoc(doc(bob,"sponsorRequests","fraud"),{
      userId:"alice",userName:"بوب",company:"شركة",title:"بانر",desc:"",
      phone:"963999999999",days:15,img:"",status:"approved",createdAt:Date.now()
    }));
    await assertFails(updateDoc(doc(alice,"sponsorRequests","pending"),{status:"approved"}));
  });
  await t.test("Only administrator may activate sponsor banners", async () => {
    await assertFails(setDoc(doc(alice,"sponsors","fake"),{title:"إعلان وهمي",active:true}));
    await assertSucceeds(setDoc(doc(admin,"sponsors","real"),{title:"إعلان حقيقي",active:true}));
    await assertSucceeds(updateDoc(doc(admin,"sponsorRequests","pending"),{status:"approved"}));
  });
  await t.test("New account may have only default customer role and zero stars", async () => {
    await assertSucceeds(setDoc(doc(bob,"users","bob"),{name:"تغيير الاسم",email:"bob@example.test",role:"user",stars:0}));
    await assertFails(setDoc(doc(bob,"users","bob"),{role:"admin",stars:500},{merge:true}));
  });
  await t.test("Concurrent admin approvals credit stars exactly once", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(),"starOrders","topup-1"),{
        userId:"alice",userName:"أليس",stars:7,status:"pending",createdAt:Date.now()
      });
    });
    const orderRef=doc(admin,"starOrders","topup-1");
    const userRef=doc(admin,"users","alice");
    const ledgerRef=doc(admin,"transactions","topup_topup-1");
    const approve=() => runTransaction(admin,async tx => {
      const [r,u]=await Promise.all([tx.get(orderRef),tx.get(userRef)]);
      if(!r.exists()||r.data().status!=="pending")throw Error("already processed");
      tx.update(userRef,{stars:increment(7)});
      tx.set(ledgerRef,{userId:"alice",type:"credit",amount:7,note:"Test top-up",createdAt:Date.now()});
      tx.update(orderRef,{status:"done"});
    });
    const results=await Promise.allSettled([approve(),approve()]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1,"Only one transaction should succeed");
    assert.equal((await getDoc(userRef)).data().stars,12,"Account should receive exactly seven stars");
    assert.equal((await getDoc(ledgerRef)).data().amount,7);
    assert.equal((await getDoc(orderRef)).data().status,"done");
  });

  await t.test("Ordinary user cannot execute admin billing transaction", async () => {
    await assertFails(runTransaction(alice, async tx => {
      const userRef=doc(alice,"users","alice");
      const current=await tx.get(userRef);
      if(!current.exists())throw Error("missing user");
      tx.update(userRef,{stars:increment(10000)});
      tx.set(doc(alice,"transactions","self-credit"),{
        userId:"alice",amount:10000,type:"credit",createdAt:Date.now()
      });
    }));
  });

  await t.test("Reject unsafe document IDs in user-created ads", async () => {
    await assertFails(setDoc(doc(alice,"ads",'bad"onmouseover="alert(1)'),{
      ownerId:"alice",ownerName:"أليس",status:"pending",title:"اختبار",price:1,
      cur:"$",cat:"cars",area:"السويداء",desc:"",phone:"963999999999",
      img:"",createdAt:Date.now()
    }));
  });

});
