import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {readFileSync} from "node:fs";
import {doc,setDoc,updateDoc,getDoc,serverTimestamp} from "firebase/firestore";

let env;
const projectId="demo-souqna-rules";
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,
    firestore:{
      host:process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0]||"127.0.0.1",
      port:Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1]||8080),
      rules:readFileSync(new URL("../firestore.rules",import.meta.url),"utf8")
    }
  });
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await Promise.all([
      setDoc(doc(db,"users","owner"),{name:"Owner",email:"owner@example.test",role:"admin",stars:0}),
      setDoc(doc(db,"users","jobsMod"),{name:"Jobs Mod",email:"mod@example.test",role:"moderator",stars:0}),
      setDoc(doc(db,"users","ordinary"),{name:"User",email:"user@example.test",role:"user",stars:0}),
      setDoc(doc(db,"staffAssignments","jobsMod"),{active:true,sectionIds:["jobs"],displayName:"Jobs"}),
      setDoc(doc(db,"ads","sample"),{ownerId:"ordinary",status:"pending",category:"jobs",title:"Sample"}),
      setDoc(doc(db,"stores","sample"),{ownerId:"ordinary",status:"pending",name:"Sample"}),
      setDoc(doc(db,"categories","volunteer"),{name_ar:"تطوع",active:true,contentType:"localPosts"}),
      setDoc(doc(db,"categories","closed_service"),{name_ar:"مغلق",active:false,contentType:"localPosts"})
    ]);
  });
});
after(async()=>{if(env)await env.cleanup();});
function userDb(uid){return env.authenticatedContext(uid).firestore();}
function localPost(sectionId,id){
  return doc(userDb("jobsMod"),"localPosts",id);
}
function payload(sectionId,createdBy="jobsMod"){
  return {
    sectionId,title:"وظيفة جديدة",description:"فرصة عمل بالسويداء",
    status:"approved",createdBy,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
    area:"السويداء",contact:""
  };
}

test("jobs moderator can publish in assigned section only",async()=>{
  await assertSucceeds(setDoc(localPost("jobs","jobs-post"),payload("jobs")));
  await assertFails(setDoc(localPost("on_call_clinics","clinic-post"),payload("on_call_clinics")));
  await assertFails(setDoc(localPost("fuel_stations","fuel-post"),payload("fuel_stations")));
});
test("unassigned user cannot publish local service posts",async()=>{
  await assertFails(setDoc(doc(userDb("ordinary"),"localPosts","user-post"),payload("jobs","ordinary")));
});
test("moderator cannot alter original section or author",async()=>{
  await assertFails(updateDoc(doc(userDb("jobsMod"),"localPosts","jobs-post"),{
    sectionId:"on_call_clinics",updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(doc(userDb("jobsMod"),"localPosts","jobs-post"),{
    createdBy:"ordinary",updatedAt:serverTimestamp()
  }));
});
test("moderator cannot change marketplace ad or store statuses",async()=>{
  await assertFails(updateDoc(doc(userDb("jobsMod"),"ads","sample"),{status:"approved"}));
  await assertFails(updateDoc(doc(userDb("jobsMod"),"stores","sample"),{status:"approved"}));
});
test("moderator cannot assign their own permissions",async()=>{
  await assertFails(updateDoc(doc(userDb("jobsMod"),"staffAssignments","jobsMod"),{sectionIds:["jobs","fuel_stations"]}));
  await assertSucceeds(getDoc(doc(userDb("jobsMod"),"staffAssignments","jobsMod")));
});
test("administrator may change section assignment",async()=>{
  await assertSucceeds(updateDoc(doc(userDb("owner"),"staffAssignments","jobsMod"),{sectionIds:["jobs","fuel_stations"]}));
});

test("only active local service categories accept postings",async()=>{
  await assertFails(setDoc(doc(userDb("owner"),"localPosts","closed-post"),payload("closed_service","owner")));
  await assertSucceeds(setDoc(doc(userDb("owner"),"localPosts","volunteer-post"),payload("volunteer","owner")));
});

test("browser clients cannot read or modify server-managed media cleanup jobs",async()=>{
  const uid="owner";
  const job=doc(userDb(uid),"mediaCleanupJobs","sample");
  await assertFails(getDoc(job));
  await assertFails(setDoc(job,{ownerId:uid,status:"pending",objects:[]}));
  await assertFails(updateDoc(job,{status:"done"}));
});
