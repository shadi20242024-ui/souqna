"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const html = fs.readFileSync("index.html","utf8");
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert(match,"Application module script must exist");
const source = match[1];
const stripped = source.replace(/^\s*import\s*\{[^\n]*\}\s*from\s*["'][^"']+["'];?\s*$/gm,"");
new vm.SourceTextModule(stripped,{identifier:"souqna-app"});
for(const [action,call] of [
  ["ordok","approveStarOrder"],
  ["subok","approveSubscription"],
  ["prok","approvePromotion"],
  ["ordno","rejectStarOrder"],
  ["subno","rejectSubscription"],
  ["prno","rejectPromotion"]
]){
  const start=source.indexOf('else if(a=="'+action+'")');
  assert(start>=0,"Missing handler: "+action);
  const end=source.indexOf("else if(a==",start+12);
  assert(end>start,"Missing handler boundary: "+action);
  const handler=source.slice(start,end);
  assert(handler.includes('approveSecure("'+call+'",id)'),action+" must call "+call);
  assert(!/updateDoc\s*\(|\bledger\s*\(|\bnotify\s*\(/.test(handler),action+" must not perform client financial writes");
}
assert(source.includes('getFunctions(app,"europe-west1")'),"Cloud Functions region mismatch");
console.log("PASS: JavaScript module syntax and 6 financial approval/rejection handlers");

for(const action of ["ok","stok"]){
  const token=action==="ok"?'else if(a=="ok"||a=="no")':'else if(a=="stok"||a=="stno")';
  const start=source.indexOf(token);
  assert(start>=0,"Missing moderation handler: "+action);
  const end=source.indexOf("else if(a==",start+token.length);
  assert(end>start,"Missing moderation handler boundary: "+action);
  const handler=source.slice(start,end);
  assert(!/\bnotify\s*\(/.test(handler),"Moderation must not create notifications from browser");
}
console.log("PASS: store and ad moderation avoid blocked client notification writes");

for (const [action,call] of [
  ['else if(a=="ok"||a=="no")',"moderateAdvertisement"],
  ['else if(a=="stok"||a=="stno")',"moderateStore"]
]){
  const start=source.indexOf(action);
  assert(start>=0,"Missing moderation handler "+action);
  const end=source.indexOf("else if(a==",start+action.length);
  const handler=source.slice(start,end);
  assert(handler.includes('moderateSecure("'+call+'",id,'),"Missing server moderation "+call);
  assert(!/updateDoc\s*\(|\bnotify\s*\(/.test(handler),"Moderation must not write directly to Firestore");
}
console.log("PASS: ad/store moderation routes through secure callables");
