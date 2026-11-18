/* Public Syrian exchange-rate feed; read-only, no credentials and no invented prices.
   Source: https://lirascope.syria-cloud.sy/en/api-docs
   Provider free tier is rate-limited; results are displayed only when fresh.
*/
export const SYRIAN_MARKET_SOURCE="https://lirascope.syria-cloud.sy/";
export const SYRIAN_MARKET_ENDPOINT="https://lirascope.syria-cloud.sy/api/v1/rates/latest?currencies=USD,EUR&lang=ar";
export const SYRIAN_MARKET_MAX_AGE_MS=6*3600000;

function money(value){
  return typeof value==="number" && Number.isFinite(value)&&value>0&&value<1000000000?value:null;
}
function quote(rows,currency){
  if(!Array.isArray(rows))return null;
  const raw=rows.find(row=>row?.currency===currency);
  if(!raw)return null;
  const buy=money(raw.buy),sell=money(raw.sell);
  if(buy===null||sell===null||buy>sell)return null;
  const timestamp=Date.parse(raw.timestampUtc||"");
  if(!Number.isFinite(timestamp))return null;
  return {buy,sell,timestamp};
}
export function parseSyrianMarketRates(data,now=Date.now()){
  if(!data||typeof data!=="object"||!Array.isArray(data.marketRates))return null;
  const usd=quote(data.marketRates,"USD"),eur=quote(data.marketRates,"EUR");
  if(!usd||!eur)return null;
  // Do not treat a provider's current HTTP response as proof that its prices are current.
  for(const q of [usd,eur]){
    if(q.timestamp>now+5*60000||now-q.timestamp>SYRIAN_MARKET_MAX_AGE_MS)return null;
  }
  return {usd,eur,source:SYRIAN_MARKET_SOURCE,updatedAt:Math.min(usd.timestamp,eur.timestamp)};
}
export async function fetchSyrianMarketRates(fetcher=fetch){
  const response=await fetcher(SYRIAN_MARKET_ENDPOINT,{
    method:"GET",cache:"no-store",signal:AbortSignal.timeout(12000),
    headers:{Accept:"application/json"}
  });
  if(!response.ok)throw Error(response.status===429?"تجاوز المصدر الحد المجاني للطلبات":"تعذر الاتصال بمصدر الأسعار السورية");
  const data=await response.json();
  const rates=parseSyrianMarketRates(data);
  if(!rates)throw Error("أسعار المصدر غير مكتملة أو تجاوزت ست ساعات، لذلك لن نعرضها");
  return rates;
}
