"use strict";

const {processSocialPromotionJob,processDueSocialPromotions}=require("./social-queue-worker");

function makeSocialAutomationTriggers({
  db,
  metaClientFactory,
  onDocumentWritten,
  onSchedule,
  enabled=false
}={}){
  if(enabled!==true)return Object.freeze({});
  if(!db||typeof metaClientFactory!=="function"||
     typeof onDocumentWritten!=="function"||typeof onSchedule!=="function")
    throw new Error("Missing explicit social automation dependencies");
  const eventHandler=onDocumentWritten({
    document:"socialPromotionJobs/{adId}",
    region:"us-central1",
    retry:false
  },async event=>{
    if(!event.data?.after?.exists)return;
    const id=event.params?.adId;
    if(typeof id!=="string")return;
    await processSocialPromotionJob(db,id,metaClientFactory(),Date.now());
  });
  const expiryHandler=onSchedule({
    schedule:"every 5 minutes",
    timeZone:"UTC",
    region:"us-central1",
    maxInstances:1,
    retryCount:0
  },async()=>{
    return processDueSocialPromotions(db,metaClientFactory(),{
      now:Date.now(),
      limit:10
    });
  });
  return Object.freeze({
    souqnaSocialOnPromotion:eventHandler,
    souqnaSocialExpiryReconciler:expiryHandler
  });
}

module.exports={makeSocialAutomationTriggers};
