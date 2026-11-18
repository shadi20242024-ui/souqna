import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const script=html.split('<script type="module">')[1]?.split("</script>")[0]||"";
const builder=readFileSync(new URL("../scripts/build-hosting.mjs",import.meta.url),"utf8");
const rules=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
test("real client gallery validates image and video, with backend limits",()=>{
  assert.ok(html.includes('id="a-img"'));
  assert.ok(html.includes('id="a-video"'));
  assert.ok(html.includes("compressAdPhotos"));
  assert.ok(html.includes("validGallery(photo,galleryPhotos)"));
  assert.ok(html.includes("isSafeVideoUrl(videoUrl)"));
  assert.ok(html.includes("function showAdGallery"));
  assert.ok(builder.includes("assets/souqna-extras.js"));
  assert.ok(builder.includes("assets/souqna-media.js"));
});
test("customer tools do not claim stale financial data or stale weather",()=>{
  for(const token of ["open-meteo.com","open.er-api.com","api.gold-api.com","isFresh(marketFx.timestamp","isFresh(marketGold.timestamp","setInterval(loadWx,15*60000)","id=\"calc-expression\"","jobNewsBanner()"]){
    assert.ok(html.includes(token),token);
  }
  assert.ok(html.includes("marketLocal"));
  assert.ok(html.includes('currencyUnit:"new_syp"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes("جديدة")&&html.includes("الذهب العالمي"));
});
test("owner can create custom categories; specialties are backend enforced",()=>{
  assert.ok(html.includes('data-a="category-add"'));
  assert.ok(html.includes('data-a="category-toggle"'));
  assert.ok(html.includes('data-a="uscope"'));
  assert.ok(html.includes('role==="specialist"'));
  assert.ok(rules.includes('hasSpecialty("jobs")'));
  assert.ok(rules.includes('match /directory/{id}'));
  assert.ok(rules.includes('specialties'));
  assert.doesNotThrow(()=>new Function(script.split("\n").filter(line=>!line.startsWith("import")).join("\n")));
});
