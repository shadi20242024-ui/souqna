import {MAX_AD_PHOTOS, validGallery} from "./souqna-extras.js";
const ALLOWED=new Set(["image/jpeg","image/png","image/webp","image/avif"]);
export async function compressAdPhotos(files){
  if(!Array.isArray(files)||files.length>MAX_AD_PHOTOS)throw Error("أربع صور كحد أقصى");
  const images=[];
  for(const file of files){
    if(!ALLOWED.has(file.type)||file.size>12*1024*1024)throw Error("الصور يجب أن تكون JPG أو PNG أو WebP أو AVIF ولا تتجاوز 12 ميغابايت");
    const objectUrl=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{
        const photo=new Image();
        photo.onload=()=>resolve(photo);
        photo.onerror=()=>reject(Error("تعذر قراءة الصورة"));
        photo.src=objectUrl;
      });
      if(!img.naturalWidth||!img.naturalHeight)throw Error("أبعاد الصورة غير صالحة");
      const ratio=Math.min(1,1024/img.naturalWidth,1024/img.naturalHeight);
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      const ctx=canvas.getContext("2d");
      if(!ctx)throw Error("تعذر معالجة الصورة");
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      let encoded="";
      for(const format of ["image/webp","image/jpeg"]){
        for(const quality of [0.75,0.62,0.48,0.36,0.26,0.16]){
          const current=canvas.toDataURL(format,quality);
          if(current.startsWith("data:"+format+";")&&current.length<=160000){
            encoded=current;break;
          }
        }
        if(encoded)break;
      }
      if(!encoded)throw Error("تعذر ضغط إحدى الصور؛ جرّب صورة أصغر");
      images.push(encoded);
    }finally{URL.revokeObjectURL(objectUrl);}
  }
  if(images.length&&!validGallery(images[0],images.slice(1))){
    throw Error("إجمالي صور الإعلان كبير جداً؛ قلل عدد الصور");
  }
  return images;
}
