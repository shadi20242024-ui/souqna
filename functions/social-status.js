"use strict";

const {onCall,HttpsError}=require("firebase-functions/v2/https");
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const STAGING="souqna-staging";
const STATE=new Set([
  "awaiting_connection","active","processing","published",
  "publishing","removing","removed","review_required",
  "removal_requested","needs_review","completed"
]);

function statusOnly(value){
  return STATE.has(value)?value:"unknown";
}

function makeSocialQueueStatus(db,options){
  return onCall(options,async request=>{
    const project=process.env.GCLOUD_PROJECT||
      process.env.GCP_PROJECT||process.env.FIREBASE_PROJECT_ID;
    if(project!==STAGING)
      throw new HttpsError("failed-precondition","هذه الخدمة مخصصة لبيئة سوقنا التجريبية");
    const uid=request.auth?.uid;
    if(typeof uid!=="string"||!ID.test(uid))
      throw new HttpsError("unauthenticated","سجّل الدخول أولاً");
    const user=await db.collection("users").doc(uid).get();
    if(!user.exists||user.data()?.role!=="admin")
      throw new HttpsError("permission-denied","عرض حالة النشر الاجتماعي مخصص للمدير");
    try{
      const recent=await db.collection("socialPromotionJobs")
        .orderBy("updatedAt","desc").limit(25).get();
      return{
        ok:true,
        integration:"not_connected",
        jobs:recent.docs.filter(doc=>ID.test(doc.id)).map(doc=>{
          const job=doc.data();
          const fb=job.channels?.facebook||{};
          const ig=job.channels?.instagram||{};
          return{
            id:doc.id,
            title:String(job.title||"").slice(0,150),
            expiresAt:Number.isSafeInteger(job.expiresAt)?job.expiresAt:0,
            status:statusOnly(job.status),
            facebook:statusOnly(fb.status),
            instagram:statusOnly(ig.status),
            requiresReview:["review_required"].includes(fb.status)||
              ["review_required"].includes(ig.status)||
              job.status==="needs_review"
          };
        })
      };
    }catch(error){
      console.error("SOUQNA staging social queue read failed",{uid,error});
      throw new HttpsError("internal","تعذّر تحميل حالة النشر الاجتماعي");
    }
  });
}

module.exports={makeSocialQueueStatus};
