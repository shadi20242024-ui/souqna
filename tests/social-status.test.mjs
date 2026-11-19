import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import Module from "node:module";

class HttpsError extends Error{
  constructor(code,message){super(message);this.code=code;}
}
function statusHarness(){
  const source=readFileSync(new URL("../functions/social-status.js",import.meta.url),"utf8");
  const mod=new Module("/virtual/social-status.js");
  mod.filename="/virtual/social-status.js";
  mod.paths=[];
  mod.require=id=>{
    if(id==="firebase-functions/v2/https")
      return{onCall:(_options,handler)=>handler,HttpsError};
    throw Error("Unexpected dependency "+id);
  };
  mod._compile(source,mod.filename);
  const db={
    collection(name){
      if(name==="users")return{
        doc(id){return{async get(){
          return{exists:true,data:()=>({role:id==="admin"?"admin":"user"})};
        }};}
      };
      if(name==="socialPromotionJobs")return{
        orderBy(field,direction){
          assert.equal(field,"updatedAt");
          assert.equal(direction,"desc");
          return{
            limit(max){
              assert.equal(max,25);
              return{async get(){return{docs:[
                {id:"ad_123",data:()=>({
                  title:"سيارة مميزة",expiresAt:1795000000000,
                  status:"active",updatedAt:1794000000000,
                  channels:{
                    facebook:{status:"published",postId:"secret_meta_post_id"},
                    instagram:{status:"review_required",lastError:"private diagnostic"}
                  }
                })}
              ]};}};
            }
          };
        }
      };
      throw Error("Unknown collection "+name);
    }
  };
  return mod.exports.makeSocialQueueStatus(db,{});
}
async function withStaging(callback){
  const before=process.env.GCLOUD_PROJECT;
  const oldGcp=process.env.GCP_PROJECT;
  const oldFirebase=process.env.FIREBASE_PROJECT_ID;
  delete process.env.GCP_PROJECT;
  delete process.env.FIREBASE_PROJECT_ID;
  process.env.GCLOUD_PROJECT="souqna-staging";
  try{return await callback();}
  finally{
    if(before===undefined)delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT=before;
    if(oldGcp===undefined)delete process.env.GCP_PROJECT;
    else process.env.GCP_PROJECT=oldGcp;
    if(oldFirebase===undefined)delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID=oldFirebase;
  }
}

test("only the manager can read the social publishing queue",async()=>{
  await withStaging(async()=>{
    const callable=statusHarness();
    await assert.rejects(callable({auth:{uid:"visitor"}}),error=>error.code==="permission-denied");
    await assert.rejects(callable({auth:null}),error=>error.code==="unauthenticated");
    const data=await callable({auth:{uid:"admin"}});
    assert.equal(data.ok,true);
    assert.equal(data.integration,"not_connected");
    assert.equal(data.jobs.length,1);
    assert.equal(data.jobs[0].facebook,"published");
    assert.equal(data.jobs[0].instagram,"review_required");
    assert.equal(data.jobs[0].requiresReview,true);
    assert.equal(JSON.stringify(data).includes("secret_meta_post_id"),false);
    assert.equal(JSON.stringify(data).includes("private diagnostic"),false);
  });
});

test("social publishing queue callable rejects production project even for admins",async()=>{
  const prev=process.env.GCLOUD_PROJECT;
  const prevGcp=process.env.GCP_PROJECT;
  const prevFirebase=process.env.FIREBASE_PROJECT_ID;
  delete process.env.GCP_PROJECT;
  delete process.env.FIREBASE_PROJECT_ID;
  process.env.GCLOUD_PROJECT="souqna-sweida";
  try{
    await assert.rejects(statusHarness()({auth:{uid:"admin"}}),error=>error.code==="failed-precondition");
  }finally{
    if(prev===undefined)delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT=prev;
    if(prevGcp===undefined)delete process.env.GCP_PROJECT;
    else process.env.GCP_PROJECT=prevGcp;
    if(prevFirebase===undefined)delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID=prevFirebase;
  }
});

test("staging admin UI shows social queue states without containing live Meta access tokens",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html,/data-a="loadSocialQueue"/);
  assert.match(html,/httpsCallable\(functions,"souqnaSocialQueueStatus"\)/);
  assert.match(html,/if\(!isAdm\(\)\|\|app\.options\.projectId!=="souqna-staging"\)/);
  assert.doesNotMatch(html,/META_PAGE_TOKEN|META_INSTAGRAM_TOKEN/);
});
