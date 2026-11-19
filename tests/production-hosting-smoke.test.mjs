import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {inspectProductionHtml,inspectLiveProduction,PRODUCTION_DOMAINS} from "../scripts/check-production-hosting.mjs";
const guide=readFileSync(new URL("../assets/souqna-guide.js",import.meta.url),"utf8");
const realSource=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/souqna-guide.css",import.meta.url),"utf8");
const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
const manifest=readFileSync(new URL("../manifest.webmanifest",import.meta.url),"utf8");
const config={apiKey:"public-firebase-key",authDomain:"souqna-sweida.firebaseapp.com",projectId:"souqna-sweida",appId:"1:123:web:abc"};
const html=(c=config)=>'<html><head><link rel="stylesheet" href="assets/souqna-guide.css"></head><body><script type="module">import{renderGuide,GUIDE_VERSION}from"./assets/souqna-guide.js";acceptedTermsVersion:GUIDE_VERSION;acceptedPrivacyVersion:GUIDE_VERSION;acceptedAt:serverTimestamp();const app=initializeApp('+JSON.stringify(c)+');</script></body></html>';
test("production hosting rejects staging banners, preview settings, noindex, and wrong Firebase",()=>{
  assert.equal(inspectProductionHtml(html()),"READY");
  assert.equal(inspectProductionHtml(html({...config,projectId:"souqna-staging"})),"WRONG_PRODUCTION_PROJECT");
  assert.equal(inspectProductionHtml(html().replace("<body>","<body><div id=\"souqna-environment-banner\">Staging</div>")),"TEST_BUILD_ON_PRODUCTION");
  assert.equal(inspectProductionHtml(html().replace("<head>","<head><meta name=\"robots\" content=\"noindex,nofollow,noarchive\">")),"TEST_BUILD_ON_PRODUCTION");
  assert.equal(inspectProductionHtml(html().replace("acceptedAt:serverTimestamp()","acceptedAt:Date.now()")),"CONSENT_FLOW_MISSING");
  assert.equal(inspectProductionHtml("firebase welcome"),"NO_APPLICATION_HTML");
});
test("production public smoke accepts actual reviewed index.html JS Firebase initializer",()=>{
  assert.equal(inspectProductionHtml(realSource),"READY");
  assert.equal(inspectProductionHtml(realSource.replace('projectId:"souqna-sweida"','projectId:"souqna-staging"')),"WRONG_PRODUCTION_PROJECT");
});
test("post-deploy smoke is read-only, checks both exact production domains and required PWA files",async()=>{
  const calls=[];
  const fake=async(url,opts)=>{
    assert.equal(opts.method,"GET");
    calls.push(url);
    const body=url.endsWith("/assets/souqna-guide.js")?guide:
      url.endsWith("/assets/souqna-guide.css")?css:
      url.endsWith("/sw.js")?sw:
      url.endsWith("/manifest.webmanifest")?manifest:html();
    return {ok:true,text:async()=>body};
  };
  const result=await inspectLiveProduction(fake);
  assert.equal(result.length,10);
  assert.ok(result.every(x=>x.status==="READY"));
  assert.ok(calls.every(x=>PRODUCTION_DOMAINS.some(domain=>x.startsWith(domain+"/"))));
});
test("missing assets and staging HTML fail the production smoke",async()=>{
  const results=await inspectLiveProduction(async url=>{
    if(url.endsWith(".css"))return {ok:false,status:404};
    return {ok:true,text:async()=>url.endsWith("/")?html({...config,projectId:"souqna-staging"}):
      url.endsWith(".js")?guide:url.endsWith("/sw.js")?sw:manifest};
  });
  assert.ok(results.some(x=>x.status==="HTTP_404"));
  assert.ok(results.some(x=>x.status==="WRONG_PRODUCTION_PROJECT"));
  assert.ok(!results.every(x=>x.status==="READY"));
});
