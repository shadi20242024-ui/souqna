import { renderGuide, GUIDE_TABS } from "./souqna-guide.js";

const categories=[
  {id:"all",label:"الكل",icon:"✦",image:""},
  {id:"cars",label:"السيارات",icon:"🚗",image:"cars"},
  {id:"real_estate",label:"العقارات",icon:"🏠",image:"real_estate"},
  {id:"electronics",label:"الإلكترونيات",icon:"📱",image:"electronics"},
  {id:"furniture",label:"الأثاث",icon:"🛋️",image:"furniture"},
  {id:"jobs",label:"الوظائف",icon:"💼",image:"jobs"},
  {id:"services",label:"الخدمات",icon:"🛠️",image:"services"},
  {id:"fashion",label:"الأزياء",icon:"👕",image:"fashion"},
  {id:"community",label:"المجتمع",icon:"🤝",image:"community"},
  {id:"lost_found",label:"المفقودات",icon:"🔎",image:"lost_found"},
  {id:"misc",label:"متفرقات",icon:"📦",image:"misc"}
];
const initial=[
  {id:"example-car",cat:"cars",title:"سيارة مستعملة – نموذج إعلان",area:"السويداء",price:"سعر تجريبي",featured:true},
  {id:"example-house",cat:"real_estate",title:"شقة سكنية – نموذج إعلان",area:"شهبا",price:"السعر للتوضيح",featured:false},
  {id:"example-phone",cat:"electronics",title:"هاتف ذكي – نموذج إعلان",area:"السويداء",price:"سعر تجريبي",featured:false},
  {id:"example-sofa",cat:"furniture",title:"مجموعة أثاث منزلي – مثال",area:"صلخد",price:"سعر تجريبي",featured:false},
  {id:"example-job",cat:"jobs",title:"إعلان وظيفة تجريبي – غير حقيقي",area:"السويداء",price:"تفاصيل تجريبية",featured:false},
  {id:"example-service",cat:"services",title:"خدمة صيانة – نموذج توضيحي",area:"القريا",price:"حسب الطلب",featured:false}
];
const state={page:"home",cat:"all",search:"",detail:null,guide:"how",favorites:new Set(),ads:initial.slice(),message:"",adminSection:"dashboard"};
const demoReviews=[
  {id:"review-car",kind:"إعلان",title:"سيارة للبيع – طلب تجريبي",applicant:"مستخدم تجريبي 01",status:"pending"},
  {id:"review-store",kind:"متجر",title:"معرض سيارات – طلب تجريبي",applicant:"مستخدم تجريبي 02",status:"pending"},
  {id:"review-job",kind:"وظيفة",title:"مطلوب موظف – طلب تجريبي",applicant:"مستخدم تجريبي 03",status:"pending"},
  {id:"review-banner",kind:"بنر",title:"بنر إعلاني – طلب تجريبي",applicant:"مستخدم تجريبي 04",status:"pending"}
];
const adminModules=[
  ["dashboard","نظرة عامة","📊"],["reviews","المراجعات","🛡️"],["stores","المتاجر","🏪"],
  ["payments","النجوم والدفعات","⭐"],["users","المستخدمون","👥"],
  ["categories","الأقسام","🗂️"],["settings","الإعدادات","⚙️"]
];
const reviewStatus=s=>s==="approved"?"مقبول (تجريبي)":s==="rejected"?"مرفوض (تجريبي)":"قيد المراجعة";
const $=selector=>document.querySelector(selector);
const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const cat=id=>categories.find(c=>c.id===id)||categories[categories.length-1];
const picture=(id,scene=true)=>"assets/category-photos/"+(cat(id).image||"misc")+(scene?"-scene":"")+".webp";
const tabs=[["home","الرئيسية","⌂"],["ads","الإعلانات","▦"],["add","أضف إعلان","＋"],["stores","المتاجر","▣"],["guide","المساعدة","?"],["admin","المدير","⚙"]];
const sampleStores=[
  {name:"معرض سيارات – مثال",cat:"cars",description:"هذه بطاقة متجر تجريبية لعرض شكل المتاجر داخل سوقنا."},
  {name:"عقارات السويداء – مثال",cat:"real_estate",description:"متجر توضيحي، لا يمثل جهة تجارية حقيقية."},
  {name:"أثاث المنزل – مثال",cat:"furniture",description:"مثال لاستقلالية كل متجر وباقته عن المتاجر الأخرى."}
];
function cards(items){
  if(!items.length)return '<div class="demo-empty">لا توجد نتائج مطابقة. جرّب قسماً آخر أو غيّر عبارة البحث.</div>';
  return '<div class="demo-grid">'+items.map(item=>{
    const c=cat(item.cat),fav=state.favorites.has(item.id);
    return '<article class="demo-listing">'+
      '<button class="demo-cover" data-demo="detail" data-id="'+esc(item.id)+'" aria-label="عرض الإعلان">'+
      '<img src="'+picture(item.cat)+'" alt="" loading="lazy">'+
      (item.featured?'<span class="demo-featured">✦ إعلان مميز – مثال</span>':'')+'</button>'+
      '<div class="demo-listing-body"><div class="demo-mini">'+esc(c.icon+" "+c.label)+' · '+esc(item.area)+'</div>'+
      '<h3>'+esc(item.title)+'</h3><p>'+esc(item.price)+'</p>'+
      '<div class="demo-listing-actions"><button class="demo-btn demo-primary" data-demo="detail" data-id="'+esc(item.id)+'">التفاصيل</button>'+
      '<button class="demo-btn demo-subtle" data-demo="favorite" data-id="'+esc(item.id)+'" aria-label="إضافة إلى المفضلة">'+(fav?"♥ محفوظ":"♡ حفظ")+'</button></div></div></article>';
  }).join("")+'</div>';
}
function filtered(){
  const q=state.search.trim().toLowerCase();
  return state.ads.filter(item=>(state.cat==="all"||item.cat===state.cat)&&
    (!q||(item.title+" "+item.area+" "+cat(item.cat).label).toLowerCase().includes(q)));
}
function categoriesHtml(){
  return '<div class="demo-categories">'+categories.map(c=>
    '<button class="demo-category'+(state.cat===c.id?" selected":"")+'" data-demo="category" data-id="'+c.id+'"><span>'+c.icon+'</span>'+c.label+'</button>'
  ).join("")+'</div>';
}
function home(){
  return '<section class="demo-hero"><div><span class="demo-eyebrow">SOUQNA · السويداء</span>'+
    '<h1>كل ما تحتاجه في السويداء، بمكان واحد</h1><p>استعرض تجربة التصميم والأقسام والإعلانات والمتاجر. جميع المحتويات المعروضة هنا أمثلة توضيحية وليست إعلانات حقيقية.</p>'+
    '<button class="demo-btn demo-gold" data-demo="page" data-id="ads">استكشف الإعلانات</button> <button class="demo-btn demo-subtle" data-demo="page" data-id="admin">شاهد لوحة المدير</button></div>'+
    '<img src="assets/souqna-3d-mark.webp" alt="شعار سوقنا" width="156" height="156"></section>'+
    '<section class="demo-section"><div class="demo-section-head"><h2>أقسام سوقنا</h2><span>١٠ أقسام تجريبية</span></div>'+categoriesHtml()+'</section>'+
    '<section class="demo-section"><div class="demo-section-head"><h2>نماذج الإعلانات</h2><button data-demo="page" data-id="ads">عرض الكل</button></div>'+cards(filtered().slice(0,6))+'</section>'+
    '<div class="demo-promo"><div><b>هل تريد تجربة إضافة إعلان؟</b><p>أنشئ إعلاناً وهمياً يظهر في هذه الجلسة فقط، دون تسجيل ودون حفظ بياناتك.</p></div>'+
    '<button class="demo-btn demo-gold" data-demo="page" data-id="add">جرّب الإضافة</button></div>';
}
function ads(){
  return '<div class="demo-section-head"><div><h1>الإعلانات</h1><p class="demo-muted">بيانات توضيحية فقط • لا توجد إعلانات للبيع فعلياً في هذه النسخة</p></div>'+
    '<button class="demo-btn demo-primary" data-demo="page" data-id="add">＋ أضف مثالاً</button></div>'+
    '<label class="demo-search-label" for="previewSearch">ابحث داخل الإعلانات التجريبية</label>'+
    '<input class="demo-search" id="previewSearch" type="search" placeholder="مثلاً: سيارة أو عقار..." value="'+esc(state.search)+'">'+
    categoriesHtml()+'<p class="demo-muted">عدد النتائج: '+filtered().length+'</p>'+cards(filtered());
}
function detail(){
  const item=state.ads.find(x=>x.id===state.detail);
  if(!item)return '<div class="demo-empty">لم يُعثر على هذا المثال.</div>';
  return '<button class="demo-link-back" data-demo="page" data-id="ads">‹ العودة إلى الإعلانات</button>'+
    '<div class="demo-detail"><img src="'+picture(item.cat)+'" alt="صورة قسم '+esc(cat(item.cat).label)+'">'+
    '<div><span class="demo-mini">بيانات وهمية – '+esc(cat(item.cat).label)+'</span><h1>'+esc(item.title)+'</h1>'+
    '<p class="demo-price">'+esc(item.price)+'</p><p>المنطقة: '+esc(item.area)+'</p>'+
    '<p>هذا نموذج يوضح كيفية عرض الإعلان والصور والتصنيفات في سوقنا. لا توجد جهة معلنة حقيقية أو رقم هاتف للتواصل.</p>'+
    '<button class="demo-btn demo-primary" data-demo="favorite" data-id="'+esc(item.id)+'">'+(state.favorites.has(item.id)?"♥ إزالة من المفضلة":"♡ إضافة إلى المفضلة")+'</button></div></div>';
}
function stores(){
  return '<div class="demo-section-head"><div><h1>المتاجر</h1><p class="demo-muted">يمكن للحساب الواحد امتلاك متاجر متعددة؛ لكل متجر باقته واشتراكه المستقل.</p></div></div>'+
  '<div class="demo-grid">'+sampleStores.map(s=>'<article class="demo-store"><img src="'+picture(s.cat)+'" alt="" loading="lazy">'+
    '<div><h3>'+esc(s.name)+'</h3><p>'+esc(s.description)+'</p><span>متجر توضيحي غير منشور</span></div></article>').join("")+'</div>'+
  '<div class="demo-promo"><div><b>إدارة المتاجر الحقيقية</b><p>إنشاء المتاجر والاشتراكات وصلاحيات المالك تحتاج إلى اتصال Firebase، وهي معطّلة هنا.</p></div>'+
  '<button class="demo-btn demo-subtle" data-demo="page" data-id="account">تفاصيل الحساب</button></div>';
}
function add(){
  return '<div class="demo-section-head"><div><h1>تجربة إضافة إعلان</h1><p class="demo-muted">لن يُرسل هذا النموذج إلى خادم، ولن تُحفظ البيانات بعد تحديث الصفحة.</p></div></div>'+
  '<form class="demo-form" id="previewForm" autocomplete="off">'+
  '<label for="demoTitle">عنوان المثال</label><input required id="demoTitle" maxlength="100" minlength="3" placeholder="مثلاً: سيارة – نموذج للمعاينة">'+
  '<label for="demoCat">القسم</label><select id="demoCat">'+categories.filter(c=>c.id!=="all").map(c=>'<option value="'+c.id+'">'+esc(c.label)+'</option>').join("")+'</select>'+
  '<label for="demoPrice">عبارة السعر (تجريبية)</label><input id="demoPrice" maxlength="45" placeholder="مثلاً: سعر تجريبي" value="سعر تجريبي">'+
  '<div class="demo-form-note">هذا اختبار للواجهة فقط. لا تدخل رقم هاتف أو معلومات شخصية أو بيانات دفع.</div>'+
  '<button type="submit" class="demo-btn demo-primary">إنشاء إعلان تجريبي</button></form>';
}
function account(){
  return '<div class="demo-section-head"><div><h1>حسابي</h1><p class="demo-muted">نسخة عامة لتجربة التصميم، ولا تتصل بالمستخدمين الحقيقيين.</p></div></div>'+
    '<div class="demo-empty"><b>التسجيل والدخول معطلان عمداً في المعاينة</b><p>سيعملان بعد اختبار قواعد Firebase والربط بالحسابات في البيئة الحقيقية.</p>'+
    '<p>عدد الإعلانات المحفوظة مؤقتاً: '+state.favorites.size+'</p>'+
    '<button class="demo-btn demo-primary" data-demo="page" data-id="guide">قراءة الشروط والخصوصية</button></div>';
}
function calculator(){
  return '<div class="demo-section-head"><div><h1>الحاسبة</h1><p class="demo-muted">أداة بسيطة لتجربة واجهة خدمات سوقنا.</p></div></div>'+
    '<form class="demo-form" id="calcForm"><label for="demoCalc">عملية حسابية</label>'+
    '<input id="demoCalc" placeholder="مثلاً 125 + 25" required autocomplete="off">'+
    '<button type="submit" class="demo-btn demo-primary">احسب</button><output id="calcResult" class="demo-output" aria-live="polite"></output></form>';
}

