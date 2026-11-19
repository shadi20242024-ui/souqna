import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {createSocialPromotionJob,extendSocialPromotionJob}=require("../functions/social-promotion.js");
const {processSocialPromotionJob,processDueSocialPromotions,LEASE_MS}=
  require("../functions/social-queue-worker.js");
const {createMetaSocialClient,socialCaption}=require("../functions/meta-social-client.js");

const NOW=1795000000000;
const originalProject=process.env.GCLOUD_PROJECT;
const ad={
  ownerId:"social_owner",status:"approved",title:"سيارة للبيع",
  area:"السويداء",price:3500,cur:"USD",cat:"cars",
  images:["https://firebasestorage.googleapis.com/v0/b/souqna-staging.firebasestorage.app/o/ads%2Fsocial_owner%2Fphoto_image_12345.jpg?alt=media"]
};
function job(){
  return createSocialPromotionJob({
    ad,adId:"social_listing_1",userId:"social_owner",
    promoId:"social_order_1",now:NOW,expiresAt:NOW+3*86400000
  });
}

function harness(initial=job()){
  const documents=new Map([["social_listing_1",structuredClone(initial)]]);
  const db={
    collection(name){
      assert.equal(name,"socialPromotionJobs");
      return{
        doc(id){return{id}},
        where(key,op,limit){
          assert.equal(key,"nextActionAt");
          assert.equal(op,"<=");
          return{
            orderBy(field,direction){
              assert.equal(field,"nextActionAt");
              assert.equal(direction,"asc");
              return{
                limit(max){return{
                  async get(){
                    const docs=[...documents.entries()]
                      .filter(([,data])=>data.nextActionAt<=limit)
                      .sort((a,b)=>a[1].nextActionAt-b[1].nextActionAt)
                      .slice(0,max)
                      .map(([id])=>({id}));
                    return{docs};
                  }
                };}
              };
            }
          };
        }
      };
    },
    async runTransaction(callback){
      const pending=[];
      const tx={
        async get(ref){
          const value=documents.get(ref.id);
          return{exists:!!value,data:()=>structuredClone(value)};
        },
        update(ref,delta){pending.push({id:ref.id,delta});}
      };
      const output=await callback(tx);
      for(const {id,delta} of pending)
        documents.set(id,{...documents.get(id),...structuredClone(delta)});
      return output;
    }
  };
  return{db,documents,peek:()=>documents.get("social_listing_1")};
}
function mockMeta({facebook=true,instagram=true,publishFailure="",removeFailure=""}={}){
  const calls=[];
  return{
    calls,
    isConnected(platform){return({facebook,instagram})[platform];},
    async publish(platform){
      calls.push({type:"publish",platform});
      if(platform===publishFailure)throw Error("Ambiguous Meta response");
      return{postId:platform==="facebook"?"111_222":"17912345678901234"};
    },
    async remove(platform,postId){
      calls.push({type:"remove",platform,postId});
      if(platform===removeFailure)throw Error("Permission denied");
      return{removed:true};
    }
  };
}
async function onStaging(callback){
  const previous=process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT="souqna-staging";
  try{return await callback();}
  finally{
    if(previous===undefined)delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT=previous;
  }
}

test("unconnected official profiles cannot publish anything",async()=>{
  await onStaging(async()=>{
    const h=harness(),meta=mockMeta({facebook:false,instagram:false});
    const result=await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    assert.equal(result.action,"none");
    assert.equal(meta.calls.length,0);
    assert.equal(h.peek().nextActionAt>NOW,true);
  });
});

test("connected pages publish once each, expire and remove both real post IDs",async()=>{
  await onStaging(async()=>{
    const h=harness(),meta=mockMeta();
    const a=await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    assert.equal(a.platform,"facebook");
    assert.equal(a.result,"confirmed");
    const b=await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    assert.equal(b.platform,"instagram");
    assert.equal(b.result,"confirmed");
    assert.equal(h.peek().channels.facebook.postId,"111_222");
    assert.equal(h.peek().channels.instagram.postId,"17912345678901234");
    const repeated=await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    assert.equal(repeated.action,"none");
    const expiration=h.peek().expiresAt;
    await processSocialPromotionJob(h.db,"social_listing_1",meta,expiration);
    await processSocialPromotionJob(h.db,"social_listing_1",meta,expiration);
    assert.deepEqual(meta.calls.map(x=>x.type+" "+x.platform),[
      "publish facebook","publish instagram","remove facebook","remove instagram"
    ]);
    assert.equal(h.peek().channels.facebook.status,"removed");
    assert.equal(h.peek().channels.instagram.status,"removed");
    assert.equal(h.peek().status,"completed");
    assert.equal(h.peek().nextActionAt,Number.MAX_SAFE_INTEGER);
  });
});

test("premium renewal after publishing protects previous posts from the old expiry",async()=>{
  await onStaging(async()=>{
    const h=harness(),meta=mockMeta();
    await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    const oldExpiry=h.peek().expiresAt;
    const update=extendSocialPromotionJob(h.peek(),{
      ad,promoId:"renewed_order_2",expiresAt:oldExpiry+86400000,now:NOW+100
    });
    h.documents.set("social_listing_1",{...h.peek(),...update});
    await processSocialPromotionJob(h.db,"social_listing_1",meta,oldExpiry);
    assert.equal(meta.calls.filter(c=>c.type==="remove").length,0);
    assert.equal(meta.calls.filter(c=>c.type==="publish").length,2);
  });
});

