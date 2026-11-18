/* SOUQNA shared public utilities. No keys, credentials, eval or real-money actions. */
export const MAX_AD_PHOTOS = 4;
export const MAX_AD_IMAGE_DATA_CHARS = 750000;
export const SPECIALTIES = Object.freeze([
  { id:"jobs", label:"إعلانات الوظائف" },
  { id:"pharmacy", label:"الصيدليات المناوبة" },
  { id:"doctor", label:"العيادات والأطباء" },
  { id:"fuel", label:"محطات الوقود" }
]);
export function isSafeVideoUrl(raw){
  if(!raw)return true;
  if(typeof raw!=="string"||raw.length>400)return false;
  try{
    const u=new URL(raw);
    if(u.protocol!=="https:"||u.username||u.password||u.port)return false;
    const host=u.hostname.toLowerCase();
    if(["youtube.com","www.youtube.com","m.youtube.com","youtube-nocookie.com","www.youtube-nocookie.com"].includes(host))
      return /^\/(?:watch|shorts\/[A-Za-z0-9_-]{11}|embed\/[A-Za-z0-9_-]{11})$/.test(u.pathname)
        && (u.pathname!=="/watch"||/^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get("v")||""));
    if(host==="youtu.be"||host==="www.youtu.be")
      return /^\/[A-Za-z0-9_-]{11}$/.test(u.pathname);
    return host==="vimeo.com"&&/^\/[0-9]{5,12}$/.test(u.pathname);
  }catch{return false;}
}
export function validGallery(img,images){
  const supported=v=>typeof v==="string"&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
  return typeof img==="string" && (!img||supported(img))
    && Array.isArray(images)&&images.length<=MAX_AD_PHOTOS-1
    && images.every(supported)
    && img.length+images.reduce((a,b)=>a+b.length,0)<=MAX_AD_IMAGE_DATA_CHARS
    && (images.length===0||img.length>0);
}
export function jobFreshCount(ads,now=Date.now()){
  return ads.filter(x=>x?.cat==="jobs"&&x.status==="approved"
    &&Number.isFinite(Number(x.createdAt))&&Number(x.createdAt)<=now
    &&now-Number(x.createdAt)<=72*3600000).length;
}

/* Four arithmetic operators and parentheses; rejects invalid tokens and division by zero. */
export function calculateExpression(expression){
  if(typeof expression!=="string"||expression.length>120)throw Error("عملية حسابية طويلة أو غير صالحة");
  const tokens=expression.replace(/\s+/g,"").match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/g);
  if(!tokens||tokens.join("")!==expression.replace(/\s+/g,""))throw Error("رموز غير مدعومة");
  let pos=0;
  function factor(){
    const t=tokens[pos++];
    if(t==="+")return factor();
    if(t==="-")return -factor();
    if(t==="("){const v=add();if(tokens[pos++]!==")")throw Error("قوس غير مكتمل");return v;}
    const n=Number(t);
    if(!t||!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)||!Number.isFinite(n))throw Error("عدد غير صالح");
    return n;
  }
  function mul(){
    let x=factor();
    while(tokens[pos]==="*"||tokens[pos]==="/"){
      const op=tokens[pos++],b=factor();
      if(op==="/"&&b===0)throw Error("لا يمكن القسمة على صفر");
      x=op==="*"?x*b:x/b;
    }
    return x;
  }
  function add(){
    let x=mul();
    while(tokens[pos]==="+"||tokens[pos]==="-"){const op=tokens[pos++],b=mul();x=op==="+"?x+b:x-b;}
    return x;
  }
  const result=add();
  if(pos!==tokens.length||!Number.isFinite(result)||Math.abs(result)>1e18)throw Error("عملية غير صالحة");
  return Number(result.toPrecision(12));
}
export function validRatePayload(payload){
  const syp=Number(payload?.rates?.SYP),eur=Number(payload?.rates?.EUR),tryRate=Number(payload?.rates?.TRY);
  const timestamp=Number(payload?.time_last_update_unix)*1000;
  return payload?.result==="success"&&payload?.base_code==="USD"
    &&[syp,eur,tryRate].every(x=>Number.isFinite(x)&&x>0)
    &&Number.isFinite(timestamp)&&timestamp>1577836800000
    ? {syp,eur,tryRate,timestamp}:null;
}
export function validGoldPayload(payload){
  const price=Number(payload?.price),timestamp=Date.parse(payload?.updatedAt||"");
  return payload?.symbol==="XAU"&&Number.isFinite(price)&&price>0&&Number.isFinite(timestamp)
    ? {usdPerOunce:price,timestamp}:null;
}
export function isFresh(timestamp,maxAgeMs,now=Date.now()){
  return Number.isFinite(timestamp)&&timestamp<=now+300000&&now-timestamp>=0&&now-timestamp<=maxAgeMs;
}
