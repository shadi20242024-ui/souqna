"use strict";

const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {getStorage}=require("firebase-admin/storage");
const {extractOwnedImagePaths}=require("./ad-media");

const ID=/^[A-Za-z0-9_-]{1,128}$/;

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
    let imagePaths=[];
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
      imagePaths=extractOwnedImagePaths(ad.images,project,ownerId);
      tx.delete(ref);
    });

    // Clean up only after a successful Firestore commit. No arbitrary paths from callers.
    const bucket=getStorage().bucket(project+".firebasestorage.app");
    const outcomes=await Promise.allSettled(imagePaths.map(path=>
      bucket.file(path).delete({ignoreNotFound:true})
    ));
    const failed=outcomes.filter(v=>v.status==="rejected").length;
    if(failed)console.warn("SOUQNA staging media cleanup incomplete",{adId:id,failed});
    return {ok:true,id,deletedImages:imagePaths.length-failed,failedImages:failed};
  });
}
module.exports=makeDeleteAd;
