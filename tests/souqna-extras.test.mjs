import assert from "node:assert/strict";
import {test} from "node:test";
import {isSafeVideoUrl,validGallery,calculateExpression,jobFreshCount,validRatePayload,validGoldPayload,isFresh} from "../assets/souqna-extras.js";

test("video URL rejects arbitrary hosts, malicious schemes and accepts known providers",()=>{
  assert.equal(isSafeVideoUrl("https://youtu.be/abcdefghijk"),true);
  assert.equal(isSafeVideoUrl("https://www.youtube.com/watch?v=abcdefghijk"),true);
  assert.equal(isSafeVideoUrl("https://vimeo.com/123456789"),true);
  for(const input of ["javascript:alert(1)","http://youtu.be/abcdefghijk","https://youtube.com.evil.test/watch?v=abcdefghijk","https://evil.test/", "https://www.youtube.com/redirect?event=abc","https://youtu.be/short"]){
    assert.equal(isSafeVideoUrl(input),false,input);
  }
});
test("ad photo gallery caps count and total document size",()=>{
  const image="data:image/webp;base64,"+"A".repeat(20000);
  assert.equal(validGallery(image,[image,image,image]),true);
  assert.equal(validGallery(image,[image,image,image,image]),false);
  assert.equal(validGallery("",[image]),false);
  assert.equal(validGallery(image,[image.repeat(40)]),false);
});
test("calculator supports precedence and parentheses, rejects injected expressions",()=>{
  assert.equal(calculateExpression("(120+30)*2"),300);
  assert.equal(calculateExpression("10/4"),2.5);
  assert.equal(calculateExpression("2*-3"),-6);
  for(const invalid of ["process.exit(1)","2**10","2/0","(1+2","Infinity","1+abc"]){
    assert.throws(()=>calculateExpression(invalid),Error,invalid);
  }
});
test("new jobs badge counts only recent, approved job ads",()=>{
  const now=1800000000000;
  const ads=[{cat:"jobs",status:"approved",createdAt:now-1000},{cat:"jobs",status:"approved",createdAt:now-80*3600000},{cat:"jobs",status:"pending",createdAt:now},{cat:"cars",status:"approved",createdAt:now}];
  assert.equal(jobFreshCount(ads,now),1);
});
test("market feeds require validated values and timestamp freshness",()=>{
  const timestamp=Math.floor(Date.now()/1000);
  const fx=validRatePayload({result:"success",base_code:"USD",rates:{SYP:140,EUR:.85,TRY:40},time_last_update_unix:timestamp});
  assert.ok(fx&&isFresh(fx.timestamp,48*3600000));
  assert.equal(validRatePayload({result:"error",base_code:"USD",rates:{SYP:140,EUR:.85,TRY:40},time_last_update_unix:timestamp}),null);
  const gold=validGoldPayload({symbol:"XAU",price:4000,updatedAt:new Date().toISOString()});
  assert.ok(gold&&isFresh(gold.timestamp,60*60000));
});
