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
  ["prok","approvePromotion"]
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
console.log("PASS: JavaScript module syntax and 3 financial approval handlers");
