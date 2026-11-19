import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchStagingRules, STAGING_PROJECT } from "./check-staging-legal.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));

export function backupStagingRules(content, now=new Date()){
  assert.ok(typeof content==="string" && content.startsWith("rules_version"),
    "Remote Firestore rules must start with rules_version; refusing incomplete backup.");
  assert.ok(content.includes("service cloud.firestore"),"Remote file is not Firestore rules.");
  assert.ok(now instanceof Date && !Number.isNaN(now.getTime()),"Invalid backup date.");
  const stamp=now.toISOString().replace(/[:.]/g,"-");
  const directory=join(root,"artifacts","staging-rules-backups");
  mkdirSync(directory,{recursive:true});
  const path=join(directory,STAGING_PROJECT+"-"+stamp+".rules");
  writeFileSync(path,content,{encoding:"utf8",flag:"wx",mode:0o600});
  return path;
}

async function main(){
  assert.equal(process.argv.length,2,"Staging rules backup takes no arguments.");
  if(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error("Cannot back up live rules while emulator variables are present.");
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const {applicationDefault}=require("firebase-admin/app");
  let token;
  try{token=(await applicationDefault().getAccessToken()).access_token;}
  catch{throw new Error("Google Application Default Credentials unavailable. No changes were made.");}
  const remote=await fetchStagingRules(fetch,token);
  token=undefined;
  const path=backupStagingRules(remote);
  console.log("Read-only Firestore rules backup saved locally: "+path);
  console.log("Protected project: "+STAGING_PROJECT+". No deployment was performed.");
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error("STAGING RULES BACKUP FAILED: "+error.message);process.exitCode=2;});
}
