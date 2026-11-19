import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {
  STAGING_PROJECT, STAGING_WEB_CONFIG_FILE, chooseStagingWebApp, fetchStagingWebConfig, validateStagingWebConfig
} from "../scripts/auto-staging-setup.mjs";

const appId="1:850633392158:web:c966b5d11e72a6b56d6e0f";
const app={appId,displayName:"SOUQNA Staging Web",state:"ACTIVE"};
const config={
  projectId:STAGING_PROJECT,
  appId,
  apiKey:"AIzaSyThisIsATestOnlyStringOfValidLength123456",
  authDomain:"souqna-staging.firebaseapp.com",
  storageBucket:"souqna-staging.firebasestorage.app",
  messagingSenderId:"850633392158",
  databaseURL:"https://ignored.firebaseio.com",
  measurementId:"G-SHOULD-NOT-LEAK"
};

test("Automatic Firebase staging setup validates remote config and strips unsupported fields",async()=>{
  const called=[];
  const request=async url=>{
    called.push(url);
    if(url.endsWith("/webApps"))return {apps:[app]};
    if(url.endsWith("/config"))return config;
    throw Error("unexpected URL");
  };
  const out=await fetchStagingWebConfig(request);
  assert.equal(out.projectId,STAGING_PROJECT);
  assert.equal(out.apiKey,config.apiKey);
  assert.equal(out.appId,appId);
  assert.equal(Object.hasOwn(out,"measurementId"),false);
  assert.equal(Object.hasOwn(out,"databaseURL"),false);
  assert.equal(Object.keys(out).length,6);
  assert.equal(called.length,2);
  for(const url of called)assert.match(url,/projects\/souqna-staging\/webApps/);
  assert.ok(!called.some(url=>url.includes("souqna-sweida")));
});

test("Automatic config selects exact named staging Web App instead of another registered app",async()=>{
  const other={appId:"1:123456789012:web:abcdef12345",displayName:"Unrelated",state:"ACTIVE"};
  const selected=chooseStagingWebApp([other,app]);
  assert.equal(selected.appId,appId);
  assert.throws(()=>chooseStagingWebApp([other,{...app,displayName:"Another App"}]),/More than one/);
  assert.throws(()=>chooseStagingWebApp([]),/No registered staging/);
});

test("Automatic config rejects mismatched project, app ID, bucket, auth domain, and placeholders",()=>{
  for(const wrong of [
    {...config,projectId:"souqna-sweida"},
    {...config,appId:"1:123456789012:web:abcdef12345"},
    {...config,authDomain:"souqna-sweida.firebaseapp.com"},
    {...config,storageBucket:"souqna-sweida.firebasestorage.app"},
    {...config,apiKey:"REPLACE_WITH_API_KEY"},
    {...config,messagingSenderId:"unknown"}
  ])assert.throws(()=>validateStagingWebConfig(wrong,appId));
});

test("Firebase Management app list handles pagination and refuses a malformed response",async()=>{
  const other={appId:"1:123456789012:web:abcdef12345",displayName:"Unrelated",state:"ACTIVE"};
  const urls=[];
  const request=async url=>{
    urls.push(url);
    if(url.endsWith("/webApps"))return {apps:[other],nextPageToken:"PAGE2"};
    if(url.includes("pageToken=PAGE2"))return {apps:[app]};
    if(url.endsWith("/config"))return config;
    throw Error("unexpected URL");
  };
  assert.equal((await fetchStagingWebConfig(request)).projectId,STAGING_PROJECT);
  assert.equal(urls.length,3);
  await assert.rejects(fetchStagingWebConfig(async()=>({wrong:"shape"})),/no Web App list/);
});

test("automatic staging setup never replaces the tracked Firebase CLI rules configuration",()=>{
  assert.equal(STAGING_WEB_CONFIG_FILE,"firebase.staging.web.local.json");
  assert.notEqual(STAGING_WEB_CONFIG_FILE,"firebase.staging.json");
  const cli=JSON.parse(readFileSync(new URL("../firebase.staging.json",import.meta.url),"utf8"));
  assert.equal(cli.firestore.rules,"firestore.staging.rules");
  assert.equal(cli.storage.rules,"storage.rules");
  assert.equal(cli.hosting.public,"dist");
  assert.equal(Object.hasOwn(cli,"apiKey"),false);
  const ignored=readFileSync(new URL("../.gitignore",import.meta.url),"utf8");
  assert.match(ignored,/^firebase\.staging\.web\.local\.json$/m);
  assert.doesNotMatch(ignored,/^firebase\.staging\.json$/m);
  const setup=readFileSync(new URL("../scripts/auto-staging-setup.mjs",import.meta.url),"utf8");
  assert.match(setup,/const localConfig = join\(root,STAGING_WEB_CONFIG_FILE\)/);
  assert.match(setup,/runLocal\("scripts\/build-hosting\.mjs","staging",localConfig\)/);
  assert.match(setup,/runLocal\("scripts\/preflight-staging\.mjs",STAGING_PROJECT\)/);
});
