import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

export const UAT_PROJECT="souqna-staging";
export const UAT_CASES=Object.freeze([
  {id:"public_ads",name:"Public approved ads and searches",steps:"Browse approved listings and search; pending listings are invisible to guests"},
  {id:"consent_registration",name:"Explicit legal consent and signup",steps:"Reject unchecked signup; accept both policy versions and create one user document"},
  {id:"registration_failure",name:"Auth and Firestore partial signup recovery",steps:"Simulate blocked Firestore profile creation; verify UI identifies missing profile and no privileges are granted, document operator recovery"},
  {id:"account_session",name:"Login logout password reset",steps:"Test actual Email/Password login, logout, password reset without exposing credentials"},
  {id:"ad_gallery",name:"Ad images and video links",steps:"Submit multi-photo ad and supported video; reject oversized content and unsafe URL"},
  {id:"ad_moderation",name:"Review reject publish listings",steps:"Moderator approves and rejects test ads; regular users cannot self-approve"},
  {id:"stores",name:"Multiple stores and independent plans",steps:"Create two stores under one test account, test approval and independent plans"},
  {id:"admin_roles",name:"Admin and specialist permissions",steps:"Test authorized staff actions and cross-role denial; verify login role from Firestore"},
  {id:"star_receipts",name:"Manual top-up and unique receipt",steps:"Approve dummy top-up using test ledger; reject duplicate receipt and verify single credit"},
  {id:"featured_ads",name:"Featured listing and balance debit",steps:"Activate a test promoted ad and check charge, duration and audit trail"},
  {id:"banner_requests",name:"Paid sponsor or banner review",steps:"Submit a sample banner request, verify approval controls and no publication before payment review"},
  {id:"directory_jobs",name:"Jobs and local directory",steps:"Verify new-jobs marker, location categories, moderator specialties and local information dates"},
  {id:"market_disclosures",name:"Weather and market source labels",steps:"Check actual timestamps/sources; unimplemented local gold/silver/FX and social auto-posting are clearly marked pending"},
  {id:"support_privacy",name:"Support inbox and privacy",steps:"Send, receive, reply using nominated email from desktop and phone; test a mock privacy request"},
  {id:"pwa",name:"Mobile desktop and offline app shell",steps:"Install PWA, load mobile and desktop, test offline public shell without leaking private content"},
  {id:"abuse_controls",name:"Security and abuse reporting",steps:"Test fraudulent listing report, user role separation and unauthenticated access denial"},
  {id:"backup_restore",name:"Backup and isolated restoration",steps:"Export staging test data and restore into a different isolated test project; validate ledger integrity"},
  {id:"recovery",name:"Release rollback drill",steps:"Practice compatible Hosting rollback with current Firestore rules; verify old client behaviour"},
  {id:"cloud_integrations",name:"Live Cloud Functions and Firestore",steps:"Verify actual staging functions and rules, Auth, categories and administrator checks"}
]);

const dateOnly=()=>new Date().toISOString();
export function makeUatTemplate(){
  return {
    project:UAT_PROJECT,
    schema:1,
    createdAt:dateOnly(),
    instructions:"Use demo data only. Mark each status as pass after manual testing. Store no passwords, tokens, names, numbers or personal customer data.",
    cases:UAT_CASES.map(x=>({id:x.id,status:"not_tested",testedAt:"",note:""}))
  };
}
export function evaluateUat(input,now=new Date()){
  const checks=[];
  if(!input||input.project!==UAT_PROJECT||input.schema!==1||!Array.isArray(input.cases))
    return {project:UAT_PROJECT,ready:false,checks:[],issue:"INVALID_UAT_REPORT"};
  if(input.cases.length!==UAT_CASES.length)
    return {project:UAT_PROJECT,ready:false,checks:[],issue:"UAT_CASE_COUNT_MISMATCH"};
  const ids=new Set();
  for(const entry of input.cases){
    if(!entry||typeof entry.id!=="string"||ids.has(entry.id)||
       !UAT_CASES.some(x=>x.id===entry.id))
      return {project:UAT_PROJECT,ready:false,checks:[],issue:"UNKNOWN_OR_DUPLICATE_CASE"};
    ids.add(entry.id);
    const date=Date.parse(entry.testedAt);
    const recent=Number.isFinite(date)&&date<=now.getTime()&&
      now.getTime()-date<=30*24*60*60*1000;
    const note=typeof entry.note==="string"?entry.note.trim():"";
    const noteOk=note.length>=8&&note.length<=300&&
      !/(?:AIza[\w-]{25,}|-----BEGIN |Bearer\s+[\w.-]+|password\s*[:=])/i.test(note);
    checks.push({id:entry.id,status:entry.status==="pass"&&recent&&noteOk?"PASS":"NOT_VERIFIED"});
  }
  return {project:UAT_PROJECT,ready:checks.length===UAT_CASES.length&&checks.every(x=>x.status==="PASS"),checks,
    issue:checks.every(x=>x.status==="PASS")?"OPERATOR_ATTESTED":"INCOMPLETE_OR_STALE_UAT"};
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const output=join(root,"artifacts","staging-uat.json");
function main(){
  assert.ok(process.argv.length===3 && ["--init","--check"].includes(process.argv[2]),
    "Usage: node scripts/staging-uat.mjs --init OR --check");
  mkdirSync(join(root,"artifacts"),{recursive:true});
  if(process.argv[2]==="--init"){
    if(existsSync(output))throw new Error("UAT checklist already exists; refusing to overwrite recorded operator results.");
    writeFileSync(output,JSON.stringify(makeUatTemplate(),null,2)+"\n",{flag:"wx",mode:0o600});
    console.log("Created local staging acceptance checklist: artifacts/staging-uat.json");
    console.log("No cloud data was read, written, or deployed.");
    return;
  }
  if(!existsSync(output))throw new Error("No operator acceptance report found. Run npm run uat:staging:init first.");
  const input=JSON.parse(readFileSync(output,"utf8"));
  const result=evaluateUat(input);
  for(const check of result.checks)console.log(check.status+" "+check.id);
  console.log("SOUQNA STAGING OPERATOR ACCEPTANCE: "+(result.ready?"RECORDED PASS":"BLOCKED"));
  console.log("Manual evidence is owner-reported, not independent proof of live functionality.");
  if(!result.ready)throw new Error(result.issue);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{main();}catch(error){console.error("STAGING UAT GATE BLOCKED: "+error.message);process.exitCode=2;}
}
