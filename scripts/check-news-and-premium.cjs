"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("index.html","utf8");
const start=source.indexOf("function souqnaShortcutsHtml(){");
const end=source.indexOf("function dirHtml(){",start);
assert(start>=0&&end>start,"News and sponsor rendering helpers must exist");
const helpers=source.slice(start,end);
const now=Date.now();
const escapeHtml=value=>String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function view(input={}){
  const data={
    site:{tickerOn:true,showPharmacies:true,showFuel:true,showOffers:true,tickerSpeed:32},
    dr:[],ads:[],sp:[],wa:"",spi:0,wx:null,
    Date,Object,Number,String,Math,
    isF:a=>a.featuredUntil>now,
    esc:escapeHtml,
    waLink:()=> "https://wa.me/123456789",
    ...input
  };
  const context=vm.createContext(data);
  vm.runInContext(helpers,context,{filename:"souqna-news-and-banners.js"});
  return context;
}

test("news rail is independent of homepage and stays in all views",()=>{
  assert.match(source,/id="newsbar"/);
  assert.match(source,/news\.innerHTML=tkHtml\(\)/);
  assert(!source.includes("\${tkHtml()}\${wxHtml()}"),"News ticker should not be duplicated in homepage");
});
test("admin-edited news appears with safe escaped text",()=>{
  const u=view({site:{ticker:"[خبر] تذكير جديد\n[عروض] تخفيضات <script>alert(1)</script>"},dr:[]});
  const html=u.tkHtml();
  assert.match(html,/تذكير جديد/);
  assert.match(html,/تخفيضات &lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});
test("on-duty pharmacies are displayed only while duty is current",()=>{
  const u=view({dr:[
    {type:"pharmacy",name:"الصيدلية الحالية",onDuty:true,dutyUntil:now+3600000},
    {type:"pharmacy",name:"الصيدلية القديمة",onDuty:true,dutyUntil:now-5000},
    {type:"pharmacy",name:"الصيدلية غير المؤكدة",onDuty:true}
  ]});
  const html=u.tkHtml();
  assert.match(html,/الصيدلية الحالية/);
  assert.doesNotMatch(html,/الصيدلية القديمة|الصيدلية غير المؤكدة/);
});
test("fuel notices require recent verified manual update",()=>{
  const u=view({dr:[
    {type:"fuel",name:"محطة حديثة",fuelStatus:"available",statusUpdatedAt:now-60000},
    {type:"fuel",name:"محطة قديمة",fuelStatus:"available",statusUpdatedAt:now-172800000},
    {type:"fuel",name:"محطة مجهولة",fuelStatus:"unknown",statusUpdatedAt:now}
  ]});
  const html=u.tkHtml();
  assert.match(html,/محطة حديثة/);
  assert.doesNotMatch(html,/محطة قديمة|محطة مجهولة/);
});
test("sponsor banner stays hidden without confirmed payment",()=>{
  const u=view({sp:[{company:"غير مدفوع",title:"عرض",active:true,paymentVerified:false,from:now-5000,to:now+86400000}]});
  assert.doesNotMatch(u.spHtml(),/غير مدفوع/);
  assert.match(u.spHtml(),/مساحة إعلانية قابلة للحجز/);
});
test("sponsor banner excludes inactive, future and expired bookings",()=>{
  const base={paymentVerified:true,active:true,from:now-1000,to:now+86400000};
  const u=view({sp:[
    {...base,company:"منتهي",to:now-100},
    {...base,company:"مستقبلي",from:now+86400000},
    {...base,company:"متوقف",active:false}
  ]});
  const html=u.spHtml();
  assert.doesNotMatch(html,/منتهي|مستقبلي|متوقف/);
});
test("paid sponsor banner rotates confirmed creatives",()=>{
  const base={paymentVerified:true,active:true,from:now-1000,to:now+86400000};
  const u=view({sp:[
    {...base,company:"المعلن الأول",title:"العرض الأول",priority:3},
    {...base,company:"المعلن الثاني",title:"العرض الثاني",priority:1}
  ]});
  assert.match(u.spHtml(),/المعلن الأول/);
  u.spi=1;
  assert.match(u.spHtml(),/المعلن الثاني/);
  assert.match(u.spHtml(),/data-a="spnext"/);
});
test("owner controls exist for payment, news speed and station updates",()=>{
  for(const id of ["s-tk","s-tkspeed","s-showpharm","s-showfuel","s-showoffers","p-payment","p-priority"]){
    assert(source.includes('id="'+id+'"'),"Missing owner control: "+id);
  }
  for(const action of ['a=="savesp"','a=="fuelstatus"','a=="savesite"']){
    assert(source.includes(action),"Missing admin handler "+action);
  }
});

test("second Sweida information strip is rendered with live category shortcuts",()=>{
  const u=view({dr:[
    {type:"pharmacy",name:"Duty Test",onDuty:true,dutyUntil:Date.now()+3600000},
    {type:"fuel",name:"Fuel Test",fuelStatus:"available",statusUpdatedAt:Date.now()}
  ]});
  const html=u.tkHtml();
  assert.match(html,/souqna-news-shortcuts/);
  assert.match(html,/الصيدليات المناوبة/);
  assert.match(html,/محطات الوقود/);
  assert.match(html,/أفضل العروض/);
});
test("approved design homepage has a sidebar, cards and hero navigation",()=>{
  assert.match(source,/function approvedHomeHtml\(\)/);
  assert.match(source,/class="souqna-home-layout"/);
  assert.match(source,/class="souqna-aside"/);
  assert.match(source,/class="souqna-promo-strip"/);
  assert.match(source,/class="souqna-list"/);
  assert.match(source,/id="souqna-topnav"/);
});

test("Firebase App Check site key is configurable without shipping a secret",()=>{
  assert(source.includes("initializeAppCheck"),"Firebase client App Check must be initialized");
  assert(source.includes("ReCaptchaV3Provider"),"Public reCAPTCHA v3 provider must be configured");
  assert(source.includes('id="s-appcheck"'),"Owner settings must accept the public site key");
  assert(source.includes("appCheckKey:val"),"Site settings must persist the public site key");
});
test("owner dashboard requires trusted Firebase Auth admin claim",()=>{
  assert(source.includes("getIdTokenResult"),"Admin claim must come from Firebase Auth");
  assert(source.includes("isAdm=()=>me&&me.adminClaim===true"),"Admin UI must not trust profile role alone");
});

test("screenshot-aligned listing cards support authenticated favorites",()=>{
  assert.match(source,/class="favorite-toggle/);
  assert.match(source,/data-a="favorite"/);
  assert.match(source,/data-v="favorites"/);
  assert.match(source,/view=="favorites"/);
  assert.match(source,/savedAdIds=new Set/);
  assert.match(source,/q2\("favorites","userId",me\.uid\)/);
  assert.match(source,/setDoc\(favoriteRef,\{userId:me\.uid,adId:id/);
  assert.match(source,/deleteDoc\(favoriteRef\)/);
  assert.match(source,/onAuthStateChanged\(auth,async u=>\{\s*me=null;savedAdIds=new Set/);
});

function renderAdDetail(ad,savedIds=[]){
  const start=source.indexOf("function approvedAdDetailsHtml(){");
  const end=source.indexOf("function approvedHomeHtml(){",start);
  assert(start>=0&&end>start,"Missing isolated ad detail renderer");
  const ctx=vm.createContext({
    ads:ad?[ad]:[],selectedAdId:ad?.id||"missing",savedAdIds:new Set(savedIds),
    esc:escapeHtml,catName:()=> "مركبات",isF:()=>false,
    IC:{cars:"🚗"},Date,Number,String,encodeURIComponent
  });
  vm.runInContext(source.slice(start,end),ctx,{filename:"ad-details.js"});
  return ctx.approvedAdDetailsHtml();
}
test("public advertisement detail has trustworthy image, seller and WhatsApp action",()=>{
  const html=renderAdDetail({
    id:"car_123",cat:"cars",img:"https://example.com/real-car.jpg",
    title:"سيارة تويوتا",price:1250000,cur:"ل.س",area:"السويداء",
    ownerName:"بائع موثوق",phone:"963912345678",desc:"سيارة بحالة جيدة",createdAt:Date.now()
  },["car_123"]);
  assert.match(html,/ad-details-media/);
  assert.match(html,/سيارة تويوتا/);
  assert.match(html,/https:\/\/example.com\/real-car.jpg/);
  assert.match(html,/https:\/\/wa.me\/963912345678/);
  assert.match(html,/إزالة من المفضلة/);
});
test("public ad detail safely escapes untrusted description",()=>{
  const html=renderAdDetail({
    id:"car_x",cat:"cars",img:"javascript:alert(1)",
    title:'<img src=x onerror="alert(1)">',price:0,cur:"ل.س",
    desc:"<script>bad()</script>",phone:"none"
  });
  assert.doesNotMatch(html,/<script>|<img|src="javascript:/);
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/ad-placeholder/);
  assert.match(html,/رقم التواصل غير متاح/);
});
test("deleted ads show a clean missing-listing state",()=>{
  assert.match(renderAdDetail(null),/الإعلان غير متاح/);
});
test("listing detail is reachable by card controls",()=>{
  assert.match(source,/class="ad-image-open"/);
  assert.match(source,/class="ad-title-open"/);
  assert.match(source,/data-ad="\$\{esc\(a\.id\)\}"/);
  assert.match(source,/view=="adDetail"/);
  assert.match(source,/selectedAdId=detail\.dataset\.ad/);
});
