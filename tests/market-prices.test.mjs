import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  MARKET_DEFINITIONS,MARKET_IDS,SYRIAN_OLD_PER_NEW,
  validateLocalPriceInput,readLocalPrice,summarizeMarketRecords
} from "../assets/souqna-local-market-rates.mjs";

const NOW=1795000000000;
const sample={
  id:"usd_parallel",buy:"120",sell:"125",
  sourceName:"تقرير سعر محلي مؤرخ",
  sourceUrl:"https://example.org/market-report",
  observedAt:new Date(NOW-3600000)
};
const stored={
  ...sample,buy:120,sell:125,method:"manual",
  currencyEra:"SYP_NEW",
  observedAt:{seconds:(NOW-3600000)/1000,nanoseconds:0},
  updatedAt:{seconds:NOW/1000,nanoseconds:0}
};
test("six Suwayda quote cells cover official and parallel USD, gold karats and silver",()=>{
  assert.deepEqual(MARKET_IDS,[
    "usd_official","usd_parallel","gold_24","gold_21","gold_18","silver_999"
  ]);
  assert.equal(MARKET_DEFINITIONS.length,6);
  assert.equal(SYRIAN_OLD_PER_NEW,100);
});
test("manual prices validate source, observed date and new-SYP buy/sell",()=>{
  const rate=validateLocalPriceInput(sample,{now:NOW});
  assert.deepEqual(rate,{buy:120,sell:125,sourceName:sample.sourceName,
    sourceUrl:sample.sourceUrl,observedAt:NOW-3600000});
  assert.ok(readLocalPrice(sample.id,stored,{now:NOW}));
});
test("official dollar needs citation to published source bulletin",()=>{
  assert.throws(()=>validateLocalPriceInput({...sample,id:"usd_official",sourceUrl:""},{now:NOW}),/النشرة/);
  assert.throws(()=>validateLocalPriceInput({...sample,id:"usd_official",sourceUrl:"http://example.org"},{now:NOW}),/HTTPS/);
});
test("invalid and dangerously old prices never pass input validation",()=>{
  for(const value of [
    {...sample,buy:"",sell:"125"},
    {...sample,buy:130,sell:125},
    {...sample,buy:-1},
    {...sample,buy:1e12},
    {...sample,buy:1.123},
    {...sample,id:"unknown"},
    {...sample,observedAt:new Date(NOW-8*86400000)},
    {...sample,observedAt:new Date(NOW+10*60000)}
  ])assert.throws(()=>validateLocalPriceInput(value,{now:NOW}));
});
test("visitor can identify stale and missing values without inventing rates",()=>{
  assert.equal(readLocalPrice("usd_parallel",stored,{now:NOW}).stale,false);
  assert.equal(readLocalPrice("usd_parallel",stored,{now:NOW+26*3600000}).stale,true);
  assert.equal(readLocalPrice("unknown",stored,{now:NOW}),null);
  assert.equal(readLocalPrice("usd_official",{...stored,sourceUrl:""},{now:NOW}),null);
  assert.equal(readLocalPrice("usd_parallel",{...stored,currencyEra:"SYP_OLD"},{now:NOW}),null);
  const cells=summarizeMarketRecords([{id:"usd_parallel",...stored}],{now:NOW});
  assert.equal(cells.length,6);
  assert.equal(cells[0].missing,true);
  assert.equal(cells[1].buy,120);
  assert.equal(cells[5].missing,true);
});
test("staging public widget and delegated staff use separate safe mount",()=>{
  const ui=readFileSync(new URL("../assets/souqna-local-market-ui.mjs",import.meta.url),"utf8");
  const staff=readFileSync(new URL("../assets/souqna-staff-ui.mjs",import.meta.url),"utf8");
  const bundle=readFileSync(new URL("../scripts/build-hosting.mjs",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(ui,/projectId!=="souqna-staging"/);
  assert.match(ui,/includeMetadataChanges:true/);
  assert.match(ui,/staffAssignments/);
  assert.match(ui,/serverTimestamp\(\)/);
  assert.match(ui,/sourceName/);
  assert.match(ui,/توقيت المعلومة/);
  assert.match(staff,/market_prices/);
  assert.match(staff,/serviceAssigned=assigned\.filter\(id=>id!=="market_prices"\)/);
  assert.match(bundle,/assets\/souqna-local-market-ui\.mjs/);
  assert.match(bundle,/assets\/souqna-local-market-rates\.mjs/);
  assert.match(sw,/assets\/souqna-local-market-ui\.mjs/);
  assert.doesNotMatch(ui,/eval\(/);
});
