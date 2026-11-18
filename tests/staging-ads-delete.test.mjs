import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {readFileSync} from "node:fs";
import {doc,setDoc,getDoc,deleteDoc} from "firebase/firestore";

const projectId="demo-souqna-staging-rules";
let env;
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,
    firestore:{
      host:process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0]||"127.0.0.1",
      port:Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1]||8080),
      rules:readFileSync(new URL("../firestore.staging.rules",import.meta.url),"utf8")
    }
  });
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await Promise.all([
      setDoc(doc(db,"users","owner"),{name:"Owner",email:"owner@example.test",role:"user",stars:0}),
      setDoc(doc(db,"users","admin"),{name:"Admin",email:"admin@example.test",role:"admin",stars:0}),
      setDoc(doc(db,"users","visitor"),{name:"Visitor",email:"visitor@example.test",role:"user",stars:0}),
      setDoc(doc(db,"ads","ad_staging_1"),{title:"Staging listing",status:"pending",ownerId:"owner",images:[]})
    ]);
  });
});
after(async()=>{if(env)await env.cleanup();});

test("listing owner can read but cannot bypass server cleanup via direct delete",async()=>{
  const ad=doc(env.authenticatedContext("owner").firestore(),"ads","ad_staging_1");
  const snapshot=await assertSucceeds(getDoc(ad));
  assert.equal(snapshot.exists(),true);
  await assertFails(deleteDoc(ad));
});

test("admin can read pending listings but must use the trusted delete callable",async()=>{
  const ad=doc(env.authenticatedContext("admin").firestore(),"ads","ad_staging_1");
  await assertSucceeds(getDoc(ad));
  await assertFails(deleteDoc(ad));
});

test("other users cannot read or delete unapproved listings",async()=>{
  const ad=doc(env.authenticatedContext("visitor").firestore(),"ads","ad_staging_1");
  await assertFails(getDoc(ad));
  await assertFails(deleteDoc(ad));
});

test("staging storage cleanup job records remain private to the server",async()=>{
  const job=doc(env.authenticatedContext("admin").firestore(),"mediaCleanupJobs","ad_staging_1");
  await assertFails(getDoc(job));
  await assertFails(setDoc(job,{ownerId:"owner",objects:[]}));
});

test("production rules are kept separate from staging-only delete restriction",()=>{
  const regular=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
  const staging=readFileSync(new URL("../firestore.staging.rules",import.meta.url),"utf8");
  assert.match(regular,/allow delete: if isMarketplaceEditor\(\)/);
  assert.match(staging,/match \/ads\/\{id\} \{[\s\S]*?allow delete: if false;/);
  assert.notEqual(regular,staging);
});
