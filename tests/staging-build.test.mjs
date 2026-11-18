import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root=resolve(import.meta.dirname,"..");
const builder=join(root,"scripts/build-hosting.mjs");
const preflight=join(root,"scripts/preflight-staging.mjs");
const source=readFileSync(join(root,"index.html"),"utf8");
const original=source.match(/const app=initializeApp\((\{[^\n;]*\})\);/);
assert.ok(original);
const live=Object.fromEntries([...original[1].matchAll(/([a-zA-Z]\w*):"([^"]*)"/g)].map(m=>[m[1],m[2]]));
const fake={
  apiKey:"test-only-isolated-key-1234567",
  authDomain:"souqna-staging-qa.firebaseapp.com",
  projectId:"souqna-staging-qa",
  storageBucket:"souqna-staging-qa.firebasestorage.app",
  messagingSenderId:"123456789012",
  appId:"1:123456789012:web:abc123456789"
};

test("Safe Hosting preflight blocks accidental production data access",t=>{
  const dir=mkdtempSync(join(tmpdir(),"souqna-preflight-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const output=join(dir,"dist");
  const configPath=join(dir,"firebase.staging.json");
  const run=(...args)=>spawnSync(process.execPath,[builder,...args],{
    cwd:root,encoding:"utf8",env:{...process.env,SOUQNA_HOSTING_OUT:output}
  });
  const supply=config=>writeFileSync(configPath,JSON.stringify(config),"utf8");

  const preview=run();
  assert.equal(preview.status,0,preview.stderr);
  const previewHtml=readFileSync(join(output,"index.html"),"utf8");
  assert.ok(previewHtml.includes('"projectId":"souqna-preview-disabled"'));
  assert.ok(previewHtml.includes('name="robots" content="noindex,nofollow,noarchive"'));
  assert.ok(previewHtml.includes('id="souqna-environment-banner"'));
  assert.ok(previewHtml.includes('نسخة معاينة معزولة'));
  assert.ok(!previewHtml.includes(live.apiKey));
  assert.ok(!previewHtml.includes(live.appId));
  assert.ok(!existsSync(join(output,"firestore.rules")));
  assert.ok(!existsSync(join(output,"functions")));

  const noConfig=run("staging");
  assert.notEqual(noConfig.status,0,"Missing staging config must fail");
  const missingPath=run("staging",join(dir,"missing.json"));
  assert.notEqual(missingPath.status,0,"A missing file must fail");
  supply(live);
  assert.notEqual(run("staging",configPath).status,0,"Production config must be rejected");

  supply({...fake,authDomain:live.authDomain});
  assert.notEqual(run("staging",configPath).status,0,"Production Auth domain must be rejected");
  supply({...fake,apiKey:live.apiKey});
  assert.notEqual(run("staging",configPath).status,0,"Production API key must be rejected");
  supply({...fake,storageBucket:live.storageBucket});
  assert.notEqual(run("staging",configPath).status,0,"Production Storage bucket must be rejected");
  supply({...fake,projectId:live.projectId});
  assert.notEqual(run("staging",configPath).status,0,"Production project ID must be rejected");

  supply(fake);
  const staging=run("staging",configPath);
  assert.equal(staging.status,0,staging.stderr);
  const stagingHtml=readFileSync(join(output,"index.html"),"utf8");
  assert.ok(stagingHtml.includes('"projectId":"souqna-staging-qa"'));
  assert.ok(stagingHtml.includes('بيئة اختبار سوقنا'));
  assert.ok(stagingHtml.includes('id="souqna-environment-banner"'));
  assert.ok(stagingHtml.includes('name="robots" content="noindex,nofollow,noarchive"'));
  assert.ok(stagingHtml.includes('"apiKey":"test-only-isolated-key-1234567"'));
  assert.ok(!stagingHtml.includes(live.appId));
  assert.ok(!stagingHtml.includes(live.apiKey));
  assert.ok(!existsSync(join(output,"tests")));
  assert.ok(!existsSync(join(output,"functions")));
  assert.ok(staging.stdout.includes("No deployment performed"));
  const verify=project=>spawnSync(process.execPath,[preflight,project],{
    cwd:root,encoding:"utf8",env:{...process.env,SOUQNA_HOSTING_OUT:output}
  });
  const passed=verify("souqna-staging-qa");
  assert.equal(passed.status,0,passed.stderr);
  assert.notEqual(verify("souqna-sweida").status,0,"Production preflight must be impossible");
  assert.notEqual(verify("souqna-other-qa").status,0,"Wrong staging project must be rejected");
});

test("Admin dashboard handles failed Firestore reads without hiding the entire panel",()=>{
  const source=readFileSync(join(root,"index.html"),"utf8");
  assert.match(source,/adminLoadWarnings/);
  assert.match(source,/adminErrorBanner\(\)\+adminDashboardHtml\(\)/);
  assert.match(source,/تعذر تحميل بعض بيانات الإدارة/);
  assert.match(source,/console\.error\("SOUQNA collection read failed:"/);
  assert.match(source,/if\(view=="admin"&&!isStaff\(\)\)view="acc"/);
  assert.match(source,/تعذر تسجيل الدخول:/);
});
