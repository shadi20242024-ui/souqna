import test from "node:test";
import assert from "node:assert/strict";
import {calculateBasic,validateListingMedia,validateMarketQuote,countNewJobs,mayManageSection,getSuwaydaWeather} from "../assets/souqna-local-services.mjs";
test("calculator supports arithmetic and guards division",()=>{
  assert.equal(calculateBasic(20,"%",15),3);
  assert.equal(calculateBasic(7,"*",6),42);
  assert.throws(()=>calculateBasic(10,"/",0),/الصفر/);
});
test("listing media validates multiple images and video host",()=>{
  const valid=validateListingMedia({images:["https://example.org/a.jpg","https://example.org/b.jpg"],videoUrl:"https://youtu.be/abc"});
  assert.equal(valid.images.length,2);
  assert.equal(valid.coverImage,valid.images[0]);
  assert.throws(()=>validateListingMedia({images:["http://example.org/a.jpg"]}),/HTTPS/);
  assert.throws(()=>validateListingMedia({videoUrl:"https://evil.example/video"}),/YouTube/);
});
test("quote requires source and marks stale price",()=>{
  const now=Date.parse("2026-11-18T18:00:00Z");
  const result=validateMarketQuote({symbol:"USD/SYP",buy:10000,sell:10100,currency:"SYP",source:"manual-staging",updatedAt:"2026-11-18T16:00:00Z"},{now});
  assert.equal(result.isStale,true);
  assert.throws(()=>validateMarketQuote({symbol:"USD/SYP"}),/غير مكتملة/);
});
test("new jobs count only newly approved postings",()=>{
  const now=Date.parse("2026-11-18T18:00:00Z");
  assert.equal(countNewJobs([
    {status:"approved",publishedAt:"2026-11-17T18:00:00Z"},
    {status:"pending",publishedAt:"2026-11-17T18:00:00Z"},
    {status:"approved",publishedAt:"2026-10-01T18:00:00Z"}
  ],{since:now-7*86400000}),1);
});
test("section permission is scoped",()=>{
  assert.equal(mayManageSection("moderator","jobs",{active:true,sectionIds:["jobs"]}),true);
  assert.equal(mayManageSection("moderator","fuel_stations",{active:true,sectionIds:["jobs"]}),false);
  assert.equal(mayManageSection("moderator","jobs",{active:false,sectionIds:["jobs"]}),false);
});
test("weather parses provider response",async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({
    current:{temperature_2m:21,wind_speed_10m:14,relative_humidity_2m:42,weather_code:2,time:"2026-11-18T15:00"},
    daily:{temperature_2m_min:[12],temperature_2m_max:[24]}
  })});
  const w=await getSuwaydaWeather({fetcher});
  assert.equal(w.temperatureC,21);
  assert.equal(w.condition,"غائم جزئياً");
  assert.equal(w.source,"Open-Meteo");
});
