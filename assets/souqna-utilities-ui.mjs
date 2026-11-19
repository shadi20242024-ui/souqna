import {
  SUPPORTED_CURRENCIES,RATE_URL,GOLD_URL,
  calculateExpression,parseExchangeRates,convertCurrency,
  parseGoldPrice,goldGramUsd,fetchPublicQuote
} from "./souqna-utilities.mjs";

const format=(value,decimals=2)=>
  new Intl.NumberFormat("ar-SY",{maximumFractionDigits:decimals}).format(value);
const updated=unix=>new Date(unix).toLocaleString("ar-SY",{
  dateStyle:"medium",timeStyle:"short"
});
const options=selected=>SUPPORTED_CURRENCIES.map(code=>
  '<option value="'+code+'"'+(code===selected?' selected':'')+'>'+code+'</option>'
).join("");

const layout=[
  '<style>',
  '.sq-utilities{direction:rtl;max-width:1080px;margin:8px auto 28px;color:var(--t,#122544)}',
  '.sq-utilities .sq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:14px}',
  '.sq-utilities .sq-tool{padding:18px;border:1px solid #d9e0eb;background:#fff;border-radius:20px;box-shadow:0 9px 25px #001f3712}',
  '.sq-utilities .sq-title{font-size:24px;font-weight:750;margin:10px 0 18px}',
  '.sq-utilities h3{margin:0 0 12px;font-size:18px;color:#122f61}',
  '.sq-utilities .sq-note{color:#53627b;font-size:13px;line-height:1.7}',
  '.sq-utilities .sq-input{width:100%;padding:12px;min-height:46px;box-sizing:border-box;border:1px solid #d0d9e6;border-radius:11px;background:#f8faff;color:#122544;font:inherit}',
  '.sq-utilities .sq-input:focus-visible,.sq-utilities button:focus-visible{outline:3px solid #e0b33f;outline-offset:2px}',
  '.sq-utilities .sq-keys{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}',
  '.sq-utilities .sq-keys button{padding:8px 5px;min-height:46px;background:#eef2fa;color:#193d71;font-size:19px;font-weight:bold;border:0;border-radius:11px}',
  '.sq-utilities .sq-keys button[data-key="="]{grid-column:1/-1;background:#e5b238;color:#261c07}',
  '.sq-utilities .sq-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}',
  '.sq-utilities label{display:grid;gap:5px;font-size:13px}',
  '.sq-utilities .sq-answer{font-size:21px;font-weight:700;color:#153f7b;direction:ltr;text-align:right;min-height:29px;overflow-wrap:anywhere}',
  '.sq-utilities .sq-error{color:#ae2433!important}',
  '.sq-utilities .sq-source{font-size:12px;color:#57647a}',
  '.sq-utilities .sq-button{padding:10px 18px;border:0;border-radius:11px;background:#e5b238;color:#261c07;cursor:pointer;font:700 15px system-ui}',
  '.sq-utilities button:disabled{opacity:.55;cursor:not-allowed}',
  '</style>',
  '<section class="sq-utilities" aria-label="أدوات وخدمات سوقنا">',
  '<h2 class="sq-title">🧮 أدوات سوقنا المجانية</h2>',
  '<p class="sq-note">حاسبة سهلة لجميع الزوار ومؤشرات أسعار بمصادر معلنة. أسعار الصرف الدولية والذهب العالمي ليست أسعار التداول المحلية في سورية.</p>',
  '<div class="sq-grid">',
  '<section class="sq-tool" aria-label="الآلة الحاسبة">',
  '<h3>🧮 آلة حاسبة</h3>',
  '<input id="sq-math" class="sq-input" type="text" dir="ltr" inputmode="decimal" maxlength="120" autocomplete="off" placeholder="(120+80)×1.5" aria-label="العملية الحسابية">',
  '<div id="sq-keys" class="sq-keys">',
  ["7","8","9","÷","4","5","6","×","1","2","3","−","0",".","%","+","(",")","⌫","C","="].map(key=>
    '<button type="button" data-key="'+key+'" aria-label="'+key+'">'+(key==="="?"= احسب":key)+'</button>'
  ).join(""),
  '</div><p id="sq-math-result" class="sq-answer" role="status" aria-live="polite">—</p></section>',
  '<section class="sq-tool" aria-label="التحويل الدولي للعملات">',
  '<h3>💱 تحويل العملات</h3>',
  '<p class="sq-note">أسعار صرف دولية مرجعية تُحدَّث عادة مرة يومياً؛ لا تمثل سعر السوق الموازي في سورية أو سعر شركات الصرافة.</p>',
  '<p id="sq-rates-status" class="sq-note" role="status">لم تُحمّل الأسعار بعد</p>',
  '<label>المبلغ<input id="sq-amount" class="sq-input" type="number" inputmode="decimal" min="0" max="1000000000000" step="any" value="100"></label>',
  '<div class="sq-pair"><label>من<select id="sq-from" class="sq-input">',options("USD"),
  '</select></label><label>إلى<select id="sq-to" class="sq-input">',options("SYP"),
  '</select></label></div>',
  '<p id="sq-fx-result" class="sq-answer" role="status" aria-live="polite">—</p>',
  '<p class="sq-source">المصدر: <a href="https://www.exchangerate-api.com" rel="noopener noreferrer" target="_blank">Rates By Exchange Rate API</a></p>',
  '</section>',
  '<section class="sq-tool" aria-label="مؤشر الذهب العالمي">',
  '<h3>🥇 مؤشر الذهب العالمي</h3>',
  '<p class="sq-note">السعر الفوري بالدولار الأمريكي. لا يمثل سعر الصاغة في السويداء ولا يشمل المصنعية أو فرق البيع والشراء.</p>',
  '<p id="sq-gold-status" class="sq-note" role="status">لم يُحمّل الذهب بعد</p>',
  '<p id="sq-oz" class="sq-answer">—</p>',
  '<p id="sq-g24" class="sq-note">عيار 24: —</p>',
  '<p id="sq-g21" class="sq-note">عيار 21: —</p>',
  '<p id="sq-g18" class="sq-note">عيار 18: —</p>',
  '<p class="sq-source">المصدر: <a href="https://gold-api.com/" rel="noopener noreferrer" target="_blank">Gold API</a></p>',
  '</section></div>',
  '<p><button type="button" id="sq-refresh" class="sq-button">↻ تحديث أسعار العملات والذهب</button></p>',
  '<p class="sq-note">لن تعرض هذه الخدمة أي رقم تقديري على أنه سعر سوق محلي مباشر. إذا توقف المصدر، يُظهر النظام رسالة واضحة.</p>',
  '</section>'
].join("");

