import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

const ROOT = process.cwd();
const PROJECT_ID = "demo-souqna-rules";
const MIME = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".webmanifest":"application/manifest+json",
  ".json":"application/json; charset=utf-8"
};
const authImport='import{connectAuthEmulator}from"https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";';
const storeImport='import{connectFirestoreEmulator}from"https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";';
const anchor="const auth=getAuth(app),db=getFirestore(app);";

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
        assert.ok(html.includes('projectId:"souqna-sweida"'),"Original project id not found");
        html=html.replace('projectId:"souqna-sweida"','projectId:"demo-souqna-rules"');
        html=html.replace(anchor,()=>
          authImport+"\n"+storeImport+"\n"+anchor+"\n"+
          'connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});\n'+
          'connectFirestoreEmulator(db,"127.0.0.1",8080);\n'
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
      const page=await context.newPage();
      const errors=[];
      page.on("pageerror",err=>errors.push("PAGE: "+err.message));
      page.on("console",msg=>{if(msg.type()==="error")errors.push("CONSOLE: "+msg.text());});
      page.on("requestfailed",req=>errors.push("REQUEST: "+req.url()+" "+req.failure()?.errorText));
      const response=await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded",timeout:45000});
      assert.equal(response.status(),200);
      try {
        await page.locator("#list .item").first().waitFor({timeout:20000});
      } catch(error) {
        await page.screenshot({path:"artifacts/souqna-"+item.name+"-debug.png",fullPage:true});
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
      await page.screenshot({path:"artifacts/souqna-"+item.name+".png",fullPage:true,animations:"disabled"});
      assert.deepEqual(errors,[],"Unexpected browser script errors");
      console.log("VISUAL SMOKE OK",item.name,"cards=1","navigation=",JSON.stringify(nav));
    } finally { await context.close(); }
  }

  // Drive the real SOUQNA UI with a customer account; all writes target emulators.
  const customerContext=await browser.newContext({
    viewport:{width:1280,height:900},locale:"ar",reducedMotion:"reduce"
  });
  try {
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
    assert.ok((await page.locator("#app").innerText()).includes("مستخدم فحص سوقنا"),
      "Registered user's name should be shown in profile");

    await page.locator('#nav [data-v="add"]').click();
    await page.locator("#a-title").waitFor({timeout:15000});
    await page.locator('#app [data-a="post"]').click();
    await page.locator(".toast").filter({hasText:"أكمل العنوان والسعر"}).waitFor({timeout:5000});
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
    await page.screenshot({path:"artifacts/souqna-browser-flow.png",fullPage:true,animations:"disabled"});
    assert.deepEqual(failures,[],"No uncaught errors after signup/ad/store interactions");
    console.log("UI CUSTOMER FLOW OK",email,"registered, ad pending, store pending");
  } catch(error) {
    const page=customerContext.pages()[0];
    if(page) {
      await page.screenshot({path:"artifacts/souqna-browser-flow-debug.png",fullPage:true}).catch(()=>{});
      console.error("UI CUSTOMER FLOW DEBUG", (await page.locator("#app").innerText().catch(()=>"")).slice(0,1800));
    }
    throw error;
  } finally { await customerContext.close(); }
} finally {
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await env.cleanup();
}
