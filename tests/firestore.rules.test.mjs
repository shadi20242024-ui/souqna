import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, runTransaction, increment, serverTimestamp
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
      setDoc(doc(db,"users","moderator"),{name:"مشرف",email:"moderator@example.test",role:"moderator",stars:0}),
      setDoc(doc(db,"notifs","private-note"),{userId:"alice",text:"إشعار مالي خاص",read:false,createdAt:Date.now()}),
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
  const moderator = env.authenticatedContext("moderator").firestore();

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
  await t.test("Direct listing creation denied: use trusted Marketplace callable", async () => {
    await assertFails(setDoc(doc(alice,"ads","alice-pending"),{
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
  await t.test("All direct listing writes are denied, even with plausible values", async () => {
    const valid={
      ownerId:"alice",ownerName:"أليس",status:"pending",title:"سيارة للبيع",
      price:150,cur:"$",cat:"cars",area:"السويداء",desc:"وصف مختصر",
      phone:"963999999999",img:"",createdAt:Date.now()
    };
    await assertFails(setDoc(doc(alice,"ads","bad-negative"),{...valid,price:-50}));
    await assertFails(setDoc(doc(alice,"ads","bad-nan"),{...valid,price:"غير معروف"}));
    await assertFails(setDoc(doc(alice,"ads","bad-title"),{...valid,title:"X".repeat(151)}));
    await assertFails(setDoc(doc(alice,"ads","bad-phone"),{...valid,phone:"abc123"}));
    await assertFails(setDoc(doc(alice,"ads","bad-image"),{...valid,img:"data:text/html;base64,PHNjcmlwdD4="}));
    await assertFails(setDoc(doc(alice,"ads","bad-big-image"),{...valid,img:"data:image/png;base64,"+"A".repeat(700001)}));
    await assertFails(setDoc(doc(alice,"ads","bad-hash"),{...valid,imgHash:"forged"}));
    await assertFails(setDoc(doc(alice,"ads","bad-extra"),{...valid,adminApproved:true}));
    await assertFails(setDoc(doc(alice,"ads","valid-listing"),valid));
  });

  await t.test("Direct store creation is denied and financial request fields are checked", async () => {
    const store={
      name:"متجر للاختبار",desc:"وصف",phone:"963999999999",area:"السويداء",map:"",
      logo:"",cover:"",ownerId:"alice",ownerName:"أليس",status:"pending",createdAt:Date.now()
    };
    await assertFails(setDoc(doc(alice,"stores","bad-cover"),{...store,cover:"X".repeat(700002)}));
    await assertFails(setDoc(doc(alice,"stores","bad-name"),{...store,name:"X".repeat(121)}));
    await assertFails(setDoc(doc(alice,"stores","valid-store"),store));
    const topup={userId:"alice",userName:"أليس",stars:5,status:"pending",createdAt:Date.now()};
    await assertFails(setDoc(doc(alice,"starOrders","fake-topup"),{...topup,paymentReceiptId:"pretend-paid"}));
    await assertFails(setDoc(doc(alice,"starOrders","bad-stars"),{...topup,stars:5.3}));
    await assertSucceeds(setDoc(doc(alice,"starOrders","valid-topup"),topup));
    const sponsor={
      userId:"alice",userName:"أليس",company:"شركة اختبار",title:"بنر اختبار",
      desc:"",phone:"963999999999",days:7,img:"",status:"pending",createdAt:Date.now()
    };
    await assertFails(setDoc(doc(alice,"sponsorRequests","fake-sponsor"),{...sponsor,approvedBy:"admin"}));
    await assertFails(setDoc(doc(alice,"sponsorRequests","bad-sponsor-days"),{...sponsor,days:7.5}));
    await assertSucceeds(setDoc(doc(alice,"sponsorRequests","valid-sponsor"),sponsor));
  });

  await t.test("Private notifications cannot be read by unrelated staff", async () => {
    await assertSucceeds(getDoc(doc(alice,"notifs","private-note")));
    await assertSucceeds(getDoc(doc(admin,"notifs","private-note")));
    await assertFails(getDoc(doc(bob,"notifs","private-note")));
    await assertFails(getDoc(doc(moderator,"notifs","private-note")));
  });

  await t.test("Favorites are private per account and only for published ads", async () => {
    const ref = doc(alice,"favorites","alice_public");
    await assertSucceeds(setDoc(ref,{userId:"alice",adId:"public",createdAt:Date.now()}));
    await assertSucceeds(getDoc(ref));
    const own=await assertSucceeds(getDocs(query(collection(alice,"favorites"),where("userId","==","alice"))));
    assert.equal(own.docs.length,1);
    await assertFails(getDoc(doc(bob,"favorites","alice_public")));
    await assertFails(getDoc(doc(anon,"favorites","alice_public")));
    await assertFails(getDocs(collection(alice,"favorites")));
    await assertFails(getDocs(query(collection(bob,"favorites"),where("userId","==","alice"))));
    await assertFails(setDoc(doc(bob,"favorites","alice_public"),{userId:"alice",adId:"public",createdAt:Date.now()}));
    await assertFails(setDoc(doc(alice,"favorites","alice_private"),{userId:"alice",adId:"private",createdAt:Date.now()}));
    await assertFails(setDoc(doc(alice,"favorites","alice_missing"),{userId:"alice",adId:"missing",createdAt:Date.now()}));
    await assertFails(setDoc(doc(alice,"favorites","wrong_public"),{userId:"alice",adId:"public",createdAt:Date.now()}));
    await assertFails(updateDoc(ref,{adId:"private"}));
    await assertFails(deleteDoc(doc(bob,"favorites","alice_public")));
    await assertSucceeds(deleteDoc(ref));
    const remaining=await assertSucceeds(getDocs(query(collection(alice,"favorites"),where("userId","==","alice"))));
    assert.equal(remaining.docs.length,0);
  });

  await t.test("Store owner may edit details but cannot upgrade plan", async () => {
    await assertSucceeds(updateDoc(doc(alice,"stores","open"),{desc:"تعديل وصف"}));
    await assertFails(updateDoc(doc(alice,"stores","open"),{plan:"vip",planUntil:Date.now()+30*86400000}));
    await assertFails(updateDoc(doc(bob,"stores","open"),{name:"سرقة متجر"}));
  });
  await t.test("Client cannot credit stars or write ledgers", async () => {
    await assertFails(updateDoc(doc(alice,"users","alice"),{stars:100}));
    await assertFails(setDoc(doc(alice,"transactions","fraud"),{userId:"alice",amount:100,type:"credit"}));
    await assertFails(updateDoc(doc(admin,"users","alice"),{stars:5}));
    await assertFails(setDoc(doc(admin,"transactions","legit"),{
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
    await assertFails(updateDoc(doc(admin,"sponsorRequests","pending"),{status:"approved"}));
    await assertFails(setDoc(doc(admin,"sponsors","forged-paid"),{title:"مدفوع",active:true,requestId:"pending"}));
  });
  await t.test("New accounts must record current consent version with a server timestamp", async () => {
    const charlie=env.authenticatedContext("charlie",{email:"charlie@example.test"}).firestore();
    const ref=doc(charlie,"users","charlie");
    const base={name:"مستخدم جديد",email:"charlie@example.test",role:"user",stars:0};
    const valid={...base,acceptedTermsVersion:"2026-11-19",acceptedPrivacyVersion:"2026-11-19",acceptedAt:serverTimestamp()};
    await assertFails(setDoc(ref,base));
    await assertFails(setDoc(ref,{...valid,acceptedTermsVersion:"2026-01-01"}));
    await assertFails(setDoc(ref,{...valid,acceptedAt:Date.now()}));
    await assertFails(setDoc(ref,{...valid,stars:999}));
    await assertFails(setDoc(doc(bob,"users","charlie"),valid));
    await assertSucceeds(setDoc(ref,valid));
    const user=await getDoc(ref);
    assert.equal(user.data().acceptedTermsVersion,"2026-11-19");
    assert.equal(user.data().acceptedPrivacyVersion,"2026-11-19");
    assert.ok(user.data().acceptedAt?.toDate() instanceof Date);
    await assertFails(updateDoc(ref,{acceptedTermsVersion:"2099-01-01"}));
  });

  await t.test("New account may have only default customer role and zero stars", async () => {
    await assertSucceeds(setDoc(doc(bob,"users","bob"),{name:"تغيير الاسم",email:"bob@example.test",role:"user",stars:0}));
    await assertFails(setDoc(doc(bob,"users","bob"),{role:"admin",stars:500},{merge:true}));
  });
  await t.test("Identity fields and staff roles reject unsafe writes", async () => {
    const dan=env.authenticatedContext("dan",{email:"dan@example.test"}).firestore();
    const original={name:"دان",email:"dan@example.test",role:"user",stars:0,
      acceptedTermsVersion:"2026-11-19",acceptedPrivacyVersion:"2026-11-19",
      acceptedAt:serverTimestamp()};
    await assertFails(setDoc(doc(dan,"users","dan"),{...original,email:"different@example.test"}));
    await assertFails(setDoc(doc(dan,"users","dan"),{...original,name:"x".repeat(120)}));
    await assertSucceeds(setDoc(doc(dan,"users","dan"),original));
    await assertFails(updateDoc(doc(dan,"users","dan"),{name:"x".repeat(130)}));
    await assertFails(updateDoc(doc(admin,"users","alice"),{role:"superadmin"}));
    await assertSucceeds(updateDoc(doc(dan,"users","dan"),{name:"دان الجديد"}));
  });

  await t.test("Store owner edits check field limits and media types", async () => {
    await assertSucceeds(updateDoc(doc(alice,"stores","open"),{desc:"وصف المتجر"}));
    await assertFails(updateDoc(doc(alice,"stores","open"),{phone:"123"}));
    await assertFails(updateDoc(doc(alice,"stores","open"),{map:"javascript:alert(1)"}));
    await assertFails(updateDoc(doc(alice,"stores","open"),{name:"x".repeat(130)}));
    await assertFails(updateDoc(doc(alice,"stores","open"),{logo:"data:image/svg+xml;base64,ZmFrZQ=="}));
    await assertSucceeds(updateDoc(doc(alice,"stores","open"),{phone:"963999999999"}));
  });

  await t.test("Public ratings require a published store and preserve attribution", async () => {
    const now=Date.now();
    const base={storeId:"open",userId:"alice",userName:"أليس",stars:5,text:"متجر ممتاز",createdAt:now};
    const ref=doc(alice,"reviews","open_alice");
    await assertFails(setDoc(doc(alice,"reviews","closed_alice"),{...base,storeId:"closed"}));
    await assertFails(setDoc(ref,{...base,stars:5.5}));
    await assertFails(setDoc(ref,{...base,text:"x".repeat(1600)}));
    await assertSucceeds(setDoc(ref,base));
    await assertFails(updateDoc(ref,{createdAt:now+1}));
    await assertFails(updateDoc(ref,{userName:"x".repeat(130)}));
    await assertFails(updateDoc(doc(bob,"reviews","open_alice"),{stars:1}));
    await assertSucceeds(updateDoc(ref,{stars:4,text:"خدمة جيدة"}));
  });

  await t.test("Private service orders and notifications reject forgery", async () => {
    await env.withSecurityRulesDisabled(async ctx =>
      setDoc(doc(ctx.firestore(),"services","design"),{name:"تصميم",active:true})
    );
    const order={userId:"alice",userName:"أليس",serviceId:"design",serviceName:"تصميم",
      partnerName:"",details:"أريد تصميماً",status:"new",createdAt:Date.now()};
    await assertFails(setDoc(doc(alice,"sorders","wrong"),{...order,userId:"bob"}));
    await assertFails(setDoc(doc(alice,"sorders","wrong-service"),{...order,serviceName:"مزيف"}));
    await assertSucceeds(setDoc(doc(alice,"sorders","order-valid"),order));
    await assertFails(updateDoc(doc(alice,"sorders","order-valid"),{status:"done"}));
    await assertFails(updateDoc(doc(moderator,"sorders","order-valid"),{userId:"moderator"}));
    await assertSucceeds(updateDoc(doc(moderator,"sorders","order-valid"),{status:"progress",note:"جارٍ المتابعة"}));
    const note={userId:"alice",text:"طلبك قيد التنفيذ",read:false,createdAt:Date.now()};
    await assertFails(setDoc(doc(moderator,"notifs","invalid-notice"),{...note,userId:"unlisted"}));
    await assertFails(setDoc(doc(moderator,"notifs","invalid-notice-2"),{...note,text:""}));
    await assertSucceeds(setDoc(doc(moderator,"notifs","valid-notice"),note));
    await assertFails(updateDoc(doc(moderator,"notifs","valid-notice"),{userId:"bob"}));
    await assertSucceeds(updateDoc(doc(alice,"notifs","valid-notice"),{read:true}));
  });

  await t.test("All client-side billing transactions are forbidden even to admins", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(),"starOrders","topup-1"),{
        userId:"alice",userName:"أليس",stars:7,status:"pending",createdAt:Date.now()
      });
    });
    await assertFails(runTransaction(admin,async tx=>{
      const userRef=doc(admin,"users","alice");
      const snap=await tx.get(userRef);
      if(!snap.exists())throw Error("User missing");
      tx.update(userRef,{stars:increment(7)});
      tx.set(doc(admin,"transactions","topup_topup-1"),{
        userId:"alice",type:"credit",amount:7,createdAt:Date.now()
      });
      tx.update(doc(admin,"starOrders","topup-1"),{status:"done"});
    }));
    assert.equal((await getDoc(doc(admin,"users","alice"))).data().stars,3);
    assert.equal((await getDoc(doc(admin,"starOrders","topup-1"))).data().status,"pending");
    await assertFails(updateDoc(doc(admin,"stores","open"),{plan:"vip",planUntil:Date.now()+864e5}));
    await assertFails(updateDoc(doc(admin,"ads","public"),{featuredUntil:Date.now()+864e5}));
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
