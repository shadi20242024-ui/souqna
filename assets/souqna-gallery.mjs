import {getStorage,ref,uploadBytes,getDownloadURL,deleteObject} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const ALLOWED_TYPES=new Set(["image/jpeg","image/png","image/webp"]);
const EXTENSIONS={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
const MAX_IMAGES=11;
const MAX_BYTES=5*1024*1024;
function verifyFile(file){
  if(!file||!ALLOWED_TYPES.has(file.type))throw new Error("الصورة يجب أن تكون JPG أو PNG أو WebP");
  if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_BYTES)throw new Error("حجم الصورة يجب ألا يتجاوز 5 ميغابايت");
}
function randomName(type){
  const bytes=new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")+"."+EXTENSIONS[type];
}
export async function uploadGallery(app,userId,files,{onProgress=()=>{}}={}){
  if(!app||app.options.projectId!=="souqna-staging")
    throw new Error("رفع الصور محصور في بيئة الاختبار حالياً");
  if(!userId||!/^[A-Za-z0-9_-]{1,128}$/.test(userId))
    throw new Error("معرّف المستخدم غير صحيح");
  const selected=Array.from(files??[]);
  if(!selected.length||selected.length>MAX_IMAGES)throw new Error("اختر من 1 إلى 11 صورة إضافية");
  selected.forEach(verifyFile);
  const storage=getStorage(app);
  const uploaded=[];
  try{
    for(let i=0;i<selected.length;i++){
      const file=selected[i],path="ads/"+userId+"/"+randomName(file.type);
      const target=ref(storage,path);
      await uploadBytes(target,file,{contentType:file.type,customMetadata:{purpose:"souqna-ad"}});
      uploaded.push({path,url:""});
      uploaded[uploaded.length-1].url=await getDownloadURL(target);
      onProgress({completed:i+1,total:selected.length});
    }
    return uploaded;
  }catch(error){
    // Best-effort cleanup prevents abandoned files after a partial upload.
    await Promise.allSettled(uploaded.map(item=>deleteObject(ref(storage,item.path))));
    throw error;
  }
}
export async function deleteUploadedGallery(app,userId,items){
  if(!app||app.options.projectId!=="souqna-staging")
    throw new Error("تنظيف الصور محصور في بيئة الاختبار");
  const storage=getStorage(app),prefix="ads/"+userId+"/";
  const list=Array.from(items??[]);
  const results=await Promise.allSettled(list.map(item=>{
    if(typeof item?.path!=="string"||!item.path.startsWith(prefix)||item.path.includes(".."))
      throw new Error("مسار ملف غير مصرح بحذفه");
    return deleteObject(ref(storage,item.path));
  }));
  const failures=results.filter(r=>r.status==="rejected");
  return {deleted:results.length-failures.length,failed:failures.length};
}

export function renderGallery(container,images,{videoUrl=""}={}){
  if(!(container instanceof HTMLElement))throw new Error("مكان عرض الصور غير صالح");
  container.replaceChildren();
  const valid=Array.isArray(images)?images.filter(url=>{
    try{return new URL(url).protocol==="https:";}catch{return false;}
  }).slice(0,MAX_IMAGES):[];
  if(!valid.length&&!videoUrl){container.textContent="لا توجد صور للإعلان";return;}
  const stage=document.createElement("img");
  if(valid.length){
    stage.src=valid[0];stage.alt="صورة الإعلان";stage.loading="lazy";
    stage.style.cssText="width:100%;max-height:420px;object-fit:contain;border-radius:14px;background:#eef3fc";
    container.append(stage);
    const thumbnails=document.createElement("div");
    thumbnails.style.cssText="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px";
    valid.forEach((src,i)=>{
      const button=document.createElement("button");button.type="button";
      button.setAttribute("aria-label","عرض صورة "+(i+1));
      const thumb=document.createElement("img");
      thumb.src=src;thumb.alt="";thumb.loading="lazy";
      thumb.style.cssText="width:65px;height:65px;object-fit:cover;border-radius:8px";
      button.append(thumb);
      button.addEventListener("click",()=>{stage.src=src;stage.alt="صورة الإعلان "+(i+1);});
      thumbnails.append(button);
    });
    container.append(thumbnails);
  }
  if(videoUrl){
    let allowed=false;
    try{
      const u=new URL(videoUrl);
      allowed=u.protocol==="https:"&&["youtube.com","www.youtube.com","youtu.be","www.youtu.be","vimeo.com","www.vimeo.com"].includes(u.hostname);
    }catch{}
    if(allowed){
      const link=document.createElement("a");link.href=videoUrl;link.target="_blank";
      link.rel="noopener noreferrer";link.textContent="▶ مشاهدة فيديو الإعلان";
      link.style.cssText="display:inline-block;margin-top:12px;color:#1747b8;font-weight:bold";
      container.append(link);
    }
  }
}
