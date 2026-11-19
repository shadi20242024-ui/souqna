import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sw=readFileSync(join(process.cwd(),"sw.js"),"utf8");
test("PWA offline cache must never store arbitrary private GET requests",()=>{
  assert.match(sw,/const ALLOWED=new Set\(/);
  assert.match(sw,/if\(!ALLOWED\.has\(url\.pathname\)\|\|url\.search\)return/);
  assert.match(sw,/if\(request\.method!=="GET"\)return/);
  assert.match(sw,/if\(url\.origin!==self\.location\.origin\)return/);
  assert.match(sw,/request\.mode==="navigate"/);
  assert.match(sw,/response\.ok&&response\.type==="basic"/);
  assert.ok(!sw.includes("cache.put(event.request"),"No generic request caching allowed");
  assert.ok(!sw.includes("x.put(e.request"),"No legacy generic request caching allowed");
  assert.ok(!sw.includes("caches.match(e.request)"),"No legacy generic request cache lookup allowed");
});
