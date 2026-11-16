const {test, before, after} = require("node:test");
const fs = require("node:fs");
const {initializeTestEnvironment, assertFails, assertSucceeds} = require("@firebase/rules-unit-testing");
const {doc, setDoc, updateDoc, getDoc, deleteDoc} = require("firebase/firestore");
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
    await setDoc(doc(db,"ads","favoriteAd"),{ownerId:"alice",status:"approved",title:"Approved Ad"});
    await setDoc(doc(db,"ads","pendingFavoriteAd"),{ownerId:"alice",status:"pending",title:"Pending Ad"});
    await setDoc(doc(db,"reviews","shop_alice"),{storeId:"shop",userId:"alice",stars:4,text:"Good"});
    await setDoc(doc(db,"starOrders","order1"),{userId:"alice",stars:5,status:"pending"});
    await setDoc(doc(db,"sorders","service1"),{userId:"alice",status:"new",serviceName:"Design Service"});
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
test("staff cannot bypass store moderation callable", async () => {
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"stores","shop"),{status:"rejected"}));
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
test("administrator cannot approve an ad directly from browser", async () => {
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"ads","pending-owner-ad"),{status:"approved"}));
});
test("administrator cannot modify an advertisement paid feature expiry", async () => {
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"ads","pending-owner-ad"),{featuredUntil:Date.now()+86400000}));
});

test("trusted admin custom claim can read pending store owned by another user", async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(),"stores","admin-claim-store"),{ownerId:"alice",status:"pending",name:"Waiting Store"});
  });
  await assertSucceeds(getDoc(doc(dbFor("claim-admin",{admin:true}),"stores","admin-claim-store")));
});
test("regular user cannot read another owner's pending store", async () => {
  await assertFails(getDoc(doc(dbFor("bob"),"stores","admin-claim-store")));
});
test("trusted admin custom claim can read pending financial requests", async () => {
  await assertSucceeds(getDoc(doc(dbFor("claim-admin",{admin:true}),"starOrders","order1")));
});
test("trusted admin custom claim still cannot approve financial requests directly", async () => {
  await assertFails(updateDoc(doc(dbFor("claim-admin",{admin:true}),"starOrders","order1"),{status:"done"}));
});

test("service order owner cannot change workflow status",async()=>{
  await assertFails(updateDoc(doc(dbFor("alice"),"sorders","service1"),{status:"done"}));
});
test("staff cannot update a service order directly from the browser",async()=>{
  await assertFails(updateDoc(doc(dbFor("admin",{admin:true}),"sorders","service1"),{status:"progress"}));
});
test("trusted staff can read service orders",async()=>{
  await assertSucceeds(getDoc(doc(dbFor("admin",{admin:true}),"sorders","service1")));
});
test("other customers cannot access private service orders",async()=>{
  await assertFails(getDoc(doc(dbFor("bob"),"sorders","service1")));
});

test("user can save approved advertisement privately",async()=>{
  await assertSucceeds(setDoc(doc(dbFor("alice"),"favorites","alice_favoriteAd"),{
    userId:"alice",adId:"favoriteAd",createdAt:Date.now()
  }));
  await assertSucceeds(getDoc(doc(dbFor("alice"),"favorites","alice_favoriteAd")));
});
test("another user cannot read saved favorites",async()=>{
  await assertFails(getDoc(doc(dbFor("bob"),"favorites","alice_favoriteAd")));
});
test("anonymous cannot save an advertisement",async()=>{
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),"favorites","anon_favoriteAd"),{
    userId:"anon",adId:"favoriteAd",createdAt:Date.now()
  }));
});
test("user cannot create another account's favorites",async()=>{
  await assertFails(setDoc(doc(dbFor("bob"),"favorites","alice_other"),{
    userId:"alice",adId:"favoriteAd",createdAt:Date.now()
  }));
});
test("user cannot favorite a pending advertisement",async()=>{
  await assertFails(setDoc(doc(dbFor("alice"),"favorites","alice_pendingFavoriteAd"),{
    userId:"alice",adId:"pendingFavoriteAd",createdAt:Date.now()
  }));
});
test("user cannot write a favorite without correct deterministic ID",async()=>{
  await assertFails(setDoc(doc(dbFor("alice"),"favorites","unrelated"),{
    userId:"alice",adId:"favoriteAd",createdAt:Date.now()
  }));
});
test("user cannot mutate favorite ownership or target advertisement",async()=>{
  await assertFails(updateDoc(doc(dbFor("alice"),"favorites","alice_favoriteAd"),{
    userId:"bob",adId:"pendingFavoriteAd"
  }));
});
test("user cannot delete another account's favorite",async()=>{
  await assertFails(deleteDoc(doc(dbFor("bob"),"favorites","alice_favoriteAd")));
});
test("owner can remove a saved advertisement",async()=>{
  await assertSucceeds(deleteDoc(doc(dbFor("alice"),"favorites","alice_favoriteAd")));
});
