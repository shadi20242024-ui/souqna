import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GUIDE_VERSION, GUIDE_SUPPORT_EMAIL } from "../assets/souqna-guide.js";

export const STAGING_DOMAINS=Object.freeze([
  "https://souqna-staging.web.app",
  "https://souqna-staging.firebaseapp.com"
]);
export const GUIDE_FILES=Object.freeze([
  {path:"/assets/souqna-guide.js",kind:"js"},
  {path:"/assets/souqna-guide.css",kind:"css"}
]);

export function inspectGuideAsset(body,kind,version=GUIDE_VERSION){
  if(typeof body!=="string" || body.length<50)return "EMPTY_ASSET";
  if(body.slice(0,500).toLowerCase().includes("<!doctype html") ||
     body.slice(0,500).toLowerCase().includes("<html"))return "HTML_FALLBACK_INSTEAD_OF_ASSET";
  if(kind==="js"){
    if(!body.includes('GUIDE_VERSION="'+version+'"') &&
       !body.includes('GUIDE_VERSION = "'+version+'"'))return "GUIDE_VERSION_MISMATCH";
    if(!body.includes("renderGuide") || !body.includes("سياسة الخصوصية"))return "GUIDE_CONTENT_MISSING";
    if(!body.includes('GUIDE_SUPPORT_EMAIL="'+GUIDE_SUPPORT_EMAIL+'"'))return "SUPPORT_CONTACT_MISMATCH";
    return "READY";
  }
  if(kind==="css"){
    if(!body.includes(".guide-shell") || !body.includes(".guide-dialog") ||
       !body.includes(".guide-policy"))return "GUIDE_STYLES_MISSING";
    return "READY";
  }
  return "UNKNOWN_ASSET";
}

export async function checkGuideAssets(fetcher=fetch){
  const results=[];
  for(const domain of STAGING_DOMAINS){
    for(const file of GUIDE_FILES){
      const url=domain+file.path;
      try{
        const response=await fetcher(url,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(15000)});
        if(!response.ok){results.push({url,status:"HTTP_"+response.status});continue;}
        const body=await response.text();
        results.push({url,status:inspectGuideAsset(body,file.kind)});
      }catch{
        results.push({url,status:"UNREACHABLE"});
      }
    }
  }
  return results;
}

async function main(){
  assert.equal(process.argv.length,2,"Guide asset check takes no project arguments.");
  const result=await checkGuideAssets();
  for(const entry of result)console.log(entry.status+" "+entry.url);
  if(result.length===STAGING_DOMAINS.length*GUIDE_FILES.length &&
     result.every(x=>x.status==="READY")){
    console.log("SOUQNA STAGING GUIDE ASSETS VERIFIED: "+GUIDE_VERSION+". Read-only.");
    return;
  }
  throw new Error("Staging guide or privacy assets are not verified on both default domains.");
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error("STAGING GUIDE CHECK FAILED: "+error.message);process.exitCode=2;});
}
