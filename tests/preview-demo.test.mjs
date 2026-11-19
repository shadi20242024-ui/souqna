import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,readFileSync,existsSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root=resolve(import.meta.dirname,"..");
const script=readFileSync(new URL("../assets/preview-demo.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/preview-demo.css",import.meta.url),"utf8");

test("isolated preview demo source parses and is disconnected from real Firebase",()=>{
  const check=spawnSync(process.execPath,["--check",join(root,"assets","preview-demo.js")],{encoding:"utf8",timeout:12000});
  assert.equal(check.status,0,check.stderr);
  assert.ok(script.includes("renderGuide"));
  assert.ok(script.includes("previewForm"));
  assert.ok(script.includes("calcForm"));
  assert.ok(script.includes("state.favorites"));
  assert.ok(script.includes('data-demo="admin-section"'));
  assert.ok(script.includes('data-demo="admin-decision"'));
  assert.ok(script.includes("جميع الإحصائيات والمستخدمين والمراجعات والقرارات وهمية"));
  assert.ok(script.includes("state.adminSection"));
  assert.ok(script.includes('["admin","المدير","⚙"]'));
  assert.ok(css.includes(".demo-admin-layout"));
  assert.ok(css.includes(".demo-admin-sidebar"));
  assert.ok(script.includes("المثال"));
  assert.ok(css.includes("@media(max-width:680px)"));
  for(const unsafe of ["initializeApp(","getFirestore(","getAuth(","httpsCallable(","firebase deploy","localStorage.","fetch("])
    assert.ok(!script.includes(unsafe),"Preview demo must remain isolated: "+unsafe);
});

test("preview bundle is interactive without exposing main Firebase module or payment/auth",t=>{
  const tmp=mkdtempSync(join(tmpdir(),"souqna-demo-"));
  t.after(()=>rmSync(tmp,{recursive:true,force:true}));
  const output=join(tmp,"dist");
  const run=spawnSync(process.execPath,[join(root,"scripts","build-hosting.mjs")],{
    cwd:root,encoding:"utf8",timeout:25000,env:{...process.env,SOUQNA_HOSTING_OUT:output}
  });
  assert.equal(run.status,0,run.stderr);
  const page=readFileSync(join(output,"index.html"),"utf8");
  assert.match(page,/souqna-preview-config/);
  assert.match(page,/\"projectId\":\"souqna-preview-disabled\"/);
  assert.match(page,/src=\"\.\/assets\/preview-demo\.js\"/);
  assert.match(page,/href=\"assets\/preview-demo\.css\"/);
  assert.ok(!page.includes("httpsCallable(functions"));
  assert.ok(!page.includes("createUserWithEmailAndPassword"));
  assert.ok(!page.includes("souqna-sweida.firebaseapp.com"));
  assert.ok(existsSync(join(output,"assets","preview-demo.js")));
  assert.ok(existsSync(join(output,"assets","preview-demo.css")));
  assert.ok(!existsSync(join(output,"functions")));
  assert.ok(!existsSync(join(output,"firestore.rules")));
  assert.ok(page.includes("noindex,nofollow,noarchive"));
});
