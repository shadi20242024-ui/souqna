import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {validateImageUrls,validateVideoUrl,MAX_IMAGES}=require("../functions/ad-media.js");
const project="souqna-staging",uid="user_123";
const image=n=>"https://firebasestorage.googleapis.com/v0/b/"+project+".firebasestorage.app/o/ads%2F"+uid+"%2Fimage"+n+".jpg?alt=media";
test("accept up to 11 additional images stored within user's Firebase upload folder",()=>{
  const validated=validateImageUrls(Array.from({length:MAX_IMAGES},(_,i)=>image(i)),project,uid);
  assert.equal(validated.length,MAX_IMAGES);
});
test("reject over-limit images, duplicates and unsafe sources",()=>{
  assert.throws(()=>validateImageUrls(Array.from({length:12},(_,i)=>image(i)),project,uid),/11/);
  assert.throws(()=>validateImageUrls([image(1),image(1)],project,uid),/مكرر/);
  assert.throws(()=>validateImageUrls(["https://other.example/img.jpg"],project,uid),/مسموح/);
  assert.throws(()=>validateImageUrls([image(1).replace("user_123","another_user")],project,uid),/ليست/);
  assert.throws(()=>validateImageUrls([image(1).replace("souqna-staging","souqna-sweida")],project,uid),/ليست/);
});
test("only supported video hosts and video paths are accepted",()=>{
  assert.equal(validateVideoUrl(""),"");
  assert.match(validateVideoUrl("https://youtu.be/abc123"),/youtu.be/);
  assert.match(validateVideoUrl("https://www.youtube.com/watch?v=abc123"),/youtube.com/);
  assert.throws(()=>validateVideoUrl("https://youtube.com.evil.example/watch?v=a"),/مدعوم/);
  assert.throws(()=>validateVideoUrl("javascript:alert(1)"),/HTTPS/);
});

test("Firebase download URLs require the media endpoint and correct project",()=>{
  assert.throws(()=>validateImageUrls([image(1).replace("?alt=media","")],project,uid),/تصريح/);
  assert.throws(()=>validateImageUrls([image(1).replace("?alt=media","?alt=metadata")],project,uid),/تصريح/);
  assert.equal(validateImageUrls([image(1)],project,uid).length,1);
});