function admin(){
  const pending=demoReviews.filter(x=>x.status==="pending").length;
  const reviewRows=()=>'<div class="demo-admin-list">'+demoReviews.map(r=>
    '<div class="demo-admin-row"><div><small>'+esc(r.kind)+' · '+esc(r.applicant)+'</small><strong>'+esc(r.title)+'</strong>'+
    '<span class="demo-review-state '+r.status+'">'+reviewStatus(r.status)+'</span></div><div class="demo-admin-actions">'+
    (r.status==="pending"?
      '<button class="demo-btn demo-primary" data-demo="admin-decision" data-id="'+r.id+'" data-value="approved">قبول</button>'+
      '<button class="demo-btn demo-subtle" data-demo="admin-decision" data-id="'+r.id+'" data-value="rejected">رفض</button>':
      '<button class="demo-btn demo-subtle" data-demo="admin-decision" data-id="'+r.id+'" data-value="pending">إعادة للمراجعة</button>')+
    '</div></div>').join("")+'</div>';
  const dashboard='<div class="demo-admin-kpis">'+[
    ["الإعلانات التجريبية",state.ads.length,"📢"],["طلبات تنتظر المراجعة",pending,"🛡️"],
    ["متاجر أمثلة",sampleStores.length,"🏪"],["دفعات حقيقية",0,"🔒"]
  ].map(([name,value,icon])=>'<div class="demo-admin-kpi"><span>'+icon+'</span><strong>'+value+'</strong><small>'+name+'</small></div>').join("")+'</div>'+
    '<div class="demo-admin-panel"><h2>أحدث طلبات المراجعة</h2>'+reviewRows()+'</div>';
  const titles={
    reviews:"مراجعة الإعلانات والمتاجر",stores:"المتاجر والاشتراكات التجريبية",
    payments:"النجوم وطلبات الشحن",users:"المستخدمون والصلاحيات",
    categories:"إدارة الأقسام",settings:"إعدادات سوقنا"
  };
  let moduleHtml="";
  if(state.adminSection==="reviews")moduleHtml=reviewRows();
  if(state.adminSection==="stores")moduleHtml='<div class="demo-admin-list">'+sampleStores.map((store,i)=>
    '<div class="demo-admin-row"><div><small>متجر مثال '+(i+1)+'</small><strong>'+esc(store.name)+'</strong>'+
    '<span>باقة مستقلة لكل متجر • غير حقيقي</span></div><span class="demo-review-state approved">تجريبي</span></div>').join("")+'</div>';
  if(state.adminSection==="payments")moduleHtml='<div class="demo-admin-list"><div class="demo-admin-row"><div><small>الطلب #DEMO-001</small>'+
    '<strong>طلب شحن نجوم – مثال فقط</strong><span>لا توجد وسيلة دفع ولا تحويلات مالية في المعاينة</span></div>'+
    '<span class="demo-review-state pending">غير مدفوع</span></div></div>';
  if(state.adminSection==="users")moduleHtml='<div class="demo-admin-list"><div class="demo-admin-row"><div><small>حساب وهمي</small><strong>شادي – اسم العرض فقط</strong>'+
    '<span>مدير العرض • لا توجد صلاحيات أو حساب Firebase حقيقي</span></div><span class="demo-review-state approved">عرض فقط</span></div>'+
    '<div class="demo-admin-row"><div><small>حساب وهمي</small><strong>مشرف الوظائف</strong><span>صلاحية قسم الوظائف في العرض فقط</span></div></div></div>';
  if(state.adminSection==="categories")moduleHtml=categoriesHtml()+
    '<p class="demo-muted">يمكن للمدير الحقيقي تنظيم الأقسام بعد تسجيل الدخول المصرح له. التغييرات في العرض لا تحفظ.</p>';
  if(state.adminSection==="settings")moduleHtml='<div class="demo-admin-list"><div class="demo-admin-row"><div><small>الهوية</small><strong>سوقنا – SOUQNA</strong>'+
    '<span>الاسم المعروض للمشغّل: شادي فقط</span></div></div><div class="demo-admin-row"><div><small>خدمة العملاء</small>'+
    '<strong>shadi20242024@gmail.com</strong><span>هذا عنوان للتواصل، وليس حساب دخول في هذه المعاينة</span></div></div>'+
    '<div class="demo-admin-row"><div><small>الحالة</small><strong>معاينة غير متصلة بالخادم</strong>'+
    '<span>Cloud Functions / Firebase Auth / Firestore معطلة هنا</span></div></div></div>';
  return '<div class="demo-section-head"><div><h1>لوحة تحكم سوقنا – نسخة عرض</h1>'+
    '<p class="demo-muted">جميع الإحصائيات والمستخدمين والمراجعات والقرارات وهمية، ولا تؤثر في أي إعلان أو حساب حقيقي.</p></div></div>'+
    '<div class="demo-admin-layout"><aside class="demo-admin-sidebar">'+adminModules.map(([id,label,icon])=>
    '<button data-demo="admin-section" data-id="'+id+'" class="'+(state.adminSection===id?"active":"")+'"><span>'+icon+'</span>'+label+'</button>').join("")+
    '</aside><div class="demo-admin-main">'+(state.adminSection==="dashboard"?dashboard:
      '<div class="demo-admin-panel"><h2>'+esc(titles[state.adminSection]||"لوحة المدير")+'</h2>'+moduleHtml+'</div>')+
    '<p class="demo-admin-disclaimer">تنبيه: هذه واجهة محاكاة للمدير. لا تنشئ حسابات ولا توافق على إعلانات حقيقية ولا تخصم رصيداً.</p>'+
    '</div></div>';
}

