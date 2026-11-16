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
    IC:{cars:"🚗"},Date,Number,String,URL,encodeURIComponent
  });
  const helpersStart=source.indexOf("const safeImageSrc=value=>{");
  const helpersEnd=source.indexOf("const IC=",helpersStart);
  assert(helpersStart>=0&&helpersEnd>helpersStart,"Missing trusted image URL sanitizer");
  vm.runInContext(source.slice(helpersStart,helpersEnd),ctx,{filename:"image-safety.js"});
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

test("approved branding files can be previewed without replacing the screenshot-approved layout",()=>{
  assert.match(source,/logo_bag\.webp/);
  assert.match(source,/sweida_approved_hero_clean\.webp/);
  assert.match(source,/id="brand-preview-logo"/);
  assert.match(source,/id="brand-preview-banner"/);
  assert.match(source,/id="brand-image-status"/);
  assert.match(source,/newImg\.src=encoded/);
  assert.match(source,/src="\$\{esc\(tmp\.logo\|\|site\.logo/);
});
test("owner branding imports have bounded file size, dimensions and compression",()=>{
  assert.match(source,/function pick\(f,k,w\)/);
  assert.match(source,/f\.size>8\*1024\*1024/);
  assert.match(source,/encoded\.length>220000/);
  assert.match(source,/toDataURL\("image\/webp",\.78\)/);
  assert.match(source,/imageProcessing\)return toast/);
});
test("privileged callables give explicit setup feedback if App Check is missing",()=>{
  assert.match(source,/const verifiedCall=\(name,data\)=>appCheckInitialized/);
  assert.match(source,/Firebase App Check بالمفتاح العام/);
  assert.match(source,/getIdTokenResult\(auth\.currentUser,true\)/);
  assert.match(source,/data-a="refreshrole"/);
});

