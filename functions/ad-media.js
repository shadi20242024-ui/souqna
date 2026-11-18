"use strict";

const MAX_IMAGES=11;
const MAX_URL_LENGTH=2048;
const VIDEO_HOSTS=new Set(["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtu.be","vimeo.com","www.vimeo.com"]);
const IMAGE_HOSTS=new Set(["firebasestorage.googleapis.com","storage.googleapis.com"]);

function mediaError(message){throw new Error(message);}
function url(value,label){
  if(typeof value!=="string"||!value||value.length>MAX_URL_LENGTH||/[\r\n]/.test(value))mediaError(label+" غير صالح");
  let parsed;
  try{parsed=new URL(value);}catch{mediaError(label+" غير صالح");}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password)mediaError(label+" يجب أن يكون رابط HTTPS آمناً");
  return parsed;
}
function validateImageUrls(images,projectId,uid){
  if(!Array.isArray(images)||images.length>MAX_IMAGES)mediaError("عدد صور الإعلان يتجاوز 11 صورة إضافية");
  if(typeof projectId!=="string"||!/^[a-z][a-z0-9-]{4,40}$/.test(projectId))mediaError("معرف مشروع التخزين غير صحيح");
  if(typeof uid!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))mediaError("معرّف صاحب الإعلان غير صحيح");
  const bucketNames=new Set([projectId+".firebasestorage.app",projectId+".appspot.com"]);
  const output=images.map(value=>{
    const parsed=url(value,"رابط الصورة");
    if(!IMAGE_HOSTS.has(parsed.hostname))mediaError("مصدر الصورة غير مسموح");
    if(parsed.hostname==="firebasestorage.googleapis.com" && parsed.searchParams.get("alt")!=="media")
      mediaError("رابط صورة Firebase يفتقد تصريح العرض");
    let bucket="";
    let objectPath="";
    if(parsed.hostname==="firebasestorage.googleapis.com"){
      const match=parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
      if(!match)mediaError("رابط صورة Firebase غير صالح");
      bucket=decodeURIComponent(match[1]);
      objectPath=decodeURIComponent(match[2]);
    }else{
      const match=parsed.pathname.match(/^\/([^/]+)\/(.+)$/);
      if(!match)mediaError("رابط التخزين غير صالح");
      bucket=decodeURIComponent(match[1]);
      objectPath=decodeURIComponent(match[2]);
    }
    if(!bucketNames.has(bucket)||!objectPath.startsWith("ads/"+uid+"/")||objectPath.includes(".."))
      mediaError("الصورة ليست من مساحة إعلانات المشروع");
    return parsed.href;
  });
  if(new Set(output).size!==output.length)mediaError("رابط صورة مكرر");
  return output;
}
function validateVideoUrl(videoUrl){
  if(videoUrl===undefined||videoUrl===null||videoUrl==="")return "";
  const parsed=url(videoUrl,"رابط الفيديو");
  if(!VIDEO_HOSTS.has(parsed.hostname))mediaError("مصدر الفيديو غير مدعوم");
  if(parsed.hostname.endsWith("youtube.com")&&!(/^\/watch$|^\/shorts\/[^/]+$|^\/embed\/[^/]+$/.test(parsed.pathname)))
    mediaError("مسار فيديو YouTube غير صالح");
  if(parsed.hostname.includes("youtu.be")&&!/^\/[^/]+$/.test(parsed.pathname))
    mediaError("معرف فيديو YouTube غير صالح");
  if(parsed.hostname.includes("vimeo.com")&&!/^\/[0-9]+$/.test(parsed.pathname))
    mediaError("معرف فيديو Vimeo غير صالح");
  return parsed.href;
}
module.exports={validateImageUrls,validateVideoUrl,MAX_IMAGES};
