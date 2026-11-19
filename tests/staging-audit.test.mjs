import test from "node:test";
import assert from "node:assert/strict";
import {
  stagingEndpoints,classifyStagingService,inspectStagingLive,validateReadOnlyRequestUrl
} from "../scripts/audit-staging-readonly.mjs";

const projectId="souqna-staging";
const appId="1:123456789012:web:abcdef123456";
const web={
  apiKey:"AIzaSyOnlyAnExampleNotUsedForAnyRequest123",
  authDomain:"souqna-staging.firebaseapp.com",
  projectId,
  storageBucket:"souqna-staging.firebasestorage.app",
  messagingSenderId:"123456789012",
  appId
};

test("staging audit URLs target only approved read-only services",()=>{
  const endpoints=stagingEndpoints(web);
  for(const url of Object.values(endpoints)){
    assert.equal(validateReadOnlyRequestUrl(url),url);
    assert.doesNotMatch(url,/souqna-sweida/);
  }
  const appList="https://firebase.googleapis.com/v1beta1/projects/souqna-staging/webApps";
  const appConfig=appList+"/"+encodeURIComponent(appId)+"/config";
  assert.equal(validateReadOnlyRequestUrl(appList),appList);
  assert.equal(validateReadOnlyRequestUrl(appConfig),appConfig);
  assert.throws(()=>validateReadOnlyRequestUrl("https://firebase.googleapis.com/v1beta1/projects/souqna-sweida/webApps"),/Production/);
  assert.throws(()=>validateReadOnlyRequestUrl("https://attacker.example/v1beta1/projects/souqna-staging/webApps"),/origin/);
  assert.throws(()=>validateReadOnlyRequestUrl("https://storage.googleapis.com/storage/v1/b/souqna-sweida.firebasestorage.app"),/Production/);
  assert.throws(()=>stagingEndpoints({...web,projectId:"souqna-sweida"}),/Wrong staging project/);
});

test("read-only audit reports ready with matching service metadata and deployed callables",async()=>{
  const endpoints=stagingEndpoints(web);
  const calls=[];
  const result=await inspectStagingLive(async url=>{
    calls.push(validateReadOnlyRequestUrl(url));
    if(url.includes("/webApps/")&&url.endsWith("/config"))return web;
    if(url.endsWith("/webApps"))return {apps:[{appId,displayName:"SOUQNA Staging Web",state:"ACTIVE"}]};
    if(url===endpoints.authentication)return{signIn:{email:{enabled:true}}};
    if(url===endpoints.firestore)return{name:"projects/souqna-staging/databases/(default)",state:"READY"};
    if(url===endpoints.storage)return{name:web.storageBucket,location:"US"};
    if(url===endpoints.functions)return{functions:[
      "souqnaMarketplace","souqnaDeleteAd","souqnaRetryAdCleanup","souqnaListAdCleanup"
    ].map(name=>({name:"projects/souqna-staging/locations/us-central1/functions/"+name,state:"ACTIVE"}))};
    throw new Error("Unexpected staging audit URL");
  });
  assert.equal(result.infrastructureReady,true);
  assert.equal(result.callableFunctionsDeployed,true);
  assert.deepEqual(Object.fromEntries(Object.entries(result.services).map(([key,value])=>[key,value.status])),{
    authentication:"ready",firestore:"ready",storage:"ready",functions:"ready"
  });
  assert.equal(calls.length,6);
  assert.equal(JSON.stringify(result).includes(web.apiKey),false);
});

test("missing callables, disabled email sign-in and incorrect Storage do not pass readiness",()=>{
  assert.equal(classifyStagingService("authentication",{signIn:{email:{enabled:false}}},web).status,"not-ready");
  assert.equal(classifyStagingService("firestore",{name:"projects/souqna-staging/databases/(default)",state:"CREATING"},web).status,"not-ready");
  assert.equal(classifyStagingService("storage",{name:"souqna-sweida.firebasestorage.app"},web).status,"not-ready");
  const functions=classifyStagingService("functions",{functions:[]},web);
  assert.equal(functions.status,"not-ready");
  assert.equal(functions.missing.length,4);
});

test("permission errors are disclosed as unverified rather than falsely reporting a missing resource",async()=>{
  const endpoints=stagingEndpoints(web);
  const out=await inspectStagingLive(async url=>{
    if(url.includes("/webApps/")&&url.endsWith("/config"))return web;
    if(url.endsWith("/webApps"))return{apps:[{appId,displayName:"SOUQNA Staging Web",state:"ACTIVE"}]};
    if(url===endpoints.authentication)throw new Error("Read-only Google API returned HTTP 403");
    if(url===endpoints.firestore)return{name:"projects/souqna-staging/databases/(default)",state:"READY"};
    if(url===endpoints.storage)return{name:web.storageBucket};
    if(url===endpoints.functions)return{functions:[]};
    throw new Error("Unknown URL");
  });
  assert.equal(out.services.authentication.status,"unverified");
  assert.equal(out.services.authentication.reason,"Read-only Google API returned HTTP 403");
  assert.equal(out.infrastructureReady,false);
  assert.equal(out.callableFunctionsDeployed,false);
});
