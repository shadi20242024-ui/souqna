const {test, before, after} = require("node:test");
const fs = require("node:fs");
const {initializeTestEnvironment, assertFails, assertSucceeds} = require("@firebase/rules-unit-testing");
const {doc, setDoc, updateDoc, getDoc} = require("firebase/firestore");
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId:"demo-souqna",
    firestore:{rules:fs.readFileSync("firestore.rules","utf8")}
  });
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db,"users","alice"),{name:"Alice",email:"alice@example.com",role:"user",stars:10});
    await setDoc(doc(db,"users","bob"),{name:"Bob",email:"bob@example.com",role:"user",stars:0});
    await setDoc(doc(db,"users","admin"),{name:"Admin",email:"admin@example.com",role:"admin",stars:0});
    await setDoc(doc(db,"stores","shop"),{ownerId:"alice",status:"approved",name:"Shop"});
    await setDoc(doc(db,"reviews","shop_alice"),{storeId:"shop",userId:"alice",stars:4,text:"Good"});
    await setDoc(doc(db,"starOrders","order1"),{userId:"alice",stars:5,status:"pending"});
  });
});
after(async () => {if(env)await env.cleanup();});
const dbFor = (uid, claims={}) => env.authenticatedContext(uid,claims).firestore();
test("users cannot change their own star balance", async () => {
  await assertFails(updateDoc(doc(dbFor("alice"),"users","alice"),{stars:999}));
});
test("users cannot grant themselves admin role", async () => {
  await assertFails(updateDoc(doc(dbFor("alice"),"users","alice"),{role:"admin"}));
});
test("users can edit their own display name", async () => {
  await assertSucceeds(updateDoc(doc(dbFor("alice"),"users","alice"),{name:"Alice B"}));
});
test("users cannot read another user's profile", async () => {
  await assertFails(getDoc(doc(dbFor("bob"),"users","alice")));
});
test("client-side star order approvals are denied even to admin claim", async () => {
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"starOrders","order1"),{status:"done"}));
});
test("star order creation requires positive integer stars", async () => {
  await assertFails(setDoc(doc(dbFor("alice"),"starOrders","invalid"),{userId:"alice",userName:"Alice",stars:-5,status:"pending",createdAt:Date.now()}));
});
test("review cannot be moved to another store", async () => {
  await assertFails(updateDoc(doc(dbFor("alice"),"reviews","shop_alice"),{storeId:"another"}));
});
test("store owner cannot directly assign paid plan", async () => {
  await assertFails(updateDoc(doc(dbFor("alice"),"stores","shop"),{plan:"vip"}));
});
test("public can read approved store", async () => {
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),"stores","shop")));
});

test("anonymous users cannot create star top-ups", async () => {
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),"starOrders","anon"),{userId:"alice",userName:"Alice",stars:10,status:"pending",createdAt:Date.now()}));
});
test("users cannot submit top-ups on behalf of others", async () => {
  await assertFails(setDoc(doc(dbFor("bob"),"starOrders","impersonation"),{userId:"alice",userName:"Alice",stars:10,status:"pending",createdAt:Date.now()}));
});
test("users cannot create financial ledger entries", async () => {
  await assertFails(setDoc(doc(dbFor("alice"),"transactions","fake"),{userId:"alice",type:"credit",amount:10000,createdAt:Date.now()}));
});
test("users cannot approve their own advertisements", async () => {
  await assertFails(setDoc(doc(dbFor("alice"),"ads","fake-approved"),{ownerId:"alice",status:"approved",title:"Fake"}));
});
test("owners cannot alter approved store ownership", async () => {
  await assertFails(updateDoc(doc(dbFor("alice"),"stores","shop"),{ownerId:"bob"}));
});
test("user cannot create notification impersonating admin", async () => {
  await assertFails(setDoc(doc(dbFor("alice"),"notifs","fake"),{userId:"bob",text:"Approved",read:false}));
});

test("new users can register with the actual SOUQNA profile shape", async () => {
  await assertSucceeds(setDoc(doc(dbFor("new-user",{email:"new@example.com"}),"users","new-user"),{
    name:"New User",email:"new@example.com",role:"user",stars:0
  }));
});
test("registration cannot start with free credited stars", async () => {
  await assertFails(setDoc(doc(dbFor("bad-user",{email:"bad@example.com"}),"users","bad-user"),{
    name:"Bad User",email:"bad@example.com",role:"user",stars:100
  }));
});
test("registration cannot create an administrator", async () => {
  await assertFails(setDoc(doc(dbFor("bad-admin",{email:"admin2@example.com"}),"users","bad-admin"),{
    name:"Bad Admin",email:"admin2@example.com",role:"admin",stars:0
  }));
});
test("users cannot update another user's name", async () => {
  await assertFails(updateDoc(doc(dbFor("bob"),"users","alice"),{name:"Changed"}));
});
test("client cannot reject star orders even with an admin claim", async () => {
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"starOrders","order1"),{status:"rejected"}));
});
test("client cannot approve subscriptions", async () => {
  await assertFails(setDoc(doc(dbFor("alice"),"subs","invalid-approval"),{userId:"alice",status:"done",stars:10,days:30}));
});
test("client cannot approve promotions", async () => {
  await assertFails(setDoc(doc(dbFor("alice"),"promos","invalid-approval"),{userId:"alice",status:"done",stars:10,days:30}));
});

test("staff cannot assign a paid plan to a store", async () => {
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"stores","shop"),{plan:"gold",planUntil:Date.now()+86400000}));
});
test("staff cannot mark an ad as featured directly", async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(),"ads","moderated-ad"),{ownerId:"alice",status:"pending",title:"Test ad"});
  });
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"ads","moderated-ad"),{featuredUntil:Date.now()+86400000}));
});
test("staff can moderate store status without changing paid fields", async () => {
  await assertSucceeds(updateDoc(doc(dbFor("admin",{admin:true}),"stores","shop"),{status:"rejected"}));
});

test("store owner cannot self-approve a pending store", async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(),"stores","pending-owner-store"),{ownerId:"alice",status:"pending",name:"New Store"});
  });
  await assertFails(updateDoc(doc(dbFor("alice"),"stores","pending-owner-store"),{status:"approved"}));
});
test("advertiser cannot approve their own pending ad", async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(),"ads","pending-owner-ad"),{ownerId:"alice",status:"pending",title:"New Ad"});
  });
  await assertFails(updateDoc(doc(dbFor("alice"),"ads","pending-owner-ad"),{status:"approved"}));
});
test("administrator can approve a pending advertisement", async () => {
  await assertSucceeds(updateDoc(doc(dbFor("admin",{admin:true}),"ads","pending-owner-ad"),{status:"approved"}));
});
test("administrator cannot modify an advertisement paid feature expiry", async () => {
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"ads","pending-owner-ad"),{featuredUntil:Date.now()+86400000}));
});