function render(){
  const title=state.page==="detail"?"تفاصيل الإعلان":state.page==="guide"?"المساعدة":state.page==="account"?"حسابي":
    state.page==="add"?"إضافة إعلان":state.page==="stores"?"المتاجر":state.page==="calculator"?"الحاسبة":state.page==="admin"?"لوحة المدير":"سوقنا";
  document.title=title+" | سوقنا – معاينة";
  $("#desktopBar").innerHTML='<div class="demo-desktop-head"><img src="assets/souqna-3d-mark.webp" alt="" width="48" height="48">'+
    '<strong>سوقنا <small>SOUQNA</small></strong><div class="demo-desktop-links">'+
    tabs.map(t=>'<button data-demo="page" data-id="'+t[0]+'" class="'+(state.page===t[0]?"active":"")+'">'+t[1]+'</button>').join("")+
    '<button data-demo="page" data-id="calculator">الحاسبة</button></div></div>';
  $("#hd").innerHTML='<div class="demo-mobile-head"><img src="assets/souqna-3d-mark.webp" alt="" width="44" height="44">'+
    '<strong>سوقنا</strong><span>معاينة تجريبية</span></div>';
  const content=state.page==="home"?home():state.page==="ads"?ads():state.page==="detail"?detail():
    state.page==="stores"?stores():state.page==="add"?add():state.page==="guide"?renderGuide(state.guide):
    state.page==="calculator"?calculator():state.page==="admin"?admin():account();
  $("#app").innerHTML='<div class="demo-app"><div class="demo-page-note" role="status">نسخة عرض تجريبي: كل البيانات وهمية. لا تسجيل أو شراء أو نشر فعلي.</div>'+content+
    '<footer class="demo-footer">© سوقنا – نسخة معاينة · <a href="mailto:shadi20242024@gmail.com">shadi20242024@gmail.com</a></footer></div>';
  $("#nav").innerHTML=tabs.map(t=>'<button data-demo="page" data-id="'+t[0]+'" class="'+(state.page===t[0]?"on":"")+'"><i>'+t[2]+'</i>'+t[1]+'</button>').join("");
  if(state.message){const el=document.createElement("div");el.className="demo-toast";el.setAttribute("role","status");el.textContent=state.message;document.body.append(el);state.message="";setTimeout(()=>el.remove(),2400);}
}
document.addEventListener("click",e=>{
  const target=e.target.closest("[data-demo],[data-v],[data-a]");
  if(!target)return;
  const action=target.dataset.demo||target.dataset.v||target.dataset.a;
  const id=target.dataset.id;
  if(action==="page"){state.page=id;state.detail=null;if(id==="ads")state.cat="all";}
  else if(action==="category"){state.cat=id;state.page="ads";}
  else if(action==="detail"){state.detail=id;state.page="detail";}
  else if(action==="favorite"){
    if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);
    state.message="تم تحديث المفضلة مؤقتاً في هذه المعاينة";
  }
  else if(action==="admin-section"){if(adminModules.some(x=>x[0]===id)){state.adminSection=id;state.page="admin";}}
  else if(action==="admin-decision"){
    const item=demoReviews.find(x=>x.id===id),value=target.dataset.value;
    if(item&&["approved","rejected","pending"].includes(value)){
      item.status=value;
      state.message="تم تحديث الطلب الوهمي داخل هذه الجلسة فقط";
    }
  }
  else if(action==="guide-tab"||action==="guide-open"){state.guide=id;state.page="guide";}
  else if(action==="home"||action==="stores"||action==="add"){state.page=action;}
  else return;
  render();
  window.scrollTo({top:0,behavior:"smooth"});
});
document.addEventListener("input",e=>{
  if(e.target.id==="previewSearch"){
    state.search=e.target.value;
    const content=$("#app");
    const list=content?.querySelector(".demo-grid");
    const counter=content?.querySelector(".demo-muted + .demo-grid");
    if(list){
      const wrapper=document.createElement("div");
      wrapper.innerHTML=cards(filtered());
      list.replaceWith(wrapper.firstElementChild);
    }else{
      render();$("#previewSearch")?.focus();
    }
    const label=content?.querySelector(".demo-result-count");if(label)label.textContent="عدد النتائج: "+filtered().length;
  }
});
document.addEventListener("submit",e=>{
  if(e.target.id==="previewForm"){
    e.preventDefault();
    const title=$("#demoTitle")?.value.trim()||"";
    const category=$("#demoCat")?.value;
    const price=$("#demoPrice")?.value.trim()||"سعر تجريبي";
    if(title.length<3||title.length>100||!categories.some(c=>c.id===category)){state.message="تحقق من بيانات المثال";render();return;}
    state.ads.unshift({id:"local-"+Date.now(),cat:category,title:title,area:"مثال محلي لهذه الجلسة",price,featured:false});
    state.search="";state.cat="all";state.page="ads";state.message="تم إنشاء المثال داخل المتصفح فقط. لن يظهر للآخرين.";
    render();window.scrollTo(0,0);
  }else if(e.target.id==="calcForm"){
    e.preventDefault();
    const value=$("#demoCalc")?.value.trim()||"";
    const result=$("#calcResult");
    const match=value.match(/^\s*(\d+(?:\.\d+)?)\s*([+\-*\/])\s*(\d+(?:\.\d+)?)\s*$/);
    if(!match){result.textContent="اكتب عملية بسيطة مثل 100 + 25";return;}
    const a=Number(match[1]),b=Number(match[3]),op=match[2];
    const answer=op==="+"?a+b:op==="-"?a-b:op==="*"?a*b:b===0?NaN:a/b;
    result.textContent=Number.isFinite(answer)?"النتيجة: "+answer.toLocaleString("ar"): "تعذر إجراء العملية";
  }
});
render();
