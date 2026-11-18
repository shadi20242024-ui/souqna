import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import Module from "node:module";

const localRequire=createRequire(import.meta.url);
const serverSource=readFileSync(new URL("../functions/delete-ad.js",import.meta.url),"utf8");
const {extractOwnedImageObjects}=localRequire("../functions/ad-media.js");
const image=(owner,name="image_001")=>
  "https://firebasestorage.googleapis.com/v0/b/souqna-staging.firebasestorage.app/o/"+
  encodeURIComponent("ads/"+owner+"/"+name+".jpg")+"?alt=media";

function harness({role="user",actor="owner",owner="owner",project="souqna-staging",files=[image("owner")],failPath="",transientFailures=0,failStorageInit=false}={}){
  const deleted=[],storageDeletes=[],logs=[];
  let remainingTransientFailures=transientFailures;
  const database=new Map([
    ["users/"+actor,{role}],
    ["ads/test_ad",{ownerId:owner,images:files}]
  ]);
  const db={
    collection(name){return{
      doc(id){
        const key=name+"/"+id;
        return{
          key,
          async get(){
            const obj=database.get(key);
            return{exists:!!obj,data:()=>obj};
          },
          async update(value){
            const existing=database.get(key);
            if(!existing)throw Error("Document not found: "+key);
            database.set(key,{...existing,...value});
          },
          async delete(){database.delete(key);}
        };
      }
    };},
    async runTransaction(run){
      const pending=[];
      const tx={
        async get(ref){
          const obj=database.get(ref.key);
          return{exists:!!obj,data:()=>obj};
        },
        create(ref,data){pending.push({type:"create",key:ref.key,data});},
        delete(ref){pending.push({type:"delete",key:ref.key});}
      };
      const result=await run(tx);
      for(const change of pending){
        if(change.type==="create"){
          if(database.has(change.key))throw Error("Already exists: "+change.key);
          database.set(change.key,change.data);
        }else{
          database.delete(change.key);
          deleted.push(change.key);
        }
      }
      return result;
    }
  };
  class HttpsError extends Error{
    constructor(code,message){super(message);this.code=code;}
  }
  const storage={
    bucket(bucket){return{
      file(path){return{
        async delete(){
          storageDeletes.push({bucket,path});
          if(path===failPath)throw Object.assign(Error("simulated Storage failure"),{code:403});
          if(remainingTransientFailures>0){
            remainingTransientFailures--;
            throw Object.assign(Error("temporary storage outage"),{code:503});
          }
        }
      };}
    };}
  };
  const mockedRequire=id=>{
    if(id==="firebase-functions/v2/https")return{onCall:(_options,handler)=>handler,HttpsError};
    if(id==="firebase-admin/storage")return{getStorage:()=>{if(failStorageInit)throw Error("Storage unavailable");return storage;}};
    if(id==="./ad-media")return{extractOwnedImageObjects};
    throw Error("Unexpected dependency: "+id);
  };
  const compiled=new Module("souqna-delete-ad-test");
  compiled.filename="/virtual/delete-ad.js";
  compiled.paths=[];
  compiled.require=mockedRequire;
  compiled._compile(serverSource,compiled.filename);
  const callable=compiled.exports(db,{});
  const retry=compiled.exports.makeRetryCleanup(db,{});
  const oldProject=process.env.GCLOUD_PROJECT;
  const oldGcp=process.env.GCP_PROJECT;
  const oldFirebase=process.env.FIREBASE_PROJECT_ID;
  delete process.env.GCP_PROJECT;
  delete process.env.FIREBASE_PROJECT_ID;
  process.env.GCLOUD_PROJECT=project;
  return{
    database,deleted,storageDeletes,logs,
    async call(uid=actor,id="test_ad",retryOnly=false){
      try{return await (retryOnly?retry:callable)({auth:uid?{uid}:null,data:{id}});}
      finally{
        if(oldProject===undefined)delete process.env.GCLOUD_PROJECT;
        else process.env.GCLOUD_PROJECT=oldProject;
        if(oldGcp!==undefined)process.env.GCP_PROJECT=oldGcp;
        if(oldFirebase!==undefined)process.env.FIREBASE_PROJECT_ID=oldFirebase;
      }
    }
  };
}

test("owner deletes their listing and only the scoped staging image",async()=>{
  const h=harness();
  const result=await h.call();
  assert.equal(result.ok,true);
  assert.equal(result.deletedImages,1);
  assert.equal(result.failedImages,0);
  assert.deepEqual(h.deleted,["ads/test_ad"]);
  assert.deepEqual(h.storageDeletes,[{bucket:"souqna-staging.firebasestorage.app",path:"ads/owner/image_001.jpg"}]);
});

