import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { GUIDE_VERSION } from "../assets/souqna-guide.js";

export const STAGING_PROJECT = "souqna-staging";
export const FIRESTORE_RELEASE = "projects/souqna-staging/releases/cloud.firestore";
const API = "https://firebaserules.googleapis.com/v1/";

export function verifyLegalRules(source, version=GUIDE_VERSION) {
  if (typeof source !== "string" || !source.includes("match /users/{uid}")) return "USER_RULES_MISSING";
  if (typeof version !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(version)) return "LEGAL_VERSION_INVALID";
  const start=source.indexOf("match /users/{uid}");
  const end=source.indexOf("allow update:",start);
  if (end<start) return "USER_CREATE_RULES_MISSING";
  const create=source.slice(start,end);
  if (!create.includes('request.resource.data.role == "user"') ||
      !create.includes("request.resource.data.stars == 0")) return "ACCOUNT_GUARD_MISSING";
  const versionMatch=key=>new RegExp("request\\.resource\\.data\\."+key+"\\s*==\\s*[\"']"+version+"[\"']").test(create);
  if (!versionMatch("acceptedTermsVersion") || !versionMatch("acceptedPrivacyVersion"))
    return "CONSENT_VERSION_MISMATCH";
  if (!/acceptedAt\s*==\s*request\.time/.test(create)) return "CONSENT_TIMESTAMP_GUARD_MISSING";
  for (const field of ["acceptedTermsVersion","acceptedPrivacyVersion","acceptedAt"]) {
    if (!create.includes('"'+field+'"')) return "CONSENT_REQUIRED_FIELDS_MISSING";
  }
  return "READY";
}

export async function fetchStagingRules(get, accessToken) {
  assert.equal(typeof accessToken,"string");
  assert.ok(accessToken.length>0);
  async function json(url){
    const res=await get(url,{method:"GET",headers:{
      Authorization:"Bearer "+accessToken,
      Accept:"application/json",
      "x-goog-user-project":STAGING_PROJECT
    },signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw new Error("FIREBASE_RULES_READ_HTTP_"+res.status);
    return res.json();
  }
  const release=await json(API+FIRESTORE_RELEASE);
  const name=release.rulesetName;
  if(typeof name!=="string" || !new RegExp("^projects/"+STAGING_PROJECT+"/rulesets/[A-Za-z0-9_-]+$").test(name))
    throw new Error("FIRESTORE_RULESET_NOT_VERIFIED");
  const ruleset=await json(API+name);
  if(ruleset.name!==name || !Array.isArray(ruleset.source?.files))
    throw new Error("FIRESTORE_RULESET_SOURCE_NOT_VERIFIED");
  return ruleset.source.files.map(x=>String(x.content||"")).join("\n");
}

async function main(){
  assert.equal(process.argv.length,2,"Read-only legal rules check accepts no arguments.");
  if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error("Disable emulator variables before inspecting deployed rules.");
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const {applicationDefault}=require("firebase-admin/app");
  let token;
  try{token=(await applicationDefault().getAccessToken()).access_token;}
  catch{throw new Error("Google Cloud Application Default Credentials unavailable. No rules were changed.");}
  const live=await fetchStagingRules(fetch,token);
  token=undefined;
  const local=readFileSync(fileURLToPath(new URL("../firestore.rules",import.meta.url)),"utf8");
  assert.equal(verifyLegalRules(local),"READY","Local rules and client version do not match.");
  const status=verifyLegalRules(live);
  if(status!=="READY")throw new Error("STAGING_LEGAL_RULES_NOT_READY: "+status);
  console.log("SOUQNA STAGING LEGAL RULES VERIFIED: "+GUIDE_VERSION);
  console.log("Read-only check; no rules were created, changed or deployed.");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error("STAGING LEGAL VERIFICATION FAILED: "+error.message);process.exitCode=2;});
}
