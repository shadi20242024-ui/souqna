import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/responsive.css",import.meta.url),"utf8");
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||"";
const start=script.indexOf("const APPROVED_CATEGORY_NAMES=");
const end=script.indexOf("function adminAuditRows()",start);
assert.ok(start>0&&end>start,"Category audit helper must exist");
const helper=script.slice(start,end);
const make=(records,role="admin")=>{
  const f=new Function("allCategoryRecords","isAdm","categoryPhoto","esc",helper+"return adminCategoryReadiness();");
  return f(records,()=>role==="admin",id=>id,value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])));
};
const ids=["real_estate","cars","jobs","electronics","furniture","services","community","fashion","lost_found","misc"];
test("all ten approved categories have a distinct photo and diagnostic",()=>{
  const ready=make(ids.map((id,order)=>({id,active:true,order})));
  assert.ok(ready.includes("10 / 10"));
  for(const id of ids)assert.ok(ready.includes("assets/category-photos/"+id+".webp"),id);
  assert.ok(ready.includes("الأقسام العشرة موجودة ومفعّلة"));
});
test("missing and inactive categories never count as active",()=>{
  const records=ids.slice(0,8).map(id=>({id,active:true}));
  records[1].active=false;
  const output=make(records);
  assert.ok(output.includes("7 / 10"));
  assert.ok(output.includes("معطّل"));
  assert.ok(output.includes("غير موجود"));
  assert.ok(output.includes("المفقودة"));
});
test("category audit is admin only and escapes unrecognized category labels",()=>{
  assert.equal(make([], "moderator"),"");
  const output=make([{id:"custom",name_ar:"<script>alert(1)</script>",active:true}]);
  assert.ok(!output.includes("<script>"));
  assert.ok(output.includes("&lt;script&gt;"));
});
test("category readiness reads Firebase records and never mutates them",()=>{
  assert.ok(script.includes("allCategoryRecords=c.docs.map"));
  assert.ok(script.includes("cats=allCategoryRecords.filter"));
  assert.ok(script.includes("adminCategoryReadiness()"));
  assert.ok(!/\b(?:setDoc|updateDoc|deleteDoc|addDoc)\s*\(/.test(helper));
  assert.ok(css.includes(".category-audit-grid"));
  assert.ok(css.includes("@media(max-width:650px)"));
  assert.doesNotThrow(()=>new Function(script.replace(/^import.*$/gm,"")));
});
