import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,collection,doc,getDoc,setDoc,onSnapshot,serverTimestamp,Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  MARKET_DEFINITIONS,LOCAL_PRICE_COLLECTION,SYRIAN_OLD_PER_NEW,
  validateLocalPriceInput,summarizeMarketRecords
} from "./souqna-local-market-rates.mjs";

const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const fmt=n=>new Intl.NumberFormat("ar-SY",{maximumFractionDigits:2}).format(n);
const datetime=n=>new Intl.DateTimeFormat("ar-SY",{
  timeZone:"Asia/Damascus",dateStyle:"medium",timeStyle:"short"
}).format(n);
const localNow=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
const root=document.createElement("section");
root.id="sq-local-market";
root.dir="rtl";
root.hidden=true;
root.setAttribute("aria-label","أسعار الذهب والفضة والدولار في السويداء");
const css=document.createElement("style");
css.textContent=[
  "#sq-local-market{max-width:1080px;margin:15px auto;padding:0 12px;font-family:Tahoma,Arial,sans-serif;color:#13294a}",
  "#sq-local-market .wrap{background:#fff;border:1px solid #dbe5f0;border-radius:20px;padding:18px;box-shadow:0 8px 26px #0a2a7212}",
  "#sq-local-market .head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}",
  "#sq-local-market h2{margin:0 0 8px;font-size:22px}",
  "#sq-local-market .note{font-size:13px;color:#52657a;line-height:1.7}",
  "#sq-local-market .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:11px;margin:14px 0}",
  "#sq-local-market article{border:1px solid #dce5ef;border-radius:16px;padding:14px;background:#f7f9fd}",
  "#sq-local-market article h3{font-size:16px;margin:0 0 8px}",
  "#sq-local-market .prices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
  "#sq-local-market .prices div{padding:8px;border:1px solid #e6ecf5;background:white;border-radius:10px}",
  "#sq-local-market .prices small{display:block;color:#617188}",
  "#sq-local-market .prices strong{display:block;font-size:20px;direction:ltr;text-align:right}",
  "#sq-local-market .warning{color:#a14320;font-weight:bold}",
  "#sq-local-market button{border:0;border-radius:11px;background:#1747b8;color:white;padding:10px 16px;font:inherit;cursor:pointer}",
  "#sq-local-market button:disabled{opacity:.55}",
  "#sq-local-market input,#sq-local-market select{padding:10px;border:1px solid #ccd8e7;border-radius:10px;width:100%;box-sizing:border-box;font:inherit}",
  "#sq-local-market label{display:grid;gap:5px;margin:8px 0}",
  "#sq-local-market .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
  "#sq-local-market details{margin-top:16px;border-top:1px solid #e6edf3;padding-top:13px}",
  "#sq-local-market summary{cursor:pointer;font-weight:bold}",
  "#sq-local-market a{overflow-wrap:anywhere;color:#1b518d}",
  "@media(max-width:520px){#sq-local-market .form-grid{grid-template-columns:1fr}}"
].join("\n");
document.head.append(css);
const nearby=document.querySelector(".sq-services");
const main=document.querySelector("main");
if(nearby)nearby.after(root);
else if(main)main.before(root);
else document.body.append(root);
const node=selector=>root.querySelector(selector);
let db,editable=false,userId="",unsubscribe=null,timer=null;
let rawRows=[],records=[],fromCache=false,loading=true,failed=false;
const lookup=id=>records.find(item=>item.id===id);
function card(item){
  const row=lookup(item.id);
  let prices='<p class="note warning">لم يُنشر سعر موثوق لهذه الخانة بعد.</p>';
  if(row&&!row.missing){
    const source=row.sourceUrl?
      ' <a href="'+esc(row.sourceUrl)+'" target="_blank" rel="noopener noreferrer">رابط المصدر</a>':"";
    prices='<div class="prices"><div><small>شراء</small><strong>'+fmt(row.buy)+
      '</strong></div><div><small>مبيع</small><strong>'+fmt(row.sell)+'</strong></div></div>'+
      '<p class="note">'+(row.stale?'<span class="warning">⚠️ معلومات قديمة، ليست سعراً حالياً</span> · ':'')+
      'المعلومة: '+esc(datetime(row.observedAt))+' بتوقيت دمشق</p>'+
      '<p class="note">المصدر: '+esc(row.sourceName)+source+
      ' · '+(row.method==="manual"?"إدخال مشرف":"مصدر إلكتروني")+'</p>';
  }
  return '<article><h3>'+item.icon+' '+esc(item.label)+'</h3>'+
    '<p class="note">لكل '+esc(item.unit)+' · ليرة سورية جديدة</p>'+prices+'</article>';
}
function refreshCards(){
  records=summarizeMarketRecords(rawRows,{now:Date.now()});
  const list=node("#sq-market-cards");
  if(list)list.innerHTML=MARKET_DEFINITIONS.map(card).join("");
  const line=node("#sq-market-loading");
  if(line)line.textContent=failed?"تعذّر تحديث بيانات السوق المحلية. افحص اتصال الإنترنت.":
    loading?"جارٍ تحميل الأسعار...":fromCache?"بيانات محفوظة محلياً؛ قد لا تكون أحدث الأسعار.":
    "آخر تحقق: "+datetime(Date.now())+" (دمشق)";
}
function editorMarkup(){
  return '<details id="sq-market-editor"><summary>🛠️ إدارة الأسعار — للمشرف المختص</summary>'+
    '<p class="note">أدخل السعر بالليرة السورية الجديدة وحدد مصدره وتاريخ المعلومة. يُطلب رابط النشرة الرسمية لسعر الدولار الرسمي.</p>'+
    '<form id="sq-market-form">'+
    '<label>الخانة<select name="id">'+
    MARKET_DEFINITIONS.map(item=>'<option value="'+item.id+'">'+esc(item.label)+'</option>').join("")+
    '</select></label><div class="form-grid">'+
    '<label>سعر الشراء<input name="buy" type="number" required min="0.01" max="1000000000" step="0.01"></label>'+
    '<label>سعر المبيع<input name="sell" type="number" required min="0.01" max="1000000000" step="0.01"></label></div>'+
    '<label>اسم المصدر<input name="sourceName" required maxlength="120"></label>'+
    '<label>رابط المصدر (إلزامي للسعر الرسمي)<input name="sourceUrl" type="url" maxlength="400" placeholder="https://..."></label>'+
    '<label>توقيت المعلومة<input name="observedAt" type="datetime-local" required></label>'+
    '<button type="submit">حفظ السعر المنشور</button><p id="sq-market-save-state" role="status" class="note"></p>'+
    '</form></details>';
}
function fillPriceForm(){
  const form=node("#sq-market-form");
  if(!form)return;
  const row=lookup(form.elements.namedItem("id").value);
  for(const key of ["buy","sell","sourceName","sourceUrl"])
    form.elements.namedItem(key).value=row&&!row.missing?String(row[key]??""):"";
  form.elements.namedItem("observedAt").value=localNow();
}
async function saveRate(event){
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector("button");
  const output=node("#sq-market-save-state");
  button.disabled=true;output.textContent="جارٍ حفظ السعر...";
  try{
    if(!editable||!userId)throw new Error("صلاحية أسعار السويداء غير متاحة");
    const value=name=>form.elements.namedItem(name).value;
    const payload=validateLocalPriceInput({
      id:value("id"),buy:value("buy"),sell:value("sell"),
      sourceName:value("sourceName"),sourceUrl:value("sourceUrl"),
      observedAt:new Date(value("observedAt"))
    });
    await setDoc(doc(db,LOCAL_PRICE_COLLECTION,value("id")),{
      buy:payload.buy,sell:payload.sell,
      sourceName:payload.sourceName,sourceUrl:payload.sourceUrl,
      observedAt:Timestamp.fromMillis(payload.observedAt),
      updatedAt:serverTimestamp(),updatedBy:userId,
      method:"manual",currencyEra:"SYP_NEW"
    });
    output.textContent="تم حفظ السعر، وسيظهر بعد مزامنة Firestore.";
  }catch(error){output.textContent="لم يتم الحفظ: "+(error?.message||"خطأ غير معروف");}
  finally{button.disabled=false;}
}
function showEditor(){
  node("#sq-market-editor")?.remove();
  if(!editable)return;
  node(".wrap").insertAdjacentHTML("beforeend",editorMarkup());
  fillPriceForm();
  node('#sq-market-form [name="id"]').addEventListener("change",fillPriceForm);
  node("#sq-market-form").addEventListener("submit",saveRate);
}
async function updatePermissions(user){
  userId=user?.uid||"";
  editable=false;
  if(!user){showEditor();return;}
  try{
    const profile=await getDoc(doc(db,"users",user.uid));
    const role=profile.exists()?profile.data().role:"user";
    if(role==="admin")editable=true;
    else if(role==="moderator"){
      const assignment=await getDoc(doc(db,"staffAssignments",user.uid));
      editable=assignment.exists()&&assignment.data().active===true&&
        Array.isArray(assignment.data().sectionIds)&&
        assignment.data().sectionIds.includes("market_prices");
    }
  }catch(error){console.warn("SOUQNA market permission read failed",error);}
  if(userId===user.uid)showEditor();
}
function listen(){
  unsubscribe?.();
  failed=false;loading=true;refreshCards();
  unsubscribe=onSnapshot(collection(db,LOCAL_PRICE_COLLECTION),{
    includeMetadataChanges:true
  },snapshot=>{
    loading=false;failed=false;fromCache=snapshot.metadata.fromCache;
    rawRows=snapshot.docs.map(entry=>({id:entry.id,...entry.data()}));
    refreshCards();
  },error=>{
    loading=false;failed=true;
    console.warn("SOUQNA local market quotes unavailable:",error);
    refreshCards();
  });
}
function boot(){
  if(!getApps().length){
    window.addEventListener("souqna:firebase-ready",boot,{once:true});
    return;
  }
  const app=getApp();
  if(app.options.projectId!=="souqna-staging"){root.hidden=true;return;}
  db=getFirestore(app);
  root.hidden=false;
  root.innerHTML='<div class="wrap"><div class="head"><div><h2>💰 أسعار السويداء: الدولار والذهب والفضة</h2>'+
    '<p class="note">معلومات محلية من مصادر مسمّاة. الأسعار غير الرسمية ليست نشرة المصرف المركزي وليست عرضاً ملزماً للبيع أو الشراء.</p>'+
    '</div><button type="button" id="sq-market-refresh">↻ تحديث</button></div>'+
    '<p class="note">كل الأسعار أدناه بالليرة السورية الجديدة (الليرة الجديدة الواحدة = '+
    SYRIAN_OLD_PER_NEW+' ليرة قديمة).</p><p class="note" id="sq-market-loading" role="status"></p>'+
    '<div class="cards" id="sq-market-cards"></div></div>';
  node("#sq-market-refresh").addEventListener("click",listen);
  listen();
  if(!timer)timer=setInterval(refreshCards,60000);
  onAuthStateChanged(getAuth(app),user=>{
    updatePermissions(user).catch(error=>console.warn("SOUQNA prices editor unavailable",error));
  });
}
boot();
