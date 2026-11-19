"use strict";

const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {getStorage}=require("firebase-admin/storage");
const {extractOwnedImageObjects}=require("./ad-media");

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const RETRIABLE_CODES=new Set([408,429,500,502,503,504,"ETIMEDOUT","ECONNRESET","EAI_AGAIN"]);
const STAGING="souqna-staging";
const MAX_IMAGES=11;

function activeProject(){
  const project=process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT||process.env.FIREBASE_PROJECT_ID;
  if(project!==STAGING)throw new HttpsError("failed-precondition","هذه العملية مخصصة لبيئة سوقنا التجريبية");
  return project;
}
function authorizedUid(request){
  const uid=request.auth?.uid;
  if(typeof uid!=="string"||!ID.test(uid))
    throw new HttpsError("unauthenticated","سجّل الدخول أولاً");
  return uid;
}
function requestedId(request){
  const id=request.data?.id;
  if(typeof id!=="string"||!ID.test(id))
    throw new HttpsError("invalid-argument","معرّف الإعلان غير صالح");
  return id;
}
function isRetriableStorageFailure(error){
  const status=Number(error?.code||error?.statusCode||error?.status);
  return RETRIABLE_CODES.has(status)||RETRIABLE_CODES.has(error?.code);
}
async function deleteImageWithRetry(storage,bucket,path,maxAttempts=3){
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      await storage.bucket(bucket).file(path).delete({ignoreNotFound:true});
      return;
    }catch(error){
      if(attempt===maxAttempts||!isRetriableStorageFailure(error))throw error;
      await new Promise(resolve=>setTimeout(resolve,Math.min(250*2**(attempt-1),1000)));
    }
  }
}
function safeCleanupObjects(raw,ownerId){
  if(typeof ownerId!=="string"||!ID.test(ownerId)||!Array.isArray(raw)||raw.length>MAX_IMAGES)
    throw new HttpsError("failed-precondition","بيانات تنظيف الصور غير صالحة");
  const allowed=new Set([STAGING+".firebasestorage.app",STAGING+".appspot.com"]);
  const prefix="ads/"+ownerId+"/";
  const seen=new Set();
  return raw.map(item=>{
    if(!item||typeof item!=="object"||!allowed.has(item.bucket)||
       typeof item.path!=="string"||!item.path.startsWith(prefix)||
       !/^[A-Za-z0-9_-]{8,100}\.(jpg|jpeg|png|webp)$/.test(item.path.slice(prefix.length)))
      throw new HttpsError("failed-precondition","مسار صورة غير مصرح به");
    const key=item.bucket+"/"+item.path;
    if(seen.has(key))throw new HttpsError("failed-precondition","مسار صورة مكرر");
    seen.add(key);
    return {bucket:item.bucket,path:item.path};
  });
}
async function cleanJob(db,id,ownerId,objects){
  const imageObjects=safeCleanupObjects(objects,ownerId);
  let outcomes=[];
  if(imageObjects.length){
    try{
      const storage=getStorage();
      outcomes=await Promise.allSettled(imageObjects.map(({bucket,path})=>
        deleteImageWithRetry(storage,bucket,path)
      ));
    }catch(error){
      console.error("SOUQNA staging Storage initialization failed",{adId:id,error});
      outcomes=imageObjects.map(()=>({status:"rejected",reason:error}));
    }
  }
  const failedObjects=imageObjects.filter((_,index)=>outcomes[index]?.status==="rejected");
  const job=db.collection("mediaCleanupJobs").doc(id);
  try{
    if(failedObjects.length){
      await job.update({objects:failedObjects,updatedAt:Date.now(),failedImages:failedObjects.length});
    }else if(imageObjects.length){
      await job.delete();
    }
  }catch(error){
    console.error("SOUQNA cleanup progress persistence failed",{adId:id,error});
  }
  if(failedObjects.length)
    console.warn("SOUQNA staging media cleanup incomplete",{adId:id,failed:failedObjects.length});
  return {
    ok:true,
    id,
    deletedImages:imageObjects.length-failedObjects.length,
    failedImages:failedObjects.length,
    recoveryPending:failedObjects.length>0
  };
}

