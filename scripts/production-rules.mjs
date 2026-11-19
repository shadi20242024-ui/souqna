import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyLegalRules } from "./check-staging-legal.mjs";
import { GUIDE_VERSION } from "../assets/souqna-guide.js";

export const PROJECT="souqna-sweida";
export const RELEASE="projects/souqna-sweida/releases/cloud.firestore";
const API="https://firebaserules.googleapis.com/v1/";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");

export async function readProductionRules(request,token){
  assert.ok(typeof token==="string" && token.length>0,"OAuth access token is required.");
  const get=async path=>{
    const response=await request(API+path,{
      method:"GET",
      headers:{Authorization:"Bearer "+token,Accept:"application/json","x-goog-user-project":PROJECT},
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw new Error("PRODUCTION_RULES_HTTP_"+response.status);
    return response.json();
  };
  const release=await get(RELEASE);
  const name=release.rulesetName;
  if(typeof name!=="string" ||
      !new RegExp("^projects/"+PROJECT+"/rulesets/[A-Za-z0-9_-]+$").test(name))
    throw new Error("PRODUCTION_RULESET_NOT_VERIFIED");
  const ruleset=await get(name);
  if(ruleset.name!==name || !Array.isArray(ruleset.source?.files))
    throw new Error("PRODUCTION_RULESET_SOURCE_INVALID");
  const source=ruleset.source.files.map(f=>String(f.content||"")).join("\n");
  if(!source.includes("rules_version")||!source.includes("service cloud.firestore"))
    throw new Error("INCOMPLETE_PRODUCTION_FIRESTORE_SOURCE");
  return source;
}

export function saveRulesBackup(source,now=new Date(),directory=join(root,"artifacts","production-rules-backups")){
  assert.ok(typeof source==="string" && source.includes("rules_version") &&
    source.includes("service cloud.firestore"),"Not a complete Firestore rules source.");
  assert.ok(now instanceof Date&&!Number.isNaN(now.getTime()),"Invalid backup date.");
  mkdirSync(directory,{recursive:true});
  const stamp=now.toISOString().replace(/[:.]/g,"-");
  const file=join(directory,PROJECT+"-"+stamp+".rules");
  writeFileSync(file,source,{encoding:"utf8",flag:"wx",mode:0o600});
  return file;
}

async function main(){
  assert.ok(process.argv.length===3&&["--backup","--verify"].includes(process.argv[2]),
    "Usage: production-rules.mjs --backup OR --verify. No project arguments accepted.");
  if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST||
      process.env.FIREBASE_EMULATOR_HUB)throw new Error("Cannot inspect deployed production while emulator variables are present.");
  if((process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==PROJECT)||
     (process.env.GOOGLE_CLOUD_PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==PROJECT))
     throw new Error("Environment points to a different cloud project.");
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const { applicationDefault }=require("firebase-admin/app");
  let token;
  try{token=(await applicationDefault().getAccessToken()).access_token;}
  catch{throw new Error("Production read permissions not available. No cloud change performed.");}
  const live=await readProductionRules(fetch,token);
  token=undefined;
  if(process.argv[2]==="--backup"){
    const file=saveRulesBackup(live);
    console.log("Read-only production rules backup: "+file);
    console.log("No Firebase resource or billing changed.");
    return;
  }
  const local=readFileSync(join(root,"firestore.rules"),"utf8");
  assert.equal(verifyLegalRules(local),"READY","Local rules must match "+GUIDE_VERSION);
  const result=verifyLegalRules(live);
  if(result!=="READY")throw new Error("PRODUCTION_LEGAL_RULES_NOT_READY: "+result);
  console.log("PRODUCTION FIRESTORE LEGAL RULES VERIFIED: "+GUIDE_VERSION+" (read-only).");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error("PRODUCTION RULES CHECK BLOCKED: "+error.message);process.exitCode=2;});
}
