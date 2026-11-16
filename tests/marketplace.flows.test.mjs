import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, collection, addDoc, doc, getDoc, getDocs,
  setDoc, updateDoc, query, where, runTransaction, increment
} from "firebase/firestore";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-souqna-rules";

test("SOUQNA customer lifecycle against Auth + Firestore emulators", async t => {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
  const app = initializeApp({
    apiKey: "fake-api-key-for-emulator-only",
    authDomain: PROJECT_ID + ".firebaseapp.com",
    projectId: PROJECT_ID
  }, "souqna-lifecycle-" + Date.now());
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  t.after(async () => {
    await signOut(auth).catch(() => {});
    await deleteApp(app);
    await env.cleanup();
  });

  await env.withSecurityRulesDisabled(async ctx => {
    const seed = ctx.firestore();
    await Promise.all([
      setDoc(doc(seed, "users", "flow-admin"), { name: "المدير", email: "admin@example.test", role: "admin", stars: 0 }),
      setDoc(doc(seed, "users", "flow-other"), { name: "مستخدم آخر", email: "other@example.test", role: "user", stars: 0 }),
      setDoc(doc(seed, "stores", "flow-other-store"), { ownerId: "flow-other", name: "متجر مستخدم آخر", status: "approved" }),
      setDoc(doc(seed, "plans", "flow-gold"), { name: "ذهبية", stars: 20, days: 30, maxAds: 50, active: true, order: 2 }),
      setDoc(doc(seed, "plans", "free"), { name: "مجانية", stars: 0, days: 0, maxAds: 5, active: true, order: 0 })
    ]);
  });

  const admin = env.authenticatedContext("flow-admin").firestore();
  const visitor = env.unauthenticatedContext().firestore();
  const email = "flow-" + Date.now() + "@example.test";
  const password = "FlowTest2026!";

  await t.test("Registration creates a real Auth-emulator identity and default profile", async () => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    assert.ok(uid && uid.length > 5);
    await credential.user.getIdToken();
    await assertSucceeds(setDoc(doc(db, "users", uid), {
      name: "زبون تجريبي", email, role: "user", stars: 0
    }));
    const profile = await getDoc(doc(db, "users", uid));
    assert.equal(profile.data().role, "user");
    assert.equal(profile.data().stars, 0);
    await assertFails(updateDoc(doc(db, "users", uid), { stars: 999 }));
    await assertFails(updateDoc(doc(db, "users", uid), { role: "admin" }));
    await signOut(auth);
    const login = await signInWithEmailAndPassword(auth, email, password);
    assert.equal(login.user.uid, uid, "Sign in should restore the same account");
  });

  const uid = auth.currentUser.uid;
  let firstStoreRef, secondStoreRef;
  await t.test("A user can create two independent stores; only staff can approve them", async () => {
    const store = { name: "متجرنا الأول", desc: "مستلزمات", area: "السويداء", map: "",
      logo: "", cover: "", phone: "963999999999", ownerId: uid,
      ownerName: "زبون تجريبي", status: "pending", createdAt: Date.now() };
    firstStoreRef = await addDoc(collection(db, "stores"), store);
    secondStoreRef = await addDoc(collection(db, "stores"), { ...store, name: "المتجر الثاني" });
    await assertFails(updateDoc(firstStoreRef, { status: "approved" }));
    await assertFails(getDoc(doc(visitor, "stores", firstStoreRef.id)));
    const queue = await assertSucceeds(getDocs(query(collection(admin, "stores"), where("status", "==", "pending"))));
    assert.ok(queue.docs.some(x => x.id === firstStoreRef.id));
    await assertSucceeds(updateDoc(doc(admin, "stores", firstStoreRef.id), { status: "approved" }));
    await assertSucceeds(updateDoc(doc(admin, "stores", secondStoreRef.id), { status: "approved" }));
    const published = await assertSucceeds(getDocs(query(collection(visitor, "stores"), where("status", "==", "approved"))));
    assert.ok(published.docs.some(x => x.id === firstStoreRef.id));
    await assertFails(updateDoc(firstStoreRef, { plan: "flow-gold", planUntil: Date.now() + 86400000 }));
  });

  let userAdRef;
  await t.test("A user posts an ad; moderation gates visibility and store ownership", async () => {
    const ad = {
      ownerId: uid, ownerName: "زبون تجريبي", title: "سيارة للبيع",
      price: 2500, cur: "$", cat: "cars", area: "السويداء", desc: "تفاصيل الإعلان",
      phone: "963999999999", img: "", status: "pending", createdAt: Date.now(),
      storeId: firstStoreRef.id
    };
    userAdRef = await addDoc(collection(db, "ads"), ad);
    await assertFails(updateDoc(userAdRef, { status: "approved" }));
    await assertFails(getDoc(doc(visitor, "ads", userAdRef.id)));
    await assertFails(addDoc(collection(db, "ads"), { ...ad, storeId: "flow-other-store" }));
    const awaiting = await assertSucceeds(getDocs(query(collection(admin, "ads"), where("status", "==", "pending"))));
    assert.ok(awaiting.docs.some(x => x.id === userAdRef.id));
    await assertSucceeds(updateDoc(doc(admin, "ads", userAdRef.id), { status: "approved" }));
    const visible = await assertSucceeds(getDocs(query(collection(visitor, "ads"), where("status", "==", "approved"))));
    assert.ok(visible.docs.some(x => x.id === userAdRef.id));
  });

  let subscriptionRef;
  await t.test("Customer purchases stars via manual approval, then requests a plan for one store", async () => {
    const topupRef = await addDoc(collection(db, "starOrders"), {
      userId: uid, userName: "زبون تجريبي", stars: 30, status: "pending", createdAt: Date.now()
    });
    const userRef = doc(admin, "users", uid);
    await assertFails(updateDoc(doc(db, "starOrders", topupRef.id), { status: "done" }));
    await assertSucceeds(runTransaction(admin, async tx => {
      const [order, account] = await Promise.all([tx.get(doc(admin,"starOrders",topupRef.id)),tx.get(userRef)]);
      assert.equal(order.data().status,"pending");
      assert.equal(account.data().stars,0);
      tx.update(userRef,{stars:increment(30)});
      tx.set(doc(admin,"transactions","topup_"+topupRef.id),{
        userId:uid,type:"credit",amount:30,note:"اختبار دفع يدوي",createdAt:Date.now()
      });
      tx.update(doc(admin,"starOrders",topupRef.id),{status:"done"});
    }));
    assert.equal((await getDoc(doc(db,"users",uid))).data().stars,30);
    subscriptionRef = await addDoc(collection(db, "subs"), {
      userId: uid, userName: "زبون تجريبي", storeId: firstStoreRef.id,
      storeName: "متجرنا الأول", planId: "flow-gold", planName: "ذهبية",
      stars: 20, days: 30, status: "pending", createdAt: Date.now()
    });
    await assertFails(addDoc(collection(db, "subs"), {
      userId:uid,userName:"زبون تجريبي",storeId:"flow-other-store",
      planId:"flow-gold",status:"pending",createdAt:Date.now()
    }));
    await assertFails(updateDoc(doc(db,"subs",subscriptionRef.id), { status:"done" }));
  });

  await t.test("Admin activates the requested plan atomically, and repeated approvals fail", async () => {
    const now=Date.now();
    const approval=() => runTransaction(admin,async tx=>{
      const subRef=doc(admin,"subs",subscriptionRef.id);
      const userRef=doc(admin,"users",uid);
      const storeRef=doc(admin,"stores",firstStoreRef.id);
      const planRef=doc(admin,"plans","flow-gold");
      const [sub,user,store,plan]=await Promise.all([
        tx.get(subRef),tx.get(userRef),tx.get(storeRef),tx.get(planRef)
      ]);
      if(sub.data().status!=="pending")throw Error("Already processed");
      if(store.data().ownerId!==sub.data().userId)throw Error("Ownership mismatch");
      if(user.data().stars<plan.data().stars)throw Error("Insufficient balance");
      const days=plan.data().days;
      tx.update(userRef,{stars:increment(-plan.data().stars)});
      tx.update(storeRef,{plan:"flow-gold",planUntil:now+days*86400000});
      tx.set(doc(admin,"transactions","sub_"+subscriptionRef.id),{
        userId:uid,type:"debit",amount:-plan.data().stars,note:"اشتراك المتجر",createdAt:now
      });
      tx.update(subRef,{status:"done",approvedAt:now,chargedStars:plan.data().stars});
    });
    const results=await Promise.allSettled([approval(),approval()]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal((await getDoc(doc(db,"users",uid))).data().stars,10);
    const first=(await getDoc(firstStoreRef)).data(),second=(await getDoc(secondStoreRef)).data();
    assert.equal(first.plan,"flow-gold");
    assert.ok(first.planUntil>Date.now());
    assert.ok(!second.plan, "Second store must have its own independent subscription");
    assert.equal((await getDoc(doc(admin,"subs",subscriptionRef.id))).data().status,"done");
    assert.equal((await getDoc(doc(admin,"transactions","sub_"+subscriptionRef.id))).data().amount,-20);
  });
});
