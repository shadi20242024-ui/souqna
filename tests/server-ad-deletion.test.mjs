import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {extractOwnedImagePaths}=require("../functions/ad-media.js");
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
  assert.match(server,/role==="admin"/);
  assert.match(server,/!admin&&ad.ownerId!==uid/);
  assert.match(server,/extractOwnedImagePaths\(ad.images,project,ownerId\)/);
  assert.ok(server.indexOf("tx.delete(ref)")<server.indexOf("bucket.file(path).delete"));
});
