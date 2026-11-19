import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../",import.meta.url);
function source(path){return readFileSync(new URL(path,root),"utf8");}

test("gallery upload and cleanup explicitly require souqna-staging",()=>{
  const code=source("assets/souqna-gallery.mjs");
  const gates=code.match(/app\.options\.projectId!=="souqna-staging"/g)||[];
  assert.equal(gates.length,3,"Upload, cleanup by paths, and cleanup by URLs must reject non-staging Firebase projects");
  assert.match(code,/Promise\.allSettled\(uploaded\.map\(item=>deleteObject/);
});

test("all new client-side staff, community, and ad uploads require staging",()=>{
  const staff=source("assets/souqna-staff-ui.mjs");
  const community=source("assets/souqna-community-ui.mjs");
  const main=source("index.html");
  assert.match(staff,/app\.options\.projectId!=="souqna-staging"/);
  assert.match(community,/app\.options\.projectId==="souqna-staging"/);
  assert.match(main,/if\(app\.options\.projectId!=="souqna-staging"\)/);
});

test("the UI and server agree on at most 11 additional images",()=>{
  assert.match(source("assets/souqna-gallery.mjs"),/const MAX_IMAGES=11;/);
  assert.match(source("functions/ad-media.js"),/const MAX_IMAGES=11;/);
});

test("known rejected ads clean up only their own staged uploads",()=>{
  const html=source("index.html");
  assert.match(html,/uploadedGallery\.length&&confirmedFailure/);
  assert.match(html,/deleteUploadedGallery\(app,me\.uid,uploadedGallery\)/);
  assert.match(html,/if\(uploadedGallery\.length&&!confirmedFailure\)/);
});

test("uncertain server responses preserve uploaded photos and verify ad existence",()=>{
  const html=source("index.html");
  assert.match(html,/const adRequestId=doc\(collection\(db,"ads"\)\)\.id;/);
  assert.match(html,/getDoc\(doc\(db,"ads",adRequestId\)\)/);
  assert.match(html,/adConfirmed=record\.exists\(\)&&record\.data\(\)\?\.ownerId===me\.uid/);
  assert.match(html,/code:"souqna\/submission-uncertain"/);
  assert.match(html,/err\.code==="souqna\/submission-uncertain"\?err\.message/);
});
