"use strict";

const {randomUUID}=require("node:crypto");
const {actionsForSocialPromotion,PLATFORMS}=require("./social-promotion");

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const STAGING="souqna-staging";
const LEASE_MS=5*60*1000;
const RECHECK_MS=60*60*1000;
const DONE_AT=Number.MAX_SAFE_INTEGER;

function requireStaging(){
  if((process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT||process.env.FIREBASE_PROJECT_ID)!==STAGING)
    throw new Error("Social queue is restricted to SOUQNA staging");
}

function safeId(id){
  if(typeof id!=="string"||!ID.test(id))throw new Error("Invalid social job ID");
  return id;
}

function channelIsPublished(state){
  return typeof state?.postId==="string"&&state.postId.length>0&&state.status!=="removed";
}

function connectedNetworks(meta){
  if(!meta||typeof meta.isConnected!=="function"||
     typeof meta.publish!=="function"||typeof meta.remove!=="function")
    throw new Error("Social adapter is unavailable");
  return Object.fromEntries(PLATFORMS.map(p=>[p,meta.isConnected(p)===true]));
}

function nextDue(job,now,connected){
  const ended=now>=job.expiresAt||job.status==="removal_requested";
  const channels=job.channels||{};
  const manual=PLATFORMS.some(p=>channels[p]?.status==="review_required");
  const hasRemote=PLATFORMS.some(p=>channelIsPublished(channels[p]));
  if(ended&&!hasRemote)return {
    nextActionAt:DONE_AT,
    status:manual?"needs_review":"completed"
  };
  const actions=actionsForSocialPromotion(job,now,connected);
  const anyAction=actions.some(a=>
    a.action!=="none"&&connected[a.platform]===true
  );
  const busy=PLATFORMS.map(p=>channels[p]).filter(c=>
    ["publishing","removing"].includes(c?.status)&&Number.isSafeInteger(c.leaseUntil)&&c.leaseUntil>now
  );
  const due=anyAction?now:busy.length?
    Math.min(...busy.map(c=>c.leaseUntil)):
    ended?now+RECHECK_MS:
    Math.min(job.expiresAt,now+RECHECK_MS);
  return {nextActionAt:due,status:ended?"removal_requested":"active"};
}

async function processSocialPromotionJob(db,jobId,meta,now=Date.now()){
  requireStaging();
  safeId(jobId);
  if(!Number.isSafeInteger(now)||now<=0)throw new Error("Invalid clock");
  const connections=connectedNetworks(meta);
  const ref=db.collection("socialPromotionJobs").doc(jobId);
  const claimId=randomUUID();
  let work=null;
  let skipped="not_due";
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists){skipped="missing";return;}
    const job=snapshot.data();
    if(!Number.isSafeInteger(job?.expiresAt)){skipped="invalid_job";return;}
    if(typeof job.nextActionAt==="number"&&job.nextActionAt>now)return;
    const channels={...(job.channels||{})};
    let changed=false;
    for(const p of PLATFORMS){
      const state=channels[p]||{};
      if(["publishing","removing"].includes(state.status)&&
         Number(state.leaseUntil||0)<=now){
        channels[p]={...state,status:"review_required",lastError:"Uncertain previous Meta operation"};
        changed=true;
      }
    }
    const current={...job,channels};
    const planned=actionsForSocialPromotion(current,now,connections)
      .find(a=>a.action!=="none"&&connections[a.platform]===true);
    if(!planned){
      const schedule=nextDue(current,now,connections);
      tx.update(ref,{
        ...schedule,
        ...(changed?{channels}:{}),
        updatedAt:now
      });
      skipped=schedule.status==="completed"?"completed":schedule.status==="needs_review"?
        "review_required":"not_connected_or_not_due";
      return;
    }
    const platform=planned.platform;
    const original=channels[platform]||{};
    channels[platform]={
      ...original,
      status:planned.action==="publish"?"publishing":"removing",
      claimId,
      claimAt:now,
      leaseUntil:now+LEASE_MS,
      lastError:""
    };
    tx.update(ref,{
      channels,
      nextActionAt:now+LEASE_MS,
      status:current.status==="removal_requested"?"removal_requested":"processing",
      updatedAt:now
    });
    work={platform,action:planned.action,job:current,postId:original.postId||""};
  });

  if(!work)return {ok:true,jobId,action:"none",reason:skipped};
  let remote;
  let failure=null;
  try{
    if(work.action==="publish"){
      remote=await meta.publish(work.platform,work.job);
      if(typeof remote?.postId!=="string"||!remote.postId)
        throw new Error("Meta publishing response did not include a post ID");
    }else{
      remote=await meta.remove(work.platform,work.postId);
      if(remote?.removed!==true)throw new Error("Meta did not confirm removal");
    }
  }catch(error){
    failure=error;
  }

  let recorded=false;
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists)return;
    const current=snapshot.data();
    const channels={...(current.channels||{})};
    const state=channels[work.platform]||{};
    if(state.claimId!==claimId)return;
    const value={...state};
    delete value.claimId;
    delete value.claimAt;
    delete value.leaseUntil;
    if(failure){
      value.status="review_required";
      value.lastError=failure.code==="meta_api_error"?
        "Meta rejected the operation; check permissions and account settings":
        "Meta response is uncertain; review the official page before retrying";
    }else if(work.action==="publish"){
      value.status="published";
      value.postId=remote.postId;
      value.publishedAt=now;
      value.lastError="";
    }else{
      value.status="removed";
      value.postId="";
      value.removedAt=now;
      value.lastError="";
    }
    channels[work.platform]=value;
    const nextJob={...current,channels};
    const schedule=nextDue(nextJob,now,connections);
    tx.update(ref,{channels,...schedule,updatedAt:now});
    recorded=true;
  });

  return {
    ok:recorded&&!failure,
    jobId,
    platform:work.platform,
    action:work.action,
    result:!recorded?"unconfirmed_state":failure?"review_required":"confirmed"
  };
}

async function processDueSocialPromotions(db,meta,{now=Date.now(),limit=10}={}){
  requireStaging();
  connectedNetworks(meta);
  if(!Number.isSafeInteger(now)||now<=0)throw new Error("Invalid clock");
  if(!Number.isSafeInteger(limit)||limit<1||limit>25)throw new Error("Invalid queue batch size");
  const snapshots=await db.collection("socialPromotionJobs")
    .where("nextActionAt","<=",now)
    .orderBy("nextActionAt","asc")
    .limit(limit).get();
  const results=[];
  for(const doc of snapshots.docs){
    try{
      results.push(await processSocialPromotionJob(db,doc.id,meta,now));
    }catch(error){
      results.push({ok:false,jobId:doc.id,action:"error",reason:String(error?.message||"error").slice(0,140)});
    }
  }
  return {processed:results.length,results};
}

module.exports={processSocialPromotionJob,processDueSocialPromotions,LEASE_MS};
