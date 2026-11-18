import assert from "node:assert/strict";
import {test} from "node:test";
import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const icons=["real_estate","cars","jobs","electronics","furniture","services","community","fashion","lost_found","misc"];
test("approved photographs and full 3D logo are available to Hosting",()=>{
 const build=readFileSync(join(root,"scripts/build-hosting.mjs"),"utf8");
 const html=readFileSync(join(root,"index.html"),"utf8");
 for(const key of icons){
  const path="assets/category-photos/"+key+".webp";
  assert.ok(existsSync(join(root,path)),path);
  assert.ok(build.includes(path),"Not copied to Hosting: "+path);
 }
 assert.ok(existsSync(join(root,"assets/souqna-approved-logo.jpg")));
 assert.ok(existsSync(join(root,"assets/souqna-3d-mark.webp")));
 assert.ok(html.includes("const categoryTile=c=>"));
 assert.ok(html.includes("assets/souqna-approved-logo.jpg"));
 assert.ok(html.includes("photo-category"));
});
