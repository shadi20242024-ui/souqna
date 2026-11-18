"use strict";

const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {getStorage}=require("firebase-admin/storage");
const {extractOwnedImageObjects}=require("./ad-media");

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const RETRIABLE_CODES=new Set([408,429,500,502,503,504,"ETIMEDOUT","ECONNRESET","EAI_AGAIN"]);
function isRetriableStorageFailure(error){
  const status=Number(error?.code||error?.statusCode||error?.status);
  return RETRIABLE_CODES.has(status) || RETRIABLE_CODES.has(error?.code);
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

function makeDeleteAd(db,options){
  return onCall(options,async request=>{
    const project=process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT||process.env.FIREBASE_PROJECT_ID;
    if(project!=="souqna-staging")
      throw new HttpsError("failed-precondition","هذه العملية مخصصة لبيئة سوقنا التجريبية");
    const uid=request.auth?.uid;
    if(!uid)throw new HttpsError("unauthenticated","سجّل الدخول أولاً");
    const id=request.data?.id;
    if(typeof id!=="string"||!ID.test(id))
      throw new HttpsError("invalid-argument","معرّف الإعلان غير صالح");

    const ref=db.collection("ads").doc(id);
    let imageObjects=[];
    let ownerId="";
    await db.runTransaction(async tx=>{
      const [userSnap,adSnap]=await Promise.all([
        tx.get(db.collection("users").doc(uid)),
        tx.get(ref)
      ]);
      if(!userSnap.exists)throw new HttpsError("permission-denied","الحساب غير موجود");
      if(!adSnap.exists)throw new HttpsError("not-found","الإعلان غير موجود");
      const ad=adSnap.data();
      const admin=userSnap.data().role==="admin";
      if(!admin&&ad.ownerId!==uid)
        throw new HttpsError("permission-denied","لا تملك صلاحية حذف الإعلان");
      if(typeof ad.ownerId!=="string"||!ID.test(ad.ownerId))
        throw new HttpsError("failed-precondition","معرّف صاحب الإعلان غير صحيح");
      ownerId=ad.ownerId;
      imageObjects=extractOwnedImageObjects(ad.images,project,ownerId);
      tx.delete(ref);
    });

    // Clean up only after a successful Firestore commit. No arbitrary paths from callers.
    const storage=getStorage();
    const outcomes=await Promise.allSettled(imageObjects.map(({bucket,path})=>
      deleteImageWithRetry(storage,bucket,path)
    ));
    const failed=outcomes.filter(v=>v.status==="rejected").length;
    if(failed)console.warn("SOUQNA staging media cleanup incomplete",{adId:id,failed});
    return {ok:true,id,deletedImages:imageObjects.length-failed,failedImages:failed};
  });
}
module.exports=makeDeleteAd;
