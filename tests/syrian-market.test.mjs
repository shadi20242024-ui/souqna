import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {parseSyrianMarketRates,fetchSyrianMarketRates,SYRIAN_MARKET_ENDPOINT,SYRIAN_MARKET_SOURCE} from "../assets/syrian-market.js";

const recent=(n=0)=>new Date(Date.now()-n).toISOString();
const payload=()=>({marketRates:[
  {currency:"USD",buy:149.5,sell:150.5,timestampUtc:recent()},
  {currency:"EUR",buy:162,sell:164,timestampUtc:recent()}
]});
test("provider response is parsed with verified recent buy and sell quotes",()=>{
  const p=parseSyrianMarketRates(payload());
  assert.ok(p);
  assert.equal(p.usd.buy,149.5);
  assert.equal(p.eur.sell,164);
  assert.equal(p.source,SYRIAN_MARKET_SOURCE);
});
test("outdated, future, malformed or incomplete quotes never appear as live",()=>{
  let p=payload();
  p.marketRates[1].timestampUtc=recent(7*3600000);
  assert.equal(parseSyrianMarketRates(p),null);
  p=payload();
  p.marketRates[0].buy=155;
  assert.equal(parseSyrianMarketRates(p),null);
  p=payload();
  p.marketRates.pop();
  assert.equal(parseSyrianMarketRates(p),null);
  p=payload();
  p.marketRates[0].timestampUtc="invalid";
  assert.equal(parseSyrianMarketRates(p),null);
  p=payload();
  p.marketRates[0].timestampUtc=new Date(Date.now()+30*60000).toISOString();
  assert.equal(parseSyrianMarketRates(p),null);
});
test("read-only endpoint and rate-limits fail closed",async()=>{
  const received=[];
  const result=await fetchSyrianMarketRates(async (url,options)=>{
    received.push({url,options});
    return {ok:true,json:async()=>payload()};
  });
  assert.equal(result.usd.sell,150.5);
  assert.equal(received[0].url,SYRIAN_MARKET_ENDPOINT);
  assert.equal(received[0].options.method,"GET");
  await assert.rejects(fetchSyrianMarketRates(async()=>({ok:false,status:429})),/الحد المجاني/);
});
test("Syrian price module is shipped in Hosting with strict source attribution",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const build=readFileSync(new URL("../scripts/build-hosting.mjs",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(html,/import\{fetchSyrianMarketRates,SYRIAN_MARKET_SOURCE\}from/);
  assert.match(html,/\$\{syrianMarketHtml\(\)\}/);
  assert.match(html,/if\(!lastSyrianPoll\)loadSyrianRates\(\)/);
  assert.ok(build.includes('"assets/syrian-market.js"'));
  assert.ok(worker.includes('"assets/syrian-market.js"'));
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||"";
  assert.doesNotThrow(()=>new Function(script.replace(/^import.*$/gm,"")));
});
