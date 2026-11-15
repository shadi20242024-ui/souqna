"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("index.html","utf8");
const start=source.indexOf("function tkHtml(){");
const end=source.indexOf("function dirHtml(){",start);
assert(start>=0&&end>start,"News and sponsor rendering helpers must exist");
const helpers=source.slice(start,end);
const now=Date.now();
const escapeHtml=value=>String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function view(input={}){
  const data={
    site:{tickerOn:true,showPharmacies:true,showFuel:true,showOffers:true,tickerSpeed:32},
    dr:[],ads:[],sp:[],wa:"",spi:0,
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
