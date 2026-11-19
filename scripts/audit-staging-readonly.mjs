import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath,pathToFileURL} from "node:url";
import {
  STAGING_PROJECT,STAGING_WEB_CONFIG_FILE,FIREBASE_FIELDS,
  fetchStagingWebConfig
} from "./auto-staging-setup.mjs";

const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));
const REQUIRED_FUNCTIONS=Object.freeze([
  "souqnaMarketplace","souqnaDeleteAd","souqnaRetryAdCleanup","souqnaListAdCleanup"
]);
const ALLOWED_ORIGINS=new Set([
  "https://firebase.googleapis.com",
  "https://identitytoolkit.googleapis.com",
  "https://firestore.googleapis.com",
  "https://storage.googleapis.com",
  "https://cloudfunctions.googleapis.com"
]);

export function stagingEndpoints(web){
  assert.equal(web.projectId,STAGING_PROJECT,"Wrong staging project");
  assert.ok([STAGING_PROJECT+".firebasestorage.app",STAGING_PROJECT+".appspot.com"].includes(web.storageBucket),
    "Wrong staging Storage bucket");
  return {
    authentication:"https://identitytoolkit.googleapis.com/admin/v2/projects/"+STAGING_PROJECT+"/config",
    firestore:"https://firestore.googleapis.com/v1/projects/"+STAGING_PROJECT+"/databases/(default)",
    storage:"https://storage.googleapis.com/storage/v1/b/"+encodeURIComponent(web.storageBucket),
    functions:"https://cloudfunctions.googleapis.com/v2/projects/"+STAGING_PROJECT+"/locations/us-central1/functions?pageSize=100"
  };
}

export function classifyStagingService(service,body,web){
  if(!body||typeof body!=="object"||Array.isArray(body))
    return {status:"unverified",reason:"Invalid API response"};
  if(service==="authentication"){
    return body.signIn?.email?.enabled===true
      ?{status:"ready",emailPassword:true}
      :{status:"not-ready",emailPassword:false};
  }
  if(service==="firestore"){
    const correct=body.name==="projects/"+STAGING_PROJECT+"/databases/(default)";
    return correct&&body.state==="READY"
      ?{status:"ready"}
      :{status:"not-ready",reason:"Default Firestore database is not READY"};
  }
  if(service==="storage"){
    return body.name===web.storageBucket
      ?{status:"ready"}
      :{status:"not-ready",reason:"Storage bucket name mismatch"};
  }
  if(service==="functions"){
    const functions=Array.isArray(body.functions)?body.functions:[];
    const available=new Set(functions.filter(entry=>
      entry?.state==="ACTIVE"&&typeof entry.name==="string"
    ).map(entry=>entry.name.split("/").pop()));
    const missing=REQUIRED_FUNCTIONS.filter(name=>!available.has(name));
    return missing.length
      ?{status:"not-ready",deployed:REQUIRED_FUNCTIONS.length-missing.length,missing}
      :{status:"ready",deployed:REQUIRED_FUNCTIONS.length,missing:[]};
  }
  throw new Error("Unknown service: "+service);
}

export async function inspectStagingLive(request){
  const web=await fetchStagingWebConfig(request);
  const endpoints=stagingEndpoints(web);
  const services={};
  for(const [name,url] of Object.entries(endpoints)){
    try{
      const data=await request(url);
      services[name]=classifyStagingService(name,data,web);
    }catch(error){
      const reason=typeof error?.message==="string"?error.message.slice(0,140):"Request failed";
      services[name]={status:"unverified",reason};
    }
  }
  return {projectId:STAGING_PROJECT,webApp:"verified",services,
    infrastructureReady:["authentication","firestore","storage"].every(name=>services[name].status==="ready"),
    callableFunctionsDeployed:services.functions.status==="ready"};
}

