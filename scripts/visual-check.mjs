import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";

const STAGING = process.env.SOUQNA_VISUAL_STAGING === "1";
const ROOT = STAGING ? resolve(process.cwd(),"dist") : process.cwd();
const screenshotName = name => "artifacts/souqna-" + (STAGING?"staging-":"") + name;
const PROJECT_ID = "demo-souqna-rules";
const MIME = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".webmanifest":"application/manifest+json",
  ".json":"application/json; charset=utf-8"
};
const authImport='import{connectAuthEmulator}from"https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";';
const storeImport='import{connectFirestoreEmulator}from"https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";';
const anchor='const auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"us-central1");';
const stableWeather={
  current:{temperature_2m:21,weather_code:1},
  daily:{temperature_2m_max:[26],temperature_2m_min:[14]}
};
const stubWeather=context=>context.route("https://api.open-meteo.com/**",route=>
  route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(stableWeather)})
);


async function startServer() {
  const server=createServer(async (req,res)=>{
    try {
      const path = decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
      const filename = resolve(ROOT, "."+path+(path.endsWith("/")?"index.html":""));
      if(filename!==ROOT && !filename.startsWith(ROOT+sep)) {
        res.writeHead(403).end(); return;
      }
      let bytes = await readFile(filename);
      if(filename.endsWith("index.html")) {
        let html=bytes.toString("utf8");
        assert.ok(html.includes(anchor),"Firebase startup anchor not found");
        if(STAGING){
          assert.ok(html.includes('"projectId":"demo-souqna-rules"'),"Built staging project must use the isolated emulator ID");
          assert.ok(!html.includes('projectId:"souqna-sweida"'),"Staging bundle leaked production config");
          assert.ok(html.includes('id="souqna-environment-banner"'),"Staging banner is missing");
          assert.ok(html.includes('name="robots" content="noindex,nofollow,noarchive"'),"Staging should be non-indexable");
        }else{
          assert.ok(html.includes('projectId:"souqna-sweida"'),"Original project id not found");
          html=html.replace('projectId:"souqna-sweida"','projectId:"demo-souqna-rules"');
        }
        html=html.replace(anchor,()=>
          authImport+"\n"+storeImport+"\n"+anchor+"\n"+
          'connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});\n'+
          'connectFirestoreEmulator(db,"127.0.0.1",8080);\n'+
          'connectFunctionsEmulator(functions,"127.0.0.1",5001);\n'
        );
        bytes=Buffer.from(html);
      }
      res.writeHead(200,{"Content-Type":MIME[extname(filename)]||"application/octet-stream","Cache-Control":"no-store"});
      res.end(bytes);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  await new Promise(resolve=>server.listen(4173,"127.0.0.1",resolve));
  return server;
}

const env=await initializeTestEnvironment({projectId:PROJECT_ID});
let server,browser;
try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db=ctx.firestore();
    await Promise.all([
      setDoc(doc(db,"categories","cars"),{name_ar:"السيارات",active:true,order:1}),
      setDoc(doc(db,"categories","real_estate"),{name_ar:"العقارات",active:true,order:2}),
      setDoc(doc(db,"categories","electronics"),{name_ar:"الإلكترونيات",active:true,order:3}),
      setDoc(doc(db,"categories","furniture"),{name_ar:"الأثاث",active:true,order:4}),
      setDoc(doc(db,"ads","visual-ad"),{
        title:"سيارة مستعملة للبيع",price:5000,cur:"$",cat:"cars",area:"السويداء",
        desc:"إعلان للمعاينة التجريبية",phone:"963999999999",img:"",
        ownerId:"visual-owner",ownerName:"مستخدم تجريبي",status:"approved",createdAt:Date.now()
      }),
      setDoc(doc(db,"stores","visual-store"),{
        name:"متجر تجريبي",desc:"معاينة واجهة المتاجر",area:"السويداء",
        phone:"963999999999",logo:"",cover:"",
        ownerId:"visual-owner",status:"approved",createdAt:Date.now()
      }),
      setDoc(doc(db,"sponsors","visual-one"),{
        company:"شركة تجريبية أولى",title:"البنر الأول للاختبار",desc:"بانر فعّال للاختبار فقط",
        phone:"963999999999",img:"",active:true,from:Date.now()-1000,to:Date.now()+86400000
      }),
      setDoc(doc(db,"sponsors","visual-two"),{
        company:"شركة تجريبية ثانية",title:"البنر الثاني للاختبار",desc:"بانر فعّال ثانٍ للاختبار فقط",
        phone:"963999999999",img:"",active:true,from:Date.now()-1000,to:Date.now()+86400000
      }),
      setDoc(doc(db,"sponsors","expired-test"),{
        company:"منتهي",title:"البنر المنتهي",desc:"لا يجب أن يظهر",
        phone:"963999999999",img:"",active:true,from:Date.now()-86400000,to:Date.now()-1000
      }),
      setDoc(doc(db,"settings","site"),{
        ticker:"أهلاً بكم في سوقنا\nإعلانات جديدة للسويداء",
        tickerOn:true,tickerSecondary:"خدمات محلية في سوقنا",
        tickerSecondaryOn:true,weatherOn:false,adClient:"",adSlot:""
      })
    ]);
  });
  server=await startServer();
  browser=await chromium.launch({headless:true});
  await mkdir("artifacts",{recursive:true});
  const cases=[
    {name:"desktop",viewport:{width:1440,height:900},mobile:false},
    {name:"mobile",viewport:{width:390,height:844},mobile:true}
  ];
  for(const item of cases) {
    const context=await browser.newContext({viewport:item.viewport,deviceScaleFactor:1,locale:"ar",reducedMotion:"reduce"});
    try {
      await stubWeather(context);
      const page=await context.newPage();
      const errors=[];
      page.on("pageerror",err=>errors.push("PAGE: "+err.message));
      page.on("console",msg=>{if(msg.type()==="error")errors.push("CONSOLE: "+msg.text());});
      page.on("requestfailed",req=>errors.push("REQUEST: "+req.url()+" "+req.failure()?.errorText));
      const response=await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded",timeout:45000});
      assert.equal(response.status(),200);
      if(STAGING){
        await page.locator("#souqna-environment-banner").filter({hasText:"بيئة اختبار سوقنا"}).waitFor({timeout:5000});
        assert.ok((await page.content()).includes('"projectId":"demo-souqna-rules"'));
      }
      try {
        await page.locator("#list .item").first().waitFor({timeout:20000});
      } catch(error) {
        await page.screenshot({path:screenshotName(item.name+"-debug.png"),fullPage:true});
        console.error("VISUAL ERROR",item.name,JSON.stringify(errors).slice(0,3500));
        console.error("VISIBLE CONTENT",(await page.locator("#app").innerText().catch(()=>"")).slice(0,1500));
        throw error;
      }
      assert.equal(await page.locator("#list .item").count(),1);
      assert.ok(await page.locator("text=السيارات").count()>=1);
      const nav=await page.locator("#nav").boundingBox();
      assert.ok(nav,"Navigation not rendered");
      if(item.mobile)assert.ok(nav.y>=item.viewport.height/2,"Mobile navigation should be at bottom");
      else assert.ok(nav.x>item.viewport.width/2,"Desktop navigation should be on the side");
      await page.screenshot({path:screenshotName(item.name+".png"),fullPage:true,animations:"disabled"});
      await page.locator("#newsHost .tk").first().waitFor({timeout:5000});
      const sponsorTitle=page.locator("#spw .premium-banner h3");
      await sponsorTitle.waitFor({timeout:7000});
      const beforeSponsor=await sponsorTitle.innerText();
      await page.locator('#spw [data-a="spnext"]').click();
      assert.notEqual(await sponsorTitle.innerText(),beforeSponsor,"Next sponsored banner must change the slide");
      assert.ok(!(await page.locator("#spw").innerText()).includes("البنر المنتهي"),"Expired sponsored banner must be hidden");
      console.log("SPONSOR CAROUSEL OK",item.name);

      if(item.mobile){
        assert.equal(await page.locator("#desktopBar").isVisible(),false);
        assert.equal(await page.locator('#nav [data-v="ads"]').isVisible(),false);
      }else{
        assert.equal(await page.locator("#desktopBar").isVisible(),true);
        await page.locator('#nav [data-v="ads"]').click();
        await page.locator('#list .item').first().waitFor({timeout:8000});
        await page.locator("#globalSearch").fill("سيارة مستعملة للبيع");
        assert.equal(await page.locator("#list .item").count(),1,"Search must filter ads");
        await page.locator('#nav [data-v="stores"]').click();
        await page.locator("#sl .dr").first().waitFor({timeout:8000});
        await page.locator("#newsHost .tk").first().waitFor({timeout:4000});
        assert.ok((await page.locator("#app").innerText()).includes("متجر تجريبي"));
        await page.screenshot({path:screenshotName("desktop-stores.png"),fullPage:true,animations:"disabled"});
        console.log("PREMIUM NAVIGATION OK", "desktop search, ads and stores; global news across pages");
      }
      assert.deepEqual(errors,[],"Unexpected browser script errors");
      console.log("VISUAL SMOKE OK",item.name,"cards=1","navigation=",JSON.stringify(nav));
    } finally { await context.close(); }
  }

  // Drive the real SOUQNA UI with a customer account; all writes target emulators.
  const customerContext=await browser.newContext({
    viewport:{width:1280,height:900},locale:"ar",reducedMotion:"reduce"
  });
  try {
    await stubWeather(customerContext);
    const page=await customerContext.newPage();
    const failures=[];
    page.on("pageerror",e=>failures.push(e.message));
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded"});
    await page.locator("#list .item").first().waitFor({timeout:20000});
    await page.locator('#nav [data-v="acc"]').click();
    await page.locator('#app [data-a="swap"]').click();
    const email="browser-flow-"+Date.now()+"@example.test";
    await page.locator("#l-name").fill("مستخدم فحص سوقنا");
    await page.locator("#l-mail").fill(email);
    await page.locator("#l-pass").fill("SouqnaTest2026!");
    await page.locator('#app [data-a="auth"]').click();
    await page.locator('#app [data-v="mystores"]').waitFor({timeout:20000});
    assert.equal(await page.locator('#nav [data-v="admin"]').count(),0,
      "Ordinary customers must not have the admin navigation");
    assert.ok((await page.locator("#app").innerText()).includes("مستخدم فحص سوقنا"),
      "Registered user's name should be shown in profile");
    await page.locator('#nav [data-v="home"]').click();
    await page.locator('#list .item [data-a="toggleFav"]').first().waitFor({timeout:15000});
    await page.locator('#list .item [data-a="toggleFav"]').first().click();
    await page.locator('#list .item [data-a="toggleFav"][aria-pressed="true"]').first().waitFor({timeout:12000});
    await page.locator('#nav [data-v="favorites"]').click();
    await page.locator('#app .desktop-page-title h2').filter({hasText:"إعلاناتي المفضلة"}).waitFor({timeout:15000});
    await page.locator('#app .item').filter({hasText:"سيارة مستعملة للبيع"}).waitFor({timeout:15000});
    await page.screenshot({path:screenshotName("favorites.png"),fullPage:true,animations:"disabled"});
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('#list .item [data-a="toggleFav"][aria-pressed="true"]').first().waitFor({timeout:20000});
    await page.locator('#nav [data-v="favorites"]').click();
    await page.locator('#app .desktop-page-title h2').filter({hasText:"إعلاناتي المفضلة"}).waitFor({timeout:15000});
    await page.locator('#app .item [data-a="toggleFav"]').first().click();
    await page.locator('#app .favorite-empty').waitFor({timeout:12000});
    console.log("UI PRIVATE FAVORITES OK","favorite saved, persisted after reload and removed");


    await page.locator('#nav [data-v="add"]').click();
    await page.locator("#a-title").waitFor({timeout:15000});
    await page.locator('#app [data-a="post"]').click();
    await page.locator(".toast").filter({hasText:"تحقق من عنوان الإعلان"}).waitFor({timeout:5000});
    await page.locator("#a-title").fill("إعلان فحص واجهة سوقنا");
    await page.locator("#a-price").fill("1500");
    await page.locator("#a-area").fill("السويداء");
    await page.locator("#a-desc").fill("إعلان تجريبي للمحاكي فقط");
    await page.locator("#a-phone").fill("963999999999");
    await page.locator('#app [data-a="post"]').click();
    await page.locator("#app .item").filter({hasText:"إعلان فحص واجهة سوقنا"}).waitFor({timeout:20000});
    await page.locator('#nav [data-v="acc"]').click();
    await page.locator('#app [data-v="mystores"]').click();
    await page.locator("#t-n").waitFor({timeout:15000});
    await page.locator("#t-n").fill("متجر فحص سوقنا");
    await page.locator("#t-d").fill("متجر تجريبي للنماذج");
    await page.locator("#t-p").fill("963999999999");
    await page.locator("#t-a").fill("السويداء");
    await page.locator('#app [data-a="savest"]').click();
    await page.locator("#app .box").filter({hasText:"متجر فحص سوقنا"}).first().waitFor({timeout:20000});
    await page.screenshot({path:screenshotName("browser-flow.png"),fullPage:true,animations:"disabled"});
    assert.deepEqual(failures,[],"No uncaught errors after signup/ad/store interactions");
    console.log("UI CUSTOMER FLOW OK",email,"registered, ad pending, store pending");
  } catch(error) {
    const page=customerContext.pages()[0];
    if(page) {
      await page.screenshot({path:screenshotName("browser-flow-debug.png"),fullPage:true}).catch(()=>{});
      console.error("UI CUSTOMER FLOW DEBUG", (await page.locator("#app").innerText().catch(()=>"")).slice(0,1800));
    }
    throw error;
  } finally { await customerContext.close(); }

  // Admin moderation workflow: new customer records stay private until approved.
  const adminEmail="souqna-admin-flow-"+Date.now()+"@example.test";
  const adminPassword="SouqnaAdminTest2026!";
  const authResponse=await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-emulator",
    {method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:adminEmail,password:adminPassword,returnSecureToken:true})}
  );
  const authData=await authResponse.json();
  assert.ok(authResponse.ok && authData.localId,
    "Could not register test admin identity: "+JSON.stringify(authData));
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await Promise.all([
      setDoc(doc(db,"users",authData.localId),{
        name:"مدير اختبار",email:adminEmail,role:"admin",stars:0
      }),
      setDoc(doc(db,"starOrders","flow-pay-one"),{
        userId:authData.localId,userName:"مدير اختبار",stars:9,status:"pending",createdAt:Date.now()
      }),
      setDoc(doc(db,"starOrders","flow-pay-two"),{
        userId:authData.localId,userName:"مدير اختبار",stars:7,status:"pending",createdAt:Date.now()
      }),
      setDoc(doc(db,"sponsorRequests","flow-banner-pay"),{
        userId:authData.localId,userName:"مدير اختبار",company:"شركة تجريبية للإيصالات",
        title:"إعلان مرجعي",days:7,img:"",status:"pending",createdAt:Date.now()
      })
    ]);
  });

  const adminContext=await browser.newContext({viewport:{width:1280,height:900},locale:"ar"});
  try {
    await stubWeather(adminContext);
    const page=await adminContext.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded"});
    await page.locator("#list .item").first().waitFor({timeout:20000});
    await page.locator('#nav [data-v="acc"]').click();
    await page.locator("#l-mail").fill(adminEmail);
    await page.locator("#l-pass").fill(adminPassword);
    await page.locator('#app [data-a="auth"]').click();
    await page.locator('#app [data-v="admin"]').waitFor({timeout:20000});
    await page.locator('#app [data-v="admin"]').click();
    await page.locator("#adminDashboard").waitFor({timeout:12000});
    const dashboard=page.locator("#adminDashboard");
    assert.ok(await dashboard.locator(".admin-stat").count()>=10,"Admin dashboard metrics should render");
    const downloadEvent=page.waitForEvent("download",{timeout:12000});
    await dashboard.locator('[data-a="exportAdmin"]').click();
    const report=await downloadEvent;
    assert.ok(report.suggestedFilename().startsWith("souqna-admin-summary-") && report.suggestedFilename().endsWith(".csv"));
    const reportFile=await report.path();
    const reportCsv=await readFile(reportFile,"utf8");
    assert.ok(reportCsv.includes("الإعلانات المنشورة"),"Export must include published ads");
    assert.ok(reportCsv.includes("الحسابات المسجلة"),"Admin export must include account totals");
    assert.ok(!reportCsv.includes(adminEmail),"Export must not expose customer email addresses");
    console.log("UI ADMIN CSV OK",report.suggestedFilename(),"bytes",reportCsv.length);

    await page.locator('#app [data-a="ordok"][data-id="flow-pay-one"]').click();
    await page.locator("#paymentDialog[open]").waitFor({timeout:8000});
    assert.ok((await page.locator("#paymentDialog").innerText()).includes("توثيق الدفع اليدوي"));
    await page.locator("#pay-reference").fill("PAY-FLOW-2026-0001");
    await page.locator('#paymentDialog [data-a="payconfirm"]').click();
    await page.locator(".toast").filter({hasText:"يجب التأكيد أن الدفعة وصلت"}).waitFor({timeout:6000});
    await page.locator("#pay-attest").check();
    await page.locator('#paymentDialog [data-a="payconfirm"]').click();
    await page.locator("#paymentDialog[open]").waitFor({state:"hidden",timeout:15000});
    await env.withSecurityRulesDisabled(async ctx=>{
      assert.equal((await getDoc(doc(ctx.firestore(),"starOrders","flow-pay-one"))).data().status,"done");
      assert.equal((await getDoc(doc(ctx.firestore(),"users",authData.localId))).data().stars,9);
    });

    await page.locator('#app [data-a="ordok"][data-id="flow-pay-two"]').click();
    await page.locator("#pay-reference").fill("PAY-FLOW-2026-0001");
    await page.locator("#pay-attest").check();
    await page.locator('#paymentDialog [data-a="payconfirm"]').click();
    await page.locator(".toast").filter({hasText:"رقم إيصال الدفع مستخدم"}).waitFor({timeout:15000});
    await env.withSecurityRulesDisabled(async ctx=>{
      assert.equal((await getDoc(doc(ctx.firestore(),"starOrders","flow-pay-two"))).data().status,"pending");
    });
    await page.locator("#pay-reference").fill("PAY-FLOW-2026-0002");
    await page.locator('#paymentDialog [data-a="payconfirm"]').click();
    await page.locator("#paymentDialog[open]").waitFor({state:"hidden",timeout:15000});
    await env.withSecurityRulesDisabled(async ctx=>{
      assert.equal((await getDoc(doc(ctx.firestore(),"users",authData.localId))).data().stars,16);
    });
    console.log("UI RECEIPT VERIFICATION OK","manual attestation required and duplicates rejected");
    await page.screenshot({path:screenshotName("admin-receipts.png"),fullPage:true,animations:"disabled"});

    const pendingAd=page.locator("#app .item").filter({hasText:"إعلان فحص واجهة سوقنا"});
    await pendingAd.locator('[data-a="ok"]').waitFor({timeout:20000});
    await pendingAd.locator('[data-a="ok"]').click();
    const pendingStore=page.locator("#app .box").filter({hasText:"متجر فحص سوقنا"});
    await pendingStore.locator('[data-a="stok"]').waitFor({timeout:20000});
    await pendingStore.locator('[data-a="stok"]').click();
    await page.locator('#nav [data-v="home"]').click();
    await page.locator("#list .item").filter({hasText:"إعلان فحص واجهة سوقنا"}).waitFor({timeout:20000});
    await page.locator("#app .stc").filter({hasText:"متجر فحص سوقنا"}).waitFor({timeout:20000});
    await page.screenshot({path:screenshotName("admin-approved.png"),fullPage:true,animations:"disabled"});
    await page.locator('#nav [data-v="admin"]').click();
    await page.locator("#adminDashboard .admin-stat").first().waitFor({timeout:15000});
    const metric=name=>page.locator("#adminDashboard .admin-stat").filter({hasText:name}).first();
    assert.equal(await metric("الإعلانات المنشورة").getAttribute("data-value"),"2");
    assert.equal(await metric("المتاجر المنشورة").getAttribute("data-value"),"2");
    assert.equal(await metric("الحسابات المسجلة").getAttribute("data-value"),"2");
    assert.equal(await metric("إعلانات للمراجعة").getAttribute("data-value"),"0");
    assert.ok((await page.locator("#adminDashboard").innerText()).includes("حركة النجوم ليست إجمالي مبيعات"),
      "Owner dashboard must not claim that stars are cash revenue");
    await page.locator("#refreshAdmin").click();
    await page.locator("#adminDashboard .admin-stat").first().waitFor({timeout:15000});
    assert.equal(await metric("الإعلانات المنشورة").getAttribute("data-value"),"2");
    await page.screenshot({path:screenshotName("admin-metrics.png"),fullPage:true,animations:"disabled"});
    console.log("UI ADMIN DASHBOARD OK","Firestore-backed metrics, owner-only ledger and manual refresh");
    assert.deepEqual(errors,[],"Admin moderation flow should not throw script errors");
    console.log("UI ADMIN MODERATION OK","ad approved, store approved, both visible on homepage");
  } catch(error) {
    const page=adminContext.pages()[0];
    if(page) {
      await page.screenshot({path:screenshotName("admin-debug.png"),fullPage:true}).catch(()=>{});
      console.error("UI ADMIN DEBUG",(await page.locator("#app").innerText().catch(()=>"")).slice(0,2000));
    }
    throw error;
  } finally {
    await adminContext.close();
  }

  // Moderators can use operational review metrics but cannot see wallet totals.
  const moderatorEmail="souqna-moderator-"+Date.now()+"@example.test";
  const moderatorPassword="SouqnaModerator2026!";
  const moderatorResponse=await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-emulator",
    {method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:moderatorEmail,password:moderatorPassword,returnSecureToken:true})}
  );
  const moderatorAuth=await moderatorResponse.json();
  assert.ok(moderatorResponse.ok && moderatorAuth.localId,"Moderator test identity creation failed");
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),"users",moderatorAuth.localId),{
      name:"مشرف مراجعة",email:moderatorEmail,role:"moderator",stars:0
    });
  });
  const moderatorContext=await browser.newContext({viewport:{width:1280,height:900},locale:"ar"});
  try {
    const page=await moderatorContext.newPage();
    const errors=[];
    page.on("pageerror",err=>errors.push(err.message));
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded"});
    await page.locator("#list .item").first().waitFor({timeout:20000});
    await page.locator('#nav [data-v="acc"]').click();
    await page.locator("#l-mail").fill(moderatorEmail);
    await page.locator("#l-pass").fill(moderatorPassword);
    await page.locator('#app [data-a="auth"]').click();
    await page.locator('#nav [data-v="admin"]').waitFor({timeout:15000});
    await page.locator('#nav [data-v="admin"]').click();
    await page.locator("#adminDashboard").waitFor({timeout:15000});
    assert.equal(await page.locator('#adminDashboard .admin-stat').filter({hasText:"الحسابات المسجلة"}).count(),0);
    assert.equal(await page.locator('#adminDashboard .admin-stat').filter({hasText:"نجوم في المحافظ"}).count(),0);
    assert.equal(await page.locator('#adminDashboard .admin-stat').filter({hasText:"طلبات مالية معلّقة"}).count(),0);
    assert.ok((await page.locator("#adminDashboard").innerText()).includes("إعلانات للمراجعة"));
    assert.deepEqual(errors,[],"Moderator dashboard should load without script errors");
    console.log("UI MODERATOR PERMISSIONS OK","operational metrics only; user wallets hidden");
  } finally { await moderatorContext.close(); }
} finally {
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await env.cleanup();
}