export function mountSouqnaUtilities(root,{fetcher=fetch,clock=()=>Date.now()}={}){
  if(!root||!root.isConnected)return null;
  root.innerHTML=layout;
  const find=id=>root.querySelector(id);
  const math=find("#sq-math");
  const mathResult=find("#sq-math-result");
  let quote=null,loading=false;
  function calculate(){
    try{
      mathResult.textContent=format(calculateExpression(math.value),9);
      mathResult.classList.remove("sq-error");
    }catch(error){
      mathResult.textContent=error.message;
      mathResult.classList.add("sq-error");
    }
  }
  find("#sq-keys").addEventListener("click",event=>{
    const button=event.target.closest("[data-key]");
    if(!button)return;
    const key=button.dataset.key;
    if(key==="=")return calculate();
    if(key==="C"){math.value="";mathResult.textContent="—";}
    else if(key==="⌫")math.value=math.value.slice(0,-1);
    else if(math.value.length<120)math.value+=key;
    math.focus();
  });
  math.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();calculate();}
  });
  function convert(){
    const destination=find("#sq-fx-result");
    try{
      if(!quote)throw new Error("لا توجد أسعار صرف متاحة");
      const from=find("#sq-from").value,to=find("#sq-to").value;
      const amount=convertCurrency(find("#sq-amount").value,from,to,quote);
      destination.textContent=format(amount,4)+" "+to;
      destination.classList.remove("sq-error");
    }catch(error){
      destination.textContent=error.message;
      destination.classList.add("sq-error");
    }
  }
  for(const input of ["#sq-amount","#sq-from","#sq-to"]){
    find(input).addEventListener("input",convert);
    find(input).addEventListener("change",convert);
  }
  async function refresh(){
    if(loading)return;
    loading=true;
    const button=find("#sq-refresh");
    button.disabled=true;
    find("#sq-rates-status").textContent="جارٍ التحقق من سعر الصرف...";
    find("#sq-gold-status").textContent="جارٍ التحقق من مؤشر الذهب...";
    try{
      const responses=await Promise.allSettled([
        fetchPublicQuote(RATE_URL,fetcher).then(body=>parseExchangeRates(body,clock())),
        fetchPublicQuote(GOLD_URL,fetcher).then(body=>parseGoldPrice(body,clock()))
      ]);
      if(!root.isConnected)return;
      if(responses[0].status==="fulfilled"){
        quote=responses[0].value;
        const status=find("#sq-rates-status");
        status.textContent=(quote.stale?"⚠️ بيانات صرف قديمة، لن تستخدم للتحويل — ":"آخر تحديث: ")+updated(quote.updatedAt);
        status.classList.toggle("sq-error",quote.stale);
      }else{
        quote=null;
        find("#sq-rates-status").textContent="تعذّر جلب أسعار صرف موثوقة حالياً.";
      }
      convert();
      if(responses[1].status==="fulfilled"){
        const gold=responses[1].value;
        find("#sq-gold-status").textContent=(gold.stale?"⚠️ آخر سعر متاح غير مباشر: ":"آخر تحديث: ")+updated(gold.updatedAt);
        find("#sq-gold-status").classList.toggle("sq-error",gold.stale);
        find("#sq-oz").textContent=format(gold.ounceUsd)+" USD / أونصة تروي";
        for(const k of [24,21,18])
          find("#sq-g"+k).textContent="عيار "+k+": نحو "+format(goldGramUsd(gold,k))+" USD / غرام (مرجعي)";
      }else{
        find("#sq-gold-status").textContent="تعذّر جلب مؤشر الذهب العالمي حالياً.";
        find("#sq-oz").textContent="—";
        for(const k of [24,21,18])find("#sq-g"+k).textContent="عيار "+k+": —";
      }
    }finally{
      loading=false;
      if(root.isConnected)button.disabled=false;
    }
  }
  find("#sq-refresh").addEventListener("click",()=>{void refresh();});
  void refresh();
  return{calculate,convert,refresh};
}
