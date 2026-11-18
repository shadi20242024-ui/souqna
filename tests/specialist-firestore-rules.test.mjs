import {test} from "node:test";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {collection,doc,setDoc,updateDoc,deleteDoc,getDoc,getDocs,query,where} from "firebase/firestore";

test("scoped specialist can manage only authorized jobs and directory types",async t=>{
  const env=await initializeTestEnvironment({projectId:"demo-souqna-rules",firestore:{rules:readFileSync("firestore.rules","utf8")}});
  t.after(()=>env.cleanup());
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await Promise.all([
      setDoc(doc(db,"users","scoped-jobs"),{name:"job admin",email:"job@example.test",role:"specialist",specialties:["jobs"],stars:0}),
      setDoc(doc(db,"users","scoped-pharmacy"),{name:"pharmacy admin",email:"pharm@example.test",role:"specialist",specialties:["pharmacy"],stars:0}),
      setDoc(doc(db,"users","scoped-owner"),{name:"owner",email:"owner@example.test",role:"admin",stars:0}),
      setDoc(doc(db,"ads","specialist-job-ad"),{ownerId:"owner",cat:"jobs",status:"pending",title:"وظيفة",createdAt:Date.now()}),
      setDoc(doc(db,"ads","specialist-car-ad"),{ownerId:"owner",cat:"cars",status:"pending",title:"سيارة",createdAt:Date.now()})
    ]);
  });
  const jobs=env.authenticatedContext("scoped-jobs").firestore();
  const pharmacy=env.authenticatedContext("scoped-pharmacy").firestore();
  const owner=env.authenticatedContext("scoped-owner").firestore();
  await t.test("job specialist sees pending job but not pending cars",async()=>{
    await assertSucceeds(getDoc(doc(jobs,"ads","specialist-job-ad")));
    await assertFails(getDoc(doc(jobs,"ads","specialist-car-ad")));
    await assertFails(getDocs(query(collection(jobs,"ads"),where("status","==","pending"))));
    await assertSucceeds(getDocs(query(collection(jobs,"ads"),where("status","==","pending"),where("cat","==","jobs"))));
    await assertFails(updateDoc(doc(jobs,"ads","specialist-job-ad"),{status:"approved"}));
  });
  const makeEntry=(type)=>({type,name:"صيدلية الاختبار",spec:"",area:"السويداء",phone:"",stars:0,onDuty:false,active:true,createdAt:Date.now()});
  await t.test("pharmacy specialist creates and updates pharmacy only",async()=>{
    await assertSucceeds(setDoc(doc(pharmacy,"directory","specialist-pharm-ok"),makeEntry("pharmacy")));
    await assertSucceeds(updateDoc(doc(pharmacy,"directory","specialist-pharm-ok"),{onDuty:true}));
    await assertFails(updateDoc(doc(pharmacy,"directory","specialist-pharm-ok"),{type:"fuel"}));
    await assertFails(setDoc(doc(pharmacy,"directory","specialist-fuel-no"),makeEntry("fuel")));
    await assertFails(deleteDoc(doc(jobs,"directory","specialist-pharm-ok")));
  });
  await t.test("admin controls roles, users cannot grant themselves specialties",async()=>{
    await assertSucceeds(updateDoc(doc(owner,"users","scoped-jobs"),{specialties:["jobs","pharmacy"]}));
    await assertFails(updateDoc(doc(jobs,"users","scoped-jobs"),{specialties:["fuel"]}));
    await assertFails(updateDoc(doc(owner,"users","scoped-jobs"),{specialties:["*"]}));
  });
});