export function inspectStagingLocal(remote){
  const cli=JSON.parse(readFileSync(join(ROOT,"firebase.staging.json"),"utf8"));
  assert.equal(cli.firestore.rules,"firestore.staging.rules");
  assert.equal(cli.storage.rules,"storage.rules");
  assert.equal(cli.hosting.public,"dist");
  const rules=readFileSync(join(ROOT,"firestore.staging.rules"),"utf8");
  assert.match(rules,/match \/ads\/\{id\} \{[\s\S]*?allow delete: if false;/);
  const file=join(ROOT,STAGING_WEB_CONFIG_FILE);
  if(!existsSync(file))return {status:"not-ready",reason:"Registered local staging Web SDK config has not been saved"};
  const local=JSON.parse(readFileSync(file,"utf8"));
  const matches=FIREBASE_FIELDS.every(key=>local[key]===remote[key]);
  return matches
    ?{status:"ready"}
    :{status:"not-ready",reason:"Local staging Web config does not match registered Firebase Web App"};
}

function requireReadOnlyEnvironment(){
  assert.equal(process.argv.length,2,"This audit accepts no arguments.");
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST&&!process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    "Unset emulator variables to audit real souqna-staging.");
  const adcFile=process.env.APPDATA
    ?join(process.env.APPDATA,"gcloud","application_default_credentials.json"):"";
  if(!process.env.GOOGLE_APPLICATION_CREDENTIALS&&adcFile&&existsSync(adcFile))
    process.env.GOOGLE_APPLICATION_CREDENTIALS=adcFile;
}

export function validateReadOnlyRequestUrl(raw){
  const url=new URL(raw);
  assert.ok(ALLOWED_ORIGINS.has(url.origin),"Unknown API origin");
  assert.ok(!raw.includes("souqna-sweida"),"Production project access forbidden");
  if(url.hostname==="firebase.googleapis.com")
    assert.match(url.pathname,/^\/v1beta1\/projects\/souqna-staging\/webApps(?:\/[^/]+\/config)?$/);
  if(url.hostname==="identitytoolkit.googleapis.com")
    assert.equal(url.pathname,"/admin/v2/projects/souqna-staging/config");
  if(url.hostname==="firestore.googleapis.com")
    assert.equal(url.pathname,"/v1/projects/souqna-staging/databases/(default)");
  if(url.hostname==="storage.googleapis.com")
    assert.ok([
      "/storage/v1/b/souqna-staging.firebasestorage.app",
      "/storage/v1/b/souqna-staging.appspot.com"
    ].includes(url.pathname));
  if(url.hostname==="cloudfunctions.googleapis.com")
    assert.equal(url.pathname,"/v2/projects/souqna-staging/locations/us-central1/functions");
  return url.href;
}

async function main(){
  requireReadOnlyEnvironment();
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const {applicationDefault}=require("firebase-admin/app");
  let token;
  try{
    token=(await applicationDefault().getAccessToken()).access_token;
    assert.ok(token,"No Google Cloud credentials available.");
  }catch{
    throw new Error("Read-only audit needs a locally authenticated Google Cloud account. No credentials should be shared.");
  }
  const request=async raw=>{
    const url=validateReadOnlyRequestUrl(raw);
    const response=await fetch(url,{
      method:"GET",
      redirect:"error",
      headers:{Authorization:"Bearer "+token,"x-goog-user-project":STAGING_PROJECT,Accept:"application/json"},
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw new Error("Read-only Google API returned HTTP "+response.status);
    return response.json();
  };
  let audit;
  try{
    audit=await inspectStagingLive(request);
    audit.localConfig=inspectStagingLocal(await fetchStagingWebConfig(request));
  }finally{
    token=undefined;
  }
  console.log("SOUQNA STAGING READ-ONLY AUDIT");
  console.log(JSON.stringify(audit,null,2));
  console.log("No Firebase data or configuration was changed. No deployment was attempted.");
  if(!audit.infrastructureReady||!audit.callableFunctionsDeployed||audit.localConfig.status!=="ready")
    process.exitCode=2;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{
    console.error("SOUQNA STAGING AUDIT INCOMPLETE:",error.message);
    process.exitCode=1;
  });
}