test("an uncertain publish is marked for review, not blindly republished",async()=>{
  await onStaging(async()=>{
    const h=harness(),meta=mockMeta({instagram:false,publishFailure:"facebook"});
    const first=await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    assert.equal(first.result,"review_required");
    assert.equal(h.peek().channels.facebook.status,"review_required");
    const second=await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW+60*60*1000);
    assert.equal(second.action,"none");
    assert.equal(meta.calls.filter(c=>c.type==="publish").length,1);
  });
});

test("permission-denied removal is not represented as a successful deletion",async()=>{
  await onStaging(async()=>{
    const h=harness(),meta=mockMeta({instagram:false,removeFailure:"facebook"});
    await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    const out=await processSocialPromotionJob(h.db,"social_listing_1",meta,h.peek().expiresAt);
    assert.equal(out.result,"review_required");
    assert.equal(h.peek().channels.facebook.status,"review_required");
    assert.equal(h.peek().channels.facebook.postId,"111_222");
    assert.equal(h.peek().status,"removal_requested");
  });
});

test("stale in-flight publishes become manual-review tasks without double posting",async()=>{
  await onStaging(async()=>{
    const h=harness();
    h.documents.get("social_listing_1").channels.facebook={
      status:"publishing",postId:"",claimId:"old",leaseUntil:NOW-LEASE_MS
    };
    const meta=mockMeta({instagram:false});
    await processSocialPromotionJob(h.db,"social_listing_1",meta,NOW);
    assert.equal(h.peek().channels.facebook.status,"review_required");
    assert.equal(meta.calls.length,0);
  });
});

test("batch processor handles due jobs without touching non-due records",async()=>{
  await onStaging(async()=>{
    const h=harness(),meta=mockMeta({instagram:false});
    const run=await processDueSocialPromotions(h.db,meta,{now:NOW});
    assert.equal(run.processed,1);
    assert.equal(run.results[0].platform,"facebook");
    const later=await processDueSocialPromotions(h.db,meta,{now:NOW+1});
    assert.equal(later.processed,0);
  });
});

test("workers reject production Firebase projects",async()=>{
  process.env.GCLOUD_PROJECT="souqna-sweida";
  try{
    const h=harness();
    await assert.rejects(processSocialPromotionJob(h.db,"social_listing_1",mockMeta(),NOW),/restricted/);
  }finally{
    if(originalProject===undefined)delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT=originalProject;
  }
});

test("unconnected Meta client makes no requests and never accepts credentials alone as activation",async()=>{
  let requests=0;
  const client=createMetaSocialClient({
    pageId:"123456",pageAccessToken:"12345678901234567890",
    instagramUserId:"789012",instagramAccessToken:"ABCDEFGHIJABCDEFGHIJ",
    fetchImpl:async()=>{requests++;throw Error("network must not be called");}
  });
  assert.equal(client.isConnected("facebook"),false);
  assert.equal(client.isConnected("instagram"),false);
  await assert.rejects(client.publish("facebook",job()),/not connected/);
  assert.equal(requests,0);
});

test("Meta adapter uses HTTPS with bearer tokens and saves concrete Facebook and Instagram post IDs",async()=>{
  const calls=[];
  const fakeFetch=async(url,options)=>{
    calls.push({url,options});
    const path=new URL(url).pathname;
    let body;
    if(path.endsWith("/photos"))body={post_id:"123456_789012"};
    else if(path.endsWith("/media"))body={id:"34567890"};
    else if(path.endsWith("/media_publish"))body={id:"4567890123"};
    else body={success:true};
    return{ok:true,status:200,async json(){return body;}};
  };
  const client=createMetaSocialClient({
    enabled:true,pageId:"123456",pageAccessToken:"F".repeat(30),
    instagramUserId:"789012",instagramAccessToken:"I".repeat(30),
    fetchImpl:fakeFetch
  });
  const social=job();
  const fb=await client.publish("facebook",social);
  const ig=await client.publish("instagram",social);
  assert.equal(fb.postId,"123456_789012");
  assert.equal(ig.postId,"4567890123");
  assert.deepEqual(await client.remove("facebook",fb.postId),{removed:true});
  assert.deepEqual(await client.remove("instagram",ig.postId),{removed:true});
  assert.deepEqual(calls.map(c=>c.options.method),["POST","POST","POST","DELETE","DELETE"]);
  for(const call of calls){
    assert.ok(call.url.startsWith("https://graph.facebook.com/v27.0/"));
    assert.ok(!call.url.includes("access_token"));
    assert.ok(call.options.headers.Authorization.startsWith("Bearer "));
  }
  assert.ok(!socialCaption({...social,title:"\nإعلان مميز",phone:"999999999"}).includes("999999999"));
});

test("Meta rejects publishing without a confirmed ID and does not report failed deletion as success",async()=>{
  const client=createMetaSocialClient({
    enabled:true,pageId:"123456",pageAccessToken:"F".repeat(30),
    instagramUserId:"789012",instagramAccessToken:"I".repeat(30),
    fetchImpl:async()=>({
      ok:false,status:403,async json(){return{error:{code:200,message:"Forbidden"}};}
    })
  });
  await assert.rejects(client.publish("facebook",job()),/denied/);
  await assert.rejects(client.remove("facebook","123456_789012"),/denied/);
});
