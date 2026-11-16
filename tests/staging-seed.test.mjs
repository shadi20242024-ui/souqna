import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script=resolve("scripts/seed-staging.mjs");
const run=(...args)=>spawnSync(process.execPath,[script,...args],{
  encoding:"utf8",env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:""}
});

test("Staging bootstrap defaults to dry run and never allows production",()=>{
  const dry=run("--project","souqna-staging-example");
  assert.equal(dry.status,0,dry.stderr);
  assert.ok(dry.stdout.includes("DRY RUN ONLY"));
  assert.ok(dry.stdout.includes("24"));
  assert.ok(!dry.stdout.includes("SEED COMPLETED"));
  assert.notEqual(run("--project","souqna-sweida").status,0);
  assert.notEqual(run("--project","souqna-sweida","--execute",
    "--confirm","SEED:souqna-sweida").status,0);
  assert.notEqual(run("--project","souqna-staging-example","--execute",
    "--confirm","SEED:wrong-project").status,0);
  assert.notEqual(run("--project","souqna-staging-example","--execute",
    "--confirm","SEED:souqna-staging-example").status,0,
    "Execution with no explicit application credentials must fail");
});
