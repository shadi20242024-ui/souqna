/**
 * SOUQNA local services: dependency-free browser utilities.
 * Staging-ready module. No Firebase writes, secrets, billing or deployment.
 */
export const SUWAYDA = Object.freeze({ latitude:32.7089, longitude:36.5695, timezone:"Asia/Damascus" });
export const SERVICE_SECTIONS = Object.freeze([
  {id:"jobs",name_ar:"الوظائف",name_en:"Jobs",icon:"briefcase"},
  {id:"on_call_clinics",name_ar:"العيادات المناوبة",name_en:"On-call clinics",icon:"stethoscope"},
  {id:"fuel_stations",name_ar:"محطات الوقود",name_en:"Fuel stations",icon:"fuel"},
  {id:"weather",name_ar:"طقس السويداء",name_en:"Weather",icon:"cloud-sun"},
  {id:"exchange_rates",name_ar:"أسعار العملات والذهب",name_en:"Exchange and gold",icon:"coins"},
  {id:"calculator",name_ar:"الآلة الحاسبة",name_en:"Calculator",icon:"calculator"}
]);
const WEATHER_CODES = Object.freeze({
  0:"صحو",1:"صحو غالباً",2:"غائم جزئياً",3:"غائم",45:"ضباب",48:"ضباب متجمد",
  51:"رذاذ خفيف",53:"رذاذ",55:"رذاذ كثيف",61:"مطر خفيف",63:"مطر",65:"مطر غزير",
  71:"ثلج خفيف",73:"ثلج",75:"ثلج كثيف",80:"زخات خفيفة",81:"زخات",82:"زخات غزيرة",
  95:"عواصف رعدية",96:"عواصف مع برد",99:"عواصف مع برد"
});
export async function getSuwaydaWeather({fetcher=fetch,signal}={}){
  const url=new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",String(SUWAYDA.latitude));
  url.searchParams.set("longitude",String(SUWAYDA.longitude));
  url.searchParams.set("current","temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
  url.searchParams.set("daily","temperature_2m_max,temperature_2m_min");
  url.searchParams.set("forecast_days","1");
  url.searchParams.set("timezone",SUWAYDA.timezone);
  const response=await fetcher(url.toString(),{signal,headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("تعذر تحميل بيانات الطقس: HTTP "+response.status);
  const payload=await response.json();
  const c=payload?.current,d=payload?.daily;
  if(!c||!Number.isFinite(c.temperature_2m)||!Number.isFinite(c.wind_speed_10m))
    throw new Error("استجابة الطقس غير مكتملة");
  return {
    city:"السويداء",temperatureC:c.temperature_2m,humidityPercent:c.relative_humidity_2m,
    windKmh:c.wind_speed_10m,condition:WEATHER_CODES[c.weather_code]??"حالة غير محددة",
    minC:d?.temperature_2m_min?.[0]??null,maxC:d?.temperature_2m_max?.[0]??null,
    observedAt:c.time,source:"Open-Meteo",fetchedAt:new Date().toISOString()
  };
}
export function validateListingMedia({images=[],videoUrl=""}={}){
  if(!Array.isArray(images)||images.length>12)throw new Error("يسمح بما لا يزيد عن 12 صورة");
  const clean=images.map((item,i)=>{
    if(typeof item!=="string"||!item.trim()||item.length>2048)
      throw new Error("رابط الصورة رقم "+(i+1)+" غير صالح");
    const u=new URL(item);
    if(u.protocol!=="https:")throw new Error("روابط الصور يجب أن تستخدم HTTPS");
    return u.href;
  });
  let video=null;
  if(videoUrl){
    const u=new URL(videoUrl);
    const host=u.hostname.toLowerCase();
    if(u.protocol!=="https:"||!["youtube.com","www.youtube.com","youtu.be","www.youtu.be","vimeo.com","www.vimeo.com"].includes(host))
      throw new Error("يسمح حالياً بروابط YouTube أو Vimeo الآمنة فقط");
    video=u.href;
  }
  return {images:clean,coverImage:clean[0]??null,videoUrl:video};
}
export function calculateBasic(a,operator,b){
  if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error("يرجى إدخال رقمين صالحين");
  let result;
  switch(operator){
    case "+":result=a+b;break;
    case "-":result=a-b;break;
    case "*":result=a*b;break;
    case "/":if(b===0)throw new Error("القسمة على الصفر غير ممكنة");result=a/b;break;
    case "%":result=a*b/100;break;
    default:throw new Error("عملية غير مدعومة");
  }
  if(!Number.isFinite(result))throw new Error("ناتج العملية خارج المجال");
  return result;
}
export function validateMarketQuote(quote,{maxAgeMinutes=30,now=Date.now()}={}){
  const {symbol,buy,sell,currency,source,updatedAt}=quote??{};
  if(typeof symbol!=="string"||!symbol||!Number.isFinite(buy)||buy<=0||
     !Number.isFinite(sell)||sell<=0||typeof currency!=="string"||!currency||
     typeof source!=="string"||!source||typeof updatedAt!=="string")
    throw new Error("بيانات الأسعار غير مكتملة أو غير موثوقة");
  const ts=Date.parse(updatedAt);
  if(!Number.isFinite(ts)||ts>now+60000)throw new Error("وقت تحديث الأسعار غير صالح");
  return {...quote,isStale:now-ts>maxAgeMinutes*60000};
}
export function countNewJobs(jobs,{since=Date.now()-7*86400000}={}){
  if(!Array.isArray(jobs))throw new TypeError("قائمة الوظائف غير صحيحة");
  return jobs.filter(j=>j?.status==="approved"&&Number.isFinite(Date.parse(j.publishedAt))&&
    Date.parse(j.publishedAt)>=since).length;
}
export function mayManageSection(role,sectionId,assignment){
  if(role==="admin")return true;
  return role==="moderator"&&assignment?.active===true&&
    Array.isArray(assignment.sectionIds)&&assignment.sectionIds.includes(sectionId);
}
