import {getSuwaydaWeather,calculateBasic,validateMarketQuote} from "./souqna-local-services.mjs";

const style=document.createElement("style");
style.textContent=`
.sq-services{margin:14px auto;max-width:920px;padding:0 12px;font-family:Tahoma,Arial,sans-serif;color:#12203f}
.sq-services .sq-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 9px}
.sq-services .sq-heading h2{margin:0;font-size:20px}
.sq-services .sq-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.sq-services .sq-tile{background:linear-gradient(140deg,#fff,#eaf1ff);border:1px solid #dbe4f5;border-radius:16px;padding:14px;box-shadow:0 8px 20px #092f7112;min-width:0;text-align:right}
.sq-services .sq-tile b{display:block;font-size:16px;margin-bottom:8px}
.sq-services .sq-muted{font-size:12px;color:#5e6e8a}
.sq-services .sq-value{font-size:21px;font-weight:bold;color:#0a2a72;min-height:32px}
.sq-services .sq-btn{border:0;background:#1747b8;color:#fff;border-radius:10px;padding:8px 14px;font:inherit;cursor:pointer}
.sq-services .sq-btn:focus-visible{outline:3px solid #f4b400}
.sq-services .sq-calc{display:none;margin-top:12px;background:#fff;border-radius:18px;border:1px solid #dbe4f5;padding:14px}
.sq-services .sq-calc[data-open="true"]{display:block}
.sq-services .sq-fields{display:grid;grid-template-columns:1fr 90px 1fr;gap:8px}
.sq-services .sq-fields input,.sq-services .sq-fields select{width:100%;min-width:0;padding:9px;border:1px solid #dbe4f5;border-radius:10px;font:inherit}
.sq-services .sq-result{font-size:19px;color:#0a2a72;font-weight:bold;min-height:30px}
@media(max-width:640px){.sq-services .sq-tiles{grid-template-columns:1fr 1fr}.sq-services .sq-tiles .sq-tile:first-child{grid-column:1/-1}}
`;
document.head.append(style);

const root=document.createElement("section");
root.className="sq-services";
root.dir="rtl";
root.setAttribute("aria-label","خدمات سوقنا");
root.innerHTML=`
<div class="sq-heading"><h2>خدمات السويداء</h2><span class="sq-muted">خدمات مجانية للزوار</span></div>
<div class="sq-tiles">
 <article class="sq-tile">
  <b>⛅ طقس السويداء</b>
  <div class="sq-value" id="sq-weather-value" aria-live="polite">جارٍ التحميل…</div>
  <div class="sq-muted" id="sq-weather-detail">المصدر: Open-Meteo</div>
  <button class="sq-btn" id="sq-weather-refresh" type="button">تحديث الطقس</button>
 </article>
 <article class="sq-tile">
  <b>💱 العملات والذهب</b>
  <div class="sq-value" id="sq-quote-value">لا توجد أسعار موثقة</div>
  <div class="sq-muted" id="sq-quote-detail">سيظهر السعر عند ربط مصدر موثوق وتاريخ آخر تحديث</div>
 </article>
 <article class="sq-tile">
  <b>🧮 الآلة الحاسبة</b>
  <div class="sq-muted">عمليات حسابية فورية ونسب مئوية</div>
  <button class="sq-btn" id="sq-calc-toggle" type="button" aria-expanded="false" aria-controls="sq-calculator">فتح الحاسبة</button>
 </article>
</div>
<div class="sq-calc" id="sq-calculator" data-open="false">
 <div class="sq-fields">
  <input id="sq-a" type="number" step="any" placeholder="الرقم الأول" aria-label="الرقم الأول">
  <select id="sq-operation" aria-label="العملية الحسابية">
   <option value="+">+</option><option value="-">−</option>
   <option value="*">×</option><option value="/">÷</option><option value="%">٪ من</option>
  </select>
  <input id="sq-b" type="number" step="any" placeholder="الرقم الثاني" aria-label="الرقم الثاني">
 </div>
 <button class="sq-btn" type="button" id="sq-calculate">احسب</button>
 <p class="sq-result" role="status" id="sq-result"></p>
</div>`;
const target=document.querySelector("main");
if(target)target.before(root);
else document.body.append(root);

const node=id=>root.querySelector("#"+id);
node("sq-calc-toggle").addEventListener("click",()=>{
  const calc=node("sq-calculator");
  const open=calc.dataset.open!=="true";
  calc.dataset.open=String(open);
  node("sq-calc-toggle").setAttribute("aria-expanded",String(open));
  node("sq-calc-toggle").textContent=open?"إغلاق الحاسبة":"فتح الحاسبة";
});
node("sq-calculate").addEventListener("click",()=>{
  try{
    const a=node("sq-a").value,b=node("sq-b").value;
    if(a.trim()===""||b.trim()==="")throw new Error("أدخل الرقمين أولاً");
    node("sq-result").textContent="النتيجة: "+new Intl.NumberFormat("ar",{maximumFractionDigits:8})
      .format(calculateBasic(Number(a),node("sq-operation").value,Number(b)));
  }catch(error){node("sq-result").textContent=error.message;}
});
let updating=false;
async function refreshWeather(){
  if(updating)return;
  updating=true;
  node("sq-weather-refresh").disabled=true;
  node("sq-weather-value").textContent="جارٍ التحديث…";
  try{
    const weather=await getSuwaydaWeather();
    node("sq-weather-value").textContent=weather.temperatureC+"°م — "+weather.condition;
    node("sq-weather-detail").textContent="رياح "+weather.windKmh+" كم/س • الرطوبة "+weather.humidityPercent+"٪ • تحديث "+weather.observedAt+" • Open-Meteo";
  }catch(error){
    node("sq-weather-value").textContent="الطقس غير متاح حالياً";
    node("sq-weather-detail").textContent="يرجى التحقق من الإنترنت وإعادة المحاولة";
  }finally{updating=false;node("sq-weather-refresh").disabled=false;}
}
node("sq-weather-refresh").addEventListener("click",refreshWeather);
refreshWeather();

/** An authenticated server feed can supply validated quotes later. No fabricated prices. */
export function displayMarketQuote(quote){
  try{
    const checked=validateMarketQuote(quote);
    const status=checked.isStale?"⚠️ بيانات قديمة — ":"";
    node("sq-quote-value").textContent=status+checked.symbol+": "+checked.buy+" / "+checked.sell+" "+checked.currency;
    node("sq-quote-detail").textContent="المصدر: "+checked.source+" • آخر تحديث: "+checked.updatedAt;
  }catch(error){
    node("sq-quote-value").textContent="أسعار غير متاحة";
    node("sq-quote-detail").textContent=error.message;
  }
}
