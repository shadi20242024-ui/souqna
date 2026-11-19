import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GUIDE_VERSION } from "../assets/souqna-guide.js";
import { inspectGuideAsset } from "./check-staging-guide-assets.mjs";

export const PRODUCTION_DOMAINS=Object.freeze([
  "https://souqna-sweida.web.app",
  "https://souqna-sweida.firebaseapp.com"
]);

export function inspectProductionHtml(html){
  if(typeof html!=="string" || html.length<100)return "NO_APPLICATION_HTML";
  if(html.includes('id="souqna-environment-banner"') ||
     html.includes('name="robots" content="noindex,nofollow,noarchive"') ||
     html.includes("souqna-preview-disabled"))return "TEST_BUILD_ON_PRODUCTION";
  const match=html.match(/const app=initializeApp\((\{[^\n;]*\})\);/);
  if(!match)return "FIREBASE_CONFIG_MISSING";
  // Production index.html deliberately uses a static JavaScript object literal
  // with unquoted property names; staging bundles use JSON.stringify instead.
  // Parse only the six expected string fields without executing page code.
  const pairs=[...match[1].matchAll(/(?:"([a-zA-Z]\w*)"|([a-zA-Z]\w*))\s*:\s*"([^"\\]*)"/g)]
    .map(m=>[m[1]||m[2],m[3]]);
  const config=Object.fromEntries(pairs);
  if(pairs.length!==6 || Object.keys(config).length!==6 ||
      !["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"].every(key=>typeof config[key]==="string"))
    return "FIREBASE_CONFIG_INVALID";
  if(config.projectId!=="souqna-sweida" ||
     config.authDomain!=="souqna-sweida.firebaseapp.com" ||
     !config.apiKey || !config.appId)return "WRONG_PRODUCTION_PROJECT";
  if(!html.includes('href="assets/souqna-guide.css"') ||
     !html.includes('from"./assets/souqna-guide.js"'))return "GUIDE_NOT_LINKED";
  if(!html.includes("acceptedTermsVersion:GUIDE_VERSION") ||
     !html.includes("acceptedPrivacyVersion:GUIDE_VERSION") ||
     !html.includes("acceptedAt:serverTimestamp()"))return "CONSENT_FLOW_MISSING";
  return "READY";
}

export async function inspectLiveProduction(fetcher=fetch){
  const paths=["/","/assets/souqna-guide.js","/assets/souqna-guide.css","/sw.js","/manifest.webmanifest"];
  const result=[];
  for(const domain of PRODUCTION_DOMAINS){
    for(const path of paths){
      const url=domain+path;
      try{
        const response=await fetcher(url,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(15000)});
        if(!response.ok){result.push({url,status:"HTTP_"+response.status});continue;}
        const body=await response.text();
        let status;
        if(path==="/")status=inspectProductionHtml(body);
        else if(path==="/sw.js")status=body.includes("assets/souqna-guide.js")&&body.includes("assets/souqna-guide.css")?"READY":"PWA_CACHE_MISSING";
        else if(path.endsWith("/souqna-guide.js"))status=inspectGuideAsset(body,"js",GUIDE_VERSION);
        else if(path.endsWith("/souqna-guide.css"))status=inspectGuideAsset(body,"css",GUIDE_VERSION);
        else {
          try{
            const m=JSON.parse(body);
            status=m.display==="standalone" && m.start_url==="./" && Array.isArray(m.icons) && m.icons.length>=2?"READY":"INVALID_PWA_MANIFEST";
          }catch{status="INVALID_PWA_MANIFEST";}
        }
        result.push({url,status});
      }catch{result.push({url,status:"UNREACHABLE"});}
    }
  }
  return result;
}

async function main(){
  assert.equal(process.argv.length,2,"Production read-only check accepts no target arguments.");
  const result=await inspectLiveProduction();
  for(const item of result)console.log(item.status+" "+item.url);
  if(!result.every(x=>x.status==="READY"))throw new Error("PRODUCTION_POST_DEPLOY_SMOKE_BLOCKED");
  console.log("SOUQNA PRODUCTION HOSTING SMOKE PASSED. Read-only.");
  console.log("This does not prove Firestore/Auth/Functions/payments work; run authenticated acceptance separately.");
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error("PRODUCTION SMOKE FAILED: "+e.message);process.exitCode=2;});
}
