import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import Module from "node:module";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";
import {ref,uploadBytes,getMetadata} from "firebase/storage";

const projectId="demo-souqna-gallery-flow";
const bucket="souqna-staging.firebasestorage.app";
const originalProject=process.env.GCLOUD_PROJECT;
const originalGcp=process.env.GCP_PROJECT;
const originalFirebase=process.env.FIREBASE_PROJECT_ID;
const requireFunctions=createRequire(new URL("../functions/index.js",import.meta.url));
const {initializeApp,deleteApp}=requireFunctions("firebase-admin/app");
const {getFirestore,FieldValue}=requireFunctions("firebase-admin/firestore");
const {getStorage}=requireFunctions("firebase-admin/storage");
const media=requireFunctions("./ad-media.js");
const picture=new Uint8Array([255,216,255,224,16,32,48,64,255,217]);
const mimetype={contentType:"image/jpeg"};
const urlFor=path=>
  "https://firebasestorage.googleapis.com/v0/b/"+bucket+"/o/"+
  encodeURIComponent(path)+"?alt=media";
let rulesEnvironment,adminApp,db,createAd,deleteAd;

function assertIsolatedEmulators(){
  assert.match(projectId,/^demo-/);
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,"Firestore emulator is required");
  assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST,"Storage emulator is required");
  for(const value of [process.env.FIRESTORE_EMULATOR_HOST,process.env.FIREBASE_STORAGE_EMULATOR_HOST]){
    assert.match(value,/^(127\.0\.0\.1|localhost):[0-9]+$/);
  }
}

function callable(path,storageProvider=()=>getStorage(adminApp)){
  const source=readFileSync(new URL("../functions/"+path,import.meta.url),"utf8");
  const mod=new Module("/virtual/"+path);
  mod.filename="/virtual/"+path;
  mod.paths=[];
  class HttpsError extends Error{
    constructor(code,message){super(message);this.code=code;}
  }
  mod.require=id=>{
    if(id==="firebase-functions/v2/https")return{onCall:(_options,handler)=>handler,HttpsError};
    if(id==="firebase-admin/firestore")return{FieldValue};
    if(id==="firebase-admin/storage")return{getStorage:storageProvider};
    if(id==="./ad-media")return media;
    throw new Error("Unexpected function dependency: "+id);
  };
  mod._compile(source,mod.filename);
  return mod.exports(db,{});
}

async function upload(uid,path){
  const storage=rulesEnvironment.authenticatedContext(uid).storage("gs://"+bucket);
  const object=ref(storage,path);
  await uploadBytes(object,picture,mimetype);
  return object;
}

async function existsInStorage(uid,path){
  try{
    await getMetadata(ref(rulesEnvironment.authenticatedContext(uid).storage("gs://"+bucket),path));
    return true;
  }catch(error){
    if(error?.code==="storage/object-not-found")return false;
    throw error;
  }
}

async function submit(uid,id,paths){
  return createAd({
    auth:{uid},
    data:{
      action:"createAd",
      id,
      fields:{
        title:"إعلان اختبار صور سوقنا",
        price:100,
        cur:"$",
        cat:"cars",
        area:"السويداء",
        desc:"اختبار معزول لمحاكيات Firebase فقط",
        phone:"963999999999",
        img:"",
        images:paths.map(urlFor),
        videoUrl:""
      }
    }
  });
}

before(async()=>{
  assertIsolatedEmulators();
  process.env.GCLOUD_PROJECT="souqna-staging";
  delete process.env.GCP_PROJECT;
  delete process.env.FIREBASE_PROJECT_ID;
  rulesEnvironment=await initializeTestEnvironment({
    projectId,
    firestore:{
      host:process.env.FIRESTORE_EMULATOR_HOST.split(":")[0],
      port:Number(process.env.FIRESTORE_EMULATOR_HOST.split(":")[1]),
      rules:readFileSync(new URL("../firestore.staging.rules",import.meta.url),"utf8")
    },
    storage:{
      host:process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":")[0],
      port:Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":")[1]),
      rules:readFileSync(new URL("../storage.rules",import.meta.url),"utf8")
    }
  });
  adminApp=initializeApp({projectId,storageBucket:bucket},"souqna-gallery-flow-test");
  db=getFirestore(adminApp);
  await Promise.all([
    db.collection("users").doc("gallery_owner").set({name:"Owner",role:"user",stars:0}),
    db.collection("users").doc("gallery_admin").set({name:"Admin",role:"admin",stars:0}),
    db.collection("users").doc("gallery_other").set({name:"Visitor",role:"user",stars:0})
  ]);
  createAd=callable("marketplace.js");
  deleteAd=callable("delete-ad.js");
});

after(async()=>{
  if(rulesEnvironment)await rulesEnvironment.cleanup();
  if(adminApp)await deleteApp(adminApp);
  if(originalProject===undefined)delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT=originalProject;
  if(originalGcp===undefined)delete process.env.GCP_PROJECT;
  else process.env.GCP_PROJECT=originalGcp;
  if(originalFirebase===undefined)delete process.env.FIREBASE_PROJECT_ID;
  else process.env.FIREBASE_PROJECT_ID=originalFirebase;
});

