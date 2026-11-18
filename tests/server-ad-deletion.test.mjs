import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {extractOwnedImagePaths,extractOwnedImageObjects}=require("../functions/ad-media.js");
const image=(user,bucket="souqna-staging.firebasestorage.app",name="photofile_001")=>
  "https://firebasestorage.googleapis.com/v0/b/"+bucket+"/o/"+encodeURIComponent("ads/"+user+"/"+name+".jpg")+"?alt=media";
test("trusted cleanup takes only current listing owner's files",()=>{
  assert.deepEqual(extractOwnedImagePaths([
    image("owner123"),image("intruder"),image("owner123"),
    image("owner123","souqna-sweida.firebasestorage.app")
  ],"souqna-staging","owner123"),["ads/owner123/photofile_001.jpg"]);
});
test("trusted cleanup rejects dangerous paths and production project",()=>{
  assert.deepEqual(extractOwnedImagePaths([image("owner123","souqna-staging.firebasestorage.app","../unsafe")],"souqna-staging","owner123"),[]);
  assert.throws(()=>extractOwnedImagePaths([image("owner123")],"souqna-sweida","owner123"),/غير صالح/);
});
test("deletion callable checks role and owner, commits database first, then deletes objects",()=>{
  const server=readFileSync(new URL("../functions/delete-ad.js",import.meta.url),"utf8");
  assert.match(server,/project!=="souqna-staging"/);
  assert.match(server,/role!=="admin"/);
  assert.match(server,/ad.ownerId!==uid/);
  assert.match(server,/extractOwnedImageObjects\(ad.images,project,ownerId\)/);
  assert.match(server,/deleteImageWithRetry\(storage,bucket,path\)/);
  assert.match(server,/storage\.bucket\(bucket\)\.file\(path\)\.delete/);
  assert.match(server,/tx\.create\(cleanupRef/);
  assert.match(server,/module\.exports\.makeRetryCleanup=makeRetryCleanup/);
  assert.ok(server.indexOf("tx.create(cleanupRef")<server.indexOf("tx.delete(ref)"));
});

test("delete operations retain the bucket actually referenced by each verified image",()=>{
  const objects=extractOwnedImageObjects([
    image("owner123","souqna-staging.firebasestorage.app","photo_001"),
    image("owner123","souqna-staging.appspot.com","photo_002"),
    image("owner123","souqna-sweida.firebasestorage.app","photo_003"),
    image("intruder")
  ],"souqna-staging","owner123");
  assert.deepEqual(objects,[
    {bucket:"souqna-staging.firebasestorage.app",path:"ads/owner123/photo_001.jpg"},
    {bucket:"souqna-staging.appspot.com",path:"ads/owner123/photo_002.jpg"}
  ]);
  assert.deepEqual(extractOwnedImageObjects([image("owner123").replace("?alt=media","?alt=metadata")],"souqna-staging","owner123"),[]);
});
