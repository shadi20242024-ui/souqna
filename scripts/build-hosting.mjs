import {buildAuctions} from "./build-auctions.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeHostingOutput } from "./hosting-output.mjs";
import { GUIDE_VERSION } from "../assets/souqna-guide.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const target=resolve(process.env.SOUQNA_HOSTING_OUT||join(root,"dist"));
assertSafeHostingOutput(target,root);
const mode=process.argv[2]||"preview";
assert.ok(["preview","staging","production"].includes(mode),"Usage: node scripts/build-hosting.mjs [preview|staging path/to/firebase.staging.json|production]");
const publicFiles=Object.freeze([
  "index.html","assets/responsive.css","assets/souqna-guide.css","assets/souqna-guide.js","assets/admin-metrics.js","assets/souqna-extras.js","assets/souqna-media.js","assets/syrian-market.js",
  "assets/category-photos/furniture.webp","assets/category-photos/furniture-scene.webp","assets/category-photos/electronics.webp","assets/category-photos/electronics-scene.webp","assets/category-photos/jobs.webp","assets/category-photos/jobs-scene.webp","assets/category-photos/cars.webp","assets/category-photos/cars-scene.webp","assets/category-photos/real_estate.webp","assets/category-photos/real_estate-scene.webp","assets/category-photos/misc.webp","assets/category-photos/misc-scene.webp","assets/category-photos/lost_found.webp","assets/category-photos/lost_found-scene.webp","assets/category-photos/fashion.webp","assets/category-photos/fashion-scene.webp","assets/category-photos/community.webp","assets/category-photos/community-scene.webp","assets/category-photos/services.webp","assets/category-photos/services-scene.webp","assets/souqna-approved-logo.jpg","assets/souqna-3d-mark.webp",
  "sw.js","manifest.webmanifest","logo.png","icon-192.png","icon-512.png"
]);

