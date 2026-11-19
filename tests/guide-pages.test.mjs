import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {renderGuide,GUIDE_TABS,GUIDE_VERSION} from "../assets/souqna-guide.js";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/souqna-guide.css",import.meta.url),"utf8");
const build=readFileSync(new URL("../scripts/build-hosting.mjs",import.meta.url),"utf8");
const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");

test("in-app help contains four distinct public information sections",()=>{
  assert.deepEqual(GUIDE_TABS.map(t=>t.id),["how","features","terms","privacy"]);
  for(const tab of GUIDE_TABS){
    const page=renderGuide(tab.id);
    assert.ok(page.includes('role="tablist"'));
    assert.ok(page.includes('role="tabpanel"'));
    assert.ok(page.includes(tab.title));
    assert.ok(page.includes('aria-selected="true"'));
  }
  assert.match(renderGuide("missing"),/كيف تستخدم سوقنا/);
});
test("legal content explains limits and distinguishes pending integrations",()=>{
  const terms=renderGuide("terms");
  const privacy=renderGuide("privacy");
  const features=renderGuide("features");
  const how=renderGuide("how");
  for(const value of ["المعلن","الإلغاء والاسترداد","النجوم","الإعلانات المدفوعة","الخصوصية"]){
    assert.ok((terms+privacy).includes(value),value);
  }
  assert.match(terms,/Facebook/);
  assert.match(features,/قيد التفعيل/);
  assert.match(how,/قيد التجهيز/);
  assert.match(privacy,/Firebase/);
  assert.match(terms,new RegExp(GUIDE_VERSION));
});
test("account registration requires affirmative agreement and records version",()=>{
  assert.match(html,/id="l-accept"/);
  assert.match(html,/\$\{r\?`<div class="guide-consent"/);
  assert.match(html,/if\(!\$\("#l-accept"\)\?\.checked\)/);
  assert.match(html,/acceptedTermsVersion:GUIDE_VERSION/);
  assert.match(html,/acceptedPrivacyVersion:GUIDE_VERSION/);
  assert.match(html,/data-a="guide-open" data-id="terms"/);
  assert.match(html,/data-a="guide-open" data-id="privacy"/);
  assert.match(html,/if\(view==="guide"\)/);
  assert.match(html,/if\(a==="guide-tab"\)/);
  assert.match(html,/id="guideDialog"/);
});
test("new guide assets are copied and precached, and responsive CSS exists",()=>{
  for(const filename of ["assets/souqna-guide.js","assets/souqna-guide.css"]){
    assert.ok(build.includes('"'+filename+'"'));
    assert.ok(sw.includes('"'+filename+'"'));
  }
  assert.match(html,/href="assets\/souqna-guide.css"/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(css,/\.guide-dialog::backdrop/);
});
