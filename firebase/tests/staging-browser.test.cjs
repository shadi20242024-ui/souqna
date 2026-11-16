"use strict";
/**
 * Real Chromium UI smoke checks for SOUQNA against *only* demo Auth/Firestore emulators.
 * No calls to the real Firebase project, external weather, or paid services are permitted.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const {createRequire}=require("node:module");
const esbuild=require("esbuild");
const {chromium}=require("playwright");
const requireFunctions=createRequire(path.resolve(__dirname,"../../functions/index.js"));
const {initializeApp,deleteApp}=requireFunctions("firebase-admin/app");
const {getAuth}=requireFunctions("firebase-admin/auth");
const {getFirestore}=requireFunctions("firebase-admin/firestore");

const PROJECT="demo-souqna";
const HOST="127.0.0.1";
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost=process.env.FIRESTORE_EMULATOR_HOST;
if(!authHost||!firestoreHost ||
   !/^(127\.0\.0\.1|localhost):\d+$/.test(authHost) ||
   !/^(127\.0\.0\.1|localhost):\d+$/.test(firestoreHost)){
  throw new Error("Refusing browser test outside local Auth and Firestore emulators");
}
const [dbHost,dbPort]=firestoreHost.split(":");
const original=fs.readFileSync(path.resolve(__dirname,"../../index.html"),"utf8");
const start=original.indexOf('<script type="module">');
const end=original.indexOf("</script>",start);
assert(start>=0&&end>start,"Could not isolate SOUQNA module");
let script=original.slice(start+'<script type="module">'.length,end);
let count=0;
script=script.replace(
  /from"https:\/\/www\.gstatic\.com\/firebasejs\/10\.14\.1\/firebase-(app|auth|firestore|functions|app-check)\.js"/g,
  (_m,pkg)=>{count++;return 'from"firebase/'+pkg+'"';}
);
assert.equal(count,5,"All Firebase packages must be bundled locally");
script=script.replace('getAuth,getIdTokenResult,onAuthStateChanged',
  'getAuth,connectAuthEmulator,getIdTokenResult,onAuthStateChanged');
script=script.replace('getFirestore,collection,doc',
  'getFirestore,connectFirestoreEmulator,collection,doc');
const config=/const app=initializeApp\(\{apiKey:"[^"]+",authDomain:"[^"]+",projectId:"[^"]+",storageBucket:"[^"]+",messagingSenderId:"[^"]+",appId:"[^"]+"\}\);/;
assert(config.test(script),"Production config has changed: do not run test without reviewing config replacement");
script=script.replace(config,
  'const app=initializeApp({apiKey:"demo-browser-key",authDomain:"'+PROJECT+'.firebaseapp.com",projectId:"'+PROJECT+'",appId:"demo-browser-souqna"});');
const init='const auth=getAuth(app),db=getFirestore(app);';
assert(script.includes(init),"Browser emulator injection point missing");
script=script.replace(init,init+'\nconnectAuthEmulator(auth,"http://'+authHost+'",{disableWarnings:true});\nconnectFirestoreEmulator(db,"'+dbHost+'",'+Number(dbPort)+');');
assert(!script.includes("souqna-sweida.firebaseapp.com"),"Production auth domain is still in browser test bundle");
assert(!script.includes('projectId:"souqna-sweida"'),"Production project is still in browser test bundle");
const moduleOutput=esbuild.buildSync({
  stdin:{contents:script,resolveDir:path.resolve(__dirname,".."),sourcefile:"souqna-staging-module.js",loader:"js"},
  bundle:true,platform:"browser",format:"esm",target:["chrome120"],write:false,logLevel:"error"
});
assert.equal(moduleOutput.outputFiles.length,1);
const bundle=moduleOutput.outputFiles[0].text;
const html=original.slice(0,start)+'<script type="module" src="/__staging_bundle.js"></script>'+original.slice(end+"</script>".length);
const server=http.createServer((req,res)=>{
  if(req.url==="/"||req.url==="/index.html"){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(html);return;
  }
  if(req.url==="/__staging_bundle.js"){
    res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-store"});res.end(bundle);return;
  }
  res.writeHead(404);res.end();
});
const adminApp=initializeApp({projectId:PROJECT},"souqna-staging-browser");
const adminAuth=getAuth(adminApp);
const adminDb=getFirestore(adminApp);
const bannerPNG=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lW0AAAAASUVORK5CYII=","base64");

test("Chromium: account registration → approved ad → detail/favorite → owner-paid banner",async t=>{
  const errors=[];
  let browser,page;
  try{
    await new Promise(resolve=>server.listen(0,HOST,resolve));
    const port=server.address().port;
    const appOrigin="http://"+HOST+":"+port;
    await adminDb.doc("categories/cars").set({name_ar:"مركبات",active:true,order:1});

    browser=await chromium.launch({headless:true});
    page=await browser.newPage({viewport:{width:1365,height:860},locale:"ar"});
    page.on("pageerror",error=>errors.push(error.message));
    // The browser can reach only local test services. No production API or media request is allowed.
    await page.route("**/*",route=>{
      const url=new URL(route.request().url());
      if(["127.0.0.1","localhost"].includes(url.hostname))return route.continue();
      return route.abort();
    });
    await page.goto(appOrigin,{waitUntil:"domcontentloaded"});

    await t.test("register customer from actual RTL signup form",async()=>{
      await page.locator('#nav [data-v="acc"]').waitFor();
      await page.locator('#nav [data-v="acc"]').click();
      await page.locator('[data-a="swap"]').click();
      await page.locator("#l-name").fill("مستخدم تجريبي");
      await page.locator("#l-mail").fill("seller-browser@example.test");
      await page.locator("#l-pass").fill("StrongTestPassword123!");
      await page.locator('[data-a="auth"]').click();
      await page.locator('#app [data-v="mystores"]').waitFor({timeout:20000});
      const profile=await adminAuth.getUserByEmail("seller-browser@example.test");
      assert.equal((await adminDb.doc("users/"+profile.uid).get()).data().stars,0);
    });

    let adId;
    await t.test("submit classified via UI and prohibit browser self-approval",async()=>{
      await page.locator('#nav [data-v="add"]').click();
      await page.locator("#a-title").fill("سيارة مستعملة — تجربة المتصفح");
      await page.locator("#a-price").fill("2900");
      await page.locator("#a-area").fill("السويداء");
      await page.locator("#a-desc").fill("تفاصيل الإعلان التجريبي");
      await page.locator("#a-phone").fill("963912345678");
      await page.locator('[data-a="post"]').click();
      // Click returns before Firebase's asynchronous addDoc and the UI refresh finish.
      // Wait for the submitted ad on the customer's "my listings" page first.
      await page.locator('#app .item').first().waitFor({timeout:20000});
      const results=await adminDb.collection("ads").where("title","==","سيارة مستعملة — تجربة المتصفح").get();
      assert.equal(results.size,1);
      adId=results.docs[0].id;
      assert.equal(results.docs[0].data().status,"pending");
      await adminDb.doc("ads/"+adId).update({status:"approved",reviewedAt:Date.now()});
    });

    await t.test("approved listing opens full details and saves favorite",async()=>{
      await page.goto(appOrigin,{waitUntil:"domcontentloaded"});
      await page.locator('#list [data-ad="'+adId+'"]').first().waitFor({timeout:20000});
      await page.locator('#list [data-ad="'+adId+'"]').first().click();
      await page.locator(".ad-details-sidebar h1").waitFor();
      assert.match(await page.locator(".ad-details-sidebar h1").innerText(),/سيارة مستعملة/);
      await page.locator('.ad-details-sidebar [data-a="favorite"]').click();
      const authUser=await adminAuth.getUserByEmail("seller-browser@example.test");
      const saved=await adminDb.doc("favorites/"+authUser.uid+"_"+adId).get();
      assert.equal(saved.exists,true);
    });

    await t.test("trusted admin can manage banner, ordinary user cannot",async()=>{
      const manager=await adminAuth.createUser({
        uid:"staging-browser-manager",email:"manager-browser@example.test",password:"StrongManagerPassword123!"
      });
      await adminAuth.setCustomUserClaims(manager.uid,{admin:true});
      await adminDb.doc("users/"+manager.uid).set({
        name:"مدير الاختبار",email:manager.email,role:"user",stars:0
      });
      await page.locator('#nav [data-v="acc"]').click();
      await page.locator('[data-a="out"]').click();
      await page.locator("#l-mail").fill("manager-browser@example.test");
      await page.locator("#l-pass").fill("StrongManagerPassword123!");
      await page.locator('[data-a="auth"]').click();
      await page.locator('#app [data-v="admin"]').waitFor({timeout:20000});
      await page.locator('#app [data-v="admin"]').click();
      await page.locator("#p-co").fill("متجر السويداء التجريبي");
      await page.locator("#p-ti").fill("بانر مدفوع تجريبي");
      await page.locator("#p-days").fill("7");
      await page.locator('[data-img="sp"]').setInputFiles({
        name:"staging-banner.png",mimeType:"image/png",buffer:bannerPNG
      });
      await page.getByText("تم تجهيز الصورة للمعاينة").waitFor({timeout:10000});
      await page.locator("#p-payment").check();
      await page.locator('[data-a="savesp"]').click();
      await page.getByText("حُفظ البانر وأصبح قابلاً للعرض خلال المدة").waitFor({timeout:15000});
      const sponsor=await adminDb.collection("sponsors").where("company","==","متجر السويداء التجريبي").get();
      assert.equal(sponsor.size,1);
      assert.equal(sponsor.docs[0].data().paymentVerified,true);
      await page.locator('#souqna-topnav [data-v="home"]').first().click();
      await page.locator(".hero-sponsor").waitFor();
      assert.match(await page.locator(".hero-sponsor").innerText(),/بانر مدفوع تجريبي/);
    });

    assert.deepEqual(errors,[],"Unexpected uncaught errors in real browser UI");
  }finally{
    if(page)await page.close();
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
    await deleteApp(adminApp);
  }
});