const manifest=JSON.parse(readFileSync(join(root,"manifest.webmanifest"),"utf8"));
assert.equal(manifest.start_url,"./");
for(const icon of manifest.icons||[]){
  assert.ok(publicFiles.includes(icon.src),"Unbundled PWA icon: "+icon.src);
}
const serviceWorker=readFileSync(join(root,"sw.js"),"utf8");
const precache=serviceWorker.match(/const STATIC=(\[[^;]+);/)?.[1];
assert.ok(precache,"PWA precache list is missing");
for(const url of JSON.parse(precache)){
  assert.ok(url==="./"||publicFiles.includes(url),"Unbundled PWA asset: "+url);
}
const html=readFileSync(join(root,"index.html"),"utf8");
assert.match(html,/href="assets\/responsive\.css"/);
assert.match(html,/httpsCallable\(functions,"souqnaFinance"\)/);
assert.ok(!html.includes("connectFunctionsEmulator(functions"),"Client must not hardcode emulator.");
const original=html.match(/const app=initializeApp\((\{[^\n;]*\})\);/);
assert.ok(original,"Firebase initialization must be a single-line static object.");
const production=Object.fromEntries(
  [...original[1].matchAll(/([a-zA-Z]\w*):"([^"]*)"/g)].map(match=>[match[1],match[2]])
);
const required=["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"];
assert.deepEqual(Object.keys(production).sort(),required.slice().sort(),"Firebase initialization has changed.");
assert.equal(production.projectId,"souqna-sweida","Production project changed; review build guard first.");

function validateStaging(config){
  assert.ok(config&&typeof config==="object"&&!Array.isArray(config),"Staging config must be an object.");
  assert.deepEqual(Object.keys(config).sort(),required.slice().sort(),"Only public Firebase Web SDK config fields are accepted.");
  for(const name of required){
    assert.ok(typeof config[name]==="string"&&config[name].length>=4&&config[name].length<256,name+" must be nonempty.");
    assert.ok(!/[<>'"\n\r]/.test(config[name]),name+" has invalid characters.");
  }
  assert.match(config.projectId,/^[a-z][a-z0-9-]{4,40}$/);
  assert.notEqual(config.projectId,production.projectId,"Staging cannot use production.");
  assert.notEqual(config.authDomain,production.authDomain,"Staging must not use production Auth.");
  assert.notEqual(config.storageBucket,production.storageBucket,"Staging must not use production Storage.");
  assert.notEqual(config.apiKey,production.apiKey,"Staging needs a separate Firebase API key.");
  assert.notEqual(config.appId,production.appId,"Staging needs a separate web app.");
  assert.notEqual(config.messagingSenderId,production.messagingSenderId,"Staging needs a separate messaging sender.");
  assert.equal(config.authDomain,config.projectId+".firebaseapp.com","Use the staging project's default Auth domain.");
  assert.ok([config.projectId+".firebasestorage.app",config.projectId+".appspot.com"].includes(config.storageBucket),"Staging Storage bucket mismatch.");
  assert.match(config.messagingSenderId,/^\d{6,20}$/);
  assert.match(config.appId,/^1:\d{6,20}:web:[a-zA-Z0-9]+$/);
}

let config;
if(mode==="staging"){
  assert.equal(process.argv.length,4,"Staging requires exactly one explicit JSON config file path.");
  const path=resolve(process.argv[3]);
  assert.ok(existsSync(path),"Staging Firebase Web SDK config file not found.");
  config=JSON.parse(readFileSync(path,"utf8"));
  validateStaging(config);
}else if(mode==="production"){
  assert.equal(process.argv.length,3,"Production build takes no Firebase config arguments.");
  assert.equal(process.env.SOUQNA_PRODUCTION_BUILD_APPROVED,"souqna-sweida:"+GUIDE_VERSION,
    "Production compilation needs explicit release approval; no deployment is performed.");
  const rules=readFileSync(join(root,"firestore.rules"),"utf8");
  assert.ok(rules.includes('acceptedTermsVersion == "'+GUIDE_VERSION+'"') &&
    rules.includes('acceptedPrivacyVersion == "'+GUIDE_VERSION+'"'),
    "Production terms version does not match Firestore rules.");
  assert.equal(production.projectId,"souqna-sweida","Production project mismatch.");
  assert.equal(production.authDomain,"souqna-sweida.firebaseapp.com","Production auth domain mismatch.");
  config=production;
}else{
  assert.ok(process.argv.length===2||process.argv.length===3,"Preview mode accepts no Firebase config.");
  // Preview must not contact real Firebase: this intentionally nonfunctional config
  // prevents an accidentally hosted preview from displaying or altering customer data.
  config={
    apiKey:"preview-disabled-no-network",
    authDomain:"preview-disabled.invalid",
    projectId:"souqna-preview-disabled",
    storageBucket:"souqna-preview-disabled.invalid",
    messagingSenderId:"000000000000",
    appId:"1:000000000000:web:previewdisabled"
  };
}
const replacement="const app=initializeApp("+JSON.stringify(config)+");";
const environmentText=mode==="preview"
  ?"⚠️ نسخة معاينة معزولة — لا تتصل بقاعدة البيانات ولا تعمل كنسخة منشورة"
  :"🧪 بيئة اختبار سوقنا — بيانات تجريبية فقط — "+config.projectId;
const environmentBanner='<div id="souqna-environment-banner" role="status" style="position:relative;z-index:110;padding:9px 14px;text-align:center;background:#fdf0c4;color:#1f2d48;border-bottom:2px solid #d89e25;font:700 14px system-ui,sans-serif" dir="rtl">'+environmentText+'</div>';
let output=mode==="production"?html:
  html.replace(original[0],()=>replacement)
    .replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive">\n</head>')
    .replace("<body>","<body>\n"+environmentBanner);
if(mode==="preview"){
  // The isolated preview is an interactive mock-data demo. It does not run the
  // real Firebase application or ask visitors for accounts or payment details.
  const moduleScript=/<script type="module">[\s\S]*?<\/script>/;
  assert.ok(moduleScript.test(output),"Expected a single main Firebase module for preview replacement.");
  output=output.replace(moduleScript,
    '<script id="souqna-preview-config" type="application/json">{"projectId":"souqna-preview-disabled","mockData":true}</script>\n'+
    '<script type="module" src="./assets/preview-demo.js"></script>')
    .replace("</head>",'<link rel="stylesheet" href="assets/preview-demo.css">\n</head>');
}
if(mode!=="production"){
  assert.ok(!output.includes(production.apiKey),"Production Firebase key leaked into staging/preview.");
  assert.ok(!output.includes('projectId:"souqna-sweida"'),"HTML still points to production.");
  assert.ok(!output.includes(production.appId),"Production Firebase app ID leaked into staging/preview.");
}else{
  assert.ok(!output.includes('name="robots" content="noindex,nofollow,noarchive"'),
    "Production HTML must not be noindexed.");
  assert.ok(!output.includes('id="souqna-environment-banner"'),
    "Production must not display a staging warning.");
}

const bundleFiles=mode==="preview"
  ?[...publicFiles,"assets/preview-demo.js","assets/preview-demo.css"]
  :publicFiles;
rmSync(target,{recursive:true,force:true});
for(const filename of bundleFiles){
  const src=join(root,filename),dest=join(target,filename);
  assert.ok(existsSync(src),"Public asset missing: "+filename);
  mkdirSync(dirname(dest),{recursive:true});
  if(filename==="index.html")writeFileSync(dest,output,"utf8");
  else cpSync(src,dest);
}
if(mode==="preview"||mode==="staging"&&(config.projectId==="souqna-staging"||config.projectId.startsWith("demo-"))){
  buildAuctions(root,target,mode,config);
  const entry=join(target,"index.html");
  writeFileSync(entry,readFileSync(entry,"utf8").replace('<main id="app">','<div dir="rtl" style="padding:8px 4%;background:#171914"><a style="color:#f2d396" href="./assets/auctions/index.html">مزادات سوقنا · SOUQNA AUCTIONS</a></div><main id="app">'));
}
const topLevel=readdirSync(target).sort();
assert.deepEqual(topLevel,["assets","icon-192.png","icon-512.png","index.html","logo.png","manifest.webmanifest","sw.js"].sort());
for(const prohibited of ["firestore.rules","functions","tests","docs","package.json",".git"]){
  assert.ok(!existsSync(join(target,prohibited)),"Private artifact leaked into Hosting: "+prohibited);
}
console.log("SOUQNA safe Hosting "+mode+" bundle created.");
console.log("Bundle project: "+config.projectId);
console.log("Published public files: "+publicFiles.join(", "));
console.log(mode==="preview"
  ?"WARNING: Preview is disconnected from Firebase. It is NOT a working staging environment."
  :mode==="staging"
    ?"NOTE: Build targets a separate staging project. No deployment performed."
    :"PRODUCTION BUILD CREATED LOCALLY ONLY. NO CLOUD DEPLOYMENT. External release approval still required.");