test("owner uploads, creates listing, admin deletes listing and only its two attached images",async()=>{
  const first="ads/gallery_owner/photo_for_listing_01.jpg";
  const second="ads/gallery_owner/photo_for_listing_02.jpg";
  const retained="ads/gallery_owner/unrelated_photo_01.jpg";
  const other="ads/gallery_other/unrelated_photo_02.jpg";
  await Promise.all([
    upload("gallery_owner",first),
    upload("gallery_owner",second),
    upload("gallery_owner",retained),
    upload("gallery_other",other)
  ]);
  const result=await submit("gallery_owner","gallery_flow_admin_1",[first,second]);
  assert.equal(result.ok,true);
  assert.equal(result.status,"pending");
  const adRef=db.collection("ads").doc("gallery_flow_admin_1");
  const ad=await adRef.get();
  assert.equal(ad.exists,true);
  assert.deepEqual(ad.data().images,[urlFor(first),urlFor(second)]);

  await assert.rejects(
    deleteAd({auth:{uid:"gallery_other"},data:{id:"gallery_flow_admin_1"}}),
    error=>error.code==="permission-denied"
  );
  assert.equal((await adRef.get()).exists,true);

  const deletion=await deleteAd({auth:{uid:"gallery_admin"},data:{id:"gallery_flow_admin_1"}});
  assert.equal(deletion.ok,true);
  assert.equal(deletion.deletedImages,2);
  assert.equal(deletion.failedImages,0);
  assert.equal((await adRef.get()).exists,false);
  assert.equal((await db.collection("mediaCleanupJobs").doc("gallery_flow_admin_1").get()).exists,false);
  assert.equal(await existsInStorage("gallery_owner",first),false);
  assert.equal(await existsInStorage("gallery_owner",second),false);
  assert.equal(await existsInStorage("gallery_owner",retained),true);
  assert.equal(await existsInStorage("gallery_other",other),true);
});

test("listing owner can delete another newly created ad with one uploaded image",async()=>{
  const path="ads/gallery_owner/photo_for_listing_03.jpg";
  await upload("gallery_owner",path);
  const created=await submit("gallery_owner","gallery_flow_owner_2",[path]);
  assert.equal(created.ok,true);
  const deleted=await deleteAd({auth:{uid:"gallery_owner"},data:{id:"gallery_flow_owner_2"}});
  assert.equal(deleted.ok,true);
  assert.equal(deleted.deletedImages,1);
  assert.equal(deleted.failedImages,0);
  assert.equal((await db.collection("ads").doc("gallery_flow_owner_2").get()).exists,false);
  assert.equal(await existsInStorage("gallery_owner",path),false);
});

test("interrupted cleanup persists only failed image, then repeated delete safely completes",async()=>{
  const stalledPath="ads/gallery_owner/retry_failed_image_01.jpg";
  const completedPath="ads/gallery_owner/retry_finished_image_02.jpg";
  const unrelatedPath="ads/gallery_owner/keep_after_retry_03.jpg";
  await Promise.all([
    upload("gallery_owner",stalledPath),
    upload("gallery_owner",completedPath),
    upload("gallery_owner",unrelatedPath)
  ]);
  const created=await submit("gallery_owner","gallery_flow_retry_3",[stalledPath,completedPath]);
  assert.equal(created.ok,true);
  const realStorage=getStorage(adminApp);
  const partiallyFailingStorage={
    bucket(name){
      const target=realStorage.bucket(name);
      return{
        file(path){
          const object=target.file(path);
          return{
            async delete(options){
              if(path===stalledPath)
                throw Object.assign(new Error("Simulated Storage permission outage"),{code:403});
              return object.delete(options);
            }
          };
        }
      };
    }
  };
  const deleteWithFailure=callable("delete-ad.js",()=>partiallyFailingStorage);
  const first=await deleteWithFailure({auth:{uid:"gallery_owner"},data:{id:"gallery_flow_retry_3"}});
  assert.equal(first.ok,true);
  assert.equal(first.deletedImages,1);
  assert.equal(first.failedImages,1);
  assert.equal(first.recoveryPending,true);
  assert.equal((await db.collection("ads").doc("gallery_flow_retry_3").get()).exists,false);
  const jobRef=db.collection("mediaCleanupJobs").doc("gallery_flow_retry_3");
  const job=await jobRef.get();
  assert.equal(job.exists,true);
  assert.deepEqual(job.data().objects,[{bucket,path:stalledPath}]);
  assert.equal(await existsInStorage("gallery_owner",stalledPath),true);
  assert.equal(await existsInStorage("gallery_owner",completedPath),false);

  const recovered=await deleteAd({auth:{uid:"gallery_owner"},data:{id:"gallery_flow_retry_3"}});
  assert.equal(recovered.ok,true);
  assert.equal(recovered.deletedImages,1);
  assert.equal(recovered.failedImages,0);
  assert.equal(recovered.recoveryPending,false);
  assert.equal((await jobRef.get()).exists,false);
  assert.equal(await existsInStorage("gallery_owner",stalledPath),false);
  assert.equal(await existsInStorage("gallery_owner",unrelatedPath),true);
});
