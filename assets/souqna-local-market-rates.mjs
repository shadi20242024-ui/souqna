export const MARKET_DEFINITIONS=Object.freeze([
  {id:"usd_official",label:"الدولار الرسمي",icon:"🏦",unit:"دولار أمريكي",scope:"النشرة الرسمية السورية",maxAgeHours:72},
  {id:"usd_parallel",label:"دولار السوق غير الرسمية",icon:"💵",unit:"دولار أمريكي",scope:"السويداء",maxAgeHours:24},
  {id:"gold_24",label:"ذهب عيار 24",icon:"🥇",unit:"غرام",scope:"السويداء",maxAgeHours:24},
  {id:"gold_21",label:"ذهب عيار 21",icon:"🥇",unit:"غرام",scope:"السويداء",maxAgeHours:24},
  {id:"gold_18",label:"ذهب عيار 18",icon:"🥇",unit:"غرام",scope:"السويداء",maxAgeHours:24},
  {id:"silver_999",label:"فضة عيار 999",icon:"🥈",unit:"غرام",scope:"السويداء",maxAgeHours:24}
]);
export const MARKET_IDS=Object.freeze(MARKET_DEFINITIONS.map(item=>item.id));
export const LOCAL_PRICE_COLLECTION="localMarketRates";
export const SYRIAN_OLD_PER_NEW=100;
const SAFE_HTTPS=/^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[^\s]*)?$/i;
export function toMarketMillis(value){
  if(value&&typeof value.toMillis==="function")return value.toMillis();
  if(value instanceof Date)return value.getTime();
  if(value&&Number.isInteger(value.seconds))return value.seconds*1000+Math.floor((value.nanoseconds||0)/1e6);
  return NaN;
}
export function validateLocalPriceInput(input,{now=Date.now()}={}){
  if(!input||!MARKET_IDS.includes(input.id))throw new Error("نوع السعر غير مدعوم");
  const buy=Number(input.buy),sell=Number(input.sell);
  if(input.buy===""||input.sell===""||!Number.isFinite(buy)||!Number.isFinite(sell)||
     buy<=0||sell<=0||buy>1e9||sell>1e9||buy>sell||
     Math.abs(Math.round(buy*100)-buy*100)>1e-7||
     Math.abs(Math.round(sell*100)-sell*100)>1e-7)
    throw new Error("أدخل سعري شراء ومبيع صالحين بالليرة الجديدة، على ألا يزيد الشراء عن المبيع");
  const sourceName=String(input.sourceName||"").trim();
  const sourceUrl=String(input.sourceUrl||"").trim();
  if(sourceName.length<3||sourceName.length>120)
    throw new Error("اذكر اسم المصدر بوضوح (3 إلى 120 حرفاً)");
  if(sourceUrl.length>400||(sourceUrl&&!SAFE_HTTPS.test(sourceUrl)))
    throw new Error("رابط المصدر يجب أن يبدأ بـ HTTPS");
  if(input.id==="usd_official"&&!sourceUrl)
    throw new Error("السعر الرسمي يتطلب رابط النشرة الأصلية");
  const observedAt=typeof input.observedAt==="string"?Date.parse(input.observedAt):toMarketMillis(input.observedAt);
  if(!Number.isFinite(observedAt)||observedAt>now+60000||
     observedAt<now-7*86400000)
    throw new Error("وقت المعلومة يجب أن يكون خلال آخر 7 أيام وليس في المستقبل");
  return{buy,sell,sourceName,sourceUrl,observedAt};
}
export function readLocalPrice(id,document,{now=Date.now()}={}){
  if(!MARKET_IDS.includes(id)||!document||typeof document!=="object")return null;
  const definition=MARKET_DEFINITIONS.find(item=>item.id===id);
  const buy=Number(document.buy),sell=Number(document.sell);
  const observedAt=toMarketMillis(document.observedAt),updatedAt=toMarketMillis(document.updatedAt);
  if(document.currencyEra!=="SYP_NEW"||document.method!=="manual"&&document.method!=="api"||
     !Number.isFinite(buy)||!Number.isFinite(sell)||buy<=0||sell<=0||buy>sell||
     !Number.isFinite(observedAt)||!Number.isFinite(updatedAt)||
     observedAt>now+60000||updatedAt>now+60000)return null;
  const sourceName=String(document.sourceName||"").slice(0,120);
  const sourceUrl=String(document.sourceUrl||"").slice(0,400);
  if(sourceName.length<3||sourceUrl&&!SAFE_HTTPS.test(sourceUrl)||
     id==="usd_official"&&!sourceUrl)return null;
  const stale=now-observedAt>definition.maxAgeHours*3600000;
  return{
    ...definition,buy,sell,observedAt,updatedAt,stale,
    sourceName,sourceUrl,method:document.method,
    currencyEra:"SYP_NEW"
  };
}
export function summarizeMarketRecords(rows,{now=Date.now()}={}){
  const map=new Map();
  for(const value of rows||[]){
    const record=readLocalPrice(value.id,value,{now});
    if(record)map.set(record.id,record);
  }
  return MARKET_DEFINITIONS.map(def=>map.get(def.id)||{...def,missing:true});
}
