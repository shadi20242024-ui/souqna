import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  inspectProductionBundle, inspectProductionRelease
} from "../scripts/preflight-production.mjs";

const root=resolve(import.meta.dirname,"..");
const source=readFileSync(join(root,"index.html"),"utf8");
const rules=readFileSync(join(root,"firestore.rules"),"utf8");
const manifest=JSON.parse(readFileSync(join(root,"manifest.webmanifest"),"utf8"));
const sw=readFileSync(join(root,"sw.js"),"utf8");

test("production inspection refuses test pages, mismatched rules and invalid manifests",()=>{
  assert.equal(inspectProductionRelease(source,source,rules,manifest,sw),"READY");
  assert.equal(inspectProductionRelease(source.replace("souqna-sweida","souqna-staging"),source,rules,manifest,sw),
    "PRODUCTION_HTML_DIFFERS_FROM_REVIEWED_SOURCE");
  assert.equal(inspectProductionRelease(source,source,rules.replaceAll("2026-11-19","2025-01-01"),manifest,sw),
    "LEGAL_RULES_MISMATCH");
  assert.equal(inspectProductionRelease(source,source,rules,{...manifest,display:"browser"},sw),
    "PWA_MANIFEST_INVALID");
  assert.equal(inspectProductionRelease(source,source,rules,manifest,""),"PWA_CACHE_INCOMPLETE");
});

test("production build is opt-in and never changes staging or contacts Firebase",t=>{
  const dir=mkdtempSync(join(tmpdir(),"souqna-prod-build-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const output=join(dir,"dist");
  const run=(approved)=>spawnSync(process.execPath,[join(root,"scripts/build-hosting.mjs"),"production"],{
    cwd:root,encoding:"utf8",timeout:25000,
    env:{...process.env,SOUQNA_HOSTING_OUT:output,SOUQNA_PRODUCTION_BUILD_APPROVED:approved}
  });
  const noConsent=run("");
  assert.notEqual(noConsent.status,0,"Production mode must refuse missing release acknowledgment");
  assert.ok(!existsSync(join(output,"index.html")),"A failed production build must never emit a publishable page");
  const wrong=run("souqna-staging:2026-11-19");
  assert.notEqual(wrong.status,0,"A staging authorization cannot build production");
  const success=run("souqna-sweida:2026-11-19");
  assert.equal(success.status,0,success.stderr);
  assert.match(success.stdout,/NO CLOUD DEPLOYMENT/);
  const outputHtml=readFileSync(join(output,"index.html"),"utf8");
  assert.equal(outputHtml,source,"Production page must exactly match reviewed application source");
  assert.ok(!outputHtml.includes('name="robots" content="noindex,nofollow,noarchive"'));
  assert.ok(!outputHtml.includes('id="souqna-environment-banner"'));
  assert.ok(!existsSync(join(output,"firestore.rules")));
  assert.ok(!existsSync(join(output,"functions")));
  assert.equal(inspectProductionBundle(output),"READY");
  const preflight=spawnSync(process.execPath,[join(root,"scripts/preflight-production.mjs")],{
    cwd:root,encoding:"utf8",timeout:25000,env:{...process.env,SOUQNA_HOSTING_OUT:output}
  });
  assert.equal(preflight.status,0,preflight.stderr);
  assert.match(preflight.stdout,/NOT AUTHORIZED FOR PUBLIC DEPLOYMENT/);
});
