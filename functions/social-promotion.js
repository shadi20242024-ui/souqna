"use strict";

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const PLATFORMS=["facebook","instagram"];
const MAX_TITLE=150;
const MAX_AREA=100;
const MAX_CATEGORY=60;
const MAX_EXPIRES=365*86400000;
const IMAGE_HOST="firebasestorage.googleapis.com";

function validId(value,label){
  if(typeof value!=="string"||!ID.test(value))
    throw new Error(label+" is invalid");
  return value;
}

function imageFromListing(ad){
  const images=Array.isArray(ad?.images)?ad.images:[];
  for(const raw of images){
    if(typeof raw!=="string"||raw.length>2048)continue;
    try{
      const url=new URL(raw);
      const match=url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
      if(!match||!ad?.ownerId)continue;
      const bucket=decodeURIComponent(match[1]);
      const filename=decodeURIComponent(match[2]);
      const owned=filename.startsWith("ads/"+ad.ownerId+"/")&&
        /^[A-Za-z0-9_-]{8,100}\.(jpg|jpeg)$/i.test(filename.slice(("ads/"+ad.ownerId+"/").length));
      if(url.protocol==="https:"&&url.hostname===IMAGE_HOST&&
         ["souqna-staging.firebasestorage.app","souqna-staging.appspot.com"].includes(bucket)&&
         url.searchParams.get("alt")==="media"&&!url.username&&!url.password&&owned)
        return url.href;
    }catch{}
  }
  return "";
}

function expiresFromPromotion(ad,days,now){
  if(!Number.isSafeInteger(now)||now<=0||
     !Number.isSafeInteger(days)||days<1||days>365)
    throw new Error("Invalid promotion duration");
  const previous=Number(ad?.featuredUntil||0);
  const base=Number.isFinite(previous)&&previous>now?previous:now;
  const until=base+days*86400000;
  if(!Number.isSafeInteger(until)||until<=now)
    throw new Error("Invalid promotion expiry");
  return until;
}

function createSocialPromotionJob({ad,adId,userId,promoId,expiresAt,now}){
  validId(adId,"adId");
  validId(userId,"userId");
  validId(promoId,"promoId");
  if(ad?.ownerId!==userId||ad?.status!=="approved")
    throw new Error("Only approved owned listings can be shared");
  if(!Number.isSafeInteger(expiresAt)||!Number.isSafeInteger(now)||expiresAt<=now)
    throw new Error("Social promotion must be active");
  const channels=Object.fromEntries(PLATFORMS.map(platform=>[
    platform,{status:"awaiting_connection",postId:"",publishedAt:0,removedAt:0}
  ]));
  return {
    adId,
    userId,
    latestPromotionId:promoId,
    title:String(ad.title||"").trim().slice(0,MAX_TITLE),
    area:String(ad.area||"").trim().slice(0,MAX_AREA),
    category:String(ad.cat||"").trim().slice(0,MAX_CATEGORY),
    price:typeof ad.price==="number"&&Number.isFinite(ad.price)?ad.price:0,
    currency:String(ad.cur||"").slice(0,10),
    imageUrl:imageFromListing(ad),
    startedAt:now,
    expiresAt,
    updatedAt:now,
    nextActionAt:now,
    status:"awaiting_connection",
    channels
  };
}

function extendSocialPromotionJob(existing,{ad,promoId,expiresAt,now}){
  if(!existing||typeof existing!=="object"||!ID.test(existing.adId))
    throw new Error("Invalid existing social promotion");
  if(existing.userId!==ad?.ownerId)
    throw new Error("Owner changed: refusing social promotion extension");
  validId(promoId,"promoId");
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=now)
    throw new Error("Social promotion expiry must be in the future");
  if(Number.isSafeInteger(existing.expiresAt)&&expiresAt<existing.expiresAt)
    throw new Error("Promotion extension cannot shorten the term");
  return {
    latestPromotionId:promoId,
    title:String(ad.title||"").trim().slice(0,MAX_TITLE),
    area:String(ad.area||"").trim().slice(0,MAX_AREA),
    category:String(ad.cat||"").trim().slice(0,MAX_CATEGORY),
    imageUrl:imageFromListing(ad)||String(existing.imageUrl||""),
    price:typeof ad.price==="number"&&Number.isFinite(ad.price)?ad.price:0,
    currency:String(ad.cur||"").slice(0,10),
    expiresAt,updatedAt:now,nextActionAt:now,
    status:existing.status==="removal_requested"?"active":existing.status
  };
}

function actionsForSocialPromotion(job,now,{facebook=false,instagram=false}={}){
  if(!job||!Number.isSafeInteger(now)||!Number.isSafeInteger(job.expiresAt))
    throw new Error("Social promotion expiry is invalid");
  const expired=now>=job.expiresAt||job.status==="removal_requested";
  return PLATFORMS.map(platform=>{
    const state=job.channels?.[platform]||{};
    const hasPost=typeof state.postId==="string"&&state.postId.length>0&&state.status!=="removed";
    if(["publishing","removing","review_required"].includes(state.status))return {
      platform,action:"none",reason:"awaiting_manual_review"
    };
    if(expired)return {
      platform,
      action:hasPost&&state.status!=="removed"?"remove":"none",
      reason:hasPost?"promotion_ended":"never_published"
    };
    if(hasPost)return {platform,action:"none",reason:"already_published"};
    if(!({facebook,instagram})[platform])
      return {platform,action:"none",reason:"not_connected"};
    if(platform==="instagram"&&!job.imageUrl)
      return {platform,action:"none",reason:"missing_public_image"};
    return {platform,action:"publish",reason:"active_verified_promotion"};
  });
}

module.exports={
  PLATFORMS,
  expiresFromPromotion,
  createSocialPromotionJob,
  extendSocialPromotionJob,
  actionsForSocialPromotion
};