test("admin may delete another owner's listing, but cannot delete unrelated files",async()=>{
  const h=harness({role:"admin",actor:"admin",owner:"owner",files:[image("owner"),image("other")]});
  const result=await h.call();
  assert.equal(result.deletedImages,1);
  assert.equal(h.storageDeletes.length,1);
  assert.equal(h.storageDeletes[0].path,"ads/owner/image_001.jpg");
});

test("unauthorized user cannot delete an advertisement or any files",async()=>{
  const h=harness({actor:"other",role:"user",owner:"owner"});
  await assert.rejects(h.call(),error=>error.code==="permission-denied");
  assert.ok(h.database.has("ads/test_ad"));
  assert.deepEqual(h.storageDeletes,[]);
});

test("a production project rejects the request before touching data",async()=>{
  const h=harness({project:"souqna-sweida"});
  await assert.rejects(h.call(),error=>error.code==="failed-precondition");
  assert.ok(h.database.has("ads/test_ad"));
  assert.deepEqual(h.storageDeletes,[]);
});

test("an individual image deletion failure is reported after listing deletion",async()=>{
  const h=harness({failPath:"ads/owner/image_001.jpg"});
  const result=await h.call();
  assert.equal(result.deletedImages,0);
  assert.equal(result.failedImages,1);
  assert.equal(h.database.has("ads/test_ad"),false);
});

test("unauthenticated deletion is rejected without removing a listing",async()=>{
  const h=harness();
  await assert.rejects(h.call(null),error=>error.code==="unauthenticated");
  assert.ok(h.database.has("ads/test_ad"));
  assert.deepEqual(h.storageDeletes,[]);
});

test("invalid advertisement identifiers are rejected without touching Storage",async()=>{
  const h=harness();
  await assert.rejects(h.call("owner","../other"),error=>error.code==="invalid-argument");
  assert.ok(h.database.has("ads/test_ad"));
  assert.deepEqual(h.storageDeletes,[]);
});

test("temporary Storage failures are retried and ultimately succeed",async()=>{
  const h=harness({transientFailures:2});
  const result=await h.call();
  assert.equal(result.deletedImages,1);
  assert.equal(result.failedImages,0);
  assert.equal(h.storageDeletes.length,3);
  assert.equal(h.database.has("ads/test_ad"),false);
});

test("permanent Storage authorization failure is not retried",async()=>{
  const h=harness({failPath:"ads/owner/image_001.jpg"});
  const result=await h.call();
  assert.equal(result.failedImages,1);
  assert.equal(h.storageDeletes.length,1);
});

test("Storage initialization failure is reported without masking committed listing deletion",async()=>{
  const h=harness({failStorageInit:true});
  const result=await h.call();
  assert.equal(result.ok,true);
  assert.equal(result.deletedImages,0);
  assert.equal(result.failedImages,1);
  assert.equal(h.database.has("ads/test_ad"),false);
  assert.deepEqual(h.storageDeletes,[]);
});

test("listings without additional images delete successfully when Storage is unavailable",async()=>{
  const h=harness({files:[],failStorageInit:true});
  const result=await h.call();
  assert.equal(result.ok,true);
  assert.equal(result.deletedImages,0);
  assert.equal(result.failedImages,0);
  assert.equal(h.database.has("ads/test_ad"),false);
});

test("failed media cleanup retains a durable recovery record",async()=>{
  const h=harness({failPath:"ads/owner/image_001.jpg"});
  const result=await h.call();
  assert.equal(result.recoveryPending,true);
  assert.equal(result.failedImages,1);
  assert.ok(h.database.has("mediaCleanupJobs/test_ad"));
  assert.equal(h.database.get("mediaCleanupJobs/test_ad").ownerId,"owner");
  assert.equal(h.database.has("ads/test_ad"),false);
});

test("authorized retry clears pending cleanup job after Storage recovers",async()=>{
  const h=harness({failPath:"ads/owner/image_001.jpg"});
  await h.call();
  const job=h.database.get("mediaCleanupJobs/test_ad");
  assert.ok(job);
  assert.deepEqual(job.objects,[{bucket:"souqna-staging.firebasestorage.app",path:"ads/owner/image_001.jpg"}]);
  h.database.set("mediaCleanupJobs/test_ad",{...job,objects:[]});
  const retry=await h.call("owner","test_ad",true);
  assert.equal(retry.failedImages,0);
});

test("unrelated users cannot retry someone else's media cleanup",async()=>{
  const h=harness({failPath:"ads/owner/image_001.jpg"});
  await h.call();
  h.database.set("users/intruder",{role:"user"});
  await assert.rejects(h.call("intruder","test_ad",true),error=>error.code==="permission-denied");
  assert.ok(h.database.has("mediaCleanupJobs/test_ad"));
});
