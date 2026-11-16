import assert from "node:assert/strict";
import { createRequire } from "node:module";

const args=process.argv.slice(2);
function arg(name){
  const i=args.indexOf(name);
  return i<0?null:args[i+1]||null;
}
const project=arg("--project");
const execute=args.includes("--execute");
const confirmation=arg("--confirm");
assert.ok(typeof project==="string"&&/^[a-z][a-z0-9-]{4,40}$/.test(project),
  "Provide an explicit --project STAGING_PROJECT_ID.");
assert.notEqual(project,"souqna-sweida","Production Firebase project is permanently blocked.");
assert.notEqual(project,"souqna-preview-disabled","Disconnected preview is not a staging project.");
assert.ok(!args.includes("--production"),"Production bootstrap is disabled.");

const now=Date.now();
const docs=[
  ...[
    ["cars","السيارات",1],["real_estate","العقارات",2],["electronics","الإلكترونيات",3],
    ["furniture","الأثاث",4],["jobs","الوظائف",5],["services","الخدمات",6],
    ["misc","منوعات",7],["community","المجتمع",8]
  ].map(([id,name_ar,order])=>["categories",id,{name_ar,active:true,order}]),
  ["plans","free",{name:"مجانية",stars:0,days:0,maxAds:5,badge:"",order:0,active:true}],
  ["plans","silver",{name:"فضية",stars:10,days:30,maxAds:30,badge:"فضي",order:1,active:true}],
  ["plans","gold",{name:"ذهبية",stars:25,days:30,maxAds:100,badge:"ذهبي",order:2,active:true}],
  ["plans","vip",{name:"VIP",stars:50,days:30,maxAds:0,badge:"VIP",order:3,active:true}],
  ...[[5,15],[10,30],[15,30],[20,30],[25,30]]
    .map(([stars,days])=>["packages","promo_"+stars+"_"+days,{stars,days,active:true}]),
  ["settings","site",{
    ticker:"مرحباً بكم في سوقنا — سوق السويداء",
    tickerOn:true,tickerSecondary:"",tickerSecondaryOn:false,
    weatherOn:true,maxStores:3,adClient:"",adSlot:""
  }],
  ["settings","contact",{whatsapp:""}],
  ...[
    ["logo","تصميم شعار وهوية"],["poster","تصميم إعلان"],["video","مونتاج فيديو"],
    ["campaign","حملة تسويقية"],["production","إنتاج فيديو إعلاني"]
  ].map(([id,name])=>["services",id,{name,desc:"",price:0,active:true}])
];
assert.equal(docs.length,24,"Starter manifest changed; review initial data.");
for(const [collection,id,data] of docs){
  assert.match(collection,/^[a-zA-Z]+$/);
  assert.match(id,/^[a-zA-Z0-9_-]+$/);
  assert.ok(data && typeof data==="object");
}
console.log("SOUQNA STAGING INITIAL DATA — project:",project);
console.log("Items by collection:",Object.entries(docs.reduce((o,[c])=>(o[c]=(o[c]||0)+1,o),{})));
console.log("No users, admins, passwords, credit balances, receipts or real contact numbers will be seeded.");
if(!execute){
  console.log("DRY RUN ONLY. No Firebase connection and no writes.");
  process.exit(0);
}
assert.equal(confirmation,"SEED:"+project,"To write, use --execute --confirm SEED:"+project);
assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST || process.env.GOOGLE_APPLICATION_CREDENTIALS,
  "An emulator or explicit Google Application Credentials are required for execution."
);
const require=createRequire(new URL("../functions/index.js",import.meta.url));
const {initializeApp,applicationDefault,getApps}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
if(!getApps().length)initializeApp({
  ...(process.env.FIRESTORE_EMULATOR_HOST?{}:{credential:applicationDefault()}),
  projectId:project
});
const db=getFirestore();
const refs=docs.map(([c,id])=>db.collection(c).doc(id));
const snapshots=await db.getAll(...refs);
const batch=db.batch();
let created=0,existing=0;
for(let i=0;i<docs.length;i++){
  if(snapshots[i].exists){existing++;continue}
  batch.create(refs[i],docs[i][2]);created++;
}
if(created)await batch.commit();
console.log("STAGING SEED COMPLETED",JSON.stringify({project,created,existing,total:docs.length}));
console.log("Existing documents were NOT overwritten. No remote deployment performed.");