test("marketplace cards never interpolate raw image URLs into style HTML",()=>{
  const start=source.indexOf("function card(a,m){");
  const end=source.indexOf("function drawDesktopNav(){",start);
  assert(start>=0&&end>start);
  const markup=source.slice(start,end);
  assert.match(markup,/safeImageSrc\(a\.img\)/);
  assert.doesNotMatch(markup,/style="\$\{a\.img\?/);
  assert.doesNotMatch(markup,/background-image:url\(\$\{a\.img\}\)/);
  assert.match(source,/const stImg=\(s,k\)=>safeBackgroundImage\(s\[k\]\)/);
});
test("unsafe image schemes are rejected by the actual client sanitizer",()=>{
  const helperStart=source.indexOf("const safeImageSrc=value=>{");
  const helperEnd=source.indexOf("const IC=",helperStart);
  const context=vm.createContext({URL,esc:escapeHtml,encodeURI,encodeURIComponent});
  vm.runInContext(source.slice(helperStart,helperEnd)+"\nthis.safeImageSrc=safeImageSrc;this.safeBackgroundImage=safeBackgroundImage;",context);
  for(const value of ["javascript:alert(1)","data:image/svg+xml,<svg onload=alert(1)>","http://example.com/a.jpg",'https://example.com/pic.png" onerror="alert(1)']){
    if(value.includes("https://")){
      const rendered=context.safeBackgroundImage(value);
      assert(!rendered.includes('" onerror="'));
    }else{
      assert.equal(context.safeImageSrc(value),"");
    }
  }
  assert.equal(context.safeImageSrc("https://example.com/cars/1.webp"),"https://example.com/cars/1.webp");
});

function runMarketFilter(input,options={}){
  const start=source.indexOf("const arabicSearch=value=>");
  const end=source.indexOf("function drawList(){",start);
  assert(start>=0&&end>start,"Marketplace filter must exist");
  const context=vm.createContext({
    String,Number,Array,Date,
    isF:a=>Number(a.featuredUntil||0)>Date.now(),
    catName:cat=>({cars:"مركبات",real_estate:"عقارات"}[cat]||cat)
  });
  vm.runInContext(source.slice(start,end),context,{filename:"market-filter.js"});
  return JSON.parse(JSON.stringify(context.filteredMarketAds(input,options)));
}
test("Arabic marketplace search accepts letter variants and finds title, area and category",()=>{
  const listings=[
    {id:"1",cat:"cars",title:"سيارة أحمد",area:"السويداء",desc:"نظيفة",price:100,cur:"$",createdAt:3},
    {id:"2",cat:"real_estate",title:"أرض",area:"شهبا",desc:"للبيع",price:500,cur:"$",createdAt:4}
  ];
  assert.equal(runMarketFilter(listings,{search:"احمد"}).length,1);
  assert.equal(runMarketFilter(listings,{search:"اراض",category:"cars"}).length,0);
  assert.equal(runMarketFilter(listings,{area:"شَهبا"}).length,1);
  assert.equal(runMarketFilter(listings,{search:"عقارات"}).length,1);
});
test("price ranges are applied only to the selected currency",()=>{
  const listings=[
    {id:"1",cat:"cars",title:"A",price:50,cur:"$",createdAt:1},
    {id:"2",cat:"cars",title:"B",price:200,cur:"$",createdAt:2},
    {id:"3",cat:"cars",title:"C",price:200,cur:"ل.س",createdAt:3}
  ];
  assert.deepEqual(runMarketFilter(listings,{currency:"$",minPrice:100,maxPrice:250}).map(x=>x.id),["2"]);
  assert.equal(runMarketFilter(listings,{currency:"all",minPrice:100,maxPrice:250}).length,3);
});
test("listing results can sort by price or recency without altering source data",()=>{
  const listings=[
    {id:"a",cat:"cars",title:"A",price:300,cur:"$",createdAt:2},
    {id:"b",cat:"cars",title:"B",price:100,cur:"$",createdAt:4},
    {id:"c",cat:"cars",title:"C",price:200,cur:"$",createdAt:3}
  ];
  assert.deepEqual(runMarketFilter(listings,{sort:"priceAsc"}).map(x=>x.id),["b","c","a"]);
  assert.deepEqual(runMarketFilter(listings,{sort:"priceDesc"}).map(x=>x.id),["a","c","b"]);
  assert.deepEqual(runMarketFilter(listings,{sort:"oldest"}).map(x=>x.id),["a","c","b"]);
});
test("featured listings remain prominent for default order",()=>{
  const listings=[
    {id:"old-featured",cat:"cars",title:"A",price:50,cur:"$",createdAt:1,featuredUntil:Date.now()+86400000},
    {id:"new-normal",cat:"cars",title:"B",price:50,cur:"$",createdAt:9999999}
  ];
  assert.equal(runMarketFilter(listings,{sort:"latest"})[0].id,"old-featured");
  assert.deepEqual(runMarketFilter(listings,{featured:true}).map(x=>x.id),["old-featured"]);
});
test("screenshot-consistent controls include accessible search, filters and 12-item paging",()=>{
  for(const id of ["q","ad-sort","ad-currency","ad-area","ad-min","ad-max","ad-results-meta","ad-pages","list"])
    assert(source.includes('id="'+id+'"'),"Missing marketplace control "+id);
  assert.match(source,/const adsPerPage=12/);
  assert.match(source,/data-a="clearfilters"/);
  assert.match(source,/data-a="adpage"/);
  assert.match(source,/document\.addEventListener\("input",updateAdFilter\)/);
  assert.match(source,/data-a="more"/);
});

test("new registration waits for its user profile before showing account dashboard",()=>{
  const start=source.indexOf('if(a=="auth"){');
  const end=source.indexOf('else if(a=="reset")',start);
  assert(start>=0&&end>start,"Could not locate registration handler");
  const authBlock=source.slice(start,end);
  assert.match(authBlock,/createUserWithEmailAndPassword/);
  assert.match(authBlock,/const profile=\{name:n,email:u\.user\.email,role:"user",stars:0\}/);
  const write=authBlock.indexOf('await setDoc(doc(db,"users",u.user.uid),profile)');
  const read=authBlock.indexOf('await loadMine()');
  const render=authBlock.indexOf('view="acc";mode="login";render()');
  assert(write>=0&&read>write&&render>read,"Registration must persist profile before refreshing UI");
  assert.match(authBlock,/adminClaim:false/);
  assert.match(authBlock,/auth\.currentUser\?\.uid===u\.user\.uid/);
});

test("ad photo selection has a bounded WebP preview and rejects unsafe files",()=>{
  assert.match(source,/function shrink\(file\)/);
  assert.match(source,/image\/jpeg","image\/png","image\/webp/);
  assert.match(source,/file\.size>8\*1024\*1024/);
  assert.match(source,/toDataURL\("image\/webp"/);
  assert.match(source,/output\.length<=180000/);
  assert.match(source,/URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(source,/id="ad-photo-status"/);
  assert.match(source,/id="ad-photo-preview"/);
  assert.match(source,/await adImageTask/);
});
test("ad submission requires valid price and cannot execute twice",()=>{
  assert.match(source,/let adImageTask=null,adPhotoError="",adImageVersion=0,adSubmitting=false/);
  assert.match(source,/if\(!val\("#a-price"\)\|\|!Number\.isFinite\(amount\)/);
  assert.match(source,/if\(adSubmitting\)return toast\("الإعلان قيد الإرسال/);
  assert.match(source,/adSubmitting=true;b\.disabled=true/);
  assert.match(source,/finally\{adSubmitting=false;b\.disabled=false\}/);
});
