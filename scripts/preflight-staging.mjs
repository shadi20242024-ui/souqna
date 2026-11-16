import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const folder=resolve(process.env.SOUQNA_HOSTING_OUT||join(root,"dist"));
const target=process.argv[2];
assert.ok(typeof target==="string"&&/^[a-z][a-z0-9-]{4,40}$/.test(target),
  "Usage: node scripts/preflight-staging.mjs <EXACT_STAGING_PROJECT_ID>");
assert.notEqual(target,"souqna-sweida","Production project is not an eligible staging target.");
const htmlPath=join(folder,"index.html");
assert.ok(existsSync(htmlPath),"No Hosting build found. Run build:staging with explicit config first.");
const html=readFileSync(htmlPath,"utf8");
const app=html.match(/const app=initializeApp\((\{[^\n;]*\})\);/);
assert.ok(app,"Firebase client configuration missing.");
const config=JSON.parse(app[1]);
assert.equal(config.projectId,target,"Hosting Firebase project differs from proposed staging deploy target.");
assert.notEqual(config.projectId,"souqna-preview-disabled","Preview builds are not deployable as working staging.");
assert.notEqual(config.authDomain,"souqna-sweida.firebaseapp.com","Production Firebase Auth domain detected.");
assert.equal(config.authDomain,config.projectId+".firebaseapp.com");
assert.ok(!html.includes('projectId:"souqna-sweida"'),"Production Firebase project still present.");
const firebase=JSON.parse(readFileSync(join(root,"firebase.json"),"utf8"));
assert.equal(firebase.hosting.public,"dist","Firebase Hosting must publish the audited dist folder.");
for(const f of ["index.html","sw.js","assets/responsive.css","assets/admin-metrics.js"]){
  assert.ok(existsSync(join(folder,f)),"Missing Hosting output: "+f);
}
for(const f of ["functions","firestore.rules","tests"]){
  assert.ok(!existsSync(join(folder,f)),"Private source leaked into staging Hosting: "+f);
}
console.log("SOUQNA staging preflight passed for project: "+target);
console.log("This is read-only validation. Nothing has been deployed.");