function makeDeleteAd(db,options){
  return onCall(options,async request=>{
    const project=activeProject();
    const uid=authorizedUid(request);
    const id=requestedId(request);
    const ref=db.collection("ads").doc(id);
    const cleanupRef=db.collection("mediaCleanupJobs").doc(id);
    const socialRef=db.collection("socialPromotionJobs").doc(id);
    let ownerId="";
    let imageObjects=[];
    await db.runTransaction(async tx=>{
      const [userSnap,adSnap,cleanupSnap,socialSnap]=await Promise.all([
        tx.get(db.collection("users").doc(uid)),
        tx.get(ref),
        tx.get(cleanupRef),
        tx.get(socialRef)
      ]);
      if(!userSnap.exists)throw new HttpsError("permission-denied","الحساب غير موجود");
      const isAdmin=userSnap.data().role==="admin";
      if(!adSnap.exists){
        if(!cleanupSnap.exists)throw new HttpsError("not-found","الإعلان غير موجود");
        const existingJob=cleanupSnap.data();
        if(typeof existingJob.ownerId!=="string"||!ID.test(existingJob.ownerId))
          throw new HttpsError("failed-precondition","صاحب مهمة التنظيف غير صالح");
        if(!isAdmin&&existingJob.ownerId!==uid)
          throw new HttpsError("permission-denied","لا تملك صلاحية متابعة تنظيف الإعلان");
        ownerId=existingJob.ownerId;
        imageObjects=safeCleanupObjects(existingJob.objects,ownerId);
        return;
      }
      const ad=adSnap.data();
      if(!isAdmin&&ad.ownerId!==uid)
        throw new HttpsError("permission-denied","لا تملك صلاحية حذف الإعلان");
      if(typeof ad.ownerId!=="string"||!ID.test(ad.ownerId))
        throw new HttpsError("failed-precondition","معرّف صاحب الإعلان غير صحيح");
      if(cleanupSnap.exists)
        throw new HttpsError("failed-precondition","توجد مهمة تنظيف سابقة لهذا الإعلان");
      ownerId=ad.ownerId;
      imageObjects=extractOwnedImageObjects(ad.images,project,ownerId);
      if(imageObjects.length){
        tx.create(cleanupRef,{
          ownerId,objects:imageObjects,status:"pending",createdAt:Date.now(),
          failedImages:0
        });
      }
      if(socialSnap.exists){
        tx.update(socialRef,{status:"removal_requested",expiresAt:Date.now(),updatedAt:Date.now()});
      }
      tx.delete(ref);
    });
    return cleanJob(db,id,ownerId,imageObjects);
  });
}
function makeRetryCleanup(db,options){
  return onCall(options,async request=>{
    activeProject();
    const uid=authorizedUid(request);
    const id=requestedId(request);
    const [userSnap,jobSnap]=await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("mediaCleanupJobs").doc(id).get()
    ]);
    if(!userSnap.exists)throw new HttpsError("permission-denied","الحساب غير موجود");
    if(!jobSnap.exists)throw new HttpsError("not-found","لا يوجد سجل تنظيف معلّق");
    const data=jobSnap.data();
    if(userSnap.data().role!=="admin"&&data.ownerId!==uid)
      throw new HttpsError("permission-denied","لا تملك صلاحية متابعة تنظيف الإعلان");
    return cleanJob(db,id,data.ownerId,data.objects);
  });
}
function makeListCleanupJobs(db,options){
  return onCall(options,async request=>{
    activeProject();
    const uid=authorizedUid(request);
    const userSnap=await db.collection("users").doc(uid).get();
    if(!userSnap.exists||userSnap.data()?.role!=="admin")
      throw new HttpsError("permission-denied","عرض مهام تنظيف الصور متاح للمدير فقط");
    try{
      const query=await db.collection("mediaCleanupJobs")
        .orderBy("createdAt","desc").limit(25).get();
      return {
        ok:true,
        jobs:query.docs.map(snapshot=>{
          const data=snapshot.data();
          return {
            id:snapshot.id,
            failedImages:Array.isArray(data?.objects)?Math.min(data.objects.length,MAX_IMAGES):0,
            createdAt:Number.isSafeInteger(data?.createdAt)?data.createdAt:0
          };
        }).filter(item=>ID.test(item.id))
      };
    }catch(error){
      console.error("SOUQNA cleanup queue query failed",{adminUid:uid,error});
      throw new HttpsError("internal","تعذّر تحميل مهام تنظيف الصور");
    }
  });
}
module.exports=makeDeleteAd;
module.exports.makeRetryCleanup=makeRetryCleanup;
module.exports.makeListCleanupJobs=makeListCleanupJobs;
