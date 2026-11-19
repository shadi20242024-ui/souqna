import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {resolveStagingOwner,normalizeEmail}=require("../functions/owner-auth-lookup.cjs");
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
