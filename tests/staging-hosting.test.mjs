import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectPublishedHtml, checkHosting, STAGING_URLS } from "../scripts/check-staging-hosting.mjs";

const correct = {
  apiKey:"test-staging-api-key",
  authDomain:"souqna-staging.firebaseapp.com",
  projectId:"souqna-staging",
  storageBucket:"souqna-staging.firebasestorage.app",
  messagingSenderId:"123456789012",
  appId:"1:123456789012:web:12345678"
};
const html = config =>
  '<html><head><meta name="robots" content="noindex,nofollow,noarchive"></head>' +
  '<body><div id="souqna-environment-banner">بيئة اختبار سوقنا</div><link rel="stylesheet" href="assets/souqna-guide.css"><script>import{renderGuide,GUIDE_VERSION,GUIDE_TABS}from"./assets/souqna-guide.js"; acceptedTermsVersion:GUIDE_VERSION; acceptedPrivacyVersion:GUIDE_VERSION; acceptedAt:serverTimestamp();' +
  'const app=initializeApp(' + JSON.stringify(config) + ');</script>' +
  '</body></html>';

test("published staging HTML must target souqna-staging exactly",()=>{
  assert.equal(inspectPublishedHtml(html(correct)),"READY");
  assert.equal(inspectPublishedHtml(html({...correct,projectId:"souqna-sweida"})),"WRONG_FIREBASE_PROJECT");
  assert.equal(inspectPublishedHtml(html({...correct,authDomain:"souqna-sweida.firebaseapp.com"})),"WRONG_FIREBASE_PROJECT");
  assert.equal(inspectPublishedHtml(html(correct).replace('id="souqna-environment-banner"','id="other"')),"SOUQNA_STAGING_BANNER_MISSING");
  assert.equal(inspectPublishedHtml(html(correct).replace('name="robots" content="noindex,nofollow,noarchive"','')),"STAGING_NOINDEX_MISSING");
  assert.equal(inspectPublishedHtml("Firebase Hosting setup complete"),"NO_APPLICATION_HTML");
  assert.equal(inspectPublishedHtml(html(correct).replace('href="assets/souqna-guide.css"','href="missing.css"')),"GUIDE_NOT_DEPLOYED");
  assert.equal(inspectPublishedHtml(html(correct).replace("acceptedAt:serverTimestamp()","acceptedAt:Date.now()")),"CONSENT_FLOW_NOT_DEPLOYED");
});

test("hosting readiness reports both Firebase domains without relying on a real network",async()=>{
  const responses = await checkHosting(async url=>({
    ok:true,
    text:async()=>html({...correct,projectId:url===STAGING_URLS[0]?"souqna-staging":"souqna-sweida"})
  }));
  assert.equal(responses.length,2);
  assert.equal(responses[0].status,"READY");
  assert.equal(responses[1].status,"WRONG_FIREBASE_PROJECT");
});
