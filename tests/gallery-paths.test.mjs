import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const moduleText=readFileSync(new URL("../assets/souqna-gallery.mjs",import.meta.url),"utf8");
const match=moduleText.match(/export function pathsFromGalleryUrls\([\s\S]*?\n}\n(?=export async function deleteGalleryByUrls)/);
assert.ok(match,"Expected the gallery path validator to exist");
const pathsFromGalleryUrls=new Function("URL",match[0].replace("export function ","")+";return pathsFromGalleryUrls;")(URL);
const project="souqna-staging",user="owner123";
const link=(uid,name="photo_001",bucket="souqna-staging.firebasestorage.app")=>
  "https://firebasestorage.googleapis.com/v0/b/"+bucket+"/o/"+encodeURIComponent("ads/"+uid+"/"+name+".jpg")+"?alt=media";
test("extract only current owner's gallery paths from valid Firebase image URLs",()=>{
  assert.deepEqual(pathsFromGalleryUrls([link(user)],project,user),["ads/"+user+"/photo_001.jpg"]);
  assert.deepEqual(pathsFromGalleryUrls([link("someone_else"),link(user),link(user)],project,user),["ads/"+user+"/photo_001.jpg"]);
});
test("reject other buckets and unsafe image names and hosts",()=>{
  assert.deepEqual(pathsFromGalleryUrls([
    link(user,"photo_001","souqna-sweida.firebasestorage.app"),
    link(user,"../unsafe"),
    "https://attacker.test/v0/b/souqna-staging.firebasestorage.app/o/ads%2Fowner123%2Fphoto_001.jpg"
  ],project,user),[]);
});
test("never resolve production or another project gallery",()=>{
  assert.throws(()=>pathsFromGalleryUrls([link(user)],"souqna-sweida",user),/غير مسموحة/);
  assert.throws(()=>pathsFromGalleryUrls([link(user)],"souqna-staging-other",user),/غير مسموحة/);
});
test("staging deletions use server callable instead of direct client cleanup",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const branch=html.slice(html.indexOf('else if(a=="del"){'),html.indexOf('else if(a=="savewa")'));
  assert.match(branch,/httpsCallable\(functions,"souqnaDeleteAd"\)/);
  assert.match(branch,/await del\(\{id\}\)/);
  assert.doesNotMatch(branch,/deleteGalleryByUrls/);
});

test("staging administrator has a retry action for pending cleanup jobs",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html,/id="cleanup-ad-id"/);
  assert.match(html,/data-a="retryCleanup"/);
  assert.match(html,/httpsCallable\(functions,"souqnaRetryAdCleanup"\)/);
  assert.match(html,/if\(!isAdm\(\)\|\|app\.options\.projectId!=="souqna-staging"\)/);
});
