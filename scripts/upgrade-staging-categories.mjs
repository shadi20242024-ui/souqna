import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const STAGING = "souqna-staging";
export const REQUIRED_CATEGORIES = Object.freeze([
  ["cars","السيارات",1],["real_estate","العقارات",2],
  ["electronics","الإلكترونيات",3],["furniture","الأثاث",4],
  ["jobs","الوظائف",5],["services","الخدمات",6],
  ["misc","متنوعة",7],["community","المجتمع",8],
  ["fashion","أزياء",9],["lost_found","مفقودات",10]
]);

export function categoryDecisions(documents) {
  assert.ok(Array.isArray(documents)&&documents.length===REQUIRED_CATEGORIES.length);
  return REQUIRED_CATEGORIES.map(([id,name_ar,order],i)=>{
    const doc=documents[i];
    if(!doc.exists)return {id,action:"create",data:{name_ar,order,active:true}};
    const data=doc.data();
    return data.active===true
      ?{id,action:"keep"}
      :{id,action:"activate",currentActive:data.active??null};
  });
}

export function parseOptions(argv) {
  const args=argv.slice();
  const pos=args.indexOf("--project");
  assert.ok(pos>=0&&args[pos+1]===STAGING,"Only --project souqna-staging is accepted.");
  assert.equal(args.filter(a=>a==="--project").length,1,"Project must be specified exactly once.");
  assert.ok(!args.includes("--production")&&!args.includes("--force"),"Unsafe flag.");
  const execute=args.includes("--execute");
  const inspect=args.includes("--inspect");
  assert.ok(!(execute&&inspect),"Use either --inspect or --execute.");
  assert.ok(args.every(a=>a==="--project"||a===STAGING||a==="--inspect"||a==="--execute"||a==="--confirm"||a==="ACTIVATE-CATEGORIES:"+STAGING),"Unknown argument.");
  if(execute) {
    const at=args.indexOf("--confirm");
    assert.ok(at>=0&&args[at+1]==="ACTIVATE-CATEGORIES:"+STAGING,
      "Execution requires --confirm ACTIVATE-CATEGORIES:souqna-staging.");
  } else assert.ok(!args.includes("--confirm"),"Confirmation is only valid in execution mode.");
  return {execute,inspect,project:STAGING};
}

async function main(){
  const {execute,inspect,project}=parseOptions(process.argv.slice(2));
  console.log("SOUQNA category upgrade | project:",project,"| categories:",REQUIRED_CATEGORIES.length);
  if(!execute&&!inspect){
    console.log("DRY RUN: 8 legacy categories remain unchanged; fashion and lost_found are additional entries.");
    console.log("No database contacted, no existing documents overwritten, no paid services enabled.");
    return;
  }
  assert.ok(!process.env.GCLOUD_PROJECT||process.env.GCLOUD_PROJECT===STAGING,
    "GCLOUD_PROJECT does not match staging.");
  assert.ok(!process.env.GOOGLE_CLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT===STAGING,
    "GOOGLE_CLOUD_PROJECT does not match staging.");
  const emulator=process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(!emulator||/^(?:127\.0\.0\.1|localhost):\d+$/.test(emulator),"Only local Firestore emulator is allowed.");
  assert.ok(Boolean(emulator)||Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    "Explicit staging credentials are required. No private service account keys will be created.");
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const {initializeApp,applicationDefault,getApps}=require("firebase-admin/app");
  const {getFirestore}=require("firebase-admin/firestore");
  if(!getApps().length)initializeApp({
    ...(emulator?{}:{credential:applicationDefault()}),projectId:STAGING
  });
  const db=getFirestore();
  const refs=REQUIRED_CATEGORIES.map(([id])=>db.collection("categories").doc(id));
  const docs=await db.getAll(...refs);
  const decisions=categoryDecisions(docs);
  for(const d of decisions)console.log(d.id+": "+d.action);
  if(!execute){
    console.log("INSPECT COMPLETE. No Firestore writes were performed.");
    return;
  }
  const batch=db.batch();
  let changed=0;
  for(let i=0;i<decisions.length;i++){
    const d=decisions[i];
    if(d.action==="create"){batch.create(refs[i],d.data);changed++;}
    if(d.action==="activate"){batch.update(refs[i],{active:true});changed++;}
  }
  if(changed)await batch.commit();
  console.log("STAGING CATEGORY UPDATE COMPLETE: "+changed+" newly created/activated, "+
    (decisions.length-changed)+" already active. Production was never targeted.");
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error("CATEGORY UPGRADE BLOCKED:",e.message);process.exitCode=1;});
}
