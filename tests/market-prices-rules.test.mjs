import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {doc,setDoc,getDoc,deleteDoc,updateDoc,serverTimestamp,Timestamp} from "firebase/firestore";

let env;
const projectId="demo-souqna-market-prices";
const now=()=>Timestamp.fromMillis(Date.now()-2*3600000);
function db(uid){
  return uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
}
function price(id,who){
  return doc(db(who),"localMarketRates",id);
}
function quote(uid,changes={}){
  return {
    buy:120,sell:125,sourceName:"تقرير سوق ميداني موثق",
    sourceUrl:"https://example.org/source",
    observedAt:now(),updatedAt:serverTimestamp(),updatedBy:uid,
    method:"manual",currencyEra:"SYP_NEW",...changes
  };
}
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,
    firestore:{
      host:process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0]||"127.0.0.1",
      port:Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1]||8080),
      rules:readFileSync(new URL("../firestore.staging.rules",import.meta.url),"utf8")
    }
  });
  await env.withSecurityRulesDisabled(async ctx=>{
    const firestore=ctx.firestore();
    for(const [id,role] of [
      ["market_admin","admin"],["market_editor","moderator"],
      ["market_other","moderator"],["market_customer","user"]
    ])await setDoc(doc(firestore,"users",id),{name:id,role,stars:0});
    await setDoc(doc(firestore,"staffAssignments","market_editor"),{
      active:true,sectionIds:["market_prices"],displayName:"سعر السوق"
    });
    await setDoc(doc(firestore,"staffAssignments","market_other"),{
      active:true,sectionIds:["jobs"],displayName:"الوظائف"
    });
  });
});
after(async()=>{if(env)await env.cleanup();});

test("administrator and delegated active price moderator may post six validated market types",async()=>{
  await assertSucceeds(setDoc(price("usd_official","market_admin"),quote("market_admin",{
    sourceName:"النشرة الرسمية للمصرف المركزي"
  })));
  await assertSucceeds(setDoc(price("usd_parallel","market_editor"),quote("market_editor")));
  await assertSucceeds(setDoc(price("gold_21","market_editor"),quote("market_editor")));
  await assertSucceeds(setDoc(price("silver_999","market_admin"),quote("market_admin")));
  await assertSucceeds(updateDoc(price("usd_parallel","market_editor"),quote("market_editor",{
    buy:121,sell:127
  })));
});
test("all visitors can view published local quotes without login",async()=>{
  const snapshot=await assertSucceeds(getDoc(price("usd_parallel",null)));
  assert.equal(snapshot.exists(),true);
  assert.equal(snapshot.data().buy,121);
  assert.equal(snapshot.data().currencyEra,"SYP_NEW");
});
test("ordinary users and moderators for unrelated sections cannot publish prices",async()=>{
  await assertFails(setDoc(price("gold_18","market_customer"),quote("market_customer")));
  await assertFails(setDoc(price("gold_18","market_other"),quote("market_other")));
  await assertFails(setDoc(price("gold_18",null),quote("market_editor")));
});
test("price moderator cannot impersonate administrator or change unrelated documents",async()=>{
  await assertFails(setDoc(price("gold_24","market_editor"),quote("market_admin")));
  await assertFails(setDoc(doc(db("market_editor"),"categories","fake"),{name_ar:"سعر الذهب"}));
  await assertFails(deleteDoc(price("usd_parallel","market_editor")));
});
test("malformed values, old currency, absent sources and fake API status are refused",async()=>{
  const uid="market_admin";
  for(const [id,delta] of [
    ["usd_official",{sourceUrl:""}],
    ["gold_24",{buy:140,sell:130}],
    ["gold_18",{buy:-5}],
    ["gold_24",{currencyEra:"SYP_OLD"}],
    ["gold_18",{method:"api"}],
    ["gold_24",{updatedAt:Timestamp.fromMillis(Date.now()-3600000)}],
    ["gold_18",{sourceUrl:"http://unsafe.example"}],
    ["gold_24",{observedAt:Timestamp.fromMillis(Date.now()-9*86400000)}],
    ["unknown",{ }]
  ])await assertFails(setDoc(price(id,uid),quote(uid,delta)));
});
test("deactivated market moderator immediately loses write permission",async()=>{
  await env.withSecurityRulesDisabled(async ctx=>{
    await updateDoc(doc(ctx.firestore(),"staffAssignments","market_editor"),{active:false});
  });
  await assertFails(updateDoc(price("usd_parallel","market_editor"),quote("market_editor",{
    buy:122,sell:130
  })));
  const saved=await assertSucceeds(getDoc(price("usd_parallel",null)));
  assert.equal(saved.data().buy,121);
});
