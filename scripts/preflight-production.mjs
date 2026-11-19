import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDE_VERSION } from "../assets/souqna-guide.js";
import { assertSafeHostingOutput } from "./hosting-output.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const dist=assertSafeHostingOutput(process.env.SOUQNA_HOSTING_OUT||join(root,"dist"),root);
export const REQUIRED_FILES=Object.freeze([
  "index.html","sw.js","manifest.webmanifest","icon-192.png","icon-512.png",
  "assets/responsive.css","assets/admin-metrics.js","assets/souqna-guide.js",
  "assets/souqna-guide.css","assets/souqna-extras.js","assets/syrian-market.js"
]);
const prohibited=["firestore.rules","functions","tests",".git","docs","firebase.json","package.json","firebase.staging.json"];

export function inspectProductionRelease(html,source,rules,manifest,worker){
  if(typeof html!=="string" || html.length<100)return "MISSING_PRODUCTION_HTML";
  if(html!==source)return "PRODUCTION_HTML_DIFFERS_FROM_REVIEWED_SOURCE";
  const app=html.match(/const app=initializeApp\((\{[^\n;]*\})\);/);
  if(!app)return "FIREBASE_CONFIG_MISSING";
  const config=Object.fromEntries(
    [...app[1].matchAll(/([a-zA-Z]\w*):"([^"]*)"/g)].map(m=>[m[1],m[2]])
  );
  if(config.projectId!=="souqna-sweida"||
    config.authDomain!=="souqna-sweida.firebaseapp.com"||
    !config.appId||!config.apiKey)return "INCORRECT_PRODUCTION_FIREBASE";
  if(html.includes('id="souqna-environment-banner"') ||
    html.includes('name="robots" content="noindex,nofollow,noarchive"')||
    html.includes("souqna-preview-disabled"))return "TEST_ENVIRONMENT_LEAK";
  if(!rules.includes('acceptedTermsVersion == "'+GUIDE_VERSION+'"') ||
     !rules.includes('acceptedPrivacyVersion == "'+GUIDE_VERSION+'"') ||
     !rules.includes("acceptedAt == request.time"))return "LEGAL_RULES_MISMATCH";
  if(!html.includes('href="assets/souqna-guide.css"')||
     !html.includes('from"./assets/souqna-guide.js"'))return "HELP_ASSETS_NOT_LINKED";
  if(!html.includes("acceptedAt:serverTimestamp()"))return "REGISTRATION_CONSENT_NOT_RECORDED";
  if(manifest.start_url!=="./" || manifest.display!=="standalone" ||
     !Array.isArray(manifest.icons) || manifest.icons.length<2)return "PWA_MANIFEST_INVALID";
  if(!worker.includes("const STATIC=") || !worker.includes("assets/souqna-guide.js") ||
     !worker.includes("assets/souqna-guide.css"))return "PWA_CACHE_INCOMPLETE";
  return "READY";
}

export function inspectProductionBundle(folder=dist){
  for(const filename of REQUIRED_FILES)if(!existsSync(join(folder,filename)))return "MISSING:"+filename;
  for(const filename of prohibited)if(existsSync(join(folder,filename)))return "PRIVATE_FILE_EXPOSED:"+filename;
  const html=readFileSync(join(folder,"index.html"),"utf8");
  const source=readFileSync(join(root,"index.html"),"utf8");
  const rules=readFileSync(join(root,"firestore.rules"),"utf8");
  const manifest=JSON.parse(readFileSync(join(folder,"manifest.webmanifest"),"utf8"));
  const worker=readFileSync(join(folder,"sw.js"),"utf8");
  const guide=readFileSync(join(folder,"assets/souqna-guide.js"),"utf8");
  if(!guide.includes('GUIDE_VERSION="'+GUIDE_VERSION+'"'))return "HELP_VERSION_MISMATCH";
  const firebase=JSON.parse(readFileSync(join(root,"firebase.json"),"utf8"));
  if(firebase.hosting?.public!=="dist")return "WRONG_HOSTING_ROOT";
  return inspectProductionRelease(html,source,rules,manifest,worker);
}

async function main(){
  assert.equal(process.argv.length,2,"Production preflight takes no deployment target arguments.");
  const result=inspectProductionBundle();
  if(result!=="READY")throw new Error(result);
  console.log("SOUQNA PRODUCTION BUILD PREFLIGHT PASSED: "+GUIDE_VERSION);
  console.log("Production package validated OFFLINE. No live Firebase, billing or domain verified.");
  console.log("NOT AUTHORIZED FOR PUBLIC DEPLOYMENT until staging/owner approval.");
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error("PRODUCTION PREFLIGHT BLOCKED: "+e.message);process.exitCode=2;});
}
