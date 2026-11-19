import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  calculateExpression,normalizeMathExpression,parseExchangeRates,convertCurrency,
  parseGoldPrice,goldGramUsd,fetchPublicQuote,SUPPORTED_CURRENCIES,
  RATE_URL,GOLD_URL
} from "../assets/souqna-utilities.mjs";

const NOW=1795000000000;
const rates={
  result:"success",base_code:"USD",time_last_update_unix:NOW/1000,
  rates:{USD:1,SYP:13000,AED:3.67,EUR:0.9,IQD:1320}
};

test("calculator evaluates parentheses and precedence without eval",()=>{
  assert.equal(calculateExpression("2 + 3 × (4 − 1)"),11);
  assert.equal(calculateExpression("-3.5 + 4.5"),1);
  assert.equal(calculateExpression("50% × 200"),100);
  assert.equal(calculateExpression("١٢÷٣"),4);
  assert.equal(calculateExpression("۱۲÷۳"),4);
  assert.equal(calculateExpression("(120+80)*1.5"),300);
  assert.equal(calculateExpression("1/4"),0.25);
  assert.equal(normalizeMathExpression("١٬٢٠٠٫٥ × ۲"),"1200.5*2");
});

test("calculator rejects malformed, dangerous and non-finite expressions",()=>{
  for(const source of [
    "1/0","Math.random()","1+","(1+2","1+2)",
    "1e10","constructor.constructor('x')()","5**4",
    "2(3)","1;alert(1)","9".repeat(121)
  ])assert.throws(()=>calculateExpression(source));
  assert.throws(()=>calculateExpression(""),/أولاً/);
  assert.throws(()=>calculateExpression("9".repeat(100)+"*"+ "9".repeat(16)),/خارج نطاق/);
});

test("international reference currencies require a timestamp and valid base",()=>{
  const quote=parseExchangeRates(rates,NOW+30000);
  assert.equal(quote.stale,false);
  assert.equal(quote.kind,"international_reference");
  assert.equal(convertCurrency(2,"USD","SYP",quote),26000);
  assert.equal(convertCurrency(367,"AED","USD",quote),100);
  assert.equal(convertCurrency(100,"EUR","IQD",quote),100/0.9*1320);
  assert.deepEqual(SUPPORTED_CURRENCIES,["USD","SYP","EUR","AED","IQD"]);
});

test("stale and missing currency rates are not presented as live",()=>{
  const quote=parseExchangeRates(rates,NOW+49*60*60*1000);
  assert.equal(quote.stale,true);
  assert.throws(()=>convertCurrency(10,"USD","SYP",quote),/محدث/);
  const missing=parseExchangeRates({...rates,rates:{EUR:0.9}},NOW+1000);
  assert.throws(()=>convertCurrency(10,"USD","SYP",missing),/محدث/);
  assert.throws(()=>parseExchangeRates({...rates,base_code:"EUR"},NOW),/غير صالحة/);
  assert.throws(()=>parseExchangeRates({...rates,time_last_update_unix:NOW/1000+86400},NOW),/تاريخ/);
  assert.throws(()=>convertCurrency("", "USD","EUR",parseExchangeRates(rates,NOW)),/المبلغ/);
  assert.throws(()=>convertCurrency(-50,"USD","SYP",parseExchangeRates(rates,NOW)),/صالحاً/);
});

test("gold spot price is USD per troy ounce with correctly labelled theoretical karats",()=>{
  const gold=parseGoldPrice({
    symbol:"XAU",currency:"USD",
    price:3110.34768,updatedAt:new Date(NOW-1000).toISOString()
  },NOW);
  assert.equal(gold.kind,"global_spot_price");
  assert.ok(Math.abs(goldGramUsd(gold,24)-100)<1e-8);
  assert.ok(Math.abs(goldGramUsd(gold,21)-87.5)<1e-8);
  assert.ok(Math.abs(goldGramUsd(gold,18)-75)<1e-8);
  assert.equal(gold.stale,false);
  assert.equal(parseGoldPrice({
    symbol:"XAU",currency:"USD",price:3110,
    updatedAt:new Date(NOW-80*60*60*1000).toISOString()
  },NOW).stale,true);
});

test("gold feed rejects missing timestamps, non-USD currency and non-positive prices",()=>{
  assert.throws(()=>parseGoldPrice({
    symbol:"XAU",currency:"SYP",price:100,updatedAt:new Date(NOW).toISOString()
  },NOW));
  assert.throws(()=>parseGoldPrice({
    symbol:"XAU",currency:"USD",price:-5,updatedAt:new Date(NOW).toISOString()
  },NOW));
  assert.throws(()=>parseGoldPrice({
    symbol:"XAU",currency:"USD",price:4000,updatedAt:""
  },NOW));
  assert.throws(()=>goldGramUsd({ounceUsd:4000},22));
});

test("price fetch only contacts explicitly allowed public sources and verifies HTTP responses",async()=>{
  const called=[];
  const fetcher=async(url,options)=>{
    called.push({url,options});
    return{ok:true,async json(){return{result:"success"};}};
  };
  assert.deepEqual(await fetchPublicQuote(RATE_URL,fetcher),{result:"success"});
  assert.deepEqual(await fetchPublicQuote(GOLD_URL,fetcher),{result:"success"});
  assert.equal(called.length,2);
  assert.ok(called.every(call=>call.options.signal&&call.options.cache==="no-store"));
  await assert.rejects(fetchPublicQuote("https://evil.example.com/price",fetcher),/مسموح/);
  await assert.rejects(fetchPublicQuote(GOLD_URL,async()=>({ok:false,status:429})),/غير متاح/);
});

test("homepage, desktop menu, Hosting bundle and PWA include the new tools",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const build=readFileSync(new URL("../scripts/build-hosting.mjs",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../assets/souqna-utilities-ui.mjs",import.meta.url),"utf8");
  assert.match(html,/data-v="utilities"/);
  assert.match(html,/view=="utilities"/);
  assert.match(html,/import\("\.\/assets\/souqna-utilities-ui\.mjs"\)/);
  assert.match(build,/assets\/souqna-utilities\.mjs/);
  assert.match(build,/assets\/souqna-utilities-ui\.mjs/);
  assert.match(worker,/assets\/souqna-utilities-ui\.mjs/);
  assert.match(ui,/https:\/\/www\.exchangerate-api\.com/);
  assert.match(ui,/https:\/\/gold-api\.com\//);
  assert.match(ui,/لا تمثل سعر السوق الموازي/);
  assert.match(ui,/لا يمثل سعر الصاغة/);
  assert.doesNotMatch(ui,/eval\(/);
});

test("existing services tile routes visitors to real source details, not placeholder prices",()=>{
  const widgets=readFileSync(new URL("../assets/souqna-services-ui.mjs",import.meta.url),"utf8");
  assert.match(widgets,/data-v="utilities"/);
  assert.match(widgets,/المؤشرات العالمية|مؤشرات عالمية/);
  assert.match(widgets,/سعر سوق السويداء المحلي/);
});

test("premium listing status updates after expiry without requiring browser reload",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html,/function syncFeaturedExpiry\(\)/);
  assert.match(html,/ads\.filter\(isF\)/);
  assert.match(html,/setInterval\(syncFeaturedExpiry,15000\)/);
  assert.match(html,/featuredDate/);
  assert.match(html,/انتهى التمييز بتاريخ/);
  assert.match(html,/النشر التلقائي على فيسبوك وإنستغرام غير متاح حتى ربط صفحات سوقنا الرسمية/);
});
