import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { GUIDE_VERSION, GUIDE_SUPPORT_EMAIL } from "../assets/souqna-guide.js";
import {
  inspectGuideAsset, checkGuideAssets, STAGING_DOMAINS, GUIDE_FILES
} from "../scripts/check-staging-guide-assets.mjs";

const js=readFileSync(new URL("../assets/souqna-guide.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/souqna-guide.css",import.meta.url),"utf8");

test("staging asset verifier recognizes the exact legal version and complete guide",()=>{
  assert.equal(inspectGuideAsset(js,"js"),"READY");
  assert.equal(inspectGuideAsset(css,"css"),"READY");
  assert.equal(inspectGuideAsset(js.replaceAll(GUIDE_VERSION,"2025-01-01"),"js"),"GUIDE_VERSION_MISMATCH");
  assert.equal(inspectGuideAsset(js.replace(GUIDE_SUPPORT_EMAIL,"someone@example.invalid"),"js"),"SUPPORT_CONTACT_MISMATCH");
  assert.equal(inspectGuideAsset("main {color:blue}".repeat(10),"css"),"GUIDE_STYLES_MISSING");
  assert.equal(inspectGuideAsset("<!DOCTYPE html><html>hosting fallback</html>".repeat(4),"js"),"HTML_FALLBACK_INSTEAD_OF_ASSET");
  assert.equal(inspectGuideAsset("missing","js"),"EMPTY_ASSET");
});

test("read-only staging assets check fetches two exact resources at both staging domains",async()=>{
  const seen=[];
  const mock=async(url,options)=>{
    seen.push(url);
    assert.equal(options.method,"GET");
    assert.ok(STAGING_DOMAINS.some(base=>url.startsWith(base+"/")));
    return {ok:true,text:async()=>url.endsWith(".js")?js:css};
  };
  const result=await checkGuideAssets(mock);
  assert.equal(result.length,4);
  assert.ok(result.every(x=>x.status==="READY"));
  assert.deepEqual(seen,STAGING_DOMAINS.flatMap(host=>GUIDE_FILES.map(file=>host+file.path)));
});

test("missing assets or non-asset 200 fallback block staging verification",async()=>{
  const missing=await checkGuideAssets(async url=>({ok:false,status:404}));
  assert.ok(missing.every(x=>x.status==="HTTP_404"));
  const fallback=await checkGuideAssets(async url=>({
    ok:true,text:async()=>url.endsWith(".css")?css:"<!doctype html><html><body>Not an asset</body></html>"
  }));
  assert.ok(fallback.some(x=>x.status==="HTML_FALLBACK_INSTEAD_OF_ASSET"));
  assert.ok(!fallback.every(x=>x.status==="READY"));
});
