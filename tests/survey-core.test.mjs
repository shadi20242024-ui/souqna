import test from "node:test";
import assert from "node:assert/strict";
import core from "../functions/survey-core.js";
const {canonicalPhone,participationKey,profile,questions,answers}=core;
const secret="test-only-secret-not-for-production-123456";
const phone="+963912345678";
test("alternate phone formatting yields the same key for one store",()=>{
  assert.equal(canonicalPhone("٠٠٩٦٣ ٩١٢٣٤٥٦٧٨"),phone);
  assert.equal(participationKey(secret,"cat_kids",phone),participationKey(secret,"cat_kids","00963 (912) 345678"));
  assert.notEqual(participationKey(secret,"cat_kids",phone),participationKey(secret,"other_shop",phone));
  assert.notEqual(participationKey(secret,"cat_kids",phone),participationKey(secret,"cat_kids","+963912345679"));
  assert.throws(()=>canonicalPhone("0912345678"));
  assert.throws(()=>participationKey("weak","cat_kids",phone));
});
test("registration requires name, residence and consent",()=>{
  assert.deepEqual(profile({name:"اسم زبون",residence:"السويداء",consent:true}),{name:"اسم زبون",residence:"السويداء"});
  assert.throws(()=>profile({name:"اسم زبون",residence:"السويداء"}));
  assert.throws(()=>profile({name:"",residence:"السويداء",consent:true}));
});
test("answers validate required questions, choices, rating and unknown fields",()=>{
  const q=questions([{type:"choice",label:"ما اللون المفضل؟",options:["أحمر","أزرق"]},{type:"rating",label:"تقييم المتجر"},{type:"text",label:"اقتراح إضافي",required:false}]);
  assert.deepEqual(answers(q,{q1:"o2",q2:5}),{q1:"o2",q2:5});
  for(const a of [{q1:"o5",q2:5},{q1:"o1",q2:0},{q1:"o1"},{q1:"o1",q2:5,q4:"x"}])assert.throws(()=>answers(q,a));
  assert.throws(()=>questions([{type:"choice",label:"اختر لوناً",options:["أحمر","أحمر"]}]));
});
