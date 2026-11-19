import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROJECT="souqna-sweida";
export const REGION="us-central1";
export const FUNCTIONS=Object.freeze(["souqnaFinance","souqnaMarketplace","souqnaModeration"]);

export async function inspectProductionFunctions(request,token){
  assert.ok(typeof token==="string"&&token.length>0,"Authenticated read token required.");
  const result=[];
  for(const functionName of FUNCTIONS){
    const resource="projects/"+PROJECT+"/locations/"+REGION+"/functions/"+functionName;
    try{
      const response=await request("https://cloudfunctions.googleapis.com/v2/"+resource,{
        method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json","x-goog-user-project":PROJECT},
        signal:AbortSignal.timeout(20000)
      });
      if(!response.ok){result.push({name:functionName,status:"HTTP_"+response.status});continue;}
      const item=await response.json();
      result.push({name:functionName,status:item.name===resource&&item.state==="ACTIVE"?"ACTIVE":"NOT_ACTIVE"});
    }catch{result.push({name:functionName,status:"UNREACHABLE"});}
  }
  return result;
}

async function main(){
  assert.equal(process.argv.length,2,"Production function check has no project arguments.");
  if(process.env.FIREBASE_EMULATOR_HUB||process.env.FIRESTORE_EMULATOR_HOST ||
     process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error("Disable emulators before checking production.");
  if((process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==PROJECT)||
     (process.env.GOOGLE_CLOUD_PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==PROJECT))
     throw new Error("Wrong cloud project context.");
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const { applicationDefault }=require("firebase-admin/app");
  let token;
  try{token=(await applicationDefault().getAccessToken()).access_token;}
  catch{throw new Error("Production Cloud Functions read permission unavailable.");}
  const results=await inspectProductionFunctions(fetch,token);
  token=undefined;
  for(const x of results)console.log(x.status+" "+x.name);
  if(!results.every(x=>x.status==="ACTIVE"))throw new Error("PRODUCTION_FUNCTIONS_NOT_VERIFIED");
  console.log("PRODUCTION FUNCTIONS: 3/3 ACTIVE. Read-only; not an end-to-end functional test.");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error("PRODUCTION SERVICES CHECK BLOCKED: "+error.message);process.exitCode=2;});
}
