"use strict";
// Real client SDK + Firebase Auth/Firestore Emulators: no production access.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createRequire}=require("node:module");
const path=require("node:path");
const {initializeApp,deleteApp}=require("firebase/app");
const {
  getAuth,connectAuthEmulator,createUserWithEmailAndPassword,
  getIdTokenResult,signOut
}=require("firebase/auth");
const {
  getFirestore,connectFirestoreEmulator,doc,setDoc,updateDoc,getDoc,
  getDocs,collection,query,where
}=require("firebase/firestore");
const requireFunctions=createRequire(path.resolve(__dirname,"../../functions/index.js"));
const {initializeApp:initializeAdmin,deleteApp:deleteAdmin}=requireFunctions("firebase-admin/app");
const {getAuth:getAdminAuth}=requireFunctions("firebase-admin/auth");
const {getFirestore:getAdminFirestore}=requireFunctions("firebase-admin/firestore");

const PROJECT="demo-souqna";
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost=process.env.FIRESTORE_EMULATOR_HOST;
if(!authHost||!firestoreHost){
  throw new Error("Both Auth and Firestore Emulators are mandatory. Refusing production connections.");
}
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(authHost)||
   !/^(localhost|127\.0\.0\.1):\d+$/.test(firestoreHost) ||
   (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT!==PROJECT)){
  throw new Error("Unsafe emulator host/project. Refusing to run staging-flow tests.");
}
const [fsHost,fsPort]=firestoreHost.split(":");
const clientApps=[];
const newClient=name=>{
  const app=initializeApp({apiKey:"demo-public-test-key",authDomain:PROJECT+".firebaseapp.com",projectId:PROJECT,appId:"demo:"+name},name);
  clientApps.push(app);
  const auth=getAuth(app);
  connectAuthEmulator(auth,"http://"+authHost,{disableWarnings:true});
  const db=getFirestore(app);
  connectFirestoreEmulator(db,fsHost,Number(fsPort));
  return {app,auth,db};
};
const adminApp=initializeAdmin({projectId:PROJECT},"souqna-staging-flows");
const adminAuth=getAdminAuth(adminApp);
const adminDb=getAdminFirestore(adminApp);
const now=Date.now();

test("staging-only customer journey: registration, private ad review and paid banners",async t=>{
  const advertiser=newClient("advertiser");
  const customer=newClient("customer");
  const manager=newClient("manager");
  const anonymous=newClient("anonymous");
  try{
    let advertiserUid,customerUid,managerUid;

    await t.test("customer accounts are created with zero stars and cannot gain roles",async()=>{
      const a=await createUserWithEmailAndPassword(advertiser.auth,"seller-souqna@example.test","StrongTestPassword123!");
      advertiserUid=a.user.uid;
      const profile={name:"بائع من السويداء",email:a.user.email,role:"user",stars:0};
      await setDoc(doc(advertiser.db,"users",advertiserUid),profile);
      assert.equal((await getDoc(doc(advertiser.db,"users",advertiserUid))).data().stars,0);
      await assert.rejects(
        updateDoc(doc(advertiser.db,"users",advertiserUid),{role:"admin"}),
        /permission|denied/i
      );
      const c=await createUserWithEmailAndPassword(customer.auth,"buyer-souqna@example.test","StrongTestPassword123!");
      customerUid=c.user.uid;
      await setDoc(doc(customer.db,"users",customerUid),{
        name:"مشتري",email:c.user.email,role:"user",stars:0
      });
      await assert.rejects(getDoc(doc(customer.db,"users",advertiserUid)),/permission|denied/i);
    });

    await t.test("customer can submit an ad for moderation; other users cannot read it",async()=>{
      await setDoc(doc(advertiser.db,"ads","staging-souqna-ad"),{
        ownerId:advertiserUid,ownerName:"بائع من السويداء",status:"pending",
        title:"سيارة مستعملة — إعلان تجريبي",price:2200,cur:"$",
        cat:"cars",area:"السويداء",desc:"إعلان لا ينشر خارج المحاكي",
        phone:"963912345678",img:"",createdAt:now
      });
      assert.equal((await getDoc(doc(advertiser.db,"ads","staging-souqna-ad"))).data().status,"pending");
      await assert.rejects(getDoc(doc(customer.db,"ads","staging-souqna-ad")),/permission|denied/i);
      await assert.rejects(
        updateDoc(doc(advertiser.db,"ads","staging-souqna-ad"),{status:"approved"}),
        /permission|denied/i
      );
      await assert.rejects(setDoc(doc(anonymous.db,"ads","anonymous-ad"),{
        ownerId:"any",status:"pending",title:"Unauthenticated"
      }),/permission|denied/i);
    });

    await t.test("trusted claim is assigned only server-side and enables admin moderation reads",async()=>{
      const a=await createUserWithEmailAndPassword(manager.auth,"manager-souqna@example.test","StrongTestPassword123!");
      managerUid=a.user.uid;
      await setDoc(doc(manager.db,"users",managerUid),{name:"إدارة سوقنا",email:a.user.email,role:"user",stars:0});
      const before=await getIdTokenResult(manager.auth.currentUser);
      assert.notEqual(before.claims.admin,true);
      await assert.rejects(
        setDoc(doc(manager.db,"sponsors","staging-sponsor"),{company:"أعلان تجريبي",active:true}),
        /permission|denied/i
      );
      await adminAuth.setCustomUserClaims(managerUid,{admin:true});
      const refreshed=await getIdTokenResult(manager.auth.currentUser,true);
      assert.equal(refreshed.claims.admin,true);
      const pending=await getDoc(doc(manager.db,"ads","staging-souqna-ad"));
      assert.equal(pending.data().status,"pending");
      // Admin SDK is the trusted backend, never the web client's account.
      await adminDb.doc("ads/staging-souqna-ad").update({
        status:"approved",reviewedAt:now,reviewedBy:managerUid
      });
    });

    await t.test("after backend approval, the ad appears in public queries",async()=>{
      const results=await getDocs(query(collection(anonymous.db,"ads"),where("status","==","approved")));
      assert.equal(results.docs.filter(x=>x.id==="staging-souqna-ad").length,1);
      assert.equal((await getDoc(doc(customer.db,"ads","staging-souqna-ad"))).data().status,"approved");
    });

    await t.test("paid banner creation requires trusted administrator claim",async()=>{
      const banner={
        company:"متجر سويداء تجريبي",title:"عرض مدفوع تجريبي",
        desc:"لا تظهر بيانات الاختبار على الموقع الفعلي",
        img:"https://example.com/banner.webp",url:"https://example.com",
        phone:"963912345678",active:true,paymentVerified:true,
        paymentVerifiedBy:managerUid,paymentVerifiedAt:now,
        from:now-1000,to:now+86400000,priority:5,createdAt:now
      };
      await assert.rejects(
        setDoc(doc(customer.db,"sponsors","staging-sponsor"),banner),
        /permission|denied/i
      );
      await setDoc(doc(manager.db,"sponsors","staging-sponsor"),banner);
      const loaded=await getDoc(doc(anonymous.db,"sponsors","staging-sponsor"));
      assert.equal(loaded.data().paymentVerified,true);
      assert.equal(loaded.data().company,banner.company);
      await assert.rejects(
        updateDoc(doc(customer.db,"sponsors","staging-sponsor"),{paymentVerified:false}),
        /permission|denied/i
      );
    });
  }finally{
    for(const client of [advertiser,customer,manager,anonymous]){
      if(client.auth.currentUser)await signOut(client.auth);
    }
    await Promise.all(clientApps.map(deleteApp));
    await deleteAdmin(adminApp);
  }
});
