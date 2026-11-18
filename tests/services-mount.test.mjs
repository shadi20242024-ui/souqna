import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("local service widgets mount outside the SPA-controlled main element",()=>{
  const weather=source("assets/souqna-services-ui.mjs");
  const staff=source("assets/souqna-staff-ui.mjs");
  const community=source("assets/souqna-community-ui.mjs");
  assert.match(weather,/target\.before\(root\)/);
  assert.match(staff,/mount\.after\(root\)/);
  assert.match(community,/mount\.after\(root\)/);
  for(const code of [weather,staff,community]){
    assert.doesNotMatch(code,/target\.prepend\(root\)|mount\.append\(root\)|\(document\.querySelector\("main"\)\|\|document\.body\)\.append\(root\)/);
  }
});

test("main SPA redraws its own container and must not own local widgets",()=>{
  const html=source("index.html");
  assert.match(html,/<main id="app"><\/main>/);
  assert.match(html,/A\.innerHTML=/);
});

test("staff and community widgets retry after Firebase app initialization",()=>{
  const html=source("index.html");
  const staff=source("assets/souqna-staff-ui.mjs");
  const community=source("assets/souqna-community-ui.mjs");
  assert.match(html,/window\.dispatchEvent\(new Event\("souqna:firebase-ready"\)\)/);
  assert.match(staff,/addEventListener\("souqna:firebase-ready",boot,\{once:true\}\)/);
  assert.match(community,/addEventListener\("souqna:firebase-ready",bootCommunity,\{once:true\}\)/);
  assert.match(community,/ready=true;root\.hidden=false/);
});
