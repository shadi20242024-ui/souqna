const TROY_OUNCE_GRAMS=31.1034768;
export const SUPPORTED_CURRENCIES=Object.freeze(["USD","SYP","EUR","AED","IQD"]);
export const RATE_URL="https://open.er-api.com/v6/latest/USD";
export const GOLD_URL="https://api.gold-api.com/price/XAU";

export function normalizeMathExpression(input){
  if(typeof input!=="string"||input.length>120)throw new Error("العملية الحسابية طويلة جداً");
  return input.replace(/[٠-٩]/g,ch=>String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
    .replace(/[۰-۹]/g,ch=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))
    .replace(/٫/g,".").replace(/٬/g,"")
    .replace(/×/g,"*").replace(/÷/g,"/").replace(/[−–]/g,"-")
    .replace(/\s+/g,"");
}

export function calculateExpression(expression){
  const src=normalizeMathExpression(expression);
  if(!src)throw new Error("اكتب العملية الحسابية أولاً");
  if(!/^[0-9.+*/()%\-]+$/.test(src))
    throw new Error("تحتوي العملية على رموز غير مسموحة");
  let pos=0,steps=0;
  const check=()=>{if(++steps>160)throw new Error("العملية الحسابية معقدة جداً");};
  const take=char=>{if(src[pos]===char){pos++;return true;}return false;};
  function primary(){
    check();
    if(take("+"))return primary();
    if(take("-"))return -primary();
    if(take("(")){
      const result=addition();
      if(!take(")"))throw new Error("أغلق القوس في العملية");
      return result;
    }
    const match=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(src.slice(pos));
    if(!match)throw new Error("صيغة العملية الحسابية غير صحيحة");
    pos+=match[0].length;
    return Number(match[0]);
  }
  function percentage(){
    let result=primary();
    while(take("%")){check();result/=100;}
    return result;
  }
  function multiplication(){
    let result=percentage();
    while(src[pos]==="*"||src[pos]==="/"){
      const op=src[pos++],right=percentage();
      if(op==="/"&&right===0)throw new Error("لا يمكن القسمة على صفر");
      result=op==="*"?result*right:result/right;
      check();
    }
    return result;
  }
  function addition(){
    let result=multiplication();
    while(src[pos]==="+"||src[pos]==="-"){
      const op=src[pos++],right=multiplication();
      result=op==="+"?result+right:result-right;
      check();
    }
    return result;
  }
  const answer=addition();
  if(pos!==src.length)throw new Error("صيغة العملية الحسابية غير مكتملة");
  if(!Number.isFinite(answer)||Math.abs(answer)>1e15)
    throw new Error("النتيجة خارج نطاق الحاسبة");
  return Object.is(answer,-0)?0:Number(answer.toPrecision(13));
}
const positiveFinite=value=>typeof value==="number"&&Number.isFinite(value)&&value>0&&value<1e12;
export function parseExchangeRates(data,now=Date.now()){
  if(!data||data.result!=="success"||data.base_code!=="USD"||
     !Number.isSafeInteger(data.time_last_update_unix))
    throw new Error("بيانات أسعار العملات غير صالحة");
  const updatedAt=data.time_last_update_unix*1000;
  if(!Number.isSafeInteger(updatedAt)||updatedAt>now+5*60*1000||updatedAt<=0)
    throw new Error("تاريخ أسعار العملات غير صالح");
  const rates={USD:1};
  for(const code of SUPPORTED_CURRENCIES){
    if(code!=="USD"&&positiveFinite(data.rates?.[code]))rates[code]=data.rates[code];
  }
  if(Object.keys(rates).length<2)throw new Error("لا توجد أسعار صرف متاحة");
  return{
    rates,updatedAt,stale:now-updatedAt>48*60*60*1000,
    source:"ExchangeRate-API",kind:"international_reference"
  };
}
export function convertCurrency(value,from,to,quote){
  if(!SUPPORTED_CURRENCIES.includes(from)||!SUPPORTED_CURRENCIES.includes(to))
    throw new Error("اختر عملة مدعومة");
  if(!quote||quote.stale===true||!positiveFinite(quote.rates?.[from])||
     !positiveFinite(quote.rates?.[to]))
    throw new Error("سعر صرف محدث لهذه العملة غير متوفر");
  if(value===""||value===null||value===undefined)
    throw new Error("أدخل المبلغ");
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<0||amount>1e12)
    throw new Error("اكتب مبلغاً صالحاً");
  const result=amount/quote.rates[from]*quote.rates[to];
  if(!Number.isFinite(result)||result>1e16)throw new Error("المبلغ خارج النطاق");
  return result;
}
export function parseGoldPrice(data,now=Date.now()){
  if(data?.symbol!=="XAU"||data.currency!=="USD"||!positiveFinite(data.price))
    throw new Error("سعر الذهب العالمي غير صالح");
  const updatedAt=Date.parse(data.updatedAt);
  if(!Number.isFinite(updatedAt)||updatedAt>now+5*60*1000||updatedAt<=0)
    throw new Error("تاريخ تحديث الذهب غير صالح");
  return{
    ounceUsd:data.price,updatedAt,stale:now-updatedAt>72*60*60*1000,
    source:"Gold API",kind:"global_spot_price"
  };
}
export function goldGramUsd(quote,karat){
  if(![24,21,18].includes(karat)||!positiveFinite(quote?.ounceUsd))
    throw new Error("سعر الذهب غير صالح");
  return quote.ounceUsd/TROY_OUNCE_GRAMS*(karat/24);
}
export async function fetchPublicQuote(url,fetcher=fetch){
  if(![RATE_URL,GOLD_URL].includes(url))
    throw new Error("مصدر الأسعار غير مسموح");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8500);
  try{
    const response=await fetcher(url,{signal:controller.signal,cache:"no-store"});
    if(!response?.ok)throw new Error("مزود الأسعار غير متاح");
    return await response.json();
  }finally{clearTimeout(timeout);}
}
