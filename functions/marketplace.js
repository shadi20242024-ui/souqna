"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");

const ID_RE=/^[A-Za-z0-9_-]{1,128}$/;
const PHONE_RE=/^[0-9]{9,15}$/;
const IMAGE_RE=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const HASH_RE=/^[0-9a-f]{64}$/;
const VIDEO_HOSTS=new Set(["youtube.com","www.youtube.com","m.youtube.com","youtube-nocookie.com","www.youtube-nocookie.com","youtu.be","www.youtu.be","vimeo.com"]);
const DAY=86400000;

function reject(message,code="invalid-argument"){
  throw new HttpsError(code,message);
}
function text(value,min,max,label) {
  if(typeof value!=="string" || value.length<min || value.length>max)reject(label+" غير صالح");
  return value.trim();
}
function phone(value){
  if(typeof value!=="string"||!PHONE_RE.test(value))reject("رقم الهاتف غير صالح");
  return value;
}
function media(value,label){
  if(typeof value!=="string"||value.length>700000||!(value===""||IMAGE_RE.test(value))){
    reject("صورة "+label+" ليست بصيغة مدعومة أو حجمها كبير");
  }
  return value;
}
function safeVideoUrl(value){
  if(typeof value!=="string"||value.length>400)reject("رابط الفيديو غير صالح");
  if(!value)return "";
  let url;
  try{url=new URL(value);}catch{reject("رابط الفيديو غير صالح");}
  if(url.protocol!=="https:"||url.username||url.password||url.port||!VIDEO_HOSTS.has(url.hostname.toLowerCase())){
    reject("رابط الفيديو يجب أن يكون YouTube أو Vimeo آمنًا");
  }
  const host=url.hostname.toLowerCase();
  const path=url.pathname;
  if(host==="vimeo.com"&&!/^\\/[0-9]{5,12}$/.test(path))reject("رابط Vimeo غير صالح");
  if((host==="youtu.be"||host==="www.youtu.be")&&!/^\\/[A-Za-z0-9_-]{11}$/.test(path))reject("رابط YouTube غير صالح");
  if(!["vimeo.com","youtu.be","www.youtu.be"].includes(host) &&
    !(/^\\/(?:shorts\\/[A-Za-z0-9_-]{11}|embed\\/[A-Za-z0-9_-]{11})$/.test(path)||
      (path==="/watch"&&/^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v")||""))))reject("رابط YouTube غير صالح");
  return url.toString();
}
function galleryMedia(first,more){
  if(!Array.isArray(more)||more.length>3)reject("عدد الصور الإضافية لا يتجاوز ثلاثة");
  if(!first&&more.length)reject("اختر صورة رئيسية أولاً");
  const extra=more.map((item,i)=>media(item,"الإضافية "+(i+1)));
  if(first.length+extra.reduce((sum,img)=>sum+img.length,0)>750000){
    reject("إجمالي صور الإعلان كبير جداً، جرّب تقليل عدد الصور أو جودتها");
  }
  return extra;
}
function allowedShape(raw,fields,required){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))reject("بيانات الطلب غير صالحة");
  for(const key of Object.keys(raw))if(!fields.includes(key))reject("حقل غير مصرح به: "+key);
  for(const key of required)if(!(key in raw))reject("الحقل مطلوب: "+key);
}
function storeFields(raw){
  allowedShape(raw,["name","desc","phone","area","map","logo","cover"],
    ["name","desc","phone","area","map","logo","cover"]);
  const map=text(raw.map,0,1200,"رابط الخريطة");
  if(map && !/^https:\/\//.test(map))reject("رابط الخريطة يجب أن يبدأ بـ https://");
  return {
    name:text(raw.name,2,120,"اسم المتجر"),
    desc:text(raw.desc,0,3000,"الوصف"),
    phone:phone(raw.phone),
    area:text(raw.area,1,100,"المنطقة"),
    map,logo:media(raw.logo,"الشعار"),cover:media(raw.cover,"الغلاف")
  };
}
function adFields(raw){
  const keys=["title","price","cur","cat","area","desc","phone","img","images","videoUrl","imgHash","storeId"];
  allowedShape(raw,keys,["title","price","cur","cat","area","desc","phone","img"]);
  if(typeof raw.price!=="number"||!Number.isFinite(raw.price)||raw.price<0||raw.price>1000000000000){
    reject("سعر الإعلان غير صالح");
  }
  if(!["$","ل.س"].includes(raw.cur))reject("عملة الإعلان غير مدعومة");
  const data={
    title:text(raw.title,3,150,"عنوان الإعلان"),
    price:raw.price,
    cur:raw.cur,
    cat:text(raw.cat,2,60,"التصنيف"),
    area:text(raw.area,1,100,"المنطقة"),
    desc:text(raw.desc,0,5000,"الوصف"),
    phone:phone(raw.phone),
    img:media(raw.img,"الإعلان")
  };
  data.images=galleryMedia(data.img,raw.images??[]);
  data.videoUrl=safeVideoUrl(raw.videoUrl??"");
  if("imgHash" in raw){
    if(typeof raw.imgHash!=="string"||!HASH_RE.test(raw.imgHash))reject("معرف الصورة غير صالح");
    data.imgHash=raw.imgHash;
  }
  if("storeId" in raw){
    if(typeof raw.storeId!=="string"||!ID_RE.test(raw.storeId))reject("معرف المتجر غير صالح");
    data.storeId=raw.storeId;
  }
  return data;
}
function requestId(value){
  if(typeof value!=="string"||!ID_RE.test(value))reject("معرف العملية غير صالح");
  return value;
}
function validPositiveInt(value,otherwise,max){
  return Number.isSafeInteger(value)&&value>0&&value<=max?value:otherwise;
}
function storePlanLimit(plan,defaultValue){
  if(!plan||plan.active===false)return defaultValue;
  const max=plan.maxAds;
  return Number.isSafeInteger(max)&&max>=0&&max<=10000?max:defaultValue;
}

module.exports=function makeMarketplace(db,options){
  return onCall(options,async request=>{
    if(!request.auth?.uid)reject("سجل الدخول أولاً","unauthenticated");
    const uid=request.auth.uid;
    const action=request.data?.action;
    if(!["createStore","createAd"].includes(action))reject("عملية غير مدعومة");
    const id=requestId(request.data?.id);
    const raw=request.data?.fields;
    const fields=action==="createStore"?storeFields(raw):adFields(raw);
    const now=Date.now();
    const result=await db.runTransaction(async tx=>{
      const userRef=db.collection("users").doc(uid);
      const targetRef=db.collection(action==="createStore"?"stores":"ads").doc(id);
      const [userSnap,existing]=await Promise.all([tx.get(userRef),tx.get(targetRef)]);
      if(!userSnap.exists)reject("حساب المستخدم غير موجود","failed-precondition");
      if(existing.exists)reject("تم إرسال الطلب سابقاً","already-exists");
      const ownerName=text(String(userSnap.data().name||""),1,100,"اسم الحساب");
      if(action==="createStore"){
        const [siteSnap,items]=await Promise.all([
          tx.get(db.collection("settings").doc("site")),
          tx.get(db.collection("stores").where("ownerId","==",uid))
        ]);
        const maxStores=validPositiveInt(siteSnap.exists?siteSnap.data().maxStores:null,3,50);
        if(items.size>=maxStores)reject("وصلت إلى الحد الأقصى للمتاجر ("+maxStores+")","resource-exhausted");
        // Read/write a shared owner doc so concurrent creations serialize.
        tx.update(userRef,{storeQuotaRevision:FieldValue.increment(1)});
        tx.create(targetRef,{
          ...fields,ownerId:uid,ownerName,status:"pending",createdAt:now
        });
      }else{
        let lockedRef=userRef;
        if(fields.storeId){
          const storeRef=db.collection("stores").doc(fields.storeId);
          const storeSnap=await tx.get(storeRef);
          if(!storeSnap.exists||storeSnap.data().ownerId!==uid||storeSnap.data().status!=="approved"){
            reject("المتجر غير منشور أو لا يتبع لحسابك","permission-denied");
          }
          const store=storeSnap.data();
          let plan=null;
          if(store.plan && Number(store.planUntil||0)>now){
            const planSnap=await tx.get(db.collection("plans").doc(store.plan));
            if(planSnap.exists)plan=planSnap.data();
          }
          if(!plan){
            const free=await tx.get(db.collection("plans").doc("free"));
            if(free.exists)plan=free.data();
          }
          const maxAds=storePlanLimit(plan,5);
          const count=await tx.get(db.collection("ads").where("storeId","==",fields.storeId));
          if(maxAds!==0&&count.size>=maxAds){
            reject("وصل المتجر إلى الحد الأقصى لإعلانات الباقة ("+maxAds+")","resource-exhausted");
          }
          lockedRef=storeRef;
        }else{
          // A conservative abuse limit for non-store personal listings.
          const count=await tx.get(db.collection("ads").where("ownerId","==",uid));
          if(count.size>=300)reject("الحد الأقصى لإعلانات الحساب 300","resource-exhausted");
        }
        tx.update(lockedRef,{adQuotaRevision:FieldValue.increment(1)});
        tx.create(targetRef,{
          ...fields,ownerId:uid,ownerName,status:"pending",createdAt:now
        });
      }
      return {id,status:"pending"};
    });
    return {ok:true,...result};
  });
};
