import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {resolveStagingOwner,normalizeEmail,inspectSingleStagingAccount,resolveConfirmedSingleStagingAccount}=require("../functions/owner-auth-lookup.cjs");
const email="shadi20242024@gmail.com";
const missing=()=>Object.assign(new Error("not found"),{code:"auth/user-not-found"});
const user=(uid,name=email)=>({uid,email:name,disabled:false});
const fakeAuth=(users=[],firstResult=null)=>{
  const calls={direct:0,list:0};
  return {
    calls,
    async getUserByEmail(){calls.direct++;if(firstResult)return firstResult;throw missing();},
    async listUsers(limit,token){calls.list++;assert.equal(limit,1000);assert.equal(token,undefined);return {users};}
  };
};
test("owner direct lookup only accepts exact normalized identity",async()=>{
  const a=fakeAuth([],user("owner-1"));
  const selected=await resolveStagingOwner(a,email);
  assert.equal(selected.uid,"owner-1");
  assert.equal(a.calls.list,0);
  assert.equal(normalizeEmail("  SHADI20242024@gmail.com " ),email);
});
test("owner fallback enumerates staging users and safely tolerates casing",async()=>{
  const a=fakeAuth([user("other","other@example.com"),user("owner-1","Shadi20242024@GMAIL.COM")]);
  const selected=await resolveStagingOwner(a,email);
  assert.equal(selected.uid,"owner-1");
  assert.equal(a.calls.list,1);
});
test("missing email never selects sole remaining staging user",async()=>{
  const a=fakeAuth([user("other","shadi20242024@gmail.co")]);
  await assert.rejects(resolveStagingOwner(a,email),e=>
    e.code==="auth/owner-email-mismatch" && e.message.includes("1 staging account"));
});
test("empty Firebase user listing explains unexpected project/tenant",async()=>{
  const a=fakeAuth([]);
  await assert.rejects(resolveStagingOwner(a,email),{code:"auth/staging-user-inventory-empty"});
});
test("ambiguous matches cannot reset anyone",async()=>{
  const a=fakeAuth([user("one",email),user("two",email.toUpperCase())]);
  await assert.rejects(resolveStagingOwner(a,email),{code:"auth/ambiguous-owner"});
});
test("disabled user, mismatched direct user and backend errors reject before mutation",async()=>{
  await assert.rejects(resolveStagingOwner(fakeAuth([],{...user("one"),disabled:true}),email));
  await assert.rejects(resolveStagingOwner(fakeAuth([],user("wrong","other@example.com")),email));
  const a={getUserByEmail:async()=>{throw Object.assign(new Error("Forbidden"),{code:"auth/insufficient-permission"})},listUsers:async()=>{throw Error("must not run")}};
  await assert.rejects(resolveStagingOwner(a,email),{code:"auth/insufficient-permission"});
});

test("read-only inventory presents a single existing staging user, without changing any account",async()=>{
  let calls=0;
  const auth={async listUsers(limit){
    calls++;assert.equal(limit,2);
    return {users:[user("uniqueUID123","account.typo@gmail.com")]};
  }};
  const result=await inspectSingleStagingAccount(auth);
  assert.deepEqual(result,{user_count:1,account:{email:"account.typo@gmail.com",uid:"uniqueUID123",disabled:false}});
  assert.equal(calls,1);
  const confirmed=await resolveConfirmedSingleStagingAccount(auth,"account.typo@gmail.com","uniqueUID123");
  assert.equal(confirmed.uid,"uniqueUID123");
});
test("single-account confirmation rejects wrong UID, wrong email and disabled user",async()=>{
  const single={listUsers:async()=>({users:[user("uniqueUID123","account.typo@gmail.com")]})};
  await assert.rejects(resolveConfirmedSingleStagingAccount(single,"account.typo@gmail.com","wrongUID99"),{code:"auth/verified-account-changed"});
  await assert.rejects(resolveConfirmedSingleStagingAccount(single,"other@example.com","uniqueUID123"),{code:"auth/verified-account-changed"});
  const disabled={listUsers:async()=>({users:[{...user("uniqueUID123","account.typo@gmail.com"),disabled:true}]})};
  await assert.rejects(resolveConfirmedSingleStagingAccount(disabled,"account.typo@gmail.com","uniqueUID123"));
});
test("confirmation refuses multiple users or pagination after inspection",async()=>{
  const multiple={listUsers:async()=>({users:[user("UIDone123"),user("UIDtwo123")]})};
  await assert.rejects(resolveConfirmedSingleStagingAccount(multiple,email,"UIDone123"),{code:"auth/verified-single-account-required"});
  const paging={listUsers:async()=>({users:[user("UIDone123")],pageToken:"next"})};
  await assert.rejects(resolveConfirmedSingleStagingAccount(paging,email,"UIDone123"),{code:"auth/verified-single-account-required"});
  const inv=await inspectSingleStagingAccount(paging);
  assert.equal(inv.account,null);
  assert.equal(inv.user_count,">=2");
});
