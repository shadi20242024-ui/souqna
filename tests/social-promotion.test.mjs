import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";

const require=createRequire(import.meta.url);
const {expiresFromPromotion,createSocialPromotionJob,extendSocialPromotionJob,actionsForSocialPromotion}=
  require("../functions/social-promotion.js");
const now=1795000000000;
const days=15;
const ad={ownerId:"owner_123",status:"approved",title:"سيارة للبيع",area:"السويداء",cat:"cars",price:9000,cur:"$",featuredUntil:0,
  images:["https://firebasestorage.googleapis.com/v0/b/souqna-staging.firebasestorage.app/o/ads%2Fowner_123%2Fphoto_12345678.jpg?alt=media"]};

function queued(customAd=ad){
  return createSocialPromotionJob({
    ad:customAd,
    adId:"listing_123",
    userId:"owner_123",
    promoId:"paid_promo_123",
    now,
    expiresAt:expiresFromPromotion(customAd,days,now)
  });
}

test("paid featured listing activates exactly once after approval and records both platform states",()=>{
  const job=queued();
  assert.equal(job.status,"awaiting_connection");
  assert.equal(job.latestPromotionId,"paid_promo_123");
  assert.equal(job.expiresAt,now+15*86400000);
  assert.equal(job.channels.facebook.status,"awaiting_connection");
  assert.equal(job.channels.instagram.status,"awaiting_connection");
  assert.equal(job.channels.facebook.postId,"");
  assert.equal(job.channels.instagram.postId,"");
  assert.ok(job.imageUrl.includes("photo_12345678"));
});

test("renewal extends the existing expiration without resetting social post IDs",()=>{
  const job=queued();
  job.channels.facebook={status:"published",postId:"page_123_456",publishedAt:now};
  job.channels.instagram={status:"published",postId:"17912345678901234",publishedAt:now};
  const later=now+86400000;
  const nextExpires=expiresFromPromotion({...ad,featuredUntil:job.expiresAt},30,later);
  const update=extendSocialPromotionJob(job,{
    ad,promoId:"paid_promo_456",expiresAt:nextExpires,now:later
  });
  const merged={...job,...update};
  assert.equal(merged.expiresAt,job.expiresAt+30*86400000);
  assert.equal(merged.channels.facebook.postId,"page_123_456");
  assert.equal(merged.channels.instagram.postId,"17912345678901234");
  assert.deepEqual(actionsForSocialPromotion(merged,later,{facebook:true,instagram:true}).map(a=>a.action),["none","none"]);
  assert.throws(()=>extendSocialPromotionJob(job,{ad,promoId:"paid_promo_789",expiresAt:job.expiresAt-1,now:later}),/shorten/);
});

test("unconnected social profiles never cause automatic publishing",()=>{
  const job=queued();
  const actions=actionsForSocialPromotion(job,now,{facebook:false,instagram:false});
  assert.deepEqual(actions.map(a=>a.reason),["not_connected","not_connected"]);
  assert.deepEqual(actions.map(a=>a.action),["none","none"]);
});

test("connected Facebook and Instagram require an active paid promotion and public photo",()=>{
  const job=queued();
  assert.deepEqual(actionsForSocialPromotion(job,now,{facebook:true,instagram:true}).map(a=>a.action),["publish","publish"]);
  const withoutGallery=queued({...ad,images:[]});
  const actions=actionsForSocialPromotion(withoutGallery,now,{facebook:true,instagram:true});
  assert.equal(actions[0].action,"publish");
  assert.equal(actions[1].reason,"missing_public_image");
});

test("expired promotion requests removal of only previously published page posts",()=>{
  const job=queued();
  job.channels.facebook={status:"published",postId:"page_123_456",publishedAt:now};
  job.channels.instagram={status:"awaiting_connection",postId:""};
  const actions=actionsForSocialPromotion(job,job.expiresAt,{facebook:true,instagram:true});
  assert.equal(actions[0].action,"remove");
  assert.equal(actions[1].action,"none");
  assert.equal(actions[0].reason,"promotion_ended");
});

test("listing removal requests social removal even before feature expiry",()=>{
  const job=queued();
  job.status="removal_requested";
  job.channels.facebook={status:"published",postId:"page_123_456"};
  job.channels.instagram={status:"published",postId:"17912345678901234"};
  const actions=actionsForSocialPromotion(job,now+1000,{facebook:true,instagram:true});
  assert.deepEqual(actions.map(a=>a.action),["remove","remove"]);
});

test("owner mismatch and unapproved listing cannot create or extend social promotion",()=>{
  assert.throws(()=>queued({...ad,ownerId:"another_user"}),/approved owned/);
  assert.throws(()=>queued({...ad,status:"pending"}),/approved owned/);
  const job=queued();
  assert.throws(()=>extendSocialPromotionJob(job,{
    ad:{...ad,ownerId:"another_user"},promoId:"renewal_123",expiresAt:job.expiresAt+1,now
  }),/Owner changed/);
});

test("finance activation creates server-controlled social job only inside payment approval transaction",()=>{
  const finance=readFileSync(new URL("../functions/index.js",import.meta.url),"utf8");
  const start=finance.indexOf("async function approvePromotion(");
  const end=finance.indexOf("async function approveSponsor(",start);
  assert.ok(start>=0&&end>start);
  const approval=finance.slice(start,end);
  assert.match(approval,/const socialRef = reference\("socialPromotionJobs", promo\.adId\)/);
  assert.match(approval,/const amount = numberInRange\(pack\.stars, 1, 100000/);
  assert.match(approval,/debitUser\(tx, userRef, balance, amount\)/);
  assert.match(approval,/tx\.create\(socialRef,createSocialPromotionJob/);
  assert.match(approval,/tx\.update\(socialRef,update\)/);
  assert.match(approval,/expiresFromPromotion\(ad,days,now\)/);
  assert.match(finance,/case "approvePromotion": return approvePromotion\(tx, id, actor, now\)/);
  assert.match(finance,/adminSnap\.data\(\)\.role !== "admin"/);
});

test("clients cannot mutate social publication jobs",()=>{
  const regular=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
  const staging=readFileSync(new URL("../firestore.staging.rules",import.meta.url),"utf8");
  for(const rules of [regular,staging])
    assert.match(rules,/match \/socialPromotionJobs\/\{id\} \{\s*allow read, write: if false;/);
  const cleanup=readFileSync(new URL("../functions/delete-ad.js",import.meta.url),"utf8");
  assert.match(cleanup,/tx\.update\(socialRef,\{status:"removal_requested",expiresAt:Date\.now\(\)/);
});
